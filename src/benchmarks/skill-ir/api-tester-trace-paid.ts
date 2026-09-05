import { z } from "zod"
import {
  API_TESTER_TRACE_IDENTITY,
  API_TESTER_TRACE_SCHEMA_VERSION,
  ApiTesterTraceSchema,
  compareTraceToPublicAnswer,
  shapeDigest,
  type ApiTesterPublicAnswer,
  type ApiTesterTrace,
  type ApiTesterTraceParity,
} from "./api-tester-trace-public-answer"

export const API_TESTER_TRACE_PAID_IDENTITY = "skill-ir-api-tester-trace-public-answer-paid-development-001"
export const API_TESTER_TRACE_PAID_LOCK_SCHEMA_VERSION = "skill-ir-api-tester-trace-paid-lock/v1"
export const API_TESTER_TRACE_PAID_REPORT_SCHEMA_VERSION = "skill-ir-api-tester-trace-paid-report/v1"

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u)
const DigestRefSchema = z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict()
const TaskIdSchema = z.enum([
  "api-tester-openapi-users-dev-001",
  "api-tester-openapi-inventory-dev-002",
])
const ParitySchema = z.enum(["exact", "equivalent", "missing", "extra", "invalid", "ambiguous"])
const HumanMinutesSchema = z.object({
  authoringMinutes: z.number().int().nonnegative(),
  reviewMinutes: z.number().int().nonnegative(),
  status: z.literal("prospective-measured-no-human-intervention"),
}).strict()

export const ApiTesterTracePaidLockSchema = z.object({
  schemaVersion: z.literal(API_TESTER_TRACE_PAID_LOCK_SCHEMA_VERSION),
  status: z.literal("preregistered"),
  experimentId: z.literal(API_TESTER_TRACE_PAID_IDENTITY),
  priorIdentity: z.literal(API_TESTER_TRACE_IDENTITY),
  measurementStartedAt: z.string().datetime(),
  model: z.object({ route: z.string().min(1), family: z.literal("gpt") }).strict(),
  matrix: z.object({
    taskIds: z.tuple([
      z.literal("api-tester-openapi-users-dev-001"),
      z.literal("api-tester-openapi-inventory-dev-002"),
    ]),
    repetitions: z.literal(2),
    expectedRows: z.literal(4),
    systems: z.tuple([z.literal("original")]),
    context: z.literal("clean"),
    environment: z.literal("windows"),
  }).strict(),
  budget: z.object({
    maximumPaidCalls: z.literal(4),
    maximumModelCalls: z.literal(4),
    maximumApiCalls: z.literal(4),
    retries: z.literal(0),
    reserve: z.literal(0),
    replacements: z.literal(0),
  }).strict(),
  stopLoss: z.object({
    firstRowIsSmoke: z.literal(true),
    smokeFailureStopsAll: z.literal(true),
    failedRowsRemainInDenominator: z.literal(true),
    routeChangesForbidden: z.literal(true),
  }).strict(),
  frozenInputs: z.object({
    tasks: DigestRefSchema,
    source: DigestRefSchema,
    checker: DigestRefSchema,
    oracle: DigestRefSchema,
    runner: DigestRefSchema,
    publicAnswers: z.tuple([
      z.object({ taskId: z.literal("api-tester-openapi-users-dev-001"), sha256: Sha256Schema }).strict(),
      z.object({ taskId: z.literal("api-tester-openapi-inventory-dev-002"), sha256: Sha256Schema }).strict(),
    ]),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    adapter: z.literal("pi"),
    adapterVersion: z.string().min(1),
    taskTimeoutMs: z.number().int().positive(),
    maxSteps: z.number().int().positive(),
    outerWatchdogMs: z.number().int().positive(),
  }).strict(),
  claimBoundary: z.object({
    developmentOnly: z.literal(true),
    permitsHeldOut: z.literal(false),
    changesReadiness: z.literal(false),
    optimizedLlmStabilityClaim: z.literal(false),
  }).strict(),
}).strict()

const UsageSchema = z.object({
  available: z.boolean(),
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
}).strict()

