import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import type { LLMTool, LLMToolCall } from "../providers/types.ts"
import type { TokenUsage } from "../core/types.ts"

export interface AccountTransport {
  isolation: { kind: "test-transport" | "unverified-public-cli"; reason: string }
  send(message: Record<string, unknown>): void
  onMessage(receive: (message: any) => void): void
  onExit(receive: (reason: string) => void): void
  close(): void | Promise<void>
}
export interface CodexAccountSessionOptions {
  model: string; effort: "high"; cwd: string; system: string; prompt: string; tools: LLMTool[]
  execute(call: LLMToolCall): Promise<{ output: string; exitCode?: number; durationMs: number }>
  timeoutMs?: number; signal?: AbortSignal; transportFactory?: () => AccountTransport
  onEvent?(event: unknown): void | Promise<void>
}
export type AccountSessionStatus = "completed" | "undelivered" | "unavailable" | "timeout-unknown" | "completion-unknown"
export interface AccountSessionResult {
  status: AccountSessionStatus; text: string; reason?: string; usage: TokenUsage | null; actualUsd: null; providerRequests: null
  durationMs: number; events: unknown[]; tools: LLMToolCall[]; model: string; effort: "high"; inferenceDispatched: boolean
}
/** Filter known credential fields/formats and account identifiers in trace data.
 * The driver never reads credential files; this is not a general secret detector. */
export function redactCodexEvent(value: unknown): any {
  if (Array.isArray(value)) return value.map(redactCodexEvent)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(?:account.?id|user.?id|email|api.?key|access.?token|refresh.?token|id.?token|auth.?token|session.?token|authorization|cookie|credentials|auth|password|secret|private.?key)$/i.test(key) ? "[redacted]" : redactCodexEvent(item)]))
  return typeof value === "string" ? value.replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]").replace(/\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]+/g, "[redacted]").replace(/\b((?:password|secret|api_key|access_token)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[redacted]").replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]") : value
}
/** The installed public protocol supplies dynamic tools but no verified exclusive
 * tool inventory. Stop before thread/inference. Internal request counts stay unknown.
 * This is a capability result, not a prompt-based sandbox. */
