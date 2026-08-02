import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import {
  evaluatePreIrCalibrationGate,
  type PreIrCalibrationGateLock,
  type PreIrCalibrationGateReport,
} from "./pre-ir-calibration-gate.ts"
import { PiPackageExecutionProbeReportSchema } from "./pi-package-execution-probe.ts"
import type { ScoredAgentRunRow } from "./scoring.ts"
import { sha256Bytes } from "./source-fixture.ts"

const FrozenFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()
const BenchmarkGuardSchema = z.discriminatedUnion("kind", [
  FrozenFileSchema.extend({ kind: z.literal("task-split-freeze") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("source-oracle-provenance") }).strict(),
  FrozenFileSchema.extend({
    kind: z.literal("contract-audit"),
    expectedCases: z.number().int().positive(),
  }).strict(),
])

const TaskSplitFreezeSchema = z.object({
  skillId: z.string().min(1),
  publicInterface: FrozenFileSchema,
  resourceContract: FrozenFileSchema,
  development: FrozenFileSchema.extend({ taskIds: z.tuple([z.string().min(1), z.string().min(1)]) }).strict(),
  heldout: FrozenFileSchema.extend({ taskIds: z.tuple([z.string().min(1), z.string().min(1)]) }).strict(),
}).passthrough()

const SourceProvenanceSchema = z.object({
  skillId: z.string().min(1),
  claims: z.array(FrozenFileSchema.passthrough()).min(1),
  runtimeReadable: z.literal(false),
  taskVisible: z.literal(false),
}).passthrough()

const ContractAuditSchema = z.object({
  status: z.literal("passed"),
  inputs: z.object({
    developmentTasksSha256: Sha256Schema,
    publicInterfaceSha256: Sha256Schema,
    taskSplitFreezeSha256: Sha256Schema,
    sourceProvenanceSha256: Sha256Schema,
    contractImplementationSha256: Sha256Schema,
    oracleImplementationSha256: Sha256Schema,
    evaluatorImplementationSha256: Sha256Schema,
    auditImplementationSha256: Sha256Schema,
  }).strict(),
  counts: z.object({ matched: z.number().int().nonnegative() }).passthrough(),
  issues: z.array(z.unknown()).length(0),
}).passthrough()

