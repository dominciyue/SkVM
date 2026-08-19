import { describe, expect, test } from "bun:test";

describe("pilot lifecycle shadow parity", () => {
  test("preserves two positive pilots and blocks the disclosure canary before paid work", async () => {
    const module = await import("./pilot-lifecycle-shadow-run");
    const report = await module.runDefaultPilotLifecycleShadowParity(process.cwd());

    expect(report.summary).toEqual({
      caseCount: 3,
      positiveParityCount: 2,
      negativeCanaryCount: 1,
      packageCount: 4,
      byteParityCount: 4,
      planParityCount: 2,
      reportParityCount: 2,
      coreBranchDelta: 0,
      paidCalls: 0,
      ready: true,
    });

    expect(report.cases.map((entry: { adapterId: string; decision: string }) => ({
      adapterId: entry.adapterId,
      decision: entry.decision,
    }))).toEqual([
      { adapterId: "api-tester-development", decision: "quality-positive" },
      { adapterId: "env-manager-v3-development", decision: "fidelity-preserving" },
      { adapterId: "statistical-power-development", decision: "measurement-invalid" },
    ]);

    const positive = report.cases.slice(0, 2);
    expect(positive.map((entry) => entry.shadow.adapterBuilderLoads)).toEqual([1, 1]);
    expect(positive.map((entry) => entry.shadow.adapterBuilderCalls)).toEqual([0, 0]);
    expect(positive.map((entry) => entry.shadow.logicalPlanBuilds)).toEqual([1, 1]);

    const canary = report.cases[2]!;
    expect(canary.blocker).toBe("public-scorer-schema-underdetermined");
    expect(canary.stages.find((stage: { id: string }) => stage.id === "disclosure")?.status)
      .toBe("failed");
    expect(canary.shadow.adapterBuilderLoads).toBe(0);
    expect(canary.shadow.adapterBuilderCalls).toBe(0);
    expect(canary.shadow.logicalPlanBuilds).toBe(0);
    expect(canary.paidCalls.total).toBe(0);
  }, 120_000);
});
