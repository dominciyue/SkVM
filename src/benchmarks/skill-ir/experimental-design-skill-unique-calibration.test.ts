import { describe, expect, test } from "bun:test"
import path from "node:path"
import type { ScoredAgentRunRow } from "./scoring.ts"
import {
  ExperimentalDesignSkillUniqueCalibrationLockSchema,
  evaluateExperimentalDesignSkillUniqueCalibrationGate,
  readAndValidateExperimentalDesignSkillUniqueCalibrationLock,
} from "./experimental-design-skill-unique-calibration.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2/skill-unique/pi-direct-cli-calibration-lock.json",
)

function row(input: {
  taskId: string
  system: "no-skill" | "original"
  runIndex: 1 | 2
  success?: boolean
  score?: number
}): ScoredAgentRunRow {
  const success = input.success ?? true
  const score = input.score ?? (success ? 1 : 0.7)
  return {
    caseId: `experimental-design-v2-skill-unique:skvm:windows:clean:${input.taskId}`,
    skill: "experimental-design-v2-skill-unique",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: input.taskId,
    system: input.system,
    model: "xty/gpt-5.6-sol",
    modelFamily: "gpt",
    adapter: "pi",
    adapterVersion: "0.67.68",
    panelConfigId: "experimental-design-skill-unique-pi-direct-cli-development-v1",
    runIndex: input.runIndex,
    taskSplit: "development",
    success,
    ruleViolations: success ? 0 : 1,
    stepCoverage: score,
    latencyMs: 100,
    inputTokens: 1000,
    outputTokens: 200,
    tokenCost: 1200,
    runStatus: "ok",
    successSource: "deterministic-evaluator",
    failedCriteria: success ? [] : ["skill-unique-analysis-alignment"],
    evaluatorScore: score,
    evaluationSummary: [{
      method: "custom",
      id: "skill-unique-analysis-alignment",
      pass: success,
      score: success ? 1 : 0,
      details: "PRIVATE details must not survive the compact gate",
    }],
  }
}

function rowsWithSkillDifference(): ScoredAgentRunRow[] {
  const tasks = [
    "experimental-design-skill-unique-cage-cell-dev-001",
    "experimental-design-skill-unique-repeated-visit-dev-002",
  ]
  const rows: ScoredAgentRunRow[] = []
  for (const taskId of tasks) {
    for (const runIndex of [1, 2] as const) {
      rows.push(row({ taskId, system: "no-skill", runIndex }))
      rows.push(row({ taskId, system: "original", runIndex }))
    }
  }
  rows[0] = row({
    taskId: tasks[0]!,
    system: "no-skill",
    runIndex: 1,
    success: false,
    score: 0.7,
  })
  return rows
}

describe("experimental-design skill-unique calibration lock and gate", () => {
  test("validates the committed lock and every frozen local guard", async () => {
    const lock = await readAndValidateExperimentalDesignSkillUniqueCalibrationLock({ rootDir, lockPath })
    expect(lock.matrix).toMatchObject({ expectedRows: 8, expectedPairs: 4, repetitions: 2 })
    expect(lock.gate.requireEachTaskOriginalSuccess).toBe(true)
    expect(lock.harness.execution).toMatchObject({
      kind: "bun-source-skvm-direct-pi-package",
      bunVersion: "1.3.14",
      piResolution: "installed-package-node",
      nodeVersion: "v23.8.0",
      probe: { path: "results/skill-ir/pi-package-execution-probe-2026-07-31.json" },
      piCli: { path: "node_modules/@mariozechner/pi-coding-agent/dist/cli.js" },
    })
    expect(lock.frozenInputs.contract.path).toBe(
      "src/benchmarks/skill-ir/experimental-design-skill-unique-contract.ts",
    )
    expect(lock.frozenInputs.audit.path).toBe(
      "src/benchmarks/skill-ir/experimental-design-skill-unique-audit.ts",
    )
    expect(lock.claimBoundary).toMatchObject({
      createsBaseIr: false,
      permitsHeldOut: false,
      skillOptimizationEvidence: false,
    })
  })

  test("rejects route, retry, or numeric gate drift", async () => {
    const lock = await readAndValidateExperimentalDesignSkillUniqueCalibrationLock({ rootDir, lockPath })
    expect(() => ExperimentalDesignSkillUniqueCalibrationLockSchema.parse({
      ...lock,
      model: { route: "xty/gpt-4.1", family: "gpt" },
    })).toThrow()
    expect(() => ExperimentalDesignSkillUniqueCalibrationLockSchema.parse({
      ...lock,
      runtime: { ...lock.runtime, retries: 1 },
    })).toThrow()
    expect(() => ExperimentalDesignSkillUniqueCalibrationLockSchema.parse({
      ...lock,
      gate: { ...lock.gate, minimumDifferingPairs: 0 },
    })).toThrow()
  })

  test("passes only when the generic distinguishability gate and every-task original success pass", async () => {
    const lock = await readAndValidateExperimentalDesignSkillUniqueCalibrationLock({ rootDir, lockPath })
    const report = evaluateExperimentalDesignSkillUniqueCalibrationGate(rowsWithSkillDifference(), lock)
    expect(report).toMatchObject({
      schemaVersion: "skill-ir-experimental-design-skill-unique-calibration-gate/v1",
      calibrationId: lock.calibrationId,
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
    expect(JSON.stringify(report)).not.toContain("PRIVATE")
    expect(JSON.stringify(report)).not.toContain("details")
  })

  test("fails when one development task has no successful original row", async () => {
    const lock = await readAndValidateExperimentalDesignSkillUniqueCalibrationLock({ rootDir, lockPath })
    const rows = rowsWithSkillDifference().map((item) =>
      item.system === "original"
        && item.task === "experimental-design-skill-unique-repeated-visit-dev-002"
        ? { ...item, success: false, evaluatorScore: 0.7, failedCriteria: ["skill-unique-analysis-alignment"] }
        : item
    )
    const report = evaluateExperimentalDesignSkillUniqueCalibrationGate(rows, lock)
    expect(report.passed).toBe(false)
    expect(report.gates.eachTaskOriginalSuccess).toBe(false)
    expect(report.taskOriginalSuccess).toEqual({
      "experimental-design-skill-unique-cage-cell-dev-001": true,
      "experimental-design-skill-unique-repeated-visit-dev-002": false,
    })
    expect(report.interpretation.baseIrAuditAllowed).toBe(false)
  })
})
