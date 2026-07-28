import { afterEach, describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { LLMProvider, LLMResponse } from "../providers/types.ts"
import {
  DurableRuntimeTrace,
  DurableRuntimeTraceEventSchema,
  createDurableRuntimeTraceFromEnv,
} from "./durable-runtime-trace.ts"
import { runAgentLoop } from "./agent-loop.ts"

const roots: string[] = []
const originalTracePath = process.env.SKVM_DURABLE_RUNTIME_TRACE

afterEach(async () => {
  if (originalTracePath === undefined) delete process.env.SKVM_DURABLE_RUNTIME_TRACE
  else process.env.SKVM_DURABLE_RUNTIME_TRACE = originalTracePath
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function temporaryPath() {
  const root = await mkdtemp(join(tmpdir(), "skvm-durable-trace-"))
  roots.push(root)
  return join(root, "trace.jsonl")
}

async function readEvents(path: string) {
  return (await Bun.file(path).text()).trim().split(/\r?\n/).map((line) =>
    DurableRuntimeTraceEventSchema.parse(JSON.parse(line)))
}

describe("durable runtime trace writer", () => {
  test("is absent by default and performs no file IO", async () => {
    delete process.env.SKVM_DURABLE_RUNTIME_TRACE
    const path = await temporaryPath()
    expect(createDurableRuntimeTraceFromEnv()).toBeUndefined()
    expect(existsSync(path)).toBe(false)
  })

  test("flushes a closed projection without retaining private tool data", async () => {
    const path = await temporaryPath()
    const trace = new DurableRuntimeTrace(path)
    trace.providerRequestStart(1)
    trace.providerResponseReceived(1, {
      text: "PRIVATE_MODEL_TEXT",
      toolCalls: [
        { id: "PRIVATE_ID", name: "read_file", arguments: { path: "C:/PRIVATE/SECRET" } },
        { id: "PRIVATE_ID_2", name: "private_tool_name", arguments: { secret: "PRIVATE_ARGUMENT" } },
      ],
      tokens: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
      durationMs: 12.8,
      stopReason: "tool_use",
    })
    trace.toolBatchStart(1, [
      { name: "read_file" },
      { name: "private_tool_name" },
    ])
    trace.toolBatchEnd(1, [
      { name: "read_file" },
      { name: "private_tool_name" },
    ], 4.2)
    trace.turnEnd(1)
    trace.finalize(1, "completed")

    const events = await readEvents(path)
    expect(events.map((event) => event.event)).toEqual([
      "trace-start",
      "provider-request-start",
      "provider-response-received",
      "tool-batch-start",
      "tool-batch-end",
      "turn-end",
      "finalize",
    ])
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(events[2]).toMatchObject({
      toolCount: 2,
      maximumToolFanOut: 2,
      toolTypes: {
        readFile: 1,
        writeFile: 0,
        executeCommand: 0,
        listDirectory: 0,
        webFetch: 0,
        other: 1,
      },
      durationMs: 13,
      stopReason: "tool-use",
    })
    const serialized = JSON.stringify(events)
    for (const forbidden of [
      path,
      "PRIVATE_",
      "private_tool_name",
      "C:/",
      "arguments",
      "tokens",
      "text",
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
    expect(() => trace.turnEnd(2)).toThrow("closed")
  })

  test("preserves an unfinished durable prefix without inventing finalize", async () => {
    const path = await temporaryPath()
    const trace = new DurableRuntimeTrace(path)
    trace.providerRequestStart(1)
    trace.abandon()
    const events = await readEvents(path)
    expect(events.map((event) => event.event)).toEqual([
      "trace-start",
      "provider-request-start",
    ])
  })
})

describe("agent loop durable trace integration", () => {
  test("records provider, tool batch, turn, and finalize boundaries in order", async () => {
    const path = await temporaryPath()
    process.env.SKVM_DURABLE_RUNTIME_TRACE = path
    let call = 0
    const responses: LLMResponse[] = [
      {
        text: "PRIVATE_FIRST_RESPONSE",
        toolCalls: [{ id: "call-1", name: "read_file", arguments: { path: "PRIVATE_PATH" } }],
        tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        durationMs: 5,
        stopReason: "tool_use",
      },
      {
        text: "PRIVATE_FINAL_RESPONSE",
        toolCalls: [],
        tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        durationMs: 6,
        stopReason: "end_turn",
      },
    ]
    const provider: LLMProvider = {
      name: "test-provider",
      async complete() { return responses[call++]! },
      async completeWithToolResults() { return responses[call++]! },
    }
    const result = await runAgentLoop({
      provider,
      model: "PRIVATE_MODEL",
      tools: [],
      executeTool: async () => ({ output: "PRIVATE_TOOL_RESULT", durationMs: 2 }),
      system: "PRIVATE_SYSTEM",
      maxIterations: 4,
      timeoutMs: 10_000,
      parallelToolExecution: true,
    }, [{ role: "user", content: "PRIVATE_PROMPT" }])
    expect(result.error).toBeUndefined()

    const events = await readEvents(path)
    expect(events.map((event) => `${event.turn}:${event.event}`)).toEqual([
      "0:trace-start",
      "1:provider-request-start",
      "1:provider-response-received",
      "1:tool-batch-start",
      "1:tool-batch-end",
      "1:turn-end",
      "2:provider-request-start",
      "2:provider-response-received",
      "2:turn-end",
      "2:finalize",
    ])
    expect(JSON.stringify(events)).not.toContain("PRIVATE_")
  })
})
