import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import { buildDefaultMatrixInput, buildExperimentMatrix, type ExperimentCase, type ExperimentSystem } from "./matrix";
import {
  buildRunPlanEntry,
  materializeCaseArtifacts,
  type RealAgentRunPlanEntry,
  type SkillIRBenchmarkTask,
} from "./real-agent";
import { runWithInfrastructureRetries } from "./real-agent-retry";

export type RealAgentRunArgs = {
  model: string;
  adapter: string;
  outDir: string;
  limit: number;
  execute: boolean;
  retries: number;
  retryDelayMs: number;
  rootDir: string;
  irOverrideDir?: string;
  systems?: Set<ExperimentSystem>;
  contexts?: Set<string>;
  agents?: Set<string>;
  environments?: Set<string>;
  tasks?: Set<string>;
  requireEnv?: Set<string>;
};

type CorpusManifest = {
  skills: {
    id: string;
    irPath?: string;
    tasksPath?: string;
  }[];
};

type TaskSet = {
  skillId: string;
  tasks: SkillIRBenchmarkTask[];
};

type SkillBenchmarkFixture = {
  ir: SkillIR;
  taskSet: TaskSet;
  taskById: Map<string, SkillIRBenchmarkTask>;
};

function parseArgs(argv: string[]): RealAgentRunArgs {
  const args: RealAgentRunArgs = {
    model: "<provider>/<model-id>",
    adapter: "bare-agent",
    outDir: "results/skill-ir/real-agent-dry-run",
    limit: 12,
    execute: false,
    retries: 0,
    retryDelayMs: 1000,
    rootDir: process.cwd(),
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
    } else if (arg.startsWith("--retries=")) {
      args.retries = Number.parseInt(arg.slice("--retries=".length), 10);
    } else if (arg.startsWith("--retry-delay-ms=")) {
      args.retryDelayMs = Number.parseInt(arg.slice("--retry-delay-ms=".length), 10);
    } else if (arg.startsWith("--root-dir=")) {
      args.rootDir = arg.slice("--root-dir=".length);
    } else if (arg.startsWith("--ir-override-dir=")) {
      args.irOverrideDir = arg.slice("--ir-override-dir=".length);
    } else if (arg.startsWith("--systems=")) {
      args.systems = new Set(arg.slice("--systems=".length).split(",") as ExperimentSystem[]);
    } else if (arg.startsWith("--contexts=")) {
      args.contexts = new Set(arg.slice("--contexts=".length).split(","));
    } else if (arg.startsWith("--agents=")) {
      args.agents = new Set(arg.slice("--agents=".length).split(","));
    } else if (arg.startsWith("--environments=")) {
      args.environments = new Set(arg.slice("--environments=".length).split(","));
    } else if (arg.startsWith("--tasks=")) {
      args.tasks = new Set(arg.slice("--tasks=".length).split(","));
    } else if (arg.startsWith("--require-env=")) {
      args.requireEnv = new Set(arg.slice("--require-env=".length).split(","));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }

  if (!Number.isFinite(args.retries) || args.retries < 0) {
    throw new Error("--retries must be a non-negative integer");
  }

  if (!Number.isFinite(args.retryDelayMs) || args.retryDelayMs < 0) {
    throw new Error("--retry-delay-ms must be a non-negative integer");
  }

  if (args.execute && args.model === "<provider>/<model-id>") {
    throw new Error("--model=<provider>/<model-id> is required when --execute is set");
  }

  return args;
}

export function assertRequiredEnv(args: RealAgentRunArgs, env: Record<string, string | undefined> = process.env): void {
  if (!args.execute || !args.requireEnv || args.requireEnv.size === 0) {
    return;
  }

  const missing = [...args.requireEnv].filter((name) => !env[name] || env[name]?.trim().length === 0);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(path).text()) as T;
}

function selectCases(cases: ExperimentCase[], args: RealAgentRunArgs): ExperimentCase[] {
  return cases
    .filter((item) => (args.systems ? args.systems.has(item.system) : true))
    .filter((item) => (args.contexts ? args.contexts.has(item.context) : true))
    .filter((item) => (args.agents ? args.agents.has(item.agent) : true))
    .filter((item) => (args.environments ? args.environments.has(item.environment) : true))
    .filter((item) => (args.tasks ? args.tasks.has(item.task) : true))
    .slice(0, args.limit);
}

