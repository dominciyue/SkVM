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
test("a malformed or unshown neighboring answer does not erase a valid local answer", () => {
  const multi = { ...plan(), questions: [...plan().questions, { ...plan().questions[0]!, id: "q2" }] }
  const good = { questionId: "q1", behavior: { disposition: "allow", explanation: "Source-visible effect" }, branches: [], evidenceIds: ["e1"], missing: [] }
  for (const bad of [{ ...good, questionId: "q2", evidenceIds: ["unshown"] }, { questionId: "q2", behavior: "invalid", branches: [], evidenceIds: [], missing: [] }]) {
    const checked = validateAuthorizationInquiryResult(multi, { schemaVersion: "authorization-inquiry-result/v1", questions: [good, bad], observations: [], scope: "source" }, { questionIds: ["q1", "q2"], shownEvidenceIds: ["e1"] }) as any
    expect(checked.valid).toBe(false)
    expect(checked.result).toBeUndefined()
    expect(checked.questionChecks.find((q: any) => q.questionId === "q1")).toMatchObject({ transportValid: true, referenceValid: true, ruleConsistent: null, evidenceCoverage: "unreviewed", semanticReview: "unreviewed", deliveryStatus: "unverified" })
    expect(checked.questionChecks.find((q: any) => q.questionId === "q2").deliveryStatus).toBe("rejected")
    expect(checked.usableQuestions).toEqual([good])
  }
})

test("rejected evidence never exports a canonical result while retaining the raw local candidate", () => {
  const answer = { questionId: "q1", behavior: { disposition: "allow", explanation: "Unsupported effect" }, branches: [], evidenceIds: [], missing: [] }
  const checked = validateAuthorizationInquiryResult(plan(), { schemaVersion: "authorization-inquiry-result/v1", questions: [answer], observations: [], scope: "source" }, { questionIds: ["q1"], shownEvidenceIds: [] })
  expect(checked.valid).toBe(false)
  expect(checked.result).toBeUndefined()
  expect(checked.questionChecks[0]).toMatchObject({ referenceValid: false, deliveryStatus: "rejected", answer })
  expect(checked.usableQuestions).toEqual([])
})

test("global structure or source invalidation rejects every local delivery", () => {
  const multi = { ...plan(), questions: [...plan().questions, { ...plan().questions[0]!, id: "q2" }] }
  const questions = multi.questions.map(q => ({ questionId: q.id, behavior: { disposition: "allow" as const, explanation: "Source effect" }, branches: [], evidenceIds: ["e1"], missing: [] }))
  const input = { schemaVersion: "authorization-inquiry-result/v1", questions, observations: [], scope: "source" }
  const context = { questionIds: ["q1", "q2"], shownEvidenceIds: ["e1"] }
  const sourceFailure = { code: "source-invalidated", path: "$source", message: "Source changed", severity: "error" as const }
  const domain = { diagnostics: [sourceFailure], questionChecks: context.questionIds.map(questionId => ({ questionId, ruleConsistent: true, evidenceCoverage: "bounded" as const, diagnostics: [] })) }
  for (const checked of [validateAuthorizationInquiryResult(multi, { ...input, scope: null }, context), validateAuthorizationInquiryResult(multi, input, context, domain)]) {
    expect(checked.valid).toBe(false)
    expect(checked.result).toBeUndefined()
    expect(checked.usableQuestions).toEqual([])
    expect(checked.questionChecks.every(q => q.deliveryStatus === "rejected")).toBe(true)
  }
  expect(validateAuthorizationInquiryResult(multi, input, context, domain).questionChecks.every(q => !q.referenceValid)).toBe(true)
})

test("observation errors remain owned and duplicate answers cannot become usable", () => {
  const multi = { ...plan(), questions: [...plan().questions, { ...plan().questions[0]!, id: "q2" }] }
  const questions = multi.questions.map(q => ({ questionId: q.id, behavior: { disposition: "allow" as const, explanation: "Source effect" }, branches: [], evidenceIds: ["e1"], missing: [] }))
  const context = { questionIds: ["q1", "q2"], shownEvidenceIds: ["e1"] }
  for (const observation of [{ ...obs, questionId: "q2", state: 1 }, { ...obs, questionId: "q2", evidenceIds: [] }]) {
    const checked = validateAuthorizationInquiryResult(multi, { schemaVersion: "authorization-inquiry-result/v1", questions, observations: [observation], scope: "source" }, context)
    expect(checked.questionChecks.map(q => q.deliveryStatus)).toEqual(["unverified", "rejected"])
    expect(checked.usableQuestions).toEqual([questions[0]!])
  }
  const duplicated = validateAuthorizationInquiryResult(multi, { schemaVersion: "authorization-inquiry-result/v1", questions: [...questions, questions[0]], observations: [], scope: "source" }, context)
  expect(duplicated.questionChecks.map(q => q.deliveryStatus)).toEqual(["rejected", "unverified"])
  expect(duplicated.usableQuestions).toEqual([questions[1]!])
})
test("formal consistency and unresolved evidence are separate layers for a valid local unknown", () => {
  const value = { questionId: "q1", behavior: { disposition: "unknown", explanation: "Decisive helper unavailable" }, branches: [], evidenceIds: [], missing: [{ kind: "source-gap", detail: "helper unread" }] }
  const domain = { diagnostics: [], questionChecks: [{ questionId: "q1", ruleConsistent: true, evidenceCoverage: "unresolved" as const, diagnostics: [], trace: { rules: [], paths: [], uncovered: ["helper"] } }] }
  const checked = validateAuthorizationInquiryResult(plan(), { schemaVersion: "authorization-inquiry-result/v1", questions: [value], observations: [], scope: "source" }, { questionIds: ["q1"], shownEvidenceIds: [] }, domain) as any
  expect(checked.valid).toBe(true)
  expect(checked.questionChecks[0]).toMatchObject({ ruleConsistent: true, evidenceCoverage: "unresolved", semanticReview: "unreviewed", deliveryStatus: "checked" })
})
