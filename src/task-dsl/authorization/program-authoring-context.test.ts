import { expect, test } from "bun:test"
import { executeResourceWorkflow } from "./resource-relations.ts"
import * as author from "./program-authoring-context.ts"
const at = { path: "app.py", startLine: 1, endLine: 8 }
const questions = [{ id: "meaning", request: "Retain all requested meanings" }, { id: "data" }]
const operationQuestions = questions.map(q => ({ questionId: q.id, operationId: "same" }))
test("proof locator errors do not hide executable missing inputs and external conditions are separate", () => {
  const raw = { scope: { questionId: "meaning" }, resourceWorkflow: { inputs: ["rows"], steps: [] } }
  const proof = { code: "question-property-source-unresolved", path: "properties", severity: "error", message: "ambiguous locator" }
  const report = { currentDraft: { revision: "r", raw }, candidate: { revision: "r", diagnostics: [proof], resourceExecution: { events: [{ id: "pick", op: "select", gaps: ["rows"], inputs: {} }, { id: "outside", op: "external", gaps: ["external:remote"], inputs: {} }] } } }
  const feedback: any = author.projectProgramAuthoring(report, questions, 8, { resourceInputs: { meaning: {} } })
  expect(feedback.feedbackGroups.proof).toEqual([proof])
  expect(feedback.feedbackGroups.execution[0].code).toBe("missing-input")
  expect(feedback.feedbackGroups.external[0].dependencies).toEqual(["external:remote"])
  expect(feedback.firstBlocker.code).toBe("missing-input")
  expect(feedback.diagnostics).toContainEqual(proof)
})