function resolveIrPath(rootDir: string, skill: CorpusManifest["skills"][number], irOverrideDir?: string): string {
  if (irOverrideDir) {
    const overrideDir = isAbsolute(irOverrideDir) ? irOverrideDir : join(rootDir, irOverrideDir);
    return join(overrideDir, `${skill.id}.json`);
  }

  if (!skill.irPath) {
    throw new Error(`Skill ${skill.id} is missing irPath in corpus manifest`);
  }

  return join(rootDir, skill.irPath);
}

async function loadSkillBenchmarkFixtures(args: RealAgentRunArgs): Promise<Map<string, SkillBenchmarkFixture>> {
  const manifest = await readJson<CorpusManifest>(join(args.rootDir, "benchmarks/skill-ir/corpus/manifest.json"));
  const fixtures = new Map<string, SkillBenchmarkFixture>();

  for (const skill of manifest.skills) {
    if (!skill.tasksPath) {
      throw new Error(`Skill ${skill.id} is missing tasksPath in corpus manifest`);
    }

    const ir = SkillIRSchema.parse(await readJson<unknown>(resolveIrPath(args.rootDir, skill, args.irOverrideDir)));
    const taskSet = await readJson<TaskSet>(join(args.rootDir, skill.tasksPath));
    if (taskSet.skillId !== skill.id) {
      throw new Error(`Task set ${skill.tasksPath} declares skillId ${taskSet.skillId}, expected ${skill.id}`);
    }

    fixtures.set(skill.id, {
      ir,
      taskSet,
      taskById: new Map(taskSet.tasks.map((task) => [task.id, task])),
    });
  }

  return fixtures;
}

export async function buildPlan(args: RealAgentRunArgs): Promise<RealAgentRunPlanEntry[]> {
  const input = buildDefaultMatrixInput(args.rootDir);
  const matrix = selectCases(buildExperimentMatrix(input), args);
  const fixtures = await loadSkillBenchmarkFixtures(args);
  const plan: RealAgentRunPlanEntry[] = [];

  for (const item of matrix) {
    const fixture = fixtures.get(item.skill);
    if (!fixture) {
      throw new Error(`Skill ${item.skill} was not found in corpus manifest`);
    }

    const task = fixture.taskById.get(item.task);
    if (!task) {
      throw new Error(`Task ${item.task} was not found in ${fixture.taskSet.skillId} task set`);
    }

    const materialized = await materializeCaseArtifacts({
      outDir: join(args.outDir, "artifacts"),
      ir: fixture.ir,
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

async function executePlan(plan: RealAgentRunPlanEntry[], args: RealAgentRunArgs): Promise<void> {
  const outDir = args.outDir;
  const rawRunsPath = join(outDir, "raw-runs.jsonl");
  await writeFile(rawRunsPath, "", "utf8");

  for (const item of plan) {
    const result = await runWithInfrastructureRetries(
      async () => {
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
        return {
          caseId: item.caseId,
          system: item.system,
          taskPath: item.taskPath,
          skillPath: item.skillPath,
          exitCode,
          durationMs: Date.now() - startedAt,
          stdout,
          stderr,
          successSource: "execution-only" as const,
        };
      },
      { maxRetries: args.retries, retryDelayMs: args.retryDelayMs },
    );
    await writeFile(rawRunsPath, `${JSON.stringify({ ...result.row, attempts: result.attempts })}\n`, { flag: "a" });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertRequiredEnv(args);
  await mkdir(args.outDir, { recursive: true });
  const plan = await buildPlan(args);
  const planPath = join(args.outDir, "plan.json");
  await writeFile(
    planPath,
    `${JSON.stringify(
      {
        count: plan.length,
        execute: args.execute,
        rootDir: args.rootDir,
        irOverrideDir: args.irOverrideDir,
        retry: { retries: args.retries, retryDelayMs: args.retryDelayMs },
        requireEnv: args.requireEnv ? [...args.requireEnv] : [],
        plan,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (args.execute) {
    await executePlan(plan, args);
  }

  console.log(JSON.stringify({ count: plan.length, planPath, executed: args.execute }, null, 2));
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
