import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { z } from "zod"
import type { LLMResponse } from "../providers/types.ts"

const ToolTypeCountsSchema = z.object({
  readFile: z.number().int().nonnegative(),
  writeFile: z.number().int().nonnegative(),
  executeCommand: z.number().int().nonnegative(),
  listDirectory: z.number().int().nonnegative(),
  webFetch: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
}).strict()

const common = {
  schemaVersion: z.literal("skill-ir-durable-runtime-trace-event/v1"),
  sequence: z.number().int().nonnegative(),
  turn: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(),
}
const toolSummary = {
  toolCount: z.number().int().nonnegative(),
  maximumToolFanOut: z.number().int().nonnegative(),
  toolTypes: ToolTypeCountsSchema,
}

export const DurableRuntimeTraceEventSchema = z.discriminatedUnion("event", [
  z.object({ ...common, event: z.literal("trace-start"), sequence: z.literal(0), turn: z.literal(0) }).strict(),
  z.object({ ...common, event: z.literal("provider-request-start") }).strict(),
  z.object({
    ...common,
    event: z.literal("provider-response-received"),
    durationMs: z.number().int().nonnegative(),
    stopReason: z.enum(["tool-use", "end-turn", "other"]),
    ...toolSummary,
  }).strict(),
  z.object({ ...common, event: z.literal("tool-batch-start"), ...toolSummary }).strict(),
  z.object({
    ...common,
    event: z.literal("tool-batch-end"),
    durationMs: z.number().int().nonnegative(),
    ...toolSummary,
  }).strict(),
  z.object({ ...common, event: z.literal("turn-end") }).strict(),
  z.object({
    ...common,
    event: z.literal("finalize"),
    outcome: z.enum(["completed", "timeout", "handled-error", "max-iterations"]),
  }).strict(),
])

export type DurableRuntimeTraceEvent = z.infer<typeof DurableRuntimeTraceEventSchema>
type TraceEventInput<T = DurableRuntimeTraceEvent> = T extends DurableRuntimeTraceEvent
  ? Omit<T, "schemaVersion" | "sequence" | "elapsedMs">
  : never
type ToolLike = { name: string }

function toolTypes(tools: ToolLike[]) {
  const counts: z.infer<typeof ToolTypeCountsSchema> = {
    readFile: 0,
    writeFile: 0,
    executeCommand: 0,
    listDirectory: 0,
    webFetch: 0,
    other: 0,
  }
  for (const tool of tools) {
    switch (tool.name) {
      case "read_file": counts.readFile++; break
      case "write_file": counts.writeFile++; break
      case "execute_command": counts.executeCommand++; break
      case "list_directory": counts.listDirectory++; break
      case "web_fetch": counts.webFetch++; break
      default: counts.other++
    }
  }
  return {
    toolCount: tools.length,
    maximumToolFanOut: tools.length,
    toolTypes: counts,
  }
}

function stopReason(reason: LLMResponse["stopReason"]): "tool-use" | "end-turn" | "other" {
  if (reason === "tool_use") return "tool-use"
  if (reason === "end_turn") return "end-turn"
  return "other"
}

export class DurableRuntimeTrace {
  private readonly startedAt = performance.now()
  private readonly fd: number
  private sequence = 0
  private closed = false

  constructor(path: string) {
    const absolute = resolve(path)
    mkdirSync(dirname(absolute), { recursive: true })
    this.fd = openSync(absolute, "a")
    this.append({ event: "trace-start", turn: 0 })
  }

  private append(input: TraceEventInput): void {
    if (this.closed) throw new Error("Durable runtime trace is closed")
    const event = DurableRuntimeTraceEventSchema.parse({
      schemaVersion: "skill-ir-durable-runtime-trace-event/v1",
      sequence: this.sequence,
      elapsedMs: Math.max(0, Math.round(performance.now() - this.startedAt)),
      ...input,
    })
    writeSync(this.fd, `${JSON.stringify(event)}\n`, undefined, "utf8")
    fsyncSync(this.fd)
    this.sequence++
  }

  providerRequestStart(turn: number): void {
    this.append({ event: "provider-request-start", turn })
  }

  providerResponseReceived(turn: number, response: LLMResponse): void {
    this.append({
      event: "provider-response-received",
      turn,
      durationMs: Math.max(0, Math.round(response.durationMs)),
      stopReason: stopReason(response.stopReason),
      ...toolTypes(response.toolCalls),
    })
  }

  toolBatchStart(turn: number, tools: ToolLike[]): void {
    this.append({ event: "tool-batch-start", turn, ...toolTypes(tools) })
  }

  toolBatchEnd(turn: number, tools: ToolLike[], durationMs: number): void {
    this.append({
      event: "tool-batch-end",
      turn,
      durationMs: Math.max(0, Math.round(durationMs)),
      ...toolTypes(tools),
    })
  }

  turnEnd(turn: number): void {
    this.append({ event: "turn-end", turn })
  }

  finalize(turn: number, outcome: "completed" | "timeout" | "handled-error" | "max-iterations"): void {
    this.append({ event: "finalize", turn, outcome })
    this.close()
  }

  abandon(): void {
    this.close()
  }

  private close(): void {
    if (this.closed) return
    fsyncSync(this.fd)
    closeSync(this.fd)
    this.closed = true
  }
}

export function createDurableRuntimeTraceFromEnv(
  env: Record<string, string | undefined> = process.env,
): DurableRuntimeTrace | undefined {
  const path = env.SKVM_DURABLE_RUNTIME_TRACE
  if (path === undefined) return undefined
  if (path.trim().length === 0) throw new Error("SKVM_DURABLE_RUNTIME_TRACE must not be empty")
  return new DurableRuntimeTrace(path)
}