export const MethodCaseCalibrationLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-method-case-calibration-lock/v1"),
  status: z.literal("preregistered"),
  calibrationId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  methodEvidence: z.literal(false),
  corpus: z.literal("pilot"),
  skillId: z.string().min(1),
  frozenInputs: z.object({
    source: FrozenFileSchema,
    tasks: FrozenFileSchema,
    publicInterface: FrozenFileSchema,
    resourceContract: FrozenFileSchema,
    scorer: FrozenFileSchema,
    oracle: FrozenFileSchema,
    contract: FrozenFileSchema,
    audit: FrozenFileSchema,
    evaluatorRegistry: FrozenFileSchema,
  }).strict(),
  sourceClosure: z.array(FrozenFileSchema).min(2),
  benchmarkGuards: z.tuple([BenchmarkGuardSchema, BenchmarkGuardSchema, BenchmarkGuardSchema]),
  outputs: z.array(SafeRelativePathSchema).min(1).max(8),
  harness: z.object({
    adapter: z.literal("pi"),
    adapterVersion: z.literal("0.67.68"),
    mode: z.literal("managed"),
    packageJson: FrozenFileSchema,
    bunLock: FrozenFileSchema,
    adapterSource: FrozenFileSchema,
    execution: z.object({
      kind: z.literal("bun-source-skvm-direct-pi-package-short-path"),
      bunVersion: z.literal("1.3.14"),
      piResolution: z.literal("installed-package-node-short-path"),
      nodeCommand: z.literal("node"),
      nodeVersion: z.literal("v23.8.0"),
      nodeExecutableSha256: Sha256Schema,
      piCli: FrozenFileSchema,
      probe: FrozenFileSchema,
      sourceEntrypoint: FrozenFileSchema,
      outputRoot: SafeRelativePathSchema,
      maximumWorkDirLength: z.number().int().min(160).max(240),
    }).strict(),
    orchestration: z.array(FrozenFileSchema).min(5).max(7),
    installedPackageJson: z.literal("node_modules/@mariozechner/pi-coding-agent/package.json"),
    executable: z.literal("node_modules/@mariozechner/pi-coding-agent/dist/cli.js"),
  }).strict(),
  model: z.object({ route: z.literal("xty/gpt-5.6-sol"), family: z.literal("gpt") }).strict(),
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
  qualification: z.object({
    system: z.literal("original"),
    taskId: z.string().min(1),
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
    requireOriginalNonRegression: z.literal(true),
    minimumPositivePairs: z.literal(1),
    minimumOriginalSuccesses: z.literal(1),
  }).strict(),
  claimBoundary: z.object({
    developmentOnly: z.literal(true),
    capabilityCalibration: z.literal(true),
    harnessSpecific: z.literal(true),
    createsBaseIr: z.literal(false),
    permitsHeldOut: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    tokenEvidence: z.literal(false),
  }).strict(),
}).strict().superRefine((lock, context) => {
  if (JSON.stringify(lock.benchmarkGuards.map((guard) => guard.kind)) !== JSON.stringify([
    "task-split-freeze", "source-oracle-provenance", "contract-audit",
  ])) context.addIssue({ code: z.ZodIssueCode.custom, message: "method-case guard order mismatch" })
  const closurePaths = lock.sourceClosure.map((file) => file.path)
  if (new Set(closurePaths).size !== closurePaths.length || !closurePaths.includes(lock.frozenInputs.source.path)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "method-case source closure mismatch" })
  }
  if (new Set(lock.outputs).size !== lock.outputs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "method-case outputs must be unique" })
  }
  if (new Set(lock.matrix.taskIds).size !== 2 || !lock.matrix.taskIds.includes(lock.qualification.taskId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "method-case qualification task mismatch" })
  }
  if (lock.runtime.outerWatchdogMs < lock.runtime.taskTimeoutMs + lock.runtime.teardownGraceMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "method-case watchdog budget mismatch" })
  }
})

export type MethodCaseCalibrationLock = z.infer<typeof MethodCaseCalibrationLockSchema>

async function verifyFrozenFile(
  rootDir: string,
  file: { path: string; sha256: string },
  label: string,
): Promise<Buffer> {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...file.path.split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Method-case calibration ${label} escapes repository root`)
  }
  const stat = await lstat(absolute)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Method-case calibration ${label} must be a regular file`)
  }
  const bytes = await readFile(absolute)
  if (sha256Bytes(bytes) !== file.sha256) {
    throw new Error(`Method-case calibration ${label} digest mismatch for ${file.path}`)
  }
  return bytes
}

