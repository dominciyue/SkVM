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
  model: string; effort: "high"; cwd: string; system: string; prompt: string; tools: LLMTool[]
  execute(call: LLMToolCall): Promise<{ output: string; exitCode?: number; durationMs: number }>
  rejectArguments?(call: LLMToolCall, diagnostics: AccountArgumentDiagnostic[]): Promise<{ output: string; exitCode?: number; durationMs: number }>
  maxToolCalls?: number
  timeoutMs?: number; signal?: AbortSignal; transportFactory?: () => AccountTransport
  instructionSources?: Array<{ path: string; sha256: string }>
  onEvent?(event: unknown): void | Promise<void>
}
export interface AccountArgumentDiagnostic { path: string; keyword: string; message: string; expected: unknown }
export type AccountSessionStatus = "completed" | "failed" | "interrupted" | "undelivered" | "unavailable" | "timeout-unknown" | "completion-unknown"
export interface AccountSessionResult {
  status: AccountSessionStatus; text: string; reason?: string; usage: TokenUsage | null; actualUsd: null; providerRequests: null
  terminalStatus: "completed" | "failed" | "interrupted" | "unknown" | "not-started"
  answerDelivery: "delivered" | "undelivered"; usageVisibility: "observed" | "unknown"; quotaRefused: boolean
  terminalError?: { message?: string; codexErrorInfo?: unknown; additionalDetails?: string }
  durationMs: number; events: unknown[]; tools: LLMToolCall[]; model: string; effort: "high"; inferenceDispatched: boolean
  toolRejections: Array<{ call: LLMToolCall; diagnostics: AccountArgumentDiagnostic[] }>
  capability?: { status: "verified-controlled"; cliVersion: string; effectiveConfig: Record<string, unknown>; instructionSources: Array<{ path: string; sha256: string }>; runtimeWorkspaceRoots: string[] }
  usageDetails?: { totalTokens: number; reasoningOutputTokens: number; inputIncludesCached: true }
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
const controlledVersion = "0.159.0-alpha.12.1"
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
  let child: ReturnType<typeof spawn>, reader: ReturnType<typeof createInterface>, generation = 0
  const start = (config: Record<string, unknown>) => {
    const own = ++generation
    child = spawn(command, ["app-server", "--stdio", ...Object.entries(config).flatMap(([k, v]) => ["-c", k + "=" + toml(v)])], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
    reader = createInterface({ input: child.stdout! })
    reader.on("line", line => { if (own !== generation) return; if (line.length > 16 * 1024 * 1024) { exited("app-server-frame-limit"); return }; try { receive(JSON.parse(line)) } catch { exited("app-server-invalid-json") } })
    child.stderr!.resume()
    child.on("error", () => { if (own === generation) exited("codex-cli-unavailable") })
    child.on("exit", code => { if (own === generation) exited("codex-child-exit:" + (code ?? "unknown")) })
  }
  const close = async () => {
    ++generation; reader.close(); child.stdin!.end()
    if (windows && child.pid && child.exitCode === null) await new Promise<void>(resolve => {
      const cleanup = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
      cleanup.on("error", () => { child.kill(); resolve() }); cleanup.on("exit", () => resolve())
    })
    else child.kill()
  }
  start(controls())
  return { isolation: { kind: version === controlledVersion ? "controlled-public-cli" : "unverified-public-cli", reason: "account-cli-version-not-verified:" + version, cliVersion: version },
    configure: async config => { await close(); start(config) },
    send: message => { child.stdin!.write(JSON.stringify(message) + "\n") }, onMessage: f => { receive = f }, onExit: f => { exited = f }, close }
}
/** The official CLI owns the agent loop; this is deliberately not LLMProvider. */
export async function runCodexAccountSession(options: CodexAccountSessionOptions): Promise<AccountSessionResult> {
  const started = Date.now(), events: unknown[] = [], tools: LLMToolCall[] = [], toolRejections: AccountSessionResult["toolRejections"] = []
  let transport: AccountTransport | undefined, sequence = 0, threadId: string | undefined, turnId: string | undefined, active = false, inferenceDispatched = false
  let usage: TokenUsage | null = null, text = "", failure: string | undefined
  let capability: AccountSessionResult["capability"]
  let usageDetails: AccountSessionResult["usageDetails"]
  let terminalStatus: AccountSessionResult["terminalStatus"] = "not-started", quotaRefused = false
  let terminalError: AccountSessionResult["terminalError"]
  const validators = new Map<string, ReturnType<Ajv["compile"]>>()
  const pending = new Map<number, { method: string; resolve: (value: any) => void; reject: (error: Error) => void }>(), executed = new Map<string, { fingerprint: string; output: Promise<Record<string, unknown>> }>()
  let finish!: (status: AccountSessionStatus) => void, finished = false
  const terminal = new Promise<AccountSessionStatus>(resolve => { finish = status => { if (!finished) { finished = true; active = false; resolve(status) } } })
  let eventWrites = Promise.resolve(), eventWriteFailure: unknown
  const record = (event: unknown) => {
    const safe = redactCodexEvent(event); events.push(safe)
    eventWrites = eventWrites.then(async () => { try { await options.onEvent?.(safe) } catch (cause) { eventWriteFailure ??= cause } })
  }
  const reply = (id: unknown, response: Record<string, unknown>) => { record({ direction: "client", id, result: response }); transport!.send({ id, result: response }) }
  const request = (method: string, params: unknown) => new Promise<any>((resolve, reject) => {
    const id = ++sequence; pending.set(id, { method, resolve, reject }); record({ direction: "client", id, method, params })
    try { transport!.send({ id, method, params }) } catch { pending.delete(id); reject(new Error("codex-send-failed")) }
  })
  const result = (status: AccountSessionStatus): AccountSessionResult => redactCodexEvent({ status, text, terminalStatus, answerDelivery: terminalStatus === "completed" && status === "completed" && text.trim() ? "delivered" : "undelivered", usageVisibility: usage ? "observed" : "unknown", quotaRefused, ...(terminalError ? { terminalError } : {}), ...(failure ? { reason: failure } : {}), usage, ...(usageDetails ? { usageDetails } : {}), actualUsd: null, providerRequests: null, durationMs: Date.now() - started, events, tools, toolRejections, model: options.model, effort: options.effort, inferenceDispatched, ...(capability ? { capability } : {}) })
  let timer: ReturnType<typeof setTimeout> | undefined
  const abort = () => { failure = "account-session-interrupted-or-timeout"; finish("timeout-unknown"); for (const p of pending.values()) p.reject(new Error(failure)); pending.clear() }
  try {
    if (options.model !== "gpt-5.6-sol" || options.effort !== "high") { failure = "account-model-or-effort-unauthorized"; return result("unavailable") }
    const maxToolCalls = options.maxToolCalls ?? 64
    if (!Number.isSafeInteger(maxToolCalls) || maxToolCalls < 1) { failure = "account-tool-budget-invalid"; return result("unavailable") }
    const ajv = new Ajv({ strict: false, allErrors: true, ownProperties: true })
    for (const tool of options.tools) {
      if (validators.has(tool.name)) { failure = "duplicate-account-tool-name"; return result("unavailable") }
      validators.set(tool.name, ajv.compile(tool.inputSchema))
    }
    transport = (options.transportFactory ?? createCodexStdioTransport)()
    transport.onExit(reason => { if (finished) return; failure = reason; finish(inferenceDispatched ? "completion-unknown" : "unavailable"); for (const p of pending.values()) p.reject(new Error(reason)); pending.clear() })
    transport.onMessage(message => {
      const rpcMethod = typeof message.id === "number" ? pending.get(message.id)?.method : undefined
      record({ direction: "server", ...message, ...(rpcMethod === "config/read" && message.result ? { result: { config: safeConfig(message.result.config) } } : {}) })
      if (typeof message.id === "number" && !message.method) { const p = pending.get(message.id); pending.delete(message.id); if (message.error) p?.reject(new Error("codex-rpc-error")); else p?.resolve(message.result); return }
      const params = message.params ?? {}
      // Record late events, but never let them alter a closed attempt's outcome,
      // answer or cumulative usage. A new named attempt owns a different turn.
      if (finished) return
      if (message.method === "thread/tokenUsage/updated" && params.threadId === threadId && (!turnId || params.turnId === turnId)) {
        const t = params.tokenUsage?.total
        if (t && [t.inputTokens, t.outputTokens, t.cachedInputTokens, t.cacheWriteInputTokens].every(v => Number.isSafeInteger(v) && v >= 0)) {
          usage = { input: Math.max(usage?.input ?? 0, t.inputTokens), output: Math.max(usage?.output ?? 0, t.outputTokens), cacheRead: Math.max(usage?.cacheRead ?? 0, t.cachedInputTokens), cacheWrite: Math.max(usage?.cacheWrite ?? 0, t.cacheWriteInputTokens) }
          if ([t.totalTokens, t.reasoningOutputTokens].every(v => Number.isSafeInteger(v) && v >= 0)) usageDetails = { totalTokens: Math.max(usageDetails?.totalTokens ?? 0, t.totalTokens), reasoningOutputTokens: Math.max(usageDetails?.reasoningOutputTokens ?? 0, t.reasoningOutputTokens), inputIncludesCached: true }
        }
        return
      }
      if (message.method === "item/tool/call" && message.id !== undefined) {
        if (!active || params.threadId !== threadId || turnId && params.turnId !== turnId) { reply(message.id, { success: false, contentItems: [{ type: "inputText", text: "session-closed-or-foreign-turn" }] }); return }
        turnId ??= params.turnId
        if (params.namespace || !options.tools.some(t => t.name === params.tool)) { failure = "unregistered-account-tool"; finish("unavailable"); reply(message.id, { success: false, contentItems: [{ type: "inputText", text: failure }] }); return }
        const fingerprint = JSON.stringify([params.tool, params.arguments])
        if (typeof params.callId !== "string" || !params.callId || executed.get(params.callId)?.fingerprint && executed.get(params.callId)!.fingerprint !== fingerprint) { failure = "account-tool-call-identity-conflict"; finish("unavailable"); return }
        let execution = executed.get(params.callId)?.output
        if (!execution) {
          if (tools.length + toolRejections.length >= maxToolCalls) { failure = "account-tool-budget"; finish("unavailable"); reply(message.id, { success: false, contentItems: [{ type: "inputText", text: failure }] }); return }
          const call: LLMToolCall = { id: params.callId, name: params.tool, arguments: params.arguments }, validator = validators.get(params.tool)!
          const valid = validator(params.arguments)
          const diagnostics = (validator.errors ?? []).slice(0, 8).map(e => ({ path: e.instancePath, keyword: e.keyword, message: e.message ?? "Invalid field", expected: e.params }))
          if (valid) tools.push(call)
          else toolRejections.push({ call, diagnostics })
          execution = Promise.resolve().then(async () => {
            if (!active) return { success: false, contentItems: [{ type: "inputText", text: "session-closed" }] }
            // Known, malformed data is a local repair opportunity, never a host
            // execution. Unknown tools, identity conflicts and native activity
            // still close the capability boundary immediately.
            const output = valid ? await options.execute(call) : options.rejectArguments ? await options.rejectArguments(call, diagnostics) : { output: JSON.stringify({ status: "error", code: "account-tool-arguments-invalid", diagnostics, instruction: "Correct the named fields using the supplied tool schema; the rejected call executed no tool." }), exitCode: 1, durationMs: 0 }
            return { success: active && output.exitCode !== 1, contentItems: [{ type: "inputText", text: active ? output.output : "session-closed" }] }
          }).catch(() => ({ success: false, contentItems: [{ type: "inputText", text: "dynamic-tool-execution-failed" }] }))
          executed.set(params.callId, { fingerprint, output: execution })
        }
        void execution.then(output => { if (active) reply(message.id, output) }); return
      }
      if (!active || params.threadId !== threadId || turnId && (params.turnId ?? params.turn?.id) !== turnId) return
      if (message.method === "error" || message.method === "turn/completed") {
        const error = params.error ?? params.turn?.error
        if (error) {
          terminalError = error
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
        if (["completed", "failed", "interrupted"].includes(params.turn.status)) terminalStatus = params.turn.status
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
      if (transport.isolation.cliVersion !== controlledVersion || !transport.configure) { failure = "account-controlled-version-or-config-unverified"; return result("unavailable") }
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
      capability = { status: "verified-controlled", cliVersion: controlledVersion, effectiveConfig: safeConfig(effective.config), instructionSources: [], runtimeWorkspaceRoots: [] }
    }
    const thread = await request("thread/start", { model: options.model, modelProvider: "openai", allowProviderModelFallback: false, cwd, environments: [],
      ...(config ? { permissions: "skvm-account", runtimeWorkspaceRoots: [], selectedCapabilityRoots: [], config, developerInstructions: "" } : { sandbox: "read-only" }),
      approvalPolicy: "never", ephemeral: true, baseInstructions: options.system, dynamicTools: options.tools.map(t => ({ type: "function", name: t.name, description: t.description, inputSchema: t.inputSchema })) })
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
    threadId = thread.thread.id; active = true; inferenceDispatched = true; terminalStatus = "unknown"
    const turn = await request("turn/start", { threadId, input: [{ type: "text", text: options.prompt, text_elements: [] }], environments: [], model: options.model, effort: options.effort })
    turnId ??= turn.turn.id
    return result(await terminal)
  } catch (error) { failure ??= String(error); return result(finished ? await terminal : inferenceDispatched ? "completion-unknown" : "unavailable") }
  finally {
    active = false; if (timer) clearTimeout(timer); options.signal?.removeEventListener("abort", abort)
    if (inferenceDispatched && threadId && turnId && failure && terminalStatus === "unknown") { try { transport?.send({ id: ++sequence, method: "turn/interrupt", params: { threadId, turnId } }) } catch { /* Own child may already have exited. */ } }
    for (const p of pending.values()) p.reject(new Error("session-closed")); pending.clear(); await transport?.close()
    await eventWrites
    if (eventWriteFailure) throw new Error("account-trace-write-failed", { cause: eventWriteFailure })
  }
}
