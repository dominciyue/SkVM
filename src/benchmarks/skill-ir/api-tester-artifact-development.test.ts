import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring";
import {
  buildApiTesterArtifactDevelopmentGateReport,
  buildApiTesterArtifactDevelopmentPlan,
  readAndValidateApiTesterArtifactDevelopmentLock,
  selectApiTesterArtifactVariant,
} from "./api-tester-artifact-development";

const rootDir = process.cwd();
const lockPath = join(
  rootDir,
  "benchmarks/skill-ir/pilots/api-tester/api-tester-artifact-development-lock.json",
);
const taskIds = [
  "api-tester-openapi-users-dev-001",
  "api-tester-openapi-inventory-dev-002",
] as const;
const systems = ["no-skill", "original", "ir-static", "validated-artifact"] as const;
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "api-tester-artifact-dev-"));
  tempDirs.push(dir);
  return dir;
}

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
        adapter: "pi",
        adapterVersion: "0.67.68",
      };
}

function raw(task: typeof taskIds[number], system: typeof systems[number], runIndex: number): RawAgentRunRow {
  return {
    caseId: `api-tester:skvm:windows:clean:${task}`,
    system,
    ...identity(system),
    runIndex,
    panelConfigId: "api-tester-schema-derived-artifact-development-v1",
    taskPath: "task.json",
    workDir: "workdir",
    exitCode: 0,
    runStatus: "ok",
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
    caseId: `api-tester:skvm:windows:clean:${task}`,
    system,
    ...identity(system),
    runIndex,
    panelConfigId: "api-tester-schema-derived-artifact-development-v1",
    skill: "api-tester",
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
    runStatus: "ok",
    successSource: "deterministic-evaluator",
    failedCriteria: success ? [] : ["criterion"],
    evaluatorScore: score,
    evaluationSummary: [
      "api-generator-integrity",
      "api-operation-coverage",
      "api-schema-derived-cases",
      "api-security-response",
      "api-independence-verification",
    ].map((id) => ({ method: "custom", id, pass: true, score: 1, details: "passed" })),
  };
}

async function gateFixture() {
  const lock = await readAndValidateApiTesterArtifactDevelopmentLock({ rootDir, lockPath });
  const tasks = taskIds.map((id) => ({
    id,
    split: "development",
    hardGateIds: [
      "api-generator-integrity",
      "api-operation-coverage",
      "api-schema-derived-cases",
      "api-security-response",
      "api-independence-verification",
    ],
  }));
  const rawRows: RawAgentRunRow[] = [];
  const scoredRows: ScoredAgentRunRow[] = [];
  for (const task of taskIds) {
    for (let runIndex = 1; runIndex <= 2; runIndex += 1) {
      for (const system of systems) {
        rawRows.push(raw(task, system, runIndex));
        const score = system === "validated-artifact" ? 1 : system === "no-skill" ? 0.4 : 0.8;
        scoredRows.push(scored(task, system, runIndex, score, system === "validated-artifact"));
      }
    }
  }
  return { lock, tasks, rawRows, scoredRows };
}

describe("API Tester artifact development", () => {
  test("maps only the public OpenAPI fixture to a frozen package variant", () => {
    expect(selectApiTesterArtifactVariant({ "api/openapi.yaml": "yaml", "api-test-interface.json": "{}" }))
      .toBe("openapi-yaml");
    expect(selectApiTesterArtifactVariant({ "api/openapi.json": "{}", "api-test-interface.json": "{}" }))
      .toBe("openapi-json");
    expect(() => selectApiTesterArtifactVariant({ "api-test-interface.json": "{}" })).toThrow();
    expect(() => selectApiTesterArtifactVariant({
      "api/openapi.yaml": "yaml",
      "api/openapi.json": "{}",
    })).toThrow();
  });

  test("validates the prospective lock and builds four complete quartets", async () => {
    const lock = await readAndValidateApiTesterArtifactDevelopmentLock({ rootDir, lockPath });
    expect(lock.promotionBoundary.permitsHeldOutExecution).toBe(false);
    expect(Object.keys(lock.frozenPackages)).toEqual(["openapiYaml", "openapiJson"]);

    const built = await buildApiTesterArtifactDevelopmentPlan({
      rootDir,
      lockPath,
      outDir: await tempDir(),
    });
    expect(built.plan).toHaveLength(16);
    expect(built.plan.filter((row) => row.executionClass === "model-agent")).toHaveLength(12);
    expect(built.plan.filter((row) => row.executionClass === "direct-deterministic")).toHaveLength(4);
    for (const taskId of taskIds) {
      for (let runIndex = 1; runIndex <= 2; runIndex += 1) {
        const quartet = built.plan.filter((row) => row.caseId.endsWith(`:${taskId}`) && row.runIndex === runIndex);
        expect(new Set(quartet.map((row) => row.system))).toEqual(new Set(systems));
        const artifact = quartet.find((row) => row.system === "validated-artifact")!;
        expect(artifact.artifactVariantId).toBe(taskId.includes("users") ? "openapi-yaml" : "openapi-json");
      }
    }
  }, 60_000);

  test("fails closed when a frozen digest drifts", async () => {
    const value = JSON.parse(await readFile(lockPath, "utf8"));
    value.frozenInputs.source.sha256 = "0".repeat(64);
    await expect(readAndValidateApiTesterArtifactDevelopmentLock({ rootDir, input: value })).rejects.toThrow(
      /digest mismatch/u,
    );
  });

  test("passes a complete non-regressing matrix and accounts for direct zero-token rows", async () => {
    const input = await gateFixture();
    const report = buildApiTesterArtifactDevelopmentGateReport(input);
    expect(report.counts.completeQuartets).toBe(4);
    expect(report.counts.artifactSuccesses).toBe(4);
    expect(report.systems["validated-artifact"].meanScoreIncludingMissing).toBe(1);
    expect(report.cost.modelGenerationTokens).toBe(1440);
    expect(report.gate.passed).toBe(true);
  });

  test("fails for missing rows, hard-gate failure, or artifact regression", async () => {
    const missing = await gateFixture();
    missing.rawRows.pop();
    missing.scoredRows.pop();
    expect(buildApiTesterArtifactDevelopmentGateReport(missing).gate.passed).toBe(false);

    const hardGate = await gateFixture();
    const hardGateRow = hardGate.scoredRows.find((row) => row.system === "validated-artifact")!;
    hardGateRow.evaluationSummary![0]!.pass = false;
    expect(buildApiTesterArtifactDevelopmentGateReport(hardGate).gate.passed).toBe(false);

    const regression = await gateFixture();
    const regressionRow = regression.scoredRows.find((row) => row.system === "validated-artifact")!;
    regressionRow.evaluatorScore = 0.7;
    regressionRow.success = false;
    const report = buildApiTesterArtifactDevelopmentGateReport(regression);
    expect(report.counts.pairwiseRegressions).toBe(1);
    expect(report.gate.passed).toBe(false);
  });
});
