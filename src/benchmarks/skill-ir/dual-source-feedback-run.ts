import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { SkillIRSchema, type ProfileAnnotation, type SkillIR } from "../../skill-ir/schema";
import type {
  TypedRepairCatalog,
  TypedRepairDirective,
} from "../../skill-ir/passes/typed-output-repair";
import { compileFinalIR, type ProfileOverlay } from "./profile-feedback";
import {
  buildDualSourceRepairEvidence,
  DualSourceRepairEvidenceV2Schema,
  type DualSourceRepairEvidence,
  type DualSourceRepairEvidenceV2,
} from "./repair-evidence";
import type { ScoredAgentRunRow } from "./scoring";
import { resolveCorpusManifestPath } from "./corpus-registry";
import {
  buildDualSourceFinalIRProvenance,
  buildDualSourceFinalIRProvenanceV3,
} from "./final-ir-provenance";
import { sha256Bytes } from "./source-fixture";

export type DualSourceFeedbackOptions = {
  skillId: string;
  lineageCatalog: "env-manager/v1";
  minDistinctTasks: number;
  repairCatalog?: TypedRepairCatalog;
};

export type DualSourceFeedbackArtifacts = {
  evidence: DualSourceRepairEvidence;
  overlay: ProfileOverlay;
  finalIR: SkillIR;
  summary: {
    schemaVersion: "skill-ir-dual-source-feedback-summary/v1";
    skillId: string;
    evidencePolicy: "dual-source-residual/v1";
    lineageCatalog: "env-manager/v1";
    repairCatalog: TypedRepairCatalog;
    inputRows: number;
    residualRecords: number;
    repairCount: number;
    annotationCount: number;
    resolvedCriteria: string[];
  };
};

export type DualSourceFeedbackArtifactsV2 = {
  evidence: DualSourceRepairEvidenceV2;
  overlay: ProfileOverlay;
  finalIR: SkillIR;
  summary: {
    schemaVersion: "skill-ir-dual-source-feedback-summary/v2";
    skillId: string;
    experimentId: string;
    evidencePolicy: "dual-source-residual/v2";
    catalogId: string;
    repairCatalog: TypedRepairCatalog;
    residualRecords: number;
    repairCount: number;
    annotationCount: number;
    resolvedCriteria: string[];
  };
};

export type DualSourceCompilerArgs = DualSourceFeedbackOptions & {
  corpus: "pilot";
  rootDir: string;
  resultsPath: string;
  outDir: string;
};

export type DualSourceCompilerV2Args = {
  corpus: "pilot";
  rootDir: string;
  repairEvidencePath: string;
  outDir: string;
};

type PilotManifest = {
  skills: Array<{ id: string; status?: string; irPath?: string }>;
};

function directivesFromEvidence(
  evidence: Pick<DualSourceRepairEvidence | DualSourceRepairEvidenceV2, "repairs">,
): TypedRepairDirective[] {
  return evidence.repairs.map((repair) => ({
    id: repair.id,
    kind: repair.kind,
    targetRef: repair.targetRef,
    observationCount: repair.observationCount,
    distinctTaskCount: repair.distinctTaskCount,
    evidenceIds: [...repair.evidenceIds],
  }));
}

function annotationsFromDirectives(directives: TypedRepairDirective[]): ProfileAnnotation[] {
  return directives.map((directive) => ({
    id: `profile-${directive.targetRef}`,
    sourceTrace: directive.evidenceIds[0]!,
    targetRef: directive.targetRef,
    observation: "frequent-failure",
    evidenceCount: directive.observationCount,
    suggestedPass: `typed-output-repair/${directive.kind}`,
  }));
}

