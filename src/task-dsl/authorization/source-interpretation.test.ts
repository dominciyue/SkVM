import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { createInquiryDomainRuntime } from "../../benchmarks/authorization-dsl/inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
import { createControlSlice, mergeControlSlice } from "./control-slice.ts"
import { lowerSemanticFlow, semanticBlockDiagnostics } from "./semantic-flow.ts"
import { evaluateControlPaths, controlObjectDiagnostics } from "./control-conclusion.ts"
const api = await import("./source-interpretation.ts").catch(() => ({} as any))

test("source staticmethod arguments retain the supplied request rather than the instance receiver", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "aw-static-call-"))
  await writeFile(path.join(sourceRoot, "app.py"), "class View:\n    @staticmethod\n    def helper(request):\n        return request\n    def entry(self, request):\n        return self.helper(request)\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1" })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  const r = api.lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.kind === "call" || a.kind === "return").map(a => ({ anchorId: a.id, role: a.kind === "call" ? "permission" : "context", explanation: "Test-authored source call", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) })), unresolved: [] }, { index: tools.structure, itemId: "entry", handle: "entry", questionId: "q", role: "entry" })
  expect(r.diagnostics).toEqual([])
  expect(r.unit.blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call").arguments).toEqual([{ parameter: "request", object: "request" }])
})

test("source-assisted variadic forwarding keeps the actual packs and the original exception handler", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-pack-forward-"))
  await writeFile(path.join(sourceRoot, "app.py"), "class Gate:\n    def entry(self, actor, *args, **kwargs):\n        try:\n            return self.guard(actor, *args, **kwargs)\n        except Denied:\n            return False\n    def guard(self, actor, *rest, **options):\n        raise Denied()\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id, "app.Gate"))!
  expect(skeleton.gaps.map(g => g.code)).not.toContain("skeleton-arguments-dynamic")
  const annotations = skeleton.anchors.filter(a => a.kind === "call" || a.kind === "return").map(a => ({ anchorId: a.id, role: a.kind === "call" ? "condition" : "context", explanation: "Test-authored actual continuation", ...(a.kind === "return" ? { returnOutcome: a.valueExpression === "False" ? "deny" : "allow" } : {}) }))
  const result = api.lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations, unresolved: [] }, { index: tools.structure, itemId: "entry", handle: "entry", questionId: "q", role: "entry" })
  expect(result.diagnostics).toEqual([])
  const call = result.unit.blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "call")
  expect(call.arguments).toEqual([{ parameter: "self", object: "self" }, { parameter: "actor", object: "actor" }, { parameter: "rest", object: "args" }, { parameter: "options", object: "kwargs" }])
  expect(result.unit.blocks.some((b: any) => b.steps.some((s: any) => s.kind === "try" && s.handlers[0].exceptionTypes[0] === "Denied"))).toBe(true)
  call.callee = "guard"
  const target = tools.structure!.symbols.find(s => s.name === "guard")!
  const helper: any = { itemId: "guard", handle: "guard", questionId: "q", op: "add", role: "helper", evidenceIds: ["ev"], source: { id: target.id, path: target.path, sha256: target.sha256, startLine: target.startLine, endLine: target.endLine }, receiverClass: "app.Gate", start: "body", complete: true, coverage: "path", parameters: target.parameters.map(p => ({ name: p.name, type: "value" })), blocks: [{ name: "body", steps: [{ kind: "raise", name: "denied", claim: "Test-authored source rejection", exceptionType: "Denied", failureKind: "authorization" }] }] }
  const lowered = lowerSemanticFlow([{ ...result.unit, questionId: "q", evidenceIds: ["ev"] }, helper], { compositional: true, propertyDirected: true })
  expect(lowered.diagnostics).toEqual([])
  expect(lowered.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["deny"])
})

