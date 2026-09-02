import { describe, expect, test } from "bun:test";
import { MAGPIE_RELEASE_AUDIT_CASE_IDS } from "./magpie-release-audit-step2";
import {
  StageMFrozenMagpiePanelLockSchema,
  buildStageMQualification,
  buildStageMMatrixReport,
  assertStageMMatrixAuthorized,
  type StageMFrozenMagpiePanelLock,
  type StageMQualificationRow,
} from "./stage-m-frozen-magpie-panel";

const routes = [
  { family: "gpt" as const, route: "xty/gpt-5.6-sol" },
  { family: "claude" as const, route: "xty/claude-opus-4-8" },
  { family: "deepseek" as const, route: "xty/deepseek-v4-pro" },
];

const cases = [...MAGPIE_RELEASE_AUDIT_CASE_IDS];

function makeLock(): StageMFrozenMagpiePanelLock {
  return StageMFrozenMagpiePanelLockSchema.parse({
    schemaVersion: "skill-ir-stage-m-frozen-magpie-cross-model-panel-lock/v1",
    status: "preregistered",
    experimentId: "skill-ir-stage-m-frozen-magpie-cross-model-panel-001",
    artifact: {
      productConfig: {
        path: "benchmarks/skill-ir/pilots/magpie-release-audit/verified-artifact-product-machine-checked.json",
        sha256: "a".repeat(64),
      },
      productReport: {
        path: "results/skill-ir/verified-artifact-product-magpie-machine-checked-2026-09-01/report.json",
        sha256: "b".repeat(64),
      },
      checker: {
        path: "src/benchmarks/skill-ir/verified-artifact-product-magpie-checker.ts",
        sha256: "c".repeat(64),
      },
      closureSha256: "d".repeat(64),
      checkerAuthority: "p2-gold-digest-output-regression",
    },
    inputs: {
      measurementTasks: {
        path: "benchmarks/skill-ir/pilots/magpie-release-audit/measurement-tasks-executable-bound.json",
        sha256: "9".repeat(64),
      },
      upstreamCommit: "453dd9f20bdebe9d4458d84682bd707be1414f80",
      split: "public-development",
    },
    models: routes,
    cases: cases.map((caseId) => ({ caseId, split: "public-development" as const })),
    harness: {
      adapter: "pi", adapterVersion: "0.67.68", adapterConfig: "managed", environment: "windows", context: "clean",
      absoluteTimeoutMs: 600000, idleTimeoutMs: 120000, maxSteps: 30, outerWatchdogMs: 660000, retries: 0,
    },
    matrix: {
      modelSystems: ["original"], artifactSystem: "frozen-artifact", repetitions: 1,
      expectedCases: 9, expectedModelRows: 27, expectedArtifactRows: 9, expectedLogicalRows: 36,
      order: "family-then-case",
    },
    qualification: { expectedRowsPerFamily: 9, requiredUsage: true, matrixRequiresAllFamilies: true },
    claims: {
      heldOutAllowed: false, promotionAllowed: false, readinessMutationAllowed: false,
      crossModelGeneralization: "not-established",
    },
    prohibited: ["artifact-or-package-mutation", "retry-or-replacement", "held-out", "model-family-deletion"],
  });
}

function completeRows(family: StageMQualificationRow["family"]): StageMQualificationRow[] {
  return cases.map((caseId, index) => ({
    family,
    caseId,
    status: "complete",
    classification: "semantic-complete",
    usageAvailable: true,
    usage: { available: true, input: 100 + index, output: 10 + index, cacheRead: 0, cacheWrite: 0 },
    durationMs: 1_000 + index,
  }));
}

