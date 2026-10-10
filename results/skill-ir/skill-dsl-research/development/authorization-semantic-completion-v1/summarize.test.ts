import { expect, test } from "bun:test"
import { qualityPanel, attemptRelationships, studyAccounting } from "./summarize.ts"

const ids = ["quality-n-1", "quality-d-1", "quality-d-2", "quality-n-2"]
const positions = ids.map(id => ({ id, attempts: [`${id}/original`], status: "completed" }))
const claims = ids.map(id => ({ attemptId: `${id}/original`, runtimeTree: "one", model: "gpt-5.6-sol", effort: "high", limits: { maxToolCalls: 64 }, skillIdentity: [{ file: "SKILL.md", sha256: "full" }], sourceFiles: [{ path: "a.py", sha256: "a" }], inputSha256: "original", originalTaskSha256: "original", originalQuestionIds: ["q1", "q2", "q3", "q4"] }))
const reports = ids.map(id => ({ ...claims.find(c => c.attemptId === `${id}/original`), positionId: id, status: "completed", terminalStatus: "completed", answerDelivery: "delivered", finalPresent: true, answerSha256: "answer", actualModelInput: { fullOriginalBundlePrefixMatches: true, originalQuestionsPresent: ["q1", "q2", "q3", "q4"].map(questionId => ({ questionId, present: true })) }, propertyAnalysis: { checks: { questions: [] } } }))
const reviews = reports.map(r => ({ attemptId: r.attemptId, runtimeTree: "one", inputSha256: "original", answerSha256: "answer", status: "source-reviewed", wholeOriginalTask: "full", questions: ["q1", "q2", "q3", "q4"].map(questionId => ({ questionId, quality: "full" })) }))

test("quality includes an undelivered D in its four-position denominator and does not require checked", () => {
  const failed = reports.map(r => r.positionId === "quality-d-1" ? { ...r, status: "failed", terminalStatus: "failed", answerDelivery: "not-delivered", finalPresent: false } : r)
  const panel = qualityPanel(positions, failed, reviews, claims)
  expect(panel.denominator).toBe(4)
  expect(panel.endToEndFull).toBe(3)
  expect(panel.delivered).toBe(3)
  expect(panel.pairs.every(p => p.sameConditions)).toBe(true)
  expect(panel.questions.find(q => q.questionId === "q1")?.counts.undelivered).toBe(1)
  expect(qualityPanel(positions, reports, reviews, claims).endToEndFull).toBe(4)
})

test("quality never merges different runtime epochs or replaces first attempts", () => {
  const revisedPositions = positions.map(p => p.id === "quality-d-1" ? { ...p, attempts: [...p.attempts, "quality-d-1/repair"] } : p)
  const revisedClaim = { ...claims[1]!, attemptId: "quality-d-1/repair", runtimeTree: "two" }
  const revisedReport = { ...reports[1]!, ...revisedClaim }
  const panel = qualityPanel(revisedPositions, [...reports, revisedReport], reviews, [...claims, revisedClaim])
  expect(panel.pairs[0]?.sameConditions).toBe(false)
  expect(panel.rows[1]?.firstAttempt).toBe("quality-d-1/original")
  expect(panel.rows[1]?.revisions).toEqual(["quality-d-1/repair"])
  expect(panel.independentAttempts).toBe(5)
})

test("cost comparison counts automatic reads in the shared tool budget", () => {
  const counted = reports.map(r => ({ ...r, hostToolCalls: r.positionId === "quality-d-1" ? 53 : 63, toolBudget: { totalUsed: r.positionId === "quality-d-1" ? 62 : 63 } }))
  const panel = qualityPanel(positions, counted, reviews, claims)
  expect(panel.rows[1]?.hostToolCalls).toBe(53)
  expect(panel.rows[1]?.toolCalls).toBe(62)
  expect(panel.pairs[0]?.costsDMinusN.tools).toBe(-1)
})

