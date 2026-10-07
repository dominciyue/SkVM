import { expect, test } from "bun:test"
const api = await import("./codex-account-session.ts").catch(() => ({} as any))
function mock(mode = "normal") {
  let receive = (_message: any) => {}, exited = (_error: string) => {}, executed = 0
  const sent: any[] = []
  const usage = { threadId: "thread", turnId: "turn", tokenUsage: { total: { inputTokens: 10, cachedInputTokens: 4, cacheWriteInputTokens: 0, outputTokens: 3, reasoningOutputTokens: 2, totalTokens: 13 } } }
  const emit = (method: string, params: any) => receive({ method, params })
  const transport: any = { isolation: { kind: "test-transport", reason: "No built-in tools in the test server" }, emitResponse(id: number, result: unknown) { receive({ id, result }) }, emitEvent: emit, onMessage(f: any) { receive = f }, onExit(f: any) { exited = f }, send(m: any) {
    sent.push(m)
    if (m.method === "initialize") receive({ id: m.id, result: { userAgent: "anonymous-test" } })
    if (m.method === "thread/start") receive({ id: m.id, result: { thread: { id: "thread" }, model: "gpt-5.6-sol" } })
    if (m.method === "turn/start") { receive({ id: m.id, result: { turn: { id: "turn" } } }); queueMicrotask(() => {
      if (mode === "exit") return exited("child exit")
      if (mode === "timeout") return
      if (["failed", "quota", "interrupted", "completed-no-usage", "quota-lost"].includes(mode)) {
        if (mode.startsWith("quota")) emit("error", { threadId: "thread", turnId: "turn", error: { message: "Usage limit reached", codexErrorInfo: "usageLimitExceeded" }, willRetry: false })
        if (mode === "quota-lost") return exited("transport lost")
        emit("turn/completed", { threadId: "thread", turn: { id: "turn", status: mode === "completed-no-usage" ? "completed" : mode === "interrupted" ? "interrupted" : "failed", items: mode === "completed-no-usage" ? [{ type: "agentMessage", phase: "final_answer", text: "Source conclusion" }] : [], error: mode === "quota" ? { message: "Usage limit reached", codexErrorInfo: "usageLimitExceeded" } : null } })
        // A closed transport may report exit or delayed unrelated events afterwards.
        exited("late child exit")
        emit("thread/tokenUsage/updated", { ...usage, tokenUsage: { total: { ...usage.tokenUsage.total, inputTokens: 999 } } })
        return
      }
      receive({ id: "call", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "tool-call", namespace: null, tool: mode === "forbidden" ? "execute_command" : "source_read", arguments: ["malformed", "repair-arguments"].includes(mode) ? { path: 4 } : { path: "app.py" } } })
      if (mode === "conflicting-call") receive({ id: "conflict", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "tool-call", namespace: null, tool: "source_read", arguments: { path: "elsewhere.py" } } })
      if (mode === "duplicate-call") receive({ id: "duplicate", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "tool-call", namespace: null, tool: "source_read", arguments: { path: "app.py" } } })
    }) }
    if (mode === "repair-arguments" && m.id === "call" && m.result) { queueMicrotask(() => receive({ id: "repair", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "repaired-call", namespace: null, tool: "source_read", arguments: { path: "app.py" } } })); return }
    if ((m.id === "call" || m.id === "repair") && m.result) { emit("thread/tokenUsage/updated", usage); emit("thread/tokenUsage/updated", usage); if (mode === "foreign-usage") emit("thread/tokenUsage/updated", { ...usage, turnId: "foreign", tokenUsage: { total: { ...usage.tokenUsage.total, inputTokens: 999 } } }); emit("item/completed", { threadId: "thread", turnId: "turn", item: { id: "final", type: "agentMessage", text: mode === "empty" ? "" : "Source conclusion", phase: "final_answer" } }); emit("turn/completed", { threadId: "thread", turn: { id: "turn", status: "completed", items: [] } }) }
    if (m.method === "turn/interrupt") receive({ id: m.id, result: {} })
  }, close() {} }
  const run = (extra = {}) => api.runCodexAccountSession({ model: "gpt-5.6-sol", effort: "high", cwd: ".", system: "Read-only test", prompt: "Inspect", tools: [{ name: "source_read", description: "Read", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } }], execute: async () => { executed++; return { output: "source", exitCode: 0, durationMs: 1 } }, transportFactory: () => transport, timeoutMs: 30, ...extra })
  return { run, sent, transport, late: () => receive({ id: "late", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "late", tool: "source_read", arguments: {} } }), executed: () => executed }
}
test("official session initializes, supplies isolated dynamic tools, returns final and deduplicates cumulative usage", async () => {
  const f = mock(), r = await f.run()
  expect(r.status).toBe("completed"); expect(r.text).toBe("Source conclusion"); expect(f.executed()).toBe(1)
  expect(r.usage).toEqual({ input: 10, output: 3, cacheRead: 4, cacheWrite: 0 })
  expect(r.actualUsd).toBeNull(); expect(r.providerRequests).toBeNull()
  expect(f.sent.find(m => m.method === "thread/start").params).toMatchObject({ model: "gpt-5.6-sol", environments: [], allowProviderModelFallback: false })
  expect(f.sent.find(m => m.method === "thread/start").params.dynamicTools[0].type).toBe("function")
  expect(f.sent.find(m => m.method === "turn/start").params).toMatchObject({ effort: "high", environments: [] })
})
test("unregistered dynamic calls fail before execution; empty terminal is undelivered", async () => {
  const f = mock("forbidden"), r = await f.run()
  expect(f.executed()).toBe(0); expect(r.status).toBe("unavailable")
  expect(r.events.some((e: any) => e.direction === "client" && e.result?.contentItems?.[0]?.text === "unregistered-account-tool")).toBe(true)
  expect((await mock("empty").run()).status).toBe("undelivered")
})
test("timeout interrupts its own turn, closes local consumers and ignores late tool calls", async () => {
  const f = mock("timeout"), r = await f.run(); f.late(); await Promise.resolve()
  expect(r.status).toBe("timeout-unknown"); expect(f.sent.some(m => m.method === "turn/interrupt")).toBe(true); expect(f.executed()).toBe(0)
  expect((await mock("exit").run()).status).toBe("completion-unknown")
})
test("known failed and interrupted turns are terminal independently of delivery and missing usage", async () => {
  for (const mode of ["failed", "quota", "interrupted"]) {
    const f = mock(mode), r = await f.run()
    expect(r.status).toBe(mode === "interrupted" ? "interrupted" : "failed")
    expect(r.terminalStatus).toBe(mode === "interrupted" ? "interrupted" : "failed")
    expect(r.answerDelivery).toBe("undelivered")
    expect(r.usageVisibility).toBe("unknown")
    expect(r.usage).toBeNull()
    expect(r.reason).toBe(`account-turn-${mode === "interrupted" ? "interrupted" : "failed"}`)
    expect(r.quotaRefused).toBe(mode === "quota")
    expect(f.sent.some(m => m.method === "turn/interrupt")).toBe(false)
  }
})
test("a completed answer with no usage and a completed empty turn expose different delivery", async () => {
  expect(await mock("completed-no-usage").run()).toMatchObject({ status: "completed", terminalStatus: "completed", answerDelivery: "delivered", usageVisibility: "unknown", usage: null })
  expect(await mock("empty").run()).toMatchObject({ status: "undelivered", terminalStatus: "completed", answerDelivery: "undelivered", usageVisibility: "observed" })
})
test("transport loss and timeout retain unknown terminal even when a quota error was observed", async () => {
  expect(await mock("quota-lost").run()).toMatchObject({ status: "completion-unknown", terminalStatus: "unknown", answerDelivery: "undelivered", quotaRefused: true, usageVisibility: "unknown" })
  expect(await mock("timeout").run()).toMatchObject({ status: "timeout-unknown", terminalStatus: "unknown", answerDelivery: "undelivered" })
})
test("unverified public CLI boundary sends no inference and logs no credentials or account identifiers", async () => {
  const f = mock(); f.transport.isolation = { kind: "unverified-public-cli", reason: "No public dynamic-only capability" }
  const r = await f.run()
  expect(r.status).toBe("unavailable"); expect(f.sent.some(m => m.method === "turn/start")).toBe(false)
  expect(api.redactCodexEvent({ accountId: "secret-id", apiKey: "sk-secret", tokenUsage: { inputTokens: 4 }, message: "Bearer abc.def.xyz" })).toEqual({ accountId: "[redacted]", apiKey: "[redacted]", tokenUsage: { inputTokens: 4 }, message: "Bearer [redacted]" })
})

