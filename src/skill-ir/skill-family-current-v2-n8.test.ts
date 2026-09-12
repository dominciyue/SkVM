import { describe, expect, test } from "bun:test";
import { runN8EngineEvidence } from "./skill-family-current-v2-n8";

describe("current-v2 N8 ordinary task engine", () => {
  test("runs outside research directories and proves task dimensions affect checked output", async () => {
    const report = await runN8EngineEvidence({ repositoryRoot: process.cwd() });
    expect(report.decision).toBe("passed");
    expect(report.cases).toHaveLength(4);
    expect(report.cases.every((row) => row.status === "completed" && row.packageCheck === "pass")).toBe(true);
    expect(report.relations).toMatchObject({
      requirementChangesArtifact: true,
      operationChangesArtifact: true,
      outputChangesBackend: true,
      bundleReplayMatchesBindings: true,
      documentedCliExecuted: true,
      productionV2RegressionPassed: true,
      repositoryAgnosticDispatch: true,
      projectModelCallsZero: true,
    });
    expect(report.accounting).toEqual({ loopbackHttpCalls: 0, remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0 });
  }, 30_000);
});
