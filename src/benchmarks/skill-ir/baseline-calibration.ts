import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SkillIRSchema } from "../../skill-ir/schema";
import {
  SkillIRSourceAuditSchema,
  verifySkillIRSourceAudit,
} from "../../skill-ir/source-audit";
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package";
import { sha256Bytes } from "./source-fixture";

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const BaselineCalibrationLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-baseline-calibration-lock/v1"),
  status: z.literal("preregistered"),
  calibrationId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  methodEvidence: z.literal(false),
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
  frozenImplementations: z.object({
    lockValidator: FrozenFileSchema,
    runner: FrozenFileSchema,
    gate: FrozenFileSchema,
    gateRunner: FrozenFileSchema,
    modelRunner: FrozenFileSchema,
    scoring: FrozenFileSchema,
    routeProbe: FrozenFileSchema,
    resourceProbe: FrozenFileSchema,
    bareAgent: FrozenFileSchema,
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
    systems: z.tuple([z.literal("no-skill"), z.literal("original")]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("development"),
    taskIds: z.tuple([z.string().min(1), z.string().min(1)]),
    repetitions: z.literal(2),
    expectedRows: z.literal(8),
    expectedPairs: z.literal(4),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    pythonEnv: z.literal("SKVM_PYTHON"),
    retries: z.literal(0),
    resourceProbeRequired: z.literal(true),
    routeProbeRequired: z.literal(true),
    routeProbeTimeoutMs: z.number().int().min(1),
  }).strict(),
  gate: z.object({
    maximumInfrastructureFailures: z.literal(0),
    requireNoSkillNonSaturation: z.literal(true),
    minimumDifferingPairs: z.literal(1),
    requireOriginalNonRegression: z.literal(false),
  }).strict(),
  promotionBoundary: z.object({
    corpusStatusAtRun: z.literal("runnable"),
    fullDevelopmentPlanningAfterGate: z.literal(true),
    entersMainClaim: z.literal(false),
    permitsHeldOut: z.literal(false),
    permitsScorerRetuning: z.literal(false),
    permitsPackageRecompile: z.literal(false),
    permitsPgo: z.literal(false),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, ctx) => {
  if (new Set(lock.matrix.taskIds).size !== lock.matrix.taskIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Baseline calibration task ids must be unique",
    });
  }
});

export type BaselineCalibrationLock = z.infer<typeof BaselineCalibrationLockSchema>;

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

async function verifyDigest(
  rootDir: string,
  file: { path: string; sha256: string },
): Promise<void> {
  const actual = sha256Bytes(await readFile(path.resolve(rootDir, file.path)));
  if (actual !== file.sha256) {
    throw new Error(`Baseline calibration digest mismatch for ${file.path}`);
  }
}

export async function validateBaselineCalibrationLock(
  input: unknown,
  rootDir: string,
  overrides: { manifest?: CorpusManifest } = {},
): Promise<BaselineCalibrationLock> {
  const resolvedRoot = path.resolve(rootDir);
  const lock = BaselineCalibrationLockSchema.parse(input);
  await Promise.all([
    ...Object.values(lock.frozenInputs),
    ...Object.values(lock.frozenImplementations),
  ].map((file) => verifyDigest(resolvedRoot, file)));

  const manifest = overrides.manifest ?? JSON.parse(await readFile(
    path.resolve(resolvedRoot, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
    "utf8",
  )) as CorpusManifest;
  const skill = manifest.skills.find((entry) => entry.id === lock.skillId);
  if (
    !skill
    || skill.status !== lock.promotionBoundary.corpusStatusAtRun
    || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path
    || skill.irPath !== lock.frozenInputs.baseIr.path
    || skill.sourceAuditPath !== lock.frozenInputs.sourceAudit.path
  ) {
    throw new Error("Baseline calibration corpus identity drift");
  }

  const taskSet = JSON.parse(await readFile(
    path.resolve(resolvedRoot, lock.frozenInputs.tasks.path),
    "utf8",
  )) as TaskSet;
  if (taskSet.skillId !== lock.skillId) {
    throw new Error("Baseline calibration task set skill mismatch");
  }
  const splitById = new Map((taskSet.tasks ?? []).map((task) => [task.id, task.split]));
  if (lock.matrix.taskIds.some((taskId) => splitById.get(taskId) !== lock.matrix.taskSplit)) {
    throw new Error("Baseline calibration contains a non-development task");
  }

  const ir = SkillIRSchema.parse(JSON.parse(await readFile(
    path.resolve(resolvedRoot, lock.frozenInputs.baseIr.path),
    "utf8",
  )));
  if (ir.id !== lock.skillId) {
    throw new Error("Baseline calibration base IR skill mismatch");
  }
  const audit = SkillIRSourceAuditSchema.parse(JSON.parse(await readFile(
    path.resolve(resolvedRoot, lock.frozenInputs.sourceAudit.path),
    "utf8",
  )));
  const auditReport = await verifySkillIRSourceAudit(ir, audit, resolvedRoot);
  if (auditReport.errors.length > 0) {
    throw new Error(`Baseline calibration source audit failed: ${auditReport.errors.join("; ")}`);
  }
  return lock;
}

export async function readAndValidateBaselineCalibrationLock(opts: {
  rootDir: string;
  lockPath: string;
}): Promise<BaselineCalibrationLock> {
  return validateBaselineCalibrationLock(
    JSON.parse(await readFile(path.resolve(opts.lockPath), "utf8")),
    path.resolve(opts.rootDir),
  );
}
