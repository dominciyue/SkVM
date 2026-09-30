import { expect, test } from "bun:test"
import { createTelemetryProvider } from "./telemetry.ts"
import { emptyTokenUsage } from "../../core/types.ts"
import type { LLMProvider } from "../../providers/types.ts"
test("native read-only continuation is opt-in, accounted and bounded", async () => {
  let continued = 0
  const response = { text: "done", toolCalls: [], tokens: emptyTokenUsage(), durationMs: 0, stopReason: "end_turn" as const }
  const delegate: LLMProvider = { name: "mock", complete: async () => response, completeWithToolResults: async () => { continued++; return response } }
  const params = { messages: [], tools: [{ name: "source_read", description: "read", inputSchema: {} }] }
  const closed = createTelemetryProvider(delegate)
  await expect(closed.provider.completeWithToolResults(params, [], response)).rejects.toThrow("disabled")
  const native = createTelemetryProvider(delegate, { executableToolNames: ["source_read"], maxDispatches: 1 })
  await native.provider.completeWithToolResults(params, [], response)
  expect(native.attempts[0]!.request.executableTools).toBe(true)
  await expect(native.provider.complete(params)).rejects.toThrow("dispatch limit")
  expect(continued).toBe(1)
  const forbidden = createTelemetryProvider(delegate, { executableToolNames: ["source_read"] })
  await expect(forbidden.provider.complete({ messages: [], tools: [{ name: "execute_command", description: "", inputSchema: {} }] })).rejects.toThrow("unregistered")
  expect(forbidden.attempts.length).toBe(0)
})
