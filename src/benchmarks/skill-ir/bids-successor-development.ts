import { isDeepStrictEqual } from "node:util"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { z } from "zod"
import { SkillIRSchema } from "../../skill-ir/schema.ts"
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit.ts"
import { customEvaluators, registerCustomEvaluator, type CustomEvaluator } from "../../framework/types.ts"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import { BidsProspectiveConstructionReportSchema } from "./bids-prospective-construction.ts"
import {
  BidsSuccessorTaskSetSchema,
  buildBidsSuccessorPublicInterface,
} from "./bids-successor-contract.ts"
import {
  BidsSuccessorContractAuditReportSchema,
} from "./bids-successor-contract-audit.ts"
import {
  ExecutionEnvelopeSchema,
  ExecutionFailureClassificationSchema,
  type ExecutionEnvelope,
} from "./execution-resilience.ts"
import {
  buildRunPlanEntry,
  buildSkvmTaskJson,
  materializeCaseArtifacts,
  type RealAgentRunPlanEntry,
} from "./real-agent.ts"
import type { RealAgentRunArgs } from "./real-agent-run.ts"
import { sha256Bytes } from "./source-fixture.ts"

const LOCK_PATH = "benchmarks/skill-ir/pilots/bids/successor-v2/development-lock.json"

const PATHS = {
  corpusManifest: "benchmarks/skill-ir/corpus/corpora/pilot.json",
  tasks: "benchmarks/skill-ir/pilots/bids/successor-v2/development/tasks.json",
  publicContract: "benchmarks/skill-ir/pilots/bids/successor-v2/public-interface.json",
  resourceContract: "benchmarks/skill-ir/pilots/bids/resource-contract.json",
  scorer: "src/bench/evaluators/bids-successor-grade.ts",
  successorContractAudit: "results/skill-ir/bids-successor-contract-audit-v1.json",
  contributionReport: "results/skill-ir/bids-contribution-identifiability-v1/report.json",
  constructionReport: "results/skill-ir/bids-prospective-construction-v1/report.json",
  baseIr: "benchmarks/skill-ir/pilots/bids/base-ir.json",
  sourceAudit: "benchmarks/skill-ir/pilots/bids/base-ir-source-audit.json",
  artifactAdapter: "benchmarks/skill-ir/pilots/bids/artifact-adapter.json",
} as const

const PREDECESSOR_PATHS = [
  "benchmarks/skill-ir/pilots/bids/development/tasks.json",
  "src/bench/evaluators/bids-grade.ts",
  "benchmarks/skill-ir/pilots/bids/prospective-development-lock.json",
  "results/skill-ir/bids-prospective-development-v1/result.json",
] as const

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/bids-successor-development.ts",
  "src/benchmarks/skill-ir/bids-successor-development-run.ts",
  "src/benchmarks/skill-ir/real-agent.ts",
  "src/benchmarks/skill-ir/real-agent-run.ts",
  "src/benchmarks/skill-ir/static-development-v2-run.ts",
  "src/benchmarks/skill-ir/execution-resilience.ts",
  "src/benchmarks/skill-ir/resource-contract-run.ts",
  "src/benchmarks/skill-ir/score-real-agent-runs.ts",
  "src/benchmarks/skill-ir/scoring.ts",
  "src/core/workdir-manifest.ts",
  "src/framework/types.ts",
  "package.json",
  "bun.lock",
] as const

export const BidsSuccessorDevelopmentFrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const PrePaidGateSchema = z.object({
  id: z.enum([
    "successor-contract-and-scorer-freeze",
    "contribution-identifiability-audit",
    "prospective-construction-cost-identity",
  ]),
  status: z.literal("passed"),
  evidence: z.array(BidsSuccessorDevelopmentFrozenFileSchema).min(1),
}).strict()

const REQUIRED_GATE_ORDER = [
  "successor-contract-and-scorer-freeze",
  "contribution-identifiability-audit",
  "prospective-construction-cost-identity",
] as const

export const BidsSuccessorDevelopmentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-successor-development-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.literal("bids-successor-development-2026-08-23"),
  measurementIdentity: z.literal("bids-successor-semantic-scorer-v2"),
  corpus: z.literal("pilot"),
  skillId: z.literal("bids"),
  prePaidGates: z.tuple([PrePaidGateSchema, PrePaidGateSchema, PrePaidGateSchema]),
  frozenInputs: z.object({
    corpusManifest: BidsSuccessorDevelopmentFrozenFileSchema,
    sourceClosure: z.array(BidsSuccessorDevelopmentFrozenFileSchema).min(1),
    tasks: BidsSuccessorDevelopmentFrozenFileSchema,
    publicContract: BidsSuccessorDevelopmentFrozenFileSchema,
    resourceContract: BidsSuccessorDevelopmentFrozenFileSchema,
    scorer: BidsSuccessorDevelopmentFrozenFileSchema,
    successorContractAudit: BidsSuccessorDevelopmentFrozenFileSchema,
    contributionReport: BidsSuccessorDevelopmentFrozenFileSchema,
    constructionReport: BidsSuccessorDevelopmentFrozenFileSchema,
    baseIr: BidsSuccessorDevelopmentFrozenFileSchema,
    sourceAudit: BidsSuccessorDevelopmentFrozenFileSchema,
    artifactAdapter: BidsSuccessorDevelopmentFrozenFileSchema,
  }).strict(),
  implementation: z.array(BidsSuccessorDevelopmentFrozenFileSchema).min(1),
  compatibility: z.object({
    bidsV1Preserved: z.literal(true),
    bidsV1Rescored: z.literal(false),
    predecessorFiles: z.array(BidsSuccessorDevelopmentFrozenFileSchema).length(4),
  }).strict(),
  publicContract: z.object({
    protectedInputs: z.array(SafeRelativePathSchema).min(1),
    exactOutputs: z.array(SafeRelativePathSchema).min(1),
    exactOutputSet: z.literal(true),
  }).strict(),
  model: z.object({ route: z.literal("xty/gpt-5.6-sol"), family: z.literal("gpt") }).strict(),
  adapter: z.object({ id: z.literal("pi"), version: z.literal("0.67.68") }).strict(),
  matrix: z.object({
    systems: z.tuple([z.literal("no-skill"), z.literal("original"), z.literal("ir-static")]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("development"),
    taskIds: z.tuple([
      z.literal("bids-entity-order-dev-001"),
      z.literal("bids-metadata-inheritance-dev-002"),
    ]),
    targetBlocksPerTask: z.literal(2),
    reserveBlocksPerTask: z.literal(0),
    expectedSelectedRows: z.literal(12),
    expectedSelectedTriplets: z.literal(4),
    maximumAttemptRows: z.literal(12),
    maximumCandidateTriplets: z.literal(4),
    rowReuse: z.literal("same-lock-forward-only"),
  }).strict(),
  qualification: z.object({
    system: z.literal("original"),
    taskId: z.literal("bids-entity-order-dev-001"),
    candidateBlock: z.literal(1),
    requiredChecks: z.tuple([
      z.literal("resource"),
      z.literal("route"),
      z.literal("observability"),
      z.literal("scorer"),
    ]),
    semanticTaskSuccessRequired: z.literal(false),
  }).strict(),
  accounting: z.object({
    qualificationPaidCalls: z.literal(1),
    matrixPaidCalls: z.literal(12),
    totalPaidCallCeiling: z.literal(13),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    pythonEnv: z.literal("SKVM_PYTHON"),
    retries: z.literal(0),
    routeProbeTimeoutMs: z.literal(180000),
    resourceProbeRequired: z.literal(true),
    routeProbeRequired: z.literal(true),
    absoluteTimeoutMs: z.literal(600000),
    idleTimeoutMs: z.literal(120000),
    maxSteps: z.literal(30),
    outerWatchdogMs: z.literal(660000),
    adapterConfig: z.literal("managed"),
    maximumWorkDirLength: z.literal(220),
    outputRoot: z.literal("results/skill-ir/bids-successor-development-v1"),
  }).strict(),
  authorizations: z.object({
    qualification: z.literal(true),
    paidMatrix: z.literal(false),
    dynamic: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  prohibited: z.tuple([
    z.literal("paid-matrix-before-passed-qualification"),
    z.literal("bids-v1-rescoring-or-row-reuse"),
    z.literal("held-out"),
    z.literal("post-hoc-contract-repair"),
    z.literal("retry-selection"),
    z.literal("readiness-promotion"),
  ]),
  claimBoundary: z.literal(
    "This lock authorizes one infrastructure-only qualification and, only after it passes, one forward-only 12-call successor development denominator. It does not authorize BIDS v1 rescoring or row reuse, dynamic repair, held-out use, readiness promotion, or a model-quality claim.",
  ),
}).strict().superRefine((lock, context) => {
  if (lock.prePaidGates.some((gate, index) => gate.id !== REQUIRED_GATE_ORDER[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "BIDS successor pre-paid gate order mismatch" })
  }
  const triplets = lock.matrix.taskIds.length * lock.matrix.targetBlocksPerTask
  const rows = triplets * lock.matrix.systems.length
  if (triplets !== lock.matrix.expectedSelectedTriplets
    || rows !== lock.matrix.expectedSelectedRows
    || rows !== lock.matrix.maximumAttemptRows
    || triplets !== lock.matrix.maximumCandidateTriplets
    || rows !== lock.accounting.matrixPaidCalls
    || lock.accounting.qualificationPaidCalls + rows !== lock.accounting.totalPaidCallCeiling) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "BIDS successor denominator arithmetic mismatch" })
  }
})

