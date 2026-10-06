import { test, expect, describe } from "bun:test"
import { runAgentLoop } from "../../src/core/agent-loop.ts"
import type { LLMProvider, LLMResponse, CompletionParams, LLMToolResult } from "../../src/providers/types.ts"

// Minimal mock LLM. Each `complete` call sleeps for `delayMs` then returns
// a final end_turn response, so the loop exits naturally after one iteration.
function mockProvider(delayMs: number): LLMProvider {
  return {
    name: "mock",
    async complete(_params: CompletionParams): Promise<LLMResponse> {
      await new Promise((r) => setTimeout(r, delayMs))
      return {
        text: "done",
        toolCalls: [],
        tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
        durationMs: delayMs,
        stopReason: "end_turn",
      }
    },
    async completeWithToolResults(
      _params: CompletionParams,
      _toolResults: LLMToolResult[],
      _previousResponse: LLMResponse,
    ): Promise<LLMResponse> {
      throw new Error("not used")
    },
  }
}

test("ordinary iteration budget prevents an unaccounted continuation and reports unfinished work", async () => {
  let calls = 0
  const response = (): LLMResponse => ({ text: "", toolCalls: [{ id: `c${++calls}`, name: "read", arguments: {} }], tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "tool_use" })
  const provider: LLMProvider = { name: "budget", complete: async () => response(), completeWithToolResults: async () => response() }
  const result = await runAgentLoop({ provider, model: "mock", tools: [], executeTool: async () => ({ output: "read", durationMs: 0 }), system: "", maxIterations: 1, timeoutMs: 5000 }, [{ role: "user", content: "read then answer" }])
  expect(calls).toBe(1)
  expect(result.error?.message).toContain("iteration budget exhausted")
  expect(result.tokens.input).toBe(10)
  expect(result.allToolCalls).toHaveLength(1)
})

test("repeated tool actions stop as unfinished work without promoting intermediate text", async () => {
  let calls = 0
  const response = (): LLMResponse => ({ text: "Still investigating", toolCalls: [{ id: `c${++calls}`, name: "observe", arguments: { observations: [] } }], tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "tool_use" })
  const provider: LLMProvider = { name: "repeated-action", complete: async () => response(), completeWithToolResults: async () => response() }
  const result = await runAgentLoop({ provider, model: "mock", tools: [], executeTool: async () => ({ output: "No new observations", durationMs: 0 }), system: "", maxIterations: 24, timeoutMs: 5000 }, [{ role: "user", content: "Inspect the source and deliver a report" }])
  expect(calls).toBe(3)
  expect(result.iterations).toBe(3)
  expect(result.allToolCalls).toHaveLength(3)
  expect(result.error?.message).toContain("repeated tool action")
  expect(result.text).toBe("")
})

test("deferred tool history retains source identity and complete ordinary file windows", async () => {
  const body = "a".repeat(2500) + "decisive tail"
  let turn = 0, history: CompletionParams["messages"] = []
  const response = (): LLMResponse => ({ text: "", toolCalls: ++turn < 3 ? [{ id: `r${turn}`, name: "read_file", arguments: { path: `source/file-${turn}.yml` } }] : [], tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: turn < 3 ? "tool_use" : "end_turn" })
  const provider: LLMProvider = { name: "history", complete: async () => response(), completeWithToolResults: async params => { history = structuredClone(params.messages); return response() } }
  await runAgentLoop({ provider, model: "mock", tools: [], executeTool: async () => ({ output: body, durationMs: 0 }), system: "", maxIterations: 3, timeoutMs: 5000 }, [])
  expect(JSON.stringify(history)).toContain("source/file-1.yml")
  expect(JSON.stringify(history)).toContain("decisive tail")
})

test("explicit history clipping is visible and keeps the tool argument identity", async () => {
  let turn = 0, history: CompletionParams["messages"] = []
  const response = (): LLMResponse => ({ text: "", toolCalls: ++turn < 3 ? [{ id: `r${turn}`, name: "read_file", arguments: { path: `file-${turn}` } }] : [], tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: turn < 3 ? "tool_use" : "end_turn" })
  const provider: LLMProvider = { name: "history", complete: async () => response(), completeWithToolResults: async params => { history = structuredClone(params.messages); return response() } }
  await runAgentLoop({ provider, model: "mock", tools: [], executeTool: async () => ({ output: "abcdefghijk", durationMs: 0 }), system: "", maxIterations: 3, timeoutMs: 5000, toolHistoryCharacterLimit: 8 }, [])
  expect(JSON.stringify(history)).toContain("file-1")
  expect(JSON.stringify(history)).toContain("[history truncated: 8/11 characters]")
  expect(JSON.stringify(history)).not.toContain("ijk")
})

