import { describe, expect, test } from "bun:test"
import type { RealAgentRunPlanEntry } from "./real-agent.ts"
import { DurableRuntimeTraceRouteLockSchema } from "./durable-runtime-trace-route.ts"
import {
  parseDurableRuntimeTraceRouteRunArgs,
  selectDurableRuntimeTraceRouteEntry,
} from "./durable-runtime-trace-route-run.ts"

const lock = DurableRuntimeTraceRouteLockSchema.parse({
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
})

const entry = {
  caseId: "experimental-design-v2:skvm:windows:clean:experimental-design-v2-cluster-sequential-dev-002",
  system: "original",
  model: "xty/gpt-5.6-sol",
  modelFamily: "gpt",
  adapter: "bare-agent",
  runIndex: 1,
  command: ["bun", "run", "skvm", "run"],
  workDir: "workdir",
} as RealAgentRunPlanEntry

describe("durable runtime trace route runner", () => {
  test("parses an explicit plan or execute phase", () => {
    expect(parseDurableRuntimeTraceRouteRunArgs([
      "--root=D:/repo",
      "--lock=lock.json",
      "--out-dir=out",
      "--phase=plan",
    ])).toEqual({ rootDir: "D:\\repo", lockPath: "lock.json", outDir: "out", phase: "plan" })
    expect(() => parseDurableRuntimeTraceRouteRunArgs([
      "--lock=lock.json",
      "--out-dir=out",
      "--phase=matrix",
    ])).toThrow()
  })

  test("selects exactly one frozen original row and rejects identity drift", () => {
    expect(selectDurableRuntimeTraceRouteEntry([entry], lock)).toBe(entry)
    expect(() => selectDurableRuntimeTraceRouteEntry([entry, { ...entry }], lock)).toThrow()
    expect(() => selectDurableRuntimeTraceRouteEntry([{ ...entry, model: "xty/other" }], lock)).toThrow()
  })
})
