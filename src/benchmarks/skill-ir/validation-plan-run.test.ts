import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildValidationPlanFromArgs, parseValidationPlanArgs } from "./validation-plan-run";
import type { PromotionReport } from "./promotion-policy";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function promotionReport(): PromotionReport {
  return {
    schemaVersion: "skill-ir-promotion/v1",
    generatedAt: "2026-07-09T00:00:00.000Z",
    options: {
      baselineSystem: "ir-profile",
      candidateSystem: "ir-pgo",
      minPairedCases: 4,
      maxInfrastructureRate: 0.25,
      maxTokenCostIncreaseRatio: 0.5,
      maxLatencyIncreaseRatio: 0.5,
    },
    modelFamilies: [
      {
        modelFamily: "gpt",
        modelLabels: ["gpt41nano"],
        baselineSystem: "ir-profile",
        candidateSystem: "ir-pgo",
        bestSystem: "ir-pgo",
        decision: "promote-ir-pgo",
        confidence: 0.68,
        riskScore: 0.05,
        totalRows: 18,
        infraRows: 0,
        infrastructureRate: 0,
        semanticRows: 18,
        pairedCases: 6,
        pairedDelta: 0.1667,
        irPgoGains: 1,
        irPgoRegressions: 0,
        baselineSuccessRate: 0.8333,
        candidateSuccessRate: 1,
        tokenCostIncreaseRatio: 0.3,
        latencyIncreaseRatio: -0.1,
        systemStats: [],
        reasons: ["ir-pgo improves held-out paired success without regressions"],
      },
    ],
  };
}

describe("validation-plan-run", () => {
  test("parseValidationPlanArgs reads input, output, and thresholds", () => {
    const args = parseValidationPlanArgs([
      "--promotion-report=results/promotion.json",
      "--out=results/validation-plan.json",
      "--min-paired-cases=8",
      "--min-confidence=0.7",
      "--max-infrastructure-rate=0.2",
    ]);

    expect(args.promotionReport).toBe("results/promotion.json");
    expect(args.out).toBe("results/validation-plan.json");
    expect(args.options.minPairedCasesForMatureClaim).toBe(8);
    expect(args.options.minConfidenceForMatureClaim).toBe(0.7);
    expect(args.options.maxInfrastructureRateForRouteHealth).toBe(0.2);
  });

  test("buildValidationPlanFromArgs writes a dry-run validation plan", async () => {
    const dir = await mkdtemp(join(tmpdir(), "skill-ir-validation-plan-"));
    tempDirs.push(dir);
    const promotionPath = join(dir, "promotion.json");
    const outPath = join(dir, "validation-plan.json");
    await writeFile(promotionPath, `${JSON.stringify(promotionReport(), null, 2)}\n`, "utf8");

    const plan = await buildValidationPlanFromArgs({
      promotionReport: promotionPath,
      out: outPath,
      options: {},
    });

    expect(plan.schemaVersion).toBe("skill-ir-validation-plan/v1");
    expect(plan.modelFamilies[0]?.planningState).toBe("candidate-regression-validation");
    expect(JSON.parse(await Bun.file(outPath).text()).schemaVersion).toBe("skill-ir-validation-plan/v1");
  });
});
