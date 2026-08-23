import { readFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package"
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run"
import type { RealAgentRunPlanEntry } from "./real-agent"
import { sha256Bytes } from "./source-fixture"

export const ProspectiveDevelopmentFrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict()

const PrePaidGateSchema = z.object({
  id: z.enum([
    "public-json-contract-audit",
    "evaluator-pointer-closure",
    "contribution-identifiability-audit",
    "deterministic-scorer-canary",
    "prospective-construction-cost-identity",
  ]),
  status: z.literal("passed"),
  evidence: z.array(ProspectiveDevelopmentFrozenFileSchema).min(1),
}).strict()

const REQUIRED_GATE_ORDER = [
  "public-json-contract-audit",
  "evaluator-pointer-closure",
  "contribution-identifiability-audit",
  "deterministic-scorer-canary",
  "prospective-construction-cost-identity",
] as const

export const ProspectiveDevelopmentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-prospective-development-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/u),
  corpus: z.literal("pilot"),
  skillId: z.string().regex(/^[a-z][a-z0-9-]+$/u),
  prePaidGates: z.tuple([
    PrePaidGateSchema,
    PrePaidGateSchema,
    PrePaidGateSchema,
    PrePaidGateSchema,
    PrePaidGateSchema,
  ]),
  frozenInputs: z.object({
    corpusManifest: ProspectiveDevelopmentFrozenFileSchema,
    candidateIntake: ProspectiveDevelopmentFrozenFileSchema,
    candidatePolicy: ProspectiveDevelopmentFrozenFileSchema,
    candidateReport: ProspectiveDevelopmentFrozenFileSchema,
    sourceClosure: z.array(ProspectiveDevelopmentFrozenFileSchema).min(1),
    tasks: ProspectiveDevelopmentFrozenFileSchema,
    publicContract: ProspectiveDevelopmentFrozenFileSchema,
    resourceContract: ProspectiveDevelopmentFrozenFileSchema,
    scorer: ProspectiveDevelopmentFrozenFileSchema,
    scorerRegistry: ProspectiveDevelopmentFrozenFileSchema,
    baseIr: ProspectiveDevelopmentFrozenFileSchema,
    sourceAudit: ProspectiveDevelopmentFrozenFileSchema,
    artifactAdapter: ProspectiveDevelopmentFrozenFileSchema,
    contractAudit: ProspectiveDevelopmentFrozenFileSchema,
    contributionManifest: ProspectiveDevelopmentFrozenFileSchema,
    contributionReport: ProspectiveDevelopmentFrozenFileSchema,
    constructionReport: ProspectiveDevelopmentFrozenFileSchema,
  }).strict(),
  implementation: z.array(ProspectiveDevelopmentFrozenFileSchema).min(1),
  publicContract: z.object({
    protectedInputs: z.array(SafeRelativePathSchema).min(1),
    exactOutputs: z.array(SafeRelativePathSchema).min(1),
    exactOutputSet: z.literal(true),
  }).strict(),
  model: z.object({ route: z.string().min(1), family: z.string().min(1) }).strict(),
  adapter: z.object({ id: z.literal("pi"), version: z.string().min(1) }).strict(),
  matrix: z.object({
    systems: z.tuple([z.literal("no-skill"), z.literal("original"), z.literal("ir-static")]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("development"),
    taskIds: z.tuple([z.string().min(1), z.string().min(1)]),
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
    taskId: z.string().min(1),
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
    outputRoot: SafeRelativePathSchema,
  }).strict(),
  authorizations: z.object({
    paidMatrix: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  prohibited: z.tuple([
    z.literal("paid-matrix-before-qualification"),
    z.literal("held-out"),
    z.literal("post-hoc-contract-repair"),
    z.literal("retry-selection"),
    z.literal("readiness-promotion"),
  ]),
  claimBoundary: z.literal(
    "Development-only infrastructure qualification and one forward-only 12-call model denominator. No held-out, readiness, automatic-construction, or main-claim authorization.",
  ),
}).strict().superRefine((lock, context) => {
  if (lock.prePaidGates.some((gate, index) => gate.id !== REQUIRED_GATE_ORDER[index])) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "prospective pre-paid gate order mismatch" })
  }
  if (new Set(lock.matrix.taskIds).size !== 2 || !lock.matrix.taskIds.includes(lock.qualification.taskId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "prospective task or qualification identity mismatch" })
  }
  const triplets = lock.matrix.taskIds.length * lock.matrix.targetBlocksPerTask
  const rows = triplets * lock.matrix.systems.length
  if (triplets !== lock.matrix.expectedSelectedTriplets
    || rows !== lock.matrix.expectedSelectedRows
    || rows !== lock.matrix.maximumAttemptRows
    || triplets !== lock.matrix.maximumCandidateTriplets
    || rows !== lock.accounting.matrixPaidCalls
    || lock.accounting.qualificationPaidCalls + rows !== lock.accounting.totalPaidCallCeiling) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "prospective denominator arithmetic mismatch" })
  }
})