test("typed variadic parameter anchors use the actual declared name", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-typed-pack-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def helper(*rest: object, **options: object):\n    return True\ndef entry(*args: object, **kwargs: object):\n    return helper(*args, **kwargs)\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  expect(skeleton.anchors.filter(a => a.kind === "parameter").map(a => a.name)).toEqual(["args", "kwargs"])
})

test("a decisive v5 call retains its named dynamic default binding gap", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-default-gap-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def helper(actor, flag=compute()):\n    return actor\ndef entry(actor):\n    return helper(actor)\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  const annotations = skeleton.anchors.filter(a => a.kind === "call" || a.kind === "return").map(a => ({ anchorId: a.id, role: a.kind === "call" ? "condition" : "context", explanation: "Test-authored actual source call", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) }))
  const result = api.lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations, unresolved: [] }, { index: tools.structure, itemId: "entry", handle: "entry", questionId: "q", role: "entry" })
  expect(result.diagnostics).toEqual([])
  expect(result.unit.complete).toBe(false)
  expect(result.unit.blocks.flatMap((b: any) => b.steps).some((s: any) => s.kind === "unresolved" && s.reason === "source-arguments-default-dynamic")).toBe(true)
})

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

test("a malformed changed field retains other valid annotations and never overwrites an accepted anchor", async () => {
  const f = await fixture(), accepted = api.lowerSourceInterpretation(f.skeleton, f.proposal, f.options)
  const changed = { ...f.proposal, annotations: [{ ...f.annotations[0], explanation: "Valid local clarification" }, { ...f.annotations.at(-1), returnOutcome: "success" }] }
  const r = api.lowerSourceInterpretation(f.skeleton, changed, { ...f.options, previous: accepted.interpretation })
  expect(r.unit).toBeUndefined()
  expect(r.diagnostics.map((d: any) => d.code)).toContain("source-interpretation-schema")
  expect(r.interpretation.annotations.find((a: any) => a.anchorId === f.annotations[0]!.anchorId).explanation).toBe("Valid local clarification")
  expect(r.interpretation.annotations.find((a: any) => a.anchorId === f.annotations.at(-1)!.anchorId).returnOutcome).toBe("allow")
  const stale = api.lowerSourceInterpretation(f.skeleton, { ...changed, revision: "old" }, { ...f.options, previous: accepted.interpretation })
  expect(stale.interpretation).toEqual(accepted.interpretation)
})

test("finite source regions lower through the shared semantic checker with conditional RHS and typed handlers", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "aw-interpret-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor):\n    answer = 0 and actor.check()\n    try:\n        raise Denied\n    except Denied:\n        return False\n    finally:\n        actor.cleanup()\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1" })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  const annotations = skeleton.anchors.filter(a => a.interpretationRequired).map(a => ({ anchorId: a.id, role: "context", explanation: "Test-authored source role", ...(a.kind === "return" ? { returnOutcome: "deny" } : a.kind === "raise" ? { failureKind: "authorization" } : {}) }))
  const r = api.lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index: tools.structure, itemId: "entry", handle: "entry", questionId: "q", role: "entry" })
  expect(r.diagnostics).toEqual([])
  expect(r.unit.coverage).toBe("path")
  expect(r.unit.blocks.flatMap((b: any) => b.steps).map((s: any) => s.kind)).toEqual(expect.arrayContaining(["short-circuit", "try", "raise"]))
  expect(semanticBlockDiagnostics(r.unit)).toEqual([])
  const flow = lowerSemanticFlow([{ ...r.unit, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source }])
  expect(flow.delta.rules.some(r => r.sourceOrigin?.step.includes(skeleton.anchors.find(a => a.call?.expression === "actor.check")!.id))).toBe(false)
  expect(flow.delta.rules.filter(r => r.terminal).some(r => r.outcome === "deny")).toBe(true)
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

