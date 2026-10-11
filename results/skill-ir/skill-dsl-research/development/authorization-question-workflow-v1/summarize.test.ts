import { expect, test } from "bun:test"
const api = await import("./summarize.ts").catch(() => ({} as any))
test("costs count unique attempts, include cache only once and keep unknown usage separate", () => {
  const report = { attemptId: "quality-n-1/original", status: "completed", terminalStatus: "completed", accountUsage: { input: 600, output: 30, cachedInput: 400, reasoningOutput: 10 }, hostToolCalls: 3, toolBudget: { totalUsed: 4 }, durationMs: 500 }
  const result = api.studyAccounting([report, report, { ...report, attemptId: "unknown/original", status: "timeout-unknown" }])
  expect(result.attempts).toBe(2); expect(result.known.input).toBe(600); expect(result.known.output).toBe(30)
  expect(result.known.nonCachedInput).toBe(200); expect(result.unknown.attempts).toEqual(["unknown/original"])
  expect(result.actualUsd).toBeNull(); expect(result.tools.automaticUnitsKnown).toBe(2)
})
test("first attempts are retained separately from repaired epochs and quality has no machine gate", () => {
  const positions = [{ id: "quality-d-1", attempts: ["quality-d-1/original", "quality-d-1/repair-1"] }]
  const rows = api.qualityRows(positions, [{ attemptId: "quality-d-1/original", status: "completed", finalPresent: true, propertyAnalysis: { checks: { questions: [{ properties: [{ status: "unknown" }] }] } } }], [], [], "first")
  expect(rows.find((r: any) => r.id === "quality-d-1").selectedAttempt).toBe("quality-d-1/original")
  expect(rows.find((r: any) => r.id === "quality-d-1").delivered).toBe(true)
})
