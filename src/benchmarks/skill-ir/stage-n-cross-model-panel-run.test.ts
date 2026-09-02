import { describe, expect, test } from "bun:test";
import {
  assertStageNMatrixExecutionNotAuthorized,
  parseStageNCrossModelPanelRunArgs,
  runStageNSmokeQualification,
} from "./stage-n-cross-model-panel-run";

describe("Stage N smoke runner", () => {
  test("parses only plan, smoke, and matrix phases", () => {
    expect(parseStageNCrossModelPanelRunArgs([
      "--phase=smoke", "--root-dir=D:/skill优化/SkVM", "--lock=lock.json", "--out-dir=out",
    ]).phase).toBe("smoke");
    expect(() => parseStageNCrossModelPanelRunArgs(["--phase=qualification", "--lock=lock.json", "--out-dir=out"]))
      .toThrow(/unsupported Stage N phase/);
  });

  test("refuses matrix execution before credential lookup or dispatch", () => {
    expect(() => assertStageNMatrixExecutionNotAuthorized()).toThrow(/matrix is not authorized/);
  });

  test("smoke executor is serial and records a failed family without retry", async () => {
    const calls: string[] = [];
    const result = await runStageNSmokeQualification({
      rows: [
        { family: "gpt", skillId: "api-tester", route: "gpt", taskId: "a", mode: "digest-bind", status: "complete", usageAvailable: true, classification: "semantic-complete", detail: "bound" },
        { family: "gpt", skillId: "env-manager-v3", route: "gpt", taskId: "b", mode: "digest-bind", status: "complete", usageAvailable: true, classification: "semantic-complete", detail: "bound" },
        { family: "claude", skillId: "api-tester", route: "claude", taskId: "a", mode: "execute", status: "complete", usageAvailable: true, classification: "semantic-complete", detail: "ok" },
        { family: "claude", skillId: "env-manager-v3", route: "claude", taskId: "b", mode: "execute", status: "complete", usageAvailable: true, classification: "semantic-complete", detail: "ok" },
        { family: "deepseek", skillId: "api-tester", route: "deepseek", taskId: "a", mode: "execute", status: "failed", usageAvailable: false, classification: "active-absolute-timeout", detail: "timeout" },
        { family: "deepseek", skillId: "env-manager-v3", route: "deepseek", taskId: "b", mode: "execute", status: "failed", usageAvailable: false, classification: "active-absolute-timeout", detail: "timeout" },
      ],
      executeRow: async (row) => { calls.push(`${row.family}:${row.skillId}`); return row; },
    });
    expect(calls).toEqual(["claude:api-tester", "claude:env-manager-v3", "deepseek:api-tester", "deepseek:env-manager-v3"]);
    expect(result.status).toBe("failed");
    expect(result.eligibleFamilies).toEqual(["gpt", "claude"]);
    expect(result.rows).toHaveLength(6);
  });
});
