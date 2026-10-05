import { expect, test } from "bun:test"
import { acceptAuthoredInquiry } from "./authoring-assist.ts"
import { renderNaturalInquiryAuthorTask, runAuthorizationInquiry } from "./inquiry-run.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
test("natural author input has only current brief and supplied policy, provenance preserves authored questions", () => {
  const brief = "May a visitor reserve an exhibit?", mode = "behavior" as const
  const value = { schemaVersion: "authorization-inquiry/v1", mode, questions: [{ id: "visitor-reservation", request: brief, premises: [] }] }
  const accepted = acceptAuthoredInquiry(value, { brief, mode })
  expect(accepted.provenance.modelAuthored).toContain("questions")
  expect(accepted.inquiry.questions[0]!.principal).toBeUndefined()
  const prompt = renderNaturalInquiryAuthorTask(brief, mode)
  expect(prompt).not.toContain("currentTask")
  expect(prompt).not.toContain("GetSharedMemo")
  expect(() => acceptAuthoredInquiry({ ...value, mode: "conformance", policy: { text: "Old policy", origin: "user", location: "old" } }, { brief, mode: "conformance", policy: { text: "New policy", origin: "user", location: "new" } })).toThrow("supplied")
})
test("operation author guide demonstrates shared duties without merging genuinely distinct user actions", () => {
  const prompt = renderNaturalInquiryAuthorTask("Inspect reserving an exhibit and cancelling a reservation.", "behavior", undefined, "operation-evidence-v1")
  expect(prompt).toContain("Reporting responsibilities are not separate operations")
  const marker = "Unrelated declaration example: "
  expect(prompt).toContain(marker)
  const example = JSON.parse(prompt.split(marker)[1]!.split("\n")[0]!), program = compileAuthorizationInquiry(example)
  expect(program.status).toBe("ready")
  expect(program.operations).toHaveLength(2)
  expect(program.questions.filter(q => q.operationId === "reserve")).toHaveLength(3)
  expect(program.questions.find(q => q.id === "cancel-behavior")!.operationId).toBe("cancel")
  expect(program.queue.filter(i => i.kind === "entry")).toHaveLength(2)
})
