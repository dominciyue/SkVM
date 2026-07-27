import { describe, expect, test } from "bun:test";
import path from "node:path";
import { runExperimentalDesignV2MaterializationAudit } from "./experimental-design-v2-materialization-audit.ts";

const rootDir = path.resolve(import.meta.dir, "../../..");

describe("experimental-design v2 production materialization audit", () => {
  test("validates no-skill and original initial trees through the production preparer", async () => {
    const report = await runExperimentalDesignV2MaterializationAudit(rootDir);

    expect(report.status).toBe("passed");
    expect(report.contractRevision).toBe("materialized-delta/v1");
    expect(report.counts).toEqual({ tasks: 2, arms: 4, checks: 36, passed: 36 });
    expect(report.arms).toHaveLength(4);
    expect(report.arms.every((arm) => arm.status === "passed")).toBe(true);
    expect(
      report.arms
        .filter((arm) => arm.system === "original")
        .every((arm) => arm.sourceResourceFiles > 0),
    ).toBe(true);
    expect(
      report.arms
        .filter((arm) => arm.system === "no-skill")
        .every((arm) => arm.sourceResourceFiles === 0),
    ).toBe(true);
    expect(report.issues).toEqual([]);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(rootDir);
    expect(serialized).not.toContain("heldout");
    expect(serialized).not.toContain("TEST_ONLY_");
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9]{10,}/u);
  });
});
