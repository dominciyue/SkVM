import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile, cp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { createAdapter } from "./registry.ts"
import { runAuthorizationInquiryCli } from "../cli/authorization-inquiry.ts"
import { executeLocalInquiryRun, initializeLocalInquiry, inspectLocalInquiry } from "../benchmarks/authorization-dsl/inquiry-local.ts"
import { resolveInquiryContext } from "../benchmarks/authorization-dsl/inquiry-context.ts"
import { createNativeInquiryRuntime } from "../benchmarks/authorization-dsl/inquiry-native.ts"
const api = await import("./codex-account.ts").catch(() => ({} as any))
const sessionApi = await import("./codex-account-session.ts").catch(() => ({} as any))
async function fixture(source = "def entry():\n    return False\n") {
  const root = await mkdtemp(path.join(os.tmpdir(), "aw-account-entry-")); await mkdir(path.join(root, "source")); await writeFile(path.join(root, "source/app.py"), source)
  const inputFile = path.join(root, "input.json"); await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], brief: "Inspect entry and explain its outcome and limits." }))
  return { root, inputFile }
}
function fullChain(explanation = "Test-authored shown False return", malformed = false) {
  let receive = (_m: any) => {}, id = 0, context: any, rejectedFocus: string | undefined
  const contexts: any[] = []
  const returns = new Map<string, string>()
  const readContext = (wire: any) => { const current = wire.contextSequence ? resolveInquiryContext(wire, contexts) : wire; contexts.push(wire); return current }
  const sendAction = () => {
    if (!context?.focus) return
    const f = context.focus; let controlDelta: any
    if (f.stage === "locate") controlDelta = { schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: f.id, candidateId: context.locationTasks[0].candidates[0].id }
    else if (f.stage === "interpret") { const s = context.tasks[0].sourceSkeleton, anchor = s.anchors.find((a: any) => a.kind === "return")?.id ?? returns.get(s.revision); if (anchor) returns.set(s.revision, anchor); controlDelta = { schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: f.id, interpretation: { schemaVersion: "source-interpretation/v1", revision: s.revision, annotations: [{ anchorId: anchor, role: "context", explanation, returnOutcome: "deny" }], fallthroughOutcome: "unknown", unresolved: [] } } }
    else if (f.stage === "review") controlDelta = { schemaVersion: "authorization-focused-update/v1", kind: "review", focusId: f.id, claims: context.claims.map((c: any) => ({ claim: c.id, verdict: "confirmed", explanation: "Test-authored shown source" })) }
    const final = f.stage === "answer", args = final ? { result: { schemaVersion: "authorization-focused-result/v1", focusId: f.id, answers: context.questions.map(() => ({ explanation: "Source denies", disposition: "deny", paths: context.answerSnapshot.map((p: any) => ({ path: p.path, explanation: "Source return", disposition: "deny" })) })), scope: "Only provided source" } } : { controlDelta }
    if (malformed && f.stage === "interpret" && !rejectedFocus) { rejectedFocus = f.id; (args as any).controlDelta.interpretation.annotations[0].role = "invented-role" }
    else if (malformed && f.stage === "interpret") expect(f.id).toBe(rejectedFocus!)
    receive({ id: `rpc-${++id}`, method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: `tool-${id}`, tool: final ? "authorization_check_result" : "authorization_observe", arguments: args } })
  }
  const transport: any = { isolation: { kind: "test-transport", reason: "Anonymous mock owns all tools" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(m: any) {
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") { expect(m.params.baseInstructions).toContain("FULL_SKILL_TAIL"); receive({ id: m.id, result: { thread: { id: "thread" }, model: "gpt-5.6-sol" } }) }
    if (m.method === "turn/start") { expect(m.params.input[0].text).not.toContain("FULL_SKILL_TAIL"); context = readContext(JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1])); receive({ id: m.id, result: { turn: { id: "turn" } } }); queueMicrotask(sendAction) }
    if (m.result?.contentItems) { if (!m.result.contentItems[0].text.startsWith("{")) return; const value = JSON.parse(m.result.contentItems[0].text); context = readContext(value.currentContext); if (value.toolResult?.valid) { receive({ method: "item/completed", params: { threadId: "thread", turnId: "turn", item: { type: "agentMessage", phase: "final_answer", text: "The shown entry returns False and denies this source path." } } }); receive({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn", status: "completed", items: [] } } }) } else queueMicrotask(sendAction) }
  } }
  return () => transport
}
test("account adapter registry owns no LLM provider", () => { expect(createAdapter("codex-account" as any, () => { throw new Error("provider-must-not-be-used") }).name).toBe("codex-account") })
for (const strategy of ["operation-evidence-v3", "operation-evidence-v4", "operation-evidence-v5", "operation-evidence-v6"] as const) test(`${strategy} account adapter and inquiry use the same source core through accepted material, check and natural final`, async () => {
  const f = await fixture(), adapter = new api.CodexAccountAdapter(fullChain())
  await adapter.setup({ model: "gpt-5.6-sol", maxSteps: 12, timeoutMs: 5000, providerOptions: { authorizationScope: f.inputFile, authorizationDomainTools: true, authorizationMethod: "M", authorizationStrategy: strategy } })
  const r = await adapter.run({ prompt: "Inspect entry", workDir: f.root, skill: { content: "FULL_SKILL_TAIL", mode: "inject", meta: { name: "full", description: "full" } } })
  expect(r.runStatus).toBe("ok"); expect(r.text).toContain("returns False"); expect(r.usageAvailable).toBe(false)
  expect(r.authorizationInquiry.domain.sourceMaterials.materials).toHaveLength(1)
  expect(r.authorizationInquiry.domain.materialUses).toHaveLength(1)
  expect(r.authorizationInquiry.result).toBeDefined()
  const inquiry = await api.runCodexAccountInquiry({ inputFile: f.inputFile, workDir: f.root, model: "gpt-5.6-sol", method: "M", strategy, skillContent: "FULL_SKILL_TAIL", transportFactory: fullChain(), timeoutMs: 5000 })
  expect(inquiry.account.status).toBe("completed"); expect(inquiry.native.result).toBeDefined()
  if (strategy === "operation-evidence-v6") expect(inquiry.native.domain.propertyAnalysis.checks).toMatchObject({ originalQuestionCount: 1, wholeTaskCertified: false })
})

test("account field repair preserves the v4 focus, charges its shared budget and delivers through retained context", async () => {
  const f = await fixture()
  const run = await api.runCodexAccountInquiry({ inputFile: f.inputFile, workDir: f.root, model: "gpt-5.6-sol", method: "M", strategy: "operation-evidence-v4", skillContent: "FULL_SKILL_TAIL", transportFactory: fullChain(undefined, true), timeoutMs: 5000 })
  expect(run.account.status).toBe("completed"); expect(run.account.toolRejections).toHaveLength(1)
  expect(run.native.rejectedToolCalls).toBe(1)
  expect(run.native.history.filter((h: any) => !h.executed)).toHaveLength(1)
  expect(run.native.domain.sourceMaterials.materials).toHaveLength(1)
  expect(run.native.result).toBeDefined()
  expect(run.native.contextPayloads.some((p: any) => p.references > 0)).toBe(true)
  const sent = run.account.events.filter((e: any) => e.direction === "client" && e.result?.contentItems).map((e: any) => JSON.parse(e.result.contentItems[0].text).currentContext)
  expect(sent.length).toBe(run.account.tools.length + run.account.toolRejections.length)
  const initial = run.account.events.find((e: any) => e.direction === "client" && e.method === "turn/start") as any
  const contexts = [JSON.parse(initial.params.input[0].text.split("Current local explanation context: ")[1]), ...sent]
  for (const context of contexts) expect(resolveInquiryContext(context, contexts).focus).toBeDefined()
})
test("account v4 accepts host-lowered try/finally source control through the current focus", async () => {
  const f = await fixture("def entry():\n    try:\n        return False\n    finally:\n        pass\n")
  const run = await api.runCodexAccountInquiry({ inputFile: f.inputFile, workDir: f.root, model: "gpt-5.6-sol", method: "M", strategy: "operation-evidence-v4", skillContent: "FULL_SKILL_TAIL", maxToolCalls: 12, transportFactory: fullChain(), timeoutMs: 5000 })
  expect(run.account.status).toBe("completed")
  expect(run.native.domain.semantic.units).toHaveLength(1)
  expect(run.native.domain.semantic.units[0].blocks.flatMap((b: any) => b.steps).some((s: any) => s.kind === "try")).toBe(true)
  expect(run.native.result).toBeDefined()
})

test("account reserved checks expose the current partial answer contract after an early failed check", async () => {
  const f = await fixture(), runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, method: "M", strategy: "operation-evidence-v4", maxToolCalls: 12 })
  try {
    const first = await runtime.accountContext() as any
    expect(first.focus.stage).not.toBe("answer")
    const failed = JSON.parse((await runtime.execute({ id: "early-check", name: "authorization_check_result", arguments: { result: { schemaVersion: "authorization-focused-result/v1", focusId: first.focus.id, answers: [{ explanation: "Original source is still uninterpreted", disposition: "unknown" }], scope: "Only the current source; incomplete interpretation" } } })).output)
    expect(failed.valid).toBe(false)
    const delivery = await runtime.accountContext() as any
    expect(delivery.focus.stage).toBe("answer")
    expect(delivery.answerSnapshot).toBeDefined()
    expect(delivery.questions).toHaveLength(1)
    expect(delivery.toolBudget.checksRemaining).toBe(1)
    expect(delivery.gaps.some((g: any) => g.kind === "interpretation-gap")).toBe(true)
    expect(delivery.instruction).toContain("authorization-focused-result/v1")
  } finally { await runtime.close() }
})
for (const exhaust of [false, true]) test(`account failed check retains an explicit source revisit until ${exhaust ? "exploration exhaustion" : "the source repair is accepted"}`, async () => {
  const f = await fixture(), runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, method: "M", strategy: "operation-evidence-v4", maxToolCalls: 12 })
  const invoke = async (name: string, args: any) => JSON.parse((await runtime.execute({ id: `${name}-${runtime.report().history.length}`, name, arguments: args })).output)
  const accountContext = async () => { const context = await runtime.accountContext() as any; runtime.accountSent(JSON.stringify(context)); return context }
  const returnAnchors = new Map<string, string>()
  const interpretation = (context: any) => {
    const skeleton = context.tasks[0].sourceSkeleton, anchor = skeleton.anchors.find((a: any) => a.kind === "return")?.id ?? returnAnchors.get(skeleton.revision)
    if (!anchor) throw new Error("The shown or retained return anchor is missing")
    returnAnchors.set(skeleton.revision, anchor)
    return { schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: context.focus.id, interpretation: { schemaVersion: "source-interpretation/v1", revision: skeleton.revision, annotations: [{ anchorId: anchor, role: "context", explanation: "The anonymous source returns False", returnOutcome: "deny" }], unresolved: [] } }
  }
  try {
    let current = await accountContext()
    if (current.focus.stage === "locate") { await invoke("authorization_observe", { controlDelta: { schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: current.focus.id, candidateId: current.locationTasks[0].candidates[0].id } }); current = await accountContext() }
    expect(current.focus.stage).toBe("interpret")
    const handle = current.focus.handle
    await invoke("authorization_observe", { controlDelta: interpretation(current) })
    const answer = await accountContext()
    expect(answer.focus.stage).toBe("answer")
    const failed = await invoke("authorization_check_result", { result: { schemaVersion: "authorization-focused-result/v1", focusId: answer.focus.id, answers: [{ explanation: "Intentionally inconsistent anonymous test claim", disposition: "allow", paths: answer.answerSnapshot.map((p: any) => ({ path: p.path, explanation: "Intentionally wrong allow", disposition: "allow" })) }], scope: "Anonymous source only" } })
    expect(failed.valid).toBe(false)
    const delivery = await accountContext()
    await invoke("authorization_observe", { controlDelta: { schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: delivery.focus.id, revisit: handle, reason: "Correct the retained original source after the failed check" } })
    const selected = (runtime.report() as any).domain.focus.current
    expect(selected.stage).toBe("interpret")
    const revisited = await accountContext()
    expect(revisited.focus).toMatchObject({ id: selected.id, stage: "interpret", handle })
    expect(revisited.toolBudget.checksRemaining).toBe(1)
    expect(revisited.tasks[0].sourceInterpretationDraft).toBeDefined()
    expect((await accountContext()).focus.id).toBe(selected.id)
    if (exhaust) {
      while (runtime.report().toolBudget.explorationRemaining > 0) await invoke("source_list", {})
      const final = await accountContext()
      expect(final.focus.stage).toBe("answer")
      expect(final.toolBudget.explorationRemaining).toBe(0)
      expect((await invoke("authorization_observe", { controlDelta: { schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: final.focus.id, revisit: handle, reason: "No budget remains" } })).code).toBe("exploration-budget")
    } else {
      const repaired = await invoke("authorization_observe", { controlDelta: interpretation(revisited) })
      expect(repaired.controlDiagnostics).toEqual([])
      const final = await accountContext()
      expect(final.focus.stage).toBe("answer")
      const checked = await invoke("authorization_check_result", { result: { schemaVersion: "authorization-focused-result/v1", focusId: final.focus.id, answers: [{ explanation: "The shown source denies", disposition: "deny", paths: final.answerSnapshot.map((p: any) => ({ path: p.path, explanation: "The shown False return", disposition: "deny" })) }], scope: "Anonymous source only" } })
      expect(checked.valid).toBe(true)
      expect(runtime.report().toolBudget.checksUsed).toBe(2)
    }
  } finally { await runtime.close() }
})
test("account failed check permits explicit read pending source work while check exhaustion ends it", async () => {
  const f = await fixture("def entry():\n    return gate()\ndef gate():\n    return False\n"), runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, method: "M", strategy: "operation-evidence-v4", maxToolCalls: 12 })
  const context = async () => { const value = await runtime.accountContext() as any; runtime.accountSent(JSON.stringify(value)); return value }
  const invoke = async (name: string, args: any) => JSON.parse((await runtime.execute({ id: `${name}-${runtime.report().history.length}`, name, arguments: args })).output)
  const incomplete = (current: any) => ({ result: { schemaVersion: "authorization-focused-result/v1", focusId: current.focus.id, answers: [{ explanation: "Original source remains uninterpreted", disposition: "unknown" }], scope: "Anonymous source with an explicit interpretation gap" } })
  try {
    await invoke("source_read", { path: "app.py", startLine: 1, endLine: 4 })
    let first = await context()
    if (first.focus.stage === "locate") { await invoke("authorization_observe", { controlDelta: { schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: first.focus.id, candidateId: first.locationTasks[0].candidates[0].id } }); first = await context() }
    expect((await invoke("authorization_check_result", incomplete(first))).valid).toBe(false)
    const delivery = await context(), pending = delivery.pendingSourceWork.find((i: any) => i.symbol === "gate")
    expect(pending.state).toBe("awaiting-interpretation")
    await invoke("authorization_observe", { controlDelta: { schemaVersion: "authorization-focused-update/v1", kind: "defer", focusId: delivery.focus.id, nextItemId: pending.id, reason: "Interpret the actually read original helper before the remaining check" } })
    const selected = (runtime.report() as any).domain.focus.current, next = await context()
    expect(next.focus).toMatchObject({ id: selected.id, stage: "interpret", itemId: pending.id })
    expect(next.tasks[0].sourceSkeleton.source.id).toBe(pending.source.id)
    expect((await invoke("authorization_check_result", incomplete(next))).valid).toBe(false)
    const exhausted = await context()
    expect(exhausted.toolBudget.explorationRemaining).toBeGreaterThan(0)
    expect(exhausted.toolBudget.checksRemaining).toBe(0)
    expect(exhausted.focus.stage).toBe("answer")
  } finally { await runtime.close() }
})
test("account exhausted exploration offers all original questions for partial delivery without another read", async () => {
  const f = await fixture(), runtime = await createNativeInquiryRuntime({ inputFile: f.inputFile, workDir: f.root, domainTools: true, method: "M", strategy: "operation-evidence-v4", maxToolCalls: 3 })
  try {
    await runtime.execute({ id: "read", name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 2 } })
    const delivery = await runtime.accountContext() as any
    expect(delivery.toolBudget.explorationRemaining).toBe(0)
    expect(delivery.focus.stage).toBe("answer")
    expect(delivery.questions).toHaveLength(1)
    const used = runtime.report().toolBudget.totalUsed
    await runtime.accountContext()
    expect(runtime.report().toolBudget.totalUsed).toBe(used)
  } finally { await runtime.close() }
})

