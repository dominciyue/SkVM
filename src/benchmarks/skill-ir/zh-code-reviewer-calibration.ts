import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import {
  ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS,
  validateZhCodeReviewerTaskSet,
  validateZhCodeReviewerTaskSplitFreeze,
} from "./zh-code-reviewer-contract.ts"
import { ZhCodeReviewerContractAuditReportSchema } from "./zh-code-reviewer-contract-audit.ts"
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
  FrozenFileSchema.extend({ kind: z.literal("zh-code-reviewer-task-split-freeze") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("zh-code-reviewer-source-oracle-provenance") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("zh-code-reviewer-contract-audit") }).strict(),
])
const SourceProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-code-reviewer-source-oracle-provenance/v1"),
  skillId: z.literal("zh-code-reviewer"),
  claims: z.array(FrozenFileSchema.extend({
    claimId: z.enum(["review-dimensions", "structured-report", "language-boundary"]),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    anchorSha256: Sha256Schema,
  }).strict()).length(3),
  runtimeReadable: z.literal(false),
  taskVisible: z.literal(false),
}).strict()

export const ZhCodeReviewerCalibrationLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-zh-code-reviewer-calibration-lock/v1"),
  status: z.literal("preregistered"),
  calibrationId: z.literal("zh-code-reviewer-pi-direct-cli-short-path-development-v1"),
  methodEvidence: z.literal(false),
  corpus: z.literal("pilot"),
  skillId: z.literal("zh-code-reviewer"),
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
  sourceClosure: z.tuple([FrozenFileSchema, FrozenFileSchema]),
  benchmarkGuards: z.tuple([BenchmarkGuardSchema, BenchmarkGuardSchema, BenchmarkGuardSchema]),
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
      outputRoot: z.literal("results/skill-ir/zcr-pi-v1"),
      maximumWorkDirLength: z.literal(220),
    }).strict(),
    orchestration: z.tuple([
      FrozenFileSchema, FrozenFileSchema, FrozenFileSchema,
      FrozenFileSchema, FrozenFileSchema, FrozenFileSchema,
    ]),
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
    taskIds: z.tuple([
      z.literal(ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS[0]),
      z.literal(ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS[1]),
    ]),
    repetitions: z.literal(2),
    expectedRows: z.literal(8),
    expectedPairs: z.literal(4),
  }).strict(),
  qualification: z.object({
    system: z.literal("original"),
    taskId: z.literal(ZH_CODE_REVIEWER_DEVELOPMENT_TASK_IDS[0]),
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
  const kinds = lock.benchmarkGuards.map((entry) => entry.kind)
  if (JSON.stringify(kinds) !== JSON.stringify([
    "zh-code-reviewer-task-split-freeze",
    "zh-code-reviewer-source-oracle-provenance",
    "zh-code-reviewer-contract-audit",
  ])) context.addIssue({ code: z.ZodIssueCode.custom, message: "reviewer guard order mismatch" })
  if (new Set(lock.sourceClosure.map((entry) => entry.path)).size !== 2
    || !lock.sourceClosure.some((entry) => entry.path === lock.frozenInputs.source.path)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "reviewer source closure mismatch" })
  }
  if (lock.runtime.outerWatchdogMs < lock.runtime.taskTimeoutMs + lock.runtime.teardownGraceMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "reviewer watchdog budget mismatch" })
  }
})

export type ZhCodeReviewerCalibrationLock = z.infer<typeof ZhCodeReviewerCalibrationLockSchema>

async function verifyFrozenFile(rootDir: string, file: { path: string; sha256: string }, label: string): Promise<Buffer> {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...file.path.split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Reviewer calibration ${label} escapes repository root`)
  }
  const stat = await lstat(absolute)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Reviewer calibration ${label} must be a regular file`)
  const bytes = await readFile(absolute)
  if (sha256Bytes(bytes) !== file.sha256) {
    throw new Error(`Reviewer calibration ${label} digest mismatch for ${file.path}`)
  }
  return bytes
}

