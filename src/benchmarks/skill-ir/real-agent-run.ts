import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { RunStatus } from "../../core/types";
import { SkillIRSchema, type SkillIR } from "../../skill-ir/schema";
import {
  buildCorpusMatrixInput,
  buildExperimentMatrix,
  type EvidenceWeight,
  type ExperimentCase,
  type ExperimentSystem,
  type SkillProvenance,
} from "./matrix";
import { resolveCorpusManifestPath, type CorpusId } from "./corpus-registry";
import {
  buildRunPlanEntry,
  materializeCaseArtifacts,
  type RealAgentRunPlanEntry,
  type SkillIRBenchmarkTask,
} from "./real-agent";
import { runWithInfrastructureRetries } from "./real-agent-retry";
import { readAndValidateFinalIRProvenance } from "./final-ir-provenance";
import { inferModelFamily } from "./promotion-policy";
import { sha256Bytes } from "./source-fixture";

export type RealAgentRunArgs = {
  corpus: CorpusId;
  model: string;
  modelFamily?: string;
  adapter: string;
  adapterVersion?: string;
  repetitions?: number;
  panelConfigId?: string;
  outDir: string;
  limit: number;
  execute: boolean;
  retries: number;
  retryDelayMs: number;
  rootDir: string;
  allowTasksAuthored?: boolean;
  allowDevelopmentReplay?: boolean;
  irOverrideDir?: string;
  skills?: Set<string>;
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
    name?: string;
    category?: SkillIR["category"];
    irPath?: string;
    tasksPath?: string;
    sourcePath?: string;
    sourceFiles?: { path: string; sha256: string }[];
    provenance?: SkillProvenance;
    evidenceWeight?: EvidenceWeight;
    status?: string;
  }[];
};

type TaskSet = {
  skillId: string;
  tasks: SkillIRBenchmarkTask[];
};

type SkillBenchmarkFixture = {
  ir: SkillIR;
  baseIR: SkillIR;
  baseIRPath?: string;
  taskSet: TaskSet;
  taskById: Map<string, SkillIRBenchmarkTask>;
};

