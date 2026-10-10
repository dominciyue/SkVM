import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import type { InquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"
import { runAuthorizationInquiry } from "./inquiry-run.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import { runCodexAccountInquiry } from "../../adapters/codex-account.ts"
import { resolveInquiryContext } from "./inquiry-context.ts"
import Ajv from "ajv"

// Developer-authored anonymous fixture. Its explicit meanings are test data,
// never evidence of real model adoption or input to the research model.
const caller = "from helper import perform\ndef entry(actor, target):\n    if not actor.allowed:\n        return False\n    return perform(actor, target)\n"
const helper = "def perform(actor, target):\n    target.sent = True\n    return target\n"
const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry: authorization before the write, including every relevant branch.", premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement: "authorization before the write" }] }] }
const completionStrategy: InquiryStrategy = "semantic-completion-v1"
async function fixture(customInquiry: unknown = inquiry, originalCaller = caller) {
  const root = await mkdtemp(path.join(os.tmpdir(), "bd-public-"))
  await writeFile(path.join(root, "app.py"), originalCaller); await writeFile(path.join(root, "helper.py"), helper)
  const tools = await createInquiryTools({ sourceRoot: root, repository: "anonymous", sourceRef: "fixed", allowedPaths: ["."], structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true })
  await tools.execute("source_read", { path: "app.py", startLine: 1, endLine: 5 })
  const runtime = createInquiryDomainRuntime({ program: compileAuthorizationInquiry(customInquiry as any), tools, strategy: completionStrategy, sourceAssisted: true })
  await runtime.sync(false)
  let context: any = runtime.promptContext()
  if (context.focus.stage === "locate") {
    const selected = context.locationTasks[0].candidates.find((c: any) => c.name === "entry")
    await runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: selected.id })
    context = runtime.promptContext()
  }
  expect(context.focus.stage).toBe("interpret")
  return { root, tools, runtime, context }
}
const legacyEdit = (context: any) => ({ schemaVersion: "authorization-source-edit/v1", kind: "edit", transactionId: context.tasks[0].sourceEdit.transactionId, edits: [] })
function partialEdit(context: any) {
  const task = context.tasks[0], edits: any[] = []
  for (const a of task.sourceSkeleton.anchors) {
    if (a.kind === "parameter") edits.push({ anchorId: a.id, field: "role", value: a.name === "actor" ? "principal" : "resource" }, { anchorId: a.id, field: "explanation", value: "Explicit fixture input object" })
    if (a.kind === "condition") edits.push({ anchorId: a.id, field: "role", value: "condition" }, { anchorId: a.id, field: "explanation", value: "The shown branch still needs its finite predicate" })
    if (a.kind === "call") edits.push({ anchorId: a.id, field: "explanation", value: "The original helper invocation still needs its role" })
    if (a.kind === "return") edits.push({ anchorId: a.id, field: "role", value: "context" }, { anchorId: a.id, field: "explanation", value: "Actual source return" }, { anchorId: a.id, field: "returnOutcome", value: a.valueExpression === "False" ? "deny" : "unknown" })
  }
  return { ...legacyEdit(context), edits }
}
async function completedFixture(originalCaller = caller) {
  const f = await fixture(inquiry, originalCaller)
  await f.tools.execute("source_read", { path: "helper.py", startLine: 1, endLine: 3 })
  const owners = await Promise.all(f.tools.structure!.symbols.filter(s => s.kind === "function").map(s => f.tools.sourceSkeleton(s.id)))
  const entry = owners.find(s => s!.source.path === "app.py")!, effectOwner = owners.find(s => s!.source.path === "helper.py")!
  const ref = (s: any, a: any) => ({ sourceId: s.sourceId, sourceSha256: s.source.sha256, revision: s.revision, anchorId: a.id, questionId: "q", operationId: compileAuthorizationInquiry(inquiry as any).operationQuestions![0]!.operationId })
  const binding = { propertyId: "auth", guardRef: ref(entry, entry.anchors.find(a => a.kind === "condition")), effectRef: ref(effectOwner, effectOwner.anchors.find(a => a.fieldWrite)) }
  for (let n = 0; n < 10; n++) {
    const context: any = f.runtime.promptContext(), task = context.tasks[0]
    if (context.focus.stage !== "interpret") break
    const s = owners.find(s => s!.sourceId === task.sourceSkeleton.sourceId)!, principal = s.anchors.find(a => a.kind === "parameter" && a.name === "actor")!, resource = s.anchors.find(a => a.kind === "parameter" && a.name === "target")!, annotations: any[] = []
    for (const a of s.anchors) {
      if (a.kind === "parameter") annotations.push({ anchorId: a.id, role: a.id === principal.id ? "principal" : "resource", explanation: "Explicit fixture input" })
      if (a.kind === "condition") annotations.push({ anchorId: a.id, role: "condition", explanation: "Actual rejecting branch", condition: { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }, guardBranch: "false", principalAnchorId: principal.id, resourceAnchorId: resource.id })
      if (a.fieldWrite) annotations.push({ anchorId: a.id, role: "effect", explanation: "Original target write", principalAnchorId: principal.id, resourceAnchorId: resource.id })
      if (a.kind === "call") annotations.push({ anchorId: a.id, role: "context", explanation: "Original helper invocation" })
      if (a.kind === "return") annotations.push({ anchorId: a.id, role: "context", explanation: "Original return", returnOutcome: a.valueExpression === "False" ? "deny" : "allow" })
    }
    const edit = { ...legacyEdit(context), edits: [...annotations.flatMap(({ anchorId, ...fields }) => Object.entries(fields).map(([field, value]) => ({ anchorId, field, value }))), ...(s.sourceId === effectOwner.sourceId ? [{ field: "propertyBindings", value: [binding] }] : [])] }
    const proposed = await f.runtime.propose(edit)
    expect(proposed.diagnostics.filter(d => /^(source-edit-|source-interpretation-|semantic-update-schema)/.test(d.code))).toEqual([])
    if (f.runtime.report().propertyAnalysis!.checks?.questions[0]!.properties[0]!.status === "checked") break
  }
  return { ...f, binding }
}
test("accepted partial reoffers its current required fields without a manual revisit", async () => {
  const f = await fixture()
  try {
    const before = f.context, proposed = await f.runtime.propose(partialEdit(before)), report = f.runtime.report()
    expect(proposed.diagnostics.filter(d => /^(source-edit-|source-interpretation-|semantic-update-schema)/.test(d.code))).toEqual([])
    expect(report.sourceWorkMetrics!.acceptedSourceUnits).toBeGreaterThan(0)
    const unit = report.semantic!.units.find(u => u.handle === before.focus.handle)!
    expect(unit.complete).toBe(false)
    const demand = report.propertyAnalysis!.demands.find(d => d.source.id === before.focus.source.id)!
    expect(demand.required.filter(r => r.status === "missing").map(r => r.field)).toContain("role")
    expect(demand.required.filter(r => r.status === "missing").map(r => r.field)).toContain("condition")
    const next: any = f.runtime.promptContext()
    expect(next.focus.source.id).toBe(before.focus.source.id)
    expect(next.focus.handle).toBe(unit.handle)
    expect(next.tasks[0].sourceEdit.retainedDraft.annotations.length).toBeGreaterThan(0)
  } finally { f.runtime.close() }
})
test("current source properties are computed with zero final semantic checks", async () => {
  const f = await fixture()
  try {
    await f.runtime.propose(partialEdit(f.context))
    const report = f.runtime.report()
    expect(report.checkHistory).toHaveLength(0)
    expect(report.propertyAnalysis!.checks).toBeDefined()
    expect(report.propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("unknown")
    expect((report.computation as any).propertyEvaluations).toBeGreaterThan(0)
  } finally { f.runtime.close() }
})
test("read but unexplained branches name the original conclusion they block", async () => {
  const f = await fixture()
  try {
    await f.runtime.propose(partialEdit(f.context))
    const context: any = f.runtime.promptContext(), delivery = f.runtime.deliverySnapshot()
    expect(context.branchCoverage.some((b: any) => b.questionId === "q" && b.field === "condition" && b.status === "missing" && b.source.path === "app.py")).toBe(true)
    const gap = delivery.gaps.find(g => g.code === "source-field-pending" && (g as any).field === "condition")!
    expect(gap.kind).toBe("interpretation-gap")
    expect((gap as any).blockedConclusion).toContain("q")
    expect(delivery.gaps.some(g => g.kind === "source-gap" && g.source?.path === "app.py")).toBe(false)
  } finally { f.runtime.close() }
})
test("automatic cross-source checks use a stable read-only basis and reject later invalid meaning", async () => {
  const f = await completedFixture()
  try {
    const before = f.runtime.report(), property = before.propertyAnalysis!.checks!.questions[0]!.properties[0]!
    expect(before.checkHistory).toHaveLength(0)
    expect(property.status, JSON.stringify({ property, diagnostics: f.runtime.feedback().diagnostics, units: before.semantic!.units.map(u => ({ handle: u.handle, source: u.source, complete: u.complete })), completion: before.focus!.semanticCompletion?.filter(i => i.state !== "resolved") })).toBe("checked")
    expect(new Set(("traceDetails" in property ? property.traceDetails : []).map(r => r.source?.id).filter(Boolean)).size).toBe(2)
    expect(before.propertyAnalysis!.checks!.wholeTaskCertified).toBe(false)
    const count = (before.computation as any).propertyEvaluations
    const basis = (before.propertyAnalysis as any).currentPropertyBasis
    for (let n = 0; n < 3; n++) { f.runtime.report(); await f.runtime.sync(false) }
    expect((f.runtime.report().computation as any).propertyEvaluations).toBe(count)
    f.runtime.withdrawAnswer()
    f.runtime.assembleResult({ schemaVersion: "authorization-focused-result/v1", focusId: "wrong", answers: [] })
    expect((f.runtime.report().propertyAnalysis as any).currentPropertyBasis).toEqual(basis)
    expect(f.runtime.deliverySnapshot().machineAnswer).toBeUndefined()
    let context: any = f.runtime.promptContext()
    const owner = before.semantic!.units.find(u => u.source?.id === f.binding.effectRef.sourceId)!
    await f.runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: context.focus.id, revisit: owner.handle, reason: "Test invalid edit withdrawal" })
    context = f.runtime.promptContext()
    const rejected = await f.runtime.propose({ ...legacyEdit(context), edits: [{ field: "propertyBindings", value: [f.binding, f.binding] }] })
    expect(rejected.diagnostics.some(d => d.code.includes("property-binding-identity"))).toBe(true)
    expect(f.runtime.report().propertyAnalysis!.checks).toBeUndefined()
    await f.runtime.sync(false)
    expect(f.runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("unknown")
  } finally { f.runtime.close() }
})
test("binding withdrawal and changed source cannot revive a cached checked property", async () => {
  const f = await completedFixture()
  try {
    expect(f.runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("checked")
    let context: any = f.runtime.promptContext()
    const owner = f.runtime.report().semantic!.units.find(u => u.source?.id === f.binding.effectRef.sourceId)!
    await f.runtime.propose({ schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: context.focus.id, revisit: owner.handle, reason: "Withdraw the actual current binding" })
    context = f.runtime.promptContext()
    await f.runtime.propose({ ...legacyEdit(context), edits: [{ field: "propertyBindings", value: [] }] })
    expect(f.runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).toBe("unknown")
    await writeFile(path.join(f.root, "helper.py"), helper.replace("True", "False"))
    await f.runtime.sync(false)
    expect(f.runtime.report().propertyAnalysis!.checks?.questions[0]!.properties[0]!.status).not.toBe("checked")
    expect(f.runtime.deliverySnapshot().machineAnswer).toBeUndefined()
  } finally { f.runtime.close() }
})
for (const [name, source] of [
  ["another resource", "from helper import perform\ndef entry(actor, target, other):\n    if not actor.allowed:\n        return False\n    return perform(actor, other)\n"],
  ["a guard after the effect", "from helper import perform\ndef entry(actor, target):\n    perform(actor, target)\n    if not actor.allowed:\n        return False\n    return target\n"],
]) test(`the new caller-guard rule never certifies ${name}`, async () => {
  const f = await completedFixture(source)
  try { expect(f.runtime.report().propertyAnalysis!.checks!.questions[0]!.properties[0]!.status).not.toBe("checked") }
  finally { f.runtime.close() }
})
test("automatic reads and blocked source actions preserve the four final units inside 64", async () => {
  const f = await fixture(), inputFile = path.join(f.root, "input.json"); f.runtime.close()
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py", "helper.py"], inquiry }))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: f.root, domainTools: true, method: "M", strategy: completionStrategy, maxToolCalls: 64 })
  try {
    await runtime.accountContext()
    while (runtime.report().toolBudget.explorationRemaining > 0) await runtime.execute({ id: `list-${runtime.report().history.length}`, name: "source_list", arguments: {} })
    const delivery: any = await runtime.accountContext()
    expect(delivery.focus.stage).toBe("answer")
    expect(runtime.report().toolBudget.totalRemaining).toBe(4)
    for (let n = 0; n < 3; n++) await runtime.rejectArguments({ id: `malformed-final-${n}`, name: "authorization_check_result", arguments: {} }, [{ path: "/result", keyword: "required", message: "Missing final result", expected: {} }])
    expect(runtime.report().toolBudget.deliveryClosed).toBe(true)
    await runtime.execute({ id: "blocked-final", name: "authorization_check_result", arguments: {} })
    expect(runtime.report().toolBudget.totalUsed).toBe(64)
    expect(runtime.report().toolBudget.semanticChecksUsed).toBe(0)
  } finally { await runtime.close() }
})
test("repairing one pending field preserves the other field and earlier annotations", async () => {
  const f = await fixture()
  try {
    await f.runtime.propose(partialEdit(f.context))
    const context: any = f.runtime.promptContext(), call = context.tasks[0].sourceSkeleton.anchors.find((a: any) => a.kind === "call")
    const before = f.runtime.report().focus!.sourceDrafts[0]!.interpretation.annotations.filter(a => a.anchorId !== call.id)
    await f.runtime.propose({ ...legacyEdit(context), edits: [{ anchorId: call.id, field: "role", value: "context" }] })
    const report = f.runtime.report(), after = report.focus!.sourceDrafts.find(d => d.handle === f.context.focus.handle)!.interpretation.annotations.filter(a => a.anchorId !== call.id)
    expect(after).toEqual(before)
    const items = report.focus!.semanticCompletion!
    expect(items.find(i => i.handle === f.context.focus.handle && i.anchorId === call.id && i.field === "role")!.state).toBe("resolved")
    expect(items.some(i => i.handle === f.context.focus.handle && i.field === "condition" && ["pending", "offered"].includes(i.state))).toBe(true)
  } finally { f.runtime.close() }
})
test("unchanged accepted feedback leaves a named residual and advances available helper work", async () => {
  const f = await fixture()
  try {
    await f.runtime.propose(partialEdit(f.context))
    for (let n = 0; n < 2; n++) {
      const context: any = f.runtime.promptContext()
      expect(context.focus.handle).toBe(f.context.focus.handle)
      await f.runtime.propose({ ...legacyEdit(context), edits: [] })
    }
    const report = f.runtime.report(), records = report.focus!.semanticCompletion!.filter(i => i.handle === f.context.focus.handle)
    expect(records.filter(i => i.state === "residual").every(i => i.unchangedAttempts === 2)).toBe(true)
    expect(records.some(i => i.reason.includes("semantic-completion-no-progress"))).toBe(true)
    const next: any = f.runtime.promptContext()
    expect(next.focus.source.path).toBe("helper.py")
    expect(f.runtime.report().focus!.semanticCompletion).toEqual(report.focus!.semanticCompletion)
  } finally { f.runtime.close() }
})
test("a later original question obtains its own empty binding transaction while the first is partial", async () => {
  const shared = { schemaVersion: "authorization-inquiry/v2", mode: "behavior", operations: [{ id: "op", request: "Inspect app.entry", entryHint: "app.entry" }], questions: ["first", "second"].map(id => ({ ...inquiry.questions[0], id, operationId: "op", intent: "behavior", entryHint: "app.entry", properties: [{ ...inquiry.questions[0]!.properties[0], id: `p-${id}` }] })) }
  const f = await fixture(shared)
  try {
    await f.runtime.propose(partialEdit(f.context))
    const next: any = f.runtime.promptContext()
    expect(next.focus.questionId).toBe("second")
    expect(next.tasks[0].sourceEdit.retainedDraft.propertyBindings).toEqual([])
    expect(next.propertyReferences.every((r: any) => r.ref.questionId === "second")).toBe(true)
    expect(f.runtime.report().semantic!.units.find(u => u.questionId === "first")!.complete).toBe(false)
    expect(f.runtime.report().focus!.semanticCompletion!.some(i => i.questionId === "first" && ["pending", "offered"].includes(i.state))).toBe(true)
  } finally { f.runtime.close() }
})
test("source format exhaustion still leaves an independent bounded final correction", async () => {
  const f = await fixture(), inputFile = path.join(f.root, "input.json")
  f.runtime.close()
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py", "helper.py"], inquiry }))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: f.root, domainTools: true, method: "M", strategy: completionStrategy, maxToolCalls: 12 })
  try {
    await runtime.accountContext()
    for (let n = 0; n < 3; n++) await runtime.rejectArguments({ id: `source-error-${n}`, name: "authorization_observe", arguments: {} }, [{ path: "/controlDelta/edits", keyword: "type", message: "Bad edit field", expected: {} }])
    const context: any = await runtime.accountContext(false)
    expect(context.focus.stage).toBe("answer")
    const bad = { schemaVersion: "authorization-focused-result/v1", focusId: context.focus.id, answers: [{ explanation: "Retained partial", paths: [{ path: 0 }] }], scope: "Shown source" }
    const response = JSON.parse((await runtime.execute({ id: "bad-final", name: "authorization_check_result", arguments: { result: bad } })).output)
    expect(response.toolBudget.deliveryClosed).toBe(false)
    expect(response.toolBudget.semanticChecksUsed).toBe(0)
    expect(response.toolBudget.finalFormatRemaining).toBeGreaterThan(0)
    expect(runtime.report().toolBudget.totalUsed).toBeLessThanOrEqual(12)
  } finally { await runtime.close() }
})
test("a statically registered final tool cannot consume a semantic check during source interpretation", async () => {
  const f = await fixture(), inputFile = path.join(f.root, "input.json"); f.runtime.close()
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py", "helper.py"], inquiry }))
  const runtime = await createNativeInquiryRuntime({ inputFile, workDir: f.root, domainTools: true, method: "M", strategy: completionStrategy, maxToolCalls: 12 })
  try {
    const context: any = await runtime.accountContext()
    expect(context.focus.stage).not.toBe("answer")
    const response = JSON.parse((await runtime.execute({ id: "wrong-phase", name: "authorization_check_result", arguments: { result: { schemaVersion: "authorization-focused-result/v1", focusId: context.focus.id, answers: [{ explanation: "Premature" }], scope: "Shown source" } } })).output)
    expect(response.code).toBe("focus-stage")
    expect(response.toolBudget.semanticChecksUsed).toBe(0)
    expect(response.toolBudget.totalUsed).toBeGreaterThan(0)
  } finally { await runtime.close() }
})
test("provider source errors and final format correction have independent allowances", async () => {
  const f = await fixture(); f.runtime.close(); let calls = 0, sourceErrors = 0, finalSubmissions = 0
  const provider: any = { name: "mock", complete: async (params: any) => {
    const prefix = "Current local explanation context: ", text = params.messages.at(-1).content, context = JSON.parse(text.slice(text.indexOf(prefix) + prefix.length).split("\n\nRemaining dispatches:")[0])
    calls++
    const raw = context.focus.stage === "locate" ? { schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: context.locationTasks[0].candidates[0].id } : context.focus.stage === "interpret" && sourceErrors++ < 3 ? { transactionId: context.tasks[0].sourceEdit.transactionId, edits: null } : { kind: "final", ...context.answerTemplate, answers: [{ explanation: "Retained source gaps prevent a complete fixture answer", paths: ++finalSubmissions === 1 ? [{ path: 0 }] : [], missing: [{ kind: "interpretation-gap", detail: "Current source meaning remains incomplete" }] }], scope: "Shown anonymous source" }
    return { text: "", toolCalls: [{ id: `step-${calls}`, name: "submit_inquiry_step", arguments: raw }], tokens: emptyTokenUsage(), durationMs: 0 }
  }, completeWithToolResults: async () => { throw new Error("Unused") } }
  const run = await runAuthorizationInquiry({ sourceRoot: f.root, repository: "anonymous", sourceRef: "fixed", allowedPaths: ["app.py", "helper.py"], inquiry, provider, method: "M", strategy: completionStrategy, maxToolCalls: 12, maxDispatches: 14 })
  expect((run.recovery as any).sourceFormatRejections).toBe(3)
  expect((run.recovery as any).finalFormatRejections).toBe(1)
  expect((run.recovery as any).finalFormatRemaining).toBe(2)
  expect(run.recovery!.semanticChecksUsed).toBeGreaterThan(0)
  expect(run.recovery!.totalToolsUsed).toBeLessThanOrEqual(12)
})
test("actual thread/start static schema admits narrow edits and host repairs only offered slots", async () => {
  const f = await fixture(), inputFile = path.join(f.root, "input.json"); f.runtime.close()
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py", "helper.py"], inquiry }))
  let receive = (_m: any) => {}, serial = 0, badSlotSent = false, final = false, staticObserve: any, mockFailure: string | undefined
  const packets: any[] = []
  const sendAction = (packet: any) => {
    const context: any = resolveInquiryContext(packet, packets); packets.push(packet)
    let action: any
    if (context.focus.stage === "locate") action = { schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: context.focus.id, candidateId: context.locationTasks[0].candidates.find((c: any) => c.name === "entry").id }
    else if (context.focus.stage === "interpret") {
      const task = context.tasks[0], form = task.sourceEdit, anchors = task.sourceSkeleton.anchors
      expect(task.legacySourceUpdateTemplate).toBeUndefined(); expect(form.template).toEqual({ transactionId: form.transactionId, edits: [] })
      if (!badSlotSent) { badSlotSent = true; action = { ...form.template, edits: [{ slot: "not-offered", value: "context" }] } }
      else {
        const principal = anchors.find((a: any) => a.kind === "parameter" && a.name === "actor"), resource = anchors.find((a: any) => a.kind === "parameter" && a.name === "target"), edits: any[] = []
        const put = (anchor: any, field: string, value: any) => { const slot = form.slots.find((s: any) => s.anchorId === anchor?.id && s.field === field); if (slot) edits.push({ slot: slot.slot, value }) }
        for (const a of anchors) {
          if (a.kind === "parameter") put(a, "role", a.id === principal.id ? "principal" : "resource")
          else put(a, "role", a.kind === "condition" ? "condition" : a.kind === "call" || a.fieldWrite ? "effect" : "context")
          put(a, "explanation", "Explicit anonymous fixture source meaning")
          if (a.kind === "condition") { put(a, "condition", { op: "not", arg: { op: "truthy", language: "python", value: { binding: "actor.allowed" } } }); put(a, "guardBranch", "false") }
          if (a.kind === "condition" || a.kind === "call" || a.fieldWrite) { put(a, "principalAnchorId", principal.id); put(a, "resourceAnchorId", resource.id) }
          if (a.kind === "return") put(a, "returnOutcome", a.valueExpression === "False" ? "deny" : "allow")
        }
        const effect = context.propertyReferences.find((r: any) => r.kind === "call" && r.text.includes("perform(")), guard = context.propertyReferences.find((r: any) => r.kind === "condition")
        if (task.sourceSkeleton.source.path === "app.py" && effect && guard) edits.push({ slot: form.slots.find((s: any) => s.field === "propertyBindings").slot, value: [{ propertyId: "auth", effectRef: effect.ref, guardRef: guard.ref }] })
        action = { ...form.template, edits }
      }
      expect(staticObserve({ controlDelta: action })).toBe(true)
    } else if (context.focus.stage === "review") action = { schemaVersion: "authorization-focused-update/v1", kind: "review", focusId: context.focus.id, claims: context.claims.map((c: any) => ({ claim: c.id, verdict: "confirmed", explanation: "Fixture original source" })) }
    else { final = true; action = { ...context.answerTemplate, answers: [{ explanation: "The original guard precedes the helper target write; source and final validation remain distinct.", missing: [] }], scope: "Anonymous app and helper" } }
    queueMicrotask(() => receive({ id: `rpc-${++serial}`, method: "item/tool/call", params: { threadId: "t", turnId: "turn", callId: `call-${serial}`, tool: final ? "authorization_check_result" : "authorization_observe", arguments: final ? { result: action } : { controlDelta: action } } }))
  }
  const transport: any = { isolation: { kind: "test-transport", reason: "BD static public contract" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(m: any) {
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") { expect(m.params.baseInstructions).toContain("FULL_ORIGINAL_TAIL"); const declared = m.params.dynamicTools.find((t: any) => t.name === "authorization_observe"); expect(JSON.stringify(declared.inputSchema)).not.toContain("authorization-source-edit/v1"); staticObserve = new Ajv({ strict: false }).compile(declared.inputSchema); receive({ id: m.id, result: { thread: { id: "t" }, model: "gpt-5.6-sol" } }) }
    if (m.method === "turn/start") { receive({ id: m.id, result: { turn: { id: "turn" } } }); try { sendAction(JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1])) } catch (cause) { mockFailure = String(cause); throw cause } }
    if (m.result?.contentItems) { const reply = JSON.parse(m.result.contentItems[0].text); if (serial === 1 && badSlotSent) expect(reply.controlDiagnostics.some((d: any) => d.code === "source-edit-slot-unoffered")).toBe(true); if (final || serial >= 12) receive({ method: "turn/completed", params: { threadId: "t", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", text: "Original guard precedes the target write; remaining source limits are explicit." }] } } }); else sendAction(reply.currentContext) }
  } }
  const run = await runCodexAccountInquiry({ inputFile, workDir: f.root, model: "gpt-5.6-sol", method: "M", strategy: completionStrategy, skillContent: "FULL_ORIGINAL_TAIL", transportFactory: () => transport, timeoutMs: 5000, maxToolCalls: 20 })
  expect(run.account.status, JSON.stringify({ mockFailure, reason: run.account.reason, terminal: run.account.terminalStatus, history: run.native.history.map(h => ({ tool: h.call.name, output: h.output })) })).toBe("completed"); expect(run.account.toolRejections).toEqual([])
  const property: any = run.native.domain!.propertyAnalysis!.checks!.questions[0]!.properties[0]!
  expect(property.status, JSON.stringify(property)).toBe("checked")
  expect(new Set(property.traceDetails.map((r: any) => r.source?.id)).size).toBe(2)
  expect(run.native.domain!.computation.propertyEvaluations).toBeGreaterThan(0)
})
