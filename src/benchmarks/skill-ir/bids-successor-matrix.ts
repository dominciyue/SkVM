import { isDeepStrictEqual } from "node:util"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  BidsSuccessorQualificationSchema,
  buildBidsSuccessorDevelopmentPlan,
  loadBidsSuccessorDevelopmentScorer,
  validateBidsSuccessorDevelopmentLock,
  type BidsSuccessorDevelopmentLock,
  type BidsSuccessorDevelopmentPlan,
  type BidsSuccessorQualification,
} from "./bids-successor-development.ts"
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package.ts"
import { customEvaluators } from "../../framework/types.ts"
import { sha256Bytes } from "./source-fixture.ts"

const LOCK_PATH = "benchmarks/skill-ir/pilots/bids/successor-v2/development-lock.json"
const QUALIFICATION_PATH = "results/skill-ir/bids-successor-development-v1/qualification.json"
export const BIDS_SUCCESSOR_MATRIX_POLICY_PATH =
  "benchmarks/skill-ir/pilots/bids/successor-v2/development-analysis-policy.json"
export const BIDS_SUCCESSOR_MATRIX_FREEZE_PATH = "results/skill-ir/bids-successor-matrix-freeze-v1.json"

const IMPLEMENTATION_PATHS = [
  "src/benchmarks/skill-ir/bids-successor-matrix.ts",
  "src/benchmarks/skill-ir/bids-successor-matrix-run.ts",
  "src/benchmarks/skill-ir/prospective-development-run.ts",
  "src/benchmarks/skill-ir/prospective-development-result.ts",
] as const

const FrozenFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict()
const EstimandSchema = z.object({
  id: z.enum([
    "original-minus-no-skill",
    "ir-static-minus-original",
    "validated-artifact-minus-original",
  ]),
  treatment: z.enum(["original", "ir-static", "validated-artifact"]),
  comparator: z.enum(["no-skill", "original"]),
  metric: z.literal("deterministic-evaluator-score"),
  pairing: z.literal("same-task-and-repetition"),
  reportMeanDelta: z.literal(true),
  reportPositiveZeroRegressedPairs: z.literal(true),
}).strict()

export const BidsSuccessorMatrixPolicySchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-successor-analysis-policy/v1"),
  analysisId: z.literal("bids-successor-development-analysis-2026-08-23"),
  frozenAt: z.literal("2026-08-23T00:00:00.000Z"),
  timing: z.literal("after-qualification-before-model-matrix"),
  measurementIdentity: z.literal("bids-successor-semantic-scorer-v2"),
  lock: FrozenFileSchema,
  qualification: FrozenFileSchema,
  tasks: FrozenFileSchema,
  scorer: FrozenFileSchema,
  implementation: z.tuple([
    FrozenFileSchema,
    FrozenFileSchema,
    FrozenFileSchema,
    FrozenFileSchema,
  ]),
  denominator: z.object({
    modelRows: z.literal(12),
    modelTriplets: z.literal(4),
    deterministicControlRows: z.literal(4),
    systems: z.tuple([z.literal("no-skill"), z.literal("original"), z.literal("ir-static")]),
    order: z.literal("task-then-repetition-then-system"),
    retries: z.literal(0),
    reserveBlocksPerTask: z.literal(0),
    forwardOnly: z.literal(true),
  }).strict(),
  estimands: z.tuple([EstimandSchema, EstimandSchema, EstimandSchema]),
  measurementEligibility: z.object({
    requiredModelRows: z.literal(12),
    requiredScoredModelRows: z.literal(12),
    requiredDeterministicControlRows: z.literal(4),
    maximumActiveExecutionFailures: z.literal(1),
    maximumParserOrRuntimeBlockers: z.literal(0),
    deterministicScorerRequired: z.literal(true),
  }).strict(),
  decisionRules: z.object({
    contributionIdentified: z.object({
      estimand: z.literal("original-minus-no-skill"),
      minimumPositivePairs: z.literal(1),
      maximumRegressedPairs: z.literal(0),
    }).strict(),
    irStaticImproved: z.object({
      estimand: z.literal("ir-static-minus-original"),
      meanDeltaMustBePositive: z.literal(true),
      minimumPositivePairs: z.literal(1),
      maximumRegressedPairs: z.literal(0),
    }).strict(),
    validatedArtifactImproved: z.object({
      estimand: z.literal("validated-artifact-minus-original"),
      allArtifactRowsMustPass: z.literal(true),
      meanDeltaMustBePositive: z.literal(true),
      minimumPositivePairs: z.literal(1),
      maximumRegressedPairs: z.literal(0),
    }).strict(),
  }).strict(),
  dynamicTrigger: z.object({
    mode: z.literal("residual-driven-only"),
    maximumConditionalPaidCalls: z.literal(4),
    authorized: z.literal(false),
  }).strict(),
  accounting: z.object({
    priorQualificationPaidCalls: z.literal(1),
    currentStagePaidCalls: z.literal(0),
    modelMatrixPaidCallCeiling: z.literal(12),
    retriesPaidCallCeiling: z.literal(0),
  }).strict(),
  authorizations: z.object({
    modelMatrix: z.literal(true),
    deterministicControl: z.literal(true),
    dynamic: z.literal(false),
    heldOut: z.literal(false),
    readinessPromotion: z.literal(false),
  }).strict(),
  prohibited: z.tuple([
    z.literal("qualification-repeat"),
    z.literal("bids-v1-rescoring-or-row-reuse"),
    z.literal("retry-or-reserve-selection"),
    z.literal("post-hoc-row-selection"),
    z.literal("dynamic"),
    z.literal("held-out"),
    z.literal("readiness-promotion"),
  ]),
  claimBoundary: z.literal(
    "Successor development estimands, eligibility, execution order, and forward-only persistence are frozen after the passed one-call qualification and before the 12-call matrix. This policy does not authorize qualification repetition, BIDS v1 reuse or rescoring, retries, reserve selection, dynamic repair, held-out use, readiness promotion, or a model-quality claim.",
  ),
}).strict().superRefine((policy, context) => {
  const expected = [
    ["original-minus-no-skill", "original", "no-skill"],
    ["ir-static-minus-original", "ir-static", "original"],
    ["validated-artifact-minus-original", "validated-artifact", "original"],
  ]
  if (policy.estimands.some((item, index) => item.id !== expected[index]?.[0]
    || item.treatment !== expected[index]?.[1] || item.comparator !== expected[index]?.[2])) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "BIDS successor estimand order or arm mismatch" })
  }
  if (policy.denominator.modelTriplets * policy.denominator.systems.length
    !== policy.denominator.modelRows) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "BIDS successor denominator arithmetic mismatch" })
  }
})

export type BidsSuccessorMatrixPolicy = z.infer<typeof BidsSuccessorMatrixPolicySchema>

export const BidsSuccessorMatrixFreezeSchema = z.object({
  schemaVersion: z.literal("skill-ir-bids-successor-matrix-freeze/v1"),
  freezeId: z.literal("bids-successor-analysis-and-runner-identity-v1"),
  status: z.literal("passed"),
  measurementIdentity: z.literal("bids-successor-semantic-scorer-v2"),
  identityClosure: z.object({
    lock: FrozenFileSchema,
    qualification: FrozenFileSchema,
    policy: FrozenFileSchema,
    tasks: FrozenFileSchema,
    scorer: FrozenFileSchema,
    implementation: z.array(FrozenFileSchema).length(4),
  }).strict(),
  plan: z.object({
    rows: z.literal(12),
    triplets: z.literal(4),
    successorTaskRows: z.literal(12),
    order: z.literal("task-then-repetition-then-system"),
    resumablePrefixRows: z.literal(0),
    retries: z.literal(0),
    reserveBlocksPerTask: z.literal(0),
    forwardOnly: z.literal(true),
  }).strict(),
  scorer: z.object({
    evaluatorId: z.literal("skill-ir-bids-successor"),
    directLoaded: z.literal(true),
    registryFileAuthority: z.literal(false),
  }).strict(),
  accounting: z.object({
    priorQualificationPaidCalls: z.literal(1),
    currentStagePaidCalls: z.literal(0),
    matrixExecuted: z.literal(false),
    modelMatrixPaidCallCeiling: z.literal(12),
  }).strict(),
  authorizations: z.object({
    modelMatrix: z.literal(true),
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
    "This zero-paid freeze proves that the passed successor qualification, analysis policy, fixed 12-row order, exact-prefix resume guard, and lock-local scorer form one reproducible execution identity. It authorizes the later model matrix only; no matrix row, retry, dynamic row, held-out row, readiness decision, or model-quality claim is produced here.",
  ),
}).strict()

export type BidsSuccessorMatrixFreeze = z.infer<typeof BidsSuccessorMatrixFreezeSchema>
type PlanRow = BidsSuccessorDevelopmentPlan["plan"][number]
type RawIdentity = { caseId: string; runIndex?: number; system: string }
type EnvelopeIdentity = { taskId: string; candidateBlock: number; system: string }

function taskId(row: PlanRow): string {
  const value = row.caseId.split(":").at(-1)
  if (!value) throw new Error(`BIDS successor matrix task identity missing: ${row.caseId}`)
  return value
}

async function frozen(rootDir: string, relativePath: string) {
  return FrozenFileSchema.parse({
    path: relativePath,
    sha256: sha256Bytes(await readFile(path.resolve(rootDir, ...relativePath.split("/")))),
  })
}

async function readJson(rootDir: string, relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(rootDir, ...relativePath.split("/")), "utf8"))
}

