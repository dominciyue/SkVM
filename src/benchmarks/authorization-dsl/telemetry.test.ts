import { describe, expect, it } from "bun:test"
import { z } from "zod"
import { extractStructured } from "../../providers/structured.ts"
import { ProviderNetworkError } from "../../providers/errors.ts"
import type { CompletionParams, LLMProvider, LLMResponse } from "../../providers/types.ts"
import {
  createTelemetryProvider,
  reconcileAuthorizationAttemptsFromEvents,
  summarizeAuthorizationAttempts,
} from "./telemetry.ts"

const TinySchema = z.object({ ok: z.boolean() })

function response(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    text: "",
    toolCalls: [],
    tokens: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0 },
    durationMs: 5,
    stopReason: "end_turn",
    ...overrides,
  }
}

describe("createTelemetryProvider", () => {
  it("counts a failed schema response and successful prompt fallback separately", async () => {
    let call = 0
    const delegate: LLMProvider = {
      name: "fallback-mock",
      async complete() {
        call += 1
        return call === 1
          ? response({ costUsd: 0.01 })
          : response({
            text: '{"ok":true}',
            tokens: { input: 20, output: 3, cacheRead: 4, cacheWrite: 0 },
            costUsd: 0.02,
          })
      },
      async completeWithToolResults() {
        throw new Error("delegate tool continuation must not run")
      },
    }
    const telemetry = createTelemetryProvider(delegate)

    const extracted = await telemetry.inPhase("initial", provider => extractStructured({
      provider,
      schema: TinySchema,
      schemaName: "submit_tiny",
      schemaDescription: "Return a tiny object.",
      prompt: "Return ok.",
      maxRetries: 1,
    }))

    expect(extracted.result).toEqual({ ok: true })
    expect(telemetry.attempts).toHaveLength(2)
    expect(telemetry.attempts.map(attempt => attempt.transport)).toEqual([
      "schema-tool",
      "prompt-parse",
    ])
    expect(telemetry.summary()).toEqual(expect.objectContaining({
      providerCalls: 2,
      respondedCalls: 2,
      unknownUsageCalls: 0,
      knownTokens: { input: 30, output: 5, cacheRead: 4, cacheWrite: 0 },
      totalActualUsd: 0.03,
      actualUsdStatus: "complete",
      transportAttempts: "unknown",
    }))
  })

  it("keeps known USD as a subtotal when one response has no provider cost", async () => {
    let call = 0
    const delegate: LLMProvider = {
      name: "partial-cost-mock",
      async complete() {
        call += 1
        return call === 1
          ? response({ costUsd: 0.01 })
          : response({ text: '{"ok":true}', costUsd: undefined })
      },
      async completeWithToolResults() {
        throw new Error("not reached")
      },
    }
    const telemetry = createTelemetryProvider(delegate)
    await telemetry.inPhase("initial", provider => extractStructured({
      provider,
      schema: TinySchema,
      schemaName: "submit_tiny",
      schemaDescription: "Return a tiny object.",
      prompt: "Return ok.",
      maxRetries: 1,
    }))

    expect(telemetry.summary()).toEqual(expect.objectContaining({
      knownActualUsdSubtotal: 0.01,
      totalActualUsd: null,
      actualUsdStatus: "partial-unknown",
      unknownCostCalls: 1,
    }))
  })

  it("records a no-response error with unknown usage and rethrows the same error", async () => {
    const failure = new ProviderNetworkError("connection lost", "mock")
    const delegate: LLMProvider = {
      name: "error-mock",
      async complete(): Promise<LLMResponse> {
        throw failure
      },
      async completeWithToolResults(): Promise<LLMResponse> {
        throw new Error("not reached")
      },
    }
    const telemetry = createTelemetryProvider(delegate)

    let thrown: unknown
    try {
      await telemetry.inPhase("initial", provider => provider.complete({ messages: [] }))
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(failure)
    expect(telemetry.attempts[0]).toEqual(expect.objectContaining({
      status: "error",
      usage: null,
      costUsd: null,
    }))
    expect(telemetry.summary()).toEqual(expect.objectContaining({
      providerCalls: 1,
      respondedCalls: 0,
      unknownUsageCalls: 1,
      totalActualUsd: null,
      actualUsdStatus: "unknown",
    }))
  })

  it("refuses tool-result continuation instead of exposing an executor", async () => {
    let delegated = false
    const delegate: LLMProvider = {
      name: "no-executor",
      async complete(params: CompletionParams) {
        return response({ text: JSON.stringify(params) })
      },
      async completeWithToolResults() {
        delegated = true
        return response()
      },
    }
    const telemetry = createTelemetryProvider(delegate)

    await expect(telemetry.provider.completeWithToolResults(
      { messages: [] },
      [],
      response(),
    )).rejects.toThrow(/disabled/)
    expect(delegated).toBe(false)
  })

  it("closes on a per-call timeout, records a late settlement, and rejects new dispatch", async () => {
    let delegatedCalls = 0
    const delegate: LLMProvider = {
      name: "late-response",
      async complete() {
        delegatedCalls += 1
        await new Promise(resolve => setTimeout(resolve, 25))
        return response({ text: "late", costUsd: 0.03 })
      },
      async completeWithToolResults() {
        throw new Error("not reached")
      },
    }
    const telemetry = createTelemetryProvider(delegate, {
      perCallTimeoutMs: 5,
      unitTimeoutMs: 100,
      maxDispatches: 4,
    })

    await expect(telemetry.inPhase("initial", provider => provider.complete({ messages: [] })))
      .rejects.toThrow(/did not settle within 5ms/)
    const returnTimeSnapshot = structuredClone(telemetry.attempts)
    await new Promise(resolve => setTimeout(resolve, 35))
    await expect(telemetry.inPhase("domain-repair", provider => provider.complete({ messages: [] })))
      .rejects.toThrow(/closed/)

    expect(delegatedCalls).toBe(1)
    expect(telemetry.attempts[0]).toEqual(expect.objectContaining({
      phase: "initial",
      status: "timeout",
      usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0 },
      costUsd: 0.03,
      lateSettlement: expect.objectContaining({ kind: "response" }),
    }))
    expect(telemetry.events.map(event => event.kind)).toEqual([
      "dispatch",
      "timeout",
      "closed",
      "late-response",
      "dispatch-rejected",
    ])
    const reconciled = reconcileAuthorizationAttemptsFromEvents(returnTimeSnapshot, telemetry.events)
    expect(reconciled[0]?.lateSettlement?.kind).toBe("response")
    expect(summarizeAuthorizationAttempts(reconciled)).toEqual(expect.objectContaining({
      providerCalls: 1,
      respondedCalls: 1,
      unknownUsageCalls: 0,
      knownActualUsdSubtotal: 0.03,
      totalActualUsd: 0.03,
    }))
  })

  it("rejects a fifth provider dispatch before calling the delegate", async () => {
    let delegatedCalls = 0
    const delegate: LLMProvider = {
      name: "dispatch-cap",
      async complete() {
        delegatedCalls += 1
        return response()
      },
      async completeWithToolResults() {
        throw new Error("not reached")
      },
    }
    const telemetry = createTelemetryProvider(delegate, {
      perCallTimeoutMs: 1_000,
      unitTimeoutMs: 10_000,
      maxDispatches: 4,
    })

    for (let index = 0; index < 4; index += 1) {
      await telemetry.inPhase("initial", provider => provider.complete({ messages: [] }))
    }
    await expect(telemetry.inPhase("initial", provider => provider.complete({ messages: [] })))
      .rejects.toThrow(/dispatch limit of 4/)

    expect(delegatedCalls).toBe(4)
    expect(telemetry.attempts).toHaveLength(4)
    expect(telemetry.events.at(-1)?.kind).toBe("dispatch-rejected")
  })
})