export function createCodexStdioTransport(): AccountTransport {
  const windows = process.platform === "win32", command = windows ? process.env.ComSpec ?? "cmd.exe" : "codex"
  const args = windows ? ["/d", "/s", "/c", "codex app-server --stdio"] : ["app-server", "--stdio"]
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
  let receive = (_message: any) => {}, exited = (_reason: string) => {}
  const reader = createInterface({ input: child.stdout })
  reader.on("line", line => { if (line.length > 16 * 1024 * 1024) { exited("app-server-frame-limit"); return }; try { receive(JSON.parse(line)) } catch { exited("app-server-invalid-json") } })
  child.stderr.resume() // CLI stderr is not a credential-safe research artifact.
  child.on("error", () => exited("codex-cli-unavailable")); child.on("exit", code => exited(`codex-child-exit:${code ?? "unknown"}`))
  return { isolation: { kind: "unverified-public-cli", reason: "public-cli-tool-inventory-unverified; public protocol cannot prove dynamic-tools-only exposure" },
    send: message => { child.stdin.write(JSON.stringify(message) + "\n") }, onMessage: f => { receive = f }, onExit: f => { exited = f },
    close: async () => {
      reader.close(); child.stdin.end()
      if (windows && child.pid && child.exitCode === null) await new Promise<void>(resolve => {
        // Only the process tree launched by this transport, never the desktop.
        const cleanup = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
        cleanup.on("error", () => { child.kill(); resolve() }); cleanup.on("exit", () => resolve())
      })
      else child.kill()
    } }
}
/** The official CLI owns the agent loop; this is deliberately not LLMProvider. */
export async function runCodexAccountSession(options: CodexAccountSessionOptions): Promise<AccountSessionResult> {
  const started = Date.now(), events: unknown[] = [], tools: LLMToolCall[] = []
  let transport: AccountTransport | undefined, sequence = 0, threadId: string | undefined, turnId: string | undefined, active = false, inferenceDispatched = false
  let usage: TokenUsage | null = null, text = "", failure: string | undefined
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>(), executed = new Map<string, Promise<Record<string, unknown>>>()
  let finish!: (status: AccountSessionStatus) => void, finished = false
  const terminal = new Promise<AccountSessionStatus>(resolve => { finish = status => { if (!finished) { finished = true; active = false; resolve(status) } } })
  const record = (event: unknown) => { const safe = redactCodexEvent(event); events.push(safe); void options.onEvent?.(safe) }
  const request = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); record({ direction: "client", id, method, params })
    try { transport!.send({ id, method, params }) } catch { pending.delete(id); reject(new Error("codex-send-failed")) }
  })
  const result = (status: AccountSessionStatus): AccountSessionResult => redactCodexEvent({ status, text, ...(failure ? { reason: failure } : {}), usage, actualUsd: null, providerRequests: null, durationMs: Date.now() - started, events, tools, model: options.model, effort: options.effort, inferenceDispatched })
  let timer: ReturnType<typeof setTimeout> | undefined
  const abort = () => { failure = "account-session-interrupted-or-timeout"; finish("timeout-unknown"); for (const p of pending.values()) p.reject(new Error(failure)); pending.clear() }
  try {
    if (options.model !== "gpt-5.6-sol" || options.effort !== "high") { failure = "account-model-or-effort-unauthorized"; return result("unavailable") }
    transport = (options.transportFactory ?? createCodexStdioTransport)()
    transport.onExit(reason => { failure = reason; finish(inferenceDispatched ? "completion-unknown" : "unavailable"); for (const p of pending.values()) p.reject(new Error(reason)); pending.clear() })
    transport.onMessage(message => {
      record({ direction: "server", ...message })
      if (typeof message.id === "number" && !message.method) { const p = pending.get(message.id); pending.delete(message.id); if (message.error) p?.reject(new Error("codex-rpc-error")); else p?.resolve(message.result); return }
      const params = message.params ?? {}
      if (message.method === "thread/tokenUsage/updated" && params.threadId === threadId) {
        const t = params.tokenUsage?.total
        if (t && [t.inputTokens, t.outputTokens, t.cachedInputTokens, t.cacheWriteInputTokens].every(v => Number.isSafeInteger(v) && v >= 0)) {
          usage = { input: Math.max(usage?.input ?? 0, t.inputTokens), output: Math.max(usage?.output ?? 0, t.outputTokens), cacheRead: Math.max(usage?.cacheRead ?? 0, t.cachedInputTokens), cacheWrite: Math.max(usage?.cacheWrite ?? 0, t.cacheWriteInputTokens) }
        }
        return
      }
      if (message.method === "item/tool/call" && message.id !== undefined) {
        if (!active || params.threadId !== threadId || turnId && params.turnId !== turnId) { transport!.send({ id: message.id, result: { success: false, contentItems: [{ type: "inputText", text: "session-closed-or-foreign-turn" }] } }); return }
        turnId ??= params.turnId
        if (params.namespace || !options.tools.some(t => t.name === params.tool)) { failure = "unregistered-account-tool"; finish("unavailable"); transport!.send({ id: message.id, result: { success: false, contentItems: [{ type: "inputText", text: failure }] } }); return }
        let execution = executed.get(params.callId)
        if (!execution) {
          const call: LLMToolCall = { id: params.callId, name: params.tool, arguments: params.arguments }; tools.push(call)
          execution = Promise.resolve().then(async () => {
            if (!active) return { success: false, contentItems: [{ type: "inputText", text: "session-closed" }] }
            const output = await options.execute(call)
            return { success: active && output.exitCode !== 1, contentItems: [{ type: "inputText", text: active ? output.output : "session-closed" }] }
          }).catch(() => ({ success: false, contentItems: [{ type: "inputText", text: "dynamic-tool-execution-failed" }] }))
          executed.set(params.callId, execution)
        }
        void execution.then(output => { if (active) transport!.send({ id: message.id, result: output }) }); return
      }
      if (!active || params.threadId !== threadId || turnId && (params.turnId ?? params.turn?.id) !== turnId) return
      if (message.method === "model/rerouted") { failure = "account-model-rerouted"; finish("unavailable") }
      if (message.method === "item/completed" && params.item?.type === "agentMessage" && [null, undefined, "final_answer"].includes(params.item.phase)) text = params.item.text ?? ""
      if (message.method === "turn/completed") {
        turnId ??= params.turn.id
        for (const item of params.turn.items ?? []) if (item.type === "agentMessage" && [null, undefined, "final_answer"].includes(item.phase)) text = item.text ?? ""
        if (params.turn.status !== "completed") { failure = `account-turn-${params.turn.status}`; finish("completion-unknown") }
        else finish(text.trim() ? "completed" : "undelivered")
      }
    })
    timer = setTimeout(abort, options.timeoutMs ?? 1200000); options.signal?.addEventListener("abort", abort, { once: true })
    if (options.signal?.aborted) abort()
    await request("initialize", { clientInfo: { name: "skvm", version: "1", title: "SkVM account runtime" }, capabilities: { experimentalApi: true, requestAttestation: false } })
    transport.send({ method: "initialized", params: {} })
    if (transport.isolation.kind !== "test-transport") { failure = transport.isolation.reason; return result("unavailable") }
    const thread = await request("thread/start", { model: options.model, allowProviderModelFallback: false, cwd: options.cwd, environments: [], sandbox: "read-only", approvalPolicy: "never", ephemeral: true, baseInstructions: options.system, dynamicTools: options.tools.map(t => ({ type: "function", name: t.name, description: t.description, inputSchema: t.inputSchema })) })
    if (thread.model !== options.model) { failure = "account-model-selection-unverified"; return result("unavailable") }
    threadId = thread.thread.id; active = true; inferenceDispatched = true
    const turn = await request("turn/start", { threadId, input: [{ type: "text", text: options.prompt, text_elements: [] }], environments: [], model: options.model, effort: options.effort })
    turnId ??= turn.turn.id
    return result(await terminal)
  } catch (error) { failure ??= String(error); return result(finished ? await terminal : inferenceDispatched ? "completion-unknown" : "unavailable") }
  finally {
    active = false; if (timer) clearTimeout(timer); options.signal?.removeEventListener("abort", abort)
    if (inferenceDispatched && threadId && turnId && failure) { try { transport?.send({ id: ++sequence, method: "turn/interrupt", params: { threadId, turnId } }) } catch { /* Own child may already have exited. */ } }
    for (const p of pending.values()) p.reject(new Error("session-closed")); pending.clear(); await transport?.close()
  }
}