describe("runAgentLoop deadline detection", () => {
  test("post-loop check catches over-time await that returned end_turn", async () => {
    // Regression for round-6 / sweep G6: the in-loop deadline check only
    // fires before a new iteration starts. If `provider.complete()` runs
    // past `timeoutMs` and then returns a final response, the loop exits
    // naturally and the in-loop check never runs. Without the post-loop
    // check, `timedOut` would stay false, and bare-agent would report
    // `runStatus: 'ok'` for an over-time run — recreating the original
    // false-positive class.
    const result = await runAgentLoop(
      {
        provider: mockProvider(200),  // takes 200ms
        model: "mock",
        tools: [],
        executeTool: async () => ({ output: "", durationMs: 0 }),
        system: "",
        maxIterations: 5,
        timeoutMs: 50,                  // budget is 50ms — overrun by ~150ms
      },
      [{ role: "user", content: "hello" }],
    )

    expect(result.timedOut).toBe(true)
    expect(result.iterations).toBe(1)  // one iteration happened
  })

  test("normal in-budget run is not marked timedOut", async () => {
    const result = await runAgentLoop(
      {
        provider: mockProvider(20),    // takes 20ms
        model: "mock",
        tools: [],
        executeTool: async () => ({ output: "", durationMs: 0 }),
        system: "",
        maxIterations: 5,
        timeoutMs: 5000,                // ample budget
      },
      [{ role: "user", content: "hello" }],
    )

    expect(result.timedOut).toBe(false)
    expect(result.text).toBe("done")
    expect(result.iterations).toBe(1)
  })
})

/**
 * Provider that emits N independent tool_use blocks on the first turn, then
 * end_turn on the next call. Used to exercise ILP dispatch: each tool call
 * sleeps for `toolDelayMs`; with serial execution total wall-clock ≈ N*delay,
 * with parallel execution total ≈ delay.
 */
function ilpMockProvider(toolCount: number): LLMProvider {
  let turn = 0
  return {
    name: "ilp-mock",
    async complete(_params: CompletionParams): Promise<LLMResponse> {
      turn = 1
      return {
        text: "",
        toolCalls: Array.from({ length: toolCount }, (_, i) => ({
          id: `call_${i}`,
          name: "bash",
          arguments: { command: `echo ${i}` },
        })),
        tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
        durationMs: 1,
        stopReason: "tool_use",
      }
    },
    async completeWithToolResults(
      _params: CompletionParams,
      _toolResults: LLMToolResult[],
      _previousResponse: LLMResponse,
    ): Promise<LLMResponse> {
      turn = 2
      return {
        text: "done",
        toolCalls: [],
        tokens: { input: 5, output: 5, cacheRead: 0, cacheWrite: 0 },
        durationMs: 1,
        stopReason: "end_turn",
      }
    },
  }
}

