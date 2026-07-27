import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import { sha256Bytes } from "./source-fixture.ts"
import { verifyExperimentalDesignV2HeldoutFreeze } from "./experimental-design-v2-heldout-freeze.ts"
import { ExperimentalDesignV2MaterializationAuditReportSchema } from "./experimental-design-v2-materialization-audit.ts"
import {
  PreIrExecutionRuntimeGuardSchema,
  verifyPreIrExecutionRuntimeGuard,
} from "./pre-ir-runtime-qualification.ts"

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const PreIrCalibrationLockFields = {
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
    corpusStatusAtRun: z.literal("tasks-authored"),
    createsBaseIr: z.literal(false),
    entersMainClaim: z.literal(false),
    permitsHeldOut: z.literal(false),
    permitsScorerRetuning: z.literal(false),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
} as const

function requireUniqueTaskIds(
  lock: { matrix: { taskIds: readonly string[] } },
  ctx: z.RefinementCtx,
): void {
  if (new Set(lock.matrix.taskIds).size !== lock.matrix.taskIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pre-IR calibration task ids must be unique" })
  }
}

const PreIrCalibrationLockV1Schema = z.object({
  schemaVersion: z.literal("skill-ir-pre-ir-calibration-lock/v1"),
  ...PreIrCalibrationLockFields,
}).strict().superRefine(requireUniqueTaskIds)

const PreIrHeldoutFreezeGuardSchema = z.object({
  kind: z.literal("experimental-design-v2-heldout-freeze"),
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const PreIrMaterializationAuditGuardSchema = z.object({
  kind: z.literal("experimental-design-v2-materialization-audit"),
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const PreIrBenchmarkGuardsSchema = z.tuple([
  PreIrHeldoutFreezeGuardSchema,
  PreIrMaterializationAuditGuardSchema,
])

const PreIrCalibrationLockV2Schema = z.object({
  schemaVersion: z.literal("skill-ir-pre-ir-calibration-lock/v2"),
  ...PreIrCalibrationLockFields,
  benchmarkGuards: PreIrBenchmarkGuardsSchema,
}).strict().superRefine(requireUniqueTaskIds)

const RuntimeQualifiedPreIrCalibrationLockV1Schema = z.object({
  schemaVersion: z.literal("skill-ir-runtime-qualified-pre-ir-calibration-lock/v1"),
  ...PreIrCalibrationLockFields,
  benchmarkGuards: PreIrBenchmarkGuardsSchema,
  executionRuntime: PreIrExecutionRuntimeGuardSchema,
}).strict().superRefine(requireUniqueTaskIds)

export const PreIrCalibrationLockSchema = z.union([
  PreIrCalibrationLockV1Schema,
  PreIrCalibrationLockV2Schema,
  RuntimeQualifiedPreIrCalibrationLockV1Schema,
])

export type PreIrCalibrationLock = z.infer<typeof PreIrCalibrationLockSchema>

type CorpusManifest = {
  skills: Array<{
    id?: string
    status?: string
    irPath?: string
    sourcePath?: string
    tasksPath?: string
    resourceContractPath?: string
  }>
}

type TaskSet = {
  skillId?: string
  tasks?: Array<{ id?: string; split?: string }>
}

async function verifyDigest(rootDir: string, file: { path: string; sha256: string }): Promise<void> {
  const actual = sha256Bytes(await readFile(path.resolve(rootDir, file.path)))
  if (actual !== file.sha256) {
    throw new Error(`Pre-IR calibration digest mismatch for ${file.path}`)
  }
}

async function verifyBenchmarkGuards(lock: PreIrCalibrationLock, rootDir: string): Promise<void> {
  if (lock.schemaVersion === "skill-ir-pre-ir-calibration-lock/v1") return
  for (const guard of lock.benchmarkGuards) {
    await verifyDigest(rootDir, guard)
    const value = JSON.parse(await readFile(path.resolve(rootDir, guard.path), "utf8")) as unknown
    if (guard.kind === "experimental-design-v2-heldout-freeze") {
      await verifyExperimentalDesignV2HeldoutFreeze(rootDir, value)
    } else {
      const report = ExperimentalDesignV2MaterializationAuditReportSchema.parse(value)
      if (
        report.status !== "passed"
        || report.issues.length !== 0
        || report.counts.checks !== 36
        || report.counts.passed !== 36
      ) {
        throw new Error("Pre-IR calibration materialization audit did not pass")
      }
    }
  }
}

export async function validatePreIrCalibrationLock(
  input: unknown,
  rootDir: string,
  overrides: { manifest?: CorpusManifest; requireExecutionState?: boolean } = {},
): Promise<PreIrCalibrationLock> {
  const lock = PreIrCalibrationLockSchema.parse(input)
  await Promise.all(Object.values(lock.frozenInputs).map((file) => verifyDigest(rootDir, file)))
  await verifyBenchmarkGuards(lock, rootDir)
  if (lock.schemaVersion === "skill-ir-runtime-qualified-pre-ir-calibration-lock/v1") {
    await verifyPreIrExecutionRuntimeGuard(lock.executionRuntime, rootDir)
  }

  const manifest = overrides.manifest ?? JSON.parse(await readFile(
    path.resolve(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
    "utf8",
  )) as CorpusManifest
  const skill = manifest.skills.find((entry) => entry.id === lock.skillId)
  const isExecutionState = skill?.status === lock.promotionBoundary.corpusStatusAtRun && !skill.irPath
  const isPromotedHistoricalState = skill?.status === "runnable" && Boolean(skill.irPath)
  if (!skill || (overrides.requireExecutionState ? !isExecutionState : !isExecutionState && !isPromotedHistoricalState)) {
    throw new Error(`Pre-IR calibration requires ${lock.skillId} to have a valid tasks-authored or promoted lifecycle state`)
  }
  if (
    skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path
  ) {
    throw new Error("Pre-IR calibration corpus source/task/resource identity drift")
  }

  const taskSet = JSON.parse(await readFile(path.resolve(rootDir, lock.frozenInputs.tasks.path), "utf8")) as TaskSet
  if (taskSet.skillId !== lock.skillId) {
    throw new Error("Pre-IR calibration task set skill mismatch")
  }
  const splitById = new Map((taskSet.tasks ?? []).map((task) => [task.id, task.split]))
  if (lock.matrix.taskIds.some((taskId) => splitById.get(taskId) !== lock.matrix.taskSplit)) {
    throw new Error("Pre-IR calibration contains a non-development task")
  }
  return lock
}

export async function assertPreIrCalibrationExecutionState(
  lock: PreIrCalibrationLock,
  rootDir: string,
): Promise<void> {
  await validatePreIrCalibrationLock(lock, rootDir, { requireExecutionState: true })
}

export async function readAndValidatePreIrCalibrationLock(opts: {
  rootDir: string
  lockPath: string
}): Promise<PreIrCalibrationLock> {
  return validatePreIrCalibrationLock(
    JSON.parse(await readFile(path.resolve(opts.lockPath), "utf8")),
    path.resolve(opts.rootDir),
  )
}