test("unknown and ambiguous source callees retain actual arguments and terminate at an explicit semantic gap", async () => {
  for (const ambiguous of [false, true]) {
    const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-unbound-call-"))
    await writeFile(path.join(sourceRoot, "app.py"), (ambiguous ? "def gate(actor, resource):\n    return True\ndef gate(actor, resource):\n    return False\n" : "") + "def entry(actor, resource):\n    return gate(actor, resource)\n")
    const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true })
    const source = tools.structure!.symbols.find(s => s.name === "entry")!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!, call = skeleton.anchors.find(a => a.kind === "call")!
    expect(call.call!.arguments.map(a => a.expression)).toEqual(["actor", "resource"])
    expect(call.call!.candidateIds.length).toBe(ambiguous ? 2 : 0)
    const raw = { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.map(a => ({ anchorId: a.id, role: a.kind === "parameter" ? a.name === "actor" ? "principal" : "resource" : a.kind === "call" ? "condition" : "context", explanation: "Actual source role", ...(a.kind === "return" ? { returnOutcome: "allow" } : {}) })), unresolved: [] }
    const lowered = api.lowerSourceInterpretation(skeleton, raw, { index: tools.structure, itemId: "w", handle: "u", questionId: "q", role: "entry" })
    expect(lowered.diagnostics).toEqual([])
    const flow = lowerSemanticFlow([{ ...lowered.unit, questionId: "q", source: skeleton.source, evidenceIds: skeleton.evidenceIds }])
    expect(flow.delta.dependencies).toContainEqual(expect.objectContaining({ symbol: "gate", decisive: true }))
    expect(flow.diagnostics).toContainEqual(expect.objectContaining({ code: "semantic-callee-uninterpreted" }))
    expect(flow.delta.rules.filter(r => r.terminal).map(r => ({ kind: r.kind, complete: r.complete, gap: r.gap }))).toEqual([{ kind: "unresolved", complete: false, gap: "semantic-callee-uninterpreted" }])
  }
})

test("assignments to the same source variable retain unique steps and branch-specific values", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-source-rebind-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(flag):\n    if flag:\n        selected = 'green'\n    else:\n        selected = 'red'\n    if selected == 'green':\n        return True\n    return False\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true }), source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!, raw = { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.map(a => ({ anchorId: a.id, role: a.kind === "condition" ? "condition" : "context", explanation: "Actual branch and source assignment", ...(a.kind === "condition" ? { condition: { op: "eq", left: { binding: a.text === "flag" ? "flag" : "selected" }, right: { literal: a.text === "flag" ? true : "green" } } } : a.kind === "return" ? { returnOutcome: a.valueExpression === "True" ? "allow" : "deny" } : {}) })), unresolved: [] }
  const lowered = api.lowerSourceInterpretation(skeleton, raw, { index: tools.structure, itemId: "q::entry", handle: "u", questionId: "q", role: "entry" })
  expect(lowered.diagnostics).toEqual([])
  expect(semanticBlockDiagnostics(lowered.unit)).toEqual([])
  const flow = lowerSemanticFlow([{ ...lowered.unit, questionId: "q", source: skeleton.source, evidenceIds: skeleton.evidenceIds }]), program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect source alternatives", premises: [] }] })
  expect(flow.diagnostics).toEqual([])
  const state = mergeControlSlice(createControlSlice(), flow.delta, program, { questionIds: ["q"], shownEvidenceIds: skeleton.evidenceIds }).state
  expect(evaluateControlPaths(state).paths.filter(p => p.predicate.truth !== "false").map(p => p.disposition).sort()).toEqual(["allow", "deny"])
})

