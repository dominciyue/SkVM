import { test, expect } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { captureAttempt, settleAttempt, claimDispatchLock, recordPreflightFailure } from "./runner.ts"
import { accounting, qualifiedBaseline } from "./summarize.ts"
import { assertAttemptClaim } from "../authorization-interprocedural-property-v1/study.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
test("cancelled source preparation exits with zero model dispatch and retained phase", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bc-runner-cancel-")), controller = new AbortController(); controller.abort(); let dispatched = 0
  const run = await captureAttempt(async onProgress => { await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["."], preparation: { signal: controller.signal, onProgress } }); dispatched++; return {} })
  const settled = settleAttempt(undefined, run.preparation, run.error)
  expect(dispatched).toBe(0); expect(settled.inferenceDispatched).toBe(false)
  expect(settled.status).toBe("preparation-cancelled")
  expect(run.preparation.at(-1)?.state).toBe("cancelled")
})
test("timeout retains partial usage outside final totals and cannot become a completed terminal", () => {
  const account = { status: "timeout-unknown", terminalStatus: "unknown", inferenceDispatched: true, usage: { input: 30, output: 2, cacheRead: 20, cacheWrite: 0 } }
  expect(settleAttempt(account, [], undefined).status).toBe("timeout-unknown")
  const costs = accounting([{ attemptId: "a/original", status: account.status, terminalStatus: account.terminalStatus, accountUsage: account.usage }])
  expect(costs.known.input).toBe(0); expect(costs.unknownUsageAttempts).toEqual(["a/original"])
  expect(costs.partialPreInterruptionUsage[0]?.includedInKnownTotals).toBe(false)
})
test("references are deduplicated and cached input is not added a second time", () => {
  const report = { attemptId: "a/original", status: "completed", terminalStatus: "completed", accountUsage: { input: 30, output: 2, cacheRead: 20, cacheWrite: 0 } }
  const costs = accounting([report, structuredClone(report)])
  expect(costs.attempts).toBe(1); expect(costs.known.input).toBe(30)
  expect(() => accounting([report, { ...report, accountUsage: { ...report.accountUsage, input: 31 } }])).toThrow("Conflicting")
})
test("a zero-dispatch preparation failure has explicit zero model usage, not an unknown completion", () => {
  const settled = settleAttempt(undefined, [{ phase: "ast", state: "failed", detail: "owned-worker-exited", elapsedMs: 10 } as any], "preparation failure")
  expect(settled.status).toBe("preparation-failed"); expect(settled.terminalStatus).toBe("not-dispatched")
  expect(accounting([{ attemptId: "a/original", ...settled }]).unknownUsageAttempts).toEqual([])
})
test("a public previous rejection is retained as blocked with zero dispatch", () => {
  const settled = settleAttempt(undefined, [], undefined, { status: "needs-fresh-analysis", providerCalls: 0, reuseEligibility: { status: "not-reusable", reason: "source changed" } })
  expect(settled.status).toBe("blocked-previous"); expect(settled.inferenceDispatched).toBe(false)
})
test("first attempts and the single-writer lock cannot be silently replaced", async () => {
  expect(() => assertAttemptClaim(["native-download/original"])).toThrow()
  expect(() => assertAttemptClaim(["native-download/original"], "repair-1")).not.toThrow()
  const directory = await mkdtemp(path.join(os.tmpdir(), "bc-lock-")), lock = path.join(directory, "dispatch.lock"), release = await claimDispatchLock(lock, "a/original")
  try { await expect(claimDispatchLock(lock, "b/original")).rejects.toThrow("already exists") } finally { await release() }
})
test("readiness failure persists its zero-dispatch boundary without claiming an inference attempt", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bc-readiness-")), file = await recordPreflightFailure(directory, "source-previous/original", new Error("missing current input"), 12)
  const record = JSON.parse(await readFile(file, "utf8"))
  expect(record.phase).toBe("input-readiness"); expect(record.inferenceDispatched).toBe(false)
  expect(record.terminalStatus).toBe("not-dispatched"); expect(record.attemptClaimed).toBe(false)
  expect(record.reason).toContain("missing current input")
})
function baselineFixture() {
  const sourceFiles = [{ path: "entry.py", sha256: "entry-sha" }, { path: "helper.py", sha256: "helper-sha" }], questions = [{ id: "q", request: "Inspect authorization before download" }]
  const property = { id: "p", kind: "authorization-before-effect", requirement: "authorization before download" }
  const basis = { inputSha256: "original-input", questions, sourceFiles, model: "gpt-5.6-sol", effort: "high", limits: { maxToolCalls: 64 }, skillIdentity: [{ file: "SKILL.md", sha256: "skill-sha", bytes: 1 }] }
  const claim = { attemptId: "pilot/original", inputSha256: basis.inputSha256, originalTaskSha256: basis.inputSha256, originalQuestionIds: ["q"], runtimeTree: "epoch", sourceFiles, model: basis.model, effort: basis.effort, limits: basis.limits, skillIdentity: basis.skillIdentity }
  const report = { attemptId: claim.attemptId, inputSha256: basis.inputSha256, answerSha256: "answer-sha", status: "completed", terminalStatus: "completed", answerDelivery: "delivered", finalPresent: true, sessionPath: "session", method: "D1", strategy: "task-binding-v1", runtimeTree: "epoch", sourceVerification: { valid: true }, taskPreparation: { schemaVersion: "authorization-task-properties/v1", questions: [{ questionId: "q", residualRequest: questions[0]!.request, origin: "model-task-proposal", state: "prepared", properties: [property] }] }, propertyAnalysis: { checks: { questions: [{ questionId: "q", properties: [{ propertyId: property.id, kind: property.kind, status: "checked", trace: ["call", "guard"], traceDetails: sourceFiles.map((s, i) => ({ source: { id: `source-${i}`, ...s } })) }] }] } } }
  const review = { attemptId: claim.attemptId, inputSha256: basis.inputSha256, answerSha256: report.answerSha256, runtimeTree: "epoch", status: "source-reviewed", propertyReviews: [{ questionId: "q", propertyId: property.id, kind: property.kind, requirement: property.requirement, sourceSupported: true }] }
  return { basis, claim, report, review }
}
test("a reusable baseline is the reviewed current original-task property and source identity", () => {
  const f = baselineFixture(); expect(qualifiedBaseline(f.report, f.review, "epoch", f.claim, f.basis)).toBe(true)
})
for (const mismatch of ["source", "model", "effort", "property-kind", "task-span", "question-order", "stale-review", "trace-source"] as const) test(`previous rejects a ${mismatch} mismatch before dispatch`, () => {
  const f: any = baselineFixture()
  if (mismatch === "source") f.claim.sourceFiles = [{ path: "other.py", sha256: "other" }]
  if (mismatch === "model") f.claim.model = "other-model"
  if (mismatch === "effort") f.claim.effort = "low"
  if (mismatch === "property-kind") f.report.taskPreparation.questions[0].properties[0].kind = "effect-reachability"
  if (mismatch === "task-span") f.report.taskPreparation.questions[0].properties[0].requirement = "unasked property"
  if (mismatch === "question-order") f.claim.originalQuestionIds = ["other"]
  if (mismatch === "stale-review") f.review.answerSha256 = "old-answer"
  if (mismatch === "trace-source") f.report.propertyAnalysis.checks.questions[0].properties[0].traceDetails[1].source.sha256 = "stale"
  expect(qualifiedBaseline(f.report, f.review, "epoch", f.claim, f.basis)).toBe(false)
})
