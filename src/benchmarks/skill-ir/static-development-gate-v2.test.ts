import { describe, expect, test } from "bun:test";
import type { ScoredAgentRunRow } from "./scoring";
import type { ExecutionEnvelope } from "./execution-resilience";
import { buildStaticDevelopmentV2GateReport } from "./static-development-gate-v2";
import { StaticDevelopmentV2LockSchema } from "./static-development-v2";

const systems = ["no-skill", "original", "ir-static"] as const;

const lock = StaticDevelopmentV2LockSchema.parse({
  schemaVersion: "skill-ir-static-development-lock/v2",
  status: "preregistered",
  experimentId: "future-static-v2",
  evaluationMode: "improvement",
  methodEvidence: true,
  corpus: "pilot",
  skillId: "future-skill",
  frozenInputs: Object.fromEntries([
    "source", "tasks", "resourceContract", "scorer", "baseIr", "sourceAudit",
  ].map((key) => [key, { path: `${key}.json`, sha256: "a".repeat(64) }])),
  implementation: [{ path: "implementation.ts", sha256: "a".repeat(64) }],
  model: { route: "xty/gpt-5.6-sol", family: "gpt" },
  adapter: { id: "pi", version: "0.67.68" },
  matrix: {
    systems, contexts: ["clean"], agents: ["skvm"], environments: ["windows"],
    taskSplit: "development", taskIds: ["task-a"], targetBlocksPerTask: 2, reserveBlocksPerTask: 1,
    expectedSelectedRows: 6, expectedSelectedTriplets: 2, maximumAttemptRows: 9, maximumCandidateTriplets: 3,
  },
  runtime: {
    apiKeyEnv: "SKVM_XTY_API_KEY", pythonEnv: "SKVM_PYTHON", retries: 0,
    routeProbeTimeoutMs: 180000, resourceProbeRequired: true, routeProbeRequired: true,
    absoluteTimeoutMs: 600000, idleTimeoutMs: 120000, maxSteps: 30, outerWatchdogMs: 660000,
    adapterConfig: "managed", maximumWorkDirLength: 220, outputRoot: "results/skill-ir/future-static-v2",
  },
  gate: {
    minimumIrStaticSuccesses: 1, minimumIrStaticMeanScore: 0.5, maximumActiveExecutionFailures: 0,
    maximumHardGateRegressions: 0, minimumImprovedPairs: 1, maximumRegressedPairs: 0,
  },
  promotionBoundary: {
    corpusStatusAtRun: "runnable", entersMainClaim: false, permitsHeldOut: false,
    permitsDynamicRepair: false, permitsArtifactPromotion: false, permitsScorerRetuning: false,
    permitsResidualAudit: true,
  },
  prohibited: ["held-out execution"],
});

function envelope(block: number, system: typeof systems[number], replacement = false): ExecutionEnvelope {
  return {
    schemaVersion: "skill-ir-execution-envelope/v1",
    experimentId: lock.experimentId,
    taskId: "task-a",
    system,
    candidateBlock: block,
    attemptId: `task-a:block-${block}:${system}`,
    process: { started: true, exitCode: 0, termination: "natural", durationMs: 1000 * block },
    activity: {
      requestDispatched: true,
      providerResponses: replacement ? 0 : 1,
      assistantMessages: replacement ? 0 : 1,
      toolCalls: 0,
      toolResults: 0,
      ...(replacement ? {} : { firstActivityMs: 10, lastActivityMs: 900 }),
    },
    terminal: { present: true, stopReason: "stop" },
    usage: {
      available: true,
      input: replacement ? 0 : 100 * block,
      output: replacement ? 0 : 20 * block,
      cacheRead: 0,
      cacheWrite: 0,
    },
    parser: { outcome: replacement ? "empty" : "ok", unknownTypes: [] },
    outputs: { fileCount: replacement ? 0 : 1 },
    classification: replacement ? "empty-terminal" : "semantic-complete",
    replacementEligible: replacement,
  };
}