test("credential-like natural text in skills and nested tool traces is filtered before persistence", () => {
  expect(api.redactCodexEvent({ password: "local-secret", text: "ghp_ABC123 password='local secret' user@example.com" })).toEqual({ password: "[redacted]", text: "[redacted] password=[redacted] [redacted-email]" })
})

function controlled(mode = "normal") {
  const f = mock(mode), original = f.transport.send
  let configured: Record<string, any> = {}
  f.transport.isolation = { kind: "controlled-public-cli", reason: "Version-bound metadata verification", cliVersion: "0.159.0-alpha.12.1" }
  f.transport.configure = async (config: Record<string, any>) => { configured = config }
  f.transport.send = (m: any) => {
    if (m.method === "config/read") {
      f.sent.push(m)
      return f.transport.emitResponse(m.id, { config: mode === "ignored-agents" ? { ...configured, agents: { enabled: true } } : mode === "ignored-config" ? { ...configured, web_search: "live" } : mode === "ignored-instructions" ? { ...configured, developer_instructions: "Load extra answers" } : mode === "ignored-skill-config" ? { ...configured, skills: { ...configured.skills, bundled: { enabled: true } } } : mode === "skill-discovery" ? { ...configured, features: { ...configured.features, skip_host_skill_discovery: false } } : configured })
    }
    if (m.method === "skills/list") {
      f.sent.push(m)
      return f.transport.emitResponse(m.id, { data: [{ cwd: ".", errors: [], skills: [] }] })
    }
    if (m.method === "thread/start") {
      f.sent.push(m)
      return f.transport.emitResponse(m.id, { thread: { id: "thread" }, model: "gpt-5.6-sol", modelProvider: "openai", cwd: m.params.cwd,
        runtimeWorkspaceRoots: mode === "extra-root" ? ["C:/unscoped"] : [], instructionSources: mode === "extra-instruction" ? ["C:/private/AGENTS.md"] : [],
        approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false }, activePermissionProfile: { id: "skvm-account", extends: null } })
    }
    if (m.method === "turn/start" && ["native-execution", "native-completed", "native-terminal-only", "native-subagent"].includes(mode)) {
      original(m)
      if (mode === "native-subagent") { f.transport.emitEvent("item/started", { threadId: "thread", turnId: "turn", item: { type: "subAgentActivity", kind: "started", agentThreadId: "foreign-agent" } }); return }
      if (mode === "native-terminal-only") { f.transport.emitEvent("turn/completed", { threadId: "thread", turn: { id: "turn", status: "completed", items: [{ id: "native", type: "commandExecution", command: "read outside" }, { type: "agentMessage", text: "Incorrect success", phase: "final_answer" }] } }); return }
      f.transport.emitEvent(mode === "native-completed" ? "item/completed" : "item/started", { threadId: "thread", turnId: "turn", item: { id: "native", type: "commandExecution", command: "read outside" } })
      return
    }
    original(m)
  }
  return f
}