describe("Stage M frozen Magpie cross-model panel contract", () => {
  test("has an independent lock identity and exact 9 x 3 x (original + artifact) denominator", () => {
    const lock = makeLock();
    expect(lock.experimentId).toBe("skill-ir-stage-m-frozen-magpie-cross-model-panel-001");
    expect(lock.matrix).toMatchObject({ expectedCases: 9, expectedModelRows: 27, expectedArtifactRows: 9, expectedLogicalRows: 36 });
    expect(lock.artifact.checkerAuthority).toBe("p2-gold-digest-output-regression");
    expect(() => StageMFrozenMagpiePanelLockSchema.parse({ ...lock, experimentId: "skill-ir-three-family-development-panel-v4" })).toThrow();
  });

  test("only authorizes the matrix when every family completes its full preregistered denominator", () => {
    const lock = makeLock();
    const passed = buildStageMQualification({
      lock, lockSha256: "d".repeat(64),
      families: routes.map((route) => ({ ...route, expectedRows: 9, observedRows: 9, missingCaseIds: [], rows: completeRows(route.family) })),
    });
    expect(passed.status).toBe("passed");
    expect(passed.matrixAuthorized).toBe(true);

    const failed = buildStageMQualification({
      lock, lockSha256: "d".repeat(64),
      families: routes.map((route) => ({ ...route, expectedRows: 9, observedRows: route.family === "deepseek" ? 8 : 9, missingCaseIds: route.family === "deepseek" ? [cases[8]!] : [], rows: route.family === "deepseek" ? completeRows(route.family).slice(0, 8) : completeRows(route.family) })),
    });
    expect(failed.status).toBe("failed");
    expect(failed.matrixAuthorized).toBe(false);
    expect(failed.families.deepseek.missingCaseIds).toEqual([cases[8]!]);
    expect(() => assertStageMMatrixAuthorized(failed, "d".repeat(64))).toThrow("not authorized");
  });

  test("keeps failed rows in the unique matrix denominator and does not silently replace them", () => {
    const lock = makeLock();
    const qualification = buildStageMQualification({
      lock, lockSha256: "e".repeat(64),
      families: routes.map((route) => ({ ...route, expectedRows: 9, observedRows: 9, missingCaseIds: [], rows: completeRows(route.family) })),
    });
    assertStageMMatrixAuthorized(qualification, "e".repeat(64));
    const report = buildStageMMatrixReport({
      lock, lockSha256: "e".repeat(64), qualification,
      modelRows: routes.flatMap((route) => cases.map((caseId) => ({
        family: route.family,
        route: route.route,
        caseId,
        status: "complete" as const,
        classification: "semantic-complete" as const,
        usage: { available: true, input: 100, output: 10, cacheRead: 0, cacheWrite: 0 },
        durationMs: 1_000,
        passed: route.family !== "deepseek" || caseId !== cases[8],
        failures: route.family === "deepseek" && caseId === cases[8] ? ["semantic mismatch"] : [],
        outputSha256: "9".repeat(64),
      }))),
      artifactRows: cases.map((caseId) => ({
        caseId,
        status: "complete" as const,
        passed: true,
        outputSha256: "f".repeat(64),
        expectedOutputSha256: "f".repeat(64),
        durationMs: 50,
      })),
    });
    expect(report.status).toBe("completed");
    expect(report.counts).toEqual({ expectedModelRows: 27, observedModelRows: 27, expectedArtifactRows: 9, observedArtifactRows: 9, logicalRows: 36 });
    expect(report.modelFamilies.deepseek.missingRows).toBe(0);
    expect(report.modelFamilies.deepseek.artifactVsOriginal.gains).toBe(1);
    expect(report.modelFamilies.deepseek.artifactVsOriginal.regressions).toBe(0);
    expect(report.interpretation.claimBoundary).toContain("P2 gold-digest output regression");
  });

  test("rejects matrix construction when a model row or artifact anchor is missing", () => {
    const lock = makeLock();
    const qualification = buildStageMQualification({
      lock, lockSha256: "1".repeat(64),
      families: routes.map((route) => ({ ...route, expectedRows: 9, observedRows: 9, missingCaseIds: [], rows: completeRows(route.family) })),
    });
    expect(() => buildStageMMatrixReport({
      lock, lockSha256: "1".repeat(64), qualification,
      modelRows: routes.flatMap((route) => cases.slice(0, 8).map((caseId) => ({
        family: route.family, route: route.route, caseId, status: "complete" as const,
        classification: "semantic-complete" as const,
        usage: { available: true, input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        durationMs: 1, passed: true, failures: [], outputSha256: "1".repeat(64),
      }))),
      artifactRows: cases.map((caseId) => ({
        caseId, status: "complete" as const, passed: true, outputSha256: "2".repeat(64),
        expectedOutputSha256: "2".repeat(64), durationMs: 1,
      })),
    })).toThrow("model denominator");
  });

  test("binds matrix reports to the caller's frozen lock digest", () => {
    const lock = makeLock();
    const qualification = buildStageMQualification({
      lock, lockSha256: "3".repeat(64),
      families: routes.map((route) => ({ ...route, expectedRows: 9, observedRows: 9, missingCaseIds: [], rows: completeRows(route.family) })),
    });
    expect(() => buildStageMMatrixReport({
      lock, lockSha256: "4".repeat(64), qualification,
      modelRows: routes.flatMap((route) => cases.map((caseId) => ({
        family: route.family, route: route.route, caseId, status: "complete" as const,
        classification: "semantic-complete" as const,
        usage: { available: true, input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        durationMs: 1, passed: true, failures: [], outputSha256: "4".repeat(64),
      }))),
      artifactRows: cases.map((caseId) => ({
        caseId, status: "complete" as const, passed: true, outputSha256: "5".repeat(64),
        expectedOutputSha256: "5".repeat(64), durationMs: 1,
      })),
    })).toThrow("not authorized");
  });

  test("rejects forged qualification summary fields", () => {
    const lock = makeLock();
    expect(() => buildStageMQualification({
      lock, lockSha256: "6".repeat(64),
      families: routes.map((route) => ({ ...route, expectedRows: 9, observedRows: 8, missingCaseIds: [], rows: completeRows(route.family) })),
    })).toThrow("observed-row declaration drift");
  });

  test("requires the explicit frozen lock digest when authorizing a unique matrix", () => {
    const lock = makeLock();
    const qualification = buildStageMQualification({
      lock, lockSha256: "7".repeat(64),
      families: routes.map((route) => ({ ...route, expectedRows: 9, observedRows: 9, missingCaseIds: [], rows: completeRows(route.family) })),
    });
    expect(() => assertStageMMatrixAuthorized(qualification, "8".repeat(64))).toThrow("not authorized");
  });

  test("rejects qualification usage summaries that disagree with their machine-readable usage", () => {
    const lock = makeLock();
    const gptRows = completeRows("gpt");
    gptRows[0] = { ...gptRows[0]!, usageAvailable: true, usage: { ...gptRows[0]!.usage, available: false } };
    expect(() => buildStageMQualification({
      lock,
      lockSha256: "a".repeat(64),
      families: routes.map((route) => ({
        ...route,
        expectedRows: 9,
        observedRows: 9,
        missingCaseIds: [],
        rows: route.family === "gpt" ? gptRows : completeRows(route.family),
      })),
    })).toThrow("usage availability drift");
  });
});
