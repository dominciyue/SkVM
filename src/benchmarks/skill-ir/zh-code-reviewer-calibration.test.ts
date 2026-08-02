import { describe, expect, test } from "bun:test"
import path from "node:path"
import type { ScoredAgentRunRow } from "./scoring.ts"
import {
  evaluateZhCodeReviewerCalibrationGate,
  readAndValidateZhCodeReviewerCalibrationLock,
  ZhCodeReviewerCalibrationLockSchema,
} from "./zh-code-reviewer-calibration.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/zh-code-reviewer/pi-direct-cli-short-path-calibration-lock.json",
)
const tasks = [
  "zh-code-reviewer-user-service-dev-001",
  "zh-code-reviewer-report-service-dev-002",
] as const

function row(input: {
  taskId: string
  system: "no-skill" | "original"
  runIndex: 1 | 2
  success: boolean
  score: number
  failedCriteria?: string[]
}): ScoredAgentRunRow {
  return {
    caseId: `zh-code-reviewer:skvm:windows:clean:${input.taskId}`,
    skill: "zh-code-reviewer",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: input.taskId,
    system: input.system,
    model: "xty/gpt-5.6-sol",
    modelFamily: "gpt",
    adapter: "pi",
    adapterVersion: "0.67.68",
    panelConfigId: "zh-code-reviewer-pi-direct-cli-short-path-development-v1",
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
    failedCriteria: input.failedCriteria ?? (input.success ? [] : ["review-evidence-coverage"]),
    evaluatorScore: input.score,
  }
}

function admissibleRows(): ScoredAgentRunRow[] {
  return [
    row({ taskId: tasks[0], system: "no-skill", runIndex: 1, success: false, score: 0.4 }),
    row({ taskId: tasks[0], system: "original", runIndex: 1, success: true, score: 1 }),
    row({ taskId: tasks[0], system: "no-skill", runIndex: 2, success: false, score: 0.6 }),
    row({ taskId: tasks[0], system: "original", runIndex: 2, success: false, score: 0.8 }),
    row({ taskId: tasks[1], system: "no-skill", runIndex: 1, success: false, score: 0.8 }),
    row({ taskId: tasks[1], system: "original", runIndex: 1, success: false, score: 0.7 }),
    row({ taskId: tasks[1], system: "no-skill", runIndex: 2, success: false, score: 0.5 }),
    row({ taskId: tasks[1], system: "original", runIndex: 2, success: false, score: 0.7 }),
  ]
}

describe("zh-code-reviewer calibration lock and gate", () => {
  test("validates the frozen reviewer benchmark and direct Pi identity", async () => {
    const lock = await readAndValidateZhCodeReviewerCalibrationLock({ rootDir, lockPath })
    expect(lock.matrix).toMatchObject({ expectedRows: 8, expectedPairs: 4, repetitions: 2 })
    expect(lock.harness.execution).toMatchObject({
      kind: "bun-source-skvm-direct-pi-package-short-path",
      outputRoot: "results/skill-ir/zcr-pi-v1",
      maximumWorkDirLength: 220,
    })
    expect(lock.claimBoundary).toMatchObject({
      createsBaseIr: false,
      permitsHeldOut: false,
      skillOptimizationEvidence: false,
    })
  })

  test("rejects model, retry, gate, and output-root drift", async () => {
    const lock = await readAndValidateZhCodeReviewerCalibrationLock({ rootDir, lockPath })
    expect(() => ZhCodeReviewerCalibrationLockSchema.parse({
      ...lock,
      model: { route: "xty/gpt-4.1", family: "gpt" },
    })).toThrow()
    expect(() => ZhCodeReviewerCalibrationLockSchema.parse({
      ...lock,
      runtime: { ...lock.runtime, retries: 1 },
    })).toThrow()
    expect(() => ZhCodeReviewerCalibrationLockSchema.parse({
      ...lock,
      gate: { ...lock.gate, minimumPositivePairs: 0 },
    })).toThrow()
    expect(() => ZhCodeReviewerCalibrationLockSchema.parse({
      ...lock,
      harness: { ...lock.harness, execution: { ...lock.harness.execution, outputRoot: "results/skill-ir/other" } },
    })).toThrow()
  })

  test("admits only a distinguishable, positive, non-regressing original arm", async () => {
    const lock = await readAndValidateZhCodeReviewerCalibrationLock({ rootDir, lockPath })
    const passed = evaluateZhCodeReviewerCalibrationGate(admissibleRows(), lock)
    expect(passed).toMatchObject({
      schemaVersion: "skill-ir-zh-code-reviewer-calibration-gate/v1",
      passed: true,
      counts: { positivePairs: 3, originalSuccesses: 1 },
      gates: {
        completeRows: true,
        completePairs: true,
        zeroInfrastructure: true,
        noSkillNonSaturated: true,
        distinguishable: true,
        positivePair: true,
        originalHasSuccess: true,
        originalMeanNonRegression: true,
      },
      interpretation: { baseIrAuditAllowed: true, heldOutAllowed: false },
    })

    const allOriginalFail = admissibleRows().map((entry) =>
      entry.system === "original" ? { ...entry, success: false } : entry)
    expect(evaluateZhCodeReviewerCalibrationGate(allOriginalFail, lock).gates.originalHasSuccess).toBe(false)

    const regressing = admissibleRows().map((entry) =>
      entry.system === "original" ? { ...entry, evaluatorScore: 0.1, success: false } : entry)
    const failed = evaluateZhCodeReviewerCalibrationGate(regressing, lock)
    expect(failed.passed).toBe(false)
    expect(failed.gates.originalMeanNonRegression).toBe(false)
  })
})
