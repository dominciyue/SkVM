import { spawn, spawnSync } from "node:child_process"
import { createInterface } from "node:readline"
import { createHash } from "node:crypto"
import { readFile, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import Ajv from "ajv"
import { z } from "zod"
import type { LLMTool, LLMToolCall } from "../providers/types.ts"
import type { TokenUsage } from "../core/types.ts"

export interface AccountTransport {
  isolation: { kind: "test-transport" | "unverified-public-cli" | "controlled-public-cli"; reason: string; cliVersion?: string }
  configure?(config: Record<string, unknown>): Promise<void>
  send(message: Record<string, unknown>): void
  onMessage(receive: (message: any) => void): void
  onExit(receive: (reason: string) => void): void
  close(): void | Promise<void>
}
export interface CodexAccountSessionOptions {
  purpose?: string; attempt?: string
  resumeAfter?: AccountSessionResult
  model: string; effort: "high"; cwd: string; system: string; prompt: string; tools: LLMTool[]
  execute(call: LLMToolCall): Promise<{ output: string; exitCode?: number; durationMs: number }>
  rejectArguments?(call: LLMToolCall, diagnostics: AccountArgumentDiagnostic[]): Promise<{ output: string; exitCode?: number; durationMs: number }>
  argumentDiagnostics?(call: LLMToolCall): AccountArgumentDiagnostic[] | undefined
  maxToolCalls?: number
  shouldFinalize?(): boolean
  finalizeAfterMs?: number
  timeoutMs?: number; signal?: AbortSignal; transportFactory?: () => AccountTransport
  instructionSources?: Array<{ path: string; sha256: string }>
  onEvent?(event: unknown): void | Promise<void>
}
export interface AccountArgumentDiagnostic { path: string; keyword: string; message: string; expected: unknown }
export type AccountSessionStatus = "completed" | "failed" | "interrupted" | "undelivered" | "unavailable" | "timeout-unknown" | "completion-unknown"
export interface AccountSessionResult {
  lifecycle?: AccountSessionLifecycle
  status: AccountSessionStatus; text: string; reason?: string; usage: TokenUsage | null; actualUsd: null; providerRequests: null
  terminalStatus: "completed" | "failed" | "interrupted" | "unknown" | "not-started"
  answerDelivery: "delivered" | "undelivered"; usageVisibility: "observed" | "unknown"; quotaRefused: boolean
  terminalError?: { message?: string; codexErrorInfo?: unknown; additionalDetails?: string }
  transportExit?: { reason: string; stderrTail: string; stderrTruncated: boolean }
  durationMs: number; events: unknown[]; tools: LLMToolCall[]; model: string; effort: "high"; inferenceDispatched: boolean
  toolRejections: Array<{ call: LLMToolCall; diagnostics: AccountArgumentDiagnostic[] }>
  capability?: { status: "verified-controlled"; cliVersion: string; effectiveConfig: Record<string, unknown>; instructionSources: Array<{ path: string; sha256: string }>; runtimeWorkspaceRoots: string[] }
  usageDetails?: { totalTokens: number; reasoningOutputTokens: number; inputIncludesCached: true }
  usageSource?: { method: "thread/tokenUsage/updated"; aggregation: "max-per-counter"; inputIncludesCached: true; rawTotal: Record<string, number> }
}
export interface AccountSessionLifecycle {
  purpose?: string; attempt?: string; threadId?: string; turnId?: string
  resumedFromTurnId?: string
  hostFinalization?: "budget-reserve"
  finalizesThreadId?: string
  finalizesTurnId?: string
  turnStartAttempted: boolean; turnStartAcknowledged: boolean; providerTerminalObserved: boolean
  localExecution: "active" | "closed" | "unconfirmed"
  persistence: "requested" | "confirmed"; toolsSha256: string
}

/** Shared request bookkeeping; callers own notifications and capability checks. */
function createAccountRpc(send: (message: Record<string, unknown>) => void, record: (event: unknown) => void) {
  let sequence = 0
  const pending = new Map<number, { method: string; resolve: (value: any) => void; reject: (error: Error) => void }>()
  return {
    method: (id: unknown) => typeof id === "number" ? pending.get(id)?.method : undefined,
    request: (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
      const id = ++sequence; pending.set(id, { method, resolve, reject }); record({ direction: "client", id, method, params })
      try { send({ id, method, params }) } catch { pending.delete(id); reject(new Error("codex-send-failed")) }
    }),
    receive(message: any) {
      if (typeof message.id !== "number" || message.method) return false
      const p = pending.get(message.id); pending.delete(message.id)
      if (message.error) p?.reject(new Error("codex-rpc-error:" + String(redactCodexEvent(message.error.message ?? message.error.code))))
      else p?.resolve(message.result)
      return true
    },
    close(reason: string) { for (const p of pending.values()) p.reject(new Error(reason)); pending.clear() },
  }
}

