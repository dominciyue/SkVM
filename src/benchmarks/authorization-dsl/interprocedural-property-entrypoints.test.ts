import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { runCodexAccountInquiry } from "../../adapters/codex-account.ts"
import { resolveInquiryContext } from "./inquiry-context.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import type { LLMProvider } from "../../providers/types.ts"
import { sourcePhaseGuide } from "./inquiry-focus.ts"
import { inquiryNativeDefinitions, inquiryNativeSchemas, inquiryStepSchemas } from "./inquiry-wire.ts"
import Ajv from "ajv"

const requirement = "authorization before the write"
test("v7 phase guidance preserves progressive adoption and actual call semantics", () => {
  const guide = sourcePhaseGuide("interpret", true, true)
  expect(guide).toContain("Valid partial edits are adopted")
  expect(guide).toContain("Calls retain their actual source invocation under every role")
  expect(guide).not.toContain("a partial draft is retained but not adopted")
})
const request = `Inspect app.entry: ${requirement}. In this anonymous fixture actor.allowed authorizes writing the supplied target; distinct input objects stay distinct.`
type Case = { id: string; source: string; status: "checked" | "violated" | "unknown"; value?: string; guard?: string; queryCall?: boolean; callRole?: string; incomplete?: string; requiredPermission?: string }
const guarded = "def perform(actor, target):\n    if not actor.allowed:\n        return False\n    target.sent = True\n    return target\n"
const fixtures: Case[] = [
  { id: "P1", source: "def entry(user, document):\n    return perform(user, document)\n\n" + guarded, guard: "perform", status: "checked", value: "satisfied" },
  { id: "P2", source: "def entry(user, document):\n    return perform(user, document)\n\n" + guarded, guard: "perform", queryCall: true, callRole: "effect", status: "checked", value: "satisfied" },
  { id: "P3", source: "def entry(actor, target):\n    if not actor.allowed:\n        return False\n    saved = identity(target)\n    return perform(actor, saved)\n\ndef identity(value):\n    return value\n\ndef perform(who, item):\n    item.sent = True\n    return item\n", guard: "entry", status: "checked", value: "satisfied" },
  { id: "N1", source: "def entry(actor, other_actor, target):\n    if not actor.allowed:\n        return False\n    return perform(other_actor, target)\n\ndef perform(who, item):\n    item.sent = True\n    return item\n", guard: "entry", status: "violated", value: "authorized-object-mismatch" },
  { id: "N2", source: "def entry(actor, target, other):\n    if not actor.allowed:\n        return False\n    return perform(actor, other)\n\ndef perform(who, item):\n    item.sent = True\n    return item\n", guard: "entry", status: "violated", value: "authorized-object-mismatch" },
  { id: "N3", source: "def entry(actor, target):\n    target.sent = True\n    return True\n\ndef AuthMiddleware(actor, target):\n    if not actor.allowed:\n        return False\n    return True\n", guard: "AuthMiddleware", status: "unknown" },
  { id: "N4", source: "def entry(actor, target, other):\n    if not actor.allowed:\n        return False\n    perform(actor, target)\n    return perform(actor, other)\n\ndef perform(who, item):\n    item.sent = True\n    return item\n", guard: "entry", status: "violated", value: "authorized-object-mismatch" },
  { id: "N5-order", source: "def entry(actor, target):\n    perform(actor, target)\n    if not actor.allowed:\n        return False\n    return True\n\ndef perform(who, item):\n    item.sent = True\n    return item\n", guard: "entry", status: "violated", value: "guard-not-predecessor" },
  { id: "N5-branch", source: "def entry(actor, target, flag):\n    if flag:\n        if not actor.allowed:\n            return False\n    return perform(actor, target)\n\ndef perform(who, item):\n    item.sent = True\n    return item\n", guard: "entry", status: "violated", value: "guard-not-predecessor" },
  { id: "N6", source: "def entry(actor, target):\n    if not actor.can_read:\n        return False\n    return perform(actor, target)\n\ndef perform(who, item):\n    item.sent = True\n    return item\n", guard: "entry", requiredPermission: "write", status: "violated", value: "permission-mismatch" },
  { id: "N7", source: "def entry(actor, target):\n    return perform(actor, target)\n\ndef perform(who, item):\n    item.sent = True\n    return item\n", status: "violated", value: "guard-not-predecessor" },
  { id: "N9-return", source: "def entry(actor, target):\n    return perform(actor, target)\n\ndef perform(who, item):\n    return False\n    item.sent = True\n", queryCall: true, callRole: "effect", status: "checked", value: "no-effect-on-covered-paths" },
  { id: "N9-raise", source: "def entry(actor, target):\n    return perform(actor, target)\n\ndef perform(who, item):\n    raise PermissionError\n    item.sent = True\n", queryCall: true, callRole: "effect", status: "checked", value: "no-effect-on-covered-paths" },
  { id: "U1", source: "def entry(actor, target):\n    if not actor.allowed:\n        return False\n    target.sent = True\n    mystery(target)\n    return True\n", guard: "entry", incomplete: "mystery", status: "checked", value: "satisfied" },
  { id: "U2", source: "def entry(actor, target):\n    mystery(target)\n    if not actor.allowed:\n        return False\n    target.sent = True\n    return True\n", guard: "entry", incomplete: "mystery", status: "unknown" },
]
const reference = (s: any, anchorId: string, operationId: string) => ({ sourceId: s.sourceId, sourceSha256: s.source.sha256, revision: s.revision, anchorId, questionId: "q", operationId })
export async function publicFixture(c: Case) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "bb-public-property-")); await writeFile(path.join(sourceRoot, "app.py"), c.source)
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["app.py"], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: c.source.split("\n").length })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request, premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement, ...(c.requiredPermission ? { requiredPermission: c.requiredPermission } : {}) }] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "operation-evidence-v7" as any, sourceAssisted: true })
  const owners = new Map<string, any>(), edits: any[] = []
  const symbols = tools.structure!.symbols.filter(s => s.kind === "function")
  for (const s of symbols) owners.set(s.name, await tools.sourceSkeleton(s.id))
  const actor = (s: any) => s.anchors.find((a: any) => a.kind === "parameter" && /^(actor|user|who|other_actor)$/.test(a.name))
  const resource = (s: any) => s.anchors.find((a: any) => a.kind === "parameter" && /^(target|document|item|value)$/.test(a.name))
  const guardOwner = c.guard && owners.get(c.guard), guard = guardOwner?.anchors.find((a: any) => a.kind === "condition" && /actor\.(allowed|can_read)/.test(a.text))
  const effectOwner = c.queryCall ? owners.get("entry") : [...owners.values()].find(s => s.anchors.some((a: any) => a.fieldWrite?.field === "sent")), effect = c.queryCall ? effectOwner.anchors.find((a: any) => a.call?.expression === "perform") : effectOwner.anchors.find((a: any) => a.fieldWrite?.field === "sent")
  const operationId = program.operationQuestions![0]!.operationId
  const binding = { propertyId: "auth", effectRef: reference(effectOwner, effect.id, operationId), ...(guard ? { guardRef: reference(guardOwner, guard.id, operationId) } : {}) }
  await runtime.sync()
  for (let step = 0; step < 24; step++) {
    const context: any = runtime.promptContext()
    expect(context.focus, `v7 must enter the public source transaction (${c.id})`).toBeTruthy()
    if (context.focus.stage === "locate") {
      const candidate = context.locationTasks[0].candidates.find((s: any) => s.name === "entry") ?? context.locationTasks[0].candidates[0]
      await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: candidate.id }); continue
    }
    if (context.focus.stage !== "interpret") break
    const task = context.tasks[0], s = owners.get(symbols.find(v => v.id === task.sourceSkeleton.sourceId)!.name), annotations: any[] = []
    for (const a of s.anchors) {
      if (a.kind === "parameter") annotations.push({ anchorId: a.id, role: /^(actor|user|who|other_actor)$/.test(a.name) ? "principal" : /^(target|document|item|value|other)$/.test(a.name) ? "resource" : "condition", explanation: "Actual distinct source parameter" })
      else if (a.kind === "condition") annotations.push({ anchorId: a.id, role: "condition", explanation: "Actual source branch", condition: { op: "truthy", language: "python", value: { binding: a.text.replace(/^not /, "") } }, ...(a.text.startsWith("not ") ? { condition: { op: "not", arg: { op: "truthy", language: "python", value: { binding: a.text.slice(4) } } } } : {}), ...(/actor\.(allowed|can_read)/.test(a.text) ? { guardBranch: "false", principalAnchorId: actor(s).id, resourceAnchorId: resource(s).id, ...(a.text.includes("can_read") ? { permission: "read" } : {}) } : {}) })
      else if (a.fieldWrite?.field === "sent") annotations.push({ anchorId: a.id, role: "effect", explanation: "Actual source field write", principalAnchorId: actor(s).id, resourceAnchorId: s.anchors.find((p: any) => p.kind === "parameter" && p.name === a.fieldWrite.object)!.id })
      else if (a.kind === "call" && a.call.expression !== c.incomplete) annotations.push({ anchorId: a.id, role: a.call.expression === "PermissionError" ? "context" : c.callRole ?? "context", explanation: "Actual source helper invocation", ...(c.callRole === "effect" ? { principalAnchorId: actor(s).id, resourceAnchorId: resource(s).id } : {}) })
      else if (a.kind === "return") annotations.push({ anchorId: a.id, role: "context", explanation: "Original source return", returnOutcome: a.valueExpression === "False" ? "deny" : "allow" })
      else if (a.kind === "raise") annotations.push({ anchorId: a.id, role: "context", explanation: "Actual authorization exception", failureKind: "authorization" })
    }
    const edit = { ...task.sourceEdit.template, edits: [...annotations.flatMap(({ anchorId, ...fields }) => Object.entries(fields).map(([field, value]) => ({ anchorId, field, value }))), ...(s.sourceId === effectOwner.sourceId ? [{ field: "propertyBindings", value: [binding] }] : []), ...s.anchors.filter((a: any) => c.incomplete && a.call?.expression === c.incomplete).map((a: any) => ({ anchorId: a.id, field: "explanation", value: "This boundary remains semantically uninterpreted" }))] }
    const proposed = await runtime.propose(edit); edits.push({ edit, diagnostics: proposed.diagnostics })
    expect(proposed.diagnostics.filter(d => /^(source-edit-|source-interpretation-|semantic-update-schema)/.test(d.code)), JSON.stringify(edits)).toEqual([])
  }
  const result = { schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "unknown", explanation: "Current local property and remaining source limitations are separate" }, branches: [], evidenceIds: tools.evidence.map(e => e.id), missing: [{ kind: "interpretation-gap", detail: "Remaining source and exceptional paths" }] }], observations: [], scope: "Shown anonymous source only" }
  await runtime.validate(result)
  return { sourceRoot, tools, program, runtime, edits, binding, result, report: runtime.report() }
}
for (const c of fixtures) test(`v7 public source chain ${c.id}`, async () => {
  const f = await publicFixture(c)
  try {
    const properties = f.report.propertyAnalysis!.checks!.questions[0]!.properties
    expect(properties).toHaveLength(1)
    const checked = properties[0]!
    expect(checked.status, JSON.stringify(checked)).toBe(c.status)
    if (c.value) expect(checked.value).toBe(c.value)
    if (c.status !== "unknown") expect(checked.trace.length).toBeGreaterThan(0)
    if (["P1", "P2", "P3"].includes(c.id)) {
      const handles = new Set(checked.trace.map(key => f.report.slice.rules.find(r => r.key === key)?.sourceOrigin?.handle))
      expect(handles.size).toBeGreaterThan(1)
      expect(f.report.materialUses!.filter(u => u.kind === "call").length).toBeGreaterThan(0)
    }
    if (c.id === "P2") expect(f.report.slice.rules.filter(r => r.kind === "effect")).toHaveLength(1)
    if (c.id === "N4") expect(new Set(f.report.slice.rules.filter(r => r.kind === "effect").map(r => r.sourceOrigin!.instance)).size).toBe(2)
    if (c.id === "N3") expect(checked.gaps.some(g => /unregistered|unbound|unavailable/.test(g))).toBe(true)
    if (c.id === "U1") { expect(f.report.semantic!.units[0]!.complete).toBe(false); expect(f.report.slice.rules.some(r => r.kind === "unresolved")).toBe(true) }
    expect(f.report.propertyAnalysis!.checks!.wholeTaskCertified).toBe(false)
  } finally { f.runtime.close() }
})
async function entrypointFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "bb-two-entrances-")), sourceRoot = path.join(root, "source"); await mkdir(sourceRoot)
  await writeFile(path.join(sourceRoot, "app.py"), fixtures[1]!.source)
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request, premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement }] }] }
  const inputFile = path.join(root, "input.json"); await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["app.py"], inquiry }))
  return { root, sourceRoot, inputFile, inquiry }
}
function publicAction(context: any) {
  if (context.focus.stage === "locate") return { schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: context.locationTasks[0].candidates[0].id }
  if (context.focus.stage === "interpret") {
    const task = context.tasks[0], anchors = task.sourceSkeleton.anchors, annotations: any[] = [], principal = anchors.find((a: any) => a.kind === "parameter" && /^(user|actor)$/.test(a.name)), resource = anchors.find((a: any) => a.kind === "parameter" && /^(document|target)$/.test(a.name))
    for (const a of anchors) {
      if (a.kind === "parameter") annotations.push({ anchorId: a.id, role: a.id === principal.id ? "principal" : "resource", explanation: "Current source parameter" })
      if (a.kind === "condition") annotations.push({ anchorId: a.id, role: "condition", explanation: "Failed actual allowed check returns", condition: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }, guardBranch: "false", principalAnchorId: principal.id, resourceAnchorId: resource.id })
      if (a.fieldWrite) annotations.push({ anchorId: a.id, role: "effect", explanation: "Current source field write", principalAnchorId: principal.id, resourceAnchorId: resource.id })
      if (a.kind === "call") annotations.push({ anchorId: a.id, role: "effect", facets: ["context"], explanation: "Actual helper effect candidate; callee decides whether it happens", principalAnchorId: principal.id, resourceAnchorId: resource.id })
      if (a.kind === "return") annotations.push({ anchorId: a.id, role: "context", explanation: "Current source return", returnOutcome: a.valueExpression === "False" ? "deny" : "unknown" })
    }
    const refs = context.propertyReferences, effect = refs.find((r: any) => r.kind === "call" && r.text.startsWith("perform(")), guard = refs.find((r: any) => r.kind === "condition" && r.text.includes("actor.allowed"))
    return { ...task.sourceEdit.template, edits: [...annotations.flatMap(({ anchorId, ...fields }) => Object.entries(fields).map(([field, value]) => ({ anchorId, field, value }))), ...(anchors.some((a: any) => a.kind === "condition") && effect && guard ? [{ field: "propertyBindings", value: [{ propertyId: "auth", effectRef: effect.ref, guardRef: guard.ref }] }] : [])] }
  }
  if (context.focus.stage === "review") return { schemaVersion: "authorization-focused-update/v1", kind: "review", focusId: context.focus.id, claims: context.claims.map((c: any) => ({ claim: c.id, verdict: "confirmed", explanation: "Anonymous shown source is the current interpretation basis" })) }
  if (context.focus.stage !== "answer") throw new Error(`Unexpected phase ${context.focus.stage}`)
  return { kind: "final", ...context.answerTemplate, answers: [{ explanation: "The helper rejects on failed authorization and writes the mapped object on continuation. Whole-task outcome remains bounded by the supplied source interpretation.", missing: [{ kind: "interpretation-gap", detail: "Entry permission outcome and exceptional source paths remain unknown" }] }], scope: "Current entry and perform source" }
}
function assertInterproceduralAdoption(domain: any) {
  expect(domain.sourceWorkMetrics.acceptedSourceUnits).toBe(2)
  expect(domain.materialUses.filter((u: any) => u.kind === "call")).toHaveLength(1)
  const property = domain.propertyAnalysis.checks.questions[0].properties[0]
  expect(property.status).toBe("checked"); expect(property.traceDetails.filter((r: any) => r.kind === "call")).toHaveLength(1)
  expect(new Set(property.traceDetails.map((r: any) => r.source.id)).size).toBe(2)
  expect(property.effectOccurrences).toHaveLength(1)
  expect(domain.semantic.units.flatMap((u: any) => u.blocks.flatMap((b: any) => b.steps)).find((s: any) => s.kind === "call").domainRoles).toEqual(["effect", "context"])
}
test("v7 ordinary structured inquiry consumes qualified source edits through the current call path", async () => {
  const f = await entrypointFixture(); let calls = 0
  const provider: LLMProvider = { name: "mock", complete: async params => {
    expect(params.system).toContain("FULL_ORIGINAL_TAIL")
    const prefix = "Current local explanation context: ", text = params.messages.at(-1)!.content, context = JSON.parse(text.slice(text.indexOf(prefix) + prefix.length).split("\n\nRemaining dispatches:")[0]!)
    return { text: "", toolCalls: [{ id: `step-${++calls}`, name: "submit_inquiry_step", arguments: publicAction(context) }], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "tool_use" }
  }, completeWithToolResults: async () => { throw new Error("Unused") } }
  const run = await runAuthorizationInquiry({ ...f, repository: "anonymous", sourceRef: "fixed", allowedPaths: ["app.py"], brief: request, provider, method: "M", strategy: "operation-evidence-v7", skillContent: "FULL_ORIGINAL_TAIL", maxDispatches: 12 })
  expect(run.wireFailures).toEqual([]); assertInterproceduralAdoption(run.domain)
})
test("v7 official native static tools consume the same interprocedural edit without injected units", async () => {
  const f = await entrypointFixture(), packets: any[] = []; let receive = (_m: any) => {}, serial = 0, final = false
  const sendAction = (packet: any) => { const context = resolveInquiryContext(packet, packets); packets.push(packet); const next: any = publicAction(context), { kind, ...result } = next; final = kind === "final"; queueMicrotask(() => receive({ id: `rpc-${++serial}`, method: "item/tool/call", params: { threadId: "t", turnId: "turn", callId: `call-${serial}`, tool: final ? "authorization_check_result" : "authorization_observe", arguments: final ? { result } : { controlDelta: next } } })) }
  const transport: any = { isolation: { kind: "test-transport", reason: "Public v7 static tool fixture" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(m: any) {
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") receive({ id: m.id, result: { thread: { id: "t" }, model: "gpt-5.6-sol" } })
    if (m.method === "turn/start") { receive({ id: m.id, result: { turn: { id: "turn" } } }); sendAction(JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1])) }
    if (m.result?.contentItems) { const reply = JSON.parse(m.result.contentItems[0].text); if (final || serial >= 12) receive({ method: "turn/completed", params: { threadId: "t", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", text: "The current helper rejects or writes the mapped resource; permission outcomes remain scoped." }] } } }); else sendAction(reply.currentContext) }
  } }
  const run = await runCodexAccountInquiry({ ...f, workDir: f.root, model: "gpt-5.6-sol", method: "M", strategy: "operation-evidence-v7", skillContent: "FULL_ORIGINAL_TAIL", transportFactory: () => transport, timeoutMs: 5000 })
  expect(run.account.status).toBe("completed"); expect(run.account.toolRejections).toEqual([]); assertInterproceduralAdoption(run.native.domain)
})
test("v7 rejects stale and cross-question references and withdraws a previous delivery (N8)", async () => {
  const f = await publicFixture(fixtures[0]!)
  try {
    expect(f.report.propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("checked")
    const handle = f.report.semantic!.units.find(u => u.source?.id === f.binding.effectRef.sourceId)!.handle
    let context: any = f.runtime.promptContext()
    await f.runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: context.focus.id, revisit: handle, reason: "Check reference invalidation" }); context = f.runtime.promptContext()
    const stale = { ...f.binding, effectRef: { ...f.binding.effectRef, revision: "stale" }, guardRef: { ...f.binding.guardRef, questionId: "another-question" } }
    await f.runtime.propose({ ...context.tasks[0].sourceEdit.template, edits: [{ field: "propertyBindings", value: [stale] }] })
    expect(f.runtime.report().propertyAnalysis!.checks).toBeUndefined()
    await f.runtime.validate(f.result)
    const check = f.runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!
    expect(check.status).toBe("unknown"); expect(check.gaps).toContain("effect-ref-stale"); expect(check.gaps).toContain("guard-ref-question-mismatch")
    expect(f.runtime.report().checkHistory.length).toBeGreaterThan(1)
  } finally { f.runtime.close() }
})
test("v7 retains a partial field across focus changes and checks again after its available helper is interpreted", async () => {
  const f = await publicFixture({ id: "progressive-repair", source: "def entry(actor, target):\n    mystery(target)\n    if not actor.allowed:\n        return False\n    target.sent = True\n    return True\n\ndef mystery(item):\n    return item\n", guard: "entry", incomplete: "mystery", status: "unknown" })
  try {
    expect(f.report.propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("unknown")
    const entry = f.report.semantic!.units.find(u => u.role === "entry")!, full = (await f.tools.sourceSkeleton(entry.source!.id))!, call = full.anchors.find(a => a.call?.expression === "mystery")!
    let context: any = f.runtime.promptContext()
    await f.runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: context.focus.id, revisit: entry.handle, reason: "Complete the retained source field" }); context = f.runtime.promptContext()
    expect(context.tasks[0].sourceEdit.retainedDraft.annotations.find((a: any) => a.anchorId === call.id)?.explanation).toBe("This boundary remains semantically uninterpreted")
    await f.runtime.propose({ ...context.tasks[0].sourceEdit.template, edits: [{ anchorId: call.id, field: "role", value: "context" }] })
    await f.runtime.validate(f.result)
    expect(f.runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("checked")
    expect(f.runtime.report().materialUses!.some(u => u.kind === "call")).toBe(true)
  } finally { f.runtime.close() }
})
test("v7 duplicate bindings and invalid edits cannot restore a withdrawn verdict before correction", async () => {
  const f = await publicFixture(fixtures[0]!)
  try {
    const helper = f.report.semantic!.units.find(u => u.source?.id === f.binding.effectRef.sourceId)!
    let context: any = f.runtime.promptContext()
    await f.runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: context.focus.id, revisit: helper.handle, reason: "Reject duplicate current binding" }); context = f.runtime.promptContext()
    const duplicate = await f.runtime.propose({ ...context.tasks[0].sourceEdit.template, edits: [{ field: "propertyBindings", value: [f.binding, f.binding] }] })
    expect(duplicate.diagnostics.some(d => /property-binding-identity/.test(d.code))).toBe(true)
    expect(f.runtime.report().propertyAnalysis!.checks).toBeUndefined()
    await f.runtime.validate(f.result)
    expect(f.runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("unknown")
    context = f.runtime.promptContext()
    await f.runtime.propose({ ...context.tasks[0].sourceEdit.template, edits: [{ field: "propertyBindings", value: [f.binding] }] })
    await f.runtime.validate(f.result)
    expect(f.runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("checked")
    await writeFile(path.join(f.sourceRoot, "app.py"), fixtures[0]!.source.replace("target.sent = True", "target.sent = False"))
    await f.tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 10 }); await f.runtime.sync()
    expect(f.runtime.report().propertyAnalysis!.checks).toBeUndefined()
    await f.runtime.validate(f.result)
    expect(f.runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("unknown")
  } finally { f.runtime.close() }
})

test("v7 public source edit clears an erroneous optional call guard before rechecking the original property", async () => {
  const f = await publicFixture(fixtures[1]!)
  try {
    const entry = f.report.semantic!.units.find(u => u.role === "entry")!, full = (await f.tools.sourceSkeleton(entry.source!.id))!, call = full.anchors.find(a => a.call?.expression === "perform")!
    let context: any = f.runtime.promptContext()
    await f.runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: context.focus.id, revisit: entry.handle, reason: "Repair only the mistaken call guard field" }); context = f.runtime.promptContext()
    const rejected = await f.runtime.propose({ ...context.tasks[0].sourceEdit.template, edits: [{ anchorId: call.id, field: "guardBranch", value: "false" }] })
    expect(rejected.diagnostics.some(d => d.code === "source-interpretation-guard")).toBe(true)
    await f.runtime.validate(f.result)
    expect(f.runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("unknown")
    context = f.runtime.promptContext()
    expect(context.tasks[0].sourceEdit.retainedDraft.annotations.find((a: any) => a.anchorId === call.id).guardBranch).toBe("false")
    const repair = { ...context.tasks[0].sourceEdit.template, edits: [{ anchorId: call.id, field: "guardBranch", value: null }] }
    expect(inquiryNativeSchemas("operation-evidence-v7", true).authorization_observe.safeParse({ controlDelta: repair }).success).toBe(true)
    expect(inquiryStepSchemas("operation-evidence-v7", false, "behavior", "interpret").schema.safeParse(repair).success).toBe(true)
    expect(new Ajv({ strict: false }).compile(inquiryNativeDefinitions("operation-evidence-v7").find(t => t.name === "authorization_observe")!.inputSchema)({ controlDelta: repair })).toBe(true)
    const repaired = await f.runtime.propose(repair)
    expect(repaired.diagnostics.filter(d => /^(source-edit-|source-interpretation-|semantic-update-schema)/.test(d.code))).toEqual([])
    await f.runtime.validate(f.result)
    const current = f.runtime.report(), property = current.propertyAnalysis!.checks!.questions[0]!.properties[0]!
    expect(property.status).toBe("checked")
    expect(new Set(("traceDetails" in property ? property.traceDetails : []).map(r => r.source?.id).filter(Boolean)).size).toBe(2)
    expect(current.semantic!.units.find(u => u.handle === entry.handle)!.blocks.flatMap(b => b.steps).find(s => s.kind === "call")!.domainRoles).toEqual(["effect"])
    expect(current.focus!.sourceInterpretations.some((h: any) => h.event === "rejected" && h.diagnostics.some((d: any) => d.code === "source-interpretation-guard"))).toBe(true)
  } finally { f.runtime.close() }
})
