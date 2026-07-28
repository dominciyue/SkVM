import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { scoreRawRunRows, scoreRawRunRowsBySkill, taskIndexKey, type RawAgentRunRow } from "./scoring";
import type { SkillIRBenchmarkTask } from "./real-agent";
import { resolveCorpusManifestPath, type CorpusId } from "./corpus-registry";
import { normalizePreIrRuntimeFailure } from "./pre-ir-runtime-evidence";

export type ScoringArgs = {
  raw: string;
  tasks: string;
  corpus?: CorpusId;
  manifest?: string;
  rootDir: string;
  out: string;
  allowTasksAuthored?: boolean;
  normalizePreIrRuntime?: boolean;
};

type CorpusManifest = {
  skills: {
    id: string;
    tasksPath?: string;
    status?: string;
  }[];
};

type TaskSet = {
  skillId: string;
  tasks: SkillIRBenchmarkTask[];
};

export function parseScoringArgs(argv: string[]): ScoringArgs {
  const args: ScoringArgs = {
    raw: "results/skill-ir/real-agent-dry-run/raw-runs.jsonl",
    tasks: "benchmarks/skill-ir/tasks/review-skill-tasks.json",
    rootDir: process.cwd(),
    out: "results/skill-ir/main-results.jsonl",
    allowTasksAuthored: false,
    normalizePreIrRuntime: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--raw=")) {
      args.raw = arg.slice("--raw=".length);
    } else if (arg === "--allow-tasks-authored") {
      args.allowTasksAuthored = true;
    } else if (arg === "--normalize-pre-ir-runtime") {
      args.normalizePreIrRuntime = true;
    } else if (arg.startsWith("--corpus=")) {
      const corpus = arg.slice("--corpus=".length);
      if (corpus !== "calibration" && corpus !== "pilot") {
        throw new Error(`Unknown Skill IR corpus: ${corpus}`);
      }
      args.corpus = corpus;
    } else if (arg.startsWith("--tasks=")) {
      args.tasks = arg.slice("--tasks=".length);
    } else if (arg.startsWith("--manifest=")) {
      args.manifest = arg.slice("--manifest=".length);
    } else if (arg.startsWith("--root-dir=")) {
      args.rootDir = arg.slice("--root-dir=".length);
    } else if (arg.startsWith("--out=")) {
      args.out = arg.slice("--out=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.corpus && args.manifest) {
    throw new Error("--corpus and --manifest are mutually exclusive");
  }
  if (args.allowTasksAuthored && args.corpus !== "pilot") {
    throw new Error("--allow-tasks-authored requires --corpus=pilot");
  }
  if (args.normalizePreIrRuntime && (!args.allowTasksAuthored || args.corpus !== "pilot")) {
    throw new Error("--normalize-pre-ir-runtime requires --corpus=pilot and --allow-tasks-authored");
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

async function canonicalizeRawRunWorkDirs(rows: RawAgentRunRow[], rawPath: string): Promise<void> {
  const rawRunRoot = await realpath(dirname(resolve(rawPath)));

  for (const row of rows) {
    if (!row.workDir) {
      continue;
    }
    const canonicalWorkDir = await realpath(resolve(row.workDir));
    const relativeWorkDir = relative(rawRunRoot, canonicalWorkDir);
    if (
      relativeWorkDir.length === 0 ||
      relativeWorkDir === ".." ||
      relativeWorkDir.startsWith(`..${sep}`) ||
      isAbsolute(relativeWorkDir)
    ) {
      throw new Error(`Run ${row.caseId} workDir is outside raw-run output root`);
    }
    row.workDir = canonicalWorkDir;
  }
}

async function loadTaskIndexFromManifest(args: ScoringArgs): Promise<Map<string, SkillIRBenchmarkTask>> {
  const manifestPath = args.corpus
    ? resolveCorpusManifestPath(args.corpus, args.rootDir)
    : isAbsolute(args.manifest!)
      ? args.manifest!
      : join(args.rootDir, args.manifest!);
  const manifest = await readJson<CorpusManifest>(manifestPath);
  const taskBySkillAndId = new Map<string, SkillIRBenchmarkTask>();

  for (const skill of manifest.skills) {
    const eligibleStatus = args.allowTasksAuthored ? "tasks-authored" : "runnable";
    if (args.corpus && skill.status !== eligibleStatus) {
      continue;
    }
    if (!skill.tasksPath) {
      throw new Error(`Skill ${skill.id} is missing tasksPath in corpus manifest`);
    }

    const taskSet = await readJson<TaskSet>(join(args.rootDir, skill.tasksPath));
    if (taskSet.skillId !== skill.id) {
      throw new Error(`Task set ${skill.tasksPath} declares skillId ${taskSet.skillId}, expected ${skill.id}`);
    }

    for (const task of taskSet.tasks) {
      if (args.allowTasksAuthored && task.split !== "development") {
        continue;
      }
      taskBySkillAndId.set(taskIndexKey(skill.id, task.id), task);
    }
  }

  return taskBySkillAndId;
}

export async function scoreRealAgentRuns(args: ScoringArgs): Promise<{ raw: number; scored: number; out: string }> {
  const persistedRawRows = await readJsonl<RawAgentRunRow>(args.raw);
  const rawRows = args.normalizePreIrRuntime
    ? persistedRawRows.map(normalizePreIrRuntimeFailure)
    : persistedRawRows;
  await canonicalizeRawRunWorkDirs(rawRows, args.raw);
  const scoredRows = args.corpus || args.manifest
    ? await scoreRawRunRowsBySkill(rawRows, await loadTaskIndexFromManifest(args))
    : await scoreRawRunRows(
        rawRows,
        new Map((await readJson<TaskSet>(args.tasks)).tasks.map((task) => [task.id, task])),
      );

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, scoredRows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");

  return { raw: rawRows.length, scored: scoredRows.length, out: args.out };
}

async function main() {
  const result = await scoreRealAgentRuns(parseScoringArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
