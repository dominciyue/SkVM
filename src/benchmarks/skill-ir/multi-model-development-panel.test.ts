import { describe, expect, test } from "bun:test";
import type { ExecutionEnvelope } from "./execution-resilience";
import type { ScoredAgentRunRow } from "./scoring";
import {
  MultiModelDevelopmentPanelLockSchema,
  buildMultiModelDevelopmentPanelReport,
  type MultiModelDevelopmentPanelLock,
} from "./multi-model-development-panel";

const families = ["gpt", "claude", "deepseek"] as const;
const systems = ["no-skill", "original", "ir-static"] as const;
const cases = [
  { skillId: "api-tester", taskIds: ["api-a", "api-b"] },
  { skillId: "env-manager-v3", taskIds: ["env-a", "env-b"] },
] as const;

const lock = {
  schemaVersion: "skill-ir-multi-model-development-panel-lock/v1",
  status: "preregistered",
  experimentId: "skill-ir-three-family-development-panel-v1",
  methodEvidence: true,
  models: [
    { route: "xty/gpt-5.6-sol", family: "gpt" },
    { route: "xty/claude-opus-4-8", family: "claude" },
    { route: "xty/deepseek-v4-pro", family: "deepseek" },
  ],
  cases: [
    { skillId: "api-tester", baseLock: { path: "api.json", sha256: "a".repeat(64) }, taskIds: ["api-a", "api-b"] },
    { skillId: "env-manager-v3", baseLock: { path: "env.json", sha256: "b".repeat(64) }, taskIds: ["env-a", "env-b"] },
  ],
  harness: { adapter: "pi", adapterVersion: "0.67.68", environment: "windows", context: "clean" },
  matrix: {
    modelSystems: [...systems], targetBlocksPerCell: 1, reserveBlocksPerCell: 1,
    expectedSelectedTriplets: 12, expectedSelectedModelRows: 36,
    maximumAttemptModelRows: 72, expectedSharedArtifactRows: 4, expectedLogicalRows: 40,
  },
  runtime: {
    apiKeyEnv: "SKVM_XTY_API_KEY", absoluteTimeoutMs: 600000, idleTimeoutMs: 120000,
    maxSteps: 30, outerWatchdogMs: 660000, retries: 0,
  },
  qualification: { system: "original", skillId: "api-tester", taskId: "api-a" },
  gate: { minimumArtifactMeanScore: 0.85, maximumArtifactHardGateFailures: 0, maximumArtifactRegressions: 0 },
  promotionBoundary: {
    developmentOnly: true, entersMainClaim: false, permitsHeldOutExecution: false,
    permitsPromotion: false, permitsTokenBreakEven: false,
  },
  prohibited: ["held-out consumption"],
} satisfies MultiModelDevelopmentPanelLock;

function envelope(
  family: typeof families[number], skillId: string, taskId: string, block: number,
  system: typeof systems[number], classification: ExecutionEnvelope["classification"] = "semantic-complete",
): ExecutionEnvelope {
  const transient = classification === "empty-terminal";
  const activeTimeout = classification === "active-absolute-timeout";
  return {
    schemaVersion: "skill-ir-execution-envelope/v1",
    experimentId: lock.experimentId,
    taskId,
    system,
    candidateBlock: block,
    attemptId: `${family}:${skillId}:${taskId}:block-${block}:${system}`,
    process: {
      started: true, exitCode: activeTimeout ? 143 : 0,
      termination: activeTimeout ? "absolute-timeout" : "natural", durationMs: 100,
    },
    activity: {
      requestDispatched: true, providerResponses: transient ? 0 : 1,
      assistantMessages: transient ? 0 : 1, toolCalls: 0, toolResults: 0,
    },
    terminal: { present: !activeTimeout },
    usage: { available: !transient, input: transient ? 0 : 10, output: transient ? 0 : 5, cacheRead: 0, cacheWrite: 0 },
    parser: { outcome: transient ? "empty" : "ok", unknownTypes: [] },
    outputs: { fileCount: transient || activeTimeout ? 0 : 3 },
    classification,
    replacementEligible: transient,
  };
}

