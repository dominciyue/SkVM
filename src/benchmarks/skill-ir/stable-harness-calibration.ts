import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import { verifyExperimentalDesignV2HeldoutFreeze } from "./experimental-design-v2-heldout-freeze.ts"
import { ExperimentalDesignV2MaterializationAuditReportSchema } from "./experimental-design-v2-materialization-audit.ts"
import type { ProbeExecution } from "./route-probe.ts"
import { sha256Bytes } from "./source-fixture.ts"

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const BenchmarkGuardSchema = z.discriminatedUnion("kind", [
  FrozenFileSchema.extend({ kind: z.literal("experimental-design-v2-heldout-freeze") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("experimental-design-v2-materialization-audit") }).strict(),
])

const StableHarnessRuntimeSchema = z.object({
  apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
  retries: z.literal(0),
  taskTimeoutMs: z.literal(300000),
  maxSteps: z.literal(30),
  teardownGraceMs: z.literal(60000),
  outerWatchdogMs: z.literal(360000),
}).strict()

export const StableHarnessCalibrationLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-stable-harness-calibration-lock/v1"),
  status: z.literal("preregistered"),
  calibrationId: z.literal("experimental-design-v2-pi-post-injection-cleanup-v1"),
  methodEvidence: z.literal(false),
  corpus: z.literal("pilot"),
  skillId: z.literal("experimental-design-v2"),
  frozenInputs: z.object({
    source: FrozenFileSchema,
    tasks: FrozenFileSchema,
    resourceContract: FrozenFileSchema,
    scorer: FrozenFileSchema,
  }).strict(),
  benchmarkGuards: z.tuple([
    BenchmarkGuardSchema,
    BenchmarkGuardSchema,
  ]),
  harness: z.object({
    adapter: z.literal("pi"),
    adapterVersion: z.literal("0.67.68"),
    mode: z.literal("managed"),
    packageJson: FrozenFileSchema,
    bunLock: FrozenFileSchema,
    adapterSource: FrozenFileSchema,
    orchestration: z.tuple([FrozenFileSchema, FrozenFileSchema]),
    installedPackageJson: z.literal("node_modules/@mariozechner/pi-coding-agent/package.json"),
    executable: z.literal("node_modules/.bin/pi.exe"),
  }).strict(),
  model: z.object({
    route: z.literal("xty/gpt-5.6-sol"),
    family: z.literal("gpt"),
  }).strict(),
  matrix: z.object({
    systems: z.tuple([z.literal("no-skill"), z.literal("original")]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("development"),
    taskIds: z.tuple([
      z.literal("experimental-design-v2-stratified-dev-001"),
      z.literal("experimental-design-v2-cluster-sequential-dev-002"),
    ]),
    repetitions: z.literal(2),
    expectedRows: z.literal(8),
    expectedPairs: z.literal(4),
  }).strict(),
  qualification: z.object({
    system: z.literal("original"),
    taskId: z.literal("experimental-design-v2-cluster-sequential-dev-002"),
    runIndex: z.literal(1),
  }).strict(),
  runtime: StableHarnessRuntimeSchema,
  gate: z.object({
    maximumInfrastructureFailures: z.literal(0),
    requireNoSkillNonSaturation: z.literal(true),
    minimumDifferingPairs: z.literal(1),
    requireOriginalNonRegression: z.literal(false),
  }).strict(),
  claimBoundary: z.object({
    developmentOnly: z.literal(true),
    harnessSpecific: z.literal(true),
    comparableWithBareAgent: z.literal(false),
    createsBaseIr: z.literal(false),
    permitsHeldOut: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    tokenEvidence: z.literal(false),
  }).strict(),
}).strict().superRefine((lock, ctx) => {
  const kinds = lock.benchmarkGuards.map((guard) => guard.kind)
  if (
    kinds[0] !== "experimental-design-v2-heldout-freeze"
    || kinds[1] !== "experimental-design-v2-materialization-audit"
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Stable harness benchmark guard order mismatch" })
  }
})

export type StableHarnessCalibrationLock = z.infer<typeof StableHarnessCalibrationLockSchema>

async function verifyFrozenFile(
  rootDir: string,
  file: { path: string; sha256: string },
  label: string,
): Promise<Buffer> {
  const bytes = await readFile(path.resolve(rootDir, file.path))
  if (sha256Bytes(bytes) !== file.sha256) {
    throw new Error(`Stable harness ${label} digest mismatch for ${file.path}`)
  }
  return bytes
}

