import { describe, expect, test } from "bun:test"
import path from "node:path"
import type { ScoredAgentRunRow } from "./scoring.ts"
import { readAndValidatePreIrCalibrationLock } from "./pre-ir-calibration.ts"
import { evaluatePreIrCalibrationGate } from "./pre-ir-calibration-gate.ts"

const rootDir = path.resolve(import.meta.dir, "../../..")
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/law-to-markdown-pre-ir-calibration-lock.json",
)

function row(opts: {
  taskId: string
  system: "no-skill" | "original"
  runIndex: 1 | 2
  success?: boolean
  score?: number
  headingPass?: boolean
  failureType?: "infrastructure" | "agent"
}): ScoredAgentRunRow {
  const success = opts.success ?? true
  const score = opts.score ?? 1
  return {
    caseId: `law-to-markdown:skvm:windows:clean:${opts.taskId}`,
    skill: "law-to-markdown",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: opts.taskId,
    system: opts.system,
    model: "xty/gpt-5.6-sol",
    modelFamily: "gpt",
    adapter: "bare-agent",
    adapterVersion: "workspace-law-pre-ir-v1",
    panelConfigId: "law-to-markdown-pre-ir-calibration-v1",
    runIndex: opts.runIndex,
    taskSplit: "development",
    success,
    ruleViolations: success ? 0 : 1,
    stepCoverage: 1,
    latencyMs: 100,
    inputTokens: 1000,
    outputTokens: 200,
    tokenCost: 1200,
    runStatus: opts.failureType === "infrastructure" ? "adapter-crashed" : "ok",
    successSource: "deterministic-evaluator",
    failedCriteria: success ? [] : ["law-heading-structure"],
    ...(opts.failureType ? { failureType: opts.failureType } : {}),
    evaluatorScore: score,
    evaluationSummary: [{
      method: "custom",
      id: "law-heading-structure",
      pass: opts.headingPass ?? success,
      score: opts.headingPass ?? success ? 1 : 0,
      details: "PRIVATE evaluator details must not survive",
    }],
  }
}

function passingRows(): ScoredAgentRunRow[] {
  const tasks = ["law-to-markdown-statute-dev-001", "law-to-markdown-standard-dev-002"]
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
    score: 0.8,
    headingPass: false,
  })
  return rows
}

describe("pre-IR calibration gate", () => {
  test("passes a complete non-saturated matrix with one paired outcome difference", async () => {
    const lock = await readAndValidatePreIrCalibrationLock({ rootDir, lockPath })
    const report = evaluatePreIrCalibrationGate(passingRows(), lock)

    expect(report).toMatchObject({
      schemaVersion: "skill-ir-pre-ir-calibration-gate-report/v1",
      calibrationId: "law-to-markdown-pre-ir-calibration-v1",
      methodEvidence: false,
      passed: true,
      counts: {
        expectedRows: 8,
        observedRows: 8,
        completePairs: 4,
        infrastructureFailures: 0,
        noSkillSemanticFailures: 1,
        differingPairs: 1,
      },
      gates: {
        completeRows: true,
        completePairs: true,
        zeroInfrastructure: true,
        noSkillNonSaturated: true,
        distinguishable: true,
      },
      interpretation: {
        baseIrAuditAllowed: true,
        heldOutAllowed: false,
        originalDirection: "better",
      },
    })
    expect(report.systems.original.meanScore).toBe(1)
    expect(report.systems["no-skill"].meanScore).toBeCloseTo(0.95)
    expect(report.pairs[0]?.criterionTransitions).toEqual({ improved: ["law-heading-structure"], regressed: [] })
    expect(JSON.stringify(report)).not.toContain("PRIVATE")
    expect(JSON.stringify(report)).not.toContain("details")
  })

  test("fails closed for saturation or identical arm outcomes", async () => {
    const lock = await readAndValidatePreIrCalibrationLock({ rootDir, lockPath })
    const saturated = passingRows().map((item) => ({
      ...item,
      success: true,
      evaluatorScore: 1,
      failedCriteria: [],
      evaluationSummary: item.evaluationSummary?.map((criterion) => ({ ...criterion, pass: true, score: 1 })),
    }))
    const saturatedReport = evaluatePreIrCalibrationGate(saturated, lock)
    expect(saturatedReport.passed).toBe(false)
    expect(saturatedReport.gates.noSkillNonSaturated).toBe(false)
    expect(saturatedReport.gates.distinguishable).toBe(false)

    const identicalLow = passingRows().map((item) => item.system === "original" && item.runIndex === 1
      && item.task === "law-to-markdown-statute-dev-001"
      ? row({
          taskId: item.task,
          system: "original",
          runIndex: 1,
          success: false,
          score: 0.8,
          headingPass: false,
        })
      : item)
    const identicalReport = evaluatePreIrCalibrationGate(identicalLow, lock)
    expect(identicalReport.gates.noSkillNonSaturated).toBe(true)
    expect(identicalReport.gates.distinguishable).toBe(false)
    expect(identicalReport.passed).toBe(false)
  })

  test("keeps missing rows, pairs, and infrastructure in the frozen denominator", async () => {
    const lock = await readAndValidatePreIrCalibrationLock({ rootDir, lockPath })
    const missing = evaluatePreIrCalibrationGate(passingRows().slice(0, 7), lock)
    expect(missing.passed).toBe(false)
    expect(missing.counts).toMatchObject({ expectedRows: 8, observedRows: 7, completePairs: 3 })

    const withInfrastructure = passingRows()
    withInfrastructure[0] = row({
      taskId: "law-to-markdown-statute-dev-001",
      system: "no-skill",
      runIndex: 1,
      success: false,
      score: 0,
      failureType: "infrastructure",
    })
    const infrastructure = evaluatePreIrCalibrationGate(withInfrastructure, lock)
    expect(infrastructure.passed).toBe(false)
    expect(infrastructure.counts.infrastructureFailures).toBe(1)
    expect(infrastructure.gates.zeroInfrastructure).toBe(false)
  })

  test("does not infer an original direction from infrastructure-contaminated pairs", async () => {
    const lock = await readAndValidatePreIrCalibrationLock({ rootDir, lockPath })
    const infrastructureRows = passingRows().map((item) => ({
      ...item,
      success: false,
      evaluatorScore: 0,
      runStatus: "adapter-crashed" as const,
      failureType: "infrastructure" as const,
    }))

    const report = evaluatePreIrCalibrationGate(infrastructureRows, lock)
    expect(report.counts.comparablePairs).toBe(0)
    expect(report.pairs.every((pair) => pair.comparable === false)).toBe(true)
    expect(report.interpretation.originalDirection).toBe("inconclusive")
  })

  test("rejects duplicate identities and frozen identity drift", async () => {
    const lock = await readAndValidatePreIrCalibrationLock({ rootDir, lockPath })
    const rows = passingRows()
    expect(() => evaluatePreIrCalibrationGate([...rows, rows[0]!], lock)).toThrow("duplicate")
    expect(() => evaluatePreIrCalibrationGate(
      rows.map((item, index) => index === 0 ? { ...item, model: "xty/other" } : item),
      lock,
    )).toThrow("model")
    expect(() => evaluatePreIrCalibrationGate(
      rows.map((item, index) => index === 0 ? { ...item, taskSplit: "held-out" } : item),
      lock,
    )).toThrow("task split")
  })
})