export async function buildBidsSuccessorMatrixPolicy(rawRootDir: string): Promise<BidsSuccessorMatrixPolicy> {
  const rootDir = path.resolve(rawRootDir)
  const lock = await validateBidsSuccessorDevelopmentLock(await readJson(rootDir, LOCK_PATH), rootDir)
  const lockFile = await frozen(rootDir, LOCK_PATH)
  const qualificationFile = await frozen(rootDir, QUALIFICATION_PATH)
  const qualification = BidsSuccessorQualificationSchema.parse(await readJson(rootDir, QUALIFICATION_PATH))
  if (qualification.status !== "passed" || !qualification.authorizations.paidMatrix
    || qualification.accounting.paidCalls !== 1 || qualification.lockSha256 !== lockFile.sha256) {
    throw new Error("BIDS successor passed qualification does not bind the current lock")
  }
  return BidsSuccessorMatrixPolicySchema.parse({
    schemaVersion: "skill-ir-bids-successor-analysis-policy/v1",
    analysisId: "bids-successor-development-analysis-2026-08-23",
    frozenAt: "2026-08-23T00:00:00.000Z",
    timing: "after-qualification-before-model-matrix",
    measurementIdentity: lock.measurementIdentity,
    lock: lockFile,
    qualification: qualificationFile,
    tasks: lock.frozenInputs.tasks,
    scorer: lock.frozenInputs.scorer,
    implementation: await Promise.all(IMPLEMENTATION_PATHS.map((item) => frozen(rootDir, item))),
    denominator: {
      modelRows: 12,
      modelTriplets: 4,
      deterministicControlRows: 4,
      systems: ["no-skill", "original", "ir-static"],
      order: "task-then-repetition-then-system",
      retries: 0,
      reserveBlocksPerTask: 0,
      forwardOnly: true,
    },
    estimands: [
      {
        id: "original-minus-no-skill", treatment: "original", comparator: "no-skill",
        metric: "deterministic-evaluator-score", pairing: "same-task-and-repetition",
        reportMeanDelta: true, reportPositiveZeroRegressedPairs: true,
      },
      {
        id: "ir-static-minus-original", treatment: "ir-static", comparator: "original",
        metric: "deterministic-evaluator-score", pairing: "same-task-and-repetition",
        reportMeanDelta: true, reportPositiveZeroRegressedPairs: true,
      },
      {
        id: "validated-artifact-minus-original", treatment: "validated-artifact", comparator: "original",
        metric: "deterministic-evaluator-score", pairing: "same-task-and-repetition",
        reportMeanDelta: true, reportPositiveZeroRegressedPairs: true,
      },
    ],
    measurementEligibility: {
      requiredModelRows: 12,
      requiredScoredModelRows: 12,
      requiredDeterministicControlRows: 4,
      maximumActiveExecutionFailures: 1,
      maximumParserOrRuntimeBlockers: 0,
      deterministicScorerRequired: true,
    },
    decisionRules: {
      contributionIdentified: {
        estimand: "original-minus-no-skill", minimumPositivePairs: 1, maximumRegressedPairs: 0,
      },
      irStaticImproved: {
        estimand: "ir-static-minus-original", meanDeltaMustBePositive: true,
        minimumPositivePairs: 1, maximumRegressedPairs: 0,
      },
      validatedArtifactImproved: {
        estimand: "validated-artifact-minus-original", allArtifactRowsMustPass: true,
        meanDeltaMustBePositive: true, minimumPositivePairs: 1, maximumRegressedPairs: 0,
      },
    },
    dynamicTrigger: { mode: "residual-driven-only", maximumConditionalPaidCalls: 4, authorized: false },
    accounting: {
      priorQualificationPaidCalls: 1,
      currentStagePaidCalls: 0,
      modelMatrixPaidCallCeiling: 12,
      retriesPaidCallCeiling: 0,
    },
    authorizations: {
      modelMatrix: true,
      deterministicControl: true,
      dynamic: false,
      heldOut: false,
      readinessPromotion: false,
    },
    prohibited: [
      "qualification-repeat",
      "bids-v1-rescoring-or-row-reuse",
      "retry-or-reserve-selection",
      "post-hoc-row-selection",
      "dynamic",
      "held-out",
      "readiness-promotion",
    ],
    claimBoundary:
      "Successor development estimands, eligibility, execution order, and forward-only persistence are frozen after the passed one-call qualification and before the 12-call matrix. This policy does not authorize qualification repetition, BIDS v1 reuse or rescoring, retries, reserve selection, dynamic repair, held-out use, readiness promotion, or a model-quality claim.",
  })
}

