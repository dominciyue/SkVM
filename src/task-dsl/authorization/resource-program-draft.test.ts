import { expect, test } from "bun:test"
import { executeResourceWorkflow, inspectResourceDraft } from "./resource-relations.ts"
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

const source = { path: "fixture.py", startLine: 1 }
const value = { id: "value", op: "value", value: { literal: 7 }, source }
const result = { id: "result", op: "return", value: { ref: "value" }, source }
const guard = { id: "permission", op: "guard", test: { op: "eq", left: { literal: 1 }, right: { literal: 2 } }, failure: "denied", source }
const draft = () => api.createProgramDraft({ id: "p", resourceWorkflow: { inputs: [], steps: [value, result] } })

test("explicit order inserts a false guard before return and executes the rejection", () => {
  const first = draft()
  const patched = api.patchProgramDraft(first, { baseRevision: first.revision, upsertSteps: [guard], stepOrder: ["value", "permission", "result"] })
  expect(patched.diagnostics).toEqual([])
  expect(patched.draft.raw.resourceWorkflow.steps.map((s: any) => s.id)).toEqual(["value", "permission", "result"])
  const run = executeResourceWorkflow(patched.draft.raw.resourceWorkflow, {})
  expect(run.termination).toBe("denied")
  expect(run.returned).toBeUndefined()
  expect(run.events.map(e => e.id)).toEqual(["value", "permission"])
  expect(first.raw.resourceWorkflow.steps).toEqual([value, result])
})

test("value before return computes while explicit value after return keeps the missing ref", () => {
  const first = draft(), newValue = { ...value, id: "extra", value: { literal: 19 } }, changedReturn = { ...result, value: { ref: "extra" } }
  for (const [order, expected] of [[["value", "extra", "result"], 19], [["value", "result", "extra"], undefined]] as const) {
    const patched = api.patchProgramDraft(first, { baseRevision: first.revision, upsertSteps: [newValue, changedReturn], stepOrder: [...order] })
    expect(patched.diagnostics).toEqual([])
    const run = executeResourceWorkflow(patched.draft.raw.resourceWorkflow, {})
    expect(run.returned).toBe(expected)
    if (expected === undefined) expect(run.gaps).toContain("extra")
  }
})

test("invalid complete orders and stale edits are rejected atomically", () => {
  const first = draft()
  for (const stepOrder of [["value"], ["value", "value"], ["value", "other"], ["value", "result", "permission"]]) {
    const rejected = api.patchProgramDraft(first, { baseRevision: first.revision, upsertSteps: [], stepOrder })
    expect(rejected.diagnostics[0].code).toBe("program-patch-order")
    expect(rejected.draft).toEqual(first)
  }
  const removed = api.patchProgramDraft(first, { baseRevision: first.revision, upsertSteps: [], removeStepIds: ["value"], stepOrder: ["value", "result"] })
  expect(removed.diagnostics[0].code).toBe("program-patch-order")
  expect(removed.draft).toEqual(first)
  expect(api.patchProgramDraft(first, { baseRevision: "stale", upsertSteps: [guard], stepOrder: ["permission", "value", "result"] }).diagnostics[0].code).toBe("program-patch-stale")
  expect(first).toEqual(draft())
})

test("legacy append keeps its order and exposes the declared unreachable step", () => {
  const first = draft(), patched = api.patchProgramDraft(first, { baseRevision: first.revision, upsertSteps: [guard] })
  expect(patched.draft.raw.resourceWorkflow.steps.map((s: any) => s.id)).toEqual(["value", "result", "permission"])
  const run = executeResourceWorkflow(patched.draft.raw.resourceWorkflow, {})
  expect(run.returned).toBe(7)
  expect(run.events.some(e => e.id === "permission")).toBe(false)
  expect((inspectResourceDraft(patched.draft.raw.resourceWorkflow) as any).unreachableSteps).toEqual([{ id: "permission", index: 2, after: "result" }])
})