export function buildDualSourceFeedbackArtifactsV2(
  evidence: DualSourceRepairEvidenceV2,
  baseIR: SkillIR,
  options: { repairCatalog?: TypedRepairCatalog } = {},
): DualSourceFeedbackArtifactsV2 {
  const admittedEvidence = DualSourceRepairEvidenceV2Schema.parse(evidence);
  if (baseIR.id !== admittedEvidence.skillId) {
    throw new Error(`Base IR ${baseIR.id} does not match admitted skill ${admittedEvidence.skillId}`);
  }
  if (admittedEvidence.admission.status !== "eligible") {
    throw new Error(`Dual-source v2 evidence is not eligible: ${admittedEvidence.admission.status}`);
  }
  if (options.repairCatalog && options.repairCatalog !== admittedEvidence.repairCatalog) {
    throw new Error(`Dual-source v2 repair catalog mismatch: admitted ${admittedEvidence.repairCatalog}, requested ${options.repairCatalog}`);
  }
  const repairs = directivesFromEvidence(admittedEvidence);
  if (repairs.length === 0) {
    throw new Error(`Eligible dual-source v2 evidence has no repairs for ${admittedEvidence.skillId}`);
  }
  const annotations = annotationsFromDirectives(repairs);
  const repairCatalog = admittedEvidence.repairCatalog;
  const overlay: ProfileOverlay = { skillId: admittedEvidence.skillId, repairCatalog, repairs, annotations };
  const finalIR = compileFinalIR(baseIR, overlay);
  return {
    evidence: admittedEvidence,
    overlay,
    finalIR,
    summary: {
      schemaVersion: "skill-ir-dual-source-feedback-summary/v2",
      skillId: admittedEvidence.skillId,
      experimentId: admittedEvidence.experimentId,
      evidencePolicy: "dual-source-residual/v2",
      catalogId: admittedEvidence.catalogId,
      repairCatalog,
      residualRecords: admittedEvidence.records.length,
      repairCount: repairs.length,
      annotationCount: annotations.length,
      resolvedCriteria: admittedEvidence.resolvedCriteria,
    },
  };
}

export function buildDualSourceFeedbackArtifacts(
  rows: ScoredAgentRunRow[],
  baseIR: SkillIR,
  options: DualSourceFeedbackOptions,
): DualSourceFeedbackArtifacts {
  if (baseIR.id !== options.skillId) {
    throw new Error(`Base IR ${baseIR.id} does not match selected skill ${options.skillId}`);
  }
  const evidence = buildDualSourceRepairEvidence(rows, options);
  const repairs = directivesFromEvidence(evidence);
  if (repairs.length === 0) {
    throw new Error(`Dual-source evidence produced no eligible repairs for ${options.skillId}`);
  }
  const annotations = annotationsFromDirectives(repairs);
  const repairCatalog = options.repairCatalog ?? "typed-output-repair/v1";
  const overlay: ProfileOverlay = { skillId: options.skillId, repairCatalog, repairs, annotations };
  const finalIR = compileFinalIR(baseIR, overlay);

  return {
    evidence,
    overlay,
    finalIR,
    summary: {
      schemaVersion: "skill-ir-dual-source-feedback-summary/v1",
      skillId: options.skillId,
      evidencePolicy: "dual-source-residual/v1",
      lineageCatalog: options.lineageCatalog,
      repairCatalog,
      inputRows: rows.length,
      residualRecords: evidence.records.length,
      repairCount: repairs.length,
      annotationCount: annotations.length,
      resolvedCriteria: evidence.resolvedCriteria,
    },
  };
}