export type BidsSuccessorDevelopmentLock = z.infer<typeof BidsSuccessorDevelopmentLockSchema>

export const BidsSuccessorQualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-successor-qualification/v1"),
  experimentId: z.literal("bids-successor-development-2026-08-23"),
  measurementIdentity: z.literal("bids-successor-semantic-scorer-v2"),
  lockSha256: Sha256Schema,
  status: z.enum(["passed", "failed"]),
  checks: z.object({
    resource: z.boolean(),
    route: z.boolean(),
    observability: z.boolean(),
    scorer: z.boolean(),
  }).strict(),
  resource: z.object({
    status: z.enum(["ok", "failed"]),
    reportPath: SafeRelativePathSchema,
    reportSha256: Sha256Schema,
  }).strict(),
  execution: z.object({
    classification: ExecutionFailureClassificationSchema,
    durationMs: z.number().nonnegative(),
    exitCode: z.number().int().nullable(),
    requestDispatched: z.boolean(),
    providerResponses: z.number().int().nonnegative(),
    parserOutcome: z.enum(["ok", "empty", "incompatible"]),
    usage: z.object({
      available: z.boolean(),
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
      cacheRead: z.number().int().nonnegative(),
      cacheWrite: z.number().int().nonnegative(),
    }).strict(),
  }).strict(),
  scorer: z.object({ rowProduced: z.boolean(), deterministicEvaluator: z.boolean() }).strict(),
  disclosure: z.object({
    exactOutputsPresent: z.boolean(),
    semanticSuccess: z.boolean().nullable(),
    usedAsGate: z.literal(false),
  }).strict(),
  accounting: z.object({ paidCalls: z.literal(1) }).strict(),
  authorizations: z.object({
    paidMatrix: z.boolean(),
    dynamic: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  claimBoundary: z.literal(
    "Qualification proves resource, route, execution-observability, and lock-local deterministic-scorer infrastructure only. Exact output presence and semantic success are disclosed but never gate model selection.",
  ),
}).strict().superRefine((report, context) => {
  const passed = Object.values(report.checks).every(Boolean)
  if ((report.status === "passed") !== passed || report.authorizations.paidMatrix !== passed) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "BIDS successor qualification authorization mismatch" })
  }
})

export type BidsSuccessorQualification = z.infer<typeof BidsSuccessorQualificationSchema>

export const BidsSuccessorDevelopmentFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-successor-development-freeze/v1"),
  freezeId: z.literal("bids-successor-qualification-and-development-identity-v1"),
  measurementIdentity: z.literal("bids-successor-semantic-scorer-v2"),
  status: z.literal("passed"),
  identityClosure: z.object({
    lock: BidsSuccessorDevelopmentFrozenFileSchema,
    successorContractAudit: BidsSuccessorDevelopmentFrozenFileSchema,
    tasks: BidsSuccessorDevelopmentFrozenFileSchema,
    publicContract: BidsSuccessorDevelopmentFrozenFileSchema,
    scorer: BidsSuccessorDevelopmentFrozenFileSchema,
  }).strict(),
  plan: z.object({
    rows: z.literal(12),
    triplets: z.literal(4),
    successorTaskRows: z.literal(12),
    retries: z.literal(0),
    reserveBlocksPerTask: z.literal(0),
    exactOutputSet: z.literal(true),
    forwardOnly: z.literal(true),
  }).strict(),
  scorer: z.object({
    evaluatorId: z.literal("skill-ir-bids-successor"),
    directLoaded: z.literal(true),
    registryFileAuthority: z.literal(false),
  }).strict(),
  accounting: z.object({
    paidCalls: z.literal(0),
    qualificationExecuted: z.literal(false),
    matrixExecuted: z.literal(false),
    qualificationPaidCallCeiling: z.literal(1),
    matrixPaidCallCeiling: z.literal(12),
  }).strict(),
  compatibility: z.object({
    bidsV1Preserved: z.literal(true),
    bidsV1Rescored: z.literal(false),
    predecessorFiles: z.array(BidsSuccessorDevelopmentFrozenFileSchema).length(4),
  }).strict(),
  authorizations: z.object({
    qualification: z.literal(true),
    paidExecution: z.literal(false),
    dynamic: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  sensitiveData: z.object({
    apiCredentialContentConsumed: z.literal(false),
    modelOutputContentConsumed: z.literal(false),
    heldOutConsumed: z.literal(false),
  }).strict(),
  claimBoundary: z.literal(
    "This zero-paid freeze proves a reproducible successor lock, a 12-row dry-run using only successor tasks, and lock-local scorer loading. It authorizes one later infrastructure qualification, but no paid development matrix, model-quality claim, dynamic repair, held-out use, or readiness promotion.",
  ),
}).strict()

