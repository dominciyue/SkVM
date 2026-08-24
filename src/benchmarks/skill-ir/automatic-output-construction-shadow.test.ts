import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AutomaticOutputConstructionShadowCatalogSchema,
  AutomaticOutputConstructionShadowReportSchema,
  runAutomaticOutputConstructionShadow,
} from "./automatic-output-construction-shadow";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("automatic output construction shadow", () => {
  test("generates public-input-grounded outputs in two cases without claiming full semantics", async () => {
    const rootDir = process.cwd();
    const catalog = AutomaticOutputConstructionShadowCatalogSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/corpus/automatic-output-construction-shadow-v1.json"),
      "utf8",
    )));
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-output-shadow-out-"));
    temporaryDirectories.push(outDir);
    const report = await runAutomaticOutputConstructionShadow(rootDir, catalog, outDir, {
      measurementCompletedAt: "2026-08-24T11:00:00.000Z",
      meteredHumanMinutes: 41,
    });

    expect(report.candidateFreezeCompletedBeforeTaskOrEvaluatorRead).toBe(true);
    expect(report.costAccounting).toMatchObject({
      meteredScope: "shadow-integration-after-catalog-freeze",
      preMeasurementCoreWork: "not-measured",
      meteredHumanMinutes: 41,
    });
    expect(report.summary).toEqual({
      caseCount: 2,
      generatedFileCount: 3,
      projectedFieldCount: 3,
      unresolvedCount: 15,
      completeConstructionCases: 0,
      fullSemanticParityCases: 0,
      automaticEligibilityCases: 0,
      paidCalls: 0,
      heldOutAccesses: 0,
      compilerEvaluatorPayloadAccesses: 0,
      manualOracleReads: 2,
      coreBranchDelta: 0,
    });
    expect(report.cases.every((entry) => entry.construction.status === "partial")).toBe(true);
    expect(report.cases.every((entry) => entry.execution.processStatus === "complete")).toBe(true);
    expect(report.cases.every((entry) => entry.execution.packageStatus === "validation-failure")).toBe(true);
    expect(report.cases.every((entry) => entry.execution.generatedFilesWereAbsentInitially)).toBe(true);
    expect(report.cases.every((entry) => entry.relationExecution.baseline === "pass"
      && entry.relationExecution.mismatch === "fail")).toBe(true);
    expect(report.cases.every((entry) => entry.manualComparison.passedCriteria < entry.manualComparison.criterionCount)).toBe(true);
    expect(report.cases.every((entry) => entry.semanticParity === "not-established"
      && entry.automaticEligibility === false)).toBe(true);
    expect(report.reuseGate).toEqual({
      status: "passed",
      primitive: "source-field-projection",
      distinctPassingCases: 2,
      requiredDistinctCases: 2,
      coreBranchDelta: 0,
      fullDeclaredDomainPredicateParity: "not-established",
    });
    expect(AutomaticOutputConstructionShadowReportSchema.parse(report)).toEqual(report);
    const dishonest = structuredClone(report) as unknown as {
      summary: { automaticEligibilityCases: number };
    };
    dishonest.summary.automaticEligibilityCases = 1;
    expect(AutomaticOutputConstructionShadowReportSchema.safeParse(dishonest).success).toBe(false);
    const coreSource = await readFile(
      join(rootDir, "src/benchmarks/skill-ir/automatic-output-construction.ts"),
      "utf8",
    );
    expect(coreSource).not.toContain("experimental-design");
    expect(coreSource).not.toContain("i18n-helper");
    expect(JSON.parse(await readFile(join(outDir, "report.json"), "utf8"))).toEqual(report);
  }, 30_000);
});
