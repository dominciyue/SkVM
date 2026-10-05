import { test, expect } from "bun:test"
import { makePanel, capturedProviderRecords, proofStatus } from "./accounting.ts"

test("AT proof accounting requires checked delivery rather than valid unreviewed format", () => {
  const report = { status: "completed", result: {}, validation: { valid: true, questionChecks: [{ deliveryStatus: "unverified", evidenceCoverage: "unreviewed" }] } }
  expect(proofStatus(report)).toEqual({ checked: false, bounded: false })
  report.validation.questionChecks[0] = { deliveryStatus: "checked", evidenceCoverage: "unresolved" }
  expect(proofStatus(report)).toEqual({ checked: true, bounded: false })
  report.validation.questionChecks[0].evidenceCoverage = "bounded"
  expect(proofStatus(report)).toEqual({ checked: true, bounded: true })
  expect(proofStatus({ ...report, sourceVerification: { valid: false } })).toEqual({ checked: false, bounded: false })
  expect(proofStatus({ ...report, status: "completion-unknown" })).toEqual({ checked: false, bounded: false })
})

test("actual author capture indexes requests and preserves missing usage and price", () => {
  const { account, calls } = capturedProviderRecords([{ type: "request" }, { type: "response", tokens: { input: 10, output: 5, cacheRead: 4, cacheWrite: 0 } }, { type: "request" }, { type: "response", tokens: { output: 2, cacheRead: 0, cacheWrite: 0 } }])
  expect(account.providerCalls).toBe(2)
  expect(account.respondedCalls).toBe(2)
  expect(account.unknownUsageCalls).toBe(1)
  expect(account.tokensStatus).toBe("partial")
  expect(account.totalActualUsd).toBeNull()
  expect(calls[0]!.requestRecordIndex).toBe(0)
  expect(calls[0]!.responseRecordIndex).toBe(1)
})

test("AT accounting keeps firsts, repairs and source adequacy independent of formal closure", () => {
  const manifest = { rows: [{ id: "anonymous", kind: "quality", task: "example", studyArm: "D-F" }], authors: [] }
  const base = { id: "anonymous", row: manifest.rows[0], originalArtifact: "runs/anonymous/attempt-1/report.json", originalArtifactSha256: "a", originalStatus: "completed-with-diagnostics", account: { providerCalls: 2, respondedCalls: 2, unknownUsageCalls: 0, tokensStatus: "complete", knownTokens: { input: 10, output: 5, cacheRead: 4, cacheWrite: 0 }, totalActualUsd: null }, checked: false }
  const panel = makePanel(manifest, [{ ...base, attempt: 1 }, { ...base, attempt: 2, originalArtifact: "runs/anonymous/attempt-2/report.json", originalArtifactSha256: "b", checked: true }], [{ row: "anonymous", report: base.originalArtifact, reportSha256: "a", grade: "full", originalTaskSufficient: true }], [])
  expect(panel[0]!.first!.sourceReview!.grade).toBe("full")
  expect(panel[0]!.first!.checked).toBe(false)
  expect(panel[0]!.lastKnown!.sourceReview).toBeNull()
  expect(panel[0]!.repairs).toHaveLength(1)
  expect(panel[0]!.allAttempts.knownFullPrompt).toBe(28)
  expect(panel[0]!.allAttempts.totalActualUsd).toBeNull()
})

test("AT accounting refuses a source review whose exact report hash differs", () => {
  const manifest = { rows: [{ id: "anonymous", kind: "quality" }], authors: [] }
  expect(() => makePanel(manifest, [{ id: "anonymous", attempt: 1, originalArtifact: "runs/anonymous/attempt-1/report.json", originalArtifactSha256: "actual", account: {} }], [{ row: "anonymous", report: "runs/anonymous/attempt-1/report.json", reportSha256: "stale", grade: "full" }], [])).toThrow("review hash")
})
