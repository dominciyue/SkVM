import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
const api = await import("./summarize.ts").catch(() => ({} as any))
test("costs count unique attempts, include cache only once and keep unknown usage separate", () => {
  const report = { attemptId: "quality-n-1/original", status: "completed", terminalStatus: "completed", accountUsage: { input: 600, output: 30, cachedInput: 400, reasoningOutput: 10 }, hostToolCalls: 3, toolBudget: { totalUsed: 4 }, durationMs: 500 }
  const result = api.studyAccounting([report, report, { ...report, attemptId: "unknown/original", status: "timeout-unknown" }])
  expect(result.attempts).toBe(2); expect(result.known.input).toBe(600); expect(result.known.output).toBe(30)
  expect(result.known.nonCachedInput).toBe(200); expect(result.unknown.attempts).toEqual(["unknown/original"])
  expect(result.actualUsd).toBeNull(); expect(result.tools.automaticUnitsKnown).toBe(2)
})
test("actual account cacheRead and usageDetails reasoning are subsets of total input and output", () => {
  const result = api.studyAccounting([{ attemptId: "current/original", status: "completed", terminalStatus: "completed", accountUsage: { input: 476288, output: 5149, cacheRead: 404096 }, usageDetails: { reasoningOutputTokens: 1341 } }])
  expect(result.known.input).toBe(476288); expect(result.known.cachedInput).toBe(404096)
  expect(result.known.nonCachedInput).toBe(72192); expect(result.known.output).toBe(5149); expect(result.known.reasoningOutput).toBe(1341)
})
test("first attempts are retained separately from repaired epochs and quality has no machine gate", () => {
  const positions = [{ id: "quality-d-1", attempts: ["quality-d-1/original", "quality-d-1/repair-1"] }]
  const rows = api.qualityRows(positions, [{ attemptId: "quality-d-1/original", status: "completed", finalPresent: true, propertyAnalysis: { checks: { questions: [{ properties: [{ status: "unknown" }] }] } } }], [], [], "first")
  expect(rows.find((r: any) => r.id === "quality-d-1").selectedAttempt).toBe("quality-d-1/original")
  expect(rows.find((r: any) => r.id === "quality-d-1").delivered).toBe(true)
})
test("an active registered attempt keeps its pending row before a final report exists", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "be-active-summary-")), attemptId = "quality-d-1/original", dir = path.join(root, "attempts", attemptId)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(root, "manifest.json"), JSON.stringify({ positions: [{ id: "quality-d-1", status: "running", attempts: [attemptId] }] }))
  await writeFile(path.join(root, "status.json"), JSON.stringify({ status: "in-progress", activeAttempts: [attemptId] }))
  await writeFile(path.join(dir, "claim.json"), JSON.stringify({ attemptId, positionId: "quality-d-1", originalQuestionIds: ["a", "b", "c", "d"] }))
  const result = await api.summarizeStudy(root)
  expect(result.qualityFirst.rows.find((r: any) => r.id === "quality-d-1").status).toBe("running")
  expect(result.qualityFirst.delivered).toBe(0); expect(result.accounting.known.input).toBe(0)
})
test("a named D-only epoch comparison needs an explicit unchanged control proof and adds no control cost", () => {
  const common = { inputSha256: "input", originalQuestionIds: ["q1", "q2", "q3", "q4"], skillIdentity: [{ file: "SKILL.md", sha256: "skill" }], model: "model", effort: "high", limits: { maxToolCalls: 64 }, sourceFiles: [{ path: "source.py", sha256: "source" }], evaluatorProvidedToRuntime: false, hiddenModelCalls: 0 }
  const control = { ...common, attemptId: "quality-h-1/original", positionId: "quality-h-1", runtimeTree: "old", gitRevision: "old-git", actualModelInput: { fullOriginalBundlePrefixMatches: true, originalQuestionsPresent: common.originalQuestionIds.map(questionId => ({ questionId, present: true })), systemSha256: "system" }, status: "completed", terminalStatus: "completed", finalPresent: true, answerSha256: "control-answer", accountUsage: { input: 10, output: 2 } }
  const revision = { ...control, attemptId: "quality-d-1/fix-1", positionId: "quality-d-1", runtimeTree: "new", gitRevision: "new-git", answerSha256: "revision-answer", accountUsage: { input: 20, output: 3 } }
  const contract = { reason: "D-only supported predicate documentation", codeEpoch: "new", gitRevision: "new-git", comparableControls: [control.attemptId], controlCompatibilityEvidenceSha256: "proof" }
  const claims = [control, { ...revision, revisionContract: contract }]
  const reviews = [control, revision].map(r => ({ attemptId: r.attemptId, answerSha256: r.answerSha256, inputSha256: r.inputSha256, runtimeTree: r.runtimeTree, status: "source-reviewed", questions: common.originalQuestionIds.map(questionId => ({ questionId, quality: "partial" })) }))
  const proof = { sha256: "proof", evidence: { providerCalls: 0, controls: [{ attemptId: control.attemptId, originalRuntimeTree: "old", originalSystemSha256: "system", systemUnchanged: true, toolsUnchanged: true, guideAbsent: true }] } }
  expect(api.namedRevisionComparisons([control, revision], reviews, claims, undefined)[0].conclusion).toBe("inconclusive")
  const result = api.namedRevisionComparisons([control, revision], reviews, claims, proof)[0]
  expect(result.conclusion).toBe("no-observed-difference"); expect(result.controlReuse).toBe(true)
  expect(result.costsAddedMinusBase.input).toBe(10)
  expect(api.studyAccounting([control, revision, control]).known.input).toBe(30)
  expect(api.namedRevisionComparisons([control, revision], reviews, claims, { ...proof, sha256: "wrong" })[0].conclusion).toBe("inconclusive")
  expect(api.namedRevisionComparisons([control, revision], reviews, [control, { ...claims[1], revisionContract: { ...contract, codeEpoch: "unrelated" } }], proof)[0].conclusion).toBe("inconclusive")
})

