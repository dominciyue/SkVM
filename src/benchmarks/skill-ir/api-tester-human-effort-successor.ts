import { z } from "zod"

export const API_TESTER_HUMAN_EFFORT_PROTOCOL_ID =
  "skill-ir-api-tester-human-effort-successor-design-001"
export const API_TESTER_HUMAN_EFFORT_PROTOCOL_SCHEMA_VERSION =
  "skill-ir-api-tester-human-effort-protocol/v1"
export const API_TESTER_HUMAN_EFFORT_REPORT_SCHEMA_VERSION =
  "skill-ir-api-tester-human-effort-report/v1"

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u)
const DigestRefSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
}).strict()

const ArmSchema = z.enum([
  "manual-from-scratch",
  "deterministic-candidate-review-repair",
])
const ParticipantSchema = z.enum(["participant-01", "participant-02"])
const PairSchema = z.enum(["pair-01", "pair-02"])

export const ApiTesterHumanEffortProtocolSchema = z.object({
  schemaVersion: z.literal(API_TESTER_HUMAN_EFFORT_PROTOCOL_SCHEMA_VERSION),
  protocolId: z.literal(API_TESTER_HUMAN_EFFORT_PROTOCOL_ID),
  status: z.literal("design-only-not-authorized"),
  priorIdentity: z.literal(
    "skill-ir-api-tester-trace-public-answer-paid-development-001",
  ),
  researchQuestion: z.literal(
    "Under the same deterministic quality standard, how does active human effort differ between manual authoring and deterministic-candidate review/repair?",
  ),
  scope: z.object({
    developmentOnly: z.literal(true),
    permitsHeldOut: z.literal(false),
    paidExecutionAuthorized: z.literal(false),
    usesLlmTrace: z.literal(false),
    claimScope: z.literal("participant-and-task-conditional"),
  }).strict(),
  design: z.object({
    arms: z.tuple([
      z.object({
        id: z.literal("manual-from-scratch"),
        startingPoint: z.literal("public-task-and-openapi-only"),
      }).strict(),
      z.object({
        id: z.literal("deterministic-candidate-review-repair"),
        startingPoint: z.literal(
          "public-task-openapi-and-deterministic-candidate",
        ),
      }).strict(),
    ]),
    candidateConstruction: z.object({
      kind: z.literal("deterministic-openapi"),
      modelRequired: z.literal(false),
      comparatorRequired: z.literal(true),
      generator: DigestRefSchema,
    }).strict(),
    participantSlots: z.tuple([
      z.literal("participant-01"),
      z.literal("participant-02"),
    ]),
    participantsMustNotAuthorTasksOrScorer: z.literal(true),
    publicDevelopmentTasksRequired: z.literal(4),
    matchedPairsRequired: z.literal(2),
    taskSetStatus: z.enum(["not-authored", "frozen"]),
    assignment: z.object({
      kind: z.literal("balanced-crossover"),
      sequences: z.tuple([z.literal("ABBA"), z.literal("BAAB")]),
      rowsPerParticipant: z.literal(4),
      expectedRows: z.literal(8),
    }).strict(),
    timeboxMinutesPerRow: z.literal(30),
    maximumSubmissionsPerRow: z.literal(2),
  }).strict(),
  quality: z.object({
    scorer: DigestRefSchema,
    sameScorerForBothArms: z.literal(true),
    allHardGatesRequired: z.literal(true),
    finalPassRequiredForTimeComparison: z.literal(true),
  }).strict(),
  accounting: z.object({
    units: z.tuple([
      z.literal("agentRuns"),
      z.literal("providerModelRequests"),
      z.literal("tokens"),
      z.literal("currencyCost"),
      z.literal("activeHumanMinutes"),
      z.literal("modifiedLoc"),
      z.literal("failedAttempts"),
    ]),
    unknownValuesRemainNull: z.literal(true),
    platformEngineeringSeparated: z.literal(true),
  }).strict(),
  stopRules: z.object({
    failuresRemainInDenominator: z.literal(true),
    noReplacement: z.literal(true),
    noHistoricalMinuteBackfill: z.literal(true),
    noMinimumHumanEffortClaim: z.literal(true),
  }).strict(),
}).strict()

export type ApiTesterHumanEffortProtocol = z.infer<
  typeof ApiTesterHumanEffortProtocolSchema
>

