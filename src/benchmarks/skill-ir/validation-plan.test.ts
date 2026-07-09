import { describe, expect, test } from "bun:test";
import { buildValidationPlan, planForModelFamily } from "./validation-plan";
import type { ModelFamilyPromotionProfile, PromotionReport } from "./promotion-policy";

function profile(
  decision: ModelFamilyPromotionProfile["decision"],
  overrides: Partial<ModelFamilyPromotionProfile> = {},
): ModelFamilyPromotionProfile {
  return {
    modelFamily: overrides.modelFamily ?? "gpt",
    modelLabels: overrides.modelLabels ?? ["gpt41nano"],
    baselineSystem: "ir-profile",
    candidateSystem: "ir-pgo",
    bestSystem: decision === "promote-ir-pgo" ? "ir-pgo" : "ir-profile",
    decision,
    confidence: overrides.confidence ?? 0.68,
    riskScore: overrides.riskScore ?? 0.12,
    totalRows: overrides.totalRows ?? 18,
    infraRows: overrides.infraRows ?? 0,
    infrastructureRate: overrides.infrastructureRate ?? 0,
    semanticRows: overrides.semanticRows ?? 18,
    pairedCases: overrides.pairedCases ?? 6,
    pairedDelta: overrides.pairedDelta ?? 0.1667,
    irPgoGains: overrides.irPgoGains ?? 1,
    irPgoRegressions: overrides.irPgoRegressions ?? 0,
    baselineSuccessRate: overrides.baselineSuccessRate ?? 0.8333,
    candidateSuccessRate: overrides.candidateSuccessRate ?? 1,
    tokenCostIncreaseRatio: overrides.tokenCostIncreaseRatio ?? 0.2,
    latencyIncreaseRatio: overrides.latencyIncreaseRatio ?? -0.1,
    systemStats: [],
    reasons: overrides.reasons ?? [],
  };
}

function report(profiles: ModelFamilyPromotionProfile[]): PromotionReport {
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
    modelFamilies: profiles,
  };
}

describe("validation planner", () => {
  test("treats promote-ir-pgo as candidate regression validation, not automatic adoption", () => {
    const plan = planForModelFamily(profile("promote-ir-pgo"));

    expect(plan.planningState).toBe("candidate-regression-validation");
    expect(plan.recommendedArtifact).toBe("ir-pgo-candidate");
    expect(plan.adoptionReadiness).toBe("experimental-candidate");
    expect(plan.actions.map((action) => action.kind)).toContain("periodic-regression-validation");
    expect(plan.actions.map((action) => action.kind)).toContain("paired-heldout-validation");
    expect(plan.caveats).toContain("promotion signal is advisory and does not rewrite base corpus IR");
  });

  test("turns keep-ir-profile into static baseline plus final-IR repair work", () => {
    const plan = planForModelFamily(
      profile("keep-ir-profile", {
        modelFamily: "qwen",
        modelLabels: ["qwen38b"],
        confidence: 0.66,
        riskScore: 0.23,
        pairedDelta: -0.3333,
        irPgoRegressions: 2,
        baselineSuccessRate: 0.8333,
        candidateSuccessRate: 0.5,
      }),
    );

    expect(plan.planningState).toBe("static-baseline-preferred");
    expect(plan.recommendedArtifact).toBe("ir-profile-current-baseline");
    expect(plan.actions.map((action) => action.kind)).toEqual(
      expect.arrayContaining(["final-ir-regression-audit", "output-schema-learning", "model-family-profile-learning"]),
    );
  });

  test("turns infrastructure-heavy hold signals into route health and held-out validation", () => {
    const plan = planForModelFamily(
      profile("hold-for-more-validation", {
        modelFamily: "gemini",
        modelLabels: ["gemini25flash"],
        confidence: 0.61,
        riskScore: 0.11,
        infraRows: 6,
        infrastructureRate: 0.3333,
        pairedDelta: 0,
        reasons: ["infrastructure rate 0.33 exceeds 0.25"],
      }),
    );

    expect(plan.planningState).toBe("needs-route-health-and-heldout-validation");
    expect(plan.recommendedArtifact).toBe("undecided");
    expect(plan.actions.map((action) => action.kind)).toEqual(
      expect.arrayContaining(["route-probe", "paired-heldout-validation"]),
    );
  });

  test("adds evidence and corpus expansion actions for narrow or low-confidence evidence", () => {
    const plan = planForModelFamily(
      profile("promote-ir-pgo", {
        confidence: 0.42,
        pairedCases: 2,
        semanticRows: 6,
      }),
      { minPairedCasesForMatureClaim: 6, minConfidenceForMatureClaim: 0.75 },
    );

    expect(plan.actions.map((action) => action.kind)).toEqual(
      expect.arrayContaining(["expand-evidence", "corpus-expansion"]),
    );
    expect(plan.adoptionReadiness).toBe("not-ready");
  });

  test("buildValidationPlan keeps report-level metadata and family plans", () => {
    const validationPlan = buildValidationPlan(
      report([
        profile("promote-ir-pgo", { modelFamily: "gpt" }),
        profile("keep-ir-profile", { modelFamily: "qwen" }),
      ]),
      { generatedAt: "2026-07-09T01:00:00.000Z" },
    );

    expect(validationPlan.schemaVersion).toBe("skill-ir-validation-plan/v1");
    expect(validationPlan.sourceReport.generatedAt).toBe("2026-07-09T00:00:00.000Z");
    expect(validationPlan.modelFamilies.map((entry) => entry.modelFamily)).toEqual(["gpt", "qwen"]);
  });
});
