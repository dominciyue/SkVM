import { expect, test } from "bun:test"
const api = await import("./resource-program-draft.ts").catch(() => ({} as any))

test("draft revisions merge only explicit step edits and survive serialization", () => {
  expect(typeof api.createProgramDraft).toBe("function")
  const first = api.createProgramDraft({ id: "p", scope: { questionId: "q" }, resourceWorkflow: { inputs: [], steps: [{ id: "a", op: "value", value: { literal: 7 } }, { id: "b", op: "return", value: { ref: "a" } }] } })
  const changed = api.patchProgramDraft(first, { baseRevision: first.revision, upsertSteps: [{ id: "a", op: "value", value: { bad: true } }] })
  expect(changed.draft.raw.resourceWorkflow.steps[1]).toEqual(first.raw.resourceWorkflow.steps[1])
  expect(changed.draft.raw.resourceWorkflow.steps[0].value).toEqual({ bad: true })
  const restored = JSON.parse(JSON.stringify(changed.draft))
  const fixed = api.patchProgramDraft(restored, { baseRevision: restored.revision, upsertSteps: [{ id: "a", op: "value", value: { literal: 9 } }, { id: "c", op: "value", value: { literal: 3 } }] }).draft
  expect(fixed.raw.resourceWorkflow.steps.map((s: any) => s.id)).toEqual(["a", "b", "c"])
  const removed = api.patchProgramDraft(fixed, { baseRevision: fixed.revision, upsertSteps: [], removeStepIds: ["a"] }).draft
  expect(removed.raw.resourceWorkflow.steps.map((s: any) => s.id)).toEqual(["b", "c"])
  expect(api.patchProgramDraft(removed, { baseRevision: first.revision, upsertSteps: [] }).diagnostics[0].code).toBe("program-patch-stale")
  expect(api.createProgramDraft({ id: "p", scope: { questionId: "q" } }, fixed).raw.resourceWorkflow).toEqual(fixed.raw.resourceWorkflow)
  expect(api.createProgramDraft({ id: "p", scope: { questionId: "other" } }, fixed).raw.resourceWorkflow).toBeUndefined()
  expect(api.createProgramDraft({ id: "p", scope: { questionId: "q", root: { path: "a.py", startLine: 2 } } }, fixed).raw.resourceWorkflow).toEqual(fixed.raw.resourceWorkflow)
})

test("patch rejects ambiguous edits without mutating the current draft", () => {
  expect(typeof api.createProgramDraft).toBe("function")
  const first = api.createProgramDraft({ resourceWorkflow: { inputs: [], steps: [{ id: "a" }, { id: "a" }] } })
  const result = api.patchProgramDraft(first, { baseRevision: first.revision, upsertSteps: [{ id: "a", op: "return" }] })
  expect(result.draft).toEqual(first)
  expect(result.diagnostics.length).toBeGreaterThan(0)
})
