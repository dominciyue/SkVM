import { describe, expect, test } from "bun:test";
import { buildN3SourceClosureReportFromRepository } from "./skill-family-current-v2-n3";

describe("current-v2 N3 source closure evidence", () => {
  test("replays real plans and all preregistered closure fault relations", async () => {
    const report = await buildN3SourceClosureReportFromRepository(process.cwd());
    expect(report.realTasks).toHaveLength(3);
    expect(report.realTasks.every((row) => row.closure.status === "passed")).toBe(true);
    expect(report.realSummary).toEqual({ tasks: 3, passed: 3, partial: 0, blocked: 0, referenceOccurrences: 12 });
    expect(report.syntheticCases).toHaveLength(8);
    expect(report.syntheticCases.every((row) => row.passed)).toBe(true);
    expect(report.syntheticSummary).toEqual({ cases: 8, passed: 8, failed: 0, checks: 13, checksPassed: 13 });
    expect(report.decision).toBe("passed");
    expect(report.protectedReads).toEqual({ heldOut: 0, q1Reserved: 0, prospective: 0 });
  });
});