export type BidsSuccessorDevelopmentFreeze = z.infer<typeof BidsSuccessorDevelopmentFreezeSchema>

async function frozen(rootDir: string, relativePath: string) {
  return BidsSuccessorDevelopmentFrozenFileSchema.parse({
    path: relativePath,
    sha256: sha256Bytes(await readFile(path.resolve(rootDir, ...relativePath.split("/")))),
  })
}

async function readJson(rootDir: string, relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(rootDir, ...relativePath.split("/")), "utf8"))
}

export async function buildBidsSuccessorDevelopmentLock(
  rawRootDir: string,
): Promise<BidsSuccessorDevelopmentLock> {
  const rootDir = path.resolve(rawRootDir)
  const audit = BidsSuccessorContractAuditReportSchema.parse(await readJson(rootDir, PATHS.successorContractAudit))
  if (audit.status !== "passed" || !audit.authorizations.successorIdentityFrozen
    || audit.authorizations.qualification || audit.authorizations.paidExecution) {
    throw new Error("BIDS successor contract audit does not authorize development lock freeze")
  }
  const sourceClosure = await Promise.all([
    "benchmarks/skill-ir/pilots/bids/source/SKILL.md",
    "benchmarks/skill-ir/pilots/bids/source/references/bids_schema.json",
    "benchmarks/skill-ir/pilots/bids/source/references/beps.yml",
    "benchmarks/skill-ir/pilots/bids/source/references/bids_specification.md",
    "benchmarks/skill-ir/pilots/bids/source/references/conversion_tools.md",
    "benchmarks/skill-ir/pilots/bids/source/references/metadata_fields.md",
    "benchmarks/skill-ir/pilots/bids/source/scripts/update_schema.py",
    "benchmarks/skill-ir/pilots/bids/source/LICENSE.repository.md",
  ].map((item) => frozen(rootDir, item)))
  const frozenInputs = {
    corpusManifest: await frozen(rootDir, PATHS.corpusManifest),
    sourceClosure,
    tasks: await frozen(rootDir, PATHS.tasks),
    publicContract: await frozen(rootDir, PATHS.publicContract),
    resourceContract: await frozen(rootDir, PATHS.resourceContract),
    scorer: await frozen(rootDir, PATHS.scorer),
    successorContractAudit: await frozen(rootDir, PATHS.successorContractAudit),
    contributionReport: await frozen(rootDir, PATHS.contributionReport),
    constructionReport: await frozen(rootDir, PATHS.constructionReport),
    baseIr: await frozen(rootDir, PATHS.baseIr),
    sourceAudit: await frozen(rootDir, PATHS.sourceAudit),
    artifactAdapter: await frozen(rootDir, PATHS.artifactAdapter),
  }
  const publicContract = buildBidsSuccessorPublicInterface()
  return BidsSuccessorDevelopmentLockSchema.parse({
    schemaVersion: "skill-ir-bids-successor-development-lock/v1",
    status: "preregistered",
    experimentId: "bids-successor-development-2026-08-23",
    measurementIdentity: "bids-successor-semantic-scorer-v2",
    corpus: "pilot",
    skillId: "bids",
    prePaidGates: [
      {
        id: "successor-contract-and-scorer-freeze",
        status: "passed",
        evidence: [frozenInputs.successorContractAudit, frozenInputs.tasks,
          frozenInputs.publicContract, frozenInputs.scorer],
      },
      {
        id: "contribution-identifiability-audit",
        status: "passed",
        evidence: [frozenInputs.contributionReport],
      },
      {
        id: "prospective-construction-cost-identity",
        status: "passed",
        evidence: [frozenInputs.constructionReport],
      },
    ],
    frozenInputs,
    implementation: await Promise.all(IMPLEMENTATION_PATHS.map((item) => frozen(rootDir, item))),
    compatibility: {
      bidsV1Preserved: true,
      bidsV1Rescored: false,
      predecessorFiles: await Promise.all(PREDECESSOR_PATHS.map((item) => frozen(rootDir, item))),
    },
    publicContract: {
      protectedInputs: publicContract.protectedInputs,
      exactOutputs: publicContract.outputs,
      exactOutputSet: publicContract.outputPolicy.exactOutputSet,
    },
    model: { route: "xty/gpt-5.6-sol", family: "gpt" },
    adapter: { id: "pi", version: "0.67.68" },
    matrix: {
      systems: ["no-skill", "original", "ir-static"],
      contexts: ["clean"],
      agents: ["skvm"],
      environments: ["windows"],
      taskSplit: "development",
      taskIds: ["bids-entity-order-dev-001", "bids-metadata-inheritance-dev-002"],
      targetBlocksPerTask: 2,
      reserveBlocksPerTask: 0,
      expectedSelectedRows: 12,
      expectedSelectedTriplets: 4,
      maximumAttemptRows: 12,
      maximumCandidateTriplets: 4,
      rowReuse: "same-lock-forward-only",
    },
    qualification: {
      system: "original",
      taskId: "bids-entity-order-dev-001",
      candidateBlock: 1,
      requiredChecks: ["resource", "route", "observability", "scorer"],
      semanticTaskSuccessRequired: false,
    },
    accounting: { qualificationPaidCalls: 1, matrixPaidCalls: 12, totalPaidCallCeiling: 13 },
    runtime: {
      apiKeyEnv: "SKVM_XTY_API_KEY",
      pythonEnv: "SKVM_PYTHON",
      retries: 0,
      routeProbeTimeoutMs: 180000,
      resourceProbeRequired: true,
      routeProbeRequired: true,
      absoluteTimeoutMs: 600000,
      idleTimeoutMs: 120000,
      maxSteps: 30,
      outerWatchdogMs: 660000,
      adapterConfig: "managed",
      maximumWorkDirLength: 220,
      outputRoot: "results/skill-ir/bids-successor-development-v1",
    },
    authorizations: {
      qualification: true,
      paidMatrix: false,
      dynamic: false,
      heldOut: false,
      readinessPromotion: false,
    },
    prohibited: [
      "paid-matrix-before-passed-qualification",
      "bids-v1-rescoring-or-row-reuse",
      "held-out",
      "post-hoc-contract-repair",
      "retry-selection",
      "readiness-promotion",
    ],
    claimBoundary:
      "This lock authorizes one infrastructure-only qualification and, only after it passes, one forward-only 12-call successor development denominator. It does not authorize BIDS v1 rescoring or row reuse, dynamic repair, held-out use, readiness promotion, or a model-quality claim.",
  })
}

