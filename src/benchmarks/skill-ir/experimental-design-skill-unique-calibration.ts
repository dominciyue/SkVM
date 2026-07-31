import { lstat, readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import {
  ExperimentalDesignSkillUniqueContractAuditReportSchema,
  ExperimentalDesignSkillUniqueMaterializationAuditReportSchema,
} from "./experimental-design-skill-unique-audit.ts"
import {
  EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS,
  validateExperimentalDesignSkillUniqueTaskSet,
  validateExperimentalDesignSkillUniqueTaskSplitFreeze,
} from "./experimental-design-skill-unique-contract.ts"
import {
  evaluatePreIrCalibrationGate,
  type PreIrCalibrationGateLock,
  type PreIrCalibrationGateReport,
} from "./pre-ir-calibration-gate.ts"
import type { ScoredAgentRunRow } from "./scoring.ts"
import { sha256Bytes } from "./source-fixture.ts"

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const BenchmarkGuardSchema = z.discriminatedUnion("kind", [
  FrozenFileSchema.extend({ kind: z.literal("skill-unique-task-split-freeze") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("skill-unique-source-oracle-provenance") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("skill-unique-contract-audit") }).strict(),
  FrozenFileSchema.extend({ kind: z.literal("skill-unique-materialization-audit") }).strict(),
])

const SourceOracleProvenanceSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-skill-unique-source-oracle-provenance/v1"),
  capabilityId: z.literal("experimental-design-v2-skill-unique"),
  claims: z.tuple([
    FrozenFileSchema.extend({
      claimId: z.literal("independent-replication"),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      anchorSha256: Sha256Schema,
    }).strict(),
    FrozenFileSchema.extend({
      claimId: z.literal("pseudoreplication-analysis-alignment"),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      anchorSha256: Sha256Schema,
    }).strict(),
  ]),
  runtimeReadable: z.literal(false),
  taskVisible: z.literal(false),
}).strict()

export const ExperimentalDesignSkillUniqueCalibrationLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-skill-unique-calibration-lock/v1"),
  status: z.literal("preregistered"),
  calibrationId: z.literal("experimental-design-skill-unique-pi-development-v1"),
  methodEvidence: z.literal(false),
  corpus: z.literal("pilot"),
  skillId: z.literal("experimental-design-v2-skill-unique"),
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
      kind: z.literal("bun-source-skvm"),
      bunVersion: z.literal("1.3.14"),
      piResolution: z.literal("ascii-node-modules-junction"),
      asciiLinkName: z.literal("skvm-node-modules-pi-0.67.68"),
      sourceEntrypoint: FrozenFileSchema,
    }).strict(),
    orchestration: z.array(FrozenFileSchema).length(5),
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
      z.literal(EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS[0]),
      z.literal(EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS[1]),
    ]),
    repetitions: z.literal(2),
    expectedRows: z.literal(8),
    expectedPairs: z.literal(4),
  }).strict(),
  qualification: z.object({
    system: z.literal("original"),
    taskId: z.literal(EXPERIMENTAL_DESIGN_SKILL_UNIQUE_DEVELOPMENT_TASK_IDS[1]),
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
  const kinds = lock.benchmarkGuards.map((guard) => guard.kind)
  const expectedKinds = [
    "skill-unique-task-split-freeze",
    "skill-unique-source-oracle-provenance",
    "skill-unique-contract-audit",
    "skill-unique-materialization-audit",
  ]
  if (JSON.stringify(kinds) !== JSON.stringify(expectedKinds)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Skill-unique calibration guard order mismatch" })
  }
  const closurePaths = lock.sourceClosure.map((file) => file.path)
  if (new Set(closurePaths).size !== closurePaths.length || !closurePaths.includes(lock.frozenInputs.source.path)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Skill-unique source closure mismatch" })
  }
  if (lock.runtime.outerWatchdogMs < lock.runtime.taskTimeoutMs + lock.runtime.teardownGraceMs) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Skill-unique watchdog budget mismatch" })
  }
})

export type ExperimentalDesignSkillUniqueCalibrationLock = z.infer<
  typeof ExperimentalDesignSkillUniqueCalibrationLockSchema
>

