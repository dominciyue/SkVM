import { lstat, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"
import { z } from "zod"
import { BenchmarkContractAuditManifestSchema } from "./benchmark-contract-audit.ts"
import {
  MethodCaseTaskSplitFreezeSchema,
  verifyMethodCaseTaskSplitFreeze,
} from "./method-case-task-split-freeze.ts"
import { sha256Bytes } from "./source-fixture.ts"
import {
  evaluatePreIrCalibrationGate,
  type PreIrCalibrationGateLock,
  type PreIrCalibrationGateReport,
} from "./pre-ir-calibration-gate.ts"
import type { ScoredAgentRunRow } from "./scoring.ts"

const SafeRelativePathSchema = z.string().min(1).refine((value) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
})
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u)
const FrozenFileSchema = z.object({ path: SafeRelativePathSchema, sha256: DigestSchema }).strict()

export const PublicContractCalibrationLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-contract-calibration-lock/v1"),
  status: z.literal("preregistered"),
  calibrationId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/u),
  methodEvidence: z.literal(false),
  corpus: z.literal("pilot"),
  skillId: z.string().min(1),
  frozenInputs: z.object({
    source: FrozenFileSchema,
    tasks: FrozenFileSchema,
    publicContract: FrozenFileSchema,
    publicContractSourceAudit: FrozenFileSchema,
    scorer: FrozenFileSchema,
    taskSplitFreeze: FrozenFileSchema,
    contractAuditManifest: FrozenFileSchema,
    contractAuditReport: FrozenFileSchema,
  }).strict(),
  model: z.object({
    route: z.literal("xty/gpt-5.6-sol"),
    family: z.literal("gpt"),
  }).strict(),
  adapter: z.object({ id: z.literal("pi"), version: z.literal("0.67.68") }).strict(),
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
    adapterConfig: z.literal("managed"),
    taskTimeoutMs: z.literal(300000),
    maxSteps: z.literal(30),
    teardownGraceMs: z.literal(60000),
    outerWatchdogMs: z.literal(360000),
    explicitEvaluatorLoad: z.literal(true),
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
    createsBaseIr: z.literal(false),
    permitsHeldOut: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    tokenEvidence: z.literal(false),
  }).strict(),
  prohibited: z.tuple([
    z.literal("held-out execution"),
    z.literal("scorer retuning after model results"),
    z.literal("base IR construction before gate pass"),
    z.literal("optimization or token claim from calibration"),
  ]),
}).strict().superRefine((lock, context) => {
  if (new Set(lock.matrix.taskIds).size !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "calibration task ids must be unique" })
  }
  if (!lock.matrix.taskIds.includes(lock.qualification.taskId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "calibration qualification task mismatch" })
  }
  if (lock.runtime.outerWatchdogMs < lock.runtime.taskTimeoutMs + lock.runtime.teardownGraceMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "calibration watchdog budget mismatch" })
  }
})

export type PublicContractCalibrationLock = z.infer<typeof PublicContractCalibrationLockSchema>

export const PublicContractCalibrationLockV2Schema = z.object({
  schemaVersion: z.literal("skill-ir-public-contract-calibration-lock/v2"),
  status: z.literal("preregistered"),
  calibrationId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/u),
  methodEvidence: z.literal(false),
  corpus: z.literal("pilot"),
  skillId: z.string().min(1),
  frozenInputs: z.object({
    source: FrozenFileSchema,
    tasks: FrozenFileSchema,
    publicContract: FrozenFileSchema,
    publicContractSourceAudit: FrozenFileSchema,
    scorer: FrozenFileSchema,
    scorerDependencies: z.array(FrozenFileSchema).min(1).refine(
      (files) => new Set(files.map((file) => file.path)).size === files.length,
      "scorer dependency paths must be unique",
    ),
    taskSplitFreeze: FrozenFileSchema,
    contractAuditManifest: FrozenFileSchema,
    contractAuditReport: FrozenFileSchema,
  }).strict(),
  model: z.object({
    route: z.literal("xty/gpt-5.6-sol"),
    family: z.literal("gpt"),
  }).strict(),
  adapter: z.object({ id: z.literal("pi"), version: z.literal("0.67.68") }).strict(),
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
    adapterConfig: z.literal("managed"),
    taskTimeoutMs: z.literal(300000),
    maxSteps: z.literal(30),
    teardownGraceMs: z.literal(60000),
    outerWatchdogMs: z.literal(360000),
    explicitEvaluatorLoad: z.literal(true),
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
    createsBaseIr: z.literal(false),
    permitsHeldOut: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    tokenEvidence: z.literal(false),
  }).strict(),
  prohibited: z.tuple([
    z.literal("held-out execution"),
    z.literal("scorer retuning after model results"),
    z.literal("base IR construction before gate pass"),
    z.literal("optimization or token claim from calibration"),
  ]),
}).strict().superRefine((lock, context) => {
  if (new Set(lock.matrix.taskIds).size !== 2) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "calibration task ids must be unique" })
  }
  if (!lock.matrix.taskIds.includes(lock.qualification.taskId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "calibration qualification task mismatch" })
  }
  if (lock.runtime.outerWatchdogMs < lock.runtime.taskTimeoutMs + lock.runtime.teardownGraceMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "calibration watchdog budget mismatch" })
  }
})

