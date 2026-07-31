import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import { ApiTesterContractAuditReportSchema } from "./api-tester-contract-audit.ts"
import {
  API_TESTER_DEVELOPMENT_TASK_IDS,
  validateApiTesterTaskSet,
  validateApiTesterTaskSplitFreeze,
} from "./api-tester-contract.ts"
import { ApiTesterMaterializationAuditReportSchema } from "./api-tester-materialization-audit.ts"
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
  FrozenFileSchema.extend({ kind: z.literal("api-tester-task-split-freeze") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("api-tester-source-oracle-provenance") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("api-tester-contract-audit") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("api-tester-materialization-audit") }).strict(),
])
const SourceProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-source-oracle-provenance/v1"),
  skillId: z.literal("api-tester"),
  claims: z.array(FrozenFileSchema.extend({
    claimId: z.string().min(1),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    anchorSha256: Sha256Schema,
  }).strict()).length(4),
  runtimeReadable: z.literal(false),
  taskVisible: z.literal(false),
}).strict()

export const ApiTesterCalibrationLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-calibration-lock/v1"),
  status: z.literal("preregistered"),
  calibrationId: z.literal("api-tester-pi-direct-cli-short-path-development-v1"),
  methodEvidence: z.literal(false),
  corpus: z.literal("pilot"),
  skillId: z.literal("api-tester"),
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
  benchmarkGuards: z.tuple([
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
      outputRoot: z.literal("results/skill-ir/at-pi-v1"),
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
      z.literal(API_TESTER_DEVELOPMENT_TASK_IDS[0]),
      z.literal(API_TESTER_DEVELOPMENT_TASK_IDS[1]),
    ]),
    repetitions: z.literal(2),
    expectedRows: z.literal(8),
    expectedPairs: z.literal(4),
  }).strict(),
  qualification: z.object({
    system: z.literal("original"),
    taskId: z.literal(API_TESTER_DEVELOPMENT_TASK_IDS[0]),
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
    requireEachTaskOriginalSuccess: z.literal(true),
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
    "api-tester-task-split-freeze",
    "api-tester-source-oracle-provenance",
    "api-tester-contract-audit",
    "api-tester-materialization-audit",
  ])) context.addIssue({ code: z.ZodIssueCode.custom, message: "API tester guard order mismatch" })
  if (new Set(lock.sourceClosure.map((entry) => entry.path)).size !== 2
    || !lock.sourceClosure.some((entry) => entry.path === lock.frozenInputs.source.path)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "API tester source closure mismatch" })
  }
  if (lock.runtime.outerWatchdogMs < lock.runtime.taskTimeoutMs + lock.runtime.teardownGraceMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "API tester watchdog budget mismatch" })
  }
})

export type ApiTesterCalibrationLock = z.infer<typeof ApiTesterCalibrationLockSchema>

async function verifyFrozenFile(rootDir: string, file: { path: string; sha256: string }, label: string): Promise<Buffer> {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...file.path.split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`API tester calibration ${label} escapes repository root`)
  }
  const stat = await lstat(absolute)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`API tester calibration ${label} must be a regular file`)
  const bytes = await readFile(absolute)
  if (sha256Bytes(bytes) !== file.sha256) throw new Error(`API tester calibration ${label} digest mismatch for ${file.path}`)
  return bytes
}