async function verifyFrozenFile(
  rootDir: string,
  file: { path: string; sha256: string },
  label: string,
): Promise<Buffer> {
  const absolute = path.resolve(rootDir, ...file.path.split("/"))
  const relative = path.relative(path.resolve(rootDir), absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Skill-unique calibration ${label} escapes repository root: ${file.path}`)
  }
  const stat = await lstat(absolute)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Skill-unique calibration ${label} must be a regular file: ${file.path}`)
  }
  const bytes = await readFile(absolute)
  if (sha256Bytes(bytes) !== file.sha256) {
    throw new Error(`Skill-unique calibration ${label} digest mismatch for ${file.path}`)
  }
  return bytes
}

export async function validateExperimentalDesignSkillUniqueCalibrationLock(
  input: unknown,
  rootDir: string,
): Promise<ExperimentalDesignSkillUniqueCalibrationLock> {
  const lock = ExperimentalDesignSkillUniqueCalibrationLockSchema.parse(input)
  const [taskBytes, publicInterfaceBytes] = await Promise.all([
    verifyFrozenFile(rootDir, lock.frozenInputs.tasks, "tasks"),
    verifyFrozenFile(rootDir, lock.frozenInputs.publicInterface, "public interface"),
    ...Object.entries(lock.frozenInputs)
      .filter(([label]) => label !== "tasks" && label !== "publicInterface")
      .map(([label, file]) => verifyFrozenFile(rootDir, file, label)),
    ...lock.sourceClosure.map((file) => verifyFrozenFile(rootDir, file, "source closure")),
    verifyFrozenFile(rootDir, lock.harness.packageJson, "package.json"),
    verifyFrozenFile(rootDir, lock.harness.bunLock, "bun.lock"),
    verifyFrozenFile(rootDir, lock.harness.adapterSource, "Pi adapter"),
    verifyFrozenFile(rootDir, lock.harness.execution.sourceEntrypoint, "source entrypoint"),
    ...lock.harness.orchestration.map((file) => verifyFrozenFile(rootDir, file, "orchestration")),
  ])
  validateExperimentalDesignSkillUniqueTaskSet(
    JSON.parse(taskBytes.toString("utf8")),
    "development",
    publicInterfaceBytes,
  )

  for (const guard of lock.benchmarkGuards) {
    const bytes = await verifyFrozenFile(rootDir, guard, guard.kind)
    const value = JSON.parse(bytes.toString("utf8")) as unknown
    if (guard.kind === "skill-unique-task-split-freeze") {
      const freeze = await validateExperimentalDesignSkillUniqueTaskSplitFreeze({ rootDir, freeze: value })
      if (freeze.development.path !== lock.frozenInputs.tasks.path) {
        throw new Error("Skill-unique calibration split freeze task mismatch")
      }
    } else if (guard.kind === "skill-unique-source-oracle-provenance") {
      const provenance = SourceOracleProvenanceSchema.parse(value)
      for (const claim of provenance.claims) {
        if (!lock.sourceClosure.some((file) => file.path === claim.path && file.sha256 === claim.sha256)) {
          throw new Error(`Skill-unique calibration source claim is outside source closure: ${claim.claimId}`)
        }
      }
    } else if (guard.kind === "skill-unique-contract-audit") {
      const report = ExperimentalDesignSkillUniqueContractAuditReportSchema.parse(value)
      if (report.status !== "passed" || report.counts.matched !== 18 || report.issues.length !== 0) {
        throw new Error("Skill-unique calibration contract audit did not pass 18/18")
      }
      const guardByKind = Object.fromEntries(lock.benchmarkGuards.map((item) => [item.kind, item]))
      const expectedInputs = {
        developmentTasksSha256: lock.frozenInputs.tasks.sha256,
        publicInterfaceSha256: lock.frozenInputs.publicInterface.sha256,
        splitFreezeSha256: guardByKind["skill-unique-task-split-freeze"]?.sha256,
        sourceProvenanceSha256: guardByKind["skill-unique-source-oracle-provenance"]?.sha256,
        contractImplementationSha256: lock.frozenInputs.contract.sha256,
        oracleImplementationSha256: lock.frozenInputs.oracle.sha256,
        evaluatorImplementationSha256: lock.frozenInputs.scorer.sha256,
        auditImplementationSha256: lock.frozenInputs.audit.sha256,
      }
      if (JSON.stringify(report.inputs) !== JSON.stringify(expectedInputs)) {
        throw new Error("Skill-unique calibration contract audit input binding mismatch")
      }
    } else {
      const report = ExperimentalDesignSkillUniqueMaterializationAuditReportSchema.parse(value)
      if (report.status !== "passed" || report.counts.passed !== 36 || report.issues.length !== 0) {
        throw new Error("Skill-unique calibration materialization audit did not pass 36/36")
      }
    }
  }

  const packageJson = JSON.parse(await readFile(path.resolve(rootDir, lock.harness.packageJson.path), "utf8")) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const declared = packageJson.dependencies?.["@mariozechner/pi-coding-agent"]
    ?? packageJson.devDependencies?.["@mariozechner/pi-coding-agent"]
  if (declared !== lock.harness.adapterVersion) {
    throw new Error("Skill-unique calibration declared Pi version mismatch")
  }
  if (Bun.version !== lock.harness.execution.bunVersion) {
    throw new Error("Skill-unique calibration Bun version mismatch")
  }
  const installed = JSON.parse(await readFile(
    path.resolve(rootDir, lock.harness.installedPackageJson),
    "utf8",
  )) as { version?: string }
  if (installed.version !== lock.harness.adapterVersion) {
    throw new Error("Skill-unique calibration installed Pi version mismatch")
  }
  const executable = await lstat(path.resolve(rootDir, lock.harness.executable))
  if (!executable.isFile() || executable.isSymbolicLink()) {
    throw new Error("Skill-unique calibration Pi executable must be a regular file")
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
    throw new Error("Skill-unique calibration corpus lifecycle or source identity mismatch")
  }
  return lock
}

