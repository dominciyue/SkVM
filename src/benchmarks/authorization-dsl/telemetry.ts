import { addTokenUsage, emptyTokenUsage, type TokenUsage } from "../../core/types.ts"
import { ProviderError } from "../../providers/errors.ts"
import type { ZodType } from "zod"
import type {
  CompletionParams,
  LLMProvider,
  LLMResponse,
  LLMToolResult,
} from "../../providers/types.ts"

export type AuthorizationAttemptPhase = "initial" | "domain-repair"
export type AuthorizationAttemptTransport = "schema-tool" | "prompt-parse"

export interface AuthorizationProviderAttempt {
  schemaValidation?: { valid: boolean; diagnostics: Array<{ path: string; message: string }> }
  id: string
  phase: AuthorizationAttemptPhase
  transport: AuthorizationAttemptTransport
  status: "pending" | "response" | "error" | "protocol-error" | "timeout"
  startedAt: string
  endedAt?: string
  request: {
    messageCount: number
    messageCharacters: number
    toolNames: string[]
    toolChoice?: CompletionParams["toolChoice"]
    maxTokens?: number
    temperature?: number
    executableTools: false
    toolSchemas?: Record<string, unknown>[]
  }
  response?: {
    text: string
    toolCalls: LLMResponse["toolCalls"]
    tokens: TokenUsage
    costUsd: number | null
    durationMs: number
    stopReason: LLMResponse["stopReason"]
    reasoningContent?: string
  }
  error?: {
    name: string
    message: string
  }
  lateSettlement?: {
    kind: "response" | "error"
    settledAt: string
  }
  usage: TokenUsage | null
  costUsd: number | null
  transportAttempts: "unknown"
}

export interface AuthorizationLifecycleEvent {
  sequence: number
  kind: "dispatch" | "response" | "error" | "timeout" | "late-response" | "late-error" | "closed" | "dispatch-rejected"
  at: string
  attemptId?: string
  phase?: AuthorizationAttemptPhase
  transport?: AuthorizationAttemptTransport
  reason?: string
  attempt?: AuthorizationProviderAttempt
}

export interface AuthorizationTelemetryOptions {
  responseSchema?: ZodType<any>
  perCallTimeoutMs?: number
  unitTimeoutMs?: number
  maxDispatches?: number
  onEvent?: (event: AuthorizationLifecycleEvent) => void | Promise<void>
}

export interface AuthorizationTelemetrySummary {
  providerCalls: number
  respondedCalls: number
  unknownUsageCalls: number
  unknownCostCalls: number
  knownTokens: TokenUsage
  tokensStatus: "complete" | "partial-unknown" | "unknown"
  knownActualUsdSubtotal: number
  totalActualUsd: number | null
  actualUsdStatus: "complete" | "partial-unknown" | "unknown"
  transportAttempts: "unknown"
}

export class AuthorizationProtocolError extends ProviderError {
  constructor(message: string, provider: string) {
    super(message, provider, undefined, false)
    this.name = "AuthorizationProtocolError"
  }
}

export class AuthorizationCallTimeoutError extends ProviderError {
  constructor(
    readonly timeoutMs: number,
    readonly timeoutKind: "per-call" | "unit",
    provider: string,
  ) {
    super(
      `Authorization provider call did not settle within ${timeoutMs}ms (${timeoutKind} deadline); request completion is unknown.`,
      provider,
      undefined,
      false,
    )
    this.name = "AuthorizationCallTimeoutError"
  }
}

export class AuthorizationLifecycleClosedError extends ProviderError {
  constructor(reason: string, provider: string) {
    super(`Authorization lifecycle is closed; no new provider dispatch is allowed (${reason}).`, provider, undefined, false)
    this.name = "AuthorizationLifecycleClosedError"
  }
}

export class AuthorizationDispatchLimitError extends ProviderError {
  constructor(limit: number, provider: string) {
    super(`Authorization provider dispatch limit of ${limit} has been reached.`, provider, undefined, false)
    this.name = "AuthorizationDispatchLimitError"
  }
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_TOKEN]")
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return redactSensitiveText(value)
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /^(?:authorization|api[_-]?key|token|secret)$/i.test(key) ? "[REDACTED]" : sanitizeValue(item),
    ]))
  }
  return value
}

