import { expect, test } from "bun:test"
import { acceptAuthoredInquiry } from "./authoring-assist.ts"
import { renderNaturalInquiryAuthorTask, runAuthorizationInquiry } from "./inquiry-run.ts"
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