test("a change pair reports source-reviewed tradeoffs independently of unknown properties and observed savings", () => {
  const common = { positionId: "policy-fresh", inputSha256: "input", originalQuestionIds: ["q1", "q2", "q3", "q4"], skillIdentity: [{ file: "SKILL.md", sha256: "skill" }], model: "model", effort: "high", limits: { maxToolCalls: 64 }, sourceFiles: [{ path: "source.py", sha256: "source" }], runtimeTree: "current", evaluatorProvidedToRuntime: false, hiddenModelCalls: 0, status: "completed", finalPresent: true, actualModelInput: { fullOriginalBundlePrefixMatches: true, originalQuestionsPresent: ["q1", "q2", "q3", "q4"].map(questionId => ({ questionId, present: true })) }, propertyAnalysis: { checks: { questions: [{ questionId: "q1", properties: [{ propertyId: "p", status: "unknown", trace: [] }] }] } } }
  const fresh = { ...common, attemptId: "policy-fresh/original", answerSha256: "fresh", accountUsage: { input: 100, output: 10 }, toolBudget: { totalUsed: 20 }, durationMs: 500 }
  const previous = { ...fresh, positionId: "policy-previous", attemptId: "policy-previous/original", answerSha256: "previous", baselineAttemptId: "quality-d-1/original", accountUsage: { input: 80, output: 8 }, toolBudget: { totalUsed: 18 }, durationMs: 600, reuse: { materialsRestored: 1, materialsUsed: 0, layers: { R2: { available: false } } } }
  const reviews = [fresh, previous].map((r, i) => ({ attemptId: r.attemptId, answerSha256: r.answerSha256, inputSha256: r.inputSha256, runtimeTree: r.runtimeTree, status: "source-reviewed", questions: ["q1", "q2", "q3", "q4"].map((questionId, index) => ({ questionId, quality: (i ? ["full", "full", "full", "partial"] : ["partial", "full", "partial", "full"])[index] })) }))
  const result = api.changeComparisons([fresh, previous], [fresh, previous], reviews, [{ attemptId: fresh.attemptId, toolDistribution: { source_read: 4, authorization_declare: 2 } }, { attemptId: previous.attemptId, toolDistribution: { source_read: 5 } }])[0]
  expect(result.conclusion).toBe("tradeoff"); expect(result.sameConditions).toBe(true)
  expect(result.costsPreviousMinusFresh).toEqual({ input: -20, output: -2, tools: -2, durationMs: 100 })
  expect(result.observedRequests.sourceReadDifference).toBe(1); expect(result.observedRequests.declarationDifference).toBe(-2)
  expect(result.observedRequests.causalSavingsCertified).toBe(false); expect(result.actualReuse.materialsUsed).toBe(0)
  expect(result.currentPropertyStatuses[1][0].status).toBe("unknown")
  const stale = [{ ...reviews[0], answerSha256: "wrong" }, reviews[1]]
  expect(api.changeComparisons([fresh, previous], [fresh, previous], stale, [])[0].conclusion).toBe("inconclusive")
  expect(api.changeComparisons([fresh, { ...previous, runtimeTree: "changed" }], [fresh, { ...previous, runtimeTree: "changed" }], reviews, [])[0].conclusion).toBe("inconclusive")
})