test("source reassignment replaces an earlier scalar helper result before the next condition", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-source-shadow-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def initial():\n    return 'old'\ndef entry():\n    selected = initial()\n    selected = 'new'\n    if selected == 'old':\n        return False\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true }), units: any[] = []
  for (const functionName of ["initial", "entry"]) {
    const source = tools.structure!.symbols.find(s => s.name === functionName)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!, raw = { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.map(a => ({ anchorId: a.id, role: a.kind === "call" || a.kind === "condition" ? "condition" : "context", explanation: "Actual source assignment and helper result", ...(a.kind === "condition" ? { condition: { op: "eq", left: { binding: "selected" }, right: { literal: "old" } } } : a.kind === "return" && functionName === "entry" ? { returnOutcome: a.valueExpression === "True" ? "allow" : "deny" } : {}) })), unresolved: [] }
    const lowered = api.lowerSourceInterpretation(skeleton, raw, { index: tools.structure, itemId: `q::${functionName}`, handle: functionName, questionId: "q", role: functionName === "entry" ? "entry" : "helper" })
    expect(lowered.diagnostics).toEqual([])
    units.push({ ...lowered.unit, questionId: "q", source: skeleton.source, evidenceIds: skeleton.evidenceIds })
  }
  for (const step of units.find(u => u.role === "entry").blocks.flatMap((b: any) => b.steps)) if (step.kind === "call") step.callee = "initial"
  const flow = lowerSemanticFlow(units), program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect current assignment", premises: [] }] })
  const state = mergeControlSlice(createControlSlice(), flow.delta, program, { questionIds: ["q"], shownEvidenceIds: [...new Set(units.flatMap(u => u.evidenceIds))] }).state
  expect(evaluateControlPaths(state).paths.filter(p => p.predicate.truth !== "false").map(p => p.disposition)).toEqual(["allow"])
})

test("a malformed source predicate receives the complete finite operator contract without coercion", async () => {
  const f = await fixture(), raw = structuredClone(f.proposal), annotation: any = raw.annotations.find(a => a.role === "condition")
  annotation.condition = { op: "and", args: [annotation.condition] }
  const failed = api.lowerSourceInterpretation(f.skeleton, raw, f.options)
  expect(failed.diagnostics).toContainEqual(expect.objectContaining({ code: "source-interpretation-predicate-unsupported", message: expect.stringContaining('op:"all"|"any"') }))
  expect(failed.interpretation.annotations.find((a: any) => a.role === "condition").condition.op).toBe("and")
  const repaired = api.lowerSourceInterpretation(f.skeleton, { ...raw, annotations: [{ ...annotation, condition: { ...annotation.condition, op: "all" } }] }, { ...f.options, previous: failed.interpretation })
  expect(repaired.diagnostics).toEqual([])
})

for (const structure of ["try", "loop"] as const) test(`supported outer flow can be interpreted while ${structure} child calls stay in a located opaque gap`, async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-opaque-requirements-"))
  const body = structure === "try" ? "    try:\n        actor.write()\n    except Error:\n        actor.on_error()\n" : "    for item in actor.items:\n        item.write()\n"
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor, flag):\n    if flag:\n        return False\n" + body + "    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["app.py"], repository: "anonymous", sourceRef: "fixed", structure: true }), source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!
  const raw = { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.kind === "condition" || a.kind === "return").map(a => ({ anchorId: a.id, role: a.kind === "condition" ? "condition" : "context", explanation: "Actual supported outer source branch", ...(a.kind === "condition" ? { condition: { op: "eq", left: { binding: "flag" }, right: { literal: true } } } : { returnOutcome: a.literalValue === false ? "deny" : "allow" }) })), unresolved: [] }
  const result = api.lowerSourceInterpretation(skeleton, raw, { index: tools.structure, itemId: "q::entry", handle: "u", questionId: "q", role: "entry" })
  expect(result.diagnostics).toEqual([])
  expect(result.unit.complete).toBe(false)
  const steps = result.unit.blocks.flatMap((b: any) => b.steps)
  expect(steps.some((s: any) => s.kind === "unresolved" && s.reason === "skeleton-control-unsupported")).toBe(true)
  expect(steps.some((s: any) => s.kind === "call" || s.kind === "effect")).toBe(false)
  expect(steps.some((s: any) => s.kind === "return" && s.outcome === "deny")).toBe(true)
  expect(skeleton.anchors.some(a => a.kind === "call")).toBe(true)
})

