import { describe, expect, test } from "bun:test";
import {
  OptimizationCostAccountingReportSchema,
  buildOptimizationCostAccountingReport,
  type OptimizationCostAccountingInput,
} from "./optimization-cost-accounting";

const measured = (value: number) => ({ status: "measured" as const, value });
const missing = (reason: string) => ({ status: "missing" as const, value: null, reason });
const usage = (input: number, output: number, cacheRead = 0, cacheWrite = 0) => ({
  inputTokens: measured(input),
  outputTokens: measured(output),
  cacheReadTokens: measured(cacheRead),
  cacheWriteTokens: measured(cacheWrite),
});

function completeInput(): OptimizationCostAccountingInput {
  return {
    skillId: "fixture-skill",
    experimentId: "fixture-cost-accounting",
    quality: {
      equivalent: true,
      evidence: { path: "results/fixture/gate.json", sha256: "a".repeat(64) },
    },
    adaptation: {
      humanMinutes: 12,
      adapterLoc: 8,
      coreBranchDelta: 0,
      reusedArtifactKinds: ["checks", "schemas"],
      unautomatedSteps: [],
    },
    production: {
      oneTime: {
        compile: { modelTokens: measured(100), durationMs: measured(30) },
        profile: { modelTokens: measured(20), durationMs: measured(10) },
        package: { modelTokens: measured(30), durationMs: measured(5), bytes: measured(256) },
      },
      runtime: {
        original: { samples: 4, aggregateModelTokens: 400, aggregateDurationMs: 4000 },
        optimized: { samples: 4, aggregateModelTokens: 40, aggregateDurationMs: 400 },
        repairModelTokensPerRun: 0,
      },
    },
    research: {
      attempts: [
        {
          id: "qualification",
          kind: "qualification" as const,
          attempts: 1,
          usage: usage(20, 5),
          durationMs: measured(250),
        },
        {
          id: "development-matrix",
          kind: "matrix" as const,
          attempts: 8,
          usage: usage(600, 200, 100, 10),
          durationMs: measured(8000),
        },
      ],
      scorer: { modelTokens: measured(0), durationMs: measured(12) },
      repair: { modelTokens: measured(0), durationMs: measured(0) },
    },
    evidence: [{ path: "results/fixture/cost.json", sha256: "b".repeat(64) }],
  };
}

describe("optimization full-cost accounting", () => {
  test("publishes a strict report schema for downstream portfolio tooling", () => {
    const report = buildOptimizationCostAccountingReport(completeInput());
    expect(OptimizationCostAccountingReportSchema.parse(report)).toEqual(report);
    expect(() => OptimizationCostAccountingReportSchema.parse({
      ...report,
      breakEven: { status: "not-computable", calls: 1, missing: [] },
    })).toThrow();
  });

  test("computes N=1/2/5/10 and the first positive-call break-even when costs are complete", () => {
    const report = buildOptimizationCostAccountingReport(completeInput());

    expect(report.amortization).toEqual([
      { calls: 1, originalModelTokens: 100, optimizedModelTokens: 160, status: "computed" },
      { calls: 2, originalModelTokens: 200, optimizedModelTokens: 170, status: "computed" },
      { calls: 5, originalModelTokens: 500, optimizedModelTokens: 200, status: "computed" },
      { calls: 10, originalModelTokens: 1000, optimizedModelTokens: 250, status: "computed" },
    ]);
    expect(report.breakEven).toEqual({ status: "computed", calls: 2, missing: [] });
    expect(report.completeness).toEqual({
      productionCostComplete: true,
      allAttemptCostComplete: true,
      breakEvenComplete: true,
    });
    expect(report.eligibility).toEqual({
      classification: "efficiency-positive",
      efficiencyPositiveEligible: true,
      reasons: [],
    });
  });

  test("propagates missing one-time cost instead of treating zero runtime tokens as zero total cost", () => {
    const input = completeInput();
    input.production.oneTime.compile.modelTokens = missing("automatic compiler token cost was not observed");
    const report = buildOptimizationCostAccountingReport(input);

    expect(report.production.runtime.optimized.modelTokensPerRun).toBe(10);
    expect(report.amortization).toEqual([
      { calls: 1, originalModelTokens: 100, optimizedModelTokens: null, status: "missing" },
      { calls: 2, originalModelTokens: 200, optimizedModelTokens: null, status: "missing" },
      { calls: 5, originalModelTokens: 500, optimizedModelTokens: null, status: "missing" },
      { calls: 10, originalModelTokens: 1000, optimizedModelTokens: null, status: "missing" },
    ]);
    expect(report.breakEven).toEqual({
      status: "not-computable",
      calls: null,
      missing: ["production.oneTime.compile.modelTokens"],
    });
    expect(report.completeness.productionCostComplete).toBe(false);
    expect(report.eligibility.classification).toBe("fidelity-preserving");
  });

  test("keeps research all-attempt incompleteness separate from a computable production break-even", () => {
    const input = completeInput();
    input.research.attempts[0]!.usage = {
      inputTokens: missing("qualification usage was not persisted"),
      outputTokens: missing("qualification usage was not persisted"),
      cacheReadTokens: missing("qualification usage was not persisted"),
      cacheWriteTokens: missing("qualification usage was not persisted"),
    };
    const report = buildOptimizationCostAccountingReport(input);

    expect(report.breakEven).toEqual({ status: "computed", calls: 2, missing: [] });
    expect(report.completeness).toEqual({
      productionCostComplete: true,
      allAttemptCostComplete: false,
      breakEvenComplete: true,
    });
    expect(report.research.knownModelTokens).toBe(800);
    expect(report.research.knownCacheReadTokens).toBe(100);
    expect(report.research.knownCacheWriteTokens).toBe(10);
    expect(report.eligibility).toEqual({
      classification: "fidelity-preserving",
      efficiencyPositiveEligible: false,
      reasons: ["research all-attempt cost is incomplete"],
    });
  });
});
