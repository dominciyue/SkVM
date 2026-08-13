import { describe, expect, test } from "bun:test"
import {
  isPiNDJSONActivityLine,
  observePiExecution,
  piEventsToRunRecord,
  type PiEvent,
} from "./pi-runtime.ts"

function assistantEvent(
  input: { text?: string; inputTokens: number; outputTokens: number },
): Extract<PiEvent, { type: "agent_end" }> {
  return {
    type: "agent_end",
    messages: [{
      role: "assistant",
      content: input.text ? [{ type: "text", text: input.text }] : [],
      api: "openai-completions",
      provider: "openai",
      model: "gpt-test",
      usage: {
        input: input.inputTokens,
        output: input.outputTokens,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: input.inputTokens + input.outputTokens,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 1,
    }],
  }
}

describe("pi runtime execution observability", () => {
  test("resets idle time only for provider, assistant, or tool progress", () => {
    expect(isPiNDJSONActivityLine(JSON.stringify({ type: "session" }))).toBe(false)
    expect(isPiNDJSONActivityLine(JSON.stringify({ type: "turn_start" }))).toBe(false)
    expect(isPiNDJSONActivityLine(JSON.stringify({ type: "message_update" }))).toBe(true)
    expect(isPiNDJSONActivityLine(JSON.stringify({ type: "tool_execution_update" }))).toBe(true)
    expect(isPiNDJSONActivityLine("not json")).toBe(false)
  })

  test("builds value-free compact execution evidence from Pi events", () => {
    const terminal = assistantEvent({ text: "PRIVATE MODEL TEXT", inputTokens: 12, outputTokens: 3 })
    const observation = observePiExecution([
      { type: "agent_start" },
      { type: "turn_start" },
      terminal,
    ], {
      exitCode: 0,
      durationMs: 250,
      timedOut: false,
      firstActivityMs: 100,
      lastActivityMs: 200,
    })

    expect(observation).toMatchObject({
      schemaVersion: "skvm-run-execution-observation/v1",
      process: { exitCode: 0, termination: "natural", durationMs: 250 },
      activity: {
        requestDispatched: true,
        providerResponses: 1,
        assistantMessages: 1,
        firstActivityMs: 100,
        lastActivityMs: 200,
      },
      terminal: { present: true, stopReason: "stop" },
      usage: { available: true, input: 12, output: 3 },
      parser: { outcome: "ok", unknownTypes: [] },
    })
    expect(JSON.stringify(observation)).not.toContain("PRIVATE")
  })

  test("accepts standard thinking blocks but rejects truly unknown Pi content", () => {
    const thinking = assistantEvent({ inputTokens: 1, outputTokens: 1 })
    const thinkingAssistant = thinking.messages[0]!
    if (thinkingAssistant.role !== "assistant") throw new Error("assistant fixture mismatch")
    thinkingAssistant.content = [{ type: "thinking", thinking: "PRIVATE" }] as unknown as typeof thinkingAssistant.content
    expect(observePiExecution([thinking], {
      exitCode: 0, durationMs: 1, timedOut: false,
    }).parser).toEqual({ outcome: "ok", unknownTypes: [] })

    const incompatible = assistantEvent({ inputTokens: 0, outputTokens: 0 })
    const assistant = incompatible.messages[0]!
    if (assistant.role !== "assistant") throw new Error("assistant fixture mismatch")
    assistant.content = [{ type: "future-block", payload: "PRIVATE" }] as unknown as typeof assistant.content
    expect(observePiExecution([incompatible], {
      exitCode: 0, durationMs: 1, timedOut: false,
    }).parser).toEqual({ outcome: "incompatible", unknownTypes: ["content:future-block"] })
  })

  test("accepts Pi compaction lifecycle events as standard parser input", () => {
    const terminal = assistantEvent({ text: "done", inputTokens: 1, outputTokens: 1 })
    const observation = observePiExecution([
      { type: "compaction_start", reason: "threshold" } as unknown as PiEvent,
      { type: "compaction_end", reason: "threshold", result: undefined, aborted: false, willRetry: false } as unknown as PiEvent,
      terminal,
    ], {
      exitCode: 0, durationMs: 1, timedOut: false,
    })

    expect(observation.parser).toEqual({ outcome: "ok", unknownTypes: [] })
  })

  test("reports pre-semantic provider transients without private text", () => {
    const transient = observePiExecution([{
      type: "auto_retry_start",
      attempt: 1,
      maxAttempts: 1,
      delayMs: 0,
      errorMessage: "HTTP 503 upstream unavailable",
    }], {
      exitCode: 1, durationMs: 20, timedOut: false,
    })
    expect(transient.transientError).toBe("provider-5xx")
    expect(JSON.stringify(transient)).not.toContain("503 upstream")
  })

  test("accepts the standard auto_retry_end event without hiding provider transients", () => {
    const transient = observePiExecution([
      {
        type: "auto_retry_start",
        attempt: 1,
        maxAttempts: 1,
        delayMs: 0,
        errorMessage: "HTTP 503 upstream unavailable",
      },
      { type: "auto_retry_end", success: false, attempt: 1, finalError: "HTTP 503 upstream unavailable" },
    ], {
      exitCode: 0, durationMs: 20, timedOut: false,
    })
    expect(transient).toMatchObject({
      parser: { outcome: "ok", unknownTypes: [] },
      transientError: "provider-5xx",
    })
    expect(JSON.stringify(transient)).not.toContain("503 upstream")
  })

  test("records a harness-enforced Pi step limit separately from timeout", () => {
    const observation = observePiExecution([{ type: "turn_start" }], {
      exitCode: 143,
      durationMs: 100,
      timedOut: false,
      stoppedByStdoutLine: true,
    })
    expect(observation.process.termination).toBe("step-limit")
  })

  test("marks a terminal zero-usage empty assistant event as parse-failed", () => {
    const result = piEventsToRunRecord([
      { type: "agent_start" },
      assistantEvent({ inputTokens: 0, outputTokens: 0 }),
    ]).finish({ workDir: "work", durationMs: 1 })

    expect(result).toMatchObject({
      runStatus: "parse-failed",
      text: "",
      tokens: { input: 0, output: 0 },
      usageAvailable: true,
    })
    expect(result.statusDetail).toContain("zero usage")
  })

  test("keeps zero-usage assistant text observable", () => {
    const result = piEventsToRunRecord([
      assistantEvent({ text: "Completed without usage telemetry.", inputTokens: 0, outputTokens: 0 }),
    ]).finish({ workDir: "work", durationMs: 1 })

    expect(result.runStatus).toBe("ok")
    expect(result.text).toBe("Completed without usage telemetry.")
  })

  test("ignores non-text Pi content blocks when deciding observability", () => {
    const event = assistantEvent({ inputTokens: 0, outputTokens: 0 })
    const assistant = event.messages[0]!
    if (assistant.role !== "assistant") throw new Error("assistant fixture mismatch")
    assistant.content = [{ type: "thinking", thinking: "internal" }] as unknown as typeof assistant.content

    const result = piEventsToRunRecord([event]).finish({ workDir: "work", durationMs: 1 })

    expect(result.runStatus).toBe("parse-failed")
    expect(result.statusDetail).toContain("no assistant or tool activity")
  })
})
