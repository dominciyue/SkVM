import type { PreIrCalibrationLock } from "./pre-ir-calibration.ts"
import { parseCaseId, type ScoredAgentRunRow } from "./scoring.ts"

type CalibrationSystem = "no-skill" | "original"

export type PreIrCalibrationPair = {
  taskId: string
  runIndex: number
  noSkill: { success: boolean; score: number }
  original: { success: boolean; score: number }
  scoreDelta: number
  criterionTransitions: { improved: string[]; regressed: string[] }
  comparable: boolean
  differs: boolean
}

export type PreIrCalibrationGateReport = {
  schemaVersion: "skill-ir-pre-ir-calibration-gate-report/v1"
  calibrationId: string
  methodEvidence: false
  passed: boolean
  counts: {
    expectedRows: number
    observedRows: number
    expectedPairs: number
    completePairs: number
    infrastructureFailures: number
    noSkillSemanticFailures: number
    comparablePairs: number
    differingPairs: number
  }
  systems: Record<CalibrationSystem, {
    rows: number
    successes: number
    meanScore: number
    inputTokens: number
    outputTokens: number
    aggregateTokens: number
  }>
  pairs: PreIrCalibrationPair[]
  gates: {
    completeRows: boolean
    completePairs: boolean
    zeroInfrastructure: boolean
    noSkillNonSaturated: boolean
    distinguishable: boolean
  }
  interpretation: {
    baseIrAuditAllowed: boolean
    heldOutAllowed: false
    entersMainClaim: false
    originalDirection: "better" | "mixed" | "equal" | "worse" | "inconclusive"
  }
}

function rowScore(row: ScoredAgentRunRow): number {
  return row.evaluatorScore ?? (row.success ? 1 : 0)
}

function isInfrastructure(row: ScoredAgentRunRow): boolean {
  return row.failureType === "infrastructure" || (row.runStatus !== undefined && row.runStatus !== "ok")
}

function criterionPasses(row: ScoredAgentRunRow): Map<string, boolean> {
  const result = new Map<string, boolean>()
  for (const [index, criterion] of (row.evaluationSummary ?? []).entries()) {
    const id = criterion.id?.trim() || criterion.name?.trim() || `${criterion.method}#${index + 1}`
    result.set(id, criterion.pass)
  }
  return result
}

function outcomeVector(row: ScoredAgentRunRow): string {
  return JSON.stringify({
    success: row.success,
    score: rowScore(row),
    criteria: [...criterionPasses(row)].sort(([left], [right]) => left.localeCompare(right)),
  })
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) throw new Error(`Pre-IR calibration ${label} mismatch`)
}

function validateRow(row: ScoredAgentRunRow, lock: PreIrCalibrationLock): {
  taskId: string
  system: CalibrationSystem
  runIndex: number
} {
  const parsed = parseCaseId(row.caseId)
  assertEqual("skill", parsed.skill, lock.skillId)
  assertEqual("agent", parsed.agent, lock.matrix.agents[0])
  assertEqual("environment", parsed.environment, lock.matrix.environments[0])
  assertEqual("context", parsed.context, lock.matrix.contexts[0])
  assertEqual("parsed task", row.task, parsed.task)
  assertEqual("model", row.model, lock.model.route)
  assertEqual("model family", row.modelFamily, lock.model.family)
  assertEqual("adapter", row.adapter, lock.adapter.id)
  assertEqual("adapter version", row.adapterVersion, lock.adapter.version)
  assertEqual("panel", row.panelConfigId, lock.calibrationId)
  assertEqual("task split", row.taskSplit, lock.matrix.taskSplit)
  if (!lock.matrix.taskIds.includes(parsed.task)) {
    throw new Error(`Pre-IR calibration unexpected task ${parsed.task}`)
  }
  if (row.system !== "no-skill" && row.system !== "original") {
    throw new Error(`Pre-IR calibration unexpected system ${row.system}`)
  }
  const runIndex = row.runIndex
  if (!runIndex || runIndex < 1 || runIndex > lock.matrix.repetitions) {
    throw new Error("Pre-IR calibration run index mismatch")
  }
  return { taskId: parsed.task, system: row.system, runIndex }
}