function sanitizeResponse(response: LLMResponse): AuthorizationProviderAttempt["response"] {
  return {
    text: redactSensitiveText(response.text),
    toolCalls: response.toolCalls.map(call => ({
      ...call,
      arguments: sanitizeValue(call.arguments) as Record<string, unknown>,
    })),
    tokens: { ...response.tokens },
    costUsd: response.costUsd ?? null,
    durationMs: response.durationMs,
    stopReason: response.stopReason,
    ...(response.reasoningContent === undefined
      ? {}
      : { reasoningContent: redactSensitiveText(response.reasoningContent) }),
  }
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000
}

export function summarizeAuthorizationAttempts(
  attempts: AuthorizationProviderAttempt[],
): AuthorizationTelemetrySummary {
  const responded = attempts.filter(attempt => attempt.usage !== null)
  const unknownUsageCalls = attempts.length - responded.length
  const knownTokens = responded.reduce(
    (total, attempt) => addTokenUsage(total, attempt.usage!),
    emptyTokenUsage(),
  )
  const knownCosts = attempts
    .map(attempt => attempt.costUsd)
    .filter((cost): cost is number => cost !== null)
  const unknownCostCalls = attempts.length - knownCosts.length
  const knownActualUsdSubtotal = roundUsd(knownCosts.reduce((sum, cost) => sum + cost, 0))
  const tokensStatus = attempts.length === 0 || unknownUsageCalls === 0
    ? "complete"
    : (responded.length === 0 ? "unknown" : "partial-unknown")
  const actualUsdStatus = attempts.length === 0 || unknownCostCalls === 0
    ? "complete"
    : (knownCosts.length === 0 ? "unknown" : "partial-unknown")
  return {
    providerCalls: attempts.length,
    respondedCalls: responded.length,
    unknownUsageCalls,
    unknownCostCalls,
    knownTokens,
    tokensStatus,
    knownActualUsdSubtotal,
    totalActualUsd: actualUsdStatus === "complete" ? knownActualUsdSubtotal : null,
    actualUsdStatus,
    transportAttempts: "unknown",
  }
}

export function reconcileAuthorizationAttemptsFromEvents(
  attempts: AuthorizationProviderAttempt[],
  events: AuthorizationLifecycleEvent[],
): AuthorizationProviderAttempt[] {
  const order: string[] = []
  const byId = new Map<string, AuthorizationProviderAttempt>()
  for (const attempt of attempts) {
    order.push(attempt.id)
    byId.set(attempt.id, structuredClone(attempt))
  }
  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    if (!event.attempt) continue
    if (!byId.has(event.attempt.id)) order.push(event.attempt.id)
    byId.set(event.attempt.id, structuredClone(event.attempt))
  }
  return order.map(id => byId.get(id)!)
}

export interface AuthorizationTelemetryProvider {
  provider: LLMProvider
  attempts: AuthorizationProviderAttempt[]
  events: AuthorizationLifecycleEvent[]
  inPhase<T>(phase: AuthorizationAttemptPhase, operation: (provider: LLMProvider) => Promise<T>): Promise<T>
  close(reason: string): Promise<void>
  isClosed(): boolean
  summary(): AuthorizationTelemetrySummary
}