export interface AccountThreadObservation {
  status: "terminal-found" | "not-found" | "unavailable" | "nonterminal"
  threadId: string; turnId: string; terminalStatus: AccountSessionResult["terminalStatus"]
  ephemeral?: boolean; reason?: string; events: unknown[]
}
/** Inspection never resumes, starts a turn, or dispatches a persisted tool call. */
export async function readCodexAccountThread(options: {
  threadId: string; turnId: string; timeoutMs?: number; transportFactory?: () => AccountTransport
  onEvent?(event: unknown): void | Promise<void>
}): Promise<AccountThreadObservation> {
  const events: unknown[] = []; let writes = Promise.resolve(), transport: AccountTransport | undefined
  const record = (event: unknown) => { const safe = redactCodexEvent(event); events.push(safe); writes = writes.then(async () => { await options.onEvent?.(safe) }) }
  const rpc = createAccountRpc(message => transport!.send(message), record)
  const timer = setTimeout(() => rpc.close("account-read-timeout"), options.timeoutMs ?? 15000)
  const base = { threadId: options.threadId, turnId: options.turnId, terminalStatus: "unknown" as const, events }
  try {
    transport = (options.transportFactory ?? createCodexStdioTransport)()
    transport.onExit(reason => rpc.close(reason))
    transport.onMessage(message => { record({ direction: "server", ...message }); rpc.receive(message) })
    await rpc.request("initialize", { clientInfo: { name: "skvm", version: "1" }, capabilities: { experimentalApi: true, requestAttestation: false } })
    transport.send({ method: "initialized", params: {} })
    if (transport.isolation.kind === "unverified-public-cli") return { ...base, status: "unavailable", reason: transport.isolation.reason }
    const result = await rpc.request("thread/read", { threadId: options.threadId, includeTurns: true })
    if (result.thread?.id !== options.threadId) return { ...base, status: "not-found" }
    const turn = result.thread.turns?.find((t: any) => t.id === options.turnId)
    if (!turn) return { ...base, status: "not-found", ephemeral: result.thread.ephemeral }
    const known = ["completed", "failed", "interrupted"].includes(turn.status)
    return { ...base, status: known ? "terminal-found" : "nonterminal", terminalStatus: known ? turn.status : "unknown", ephemeral: result.thread.ephemeral }
  } catch (error) {
    const reason = String(redactCodexEvent(String(error)))
    return { ...base, status: /thread.*not found|no rollout found|thread.*does not exist/i.test(reason) ? "not-found" : "unavailable", reason }
  } finally { clearTimeout(timer); rpc.close("inspection-closed"); await transport?.close(); await writes }
}
const AccountBoundarySchema = z.object({ schemaVersion: z.literal("codex-account-boundary/v1"),
  instructionSources: z.array(z.object({ path: z.string().refine(p => path.isAbsolute(p) || path.win32.isAbsolute(p)), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()), review: z.string().optional() }).strict()
/** This file pins already-reviewed generic instruction files. It never admits
 * their contents to the prompt or grants native execution/source access. */
export async function loadCodexAccountBoundary(file?: string): Promise<NonNullable<CodexAccountSessionOptions["instructionSources"]>> {
  if (!file) return []
  try {
    const value = AccountBoundarySchema.parse(JSON.parse(await readFile(path.resolve(file), "utf8")))
    const keys = value.instructionSources.map(s => path.resolve(s.path).toLowerCase())
    if (new Set(keys).size !== keys.length) throw new Error("duplicate instruction source")
    return value.instructionSources
  } catch { throw new Error("account-boundary-invalid") }
}
/** Filter known credential fields/formats and account identifiers in trace data.
 * The driver never reads credential files; this is not a general secret detector. */
export function redactCodexEvent(value: unknown): any {
  if (Array.isArray(value)) return value.map(redactCodexEvent)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(?:account.?id|user.?id|email|api.?key|access.?token|refresh.?token|id.?token|auth.?token|session.?token|authorization|cookie|credentials|auth|password|secret|private.?key)$/i.test(key) ? "[redacted]" : redactCodexEvent(item)]))
  return typeof value === "string" ? value.replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]").replace(/\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]+/g, "[redacted]").replace(/\b((?:password|secret|api_key|access_token)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[redacted]").replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]") : value
}
/** Host process diagnostics only: bounded, redacted, and never a provider terminal. */
export function createAccountStderrTail() {
  const lines: string[] = []
  let truncated = false
  return {
    push(line: string) {
      const safe: string = redactCodexEvent(line)
      truncated ||= safe.length > 2048
      lines.push(safe.slice(-2048))
      while (lines.length > 16 || lines.join("\n").length > 8192) { lines.shift(); truncated = true }
    },
    snapshot: () => ({ stderrTail: lines.join("\n"), stderrTruncated: truncated }),
  }
}
// Admit exact versions whose experimental RPC/config contracts were inspected.
// Every real session still rechecks effective config, roots and instruction pins.
const controlledVersions = new Set(["0.159.0-alpha.12.1", "0.160.0", "0.162.0-alpha.2", "0.162.0-alpha.17.2", "0.163.0-alpha.10.2", "0.163.0-alpha.11"])
const disabledFeatures = ["shell_tool", "unified_exec", "apps", "plugins", "remote_plugin", "multi_agent", "multi_agent_v2", "browser_use", "computer_use", "js_repl", "view_image", "image_generation", "hooks", "memories", "skill_search", "skill_mcp_dependency_install", "goals", "sleep_tool", "tool_suggest", "auth_elicitation", "request_permissions_tool"]
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function controls(config: unknown = {}, skills: unknown = {}): Record<string, unknown> {
  const installed = object(config), entries = object(skills).data
  const skillPaths = Array.isArray(entries) ? entries.flatMap(entry => {
    const list = object(entry).skills
    return Array.isArray(list) ? list.map(skill => object(skill).path).filter((p): p is string => typeof p === "string") : []
  }) : []
  return { features: Object.fromEntries([...disabledFeatures.map(k => [k, false]), ["skip_host_skill_discovery", true], ["code_mode_host", { enabled: true, disable_in_process_fallback: true }]]),
    web_search: "disabled", default_permissions: "skvm-account", project_doc_max_bytes: 0, project_doc_fallback_filenames: [], instructions: "", developer_instructions: "",
    mcp_servers: Object.fromEntries(Object.keys(object(installed.mcp_servers)).map(k => [k, { enabled: false }])),
    plugins: Object.fromEntries(Object.keys(object(installed.plugins)).map(k => [k, { enabled: false }])),
    skills: { config: [...new Set(skillPaths)].map(p => ({ path: p, enabled: false })), bundled: { enabled: false }, include_instructions: false },
    agents: { enabled: false },
    permissions: { "skvm-account": { filesystem: { ":root": "deny", ":minimal": "read", ":workspace_roots": { ".": "read" } }, network: { enabled: false } } } }
}
function safeConfig(value: unknown): Record<string, unknown> {
  const c = object(value), f = object(c.features), profile = object(object(c.permissions)["skvm-account"])
  return { features: { ...Object.fromEntries([...disabledFeatures, "skip_host_skill_discovery"].map(k => [k, typeof f[k] === "object" ? object(f[k]).enabled : f[k]])), code_mode_host: { enabled: object(f.code_mode_host).enabled, disable_in_process_fallback: object(f.code_mode_host).disable_in_process_fallback } },
    web_search: c.web_search, project_doc_max_bytes: c.project_doc_max_bytes, project_doc_fallback_filenames: c.project_doc_fallback_filenames, instructions: c.instructions, developer_instructions: c.developer_instructions, default_permissions: c.default_permissions,
    mcp_servers: Object.fromEntries(Object.entries(object(c.mcp_servers)).map(([k, v]) => [k, { enabled: object(v).enabled }])),
    plugins: Object.fromEntries(Object.entries(object(c.plugins)).map(([k, v]) => [k, { enabled: object(v).enabled }])),
    skills: { config: Array.isArray(object(c.skills).config) ? (object(c.skills).config as unknown[]).map(v => ({ path: object(v).path, name: object(v).name, enabled: object(v).enabled })) : undefined, bundled: { enabled: object(object(c.skills).bundled).enabled }, include_instructions: object(c.skills).include_instructions },
    agents: { enabled: object(c.agents).enabled },
    permissions: { "skvm-account": { extends: profile.extends, workspace_roots: profile.workspace_roots, filesystem: profile.filesystem, network: { enabled: object(profile.network).enabled } } } }
}
function configFailure(config: unknown, skills: unknown): string | undefined {
  const c = safeConfig(config), f = object(c.features), profile = object(object(c.permissions)["skvm-account"]), fs = object(profile.filesystem)
  if (object(c.agents).enabled !== false || disabledFeatures.some(k => f[k] !== false) || f.skip_host_skill_discovery !== true || object(f.code_mode_host).enabled !== true || object(f.code_mode_host).disable_in_process_fallback !== true || c.web_search !== "disabled" || c.project_doc_max_bytes !== 0 ||
      c.default_permissions !== "skvm-account" || c.instructions !== "" || c.developer_instructions !== "" || !Array.isArray(c.project_doc_fallback_filenames) || c.project_doc_fallback_filenames.length || Object.values(object(c.mcp_servers)).some(v => object(v).enabled !== false) ||
      Object.values(object(c.plugins)).some(v => object(v).enabled !== false)) return "account-controlled-config-not-effective"
  if (profile.extends != null || Object.keys(object(profile.workspace_roots)).length || fs[":root"] !== "deny" || fs[":minimal"] !== "read" ||
      object(fs[":workspace_roots"])["."] !== "read" || Object.keys(fs).some(k => ![":root", ":minimal", ":workspace_roots", "glob_scan_max_depth"].includes(k)) ||
      Object.keys(object(fs[":workspace_roots"])).some(k => k !== ".") || object(profile.network).enabled !== false) return "account-controlled-permissions-not-effective"
  const entries = object(skills).data
  const configuredSkills = object(c.skills)
  if (object(configuredSkills.bundled).enabled !== false || configuredSkills.include_instructions !== false || !Array.isArray(configuredSkills.config) || configuredSkills.config.some(s => object(s).enabled !== false)) return "account-extra-skills-enabled"
  if (!Array.isArray(entries) || entries.some(entry => {
    const e = object(entry)
    return !Array.isArray(e.skills) || e.skills.some(skill => object(skill).enabled !== false) || !Array.isArray(e.errors) || e.errors.length
  })) return "account-extra-skills-enabled"
}
function toml(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(toml).join(",") + "]"
  if (value && typeof value === "object") return "{" + Object.entries(value).map(([k, v]) => JSON.stringify(k) + "=" + toml(v)).join(",") + "}"
  return JSON.stringify(value)
}
/** Version-bound official configuration, followed by effective RPC and thread
 * verification. No credential files or alternate providers are read here. */