function allFrozenFiles(lock: BidsSuccessorDevelopmentLock) {
  const { sourceClosure, ...named } = lock.frozenInputs
  return [...Object.values(named), ...sourceClosure, ...lock.implementation, ...lock.compatibility.predecessorFiles]
}

export async function validateBidsSuccessorDevelopmentLock(
  input: unknown,
  rawRootDir: string,
): Promise<BidsSuccessorDevelopmentLock> {
  const lock = BidsSuccessorDevelopmentLockSchema.parse(input)
  const rootDir = path.resolve(rawRootDir)
  for (const file of allFrozenFiles(lock)) {
    const actual = sha256Bytes(await readFile(path.resolve(rootDir, ...file.path.split("/"))))
    if (actual !== file.sha256) throw new Error(`BIDS successor development digest mismatch for ${file.path}`)
  }
  const audit = BidsSuccessorContractAuditReportSchema.parse(
    await readJson(rootDir, lock.frozenInputs.successorContractAudit.path),
  )
  if (audit.status !== "passed" || audit.measurementIdentity !== lock.measurementIdentity
    || !audit.authorizations.successorIdentityFrozen
    || !isDeepStrictEqual(audit.identityClosure.developmentTasks, lock.frozenInputs.tasks)
    || !isDeepStrictEqual(audit.identityClosure.publicInterface, lock.frozenInputs.publicContract)
    || !isDeepStrictEqual(audit.identityClosure.scorer, lock.frozenInputs.scorer)) {
    throw new Error("BIDS successor measurement authority drift")
  }
  const tasks = BidsSuccessorTaskSetSchema.parse(await readJson(rootDir, lock.frozenInputs.tasks.path))
  if (tasks.tasks.map((task) => task.id).join("\n") !== lock.matrix.taskIds.join("\n")
    || tasks.tasks.some((task) => task.eval.some((criterion) =>
      criterion.evaluatorId !== "skill-ir-bids-successor"
      || criterion.payload.schemaVersion !== "skill-ir-bids-eval/v2"))) {
    throw new Error("BIDS successor development task authority drift")
  }
  if (!isDeepStrictEqual(await readJson(rootDir, lock.frozenInputs.publicContract.path),
    buildBidsSuccessorPublicInterface())) {
    throw new Error("BIDS successor public contract drift")
  }
  const construction = BidsProspectiveConstructionReportSchema.parse(
    await readJson(rootDir, lock.frozenInputs.constructionReport.path),
  )
  if (construction.prePaidGate.status !== "passed" || !construction.prePaidGate.permitsQualificationLock) {
    throw new Error("BIDS successor construction evidence is not qualification-lock eligible")
  }
  const ir = SkillIRSchema.parse(await readJson(rootDir, lock.frozenInputs.baseIr.path))
  const sourceAudit = SkillIRSourceAuditSchema.parse(await readJson(rootDir, lock.frozenInputs.sourceAudit.path))
  const sourceReport = await verifySkillIRSourceAudit(ir, sourceAudit, rootDir)
  if (sourceReport.errors.length > 0) {
    throw new Error(`BIDS successor source audit failed: ${sourceReport.errors.join("; ")}`)
  }
  return lock
}