export async function validateApiTesterCalibrationLock(input: unknown, rootDir: string): Promise<ApiTesterCalibrationLock> {
  const lock = ApiTesterCalibrationLockSchema.parse(input)
  const [taskBytes, interfaceBytes] = await Promise.all([
    verifyFrozenFile(rootDir, lock.frozenInputs.tasks, "tasks"),
    verifyFrozenFile(rootDir, lock.frozenInputs.publicInterface, "public interface"),
    ...Object.entries(lock.frozenInputs)
      .filter(([label]) => label !== "tasks" && label !== "publicInterface")
      .map(([label, file]) => verifyFrozenFile(rootDir, file, label)),
    ...lock.sourceClosure.map((file) => verifyFrozenFile(rootDir, file, "source closure")),
    ...lock.benchmarkGuards.map((file) => verifyFrozenFile(rootDir, file, file.kind)),
    verifyFrozenFile(rootDir, lock.harness.packageJson, "package.json"),
    verifyFrozenFile(rootDir, lock.harness.bunLock, "bun.lock"),
    verifyFrozenFile(rootDir, lock.harness.adapterSource, "Pi adapter"),
    verifyFrozenFile(rootDir, lock.harness.execution.piCli, "Pi CLI"),
    verifyFrozenFile(rootDir, lock.harness.execution.probe, "Pi probe"),
    verifyFrozenFile(rootDir, lock.harness.execution.sourceEntrypoint, "source entrypoint"),
    ...lock.harness.orchestration.map((file) => verifyFrozenFile(rootDir, file, "orchestration")),
  ])
  validateApiTesterTaskSet(JSON.parse(taskBytes.toString("utf8")), "development", interfaceBytes)

  const guards = Object.fromEntries(lock.benchmarkGuards.map((entry) => [entry.kind, entry]))
  for (const guard of lock.benchmarkGuards) {
    const value = JSON.parse((await verifyFrozenFile(rootDir, guard, guard.kind)).toString("utf8")) as unknown
    if (guard.kind === "api-tester-task-split-freeze") {
      const freeze = await validateApiTesterTaskSplitFreeze({ rootDir, freeze: value })
      if (freeze.development.path !== lock.frozenInputs.tasks.path) throw new Error("API tester split task mismatch")
    } else if (guard.kind === "api-tester-source-oracle-provenance") {
      const provenance = SourceProvenanceSchema.parse(value)
      for (const claim of provenance.claims) {
        if (!lock.sourceClosure.some((entry) => entry.path === claim.path && entry.sha256 === claim.sha256)) {
          throw new Error(`API tester source claim outside closure: ${claim.claimId}`)
        }
      }
    } else if (guard.kind === "api-tester-contract-audit") {
      const report = ApiTesterContractAuditReportSchema.parse(value)
      if (report.status !== "passed" || report.counts.matched !== 18 || report.issues.length !== 0) {
        throw new Error("API tester contract audit did not pass 18/18")
      }
      const expectedInputs = {
        developmentTasksSha256: lock.frozenInputs.tasks.sha256,
        publicInterfaceSha256: lock.frozenInputs.publicInterface.sha256,
        taskSplitFreezeSha256: guards["api-tester-task-split-freeze"]?.sha256,
        sourceProvenanceSha256: guards["api-tester-source-oracle-provenance"]?.sha256,
        contractImplementationSha256: lock.frozenInputs.contract.sha256,
        oracleImplementationSha256: lock.frozenInputs.oracle.sha256,
        evaluatorImplementationSha256: lock.frozenInputs.scorer.sha256,
        auditImplementationSha256: lock.frozenInputs.audit.sha256,
      }
      if (JSON.stringify(report.inputs) !== JSON.stringify(expectedInputs)) throw new Error("API tester audit input binding mismatch")
    } else {
      const report = ApiTesterMaterializationAuditReportSchema.parse(value)
      if (report.status !== "passed" || report.counts.passed !== 36 || report.issues.length !== 0) {
        throw new Error("API tester materialization audit did not pass 36/36")
      }
    }
  }

  const packageJson = JSON.parse(await readFile(path.resolve(rootDir, lock.harness.packageJson.path), "utf8")) as {
    dependencies?: Record<string, string>; devDependencies?: Record<string, string>
  }
  const declared = packageJson.dependencies?.["@mariozechner/pi-coding-agent"]
    ?? packageJson.devDependencies?.["@mariozechner/pi-coding-agent"]
  if (declared !== lock.harness.adapterVersion || Bun.version !== lock.harness.execution.bunVersion) {
    throw new Error("API tester Pi or Bun version drift")
  }
  const installed = JSON.parse(await readFile(path.resolve(rootDir, lock.harness.installedPackageJson), "utf8")) as { version?: string }
  if (installed.version !== lock.harness.adapterVersion) throw new Error("API tester installed Pi version drift")
  const probe = PiPackageExecutionProbeReportSchema.parse(JSON.parse(await readFile(
    path.resolve(rootDir, lock.harness.execution.probe.path), "utf8",
  )))
  if (probe.status !== "passed" || probe.node?.version !== lock.harness.execution.nodeVersion
    || probe.node.executableSha256 !== lock.harness.execution.nodeExecutableSha256
    || probe.pi?.version !== lock.harness.adapterVersion || probe.pi.cliSha256 !== lock.harness.execution.piCli.sha256) {
    throw new Error("API tester Pi probe binding mismatch")
  }
  const node = Bun.which(lock.harness.execution.nodeCommand)
  if (!node || sha256Bytes(await readFile(node)) !== lock.harness.execution.nodeExecutableSha256) {
    throw new Error("API tester Node executable drift")
  }

  const manifest = JSON.parse(await readFile(path.resolve(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"), "utf8")) as {
    skills?: Array<Record<string, unknown>>
  }
  const skill = manifest.skills?.find((entry) => entry.id === lock.skillId)
  if (skill?.status !== "tasks-authored" || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path || skill.irPath !== undefined) {
    throw new Error("API tester corpus lifecycle or identity mismatch")
  }
  return lock
}

export async function readAndValidateApiTesterCalibrationLock(input: { rootDir: string; lockPath: string }) {
  return validateApiTesterCalibrationLock(
    JSON.parse(await readFile(path.resolve(input.lockPath), "utf8")), path.resolve(input.rootDir),
  )
}

function genericLock(lock: ApiTesterCalibrationLock): PreIrCalibrationGateLock {
  return {
    calibrationId: lock.calibrationId,
    skillId: lock.skillId,
    model: lock.model,
    adapter: { id: lock.harness.adapter, version: lock.harness.adapterVersion },
    matrix: lock.matrix,
    gate: lock.gate,
  }
}

export type ApiTesterCalibrationGateReport = Omit<
  PreIrCalibrationGateReport, "schemaVersion" | "passed" | "gates" | "interpretation"
> & {
  schemaVersion: "skill-ir-api-tester-calibration-gate/v1"
  passed: boolean
  taskOriginalSuccess: Record<string, boolean>
  gates: PreIrCalibrationGateReport["gates"] & { eachTaskOriginalSuccess: boolean }
  interpretation: PreIrCalibrationGateReport["interpretation"] & { baseIrAuditAllowed: boolean }
}

export function evaluateApiTesterCalibrationGate(
  rows: ScoredAgentRunRow[], lock: ApiTesterCalibrationLock,
): ApiTesterCalibrationGateReport {
  const base = evaluatePreIrCalibrationGate(rows, genericLock(lock))
  const taskOriginalSuccess = Object.fromEntries(lock.matrix.taskIds.map((taskId) => [
    taskId,
    rows.some((row) => row.task === taskId && row.system === "original" && row.success
      && row.runStatus === "ok" && row.failureType !== "infrastructure"),
  ]))
  const eachTaskOriginalSuccess = Object.values(taskOriginalSuccess).every(Boolean)
  const passed = base.passed && eachTaskOriginalSuccess
  return {
    ...base,
    schemaVersion: "skill-ir-api-tester-calibration-gate/v1",
    passed,
    taskOriginalSuccess,
    gates: { ...base.gates, eachTaskOriginalSuccess },
    interpretation: { ...base.interpretation, baseIrAuditAllowed: passed },
  }
}