export type PublicContractCalibrationLockV2 = z.infer<typeof PublicContractCalibrationLockV2Schema>
export type AnyPublicContractCalibrationLock = PublicContractCalibrationLock | PublicContractCalibrationLockV2

export async function collectDirectScorerDependencies(rootDir: string, scorerPath: string): Promise<string[]> {
  const root = await realpath(path.resolve(rootDir))
  const scorer = path.resolve(root, ...SafeRelativePathSchema.parse(scorerPath).split("/"))
  const source = await readFile(scorer, "utf8")
  const file = ts.createSourceFile(scorer, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const specifiers: string[] = []
  for (const statement of file.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      && statement.moduleSpecifier
      && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text.startsWith(".")
    ) {
      specifiers.push(statement.moduleSpecifier.text)
    }
  }
  const dependencies = await Promise.all(specifiers.map(async (specifier) => {
    const candidate = path.resolve(path.dirname(scorer), specifier)
    const resolved = await realpath(candidate)
    const relative = path.relative(root, resolved)
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
      throw new Error(`scorer dependency escapes repository root: ${specifier}`)
    }
    if (!(await lstat(resolved)).isFile()) throw new Error(`scorer dependency must be a regular file: ${specifier}`)
    return relative.split(path.sep).join("/")
  }))
  return [...new Set(dependencies)].sort((left, right) => left.localeCompare(right, "en"))
}

async function readFrozenFile(
  rootDir: string,
  file: { path: string; sha256: string },
  label: string,
): Promise<Buffer> {
  const root = await realpath(path.resolve(rootDir))
  const candidate = path.resolve(root, ...file.path.split("/"))
  const stat = await lstat(candidate)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`)
  const resolved = await realpath(candidate)
  const relative = path.relative(root, resolved)
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} escapes repository root`)
  }
  const bytes = await readFile(resolved)
  if (sha256Bytes(bytes) !== file.sha256) throw new Error(`${label} digest mismatch for ${file.path}`)
  return bytes
}