function scored(
  family: typeof families[number] | "none", skillId: string, taskId: string,
  system: ScoredAgentRunRow["system"], score: number, runIndex = 1,
): ScoredAgentRunRow {
  const model = family === "none" ? "direct-deterministic" : lock.models.find((item) => item.family === family)!.route;
  return {
    caseId: `${skillId}:skvm:windows:clean:${taskId}`, system, skill: skillId, agent: "skvm",
    environment: "windows", context: "clean", task: taskId, taskSplit: "development",
    success: score >= 0.85, evaluatorScore: score, ruleViolations: score >= 0.85 ? 0 : 1,
    stepCoverage: 1, latencyMs: 100, tokenCost: family === "none" ? 0 : 15,
    successSource: "deterministic-evaluator", failedCriteria: score >= 0.85 ? [] : ["quality"],
    model, modelFamily: family, adapter: family === "none" ? "validated-artifact-runtime" : "pi",
    adapterVersion: family === "none" ? "validated-artifact-runtime-v1" : "0.67.68",
    panelConfigId: lock.experimentId, runIndex,
    evaluationSummary: [{ method: "test", id: "hard", pass: score >= 0.85, score, details: "public" }],
  };
}

function completeEvidence() {
  const envelopes: ExecutionEnvelope[] = [];
  const scoredRows: ScoredAgentRunRow[] = [];
  for (const family of families) for (const item of cases) for (const taskId of item.taskIds) {
    for (const system of systems) {
      envelopes.push(envelope(family, item.skillId, taskId, 1, system));
      const score = system === "no-skill" ? 0.5 : system === "original" ? 0.8 : 0.9;
      scoredRows.push(scored(family, item.skillId, taskId, system, score));
    }
  }
  for (const item of cases) for (const taskId of item.taskIds) {
    scoredRows.push(scored("none", item.skillId, taskId, "validated-artifact", 1));
  }
  return { envelopes, scoredRows };
}

describe("multi-model development panel", () => {
  test("freezes 36 selected model rows plus four shared artifact anchors", () => {
    expect(MultiModelDevelopmentPanelLockSchema.parse(lock).matrix).toMatchObject({
      expectedSelectedModelRows: 36, expectedSharedArtifactRows: 4, expectedLogicalRows: 40,
    });
    expect(() => MultiModelDevelopmentPanelLockSchema.parse({
      ...lock, matrix: { ...lock.matrix, expectedSharedArtifactRows: 12, expectedLogicalRows: 48 },
    })).toThrow("expected 4");
  });

  test("selects a whole reserve triplet after a pre-semantic transient", () => {
    const evidence = completeEvidence();
    evidence.envelopes = evidence.envelopes.filter((item) =>
      !(item.attemptId.startsWith("claude:api-tester:api-a:") && item.candidateBlock === 1));
    for (const system of systems) {
      evidence.envelopes.push(envelope("claude", "api-tester", "api-a", 1, system,
        system === "original" ? "empty-terminal" : "semantic-complete"));
      evidence.envelopes.push(envelope("claude", "api-tester", "api-a", 2, system));
      evidence.scoredRows.push(scored("claude", "api-tester", "api-a", system,
        system === "no-skill" ? 0.5 : system === "original" ? 0.8 : 0.9, 2));
    }
    const report = buildMultiModelDevelopmentPanelReport({
      lock, qualificationPassed: true, tasks: cases.flatMap((item) => item.taskIds.map((id) => ({ id, hardGateIds: ["hard"] }))),
      envelopes: evidence.envelopes, scoredRows: evidence.scoredRows,
    });
    expect(report.counts.selectedModelRows).toBe(36);
    expect(report.counts.attemptedModelRows).toBe(39);
    expect(report.selection.replacedTriplets).toBe(1);
    expect(report.interpretation.infrastructureSensitive).toBe(true);
    expect(report.status).toBe("completed");
  });

  test("keeps active timeout in the fixed denominator and reports family incompatibility", () => {
    const evidence = completeEvidence();
    evidence.envelopes = evidence.envelopes.map((item) => item.attemptId === "deepseek:env-manager-v3:env-b:block-1:ir-static"
      ? envelope("deepseek", "env-manager-v3", "env-b", 1, "ir-static", "active-absolute-timeout") : item);
    evidence.scoredRows = evidence.scoredRows.filter((item) => !(item.modelFamily === "deepseek"
      && item.skill === "env-manager-v3" && item.task === "env-b" && item.system === "ir-static"));
    const report = buildMultiModelDevelopmentPanelReport({
      lock, qualificationPassed: true, tasks: cases.flatMap((item) => item.taskIds.map((id) => ({ id, hardGateIds: ["hard"] }))),
      envelopes: evidence.envelopes, scoredRows: evidence.scoredRows,
    });
    expect(report.selection.replacedTriplets).toBe(0);
    expect(report.counts.selectedModelRows).toBe(36);
    expect(report.modelFamilies.deepseek.executionCompatible).toBe(false);
    expect(report.modelFamilies.deepseek.failureTaxonomy["active-absolute-timeout"]).toBe(1);
    expect(report.modelFamilies.deepseek.staticVsOriginal.regressions).toBe(1);
    expect(report.status).toBe("completed");
  });
});