export async function validateStableHarnessCalibrationLock(
  input: unknown,
  rootDir: string,
): Promise<StableHarnessCalibrationLock> {
  const lock = StableHarnessCalibrationLockSchema.parse(input)
  assertStableHarnessTimeoutBudget(lock.runtime)

  await Promise.all(Object.entries(lock.frozenInputs).map(([label, file]) =>
    verifyFrozenFile(rootDir, file, label)
  ))
  await verifyFrozenFile(rootDir, lock.harness.packageJson, "package.json")
  await verifyFrozenFile(rootDir, lock.harness.bunLock, "bun.lock")
  await verifyFrozenFile(rootDir, lock.harness.adapterSource, "Pi adapter source")
  await Promise.all(lock.harness.orchestration.map((file) =>
    verifyFrozenFile(rootDir, file, "stable harness orchestration")
  ))

  for (const guard of lock.benchmarkGuards) {
    const bytes = await verifyFrozenFile(rootDir, guard, guard.kind)
    const value = JSON.parse(bytes.toString("utf8")) as unknown
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
        throw new Error("Stable harness materialization audit did not pass 36/36")
      }
    }
  }

  const packageJson = JSON.parse(await readFile(path.resolve(rootDir, lock.harness.packageJson.path), "utf8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const declaredVersion = packageJson.dependencies?.["@mariozechner/pi-coding-agent"]
    ?? packageJson.devDependencies?.["@mariozechner/pi-coding-agent"]
  if (declaredVersion !== lock.harness.adapterVersion) {
    throw new Error("Stable harness declared Pi version mismatch")
  }
  const installed = JSON.parse(await readFile(
    path.resolve(rootDir, lock.harness.installedPackageJson),
    "utf8",
  )) as { version?: string }
  if (installed.version !== lock.harness.adapterVersion) {
    throw new Error("Stable harness installed Pi version mismatch")
  }
  const executableStat = await lstat(path.resolve(rootDir, lock.harness.executable))
  if (!executableStat.isFile() || executableStat.isSymbolicLink()) {
    throw new Error("Stable harness Pi executable must be a regular file")
  }

  const manifest = JSON.parse(await readFile(
    path.resolve(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
    "utf8",
  )) as { skills?: Array<Record<string, unknown>> }
  const skill = manifest.skills?.find((candidate) => candidate.id === lock.skillId)
  if (
    skill?.status !== "tasks-authored"
    || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path
    || skill.irPath !== undefined
  ) {
    throw new Error("Stable harness corpus lifecycle or source identity mismatch")
  }
  const taskSet = JSON.parse(await readFile(path.resolve(rootDir, lock.frozenInputs.tasks.path), "utf8")) as {
    skillId?: string
    tasks?: Array<{ id?: string; split?: string }>
  }
  const splitById = new Map((taskSet.tasks ?? []).map((task) => [task.id, task.split]))
  if (
    taskSet.skillId !== lock.skillId
    || lock.matrix.taskIds.some((taskId) => splitById.get(taskId) !== lock.matrix.taskSplit)
  ) {
    throw new Error("Stable harness development task identity mismatch")
  }
  return lock
}

export async function readAndValidateStableHarnessCalibrationLock(opts: {
  rootDir: string
  lockPath: string
}): Promise<StableHarnessCalibrationLock> {
  return validateStableHarnessCalibrationLock(
    JSON.parse(await readFile(path.resolve(opts.lockPath), "utf8")),
    path.resolve(opts.rootDir),
  )
}

export function assertStableHarnessTimeoutBudget(
  runtime: { taskTimeoutMs: number; teardownGraceMs: number; outerWatchdogMs: number },
): {
  taskTimeoutMs: number
  teardownGraceMs: number
  outerWatchdogMs: number
  minimumOuterWatchdogMs: number
} {
  const minimumOuterWatchdogMs = runtime.taskTimeoutMs + runtime.teardownGraceMs
  if (runtime.outerWatchdogMs < minimumOuterWatchdogMs) {
    throw new Error(
      `Stable harness outer watchdog ${runtime.outerWatchdogMs}ms is shorter than task timeout plus teardown grace ${minimumOuterWatchdogMs}ms`,
    )
  }
  return {
    taskTimeoutMs: runtime.taskTimeoutMs,
    teardownGraceMs: runtime.teardownGraceMs,
    outerWatchdogMs: runtime.outerWatchdogMs,
    minimumOuterWatchdogMs,
  }
}

export const LocalPiQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-local-pi-qualification/v1"),
  calibrationId: z.literal("experimental-design-v2-pi-post-injection-cleanup-v1"),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  executable: z.literal("node_modules/.bin/pi.exe"),
  expectedVersion: z.literal("0.67.68"),
  observedVersion: z.string(),
  exitCode: z.number().int().optional(),
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
}).strict()

export type LocalPiQualificationReport = z.infer<typeof LocalPiQualificationReportSchema>

export function summarizeLocalPiQualification(input: {
  lock: StableHarnessCalibrationLock
  execution: ProbeExecution
}): LocalPiQualificationReport {
  const stdoutVersion = input.execution.stdout.trim()
  const stderrVersion = input.execution.stderr.trim()
  const observedVersion = stdoutVersion.length > 0 && stderrVersion.length > 0
    ? ""
    : stdoutVersion || stderrVersion
  const status = (
    input.execution.exitCode === 0
    && !input.execution.timedOut
    && observedVersion === input.lock.harness.adapterVersion
  ) ? "passed" : "failed"
  return LocalPiQualificationReportSchema.parse({
    schemaVersion: "skill-ir-local-pi-qualification/v1",
    calibrationId: input.lock.calibrationId,
    methodEvidence: false,
    status,
    executable: input.lock.harness.executable,
    expectedVersion: input.lock.harness.adapterVersion,
    observedVersion,
    ...(input.execution.exitCode !== undefined ? { exitCode: input.execution.exitCode } : {}),
    timedOut: input.execution.timedOut,
    ...(input.execution.durationMs !== undefined ? { durationMs: input.execution.durationMs } : {}),
  })
}
