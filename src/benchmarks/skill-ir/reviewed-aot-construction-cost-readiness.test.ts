import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  auditReviewedAotConstructionCost,
  ReviewedAotConstructionCostPolicySchema,
} from "./reviewed-aot-construction-cost-readiness";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("reviewed AOT construction-cost readiness", () => {
  test("rejects a review evidence digest drift before deriving cost identity", async () => {
    const rootDir = process.cwd();
    const policy = ReviewedAotConstructionCostPolicySchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/corpus/reviewed-aot-construction-cost-readiness-env-2026-08-26.json"),
      "utf8",
    )));
    await expect(auditReviewedAotConstructionCost({
      rootDir,
      policy: { ...policy, reviewReport: { ...policy.reviewReport, sha256: "0".repeat(64) } },
    })).rejects.toThrow("digest mismatch");
  });

  test("rebuilds complete one-time production token identity without authorizing a paid matrix", async () => {
    const rootDir = process.cwd();
    const outputDir = await mkdtemp(join(rootDir, "results/skill-ir/reviewed-aot-cost-test-"));
    temporaryDirectories.push(outputDir);
    const policy = ReviewedAotConstructionCostPolicySchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/corpus/reviewed-aot-construction-cost-readiness-env-2026-08-26.json"),
      "utf8",
    )));
    const report = await auditReviewedAotConstructionCost({
      rootDir,
      policy,
      outputPath: join(outputDir, "report.json"),
    });

    expect(report.status).toBe("ready-to-freeze-efficiency-identity");
    expect(report.qualityEvidence).toMatchObject({
      equivalent: true,
      reviewedPassedCriteria: 6,
      criterionCount: 6,
      fullParityTasks: 2,
      protectedInputsPreserved: true,
    });
    expect(report.productionOneTime.components.synthesis).toMatchObject({ modelCalls: 1, modelTokens: 9358 });
    expect(report.productionOneTime.components.reviewPatch).toMatchObject({
      modelCalls: 0,
      modelTokens: 0,
      humanMinutes: 8,
      disposition: "separate-non-token-adaptation-cost",
    });
    expect(report.productionOneTime.builderMapping).toEqual({
      compileModelTokens: 9358,
      profileModelTokens: 0,
      packageModelTokens: 0,
    });
    expect(report.productionOneTime.missing).toEqual([]);
    expect(report.productionOneTime.complete).toBe(true);
    expect(report.authorization).toEqual({
      freezeEightRowPolicy: true,
      paidMatrixExecution: false,
      efficiencyClaim: false,
      paidCallsUsed: 0,
    });
    expect(report.futureMeasurementRequired).toEqual([
      "eight-row recurring original-versus-reviewed-aot runtime",
      "research all-attempt cost ledger",
    ]);
    expect(JSON.parse(await readFile(join(outputDir, "report.json"), "utf8"))).toEqual(report);
  });
});
