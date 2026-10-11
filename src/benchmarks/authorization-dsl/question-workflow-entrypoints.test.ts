import { expect, test } from "bun:test"
import { mkdtemp, writeFile, readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createNativeInquiryRuntime } from "./inquiry-native.ts"
import { isFocusedInquiryStrategy, isSemanticInquiryStrategy, parseInquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"
import { resolveInquiryContext } from "./inquiry-context.ts"
import { executeLocalInquiryRun, inspectLocalInquiry, compareLocalInquiry } from "./inquiry-local.ts"
import { runAuthorizationInquiryCli } from "../../cli/authorization-inquiry.ts"
async function fixture(source = "def entry(actor, target):\n    return perform(actor, target)\n\ndef perform(actor, target):\n    if not actor.allowed:\n        return False\n    target.sent = True\n    return target\n", requiredPermission?: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), "be-question-entrance-")); await writeFile(path.join(root, "app.py"), source)
  const inquiry = { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect app.entry: authorization before the write", entryHint: "app.entry", premises: [], properties: [{ id: "auth", kind: "authorization-before-effect", requirement: "authorization before the write", ...(requiredPermission ? { requiredPermission } : {}) }] }] }
  const inputFile = path.join(root, "input.json"); await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "anonymous", sourceRef: "fixed", sourceRoot: ".", allowedPaths: ["app.py"], inquiry }))
  return { root, inputFile }
}
test("explicit H stays outside the focused semantic chain while D uses the existing interprocedural core", () => {
  const h = parseInquiryStrategy("question-guided-v1"), d = parseInquiryStrategy("question-checked-v1")
  expect(isFocusedInquiryStrategy(h)).toBe(false); expect(isSemanticInquiryStrategy(h)).toBe(false)
  expect(isFocusedInquiryStrategy(d)).toBe(true)
})
function declaration(context: any) {
  const view = context.questionWorkflow, statements: any[] = [], source = view.currentSource
  for (const a of view.sourceStatements) {
    const at = { startLine: a.startLine, endLine: a.endLine, text: a.text }
    if (a.kind === "parameter") statements.push({ kind: "object", expression: a.name, as: /actor/.test(a.name) ? "principal" : "resource", because: "Anonymous model proposal: distinct actual source formal" })
    if (a.kind === "condition") { const value = a.text === "False" ? { literal: false } : { binding: a.text.replace(/^not /, "") }; const truthy = { op: "truthy", language: "python", value }; statements.push({ kind: "condition", at, test: a.text.startsWith("not ") ? { op: "not", arg: truthy } : truthy, ...(/actor\.(allowed|can_read)/.test(a.text) ? { authorizes: { principal: "actor", resource: "target", when: "false", ...(a.text.includes("can_read") ? { permission: "read" } : {}) } } : {}), because: "Anonymous proposal: actual source branch test" }) }
    if (a.kind === "assignment" && a.text?.includes("target.sent =")) statements.push({ kind: "effect", at, principal: "actor", resource: "target", because: "Anonymous proposal: target field write" })
    if (a.kind === "call") statements.push({ kind: "dependency", at, as: "effect", principal: "actor", resource: "target", because: "Anonymous proposal: actual helper invocation is an effect candidate" })
    if (a.kind === "return") statements.push({ kind: "statement", at, outcome: a.text.includes("False") ? "deny" : "unknown", because: "Anonymous proposal: original returned value" })
  }
  const effect = view.relatedPropertySources.find((r: any) => r.kind === "assignment" && r.text.includes("target.sent =")), guard = view.relatedPropertySources.find((r: any) => r.kind === "condition" && /actor\.(allowed|can_read)/.test(r.text))
  const cite = (r: any) => ({ path: r.path, startLine: r.startLine, endLine: r.endLine, text: r.text })
  return { schemaVersion: "authorization-question-declaration/v1", source, statements, ...(effect && guard && source.startLine >= 4 ? { properties: [{ property: "authorization before the write", effect: cite(effect), guard: cite(guard) }] } : {}) }
}
test("D source declarations enter the actual account schema and existing cross-source checker before natural delivery", async () => {
  const f = await fixture(); let receive = (_m: any) => {}, sequence = 0, state = 0
  const contexts: any[] = [], sentNames: string[] = []
  const act = (wire: any) => {
    const context = resolveInquiryContext(wire, contexts); contexts.push(wire)
    const actions = ["authorization_declare", "authorization_question", "authorization_declare", "authorization_check_properties"], name = actions[state++]!
    if (!name) { receive({ method: "turn/completed", params: { threadId: "t", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", text: "Original source authorizes this target before its write; uncovered deployment paths remain unknown." }] } } }); return }
    const args = name === "authorization_declare" ? declaration(context) : name === "authorization_question" ? { action: "next-source" } : {}
    sentNames.push(name); queueMicrotask(() => receive({ id: `tool-${++sequence}`, method: "item/tool/call", params: { threadId: "t", turnId: "turn", callId: `call-${sequence}`, tool: name, arguments: args } }))
  }
  const transport: any = { isolation: { kind: "test-transport", reason: "Anonymous BE public declaration chain" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(m: any) {
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") { expect(m.params.baseInstructions).toContain("FULL_ORIGINAL_TAIL"); expect(m.params.baseInstructions).not.toContain("BE0–BE18"); expect(JSON.stringify(m.params.dynamicTools)).not.toContain("transactionId"); const tool = m.params.dynamicTools.find((t: any) => t.name === "authorization_declare"); expect(tool.description).toContain('op:"truthy"'); expect(tool.description).toContain('language:"python"|"go"'); receive({ id: m.id, result: { thread: { id: "t" }, model: "gpt-5.6-sol" } }) }
    if (m.method === "turn/start") { receive({ id: m.id, result: { turn: { id: "turn" } } }); act(JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1])) }
    if (m.result?.contentItems) { const reply = JSON.parse(m.result.contentItems[0].text); expect(reply.toolResult.status, reply.toolResult.code).not.toBe("error"); const codes = (reply.toolResult.controlDiagnostics ?? []).map((d: any) => d.code); expect(codes).not.toContain("evidence-not-shown"); if (state === 1) expect(codes).toContain("semantic-callee-uninterpreted"); act(reply.currentContext) }
  } }
  const skillFile = path.join(f.root, "SKILL.md"); await writeFile(skillFile, "---\nname: anonymous-original\ndescription: Anonymous complete source skill\n---\nFULL_ORIGINAL_TAIL\n")
  const outDir = await mkdtemp(path.join(os.tmpdir(), "be-public-session-"))
  const report: any = await executeLocalInquiryRun({ inputFile: f.inputFile, outDir, model: "gpt-5.6-sol", method: "D1", strategy: "question-checked-v1", skillFile, harness: "codex-account", accountTransportFactory: () => transport, execution: { maxToolCalls: 20, sessionTimeoutMs: 5000 } })
  const run = { account: report.telemetry.account, native: { domain: report.domain } }
  expect(String(run.account.status)).toBe("completed"); expect(sentNames).toEqual(["authorization_declare", "authorization_question", "authorization_declare", "authorization_check_properties"])
  const property = run.native.domain!.propertyAnalysis!.checks!.questions[0]!.properties[0]!
  expect(property.status, JSON.stringify({ status: property.status, diagnostics: "diagnostics" in property ? property.diagnostics : undefined })).toBe("checked")
  expect(new Set(("traceDetails" in property ? property.traceDetails : []).map((r: any) => r.source?.id).filter(Boolean)).size).toBe(2)
  expect(run.account.text).toContain("Original source")
  expect((await inspectLocalInquiry(report.sessionPath)).status).toBe("completed")
  const compared: any = await compareLocalInquiry(f.inputFile, report.sessionPath)
  expect(compared.reuseEligibility.status).toBe("reusable"); expect(compared.reuseEligibility.info.layers.R1.available).toBe(true)
  expect(compared.answerReused).toBe(false); expect(compared.reuseEligibility.info.layers.R2.available).toBe(false)
  expect(JSON.parse(await readFile(path.join(report.sessionPath, "run.json"), "utf8")).telemetry.account.text).toContain("Original source")
})
test("H actual account tools read original source and deliver natural prose through a recoverable public session", async () => {
  const f = await fixture(); let receive = (_m: any) => {}, state = 0
  const calls = [{ name: "authorization_question", arguments: { action: "locate", symbol: "app.entry" } }, { name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } }]
  const act = () => { const call = calls[state++]; if (call) queueMicrotask(() => receive({ id: `h-${state}`, method: "item/tool/call", params: { threadId: "h", turnId: "turn", callId: `h-${state}`, tool: call.name, arguments: call.arguments } })); else receive({ method: "turn/completed", params: { threadId: "h", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", text: "app.py:1-8 contains the source guard and write; deployment adoption remains unreviewed." }] } } }) }
  const transport: any = { isolation: { kind: "test-transport", reason: "Anonymous H natural delivery" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(m: any) {
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") { const names = m.params.dynamicTools.map((t: any) => t.name); expect(names).toContain("source_read"); expect(names).toContain("authorization_question"); expect(names).not.toContain("authorization_declare"); receive({ id: m.id, result: { thread: { id: "h" }, model: "gpt-5.6-sol" } }) }
    if (m.method === "turn/start") { receive({ id: m.id, result: { turn: { id: "turn" } } }); act() }
    if (m.result?.contentItems) { const reply = JSON.parse(m.result.contentItems[0].text); expect(reply.toolResult.status).not.toBe("error"); expect(reply.currentContext.questionWorkflow).toBeUndefined(); act() }
  } }
  const outDir = await mkdtemp(path.join(os.tmpdir(), "be-h-public-session-"))
  const report: any = await executeLocalInquiryRun({ inputFile: f.inputFile, outDir, model: "gpt-5.6-sol", method: "M", strategy: "question-guided-v1", harness: "codex-account", accountTransportFactory: () => transport, execution: { maxToolCalls: 20, sessionTimeoutMs: 5000 } })
  expect(report.status).toBe("completed"); expect(report.domain).toBeUndefined(); expect(report.telemetry.account.text).toContain("app.py:1-8")
  expect((await inspectLocalInquiry(report.sessionPath)).status).toBe("completed")
  for (const [method, strategy] of [["M", "legacy"], ["M", "question-guided-v1"], ["D1", "question-checked-v1"]]) {
    const outputs: string[] = []
    expect(await runAuthorizationInquiryCli(["check", `--input=${f.inputFile}`, `--method=${method}`, `--strategy=${strategy}`], { stdout: (text: string) => outputs.push(text) } as any)).toBe(0)
    expect(JSON.parse(outputs[0]!).providerCalls).toBe(0)
  }
})
for (const [name, source, permission, value] of [
  ["distinct principal", "def entry(actor, target, other_actor):\n    if not actor.allowed:\n        return False\n    return perform(other_actor, target)\n\ndef perform(actor, target):\n    target.sent = True\n    return target\n", undefined, "authorized-object-mismatch"],
  ["distinct resource", "def entry(actor, target, other):\n    if not actor.allowed:\n        return False\n    return perform(actor, other)\n\ndef perform(actor, target):\n    target.sent = True\n    return target\n", undefined, "authorized-object-mismatch"],
  ["late guard", "def entry(actor, target):\n    perform(actor, target)\n    if not actor.allowed:\n        return False\n    return True\n\ndef perform(actor, target):\n    target.sent = True\n    return target\n", undefined, "guard-not-predecessor"],
  ["unreachable guard", "def entry(actor, target):\n    if False:\n        if not actor.allowed:\n            return False\n    return perform(actor, target)\n\ndef perform(actor, target):\n    target.sent = True\n    return target\n", undefined, "guard-not-predecessor"],
  ["wrong permission", "def entry(actor, target):\n    if not actor.can_read:\n        return False\n    return perform(actor, target)\n\ndef perform(actor, target):\n    target.sent = True\n    return target\n", "write", "permission-mismatch"],
] as const) test(`D public declaration preserves ${name} rejection`, async () => {
  const f = await fixture(source, permission), runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, method: "D1", strategy: "question-checked-v1", maxToolCalls: 20 })
  try {
    for (let i = 0; i < 2; i++) {
      const context: any = await runtime.accountContext(); runtime.accountSent(JSON.stringify(context))
      expect(context.questionWorkflow).toBeTruthy()
      const reply = JSON.parse((await runtime.execute({ id: `declare-${i}`, name: "authorization_declare", arguments: declaration(context) })).output)
      expect(reply.status, reply.code).not.toBe("error")
      if (i === 0) await runtime.execute({ id: "next", name: "authorization_question", arguments: { action: "next-source" } })
    }
    await runtime.execute({ id: "check", name: "authorization_check_properties", arguments: {} })
    const property = runtime.report().domain!.propertyAnalysis!.checks!.questions[0]!.properties[0]!
    expect(property.status, JSON.stringify({ status: property.status, value: property.value, gaps: property.gaps })).toBe("violated")
    expect(property.value).toBe(value)
    expect(runtime.report().domain!.propertyAnalysis!.checks!.wholeTaskCertified).toBe(false)
  } finally { await runtime.close() }
})
test("H can locate and read source with no D draft or result form", async () => {
  const f = await fixture(), runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, method: "M", strategy: "question-guided-v1" as any })
  try {
    expect(runtime.definitions.some(d => d.name === "authorization_question")).toBe(true)
    expect(runtime.definitions.some(d => /authorization_(observe|declare|prepare_properties|check_result)/.test(d.name))).toBe(false)
    const context: any = await runtime.accountContext(); expect(context.focus).toBeUndefined(); expect(context.guidance.currentQuestion.id).toBe("q")
    const locate = JSON.parse((await runtime.execute({ id: "locate", name: "authorization_question", arguments: { action: "locate", symbol: "app.entry" } })).output)
    expect(locate.guidance.candidates.some((c: any) => c.name === "entry")).toBe(true)
    await runtime.execute({ id: "read", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } })
    expect((await runtime.accountContext() as any).guidance.coverage.readRanges).toBeGreaterThan(0)
    const params: any = { messages: [{ role: "user", content: "All original source questions" }] }
    await runtime.beforeDispatch(params)
    expect(params.tools.map((t: any) => t.name)).toContain("source_read")
    expect(params.tools.map((t: any) => t.name)).toContain("authorization_question")
    expect(runtime.report().domain).toBeUndefined()
  } finally { await runtime.close() }
})
test("D offers a domain declaration and current gaps without the low-level edit table", async () => {
  const f = await fixture(), runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, method: "D1", strategy: "question-checked-v1" as any })
  try {
    const context: any = await runtime.accountContext()
    expect(runtime.definitions.some(d => d.name === "authorization_declare")).toBe(true)
    expect(context.questionWorkflow.currentSource.path).toBe("app.py")
    expect(context.questionWorkflow.currentQuestion.id).toBe("q")
    expect(JSON.stringify(context)).not.toContain('"slots"')
    expect(JSON.stringify(context)).not.toContain('"sourceEdit"')
  } finally { await runtime.close() }
})
test("D domain location selects one actual source through the existing public focus", async () => {
  const f = await fixture(), input = JSON.parse(await readFile(f.inputFile, "utf8"))
  delete input.inquiry.questions[0].entryHint; input.inquiry.questions[0].request = "Describe original behavior"
  await writeFile(f.inputFile, JSON.stringify(input))
  const runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, method: "D1", strategy: "question-checked-v1" })
  try {
    expect((await runtime.accountContext() as any).currentStage).toBe("locate")
    await runtime.execute({ id: "locate", name: "authorization_question", arguments: { action: "locate", symbol: "app.entry" } })
    const context: any = await runtime.accountContext()
    expect(context.currentStage).toBe("interpret"); expect(context.questionWorkflow.currentSource.startLine).toBe(1)
  } finally { await runtime.close() }
})