export async function validatePublicContractCalibrationLock(
  input: unknown,
  rootDir: string,
): Promise<AnyPublicContractCalibrationLock> {
  const lock = z.union([PublicContractCalibrationLockSchema, PublicContractCalibrationLockV2Schema]).parse(input)
  const bytes = new Map<string, Buffer>()
  for (const [label, file] of Object.entries(lock.frozenInputs)) {
    if (Array.isArray(file)) continue
    bytes.set(label, await readFrozenFile(rootDir, file, label))
  }
  if (lock.schemaVersion === "skill-ir-public-contract-calibration-lock/v2") {
    for (const [index, file] of lock.frozenInputs.scorerDependencies.entries()) {
      await readFrozenFile(rootDir, file, `scorerDependencies[${index}]`)
    }
    const actual = await collectDirectScorerDependencies(rootDir, lock.frozenInputs.scorer.path)
    const declared = lock.frozenInputs.scorerDependencies.map((file) => file.path).sort((left, right) => left.localeCompare(right, "en"))
    if (JSON.stringify(actual) !== JSON.stringify(declared)) {
      throw new Error("calibration scorer dependency closure mismatch")
    }
  }

  const freeze = MethodCaseTaskSplitFreezeSchema.parse(JSON.parse(bytes.get("taskSplitFreeze")!.toString("utf8")))
  await verifyMethodCaseTaskSplitFreeze(rootDir, freeze)
  if (
    freeze.benchmarkId !== lock.skillId
    || freeze.developmentTasks.path !== lock.frozenInputs.tasks.path
    || freeze.developmentTasks.sha256 !== lock.frozenInputs.tasks.sha256
    || freeze.publicContract.path !== lock.frozenInputs.publicContract.path
    || freeze.publicContract.sha256 !== lock.frozenInputs.publicContract.sha256
    || freeze.publicContractSourceAudit.path !== lock.frozenInputs.publicContractSourceAudit.path
    || freeze.publicContractSourceAudit.sha256 !== lock.frozenInputs.publicContractSourceAudit.sha256
    || JSON.stringify(freeze.developmentTasks.taskIds) !== JSON.stringify(lock.matrix.taskIds)
    || freeze.heldoutTasks.taskIds.some((taskId) => lock.matrix.taskIds.includes(taskId))
    || !freeze.sourceClosure.some((entry) =>
      entry.path === lock.frozenInputs.source.path
    )
  ) {
    throw new Error("calibration task split or public source binding mismatch")
  }

  const auditManifest = BenchmarkContractAuditManifestSchema.parse(JSON.parse(
    bytes.get("contractAuditManifest")!.toString("utf8"),
  ))
  if (
    auditManifest.skillId !== lock.skillId
    || auditManifest.tasks.path !== lock.frozenInputs.tasks.path
    || auditManifest.tasks.sha256 !== lock.frozenInputs.tasks.sha256
    || auditManifest.scorer.path !== lock.frozenInputs.scorer.path
    || auditManifest.scorer.sha256 !== lock.frozenInputs.scorer.sha256
    || JSON.stringify(auditManifest.scope.taskIds) !== JSON.stringify(lock.matrix.taskIds)
  ) {
    throw new Error("calibration contract audit manifest binding mismatch")
  }
  const auditReport = JSON.parse(bytes.get("contractAuditReport")!.toString("utf8")) as {
    auditId?: string
    skillId?: string
    staticStatus?: string
    status?: string
    canaries?: Array<{ status?: string }>
    issues?: unknown[]
  }
  if (
    auditReport.auditId !== auditManifest.auditId
    || auditReport.skillId !== lock.skillId
    || auditReport.staticStatus !== "passed"
    || auditReport.status !== "passed"
    || auditReport.canaries?.length !== 30
    || auditReport.canaries.some((canary) => canary.status !== "matched")
    || auditReport.issues?.length !== 0
  ) {
    throw new Error("calibration requires a passed 30-canary contract audit")
  }

  const corpus = JSON.parse(await readFile(
    path.resolve(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
    "utf8",
  )) as { skills?: Array<Record<string, unknown>> }
  const skill = corpus.skills?.find((entry) => entry.id === lock.skillId)
  if (
    skill?.status !== "tasks-authored"
    || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.benchmarkContractAuditPath !== lock.frozenInputs.contractAuditManifest.path
    || skill.irPath !== undefined
  ) {
    throw new Error("calibration corpus lifecycle or identity mismatch")
  }
  return lock
}

export async function readAndValidatePublicContractCalibrationLock(input: {
  rootDir: string
  lockPath: string
  overrides?: { scorerSha256?: string }
}): Promise<AnyPublicContractCalibrationLock> {
  const raw = JSON.parse(await readFile(path.resolve(input.rootDir, input.lockPath), "utf8")) as Record<string, any>
  if (input.overrides?.scorerSha256) raw.frozenInputs.scorer.sha256 = input.overrides.scorerSha256
  return validatePublicContractCalibrationLock(raw, input.rootDir)
}

function genericGateLock(lock: AnyPublicContractCalibrationLock): PreIrCalibrationGateLock {
  return {
    calibrationId: lock.calibrationId,
    skillId: lock.skillId,
    model: lock.model,
    adapter: lock.adapter,
    matrix: lock.matrix,
    gate: lock.gate,
  }
}

export type PublicContractCalibrationGateReport = Omit<
  PreIrCalibrationGateReport,
  "schemaVersion" | "passed" | "counts" | "gates" | "interpretation"
> & {
  schemaVersion: "skill-ir-public-contract-calibration-gate/v1"
  passed: boolean
  counts: PreIrCalibrationGateReport["counts"] & { positivePairs: number; originalSuccesses: number }
  gates: PreIrCalibrationGateReport["gates"] & {
    positivePair: boolean
    originalHasSuccess: boolean
    originalMeanNonRegression: boolean
  }
  interpretation: PreIrCalibrationGateReport["interpretation"] & { baseIrAuditAllowed: boolean }
}

export function evaluatePublicContractCalibrationGate(
  rows: ScoredAgentRunRow[],
  lock: AnyPublicContractCalibrationLock,
): PublicContractCalibrationGateReport {
  const base = evaluatePreIrCalibrationGate(rows, genericGateLock(lock))
  const positivePairs = base.pairs.filter((pair) => pair.comparable && pair.scoreDelta > 0).length
  const originalSuccesses = base.systems.original.successes
  const positivePair = positivePairs >= lock.gate.minimumPositivePairs
  const originalHasSuccess = originalSuccesses >= lock.gate.minimumOriginalSuccesses
  const originalMeanNonRegression = base.systems.original.meanScore >= base.systems["no-skill"].meanScore
  const passed = base.passed && positivePair && originalHasSuccess && originalMeanNonRegression
  return {
    ...base,
    schemaVersion: "skill-ir-public-contract-calibration-gate/v1",
    passed,
    counts: { ...base.counts, positivePairs, originalSuccesses },
    gates: { ...base.gates, positivePair, originalHasSuccess, originalMeanNonRegression },
    interpretation: { ...base.interpretation, baseIrAuditAllowed: passed },
  }
}
