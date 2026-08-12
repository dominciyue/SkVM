import { describe, expect, test } from "bun:test"
import type { ExecutionEnvelope } from "./execution-resilience.ts"
import {
  buildPublicContractCalibrationV3GateReport,
  buildPublicContractCalibrationV3Plan,
  executePublicContractCalibrationV3Candidates,
} from "./public-contract-calibration-v3-run.ts"
import type { PublicContractCalibrationLockV3 } from "./public-contract-calibration.ts"
import type { ScoredAgentRunRow } from "./scoring.ts"

const systems = ["no-skill", "original"] as const

function envelope(taskId: string, block: number, system: string, transient = false): ExecutionEnvelope {
  return {
    schemaVersion: "skill-ir-execution-envelope/v1",
    experimentId: "env-manager-source-contract-baseline-v1",
    taskId, system, candidateBlock: block, attemptId: `${taskId}:block-${block}:${system}`,
    process: { started: true, exitCode: 0, termination: "natural", durationMs: 10 },
    activity: {
      requestDispatched: true, providerResponses: transient ? 0 : 1, assistantMessages: transient ? 0 : 1,
      toolCalls: 0, toolResults: 0,
    },
    terminal: { present: true, stopReason: "stop" },
    usage: { available: true, input: transient ? 0 : 10, output: transient ? 0 : 2, cacheRead: 0, cacheWrite: 0 },
    parser: { outcome: transient ? "empty" : "ok", unknownTypes: [] },
    outputs: { fileCount: transient ? 0 : 3 },
    classification: transient ? "empty-terminal" : "semantic-complete",
    replacementEligible: transient,
  }
}

function lock(): PublicContractCalibrationLockV3 {
  return {
    schemaVersion: "skill-ir-public-contract-calibration-lock/v3", status: "preregistered",
    calibrationId: "env-manager-source-contract-baseline-v1", methodEvidence: false, corpus: "pilot",
    skillId: "env-manager-v2",
    frozenInputs: {
      source: { path: "source", sha256: "0".repeat(64) }, tasks: { path: "tasks", sha256: "1".repeat(64) },
      publicContract: { path: "contract", sha256: "2".repeat(64) },
      publicContractSourceAudit: { path: "audit", sha256: "3".repeat(64) },
      scorer: { path: "scorer", sha256: "4".repeat(64) }, scorerDependencies: [{ path: "dep", sha256: "5".repeat(64) }],
      implementation: [{ path: "impl", sha256: "6".repeat(64) }], taskSplitFreeze: { path: "freeze", sha256: "7".repeat(64) },
      contractAuditManifest: { path: "manifest", sha256: "8".repeat(64) }, contractAuditReport: { path: "report", sha256: "9".repeat(64) },
    },
    model: { route: "xty/gpt-5.6-sol", family: "gpt" }, adapter: { id: "pi", version: "0.67.68" },
    matrix: { systems: [...systems], contexts: ["clean"], agents: ["skvm"], environments: ["windows"], taskSplit: "development",
      taskIds: ["task-a", "task-b"], targetBlocksPerTask: 2, reserveBlocksPerTask: 1,
      expectedSelectedRows: 8, expectedSelectedPairs: 4, maximumAttemptRows: 12, maximumCandidatePairs: 6 },
    qualification: { system: "original", taskId: "task-a", candidateBlock: 1 },
    runtime: { apiKeyEnv: "SKVM_XTY_API_KEY", retries: 0, adapterConfig: "managed", absoluteTimeoutMs: 600000,
      idleTimeoutMs: 120000, maxSteps: 30, outerWatchdogMs: 660000, maximumWorkDirLength: 220 },
    gate: { requireNoSkillNonSaturation: true, minimumDifferingPairs: 1, minimumPositivePairs: 1,
      minimumOriginalSuccesses: 1, requireOriginalNonRegression: true, maximumActiveExecutionFailures: 0,
      maximumParserOrRuntimeBlockers: 0 },
    claimBoundary: { developmentOnly: true, capabilityCalibration: true, createsBaseIr: false, permitsHeldOut: false,
      skillOptimizationEvidence: false, tokenEvidence: false },
    prohibited: ["held-out execution"],
  }
}