export async function writeBidsSuccessorDevelopmentLock(rootDir: string) {
  const lock = await buildBidsSuccessorDevelopmentLock(rootDir)
  const outputPath = path.resolve(rootDir, ...LOCK_PATH.split("/"))
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8")
  return lock
}

export type BidsSuccessorDevelopmentPlan = {
  schemaVersion: "skill-ir-bids-successor-development-plan/v1"
  experimentId: string
  measurementIdentity: string
  lock: BidsSuccessorDevelopmentLock
  runArgs: RealAgentRunArgs
  plan: RealAgentRunPlanEntry[]
}

function runtimeCommand(row: RealAgentRunPlanEntry, rootDir: string, lock: BidsSuccessorDevelopmentLock) {
  const observationPath = path.join(path.dirname(row.workDir), "execution-observation.json")
  return [
    process.execPath,
    "run",
    path.join(rootDir, "src/index.ts"),
    "run",
    ...row.command.slice(4).filter((argument) =>
      !argument.startsWith("--adapter-config=")
      && !argument.startsWith("--timeout-ms=")
      && !argument.startsWith("--idle-timeout-ms=")
      && !argument.startsWith("--max-steps=")
      && !argument.startsWith("--execution-observation=")),
    `--adapter-config=${lock.runtime.adapterConfig}`,
    `--timeout-ms=${lock.runtime.absoluteTimeoutMs}`,
    `--idle-timeout-ms=${lock.runtime.idleTimeoutMs}`,
    `--max-steps=${lock.runtime.maxSteps}`,
    `--execution-observation=${observationPath}`,
  ]
}

export async function buildBidsSuccessorDevelopmentPlan(input: {
  rootDir: string
  lock: BidsSuccessorDevelopmentLock
  outDir: string
}): Promise<BidsSuccessorDevelopmentPlan> {
  const lock = BidsSuccessorDevelopmentLockSchema.parse(input.lock)
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.resolve(rootDir, input.outDir)
  const tasks = BidsSuccessorTaskSetSchema.parse(await readJson(rootDir, lock.frozenInputs.tasks.path))
  const ir = SkillIRSchema.parse(await readJson(rootDir, lock.frozenInputs.baseIr.path))
  const sourceFiles = lock.frozenInputs.sourceClosure.map((file) => ({ ...file }))
  const plan: RealAgentRunPlanEntry[] = []
  for (const task of tasks.tasks) {
    const caseId = `${lock.skillId}:skvm:windows:clean:${task.id}`
    for (const system of lock.matrix.systems) {
      for (let runIndex = 1; runIndex <= lock.matrix.targetBlocksPerTask; runIndex += 1) {
        const materialized = await materializeCaseArtifacts({
          outDir: path.join(outDir, "artifacts"),
          rootDir,
          ir,
          sourceFiles,
          task,
          context: "clean",
          system,
          caseId,
          runIndex,
        })
        const entry = buildRunPlanEntry({
          ...materialized,
          skillProvenance: "real-public",
          evidenceWeight: "support-real",
        }, {
          model: lock.model.route,
          modelFamily: lock.model.family,
          adapter: lock.adapter.id,
          adapterVersion: lock.adapter.version,
          runIndex,
          panelConfigId: lock.experimentId,
        })
        entry.command = runtimeCommand(entry, rootDir, lock)
        plan.push(entry)
      }
    }
  }
  if (plan.length !== lock.matrix.maximumAttemptRows) {
    throw new Error(`BIDS successor plan row mismatch: ${plan.length}`)
  }
  if (plan.some((row) => row.workDir.length > lock.runtime.maximumWorkDirLength)) {
    throw new Error("BIDS successor workdir exceeds frozen path budget")
  }
  const runArgs: RealAgentRunArgs = {
    corpus: lock.corpus,
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.adapter.id,
    adapterVersion: lock.adapter.version,
    repetitions: lock.matrix.targetBlocksPerTask,
    panelConfigId: lock.experimentId,
    outDir,
    limit: lock.matrix.maximumAttemptRows,
    execute: false,
    retries: lock.runtime.retries,
    retryDelayMs: 0,
    outerWatchdogMs: lock.runtime.outerWatchdogMs,
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
  }
  return {
    schemaVersion: "skill-ir-bids-successor-development-plan/v1",
    experimentId: lock.experimentId,
    measurementIdentity: lock.measurementIdentity,
    lock,
    runArgs,
    plan,
  }
}

