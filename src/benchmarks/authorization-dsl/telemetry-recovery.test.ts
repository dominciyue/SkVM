import { expect, test } from "bun:test"
import { createTelemetryProvider, reconcileAuthorizationAttemptsFromEvents, summarizeAuthorizationAttempts } from "./telemetry.ts"
import { ProviderNetworkError } from "../../providers/errors.ts"
import type { CompletionParams, LLMProvider, LLMResponse } from "../../providers/types.ts"
import { runAgentLoop } from "../../core/agent-loop.ts"

function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j }); return { promise, resolve, reject } }
const response = (text: string, costUsd?: number): LLMResponse => ({ text, toolCalls: [], tokens: { input: 10, output: 2, cacheRead: 4, cacheWrite: 0 }, durationMs: 1, stopReason: "end_turn", costUsd })
const policy = { policyVersion: "authorization-readonly-recovery/v1" as const, toolNames: ["source_read"], verifyLocalState: () => true }
const params: CompletionParams = { messages: [], tools: [{ name: "source_read", description: "Read original source", inputSchema: {} }] }

for (const lateBeforeRecovery of [true, false]) test("readonly recovery quarantines the original reply " + (lateBeforeRecovery ? "before" : "after") + " the accepted recovery", async () => {
  const first = deferred<LLMResponse>(), verify = deferred<boolean>(), timeout = deferred<void>(), late = deferred<void>()
  let calls = 0, executions = 0, originalSignal: AbortSignal | undefined
  const consumed: string[] = []
  const delegate: LLMProvider = { name: "controlled", supportsAbortSignal: true, complete: async p => { calls++; if (calls === 1) { originalSignal = p.signal; return first.promise } return response("current") }, completeWithToolResults: async () => { throw new Error("unused") } }
  const telemetry = createTelemetryProvider(delegate, { perCallTimeoutMs: 5, unitTimeoutMs: 1000, maxDispatches: 4, executableToolNames: ["source_read"], readonlyRecovery: { ...policy, verifyLocalState: () => verify.promise }, onEvent: e => { if (e.kind === "timeout") timeout.resolve(); if (e.kind === "late-response") late.resolve() } })
  const current = runAgentLoop({ provider: telemetry.provider, model: "mock", system: "", tools: params.tools!, executeTool: async () => { executions++; return { output: "", durationMs: 0 } }, onAfterLLM: r => { consumed.push(r.text) }, maxIterations: 4, timeoutMs: 1000, isolateLateResponses: true }, [])
  void current.catch(() => {})
  await timeout.promise
  expect(originalSignal?.aborted).toBe(true)
  const old = response("old", 0.03); old.toolCalls = [{ id: "late", name: "source_read", arguments: { path: "ignored" } }]; old.stopReason = "tool_use"
  if (lateBeforeRecovery) { first.resolve(old); await late.promise; expect(calls).toBe(1) }
  verify.resolve(true)
  expect((await current).text).toBe("current")
  if (!lateBeforeRecovery) { first.resolve(old); await late.promise }
  expect(calls).toBe(2)
  expect(executions).toBe(0)
  expect(consumed).toEqual(["current"])
  expect(telemetry.attempts[0]).toMatchObject({ status: "timeout", localConsumer: "closed", cancellation: "requested", lateSettlement: { kind: "response" } })
  expect(telemetry.attempts[1]).toMatchObject({ status: "response", localConsumer: "accepted", recovery: { policyVersion: policy.policyVersion, parentAttemptId: "provider-attempt-1", number: 1 } })
  const replay = reconcileAuthorizationAttemptsFromEvents(structuredClone(telemetry.attempts), [...telemetry.events, ...telemetry.events])
  expect(summarizeAuthorizationAttempts(replay)).toMatchObject({ providerCalls: 2, respondedCalls: 2, knownTokens: { input: 20, output: 4, cacheRead: 8 }, knownActualUsdSubtotal: 0.03, unknownCostCalls: 1, totalActualUsd: null })
})

test("a timed-out recovery cannot spawn a third request and preserves both unknown attempts", async () => {
  let calls = 0
  const delegate: LLMProvider = { name: "timeout", complete: async () => { calls++; throw new ProviderNetworkError("Request timed out", "timeout") }, completeWithToolResults: async () => { throw new Error("unused") } }
  const telemetry = createTelemetryProvider(delegate, { maxDispatches: 24, readonlyRecovery: policy })
  await expect(telemetry.provider.complete(params)).rejects.toThrow("timed out")
  expect(calls).toBe(2)
  expect(telemetry.isClosed()).toBe(true)
  expect(telemetry.attempts.map(a => a.status)).toEqual(["timeout", "timeout"])
  expect(telemetry.summary()).toMatchObject({ providerCalls: 2, unknownUsageCalls: 2, totalActualUsd: null })
})

