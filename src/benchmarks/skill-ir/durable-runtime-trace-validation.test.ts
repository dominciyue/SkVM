import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { DurableRuntimeTrace } from "../../core/durable-runtime-trace.ts"
import { DELAYED_REPLAY_SHAPE } from "./delayed-source-process-replay.ts"
import {
  validateDurableRuntimeTrace,
} from "./durable-runtime-trace-validation.ts"
import { parseDurableRuntimeTraceValidationArgs } from "./durable-runtime-trace-validation-run.ts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function calls(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `PRIVATE_ID_${index}`,
    name: index === 0 ? "read_file" : "private_tool_name",
    arguments: { secret: "PRIVATE_ARGUMENT" },
  }))
}

async function completeTrace() {
  const root = await mkdtemp(join(tmpdir(), "skvm-trace-validation-"))
  roots.push(root)
  const path = join(root, "trace.jsonl")
  for (let segment = 0; segment < 2; segment++) {
    const trace = new DurableRuntimeTrace(path)
    for (let turn = 1; turn <= 16; turn++) {
      const phaseCalls = calls(DELAYED_REPLAY_SHAPE.toolCallsPerPhase[turn - 1]!)
      trace.providerRequestStart(turn)
      trace.providerResponseReceived(turn, {
        text: "PRIVATE_MODEL_TEXT",
        toolCalls: phaseCalls,
        tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        durationMs: 10,
        stopReason: phaseCalls.length > 0 ? "tool_use" : "end_turn",
      })
      if (phaseCalls.length > 0) {
        trace.toolBatchStart(turn, phaseCalls)
        trace.toolBatchEnd(turn, phaseCalls, 2)
      }
      trace.turnEnd(turn)
    }
    trace.finalize(16, "completed")
  }
  return { path, text: await Bun.file(path).text() }
}

describe("durable runtime trace validation", () => {
  test("accepts two exact 80-event source replay segments", async () => {
    const trace = await completeTrace()
    const result = validateDurableRuntimeTrace(trace.text)
    expect(result).toEqual({
      events: 160,
      segments: [
        {
          index: 1,
          events: 80,
          providerRequests: 16,
          providerResponses: 16,
          toolBatchStarts: 15,
          toolBatchEnds: 15,
          turnEnds: 16,
          toolCalls: 23,
          maximumToolFanOut: 6,
          finalized: true,
          finalOutcome: "completed",
          orderPassed: true,
        },
        {
          index: 2,
          events: 80,
          providerRequests: 16,
          providerResponses: 16,
          toolBatchStarts: 15,
          toolBatchEnds: 15,
          turnEnds: 16,
          toolCalls: 23,
          maximumToolFanOut: 6,
          finalized: true,
          finalOutcome: "completed",
          orderPassed: true,
        },
      ],
      passed: true,
    })
    expect(JSON.stringify(result)).not.toContain("PRIVATE_")
    expect(JSON.stringify(result)).not.toContain(trace.path)
  })

  test("fails closed when a durable event is missing", async () => {
    const trace = await completeTrace()
    const lines = trace.text.trim().split(/\r?\n/)
    lines.splice(4, 1)
    expect(() => validateDurableRuntimeTrace(`${lines.join("\n")}\n`)).toThrow("sequence or event order")
  })

  test("keeps the formal validation CLI inputs frozen", () => {
    expect(parseDurableRuntimeTraceValidationArgs(["--out=results/trace.json"])).toMatchObject({
      out: "results/trace.json",
      verify: undefined,
    })
    expect(parseDurableRuntimeTraceValidationArgs(["--verify-only=results/trace.json"])).toMatchObject({
      out: undefined,
      verify: "results/trace.json",
    })
    expect(() => parseDurableRuntimeTraceValidationArgs([
      "--out=results/trace.json",
      "--trace-path=changed",
    ])).toThrow("Unknown argument")
  })
})