function summarizeSystem(rows: ScoredAgentRunRow[]) {
  const scoreTotal = rows.reduce((sum, row) => sum + rowScore(row), 0)
  const inputTokens = rows.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0)
  const outputTokens = rows.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0)
  return {
    rows: rows.length,
    successes: rows.filter((row) => row.success).length,
    meanScore: rows.length > 0 ? scoreTotal / rows.length : 0,
    inputTokens,
    outputTokens,
    aggregateTokens: inputTokens + outputTokens,
  }
}

function direction(pairs: PreIrCalibrationPair[]): "better" | "mixed" | "equal" | "worse" | "inconclusive" {
  const comparable = pairs.filter((pair) => pair.comparable)
  if (comparable.length === 0) return "inconclusive"
  const positive = comparable.some((pair) => pair.scoreDelta > 0)
  const negative = comparable.some((pair) => pair.scoreDelta < 0)
  if (positive && negative) return "mixed"
  if (positive) return "better"
  if (negative) return "worse"
  return "equal"
}

export function evaluatePreIrCalibrationGate(
  rows: ScoredAgentRunRow[],
  lock: PreIrCalibrationLock,
): PreIrCalibrationGateReport {
  const indexed = new Map<string, ScoredAgentRunRow>()
  for (const row of rows) {
    const identity = validateRow(row, lock)
    const key = `${identity.taskId}:${identity.runIndex}:${identity.system}`
    if (indexed.has(key)) throw new Error(`Pre-IR calibration duplicate row identity: ${key}`)
    indexed.set(key, row)
  }

  const pairs: PreIrCalibrationPair[] = []
  for (const taskId of lock.matrix.taskIds) {
    for (let runIndex = 1; runIndex <= lock.matrix.repetitions; runIndex += 1) {
      const noSkill = indexed.get(`${taskId}:${runIndex}:no-skill`)
      const original = indexed.get(`${taskId}:${runIndex}:original`)
      if (!noSkill || !original) continue
      const noSkillCriteria = criterionPasses(noSkill)
      const originalCriteria = criterionPasses(original)
      const criterionIds = [...new Set([...noSkillCriteria.keys(), ...originalCriteria.keys()])].sort()
      const improved = criterionIds.filter((id) => noSkillCriteria.get(id) === false && originalCriteria.get(id) === true)
      const regressed = criterionIds.filter((id) => noSkillCriteria.get(id) === true && originalCriteria.get(id) === false)
      const comparable = !isInfrastructure(noSkill) && !isInfrastructure(original)
      pairs.push({
        taskId,
        runIndex,
        noSkill: { success: noSkill.success, score: rowScore(noSkill) },
        original: { success: original.success, score: rowScore(original) },
        scoreDelta: rowScore(original) - rowScore(noSkill),
        criterionTransitions: { improved, regressed },
        comparable,
        differs: comparable && outcomeVector(noSkill) !== outcomeVector(original),
      })
    }
  }

  const noSkillRows = rows.filter((row) => row.system === "no-skill")
  const originalRows = rows.filter((row) => row.system === "original")
  const infrastructureFailures = rows.filter(isInfrastructure).length
  const noSkillSemanticFailures = noSkillRows.filter((row) => !row.success && !isInfrastructure(row)).length
  const comparablePairs = pairs.filter((pair) => pair.comparable).length
  const differingPairs = pairs.filter((pair) => pair.differs).length
  const gates = {
    completeRows: rows.length === lock.matrix.expectedRows,
    completePairs: pairs.length === lock.matrix.expectedPairs,
    zeroInfrastructure: infrastructureFailures <= lock.gate.maximumInfrastructureFailures,
    noSkillNonSaturated: !lock.gate.requireNoSkillNonSaturation || noSkillSemanticFailures > 0,
    distinguishable: differingPairs >= lock.gate.minimumDifferingPairs,
  }
  const passed = Object.values(gates).every(Boolean)
  return {
    schemaVersion: "skill-ir-pre-ir-calibration-gate-report/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    passed,
    counts: {
      expectedRows: lock.matrix.expectedRows,
      observedRows: rows.length,
      expectedPairs: lock.matrix.expectedPairs,
      completePairs: pairs.length,
      infrastructureFailures,
      noSkillSemanticFailures,
      comparablePairs,
      differingPairs,
    },
    systems: {
      "no-skill": summarizeSystem(noSkillRows),
      original: summarizeSystem(originalRows),
    },
    pairs,
    gates,
    interpretation: {
      baseIrAuditAllowed: passed,
      heldOutAllowed: false,
      entersMainClaim: false,
      originalDirection: direction(pairs),
    },
  }
}
