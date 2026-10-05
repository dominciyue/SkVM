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
