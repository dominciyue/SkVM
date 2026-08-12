/**
 * Pi event types and translation helpers shared by:
 *   - `src/adapters/pi.ts` (subprocess + NDJSON path, bench harness)
 *   - `src/core/headless-agent/pi-driver.ts` (in-process library path,
 *     headless tuner)
 *
 * Both paths receive the same conceptual events; one decodes them from
 * NDJSON, the other receives them as typed objects from
 * `AgentSession.subscribe()`. The result mapping is identical.
 */

import type { ProviderRoute, RunExecutionObservation } from "./types.ts"
import type { SubprocessResult } from "./subprocess.ts"
import { RunRecordBuilder } from "./run-record.ts"
import { createLogger } from "./logger.ts"
import { resolveBackendModel } from "../providers/registry.ts"

const log = createLogger("pi-runtime")

// ---------------------------------------------------------------------------
// Pi Event Types (matches pi-mono coding-agent NDJSON / AgentSessionEvent)
// ---------------------------------------------------------------------------

export interface PiTextContent {
  type: "text"
  text: string
}

export interface PiToolCallContent {
  type: "toolCall"
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface PiUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
}

export interface PiAssistantMessage {
  role: "assistant"
  content: (PiTextContent | PiToolCallContent)[]
  api: string
  provider: string
  model: string
  usage: PiUsage
  stopReason: "stop" | "length" | "toolUse" | "error" | "aborted"
  errorMessage?: string
  timestamp: number
}

export interface PiToolResultMessage {
  role: "toolResult"
  toolCallId: string
  toolName: string
  content: PiTextContent[]
  isError: boolean
  timestamp: number
}

export interface PiUserMessage {
  role: "user"
  content: PiTextContent[] | string
  timestamp: number
}

export type PiMessage = PiUserMessage | PiAssistantMessage | PiToolResultMessage

export type PiEvent =
  | { type: "session"; version: number; id: string; timestamp: string; cwd: string }
  | { type: "agent_start" }
  | { type: "agent_end"; messages: PiMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: PiMessage; toolResults: PiToolResultMessage[] }
  | { type: "message_start"; message: PiMessage }
  | { type: "message_update"; message: PiMessage }
  | { type: "message_end"; message: PiMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }

// ---------------------------------------------------------------------------
// NDJSON → events (subprocess adapter path)
// ---------------------------------------------------------------------------

export function parsePiNDJSON(output: string): PiEvent[] {
  const events: PiEvent[] = []
  for (const line of output.split("\n")) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line) as PiEvent)
    } catch {
      log.debug(`Skipping non-JSON line: ${line.slice(0, 100)}`)
    }
  }
  return events
}

const PI_EVENT_TYPES = new Set([
  "session", "agent_start", "agent_end", "turn_start", "turn_end",
  "message_start", "message_update", "message_end",
  "tool_execution_start", "tool_execution_update", "tool_execution_end",
  "auto_retry_start",
])

/** True only for Pi NDJSON events proving provider/assistant/tool progress. */
export function isPiNDJSONActivityLine(line: string): boolean {
  try {
    const parsed = JSON.parse(line) as { type?: unknown }
    return typeof parsed.type === "string" && new Set([
      "agent_end", "turn_end", "message_start", "message_update", "message_end",
      "tool_execution_start", "tool_execution_update", "tool_execution_end",
      "auto_retry_start",
    ]).has(parsed.type)
  } catch {
    return false
  }
}

function piMessages(events: readonly PiEvent[]): PiMessage[] {
  const terminal = [...events].reverse().find(
    (event): event is Extract<PiEvent, { type: "agent_end" }> => event.type === "agent_end",
  )
  if (terminal) return terminal.messages
  return events
    .filter((event): event is Extract<PiEvent, { type: "message_end" }> => event.type === "message_end")
    .map((event) => event.message)
    .filter((message) => message.role === "assistant" || message.role === "toolResult")
}

