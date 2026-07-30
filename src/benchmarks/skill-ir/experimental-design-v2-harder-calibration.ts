import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import {
  ExperimentalDesignV2HarderDifferentialAuditReportSchema,
  ExperimentalDesignV2HarderMaterializationAuditReportSchema,
} from "./experimental-design-v2-harder-audit.ts"
import {
  ExperimentalDesignV2SaturationAuditSchema,
  validateExperimentalDesignV2HarderDevelopmentTaskSet,
} from "./experimental-design-v2-harder-development.ts"
import { verifyExperimentalDesignV2HeldoutFreeze } from "./experimental-design-v2-heldout-freeze.ts"
import { verifyExperimentalDesignV2TaskSplitFreeze } from "./experimental-design-v2-task-freeze.ts"
import { sha256Bytes } from "./source-fixture.ts"

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const BenchmarkGuardSchema = z.discriminatedUnion("kind", [
  FrozenFileSchema.extend({ kind: z.literal("experimental-design-v2-task-split-freeze") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("experimental-design-v2-heldout-freeze") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("experimental-design-v2-saturation-audit") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("experimental-design-v2-harder-differential-audit") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("experimental-design-v2-harder-materialization-audit") }).strict(),
])

export const HarderCalibrationLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-v2-harder-calibration-lock/v1"),
  status: z.literal("preregistered"),
  calibrationId: z.literal("experimental-design-v2-harder-pi-development-v1"),
  methodEvidence: z.literal(false),
  skillId: z.literal("experimental-design-v2"),
  frozenInputs: z.object({
    source: FrozenFileSchema,
    tasks: FrozenFileSchema,
    publicContract: FrozenFileSchema,
    resourceContract: FrozenFileSchema,
    scorer: FrozenFileSchema,
  }).strict(),
  sourceClosure: z.array(FrozenFileSchema).min(2),
  benchmarkGuards: z.tuple([
    BenchmarkGuardSchema,
    BenchmarkGuardSchema,
    BenchmarkGuardSchema,
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
    orchestration: z.tuple([FrozenFileSchema, FrozenFileSchema, FrozenFileSchema]),
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
      z.literal("experimental-design-v2-three-arm-strata-sequential-dev-003"),
      z.literal("experimental-design-v2-four-arm-cluster-strata-sequential-dev-004"),
    ]),
    repetitions: z.literal(2),
    expectedRows: z.literal(8),
    expectedPairs: z.literal(4),
  }).strict(),
  qualification: z.object({
    system: z.literal("original"),
    taskId: z.literal("experimental-design-v2-four-arm-cluster-strata-sequential-dev-004"),
    runIndex: z.literal(1),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    retries: z.literal(0),
    taskTimeoutMs: z.literal(300000),
    maxSteps: z.literal(30),
    teardownGraceMs: z.literal(60000),
    outerWatchdogMs: z.literal(360000),
  }).strict(),
  gate: z.object({
    maximumInfrastructureFailures: z.literal(0),
    requireNoSkillNonSaturation: z.literal(true),
    minimumDifferingPairs: z.literal(1),
    requireOriginalNonRegression: z.literal(false),
  }).strict(),
  claimBoundary: z.object({
    developmentOnly: z.literal(true),
    supplementalTaskSet: z.literal(true),
    harnessSpecific: z.literal(true),
    createsBaseIr: z.literal(false),
    permitsHeldOut: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    tokenEvidence: z.literal(false),
  }).strict(),
}).strict().superRefine((lock, context) => {
  const guardKinds = lock.benchmarkGuards.map((guard) => guard.kind)
  const expectedKinds = [
    "experimental-design-v2-task-split-freeze",
    "experimental-design-v2-heldout-freeze",
    "experimental-design-v2-saturation-audit",
    "experimental-design-v2-harder-differential-audit",
    "experimental-design-v2-harder-materialization-audit",
  ]
  if (JSON.stringify(guardKinds) !== JSON.stringify(expectedKinds)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Harder calibration guard order mismatch" })
  }
  const closurePaths = lock.sourceClosure.map((file) => file.path)
  if (
    new Set(closurePaths).size !== closurePaths.length
    || !closurePaths.includes(lock.frozenInputs.source.path)
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Harder calibration source closure mismatch" })
  }
  if (lock.runtime.outerWatchdogMs < lock.runtime.taskTimeoutMs + lock.runtime.teardownGraceMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Harder calibration watchdog budget mismatch" })
  }
})

export type HarderCalibrationLock = z.infer<typeof HarderCalibrationLockSchema>

