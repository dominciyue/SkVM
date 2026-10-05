import { expect, test } from "bun:test"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { parseInquiryStrategy } from "./control-slice.ts"

const declaration = () => ({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "create-item", request: "Assess item creation", entryHint: "items.create" }], questions: [
  { id: "behavior", request: "Which caller can create the item?", operationId: "create-item", intent: "behavior", premises: [] },
  { id: "scope", request: "Which source-visible limits remain?", operationId: "create-item", intent: "scope", premises: [] },
] })
test("one operation shares entry work while retaining all questions and original input", () => {
  const input = declaration(), before = structuredClone(input), p = compileAuthorizationInquiry(input)
  expect(p.status).toBe("ready")
  expect(p.questions.map(q => q.id)).toEqual(["behavior", "scope"])
  expect(p.queue.filter(i => i.kind === "entry")).toHaveLength(1)
  expect(p.queue).toHaveLength(6)
  expect(input).toEqual(before)
})
test("absent and duplicate operation references are rejected", () => {
  const input = declaration(); input.questions[1]!.operationId = "absent"
  expect(compileAuthorizationInquiry(input).status).toBe("needs-input")
  const duplicate = declaration(); duplicate.operations.push({ ...duplicate.operations[0]! })
  expect(compileAuthorizationInquiry(duplicate).status).toBe("needs-input")
})
test("different operations are never silently merged, policy and scope do not locate new entries", () => {
  const input = declaration(); input.operations.push({ id: "other", request: "Another create", entryHint: "other.create" })
  input.questions.push({ id: "other", request: "Other caller", operationId: "other", intent: "behavior", premises: [] })
  expect(compileAuthorizationInquiry(input).queue.filter(i => i.kind === "entry")).toHaveLength(2)
  const policy = declaration(); policy.questions.push({ id: "policy", request: "Compare independent policy", operationId: "create-item", intent: "policy-comparison", premises: [] })
  expect(compileAuthorizationInquiry(policy).queue.filter(i => i.kind === "entry")).toHaveLength(1)
})
test("v1 keeps six duties per question and opt-in strategy is accepted", () => {
  const v1 = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "a", request: "create", premises: [] }, { id: "b", request: "create", premises: [] }] }
  expect(compileAuthorizationInquiry(v1).queue).toHaveLength(12)
  expect(parseInquiryStrategy("operation-evidence-v1")).toBe("operation-evidence-v1")
})
