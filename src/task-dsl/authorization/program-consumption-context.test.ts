import { expect, test } from "bun:test"
const api = await import("./program-consumption-context.ts").catch(() => ({} as any))
const author = await import("./program-authoring-context.ts")
test("trial details require the exact current draft and never substitute active events", () => {
  const report = { currentDraft: { revision: "d", raw: { resourceWorkflow: { steps: [{ id: "result" }] } } }, trials: [{ revision: "d", status: "completed", cases: [{ id: "alternate", execution: { returned: 19, events: [{ id: "result", outputs: { value: 19 } }] } }] }], resourceExecution: { returned: 7 } }
  expect(api.programConsumptionDetails(report, { view: "draft", expectedRevision: "d", trialCaseId: "alternate" }).execution.returned).toBe(19)
  expect(api.programConsumptionDetails(report, { view: "draft", trialCaseId: "alternate" }).status).toBe("trial-revision-required")
  expect(api.programConsumptionDetails({ ...report, currentDraft: { ...report.currentDraft, revision: "new" } }, { view: "draft", expectedRevision: "new", trialCaseId: "alternate" }).status).toBe("trial-detail-not-found")
})
test("draft details without a candidate stays readable", () => {
  for (const report of [undefined, {}, { currentDraft: { raw: {} } }, { revision: "old", resourceExecution: { events: [{ id: "old" }] } }]) {
    expect(() => api.programConsumptionDetails(report, { view: "draft" })).not.toThrow()
    expect(api.programConsumptionDetails(report, { view: "draft" }).steps).toEqual([])
    expect(api.programConsumptionDetails(report, { view: "draft" }).events).toEqual([])
  }
  const report = { currentDraft: { revision: "draft", raw: { resourceWorkflow: { steps: [{ id: "new" }] } } }, candidate: { revision: "other", resourceExecution: { events: [{ id: "old" }] } } }
  expect(api.programConsumptionDetails(report, { view: "draft" }).steps).toEqual([{ id: "new" }])
  expect(api.programConsumptionDetails(report, { view: "draft" }).events).toEqual([])
})
test("author input binding identifies the draft question gap without copying other question facts", () => {
  const questions = [{ id: "available" }, { id: "chosen" }]
  const report = { scope: { questionId: "available" }, currentDraft: { raw: { scope: { questionId: "chosen" }, resourceWorkflow: { inputs: ["actor", "rows"] } } } }
  const context = author.projectProgramTaskContext({ report, questions, programMode: "edit", resourceInputs: { available: { actor: { id: 934827 }, rows: [] } } })
  const progress = context.authoring!
  expect(progress.inputBindings.questionId).toBe("chosen")
  expect(progress.inputBindings.missingDeclaredNames).toEqual(["actor", "rows"])
  expect(progress.inputBindings.suppliedScopes).toEqual([{ questionId: "available", inputNames: ["actor", "rows"], valueShapes: { actor: { kind: "object", fields: ["id"] }, rows: { kind: "collection", rowCount: 0, fields: [] } }, externalAssumptionNames: [], operationId: undefined }])
  expect(JSON.stringify(progress.inputBindings)).not.toContain("934827")
})
test("malformed raw workflow stays inspectable during author recovery without leaking the active execution", () => {
  const raw = { scope: { questionId: "q" }, resourceWorkflow: { steps: { broken: true } } }, before = structuredClone(raw)
  const report = { currentDraft: { revision: "draft-bad", raw }, currentDraftDiagnostics: [{ code: "contract-resource-shape" }], revision: "active", resourceExecution: { events: [{ id: "old", outputs: { value: 7 } }] } }
  const context = author.projectProgramAuthoring(report, [{ id: "q" }])
  expect(context.draftRevision).toBe("draft-bad")
  const details: any = api.programConsumptionDetails(report, { view: "draft", expectedRevision: "draft-bad" })
  expect(details.program).toEqual(raw)
  expect(details.steps).toEqual([])
  expect(details.events).toEqual([])
  expect(details.diagnostics[0].code).toBe("contract-resource-shape")
  expect(raw).toEqual(before)
})
test("compact preserves the authored branch rule even when a scenario skips it", () => {
  const rule = { id: "include_hidden", op: "value", value: { test: { op: "not", arg: { op: "is-null", value: { binding: "request.selection" } } } }, when: { op: "truthy", language: "python", value: { binding: "enabled" } }, source: { path: "a.py", startLine: 1 }, because: "Actual source condition" }
  const report = { program: { id: "p", resourceWorkflow: { inputs: ["request"], steps: [rule] } }, resourceExecution: { events: [{ id: rule.id, op: rule.op, outcome: "skipped", outputs: { value: null }, gaps: [] }] } }
  const compact = api.projectProgramConsumption(report, [], "compact")
  expect(compact.rules[0].value).toEqual(rule.value)
  expect(compact.rules[0].when).toEqual(rule.when)
  expect(compact.rules[0].source).toEqual(rule.source)
  expect(api.projectProgramConsumption(report, [], "full")).toBe(report)
})
test("compact consumption preserves current results and gaps while details recover exact events", () => {
  expect(typeof api.projectProgramConsumption).toBe("function")
  const event = { id: "selected", op: "select", outcome: "computed", source: { path: "a.py", startLine: 1, sha256: "current" }, inputs: { candidates: Array(64).fill({ id: 1, large: "x".repeat(300) }) }, outputs: { known: true, value: { id: 1 } }, gaps: [], meaningOrigin: "authored-program" }
  const report = { revision: "p1", program: { id: "p", resourceWorkflow: { inputs: ["rows"], steps: [{ id: "selected", op: "select" }] } }, scope: { questionId: "q", upstream: ["authentication unknown"] }, status: "current", currentDraft: { revision: "d1", raw: { hidden: "x".repeat(1000) } }, drafts: [{ raw: { old: "x".repeat(1000) } }], resourceExecution: { inputs: { rows: event.inputs.candidates }, values: { selected: { id: 1 } }, events: [event], returned: { id: 1 }, conditions: [], gaps: ["storage unknown"], semanticSupport: "unreviewed" } }
  const questions = [{ id: "q", request: "Select" }, { id: "other", request: "Original other duty" }]
  const full = api.projectProgramConsumption(report, questions, "full"), compact = api.projectProgramConsumption(report, questions, "compact")
  expect(full).toEqual(report)
  expect(compact.returned).toEqual(report.resourceExecution.returned)
  expect(compact.gaps).toContain("storage unknown")
  expect(compact.questions[1].resourceStepIds).toEqual([])
  expect(compact.semanticSupport).toBe("unreviewed")
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length / 4)
  expect(api.programConsumptionDetails(report, { stepId: "selected" }).events).toEqual([event])
  expect(api.programConsumptionDetails(report, { questionId: "other" }).events).toEqual([])
  const changed = structuredClone(report); changed.resourceExecution.inputs.rows = []; changed.resourceExecution.returned.id = 2
  expect(api.projectProgramConsumption(changed, questions, "compact").inputRevision).not.toBe(compact.inputRevision)
  const stale = api.projectProgramConsumption({ ...report, status: "invalidated", resourceExecution: undefined }, questions, "compact")
  expect(stale.returned).toBeUndefined()
  expect(stale.status).toBe("invalidated")
})

test("draft details enforce their own revision and do not expose the active preview as candidate output", () => {
  const report = { revision: "active-1", scope: { questionId: "q" }, program: { scope: { questionId: "q" }, resourceWorkflow: { steps: [{ id: "result", value: 7 }] } }, resourceExecution: { events: [{ id: "result", outputs: { value: 7 } }] }, currentDraft: { revision: "draft-2", raw: { scope: { questionId: "other" }, resourceWorkflow: { steps: [{ id: "result", value: 9 }] } } }, candidate: { revision: "draft-2", adopted: false, diagnostics: ["bad source"] } }
  expect(api.programConsumptionDetails(report, { view: "draft", expectedRevision: "active-1" }).status).toBe("stale-program-reference")
  const current = api.programConsumptionDetails(report, { view: "draft", expectedRevision: "draft-2", stepId: "result" })
  expect(current.steps[0].value).toBe(9)
  expect(current.events).toEqual([])
  expect(current.activeRevision).toBe("active-1")
  expect(api.programConsumptionDetails(report, { view: "draft", questionId: "q" }).steps).toEqual([])
  expect(api.programConsumptionDetails(report, { stepId: "absent" }).status).toBe("program-detail-not-found")
})
