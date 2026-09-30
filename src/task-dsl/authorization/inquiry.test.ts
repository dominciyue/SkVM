import { expect, test } from "bun:test"
import { AuthorizationInquirySchema } from "./inquiry.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"

const behavior = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q1", request: "Who can update a record?", premises: [] }] }
test("behavior compiles without policy, expectation or inferred actors and conditions", () => {
  expect(AuthorizationInquirySchema.safeParse(behavior).success).toBe(true)
  const plan = compileAuthorizationInquiry(behavior)
  expect(plan.status).toBe("ready")
  expect(plan.questions[0]?.premises).toEqual([])
  expect(plan.questions[0]?.principal).toBeUndefined()
  expect(JSON.stringify(plan)).not.toContain('"expectation"')
  expect(JSON.stringify(plan)).not.toContain('"policy"')
  expect(plan.queue.every(item => item.state === "pending")).toBe(true)
})
test("conformance requires an independent normative policy with a named diagnostic", () => {
  expect(AuthorizationInquirySchema.safeParse({ ...behavior, mode: "conformance" }).success).toBe(false)
  expect(compileAuthorizationInquiry({ ...behavior, mode: "conformance" }).diagnostics.some(item => item.code === "policy-required")).toBe(true)
  const withPolicy = { ...behavior, mode: "conformance", policy: { text: "Only record owners may update.", origin: "user" as const, location: "brief#/policy" } }
  expect(compileAuthorizationInquiry(withPolicy).status).toBe("ready")
  expect(compileAuthorizationInquiry(withPolicy).policy).toEqual(withPolicy.policy)
})
test("strict inquiry rejects source-derived policy, duplicate questions and future fields", () => {
  expect(AuthorizationInquirySchema.safeParse({ ...behavior, mode: "conformance", policy: { text: "Current code", origin: "source", location: "src" } }).success).toBe(false)
  expect(compileAuthorizationInquiry({ ...behavior, questions: [behavior.questions[0], behavior.questions[0]] }).status).toBe("needs-input")
  expect(AuthorizationInquirySchema.safeParse({ ...behavior, futureChange: "Different policy" }).success).toBe(false)
})
