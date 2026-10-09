import { test, expect } from "bun:test"
import { prepareTaskProperties, renderTaskPropertyPreparation, TaskPropertyIntentError } from "./property-intent.ts"
import type { AuthorizationInquiry } from "./inquiry.ts"

const original = (): AuthorizationInquiry => ({ schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "download", request: "Inspect downloading" }], questions: [
  { id: "order", operationId: "download", intent: "behavior", request: "Check authorization before returning the file.", premises: [] },
  { id: "scope", operationId: "download", intent: "scope", request: "Which deployment facts remain missing?", premises: [] },
] })
const proposal = () => ({ schemaVersion: "authorization-property-intent/v1", questions: [
  { questionId: "order", state: "proposed", properties: [{ kind: "authorization-before-effect", requirement: "authorization before returning the file" }] },
  { questionId: "scope", state: "residual", reason: "This duty asks for evidence limits, not an executable source property." },
] })
test("task-only property preparation retains every original duty and derives identities without source anchors", () => {
  const input = original(), before = JSON.stringify(input), prepared = prepareTaskProperties(input, proposal())
  expect(prepared.questions.map(q => q.questionId)).toEqual(input.questions.map(q => q.id))
  expect(prepared.questions.map(q => q.state)).toEqual(["prepared", "residual"])
  expect(prepared.questions.every(q => q.state !== "prepared" || q.properties.length > 0)).toBe(true)
  expect(prepared.questions.every(q => q.residualRequest === input.questions.find(o => o.id === q.questionId)!.request)).toBe(true)
  expect(prepared.inquiry.questions[0]!.properties![0]!.id).toMatch(/^task-property-/)
  expect(prepareTaskProperties(input, proposal()).revision).toBe(prepared.revision)
  expect(JSON.stringify(input)).toBe(before)
  expect(JSON.stringify(prepared)).not.toContain("effectAnchorId")
})
test("existing declarations retain their original bytes and are not replaced by model proposals", () => {
  const input = original(); input.questions[0]!.properties = [{ id: "original", kind: "authorization-before-effect", requirement: "authorization before returning the file" }]
  const pending = proposal(); pending.questions.shift()
  expect(prepareTaskProperties(input, pending).questions[0]!.state).toBe("declared")
  expect(prepareTaskProperties(input, pending).inquiry.questions[0]!.properties).toEqual(input.questions[0]!.properties)
  expect(() => prepareTaskProperties(input, proposal())).toThrow(TaskPropertyIntentError)
})
test.each(["duplicate", "cross-question", "verdict", "answer", "illegal-kind", "empty", "missing-question", "extra-question", "permission", "source-anchor"])("rejects %s task proposals before source interpretation", bad => {
  const candidate: any = proposal()
  if (bad === "duplicate") candidate.questions[0].properties.push({ ...candidate.questions[0].properties[0] })
  if (bad === "cross-question") candidate.questions[0].properties[0].requirement = original().questions[1]!.request
  if (bad === "verdict") candidate.questions[0].properties[0].verdict = "checked"
  if (bad === "answer") candidate.answer = "EVALUATOR_SENTINEL"
  if (bad === "illegal-kind") candidate.questions[0].properties[0].kind = "source-is-safe"
  if (bad === "empty") candidate.questions[0].properties = []
  if (bad === "missing-question") candidate.questions.pop()
  if (bad === "extra-question") candidate.questions.push({ questionId: "other", state: "residual", reason: "invented" })
  if (bad === "permission") candidate.questions[0].properties[0].requiredPermission = "invented permission"
  if (bad === "source-anchor") candidate.questions[0].properties[0].effectAnchorId = "effect"
  expect(() => prepareTaskProperties(original(), candidate)).toThrow(TaskPropertyIntentError)
})
test("missing normative policy keeps the original comparison and an explicit clarification state", () => {
  const input: any = original(); input.mode = "conformance"; input.questions[0].intent = "policy-comparison"
  const prepared = prepareTaskProperties(input, proposal())
  expect(prepared.questions[0]!.state).toBe("needs-clarification")
  expect(prepared.diagnostics.some(d => d.code === "policy-required")).toBe(true)
  expect(prepared.inquiry.questions).toHaveLength(2)
  expect(prepared.inquiry.policy).toBeUndefined()
})
test("rendered preparation contains only current tasks, supplied facts and kinds, never source interpretations", () => {
  const rendered = renderTaskPropertyPreparation(original())
  expect(rendered).toContain("authorization before returning the file")
  expect(rendered).toContain("authorized-object-matches-effect")
  expect(rendered).toContain("scope")
  expect(rendered).not.toContain("EVALUATOR_SENTINEL")
})