function scored(block: number, system: typeof systems[number]): ScoredAgentRunRow {
  const score = system === "no-skill" ? 0.2 : system === "original" ? 0.5 : 1;
  return {
    caseId: `future-skill:skvm:windows:clean:task-a`, system,
    model: lock.model.route, modelFamily: lock.model.family, adapter: "pi", adapterVersion: "0.67.68",
    runIndex: block, panelConfigId: lock.experimentId,
    skill: lock.skillId, agent: "skvm", environment: "windows", context: "clean", task: "task-a",
    taskSplit: "development", success: system === "ir-static", ruleViolations: 0, stepCoverage: 1,
    latencyMs: 1000 * block, inputTokens: 100 * block, outputTokens: 20 * block, tokenCost: 120 * block,
    runStatus: "ok", successSource: "deterministic-evaluator",
    failedCriteria: system === "ir-static" ? [] : ["quality"], evaluatorScore: score,
    evaluationSummary: [{ method: "custom", id: "quality", pass: system === "ir-static", score, details: "PRIVATE" }],
  };
}

describe("static development v2 dual-denominator gate", () => {
  test("uses selected blocks for quality and all attempts for infrastructure/cost", () => {
    const envelopes = [
      ...systems.map((system) => envelope(1, system, system === "original")),
      ...systems.map((system) => envelope(2, system)),
      ...systems.map((system) => envelope(3, system)),
    ];
    const scoredRows = [
      ...systems.map((system) => scored(2, system)),
      ...systems.map((system) => scored(3, system)),
    ];
    const report = buildStaticDevelopmentV2GateReport({
      lock,
      tasks: [{ id: "task-a", split: "development", hardGateIds: [] }],
      envelopes,
      scoredRows,
    });
    expect(report).toMatchObject({
      schemaVersion: "skill-ir-static-development-gate-report/v2",
      passed: true,
      selection: {
        selectedTriplets: 2,
        replacedTriplets: 1,
        selectedRows: 6,
        attemptedRows: 9,
      },
      selected: {
        systems: { "ir-static": { successes: 2, meanScore: 1 } },
        improvedPairs: 2,
        regressedPairs: 0,
        activeExecutionFailures: 0,
      },
      allAttempts: {
        transientFailures: 1,
        attemptedTokens: 2040,
        attemptedDurationMs: 18000,
      },
      interpretation: { infrastructureSensitive: true, residualAuditAllowed: true },
    });
    expect(JSON.stringify(report)).not.toContain("PRIVATE");
  });

  test("keeps active timeout in the selected denominator and fails its gate", () => {
    const envelopes = [
      ...systems.map((system) => envelope(1, system)),
      ...systems.map((system) => system === "ir-static"
        ? {
            ...envelope(2, system),
            process: { started: true, exitCode: 143, termination: "absolute-timeout" as const, durationMs: 600000 },
            terminal: { present: false },
            classification: "active-absolute-timeout" as const,
          }
        : envelope(2, system)),
    ];
    const scoredRows = [
      ...systems.map((system) => scored(1, system)),
      ...systems.filter((system) => system !== "ir-static").map((system) => scored(2, system)),
    ];
    const report = buildStaticDevelopmentV2GateReport({
      lock,
      tasks: [{ id: "task-a", split: "development", hardGateIds: [] }],
      envelopes,
      scoredRows,
    });
    expect(report.selection).toMatchObject({ selectedTriplets: 2, replacedTriplets: 0 });
    expect(report.selected.activeExecutionFailures).toBe(1);
    expect(report.gates.maximumActiveExecutionFailures).toBe(false);
    expect(report.passed).toBe(false);
  });

  test("fails closed when a selected semantic completion has no deterministic score", () => {
    const envelopes = [
      ...systems.map((system) => envelope(1, system)),
      ...systems.map((system) => envelope(2, system)),
    ];
    const scoredRows = [
      ...systems.map((system) => scored(1, system)),
      ...systems.filter((system) => system !== "ir-static").map((system) => scored(2, system)),
    ];
    const report = buildStaticDevelopmentV2GateReport({
      lock,
      tasks: [{ id: "task-a", split: "development", hardGateIds: [] }],
      envelopes,
      scoredRows,
    });
    expect(report.gates.selectedScoringComplete).toBe(false);
    expect(report.passed).toBe(false);
  });
});
