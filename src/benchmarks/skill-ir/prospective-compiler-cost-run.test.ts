import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  ProspectiveCompilerCostCanaryReportSchema,
  buildProspectiveCompilerCostCanaryReport,
} from "./prospective-compiler-cost-run";

const rootDir = path.resolve(import.meta.dir, "../../..");

describe("prospective compiler cost canary runner", () => {
  test("measures both existing compilers without promoting manual construction to automatic cost", async () => {
    const report = await buildProspectiveCompilerCostCanaryReport(rootDir);

    expect(ProspectiveCompilerCostCanaryReportSchema.parse(report)).toEqual(report);
    expect(report.summary).toEqual({
      caseCount: 2,
      packageCount: 4,
      byteParityCount: 4,
      automaticCostEligibleCount: 0,
      mechanismOnlyCount: 2,
      modelCalls: 0,
      aggregateModelTokens: 0,
      ready: true,
    });
    expect(report.cases.map((item) => item.cost.identity.skillId)).toEqual([
      "api-tester",
      "env-manager-v3",
    ]);
    expect(report.cases.every((item) => item.cost.eligibility.status === "mechanism-only")).toBe(true);
    expect(report.cases.every((item) => item.cost.summary.durationMs > 0)).toBe(true);
    expect(report.cases.flatMap((item) => item.frozenPackageParity).every((item) => item.byteParity)).toBe(true);
    expect(report.cases.every((item) => {
      const runtimePaths = item.cost.identity.evidence.catalogRuntime.map((entry) => entry.relativePath);
      return runtimePaths.includes("src/benchmarks/skill-ir/prospective-compiler-cost.ts")
        && runtimePaths.includes("src/benchmarks/skill-ir/prospective-compiler-cost-run.ts");
    })).toBe(true);
    expect(JSON.stringify(report)).not.toContain(rootDir);
  }, 120_000);
});
