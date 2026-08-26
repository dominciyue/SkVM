import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  auditReviewPatchSource,
  ReviewRequiredCatalogSchema,
  runReviewRequiredSlice,
} from "./review-required";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("review-required product slice", () => {
  test("rejects patch source that can access evaluator, held-out, network, subprocess, or task-answer literals", () => {
    for (const forbidden of [
      "src/bench/evaluators/example.ts",
      "held-out",
      "fetch('https://example.test')",
      "Bun.spawn(['tool'])",
      "TEST_ONLY_NODE_DB_PASSWORD_7F2A",
    ]) {
      expect(() => auditReviewPatchSource(forbidden, ["TEST_ONLY_NODE_DB_PASSWORD_7F2A"]))
        .toThrow();
    }
  });

  test("runs automatic plan then an independent patch on fresh workdirs and preserves both score ledgers", async () => {
    const rootDir = process.cwd();
    const outDir = await mkdtemp(join(rootDir, "results/skill-ir/review-required-test-"));
    temporaryDirectories.push(outDir);
    const catalog = ReviewRequiredCatalogSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/corpus/review-required-env-2026-08-26.json"),
      "utf8",
    )));
    const report = await runReviewRequiredSlice({
      rootDir,
      catalog,
      outputPath: join(outDir, "report.json"),
      measurementCompletedAt: "2026-08-26T04:12:03.883Z",
      humanMinutes: 1,
    });

    expect(report.status).toBe("review-required");
    expect(report.automaticOnly.summary).toMatchObject({ passedCriteria: 3, criterionCount: 6, fullParityTasks: 0 });
    expect(report.reviewed.summary).toMatchObject({ passedCriteria: 6, criterionCount: 6, fullParityTasks: 2 });
    expect(report.tasks.every((task) => task.automaticPlan.runtimeComplete)).toBe(true);
    expect(report.tasks.every((task) => task.reviewPatch.runtimeComplete)).toBe(true);
    expect(report.tasks.every((task) => task.protectedInputsPreservedAfterReview)).toBe(true);
    expect(report.patch).toMatchObject({ humanMinutes: 1, coreBranchDelta: 0, projectModelCalls: 0 });
    expect(report.construction.reviewPatch).toMatchObject({
      durationDisposition: "human-time-recorded-separately",
      modelTokens: 0,
      humanMinutes: 1,
    });
    expect(report.construction.profile).toMatchObject({ disposition: "not-applicable-profile-empty", modelTokens: 0 });
    expect(report.construction.compile.modelTokens).toBe(0);
    expect(report.construction.package.modelTokens).toBe(0);
    expect(report.construction.package.bytes).toBeGreaterThan(0);
    expect(report.automaticPlanDigestPreserved).toBe(true);
    expect(report.authorization).toEqual({ paidCalls: 0, retries: 0, heldOutAccesses: 0, evaluatorPayloadAccessesByPatch: 0 });
    expect(JSON.parse(await readFile(join(outDir, "report.json"), "utf8"))).toEqual(report);
  });
});
