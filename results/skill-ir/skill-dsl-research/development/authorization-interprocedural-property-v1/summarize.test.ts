import { expect, test } from "bun:test"
import { positions, sha } from "./study.ts"
const api = await import("./summarize.ts").catch(() => ({})) as any
test("BB review accepts registered uppercase quality arms and rejects foreign or traversal IDs", () => {
  for (const id of ["quality-download-N/original", "quality-owui-D/original", "pilot-download/source-order-marker-1"]) expect(() => api.assertReviewAttempt(id)).not.toThrow()
  for (const id of ["quality-download-X/original", "foreign/original", "pilot-download/../outside", "pilot-download/UPPER"]) expect(() => api.assertReviewAttempt(id)).toThrow()
})
test("BB accounting deduplicates an attempt reference and preserves unknown usage", () => {
  const first = { attemptId: "pilot/original", accountUsage: { input: 100, cacheRead: 80, output: 5 }, durationMs: 10, actualUsd: null }, failed = { attemptId: "pilot/recovery", accountUsage: null, durationMs: 20 }
  const result = api.accounting([first, first, failed])
  expect(result.attempts).toBe(2); expect(result.known.input).toBe(100); expect(result.known.cacheRead).toBe(80)
  expect(result.unknownUsageAttempts).toEqual(["pilot/recovery"]); expect(result.actualUsd).toBeNull()
})
test("BB interrupted usage stays separately retained and never enters completed totals", () => {
  const interrupted = { attemptId: "consumer/original", accountUsage: null, durationMs: null, lastRetainedUsage: { total: { inputTokens: 900, cachedInputTokens: 800, outputTokens: 12 } } }
  const resumed = { attemptId: "consumer/user-resume-1", accountUsage: { input: 100, cacheRead: 70, output: 5 }, durationMs: 20 }
  const result = api.accounting([interrupted, interrupted, resumed])
  expect(result.known).toMatchObject({ input: 100, cacheRead: 70, output: 5 })
  expect(result.partialPreInterruptionUsage).toEqual([{ attemptId: interrupted.attemptId, usage: interrupted.lastRetainedUsage, includedInKnownTotals: false, finalUsage: "unknown" }])
  expect(result.unknownDurationAttempts).toEqual([interrupted.attemptId])
})
test("BB reported counters without a known server terminal remain partial final-usage unknown", () => {
  const unknown = { attemptId: "consumer/user-resume-1", status: "timeout-unknown", terminalStatus: "unknown", accountUsage: { input: 13798358, cacheRead: 13563008, output: 9593, cacheWrite: 0 }, durationMs: 2700010 }
  const complete = { attemptId: "other/original", status: "completed", terminalStatus: "completed", accountUsage: { input: 100, cacheRead: 50, output: 3 }, durationMs: 10 }
  const result = api.accounting([unknown, complete, unknown])
  expect(result.known).toMatchObject({ input: 100, cacheRead: 50, output: 3 })
  expect(result.unknownUsageAttempts).toEqual([unknown.attemptId])
  expect(result.partialPreInterruptionUsage).toEqual([{ attemptId: unknown.attemptId, usage: unknown.accountUsage, includedInKnownTotals: false, finalUsage: "unknown" }])
})
test("BB position rows preserve the registered reason instead of replacing it with a generic pause", () => {
  const p = { ...positions()[0], status: "registered-not-run", attempts: [], unrunReason: "Awaiting the explicitly approved consumer run" }
  expect(api.positionRows([p], [])[0].unrunReason).toBe(p.unrunReason)
})
test("BB funnel separates accepted, current, adopted, bound and checked evidence", () => {
  const report = { attemptId: "case/original", status: "completed", terminalStatus: "completed", finalPresent: true, answerDelivery: "delivered", sourceWorkMetrics: { sourceInterpretationSubmissions: 4, acceptedSourceUnits: 3 }, hostToolCalls: 7, materialUses: [{ kind: "entry" }, { kind: "call" }], propertyAnalysis: { demands: [
    { dependencies: { propertyQueries: { queries: [{ id: "p", questionId: "q", state: "bound" }, { id: "p", questionId: "q", state: "unbound" }] } } },
  ], checks: { questions: [{ properties: [{ status: "unknown", trace: [] }] }] } } }
  const raw = { domain: { materialProjection: { stages: { saved: 3, current: 2, available: 2, projectedUnits: 2, entryUses: 1, callUses: 1, frameworkUses: 0, blocked: 1 } } }, compilationToolCalls: 5, history: [{ call: { id: "read", name: "source_read" }, output: {} }] }
  const result = api.attemptFunnel(report, raw, { wholeOriginalTask: "full" })
  expect(result.materialStages).toMatchObject({ saved: 3, current: 2, available: 2, projectedUnits: 2 })
  expect(result.adoptions).toEqual({ total: 2, entry: 1, call: 1, framework: 0 })
  expect(result.queryBindings).toEqual({ candidates: 2, bound: 1, unbound: 1, distinctProperties: 1, distinctBoundProperties: 1 })
  expect(result.propertyVerdicts).toEqual({ checked: 0, violated: 0, unknown: 1, crossFunction: 0 })
  expect(result.naturalAnswer).toEqual({ delivered: true, wholeOriginalTask: "full" })
  expect(result.hostToolCalls).toBe(7); expect(result.compilationToolCalls).toBe(5)
  expect(result.sourceWorkMetrics).toEqual(report.sourceWorkMetrics)
})
test("BB funnel distinguishes unavailable interrupted data from a zero and a no-DSL arm", () => {
  const unknown = api.attemptFunnel({ attemptId: "consumer/original", materialUses: [], materialUsesAvailable: false, propertyAnalysis: null, sourceWorkMetrics: null }, null, {})
  expect(unknown.domainApplicability).toBe("unknown")
  expect(unknown.adoptions).toBeNull(); expect(unknown.queryBindings).toBeNull(); expect(unknown.propertyVerdicts).toBeNull()
  const noDsl = api.attemptFunnel({ attemptId: "quality-N/original", actualModelInput: { toolNames: ["source_read"] }, materialUses: [] }, { domain: null }, {})
  expect(noDsl.domainApplicability).toBe("not-applicable")
  expect(noDsl.materialStages).toBeNull(); expect(noDsl.adoptions).toBeNull()
})
test("BB first diagnostic follows retained tool chronology without inferring semantic recovery", () => {
  const raw = { domain: {}, history: [
    { call: { id: "a", name: "source_read" }, output: "not-json" },
    { call: { id: "b", name: "authorization_observe" }, output: JSON.stringify({ diagnostics: [{ code: "source-edit-stale", message: "Earlier retained rejection" }] }) },
    { call: { id: "c", name: "authorization_check_result" }, output: { diagnostics: [{ code: "semantic-callee-uninterpreted" }] } },
  ] }
  const result = api.attemptFunnel({ attemptId: "case/original", status: "completed", terminalStatus: "completed", finalPresent: true, answerDelivery: "delivered", materialUses: [] }, raw, {})
  expect(result.firstRecordedDiagnostic).toMatchObject({ historyIndex: 1, callId: "b", toolName: "authorization_observe", code: "source-edit-stale", semanticRecovery: "not-inferred" })
  expect(result.naturalAnswer.delivered).toBe(true)
})
test("BB public inquiry archives retain tool chronology and compilation counts in their native envelope", () => {
  const raw = { domain: {}, native: { compilationToolCalls: 2, history: [{ call: { id: "public", name: "authorization_observe" }, output: { diagnostics: [{ code: "source-edit-stale" }] } }] }, telemetry: { account: { tools: [{ name: "source_read" }] } } }
  const result = api.attemptFunnel({ attemptId: "public/original", materialUses: [] }, raw, {})
  expect(result.firstRecordedDiagnostic).toMatchObject({ callId: "public", code: "source-edit-stale" })
  expect(result.compilationToolCalls).toBe(2); expect(result.sourceReadCalls).toBe(1)
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