export async function validateBidsSuccessorMatrixPolicy(input: unknown, rawRootDir: string): Promise<{
  policy: BidsSuccessorMatrixPolicy
  lock: BidsSuccessorDevelopmentLock
  qualification: BidsSuccessorQualification
}> {
  const policy = BidsSuccessorMatrixPolicySchema.parse(input)
  const rootDir = path.resolve(rawRootDir)
  if (policy.lock.path !== LOCK_PATH || policy.qualification.path !== QUALIFICATION_PATH
    || !isDeepStrictEqual(policy.implementation.map((file) => file.path), [...IMPLEMENTATION_PATHS])) {
    throw new Error("BIDS successor matrix authority path drift")
  }
  for (const file of [
    policy.lock,
    policy.qualification,
    policy.tasks,
    policy.scorer,
    ...policy.implementation,
  ]) {
    const actual = sha256Bytes(await readFile(path.resolve(rootDir, ...file.path.split("/"))))
    if (actual !== file.sha256) throw new Error(`BIDS successor matrix digest mismatch for ${file.path}`)
  }
  const lock = await validateBidsSuccessorDevelopmentLock(await readJson(rootDir, policy.lock.path), rootDir)
  const qualification = BidsSuccessorQualificationSchema.parse(await readJson(rootDir, policy.qualification.path))
  if (policy.measurementIdentity !== lock.measurementIdentity
    || qualification.measurementIdentity !== lock.measurementIdentity
    || qualification.status !== "passed"
    || !qualification.authorizations.paidMatrix
    || qualification.accounting.paidCalls !== 1
    || qualification.lockSha256 !== policy.lock.sha256) {
    throw new Error("BIDS successor matrix qualification is failed, repeated, or stale")
  }
  if (!isDeepStrictEqual(policy.tasks, lock.frozenInputs.tasks)
    || !isDeepStrictEqual(policy.scorer, lock.frozenInputs.scorer)
    || !isDeepStrictEqual(policy.denominator.systems, lock.matrix.systems)
    || policy.denominator.modelRows !== lock.matrix.maximumAttemptRows
    || policy.denominator.modelTriplets !== lock.matrix.maximumCandidateTriplets
    || policy.denominator.retries !== lock.runtime.retries
    || policy.denominator.reserveBlocksPerTask !== lock.matrix.reserveBlocksPerTask
    || policy.denominator.forwardOnly !== (lock.matrix.rowReuse === "same-lock-forward-only")) {
    throw new Error("BIDS successor matrix policy authority or denominator drift")
  }
  return { policy, lock, qualification }
}