export function createTelemetryProvider(
  delegate: LLMProvider,
  options: AuthorizationTelemetryOptions = {},
): AuthorizationTelemetryProvider {
  const attempts: AuthorizationProviderAttempt[] = []
  const events: AuthorizationLifecycleEvent[] = []
  let phase: AuthorizationAttemptPhase = "initial"
  let closed = false
  let closeReason = "not closed"
  const startedAtMs = Date.now()
  const perCallTimeoutMs = options.perCallTimeoutMs ?? Number.POSITIVE_INFINITY
  const unitTimeoutMs = options.unitTimeoutMs ?? Number.POSITIVE_INFINITY
  const maxDispatches = options.maxDispatches ?? Number.POSITIVE_INFINITY
  let eventSinkChain = Promise.resolve()

  const emit = (event: Omit<AuthorizationLifecycleEvent, "sequence" | "at">): Promise<void> => {
    const recorded: AuthorizationLifecycleEvent = {
      sequence: events.length + 1,
      at: new Date().toISOString(),
      ...event,
    }
    events.push(recorded)
    if (options.onEvent) {
      const snapshot = structuredClone(recorded)
      eventSinkChain = eventSinkChain.then(async () => {
        await options.onEvent!(snapshot)
      })
    }
    return eventSinkChain
  }

  const close = async (reason: string): Promise<void> => {
    if (closed) return
    closed = true
    closeReason = reason
    await emit({ kind: "closed", reason })
  }

  const rejectDispatch = async (error: Error, reason: string): Promise<never> => {
    await emit({ kind: "dispatch-rejected", phase, reason })
    throw error
  }

  const provider: LLMProvider = {
    name: `${delegate.name}-authorization-telemetry`,
    async complete(params: CompletionParams): Promise<LLMResponse> {
      if (closed) {
        return rejectDispatch(
          new AuthorizationLifecycleClosedError(closeReason, delegate.name),
          `closed:${closeReason}`,
        )
      }
      if (attempts.length >= maxDispatches) {
        return rejectDispatch(
          new AuthorizationDispatchLimitError(maxDispatches, delegate.name),
          `dispatch-limit:${maxDispatches}`,
        )
      }
      const remainingUnitMs = unitTimeoutMs - (Date.now() - startedAtMs)
      if (remainingUnitMs <= 0) {
        await close("unit-timeout-before-dispatch")
        return rejectDispatch(
          new AuthorizationCallTimeoutError(unitTimeoutMs, "unit", delegate.name),
          "unit-timeout-before-dispatch",
        )
      }
      const attempt: AuthorizationProviderAttempt = {
        id: `provider-attempt-${attempts.length + 1}`,
        phase,
        transport: params.tools && params.tools.length > 0 ? "schema-tool" : "prompt-parse",
        status: "pending",
        startedAt: new Date().toISOString(),
        request: {
          messageCount: params.messages.length,
          messageCharacters: params.messages.reduce((sum, message) => sum + message.content.length, 0),
          toolNames: params.tools?.map(tool => tool.name) ?? [],
          ...(params.toolChoice === undefined ? {} : { toolChoice: params.toolChoice }),
          ...(params.maxTokens === undefined ? {} : { maxTokens: params.maxTokens }),
          ...(params.temperature === undefined ? {} : { temperature: params.temperature }),
          executableTools: false,
          ...(params.tools ? { toolSchemas: params.tools.map(tool => tool.inputSchema) } : {}),
        },
        usage: null,
        costUsd: null,
        transportAttempts: "unknown",
      }
      attempts.push(attempt)
      await emit({
        kind: "dispatch",
        attemptId: attempt.id,
        phase: attempt.phase,
        transport: attempt.transport,
        attempt: structuredClone(attempt),
      })

      const effectiveTimeoutMs = Math.max(1, Math.min(perCallTimeoutMs, remainingUnitMs))
      const timeoutKind: "per-call" | "unit" = remainingUnitMs <= perCallTimeoutMs ? "unit" : "per-call"
      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const delegatePromise = delegate.complete(params)
      const settlement = delegatePromise.then(async response => {
        attempt.response = sanitizeResponse(response)
        attempt.usage = { ...response.tokens }
        attempt.costUsd = response.costUsd ?? null
        if (timedOut) {
          attempt.lateSettlement = { kind: "response", settledAt: new Date().toISOString() }
          await emit({
            kind: "late-response",
            attemptId: attempt.id,
            phase: attempt.phase,
            transport: attempt.transport,
            attempt: structuredClone(attempt),
          })
          return response
        }

        attempt.status = "response"
        if (options.responseSchema) {
          try {
            const value = params.tools ? response.toolCalls[0]?.arguments : JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""))
            const parsed = options.responseSchema.safeParse(value)
            attempt.schemaValidation = { valid: parsed.success, diagnostics: parsed.success ? [] : parsed.error.issues.map(issue => ({ path: issue.path.join(".") || "$", message: issue.message })) }
          } catch (error) {
            attempt.schemaValidation = { valid: false, diagnostics: [{ path: "$", message: String(error) }] }
          }
        }
        attempt.endedAt = new Date().toISOString()
        const allowedToolNames = new Set(params.tools?.map(tool => tool.name) ?? [])
        const unexpected = response.toolCalls.find(call => !allowedToolNames.has(call.name))
        if (unexpected) {
          const error = new AuthorizationProtocolError(
            `Provider returned unknown or unavailable tool \"${unexpected.name}\"; no executable tool channel exists.`,
            delegate.name,
          )
          attempt.status = "protocol-error"
          attempt.error = { name: error.name, message: error.message }
          await emit({
            kind: "error",
            attemptId: attempt.id,
            phase: attempt.phase,
            transport: attempt.transport,
            reason: error.message,
            attempt: structuredClone(attempt),
          })
          throw error
        }
        await emit({
          kind: "response",
          attemptId: attempt.id,
          phase: attempt.phase,
          transport: attempt.transport,
          attempt: structuredClone(attempt),
        })
        return response
      }, async error => {
        if (timedOut) {
          attempt.lateSettlement = { kind: "error", settledAt: new Date().toISOString() }
          attempt.error = {
            name: error instanceof Error ? error.name : "UnknownError",
            message: redactSensitiveText(error instanceof Error ? error.message : String(error)),
          }
          await emit({
            kind: "late-error",
            attemptId: attempt.id,
            phase: attempt.phase,
            transport: attempt.transport,
            attempt: structuredClone(attempt),
          })
          throw error
        }
        attempt.status = "error"
        attempt.endedAt = new Date().toISOString()
        attempt.error = {
          name: error instanceof Error ? error.name : "UnknownError",
          message: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        }
        await emit({
          kind: "error",
          attemptId: attempt.id,
          phase: attempt.phase,
          transport: attempt.transport,
          reason: attempt.error.message,
          attempt: structuredClone(attempt),
        })
        throw error
      })

      if (!Number.isFinite(effectiveTimeoutMs)) return settlement
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          void (async () => {
            timedOut = true
            const error = new AuthorizationCallTimeoutError(effectiveTimeoutMs, timeoutKind, delegate.name)
            attempt.status = "timeout"
            attempt.endedAt = new Date().toISOString()
            attempt.error = { name: error.name, message: error.message }
            await emit({
              kind: "timeout",
              attemptId: attempt.id,
              phase: attempt.phase,
              transport: attempt.transport,
              reason: error.message,
              attempt: structuredClone(attempt),
            })
            await close(`${timeoutKind}-timeout:${attempt.id}`)
            reject(error)
          })()
        }, effectiveTimeoutMs)
      })
      try {
        return await Promise.race([settlement, timeout])
      } finally {
        if (!timedOut && timer !== undefined) clearTimeout(timer)
      }
    },
    async completeWithToolResults(
      _params: CompletionParams,
      _toolResults: LLMToolResult[],
      _previousResponse: LLMResponse,
    ): Promise<LLMResponse> {
      throw new AuthorizationProtocolError(
        "Tool-result continuation is disabled for the fixed-context authorization host.",
        delegate.name,
      )
    },
  }

  return {
    provider,
    attempts,
    events,
    async inPhase<T>(nextPhase: AuthorizationAttemptPhase, operation: (wrapped: LLMProvider) => Promise<T>): Promise<T> {
      const previousPhase = phase
      phase = nextPhase
      try {
        return await operation(provider)
      } finally {
        phase = previousPhase
      }
    },
    close,
    isClosed: () => closed,
    summary: () => summarizeAuthorizationAttempts(attempts),
  }
}
