import { describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { buildMultiModelDevelopmentPanelPlan } from "./multi-model-development-panel-plan";

const rootDir = path.resolve(import.meta.dir, "../../..");
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/panels/three-family-development-v3/panel-lock.json",
);

describe("multi-model development panel real planner", () => {
  test("validates both frozen phenotype closures and builds the 72+4 candidate plan", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "skvm-multi-model-plan-"));
    try {
      const plan = await buildMultiModelDevelopmentPanelPlan({ rootDir, lockPath, outDir });
      expect(plan.modelRows).toHaveLength(72);
      expect(plan.artifactRows).toHaveLength(4);
      expect(plan.runArgs).toHaveLength(6);
      expect(new Set(plan.modelRows.map((row) => row.modelFamily))).toEqual(new Set(["gpt", "claude", "deepseek"]));
      expect(plan.modelRows.every((row) => row.command.some((arg) => arg.startsWith("--execution-observation=")))).toBe(true);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});