test("D declaration of already read A routes to its owner after focus moves to B", async () => {
  const f = await fixture(), runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, method: "D1", strategy: "question-checked-v1", maxToolCalls: 24 })
  try {
    const first: any = await runtime.accountContext(); runtime.accountSent(JSON.stringify(first))
    const declaredA = declaration(first)
    await runtime.execute({ id: "first-A", name: "authorization_declare", arguments: declaredA })
    await runtime.execute({ id: "next-B", name: "authorization_question", arguments: { action: "next-source" } })
    const second: any = await runtime.accountContext(); runtime.accountSent(JSON.stringify(second))
    expect(second.questionWorkflow.currentSource.startLine).toBe(4)
    const reply = JSON.parse((await runtime.execute({ id: "again-A", name: "authorization_declare", arguments: declaredA })).output)
    expect(reply.controlDiagnostics.map((d: any) => d.code)).not.toContain("question-source-owner")
    expect(reply.controlDiagnostics.map((d: any) => d.code)).not.toContain("question-source-unoffered")
    expect(runtime.report().domain!.semantic!.units.some(u => u.source?.startLine === 1)).toBe(true)
    const invalid = async (source: any, questionId?: string) => JSON.parse((await runtime.execute({ id: "invalid-A", name: "authorization_declare", arguments: { ...declaredA, source, ...(questionId ? { questionId } : {}) } })).output).controlDiagnostics.map((d: any) => d.code)
    expect(await invalid({ ...declaredA.source, sha256: "stale" })).toContain("question-source-stale")
    expect(await invalid({ ...declaredA.source, receiverClass: "UnrelatedClass" })).toContain("question-source-receiver")
    expect(await invalid({ ...declaredA.source, path: "outside.py" })).toContain("question-source-out-of-scope")
    expect(await invalid(declaredA.source, "foreign")).toContain("question-identity")
  } finally { await runtime.close() }
})