test("aggregate costs deduplicate attempts and keep host calls separate from automatic units", () => {
  const n = { ...reports[0]!, hostToolCalls: 63, toolBudget: { totalUsed: 63, formatRejectCount: 0 } }
  const d = { ...reports[1]!, hostToolCalls: 53, toolBudget: { totalUsed: 62, formatRejectCount: 1 } }
  const costs = studyAccounting([n, d, d])
  expect(costs.attempts).toBe(2)
  expect(costs.tools.totalUsedKnown).toBe(125)
  expect(costs.tools.hostCallsKnown).toBe(116)
  expect(costs.tools.automaticUnitsKnown).toBe(9)
  expect(costs.tools.formatRejectionsKnown).toBe(1)
})

test("retained edits and lowering outcomes are joined per submission, including reused transactions", () => {
  const first = { transactionId: "tx", edits: [{ slot: "role", value: "context" }] }
  const repair = { transactionId: "tx", edits: [{ slot: "role", value: "principal" }] }
  const raw = { domain: { focus: { sourceInterpretations: [
    { event: "edited", focusId: "focus", raw: first },
    { event: "rejected", focusId: "focus", diagnostics: [{ code: "source-interpretation-object-reference" }] },
    { event: "edited", focusId: "focus", raw: repair },
    { event: "lowered", focusId: "focus", diagnostics: [] }
  ], history: [{ focus: { id: "focus", questionId: "q1", handle: "unit" } }] } }, native: { history: [first, repair].map((controlDelta, i) => ({ call: { id: `c${i}`, name: "authorization_observe", arguments: { controlDelta } }, executed: true })) } }
  const relation = attemptRelationships(reports[1], raw, reviews[1])
  expect(relation.sourceSubmissions.map((s: any) => s.editAccepted)).toEqual([true, true])
  expect(relation.sourceSubmissions.map((s: any) => s.sourceInterpretationEventIndex)).toEqual([0, 2])
  expect(relation.sourceSubmissions.map((s: any) => s.loweringEvent)).toEqual(["rejected", "lowered"])
  expect(relation.sourceSubmissions[0]?.loweringDiagnostics[0]?.code).toBe("source-interpretation-object-reference")
})

test("per-question evidence distinguishes prepared unknown, no check and final text delivery", () => {
  const report = { ...reports[1]!, taskPreparation: { questions: [{ questionId: "q1", state: "prepared", origin: "model-task-proposal", properties: [{ id: "p" }] }] }, propertyAnalysis: { checks: { questions: [{ questionId: "q1", properties: [{ propertyId: "p", status: "unknown", trace: [] }] }] } } }
  const raw = { domain: { semantic: { units: [{ questionId: "q1", handle: "unit", source: { id: "source" }, complete: false }] }, focus: { semanticCompletion: [{ questionId: "q1", state: "residual", field: "role" }], sourceInterpretations: [{ event: "edited", focusId: "focus", raw: { transactionId: "tx", edits: [{ slot: "s", value: "call" }] } }], history: [{ focus: { id: "focus", questionId: "q1", handle: "unit" } }] } }, native: { history: [{ call: { id: "c", name: "authorization_observe", arguments: { controlDelta: { transactionId: "tx", edits: [{ slot: "s", value: "call" }] } } }, executed: true, output: { diagnostics: [] } }] } }
  const relation = attemptRelationships(report, raw, reviews[1])
  expect(relation.questions.find(q => q.questionId === "q1")?.propertyStatuses).toEqual(["unknown"])
  expect(relation.questions.find(q => q.questionId === "q2")?.propertyStatuses).toEqual([])
  expect(relation.questions.find(q => q.questionId === "q1")?.completionStates).toEqual({ residual: 1 })
  expect(relation.sourceSubmissions[0]?.transactionId).toBe("tx")
  expect(relation.sourceSubmissions[0]?.questionId).toBe("q1")
  expect(relation.questions[0]?.sourceUnits).toHaveLength(1)
  expect(relation.final.delivery).toBe(true)
})
