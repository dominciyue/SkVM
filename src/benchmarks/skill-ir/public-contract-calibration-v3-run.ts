import path from "node:path"
import type { RealAgentRunPlanEntry } from "./real-agent.ts"
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run.ts"
import {
  ExecutionEnvelopeSchema,
  executeMatchedExecutionBlocks,
  selectMatchedExecutionBlocks,
  type ExecutionEnvelope,
  type ExecutionFailureClassification,
  type MatchedExecutionBlockSelection,
} from "./execution-resilience.ts"
import type { PublicContractCalibrationLockV3 } from "./public-contract-calibration.ts"
import type { ScoredAgentRunRow } from "./scoring.ts"

export type PublicContractCalibrationV3Plan = {
  schemaVersion: "skill-ir-public-contract-calibration-plan/v3"
  calibrationId: string
  methodEvidence: false
  lock: PublicContractCalibrationLockV3
  runArgs: RealAgentRunArgs
  plan: RealAgentRunPlanEntry[]
}

function taskIdOf(row: Pick<RealAgentRunPlanEntry, "caseId">): string {
  const taskId = row.caseId.split(":").at(-1)
  if (!taskId) throw new Error(`Public-contract calibration v3 cannot parse task id: ${row.caseId}`)
  return taskId
}

export async function buildPublicContractCalibrationV3Plan(input: {
  rootDir: string
  outDir: string
  lock: PublicContractCalibrationLockV3
}): Promise<PublicContractCalibrationV3Plan> {
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.resolve(rootDir, input.outDir)
  const lock = input.lock
  const runArgs: RealAgentRunArgs = {
    corpus: lock.corpus,
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.adapter.id,
    adapterVersion: lock.adapter.version,
    repetitions: lock.matrix.targetBlocksPerTask + lock.matrix.reserveBlocksPerTask,
    panelConfigId: lock.calibrationId,
    outDir,
    limit: lock.matrix.maximumAttemptRows,
    execute: false,
    retries: 0,
    retryDelayMs: 0,
    outerWatchdogMs: lock.runtime.outerWatchdogMs,
    rootDir,
    allowTasksAuthored: true,
    allowDevelopmentReplay: false,
    allowArtifactDevelopmentReplay: false,
    skills: new Set([lock.skillId]),
    systems: new Set(lock.matrix.systems),
    contexts: new Set(lock.matrix.contexts),
    agents: new Set(lock.matrix.agents),
    environments: new Set(lock.matrix.environments),
    tasks: new Set(lock.matrix.taskIds),
    requireEnv: new Set([lock.runtime.apiKeyEnv]),
  }
  const plan = (await buildPlan(runArgs)).map((row) => {
    const observationPath = path.join(path.dirname(row.workDir), "execution-observation.json")
    return {
      ...row,
      command: [
        process.execPath, "run", path.resolve(rootDir, "src/index.ts"), "run",
        ...row.command.slice(4).filter((arg) =>
          !arg.startsWith("--adapter-config=")
          && !arg.startsWith("--timeout-ms=")
          && !arg.startsWith("--idle-timeout-ms=")
          && !arg.startsWith("--max-steps=")
          && !arg.startsWith("--execution-observation=")),
        `--adapter-config=${lock.runtime.adapterConfig}`,
        `--timeout-ms=${lock.runtime.absoluteTimeoutMs}`,
        `--idle-timeout-ms=${lock.runtime.idleTimeoutMs}`,
        `--max-steps=${lock.runtime.maxSteps}`,
        `--execution-observation=${observationPath}`,
      ],
    }
  })
  if (plan.length !== lock.matrix.maximumAttemptRows) {
    throw new Error(`Public-contract calibration v3 plan row mismatch: ${plan.length}`)
  }
  if (plan.some((row) => row.workDir.length > lock.runtime.maximumWorkDirLength)) {
    throw new Error("Public-contract calibration v3 workdir exceeds frozen path budget")
  }
  return {
    schemaVersion: "skill-ir-public-contract-calibration-plan/v3",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    lock,
    runArgs,
    plan,
  }
}

