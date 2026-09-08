import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  API_TESTER_OPERATION_DEVELOPMENT_CONTRACT_PATH,
  ApiTesterOperationDevelopmentContractSchema,
  ApiTesterOperationDevelopmentReportSchema,
  analyzeApiTesterOperationDocument,
  verifyApiTesterOperationDevelopmentReport,
} from "./api-tester-operation-development";

const EXPECTED_ROWS = [
  "real-opengrok-api",
  "real-box-openapi",
  "real-meilisearch-api",
  "real-bangumi-api",
  "real-deepl-openapi",
  "real-hfs-openapi",
] as const;

const MIXED_DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "mixed", version: "1" },
  paths: {
    "/accepted": {
      get: { responses: { "200": { description: "ok" } } },
    },
    "/rejected": {
      post: {
        parameters: [{ name: "session", in: "cookie", schema: { type: "string" } }],
        responses: { default: { description: "unknown" } },
      },
    },
  },
};

describe("API Tester operation development contract", () => {
  test("binds exactly the six exposed real rows and frozen predecessor evidence", async () => {
    const contract = ApiTesterOperationDevelopmentContractSchema.parse(JSON.parse(
      await readFile(API_TESTER_OPERATION_DEVELOPMENT_CONTRACT_PATH, "utf8"),
    ));
    expect([...contract.rowIds]).toEqual([...EXPECTED_ROWS]);
    expect(contract.predecessor.selection.sha256).toBe("0f955e7b029312ca42f0c25692c819f8232908a8bf327632cc83f94ead481905");
    expect(contract.predecessor.lock.sha256).toBe("5e5714ec5ec160a5ce77014d78aaa42ba3642fc07134ef8ce8dc2f2e1fe547d2");
    expect(contract.predecessor.firstRun).toMatchObject({
      sha256: "dd7df5a3c1671be2550902053dd24593aebb02626d54f0e086b15f4b75adcc2c",
      wholeDocumentRealAccepted: 0,
      wholeDocumentRealTotal: 6,
    });
    expect(contract.revisionHistory).toHaveLength(2);
    expect(contract.revisionHistory).toEqual(expect.arrayContaining([expect.objectContaining({
      attempt: 1,
      report: {
        path: "results/skill-ir/api-tester-operation-admission-development-001-attempt-001/report.json",
        sha256: "42e9f1325b081dc3d8e427250e1203736fa3648ca686df150216918bf1e768da",
      },
      issueCode: "DOCUMENT_WIDE_DEPENDENCY_BLOCK",
      operations: 562,
      accepted: 112,
      checked: 74,
    }), expect.objectContaining({
      attempt: 2,
      report: {
        path: "results/skill-ir/api-tester-operation-admission-development-001-attempt-002/report.json",
        sha256: "6c7693da28336550f297172e575f45c4c4ba6f39ed6984ee6f53dff0d0bec0d3",
      },
      issueCode: "OVERBROAD_UNRESOLVED_CLASSIFICATION",
      accepted: 112,
      checked: 112,
    })]));
    expect(contract.policy).toMatchObject({
      realDocuments: 6,
      syntheticDocuments: 0,
      prospectiveRuns: 0,
      heldOutAccesses: 0,
      q1ReservedAccesses: 0,
      secondProfiles: 0,
      q4Runs: 0,
      readinessChanges: 0,
    });
    expect(contract.accounting).toMatchObject({
      runtimeModelCalls: 0,
      runtimeApiCalls: 0,
      runtimePaidCalls: 0,
      developmentSeparateFromRuntime: true,
    });
  });

  test("conserves every operation while separating accepted and rejected results", () => {
    const analysis = analyzeApiTesterOperationDocument(JSON.stringify(MIXED_DOCUMENT), "json");
    expect(analysis.enumeration).toMatchObject({ complete: true, unresolved: [] });
    expect(analysis.admissions.map((row) => [row.operationKey, row.status])).toEqual([
      ["GET /accepted", "accepted"],
      ["POST /rejected", "rejected"],
    ]);
    expect(analysis.summary).toEqual({ operations: 2, accepted: 1, rejected: 1, unresolved: 0 });
    expect(analysis.consistency).toEqual({ status: "pass", errors: [] });
  });

  test("report schema rejects count drift, absolute cache paths, nonzero runtime calls, and false pass gates", () => {
    const valid = {
      schemaVersion: "skill-ir-api-tester-operation-development-report/v1",
      identity: "skill-ir-api-tester-operation-admission-development-001",
      status: "completed",
      completedAt: "2026-09-09T00:00:00.000Z",
      inputs: {
        contract: { path: API_TESTER_OPERATION_DEVELOPMENT_CONTRACT_PATH.replaceAll("\\", "/"), sha256: "a".repeat(64) },
        selection: { path: "selection.json", sha256: "b".repeat(64) },
        predecessorLock: { path: "lock.json", sha256: "c".repeat(64) },
        predecessorReport: { path: "report.json", sha256: "d".repeat(64), realAccepted: 0, realTotal: 6 },
        priorAttempts: [{ path: "attempt-001/report.json", sha256: "8".repeat(64) }],
      },
      totals: {
        documents: 6, enumerationCompleteDocuments: 6, operations: 2,
        accepted: 1, rejected: 1, unresolved: 0, artifactCheckedPassedOperations: 1,
      },
      gates: { sourceCoverage: "pass", admissionConsistency: "pass", artifactCorrectness: "pass", correctness: "pass" },
      obligationCoverage: { total: 8, covered: 8, uncovered: 0, status: "pass" },
      documents: EXPECTED_ROWS.map((rowId, index) => ({
        rowId,
        format: "json",
        source: { cachePath: `${rowId}/openapi.json`, bytes: 1, sha256: `${index}`.repeat(64).slice(0, 64), licenseSha256: "e".repeat(64) },
        inventory: { path: `inventories/${rowId}.json`, sha256: "f".repeat(64) },
        enumeration: { complete: true, operationCount: index < 2 ? 1 : 0, unresolved: [] },
        admission: { accepted: index === 0 ? 1 : 0, rejected: index === 1 ? 1 : 0, unresolved: 0, consistency: "pass" },
        coverage: { status: "pass", errors: [] },
        artifact: index === 0
          ? { status: "passed", acceptedOperationCount: 1, checkedOperationCount: 1, evidence: { root: `artifacts/${rowId}`, manifestSha256: "1".repeat(64), generatorSha256: "2".repeat(64), checkerSha256: "3".repeat(64), planSha256: "4".repeat(64), reportSha256: "5".repeat(64), validationSha256: "6".repeat(64) }, error: null }
          : { status: "not-run", acceptedOperationCount: 0, checkedOperationCount: 0, evidence: null, error: null },
      })),
      revisions: [],
      accounting: { runtime: { modelCalls: 0, apiCalls: 0, paidCalls: 0 }, developmentAgentUsage: "host-external-not-measured-by-runner", separate: true },
      protectedBoundary: { frozenWholeDocumentRealAccepted: 0, changesFrozenHistory: false, prospectiveRuns: 0, heldOutAccesses: 0, readinessChanges: 0, claimsHumanSavings: false, claimsEcosystemAdmission: false },
      portableSemanticSha256: "7".repeat(64),
    };
    expect(ApiTesterOperationDevelopmentReportSchema.parse(valid).gates.correctness).toBe("pass");
    expect(() => ApiTesterOperationDevelopmentReportSchema.parse({ ...valid, totals: { ...valid.totals, operations: 3 } })).toThrow();
    const absolute = structuredClone(valid);
    absolute.documents[0]!.source.cachePath = "C:/secret/openapi.json";
    expect(() => ApiTesterOperationDevelopmentReportSchema.parse(absolute)).toThrow();
    expect(() => ApiTesterOperationDevelopmentReportSchema.parse({
      ...valid,
      accounting: { ...valid.accounting, runtime: { modelCalls: 0, apiCalls: 1, paidCalls: 0 } },
    })).toThrow();
    expect(() => ApiTesterOperationDevelopmentReportSchema.parse({
      ...valid,
      gates: { ...valid.gates, sourceCoverage: "fail" },
    })).toThrow();
  });

  test("strictly replays the committed report, inventories, and artifact closure", async () => {
    const verified = await verifyApiTesterOperationDevelopmentReport({ rootDir: process.cwd() });
    expect(verified).toMatchObject({
      status: "verified",
      documents: 6,
      operations: 562,
      accepted: 112,
      rejected: 449,
      unresolved: 1,
      checked: 112,
      inventoriesVerified: 6,
      artifactsVerified: 5,
      portableSemanticSha256: "1a14ed36ebc185befcb4f3d2c03f95d89bd1e8a1a89da560a9c6eb35b89a1e87",
    });
  });
});