test("author continuations require a known terminal, budget, actionable work and new progress", () => {
  const decide = (author as any).decideProgramAuthorContinuation
  const context = { authoring: { draftRevision: "r", phase: "repair", feedbackGroups: { inputStructure: [], execution: [{ code: "missing-input" }], proof: [], external: [] } }, toolBudget: { explorationRemaining: 4, totalRemaining: 6 }, sourceIndex: [] }
  const base = { mode: "edit", terminal: "completed", continuations: 0, remainingMs: 1000, context }
  const next = decide(base)
  expect(next.continue).toBe(true)
  expect(decide({ ...base, terminal: "unknown" }).continue).toBe(false)
  expect(decide({ ...base, mode: "consume" }).continue).toBe(false)
  expect(decide({ ...base, continuations: 2 }).continue).toBe(false)
  expect(decide({ ...base, maxContinuations: 0 }).continue).toBe(false)
  expect(decide({ ...base, remainingMs: 0 }).continue).toBe(false)
  expect(decide({ ...base, previousProgress: next.progress, continuations: 1 }).reason).toBe("no-new-author-progress")
  expect(decide({ ...base, context: { ...context, authoring: { ...context.authoring, feedbackGroups: { inputStructure: [], execution: [], proof: [], external: [{ code: "external-assumption" }] } } } }).continue).toBe(false)
  expect(decide({ ...base, context: { ...context, toolBudget: { totalRemaining: 2, explorationRemaining: 0 } } }).continue).toBe(false)
  expect(decide({ ...base, context: { ...context, toolBudget: { totalRemaining: 9, explorationRemaining: 7, checksRemaining: 0, finalOnly: true } } }).reason).toBe("author-budget-exhausted")
})
test("a computed partial identifier still exposes authored scope gaps for bounded source review", () => {
  const raw = { scope: { questionId: "meaning", upstream: ["Caller relations remain unencoded"] }, resourceWorkflow: { inputs: [], steps: [], gaps: ["Selection and response relations remain unencoded"] } }
  const report = { currentDraft: { revision: "r", raw }, candidate: { revision: "r", diagnostics: [], resourceExecution: { returned: { id: 7 }, events: [], gaps: raw.resourceWorkflow.gaps } } }
  const feedback: any = author.projectProgramAuthoring(report, questions, 6, { resourceInputs: { meaning: {} } })
  const context = { authoring: feedback, sourceIndex: [{ path: "app.py" }], toolBudget: { explorationRemaining: 6, totalRemaining: 8 } }
  const decision = author.decideProgramAuthorContinuation({ mode: "edit", terminal: "completed", continuations: 0, remainingMs: 1000, context })
  expect(feedback.feedbackGroups.authoredScope.map((g: any) => g.message)).toEqual([...raw.scope.upstream, ...raw.resourceWorkflow.gaps])
  expect(decision.continue).toBe(true)
  expect(author.decideProgramAuthorContinuation({ mode: "edit", terminal: "completed", continuations: 1, remainingMs: 1000, context, previousProgress: decision.progress }).reason).toBe("no-new-author-progress")
})
test("author feedback shows selected facts shapes and exact external calls without moving duties", () => {
  const raw = { scope: { questionId: "meaning" }, inputBinding: { questionId: "data" }, resourceWorkflow: { inputs: ["actor", "rows", "missing"], steps: [] } }
  const context: any = author.projectProgramTaskContext({ report: { currentDraft: { revision: "draft", raw } }, questions, operationQuestions, programMode: "edit", resourceInputs: { data: { actor: { id: 17 }, rows: [{ key: 2 }, { key: 3 }, { key: 4 }, { key: 5 }] } }, externalAssumptions: { data: [{ name: "service", arguments: { actor: 17 }, value: true, reason: "Supplied scenario fact" }] } } as any)
  expect(context.authoring.inputBindings.inputQuestionId).toBe("data")
  expect(context.authoring.inputBindings.missingDeclaredNames).toEqual(["missing"])
  expect(context.authoring.inputBindings.values.actor.values).toEqual({ id: 17 })
  expect(context.authoring.inputBindings.values.rows).toEqual({ kind: "collection", rowCount: 4, fields: ["key"], sample: [{ key: 2 }, { key: 3 }, { key: 4 }], truncated: true })
  expect(context.authoring.inputBindings.externalAssumptions[0].arguments).toEqual({ actor: 17 })
  expect(context.authoring.inputBindings.suppliedScopes[0].valueShapes.actor.fields).toEqual(["id"])
  expect(context.remainingDuties.map((q: any) => q.questionId)).toEqual(["meaning", "data"])
  expect(context.authoring.completion).toBe("unreviewed")
})
test("one absent input produces one root blocker with downstream steps from actual events", () => {
  const workflow = { inputs: ["documents"], steps: [
    { id: "selected", op: "select", from: "documents", where: { op: "eq", left: { binding: "row.id" }, right: { literal: 1 } }, source: at },
    { id: "permitted", op: "external", name: "service", arguments: { key: { field: { of: { ref: "selected" }, key: "id" } } }, source: at },
    { id: "guard", op: "guard", test: { op: "truthy", language: "python", value: { binding: "permitted" } }, failure: "denied", source: at },
    { id: "key", op: "value", value: { field: { of: { ref: "selected" }, key: "id" } }, source: at },
    { id: "result", op: "return", value: { ref: "key" }, source: at },
  ] }
  const execution = executeResourceWorkflow(workflow, {})
  const report = { currentDraft: { revision: "draft", raw: { scope: { questionId: "meaning" }, resourceWorkflow: workflow } }, candidate: { revision: "draft", resourceExecution: execution } }
  const feedback: any = author.projectProgramAuthoring(report, questions, undefined, { resourceInputs: { meaning: {} } })
  expect(feedback.firstBlocker).toEqual(expect.objectContaining({ stepId: "selected", code: "missing-input", dependencies: ["documents"], affectedStepIds: ["selected", "permitted", "guard", "key", "result"] }))
  expect(feedback.rootBlockers).toHaveLength(1)
  expect(feedback.rootBlockers[0].inputs.from).toBe("documents")
  expect(feedback.computed.termination).toBe("return")
  const fixed = executeResourceWorkflow(workflow, { documents: [{ id: 1 }] }, { externalAssumptions: [{ name: "service", arguments: { key: 1 }, value: true, reason: "Current scenario fact" }] })
  const repaired: any = author.projectProgramAuthoring({ ...report, candidate: { revision: "draft", resourceExecution: fixed } }, questions, undefined, { resourceInputs: { meaning: { documents: [{ id: 1 }] } } })
  expect(repaired.rootBlockers).toEqual([])
  expect(repaired.computed.returned).toBe(1)
  expect(execution.events.every(event => event.outputs.known === false)).toBe(true)
  const stale = { ...report, candidate: { revision: "old", resourceExecution: execution }, resourceExecution: { returned: 999 } }
  expect(author.projectProgramAuthoring(stale, questions).computed).toBeUndefined()
})
test("author loop records actual first valid draft repairs and new values and triggers one early checkpoint", () => {
  const loop = (author as any).createProgramAuthorLoop()
  expect(loop.snapshot({ toolUnit: 12, explorationUnits: 12, completeSources: [] }).checkpoint).toBeUndefined()
  const source = { path: "app.py", symbol: "local", startLine: 1, endLine: 8 }
  const checkpoint = loop.snapshot({ toolUnit: 13, explorationUnits: 12, completeSources: [source] }).checkpoint
  expect(checkpoint.toolUnit).toBe(13)
  expect(loop.snapshot({ toolUnit: 18, explorationUnits: 17, completeSources: [source] }).checkpoint).toEqual(checkpoint)
  loop.record({ kind: "program", toolUnit: 19, revision: "invalid", valid: false })
  expect(loop.snapshot().firstDraftToolUnit).toBeUndefined()
  loop.record({ kind: "program", toolUnit: 20, revision: "good", valid: true, execution: { values: { selected: 7 }, returned: 7, gaps: [] } })
  loop.record({ kind: "patch", toolUnit: 21, revision: "better", valid: true, execution: { values: { selected: 9 }, returned: 9, gaps: [] } })
  const feedback = loop.snapshot()
  expect(feedback.firstProgramToolUnit).toBe(19)
  expect(feedback.firstDraftToolUnit).toBe(20)
  expect(feedback.patchCount).toBe(1)
  expect(feedback.changes.at(-1).newValues).toEqual({ selected: 9 })
  expect(feedback.changes.at(-1).returned).toBe(9)
  const restored = (author as any).createProgramAuthorLoop()
  expect(restored.snapshot({ toolUnit: 20, explorationUnits: 18, completeSources: [source], hasDraft: true }).checkpoint).toBeUndefined()
})

