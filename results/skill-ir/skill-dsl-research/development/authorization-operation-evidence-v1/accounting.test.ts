import { expect, test } from "bun:test"
import * as accounting from "./accounting.ts"
import { sumUsage } from "../authorization-semantic-lowering-v1/accounting.ts"

test("raw ordinary capture binds cumulative calls and tokens once while missing dollars remain unknown", () => {
  const tokens = { input: 10, output: 2, cacheRead: 3, cacheWrite: 0 }, records = [{ type: "request" }, { type: "response", tokens }, { type: "request" }, { type: "response", tokens }], retained = { providerCalls: 2, respondedCalls: 2, knownTokens: { input: 20, output: 4, cacheRead: 6, cacheWrite: 0 } }
  const measured = (accounting as any).measureCapture(records, retained)
  expect(measured.calls).toHaveLength(2)
  expect(measured.account.knownTokens).toEqual(retained.knownTokens)
  expect(sumUsage([measured.account]).totalActualUsd).toBeNull()
  expect(() => (accounting as any).measureCapture(records, { ...retained, providerCalls: 1 })).toThrow()
  expect(() => (accounting as any).measureCapture(records, { ...retained, knownTokens: tokens })).toThrow()
})
test("author target executions require exact-report-bound independent raw audit, not a source-only prompt", () => {
  const review = { schemaVersion: "au-independent-author-evaluation/v1", sha256: "original", targetExecutionAudit: { verified: true, targetExecutions: 0 } }
  expect((accounting as any).targetExecutions("author", {}, review, "original")).toBe(0)
  expect((accounting as any).targetExecutions("author", { targetExecutions: 0 }, undefined, "original")).toBeNull()
  expect((accounting as any).targetExecutions("author", {}, { ...review, sha256: "wrong" }, "original")).toBeNull()
  expect((accounting as any).targetExecutions("native", { targetExecutions: null }, undefined, "original")).toBeNull()
  expect((accounting as any).targetExecutions("debug", {}, undefined, "original")).toBe(0)
})
test("panel preserves missing positions, failed firsts, known repairs and review hashes without quality promotion", () => {
  const rows = [{ id: "first", task: "fixture", kind: "debug", arm: "D-O" }, { id: "missing", task: "fixture", kind: "consumer", arm: "D-O" }], attempts = [{ id: "first", attempt: 1, artifact: "first/1", sha256: "one", status: "transport-failed", revision: "old", account: {} }, { id: "first", attempt: 2, artifact: "first/2", sha256: "two", status: "completed-with-diagnostics", revision: "new", account: {} }], review = { artifact: "first/2", sha256: "two", grade: "partial", researchAcceptance: false }
  const panel = (accounting as any).buildPanel(rows, attempts, [review], [{ id: "missing", status: "blocked-dependent-author", providerCalls: 0 }])
  expect(panel[0].first.status).toBe("transport-failed")
  expect(panel[0].lastKnown.review.grade).toBe("partial")
  expect(panel[0].repairs).toEqual(["first/2"])
  expect(panel[1].first).toBeNull()
  expect(panel[1].status).toBe("blocked-dependent-author")
  expect(() => (accounting as any).buildPanel(rows, attempts, [{ ...review, sha256: "edited" }], [])).toThrow()
})

test("finite queue closure retains archived unknowns while valid zero-call admissions close unrun positions", () => {
  const retained = { status: "completed-with-unmet-criteria", finiteQueueComplete: true, researchGoalAchieved: true }
  const rows = [{ id: "finished", task: "fixture" }, { id: "blocked", task: "fixture" }]
  const attempts = [{ id: "finished", attempt: 1, row: { task: "fixture" }, artifact: "finished/1", sha256: "original", status: "completion-unknown", completionUnknown: true, account: {} }]
  const admission = { id: "blocked", task: "fixture", status: "blocked-sealed-unknown-completion", providerCalls: 0, cause: "finished/1", causeSha256: "original" }
  const panel = accounting.buildPanel(rows, attempts, [], [admission])
  const result = (accounting as any).queueConclusion(retained, panel, attempts, 0)
  expect(result).toMatchObject({ status: "completed-with-unmet-criteria", finiteQueueComplete: true, researchGoalAchieved: false, completionUnknownAttempts: 1, unresolvedPositions: [] })
  expect((accounting as any).queueConclusion(retained, panel, attempts, 1).finiteQueueComplete).toBe(false)
  expect((accounting as any).queueConclusion({ ...retained, finiteQueueComplete: false }, panel, attempts, 0).status).toBe("in-progress")
  for (const invalid of [undefined, { ...admission, providerCalls: 1 }, { ...admission, causeSha256: "changed" }, { ...admission, task: "other" }, { ...admission, status: "not-dispatched" }]) {
    const pending = accounting.buildPanel(rows, attempts, [], invalid ? [invalid] : [])
    expect((accounting as any).queueConclusion(retained, pending, attempts, 0)).toMatchObject({ status: "in-progress", finiteQueueComplete: false, researchGoalAchieved: false, unresolvedPositions: ["blocked"] })
  }
  const known = [{ ...attempts[0], status: "completed", completionUnknown: false }]
  expect((accounting as any).queueConclusion(retained, accounting.buildPanel(rows, known, [], [admission]), known, 0)).toMatchObject({ status: "completed", researchGoalAchieved: true, completionUnknownAttempts: 0 })
})

test("operation counts use explicit ordinary or structured program metadata without guessing from units or questions", () => {
  const count = (accounting as any).originalOperationCount
  expect(count({ program: { operations: [{}] }, domain: { program: { operations: [{}, {}] } } })).toBe(1)
  expect(count({ domain: { program: { operations: [{}, {}] } } })).toBe(2)
  expect(count({ program: { operations: [] } })).toBe(0)
  expect(count({ program: { operations: "two", questions: [{}, {}] }, domain: { semantic: { units: [{}] } } })).toBeNull()
})

test("early source review fields remain hash-bound and original bytes are not rewritten by projection", () => {
  const original = { schemaVersion: "authorization-au-source-review/v1", report: "first/1", reportSha256: "original", mainAdjudication: { overall: "partial", formal: { sourceBound: true, ruleConsistency: false } } }, before = structuredClone(original)
  const review = (accounting as any).reviewProjection(original)
  expect(review).toMatchObject({ artifact: "first/1", sha256: "original", grade: "partial", mainAdjudication: original.mainAdjudication })
  expect(original).toEqual(before)
  expect((accounting as any).reviewProjection({ schemaVersion: "unrelated-proof/v1" })).toBeUndefined()
  const rows = [{ id: "first" }], attempts = [{ id: "first", attempt: 1, artifact: "first/1", sha256: "original", account: {} }]
  expect(accounting.buildPanel(rows, attempts, [review], [])[0]!.first!.review!.grade).toBe("partial")
  expect(() => accounting.buildPanel(rows, attempts, [{ ...review, sha256: "changed" }], [])).toThrow()
})
