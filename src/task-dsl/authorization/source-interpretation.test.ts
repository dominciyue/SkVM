import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainRuntime } from "../../benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { createControlSlice, mergeControlSlice } from "./control-slice.ts"
import { lowerSemanticFlow } from "./semantic-flow.ts"
import { evaluateControlPaths, controlObjectDiagnostics } from "./control-conclusion.ts"
const api = await import("./source-interpretation.ts").catch(() => ({} as any))

async function fixture() {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-interpret-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor, a, b, flag):\n    if not flag:\n        return False\n    b.write(actor=actor)\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.entry", premises: [] }] })
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  const anchor = (kind: string, name?: string) => skeleton.anchors.find(a => a.kind === kind && (!name || a.name === name || a.text === name))!
  const annotations = [
    ...["actor", "a", "b", "flag"].map(name => ({ anchorId: anchor("parameter", name).id, role: name === "actor" ? "principal" : name === "flag" ? "context" : "resource", explanation: `Actual ${name} parameter` })),
    { anchorId: anchor("condition").id, role: "condition", explanation: "False flag takes the rejecting return", condition: { op: "eq", left: { binding: "flag" }, right: { literal: false } }, principalAnchorId: anchor("parameter", "actor").id, resourceAnchorId: anchor("parameter", "a").id, guardBranch: "false" },
    { anchorId: anchor("call").id, role: "effect", explanation: "Writes the other explicit resource", principalAnchorId: anchor("parameter", "actor").id, resourceAnchorId: anchor("parameter", "b").id },
    ...skeleton.anchors.filter(a => a.kind === "return").map(a => ({ anchorId: a.id, role: "context", explanation: "Actual returning path", returnOutcome: a.valueExpression === "False" ? "deny" : "allow" })),
  ]
  return { tools, source, skeleton, program, annotations, anchor, proposal: { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations, unresolved: [] }, options: { index: tools.structure, itemId: "q::entry", handle: "u", questionId: "q", role: "entry" } }
}

test("the same production focus offers source anchors and accepts roles without a hand-written block graph", async () => {
  const f = await fixture()
  const runtime = createInquiryDomainRuntime({ program: f.program, tools: f.tools, strategy: "operation-evidence-v1", sourceAssisted: true } as any)
  await runtime.sync()
  const context: any = runtime.promptContext()
  expect(context.tasks[0]?.sourceSkeleton?.sourceId).toBe(f.source.id)
  const accepted = await runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: context.focus.id, interpretation: f.proposal })
  expect(accepted.diagnostics.filter(d => d.code.startsWith("source-interpretation"))).toEqual([])
  expect(runtime.report().semantic?.units).toHaveLength(1)
  expect(runtime.report().semantic?.units[0]!.blocks.some(b => b.steps.some(s => s.kind === "choose"))).toBe(true)
})

test("source-assisted model context retains the original task once, current phase only and real skeleton progress", async () => {
  const f = await fixture(), runtime = createInquiryDomainRuntime({ program: f.program, tools: f.tools, strategy: "operation-evidence-v1", sourceAssisted: true })
  await runtime.sync()
  const context: any = runtime.promptContext()
  expect(context.questions[0].request).toBe("Inspect app.entry")
  expect(context.tasks[0].question).toBeUndefined()
  expect(context.tasks[0].questionId).toBe("q")
  expect(runtime.report().worklist?.items.find(w => w.origin === "question-duty" && w.kind === "entry")?.progress).toMatchObject({ found: true, read: true, skeleton: true, interpreted: false })
  expect(context.instruction).not.toContain("For interpret submit controlDelta:")
  const final: any = runtime.promptContext({ finalOnly: true })
  expect(final.instruction).toContain("Final uses")
  expect(final.instruction).not.toContain("source-interpretation/v1")
  expect(runtime.report().sourceWorkMetrics).toMatchObject({ lowLevelFallbacks: 0, sourceInterpretationSubmissions: 0, controlSteps: 0 })
})

test("host branches preserve deny/effect alternatives and an explicitly claimed wrong-object guard is rejected", async () => {
  const f = await fixture(), lowered = api.lowerSourceInterpretation(f.skeleton, f.proposal, f.options)
  expect(lowered.diagnostics).toEqual([])
  const units = [{ ...lowered.unit, questionId: "q", source: f.skeleton.source, evidenceIds: f.skeleton.evidenceIds }]
  const flow = lowerSemanticFlow(units)
  const state = mergeControlSlice(createControlSlice(), flow.delta, f.program, { questionIds: ["q"], shownEvidenceIds: f.skeleton.evidenceIds }).state
  const paths = evaluateControlPaths(state).paths
  expect(paths.map(p => p.disposition).sort()).toEqual(["allow", "deny"])
  const deny = state.rules.find(r => r.kind === "return" && r.outcome === "deny")!
  const effect = state.rules.find(r => r.kind === "effect")!
  expect(deny.after).not.toContain(effect.key)
  const wrong = structuredClone(f.proposal)
  ;(wrong.annotations.find(a => a.role === "effect") as any).authorizedByAnchorIds = [f.anchor("condition").id]
  const annotated = api.lowerSourceInterpretation(f.skeleton, wrong, f.options)
  const wrongFlow = lowerSemanticFlow([{ ...annotated.unit, questionId: "q", source: f.skeleton.source, evidenceIds: f.skeleton.evidenceIds }])
  const wrongState = mergeControlSlice(createControlSlice(), wrongFlow.delta, f.program, { questionIds: ["q"], shownEvidenceIds: f.skeleton.evidenceIds }).state
  expect(controlObjectDiagnostics(wrongState).some(d => d.code === "control-object-mismatch")).toBe(true)
})

