import { describe, expect, test } from "bun:test"
import { piEventsToRunRecord, type PiEvent } from "./pi-runtime.ts"

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