async function verifyFrozenFile(
  rootDir: string,
  file: { path: string; sha256: string },
  label: string,
): Promise<Buffer> {
  const absolute = path.resolve(rootDir, ...file.path.split("/"))
  const stat = await lstat(absolute)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Harder calibration ${label} must be a regular file: ${file.path}`)
  }
  const bytes = await readFile(absolute)
  if (sha256Bytes(bytes) !== file.sha256) {
    throw new Error(`Harder calibration ${label} digest mismatch for ${file.path}`)
  }
  return bytes
}

export async function validateHarderCalibrationLock(
  input: unknown,
  rootDir: string,
): Promise<HarderCalibrationLock> {
  const lock = HarderCalibrationLockSchema.parse(input)
  const [taskBytes, publicContractBytes] = await Promise.all([
    verifyFrozenFile(rootDir, lock.frozenInputs.tasks, "tasks"),
    verifyFrozenFile(rootDir, lock.frozenInputs.publicContract, "public contract"),
    verifyFrozenFile(rootDir, lock.frozenInputs.source, "source"),
    verifyFrozenFile(rootDir, lock.frozenInputs.resourceContract, "resource contract"),
    verifyFrozenFile(rootDir, lock.frozenInputs.scorer, "scorer"),
    ...lock.sourceClosure.map((file) => verifyFrozenFile(rootDir, file, "source closure")),
    verifyFrozenFile(rootDir, lock.harness.packageJson, "package.json"),
    verifyFrozenFile(rootDir, lock.harness.bunLock, "bun.lock"),
    verifyFrozenFile(rootDir, lock.harness.adapterSource, "Pi adapter"),
    ...lock.harness.orchestration.map((file) => verifyFrozenFile(rootDir, file, "orchestration")),
  ])
  const tasks = validateExperimentalDesignV2HarderDevelopmentTaskSet(
    JSON.parse(taskBytes.toString("utf8")),
    publicContractBytes,
  )
  if (JSON.stringify(tasks.tasks.map((task) => task.id)) !== JSON.stringify(lock.matrix.taskIds)) {
    throw new Error("Harder calibration task identity mismatch")
  }

  for (const guard of lock.benchmarkGuards) {
    const bytes = await verifyFrozenFile(rootDir, guard, guard.kind)
    const value = JSON.parse(bytes.toString("utf8")) as unknown
    switch (guard.kind) {
      case "experimental-design-v2-task-split-freeze":
        await verifyExperimentalDesignV2TaskSplitFreeze(rootDir, value)
        break
      case "experimental-design-v2-heldout-freeze":
        await verifyExperimentalDesignV2HeldoutFreeze(rootDir, value)
        break
      case "experimental-design-v2-saturation-audit": {
        const report = ExperimentalDesignV2SaturationAuditSchema.parse(value)
        if (report.status !== "passed") throw new Error("Harder calibration saturation audit failed")
        break
      }
      case "experimental-design-v2-harder-differential-audit": {
        const report = ExperimentalDesignV2HarderDifferentialAuditReportSchema.parse(value)
        if (report.status !== "passed" || report.counts.matched !== 12) {
          throw new Error("Harder calibration differential audit failed")
        }
        break
      }
      case "experimental-design-v2-harder-materialization-audit": {
        const report = ExperimentalDesignV2HarderMaterializationAuditReportSchema.parse(value)
        if (report.status !== "passed" || report.counts.passed !== 36) {
          throw new Error("Harder calibration materialization audit failed")
        }
        break
      }
    }
  }

  const packageJson = JSON.parse(await readFile(
    path.resolve(rootDir, lock.harness.packageJson.path),
    "utf8",
  )) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  const declared = packageJson.dependencies?.["@mariozechner/pi-coding-agent"]
    ?? packageJson.devDependencies?.["@mariozechner/pi-coding-agent"]
  if (declared !== lock.harness.adapterVersion) {
    throw new Error("Harder calibration declared Pi version mismatch")
  }
  const installed = JSON.parse(await readFile(
    path.resolve(rootDir, lock.harness.installedPackageJson),
    "utf8",
  )) as { version?: string }
  if (installed.version !== lock.harness.adapterVersion) {
    throw new Error("Harder calibration installed Pi version mismatch")
  }
  const executable = await lstat(path.resolve(rootDir, lock.harness.executable))
  if (!executable.isFile() || executable.isSymbolicLink()) {
    throw new Error("Harder calibration Pi executable must be a regular file")
  }
  return lock
}

export async function readAndValidateHarderCalibrationLock(opts: {
  rootDir: string
  lockPath: string
}): Promise<HarderCalibrationLock> {
  return validateHarderCalibrationLock(
    JSON.parse(await readFile(path.resolve(opts.lockPath), "utf8")),
    path.resolve(opts.rootDir),
  )
}
