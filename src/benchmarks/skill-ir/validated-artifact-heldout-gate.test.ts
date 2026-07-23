import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring";
import { ValidatedArtifactHeldoutLockSchema } from "./validated-artifact-heldout";
import { buildValidatedArtifactHeldoutGateReport } from "./validated-artifact-heldout-gate";

const rootDir = path.resolve(import.meta.dir, "../../..");
const taskIds = [
  "law-to-markdown-regulation-heldout-001",
  "law-to-markdown-manual-heldout-002",
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
        adapterVersion: "workspace-law-validated-artifact-heldout-v1",
      };
}

function raw(task: typeof taskIds[number], system: typeof systems[number], runIndex: number) {
  return {
    caseId: `law-to-markdown:skvm:windows:clean:${task}`,
    system,
    ...identity(system),
    runIndex,
    panelConfigId: "law-to-markdown-validated-artifact-heldout-v1",
    taskPath: "task.json",
    workDir: "workdir",
    exitCode: 0,
    durationMs: 10,
    stdout: "final output: complete",
    stderr: "",
    successSource: "execution-only",
  } satisfies RawAgentRunRow;
}

function scored(
  task: typeof taskIds[number],
  system: typeof systems[number],
  runIndex: number,
  score: number,
  success: boolean,
) {
  return {
    caseId: `law-to-markdown:skvm:windows:clean:${task}`,
    system,
    ...identity(system),
    runIndex,
    panelConfigId: "law-to-markdown-validated-artifact-heldout-v1",
    skill: "law-to-markdown",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task,
    taskSplit: "held-out",
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
      { method: "custom", id: "law-protected-input", pass: true, score: 1, details: "pass" },
      { method: "custom", id: "law-required-artifacts", pass: true, score: 1, details: "pass" },
      { method: "custom", id: "law-source-accounting", pass: true, score: 1, details: "pass" },
    ],
  } satisfies ScoredAgentRunRow;
}

async function fixture() {
  const lock = ValidatedArtifactHeldoutLockSchema.parse(JSON.parse(await readFile(path.join(
    rootDir,
    "benchmarks/skill-ir/pilots/law-to-markdown/"
      + "law-to-markdown-validated-artifact-heldout-lock.json",
  ), "utf8")));
  const tasks = taskIds.map((id) => ({
    id,
    split: "held-out",
    hardGateIds: ["law-protected-input", "law-required-artifacts", "law-source-accounting"],
  }));
  const rawRows: RawAgentRunRow[] = [];
  const scoredRows: ScoredAgentRunRow[] = [];
  for (const task of taskIds) {
    for (let runIndex = 1; runIndex <= 2; runIndex += 1) {
      for (const system of systems) {
        rawRows.push(raw(task, system, runIndex));
        const score = system === "validated-artifact" ? 0.9 : 0.8;
        scoredRows.push(scored(task, system, runIndex, score, system === "validated-artifact"));
      }
    }
  }
  return { lock, tasks, rawRows, scoredRows };
}

describe("validated artifact held-out gate", () => {
  test("passes complete evidence with strict improvements over all baselines", async () => {
    const report = buildValidatedArtifactHeldoutGateReport(await fixture());
    expect(report.counts.completeQuartets).toBe(4);
    expect(report.counts.artifactSuccesses).toBe(4);
    expect(report.counts.pairwiseImprovements).toBe(4);
    expect(report.counts.pairwiseRegressions).toBe(0);
    expect(report.gate.passed).toBe(true);
  });

  test("fails when artifact regresses below no-skill even if other skill baselines are lower", async () => {
    const input = await fixture();
    const target = input.scoredRows.find((row) =>
      row.task === taskIds[0] && row.runIndex === 1 && row.system === "no-skill",
    )!;
    target.evaluatorScore = 1;
    target.success = true;
    const report = buildValidatedArtifactHeldoutGateReport(input);
    expect(report.counts.pairwiseRegressions).toBe(1);
    expect(report.gate.maximumPairwiseRegressions).toBe(false);
    expect(report.gate.passed).toBe(false);
  });

  test("requires at least one strict improvement", async () => {
    const input = await fixture();
    for (const row of input.scoredRows) row.evaluatorScore = 0.9;
    const report = buildValidatedArtifactHeldoutGateReport(input);
    expect(report.counts.pairwiseImprovements).toBe(0);
    expect(report.gate.minimumPairwiseImprovements).toBe(false);
    expect(report.gate.passed).toBe(false);
  });

  test("keeps a missing row in the frozen denominator", async () => {
    const input = await fixture();
    input.rawRows.pop();
    input.scoredRows.pop();
    const report = buildValidatedArtifactHeldoutGateReport(input);
    expect(report.counts.observedRawRows).toBe(15);
    expect(report.counts.infrastructureFailures).toBeGreaterThan(0);
    expect(report.gate.passed).toBe(false);
  });
});