async function readJsonl<T>(path: string): Promise<T[]> {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function absoluteFrom(rootDir: string, path: string): string {
  return isAbsolute(path) ? path : join(rootDir, path);
}

export async function runDualSourceFeedbackCompiler(args: DualSourceCompilerArgs): Promise<void> {
  const manifestPath = resolveCorpusManifestPath(args.corpus, args.rootDir);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PilotManifest;
  const selected = manifest.skills.find((skill) => skill.id === args.skillId);
  if (!selected || selected.status !== "runnable" || !selected.irPath) {
    throw new Error(`Selected pilot skill ${args.skillId} must be runnable with an irPath`);
  }

  const resultsPath = absoluteFrom(args.rootDir, args.resultsPath);
  const outDir = absoluteFrom(args.rootDir, args.outDir);
  const baseIRPath = absoluteFrom(args.rootDir, selected.irPath);
  const baseIR = SkillIRSchema.parse(JSON.parse(await readFile(baseIRPath, "utf8")));
  const rows = await readJsonl<ScoredAgentRunRow>(resultsPath);
  const artifacts = buildDualSourceFeedbackArtifacts(rows, baseIR, args);

  const overlayDir = join(outDir, "overlay");
  const finalIRDir = join(outDir, "final-ir");
  const compatibilityIRDir = join(outDir, "ir");
  await Promise.all([
    mkdir(overlayDir, { recursive: true }),
    mkdir(finalIRDir, { recursive: true }),
    mkdir(compatibilityIRDir, { recursive: true }),
  ]);

  const evidencePath = join(outDir, "repair-evidence.json");
  const overlayPath = join(overlayDir, `${args.skillId}.json`);
  const finalIRPath = join(finalIRDir, `${args.skillId}.json`);
  const serializedFinalIR = `${JSON.stringify(artifacts.finalIR, null, 2)}\n`;
  await Promise.all([
    writeFile(evidencePath, `${JSON.stringify(artifacts.evidence, null, 2)}\n`, "utf8"),
    writeFile(overlayPath, `${JSON.stringify(artifacts.overlay, null, 2)}\n`, "utf8"),
    writeFile(finalIRPath, serializedFinalIR, "utf8"),
    writeFile(join(compatibilityIRDir, `${args.skillId}.json`), serializedFinalIR, "utf8"),
    writeFile(join(outDir, "summary.json"), `${JSON.stringify(artifacts.summary, null, 2)}\n`, "utf8"),
  ]);

  const sourceSha256 = baseIR.source.kind === "file"
    ? baseIR.source.sha256
    : sha256Bytes(Buffer.from(baseIR.source.text, "utf8"));
  const provenance = await buildDualSourceFinalIRProvenance({
    rootDir: args.rootDir,
    artifactRoot: outDir,
    corpus: args.corpus,
    manifestPath,
    resultsPath,
    repairEvidencePath: evidencePath,
    lineageCatalog: args.lineageCatalog,
    repairCatalog: artifacts.summary.repairCatalog,
    skills: [{
      skillId: args.skillId,
      sourceSha256,
      baseIRPath,
      annotationCount: artifacts.overlay.annotations.length,
    }],
  });
  await writeFile(join(outDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
}

export async function runDualSourceFeedbackCompilerV2(args: DualSourceCompilerV2Args): Promise<void> {
  const manifestPath = resolveCorpusManifestPath(args.corpus, args.rootDir);
  const evidencePath = absoluteFrom(args.rootDir, args.repairEvidencePath);
  const outDir = absoluteFrom(args.rootDir, args.outDir);
  const [manifest, evidence] = await Promise.all([
    readFile(manifestPath, "utf8").then((text) => JSON.parse(text) as PilotManifest),
    readFile(evidencePath, "utf8").then((text) => DualSourceRepairEvidenceV2Schema.parse(JSON.parse(text))),
  ]);
  const selected = manifest.skills.find((skill) => skill.id === evidence.skillId);
  if (!selected || selected.status !== "runnable" || !selected.irPath) {
    throw new Error(`Admitted pilot skill ${evidence.skillId} must be runnable with an irPath`);
  }
  const baseIRPath = absoluteFrom(args.rootDir, selected.irPath);
  const baseIRBytes = await readFile(baseIRPath);
  const baseIR = SkillIRSchema.parse(JSON.parse(baseIRBytes.toString("utf8")));
  if (evidence.bindings.baseIR.path !== relative(args.rootDir, baseIRPath).replaceAll("\\", "/")
    || evidence.bindings.baseIR.sha256 !== sha256Bytes(baseIRBytes)) {
    throw new Error("Dual-source v2 compiler base IR binding mismatch");
  }
  const artifacts = buildDualSourceFeedbackArtifactsV2(evidence, baseIR);
  const overlayDir = join(outDir, "overlay");
  const finalIRDir = join(outDir, "final-ir");
  const compatibilityIRDir = join(outDir, "ir");
  await Promise.all([
    mkdir(overlayDir, { recursive: true }),
    mkdir(finalIRDir, { recursive: true }),
    mkdir(compatibilityIRDir, { recursive: true }),
  ]);
  const copiedEvidencePath = join(outDir, "repair-evidence.json");
  const overlayPath = join(overlayDir, `${evidence.skillId}.json`);
  const finalIRPath = join(finalIRDir, `${evidence.skillId}.json`);
  const serializedFinalIR = `${JSON.stringify(artifacts.finalIR, null, 2)}\n`;
  await Promise.all([
    writeFile(copiedEvidencePath, `${JSON.stringify(artifacts.evidence, null, 2)}\n`, "utf8"),
    writeFile(overlayPath, `${JSON.stringify(artifacts.overlay, null, 2)}\n`, "utf8"),
    writeFile(finalIRPath, serializedFinalIR, "utf8"),
    writeFile(join(compatibilityIRDir, `${evidence.skillId}.json`), serializedFinalIR, "utf8"),
    writeFile(join(outDir, "summary.json"), `${JSON.stringify(artifacts.summary, null, 2)}\n`, "utf8"),
  ]);
  const sourceSha256 = baseIR.source.kind === "file"
    ? baseIR.source.sha256
    : sha256Bytes(Buffer.from(baseIR.source.text, "utf8"));
  const provenance = await buildDualSourceFinalIRProvenanceV3({
    rootDir: args.rootDir,
    artifactRoot: outDir,
    corpus: args.corpus,
    manifestPath,
    resultsPath: absoluteFrom(args.rootDir, evidence.bindings.scoredResults.path),
    repairEvidencePath: copiedEvidencePath,
    repairCatalog: evidence.repairCatalog,
    skills: [{
      skillId: evidence.skillId,
      sourceSha256,
      baseIRPath,
      annotationCount: artifacts.overlay.annotations.length,
    }],
  });
  await writeFile(join(outDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
}

export function parseDualSourceFeedbackArgs(
  argv: string[],
): DualSourceCompilerArgs | DualSourceCompilerV2Args {
  const genericEvidence = argv.find((arg) => arg.startsWith("--repair-evidence="));
  if (genericEvidence) {
    const args: Partial<DualSourceCompilerV2Args> = { rootDir: process.cwd() };
    for (const arg of argv) {
      if (arg === "--corpus=pilot") args.corpus = "pilot";
      else if (arg.startsWith("--root-dir=")) args.rootDir = arg.slice("--root-dir=".length);
      else if (arg.startsWith("--repair-evidence=")) {
        args.repairEvidencePath = arg.slice("--repair-evidence=".length);
      } else if (arg.startsWith("--out-dir=")) args.outDir = arg.slice("--out-dir=".length);
      else throw new Error(`Unknown generic dual-source argument: ${arg}`);
    }
    if (args.corpus !== "pilot") throw new Error("--corpus=pilot is required");
    if (!args.repairEvidencePath) throw new Error("--repair-evidence is required");
    if (!args.outDir) throw new Error("--out-dir is required");
    return args as DualSourceCompilerV2Args;
  }

  const args: Partial<DualSourceCompilerArgs> = {
    rootDir: process.cwd(),
    lineageCatalog: "env-manager/v1",
    minDistinctTasks: 2,
  };
  for (const arg of argv) {
    if (arg === "--corpus=pilot") args.corpus = "pilot";
    else if (arg.startsWith("--root-dir=")) args.rootDir = arg.slice("--root-dir=".length);
    else if (arg.startsWith("--results=")) args.resultsPath = arg.slice("--results=".length);
    else if (arg.startsWith("--out-dir=")) args.outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--skill=")) args.skillId = arg.slice("--skill=".length);
    else if (arg === "--lineage-catalog=env-manager/v1") args.lineageCatalog = "env-manager/v1";
    else if (arg === "--repair-catalog=typed-output-repair/v1") args.repairCatalog = "typed-output-repair/v1";
    else if (arg === "--repair-catalog=typed-output-repair/v2") args.repairCatalog = "typed-output-repair/v2";
    else if (arg.startsWith("--min-distinct-tasks=")) {
      args.minDistinctTasks = Number.parseInt(arg.slice("--min-distinct-tasks=".length), 10);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.corpus !== "pilot") throw new Error("--corpus=pilot is required");
  if (!args.resultsPath) throw new Error("--results is required");
  if (!args.outDir) throw new Error("--out-dir is required");
  if (!args.skillId) throw new Error("--skill is required");
  if (!Number.isInteger(args.minDistinctTasks) || args.minDistinctTasks! < 1) {
    throw new Error("--min-distinct-tasks must be a positive integer");
  }
  return args as DualSourceCompilerArgs;
}

async function main(): Promise<void> {
  const args = parseDualSourceFeedbackArgs(process.argv.slice(2));
  if ("repairEvidencePath" in args) {
    await runDualSourceFeedbackCompilerV2(args);
  } else {
    await runDualSourceFeedbackCompiler(args);
  }
  console.log(JSON.stringify({
    corpus: args.corpus,
    ...("skillId" in args ? { skill: args.skillId, results: args.resultsPath } : {
      repairEvidence: args.repairEvidencePath,
    }),
    outDir: args.outDir,
  }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
