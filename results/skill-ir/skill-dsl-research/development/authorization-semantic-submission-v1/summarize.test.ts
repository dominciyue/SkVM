import { expect, test } from "bun:test"
import { positions } from "./study.ts"

const api = await import("./summarize.ts").catch(() => ({})) as any

test("BA observation separates actual callbacks, source use, bound queries and checked traces", () => {
  expect(typeof api.observeArchive).toBe("function")
  const report = { sourceWorkMetrics: { acceptedSourceUnits: 1 }, toolBudget: { formatRejectCount: 2 }, resultPresent: false }
  const native = { account: { tools: [{}, {}], toolRejections: [{}] }, contextPayloads: [{ originalBytes: 20, sentBytes: 12 }, { originalBytes: 7, sentBytes: 5 }], domain: { schedulerActions: [{ name: "source_read" }, { name: "source_search" }], materialUses: [{}], checkHistory: [{}], propertyAnalysis: { demands: [{ dependencies: { propertyQueries: { queries: [{ state: "bound" }, { state: "unbound" }] } } }], checks: { questions: [{ properties: [{ status: "checked", trace: ["material-step"] }, { status: "unknown", trace: [] }] }] } } } }
  expect(api.observeArchive(report, native)).toMatchObject({ dynamicCalls: 3, automaticReads: 1, formatRejects: 2, acceptedUnits: 1, materialUses: 1, boundQueries: 1, checkedProperties: 1, tracedProperties: 1, checkHistoryCount: 1, contextBytes: { original: 27, sent: 17 } })
  expect(api.observeArchive({}, {})).toMatchObject({ dynamicCalls: null, automaticReads: null, acceptedUnits: null, materialUses: null, boundQueries: null, checkedProperties: null, contextBytes: null })
})

test("first attempts and current revisions remain separate with fixed22/12 denominators", () => {
  expect(typeof api.buildSummary).toBe("function")
  const rows = positions(); rows[2]!.attempts = ["first", "repair"]
  const facts = [{ attemptId: "first", positionId: rows[2]!.id, finalPresent: true, sourceQuality: "partial", runtimeTree: "old", startedAt: "1", accountUsage: { input: 100, output: 10, cacheRead: 80 }, hostToolCalls: 3, durationMs: 100 }, { attemptId: "repair", positionId: rows[2]!.id, finalPresent: true, sourceQuality: "full", runtimeTree: "new", startedAt: "2", accountUsage: null, hostToolCalls: 1, durationMs: null }]
  const result = api.buildSummary({ identity: "authorization-semantic-submission-v1", positions: rows, outcomes: {} }, { status: "in-progress", accountChannel: {} }, facts)
  expect(result.summary.registeredPositions).toBe(22)
  expect(result.summary.quality.denominator).toBe(12)
  expect(result.summary.quality.rows[0].sourceQuality).toBe("partial")
  expect(result.summary.attemptsInActualOrder).toHaveLength(2)
  expect(result.summary.extraRepairAttempts).toBe(1)
  expect(result.summary.comparison.conclusion).toBe("inconclusive")
  expect(result.accounting.knownTokenTotals).toMatchObject({ input: 100, output: 10, cacheRead: 80, total: 110 })
  expect(result.accounting.usageUnknownAttempts).toEqual(["repair"])
  expect(result.accounting.providerRequests).toBeNull()
  expect(() => api.buildSummary({ identity: "x", positions: rows, outcomes: {} }, {}, [facts[0], facts[0]])).toThrow("duplicate")
})
