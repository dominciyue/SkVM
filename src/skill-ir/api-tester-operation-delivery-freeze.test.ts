import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  API_TESTER_OPERATION_CANDIDATE_IDENTITY,
  ApiTesterOperationCandidateSchema,
  ApiTesterOperationDeliveryValidationReportSchema,
  buildApiTesterOperationCandidate,
  compareApiTesterOperationDeliveryRow,
  compareApiTesterOperationDeliveryTotals,
  createApiTesterOperationArchiveManifest,
  verifyApiTesterOperationArchive,
} from "./api-tester-operation-delivery-freeze";
import { parseApiTesterOperationDeliveryValidationArgs } from "./api-tester-operation-delivery-freeze-run";
import { parseApiTesterOperationDeliveryVerifyArgs } from "./api-tester-operation-delivery-verify-run";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

function operation(key: string, status: "accepted" | "rejected" | "unresolved" = "accepted") {
  return {
    source: { key, locator: `#/paths/~1${key.split(" /")[1]}/get`, operationId: null, summary: null },
    admission: {
      operationKey: key,
      status,
      findings: status === "accepted" ? [] : [{ code: "NO", category: "unsupported-syntax", locator: "#", message: "no" }],
      firstObservedRejection: null,
      normalizedOperation: status === "accepted" ? { method: "GET", path: key.slice(4) } : null,
    },
  };
}