export async function validateBidsSuccessorMatrixFreeze(
  input: unknown,
  rawRootDir: string,
  policyInput: unknown,
): Promise<BidsSuccessorMatrixFreeze> {
  const freeze = BidsSuccessorMatrixFreezeSchema.parse(input)
  const policy = BidsSuccessorMatrixPolicySchema.parse(policyInput)
  const rootDir = path.resolve(rawRootDir)
  if (freeze.identityClosure.policy.path !== BIDS_SUCCESSOR_MATRIX_POLICY_PATH
    || !isDeepStrictEqual(freeze.identityClosure.lock, policy.lock)
    || !isDeepStrictEqual(freeze.identityClosure.qualification, policy.qualification)
    || !isDeepStrictEqual(freeze.identityClosure.tasks, policy.tasks)
    || !isDeepStrictEqual(freeze.identityClosure.scorer, policy.scorer)
    || !isDeepStrictEqual(freeze.identityClosure.implementation, policy.implementation)) {
    throw new Error("BIDS successor matrix freeze identity drift")
  }
  for (const file of [
    freeze.identityClosure.lock,
    freeze.identityClosure.qualification,
    freeze.identityClosure.policy,
    freeze.identityClosure.tasks,
    freeze.identityClosure.scorer,
    ...freeze.identityClosure.implementation,
  ]) {
    const actual = sha256Bytes(await readFile(path.resolve(rootDir, ...file.path.split("/"))))
    if (actual !== file.sha256) throw new Error(`BIDS successor matrix freeze digest mismatch for ${file.path}`)
  }
  return freeze
}

export function orderedBidsSuccessorMatrixRows(rows: PlanRow[], lock: BidsSuccessorDevelopmentLock): PlanRow[] {
  const ordered: PlanRow[] = []
  for (const task of lock.matrix.taskIds) {
    for (let repetition = 1; repetition <= lock.matrix.targetBlocksPerTask; repetition += 1) {
      for (const system of lock.matrix.systems) {
        const matches = rows.filter((row) =>
          taskId(row) === task && row.runIndex === repetition && row.system === system)
        if (matches.length !== 1) {
          throw new Error(`BIDS successor matrix requires one row: ${task}/${repetition}/${system}`)
        }
        ordered.push(matches[0]!)
      }
    }
  }
  if (ordered.length !== lock.matrix.maximumAttemptRows || ordered.length !== rows.length) {
    throw new Error(`BIDS successor matrix denominator mismatch: ${ordered.length}/${rows.length}`)
  }
  return ordered
}

export function assertBidsSuccessorPersistedPrefix(
  rows: PlanRow[], raw: RawIdentity[], envelopes: EnvelopeIdentity[],
): void {
  if (raw.length !== envelopes.length || raw.length > rows.length) {
    throw new Error("BIDS successor persisted matrix prefix length mismatch")
  }
  for (let index = 0; index < raw.length; index += 1) {
    const planned = rows[index]!
    const observed = raw[index]!
    const envelope = envelopes[index]!
    if (observed.caseId !== planned.caseId || observed.runIndex !== planned.runIndex
      || observed.system !== planned.system || envelope.taskId !== taskId(planned)
      || envelope.candidateBlock !== planned.runIndex || envelope.system !== planned.system) {
      throw new Error(`BIDS successor persisted matrix prefix identity mismatch at row ${index + 1}`)
    }
  }
}

