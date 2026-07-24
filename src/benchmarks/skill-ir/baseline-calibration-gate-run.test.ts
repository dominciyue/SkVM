import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ScoredAgentRunRow } from "./scoring";
import {
  parseBaselineCalibrationGateArgs,
  runBaselineCalibrationGateFile,
} from "./baseline-calibration-gate-run";

const rootDir = path.resolve(import.meta.dir, "../../..");
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/"
    + "experimental-design-baseline-calibration-lock.json",
);

function scoredRows(): ScoredAgentRunRow[] {
  const rows: ScoredAgentRunRow[] = [];
  for (const task of [
    "experimental-design-stratified-dev-001",
    "experimental-design-cluster-dev-002",
  ]) {
    for (const runIndex of [1, 2]) {
      for (const system of ["no-skill", "original"] as const) {
        const weaker = task.endsWith("001") && runIndex === 1 && system === "no-skill";
        rows.push({
          caseId: `experimental-design:skvm:windows:clean:${task}`,
          skill: "experimental-design",
          agent: "skvm",
          environment: "windows",
          context: "clean",
          task,
          system,
          model: "xty/gpt-5.6-sol",
          modelFamily: "gpt",
          adapter: "bare-agent",
          adapterVersion: "workspace-experimental-design-baseline-v1",
          panelConfigId: "experimental-design-baseline-calibration-v1",
          runIndex,
          taskSplit: "development",
          success: !weaker,
          ruleViolations: weaker ? 1 : 0,
          stepCoverage: 1,
          latencyMs: 1,
          runStatus: "ok",
          successSource: "deterministic-evaluator",
          failedCriteria: weaker ? ["design-plan-contract"] : [],
          evaluatorScore: weaker ? 0.8 : 1,
          evaluationSummary: [{
            method: "custom",
            id: "design-plan-contract",
            pass: !weaker,
            score: weaker ? 0 : 1,
            details: "PRIVATE scorer detail",
          }],
        });
      }
    }
  }
  return rows;
}

describe("skill-neutral baseline calibration gate CLI", () => {
  test("writes digest-bound compact evidence without raw or evaluator content", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "baseline-gate-"));
    try {
      const rawPath = path.join(dir, "raw.jsonl");
      const scoredPath = path.join(dir, "scored.jsonl");
      const resourcePath = path.join(dir, "resource.json");
      const routePath = path.join(dir, "route.json");
      const outPath = path.join(dir, "nested", "report.json");
      const lockBytes = await readFile(lockPath);
      const lockDigest = new Bun.CryptoHasher("sha256").update(lockBytes).digest("hex");
      await writeFile(rawPath, '{"private":"PRIVATE RAW MODEL OUTPUT"}\n', "utf8");
      await writeFile(
        scoredPath,
        `${scoredRows().map((row) => JSON.stringify(row)).join("\n")}\n`,
        "utf8",
      );
      await writeFile(resourcePath, `${JSON.stringify({
        schemaVersion: "skill-ir-resource-probe-result/v1",
        methodEvidence: false,
        status: "ok",
        executableSource: "env",
        requiredModules: [],
        exitCode: 0,
        stderrClass: "none",
        durationMs: 1,
      })}\n`, "utf8");
      await writeFile(routePath, `${JSON.stringify({
        schemaVersion: "skill-ir-baseline-calibration-route-probe-result/v1",
        calibrationId: "experimental-design-baseline-calibration-v1",
        lockDigest,
        methodEvidence: false,
        model: "xty/gpt-5.6-sol",
        caseId: "experimental-design:skvm:windows:clean:"
          + "experimental-design-stratified-dev-001",
        system: "original",
        status: "ok",
        exitCode: 0,
        timedOut: false,
        durationMs: 1,
      })}\n`, "utf8");

      const report = await runBaselineCalibrationGateFile({
        rootDir,
        lockPath,
        rawPath,
        scoredPath,
        resourcePath,
        routePath,
        outPath,
      });
      expect(report.passed).toBe(true);
      expect(report.interpretation.fullDevelopmentPlanningAllowed).toBe(true);
      expect(report.evidence).toMatchObject({
        lockSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        rawSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        scoredSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        resourceProbeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        routeProbeSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      const serialized = await readFile(outPath, "utf8");
      expect(serialized).not.toContain("PRIVATE");
      expect(serialized).not.toContain(dir);
      expect(serialized).not.toContain("details");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects unknown arguments", () => {
    expect(() => parseBaselineCalibrationGateArgs(["--held-out=true"])).toThrow(
      "Unknown argument",
    );
  });
});
