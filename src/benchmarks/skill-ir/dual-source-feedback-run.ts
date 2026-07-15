import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { SkillIRSchema, type ProfileAnnotation, type SkillIR } from "../../skill-ir/schema";
import type {
  TypedRepairCatalog,
  TypedRepairDirective,
} from "../../skill-ir/passes/typed-output-repair";
import { compileFinalIR, type ProfileOverlay } from "./profile-feedback";
import {
  buildDualSourceRepairEvidence,
  type DualSourceRepairEvidence,
} from "./repair-evidence";
import type { ScoredAgentRunRow } from "./scoring";
import { resolveCorpusManifestPath } from "./corpus-registry";
import { buildDualSourceFinalIRProvenance } from "./final-ir-provenance";
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

export type DualSourceCompilerArgs = DualSourceFeedbackOptions & {
  corpus: "pilot";
  rootDir: string;
  resultsPath: string;
  outDir: string;
};

type PilotManifest = {
  skills: Array<{ id: string; status?: string; irPath?: string }>;
};

function directivesFromEvidence(evidence: DualSourceRepairEvidence): TypedRepairDirective[] {
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

function parseArgs(argv: string[]): DualSourceCompilerArgs {
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
  const args = parseArgs(process.argv.slice(2));
  await runDualSourceFeedbackCompiler(args);
  console.log(JSON.stringify({
    corpus: args.corpus,
    skill: args.skillId,
    results: args.resultsPath,
    outDir: args.outDir,
  }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