export async function buildBidsSuccessorMatrixFreeze(rawRootDir: string): Promise<BidsSuccessorMatrixFreeze> {
  const rootDir = path.resolve(rawRootDir)
  const policy = await buildBidsSuccessorMatrixPolicy(rootDir)
  const validated = await validateBidsSuccessorMatrixPolicy(policy, rootDir)
  const temporary = await mkdtemp(path.join(path.resolve(rootDir, "results/skill-ir"), "bids-successor-matrix-freeze-"))
  try {
    const plan = await buildBidsSuccessorDevelopmentPlan({
      rootDir,
      lock: validated.lock,
      outDir: path.relative(rootDir, temporary).replaceAll("\\", "/"),
    })
    const rows = orderedBidsSuccessorMatrixRows(plan.plan, validated.lock)
    assertBidsSuccessorPersistedPrefix(rows, [], [])
    await loadBidsSuccessorDevelopmentScorer(rootDir, validated.lock, validated.lock.frozenInputs.scorer.path)
    let successorTaskRows = 0
    for (const row of rows) {
      const task = JSON.parse(await readFile(row.taskPath, "utf8")) as {
        eval?: Array<{ evaluatorId?: string; payload?: { schemaVersion?: string } }>
      }
      if (task.eval?.every((criterion) => criterion.evaluatorId === "skill-ir-bids-successor"
        && criterion.payload?.schemaVersion === "skill-ir-bids-eval/v2")) successorTaskRows += 1
    }
    if (successorTaskRows !== 12 || !customEvaluators.has("skill-ir-bids-successor")) {
      throw new Error("BIDS successor matrix dry-run or direct scorer load failed")
    }
    return BidsSuccessorMatrixFreezeSchema.parse({
      schemaVersion: "skill-ir-bids-successor-matrix-freeze/v1",
      freezeId: "bids-successor-analysis-and-runner-identity-v1",
      status: "passed",
      measurementIdentity: policy.measurementIdentity,
      identityClosure: {
        lock: policy.lock,
        qualification: policy.qualification,
        policy: await frozen(rootDir, BIDS_SUCCESSOR_MATRIX_POLICY_PATH),
        tasks: policy.tasks,
        scorer: policy.scorer,
        implementation: policy.implementation,
      },
      plan: {
        rows: rows.length,
        triplets: policy.denominator.modelTriplets,
        successorTaskRows,
        order: policy.denominator.order,
        resumablePrefixRows: 0,
        retries: policy.denominator.retries,
        reserveBlocksPerTask: policy.denominator.reserveBlocksPerTask,
        forwardOnly: policy.denominator.forwardOnly,
      },
      scorer: {
        evaluatorId: "skill-ir-bids-successor",
        directLoaded: true,
        registryFileAuthority: false,
      },
      accounting: {
        priorQualificationPaidCalls: policy.accounting.priorQualificationPaidCalls,
        currentStagePaidCalls: 0,
        matrixExecuted: false,
        modelMatrixPaidCallCeiling: policy.accounting.modelMatrixPaidCallCeiling,
      },
      authorizations: {
        modelMatrix: policy.authorizations.modelMatrix,
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
        "This zero-paid freeze proves that the passed successor qualification, analysis policy, fixed 12-row order, exact-prefix resume guard, and lock-local scorer form one reproducible execution identity. It authorizes the later model matrix only; no matrix row, retry, dynamic row, held-out row, readiness decision, or model-quality claim is produced here.",
    })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export async function writeBidsSuccessorMatrixArtifacts(rawRootDir: string): Promise<{
  policy: BidsSuccessorMatrixPolicy
  freeze: BidsSuccessorMatrixFreeze
}> {
  const rootDir = path.resolve(rawRootDir)
  const policy = await buildBidsSuccessorMatrixPolicy(rootDir)
  const policyTarget = path.resolve(rootDir, ...BIDS_SUCCESSOR_MATRIX_POLICY_PATH.split("/"))
  await mkdir(path.dirname(policyTarget), { recursive: true })
  await writeFile(policyTarget, `${JSON.stringify(policy, null, 2)}\n`, "utf8")
  const freeze = await buildBidsSuccessorMatrixFreeze(rootDir)
  const freezeTarget = path.resolve(rootDir, ...BIDS_SUCCESSOR_MATRIX_FREEZE_PATH.split("/"))
  await mkdir(path.dirname(freezeTarget), { recursive: true })
  await writeFile(freezeTarget, `${JSON.stringify(freeze, null, 2)}\n`, "utf8")
  return { policy, freeze }
}

if (import.meta.main) {
  writeBidsSuccessorMatrixArtifacts(process.cwd()).then(({ policy, freeze }) => console.log(JSON.stringify({
    analysisId: policy.analysisId,
    rows: freeze.plan.rows,
    paidCalls: freeze.accounting.currentStagePaidCalls,
    matrixExecuted: freeze.accounting.matrixExecuted,
  }, null, 2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