function classifyTransientError(messages: readonly PiMessage[], events: readonly PiEvent[]):
  RunExecutionObservation["transientError"] {
  const errors = [
    ...events.filter((event): event is Extract<PiEvent, { type: "auto_retry_start" }> =>
      event.type === "auto_retry_start").map((event) => event.errorMessage),
    ...messages.filter((message): message is PiAssistantMessage =>
      message.role === "assistant" && message.stopReason === "error")
      .map((message) => message.errorMessage ?? ""),
  ]
  for (const error of errors) {
    if (/\b429\b|rate.?limit/i.test(error)) return "rate-limit"
    if (/\b5\d\d\b|upstream|service unavailable|bad gateway/i.test(error)) return "provider-5xx"
    if (/ECONNRESET|connection reset|socket hang up/i.test(error)) return "connection-reset"
    if (/ETIMEDOUT|network timeout|request timed out/i.test(error)) return "network-timeout"
  }
  return undefined
}

export function observePiExecution(
  events: readonly PiEvent[],
  subprocess: Pick<SubprocessResult,
    "exitCode" | "durationMs" | "timedOut" | "timeoutKind" | "stoppedByStdoutLine"
    | "firstActivityMs" | "lastActivityMs">,
): RunExecutionObservation {
  const messages = piMessages(events)
  const assistants = messages.filter((message): message is PiAssistantMessage => message.role === "assistant")
  const toolResults = messages.filter((message): message is PiToolResultMessage => message.role === "toolResult")
  const unknownTypes = new Set<string>()
  for (const event of events as Array<PiEvent & { type: string }>) {
    if (!PI_EVENT_TYPES.has(event.type)) unknownTypes.add(`event:${event.type}`)
  }
  for (const message of assistants) {
    for (const content of message.content as Array<{ type: string }>) {
      if (content.type !== "text" && content.type !== "toolCall" && content.type !== "thinking") {
        unknownTypes.add(`content:${content.type}`)
      }
    }
  }
  const usage = assistants.reduce((total, message) => ({
    input: total.input + (message.usage?.input ?? 0),
    output: total.output + (message.usage?.output ?? 0),
    cacheRead: total.cacheRead + (message.usage?.cacheRead ?? 0),
    cacheWrite: total.cacheWrite + (message.usage?.cacheWrite ?? 0),
  }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  const terminal = [...events].reverse().find(
    (event): event is Extract<PiEvent, { type: "agent_end" }> => event.type === "agent_end",
  )
  const lastAssistant = assistants.at(-1)
  const toolCalls = assistants.reduce((count, message) => count
    + message.content.filter((content) => content.type === "toolCall").length, 0)
  const hasPayload = assistants.some((message) => message.content.some((content) =>
    content.type === "toolCall" || (content.type === "text" && content.text.trim().length > 0)))
    || toolResults.length > 0
  const usageTotal = usage.input + usage.output + usage.cacheRead + usage.cacheWrite
  const parserOutcome = unknownTypes.size > 0
    ? "incompatible"
    : events.length === 0 || (terminal !== undefined && !hasPayload && usageTotal === 0)
      ? "empty"
      : "ok"
  const termination = subprocess.stoppedByStdoutLine
    ? "step-limit"
    : subprocess.timedOut
    ? subprocess.timeoutKind === "idle" ? "idle-timeout" : "absolute-timeout"
    : subprocess.exitCode === 0 ? "natural" : "crash"
  const transientError = classifyTransientError(messages, events)

  return {
    schemaVersion: "skvm-run-execution-observation/v1",
    process: { exitCode: subprocess.exitCode, termination, durationMs: subprocess.durationMs },
    activity: {
      requestDispatched: events.some((event) => event.type === "agent_start" || event.type === "turn_start"),
      providerResponses: assistants.length,
      assistantMessages: assistants.length,
      toolCalls,
      toolResults: toolResults.length,
      ...(subprocess.firstActivityMs === undefined ? {} : {
        firstActivityMs: subprocess.firstActivityMs,
        lastActivityMs: subprocess.lastActivityMs,
      }),
    },
    terminal: {
      present: terminal !== undefined,
      ...(lastAssistant?.stopReason ? { stopReason: lastAssistant.stopReason } : {}),
    },
    usage: { available: assistants.some((message) => message.usage !== undefined), ...usage },
    parser: { outcome: parserOutcome, unknownTypes: [...unknownTypes].sort() },
    ...(transientError ? { transientError } : {}),
  }
}

// ---------------------------------------------------------------------------
// events → RunResult (shared by adapter + headless driver)
// ---------------------------------------------------------------------------

export function piEventsToRunRecord(events: PiEvent[]): RunRecordBuilder {
  const agentEndEvents = events.filter(
    (e): e is Extract<PiEvent, { type: "agent_end" }> => e.type === "agent_end",
  )
  const lastAgentEnd = agentEndEvents[agentEndEvents.length - 1]

  const messages: PiMessage[] = lastAgentEnd?.messages ? [...lastAgentEnd.messages] : []

  if (messages.length === 0) {
    const messageEnds = events.filter(
      (e): e is Extract<PiEvent, { type: "message_end" }> => e.type === "message_end",
    )
    for (const me of messageEnds) {
      if (me.message.role === "assistant" || me.message.role === "toolResult") {
        messages.push(me.message)
      }
    }
  }

  // Pi dialect: text on a tool-call turn claims the final text; conversation
  // order pairs outputs back via toolResult(), which also records the
  // standalone tool step pi transcripts carry.
  const builder = new RunRecordBuilder({ toolCallTextIsFinal: true })
  const errors: string[] = []

  for (const msg of messages) {
    if (msg.role === "assistant") {
      const text = msg.content
        .filter((c): c is PiTextContent => c.type === "text")
        .map((c) => c.text)
        .join("")

      const calls = msg.content
        .filter((c): c is PiToolCallContent => c.type === "toolCall")
        .map((tc) => ({ id: tc.id, name: tc.name, input: tc.arguments }))

      builder.assistantToolCalls(calls, { text: text || undefined, timestamp: msg.timestamp })

      const usage = msg.usage
      if (usage) {
        builder.usage(usage)
        builder.cost(usage.cost?.total ?? 0)
      }

      if (msg.stopReason === "error" && msg.errorMessage) {
        errors.push(msg.errorMessage)
      }
    } else if (msg.role === "toolResult") {
      const text = msg.content
        .filter((c): c is PiTextContent => c.type === "text")
        .map((c) => c.text)
        .join("")
      builder.toolResult(
        msg.toolCallId,
        { name: msg.toolName, output: text, exitCode: msg.isError ? 1 : 0 },
        msg.timestamp,
      )
    }
  }

  const lastAssistant = messages
    .filter((m): m is PiAssistantMessage => m.role === "assistant")
    .pop()

  const hasObservableActivity = messages.some((message) => {
    if (message.role === "toolResult") return true
    if (message.role !== "assistant") return false
    return message.content.some((content) =>
      content.type === "toolCall" || (content.type === "text" && content.text.trim().length > 0))
  })
  const hasPositiveUsage = messages.some((message) =>
    message.role === "assistant"
    && message.usage !== undefined
    && message.usage.input + message.usage.output + message.usage.cacheRead + message.usage.cacheWrite > 0)
  const silentZeroUsageCompletion = messages.length > 0 && !hasObservableActivity && !hasPositiveUsage

  builder.parseNote({
    ...(!lastAgentEnd && messages.length === 0
      ? {
          runStatus: "parse-failed",
          statusDetail: "pi produced no parseable events — telemetry only, workDir scored as-is",
        }
      : silentZeroUsageCompletion
        ? {
            runStatus: "parse-failed",
            statusDetail: "pi produced a terminal event with zero usage and no assistant or tool activity",
          }
      : lastAssistant?.stopReason === "error"
        ? { statusDetail: `pi assistant stopped with error: ${lastAssistant.errorMessage ?? "unknown"}` }
        : {}),
    ...(errors.length > 0
      ? { adapterError: { exitCode: 1, stderr: errors.join("; ").slice(0, 2000) } }
      : {}),
  })

  return builder
}

// ---------------------------------------------------------------------------
// Model translation (skvm route → pi provider/model id)
// ---------------------------------------------------------------------------

/**
 * Translate a skvm model id to pi's `<provider>/<model>` form. The
 * subprocess adapter passes this string to `--model`; the headless
 * library driver splits it on the first slash to call
 * `ModelRegistry.find(provider, modelId)`.
 */
export function toPiModel(model: string, route: ProviderRoute): string {
  if (route.kind === "openai-compatible") {
    return `openai/${resolveBackendModel(model)}`
  }
  return model
}

/**
 * Split a pi model id on the FIRST slash. Pi model ids are
 * `<provider>/<model-id>` where `<model-id>` itself can contain
 * slashes (e.g. `openrouter/qwen/qwen3-30b`).
 */
export function splitPiModel(piModel: string): { provider: string; modelId: string } {
  const i = piModel.indexOf("/")
  if (i < 0) throw new Error(`pi model id missing provider prefix: ${piModel}`)
  return { provider: piModel.slice(0, i), modelId: piModel.slice(i + 1) }
}

// ---------------------------------------------------------------------------
// models.json renderers
// ---------------------------------------------------------------------------

/**
 * baseUrl-only override for openai-compatible routes. Preserves pi's built-in
 * model metadata (reasoning / contextWindow / maxTokens) while redirecting the
 * endpoint. Returns null for routes that need no override (openrouter / anthropic
 * use pi's built-in endpoints). Used by the subprocess adapter and by the
 * library driver when the model id is already in pi's catalogue.
 */
export function renderPiBaseUrlOverride(route: ProviderRoute): string | null {
  if (route.kind !== "openai-compatible" || !route.baseUrl) return null
  const doc = { providers: { openai: { baseUrl: route.baseUrl } } }
  return JSON.stringify(doc, null, 2) + "\n"
}

/**
 * Full models.json that REGISTERS a custom model id so pi's strict
 * ModelRegistry.find() (library path) resolves it. Use only when the id is NOT
 * in pi's built-in catalogue — registering a built-in id with a bare {id}
 * stub would clobber its metadata (reasoning / contextWindow / maxTokens).
 * For openai-compatible routes the baseUrl override is included too.
 *
 * For openai-compatible routes the model entry pins `api: "openai-completions"`.
 * Pi's built-in `openai` provider defaults custom models to its API
 * (`openai-responses` — the newer Responses endpoint pi uses for real OpenAI
 * models). Non-OpenAI openai-compatible backends (DeepSeek, vLLM, any
 * OpenAI-proxy frontend) almost never implement Responses; they only speak
 * the `/chat/completions` Completions API. Without this override pi POSTs to
 * `{baseUrl}/responses` and the backend returns 404. Confirmed against
 * pi-ai's own `models.generated.js`: every non-OpenAI deepseek-* / qwen3-* /
 * etc. entry registered under the openai provider sets
 * `api: "openai-completions"` explicitly for the same reason.
 *
 * Other route kinds (openrouter, anthropic) already inherit a correct `api`
 * default from pi's built-in provider definitions, so no override needed.
 */
export function renderPiModelRegistration(route: ProviderRoute, modelId: string): string {
  const piProviderKey = route.kind === "openai-compatible" ? "openai" : route.kind
  const modelEntry: Record<string, unknown> = { id: modelId }
  if (route.kind === "openai-compatible") {
    modelEntry.api = "openai-completions"
  }
  const providerConfig: Record<string, unknown> = { models: [modelEntry] }
  if (route.kind === "openai-compatible" && route.baseUrl) {
    providerConfig.baseUrl = route.baseUrl
  }
  const doc = { providers: { [piProviderKey]: providerConfig } }
  return JSON.stringify(doc, null, 2) + "\n"
}
