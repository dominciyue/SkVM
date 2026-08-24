import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AutomaticJsonPointerConstructionShadowCatalogSchema,
  AutomaticJsonPointerConstructionShadowReportSchema,
  runAutomaticJsonPointerConstructionShadow,
} from "./automatic-json-pointer-construction-shadow";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("automatic JSON Pointer construction shadow", () => {
  test("reduces real unresolved work while quantifying the projection/query ceiling", async () => {
    const rootDir = process.cwd();
    const catalog = AutomaticJsonPointerConstructionShadowCatalogSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks/skill-ir/corpus/automatic-json-pointer-construction-shadow-v1.json"),
      "utf8",
    )));
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-json-pointer-shadow-out-"));
    temporaryDirectories.push(outDir);
    const report = await runAutomaticJsonPointerConstructionShadow(rootDir, catalog, outDir, {
      measurementCompletedAt: "2026-08-24T12:00:00.000Z",
      meteredHumanMinutes: 41,
    });

    expect(report.declarationAndClassificationFreezeCompletedBeforeCurrentRunTaskOrEvaluatorRead).toBe(true);
    expect(report.summary).toEqual({
      caseCount: 2,
      generatedFileCount: 3,
      baseProjectedFieldCount: 3,
      pointerCopiedFieldCount: 3,
      parentUnresolvedCount: 15,
      remainingUnresolvedCount: 12,
      completeConstructionCases: 0,
      fullSemanticParityCases: 0,
      automaticEligibilityCases: 0,
      paidCalls: 0,
      heldOutAccesses: 0,
      compilerEvaluatorPayloadAccesses: 0,
      manualOracleReads: 2,
      coreBranchDelta: 0,
    });
    expect(report.ceiling).toEqual({
      classificationCounts: {
        pointerProjectable: 1,
        selectorLookupProjectable: 1,
        needsDomainRuntime: 10,
      },
      projectableByProjectionOrQuery: 2,
      theoreticalProjectionQueryUnresolvedFloor: 10,
      selectorLookupImplemented: false,
      interpretation: "prospective-ceiling-not-implementation-evidence",
    });
    expect(report.cases.every((entry) => entry.construction.status === "partial")).toBe(true);
    expect(report.cases.every((entry) => entry.execution.processStatus === "complete"
      && entry.execution.packageStatus === "validation-failure"
      && entry.execution.protectedInputsPreserved)).toBe(true);
    expect(report.cases.every((entry) => entry.pointerRelationExecution.baseline === "pass"
      && entry.pointerRelationExecution.mismatch === "fail")).toBe(true);
    expect(report.cases.every((entry) => entry.manualComparison.passedCriteria < entry.manualComparison.criterionCount)).toBe(true);
    expect(report.cases.every((entry) => entry.semanticParity === "not-established"
      && entry.automaticEligibility === false)).toBe(true);
    expect(report.reuseGate).toEqual({
      status: "passed",
      primitive: "copy-json-value",
      distinctPassingCases: 2,
      requiredDistinctCases: 2,
      coreBranchDelta: 0,
      fullDeclaredDomainPredicateParity: "not-established",
    });
    expect(report.declarationAccounting).toMatchObject({
      baseTaskDescriptionLoc: 48,
      jsonPointerDeclarationLoc: 51,
      combinedLoc: 99,
      baseSemanticEntries: 38,
      jsonPointerSemanticEntries: 3,
      combinedSemanticEntries: 41,
      allCasesWithinThinLimit: true,
      meteredHumanMinutes: 41,
      coreBranchDelta: 0,
    });
    expect(AutomaticJsonPointerConstructionShadowReportSchema.parse(report)).toEqual(report);
    const dishonest = structuredClone(report);
    dishonest.ceiling.classificationCounts.needsDomainRuntime = 9;
    expect(AutomaticJsonPointerConstructionShadowReportSchema.safeParse(dishonest).success).toBe(false);
    const coreSource = await readFile(
      join(rootDir, "src/benchmarks/skill-ir/automatic-json-pointer-construction.ts"),
      "utf8",
    );
    expect(coreSource).not.toContain("experimental-design");
    expect(coreSource).not.toContain("i18n-helper");
    expect(JSON.parse(await readFile(join(outDir, "report.json"), "utf8"))).toEqual(report);
  }, 30_000);
});
