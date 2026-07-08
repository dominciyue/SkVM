import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { scoreRawRunRows, scoreRawRunRowsBySkill, taskIndexKey, type RawAgentRunRow } from "./scoring";
import type { SkillIRBenchmarkTask } from "./real-agent";

type Args = {
  raw: string;
  tasks: string;
  manifest?: string;
  rootDir: string;
  out: string;
};

type CorpusManifest = {
  skills: {
    id: string;
    tasksPath?: string;
  }[];
};

type TaskSet = {
  skillId: string;
  tasks: SkillIRBenchmarkTask[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    raw: "results/skill-ir/real-agent-dry-run/raw-runs.jsonl",
    tasks: "benchmarks/skill-ir/tasks/review-skill-tasks.json",
    rootDir: process.cwd(),
    out: "results/skill-ir/main-results.jsonl",
  };

  for (const arg of argv) {
    if (arg.startsWith("--raw=")) {
      args.raw = arg.slice("--raw=".length);
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

async function loadTaskIndexFromManifest(args: Args): Promise<Map<string, SkillIRBenchmarkTask>> {
  const manifestPath = args.manifest ?? join(args.rootDir, "benchmarks/skill-ir/corpus/manifest.json");
  const manifest = await readJson<CorpusManifest>(manifestPath);
  const taskBySkillAndId = new Map<string, SkillIRBenchmarkTask>();

  for (const skill of manifest.skills) {
    if (!skill.tasksPath) {
      throw new Error(`Skill ${skill.id} is missing tasksPath in corpus manifest`);
    }

    const taskSet = await readJson<TaskSet>(join(args.rootDir, skill.tasksPath));
    if (taskSet.skillId !== skill.id) {
      throw new Error(`Task set ${skill.tasksPath} declares skillId ${taskSet.skillId}, expected ${skill.id}`);
    }

    for (const task of taskSet.tasks) {
      taskBySkillAndId.set(taskIndexKey(skill.id, task.id), task);
    }
  }

  return taskBySkillAndId;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawRows = await readJsonl<RawAgentRunRow>(args.raw);
  const scoredRows = args.manifest
    ? scoreRawRunRowsBySkill(rawRows, await loadTaskIndexFromManifest(args))
    : scoreRawRunRows(
        rawRows,
        new Map((await readJson<TaskSet>(args.tasks)).tasks.map((task) => [task.id, task])),
      );

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, scoredRows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");

  console.log(JSON.stringify({ raw: rawRows.length, scored: scoredRows.length, out: args.out }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
