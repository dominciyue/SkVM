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
test("BB previous baseline needs delivered same-epoch D1 and two identified trace sources", () => {
  const r = { status: "completed", terminalStatus: "completed", answerDelivery: "delivered", finalPresent: true, method: "D1", runtimeTree: "current", sessionPath: "session", propertyAnalysis: { checks: { questions: [{ properties: [{ status: "checked", trace: ["a", "b"], traceDetails: [{ source: { id: "a" } }, {}] }] }] } } }
  expect(api.qualifiedConsumer(r, "current")).toBe(false)
  r.propertyAnalysis.checks.questions[0]!.properties[0]!.traceDetails[1] = { source: { id: "b" } }
  expect(api.qualifiedConsumer(r, "current")).toBe(true)
  expect(api.qualifiedConsumer(r, "other")).toBe(false)
  expect(api.qualifiedConsumer({ ...r, method: "M" }, "current")).toBe(false)
  expect(api.qualifiedConsumer({ ...r, answerDelivery: "undelivered" }, "current")).toBe(false)
})
test("BB queue distinguishes eligible previous blocking, external pause and unknown completion", () => {
  const ps = positions().map(p => ({ ...p, status: "completed", attempts: [`${p.id}/original`] }))
  const reports = ps.map(p => ({ attemptId: p.attempts[0], status: "completed", terminalStatus: "completed" }))
  expect(api.queueOutcome(ps, reports).finiteQueueComplete).toBe(true)
  ps[11] = { ...ps[11]!, status: "blocked-no-qualified-baseline", attempts: [] }
  expect(api.queueOutcome(ps, reports).finiteQueueComplete).toBe(true)
  ps[0] = { ...ps[0]!, status: "unrun-account-blocked", attempts: [] }
  expect(api.queueOutcome(ps, reports)).toMatchObject({ finiteQueueSettled: true, finiteQueueComplete: false })
  ps[0] = { ...ps[0]!, status: "completion-unknown", attempts: [reports[0]!.attemptId!] }
  reports[0]!.status = "completion-unknown"
  expect(api.queueOutcome(ps, reports).finiteQueueSettled).toBe(false)
})
test("BB quality comparison selects current revisions without treating references as new samples", () => {
  const ps = positions().filter(p => p.kind === "quality").map(p => ({ ...p, attempts: [`${p.id}/original`] }))
  const reports = ps.map(p => ({ attemptId: p.attempts[0], status: "completed", terminalStatus: "completed", finalPresent: true, answerDelivery: "delivered", runtimeTree: "new", actualModelInput: { fullOriginalBundlePrefixMatches: true, originalQuestionTextPresent: true }, accountUsage: { input: 100, output: 10 } }))
  const claims = ps.map((p, i) => ({ attemptId: reports[i]!.attemptId, runtimeTree: "new", model: "model", effort: "high", limits: {}, sourceFiles: [p.task], skillIdentity: [p.task], originalTaskSha256: p.task }))
  const reviews = reports.map(r => ({ attemptId: r.attemptId, status: "source-reviewed", wholeOriginalTask: "full" }))
  const prior = { ...reports[1]!, attemptId: "pilot-download/older", runtimeTree: "old" }
  ps[1]!.attempts.unshift(prior.attemptId)
  const result = api.qualityComparison(ps, [...reports, prior], reviews, claims)
  expect(result.comparable).toBe(true)
  expect(result.rows[1].firstAttempt).toBe(prior.attemptId)
  expect(result.rows[1].selectedAttempt).toBe(reports[1]!.attemptId)
  expect(result.independentAttempts).toBe(6)
  claims[0]!.runtimeTree = "old"
  expect(api.qualityComparison(ps, reports, reviews, claims).comparable).toBe(false)
})
test("BB quality includes partial answers and refuses incomplete actual bundle or unreviewed inputs", () => {
  const ps = positions().filter(p => p.kind === "quality").map(p => ({ ...p, attempts: [`${p.id}/original`] }))
  const reports = ps.map(p => ({ attemptId: p.attempts[0], status: "completed", terminalStatus: "completed", finalPresent: true, answerDelivery: "delivered", runtimeTree: "same", actualModelInput: { fullOriginalBundlePrefixMatches: true, originalQuestionTextPresent: true } }))
  const claims = reports.map(r => ({ attemptId: r.attemptId, runtimeTree: "same", model: "m", effort: "high", limits: {}, sourceFiles: [], skillIdentity: [], originalTaskSha256: "task" }))
  const reviews = reports.map(r => ({ attemptId: r.attemptId, status: "source-reviewed", wholeOriginalTask: "partial" }))
  expect(api.qualityComparison(ps, reports, reviews, claims).comparable).toBe(true)
  reports[0]!.actualModelInput.fullOriginalBundlePrefixMatches = false
  expect(api.qualityComparison(ps, reports, reviews, claims).comparable).toBe(false)
  reports[0]!.actualModelInput.fullOriginalBundlePrefixMatches = true
  reviews[0]!.status = "awaiting-independent-source-review"
  expect(api.qualityComparison(ps, reports, reviews, claims).comparable).toBe(false)
})