test("unshown anchors, stale revisions, invalid roles and explanation without a predicate stay local repairs", async () => {
  const f = await fixture()
  for (const proposed of [
    { ...f.proposal, revision: "old" },
    { ...f.proposal, annotations: [...f.annotations, { anchorId: "unshown", role: "context", explanation: "Invented" }] },
    { ...f.proposal, annotations: [{ ...f.annotations[0], role: "admin" }] },
  ]) expect(api.lowerSourceInterpretation(f.skeleton, proposed, f.options).diagnostics.length).toBeGreaterThan(0)
  const incomplete = structuredClone(f.proposal)
  delete (incomplete.annotations.find(a => a.role === "condition") as any).condition
  const failed = api.lowerSourceInterpretation(f.skeleton, incomplete, f.options)
  expect(failed.diagnostics).toContainEqual(expect.objectContaining({ code: "source-interpretation-condition-required", path: f.anchor("condition").id }))
  const repaired = api.lowerSourceInterpretation(f.skeleton, { ...f.proposal, annotations: [f.annotations.find(a => a.role === "condition")], unresolved: [] }, { ...f.options, previous: failed.interpretation })
  expect(repaired.diagnostics).toEqual([])
  expect(repaired.interpretation.annotations).toHaveLength(f.annotations.length)
})

test("actual keyword order and literal arguments map to the source signature without model argument lists", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-arguments-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def helper(actor, resource, value):\n    return value\ndef entry(actor, resource):\n    output = helper(value=None, resource=resource, actor=actor)\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  const raw = { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "call" || a.kind === "return").map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "actor" ? "principal" : "resource" : a.kind === "call" ? "condition" : "context", explanation: "Actual source role", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) })), unresolved: [] }
  const result = api.lowerSourceInterpretation(skeleton, raw, { index: tools.structure, itemId: "w", handle: "u", questionId: "q", role: "entry" })
  expect(result.diagnostics).toEqual([])
  const steps = result.unit.blocks[0].steps, call = steps.find((s: any) => s.kind === "call")
  expect(call.arguments.slice(0, 2)).toEqual([{ parameter: "actor", object: "actor" }, { parameter: "resource", object: "resource" }])
  const literal = steps.find((s: any) => s.kind === "bind" && s.name === call.arguments[2].object)
  expect(literal).toMatchObject({ type: "value", value: null })
  expect(call.result).toBe("output")
})

test("explicit low-level fallback is counted even when its block name resembles generated source", async () => {
  const f = await fixture(), runtime = createInquiryDomainRuntime({ program: f.program, tools: f.tools, strategy: "operation-evidence-v1", sourceAssisted: true } as any)
  await runtime.sync()
  const context: any = runtime.modelContext()
  await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "interpret", focusId: context.focus.id, unit: { start: "source-manual", complete: false, blocks: [{ name: "source-manual", steps: [{ kind: "return", name: "r", claim: "Explicit fallback", outcome: "unknown" }] }] } })
  expect(runtime.report().focus?.sourceInterpretations.filter(e => e.event === "low-level-fallback")).toHaveLength(1)
})

test("omitted known source defaults are bound mechanically while dynamic defaults remain unmapped", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-defaults-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def helper(actor, value=None, label='read', dynamic=factory()):\n    return value\ndef entry(actor):\n    helper(actor)\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  const annotations = skeleton.anchors.map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? "principal" : a.kind === "call" ? "condition" : "context", explanation: "Actual source role", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) }))
  const result = api.lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations, unresolved: [] }, { index: tools.structure, itemId: "w", handle: "u", questionId: "q", role: "entry" })
  expect(result.diagnostics).toEqual([])
  const steps = result.unit.blocks[0].steps, call = steps.find((s: any) => s.kind === "call")
  expect(call.arguments.map((a: any) => a.parameter)).toEqual(["actor", "value", "label"])
  expect(steps.filter((s: any) => s.kind === "bind").map((s: any) => s.value)).toEqual([null, "read"])
  expect(tools.structure!.symbols.find(s => s.name === "helper")!.parameters[3]).toMatchObject({ defaultExpression: "factory()", defaultLiteralKnown: false })
})

