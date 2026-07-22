import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SkillIRSchema } from "../../skill-ir/schema";
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit";
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";
import type { RealAgentRunPlanEntry } from "./real-agent";
import { sha256Bytes } from "./source-fixture";

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const StaticDevelopmentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-static-development-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
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
  }).strict(),
  model: z.object({
    route: z.string().min(1),
    family: z.string().min(1),
  }).strict(),
  adapter: z.object({
    id: z.literal("bare-agent"),
    version: z.string().min(1),
  }).strict(),
  matrix: z.object({
    systems: z.tuple([z.literal("no-skill"), z.literal("original"), z.literal("ir-static")]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("development"),
    taskIds: z.tuple([z.string().min(1), z.string().min(1)]),
    repetitions: z.literal(2),
    expectedRows: z.literal(12),
    expectedTriplets: z.literal(4),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    pythonEnv: z.literal("SKVM_PYTHON"),
    retries: z.literal(0),
    resourceProbeRequired: z.literal(true),
    routeProbeRequired: z.literal(true),
  }).strict(),
  gate: z.object({
    minimumIrStaticSuccesses: z.literal(3),
    minimumIrStaticMeanScore: z.literal(0.85),
    maximumInfrastructureFailures: z.literal(0),
    maximumHardGateRegressions: z.literal(0),
    minimumImprovedPairs: z.literal(1),
  }).strict(),
  promotionBoundary: z.object({
    corpusStatusAtRun: z.literal("runnable"),
    entersMainClaim: z.literal(false),
    permitsHeldOut: z.literal(false),
    permitsDynamicRepair: z.literal(false),
    permitsArtifactPromotion: z.literal(false),
    permitsScorerRetuning: z.literal(false),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, ctx) => {
  if (new Set(lock.matrix.taskIds).size !== lock.matrix.taskIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Static development task ids must be unique" });
  }
});

export type StaticDevelopmentLock = z.infer<typeof StaticDevelopmentLockSchema>;

type CorpusManifest = {
  skills: Array<{
    id?: string;
    status?: string;
    sourcePath?: string;
    tasksPath?: string;
    resourceContractPath?: string;
    irPath?: string;
    sourceAuditPath?: string;
  }>;
};

type TaskSet = {
  skillId?: string;
  tasks?: Array<{ id?: string; split?: string }>;
};

async function verifyDigest(rootDir: string, file: { path: string; sha256: string }): Promise<void> {
  const actual = sha256Bytes(await readFile(path.resolve(rootDir, file.path)));
  if (actual !== file.sha256) throw new Error(`Static development digest mismatch for ${file.path}`);
}

export async function validateStaticDevelopmentLock(
  input: unknown,
  rootDir: string,
  overrides: { manifest?: CorpusManifest } = {},
): Promise<StaticDevelopmentLock> {
  const lock = StaticDevelopmentLockSchema.parse(input);
  await Promise.all(Object.values(lock.frozenInputs).map((file) => verifyDigest(rootDir, file)));

  const manifest = overrides.manifest ?? JSON.parse(await readFile(
    path.resolve(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
    "utf8",
  )) as CorpusManifest;
  const skill = manifest.skills.find((entry) => entry.id === lock.skillId);
  if (
    !skill
    || skill.status !== lock.promotionBoundary.corpusStatusAtRun
    || !skill.irPath
    || !skill.sourceAuditPath
  ) {
    throw new Error(`Static development requires ${lock.skillId} to have runnable audited IR`);
  }
  if (
    skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path
    || skill.irPath !== lock.frozenInputs.baseIr.path
    || skill.sourceAuditPath !== lock.frozenInputs.sourceAudit.path
  ) {
    throw new Error("Static development corpus identity drift");
  }

  const taskSet = JSON.parse(await readFile(path.resolve(rootDir, lock.frozenInputs.tasks.path), "utf8")) as TaskSet;
  if (taskSet.skillId !== lock.skillId) throw new Error("Static development task set skill mismatch");
  const splitById = new Map((taskSet.tasks ?? []).map((task) => [task.id, task.split]));
  if (lock.matrix.taskIds.some((taskId) => splitById.get(taskId) !== lock.matrix.taskSplit)) {
    throw new Error("Static development contains a non-development task");
  }

  const ir = SkillIRSchema.parse(JSON.parse(await readFile(
    path.resolve(rootDir, lock.frozenInputs.baseIr.path),
    "utf8",
  )));
  const audit = SkillIRSourceAuditSchema.parse(JSON.parse(await readFile(
    path.resolve(rootDir, lock.frozenInputs.sourceAudit.path),
    "utf8",
  )));
  const auditReport = await verifySkillIRSourceAudit(ir, audit, rootDir);
  if (auditReport.errors.length > 0) {
    throw new Error(`Static development source audit failed: ${auditReport.errors.join("; ")}`);
  }
  return lock;
}

export async function readAndValidateStaticDevelopmentLock(opts: {
  rootDir: string;
  lockPath: string;
}): Promise<StaticDevelopmentLock> {
  return validateStaticDevelopmentLock(
    JSON.parse(await readFile(path.resolve(opts.lockPath), "utf8")),
    path.resolve(opts.rootDir),
  );
}

export type StaticDevelopmentPlan = {
  schemaVersion: "skill-ir-static-development-plan/v1";
  experimentId: string;
  methodEvidence: true;
  lock: StaticDevelopmentLock;
  runArgs: RealAgentRunArgs;
  plan: RealAgentRunPlanEntry[];
};

export async function buildStaticDevelopmentPlan(opts: {
  rootDir: string;
  lockPath: string;
  outDir: string;
}): Promise<StaticDevelopmentPlan> {
  const rootDir = path.resolve(opts.rootDir);
  const lock = await readAndValidateStaticDevelopmentLock({
    rootDir,
    lockPath: path.isAbsolute(opts.lockPath) ? opts.lockPath : path.resolve(rootDir, opts.lockPath),
  });
  const runArgs: RealAgentRunArgs = {
    corpus: lock.corpus,
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.adapter.id,
    adapterVersion: lock.adapter.version,
    repetitions: lock.matrix.repetitions,
    panelConfigId: lock.experimentId,
    outDir: path.isAbsolute(opts.outDir) ? path.resolve(opts.outDir) : path.resolve(rootDir, opts.outDir),
    limit: lock.matrix.expectedRows,
    execute: false,
    retries: lock.runtime.retries,
    retryDelayMs: 0,
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
  const plan = await buildPlan(runArgs);
  if (plan.length !== lock.matrix.expectedRows) {
    throw new Error(`Static development row mismatch: expected ${lock.matrix.expectedRows}, got ${plan.length}`);
  }
  const triplets = new Map<string, Set<string>>();
  for (const row of plan) {
    const key = `${row.caseId}:${row.runIndex}`;
    const systems = triplets.get(key) ?? new Set<string>();
    systems.add(row.system);
    triplets.set(key, systems);
  }
  if (
    triplets.size !== lock.matrix.expectedTriplets
    || [...triplets.values()].some((systems) => systems.size !== lock.matrix.systems.length)
  ) {
    throw new Error("Static development plan does not contain complete triplets");
  }
  return {
    schemaVersion: "skill-ir-static-development-plan/v1",
    experimentId: lock.experimentId,
    methodEvidence: true,
    lock,
    runArgs,
    plan,
  };
}