function scored(task: string, block: number, system: "no-skill" | "original", score: number): ScoredAgentRunRow {
  return {
    caseId: `env-manager-v2:skvm:windows:clean:${task}`, skill: "env-manager-v2", agent: "skvm",
    environment: "windows", context: "clean", task, system, model: "xty/gpt-5.6-sol", modelFamily: "gpt",
    adapter: "pi", adapterVersion: "0.67.68", panelConfigId: "env-manager-source-contract-baseline-v1",
    runIndex: block, taskSplit: "development", success: score >= 0.85, ruleViolations: 0, stepCoverage: score,
    latencyMs: 10, inputTokens: 10, outputTokens: 2, tokenCost: 12, runStatus: "ok",
    successSource: "deterministic-evaluator", failedCriteria: score >= 0.85 ? [] : ["criterion"], evaluatorScore: score,
  }
}

describe("public-contract resilient calibration v3", () => {
  test("builds the Env successor plan with progress-aware sidecars and reserve pairs", async () => {
    const frozen = lock()
    frozen.skillId = "env-manager-v2"
    frozen.matrix.taskIds = [
      "env-manager-source-contract-node-dev-001",
      "env-manager-source-contract-vite-dev-002",
    ]
    const plan = await buildPublicContractCalibrationV3Plan({
      rootDir: process.cwd(), outDir: "results/skill-ir/emv2-base-v1/run", lock: frozen,
    })
    expect(plan.plan).toHaveLength(12)
    expect(plan.plan.every((row) => row.command.includes("--timeout-ms=600000")
      && row.command.includes("--idle-timeout-ms=120000")
      && row.command.includes("--max-steps=30")
      && row.command.some((arg) => arg.startsWith("--execution-observation=")))).toBe(true)
  })

  test("replaces a whole transient pair before scoring and keeps every attempt", async () => {
    const rows = ["task-a", "task-b"].flatMap((taskId) => [1, 2, 3].flatMap((runIndex) => systems.map((system) => ({
      caseId: `env-manager-v2:skvm:windows:clean:${taskId}`, taskId, runIndex, system,
    }))))
    const calls: string[] = []
    const result = await executePublicContractCalibrationV3Candidates({
      plan: rows as any, lock: lock(),
      executeRow: async (row: any) => {
        calls.push(`${row.taskId}:${row.runIndex}:${row.system}`)
        const evidence = envelope(row.taskId, row.runIndex, row.system, row.taskId === "task-a" && row.runIndex === 1 && row.system === "original")
        return { raw: { attemptId: evidence.attemptId }, envelope: evidence }
      },
    })
    expect(result.selection.selectedBlocks).toEqual([
      { taskId: "task-a", candidateBlock: 2 }, { taskId: "task-a", candidateBlock: 3 },
      { taskId: "task-b", candidateBlock: 1 }, { taskId: "task-b", candidateBlock: 2 },
    ])
    expect(result.rawRows).toHaveLength(10)
    expect(result.envelopes).toHaveLength(10)
    expect(calls).toHaveLength(10)
  })

  test("passes only with complete selected pairs, a positive difference, and no original regression", () => {
    const frozen = lock()
    const envelopes = ["task-a", "task-b"].flatMap((task) => [1, 2].flatMap((block) => systems.map((system) => envelope(task, block, system))))
    const scores = [
      scored("task-a", 1, "no-skill", 0.4), scored("task-a", 1, "original", 1),
      scored("task-a", 2, "no-skill", 0.8), scored("task-a", 2, "original", 0.8),
      scored("task-b", 1, "no-skill", 0.6), scored("task-b", 1, "original", 1),
      scored("task-b", 2, "no-skill", 0.8), scored("task-b", 2, "original", 0.8),
    ]
    expect(buildPublicContractCalibrationV3GateReport({ lock: frozen, envelopes, scoredRows: scores })).toMatchObject({
      schemaVersion: "skill-ir-public-contract-calibration-gate-report/v3", passed: true,
      selection: { selectedPairs: 4, selectedRows: 8, attemptedRows: 8 },
      selected: { differingPairs: 2, positivePairs: 2, originalSuccesses: 2 },
      allAttempts: { transientFailures: 0, activeExecutionFailures: 0, parserOrRuntimeBlockers: 0 },
      interpretation: { baseIrAuditAllowed: true, heldOutAllowed: false, entersMainClaim: false },
    })
  })
})