export async function executePublicContractCalibrationV3Candidates<Raw>(input: {
  plan: RealAgentRunPlanEntry[]
  lock: PublicContractCalibrationLockV3
  executeRow: (row: RealAgentRunPlanEntry) => Promise<{ raw: Raw; envelope: ExecutionEnvelope }>
}): Promise<{ selection: MatchedExecutionBlockSelection; rawRows: Raw[]; envelopes: ExecutionEnvelope[] }> {
  const rawRows: Raw[] = []
  const selected = await executeMatchedExecutionBlocks({
    taskIds: input.lock.matrix.taskIds,
    systems: input.lock.matrix.systems,
    targetBlocksPerTask: input.lock.matrix.targetBlocksPerTask,
    reserveBlocksPerTask: input.lock.matrix.reserveBlocksPerTask,
    executeBlock: async (taskId, candidateBlock) => {
      const rows = input.plan.filter((row) => taskIdOf(row) === taskId && row.runIndex === candidateBlock)
      if (rows.length !== input.lock.matrix.systems.length) {
        throw new Error(`Public-contract calibration v3 plan pair is incomplete: ${taskId}/${candidateBlock}`)
      }
      const envelopes: ExecutionEnvelope[] = []
      for (const system of input.lock.matrix.systems) {
        const row = rows.find((candidate) => candidate.system === system)
        if (!row) throw new Error(`Public-contract calibration v3 arm is missing: ${taskId}/${candidateBlock}/${system}`)
        const executed = await input.executeRow(row)
        rawRows.push(executed.raw)
        envelopes.push(executed.envelope)
      }
      return envelopes
    },
  })
  const { envelopes, ...selection } = selected
  return { selection, rawRows, envelopes }
}

function rowKey(taskId: string, block: number, system: string): string {
  return `${taskId}\0${block}\0${system}`
}

function scoreOf(row: ScoredAgentRunRow): number {
  return row.evaluatorScore ?? (row.success ? 1 : 0)
}

function outcomeOf(row: ScoredAgentRunRow): string {
  return JSON.stringify({
    success: row.success,
    score: scoreOf(row),
    criteria: (row.evaluationSummary ?? []).map((criterion, index) => ({
      id: criterion.id?.trim() || criterion.name?.trim() || `${criterion.method}#${index + 1}`,
      pass: criterion.pass,
    })).sort((left, right) => left.id.localeCompare(right.id, "en")),
  })
}

function assertScoredIdentity(row: ScoredAgentRunRow, lock: PublicContractCalibrationLockV3): void {
  if (row.skill !== lock.skillId || row.model !== lock.model.route || row.modelFamily !== lock.model.family
    || row.adapter !== lock.adapter.id || row.adapterVersion !== lock.adapter.version
    || row.panelConfigId !== lock.calibrationId || row.agent !== lock.matrix.agents[0]
    || row.environment !== lock.matrix.environments[0] || row.context !== lock.matrix.contexts[0]
    || row.taskSplit !== lock.matrix.taskSplit || !lock.matrix.taskIds.includes(row.task)
    || !lock.matrix.systems.includes(row.system as "no-skill" | "original")
    || !Number.isInteger(row.runIndex)) {
    throw new Error("Public-contract calibration v3 scored identity mismatch")
  }
}

