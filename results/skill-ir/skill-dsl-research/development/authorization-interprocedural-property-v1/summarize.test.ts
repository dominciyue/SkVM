import { expect, test } from "bun:test"
import { positions, sha } from "./study.ts"
const api = await import("./summarize.ts").catch(() => ({})) as any
test("BB accounting deduplicates an attempt reference and preserves unknown usage", () => {
  const first = { attemptId: "pilot/original", accountUsage: { input: 100, cacheRead: 80, output: 5 }, durationMs: 10, actualUsd: null }, failed = { attemptId: "pilot/recovery", accountUsage: null, durationMs: 20 }
  const result = api.accounting([first, first, failed])
  expect(result.attempts).toBe(2); expect(result.known.input).toBe(100); expect(result.known.cacheRead).toBe(80)
  expect(result.unknownUsageAttempts).toEqual(["pilot/recovery"]); expect(result.actualUsd).toBeNull()
})
test("BB failed partial text is not a delivered answer", () => {
  expect(api.isDelivered({ status: "failed", terminalStatus: "failed", finalPresent: true, answerDelivery: "undelivered" })).toBe(false)
  expect(api.isDelivered({ status: "completed", terminalStatus: "completed", finalPresent: true, answerDelivery: "delivered" })).toBe(true)
  expect(() => api.assertReviewInput(Buffer.from("changed"), sha("original"))).toThrow("input")
})
test("BB all sixteen logical positions remain in the end-to-end denominator", () => {
  const rows = api.positionRows(positions(), [{ attemptId: "pilot-download/original", positionId: "pilot-download", status: "failed" }])
  expect(rows).toHaveLength(16); expect(rows.filter((r: any) => !r.firstAttempt)).toHaveLength(15)
  expect(rows.filter((r: any) => r.kind === "quality")).toHaveLength(6)
})
test("BB bound or empty trace cannot establish a cross-function property", () => {
  const report = (property: any) => ({ propertyAnalysis: { checks: { questions: [{ properties: [property] }] } } })
  expect(api.crossFunctionProperties(report({ status: "checked", trace: [], traceDetails: [] }))).toHaveLength(0)
  expect(api.crossFunctionProperties(report({ status: "violated", trace: ["g", "e"], traceDetails: [{ source: { id: "a" } }, { source: { id: "b" } }] }))).toHaveLength(1)
})
