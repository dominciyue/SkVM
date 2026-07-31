import { describe, expect, test } from "bun:test"
import path from "node:path"
import type { ScoredAgentRunRow } from "./scoring.ts"
import {
  ApiTesterCalibrationLockSchema,
  evaluateApiTesterCalibrationGate,
  readAndValidateApiTesterCalibrationLock,
} from "./api-tester-calibration.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/api-tester/pi-direct-cli-short-path-calibration-lock.json",
)
const tasks = ["api-tester-openapi-users-dev-001", "api-tester-openapi-inventory-dev-002"] as const

function row(input: {
  taskId: string
  system: "no-skill" | "original"
  runIndex: 1 | 2
  success?: boolean
}): ScoredAgentRunRow {
  const success = input.success ?? true
  return {
    caseId: `api-tester:skvm:windows:clean:${input.taskId}`,
    skill: "api-tester",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: input.taskId,
    system: input.system,
    model: "xty/gpt-5.6-sol",
    modelFamily: "gpt",
    adapter: "pi",
    adapterVersion: "0.67.68",
    panelConfigId: "api-tester-pi-direct-cli-short-path-development-v1",
    runIndex: input.runIndex,
    taskSplit: "development",
    success,
    ruleViolations: success ? 0 : 1,
    stepCoverage: success ? 1 : 0.6,
    latencyMs: 100,
    inputTokens: 1000,
    outputTokens: 200,
    tokenCost: 1200,
    runStatus: "ok",
    successSource: "deterministic-evaluator",
    failedCriteria: success ? [] : ["api-schema-derived-cases"],
    evaluatorScore: success ? 1 : 0.7,
  }
}

function distinguishableRows(): ScoredAgentRunRow[] {
  const rows: ScoredAgentRunRow[] = []
  for (const taskId of tasks) {
    for (const runIndex of [1, 2] as const) {
      rows.push(row({ taskId, system: "no-skill", runIndex }))
      rows.push(row({ taskId, system: "original", runIndex }))
    }
  }
  rows[0] = row({ taskId: tasks[0], system: "no-skill", runIndex: 1, success: false })
  return rows
}

describe("api-tester calibration lock and gate", () => {
  test("validates every frozen source, audit, harness, and matrix input", async () => {
    const lock = await readAndValidateApiTesterCalibrationLock({ rootDir, lockPath })
    expect(lock.matrix).toMatchObject({ expectedRows: 8, expectedPairs: 4, repetitions: 2 })
    expect(lock.harness.execution).toMatchObject({
      kind: "bun-source-skvm-direct-pi-package-short-path",
      piResolution: "installed-package-node-short-path",
      outputRoot: "results/skill-ir/at-pi-v1",
      maximumWorkDirLength: 220,
    })
    expect(lock.benchmarkGuards.map((entry) => entry.kind)).toEqual([
      "api-tester-task-split-freeze",
      "api-tester-source-oracle-provenance",
      "api-tester-contract-audit",
      "api-tester-materialization-audit",
    ])
    expect(lock.claimBoundary).toMatchObject({ createsBaseIr: false, permitsHeldOut: false, skillOptimizationEvidence: false })
  })

  test("rejects model, retry, gate, and output-root drift", async () => {
    const lock = await readAndValidateApiTesterCalibrationLock({ rootDir, lockPath })
    expect(() => ApiTesterCalibrationLockSchema.parse({ ...lock, model: { route: "xty/gpt-4.1", family: "gpt" } })).toThrow()
    expect(() => ApiTesterCalibrationLockSchema.parse({ ...lock, runtime: { ...lock.runtime, retries: 1 } })).toThrow()
    expect(() => ApiTesterCalibrationLockSchema.parse({ ...lock, gate: { ...lock.gate, minimumDifferingPairs: 0 } })).toThrow()
    expect(() => ApiTesterCalibrationLockSchema.parse({
      ...lock,
      harness: { ...lock.harness, execution: { ...lock.harness.execution, outputRoot: "results/skill-ir/other" } },
    })).toThrow()
  })

  test("passes only with a complete distinguishable matrix and original success per task", async () => {
    const lock = await readAndValidateApiTesterCalibrationLock({ rootDir, lockPath })
    const passed = evaluateApiTesterCalibrationGate(distinguishableRows(), lock)
    expect(passed).toMatchObject({
      schemaVersion: "skill-ir-api-tester-calibration-gate/v1",
      passed: true,
      gates: {
        completeRows: true,
        completePairs: true,
        zeroInfrastructure: true,
        noSkillNonSaturated: true,
        distinguishable: true,
        eachTaskOriginalSuccess: true,
      },
      interpretation: { baseIrAuditAllowed: true, heldOutAllowed: false },
    })

    const missingOriginal = distinguishableRows().map((entry) =>
      entry.system === "original" && entry.task === tasks[1] ? { ...entry, success: false } : entry)
    const failed = evaluateApiTesterCalibrationGate(missingOriginal, lock)
    expect(failed.passed).toBe(false)
    expect(failed.gates.eachTaskOriginalSuccess).toBe(false)
    expect(failed.interpretation.baseIrAuditAllowed).toBe(false)
  })
})
