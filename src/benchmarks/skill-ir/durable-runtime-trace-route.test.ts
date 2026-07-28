import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  DurableRuntimeTraceRouteLockSchema,
  buildDurableRuntimeTraceRouteReport,
  summarizeDurableRuntimeTracePrefix,
} from "./durable-runtime-trace-route.ts"

const ZERO_TOOLS = {
  toolCount: 0,
  maximumToolFanOut: 0,
  toolTypes: {
    readFile: 0,
    writeFile: 0,
    executeCommand: 0,
    listDirectory: 0,
    webFetch: 0,
    other: 0,
  },
} as const

function line(value: Record<string, unknown>): string {
  return JSON.stringify({
    schemaVersion: "skill-ir-durable-runtime-trace-event/v1",
    elapsedMs: 0,
    ...value,
  })
}

const lock = {
  schemaVersion: "skill-ir-durable-runtime-trace-route-lock/v1",
  status: "preregistered",
  diagnosticId: "experimental-design-v2-durable-runtime-trace-route-2026-07-29",
  methodEvidence: false,
  baseCalibrationLock: { path: "base.json", sha256: "a".repeat(64) },
  localValidation: { path: "validation.json", sha256: "b".repeat(64) },
  traceSources: [
    { path: "src/core/durable-runtime-trace.ts", sha256: "c".repeat(64) },
    { path: "src/core/agent-loop.ts", sha256: "d".repeat(64) },
  ],
  route: {
    skillId: "experimental-design-v2",
    system: "original",
    taskId: "experimental-design-v2-cluster-sequential-dev-002",
    taskSplit: "development",
    context: "clean",
    agent: "skvm",
    environment: "windows",
    model: "xty/gpt-5.6-sol",
    modelFamily: "gpt",
    adapter: "bare-agent",
    runIndex: 1,
    retries: 0,
    timeoutMs: 180000,
  },
  claimBoundary: {
    infrastructureDiagnosticOnly: true,
    benchmarkDenominator: false,
    skillOptimizationEvidence: false,
    modelCapabilityEvidence: false,
    tokenEvidence: false,
    permitsMatrixExecution: false,
  },
} as const

describe("durable runtime trace route contract", () => {
  test("accepts only the frozen one-row development identity", () => {
    expect(DurableRuntimeTraceRouteLockSchema.parse(lock).route).toEqual(lock.route)
    expect(() => DurableRuntimeTraceRouteLockSchema.parse({
      ...lock,
      route: { ...lock.route, system: "no-skill" },
    })).toThrow()
    expect(() => DurableRuntimeTraceRouteLockSchema.parse({
      ...lock,
      route: { ...lock.route, retries: 1 },
    })).toThrow()
  })

  test("accepts and summarizes a durable crash prefix ending inside a provider call", () => {
    const text = [
      line({ sequence: 0, event: "trace-start", turn: 0 }),
      line({ sequence: 1, event: "provider-request-start", turn: 1 }),
    ].join("\n")
    expect(summarizeDurableRuntimeTracePrefix(text)).toEqual({
      events: 2,
      providerRequests: 1,
      providerResponses: 0,
      toolBatchStarts: 0,
      toolBatchEnds: 0,
      turnEnds: 0,
      finalized: false,
      finalOutcome: null,
      lastEvent: "provider-request-start",
      lastTurn: 1,
      sequenceContinuous: true,
      prefixOrderPassed: true,
    })
  })

  test("accepts a complete segment and rejects gaps, second starts, and private fields", () => {
    const complete = [
      line({ sequence: 0, event: "trace-start", turn: 0 }),
      line({ sequence: 1, event: "provider-request-start", turn: 1 }),
      line({
        sequence: 2,
        event: "provider-response-received",
        turn: 1,
        durationMs: 10,
        stopReason: "end-turn",
        ...ZERO_TOOLS,
      }),
      line({ sequence: 3, event: "turn-end", turn: 1 }),
      line({ sequence: 4, event: "finalize", turn: 1, outcome: "completed" }),
    ].join("\n")
    expect(summarizeDurableRuntimeTracePrefix(complete)).toMatchObject({
      events: 5,
      finalized: true,
      finalOutcome: "completed",
      lastEvent: "finalize",
      prefixOrderPassed: true,
    })
    expect(() => summarizeDurableRuntimeTracePrefix(complete.replace('"sequence":2', '"sequence":3'))).toThrow()
    expect(() => summarizeDurableRuntimeTracePrefix([
      complete,
      line({ sequence: 0, event: "trace-start", turn: 0 }),
    ].join("\n"))).toThrow()
    expect(() => summarizeDurableRuntimeTracePrefix(complete.replace('"turn":0', '"turn":0,"model":"secret-model"'))).toThrow()
  })

  test("builds a compact report without raw trace or stream contents", () => {
    const traceText = `${[
      line({ sequence: 0, event: "trace-start", turn: 0 }),
      line({ sequence: 1, event: "provider-request-start", turn: 1 }),
    ].join("\n")}\n`
    const report = buildDurableRuntimeTraceRouteReport({
      lock: DurableRuntimeTraceRouteLockSchema.parse(lock),
      lockSha256: "e".repeat(64),
      execution: {
        exitCode: 3,
        timedOut: false,
        durationMs: 120,
        stdout: "private stdout",
        stderr: "Bun has crashed",
      },
      traceText,
      outputMaterialization: { declared: 3, present: 0, missing: [
        "design/design-plan.json",
        "design/allocation.csv",
        "design/design-report.md",
      ] },
    })
    const serialized = JSON.stringify(report)
    expect(report.lockSha256).toBe("e".repeat(64))
    expect(report.execution.failureCode).toBe("bun-crash")
    expect(report.trace).toMatchObject({ present: true, events: 2, lastEvent: "provider-request-start" })
    expect(report.trace.present && report.trace.rawSha256).toBe(
      createHash("sha256").update(traceText, "utf8").digest("hex"),
    )
    expect(serialized).not.toContain("private stdout")
    expect(serialized).not.toContain("Bun has crashed")
    expect(serialized).not.toContain(traceText)
  })
})