test("account boundary file admits only exact pinned instructions and is supported by both inquiry entrances", async () => {
  const f = await fixture(), source = path.join(f.root, "generic-policy.md"), boundary = path.join(f.root, "boundary.json")
  await writeFile(source, "Use bounded read-only source tools.")
  const approved = { path: source, sha256: createHash("sha256").update(await readFile(source)).digest("hex") }
  await writeFile(boundary, JSON.stringify({ schemaVersion: "codex-account-boundary/v1", instructionSources: [approved] }))
  expect(await sessionApi.loadCodexAccountBoundary(boundary)).toEqual([approved])
  await writeFile(boundary, JSON.stringify({ schemaVersion: "codex-account-boundary/v1", instructionSources: [approved], answer: "must not be silently admitted" }))
  const transportFactory = () => { throw new Error("must-not-launch") }
  await expect(api.runCodexAccountInquiry({ inputFile: f.inputFile, workDir: f.root, model: "gpt-5.6-sol", accountBoundaryFile: boundary, transportFactory })).rejects.toThrow("account-boundary-invalid")
  await expect(runAuthorizationInquiryCli(["run", `--input=${f.inputFile}`, `--out=${path.join(f.root, "boundary-out")}`, "--model=unauthorized", "--harness=codex-account", `--account-boundary=${boundary}`], { stdout() {} } as any)).rejects.toThrow("account-boundary-invalid")
})
test("inquiry CLI accepts explicit account harness without silently dispatching a provider", async () => {
  const f = await fixture(), outputs: string[] = []
  // An unauthorized model fails before launching a CLI or calling any provider.
  await runAuthorizationInquiryCli(["run", `--input=${f.inputFile}`, `--out=${path.join(f.root, "out")}`, "--model=unauthorized", "--method=M", "--strategy=operation-evidence-v3", "--harness=codex-account"], { stdout: (s: string) => outputs.push(s), providerFactory: () => { throw new Error("no-provider") } } as any)
  expect(outputs.join("\n")).toContain("account-model-or-effort-unauthorized")
})
test("ordinary account sessions retain an explicit N/D switch and the complete skill across relocation", async () => {
  const f = await fixture(), skillFile = path.join(f.root, "SKILL.md")
  await writeFile(skillFile, "---\nname: anonymous-audit\ndescription: Inspect original source\n---\nFULL_SKILL_TAIL\n")
  let receive = (_m: any) => {}, observedTools: string[] = []
  const transport: any = { isolation: { kind: "test-transport", reason: "Local session contract" }, onMessage(fn: any) { receive = fn }, onExit() {}, close() {}, send(m: any) {
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") { expect(m.params.baseInstructions).toContain("FULL_SKILL_TAIL"); observedTools = m.params.dynamicTools.map((t: any) => t.name); receive({ id: m.id, result: { thread: { id: "t" }, model: "gpt-5.6-sol" } }) }
    if (m.method === "turn/start") { receive({ id: m.id, result: { turn: { id: "turn" } } }); receive({ method: "turn/completed", params: { threadId: "t", turn: { id: "turn", status: "completed", items: [{ type: "agentMessage", text: "The provided entry returns False; broader runtime facts remain unspecified." }] } } }) }
  } }
  const run: any = await executeLocalInquiryRun({ inputFile: f.inputFile, outDir: path.join(f.root, "n"), model: "gpt-5.6-sol", method: "M", strategy: "legacy", harness: "codex-account", domainTools: false, skillFile, accountTransportFactory: () => transport })
  expect(run.status).toBe("completed"); expect(run.domainTools).toBe(false)
  expect(observedTools).toContain("source_read"); expect(observedTools).not.toContain("authorization_observe")
  expect(run.domain).toBeUndefined()
  expect(await readFile(path.join(run.sessionPath, "skill-original.md"), "utf8")).toBe(await readFile(skillFile, "utf8"))
  const moved = path.join(f.root, "moved"); await cp(run.sessionPath, moved, { recursive: true })
  expect((await inspectLocalInquiry(moved)).sessionPath).toBe(moved)
  expect((await inspectLocalInquiry(moved)).domainTools).toBe(false)
  let output = ""
  await runAuthorizationInquiryCli(["run", `--input=${f.inputFile}`, `--out=${path.join(f.root, "cli-n")}`, "--model=unauthorized", "--harness=codex-account", "--domain-tools=false"], { stdout: (s: string) => output = s } as any)
  expect(JSON.parse(output).domainTools).toBe(false)
  await expect(runAuthorizationInquiryCli(["run", `--input=${f.inputFile}`, "--out=unused", "--model=mock", "--domain-tools=false"], { stdout() {} } as any)).rejects.toThrow("requires --harness=codex-account")
})
test("account traces and adapter reports filter credential-like tool text before persistence", async () => {
  const f = await fixture(), traceDir = path.join(f.root, "trace"), secret = "ghp_ABC123 password='local secret'"
  const adapter = new api.CodexAccountAdapter(fullChain(`Test-authored return ${secret}`))
  await adapter.setup({ model: "gpt-5.6-sol", maxSteps: 12, timeoutMs: 5000, providerOptions: { authorizationScope: f.inputFile, authorizationDomainTools: true, authorizationMethod: "M", authorizationStrategy: "operation-evidence-v3", authorizationTraceDir: traceDir } })
  const result = await adapter.run({ prompt: "Inspect entry", workDir: f.root, skill: { content: "FULL_SKILL_TAIL", mode: "inject", meta: { name: "full", description: "full" } } })
  expect(result.runStatus).toBe("ok")
  for (const recorded of [await readFile(path.join(traceDir, "tools.jsonl"), "utf8"), JSON.stringify(result)]) {
    expect(recorded).not.toContain("ghp_ABC123"); expect(recorded).not.toContain("local secret"); expect(recorded).toContain("[redacted]")
  }
})
test("account D0 is explicitly unsupported and cannot become a D1 run", async () => {
  const f = await fixture(), transportFactory = () => { throw new Error("must-not-launch") }
  await expect(api.runCodexAccountInquiry({ inputFile: f.inputFile, workDir: f.root, model: "gpt-5.6-sol", method: "D0", transportFactory })).rejects.toThrow("codex-account-method-D0-unsupported")
  await expect(new api.CodexAccountAdapter(transportFactory).setup({ model: "gpt-5.6-sol", providerOptions: { authorizationScope: f.inputFile, authorizationMethod: "D0" } })).rejects.toThrow("codex-account-method-D0-unsupported")
})
test("account entrances reject provider-specific limits instead of silently ignoring them", async () => {
  const f = await fixture(), transportFactory = () => { throw new Error("must-not-launch") }
  await expect(new api.CodexAccountAdapter(transportFactory).setup({ model: "gpt-5.6-sol", providerOptions: { authorizationScope: f.inputFile, authorizationMaxOutputTokens: 6000 } })).rejects.toThrow("account-provider-limit-unobservable")
  await expect(runAuthorizationInquiryCli(["run", `--input=${f.inputFile}`, `--out=${path.join(f.root, "out-limits")}`, "--model=gpt-5.6-sol", "--harness=codex-account", "--max-provider-calls=24"], { stdout() {}, providerFactory: () => { throw new Error("no-provider") } } as any)).rejects.toThrow("account-provider-limit-unobservable")
})
for (const mode of ["behavior", "conformance"] as const) test(`account inquiry ${mode} archive retains the public host declaration for inspect/export without inference`, async () => {
  const f = await fixture(), outDir = path.join(f.root, "account-archive"), exported = path.join(f.root, "declared.json")
  if (mode === "conformance") { const input = JSON.parse(await readFile(f.inputFile, "utf8")); await writeFile(f.inputFile, JSON.stringify({ ...input, mode })) }
  const run = await executeLocalInquiryRun({ inputFile: f.inputFile, outDir, model: "unauthorized", method: "M", strategy: "operation-evidence-v3", harness: "codex-account" })
  expect(run.status).toBe("unavailable")
  expect((await inspectLocalInquiry(outDir)).status).toBe("unavailable")
  expect((await initializeLocalInquiry(outDir, exported)).providerCalls).toBe(0)
  const declaration = JSON.parse(await readFile(exported, "utf8"))
  expect(declaration.inquiry.mode).toBe(mode)
  expect(declaration.inquiry.operations[0].request).toBe("Inspect entry and explain its outcome and limits.")
  expect(declaration).not.toHaveProperty("result"); expect(declaration).not.toHaveProperty("domain")
  const reportFile = path.join((run as any).sessionPath, "report.json"), original = await readFile(reportFile, "utf8")
  for (const key of ["terminalStatus", "answerDelivery", "usageVisibility", "quotaRefused"]) {
    await writeFile(reportFile, JSON.stringify({ ...JSON.parse(original), [key]: "altered" }))
    await expect(inspectLocalInquiry(outDir)).rejects.toThrow("report/run identity mismatch")
  }
  await writeFile(reportFile, original)
})