describe("API Tester operation delivery validation and candidate freeze", () => {
  test("parses only the exposed-validation inputs and a fresh output root", () => {
    expect(parseApiTesterOperationDeliveryValidationArgs([
      "--root=repo", "--cache-root=cache", "--node=node", "--out=fresh", "--completed-at=2026-09-09T12:00:00.000Z",
    ])).toEqual({
      rootDir: "repo",
      cacheRoot: "cache",
      nodeExecutable: "node",
      outputRoot: "fresh",
      completedAt: "2026-09-09T12:00:00.000Z",
    });
    expect(() => parseApiTesterOperationDeliveryValidationArgs([
      "--root=repo", "--cache-root=cache", "--node=node", "--out=fresh", "--prediction=x",
    ])).toThrow(/invalid or duplicate argument/u);
    expect(parseApiTesterOperationDeliveryVerifyArgs([
      "--root=repo", "--archive-root=archive", "--node=node",
    ])).toEqual({ rootDir: "repo", archiveRoot: "archive", nodeExecutable: "node" });
  });

  test("compares exposed rows semantically instead of trusting totals", () => {
    const dependency = [{
      operationKey: "GET /items",
      status: "pass",
      dimensions: { projectionPreservation: "pass", constructionObligations: "pass", sourceValidity: "fail" },
      sourceIssues: [{ code: "REFERENCE_EXTERNAL", role: "response", locator: "#/x", reference: "./x", constructionObligation: false }],
      projectedIssues: [],
      errors: [],
    }];
    expect(compareApiTesterOperationDeliveryRow({
      baselineOperations: [operation("GET /items")],
      currentOperations: [operation("GET /items")],
      baselineDependencies: dependency,
      currentDependencies: structuredClone(dependency),
      baselineChecked: 1,
      currentChecked: 1,
    })).toEqual({ operationUniverse: true, admission: true, dependencies: true, checkerPass: true, status: "pass" });
    expect(compareApiTesterOperationDeliveryRow({
      baselineOperations: [operation("GET /items")],
      currentOperations: [operation("GET /other")],
      baselineDependencies: dependency,
      currentDependencies: dependency,
      baselineChecked: 1,
      currentChecked: 1,
    })).toMatchObject({ operationUniverse: false, admission: false, status: "fail" });
  });

  test("compares aggregate totals against the dependency-revision field contract", () => {
    expect(compareApiTesterOperationDeliveryTotals(
      { operations: 562, accepted: 112, rejected: 449, unresolved: 1, checked: 112, obligations: { total: 575, covered: 575 } },
      {
        operations: 562,
        accepted: 112,
        rejected: 449,
        unresolved: 1,
        checkerPassed: 112,
        obligations: { total: 575, covered: 575, uncovered: 0, status: "pass" },
      },
    )).toBe(true);
  });

  test("candidate binds the exact entry chain and has no selected or predicted rows", async () => {
    const validationPath = "results/skill-ir/api-tester-operation-dependency-verification-revision-development-001/report.json";
    const candidate = await buildApiTesterOperationCandidate({
      rootDir: process.cwd(),
      frozenAt: "2026-09-09T12:00:00.000Z",
      bunVersion: Bun.version,
      nodeVersion: "v23.8.0",
      validation: { path: validationPath },
    });
    expect(candidate).toMatchObject({
      identity: API_TESTER_OPERATION_CANDIDATE_IDENTITY,
      supportContractId: "api-tester-openapi-subset-v2",
      prospective: { inputSelection: "not-started", predictions: "not-authored", prospectiveRuns: 0, rows: [], rowPredictions: [] },
      sourceValidityPolicy: {
        missingConstructionReference: "block-affected-operation-without-guessing",
        externalResponseReference: "retain-source-validity-advisory",
      },
      runtime: { bun: "1.3.14", node: "v23.8.0" },
    });
    const paths = candidate.implementation.map((file) => file.path);
    expect(paths).toEqual(expect.arrayContaining([
      "src/skill-ir/api-tester-operation-input.ts",
      "src/skill-ir/api-tester-operation-input-run.ts",
      "src/skill-ir/api-tester-operation-source.ts",
      "src/skill-ir/api-tester-operation-admission.ts",
      "src/skill-ir/api-tester-operation-coverage.ts",
      "src/skill-ir/api-tester-production-contract-v2.ts",
      "src/skill-ir/api-tester-production-programs-v2.ts",
      "src/skill-ir/api-tester-production-artifact-v2.ts",
    ]));
    expect(paths).not.toContain("src/skill-ir/api-tester-operation-development.ts");
    expect(() => ApiTesterOperationCandidateSchema.parse({
      ...candidate,
      prospective: { ...candidate.prospective, inputSelection: "selected" },
    })).toThrow();
  });

  test("archive verifier binds every byte and rejects extra or changed files", async () => {
    const root = await mkdtemp(join(tmpdir(), "skvm-api-operation-archive-"));
    temporaryDirectories.push(root);
    await writeFile(join(root, "a.json"), "{}\n", "utf8");
    await writeFile(join(root, "b.txt"), "bounded\n", "utf8");
    const manifest = await createApiTesterOperationArchiveManifest({ rootDir: root, archiveId: "synthetic-archive" });
    await writeFile(join(root, "archive-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await expect(verifyApiTesterOperationArchive({ rootDir: root })).resolves.toMatchObject({ status: "verified", files: 2 });
    await writeFile(join(root, "b.txt"), "changed\n", "utf8");
    await expect(verifyApiTesterOperationArchive({ rootDir: root })).rejects.toThrow(/digest mismatch/u);

    const extra = await mkdtemp(join(tmpdir(), "skvm-api-operation-archive-extra-"));
    temporaryDirectories.push(extra);
    await writeFile(join(extra, "a.json"), "{}\n", "utf8");
    const exact = await createApiTesterOperationArchiveManifest({ rootDir: extra, archiveId: "extra-archive" });
    await writeFile(join(extra, "archive-manifest.json"), `${JSON.stringify(exact, null, 2)}\n`, "utf8");
    await writeFile(join(extra, "undeclared.txt"), "extra\n", "utf8");
    await expect(verifyApiTesterOperationArchive({ rootDir: extra })).rejects.toThrow(/closure mismatch/u);
  });

  test("validation report schema preserves the source blocker, advisories, and zero prospective boundary", () => {
    const valid = {
      schemaVersion: "skill-ir-api-tester-operation-delivery-validation-report/v1",
      identity: "skill-ir-api-tester-operation-delivery-freeze-development-001",
      status: "passed-with-source-blocker",
      completedAt: "2026-09-09T12:00:00.000Z",
      inputs: {
        sourceSelection: { path: "source-selection.json", sha256: "a".repeat(64) },
        baselineRevision: { path: "revision.json", sha256: "b".repeat(64), runSemanticSha256: "c".repeat(64) },
      },
      rows: Array.from({ length: 6 }, (_, index) => ({
        rowId: ["real-opengrok-api", "real-box-openapi", "real-meilisearch-api", "real-bangumi-api", "real-deepl-openapi", "real-hfs-openapi"][index],
        format: index % 2 ? "json" : "yaml",
        source: { path: `inputs/${index}/source.${index % 2 ? "json" : "yaml"}`, sha256: `${index}`.repeat(64), bytes: 1 },
        license: { path: `inputs/${index}/LICENSE`, sha256: "d".repeat(64), bytes: 1 },
        manifest: { path: `runs/${index}/manifest.json`, sha256: "e".repeat(64) },
        outputManifest: { path: `runs/${index}/output/output-manifest.json`, sha256: "f".repeat(64) },
        operationReport: { path: `runs/${index}/output/report.json`, sha256: "1".repeat(64), portableSemanticSha256: "2".repeat(64) },
        totals: { operations: 1, accepted: index === 1 ? 0 : 1, rejected: index === 1 ? 1 : 0, unresolved: 0, checked: index === 1 ? 0 : 1 },
        sourceIssues: { blockers: index === 2 ? 1 : 0, advisories: index === 3 ? 19 : 0 },
        comparison: { operationUniverse: true, admission: true, dependencies: true, checkerPass: true, status: "pass" },
      })),
      totals: { documents: 6, operations: 6, accepted: 5, rejected: 1, unresolved: 0, checked: 5, obligations: { total: 28, covered: 28 } },
      retainedIssues: { meilisearchMissingTotalReference: true, bangumiExternalResponseAdvisoryOperations: 19 },
      gates: { sixSourceComparison: "pass", strictOutputs: "pass", implementationCorrectness: "pass", sourceCorrectness: "blocked" },
      accounting: { runtime: { modelCalls: 0, apiCalls: 0, paidCalls: 0 }, developmentAgentUsage: "host-external-not-measured-by-runner", separate: true },
      protectedBoundary: { frozenWholeDocumentRealAccepted: 0, prospectiveRuns: 0, heldOutAccesses: 0, readinessChanges: 0, claimsHumanSavings: false, claimsLiveApiBehavior: false },
      portableSemanticSha256: "3".repeat(64),
    };
    expect(ApiTesterOperationDeliveryValidationReportSchema.parse(valid).rows).toHaveLength(6);
    expect(() => ApiTesterOperationDeliveryValidationReportSchema.parse({
      ...valid,
      retainedIssues: { ...valid.retainedIssues, meilisearchMissingTotalReference: false },
    })).toThrow();
    expect(() => ApiTesterOperationDeliveryValidationReportSchema.parse({
      ...valid,
      protectedBoundary: { ...valid.protectedBoundary, prospectiveRuns: 1 },
    })).toThrow();
  });
});