export type PublicContractCalibrationV3GateReport = {
  schemaVersion: "skill-ir-public-contract-calibration-gate-report/v3"
  calibrationId: string
  methodEvidence: false
  passed: boolean
  selection: {
    complete: boolean
    selectedPairs: number
    replacedPairs: number
    selectedRows: number
    attemptedRows: number
    abortReason?: string
    replaced: Array<{ taskId: string; candidateBlock: number; reasons: ExecutionFailureClassification[] }>
  }
  selected: {
    systems: Record<"no-skill" | "original", { rows: number; successes: number; meanScore: number; aggregateTokens: number }>
    comparablePairs: number
    differingPairs: number
    positivePairs: number
    regressedPairs: number
    originalSuccesses: number
  }
  allAttempts: {
    transientFailures: number
    activeExecutionFailures: number
    parserOrRuntimeBlockers: number
    attemptedTokens: number
    attemptedDurationMs: number
    perSystemTransientFailures: Record<"no-skill" | "original", number>
  }
  gates: {
    selectedDenominatorComplete: boolean
    selectedScoringComplete: boolean
    noSkillNonSaturated: boolean
    distinguishable: boolean
    positivePair: boolean
    originalHasSuccess: boolean
    originalMeanNonRegression: boolean
    maximumActiveExecutionFailures: boolean
    maximumParserOrRuntimeBlockers: boolean
  }
  interpretation: {
    infrastructureSensitive: boolean
    baseIrAuditAllowed: boolean
    heldOutAllowed: false
    entersMainClaim: false
  }
}

