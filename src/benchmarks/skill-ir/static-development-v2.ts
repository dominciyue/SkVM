import { z } from "zod";
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";
import type { RealAgentRunPlanEntry } from "./real-agent";
import { SkillIRSchema } from "../../skill-ir/schema";
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit";
import { sha256Bytes } from "./source-fixture";

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const StaticDevelopmentV2LockSchema = z.object({
  schemaVersion: z.literal("skill-ir-static-development-lock/v2"),
  status: z.literal("preregistered"),
  experimentId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  evaluationMode: z.enum(["improvement", "static-fidelity"]),
  methodEvidence: z.literal(true),
  corpus: z.literal("pilot"),
  skillId: z.string().min(1),
  frozenInputs: z.object({
    source: FrozenFileSchema,
    tasks: FrozenFileSchema,
    resourceContract: FrozenFileSchema,
    scorer: FrozenFileSchema,
    baseIr: FrozenFileSchema,
    sourceAudit: FrozenFileSchema,
    publicContract: FrozenFileSchema.optional(),
    admissionEvidence: FrozenFileSchema.optional(),
  }).strict(),
  implementation: z.array(FrozenFileSchema).min(1),
  model: z.object({ route: z.string().min(1), family: z.string().min(1) }).strict(),
  adapter: z.object({ id: z.literal("pi"), version: z.string().min(1) }).strict(),
  matrix: z.object({
    systems: z.tuple([z.literal("no-skill"), z.literal("original"), z.literal("ir-static")]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("development"),
    taskIds: z.array(z.string().min(1)).min(1),
    targetBlocksPerTask: z.number().int().positive(),
    reserveBlocksPerTask: z.number().int().nonnegative(),
    expectedSelectedRows: z.number().int().positive(),
    expectedSelectedTriplets: z.number().int().positive(),
    maximumAttemptRows: z.number().int().positive(),
    maximumCandidateTriplets: z.number().int().positive(),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    pythonEnv: z.literal("SKVM_PYTHON"),
    retries: z.literal(0),
    routeProbeTimeoutMs: z.literal(180000),
    resourceProbeRequired: z.literal(true),
    routeProbeRequired: z.literal(true),
    absoluteTimeoutMs: z.number().int().positive(),
    idleTimeoutMs: z.number().int().positive(),
    maxSteps: z.number().int().positive(),
    outerWatchdogMs: z.number().int().positive(),
    adapterConfig: z.literal("managed"),
    maximumWorkDirLength: z.literal(220),
    outputRoot: SafeRelativePathSchema,
  }).strict(),
  gate: z.object({
    minimumIrStaticSuccesses: z.number().int().nonnegative(),
    minimumIrStaticMeanScore: z.number().min(0).max(1),
    maximumActiveExecutionFailures: z.number().int().nonnegative(),
    maximumHardGateRegressions: z.number().int().nonnegative(),
    minimumImprovedPairs: z.number().int().nonnegative(),
    maximumRegressedPairs: z.number().int().nonnegative(),
  }).strict(),
  promotionBoundary: z.object({
    corpusStatusAtRun: z.literal("runnable"),
    entersMainClaim: z.literal(false),
    permitsHeldOut: z.literal(false),
    permitsDynamicRepair: z.literal(false),
    permitsArtifactPromotion: z.literal(false),
    permitsScorerRetuning: z.literal(false),
    permitsResidualAudit: z.literal(true),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, ctx) => {
  if (new Set(lock.matrix.taskIds).size !== lock.matrix.taskIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development v2 task ids must be unique" });
  }
  const tasks = lock.matrix.taskIds.length;
  const systems = lock.matrix.systems.length;
  const selectedTriplets = tasks * lock.matrix.targetBlocksPerTask;
  const candidateTriplets = tasks * (lock.matrix.targetBlocksPerTask + lock.matrix.reserveBlocksPerTask);
  if (
    lock.matrix.expectedSelectedTriplets !== selectedTriplets
    || lock.matrix.expectedSelectedRows !== selectedTriplets * systems
    || lock.matrix.maximumCandidateTriplets !== candidateTriplets
    || lock.matrix.maximumAttemptRows !== candidateTriplets * systems
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development v2 denominator arithmetic mismatch" });
  }
  if (
    lock.runtime.absoluteTimeoutMs !== 600000
    || lock.runtime.idleTimeoutMs !== 120000
    || lock.runtime.outerWatchdogMs !== 660000
    || lock.runtime.maxSteps !== 30
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development v2 requires the progress-aware Pi runtime" });
  }
  if (lock.runtime.idleTimeoutMs >= lock.runtime.absoluteTimeoutMs
    || lock.runtime.outerWatchdogMs <= lock.runtime.absoluteTimeoutMs) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development v2 progress-aware timeout ordering mismatch" });
  }
  if (lock.gate.minimumIrStaticSuccesses > lock.matrix.expectedSelectedTriplets) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development v2 static success gate exceeds denominator" });
  }
});

export type StaticDevelopmentV2Lock = z.infer<typeof StaticDevelopmentV2LockSchema>;

export async function validateStaticDevelopmentV2Lock(
  input: unknown,
  rootDir: string,
): Promise<StaticDevelopmentV2Lock> {
  const lock = StaticDevelopmentV2LockSchema.parse(input);
  const root = path.resolve(rootDir);
  for (const file of [...Object.values(lock.frozenInputs), ...lock.implementation]) {
    const actual = sha256Bytes(await readFile(path.resolve(root, file.path)));
    if (actual !== file.sha256) throw new Error(`Static development v2 digest mismatch for ${file.path}`);
  }
  const manifest = JSON.parse(await readFile(
    path.join(root, "benchmarks/skill-ir/corpus/corpora/pilot.json"), "utf8",
  )) as { skills: Array<Record<string, unknown>> };
  const skill = manifest.skills.find((item) => item.id === lock.skillId);
  if (
    !skill || skill.status !== "runnable"
    || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path
    || skill.irPath !== lock.frozenInputs.baseIr.path
    || skill.sourceAuditPath !== lock.frozenInputs.sourceAudit.path
  ) throw new Error("Static development v2 corpus identity drift");
  const tasks = JSON.parse(await readFile(path.resolve(root, lock.frozenInputs.tasks.path), "utf8")) as {
    skillId?: string; tasks?: Array<{ id?: string; split?: string }>;
  };
  const split = new Map((tasks.tasks ?? []).map((task) => [task.id, task.split]));
  if (tasks.skillId !== lock.skillId || lock.matrix.taskIds.some((id) => split.get(id) !== "development")) {
    throw new Error("Static development v2 task identity drift");
  }
  const ir = SkillIRSchema.parse(JSON.parse(await readFile(path.resolve(root, lock.frozenInputs.baseIr.path), "utf8")));
  const audit = SkillIRSourceAuditSchema.parse(JSON.parse(
    await readFile(path.resolve(root, lock.frozenInputs.sourceAudit.path), "utf8"),
  ));
  const report = await verifySkillIRSourceAudit(ir, audit, root);
  if (report.errors.length > 0) throw new Error(`Static development v2 source audit failed: ${report.errors.join("; ")}`);
  return lock;
}

export async function readAndValidateStaticDevelopmentV2Lock(input: {
  rootDir: string;
  lockPath: string;
}): Promise<StaticDevelopmentV2Lock> {
  const root = path.resolve(input.rootDir);
  const lockPath = path.isAbsolute(input.lockPath) ? input.lockPath : path.resolve(root, input.lockPath);
  return validateStaticDevelopmentV2Lock(JSON.parse(await readFile(lockPath, "utf8")), root);
}

export type StaticDevelopmentV2Plan = {
  schemaVersion: "skill-ir-static-development-plan/v2";
  experimentId: string;
  lock: StaticDevelopmentV2Lock;
  runArgs: RealAgentRunArgs;
  plan: RealAgentRunPlanEntry[];
};

export async function buildStaticDevelopmentV2Plan(input: {
  rootDir: string;
  lock: StaticDevelopmentV2Lock;
  outDir: string;
}): Promise<StaticDevelopmentV2Plan> {
  const lock = StaticDevelopmentV2LockSchema.parse(input.lock);
  const rootDir = path.resolve(input.rootDir);
  const outDir = path.resolve(rootDir, input.outDir);
  const runArgs: RealAgentRunArgs = {
    corpus: lock.corpus,
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.adapter.id,
    adapterVersion: lock.adapter.version,
    repetitions: lock.matrix.targetBlocksPerTask + lock.matrix.reserveBlocksPerTask,
    panelConfigId: lock.experimentId,
    outDir,
    limit: lock.matrix.maximumAttemptRows,
    execute: false,
    retries: 0,
    retryDelayMs: 0,
    outerWatchdogMs: lock.runtime.outerWatchdogMs,
    rootDir,
    allowTasksAuthored: false,
    allowDevelopmentReplay: false,
    allowArtifactDevelopmentReplay: false,
    skills: new Set([lock.skillId]),
    systems: new Set(lock.matrix.systems),
    contexts: new Set(lock.matrix.contexts),
    agents: new Set(lock.matrix.agents),
    environments: new Set(lock.matrix.environments),
    tasks: new Set(lock.matrix.taskIds),
    requireEnv: new Set([lock.runtime.apiKeyEnv]),
  };
  const basePlan = await buildPlan(runArgs);
  const plan = basePlan.map((row) => {
    const observationPath = path.join(path.dirname(row.workDir), "execution-observation.json");
    return {
      ...row,
      command: [
        process.execPath, "run", path.join(rootDir, "src/index.ts"), "run",
        ...row.command.slice(4).filter((arg) =>
          !arg.startsWith("--adapter-config=")
          && !arg.startsWith("--timeout-ms=")
          && !arg.startsWith("--idle-timeout-ms=")
          && !arg.startsWith("--max-steps=")
          && !arg.startsWith("--execution-observation=")),
        "--adapter-config=managed",
        `--timeout-ms=${lock.runtime.absoluteTimeoutMs}`,
        `--idle-timeout-ms=${lock.runtime.idleTimeoutMs}`,
        `--max-steps=${lock.runtime.maxSteps}`,
        `--execution-observation=${observationPath}`,
      ],
    };
  });
  if (plan.length !== lock.matrix.maximumAttemptRows) {
    throw new Error(`Static development v2 plan row mismatch: ${plan.length}`);
  }
  if (plan.some((row) => row.workDir.length > lock.runtime.maximumWorkDirLength)) {
    throw new Error("Static development v2 workdir exceeds frozen path budget");
  }
  return {
    schemaVersion: "skill-ir-static-development-plan/v2",
    experimentId: lock.experimentId,
    lock,
    runArgs,
    plan,
  };
}