export async function readAndValidateExperimentalDesignSkillUniqueCalibrationLock(input: {
  rootDir: string
  lockPath: string
}): Promise<ExperimentalDesignSkillUniqueCalibrationLock> {
  return validateExperimentalDesignSkillUniqueCalibrationLock(
    JSON.parse(await readFile(path.resolve(input.lockPath), "utf8")),
    path.resolve(input.rootDir),
  )
}

function toGenericGateLock(lock: ExperimentalDesignSkillUniqueCalibrationLock): PreIrCalibrationGateLock {
  return {
    calibrationId: lock.calibrationId,
    skillId: lock.skillId,
    model: lock.model,
    adapter: { id: lock.harness.adapter, version: lock.harness.adapterVersion },
    matrix: lock.matrix,
    gate: lock.gate,
  }
}

export type ExperimentalDesignSkillUniqueCalibrationGateReport = Omit<
  PreIrCalibrationGateReport,
  "schemaVersion" | "passed" | "gates" | "interpretation"
> & {
  schemaVersion: "skill-ir-experimental-design-skill-unique-calibration-gate/v1"
  passed: boolean
  taskOriginalSuccess: Record<string, boolean>
  gates: PreIrCalibrationGateReport["gates"] & { eachTaskOriginalSuccess: boolean }
  interpretation: PreIrCalibrationGateReport["interpretation"] & { baseIrAuditAllowed: boolean }
}

export function evaluateExperimentalDesignSkillUniqueCalibrationGate(
  rows: ScoredAgentRunRow[],
  lock: ExperimentalDesignSkillUniqueCalibrationLock,
): ExperimentalDesignSkillUniqueCalibrationGateReport {
  const generic = evaluatePreIrCalibrationGate(rows, toGenericGateLock(lock))
  const taskOriginalSuccess = Object.fromEntries(lock.matrix.taskIds.map((taskId) => [
    taskId,
    rows.some((row) => row.task === taskId && row.system === "original" && row.success
      && row.runStatus === "ok" && row.failureType !== "infrastructure"),
  ]))
  const eachTaskOriginalSuccess = !lock.gate.requireEachTaskOriginalSuccess
    || Object.values(taskOriginalSuccess).every(Boolean)
  const passed = generic.passed && eachTaskOriginalSuccess
  return {
    ...generic,
    schemaVersion: "skill-ir-experimental-design-skill-unique-calibration-gate/v1",
    passed,
    taskOriginalSuccess,
    gates: { ...generic.gates, eachTaskOriginalSuccess },
    interpretation: { ...generic.interpretation, baseIrAuditAllowed: passed },
  }
}
