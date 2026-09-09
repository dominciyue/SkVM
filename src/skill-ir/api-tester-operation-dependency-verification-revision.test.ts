import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  API_TESTER_OPERATION_DEPENDENCY_REVISION_CONTRACT_PATH,
  API_TESTER_OPERATION_DEPENDENCY_REVISION_IDENTITY,
  ApiTesterOperationDependencyRevisionContractSchema,
  compareApiTesterOperationDependencyRevisionResults,
  evaluateApiTesterOperationDependencyRevisionCases,
} from "./api-tester-operation-dependency-verification-revision";

const OLD_REPORT_PATH = "results/skill-ir/api-tester-operation-admission-development-001/report.json";

describe("API Tester operation dependency-verification revision", () => {
  test("binds the review baseline, old report, exact cases, and protected boundary", async () => {
    const contract = ApiTesterOperationDependencyRevisionContractSchema.parse(JSON.parse(
      await readFile(API_TESTER_OPERATION_DEPENDENCY_REVISION_CONTRACT_PATH, "utf8"),
    ));
    expect(contract.identity).toBe(API_TESTER_OPERATION_DEPENDENCY_REVISION_IDENTITY);
    expect(contract.reviewBaseline.commit).toBe("d2e748868a3c5e88b49cb940d4cd495f7b4dcf68");
    expect(contract.reviewBaseline.task1Report.path).toBe(OLD_REPORT_PATH);
    expect(contract.cases.map((entry) => entry.case)).toEqual([
      "unchanged-projection-control",
      "response-component-schema-drift",
      "nested-parameter-schema-drift",
      "same-name-api-key-scheme-drift",
    ]);
    expect(contract.policy).toMatchObject({
      realDocuments: 6,
      prospectiveRuns: 0,
      heldOutAccesses: 0,
      q1ReservedAccesses: 0,
      readinessChanges: 0,
      networkAllowed: false,
    });
  });

  test("records three baseline misses and detects them after the repair while the control passes", () => {
    const cases = evaluateApiTesterOperationDependencyRevisionCases();
    expect(cases.map((entry) => ({
      case: entry.case,
      baselineStatus: entry.baselineStatus,
      repairedStatus: entry.repairedStatus,
      detected: entry.detected,
    }))).toEqual([
      { case: "unchanged-projection-control", baselineStatus: "pass", repairedStatus: "pass", detected: true },
      { case: "response-component-schema-drift", baselineStatus: "pass", repairedStatus: "fail", detected: true },
      { case: "nested-parameter-schema-drift", baselineStatus: "pass", repairedStatus: "fail", detected: true },
      { case: "same-name-api-key-scheme-drift", baselineStatus: "pass", repairedStatus: "fail", detected: true },
    ]);
    expect(cases[1]!.repairedErrors).toEqual(expect.arrayContaining(["REFERENCE_DEPENDENCY_LOST", "RESPONSE_DEPENDENCY_LOST"]));
    expect(cases[1]!.dimensions.constructionObligations).toBe("pass");
    expect(cases[2]!.repairedErrors).toEqual(expect.arrayContaining(["PARAMETER_DEPENDENCY_LOST", "REFERENCE_DEPENDENCY_LOST"]));
    expect(cases[3]!.repairedErrors).toContain("SECURITY_DEPENDENCY_LOST");
  });

  test("derives every old/fresh comparison denominator from the verified reports", async () => {
    const comparison = await compareApiTesterOperationDependencyRevisionResults({
      rootDir: join(import.meta.dir, "..", ".."),
      baselineReportPath: OLD_REPORT_PATH,
      freshReportPath: OLD_REPORT_PATH,
    });
    const baseline = JSON.parse(await readFile(OLD_REPORT_PATH, "utf8")) as {
      totals: { operations: number; accepted: number; artifactCheckedPassedOperations: number };
      obligationCoverage: { total: number; covered: number; uncovered: number; status: "pass" | "fail" | "not-applicable" };
    };
    expect(comparison.status).toBe("pass");
    expect(comparison.totals.baseline.operations).toBe(baseline.totals.operations);
    expect(comparison.totals.baseline.accepted).toBe(baseline.totals.accepted);
    expect(comparison.totals.baseline.checkerPassed).toBe(baseline.totals.artifactCheckedPassedOperations);
    expect(comparison.totals.baseline.obligations).toEqual(baseline.obligationCoverage);
    expect(comparison.documents).toHaveLength(6);
    expect(comparison.documents.every((entry) => Object.values(entry.checks).every(Boolean))).toBe(true);
  });
});