describe("runAgentLoop ILP dispatch", () => {
  const TOOL_DELAY_MS = 80
  const TOOL_COUNT = 4

  test("serial dispatch runs tool calls one after another", async () => {
    const t0 = performance.now()
    const result = await runAgentLoop(
      {
        provider: ilpMockProvider(TOOL_COUNT),
        model: "mock",
        tools: [],
        executeTool: async () => {
          await new Promise((r) => setTimeout(r, TOOL_DELAY_MS))
          return { output: "ok", durationMs: TOOL_DELAY_MS }
        },
        system: "",
        maxIterations: 3,
        timeoutMs: 5000,
        // parallelToolExecution omitted → default false
      },
      [{ role: "user", content: "go" }],
    )
    const elapsed = performance.now() - t0

    expect(result.allToolCalls).toHaveLength(TOOL_COUNT)
    // Serial: total ≈ N * delay. Assert we are at least 90% of that sum.
    expect(elapsed).toBeGreaterThanOrEqual(TOOL_COUNT * TOOL_DELAY_MS * 0.9)
  })

  test("parallelToolExecution fans out tool calls concurrently", async () => {
    const t0 = performance.now()
    const result = await runAgentLoop(
      {
        provider: ilpMockProvider(TOOL_COUNT),
        model: "mock",
        tools: [],
        executeTool: async () => {
          await new Promise((r) => setTimeout(r, TOOL_DELAY_MS))
          return { output: "ok", durationMs: TOOL_DELAY_MS }
        },
        system: "",
        maxIterations: 3,
        timeoutMs: 5000,
        parallelToolExecution: true,
      },
      [{ role: "user", content: "go" }],
    )
    const elapsed = performance.now() - t0

    expect(result.allToolCalls).toHaveLength(TOOL_COUNT)
    // Parallel: wall-clock ≈ single delay. Must be strictly less than half
    // of the serial lower bound to prove fan-out actually happened.
    expect(elapsed).toBeLessThan(TOOL_COUNT * TOOL_DELAY_MS * 0.5)
  })

  test("ordering of allToolCalls is preserved across parallel dispatch", async () => {
    // Inject per-call delays so call_0 finishes LAST (longest delay). If
    // ordering were wall-clock based, allToolCalls[0] would be call_3.
    const delays = [200, 100, 60, 30]
    const result = await runAgentLoop(
      {
        provider: ilpMockProvider(4),
        model: "mock",
        tools: [],
        executeTool: async (tc) => {
          const idx = parseInt(tc.id.replace("call_", ""), 10)
          const d = delays[idx] ?? 20
          await new Promise((r) => setTimeout(r, d))
          return { output: tc.id, durationMs: d }
        },
        system: "",
        maxIterations: 3,
        timeoutMs: 5000,
        parallelToolExecution: true,
      },
      [{ role: "user", content: "go" }],
    )

    expect(result.allToolCalls.map((c) => c.id)).toEqual([
      "call_0",
      "call_1",
      "call_2",
      "call_3",
    ])
  })
})

for (const continuation of [false, true]) test("isolated loop does not consume late " + (continuation ? "continuation" : "initial") + " tool calls or write callbacks", async () => {
  let resolve!: (value: LLMResponse) => void, executions = 0, callbacks = 0, signal: AbortSignal | undefined
  const pending = new Promise<LLMResponse>(r => { resolve = r })
  const toolResponse: LLMResponse = { text: "late", toolCalls: [{ id: "read", name: "source_read", arguments: {} }], tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "tool_use" }
  const provider: LLMProvider = { name: "controlled", complete: async p => { signal = p.signal; return continuation ? toolResponse : pending }, completeWithToolResults: async () => pending }
  const run = runAgentLoop({ provider, model: "mock", tools: [], executeTool: async () => { executions++; return { output: "read", durationMs: 0 } }, onAfterLLM: () => { callbacks++ }, system: "", maxIterations: 3, timeoutMs: 5, isolateLateResponses: true }, [])
  const lateTimer = setTimeout(() => resolve(toolResponse), 25)
  const result = await run
  expect(result.timedOut).toBe(true)
  expect(signal?.aborted).toBe(true)
  expect(result.text).toBe("")
  expect(executions).toBe(continuation ? 1 : 0)
  expect(callbacks).toBe(continuation ? 1 : 0)
  resolve(toolResponse); clearTimeout(lateTimer)
  await Promise.resolve()
  expect(executions).toBe(continuation ? 1 : 0)
  expect(callbacks).toBe(continuation ? 1 : 0)
})

test("explicit isolated loop cancellation prevents a pending reply from writing tool or answer state", async () => {
  const controller = new AbortController()
  let resolve!: (value: LLMResponse) => void, executions = 0, callbacks = 0
  const pending = new Promise<LLMResponse>(r => { resolve = r })
  const provider: LLMProvider = { name: "controlled", complete: async () => pending, completeWithToolResults: async () => pending }
  const run = runAgentLoop({ provider, model: "mock", tools: [], executeTool: async () => { executions++; return { output: "", durationMs: 0 } }, onAfterLLM: () => { callbacks++ }, system: "", maxIterations: 3, timeoutMs: 1000, isolateLateResponses: true, signal: controller.signal }, [])
  controller.abort()
  resolve({ text: "old", toolCalls: [], tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 0, stopReason: "end_turn" })
  const result = await run
  expect(result.text).toBe("")
  expect(result.steps).toHaveLength(0)
  expect(callbacks).toBe(0)
  expect(executions).toBe(0)
})