export function buildPublicContractCalibrationV3GateReport(input: {
  lock: PublicContractCalibrationLockV3
  envelopes: ExecutionEnvelope[]
  scoredRows: ScoredAgentRunRow[]
}): PublicContractCalibrationV3GateReport {
  const { lock } = input
  const envelopes = input.envelopes.map((value) => ExecutionEnvelopeSchema.parse(value))
  const seenEnvelopes = new Set<string>()
  for (const envelope of envelopes) {
    if (envelope.experimentId !== lock.calibrationId || !lock.matrix.taskIds.includes(envelope.taskId)
      || !lock.matrix.systems.includes(envelope.system as "no-skill" | "original")
      || envelope.candidateBlock > lock.matrix.targetBlocksPerTask + lock.matrix.reserveBlocksPerTask) {
      throw new Error("Public-contract calibration v3 envelope identity mismatch")
    }
    const key = rowKey(envelope.taskId, envelope.candidateBlock, envelope.system)
    if (seenEnvelopes.has(key)) throw new Error(`Public-contract calibration v3 duplicate envelope: ${key}`)
    seenEnvelopes.add(key)
  }
  const scored = new Map<string, ScoredAgentRunRow>()
  for (const row of input.scoredRows) {
    assertScoredIdentity(row, lock)
    const key = rowKey(row.task, row.runIndex!, row.system)
    if (scored.has(key)) throw new Error(`Public-contract calibration v3 duplicate scored row: ${key}`)
    scored.set(key, row)
  }
  const selection = selectMatchedExecutionBlocks({
    taskIds: lock.matrix.taskIds,
    systems: lock.matrix.systems,
    targetBlocksPerTask: lock.matrix.targetBlocksPerTask,
    reserveBlocksPerTask: lock.matrix.reserveBlocksPerTask,
    envelopes,
  })
  const selectedBlocks = new Set(selection.selectedBlocks.map((block) => `${block.taskId}\0${block.candidateBlock}`))
  const selectedEnvelopes = envelopes.filter((item) => selectedBlocks.has(`${item.taskId}\0${item.candidateBlock}`))
  const systemSummary = Object.fromEntries(lock.matrix.systems.map((system) => {
    const arm = selectedEnvelopes.filter((item) => item.system === system)
    const rows = arm.flatMap((item) => {
      const row = scored.get(rowKey(item.taskId, item.candidateBlock, system))
      return row ? [row] : []
    })
    const aggregateTokens = arm.reduce((sum, item) =>
      sum + item.usage.input + item.usage.output + item.usage.cacheRead + item.usage.cacheWrite, 0)
    return [system, {
      rows: rows.length,
      successes: rows.filter((row) => row.success).length,
      meanScore: rows.length > 0 ? Number((rows.reduce((sum, row) => sum + scoreOf(row), 0) / rows.length).toFixed(4)) : 0,
      aggregateTokens,
    }]
  })) as PublicContractCalibrationV3GateReport["selected"]["systems"]
  let comparablePairs = 0
  let differingPairs = 0
  let positivePairs = 0
  let regressedPairs = 0
  for (const block of selection.selectedBlocks) {
    const pairEnvelopes = lock.matrix.systems.map((system) =>
      selectedEnvelopes.find((item) => item.taskId === block.taskId && item.candidateBlock === block.candidateBlock && item.system === system))
    if (pairEnvelopes.some((item) => item?.classification !== "semantic-complete")) continue
    const noSkill = scored.get(rowKey(block.taskId, block.candidateBlock, "no-skill"))
    const original = scored.get(rowKey(block.taskId, block.candidateBlock, "original"))
    if (!noSkill || !original) continue
    comparablePairs += 1
    const delta = scoreOf(original) - scoreOf(noSkill)
    if (outcomeOf(noSkill) !== outcomeOf(original)) differingPairs += 1
    if (delta > 0) positivePairs += 1
    if (delta < 0) regressedPairs += 1
  }
  const active = new Set<ExecutionFailureClassification>(["active-idle-timeout", "active-absolute-timeout", "step-limit"])
  const blockers = new Set<ExecutionFailureClassification>(["qualification-failure", "parser-incompatible", "runtime-crash", "measurement-invalid"])
  const activeExecutionFailures = envelopes.filter((item) => active.has(item.classification)).length
  const parserOrRuntimeBlockers = envelopes.filter((item) => blockers.has(item.classification)).length
  const transientFailures = envelopes.filter((item) => item.replacementEligible).length
  const perSystemTransientFailures = Object.fromEntries(lock.matrix.systems.map((system) => [
    system, envelopes.filter((item) => item.system === system && item.replacementEligible).length,
  ])) as Record<"no-skill" | "original", number>
  const selectedScoringComplete = selectedEnvelopes.every((item) =>
    item.classification !== "semantic-complete" || scored.has(rowKey(item.taskId, item.candidateBlock, item.system)))
  const gates = {
    selectedDenominatorComplete: selection.complete && selection.selectedRows === lock.matrix.expectedSelectedRows,
    selectedScoringComplete,
    noSkillNonSaturated: !lock.gate.requireNoSkillNonSaturation || systemSummary["no-skill"].successes < systemSummary["no-skill"].rows,
    distinguishable: differingPairs >= lock.gate.minimumDifferingPairs,
    positivePair: positivePairs >= lock.gate.minimumPositivePairs,
    originalHasSuccess: systemSummary.original.successes >= lock.gate.minimumOriginalSuccesses,
    originalMeanNonRegression: !lock.gate.requireOriginalNonRegression || systemSummary.original.meanScore >= systemSummary["no-skill"].meanScore,
    maximumActiveExecutionFailures: activeExecutionFailures <= lock.gate.maximumActiveExecutionFailures,
    maximumParserOrRuntimeBlockers: parserOrRuntimeBlockers <= lock.gate.maximumParserOrRuntimeBlockers,
  }
  const passed = Object.values(gates).every(Boolean)
  return {
    schemaVersion: "skill-ir-public-contract-calibration-gate-report/v3",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    passed,
    selection: {
      complete: selection.complete,
      selectedPairs: selection.selectedBlocks.length,
      replacedPairs: selection.replacedBlocks.length,
      selectedRows: selection.selectedRows,
      attemptedRows: selection.attemptedRows,
      ...(selection.abortReason ? { abortReason: selection.abortReason } : {}),
      replaced: selection.replacedBlocks,
    },
    selected: {
      systems: systemSummary, comparablePairs, differingPairs, positivePairs, regressedPairs,
      originalSuccesses: systemSummary.original.successes,
    },
    allAttempts: {
      transientFailures, activeExecutionFailures, parserOrRuntimeBlockers,
      attemptedTokens: envelopes.reduce((sum, item) => sum + item.usage.input + item.usage.output + item.usage.cacheRead + item.usage.cacheWrite, 0),
      attemptedDurationMs: envelopes.reduce((sum, item) => sum + item.process.durationMs, 0),
      perSystemTransientFailures,
    },
    gates,
    interpretation: {
      infrastructureSensitive: selection.replacedBlocks.length > 0 || new Set(Object.values(perSystemTransientFailures)).size > 1,
      baseIrAuditAllowed: passed,
      heldOutAllowed: false,
      entersMainClaim: false,
    },
  }
}