export function createCodexStdioTransport(): AccountTransport {
  const windows = process.platform === "win32"
  const command = windows ? String(spawnSync("where.exe", ["codex"], { encoding: "utf8", windowsHide: true }).stdout ?? "").split(/\r?\n/).find(p => /\.exe$/i.test(p.trim()))?.trim() ?? "codex.exe" : "codex"
  const version = String(spawnSync(command, ["--version"], { encoding: "utf8", windowsHide: true }).stdout ?? "").trim().replace(/^codex-cli /, "")
  let receive = (_message: any) => {}, exited = (_reason: string) => {}
  let child: ReturnType<typeof spawn>, reader: ReturnType<typeof createInterface>, stderrReader: ReturnType<typeof createInterface>, generation = 0
  const start = (config: Record<string, unknown>) => {
    const own = ++generation
    child = spawn(command, ["app-server", "--stdio", ...Object.entries(config).flatMap(([k, v]) => ["-c", k + "=" + toml(v)])], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
    const stderr = createAccountStderrTail()
    reader = createInterface({ input: child.stdout! })
    reader.on("line", line => { if (own !== generation) return; if (line.length > 16 * 1024 * 1024) { exited("app-server-frame-limit"); return }; try { receive(JSON.parse(line)) } catch { exited("app-server-invalid-json") } })
    stderrReader = createInterface({ input: child.stderr! })
    stderrReader.on("line", line => { if (own === generation) stderr.push(line) })
    child.on("error", () => { if (own === generation) exited("codex-cli-unavailable") })
    child.on("exit", code => { if (own === generation) {
      const reason = "codex-child-exit:" + (code ?? "unknown")
      receive({ method: "skvm/transport/exit", params: { reason, ...stderr.snapshot() } })
      exited(reason)
    } })
  }
  const close = async () => {
    ++generation; reader.close(); stderrReader.close(); child.stdin!.end()
    if (windows && child.pid && child.exitCode === null) await new Promise<void>(resolve => {
      const cleanup = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
      cleanup.on("error", () => { child.kill(); resolve() }); cleanup.on("exit", () => resolve())
    })
    else child.kill()
  }
  start(controls())
  return { isolation: { kind: controlledVersions.has(version) ? "controlled-public-cli" : "unverified-public-cli", reason: "account-cli-version-not-verified:" + version, cliVersion: version },
    configure: async config => { await close(); start(config) },
    send: message => { child.stdin!.write(JSON.stringify(message) + "\n") }, onMessage: f => { receive = f }, onExit: f => { exited = f }, close }
}
/** The official CLI owns the agent loop; this is deliberately not LLMProvider. */
export async function runCodexAccountSession(options: CodexAccountSessionOptions): Promise<AccountSessionResult> {
  const started = Date.now(), events: unknown[] = [], tools: LLMToolCall[] = [], toolRejections: AccountSessionResult["toolRejections"] = []
  let transport: AccountTransport | undefined, threadId: string | undefined, turnId: string | undefined, active = false, inferenceDispatched = false
  const lifecycle: AccountSessionLifecycle = { purpose: options.purpose, attempt: options.attempt, turnStartAttempted: false, turnStartAcknowledged: false, providerTerminalObserved: false, localExecution: "unconfirmed", persistence: "requested", toolsSha256: createHash("sha256").update(JSON.stringify(options.tools)).digest("hex") }
  let lastResult: AccountSessionResult | undefined
  const previous = options.resumeAfter
  if (previous?.lifecycle) lifecycle.resumedFromTurnId = previous.lifecycle.turnId
  let usage: TokenUsage | null = null, text = "", failure: string | undefined
  let capability: AccountSessionResult["capability"]
  let usageDetails: AccountSessionResult["usageDetails"]
  let usageSource: AccountSessionResult["usageSource"]
  let terminalStatus: AccountSessionResult["terminalStatus"] = "not-started", quotaRefused = false
  let terminalError: AccountSessionResult["terminalError"]
  let transportExit: AccountSessionResult["transportExit"]
  const validators = new Map<string, ReturnType<Ajv["compile"]>>()
  const executed = new Map<string, { fingerprint: string; output: Promise<Record<string, unknown>> }>()
  let finish!: (status: AccountSessionStatus) => void, finished = false
  const terminal = new Promise<AccountSessionStatus>(resolve => { finish = status => { if (!finished) { finished = true; active = false; resolve(status) } } })
  let eventWrites = Promise.resolve(), eventWriteFailure: unknown
  const record = (event: unknown) => {
    const safe = redactCodexEvent({ ...object(event), identity: { purpose: options.purpose, attempt: options.attempt, threadId, turnId } }); events.push(safe)
    eventWrites = eventWrites.then(async () => { try { await options.onEvent?.(safe) } catch (cause) { eventWriteFailure ??= cause } })
  }
  const reply = (id: unknown, response: Record<string, unknown>) => { record({ direction: "client", id, result: response }); transport!.send({ id, result: response }) }
  const rpc = createAccountRpc(message => transport!.send(message), record), request = rpc.request
  const result = (status: AccountSessionStatus): AccountSessionResult => lastResult = redactCodexEvent({ status, text, lifecycle: { ...lifecycle, threadId, turnId }, terminalStatus, answerDelivery: terminalStatus === "completed" && status === "completed" && text.trim() ? "delivered" : "undelivered", usageVisibility: usage ? "observed" : "unknown", quotaRefused, ...(terminalError ? { terminalError } : {}), ...(transportExit ? { transportExit } : {}), ...(failure ? { reason: failure } : {}), usage, ...(usageDetails ? { usageDetails } : {}), ...(usageSource ? { usageSource } : {}), actualUsd: null, providerRequests: null, durationMs: Date.now() - started, events, tools, toolRejections, model: options.model, effort: options.effort, inferenceDispatched, ...(capability ? { capability } : {}) })
  let timer: ReturnType<typeof setTimeout> | undefined, reserveTimer: ReturnType<typeof setTimeout> | undefined
  const finalize = () => {
    if (finished || !active || !threadId || !turnId || lifecycle.hostFinalization) return
    lifecycle.hostFinalization = "budget-reserve"
    // Closing a tool phase is not a completed answer. Await the real terminal;
    // a lost acknowledgement stays unknown and cannot authorize a child.
    void request("turn/interrupt", { threadId, turnId }).catch(() => {})
  }
  const abort = () => { failure = "account-session-interrupted-or-timeout"; finish(inferenceDispatched ? "timeout-unknown" : "unavailable"); rpc.close(failure) }
  try {
    if (previous && (!previous.lifecycle?.threadId || !previous.lifecycle.turnId || previous.lifecycle.localExecution !== "closed" || !["completed", "failed", "interrupted"].includes(previous.terminalStatus) || previous.quotaRefused)) { failure = "account-resume-known-closed-terminal-required"; return result("unavailable") }
    if (previous && previous.lifecycle?.toolsSha256 !== lifecycle.toolsSha256) { failure = "account-resume-tools-changed"; return result("unavailable") }
    if (options.model !== "gpt-5.6-sol" || options.effort !== "high") { failure = "account-model-or-effort-unauthorized"; return result("unavailable") }
    const maxToolCalls = options.maxToolCalls ?? 64
    if (!Number.isSafeInteger(maxToolCalls) || maxToolCalls < 0 || maxToolCalls === 0 && options.tools.length) { failure = "account-tool-budget-invalid"; return result("unavailable") }
    const ajv = new Ajv({ strict: false, allErrors: true, ownProperties: true })
    for (const tool of options.tools) {
      if (validators.has(tool.name)) { failure = "duplicate-account-tool-name"; return result("unavailable") }
      validators.set(tool.name, ajv.compile(tool.inputSchema))
    }
    transport = (options.transportFactory ?? createCodexStdioTransport)()
    lifecycle.localExecution = "active"
    transport.onExit(reason => { if (finished) return; failure = reason; finish(inferenceDispatched ? "completion-unknown" : "unavailable"); rpc.close(reason) })
    transport.onMessage(message => {
      if (message.method === "skvm/transport/exit") {
        if (!finished) transportExit = { reason: String(message.params?.reason ?? "transport-exit"), stderrTail: String(message.params?.stderrTail ?? "").slice(-8192), stderrTruncated: !!message.params?.stderrTruncated }
        record({ direction: "transport", method: message.method, params: transportExit })
        return
      }
      const rpcMethod = rpc.method(message.id)
      record({ direction: "server", ...message, ...(rpcMethod === "config/read" && message.result ? { result: { config: safeConfig(message.result.config) } } : {}) })
      if (rpc.receive(message)) return
      const params = message.params ?? {}
      // Record late events, but never let them alter a closed attempt's outcome,
      // answer or cumulative usage. A new named attempt owns a different turn.
      if (finished) return
      if (message.method === "thread/tokenUsage/updated" && params.threadId === threadId && (!turnId || params.turnId === turnId)) {
        const t = params.tokenUsage?.total
        if (t && [t.inputTokens, t.outputTokens, t.cachedInputTokens, t.cacheWriteInputTokens].every(v => Number.isSafeInteger(v) && v >= 0)) {
          const baseline = previous?.usageSource?.rawTotal
          const delta = (key: string) => t[key] - (baseline?.[key] ?? 0)
          if (!previous || baseline && ["inputTokens", "outputTokens", "cachedInputTokens", "cacheWriteInputTokens"].every(k => Number.isSafeInteger(baseline[k]) && delta(k) >= 0)) {
            usage = { input: Math.max(usage?.input ?? 0, delta("inputTokens")), output: Math.max(usage?.output ?? 0, delta("outputTokens")), cacheRead: Math.max(usage?.cacheRead ?? 0, delta("cachedInputTokens")), cacheWrite: Math.max(usage?.cacheWrite ?? 0, delta("cacheWriteInputTokens")) }
          }
          usageSource = { method: "thread/tokenUsage/updated", aggregation: "max-per-counter", inputIncludesCached: true, rawTotal: structuredClone(t) }
          if ([t.totalTokens, t.reasoningOutputTokens].every(v => Number.isSafeInteger(v) && v >= 0)) usageDetails = { totalTokens: Math.max(usageDetails?.totalTokens ?? 0, t.totalTokens), reasoningOutputTokens: Math.max(usageDetails?.reasoningOutputTokens ?? 0, t.reasoningOutputTokens), inputIncludesCached: true }
        }
        return
      }
      if (message.method === "item/tool/call" && message.id !== undefined) {
        if (!active || params.threadId !== threadId || turnId && params.turnId !== turnId) { reply(message.id, { success: false, contentItems: [{ type: "inputText", text: "session-closed-or-foreign-turn" }] }); return }
        if (lifecycle.hostFinalization) { reply(message.id, { success: false, contentItems: [{ type: "inputText", text: "tool-phase-closing" }] }); return }
        turnId ??= params.turnId
        if (params.namespace || !options.tools.some(t => t.name === params.tool)) { failure = "unregistered-account-tool"; finish("unavailable"); reply(message.id, { success: false, contentItems: [{ type: "inputText", text: failure }] }); return }
        const fingerprint = JSON.stringify([params.tool, params.arguments])
        const oldCall = previous && [...previous.tools, ...previous.toolRejections.map(r => r.call)].find(c => c.id === params.callId)
        if (oldCall) { failure = JSON.stringify([oldCall.name, oldCall.arguments]) === fingerprint ? "account-tool-call-from-prior-turn" : "account-tool-call-identity-conflict"; finish("unavailable"); return }
        if (typeof params.callId !== "string" || !params.callId || executed.get(params.callId)?.fingerprint && executed.get(params.callId)!.fingerprint !== fingerprint) { failure = "account-tool-call-identity-conflict"; finish("unavailable"); return }
        let execution = executed.get(params.callId)?.output
        if (!execution) {
          if (tools.length + toolRejections.length >= maxToolCalls) { if (options.shouldFinalize) { finalize(); reply(message.id, { success: false, contentItems: [{ type: "inputText", text: "tool-phase-closing" }] }); return }; failure = "account-tool-budget"; finish("unavailable"); reply(message.id, { success: false, contentItems: [{ type: "inputText", text: failure }] }); return }
          const call: LLMToolCall = { id: params.callId, name: params.tool, arguments: params.arguments }, validator = validators.get(params.tool)!
          const valid = validator(params.arguments)
          const diagnostics = !valid && options.argumentDiagnostics?.(call) || (validator.errors ?? []).slice(0, 8).map(e => ({ path: e.instancePath, keyword: e.keyword, message: e.message ?? "Invalid field", expected: e.params }))
          if (valid) tools.push(call)
          else toolRejections.push({ call, diagnostics })
          execution = Promise.resolve().then(async () => {
            // Persist this call's identity before a tool can write its checkpoint.
            await eventWrites
            if (eventWriteFailure) throw new Error("account-tool-identity-write-failed")
            if (!active) return { success: false, contentItems: [{ type: "inputText", text: "session-closed" }] }
            // Known, malformed data is a local repair opportunity, never a host
            // execution. Unknown tools, identity conflicts and native activity
            // still close the capability boundary immediately.
            const output = valid ? await options.execute(call) : options.rejectArguments ? await options.rejectArguments(call, diagnostics) : { output: JSON.stringify({ status: "error", code: "account-tool-arguments-invalid", diagnostics, instruction: "Correct the named fields using the supplied tool schema; the rejected call executed no tool." }), exitCode: 1, durationMs: 0 }
            return { success: active && output.exitCode !== 1, contentItems: [{ type: "inputText", text: active ? output.output : "session-closed" }] }
          }).catch(() => ({ success: false, contentItems: [{ type: "inputText", text: "dynamic-tool-execution-failed" }] }))
          executed.set(params.callId, { fingerprint, output: execution })
        }
        void execution.then(output => { if (active) { reply(message.id, output); if (options.shouldFinalize?.()) finalize() } }); return
      }
      if (!active || params.threadId !== threadId || turnId && (params.turnId ?? params.turn?.id) !== turnId) return
      if (message.method === "error" || message.method === "turn/completed") {
        const error = params.error ?? params.turn?.error
        if (error) {
          // A reconnect notice is retained in events, but is not a terminal
          // failure after the provider continues and confirms a later terminal.
          if (message.method === "turn/completed" || params.willRetry !== true) terminalError = error
          const code = error.codexErrorInfo
          quotaRefused ||= typeof code === "string" ? code.toLowerCase() === "usagelimitexceeded" : Object.keys(object(code)).some(k => k.toLowerCase() === "usagelimitexceeded")
        }
      }
      const nativeTypes = ["commandExecution", "fileChange", "mcpToolCall", "webSearch", "collabAgentToolCall", "subAgentActivity", "imageGeneration", "browserToolCall", "computerUseToolCall"]
      const nativeItem = message.method?.startsWith("item/") && nativeTypes.includes(params.item?.type) ? params.item : message.method === "turn/completed" ? params.turn?.items?.find((i: { type: string }) => nativeTypes.includes(i.type)) : undefined
      if (nativeItem) { failure = "unexpected-native-account-tool:" + nativeItem.type; finish("unavailable"); return }
      if (message.method === "model/rerouted") { failure = "account-model-rerouted"; finish("unavailable") }
      if (message.method === "item/completed" && params.item?.type === "agentMessage" && [null, undefined, "final_answer"].includes(params.item.phase)) text = params.item.text ?? ""
      if (message.method === "turn/completed") {
        turnId ??= params.turn.id
        for (const item of params.turn.items ?? []) if (item.type === "agentMessage" && [null, undefined, "final_answer"].includes(item.phase)) text = item.text ?? ""
        if (["completed", "failed", "interrupted"].includes(params.turn.status)) { terminalStatus = params.turn.status; lifecycle.providerTerminalObserved = true }
        if (params.turn.status === "failed" || params.turn.status === "interrupted") { failure = `account-turn-${params.turn.status}`; finish(params.turn.status) }
        else if (params.turn.status === "completed") finish(text.trim() ? "completed" : "undelivered")
        else { failure = `account-turn-${params.turn.status}`; finish("completion-unknown") }
      }
    })
    timer = setTimeout(abort, options.timeoutMs ?? 1200000); options.signal?.addEventListener("abort", abort, { once: true })
    if (options.signal?.aborted) abort()
    await request("initialize", { clientInfo: { name: "skvm", version: "1", title: "SkVM account runtime" }, capabilities: { experimentalApi: true, requestAttestation: false } })
    transport.send({ method: "initialized", params: {} })
    if (transport.isolation.kind === "unverified-public-cli") { failure = transport.isolation.reason; return result("unavailable") }
    let cwd = options.cwd, config: Record<string, unknown> | undefined
    if (transport.isolation.kind === "controlled-public-cli") {
      if (!controlledVersions.has(transport.isolation.cliVersion ?? "") || !transport.configure) { failure = "account-controlled-version-or-config-unverified"; return result("unavailable") }
      cwd = await mkdtemp(path.join(tmpdir(), "skvm-account-"))
      const installed = await request("config/read", { cwd, includeLayers: false }), skills = await request("skills/list", { cwds: [cwd], forceReload: true })
      config = controls(installed.config, skills)
      await transport.configure(config)
      if (finished) return result(await terminal)
      await request("initialize", { clientInfo: { name: "skvm", version: "1" }, capabilities: { experimentalApi: true, requestAttestation: false } })
      transport.send({ method: "initialized", params: {} })
      const effective = await request("config/read", { cwd, includeLayers: false }), currentSkills = await request("skills/list", { cwds: [cwd], forceReload: true })
      failure = configFailure(effective.config, currentSkills)
      if (failure) return result("unavailable")
      capability = { status: "verified-controlled", cliVersion: transport.isolation.cliVersion!, effectiveConfig: safeConfig(effective.config), instructionSources: [], runtimeWorkspaceRoots: [] }
    }
    if (previous) {
      const stored = await request("thread/read", { threadId: previous.lifecycle!.threadId, includeTurns: true })
      const turns = stored.thread?.turns
      if (stored.thread?.id !== previous.lifecycle!.threadId || stored.thread?.ephemeral !== false || !Array.isArray(turns) || turns.at(-1)?.id !== previous.lifecycle!.turnId || turns.at(-1)?.status !== previous.terminalStatus) { failure = "account-resume-terminal-not-confirmed"; return result("unavailable") }
    }
    const thread = await request(previous ? "thread/resume" : "thread/start", { model: options.model, modelProvider: "openai", cwd,
      ...(previous ? { threadId: previous.lifecycle!.threadId } : { allowProviderModelFallback: false, environments: [], selectedCapabilityRoots: [], ephemeral: false, dynamicTools: options.tools.map(t => ({ type: "function", name: t.name, description: t.description, inputSchema: t.inputSchema })) }),
      ...(config ? { permissions: "skvm-account", runtimeWorkspaceRoots: [], config, developerInstructions: "" } : { sandbox: "read-only" }),
      approvalPolicy: "never", baseInstructions: options.system })
    if (previous && (thread.thread?.id !== previous.lifecycle!.threadId || thread.thread?.ephemeral !== false)) { failure = "account-resume-thread-not-confirmed"; return result("unavailable") }
    threadId = thread.thread.id
    if (thread.thread.ephemeral === false) lifecycle.persistence = "confirmed"
    record({ method: "skvm/account/identity", lifecycle: { ...lifecycle, threadId } }); await eventWrites
    if (eventWriteFailure) throw new Error("account-identity-write-failed")
    if (thread.model !== options.model) { failure = "account-model-selection-unverified"; return result("unavailable") }
    if (capability) {
      const roots = thread.runtimeWorkspaceRoots, sources = thread.instructionSources
      if (thread.modelProvider !== "openai" || thread.approvalPolicy !== "never" || thread.sandbox?.type !== "readOnly" || thread.sandbox?.networkAccess !== false ||
          thread.activePermissionProfile?.id !== "skvm-account" || thread.activePermissionProfile?.extends != null) { failure = "account-thread-permissions-not-effective"; return result("unavailable") }
      if (!Array.isArray(roots) || roots.length) { failure = "account-extra-workspace-root"; return result("unavailable") }
      if (!Array.isArray(sources)) { failure = "account-instruction-sources-unverified"; return result("unavailable") }
      for (const source of sources) {
        const approved = options.instructionSources?.find(s => path.resolve(s.path).toLowerCase() === path.resolve(source).toLowerCase())
        if (!approved) { failure = "account-instruction-source-unapproved"; return result("unavailable") }
        const sha256 = createHash("sha256").update(await readFile(source)).digest("hex")
        if (sha256 !== approved.sha256) { failure = "account-instruction-source-changed"; return result("unavailable") }
        capability.instructionSources.push({ path: source, sha256 })
      }
    }
    if (finished) return result(await terminal)
    active = true; inferenceDispatched = true; terminalStatus = "unknown"; lifecycle.turnStartAttempted = true
    const turn = await request("turn/start", { threadId, input: [{ type: "text", text: options.prompt, text_elements: [] }], environments: [], model: options.model, effort: options.effort })
    turnId ??= turn.turn.id
    lifecycle.turnStartAcknowledged = true
    if (options.finalizeAfterMs !== undefined) reserveTimer = setTimeout(finalize, Math.max(1, options.finalizeAfterMs - (Date.now() - started)))
    record({ method: "skvm/account/identity", lifecycle: { ...lifecycle, threadId, turnId } })
    return result(await terminal)
  } catch (error) { failure ??= String(error); return result(finished ? await terminal : inferenceDispatched ? "completion-unknown" : "unavailable") }
  finally {
    finished = true; active = false; if (timer) clearTimeout(timer); if (reserveTimer) clearTimeout(reserveTimer); options.signal?.removeEventListener("abort", abort)
    if (inferenceDispatched && threadId && turnId && failure && terminalStatus === "unknown") { try { transport?.send({ id: "interrupt-on-close", method: "turn/interrupt", params: { threadId, turnId } }) } catch { /* Own child may already have exited. */ } }
    rpc.close("session-closed"); await transport?.close()
    await Promise.allSettled([...executed.values()].map(e => e.output))
    lifecycle.localExecution = "closed"
    record({ method: "skvm/account/closed", lifecycle: { ...lifecycle, threadId, turnId } })
    await eventWrites
    if (lastResult) { lastResult.lifecycle = { ...lifecycle, threadId, turnId }; lastResult.events = events; lastResult.durationMs = Date.now() - started }
    if (eventWriteFailure) throw new Error("account-trace-write-failed", { cause: eventWriteFailure })
  }
}
