import { expect, test } from "bun:test"
const api = await import("./codex-account-session.ts").catch(() => ({} as any))
function mock(mode = "normal") {
  let receive = (_message: any) => {}, exited = (_error: string) => {}, executed = 0
  const sent: any[] = []
  const usage = { threadId: "thread", turnId: "turn", tokenUsage: { total: { inputTokens: 10, cachedInputTokens: 4, cacheWriteInputTokens: 0, outputTokens: 3, reasoningOutputTokens: 2, totalTokens: 13 } } }
  const emit = (method: string, params: any) => receive({ method, params })
  const transport: any = { isolation: { kind: "test-transport", reason: "No built-in tools in the test server" }, onMessage(f: any) { receive = f }, onExit(f: any) { exited = f }, send(m: any) {
    sent.push(m)
    if (m.method === "initialize") receive({ id: m.id, result: { userAgent: "anonymous-test" } })
    if (m.method === "thread/start") receive({ id: m.id, result: { thread: { id: "thread" }, model: "gpt-5.6-sol" } })
    if (m.method === "turn/start") { receive({ id: m.id, result: { turn: { id: "turn" } } }); queueMicrotask(() => {
      if (mode === "exit") return exited("child exit")
      if (mode === "timeout") return
      receive({ id: "call", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "tool-call", namespace: null, tool: mode === "forbidden" ? "execute_command" : "source_read", arguments: { path: "app.py" } } })
    }) }
    if (m.id === "call" && m.result) { emit("thread/tokenUsage/updated", usage); emit("thread/tokenUsage/updated", usage); emit("item/completed", { threadId: "thread", turnId: "turn", item: { id: "final", type: "agentMessage", text: mode === "empty" ? "" : "Source conclusion", phase: "final_answer" } }); emit("turn/completed", { threadId: "thread", turn: { id: "turn", status: "completed", items: [] } }) }
    if (m.method === "turn/interrupt") receive({ id: m.id, result: {} })
  }, close() {} }
  const run = (extra = {}) => api.runCodexAccountSession({ model: "gpt-5.6-sol", effort: "high", cwd: ".", system: "Read-only test", prompt: "Inspect", tools: [{ name: "source_read", description: "Read", inputSchema: { type: "object" } }], execute: async () => { executed++; return { output: "source", exitCode: 0, durationMs: 1 } }, transportFactory: () => transport, timeoutMs: 30, ...extra })
  return { run, sent, transport, late: () => receive({ id: "late", method: "item/tool/call", params: { threadId: "thread", turnId: "turn", callId: "late", tool: "source_read", arguments: {} } }), executed: () => executed }
}
test("official session initializes, supplies isolated dynamic tools, returns final and deduplicates cumulative usage", async () => {
  const f = mock(), r = await f.run()
  expect(r.status).toBe("completed"); expect(r.text).toBe("Source conclusion"); expect(f.executed()).toBe(1)
  expect(r.usage).toEqual({ input: 10, output: 3, cacheRead: 4, cacheWrite: 0 })
  expect(r.actualUsd).toBeNull(); expect(r.providerRequests).toBeNull()
  expect(f.sent.find(m => m.method === "thread/start").params).toMatchObject({ model: "gpt-5.6-sol", environments: [], allowProviderModelFallback: false })
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
