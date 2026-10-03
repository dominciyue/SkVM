import { expect, test } from "bun:test"
import { zodToJsonSchema } from "../../providers/structured.ts"
import { AuthorizationInquiryInputSchema } from "./inquiry-local.ts"
const api = await import("./inquiry-local.ts") as any
const base = { schemaVersion: "authorization-inquiry-input/v1", taskId: "neutral", repository: "sample", sourceRef: "fixed", sourceRoot: "./source", allowedPaths: ["src"] }
const question = { id: "q", request: "May a visitor reserve an exhibit?", premises: [] }
const policy = { text: "Only curators may reserve.", origin: "user", location: "current-policy" }
const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "conformance", questions: [question], policy }
const contract = (mode: "behavior" | "conformance") => {
  expect(typeof api.authorizationInquiryAuthoringSchema).toBe("function")
  return api.authorizationInquiryAuthoringSchema(mode)
}
test("complete authoring format does not advertise the conflicting natural-input branch", () => {
  const schema = contract("conformance"), advertised = zodToJsonSchema(schema) as any
  expect(advertised.required).toContain("inquiry")
  for (const name of ["brief", "mode", "policy"]) expect(advertised.properties[name]).toBeUndefined()
  expect(advertised.additionalProperties).toBe(false)
  expect(schema.safeParse({ ...base, inquiry, brief: question.request, mode: "conformance", policy }).success).toBe(false)
  expect(schema.safeParse({ ...base, brief: question.request, mode: "conformance", policy }).success).toBe(false)
})
test("conformance authoring format publishes its mode and required independent policy", () => {
  const schema = contract("conformance"), advertised = (zodToJsonSchema(schema) as any).properties.inquiry
  expect(advertised.required).toContain("policy")
  expect(advertised.properties.mode.const).toBe("conformance")
  expect(schema.safeParse({ ...base, inquiry: { ...inquiry, policy: undefined } }).success).toBe(false)
  expect(schema.safeParse({ ...base, inquiry: { ...inquiry, mode: "behavior" } }).success).toBe(false)
  expect(AuthorizationInquiryInputSchema.safeParse(schema.parse({ ...base, inquiry })).success).toBe(true)
})
test("behavior authoring format omits policy and retains the runtime inquiry refinements", () => {
  const schema = contract("behavior"), advertised = (zodToJsonSchema(schema) as any).properties.inquiry
  expect(advertised.properties.policy).toBeUndefined()
  expect(schema.safeParse({ ...base, inquiry: { ...inquiry, mode: "behavior" } }).success).toBe(false)
  const behavior = { schemaVersion: inquiry.schemaVersion, mode: "behavior", questions: [question] }
  expect(AuthorizationInquiryInputSchema.safeParse(schema.parse({ ...base, inquiry: behavior })).success).toBe(true)
  expect(schema.safeParse({ ...base, inquiry: { ...behavior, questions: [question, question] } }).success).toBe(false)
})
test("authoring and ordinary input keep the same relative source boundary", () => {
  const schema = contract("conformance")
  for (const sourceRoot of ["/absolute", "C:/absolute", "bad\0root"]) expect(schema.safeParse({ ...base, inquiry, sourceRoot }).success).toBe(false)
  expect(AuthorizationInquiryInputSchema.safeParse({ ...base, brief: question.request }).success).toBe(true)
})
