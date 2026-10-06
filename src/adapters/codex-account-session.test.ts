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
      receive({ id: "call", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "tool-call", namespace: null, tool: mode === "forbidden" ? "execute_command" : "source_read", arguments: mode === "malformed" ? { path: 4 } : { path: "app.py" } } })
      if (mode === "conflicting-call") receive({ id: "conflict", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "tool-call", namespace: null, tool: "source_read", arguments: { path: "elsewhere.py" } } })
      if (mode === "duplicate-call") receive({ id: "duplicate", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "tool-call", namespace: null, tool: "source_read", arguments: { path: "app.py" } } })
    }) }
    if (m.id === "call" && m.result) { emit("thread/tokenUsage/updated", usage); emit("thread/tokenUsage/updated", usage); if (mode === "foreign-usage") emit("thread/tokenUsage/updated", { ...usage, turnId: "foreign", tokenUsage: { total: { ...usage.tokenUsage.total, inputTokens: 999 } } }); emit("item/completed", { threadId: "thread", turnId: "turn", item: { id: "final", type: "agentMessage", text: mode === "empty" ? "" : "Source conclusion", phase: "final_answer" } }); emit("turn/completed", { threadId: "thread", turn: { id: "turn", status: "completed", items: [] } }) }
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
  expect((await mock("empty").run()).status).toBe("undelivered")
})
test("timeout interrupts its own turn, closes local consumers and ignores late tool calls", async () => {
  const f = mock("timeout"), r = await f.run(); f.late(); await Promise.resolve()
  expect(r.status).toBe("timeout-unknown"); expect(f.sent.some(m => m.method === "turn/interrupt")).toBe(true); expect(f.executed()).toBe(0)
  expect((await mock("exit").run()).status).toBe("completion-unknown")
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
      return f.transport.emitResponse(m.id, { config: mode === "ignored-config" ? { ...configured, web_search: "live" } : mode === "ignored-instructions" ? { ...configured, developer_instructions: "Load extra answers" } : mode === "skill-discovery" ? { ...configured, features: { ...configured.features, skip_host_skill_discovery: false } } : configured })
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
    if (m.method === "turn/start" && mode === "native-execution") {
      original(m)
      f.transport.emitEvent("item/started", { threadId: "thread", turnId: "turn", item: { id: "native", type: "commandExecution", command: "read outside" } })
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
})

test("ignored account settings, extra instruction sources and extra roots refuse inference", async () => {
  for (const mode of ["ignored-config", "ignored-instructions", "skill-discovery", "extra-instruction", "extra-root"]) {
    const f = controlled(mode), r = await f.run({ timeoutMs: 100 })
    expect(r.status).toBe("unavailable")
    expect(f.sent.some(m => m.method === "turn/start")).toBe(false)
    expect(f.executed()).toBe(0)
  }
})

test("malformed tool arguments and conflicting duplicate identities cannot execute host tools", async () => {
  for (const [mode, reason] of [["malformed", "account-tool-arguments-invalid"], ["conflicting-call", "account-tool-call-identity-conflict"]]) {
    const f = mock(mode), r = await f.run()
    expect(r.status).toBe("unavailable"); expect(r.reason).toBe(reason); expect(f.executed()).toBe(0)
  }
  const repeated = mock("duplicate-call")
  expect((await repeated.run()).status).toBe("completed"); expect(repeated.executed()).toBe(1)
})

test("foreign-turn usage is ignored and account totals preserve cache and reasoning visibility", async () => {
  const r = await mock("foreign-usage").run()
  expect(r.usage).toEqual({ input: 10, output: 3, cacheRead: 4, cacheWrite: 0 })
  expect(r.usageDetails).toEqual({ totalTokens: 13, reasoningOutputTokens: 2, inputIncludesCached: true })
})

test("native execution in a controlled account turn terminates without dispatching a host tool", async () => {
  const f = controlled("native-execution"), r = await f.run({ timeoutMs: 100 })
  expect(r.status).toBe("unavailable")
  expect(r.reason).toBe("unexpected-native-account-tool:commandExecution")
  expect(f.executed()).toBe(0)
})
