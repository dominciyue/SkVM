import { describe, expect, test } from "bun:test"
import path from "node:path"
import type { ScoredAgentRunRow } from "./scoring.ts"
import {
  evaluateMethodCaseCalibrationGate,
  MethodCaseCalibrationLockSchema,
  readAndValidateMethodCaseCalibrationLock,
} from "./method-case-calibration.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/zh-readme/pi-direct-cli-short-path-calibration-lock-v2.json",
)
const tasks = ["zh-readme-node-cli-dev-001", "zh-readme-python-library-dev-002"] as const

function row(input: {
  taskId: string
  system: "no-skill" | "original"
  runIndex: 1 | 2
  success: boolean
  score: number
}): ScoredAgentRunRow {
  return {
    caseId: `zh-readme:skvm:windows:clean:${input.taskId}`,
    skill: "zh-readme",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: input.taskId,
    system: input.system,
    model: "xty/gpt-5.6-sol",
    modelFamily: "gpt",
    adapter: "pi",
    adapterVersion: "0.67.68",
    panelConfigId: "zh-readme-pi-direct-cli-short-path-development-v2",
    runIndex: input.runIndex,
    taskSplit: "development",
    success: input.success,
    ruleViolations: input.success ? 0 : 1,
    stepCoverage: input.score,
    latencyMs: 100,
    inputTokens: 1000,
    outputTokens: 200,
    tokenCost: 1200,
    runStatus: "ok",
    successSource: "deterministic-evaluator",
    failedCriteria: input.success ? [] : ["readme-command-fidelity"],
    evaluatorScore: input.score,
  }
}

function admissibleRows(): ScoredAgentRunRow[] {
  return [
    row({ taskId: tasks[0], system: "no-skill", runIndex: 1, success: false, score: 0.6 }),
    row({ taskId: tasks[0], system: "original", runIndex: 1, success: true, score: 1 }),
    row({ taskId: tasks[0], system: "no-skill", runIndex: 2, success: false, score: 0.8 }),
    row({ taskId: tasks[0], system: "original", runIndex: 2, success: false, score: 0.8 }),
    row({ taskId: tasks[1], system: "no-skill", runIndex: 1, success: false, score: 0.8 }),
    row({ taskId: tasks[1], system: "original", runIndex: 1, success: true, score: 1 }),
    row({ taskId: tasks[1], system: "no-skill", runIndex: 2, success: false, score: 0.6 }),
    row({ taskId: tasks[1], system: "original", runIndex: 2, success: false, score: 0.8 }),
  ]
}

describe("method-case calibration", () => {
  test("validates a skill-neutral lock bound to the zh-readme public benchmark", async () => {
    const lock = await readAndValidateMethodCaseCalibrationLock({ rootDir, lockPath })
    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-method-case-calibration-lock/v1",
      skillId: "zh-readme",
      outputs: ["README.zh-CN.md"],
      matrix: { expectedRows: 8, expectedPairs: 4, repetitions: 2 },
      claimBoundary: { createsBaseIr: false, permitsHeldOut: false, skillOptimizationEvidence: false },
    })
  })

  test("rejects hidden held-out scheduling and unsafe output roots", async () => {
    const lock = await readAndValidateMethodCaseCalibrationLock({ rootDir, lockPath })
    expect(() => MethodCaseCalibrationLockSchema.parse({
      ...lock,
      matrix: { ...lock.matrix, taskSplit: "heldout" },
    })).toThrow()
    expect(() => MethodCaseCalibrationLockSchema.parse({
      ...lock,
      harness: { ...lock.harness, execution: { ...lock.harness.execution, outputRoot: "../escape" } },
    })).toThrow()
  })

  test("requires a positive, successful, non-regressing original arm", async () => {
    const lock = await readAndValidateMethodCaseCalibrationLock({ rootDir, lockPath })
    const report = evaluateMethodCaseCalibrationGate(admissibleRows(), lock)
    expect(report).toMatchObject({
      schemaVersion: "skill-ir-method-case-calibration-gate/v1",
      passed: true,
      counts: { positivePairs: 3, originalSuccesses: 2 },
      gates: { positivePair: true, originalHasSuccess: true, originalMeanNonRegression: true },
      interpretation: { baseIrAuditAllowed: true, heldOutAllowed: false },
    })

    const regressing = admissibleRows().map((entry) => entry.system === "original"
      ? { ...entry, evaluatorScore: 0.1, success: false }
      : entry)
    expect(evaluateMethodCaseCalibrationGate(regressing, lock)).toMatchObject({
      passed: false,
      gates: { originalHasSuccess: false, originalMeanNonRegression: false },
    })
  })
})
