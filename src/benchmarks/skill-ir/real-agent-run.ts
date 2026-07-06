import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import { buildDefaultMatrixInput, buildExperimentMatrix, type ExperimentCase, type ExperimentSystem } from "./matrix";
import {
  buildRunPlanEntry,
  materializeCaseArtifacts,
  type RealAgentRunPlanEntry,
  type SkillIRBenchmarkTask,
} from "./real-agent";

type Args = {
  model: string;
  adapter: string;
  outDir: string;
  limit: number;
  execute: boolean;
  systems?: Set<ExperimentSystem>;
  contexts?: Set<string>;
};

type TaskSet = {
  skillId: string;
  tasks: SkillIRBenchmarkTask[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    model: "<provider>/<model-id>",
    adapter: "bare-agent",
    outDir: "results/skill-ir/real-agent-dry-run",
    limit: 12,
    execute: false,
  };

  for (const arg of argv) {
    if (arg === "--execute") {
      args.execute = true;
    } else if (arg.startsWith("--model=")) {
      args.model = arg.slice("--model=".length);
    } else if (arg.startsWith("--adapter=")) {
      args.adapter = arg.slice("--adapter=".length);
    } else if (arg.startsWith("--out-dir=")) {
      args.outDir = arg.slice("--out-dir=".length);
    } else if (arg.startsWith("--limit=")) {
      args.limit = Number.parseInt(arg.slice("--limit=".length), 10);
    } else if (arg.startsWith("--systems=")) {
      args.systems = new Set(arg.slice("--systems=".length).split(",") as ExperimentSystem[]);
    } else if (arg.startsWith("--contexts=")) {
      args.contexts = new Set(arg.slice("--contexts=".length).split(","));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }

  if (args.execute && args.model === "<provider>/<model-id>") {
    throw new Error("--model=<provider>/<model-id> is required when --execute is set");
  }

  return args;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(path).text()) as T;
}

function selectCases(cases: ExperimentCase[], args: Args): ExperimentCase[] {
  return cases
    .filter((item) => (args.systems ? args.systems.has(item.system) : true))
    .filter((item) => (args.contexts ? args.contexts.has(item.context) : true))
    .slice(0, args.limit);
}

async function buildPlan(args: Args): Promise<RealAgentRunPlanEntry[]> {
  const input = buildDefaultMatrixInput();
  const matrix = selectCases(buildExperimentMatrix(input), args);
  const ir = SkillIRSchema.parse(await readJson<unknown>("benchmarks/skill-ir/ir/review-skill.json"));
  const taskSet = await readJson<TaskSet>("benchmarks/skill-ir/tasks/review-skill-tasks.json");
  const taskById = new Map(taskSet.tasks.map((task) => [task.id, task]));
  const plan: RealAgentRunPlanEntry[] = [];

  for (const item of matrix) {
    const task = taskById.get(item.task);
    if (!task) {
      throw new Error(`Task ${item.task} was not found in ${taskSet.skillId} task set`);
    }

    const materialized = await materializeCaseArtifacts({
      outDir: join(args.outDir, "artifacts"),
      ir: ir as SkillIR,
      task,
      context: item.context,
      system: item.system,
      caseId: item.caseId,
    });
    plan.push(
      buildRunPlanEntry(materialized, {
        model: args.model,
        adapter: args.adapter,
      }),
    );
  }

  return plan;
}

async function executePlan(plan: RealAgentRunPlanEntry[], outDir: string): Promise<void> {
  const rawRunsPath = join(outDir, "raw-runs.jsonl");
  await writeFile(rawRunsPath, "", "utf8");

  for (const item of plan) {
    const startedAt = Date.now();
    const proc = Bun.spawn(item.command, {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const row = {
      caseId: item.caseId,
      system: item.system,
      taskPath: item.taskPath,
      skillPath: item.skillPath,
      exitCode,
      durationMs: Date.now() - startedAt,
      stdout,
      stderr,
      successSource: "execution-only",
    };
    await writeFile(rawRunsPath, `${JSON.stringify(row)}\n`, { flag: "a" });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.outDir, { recursive: true });
  const plan = await buildPlan(args);
  const planPath = join(args.outDir, "plan.json");
  await writeFile(planPath, `${JSON.stringify({ count: plan.length, execute: args.execute, plan }, null, 2)}\n`, "utf8");

  if (args.execute) {
    await executePlan(plan, args.outDir);
  }

  console.log(JSON.stringify({ count: plan.length, planPath, executed: args.execute }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
