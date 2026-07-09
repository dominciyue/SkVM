import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { SkillIRSchema, type ProfileAnnotation, type SkillIR } from "../../skill-ir/schema";
import { buildProfileAnnotations } from "../../profiler/profile-annotation";
import { scoredRowsToExecutionTraces, type ProfileFeedbackOptions, mergeProfileAnnotationsIntoIR } from "./profile-feedback";
import type { ExperimentSystem } from "./matrix";
import type { ScoredAgentRunRow } from "./scoring";

type Args = {
  results: string;
  manifest: string;
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
  }[];
};

export type ProfileFeedbackSkillSummary = {
  skillId: string;
  annotationCount: number;
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
  irsBySkill: Map<string, SkillIR>;
  summary: ProfileFeedbackSummary;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    results: "results/skill-ir/main-results.jsonl",
    manifest: "benchmarks/skill-ir/corpus/manifest.json",
    rootDir: process.cwd(),
    outDir: "results/skill-ir/profiled-ir",
    sourceSystem: "original",
    minEvidence: 2,
  };

  for (const arg of argv) {
    if (arg.startsWith("--results=")) {
      args.results = arg.slice("--results=".length);
    } else if (arg.startsWith("--manifest=")) {
      args.manifest = arg.slice("--manifest=".length);
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

async function loadIRsFromManifest(args: Args): Promise<Map<string, SkillIR>> {
  const manifest = await readJson<CorpusManifest>(join(args.rootDir, args.manifest));
  const irBySkill = new Map<string, SkillIR>();

  for (const skill of manifest.skills) {
    if (!skill.irPath) {
      throw new Error(`Skill ${skill.id} is missing irPath in corpus manifest`);
    }

    irBySkill.set(skill.id, SkillIRSchema.parse(await readJson<unknown>(join(args.rootDir, skill.irPath))));
  }

  return irBySkill;
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
  const { annotations, tracedRows } = annotationsBySkill(rows, irBySkill, opts);
  const irsBySkill = new Map<string, SkillIR>();
  const profiledSkills: ProfileFeedbackSkillSummary[] = [];

  for (const [skillId, ir] of irBySkill.entries()) {
    const skillAnnotations = annotations.get(skillId) ?? [];
    const derived = mergeProfileAnnotationsIntoIR(ir, skillAnnotations);
    irsBySkill.set(skillId, derived);

    if (skillAnnotations.length > 0) {
      profiledSkills.push({
        skillId,
        annotationCount: skillAnnotations.length,
        annotations: skillAnnotations,
      });
    }
  }

  return {
    irsBySkill,
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
  const irDir = join(outDir, "ir");
  await mkdir(irDir, { recursive: true });

  for (const [skillId, ir] of artifacts.irsBySkill.entries()) {
    await writeFile(join(irDir, `${skillId}.json`), `${JSON.stringify(ir, null, 2)}\n`, "utf8");
  }

  await writeFile(join(outDir, "summary.json"), `${JSON.stringify(artifacts.summary, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await readJsonl<ScoredAgentRunRow>(args.results);
  const irBySkill = await loadIRsFromManifest(args);
  const artifacts = buildProfileFeedbackArtifacts(rows, irBySkill, {
    sourceSystem: args.sourceSystem,
    taskSplit: args.taskSplit,
    minEvidence: args.minEvidence,
  });

  await writeArtifacts(artifacts, args.outDir);

  console.log(
    JSON.stringify(
      {
        results: basename(args.results),
        outDir: args.outDir,
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
