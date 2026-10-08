import { expect, test } from "bun:test"
import { positions } from "./study.ts"
import { aggregateUsage, qualityPanel } from "./summarize.ts"

test("account totals include cached input once and retain unknown failed-session usage", () => {
  const rows = [{ attemptId: "a", accountUsage: { input: 1000, output: 10, cacheRead: 800, cacheWrite: 0 }, hostToolCalls: 3, durationMs: 20 }, { attemptId: "b", accountUsage: null, hostToolCalls: 0, durationMs: 5 }]
  const value = aggregateUsage(rows)
  expect(value.knownTokenTotals).toEqual({ input: 1000, output: 10, cacheRead: 800, cacheWrite: 0, total: 1010, inputExcludingCacheRead: 200 })
  expect(value.usageUnknownAttempts).toEqual(["b"])
  expect(value.allUsageReported).toBe(false)
  expect(value.hostToolCalls).toBe(3)
  expect(value.durationMs).toBe(25)
  expect(value.actualUsd).toBeNull()
  expect(value.providerRequests).toBeNull()
  expect(() => aggregateUsage([rows[0]!, rows[0]!])).toThrow("duplicate")
})

test("quality retains all twelve positions, protocol failures and unrun rows rather than selecting delivered answers", () => {
  const registered = positions(), quality = registered.filter(p => p.kind === "quality")
  for (const row of quality.slice(0, 3)) row.attempts = [`${row.id}/original`]
  const facts = quality.slice(0, 3).map((p, i) => ({ attemptId: p.attempts[0]!, positionId: p.id, finalPresent: i < 2, status: i < 2 ? "completed" : "failed", sourceQuality: i === 0 ? "full" : i === 1 ? "partial" : "undelivered", resultPresent: false, domainTools: i !== 0, formatBudgetExhausted: i === 1 }))
  const panel = qualityPanel(registered, facts)
  expect(panel.denominator).toBe(12)
  expect(panel.attempted).toBe(3)
  expect(panel.unrun).toBe(9)
  expect(panel.naturalDelivered).toBe(2)
  expect(panel.sourceFull).toBe(1)
  expect(panel.sourcePartial).toBe(1)
  expect(panel.undelivered).toBe(1)
  expect(panel.protocolAndSourceFull).toBe(1)
  expect(panel.machineResults).toBe(0)
  expect(panel.rows).toHaveLength(12)
})