test("recoveries share the total dispatch budget and stop after two recoveries per position", async () => {
  for (const limit of [2, 24]) {
    let calls = 0
    const delegate: LLMProvider = { name: "bounded", complete: async () => { calls++; if (calls % 2) throw new ProviderNetworkError("Request timed out", "bounded"); return response("current") }, completeWithToolResults: async () => { throw new Error("unused") } }
    const telemetry = createTelemetryProvider(delegate, { maxDispatches: limit, readonlyRecovery: policy })
    expect((await telemetry.provider.complete(params)).text).toBe("current")
    if (limit === 24) expect((await telemetry.provider.complete(params)).text).toBe("current")
    await expect(telemetry.provider.complete(params)).rejects.toThrow()
    expect(calls).toBe(limit === 2 ? 2 : 5)
    expect(telemetry.attempts.filter(a => (a).recovery)).toHaveLength(limit === 2 ? 1 : 2)
  }
})

test("unconfirmed local state or a write capability forbids readonly recovery", async () => {
  for (const unsafeTool of [false, true]) {
    let calls = 0
    const delegate: LLMProvider = { name: "unsafe", complete: async () => { calls++; throw new ProviderNetworkError("Request timed out", "unsafe") }, completeWithToolResults: async () => { throw new Error("unused") } }
    const telemetry = createTelemetryProvider(delegate, { readonlyRecovery: { ...policy, verifyLocalState: () => unsafeTool } })
    const request = unsafeTool ? { ...params, tools: [{ name: "write_file", description: "write", inputSchema: {} }] } : params
    await expect(telemetry.provider.complete(request)).rejects.toThrow()
    expect(calls).toBeLessThanOrEqual(1)
    expect(telemetry.attempts.filter(a => (a).recovery)).toHaveLength(0)
  }
})

test("closing an active isolated request rejects its consumer and only permits late accounting", async () => {
  const pending = deferred<LLMResponse>(), dispatched = deferred<void>(), late = deferred<void>()
  const delegate: LLMProvider = { name: "close", complete: async () => pending.promise, completeWithToolResults: async () => { throw new Error("unused") } }
  const telemetry = createTelemetryProvider(delegate, { isolateLateResponses: true, onEvent: e => { if (e.kind === "dispatch") dispatched.resolve(); if (e.kind === "late-response") late.resolve() } })
  const consumer = telemetry.provider.complete({ messages: [] })
  const outcome = consumer.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }))
  await dispatched.promise
  await telemetry.close("local end")
  pending.resolve(response("late"))
  expect((await outcome).error?.message).toContain("closed")
  await late.promise
  expect(telemetry.attempts[0]).toMatchObject({ localConsumer: "closed", cancellation: "unsupported", lateSettlement: { kind: "response" } })
})

test("readonly continuation recovery reuses already known tool results without executing those tools again", async () => {
  let calls = 0
  const results = [{ toolCallId: "known", content: "Original read already completed" }], previous = response("read")
  const delegate: LLMProvider = { name: "continuation", complete: async () => { throw new Error("unexpected initial call") }, completeWithToolResults: async (_p, r, prior) => { calls++; expect(r).toBe(results); expect(prior).toBe(previous); if (calls === 1) throw new ProviderNetworkError("Request timed out", "continuation"); return response("current") } }
  const telemetry = createTelemetryProvider(delegate, { executableToolNames: ["source_read"], readonlyRecovery: policy, maxDispatches: 2 })
  expect((await telemetry.provider.completeWithToolResults(params, results, previous)).text).toBe("current")
  expect(calls).toBe(2)
  expect(telemetry.attempts[1]?.recovery?.parentAttemptId).toBe(telemetry.attempts[0]?.id)
})

test("a failed local state verification closes recovery eligibility instead of leaving an open consumer", async () => {
  let calls = 0
  const delegate: LLMProvider = { name: "verify-failure", complete: async () => { calls++; throw new ProviderNetworkError("Request timed out", "verify-failure") }, completeWithToolResults: async () => { throw new Error("unused") } }
  const telemetry = createTelemetryProvider(delegate, { readonlyRecovery: { ...policy, verifyLocalState: () => { throw new Error("Local state not established") } } })
  await expect(telemetry.provider.complete(params)).rejects.toThrow()
  expect(calls).toBe(1)
  expect(telemetry.isClosed()).toBe(true)
})

test("a late remote error retains the original timeout and cannot replace the accepted recovery", async () => {
  const original = deferred<LLMResponse>(), late = deferred<void>()
  let calls = 0
  const delegate: LLMProvider = { name: "late-error", complete: async () => ++calls === 1 ? original.promise : response("current"), completeWithToolResults: async () => { throw new Error("unused") } }
  const telemetry = createTelemetryProvider(delegate, { perCallTimeoutMs: 5, readonlyRecovery: policy, onEvent: event => { if (event.kind === "late-error") late.resolve() } })
  expect((await telemetry.provider.complete(params)).text).toBe("current")
  const timeoutError = structuredClone(telemetry.attempts[0]!.error)
  original.reject(new ProviderNetworkError("late network error", "late-error"))
  await late.promise
  expect(telemetry.attempts[0]!.error).toEqual(timeoutError)
  expect(telemetry.attempts[0]!.lateSettlement).toMatchObject({ kind: "error", error: { name: "ProviderNetworkError", message: "late network error" } })
  expect(telemetry.attempts[1]).toMatchObject({ status: "response", localConsumer: "accepted", response: { text: "current" } })
  expect(telemetry.summary()).toMatchObject({ providerCalls: 2, unknownUsageCalls: 1, totalActualUsd: null })
})