export async function validateMethodCaseCalibrationLock(
  input: unknown,
  rootDir: string,
): Promise<MethodCaseCalibrationLock> {
  const lock = MethodCaseCalibrationLockSchema.parse(input)
  for (const [label, file] of Object.entries(lock.frozenInputs)) await verifyFrozenFile(rootDir, file, label)
  for (const file of lock.sourceClosure) await verifyFrozenFile(rootDir, file, "source closure")
  for (const file of lock.benchmarkGuards) await verifyFrozenFile(rootDir, file, file.kind)
  await verifyFrozenFile(rootDir, lock.harness.packageJson, "package.json")
  await verifyFrozenFile(rootDir, lock.harness.bunLock, "bun.lock")
  await verifyFrozenFile(rootDir, lock.harness.adapterSource, "Pi adapter")
  await verifyFrozenFile(rootDir, lock.harness.execution.piCli, "Pi CLI")
  await verifyFrozenFile(rootDir, lock.harness.execution.probe, "Pi probe")
  await verifyFrozenFile(rootDir, lock.harness.execution.sourceEntrypoint, "source entrypoint")
  for (const file of lock.harness.orchestration) await verifyFrozenFile(rootDir, file, "orchestration")

  const taskSet = JSON.parse(await readFile(path.resolve(rootDir, lock.frozenInputs.tasks.path), "utf8")) as {
    skillId?: string
    tasks?: Array<{ id?: string; split?: string }>
  }
  const splitByTask = new Map((taskSet.tasks ?? []).map((task) => [task.id, task.split]))
  if (taskSet.skillId !== lock.skillId || lock.matrix.taskIds.some((taskId) => splitByTask.get(taskId) !== "development")) {
    throw new Error("Method-case calibration development task identity mismatch")
  }

  const [splitGuard, provenanceGuard, auditGuard] = lock.benchmarkGuards
  if (splitGuard.kind !== "task-split-freeze"
    || provenanceGuard.kind !== "source-oracle-provenance"
    || auditGuard.kind !== "contract-audit") {
    throw new Error("Method-case calibration benchmark guard order mismatch")
  }
  const split = TaskSplitFreezeSchema.parse(JSON.parse(await readFile(path.resolve(rootDir, splitGuard.path), "utf8")))
  if (split.skillId !== lock.skillId
    || split.development.path !== lock.frozenInputs.tasks.path
    || split.development.sha256 !== lock.frozenInputs.tasks.sha256
    || JSON.stringify(split.development.taskIds) !== JSON.stringify(lock.matrix.taskIds)
    || split.publicInterface.path !== lock.frozenInputs.publicInterface.path
    || split.publicInterface.sha256 !== lock.frozenInputs.publicInterface.sha256
    || split.resourceContract.path !== lock.frozenInputs.resourceContract.path
    || split.resourceContract.sha256 !== lock.frozenInputs.resourceContract.sha256
    || split.heldout.taskIds.some((taskId) => lock.matrix.taskIds.includes(taskId))) {
    throw new Error("Method-case calibration task split freeze mismatch")
  }

  const provenance = SourceProvenanceSchema.parse(JSON.parse(
    await readFile(path.resolve(rootDir, provenanceGuard.path), "utf8"),
  ))
  if (provenance.skillId !== lock.skillId || provenance.claims.some((claim) =>
    !lock.sourceClosure.some((file) => file.path === claim.path && file.sha256 === claim.sha256))) {
    throw new Error("Method-case calibration source provenance escapes source closure")
  }

  const audit = ContractAuditSchema.parse(JSON.parse(await readFile(path.resolve(rootDir, auditGuard.path), "utf8")))
  const expectedAuditInputs = {
    developmentTasksSha256: lock.frozenInputs.tasks.sha256,
    publicInterfaceSha256: lock.frozenInputs.publicInterface.sha256,
    taskSplitFreezeSha256: splitGuard.sha256,
    sourceProvenanceSha256: provenanceGuard.sha256,
    contractImplementationSha256: lock.frozenInputs.contract.sha256,
    oracleImplementationSha256: lock.frozenInputs.oracle.sha256,
    evaluatorImplementationSha256: lock.frozenInputs.scorer.sha256,
    auditImplementationSha256: lock.frozenInputs.audit.sha256,
  }
  if (audit.counts.matched !== auditGuard.expectedCases
    || JSON.stringify(audit.inputs) !== JSON.stringify(expectedAuditInputs)) {
    throw new Error("Method-case calibration contract audit binding mismatch")
  }

  const packageJson = JSON.parse(await readFile(path.resolve(rootDir, lock.harness.packageJson.path), "utf8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const declaredPi = packageJson.dependencies?.["@mariozechner/pi-coding-agent"]
    ?? packageJson.devDependencies?.["@mariozechner/pi-coding-agent"]
  if (declaredPi !== lock.harness.adapterVersion || Bun.version !== lock.harness.execution.bunVersion) {
    throw new Error("Method-case calibration Pi or Bun version drift")
  }
  const installedPi = JSON.parse(await readFile(path.resolve(rootDir, lock.harness.installedPackageJson), "utf8")) as {
    version?: string
  }
  if (installedPi.version !== lock.harness.adapterVersion) throw new Error("Method-case installed Pi version drift")
  const probe = PiPackageExecutionProbeReportSchema.parse(JSON.parse(await readFile(
    path.resolve(rootDir, lock.harness.execution.probe.path), "utf8",
  )))
  if (probe.status !== "passed" || probe.node?.version !== lock.harness.execution.nodeVersion
    || probe.node.executableSha256 !== lock.harness.execution.nodeExecutableSha256
    || probe.pi?.version !== lock.harness.adapterVersion || probe.pi.cliSha256 !== lock.harness.execution.piCli.sha256) {
    throw new Error("Method-case Pi probe binding mismatch")
  }
  const node = Bun.which(lock.harness.execution.nodeCommand)
  if (!node || sha256Bytes(await readFile(node)) !== lock.harness.execution.nodeExecutableSha256) {
    throw new Error("Method-case Node executable drift")
  }

  const manifest = JSON.parse(await readFile(
    path.resolve(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"), "utf8",
  )) as { skills?: Array<Record<string, unknown>> }
  const skill = manifest.skills?.find((entry) => entry.id === lock.skillId)
  if (skill?.status !== "tasks-authored" || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path || skill.irPath !== undefined) {
    throw new Error("Method-case corpus lifecycle or identity mismatch")
  }
  return lock
}

export async function readAndValidateMethodCaseCalibrationLock(input: {
  rootDir: string
  lockPath: string
}): Promise<MethodCaseCalibrationLock> {
  return validateMethodCaseCalibrationLock(
    JSON.parse(await readFile(path.resolve(input.lockPath), "utf8")),
    path.resolve(input.rootDir),
  )
}

function genericGateLock(lock: MethodCaseCalibrationLock): PreIrCalibrationGateLock {
  return {
    calibrationId: lock.calibrationId,
    skillId: lock.skillId,
    model: lock.model,
    adapter: { id: lock.harness.adapter, version: lock.harness.adapterVersion },
    matrix: lock.matrix,
    gate: lock.gate,
  }
}

export type MethodCaseCalibrationGateReport = Omit<
  PreIrCalibrationGateReport,
  "schemaVersion" | "passed" | "counts" | "gates" | "interpretation"
> & {
  schemaVersion: "skill-ir-method-case-calibration-gate/v1"
  passed: boolean
  counts: PreIrCalibrationGateReport["counts"] & { positivePairs: number; originalSuccesses: number }
  gates: PreIrCalibrationGateReport["gates"] & {
    positivePair: boolean
    originalHasSuccess: boolean
    originalMeanNonRegression: boolean
  }
  interpretation: PreIrCalibrationGateReport["interpretation"] & { baseIrAuditAllowed: boolean }
}

export function evaluateMethodCaseCalibrationGate(
  rows: ScoredAgentRunRow[],
  lock: MethodCaseCalibrationLock,
): MethodCaseCalibrationGateReport {
  const base = evaluatePreIrCalibrationGate(rows, genericGateLock(lock))
  const positivePairs = base.pairs.filter((pair) => pair.comparable && pair.scoreDelta > 0).length
  const originalSuccesses = base.systems.original.successes
  const positivePair = positivePairs >= lock.gate.minimumPositivePairs
  const originalHasSuccess = originalSuccesses >= lock.gate.minimumOriginalSuccesses
  const originalMeanNonRegression = base.systems.original.meanScore >= base.systems["no-skill"].meanScore
  const passed = base.passed && positivePair && originalHasSuccess && originalMeanNonRegression
  return {
    ...base,
    schemaVersion: "skill-ir-method-case-calibration-gate/v1",
    passed,
    counts: { ...base.counts, positivePairs, originalSuccesses },
    gates: { ...base.gates, positivePair, originalHasSuccess, originalMeanNonRegression },
    interpretation: { ...base.interpretation, baseIrAuditAllowed: passed },
  }
}