export async function validateZhCodeReviewerCalibrationLock(
  input: unknown,
  rootDir: string,
): Promise<ZhCodeReviewerCalibrationLock> {
  const lock = ZhCodeReviewerCalibrationLockSchema.parse(input)
  const taskBytes = await verifyFrozenFile(rootDir, lock.frozenInputs.tasks, "tasks")
  const interfaceBytes = await verifyFrozenFile(rootDir, lock.frozenInputs.publicInterface, "public interface")
  for (const [label, file] of Object.entries(lock.frozenInputs)) {
    if (label !== "tasks" && label !== "publicInterface") await verifyFrozenFile(rootDir, file, label)
  }
  for (const file of lock.sourceClosure) await verifyFrozenFile(rootDir, file, "source closure")
  for (const file of lock.benchmarkGuards) await verifyFrozenFile(rootDir, file, file.kind)
  await verifyFrozenFile(rootDir, lock.harness.packageJson, "package.json")
  await verifyFrozenFile(rootDir, lock.harness.bunLock, "bun.lock")
  await verifyFrozenFile(rootDir, lock.harness.adapterSource, "Pi adapter")
  await verifyFrozenFile(rootDir, lock.harness.execution.piCli, "Pi CLI")
  await verifyFrozenFile(rootDir, lock.harness.execution.probe, "Pi probe")
  await verifyFrozenFile(rootDir, lock.harness.execution.sourceEntrypoint, "source entrypoint")
  for (const file of lock.harness.orchestration) await verifyFrozenFile(rootDir, file, "orchestration")

  validateZhCodeReviewerTaskSet(JSON.parse(taskBytes.toString("utf8")), "development", interfaceBytes)
  const guards = Object.fromEntries(lock.benchmarkGuards.map((entry) => [entry.kind, entry]))
  for (const guard of lock.benchmarkGuards) {
    const value = JSON.parse((await verifyFrozenFile(rootDir, guard, guard.kind)).toString("utf8")) as unknown
    if (guard.kind === "zh-code-reviewer-task-split-freeze") {
      const freeze = await validateZhCodeReviewerTaskSplitFreeze({ rootDir, freeze: value })
      if (freeze.development.path !== lock.frozenInputs.tasks.path) throw new Error("Reviewer split task mismatch")
    } else if (guard.kind === "zh-code-reviewer-source-oracle-provenance") {
      const provenance = SourceProvenanceSchema.parse(value)
      for (const claim of provenance.claims) {
        if (!lock.sourceClosure.some((entry) => entry.path === claim.path && entry.sha256 === claim.sha256)) {
          throw new Error(`Reviewer source claim outside closure: ${claim.claimId}`)
        }
      }
    } else {
      const report = ZhCodeReviewerContractAuditReportSchema.parse(value)
      if (report.status !== "passed" || report.counts.matched !== 18 || report.issues.length !== 0) {
        throw new Error("Reviewer contract audit did not pass 18/18")
      }
      const expectedInputs = {
        developmentTasksSha256: lock.frozenInputs.tasks.sha256,
        publicInterfaceSha256: lock.frozenInputs.publicInterface.sha256,
        taskSplitFreezeSha256: guards["zh-code-reviewer-task-split-freeze"]?.sha256,
        sourceProvenanceSha256: guards["zh-code-reviewer-source-oracle-provenance"]?.sha256,
        contractImplementationSha256: lock.frozenInputs.contract.sha256,
        oracleImplementationSha256: lock.frozenInputs.oracle.sha256,
        evaluatorImplementationSha256: lock.frozenInputs.scorer.sha256,
        auditImplementationSha256: lock.frozenInputs.audit.sha256,
      }
      if (JSON.stringify(report.inputs) !== JSON.stringify(expectedInputs)) {
        throw new Error("Reviewer audit input binding mismatch")
      }
    }
  }

  const packageJson = JSON.parse(await readFile(path.resolve(rootDir, lock.harness.packageJson.path), "utf8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const declared = packageJson.dependencies?.["@mariozechner/pi-coding-agent"]
    ?? packageJson.devDependencies?.["@mariozechner/pi-coding-agent"]
  if (declared !== lock.harness.adapterVersion || Bun.version !== lock.harness.execution.bunVersion) {
    throw new Error("Reviewer Pi or Bun version drift")
  }
  const installed = JSON.parse(await readFile(path.resolve(rootDir, lock.harness.installedPackageJson), "utf8")) as {
    version?: string
  }
  if (installed.version !== lock.harness.adapterVersion) throw new Error("Reviewer installed Pi version drift")
  const probe = PiPackageExecutionProbeReportSchema.parse(JSON.parse(await readFile(
    path.resolve(rootDir, lock.harness.execution.probe.path), "utf8",
  )))
  if (probe.status !== "passed" || probe.node?.version !== lock.harness.execution.nodeVersion
    || probe.node.executableSha256 !== lock.harness.execution.nodeExecutableSha256
    || probe.pi?.version !== lock.harness.adapterVersion || probe.pi.cliSha256 !== lock.harness.execution.piCli.sha256) {
    throw new Error("Reviewer Pi probe binding mismatch")
  }
  const node = Bun.which(lock.harness.execution.nodeCommand)
  if (!node || sha256Bytes(await readFile(node)) !== lock.harness.execution.nodeExecutableSha256) {
    throw new Error("Reviewer Node executable drift")
  }

  const manifest = JSON.parse(await readFile(path.resolve(
    rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json",
  ), "utf8")) as { skills?: Array<Record<string, unknown>> }
  const skill = manifest.skills?.find((entry) => entry.id === lock.skillId)
  if (skill?.status !== "tasks-authored" || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path || skill.irPath !== undefined) {
    throw new Error("Reviewer corpus lifecycle or identity mismatch")
  }
  return lock
}

export async function readAndValidateZhCodeReviewerCalibrationLock(input: {
  rootDir: string
  lockPath: string
}): Promise<ZhCodeReviewerCalibrationLock> {
  return validateZhCodeReviewerCalibrationLock(
    JSON.parse(await readFile(path.resolve(input.lockPath), "utf8")),
    path.resolve(input.rootDir),
  )
}

function genericLock(lock: ZhCodeReviewerCalibrationLock): PreIrCalibrationGateLock {
  return {
    calibrationId: lock.calibrationId,
    skillId: lock.skillId,
    model: lock.model,
    adapter: { id: lock.harness.adapter, version: lock.harness.adapterVersion },
    matrix: lock.matrix,
    gate: lock.gate,
  }
}

export type ZhCodeReviewerCalibrationGateReport = Omit<
  PreIrCalibrationGateReport,
  "schemaVersion" | "passed" | "counts" | "gates" | "interpretation"
> & {
  schemaVersion: "skill-ir-zh-code-reviewer-calibration-gate/v1"
  passed: boolean
  counts: PreIrCalibrationGateReport["counts"] & { positivePairs: number; originalSuccesses: number }
  gates: PreIrCalibrationGateReport["gates"] & {
    positivePair: boolean
    originalHasSuccess: boolean
    originalMeanNonRegression: boolean
  }
  interpretation: PreIrCalibrationGateReport["interpretation"] & { baseIrAuditAllowed: boolean }
}

export function evaluateZhCodeReviewerCalibrationGate(
  rows: ScoredAgentRunRow[],
  lock: ZhCodeReviewerCalibrationLock,
): ZhCodeReviewerCalibrationGateReport {
  const base = evaluatePreIrCalibrationGate(rows, genericLock(lock))
  const positivePairs = base.pairs.filter((pair) => pair.comparable && pair.scoreDelta > 0).length
  const originalSuccesses = base.systems.original.successes
  const positivePair = positivePairs >= lock.gate.minimumPositivePairs
  const originalHasSuccess = originalSuccesses >= lock.gate.minimumOriginalSuccesses
  const originalMeanNonRegression = base.systems.original.meanScore >= base.systems["no-skill"].meanScore
  const passed = base.passed && positivePair && originalHasSuccess && originalMeanNonRegression
  return {
    ...base,
    schemaVersion: "skill-ir-zh-code-reviewer-calibration-gate/v1",
    passed,
    counts: { ...base.counts, positivePairs, originalSuccesses },
    gates: { ...base.gates, positivePair, originalHasSuccess, originalMeanNonRegression },
    interpretation: { ...base.interpretation, baseIrAuditAllowed: passed },
  }
}
