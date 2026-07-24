import { describe, expect, test } from "bun:test";
import type { BaselineCalibrationLock } from "./baseline-calibration";
import {
  evaluateBaselineCalibrationGate,
} from "./baseline-calibration-gate";
import type { ScoredAgentRunRow } from "./scoring";

const taskIds = [
  "experimental-design-stratified-dev-001",
  "experimental-design-cluster-dev-002",
] as const;

const lock = {
  schemaVersion: "skill-ir-baseline-calibration-lock/v1",
  calibrationId: "experimental-design-baseline-calibration-v1",
  skillId: "experimental-design",
  model: { route: "xty/gpt-5.6-sol", family: "gpt" },
  adapter: { id: "bare-agent", version: "workspace-experimental-design-baseline-v1" },
  matrix: {
    systems: ["no-skill", "original"],
    contexts: ["clean"],
    agents: ["skvm"],
    environments: ["windows"],
    taskSplit: "development",
    taskIds: [...taskIds],
    repetitions: 2,
    expectedRows: 8,
    expectedPairs: 4,
  },
  gate: {
    maximumInfrastructureFailures: 0,
    requireNoSkillNonSaturation: true,
    minimumDifferingPairs: 1,
    requireOriginalNonRegression: false,
  },
} as BaselineCalibrationLock;

function row(opts: {
  taskId: typeof taskIds[number];
  system: "no-skill" | "original";
  runIndex: 1 | 2;
  success?: boolean;
  score?: number;
  contractPass?: boolean;
  failureType?: "infrastructure" | "agent";
}): ScoredAgentRunRow {
  const success = opts.success ?? true;
  const score = opts.score ?? 1;
  return {
    caseId: `experimental-design:skvm:windows:clean:${opts.taskId}`,
    skill: "experimental-design",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: opts.taskId,
    system: opts.system,
    model: "xty/gpt-5.6-sol",
    modelFamily: "gpt",
    adapter: "bare-agent",
    adapterVersion: "workspace-experimental-design-baseline-v1",
    panelConfigId: "experimental-design-baseline-calibration-v1",
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
    failedCriteria: success ? [] : ["design-plan-contract"],
    ...(opts.failureType ? { failureType: opts.failureType } : {}),
    evaluatorScore: score,
    evaluationSummary: [{
      method: "custom",
      id: "design-plan-contract",
      pass: opts.contractPass ?? success,
      score: opts.contractPass ?? success ? 1 : 0,
      details: "PRIVATE evaluator details",
    }],
  };
}

function passingRows(): ScoredAgentRunRow[] {
  const rows: ScoredAgentRunRow[] = [];
  for (const taskId of taskIds) {
    for (const runIndex of [1, 2] as const) {
      rows.push(row({ taskId, system: "no-skill", runIndex }));
      rows.push(row({ taskId, system: "original", runIndex }));
    }
  }
  rows[0] = row({
    taskId: taskIds[0],
    system: "no-skill",
    runIndex: 1,
    success: false,
    score: 0.8,
    contractPass: false,
  });
  return rows;
}

describe("skill-neutral baseline calibration gate", () => {
  test("passes complete, non-saturated, distinguishable pairs without promoting evidence", () => {
    const report = evaluateBaselineCalibrationGate(passingRows(), lock);

    expect(report).toMatchObject({
      schemaVersion: "skill-ir-baseline-calibration-gate-report/v1",
      calibrationId: "experimental-design-baseline-calibration-v1",
      methodEvidence: false,
      passed: true,
      counts: {
        expectedRows: 8,
        observedRows: 8,
        expectedPairs: 4,
        completePairs: 4,
        infrastructureFailures: 0,
        noSkillSemanticFailures: 1,
        differingPairs: 1,
      },
      interpretation: {
        fullDevelopmentPlanningAllowed: true,
        heldOutAllowed: false,
        entersMainClaim: false,
        scorerRetuningAllowed: false,
        packageRecompileAllowed: false,
      },
    });
    expect(report.pairs[0]?.criterionTransitions).toEqual({
      improved: ["design-plan-contract"],
      regressed: [],
    });
    expect(JSON.stringify(report)).not.toContain("PRIVATE");
    expect(JSON.stringify(report)).not.toContain("details");
  });

  test("fails for saturation, identical outcomes, missing rows, or infrastructure", () => {
    const saturated = passingRows().map((item) => ({
      ...item,
      success: true,
      evaluatorScore: 1,
      failedCriteria: [],
      evaluationSummary: item.evaluationSummary?.map((criterion) => ({
        ...criterion,
        pass: true,
        score: 1,
      })),
    }));
    expect(evaluateBaselineCalibrationGate(saturated, lock)).toMatchObject({
      passed: false,
      gates: { noSkillNonSaturated: false, distinguishable: false },
    });

    const missing = evaluateBaselineCalibrationGate(passingRows().slice(0, 7), lock);
    expect(missing).toMatchObject({
      passed: false,
      counts: { observedRows: 7, completePairs: 3 },
      gates: { completeRows: false, completePairs: false },
    });

    const infrastructure = passingRows();
    infrastructure[0] = row({
      taskId: taskIds[0],
      system: "no-skill",
      runIndex: 1,
      success: false,
      score: 0,
      failureType: "infrastructure",
    });
    expect(evaluateBaselineCalibrationGate(infrastructure, lock)).toMatchObject({
      passed: false,
      counts: { infrastructureFailures: 1 },
      gates: { zeroInfrastructure: false },
    });
  });

  test("rejects duplicate and frozen identity drift", () => {
    const rows = passingRows();
    expect(() => evaluateBaselineCalibrationGate([...rows, rows[0]!], lock)).toThrow(
      "duplicate",
    );
    expect(() => evaluateBaselineCalibrationGate(
      rows.map((item, index) => index === 0
        ? { ...item, adapterVersion: "workspace-other" }
        : item),
      lock,
    )).toThrow("adapter version");
    expect(() => evaluateBaselineCalibrationGate(
      rows.map((item, index) => index === 0
        ? { ...item, taskSplit: "held-out" }
        : item),
      lock,
    )).toThrow("task split");
  });
});