export async function loadBidsSuccessorDevelopmentScorer(
  rootDir: string,
  lock: BidsSuccessorDevelopmentLock,
  scorerPath: string,
): Promise<void> {
  if (scorerPath !== lock.frozenInputs.scorer.path) {
    throw new Error("BIDS successor scorer must equal the lock-declared source path")
  }
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...scorerPath.split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("BIDS successor scorer escapes repository root")
  }
  const actual = sha256Bytes(await readFile(absolute))
  if (actual !== lock.frozenInputs.scorer.sha256) throw new Error("BIDS successor scorer digest mismatch")
  const url = pathToFileURL(absolute)
  url.searchParams.set("bids-successor-development", "1")
  const module = await import(url.href) as { bidsSuccessorGrade?: CustomEvaluator }
  if (!module.bidsSuccessorGrade) throw new Error("BIDS successor lock-declared scorer export is missing")
  registerCustomEvaluator("skill-ir-bids-successor", module.bidsSuccessorGrade)
}

export async function buildBidsSuccessorDevelopmentFreeze(input: {
  rootDir: string
  lockPath: string
}): Promise<BidsSuccessorDevelopmentFreeze> {
  const rootDir = path.resolve(input.rootDir)
  const absoluteLockPath = path.resolve(rootDir, ...input.lockPath.split("/"))
  const relativeLockPath = path.relative(rootDir, absoluteLockPath)
  if (relativeLockPath === ".." || relativeLockPath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeLockPath)) {
    throw new Error("BIDS successor lock escapes repository root")
  }
  const lock = await validateBidsSuccessorDevelopmentLock(
    JSON.parse(await readFile(absoluteLockPath, "utf8")), rootDir,
  )
  const workRoot = path.resolve(rootDir, "results/skill-ir")
  await mkdir(workRoot, { recursive: true })
  const temporary = await mkdtemp(path.join(workRoot, "bids-successor-freeze-"))
  try {
    const plan = await buildBidsSuccessorDevelopmentPlan({
      rootDir,
      lock,
      outDir: path.relative(rootDir, temporary).replaceAll("\\", "/"),
    })
    await loadBidsSuccessorDevelopmentScorer(rootDir, lock, lock.frozenInputs.scorer.path)
    let successorTaskRows = 0
    for (const row of plan.plan) {
      const task = JSON.parse(await readFile(row.taskPath, "utf8")) as {
        eval?: Array<{ evaluatorId?: string; payload?: { schemaVersion?: string } }>
      }
      if (task.eval?.every((criterion) =>
        criterion.evaluatorId === "skill-ir-bids-successor"
        && criterion.payload?.schemaVersion === "skill-ir-bids-eval/v2")) {
        successorTaskRows += 1
      }
    }
    if (successorTaskRows !== lock.matrix.expectedSelectedRows
      || !customEvaluators.has("skill-ir-bids-successor")) {
      throw new Error("BIDS successor dry-run or direct scorer load failed")
    }
    return BidsSuccessorDevelopmentFreezeSchema.parse({
      schemaVersion: "skill-ir-bids-successor-development-freeze/v1",
      freezeId: "bids-successor-qualification-and-development-identity-v1",
      measurementIdentity: lock.measurementIdentity,
      status: "passed",
      identityClosure: {
        lock: {
          path: input.lockPath,
          sha256: sha256Bytes(await readFile(absoluteLockPath)),
        },
        successorContractAudit: lock.frozenInputs.successorContractAudit,
        tasks: lock.frozenInputs.tasks,
        publicContract: lock.frozenInputs.publicContract,
        scorer: lock.frozenInputs.scorer,
      },
      plan: {
        rows: plan.plan.length,
        triplets: lock.matrix.expectedSelectedTriplets,
        successorTaskRows,
        retries: lock.runtime.retries,
        reserveBlocksPerTask: lock.matrix.reserveBlocksPerTask,
        exactOutputSet: lock.publicContract.exactOutputSet,
        forwardOnly: lock.matrix.rowReuse === "same-lock-forward-only",
      },
      scorer: {
        evaluatorId: "skill-ir-bids-successor",
        directLoaded: true,
        registryFileAuthority: false,
      },
      accounting: {
        paidCalls: 0,
        qualificationExecuted: false,
        matrixExecuted: false,
        qualificationPaidCallCeiling: lock.accounting.qualificationPaidCalls,
        matrixPaidCallCeiling: lock.accounting.matrixPaidCalls,
      },
      compatibility: lock.compatibility,
      authorizations: {
        qualification: lock.authorizations.qualification,
        paidExecution: false,
        dynamic: false,
        heldOut: false,
        readinessPromotion: false,
      },
      sensitiveData: {
        apiCredentialContentConsumed: false,
        modelOutputContentConsumed: false,
        heldOutConsumed: false,
      },
      claimBoundary:
        "This zero-paid freeze proves a reproducible successor lock, a 12-row dry-run using only successor tasks, and lock-local scorer loading. It authorizes one later infrastructure qualification, but no paid development matrix, model-quality claim, dynamic repair, held-out use, or readiness promotion.",
    })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export async function writeBidsSuccessorDevelopmentFreeze(rootDir: string) {
  const report = await buildBidsSuccessorDevelopmentFreeze({ rootDir, lockPath: LOCK_PATH })
  const outputPath = path.resolve(rootDir, "results/skill-ir/bids-successor-development-freeze-v1.json")
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return report
}

const OBSERVABLE_CLASSIFICATIONS = new Set([
  "semantic-complete",
  "active-idle-timeout",
  "active-absolute-timeout",
  "step-limit",
])

export function buildBidsSuccessorQualification(input: {
  experimentId: string
  lockSha256: string
  resource: { status: "ok" | "failed"; reportPath: string; reportSha256: string }
  envelope: ExecutionEnvelope
  scorer: { rowProduced: boolean; deterministicEvaluator: boolean; semanticSuccess: boolean | null }
  exactOutputsPresent: boolean
}): BidsSuccessorQualification {
  const envelope = ExecutionEnvelopeSchema.parse(input.envelope)
  const checks = {
    resource: input.resource.status === "ok",
    route: envelope.activity.requestDispatched && envelope.activity.providerResponses > 0,
    observability: OBSERVABLE_CLASSIFICATIONS.has(envelope.classification)
      && envelope.parser.outcome === "ok"
      && envelope.parser.unknownTypes.length === 0,
    scorer: input.scorer.rowProduced && input.scorer.deterministicEvaluator,
  }
  const passed = Object.values(checks).every(Boolean)
  return BidsSuccessorQualificationSchema.parse({
    schemaVersion: "skill-ir-bids-successor-qualification/v1",
    experimentId: input.experimentId,
    measurementIdentity: "bids-successor-semantic-scorer-v2",
    lockSha256: input.lockSha256,
    status: passed ? "passed" : "failed",
    checks,
    resource: input.resource,
    execution: {
      classification: envelope.classification,
      durationMs: envelope.process.durationMs,
      exitCode: envelope.process.exitCode,
      requestDispatched: envelope.activity.requestDispatched,
      providerResponses: envelope.activity.providerResponses,
      parserOutcome: envelope.parser.outcome,
      usage: envelope.usage,
    },
    scorer: {
      rowProduced: input.scorer.rowProduced,
      deterministicEvaluator: input.scorer.deterministicEvaluator,
    },
    disclosure: {
      exactOutputsPresent: input.exactOutputsPresent,
      semanticSuccess: input.scorer.semanticSuccess,
      usedAsGate: false,
    },
    accounting: { paidCalls: 1 },
    authorizations: {
      paidMatrix: passed,
      dynamic: false,
      heldOut: false,
      readinessPromotion: false,
    },
    claimBoundary:
      "Qualification proves resource, route, execution-observability, and lock-local deterministic-scorer infrastructure only. Exact output presence and semantic success are disclosed but never gate model selection.",
  })
}

if (import.meta.main) {
  const rootDir = path.resolve(process.cwd())
  const lock = await writeBidsSuccessorDevelopmentLock(rootDir)
  const freeze = await writeBidsSuccessorDevelopmentFreeze(rootDir)
  console.log(JSON.stringify({
    experimentId: lock.experimentId,
    rows: lock.matrix.expectedSelectedRows,
    freezeStatus: freeze.status,
    paidCalls: freeze.accounting.paidCalls,
  }, null, 2))
}