test("controlled official transport verifies effective settings and thread boundaries before a real tool turn", async () => {
  const f = controlled(), r = await f.run({ timeoutMs: 100 })
  expect(r.status).toBe("completed")
  const t = f.sent.find(m => m.method === "thread/start").params
  expect(t).toMatchObject({ permissions: "skvm-account", runtimeWorkspaceRoots: [], environments: [] })
  expect(t.sandbox).toBeUndefined()
  expect(r.capability?.status).toBe("verified-controlled")
  expect(r.capability?.cliVersion).toBe("0.159.0-alpha.12.1")
  expect(t.config.features.code_mode_host).toEqual({ enabled: true, disable_in_process_fallback: true })
  expect(t.config.skills).toMatchObject({ bundled: { enabled: false }, include_instructions: false })
  expect(t.config.agents).toEqual({ enabled: false })
})

test("ignored account settings, extra instruction sources and extra roots refuse inference", async () => {
  for (const mode of ["ignored-config", "ignored-instructions", "ignored-skill-config", "ignored-agents", "skill-discovery", "extra-instruction", "extra-root"]) {
    const f = controlled(mode), r = await f.run({ timeoutMs: 100 })
    expect(r.status).toBe("unavailable")
    expect(f.sent.some(m => m.method === "turn/start")).toBe(false)
    expect(f.executed()).toBe(0)
  }
})

