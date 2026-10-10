import { expect, test } from "bun:test"
import { qualityReady, qualifiedReuse, positionConfiguration } from "./study.ts"
test("quality admission includes unknown D while reuse requires source-reviewed current material", () => {
  const report = { status: "completed", strategy: "semantic-completion-v1", propertyAnalysis: { checks: { questions: [{ properties: [{ status: "unknown", traceDetails: [] }] }] } } }
  expect(qualityReady({ status: "valid" }, true, 4)).toBe(true)
  expect(qualifiedReuse(report, {}, "current")).toBe(false)
  expect(qualityReady({ status: "invalid" }, true, 4)).toBe(false)
  expect(qualityReady({ status: "valid" }, false, 4)).toBe(false)
  expect(qualityReady({ status: "valid" }, true, 3)).toBe(false)
})
test("registered N/D positions share bounds and public session entrance", () => {
  const n = positionConfiguration("quality-n-1"), d = positionConfiguration("quality-d-1")
  expect(n.domainTools).toBe(false); expect(n.strategy).toBe("legacy")
  expect(d.domainTools).toBe(true); expect(d.strategy).toBe("semantic-completion-v1")
  expect(n.limits).toEqual(d.limits); expect(n.entrance).toBe(d.entrance)
  expect(() => positionConfiguration("native-download")).toThrow("registered BD")
  expect(positionConfiguration("extraction-download").limits.maxToolCalls).toBe(12)
})
test("a reusable verdict must retain the same model, bundle and current source scope", () => {
  const sourceFiles = [{ path: "a.py", sha256: "a" }, { path: "b.py", sha256: "b" }], skillIdentity = [{ file: "SKILL.md", sha256: "original" }]
  const report: any = { attemptId: "quality-d-1/original", positionId: "quality-d-1", status: "completed", terminalStatus: "completed", answerDelivery: "delivered", finalPresent: true, strategy: "semantic-completion-v1", runtimeTree: "current", sessionPath: "ordinary-session", sourceVerification: { valid: true }, originalQuestionIds: ["q1", "q2", "q3", "q4"], inputSha256: "original", answerSha256: "answer", model: "gpt-5.6-sol", effort: "high", limits: positionConfiguration("quality-d-1").limits, skillIdentity, sourceFiles, actualModelInput: { fullOriginalBundlePrefixMatches: true }, taskPreparation: { questions: [{ questionId: "q1", origin: "model-task-proposal", properties: [{ id: "p", kind: "authorization-before-effect" }] }] }, propertyAnalysis: { checks: { questions: [{ questionId: "q1", properties: [{ propertyId: "p", kind: "authorization-before-effect", status: "checked", trace: ["a", "b"], traceDetails: sourceFiles.map((source, i) => ({ source: { ...source, id: String(i) } })) }] }] } } }
  const review = { status: "source-reviewed", attemptId: report.attemptId, answerSha256: "answer", inputSha256: "original", runtimeTree: "current", propertyReviews: [{ questionId: "q1", propertyId: "p", sourceSupported: true }] }, basis = { skillIdentity, sourceFiles, questionIds: report.originalQuestionIds }
  expect(qualifiedReuse(report, review, "current", "original", basis)).toBe(true)
  expect(qualifiedReuse({ ...report, model: "other" }, review, "current", "original", basis)).toBe(false)
  expect(qualifiedReuse({ ...report, skillIdentity: [{ file: "SKILL.md", sha256: "other" }] }, review, "current", "original", basis)).toBe(false)
  expect(qualifiedReuse(report, review, "current", "original", { ...basis, sourceFiles: [{ path: "a.py", sha256: "changed" }] })).toBe(false)
})
