import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { scoreRawRunRows, type RawAgentRunRow } from "./scoring";
import type { SkillIRBenchmarkTask } from "./real-agent";

type Args = {
  raw: string;
  tasks: string;
  out: string;
};

type TaskSet = {
  skillId: string;
  tasks: SkillIRBenchmarkTask[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    raw: "results/skill-ir/real-agent-dry-run/raw-runs.jsonl",
    tasks: "benchmarks/skill-ir/tasks/review-skill-tasks.json",
    out: "results/skill-ir/main-results.jsonl",
  };

  for (const arg of argv) {
    if (arg.startsWith("--raw=")) {
      args.raw = arg.slice("--raw=".length);
    } else if (arg.startsWith("--tasks=")) {
      args.tasks = arg.slice("--tasks=".length);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const taskSet = await readJson<TaskSet>(args.tasks);
  const taskById = new Map(taskSet.tasks.map((task) => [task.id, task]));
  const rawRows = await readJsonl<RawAgentRunRow>(args.raw);
  const scoredRows = scoreRawRunRows(rawRows, taskById);

  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, scoredRows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");

  console.log(JSON.stringify({ raw: rawRows.length, scored: scoredRows.length, out: args.out }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