test("a patch-only restored author records the first proposal without inventing a program call", () => {
  const loop = author.createProgramAuthorLoop()
  loop.record({ kind: "patch", toolUnit: 2, revision: "patched", valid: true })
  expect(loop.snapshot().firstProgramToolUnit).toBeUndefined()
  expect((loop.snapshot() as any).firstProposalToolUnit).toBe(2)
  expect(loop.snapshot().firstDraftToolUnit).toBe(2)
})

test("a stale candidate cannot supply current draft diagnostics or preview availability", () => {
  const raw = { scope: { questionId: "meaning" }, resourceWorkflow: { inputs: [], steps: [] } }
  const feedback: any = author.projectProgramAuthoring({ currentDraft: { revision: "new", raw }, currentDraftDiagnostics: [], candidate: { revision: "old", adopted: true, diagnostics: [{ code: "old-error", severity: "error" }], resourceExecution: { returned: 999, events: [] } } }, questions, undefined, { resourceInputs: { meaning: {} } })
  expect(feedback.computed).toBeUndefined()
  expect(feedback.diagnostics).toEqual([])
  expect(feedback.firstBlocker).toBeUndefined()
  expect(feedback.candidatePreviewAvailable).toBe(false)
  expect(feedback.candidateAdopted).toBeUndefined()
})

test("one missing dataset lists each affected step once across multiple absent input roots", () => {
  const workflow = { inputs: ["left", "right"], steps: [
    { id: "first", op: "value", value: { ref: "left" }, source: at },
    { id: "second", op: "value", value: { ref: "right" }, source: at },
    { id: "guard", op: "guard", test: { op: "eq", left: { binding: "first" }, right: { binding: "second" } }, failure: "denied", source: at },
    { id: "result", op: "return", value: { ref: "first" }, source: at },
  ] }
  const execution = executeResourceWorkflow(workflow, {})
  const feedback: any = author.projectProgramAuthoring({ currentDraft: { revision: "current", raw: { scope: { questionId: "meaning" }, resourceWorkflow: workflow } }, candidate: { revision: "current", resourceExecution: execution } }, questions)
  expect(feedback.firstBlocker.code).toBe("program-input-dataset-missing")
  expect(feedback.firstBlocker.affectedStepIds).toHaveLength(4)
  expect(feedback.firstBlocker.affectedStepIds).toEqual(expect.arrayContaining(["first", "second", "guard", "result"]))
})

for (const scenario of [
  { name: "missing object field", first: { id: "initial", op: "value", value: { field: { of: { ref: "item" }, key: "key" } }, source: at }, inputs: { item: {} }, declared: ["item"], code: "object-field", dependency: "field-missing:key" },
  { name: "non-unique selection", first: { id: "initial", op: "select", from: "rows", where: { op: "eq", left: { literal: true }, right: { literal: true } }, unique: true, source: at }, inputs: { rows: [{ key: 1 }, { key: 2 }] }, declared: ["rows"], code: "selection", dependency: "selection-not-unique:initial" },
  { name: "absent external premise", first: { id: "initial", op: "external", name: "service", arguments: { key: { literal: 1 } }, source: at }, inputs: {}, declared: [], code: "external-assumption", dependency: "external:service" },
]) test(`author feedback traces one ${scenario.name} root through dependent steps`, () => {
  const workflow = { inputs: scenario.declared, steps: [scenario.first,
    { id: "guard", op: "guard", test: { op: "truthy", language: "python", value: { binding: "initial" } }, failure: "denied", source: at },
    { id: "copy", op: "value", value: { ref: "initial" }, source: at },
    { id: "result", op: "return", value: { ref: "copy" }, source: at },
  ] }
  const execution = executeResourceWorkflow(workflow, scenario.inputs)
  const feedback: any = author.projectProgramAuthoring({ currentDraft: { revision: "current", raw: { scope: { questionId: "meaning" }, resourceWorkflow: workflow } }, candidate: { revision: "current", resourceExecution: execution } }, questions, undefined, { resourceInputs: { meaning: scenario.inputs } } as any)
  expect(feedback.rootBlockers).toHaveLength(1)
  expect(feedback.firstBlocker).toMatchObject({ stepId: "initial", code: scenario.code, dependencies: [scenario.dependency], affectedStepIds: ["initial", "guard", "copy", "result"] })
  expect(feedback.computed.conditions.length).toBeGreaterThan(0)
})