export const ApiTesterTracePaidRowSchema = z.object({
  rowIndex: z.number().int().min(1).max(4),
  taskId: TaskIdSchema,
  repetition: z.number().int().min(1).max(2),
  smoke: z.boolean(),
  status: z.enum(["passed", "failed"]),
  executionClassification: z.enum([
    "semantic-complete",
    "timeout",
    "runtime-failure",
    "parser-incompatible",
    "usage-missing",
    "trace-invalid",
    "quality-failure",
  ]),
  parity: ParitySchema,
  parityPass: z.boolean(),
  issues: z.array(z.string().min(1)),
  usage: UsageSchema,
  activity: z.object({ requestDispatched: z.boolean() }).strict(),
  durationMs: z.number().nonnegative(),
  publicAnswerSha256: Sha256Schema,
  traceSha256: Sha256Schema.nullable(),
  generatedPlanSha256: Sha256Schema.nullable(),
  executionObservationSha256: Sha256Schema,
  humanMinutes: HumanMinutesSchema,
}).strict().superRefine((row, context) => {
  if (row.smoke !== (row.rowIndex === 1)) {
    context.addIssue({ code: "custom", path: ["smoke"], message: "only the first denominator row is smoke" })
  }
  if (row.parityPass !== (row.parity === "exact" || row.parity === "equivalent")) {
    context.addIssue({ code: "custom", path: ["parityPass"], message: "parity pass flag disagrees with the frozen enum" })
  }
  if (row.status === "passed" && (row.executionClassification !== "semantic-complete" || !row.parityPass || !row.usage.available)) {
    context.addIssue({ code: "custom", path: ["status"], message: "passed row lacks complete execution, usage, or parity" })
  }
})

export type ApiTesterTracePaidLock = z.infer<typeof ApiTesterTracePaidLockSchema>
export type ApiTesterTracePaidRow = z.infer<typeof ApiTesterTracePaidRowSchema>

export const ApiTesterTracePaidReportSchema = z.object({
  schemaVersion: z.literal(API_TESTER_TRACE_PAID_REPORT_SCHEMA_VERSION),
  experimentId: z.literal(API_TESTER_TRACE_PAID_IDENTITY),
  lockSha256: Sha256Schema,
  status: z.enum(["completed", "completed-negative", "negative-smoke-frozen"]),
  stopReason: z.enum(["denominator-complete", "smoke-failed"]),
  measurement: z.object({
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    authoringMinutes: z.number().int().nonnegative(),
    reviewMinutes: z.number().int().nonnegative(),
    boundary: z.literal("Only active human minutes inside the prospective paid-run window are counted; model and controller wall time are excluded."),
  }).strict(),
  rows: z.array(ApiTesterTracePaidRowSchema).min(1).max(4),
  accounting: z.object({
    expectedRows: z.literal(4),
    observedRows: z.number().int().min(1).max(4),
    modelCalls: z.number().int().min(0).max(4),
    apiCalls: z.number().int().min(0).max(4),
    paidCalls: z.number().int().min(0).max(4),
    retries: z.literal(0),
    reserve: z.literal(0),
    replacements: z.literal(0),
  }).strict(),
  tokens: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    cacheRead: z.number().int().nonnegative(),
    cacheWrite: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }).strict(),
  claimBoundary: z.literal("This development-only report measures fixed original-model execution cost and trace/public-answer parity. It does not modify an LLM, prove that an optimized LLM is more stable, access held-out data, or change portfolio/readiness."),
}).strict().superRefine((report, context) => {
  if (Date.parse(report.measurement.completedAt) < Date.parse(report.measurement.startedAt)) {
    context.addIssue({ code: "custom", path: ["measurement"], message: "measurement completion precedes start" })
  }
  const expected = [
    [1, "api-tester-openapi-users-dev-001", 1],
    [2, "api-tester-openapi-users-dev-001", 2],
    [3, "api-tester-openapi-inventory-dev-002", 1],
    [4, "api-tester-openapi-inventory-dev-002", 2],
  ] as const
  for (const [offset, row] of report.rows.entries()) {
    const identity = expected[offset]
    if (!identity || row.rowIndex !== identity[0] || row.taskId !== identity[1] || row.repetition !== identity[2]) {
      context.addIssue({ code: "custom", path: ["rows", offset], message: "paid denominator row order or identity drift" })
    }
    if (row.humanMinutes.authoringMinutes !== report.measurement.authoringMinutes
      || row.humanMinutes.reviewMinutes !== report.measurement.reviewMinutes) {
      context.addIssue({ code: "custom", path: ["rows", offset, "humanMinutes"], message: "row human minutes drift from prospective measurement" })
    }
  }
  if (report.stopReason === "smoke-failed" && (report.rows.length !== 1 || report.rows[0]?.status !== "failed")) {
    context.addIssue({ code: "custom", path: ["rows"], message: "smoke failure must freeze exactly one failed denominator row" })
  }
  if (report.stopReason === "denominator-complete" && report.rows.length !== 4) {
    context.addIssue({ code: "custom", path: ["rows"], message: "completed denominator requires exactly four rows" })
  }
})

