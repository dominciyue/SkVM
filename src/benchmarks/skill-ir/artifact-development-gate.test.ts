import { describe, expect, test } from "bun:test";
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring";
import { buildArtifactDevelopmentGateReport } from "./artifact-development-gate";

const SYSTEM = "ir-contract-artifact-dev" as const;

function raw(taskId: string, runIndex: number, generationIdentity?: string): RawAgentRunRow {
  return {
    caseId: `env-manager:skvm:windows:clean:${taskId}`,
    system: SYSTEM,
    model: "xty/gpt-5.6-sol",
    modelFamily: "openai",
    adapter: "bare-agent",
    adapterVersion: "workspace",
    runIndex,
    panelConfigId: "env-manager-v4-development-v1",
    taskPath: "task.json",
    workDir: "workdir",
    exitCode: generationIdentity ? 0 : 1,
    runStatus: generationIdentity ? "ok" : "adapter-crashed",
    durationMs: 1,
    stdout: "",
    stderr: "",
    successSource: "execution-only",
    ...(generationIdentity
      ? {
          artifactRuntime: {
            mode: "one-repair",
            status: "complete",
            repairAttempted: false,
            repairedToPass: false,
            aggregateUsage: { inputTokens: 0, outputTokens: 0, tokenCost: 0, modelDurationMs: 0 },
            validationDurationMs: 0,
            generationIdentity,
          },
        }
      : {}),
  };
}

function scored(
  taskId: string,
  runIndex: number,
  generationIdentity: string,
  arm: "check-only" | "one-repair",
  score: number,
  hardGatePass: boolean,
): ScoredAgentRunRow {
  return {
    caseId: `env-manager:skvm:windows:clean:${taskId}`,
    system: SYSTEM,
    model: "xty/gpt-5.6-sol",
    modelFamily: "openai",
    adapter: "bare-agent",
    adapterVersion: "workspace",
    runIndex,
    panelConfigId: "env-manager-v4-development-v1",
    skill: "env-manager",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: taskId,
    taskSplit: "development",
    success: score >= 0.85 && hardGatePass,
    ruleViolations: hardGatePass ? 0 : 1,
    stepCoverage: 1,
    latencyMs: 1,
    successSource: "deterministic-evaluator",
    failedCriteria: hardGatePass ? [] : ["env-classification"],
    evaluatorScore: score,
    evaluationSummary: [
      { method: "script", id: "env-classification", pass: hardGatePass, score, details: "test" },
    ],
    artifactLogicalArm: arm,
    generationIdentity,
  };
}

const inputBase = {
  expected: {
    system: SYSTEM,
    skillId: "env-manager",
    model: "xty/gpt-5.6-sol",
    modelFamily: "openai",
    adapter: "bare-agent",
    adapterVersion: "workspace",
    panelConfigId: "env-manager-v4-development-v1",
    contexts: ["clean"],
    agents: ["skvm"],
    environments: ["windows"],
    taskIds: ["node-dev", "vite-dev"],
    repetitions: 2,
    initialGenerationRows: 4,
    minimumSuccesses: 3,
    minimumMeanScore: 0.85,
    maximumHardGateRegressions: 0,
    maximumInfrastructureFailures: 0,
  },
  tasks: [
    { id: "node-dev", split: "development", hardGateIds: ["env-classification"] },
    { id: "vite-dev", split: "development", hardGateIds: ["env-classification"] },
  ],
};

describe("artifact development generation gate", () => {
  test("keeps missing generation and missing pair in the frozen denominator", () => {
    const rawRows = [
      raw("node-dev", 1, "generation-node-1"),
      raw("node-dev", 2, "generation-node-2"),
      raw("vite-dev", 1),
    ];
    const scoredRows = [
      scored("node-dev", 1, "generation-node-1", "check-only", 0.7, false),
      scored("node-dev", 1, "generation-node-1", "one-repair", 1, true),
      scored("node-dev", 2, "generation-node-2", "check-only", 0.7, false),
      scored("node-dev", 2, "generation-node-2", "one-repair", 0.9, true),
    ];

    const report = buildArtifactDevelopmentGateReport({ ...inputBase, rawRows, scoredRows });

    expect(report.counts).toEqual({
      expectedGenerations: 4,
      pairedGenerations: 2,
      missingGenerations: 1,
      missingPairs: 1,
      successes: 2,
      hardGateRegressions: 0,
      infrastructureFailures: 2,
    });
    expect(report.meanScoreIncludingInfrastructure).toBe(0.475);
    expect(report.records.map((record) => record.status)).toEqual([
      "paired",
      "paired",
      "missing-pair",
      "missing-generation",
    ]);
    expect(report.gate).toEqual({
      minimumSuccesses: false,
      minimumMeanScore: false,
      maximumHardGateRegressions: true,
      maximumInfrastructureFailures: false,
      passed: false,
    });
  });

  test("counts a hard-gate post regression without confusing it with infrastructure", () => {
    const rawRows = [
      raw("node-dev", 1, "n1"),
      raw("node-dev", 2, "n2"),
      raw("vite-dev", 1, "v1"),
      raw("vite-dev", 2, "v2"),
    ];
    const scoredRows = rawRows.flatMap((row, index) => {
      const taskId = index < 2 ? "node-dev" : "vite-dev";
      const generationIdentity = row.artifactRuntime!.generationIdentity!;
      const runIndex = row.runIndex!;
      return [
        scored(taskId, runIndex, generationIdentity, "check-only", 1, true),
        scored(taskId, runIndex, generationIdentity, "one-repair", index === 3 ? 0.7 : 1, index !== 3),
      ];
    });

    const report = buildArtifactDevelopmentGateReport({ ...inputBase, rawRows, scoredRows });

    expect(report.counts.hardGateRegressions).toBe(1);
    expect(report.counts.infrastructureFailures).toBe(0);
    expect(report.meanScoreIncludingInfrastructure).toBe(0.925);
    expect(report.gate.maximumHardGateRegressions).toBe(false);
    expect(report.gate.passed).toBe(false);
  });

  test("rejects duplicate generation identities and non-development task metadata", () => {
    const duplicate = raw("node-dev", 1, "same");
    expect(() => buildArtifactDevelopmentGateReport({
      ...inputBase,
      rawRows: [duplicate, duplicate],
      scoredRows: [],
    })).toThrow("duplicate raw generation");

    expect(() => buildArtifactDevelopmentGateReport({
      ...inputBase,
      tasks: [{ id: "node-dev", split: "held-out", hardGateIds: [] }, inputBase.tasks[1]!],
      rawRows: [],
      scoredRows: [],
    })).toThrow("development task");
  });

  test("rejects rows from another frozen identity or an out-of-range repetition", () => {
    expect(() => buildArtifactDevelopmentGateReport({
      ...inputBase,
      rawRows: [{ ...raw("node-dev", 1, "n1"), model: "xty/other-model" }],
      scoredRows: [],
    })).toThrow("model identity");

    expect(() => buildArtifactDevelopmentGateReport({
      ...inputBase,
      rawRows: [raw("node-dev", 3, "n3")],
      scoredRows: [],
    })).toThrow("run index");

    const noisy = scored("node-dev", 1, "n1", "check-only", 1, true);
    expect(() => buildArtifactDevelopmentGateReport({
      ...inputBase,
      rawRows: [],
      scoredRows: [{
        ...noisy,
        caseId: "env-manager:skvm:windows:noisy:node-dev",
        context: "noisy",
      }],
    })).toThrow("context identity");
  });
});