test("an omitted executable source call still requires a role or an explicit unresolved entry", async () => {
  const f = await fixture(), raw = { ...f.proposal, annotations: f.annotations.filter(a => a.anchorId !== f.anchor("call").id) }
  expect(api.lowerSourceInterpretation(f.skeleton, raw, f.options).diagnostics).toContainEqual(expect.objectContaining({ code: "source-interpretation-role-required", path: f.anchor("call").id }))
})

test("property source interpretation accepts only proved unreachable omissions and keeps whole source coverage separate", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ax-source-demand-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(actor):\n    if False:\n        actor.mutate()\n    return True\n    actor.dead()\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["app.py"], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true } as any), source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!, live = skeleton.anchors.find(a => a.kind === "return" && a.literalValue === true)!
  const result = api.lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: [{ anchorId: live.id, role: "context", explanation: "Normal source permission exit", returnOutcome: "allow" }] }, { index: tools.structure, itemId: "w", handle: "entry", questionId: "q", role: "entry", propertyDirected: true })
  expect(result.diagnostics).toEqual([])
  expect(result.demand.coverage).toMatchObject({ sourceRead: true, domainInterpreted: true, propertyCovered: true, wholeAnswerSufficient: false })
  expect(result.unit.complete).toBe(false)
  const flow = lowerSemanticFlow([{ ...result.unit, questionId: "q", evidenceIds: skeleton.evidenceIds }], { propertyDirected: true })
  expect(flow.diagnostics).toEqual([])
  expect(flow.delta.rules.filter(r => r.terminal).map(r => r.outcome)).toEqual(["allow"])
  expect(skeleton.anchors.filter(a => a.kind === "call")).toHaveLength(2)
})

test("property boolean exclusions reject a contradictory model predicate rather than executing it", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ax-source-literal-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry():\n    if False:\n        return True\n    return False\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["app.py"], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true } as any), source = tools.structure!.symbols.find(s => s.name === "entry")!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id))!, branch = skeleton.anchors.find(a => a.kind === "condition")!
  const result = api.lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: skeleton.anchors.filter(a => a.kind === "condition" || a.kind === "return").map(a => ({ anchorId: a.id, role: "context", explanation: "Test-authored interpretation", ...(a.kind === "condition" ? { condition: { op: "eq", left: { literal: true }, right: { literal: true } } } : { returnOutcome: "deny" }) })) }, { index: tools.structure, itemId: "w", handle: "entry", questionId: "q", role: "entry", propertyDirected: true })
  expect(result.unit).toBeUndefined()
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "source-interpretation-literal-condition-conflict", path: branch.id }))
})