const ActivityIntervalSchema = z.object({
  activity: z.enum(["authoring", "review", "repair"]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
}).strict()

export function deriveActiveMinutes(
  intervals: Array<z.infer<typeof ActivityIntervalSchema>>,
): number {
  const milliseconds = intervals.reduce((total, interval) => {
    return total + Date.parse(interval.endedAt) - Date.parse(interval.startedAt)
  }, 0)
  return milliseconds / 60_000
}

const AttemptSchema = z.object({
  attemptIndex: z.number().int().min(1).max(2),
  completedAt: z.string().datetime(),
  outputSha256: Sha256Schema,
  scorerReportSha256: Sha256Schema,
  qualityPassed: z.boolean(),
  failedCriteria: z.array(z.string().min(1)),
}).strict().superRefine((attempt, context) => {
  if (attempt.qualityPassed && attempt.failedCriteria.length > 0) {
    context.addIssue({
      code: "custom",
      path: ["failedCriteria"],
      message: "passing attempts cannot retain failed criteria",
    })
  }
  if (!attempt.qualityPassed && attempt.failedCriteria.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["failedCriteria"],
      message: "failed attempts must retain failed criteria",
    })
  }
})

export const HumanEffortRowSchema = z.object({
  rowIndex: z.number().int().min(1).max(8),
  participantId: ParticipantSchema,
  taskId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  matchedPairId: PairSchema,
  arm: ArmSchema,
  orderIndex: z.number().int().min(1).max(4),
  recordedProspectively: z.literal(true),
  intervals: z.array(ActivityIntervalSchema).min(1),
  attempts: z.array(AttemptSchema).min(1).max(2),
  finalStatus: z.enum(["passed", "failed", "timebox-exhausted"]),
  candidate: z.object({
    generatorSha256: Sha256Schema,
    initialCandidateSha256: Sha256Schema,
  }).strict().nullable(),
  modifiedLoc: z.number().int().nonnegative().nullable(),
  activityAccounting: z.object({
    agentRuns: z.literal(0),
    providerModelRequests: z.literal(0),
    toolCalls: z.literal(0),
    tokens: z.object({
      input: z.literal(0),
      output: z.literal(0),
      cacheRead: z.literal(0),
      cacheWrite: z.literal(0),
    }).strict(),
    currencyCost: z.object({
      currency: z.literal("USD"),
      amount: z.literal(0),
    }).strict(),
  }).strict(),
}).strict().superRefine((row, context) => {
  let previousEnd = Number.NEGATIVE_INFINITY
  for (const [index, interval] of row.intervals.entries()) {
    const start = Date.parse(interval.startedAt)
    const end = Date.parse(interval.endedAt)
    if (end <= start) {
      context.addIssue({
        code: "custom",
        path: ["intervals", index],
        message: "activity interval must have positive duration",
      })
    }
    if (start < previousEnd) {
      context.addIssue({
        code: "custom",
        path: ["intervals", index],
        message: "activity intervals must be ordered and non-overlapping",
      })
    }
    previousEnd = end
  }
  if (deriveActiveMinutes(row.intervals) > 30) {
    context.addIssue({
      code: "custom",
      path: ["intervals"],
      message: "active human time exceeds the frozen per-row timebox",
    })
  }

  for (const [index, attempt] of row.attempts.entries()) {
    if (attempt.attemptIndex !== index + 1) {
      context.addIssue({
        code: "custom",
        path: ["attempts", index, "attemptIndex"],
        message: "attempt indices must be contiguous",
      })
    }
  }
  const finalAttempt = row.attempts.at(-1)!
  if ((row.finalStatus === "passed") !== finalAttempt.qualityPassed) {
    context.addIssue({
      code: "custom",
      path: ["finalStatus"],
      message: "final status must agree with the final scorer attempt",
    })
  }

  if (row.arm === "manual-from-scratch") {
    if (row.candidate !== null) {
      context.addIssue({
        code: "custom",
        path: ["candidate"],
        message: "manual arm cannot receive a generated candidate",
      })
    }
    if (row.modifiedLoc !== null) {
      context.addIssue({
        code: "custom",
        path: ["modifiedLoc"],
        message: "manual arm does not define candidate modification LOC",
      })
    }
  } else {
    if (row.candidate === null) {
      context.addIssue({
        code: "custom",
        path: ["candidate"],
        message: "candidate arm requires generator and initial candidate digests",
      })
    }
    if (row.modifiedLoc === null) {
      context.addIssue({
        code: "custom",
        path: ["modifiedLoc"],
        message: "candidate arm requires measured modification LOC",
      })
    }
  }
})

export type HumanEffortRow = z.infer<typeof HumanEffortRowSchema>

const ActiveHumanMinutesSchema = z.object({
  manualFromScratch: z.number().nonnegative(),
  candidateReviewRepair: z.number().nonnegative(),
  differenceCandidateMinusManual: z.number(),
}).strict()

export const ApiTesterHumanEffortReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_HUMAN_EFFORT_REPORT_SCHEMA_VERSION),
  protocolId: z.literal(API_TESTER_HUMAN_EFFORT_PROTOCOL_ID),
  status: z.enum([
    "completed-descriptive",
    "blocked-incomplete-or-quality",
  ]),
  expectedRows: z.literal(8),
  observedRows: z.number().int().min(1).max(8),
  qualityComparableRows: z.number().int().min(0).max(8),
  rows: z.array(HumanEffortRowSchema).min(1).max(8),
  activeHumanMinutes: ActiveHumanMinutesSchema.nullable(),
  claimBoundary: z.literal(
    "This small development study reports participant-and-task-conditional active human effort; it does not estimate minimum human effort, population-level effects, or Skill IR benefit without a direct deterministic comparator.",
  ),
}).strict()

export type ApiTesterHumanEffortReport = z.infer<
  typeof ApiTesterHumanEffortReportSchema
>

function assertCompleteAssignment(rows: HumanEffortRow[]): void {
  const sorted = [...rows].sort((left, right) => left.rowIndex - right.rowIndex)
  const expectedIndices = Array.from({ length: 8 }, (_, index) => index + 1)
  if (
    sorted.some((row, index) => row.rowIndex !== expectedIndices[index]) ||
    new Set(sorted.map((row) => `${row.participantId}:${row.taskId}`)).size !== 8
  ) {
    throw new Error("human-effort rows do not form the frozen eight-row denominator")
  }

  const armCode = (arm: HumanEffortRow["arm"]) =>
    arm === "manual-from-scratch" ? "A" : "B"
  for (const [participantId, expected] of [
    ["participant-01", "ABBA"],
    ["participant-02", "BAAB"],
  ] as const) {
    const actual = sorted
      .filter((row) => row.participantId === participantId)
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((row) => armCode(row.arm))
      .join("")
    if (actual !== expected) {
      throw new Error(
        `human-effort assignment drift for ${participantId}: expected ${expected}, got ${actual}`,
      )
    }
  }

  const byTask = new Map<string, Set<HumanEffortRow["arm"]>>()
  for (const row of sorted) {
    const arms = byTask.get(row.taskId) ?? new Set()
    arms.add(row.arm)
    byTask.set(row.taskId, arms)
  }
  if (
    byTask.size !== 4 ||
    [...byTask.values()].some((arms) => arms.size !== 2)
  ) {
    throw new Error("each public development task must be observed once per arm")
  }
}

export function buildHumanEffortReport(
  protocolInput: ApiTesterHumanEffortProtocol,
  rowInputs: HumanEffortRow[],
): ApiTesterHumanEffortReport {
  const protocol = ApiTesterHumanEffortProtocolSchema.parse(protocolInput)
  if (protocol.design.taskSetStatus !== "frozen" && rowInputs.length > 0) {
    throw new Error("human-effort task set must be frozen before recording rows")
  }
  const rows = rowInputs.map((row) => HumanEffortRowSchema.parse(row))
  const complete = rows.length === protocol.design.assignment.expectedRows
  if (complete) assertCompleteAssignment(rows)
  const qualityComplete =
    complete && rows.every((row) => row.finalStatus === "passed")

  let activeHumanMinutes: z.infer<typeof ActiveHumanMinutesSchema> | null = null
  if (qualityComplete) {
    const manualFromScratch = rows
      .filter((row) => row.arm === "manual-from-scratch")
      .reduce((total, row) => total + deriveActiveMinutes(row.intervals), 0)
    const candidateReviewRepair = rows
      .filter((row) => row.arm === "deterministic-candidate-review-repair")
      .reduce((total, row) => total + deriveActiveMinutes(row.intervals), 0)
    activeHumanMinutes = {
      manualFromScratch,
      candidateReviewRepair,
      differenceCandidateMinusManual:
        candidateReviewRepair - manualFromScratch,
    }
  }

  return ApiTesterHumanEffortReportSchema.parse({
    schemaVersion: API_TESTER_HUMAN_EFFORT_REPORT_SCHEMA_VERSION,
    protocolId: protocol.protocolId,
    status: qualityComplete
      ? "completed-descriptive"
      : "blocked-incomplete-or-quality",
    expectedRows: protocol.design.assignment.expectedRows,
    observedRows: rows.length,
    qualityComparableRows: qualityComplete ? rows.length : 0,
    rows,
    activeHumanMinutes,
    claimBoundary:
      "This small development study reports participant-and-task-conditional active human effort; it does not estimate minimum human effort, population-level effects, or Skill IR benefit without a direct deterministic comparator.",
  })
}
