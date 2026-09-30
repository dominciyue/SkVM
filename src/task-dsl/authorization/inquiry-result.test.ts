import { expect, test } from "bun:test"
import { validateInquiryObservations, validateAuthorizationInquiryResult } from "./inquiry-result.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"

const plan = () => compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q1", request: "Who can update?", premises: [] }] })
const obs = { questionId: "q1", kind: "guard", subject: "caller", object: "record", claim: "An ownership guard applies", state: "observed", evidenceIds: ["not-read"] }
test("unread, unbound, missing evidence and unknown question observations are rejected", () => {
  const context = { questionIds: ["q1", "q2"], shownEvidenceIds: ["e1"], evidenceQuestions: { e1: ["q2"] } }
  expect(validateInquiryObservations([obs], context).some(item => item.code === "evidence-not-shown")).toBe(true)
  expect(validateInquiryObservations([{ ...obs, evidenceIds: ["e1"] }], context).some(item => item.code === "evidence-question-mismatch")).toBe(true)
  expect(validateInquiryObservations([{ ...obs, evidenceIds: [] }], context).some(item => item.code === "observed-without-evidence")).toBe(true)
  expect(validateInquiryObservations([{ ...obs, questionId: "other" }], context).some(item => item.code === "unknown-question")).toBe(true)
})
test("behavior result never fabricates a policy comparison and unknown names its gap", () => {
  const value = { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "unknown", explanation: "The helper is outside the supplied files." }, branches: [], evidenceIds: [], missing: [{ kind: "source-gap", detail: "No helper body supplied", nextRead: "Find authorizeRecord" }] }], observations: [], scope: "Provided source only" }
  expect(validateAuthorizationInquiryResult(plan(), value, { questionIds: ["q1"], shownEvidenceIds: [] }).valid).toBe(true)
  expect(validateAuthorizationInquiryResult(plan(), { ...value, questions: [{ ...value.questions[0], missing: [] }] }, { questionIds: ["q1"], shownEvidenceIds: [] }).valid).toBe(false)
  expect(validateAuthorizationInquiryResult(plan(), { ...value, questions: [{ ...value.questions[0], policyAssessment: { status: "satisfied", explanation: "Fake policy" } }] }, { questionIds: ["q1"], shownEvidenceIds: [] }).valid).toBe(false)
})
test("duplicate/conflicting branch conditions diagnose without declaring semantic safety", () => {
  const branch = { id: "b1", condition: "Caller is owner", disposition: "allow", explanation: "Owner guard", evidenceIds: ["e1"] }
  const value = { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q1", behavior: { disposition: "conditional", explanation: "Depends on ownership" }, branches: [branch, { ...branch, id: "b2", disposition: "deny" }], evidenceIds: ["e1"], missing: [] }], observations: [], scope: "Provided source only" }
  const checked = validateAuthorizationInquiryResult(plan(), value, { questionIds: ["q1"], shownEvidenceIds: ["e1"] })
  expect(checked.diagnostics.some(item => item.code === "duplicate-branch-condition")).toBe(true)
  expect(checked.semanticSupport).toBe("unreviewed")
})
