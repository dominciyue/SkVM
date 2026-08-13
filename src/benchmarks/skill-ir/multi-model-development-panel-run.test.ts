import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExecutionEnvelope } from "./execution-resilience";
import {
  executeMultiModelPanelCells,
  multiModelQualificationOutputsPresent,
  parseMultiModelDevelopmentPanelRunArgs,
  sanitizeMultiModelPanelScoredRows,
  selectMultiModelPanelRawRowsForScoring,
} from "./multi-model-development-panel-run";

function envelope(block: number, system: string, classification: ExecutionEnvelope["classification"]): ExecutionEnvelope {
  const semantic = classification === "semantic-complete";
  return {
    schemaVersion: "skill-ir-execution-envelope/v1", experimentId: "panel", taskId: "task-a", system,
    candidateBlock: block, attemptId: `gpt:api-tester:task-a:block-${block}:${system}`,
    process: { started: true, exitCode: semantic ? 0 : 143, termination: semantic ? "natural" : "absolute-timeout", durationMs: 1 },
    activity: { requestDispatched: true, providerResponses: 1, assistantMessages: 1, toolCalls: 0, toolResults: 0 },
    terminal: { present: semantic }, usage: { available: true, input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    parser: { outcome: "ok", unknownTypes: [] }, outputs: { fileCount: semantic ? 3 : 0 },
    classification, replacementEligible: false,
  };
}

describe("multi-model development panel runner", () => {
  test("qualification requires all three declared API Tester outputs, not an arbitrary file count", async () => {
    const workDir = await mkdtemp(path.join(os.tmpdir(), "skvm-panel-qualification-"));
    try {
      await writeFile(path.join(workDir, "api-test-interface.json"), "{}", "utf8");
      await writeFile(path.join(workDir, "api-test-generator.mjs"), "", "utf8");
      expect(await multiModelQualificationOutputsPresent(workDir)).toBe(false);
      await mkdir(path.join(workDir, "generated"), { recursive: true });
      await writeFile(path.join(workDir, "generated/api-test-plan.json"), "{}", "utf8");
      await writeFile(path.join(workDir, "api-test-report.json"), "{}", "utf8");
      expect(await multiModelQualificationOutputsPresent(workDir)).toBe(true);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  test("keeps executing later model cells after one cell reports a fail-closed blocker", async () => {
    const calls: string[] = [];
    const result = await executeMultiModelPanelCells({
      cells: [
        { modelFamily: "gpt", skillId: "api-tester", taskId: "task-a" },
        { modelFamily: "claude", skillId: "api-tester", taskId: "task-a" },
      ],
      systems: ["no-skill", "original", "ir-static"],
      targetBlocksPerCell: 1,
      reserveBlocksPerCell: 1,
      executeBlock: async (cell, block) => {
        calls.push(`${cell.modelFamily}:${block}`);
        return ["no-skill", "original", "ir-static"].map((system) => {
          const item = envelope(block, system, "semantic-complete");
          return cell.modelFamily === "gpt" && system === "original"
            ? { ...item, process: { ...item.process, exitCode: 1, termination: "crash" as const },
                classification: "runtime-crash" as const }
            : item;
        });
      },
    });
    expect(calls).toEqual(["gpt:1", "claude:1"]);
    expect(result.cells).toHaveLength(2);
    expect(result.cells[0]?.selection.abortReason).toBe("execution-blocker");
    expect(result.cells[1]?.selection.complete).toBe(true);
  });

  test("parses only plan, qualification, and execute phases", () => {
    expect(parseMultiModelDevelopmentPanelRunArgs([
      "--lock=lock.json", "--out-dir=out", "--phase=plan",
    ])).toMatchObject({ phase: "plan" });
    expect(() => parseMultiModelDevelopmentPanelRunArgs([
      "--lock=lock.json", "--out-dir=out", "--phase=held-out",
    ])).toThrow("Unsupported multi-model panel phase");
  });

  test("scores only selected semantic rows and keeps active failures out of scorer input", () => {
    const rawRows = [
      { caseId: "api-tester:skvm:windows:clean:task-a", system: "original", runIndex: 1, modelFamily: "gpt" },
      { caseId: "api-tester:skvm:windows:clean:task-a", system: "original", runIndex: 2, modelFamily: "gpt" },
      { caseId: "api-tester:skvm:windows:clean:task-a", system: "ir-static", runIndex: 2, modelFamily: "gpt" },
    ];
    const selected = selectMultiModelPanelRawRowsForScoring({
      rawRows,
      envelopes: [
        envelope(1, "original", "semantic-complete"),
        envelope(2, "original", "semantic-complete"),
        envelope(2, "ir-static", "active-absolute-timeout"),
      ],
      selectedCells: [{ modelFamily: "gpt", skillId: "api-tester", taskId: "task-a", candidateBlock: 2 }],
    });
    expect(selected).toEqual([rawRows[1]!]);
  });

  test("removes local workdir manifest paths from compact scored evidence", () => {
    const rows = [{
      caseId: "api-tester:skvm:windows:clean:task-a",
      system: "original",
      initialWorkdirManifest: { path: "D:\\private\\run\\initial-workdir-manifest.json", sha256: "abc" },
      evaluatorScore: 1,
    }];

    expect(sanitizeMultiModelPanelScoredRows(rows)).toEqual([{
      caseId: "api-tester:skvm:windows:clean:task-a",
      system: "original",
      initialWorkdirManifestSha256: "abc",
      evaluatorScore: 1,
    }]);
    expect(rows[0]?.initialWorkdirManifest.path).toContain("private");
  });
});
