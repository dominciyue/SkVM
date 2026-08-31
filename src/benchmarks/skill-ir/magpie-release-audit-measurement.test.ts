import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  buildMagpieReleaseAuditMeasurementTasks,
  buildMagpieReleaseAuditOrderedRows,
  canonicalizeMagpieMeasurementFreezeText,
  loadAndValidateMagpieReleaseAuditMeasurement,
} from "./magpie-release-audit-measurement";

const rootDir = resolve(import.meta.dir, "../../..");

describe("Magpie release-audit frozen measurement inputs", () => {
  test("makes text references Git-checkout stable without weakening raw upstream authority", () => {
    const lf = Buffer.from("alpha\nbeta\n", "utf8");
    const crlf = Buffer.from("alpha\r\nbeta\r\n", "utf8");
    const loneCr = Buffer.from("alpha\rbeta\n", "utf8");

    expect(canonicalizeMagpieMeasurementFreezeText(crlf)).toEqual(lf);
    expect(canonicalizeMagpieMeasurementFreezeText(loneCr)).toEqual(loneCr);
  });

  test("builds nine exact public prompts with no checker oracle leakage", async () => {
    const tasks = await buildMagpieReleaseAuditMeasurementTasks(rootDir);
    expect(tasks.schemaVersion).toBe("skill-ir-magpie-release-audit-measurement-tasks/v1");
    expect(tasks.tasks).toHaveLength(9);
    expect(new Set(tasks.tasks.map((task) => task.promptSha256)).size).toBe(9);
    expect(tasks.tasks.every((task) => task.split === "public-development")).toBe(true);
    expect(tasks.tasks.every((task) => task.promptInputPaths.every((path) => !path.includes("checker-oracle")))).toBe(true);
    expect(tasks.tasks.every((task) => !task.prompt.includes("Answer yes or no."))).toBe(true);
    expect(tasks.tasks.every((task) => !task.prompt.includes("has_injection_flagged_correctly"))).toBe(true);
  });

  test("freezes complete task-repetition pairs in deterministic order", () => {
    const rows = buildMagpieReleaseAuditOrderedRows();
    expect(rows).toHaveLength(36);
    expect(rows.filter((row) => row.system === "original")).toHaveLength(18);
    expect(rows.filter((row) => row.system === "reviewed-artifact")).toHaveLength(18);
    expect(rows.slice(0, 4)).toEqual([
      { caseId: "step-0-preflight/case-1-clean-pass", repetition: 1, system: "original", paid: true },
      { caseId: "step-0-preflight/case-1-clean-pass", repetition: 1, system: "reviewed-artifact", paid: false },
      { caseId: "step-0-preflight/case-1-clean-pass", repetition: 2, system: "original", paid: true },
      { caseId: "step-0-preflight/case-1-clean-pass", repetition: 2, system: "reviewed-artifact", paid: false },
    ]);
  });

  test("revalidates the persisted policy closure and denominator before execution", async () => {
    const loaded = await loadAndValidateMagpieReleaseAuditMeasurement(rootDir);

    expect(loaded.policy.authorization.currentPaidRows).toBe(0);
    expect(loaded.policy.denominator.orderedRows).toEqual(buildMagpieReleaseAuditOrderedRows());
    expect(loaded.policy.costBoundary.researchAllAttemptCostComplete).toBe(false);
    expect(loaded.policy.authorization.portfolioPromotion).toBe(false);
    expect(loaded.policy.authorization.readinessPromotion).toBe(false);
  });
});
