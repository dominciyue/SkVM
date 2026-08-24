import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { customEvaluators } from "../../framework/types";
import {
  StructuralExecutionShadowCatalogSchema,
  StructuralExecutionShadowReportSchema,
  runStructuralExecutionShadow,
} from "./automatic-structural-execution-shadow";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("automatic structural execution shadow", () => {
  test("runs zero-paid execution parity for all seven frozen cases and preserves honest boundaries", async () => {
    const rootDir = process.cwd();
    const catalogPath = join(rootDir, "benchmarks/skill-ir/corpus/automatic-structural-execution-shadow-v1.json");
    const rawCatalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
      cases: Array<{ manualEvaluatorModule?: { path?: string; sha256?: string } }>;
    };
    const manualCheckerSource = await readFile(
      join(rootDir, "src/benchmarks/skill-ir/automatic-structural-manual-checker.ts"),
      "utf8",
    );
    expect(manualCheckerSource).not.toContain("bench/evaluators/");
    expect(rawCatalog.cases.every((entry) => entry.manualEvaluatorModule?.path && entry.manualEvaluatorModule.sha256)).toBe(true);
    const catalog = StructuralExecutionShadowCatalogSchema.parse(rawCatalog);
    expect(catalog.cases).toHaveLength(7);
    const evaluatorRegistryBefore = new Map(customEvaluators);
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-structural-shadow-out-"));
    temporaryDirectories.push(outDir);
    const report = await runStructuralExecutionShadow(rootDir, catalog, outDir, {
      measurementCompletedAt: "2026-08-24T12:00:00.000Z",
    });

    expect(report.candidateFreezeCompletedBeforeTaskOrEvaluatorRead).toBe(true);
    expect(report.summary).toMatchObject({
      caseCount: 7,
      genericPredicateCount: 19,
      scenarioExecutionCount: 33,
      paidCalls: 0,
      heldOutAccesses: 0,
      coreBranchDelta: 0,
      casesWithPassingStructuralBaseline: 7,
      semanticParity: "not-established",
    });
    expect(report.cases.every((entry) => entry.scenarios.find((scenario) => scenario.id === "baseline")?.automatic.status === "pass")).toBe(true);
    expect(report.cases.every((entry) => entry.scenarios.find((scenario) => scenario.id === "input-tamper")?.automatic.expectedViolationDetected)).toBe(true);
    expect(report.cases.every((entry) => entry.scenarios.find((scenario) => scenario.id === "missing-output")?.automatic.expectedViolationDetected)).toBe(true);
    expect(report.cases.every((entry) => entry.scenarios.find((scenario) => scenario.id === "extra-output")?.automatic.expectedViolationDetected)).toBe(true);
    expect(report.cases.filter((entry) => (entry.structuralPredicateCounts["json-shape"] ?? 0) > 0)
      .every((entry) => entry.scenarios.find((scenario) => scenario.id === "json-shape-drift")?.automatic.expectedViolationDetected)).toBe(true);
    expect(report.cases.flatMap((entry) => entry.manualComparisons).some((entry) => entry.comparability === "exact")).toBe(true);
    expect(report.cases.flatMap((entry) => entry.manualComparisons).some((entry) => entry.comparability === "domain-bundled")).toBe(true);
    expect(report.cases.flatMap((entry) => entry.manualComparisons).every((entry) =>
      entry.observedAgreementCount + entry.observedDifferenceCount + entry.manualInfrastructureCount === entry.observed.length)).toBe(true);
    expect(report.domainProbe).toMatchObject({
      predicate: "cross-artifact-consistency",
      probeExecution: { baseline: "pass", mismatch: "fail" },
      coreBranchDelta: 0,
      productionGeneralization: "not-established",
      semanticParity: "not-established",
    });
    expect(StructuralExecutionShadowReportSchema.parse(report)).toEqual(report);
    const dishonestSummary = structuredClone(report);
    dishonestSummary.summary.genericPredicateCount += 1;
    expect(StructuralExecutionShadowReportSchema.safeParse(dishonestSummary).success).toBe(false);
    expect(JSON.parse(await readFile(join(outDir, "report.json"), "utf8"))).toEqual(report);
    expect([...customEvaluators.entries()]).toEqual([...evaluatorRegistryBefore.entries()]);
  }, 30_000);
});
