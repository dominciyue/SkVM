import { describe, expect, test } from "bun:test"
import {
  ApiTesterTracePaidLockSchema,
  buildPaidTraceFromGeneratedPlan,
  buildTracePaidReport,
  executeTracePaidRows,
  type ApiTesterTracePaidRow,
} from "./api-tester-trace-paid"
import { buildPublicAnswerFromTask } from "./api-tester-trace-public-answer"

const TASK = {
  id: "api-tester-openapi-users-dev-001",
  split: "development",
  fixtures: {
    "api/openapi.json": JSON.stringify({
      openapi: "3.0.3",
      info: { title: "test", version: "1" },
      paths: {
        "/users": { get: { responses: { "200": { description: "ok" } } } },
        "/users/{id}": { delete: { responses: { "204": { description: "deleted" } } } },
      },
    }),
  },
}

function digest(char: string) { return char.repeat(64) }

function row(index: number, pass = true): ApiTesterTracePaidRow {
  const taskId = index < 2 ? "api-tester-openapi-users-dev-001" : "api-tester-openapi-inventory-dev-002"
  return {
    rowIndex: index + 1,
    taskId,
    repetition: index % 2 + 1,
    smoke: index === 0,
    status: pass ? "passed" : "failed",
    executionClassification: pass ? "semantic-complete" : "runtime-failure",
    parity: pass ? "exact" : "invalid",
    parityPass: pass,
    issues: pass ? [] : ["runtime-failure"],
    usage: { available: pass, input: pass ? 10 : 0, output: pass ? 2 : 0, cacheRead: 0, cacheWrite: 0 },
    activity: { requestDispatched: true },
    durationMs: 100,
    publicAnswerSha256: digest("a"),
    traceSha256: pass ? digest("b") : null,
    generatedPlanSha256: pass ? digest("c") : null,
    executionObservationSha256: digest("d"),
    humanMinutes: { authoringMinutes: 0, reviewMinutes: 0, status: "prospective-measured-no-human-intervention" },
  }
}

describe("API Tester trace paid contract", () => {
  test("rejects budget, retry, reserve, and denominator drift", () => {
    const base = {
      schemaVersion: "skill-ir-api-tester-trace-paid-lock/v1",
      status: "preregistered",
      experimentId: "skill-ir-api-tester-trace-public-answer-paid-development-001",
      priorIdentity: "skill-ir-api-tester-trace-public-answer-development-001",
      measurementStartedAt: "2026-09-05T00:00:00.000Z",
      model: { route: "xty/gpt-5.6-sol", family: "gpt" },
      matrix: {
        taskIds: ["api-tester-openapi-users-dev-001", "api-tester-openapi-inventory-dev-002"],
        repetitions: 2, expectedRows: 4, systems: ["original"], context: "clean", environment: "windows",
      },
      budget: { maximumPaidCalls: 4, maximumModelCalls: 4, maximumApiCalls: 4, retries: 0, reserve: 0, replacements: 0 },
      stopLoss: { firstRowIsSmoke: true, smokeFailureStopsAll: true, failedRowsRemainInDenominator: true, routeChangesForbidden: true },
      frozenInputs: {
        tasks: { path: "tasks.json", sha256: digest("1") },
        source: { path: "SKILL.md", sha256: digest("2") },
        checker: { path: "checker.ts", sha256: digest("3") },
        oracle: { path: "oracle.ts", sha256: digest("4") },
        runner: { path: "runner.ts", sha256: digest("5") },
        publicAnswers: [
          { taskId: "api-tester-openapi-users-dev-001", sha256: digest("6") },
          { taskId: "api-tester-openapi-inventory-dev-002", sha256: digest("7") },
        ],
      },
      runtime: { apiKeyEnv: "SKVM_XTY_API_KEY", adapter: "pi", adapterVersion: "0.67.68", taskTimeoutMs: 300000, maxSteps: 30, outerWatchdogMs: 360000 },
      claimBoundary: { developmentOnly: true, permitsHeldOut: false, changesReadiness: false, optimizedLlmStabilityClaim: false },
    } as const
    expect(ApiTesterTracePaidLockSchema.parse(base).matrix.expectedRows).toBe(4)
    expect(() => ApiTesterTracePaidLockSchema.parse({ ...base, budget: { ...base.budget, retries: 1 } })).toThrow()
    expect(() => ApiTesterTracePaidLockSchema.parse({ ...base, matrix: { ...base.matrix, expectedRows: 5 } })).toThrow()
  })

  test("derives a strict trace from the generated public plan", () => {
    const answer = buildPublicAnswerFromTask(TASK)
    const trace = buildPaidTraceFromGeneratedPlan({
      answer,
      repetition: 1,
      plan: { schemaVersion: "api-test-plan/v1", source: "public-openapi", framework: "node:test", endpoints: [
        { method: "GET", path: "/users", cases: [] },
        { method: "DELETE", path: "/users/{id}", cases: [] },
      ] },
    })
    expect(trace.comparison).toEqual({ parity: "exact", pass: true, issues: [] })
    expect(trace.trace?.orderedDecisionSteps).toHaveLength(2)

    const missing = buildPaidTraceFromGeneratedPlan({
      answer,
      repetition: 1,
      plan: { endpoints: [{ method: "GET", path: "/users", cases: [] }] },
    })
    expect(missing.comparison.parity).toBe("missing")
  })

  test("stops after a failed first-row smoke and never dispatches a replacement", async () => {
    const planned = [0, 1, 2, 3].map((index) => ({ rowIndex: index + 1 }))
    const dispatched: number[] = []
    const result = await executeTracePaidRows(planned, async (entry) => {
      dispatched.push(entry.rowIndex)
      return row(entry.rowIndex - 1, false)
    })
    expect(dispatched).toEqual([1])
    expect(result).toEqual({ rows: [row(0, false)], stopReason: "smoke-failed" })
  })

  test("runs the fixed four rows once when smoke passes, retaining later failures", async () => {
    const planned = [0, 1, 2, 3].map((index) => ({ rowIndex: index + 1 }))
    const result = await executeTracePaidRows(planned, async (entry) => row(entry.rowIndex - 1, entry.rowIndex !== 3))
    expect(result.rows).toHaveLength(4)
    expect(result.rows[2]!.status).toBe("failed")
    expect(result.stopReason).toBe("denominator-complete")
  })

  test("builds digest-bound per-row cost, parity, and prospective human-minute evidence", () => {
    const report = buildTracePaidReport({
      experimentId: "skill-ir-api-tester-trace-public-answer-paid-development-001",
      lockSha256: digest("e"),
      rows: [0, 1, 2, 3].map((index) => row(index)),
      stopReason: "denominator-complete",
      measurement: {
        startedAt: "2026-09-05T00:00:00.000Z",
        completedAt: "2026-09-05T00:01:00.000Z",
        authoringMinutes: 0,
        reviewMinutes: 0,
      },
    })
    expect(report.accounting).toMatchObject({ modelCalls: 4, apiCalls: 4, paidCalls: 4, expectedRows: 4, observedRows: 4 })
    expect(report.tokens).toMatchObject({ input: 40, output: 8, total: 48 })
    expect(report.rows.every((entry) => entry.humanMinutes.authoringMinutes === 0 && entry.humanMinutes.reviewMinutes === 0)).toBe(true)
  })
})