test("a subAgentActivity start alone closes the account boundary before a later collab event", async () => {
  const f = controlled("native-subagent"), r = await f.run({ timeoutMs: 100 })
  expect(r.status).toBe("unavailable")
  expect(r.reason).toBe("unexpected-native-account-tool:subAgentActivity")
  expect(f.executed()).toBe(0)
})

test("a malformed registered call receives field diagnostics and can be repaired in the same account turn", async () => {
  const f = mock("repair-arguments"), r = await f.run({ timeoutMs: 100 })
  expect(r.status).toBe("completed"); expect(f.executed()).toBe(1)
  expect(r.toolRejections).toHaveLength(1); expect(r.tools).toHaveLength(1)
  const rejected = f.sent.find(m => m.id === "call" && m.result)
  expect(rejected.result.success).toBe(false)
  expect(JSON.parse(rejected.result.contentItems[0].text)).toMatchObject({ code: "account-tool-arguments-invalid", diagnostics: [expect.objectContaining({ path: "/path", keyword: "type" })] })
  expect(f.sent.filter(m => m.method === "turn/start")).toHaveLength(1)
})
test("malformed calls consume the same bounded account call allowance", async () => {
  const f = mock("repair-arguments"), r = await f.run({ maxToolCalls: 1, timeoutMs: 100 })
  expect(r.status).toBe("unavailable"); expect(r.reason).toBe("account-tool-budget")
  expect(f.executed()).toBe(0); expect(r.toolRejections).toHaveLength(1)
})
test("conflicting duplicate identities cannot execute host tools", async () => {
  const f = mock("conflicting-call"), r = await f.run()
  expect(r.status).toBe("unavailable"); expect(r.reason).toBe("account-tool-call-identity-conflict"); expect(f.executed()).toBe(0)
  const repeated = mock("duplicate-call")
  expect((await repeated.run()).status).toBe("completed"); expect(repeated.executed()).toBe(1)
})

test("foreign-turn usage is ignored and account totals preserve cache and reasoning visibility", async () => {
  const r = await mock("foreign-usage").run()
  expect(r.usage).toEqual({ input: 10, output: 3, cacheRead: 4, cacheWrite: 0 })
  expect(r.usageDetails).toEqual({ totalTokens: 13, reasoningOutputTokens: 2, inputIncludesCached: true })
})

test("native execution in a controlled account turn terminates without dispatching a host tool", async () => {
  for (const mode of ["native-execution", "native-completed", "native-terminal-only"]) {
    const f = controlled(mode), r = await f.run({ timeoutMs: 100 })
    expect(r.status).toBe("unavailable")
    expect(r.reason).toBe("unexpected-native-account-tool:commandExecution")
    expect(f.executed()).toBe(0)
  }
})

test("account returns only after ordered asynchronous event persistence has drained", async () => {
  const persisted: unknown[] = []
  const r = await mock().run({ timeoutMs: 200, onEvent: async (event: unknown) => { await new Promise(resolve => setTimeout(resolve, 2)); persisted.push(event) } })
  expect(persisted).toEqual(r.events)
})