test("source-assisted lowering and the equivalent old graph preserve the same finite outcomes", async () => {
  const f = await fixture(), lowered = api.lowerSourceInterpretation(f.skeleton, f.proposal, f.options)
  const old = { itemId: "q::entry", handle: "u", op: "add", role: "entry", start: "main", complete: true, parameters: [{ name: "actor", type: "principal" }, { name: "a", type: "resource" }, { name: "b", type: "resource" }, { name: "flag", type: "configuration" }], blocks: [{ name: "main", steps: [{ kind: "choose", name: "flag", claim: "Actual flag test", cases: [{ condition: { op: "eq", left: { binding: "flag" }, right: { literal: false } }, body: "denied" }], otherwise: "allowed" }, { kind: "effect", name: "write", claim: "Actual resource write", principal: "actor", resource: "b" }, { kind: "return", name: "ok", claim: "Normal return", outcome: "allow", value: true }] }, { name: "denied", steps: [{ kind: "return", name: "no", claim: "Early return", outcome: "deny", value: false }] }, { name: "allowed", steps: [{ kind: "guard", name: "g", claim: "Explicit flag control", principal: "actor", resource: "a", condition: { op: "not", arg: { op: "eq", left: { binding: "flag" }, right: { literal: false } } } }] }] }
  const outcomes = (unit: any) => { const flow = lowerSemanticFlow([{ ...unit, questionId: "q", source: f.skeleton.source, evidenceIds: f.skeleton.evidenceIds }]); const state = mergeControlSlice(createControlSlice(), flow.delta, f.program, { questionIds: ["q"], shownEvidenceIds: f.skeleton.evidenceIds }).state; return evaluateControlPaths(state).paths.map(p => ({ disposition: p.disposition, protectedEffect: p.protectedEffect, complete: p.complete, truth: p.predicate.truth })).sort((a, b) => a.disposition.localeCompare(b.disposition)) }
  expect(outcomes(lowered.unit)).toEqual(outcomes(old))
})

test("unknown return and operation failure remain equivalent to their explicit old control graph", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-outcomes-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(flag):\n    if flag:\n        raise RuntimeError('operation failed')\n    return None\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!, condition = { op: "eq", left: { binding: "flag" }, right: { literal: true } }
  const annotations = skeleton.anchors.map(a => ({ anchorId: a.id, role: a.kind === "condition" ? "condition" : "context", explanation: "Actual bounded source branch", ...(a.kind === "condition" ? { condition } : a.kind === "raise" ? { failureKind: "operation" } : a.kind === "return" ? { returnOutcome: "unknown" } : {}) }))
  const lowered = api.lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations, unresolved: [] }, { index: tools.structure, itemId: "w", handle: "u", questionId: "q", role: "entry" })
  expect(lowered.diagnostics).toEqual([])
  const old = { itemId: "w", handle: "u", op: "add", role: "entry", start: "main", complete: true, fallthrough: "unresolved", parameters: [{ name: "flag", type: "configuration" }], blocks: [{ name: "main", steps: [{ kind: "choose", name: "test", claim: "Actual if", cases: [{ condition, body: "failure" }], otherwise: "other" }, { kind: "return", name: "unknown", claim: "Actual unknown return", outcome: "unknown", value: null }] }, { name: "failure", steps: [{ kind: "context", name: "error", claim: "Error construction", relationship: "dispatch-binding" }, { kind: "reject", name: "raise", claim: "Operation failure", failureKind: "operation" }] }, { name: "other", steps: [] }] }
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.entry", premises: [] }] })
  const outcomes = (unit: any) => { const flow = lowerSemanticFlow([{ ...unit, questionId: "q", source: skeleton.source, evidenceIds: skeleton.evidenceIds }]); const state = mergeControlSlice(createControlSlice(), flow.delta, program, { questionIds: ["q"], shownEvidenceIds: skeleton.evidenceIds }).state; return evaluateControlPaths(state).paths.map(p => ({ disposition: p.disposition, complete: p.complete, truth: p.predicate.truth })).sort((a, b) => a.disposition.localeCompare(b.disposition)) }
  expect(outcomes(lowered.unit)).toEqual(outcomes(old))
  expect(lowered.unit.blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "reject")).toMatchObject({ failureKind: "operation" })
  expect(outcomes(lowered.unit).some((p: any) => p.disposition === "unknown")).toBe(true)
})

test("nested source calls use an intermediate result instead of aliasing both calls to the outer assignment", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-nested-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def inner(actor):\n    return actor\ndef outer(resource):\n    return resource\ndef entry(actor):\n    result = outer(inner(actor))\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  const raw = { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? "principal" : a.kind === "call" ? "resource" : "context", explanation: "Actual source object and call", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) })), unresolved: [] }
  const result = api.lowerSourceInterpretation(skeleton, raw, { index: tools.structure, itemId: "w", handle: "u", questionId: "q", role: "entry" })
  expect(result.diagnostics).toEqual([])
  const calls = result.unit.blocks[0].steps.filter((s: any) => s.kind === "call")
  expect(calls.map((s: any) => s.symbol)).toEqual(["inner", "outer"])
  expect(calls[0].result).not.toBe("result")
  expect(calls[1]).toMatchObject({ result: "result", arguments: [{ parameter: "resource", object: calls[0].result }] })
})
