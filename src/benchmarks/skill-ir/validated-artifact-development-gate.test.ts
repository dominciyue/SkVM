import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring";
import { ValidatedArtifactDevelopmentLockSchema } from "./validated-artifact-development";
import { buildValidatedArtifactDevelopmentGateReport } from "./validated-artifact-development-gate";

const taskIds = [
  "law-to-markdown-statute-dev-001",
  "law-to-markdown-standard-dev-002",
] as const;
const systems = ["no-skill", "original", "ir-static", "validated-artifact"] as const;

function identity(system: typeof systems[number]) {
  return system === "validated-artifact"
    ? {
        model: "direct-deterministic",
        modelFamily: "none",
        adapter: "validated-artifact-runtime",
        adapterVersion: "validated-artifact-runtime-v1",
      }
    : {
        model: "xty/gpt-5.6-sol",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "workspace-law-validated-artifact-v1",
      };
}

function raw(
  task: typeof taskIds[number],
  system: typeof systems[number],
  runIndex: number,
): RawAgentRunRow {
  return {
    caseId: `law-to-markdown:skvm:windows:clean:${task}`,
    system,
    ...identity(system),
    runIndex,
    panelConfigId: "law-to-markdown-validated-artifact-development-v1",
    taskPath: "task.json",
    workDir: "workdir",
    exitCode: 0,
    durationMs: 10,
    stdout: system === "validated-artifact"
      ? "final output: direct"
      : "tokens: in=100 out=20\nfinal output: model",
    stderr: "",
    successSource: "execution-only",
  };
}

function scored(
  task: typeof taskIds[number],
  system: typeof systems[number],
  runIndex: number,
  score: number,
  success: boolean,
): ScoredAgentRunRow {
  return {
    caseId: `law-to-markdown:skvm:windows:clean:${task}`,
    system,
    ...identity(system),
    runIndex,
    panelConfigId: "law-to-markdown-validated-artifact-development-v1",
    skill: "law-to-markdown",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task,
    taskSplit: "development",
    success,
    ruleViolations: success ? 0 : 1,
    stepCoverage: 1,
    latencyMs: 10,
    inputTokens: system === "validated-artifact" ? 0 : 100,
    outputTokens: system === "validated-artifact" ? 0 : 20,
    tokenCost: system === "validated-artifact" ? 0 : 120,
    successSource: "deterministic-evaluator",
    failedCriteria: success ? [] : ["criterion"],
    evaluatorScore: score,
    evaluationSummary: [
      {
        method: "custom",
        id: "law-protected-input",
        pass: true,
        score: 1,
        details: "Criterion passed",
      },
      {
        method: "custom",
        id: "law-required-artifacts",
        pass: true,
        score: 1,
        details: "Criterion passed",
      },
      {
        method: "custom",
        id: "law-source-accounting",
        pass: true,
        score: 1,
        details: "Criterion passed",
      },
    ],
  };
}

async function fixture() {
  const root = process.cwd();
  const lock = ValidatedArtifactDevelopmentLockSchema.parse(JSON.parse(await readFile(join(
    root,
    "benchmarks/skill-ir/pilots/law-to-markdown/"
      + "law-to-markdown-validated-artifact-development-lock.json",
  ), "utf8")));
  const tasks = taskIds.map((id) => ({
    id,
    split: "development",
    hardGateIds: ["law-protected-input", "law-required-artifacts", "law-source-accounting"],
  }));
  const rawRows: RawAgentRunRow[] = [];
  const scoredRows: ScoredAgentRunRow[] = [];
  for (const task of taskIds) {
    for (let runIndex = 1; runIndex <= 2; runIndex += 1) {
      for (const system of systems) {
        rawRows.push(raw(task, system, runIndex));
        const score = system === "validated-artifact"
          ? task === taskIds[0] ? 0.85 : 1
          : system === "no-skill" ? 0.7 : 0.8;
        scoredRows.push(scored(task, system, runIndex, score, system === "validated-artifact"));
      }
    }
  }
  return { lock, tasks, rawRows, scoredRows };
}

describe("validated artifact development gate", () => {
  test("passes a complete non-regressing 16-row matrix", async () => {
    const input = await fixture();
    const report = buildValidatedArtifactDevelopmentGateReport(input);

    expect(report.counts.expectedRows).toBe(16);
    expect(report.counts.completeQuartets).toBe(4);
    expect(report.systems["validated-artifact"].successes).toBe(4);
    expect(report.systems["validated-artifact"].meanScoreIncludingMissing).toBe(0.925);
    expect(report.artifactTaskMeanScores).toEqual({
      "law-to-markdown-statute-dev-001": 0.85,
      "law-to-markdown-standard-dev-002": 1,
    });
    expect(report.cost.modelGenerationTokens).toBe(1440);
    expect(report.cost.modelRepairTokens).toBe(0);
    expect(report.cost.breakEven).toBe("not-computed-quality-gate-pending");
    expect(report.gate.passed).toBe(true);
  });

  test("fails closed for a pairwise artifact regression", async () => {
    const input = await fixture();
    const row = input.scoredRows.find((candidate) =>
      candidate.system === "validated-artifact"
      && candidate.task === taskIds[0]
      && candidate.runIndex === 1,
    )!;
    row.evaluatorScore = 0.75;
    row.success = false;

    const report = buildValidatedArtifactDevelopmentGateReport(input);
    expect(report.counts.pairwiseRegressions).toBe(1);
    expect(report.gate.maximumPairwiseRegressions).toBe(false);
    expect(report.gate.passed).toBe(false);
  });

  test("counts a missing preregistered row as infrastructure failure", async () => {
    const input = await fixture();
    input.rawRows.pop();
    input.scoredRows.pop();

    const report = buildValidatedArtifactDevelopmentGateReport(input);
    expect(report.counts.observedRawRows).toBe(15);
    expect(report.counts.infrastructureFailures).toBeGreaterThan(0);
    expect(report.gate.completeRows).toBe(false);
    expect(report.gate.passed).toBe(false);
  });
});
