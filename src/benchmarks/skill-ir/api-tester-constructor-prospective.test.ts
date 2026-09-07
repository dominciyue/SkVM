import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { AiAssistedDevelopmentRoutingSchema } from "./ai-assisted-development-routing";
import {
  ApiTesterConstructorCandidateSchema,
  ApiTesterProspectiveFirstRunReportSchema,
  ApiTesterProspectiveExperimentLockSchema,
  buildApiTesterConstructorCandidate,
  buildApiTesterProspectiveFirstRunReport,
  buildApiTesterProspectiveExperimentLock,
  verifyApiTesterProspectiveInputs,
} from "./api-tester-constructor-prospective";

const rootDir = process.cwd();

describe("API Tester constructor prospective freeze", () => {
  test("binds the current constructor closure without rewriting historical Q2", async () => {
    const q2Path = join(rootDir, "benchmarks", "skill-ir", "classification", "q2-current-capabilities-v1.json");
    const beforeQ2 = await readFile(q2Path);
    const routing = AiAssistedDevelopmentRoutingSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks", "skill-ir", "classification", "ai-assisted-development-routing-v1.json"),
      "utf8",
    )));
    const candidate = await buildApiTesterConstructorCandidate({ rootDir, routing });

    expect(candidate).toMatchObject({
      schemaVersion: "skill-ir-api-tester-constructor-candidate/v1",
      identity: "skill-ir-api-tester-constructor-candidate-001",
      implementationIdentity: "skill-ir-api-tester-production-binding-development-001",
      historicalQ2: { path: "benchmarks/skill-ir/classification/q2-current-capabilities-v1.json" },
      evidenceBoundary: {
        developmentOnly: true,
        fullOpenApiValidator: false,
        changesHistoricalQ2: false,
        changesReadiness: false,
      },
    });
    expect(candidate.sourceClosure.map((entry) => entry.role).sort()).toEqual([
      "artifact-wrapper", "checker-generator", "contract-builder", "deterministic-runtime",
    ]);
    expect(candidate.rejectionCodes).toContain("UNSUPPORTED_REFERENCE");
    expect(await readFile(q2Path)).toEqual(beforeQ2);
  });

  test("freezes exactly four real inputs and four boundary cases with predictions", async () => {
    const candidate = ApiTesterConstructorCandidateSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks", "skill-ir", "classification", "api-tester-constructor-candidate-v1.json"),
      "utf8",
    )));
    const lock = await buildApiTesterProspectiveExperimentLock({ rootDir, candidate });

    expect(lock).toMatchObject({
      schemaVersion: "skill-ir-api-tester-constructor-prospective-lock/v1",
      identity: "skill-ir-api-tester-constructor-prospective-001",
      denominator: { realPublicInputs: 4, syntheticBoundaryCases: 4, total: 8 },
      executionPolicy: { attemptsPerRow: 1, retries: 0, replacements: 0, candidateFixes: 0 },
      resultState: "not-run",
      audit: { modelCalls: 0, apiCalls: 0, paidCalls: 0, heldOutAccesses: 0 },
    });
    expect(lock.rows.filter((row) => row.stratum === "real-public-input")).toHaveLength(4);
    expect(lock.rows.filter((row) => row.stratum === "synthetic-boundary")).toHaveLength(4);
    expect(lock.rows.every((row) => row.prediction.expectedOutcome === "rejected")).toBe(true);
    expect(new Set(lock.rows.map((row) => row.rowId)).size).toBe(8);
  });

  test("fails closed when the prospective denominator drifts", async () => {
    const candidate = ApiTesterConstructorCandidateSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks", "skill-ir", "classification", "api-tester-constructor-candidate-v1.json"),
      "utf8",
    )));
    const lock = await buildApiTesterProspectiveExperimentLock({ rootDir, candidate });
    expect(() => ApiTesterProspectiveExperimentLockSchema.parse({ ...lock, rows: lock.rows.slice(1) }))
      .toThrow(/8|denominator/iu);
  });

  test("verifies all frozen input, license, and binding bytes without running the candidate", async () => {
    const lock = ApiTesterProspectiveExperimentLockSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks", "skill-ir", "pilots", "api-tester", "prospective-construction-001", "experiment-lock.json"),
      "utf8",
    )));
    const verified = await verifyApiTesterProspectiveInputs({
      rootDir,
      cacheRoot: resolve(rootDir, "..", ".tmp-api-prospective-20260907"),
      lock,
    });
    expect(verified).toEqual({ rows: 8, realInputs: 4, boundaryInputs: 4, licenseFiles: 4, bindingFiles: 8 });

    const drifted = structuredClone(lock);
    drifted.rows[0]!.input.sha256 = "0".repeat(64);
    await expect(verifyApiTesterProspectiveInputs({
      rootDir,
      cacheRoot: resolve(rootDir, "..", ".tmp-api-prospective-20260907"),
      lock: drifted,
    })).rejects.toThrow(/digest/iu);
  });

  test("keeps all eight outcomes in the immutable first-run denominator", async () => {
    const lock = ApiTesterProspectiveExperimentLockSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks", "skill-ir", "pilots", "api-tester", "prospective-construction-001", "experiment-lock.json"),
      "utf8",
    )));
    const rows = lock.rows.map((row) => ({
      rowId: row.rowId,
      stratum: row.stratum,
      inputSha256: row.input.sha256,
      bindingSha256: row.bindingSha256,
      prediction: row.prediction,
      actual: {
        outcome: "rejected" as const,
        rejectionCode: row.prediction.rejectionCode,
        error: null,
        artifact: null,
        checkerStatus: "not-run" as const,
      },
      predictionParity: "exact" as const,
      costs: {
        constructionMillis: 1,
        runAndCheckMillis: 0,
        humanModificationMinutes: 0,
        humanModificationNote: "No human modification occurred during the immutable first run.",
      },
      accounting: { modelCalls: 0 as const, apiCalls: 0 as const, paidCalls: 0 as const },
    }));
    const report = buildApiTesterProspectiveFirstRunReport({
      lock,
      lockSha256: "1".repeat(64),
      freezeCommit: "2".repeat(40),
      candidateSha256: lock.candidate.sha256,
      rows,
    });
    expect(report).toMatchObject({
      status: "completed",
      denominator: { planned: 8, attempted: 8, accepted: 0, rejected: 8, checkerFailed: 0, infrastructureFailed: 0 },
      predictionParity: { exact: 8, outcomeOnly: 0, mismatch: 0 },
      firstRunImmutable: true,
    });
    expect(() => ApiTesterProspectiveFirstRunReportSchema.parse({ ...report, rows: report.rows.slice(1) }))
      .toThrow(/8|denominator/iu);
  });

  test("accepts the committed immutable first-run negative result", async () => {
    const report = ApiTesterProspectiveFirstRunReportSchema.parse(JSON.parse(await readFile(
      join(rootDir, "results", "skill-ir", "api-tester-constructor-prospective-001", "first-run-report.json"),
      "utf8",
    )));
    expect(report).toMatchObject({
      status: "completed",
      freeze: {
        commit: "aa3a08819e220b5584ffd32cccea24884e50d2e7",
        verifiedBeforeRun: true,
      },
      denominator: {
        planned: 8,
        attempted: 8,
        accepted: 0,
        rejected: 8,
        checkerFailed: 0,
        infrastructureFailed: 0,
      },
      predictionParity: { exact: 8, outcomeOnly: 0, mismatch: 0 },
      costs: {
        construction: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
        humanModification: { totalMinutes: 0, historicalBackfill: false },
      },
      evidenceBoundary: {
        completesOriginalQ1: false,
        provesHumanAgreement: false,
        provesClassificationAccuracy: false,
        provesReliability: false,
        provesHumanSavings: false,
        changesReadiness: false,
      },
    });
    expect(report.strata.realPublicInputs).toEqual({
      accepted: 0,
      rejected: 4,
      checkerFailed: 0,
      infrastructureFailed: 0,
    });
    expect(report.strata.syntheticBoundaryCases).toEqual({
      accepted: 0,
      rejected: 4,
      checkerFailed: 0,
      infrastructureFailed: 0,
    });
  });
});