export type ProspectiveDevelopmentLock = z.infer<typeof ProspectiveDevelopmentLockSchema>

function allFrozenFiles(lock: ProspectiveDevelopmentLock) {
  const { sourceClosure, ...named } = lock.frozenInputs
  return [...Object.values(named), ...sourceClosure, ...lock.implementation]
}

export async function validateProspectiveDevelopmentLock(
  input: unknown,
  rootDir: string,
): Promise<ProspectiveDevelopmentLock> {
  const lock = ProspectiveDevelopmentLockSchema.parse(input)
  const root = path.resolve(rootDir)
  for (const file of allFrozenFiles(lock)) {
    const actual = sha256Bytes(await readFile(path.resolve(root, ...file.path.split("/"))))
    if (actual !== file.sha256) throw new Error(`Prospective development digest mismatch for ${file.path}`)
  }
  return lock
}

export type ProspectiveDevelopmentPlan = {
  schemaVersion: "skill-ir-prospective-development-plan/v1"
  experimentId: string
  lock: ProspectiveDevelopmentLock
  runArgs: RealAgentRunArgs
  plan: RealAgentRunPlanEntry[]
}

export async function buildProspectiveDevelopmentPlan(input: {
  rootDir: string
  lock: ProspectiveDevelopmentLock
  outDir: string
}): Promise<ProspectiveDevelopmentPlan> {
  const lock = ProspectiveDevelopmentLockSchema.parse(input.lock)
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.resolve(rootDir, input.outDir)
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
  const plan = (await buildPlan(runArgs)).map((row) => {
    const observationPath = path.join(path.dirname(row.workDir), "execution-observation.json")
    return {
      ...row,
      command: [
        process.execPath, "run", path.join(rootDir, "src/index.ts"), "run",
        ...row.command.slice(4).filter((arg) =>
          !arg.startsWith("--adapter-config=")
          && !arg.startsWith("--timeout-ms=")
          && !arg.startsWith("--idle-timeout-ms=")
          && !arg.startsWith("--max-steps=")
          && !arg.startsWith("--execution-observation=")),
        `--adapter-config=${lock.runtime.adapterConfig}`,
        `--timeout-ms=${lock.runtime.absoluteTimeoutMs}`,
        `--idle-timeout-ms=${lock.runtime.idleTimeoutMs}`,
        `--max-steps=${lock.runtime.maxSteps}`,
        `--execution-observation=${observationPath}`,
      ],
    }
  })
  if (plan.length !== lock.matrix.maximumAttemptRows) {
    throw new Error(`Prospective development plan row mismatch: ${plan.length}`)
  }
  if (plan.some((row) => row.workDir.length > lock.runtime.maximumWorkDirLength)) {
    throw new Error("Prospective development workdir exceeds frozen path budget")
  }
  return {
    schemaVersion: "skill-ir-prospective-development-plan/v1",
    experimentId: lock.experimentId,
    lock,
    runArgs,
    plan,
  }
}