test("v5 source compilation reuses empty branches while retaining the existing path limit", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-empty-regions-"))
  await writeFile(path.join(sourceRoot, "app.py"), "def entry(flag):\n" + Array.from({ length: 17 }, (_, i) => `    if flag == '${i}':\n        return False\n`).join("") + "    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["app.py"], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const source = tools.structure!.symbols.find(s => s.name === "entry")!
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v5", sourceAssisted: true })
  await runtime.sync()
  const context: any = runtime.promptContext(), skeleton = (await tools.sourceSkeleton(source.id))!
  const annotations = skeleton.anchors.filter(a => a.kind === "condition" || a.kind === "return").map(a => ({ anchorId: a.id, role: a.kind === "condition" ? "condition" : "context", explanation: "Anonymous original branch and exit", ...(a.kind === "condition" ? { condition: { op: "eq", left: { binding: "flag" }, right: { literal: /'([^']+)'/.exec(a.text)![1] } } } : { returnOutcome: a.literalValue === false ? "deny" : "allow" }) }))
  const proposed = await runtime.propose({ schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: context.focus.id, interpretation: { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations } })
  expect(proposed.diagnostics.filter(d => d.code === "focus-schema" || d.code === "semantic-block-schema")).toEqual([])
  const unit = runtime.report().semantic!.units[0]!
  expect(unit).toBeDefined()
  expect(unit.blocks.filter(b => b.steps.length === 0)).toHaveLength(1)
  expect(unit.blocks.flatMap(b => b.steps).filter(s => s.kind === "choose")).toHaveLength(17)
  expect(runtime.report().slice.rules.filter(r => r.terminal).map(r => r.gap)).toContain("semantic-path-limit")
})

test("v5 unique imported receivers bind ordinary values while scalar fields never become principals", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ay-receiver-values-"))
  await writeFile(path.join(sourceRoot, "catalog.py"), "class Registry:\n    def find(self, owner_id):\n        return owner_id\nReady = Registry()\n")
  await writeFile(path.join(sourceRoot, "entry.py"), "from catalog import Ready as repo\nimport catalog as storage\ndef entry(actor):\n    repo.find(actor.id)\n    repo.find(actor.id)\n    storage.Ready.find(actor.id)\n    return True\n")
  const tools = await createInquiryTools({ sourceRoot, allowedPaths: ["."], repository: "anonymous", sourceRef: "r", structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  const units: any[] = []
  for (const name of ["find", "entry"]) {
    const source = tools.structure!.symbols.find(s => s.name === name)!
    await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
    const skeleton = (await tools.sourceSkeleton(source.id))!
    const annotations = skeleton.anchors.filter(a => a.kind === "parameter" || a.kind === "call" || a.kind === "return").map(a => ({ anchorId: a.id, role: a.kind === "parameter" && a.name === "actor" ? "principal" : a.kind === "parameter" || a.kind === "call" ? "condition" : "context", explanation: "Anonymous actual argument and scalar field", ...(a.kind === "return" && name === "entry" ? { returnOutcome: "allow" } : {}) }))
    const lowered = api.lowerSourceInterpretation(skeleton, { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations }, { index: tools.structure, itemId: name, handle: name, questionId: "q", role: name === "entry" ? "entry" : "helper", propertyDirected: true })
    expect(lowered.diagnostics).toEqual([])
    if (name === "entry") {
      const binds = lowered.unit.blocks.flatMap((b: any) => b.steps).filter((s: any) => s.kind === "bind" && s.bindingName === "repo")
      expect(binds).toHaveLength(1)
      expect(binds[0]).toMatchObject({ type: "value" })
      expect(binds[0].value).toBeUndefined()
      expect(lowered.unit.blocks.flatMap((b: any) => b.steps).find((s: any) => s.kind === "bind" && s.bindingName === "storage.Ready")).toMatchObject({ type: "value", aliasOf: "repo" })
      const forged = structuredClone(skeleton)
      for (const a of forged.anchors.filter(a => a.call?.receiverBinding)) (a.call as any).receiverBinding.source.sha256 = "stale"
      const unproved = api.lowerSourceInterpretation(forged, { schemaVersion: "source-interpretation/v1", revision: forged.revision, annotations }, { index: tools.structure, itemId: name, handle: name, questionId: "q", role: "entry", propertyDirected: true })
      expect(unproved.unit.blocks.flatMap((b: any) => b.steps).filter((s: any) => s.kind === "bind" && s.bindingName === "repo")).toEqual([])
    }
    units.push({ ...lowered.unit, questionId: "q", evidenceIds: skeleton.evidenceIds, source: skeleton.source })
  }
  for (const step of units.find(u => u.role === "entry").blocks.flatMap((b: any) => b.steps)) if (step.kind === "call") step.callee = "find"
  expect(lowerSemanticFlow(units, { compositional: true, propertyDirected: true }).diagnostics).toEqual([])
  const wrong = structuredClone(units)
  wrong.find((u: any) => u.role === "helper").parameters.find((p: any) => p.name === "owner_id").type = "principal"
  expect(lowerSemanticFlow(wrong, { compositional: true, propertyDirected: true }).diagnostics).toContainEqual(expect.objectContaining({ code: "semantic-argument-unbound", message: expect.stringContaining('has type value, but helper "find" parameter "owner_id" (principal) requires principal') }))
})
