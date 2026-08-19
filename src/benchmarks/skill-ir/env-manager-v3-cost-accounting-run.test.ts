import { describe, expect, test } from "bun:test";
import path from "node:path";
import { buildEnvManagerV3CostAccountingReport } from "./env-manager-v3-cost-accounting-run";

const rootDir = path.resolve(import.meta.dir, "../../..");

describe("Env Manager v3 full-cost accounting adapter", () => {
  test("binds tracked evidence and preserves every historical missing cost", async () => {
    const report = await buildEnvManagerV3CostAccountingReport(rootDir);

    expect(report.quality.equivalent).toBe(true);
    expect(report.adaptation).toMatchObject({
      humanMinutes: 214,
      adapterLoc: 25,
      coreBranchDelta: 0,
    });
    expect(report.production.runtime).toMatchObject({
      original: { samples: 4, aggregateModelTokens: 197606, modelTokensPerRun: 49401.5 },
      optimized: { samples: 4, aggregateModelTokens: 0, modelTokensPerRun: 0 },
    });
    expect(report.production.oneTime).toMatchObject({
      compile: {
        modelTokens: { status: "missing", value: null },
        durationMs: { status: "missing", value: null },
      },
      profile: {
        modelTokens: { status: "measured", value: 0 },
        durationMs: { status: "measured", value: 0 },
      },
      package: {
        modelTokens: { status: "measured", value: 0 },
        durationMs: { status: "missing", value: null },
        bytes: { status: "measured", value: 29652 },
      },
    });
    expect(report.research.attempts.map((attempt) => attempt.id)).toEqual([
      "baseline-v1-operator-launch",
      "baseline-v2-operator-launch",
      "baseline-v3-operator-termination",
      "baseline-v4-qualification",
      "baseline-v4-matrix",
      "static-v1-qualification",
      "static-v1-matrix",
      "artifact-v1-qualification",
      "artifact-v1-matrix",
    ]);
    expect(report.research.attempts.find((attempt) => attempt.id === "baseline-v4-matrix"))
      .toMatchObject({
        attempts: 8,
        durationMs: { status: "measured", value: 634591 },
        selected: { attempts: 8, durationMs: { status: "measured", value: 634591 } },
      });
    expect(report.research.attempts.find((attempt) => attempt.id === "static-v1-matrix"))
      .toMatchObject({ attempts: 12, durationMs: { status: "measured", value: 1121892 } });
    expect(report.research.missing).toContain(
      "research.attempts.baseline-v3-operator-termination.usage.inputTokens",
    );
    expect(report.research.missing).toContain(
      "research.attempts.static-v1-qualification.usage.inputTokens",
    );
    expect(report.breakEven).toEqual({
      status: "not-computable",
      calls: null,
      missing: ["production.oneTime.compile.modelTokens"],
    });
    expect(report.amortization.map((row) => [row.calls, row.originalModelTokens, row.optimizedModelTokens]))
      .toEqual([[1, 49401.5, null], [2, 98803, null], [5, 247007.5, null], [10, 494015, null]]);
    expect(report.completeness).toEqual({
      productionCostComplete: false,
      allAttemptCostComplete: false,
      breakEvenComplete: false,
    });
    expect(report.eligibility.classification).toBe("fidelity-preserving");
    expect(report.eligibility.efficiencyPositiveEligible).toBe(false);
    expect(report.evidence.every((ref) => !path.isAbsolute(ref.path) && !ref.path.includes("\\"))).toBe(true);
  });
});
