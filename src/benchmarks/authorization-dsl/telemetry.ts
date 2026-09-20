import { addTokenUsage, emptyTokenUsage, type TokenUsage } from "../../core/types.ts"
import { ProviderError } from "../../providers/errors.ts"
import type {
  CompletionParams,
  LLMProvider,
  LLMResponse,
  LLMToolResult,
} from "../../providers/types.ts"

export type AuthorizationAttemptPhase = "initial" | "domain-repair"
export type AuthorizationAttemptTransport = "schema-tool" | "prompt-parse"

export interface AuthorizationProviderAttempt {
  id: string
  phase: AuthorizationAttemptPhase
  transport: AuthorizationAttemptTransport
  status: "pending" | "response" | "error" | "protocol-error"
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
  usage: TokenUsage | null
  costUsd: number | null
  transportAttempts: "unknown"
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

export interface AuthorizationTelemetryProvider {
  provider: LLMProvider
  attempts: AuthorizationProviderAttempt[]
  inPhase<T>(phase: AuthorizationAttemptPhase, operation: (provider: LLMProvider) => Promise<T>): Promise<T>
  summary(): AuthorizationTelemetrySummary
}

export function createTelemetryProvider(delegate: LLMProvider): AuthorizationTelemetryProvider {
  const attempts: AuthorizationProviderAttempt[] = []
  let phase: AuthorizationAttemptPhase = "initial"

  const provider: LLMProvider = {
    name: `${delegate.name}-authorization-telemetry`,
    async complete(params: CompletionParams): Promise<LLMResponse> {
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
        },
        usage: null,
        costUsd: null,
        transportAttempts: "unknown",
      }
      attempts.push(attempt)

      let response: LLMResponse
      try {
        response = await delegate.complete(params)
      } catch (error) {
        attempt.status = "error"
        attempt.endedAt = new Date().toISOString()
        attempt.error = {
          name: error instanceof Error ? error.name : "UnknownError",
          message: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        }
        throw error
      }

      attempt.status = "response"
      attempt.endedAt = new Date().toISOString()
      attempt.response = sanitizeResponse(response)
      attempt.usage = { ...response.tokens }
      attempt.costUsd = response.costUsd ?? null

      const allowedToolNames = new Set(params.tools?.map(tool => tool.name) ?? [])
      const unexpected = response.toolCalls.find(call => !allowedToolNames.has(call.name))
      if (unexpected) {
        const error = new AuthorizationProtocolError(
          `Provider returned unknown or unavailable tool \"${unexpected.name}\"; no executable tool channel exists.`,
          delegate.name,
        )
        attempt.status = "protocol-error"
        attempt.error = { name: error.name, message: error.message }
        throw error
      }
      return response
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
    async inPhase<T>(nextPhase: AuthorizationAttemptPhase, operation: (wrapped: LLMProvider) => Promise<T>): Promise<T> {
      const previousPhase = phase
      phase = nextPhase
      try {
        return await operation(provider)
      } finally {
        phase = previousPhase
      }
    },
    summary(): AuthorizationTelemetrySummary {
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
    },
  }
}
