import { mkdir, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { SkillIRSchema, type ProfileAnnotation, type SkillIR } from "../../skill-ir/schema";
import { buildProfileAnnotations } from "../../profiler/profile-annotation";
import {
  buildProfileOverlay,
  compileFinalIR,
  scoredRowsToExecutionTraces,
  type ProfileFeedbackOptions,
  type ProfileOverlay,
} from "./profile-feedback";
import type { ExperimentSystem } from "./matrix";
import type { ScoredAgentRunRow } from "./scoring";
import { resolveCorpusManifestPath, type CorpusId } from "./corpus-registry";
import { buildFinalIRProvenance } from "./final-ir-provenance";
import { sha256Bytes } from "./source-fixture";

type Args = {
  corpus: CorpusId;
  results: string;
  rootDir: string;
  outDir: string;
  sourceSystem: ExperimentSystem;
  taskSplit?: string;
  minEvidence: number;
};

type CorpusManifest = {
  skills: {
    id: string;
    irPath?: string;
    status?: string;
  }[];
};

type LoadedCorpusIRs = {
  manifestPath: string;
  irBySkill: Map<string, SkillIR>;
  skills: { skillId: string; sourceSha256: string; baseIRPath: string }[];
};

export type ProfileFeedbackSkillSummary = {
  skillId: string;
  annotationCount: number;
  outputPaths: {
    overlay: string;
    finalIR: string;
    compatibilityIR: string;
  };
  annotations: ProfileAnnotation[];
};

export type ProfileFeedbackSummary = {
  sourceSystem?: ExperimentSystem;
  taskSplit?: string;
  minEvidence: number;
  inputRows: number;
  tracedRows: number;
  profiledSkills: ProfileFeedbackSkillSummary[];
};

export type ProfileFeedbackArtifacts = {
  overlaysBySkill: Map<string, ProfileOverlay>;
  finalIRsBySkill: Map<string, SkillIR>;
  summary: ProfileFeedbackSummary;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    corpus: "calibration",
    results: "results/skill-ir/main-results.jsonl",
    rootDir: process.cwd(),
    outDir: "results/skill-ir/profiled-ir",
    sourceSystem: "original",
    minEvidence: 2,
  };
  let corpusProvided = false;

  for (const arg of argv) {
    if (arg.startsWith("--corpus=")) {
      const corpus = arg.slice("--corpus=".length);
      if (corpus !== "calibration" && corpus !== "pilot") {
        throw new Error(`Unknown Skill IR corpus: ${corpus}`);
      }
      args.corpus = corpus;
      corpusProvided = true;
    } else if (arg.startsWith("--results=")) {
      args.results = arg.slice("--results=".length);
    } else if (arg.startsWith("--root-dir=")) {
      args.rootDir = arg.slice("--root-dir=".length);
    } else if (arg.startsWith("--out-dir=")) {
      args.outDir = arg.slice("--out-dir=".length);
    } else if (arg.startsWith("--source-system=")) {
      args.sourceSystem = arg.slice("--source-system=".length) as ExperimentSystem;
    } else if (arg.startsWith("--task-split=")) {
      args.taskSplit = arg.slice("--task-split=".length);
    } else if (arg.startsWith("--min-evidence=")) {
      args.minEvidence = Number.parseInt(arg.slice("--min-evidence=".length), 10);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!corpusProvided) {
    throw new Error("--corpus is required; choose calibration or pilot");
  }
  if (args.sourceSystem !== "original") {
    throw new Error("Final IR compilation requires --source-system=original");
  }
  if (args.taskSplit !== "development") {
    throw new Error("Final IR compilation requires --task-split=development");
  }

  if (!Number.isFinite(args.minEvidence) || args.minEvidence < 1) {
    throw new Error("--min-evidence must be a positive integer");
  }

  return args;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(path).text()) as T;
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const text = await Bun.file(path).text();
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

async function loadIRsFromManifest(args: Args): Promise<LoadedCorpusIRs> {
  const manifestPath = resolveCorpusManifestPath(args.corpus, args.rootDir);
  const manifest = await readJson<CorpusManifest>(manifestPath);
  const irBySkill = new Map<string, SkillIR>();
  const skills: LoadedCorpusIRs["skills"] = [];

  for (const skill of manifest.skills) {
    if (skill.status !== "runnable") {
      continue;
    }
    if (!skill.irPath) {
      throw new Error(`Skill ${skill.id} is missing irPath in corpus manifest`);
    }

    const baseIRPath = join(args.rootDir, skill.irPath);
    const ir = SkillIRSchema.parse(await readJson<unknown>(baseIRPath));
    irBySkill.set(skill.id, ir);
    skills.push({
      skillId: skill.id,
      sourceSha256:
        ir.source.kind === "file" ? ir.source.sha256 : sha256Bytes(Buffer.from(ir.source.text, "utf8")),
      baseIRPath,
    });
  }

  return { manifestPath, irBySkill, skills };
}

function annotationsBySkill(
  rows: ScoredAgentRunRow[],
  irBySkill: Map<string, SkillIR>,
  opts: ProfileFeedbackOptions,
): { annotations: Map<string, ProfileAnnotation[]>; tracedRows: number } {
  const traces = scoredRowsToExecutionTraces(rows, irBySkill, opts);
  const tracesBySkill = new Map<string, typeof traces>();

  for (const trace of traces) {
    tracesBySkill.set(trace.skillId, [...(tracesBySkill.get(trace.skillId) ?? []), trace]);
  }

  return {
    annotations: new Map(
      [...tracesBySkill.entries()].map(([skillId, skillTraces]) => [
        skillId,
        buildProfileAnnotations(skillTraces, { minEvidence: opts.minEvidence }),
      ]),
    ),
    tracedRows: traces.length,
  };
}

export function buildProfileFeedbackArtifacts(
  rows: ScoredAgentRunRow[],
  irBySkill: Map<string, SkillIR>,
  opts: ProfileFeedbackOptions = {},
): ProfileFeedbackArtifacts {
  if (opts.sourceSystem !== "original") {
    throw new Error("Final IR compilation requires sourceSystem=original");
  }
  if (opts.taskSplit !== "development") {
    throw new Error("Final IR compilation requires taskSplit=development");
  }
  const { annotations, tracedRows } = annotationsBySkill(rows, irBySkill, opts);
  const overlaysBySkill = new Map<string, ProfileOverlay>();
  const finalIRsBySkill = new Map<string, SkillIR>();
  const profiledSkills: ProfileFeedbackSkillSummary[] = [];

  for (const [skillId, ir] of irBySkill.entries()) {
    const skillAnnotations = annotations.get(skillId) ?? [];
    const overlay = buildProfileOverlay(skillId, skillAnnotations);
    const finalIR = compileFinalIR(ir, overlay);
    overlaysBySkill.set(skillId, overlay);
    finalIRsBySkill.set(skillId, finalIR);

    if (skillAnnotations.length > 0) {
      profiledSkills.push({
        skillId,
        annotationCount: skillAnnotations.length,
        outputPaths: {
          overlay: `overlay/${skillId}.json`,
          finalIR: `final-ir/${skillId}.json`,
          compatibilityIR: `ir/${skillId}.json`,
        },
        annotations: skillAnnotations,
      });
    }
  }

  return {
    overlaysBySkill,
    finalIRsBySkill,
    summary: {
      sourceSystem: opts.sourceSystem,
      taskSplit: opts.taskSplit,
      minEvidence: opts.minEvidence ?? 2,
      inputRows: rows.length,
      tracedRows,
      profiledSkills,
    },
  };
}

async function writeArtifacts(artifacts: ProfileFeedbackArtifacts, outDir: string): Promise<void> {
  const overlayDir = join(outDir, "overlay");
  const finalIRDir = join(outDir, "final-ir");
  const irDir = join(outDir, "ir");
  await mkdir(overlayDir, { recursive: true });
  await mkdir(finalIRDir, { recursive: true });
  await mkdir(irDir, { recursive: true });

  for (const [skillId, overlay] of artifacts.overlaysBySkill.entries()) {
    await writeFile(join(overlayDir, `${skillId}.json`), `${JSON.stringify(overlay, null, 2)}\n`, "utf8");
  }

  for (const [skillId, ir] of artifacts.finalIRsBySkill.entries()) {
    const serialized = `${JSON.stringify(ir, null, 2)}\n`;
    await writeFile(join(finalIRDir, `${skillId}.json`), serialized, "utf8");
    await writeFile(join(irDir, `${skillId}.json`), serialized, "utf8");
  }

  await writeFile(join(outDir, "summary.json"), `${JSON.stringify(artifacts.summary, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const resultsPath = isAbsolute(args.results) ? args.results : join(args.rootDir, args.results);
  const outDir = isAbsolute(args.outDir) ? args.outDir : join(args.rootDir, args.outDir);
  const rows = await readJsonl<ScoredAgentRunRow>(resultsPath);
  const loaded = await loadIRsFromManifest(args);
  const artifacts = buildProfileFeedbackArtifacts(rows, loaded.irBySkill, {
    sourceSystem: args.sourceSystem,
    taskSplit: args.taskSplit,
    minEvidence: args.minEvidence,
  });

  await writeArtifacts(artifacts, outDir);
  const provenance = await buildFinalIRProvenance({
    rootDir: args.rootDir,
    artifactRoot: outDir,
    corpus: args.corpus,
    manifestPath: loaded.manifestPath,
    resultsPath,
    scoredRows: rows,
    skills: loaded.skills.map((skill) => ({
      ...skill,
      annotationCount: artifacts.overlaysBySkill.get(skill.skillId)?.annotations.length ?? 0,
    })),
  });
  await writeFile(join(outDir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        results: basename(args.results),
        outDir,
        inputRows: artifacts.summary.inputRows,
        tracedRows: artifacts.summary.tracedRows,
        profiledSkills: artifacts.summary.profiledSkills.length,
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