export type ApiTesterTracePaidReport = z.infer<typeof ApiTesterTracePaidReportSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function buildPaidTraceFromGeneratedPlan(input: {
  answer: ApiTesterPublicAnswer
  repetition: number
  plan: unknown
}): { trace: ApiTesterTrace | null; comparison: { parity: ApiTesterTraceParity; pass: boolean; issues: string[] } } {
  if (!isRecord(input.plan) || !Array.isArray(input.plan.endpoints)) {
    return { trace: null, comparison: { parity: "invalid", pass: false, issues: ["invalid-plan-shape"] } }
  }
  try {
    const endpoints = input.plan.endpoints
    const steps = endpoints.map((endpoint, stepIndex) => {
      if (!isRecord(endpoint) || typeof endpoint.method !== "string" || typeof endpoint.path !== "string" || !Array.isArray(endpoint.cases)) {
        throw new Error("invalid-endpoint-shape")
      }
      const method = endpoint.method
      const path = endpoint.path
      return {
        stepIndex,
        kind: "operation" as const,
        toolName: "http-client",
        operation: `${method} ${path}`,
        method,
        path,
        inputShapeDigest: shapeDigest({ method, path, cases: endpoint.cases.map((entry) => isRecord(entry) ? entry.request : null) }),
        outputShapeDigest: shapeDigest({ cases: endpoint.cases.map((entry) => isRecord(entry) ? entry.expectedStatus : null) }),
        selectedNextStep: stepIndex + 1 < endpoints.length ? String(stepIndex + 1) : null,
        expectedAnswerRef: `operation:${method.trim().toUpperCase()}:${path.length > 1 ? path.replace(/\/+$/u, "") : path}`,
        status: "accepted" as const,
      }
    })
    const trace = ApiTesterTraceSchema.parse({
      schemaVersion: API_TESTER_TRACE_SCHEMA_VERSION,
      identity: API_TESTER_TRACE_IDENTITY,
      taskId: input.answer.taskId,
      repetition: input.repetition,
      orderedDecisionSteps: steps,
    })
    return { trace, comparison: compareTraceToPublicAnswer(trace, input.answer) }
  } catch {
    return { trace: null, comparison: { parity: "invalid", pass: false, issues: ["invalid-generated-plan-trace"] } }
  }
}

export async function executeTracePaidRows<T extends { rowIndex: number }>(
  rows: readonly T[],
  executeRow: (row: T) => Promise<ApiTesterTracePaidRow>,
): Promise<{ rows: ApiTesterTracePaidRow[]; stopReason: "smoke-failed" | "denominator-complete" }> {
  if (rows.length !== 4 || rows.some((row, index) => row.rowIndex !== index + 1)) {
    throw new Error("paid execution requires the fixed four-row denominator")
  }
  const results: ApiTesterTracePaidRow[] = []
  for (const planned of rows) {
    const result = ApiTesterTracePaidRowSchema.parse(await executeRow(planned))
    results.push(result)
    if (planned.rowIndex === 1 && result.status !== "passed") {
      return { rows: results, stopReason: "smoke-failed" }
    }
  }
  return { rows: results, stopReason: "denominator-complete" }
}

export function buildTracePaidReport(input: {
  experimentId: string
  lockSha256: string
  rows: ApiTesterTracePaidRow[]
  stopReason: "smoke-failed" | "denominator-complete"
  measurement: { startedAt: string; completedAt: string; authoringMinutes: number; reviewMinutes: number }
}): ApiTesterTracePaidReport {
  const rows = input.rows.map((row) => ApiTesterTracePaidRowSchema.parse(row))
  const dispatched = rows.filter((row) => row.activity.requestDispatched).length
  const sum = (field: "input" | "output" | "cacheRead" | "cacheWrite") => rows.reduce((total, row) => total + row.usage[field], 0)
  const inputTokens = sum("input")
  const outputTokens = sum("output")
  const status = input.stopReason === "smoke-failed"
    ? "negative-smoke-frozen" as const
    : rows.every((row) => row.status === "passed") ? "completed" as const : "completed-negative" as const
  return ApiTesterTracePaidReportSchema.parse({
    schemaVersion: API_TESTER_TRACE_PAID_REPORT_SCHEMA_VERSION,
    experimentId: input.experimentId,
    lockSha256: input.lockSha256,
    status,
    stopReason: input.stopReason,
    measurement: {
      ...input.measurement,
      boundary: "Only active human minutes inside the prospective paid-run window are counted; model and controller wall time are excluded.",
    },
    rows,
    accounting: {
      expectedRows: 4,
      observedRows: rows.length,
      modelCalls: dispatched,
      apiCalls: dispatched,
      paidCalls: dispatched,
      retries: 0,
      reserve: 0,
      replacements: 0,
    },
    tokens: {
      input: inputTokens,
      output: outputTokens,
      cacheRead: sum("cacheRead"),
      cacheWrite: sum("cacheWrite"),
      total: inputTokens + outputTokens,
    },
    claimBoundary: "This development-only report measures fixed original-model execution cost and trace/public-answer parity. It does not modify an LLM, prove that an optimized LLM is more stable, access held-out data, or change portfolio/readiness.",
  })
}