test("a verified not-started attempt has no model cost and keeps its local overhead outside unknown completion", () => {
  const r = { attemptId: "source-previous/original", status: "unavailable", terminalStatus: "not-started", inferenceDispatched: false, accountUsage: null, durationMs: 63000, hostToolCalls: 0, toolBudget: { totalUsed: 1 } }
  const result = api.studyAccounting([r, r])
  expect(result.attempts).toBe(1); expect(result.known.input).toBe(0); expect(result.unknown.attempts).toEqual([])
  expect(result.notDispatched.attempts).toEqual([r.attemptId]); expect(result.notDispatched.durationMs).toBe(63000)
  expect(result.known.durationMs).toBe(0); expect(result.totalLocalDurationMs).toBe(63000)
  expect(result.tools.automaticUnitsKnown).toBe(1)
})

test("a change comparison uses only a registered same-epoch recovery of a definitely undispatched first attempt", () => {
  const common = { inputSha256: "input", originalQuestionIds: ["q1", "q2", "q3", "q4"], skillIdentity: [{ file: "SKILL.md", sha256: "skill" }], model: "model", effort: "high", limits: { maxToolCalls: 64 }, sourceFiles: [{ path: "source.py", sha256: "source" }], runtimeTree: "current", evaluatorProvidedToRuntime: false, hiddenModelCalls: 0, status: "completed", terminalStatus: "completed", finalPresent: true, actualModelInput: { fullOriginalBundlePrefixMatches: true, originalQuestionsPresent: ["q1", "q2", "q3", "q4"].map(questionId => ({ questionId, present: true })) } }
  const fresh = { ...common, positionId: "source-fresh", attemptId: "source-fresh/original", answerSha256: "fresh" }
  const first = { ...common, positionId: "source-previous", attemptId: "source-previous/original", status: "unavailable", terminalStatus: "not-started", inferenceDispatched: false, finalPresent: false, actualModelInput: null }
  const recovery = { ...common, positionId: "source-previous", attemptId: "source-previous/cli-version-1", answerSha256: "recovery" }
  const contract = { reason: "Restore exact original verified CLI", recoveryKind: "local-configuration-before-inference", recoveryFrom: first.attemptId, codeEpoch: "current", comparableControls: [fresh.attemptId] }
  const claims = [fresh, first, { ...recovery, revisionContract: contract }]
  const reviews = [fresh, recovery].map(r => ({ attemptId: r.attemptId, answerSha256: r.answerSha256, inputSha256: r.inputSha256, runtimeTree: r.runtimeTree, status: "source-reviewed", questions: common.originalQuestionIds.map(questionId => ({ questionId, quality: "partial" })) }))
  const result = api.changeComparisons([fresh, first, recovery], claims, reviews, [])[2]
  expect(result.attempts).toEqual([fresh.attemptId, recovery.attemptId]); expect(result.firstAttempts).toEqual([fresh.attemptId, first.attemptId])
  expect(result.retainedNotStartedAttempt).toBe(first.attemptId); expect(result.conclusion).toBe("no-observed-difference")
  const dispatched = { ...first, terminalStatus: "failed", inferenceDispatched: true }
  expect(api.changeComparisons([fresh, dispatched, recovery], claims, reviews, [])[2].attempts[1]).toBe(first.attemptId)
  expect(api.changeComparisons([fresh, first, recovery], [fresh, first, { ...recovery, revisionContract: { ...contract, codeEpoch: "wrong" } }], reviews, [])[2].attempts[1]).toBe(first.attemptId)
  const duplicate = { ...recovery, attemptId: "source-previous/other-recovery" }
  expect(api.changeComparisons([fresh, first, recovery, duplicate], [...claims, { ...duplicate, revisionContract: contract }], reviews, [])[2].attempts[1]).toBe(first.attemptId)
  const stopped = { ...first, attemptId: "source-previous/path-start-failed" }, stoppedClaim = { ...stopped, revisionContract: contract }
  expect(api.changeComparisons([fresh, first, stopped, recovery], [...claims, stoppedClaim], reviews, [])[2].attempts[1]).toBe(recovery.attemptId)
  expect(api.changeComparisons([fresh, first, { ...stopped, inferenceDispatched: true, terminalStatus: "unknown" }, recovery], [...claims, stoppedClaim], reviews, [])[2].attempts[1]).toBe(first.attemptId)
})