export function parseRealAgentRunArgs(argv: string[]): RealAgentRunArgs {
  const args: RealAgentRunArgs = {
    corpus: "calibration",
    model: "<provider>/<model-id>",
    adapter: "bare-agent",
    adapterVersion: "workspace",
    repetitions: 1,
    panelConfigId: "single-run",
    outDir: "results/skill-ir/real-agent-dry-run",
    limit: 12,
    execute: false,
    retries: 0,
    retryDelayMs: 1000,
    rootDir: process.cwd(),
    allowTasksAuthored: false,
    allowDevelopmentReplay: false,
  };
  let corpusProvided = false;

  for (const arg of argv) {
    if (arg === "--execute") {
      args.execute = true;
    } else if (arg === "--allow-tasks-authored") {
      args.allowTasksAuthored = true;
    } else if (arg === "--allow-development-replay") {
      args.allowDevelopmentReplay = true;
    } else if (arg.startsWith("--corpus=")) {
      const corpus = arg.slice("--corpus=".length);
      if (corpus !== "calibration" && corpus !== "pilot") {
        throw new Error(`Unknown Skill IR corpus: ${corpus}`);
      }
      args.corpus = corpus;
      corpusProvided = true;
    } else if (arg.startsWith("--model=")) {
      args.model = arg.slice("--model=".length);
    } else if (arg.startsWith("--model-family=")) {
      args.modelFamily = arg.slice("--model-family=".length);
    } else if (arg.startsWith("--adapter=")) {
      args.adapter = arg.slice("--adapter=".length);
    } else if (arg.startsWith("--adapter-version=")) {
      args.adapterVersion = arg.slice("--adapter-version=".length);
    } else if (arg.startsWith("--panel-config-id=")) {
      args.panelConfigId = arg.slice("--panel-config-id=".length);
    } else if (arg.startsWith("--repetitions=")) {
      args.repetitions = Number(arg.slice("--repetitions=".length));
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
    } else if (arg.startsWith("--skills=")) {
      args.skills = new Set(arg.slice("--skills=".length).split(","));
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

  if (!corpusProvided) {
    throw new Error("--corpus is required; choose calibration or pilot");
  }

  const identityValues = [
    ["--model", args.model],
    ["--model-family", args.modelFamily],
    ["--adapter", args.adapter],
    ["--adapter-version", args.adapterVersion],
    ["--panel-config-id", args.panelConfigId],
  ] as const;
  for (const [flag, value] of identityValues) {
    if (value !== undefined && value.trim().length === 0) {
      throw new Error(`${flag} must be a non-empty value`);
    }
  }

  if (!Number.isFinite(args.limit) || args.limit < 1) {
    throw new Error("--limit must be a positive integer");
  }

  if (!Number.isInteger(args.repetitions) || args.repetitions! < 1) {
    throw new Error("--repetitions must be a positive integer");
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

  args.modelFamily = args.modelFamily ?? inferModelFamily(args.model);

  return args;
}

export async function resetPersistentWorkDir(workDir: string): Promise<void> {
  const target = resolve(workDir);
  if (basename(target) !== "workdir" || !/^run-[1-9]\d*$/.test(basename(dirname(target)))) {
    throw new Error(`Refusing to reset non-materialized workdir: ${workDir}`);
  }
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
}

export function extractRunStatus(stdout: string): RunStatus {
  const finalOutputIndex = stdout.toLowerCase().lastIndexOf("final output:");
  const header = finalOutputIndex >= 0 ? stdout.slice(0, finalOutputIndex) : stdout;
  const matches = [...header.matchAll(/\brunstatus:\s*(ok|timeout|adapter-crashed|parse-failed|tainted)\b/gi)];
  return (matches.at(-1)?.[1]?.toLowerCase() as RunStatus | undefined) ?? "ok";
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
    .filter((item) => (args.skills ? args.skills.has(item.skill) : true))
    .filter((item) => (args.systems ? args.systems.has(item.system) : true))
    .filter((item) => (args.contexts ? args.contexts.has(item.context) : true))
    .filter((item) => (args.agents ? args.agents.has(item.agent) : true))
    .filter((item) => (args.environments ? args.environments.has(item.environment) : true))
    .filter((item) => (args.tasks ? args.tasks.has(item.task) : true))
    .slice(0, args.limit);
}

function hasExactValues<T>(values: Set<T> | undefined, expected: T[]): boolean {
  return values !== undefined && values.size === expected.length && expected.every((value) => values.has(value));
}

function assertTasksAuthoredCalibrationArgs(args: RealAgentRunArgs): void {
  if (!args.allowTasksAuthored) {
    return;
  }
  if (args.corpus !== "pilot") {
    throw new Error("--allow-tasks-authored requires --corpus=pilot");
  }
  if (!args.skills || args.skills.size !== 1) {
    throw new Error("--allow-tasks-authored requires exactly one explicit --skills value");
  }
  if (!hasExactValues(args.systems, ["no-skill", "original"])) {
    throw new Error("--allow-tasks-authored requires systems to be exactly no-skill,original");
  }
  if (!hasExactValues(args.contexts, ["clean"])) {
    throw new Error("--allow-tasks-authored requires --contexts=clean");
  }
  if (!args.tasks || args.tasks.size === 0) {
    throw new Error("--allow-tasks-authored requires explicit development --tasks");
  }
  if (args.irOverrideDir) {
    throw new Error("--allow-tasks-authored does not accept --ir-override-dir");
  }
}

function assertDevelopmentReplayArgs(args: RealAgentRunArgs): void {
  if (!args.allowDevelopmentReplay) {
    if (args.systems?.has("ir-pgo-dev")) {
      throw new Error("ir-pgo-dev requires --allow-development-replay");
    }
    return;
  }
  if (args.allowTasksAuthored) {
    throw new Error("--allow-development-replay cannot be combined with --allow-tasks-authored");
  }
  if (args.corpus !== "pilot") {
    throw new Error("--allow-development-replay requires --corpus=pilot");
  }
  if (!args.skills || args.skills.size !== 1) {
    throw new Error("--allow-development-replay requires exactly one explicit --skills value");
  }
  if (!hasExactValues(args.systems, ["ir-pgo-dev"])) {
    throw new Error("--allow-development-replay requires systems to be exactly ir-pgo-dev");
  }
  if (!hasExactValues(args.contexts, ["clean"])) {
    throw new Error("--allow-development-replay requires --contexts=clean");
  }
  if (!args.tasks || args.tasks.size === 0) {
    throw new Error("--allow-development-replay requires explicit development --tasks");
  }
  if (!args.irOverrideDir) {
    throw new Error("--allow-development-replay requires --ir-override-dir");
  }
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
  const manifest = await readJson<CorpusManifest>(resolveCorpusManifestPath(args.corpus, args.rootDir));
  const fixtures = new Map<string, SkillBenchmarkFixture>();

  for (const skill of manifest.skills) {
    const eligibleStatus = args.allowTasksAuthored ? "tasks-authored" : "runnable";
    if (skill.status !== eligibleStatus) {
      continue;
    }
    if (!skill.tasksPath) {
      throw new Error(`Skill ${skill.id} is missing tasksPath in corpus manifest`);
    }

    let baseIRPath: string | undefined;
    let baseIR: SkillIR;
    let ir: SkillIR;
    if (args.allowTasksAuthored) {
      if (!skill.sourcePath) {
        throw new Error(`Skill ${skill.id} is missing sourcePath in corpus manifest`);
      }
      const sourceFile = skill.sourceFiles?.find((file) => file.path === skill.sourcePath);
      if (!sourceFile) {
        throw new Error(`Skill ${skill.id} sourcePath has no matching sourceFiles digest`);
      }
      baseIR = SkillIRSchema.parse({
        schemaVersion: "skill-ir/v1",
        id: skill.id,
        name: skill.name ?? skill.id,
        category: skill.category ?? ["workflow"],
        intent: "Pre-IR exact-source calibration envelope; not an optimized Skill IR.",
        source: { kind: "file", path: skill.sourcePath, sha256: sourceFile.sha256 },
        inputs: [],
        outputs: [],
        preconditions: [],
        steps: [],
        rules: [],
        tools: [],
        environment: [],
        checks: [],
        recovery: [],
        profile: [],
      });
      ir = baseIR;
    } else {
      if (!skill.irPath) {
        throw new Error(`Skill ${skill.id} is missing irPath in corpus manifest`);
      }
      baseIRPath = join(args.rootDir, skill.irPath);
      baseIR = SkillIRSchema.parse(await readJson<unknown>(baseIRPath));
      ir = args.irOverrideDir
        ? SkillIRSchema.parse(await readJson<unknown>(resolveIrPath(args.rootDir, skill, args.irOverrideDir)))
        : baseIR;
    }
    const taskSet = await readJson<TaskSet>(join(args.rootDir, skill.tasksPath));
    if (taskSet.skillId !== skill.id) {
      throw new Error(`Task set ${skill.tasksPath} declares skillId ${taskSet.skillId}, expected ${skill.id}`);
    }

    fixtures.set(skill.id, {
      ir,
      baseIR,
      baseIRPath,
      taskSet,
      taskById: new Map(taskSet.tasks.map((task) => [task.id, task])),
    });
  }

  return fixtures;
}

function assertTasksAuthoredTaskSelection(
  args: RealAgentRunArgs,
  fixtures: Map<string, SkillBenchmarkFixture>,
): void {
  if (!args.allowTasksAuthored) {
    return;
  }
  const skillId = [...args.skills!][0]!;
  const fixture = fixtures.get(skillId);
  if (!fixture) {
    throw new Error(`Selected tasks-authored skill ${skillId} was not found in the pilot corpus`);
  }
  for (const taskId of args.tasks!) {
    const task = fixture.taskById.get(taskId);
    if (!task) {
      throw new Error(`Selected calibration task ${taskId} was not found for ${skillId}`);
    }
    if (task.split !== "development") {
      throw new Error(`--allow-tasks-authored accepts development tasks only: ${taskId}`);
    }
  }
}

function assertCompleteCalibrationPairs(matrix: ExperimentCase[], args: RealAgentRunArgs): void {
  if (!args.allowTasksAuthored) {
    return;
  }
  const systemsByCase = new Map<string, Set<ExperimentSystem>>();
  for (const item of matrix) {
    const systems = systemsByCase.get(item.caseId) ?? new Set<ExperimentSystem>();
    systems.add(item.system);
    systemsByCase.set(item.caseId, systems);
  }
  if (
    systemsByCase.size === 0 ||
    [...systemsByCase.values()].some((systems) => !hasExactValues(systems, ["no-skill", "original"]))
  ) {
    throw new Error("--allow-tasks-authored requires complete no-skill/original pairs after filtering and --limit");
  }
}

export async function buildPlan(args: RealAgentRunArgs): Promise<RealAgentRunPlanEntry[]> {
  assertTasksAuthoredCalibrationArgs(args);
  assertDevelopmentReplayArgs(args);
  const input = buildCorpusMatrixInput(args.corpus, args.rootDir, {
    mode: args.allowTasksAuthored ? "tasks-authored-calibration" : "runnable",
  });
  if (args.systems) {
    input.systems = [...args.systems];
  }
  if ((input.systems.includes("ir-pgo") || input.systems.includes("ir-pgo-dev")) && !args.irOverrideDir) {
    throw new Error("ir-pgo requires --ir-override-dir with development-derived final IR artifacts");
  }
  const fixtures = await loadSkillBenchmarkFixtures(args);
  assertTasksAuthoredTaskSelection(args, fixtures);
  const matrix = selectCases(buildExperimentMatrix(input), args);
  assertCompleteCalibrationPairs(matrix, args);
  if (input.systems.includes("ir-pgo") || input.systems.includes("ir-pgo-dev")) {
    const selectedSkillIds = [...new Set(matrix.map((item) => item.skill))];
    const selectedTasks = matrix.filter((item) => item.system === "ir-pgo" || item.system === "ir-pgo-dev");
    for (const item of selectedTasks) {
      const task = fixtures.get(item.skill)?.taskById.get(item.task);
      if (item.system === "ir-pgo" && task?.split !== "held-out") {
        throw new Error(`ir-pgo may only consume validated Final IR on held-out tasks: ${item.task}`);
      }
      if (item.system === "ir-pgo-dev" && task?.split !== "development") {
        throw new Error(`--allow-development-replay accepts development tasks only: ${item.task}`);
      }
    }
    const provenance = await readAndValidateFinalIRProvenance({
      rootDir: args.rootDir,
      corpus: args.corpus,
      manifestPath: resolveCorpusManifestPath(args.corpus, args.rootDir),
      irOverrideDir: args.irOverrideDir!,
      skills: selectedSkillIds.map((skillId) => {
        const fixture = fixtures.get(skillId)!;
        if (!fixture.baseIRPath) {
          throw new Error(`Skill ${skillId} has no base IR path for Final IR provenance validation`);
        }
        const sourceSha256 =
          fixture.baseIR.source.kind === "file"
            ? fixture.baseIR.source.sha256
            : sha256Bytes(Buffer.from(fixture.baseIR.source.text, "utf8"));
        return { skillId, sourceSha256, baseIRPath: fixture.baseIRPath };
      }),
    });
    if (input.systems.includes("ir-pgo-dev") && provenance.schemaVersion !== "skill-ir-final-provenance/v2") {
      throw new Error("ir-pgo-dev requires dual-source Final IR provenance v2");
    }
  }
  const plan: RealAgentRunPlanEntry[] = [];
  const repetitions = args.repetitions ?? 1;
  const modelFamily = args.modelFamily ?? inferModelFamily(args.model);
  const adapterVersion = args.adapterVersion ?? "workspace";
  const panelConfigId = args.panelConfigId ?? "single-run";

  for (const item of matrix) {
    const fixture = fixtures.get(item.skill);
    if (!fixture) {
      throw new Error(`Skill ${item.skill} was not found in corpus manifest`);
    }

    const task = fixture.taskById.get(item.task);
    if (!task) {
      throw new Error(`Task ${item.task} was not found in ${fixture.taskSet.skillId} task set`);
    }

    for (let runIndex = 1; runIndex <= repetitions; runIndex += 1) {
      const materialized = await materializeCaseArtifacts({
        outDir: join(args.outDir, "artifacts"),
        rootDir: args.rootDir,
        ir: item.system === "ir-pgo" || item.system === "ir-pgo-dev" ? fixture.ir : fixture.baseIR,
        task,
        context: item.context,
        system: item.system,
        caseId: item.caseId,
        runIndex,
      });
      plan.push(
        buildRunPlanEntry(
          {
            ...materialized,
            skillProvenance: item.skillProvenance,
            evidenceWeight: item.evidenceWeight,
          },
          {
            model: args.model,
            modelFamily,
            adapter: args.adapter,
            adapterVersion,
            runIndex,
            panelConfigId,
          },
        ),
      );
    }
  }

  return plan;
}

export async function executePlan(plan: RealAgentRunPlanEntry[], args: RealAgentRunArgs): Promise<void> {
  const outDir = args.outDir;
  const rawRunsPath = join(outDir, "raw-runs.jsonl");
  await writeFile(rawRunsPath, "", "utf8");

  for (const item of plan) {
    const result = await runWithInfrastructureRetries(
      async () => {
        await resetPersistentWorkDir(item.workDir);
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
          model: item.model,
          modelFamily: item.modelFamily,
          adapter: item.adapter,
          adapterVersion: item.adapterVersion,
          runIndex: item.runIndex,
          panelConfigId: item.panelConfigId,
          skillProvenance: item.skillProvenance,
          evidenceWeight: item.evidenceWeight,
          taskPath: item.taskPath,
          skillPath: item.skillPath,
          workDir: item.workDir,
          exitCode,
          runStatus: extractRunStatus(stdout),
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
  const args = parseRealAgentRunArgs(process.argv.slice(2));
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
