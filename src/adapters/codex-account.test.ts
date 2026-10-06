import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createAdapter } from "./registry.ts"
import { runAuthorizationInquiryCli } from "../cli/authorization-inquiry.ts"
import { executeLocalInquiryRun, initializeLocalInquiry, inspectLocalInquiry } from "../benchmarks/authorization-dsl/inquiry-local.ts"
const api = await import("./codex-account.ts").catch(() => ({} as any))
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "aw-account-entry-")); await mkdir(path.join(root, "source")); await writeFile(path.join(root, "source/app.py"), "def entry():\n    return False\n")
  const inputFile = path.join(root, "input.json"); await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-inquiry-input/v1", taskId: "t", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], brief: "Inspect entry and explain its outcome and limits." }))
  return { root, inputFile }
}
function fullChain(explanation = "Test-authored shown False return") {
  let receive = (_m: any) => {}, id = 0, context: any
  const sendAction = () => {
    if (!context?.focus) return
    const f = context.focus; let controlDelta: any
    if (f.stage === "locate") controlDelta = { schemaVersion: "authorization-focused-update/v1", kind: "select", focusId: f.id, candidateId: context.locationTasks[0].candidates[0].id }
    else if (f.stage === "interpret") { const s = context.tasks[0].sourceSkeleton; controlDelta = { schemaVersion: "authorization-source-update/v1", kind: "interpret", focusId: f.id, interpretation: { schemaVersion: "source-interpretation/v1", revision: s.revision, annotations: [{ anchorId: s.anchors.find((a: any) => a.kind === "return").id, role: "context", explanation, returnOutcome: "deny" }], unresolved: [] } } }
    else if (f.stage === "review") controlDelta = { schemaVersion: "authorization-focused-update/v1", kind: "review", focusId: f.id, claims: context.claims.map((c: any) => ({ claim: c.id, verdict: "confirmed", explanation: "Test-authored shown source" })) }
    const final = f.stage === "answer", args = final ? { result: { schemaVersion: "authorization-focused-result/v1", focusId: f.id, answers: context.questions.map(() => ({ explanation: "Source denies", disposition: "deny", paths: context.answerSnapshot.map((p: any) => ({ path: p.path, explanation: "Source return", disposition: "deny" })) })), scope: "Only provided source" } } : { controlDelta }
    receive({ id: `rpc-${++id}`, method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: `tool-${id}`, tool: final ? "authorization_check_result" : "authorization_observe", arguments: args } })
  }
  const transport: any = { isolation: { kind: "test-transport", reason: "Anonymous mock owns all tools" }, onMessage(f: any) { receive = f }, onExit() {}, close() {}, send(m: any) {
    if (m.method === "initialize") receive({ id: m.id, result: {} })
    if (m.method === "thread/start") { expect(m.params.baseInstructions).toContain("FULL_SKILL_TAIL"); receive({ id: m.id, result: { thread: { id: "thread" }, model: "gpt-5.6-sol" } }) }
    if (m.method === "turn/start") { context = JSON.parse(m.params.input[0].text.split("Current local explanation context: ")[1]); receive({ id: m.id, result: { turn: { id: "turn" } } }); queueMicrotask(sendAction) }
    if (m.result?.contentItems) { const value = JSON.parse(m.result.contentItems[0].text); context = value.currentContext; if (value.toolResult?.valid) { receive({ method: "item/completed", params: { threadId: "thread", turnId: "turn", item: { type: "agentMessage", phase: "final_answer", text: "The shown entry returns False and denies this source path." } } }); receive({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn", status: "completed", items: [] } } }) } else queueMicrotask(sendAction) }
  } }
  return () => transport
}
test("account adapter registry owns no LLM provider", () => { expect(createAdapter("codex-account" as any, () => { throw new Error("provider-must-not-be-used") }).name).toBe("codex-account") })
test("account adapter and inquiry use the same source core through accepted material, check and natural final", async () => {
  const f = await fixture(), adapter = new api.CodexAccountAdapter(fullChain())
  await adapter.setup({ model: "gpt-5.6-sol", maxSteps: 12, timeoutMs: 5000, providerOptions: { authorizationScope: f.inputFile, authorizationDomainTools: true, authorizationMethod: "M", authorizationStrategy: "operation-evidence-v3" } })
  const r = await adapter.run({ prompt: "Inspect entry", workDir: f.root, skill: { content: "FULL_SKILL_TAIL", mode: "inject", meta: { name: "full", description: "full" } } })
  expect(r.runStatus).toBe("ok"); expect(r.text).toContain("returns False"); expect(r.usageAvailable).toBe(false)
  expect(r.authorizationInquiry.domain.sourceMaterials.materials).toHaveLength(1)
  expect(r.authorizationInquiry.domain.materialUses).toHaveLength(1)
  expect(r.authorizationInquiry.result).toBeDefined()
  const inquiry = await api.runCodexAccountInquiry({ inputFile: f.inputFile, workDir: f.root, model: "gpt-5.6-sol", method: "M", strategy: "operation-evidence-v3", skillContent: "FULL_SKILL_TAIL", transportFactory: fullChain(), timeoutMs: 5000 })
  expect(inquiry.account.status).toBe("completed"); expect(inquiry.native.result).toBeDefined()
})
test("inquiry CLI accepts explicit account harness without silently dispatching a provider", async () => {
  const f = await fixture(), outputs: string[] = []
  // An unauthorized model fails before launching a CLI or calling any provider.
  await runAuthorizationInquiryCli(["run", `--input=${f.inputFile}`, `--out=${path.join(f.root, "out")}`, "--model=unauthorized", "--method=M", "--strategy=operation-evidence-v3", "--harness=codex-account"], { stdout: (s: string) => outputs.push(s), providerFactory: () => { throw new Error("no-provider") } } as any)
  expect(outputs.join("\n")).toContain("account-model-or-effort-unauthorized")
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
})
