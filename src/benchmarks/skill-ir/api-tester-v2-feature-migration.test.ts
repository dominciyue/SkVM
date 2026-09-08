import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  API_TESTER_V2_FEATURE_MIGRATION_IDENTITY,
  API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY,
  API_TESTER_V2_MIGRATION_CANDIDATE_IDENTITY,
  ApiTesterV2FeatureMigrationCandidateSchema,
  ApiTesterV2FeatureMigrationFirstRunReportSchema,
  ApiTesterV2FeatureMigrationLockSchema,
  ApiTesterV2FeatureMigrationPreflightFailureSchema,
  ApiTesterV2FeatureMigrationSelectionSchema,
  buildApiTesterV2FeatureMigrationCandidate,
  buildApiTesterV2FeatureMigrationFirstRunReport,
  inspectPublicOpenApiStructure,
  gitTrackedFileMatchesCommit,
  verifyApiTesterV2FeatureMigrationInputs,
} from "./api-tester-v2-feature-migration";

const rootDir = process.cwd();
const assetDir = join(rootDir, "benchmarks", "skill-ir", "pilots", "api-tester", "v2-feature-migration-001");
const panelDir = join(rootDir, "benchmarks", "skill-ir", "pilots", "api-tester", "v2-feature-migration-002");

describe("API Tester v2 feature migration freeze", () => {
  test("uses new candidate and panel identities", () => {
    expect(API_TESTER_V2_MIGRATION_CANDIDATE_IDENTITY)
      .toBe("skill-ir-api-tester-constructor-candidate-v2-001");
    expect(API_TESTER_V2_FEATURE_MIGRATION_IDENTITY)
      .toBe("skill-ir-api-tester-v2-feature-migration-002");
    expect(API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY)
      .toBe("skill-ir-api-tester-v2-feature-migration-001");
  });

  test("inspects requested features without importing the production parser", () => {
    const inventory = inspectPublicOpenApiStructure(JSON.stringify({
      openapi: "3.0.3",
      paths: {
        "/items": {
          post: {
            parameters: [{
              name: "tag",
              in: "query",
              style: "form",
              explode: true,
              schema: { type: "array", items: { type: "string" } },
            }],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { ids: { type: "array", items: { type: "integer" } } },
                  },
                },
              },
            },
            responses: { "200": { description: "ok" } },
          },
        },
      },
      components: { parameters: { Limit: { name: "limit", in: "query", schema: { type: "integer" } } } },
      x: { $ref: "#/components/parameters/Limit" },
    }), "json");
    expect(inventory).toMatchObject({
      openapiVersion: "3.0.3",
      pathCount: 1,
      localComponentRefs: { count: 1 },
      bodyPrimitiveArrays: { count: 1 },
      queryFormExplodePrimitiveArrays: { count: 1 },
    });
  });

  test("binds the actual unified CLI and v2 execution surface", async () => {
    const candidate = await buildApiTesterV2FeatureMigrationCandidate({
      rootDir,
      bunVersion: "1.3.14",
      nodeVersion: "v23.8.0",
    });
    expect(candidate).toMatchObject({
      schemaVersion: "skill-ir-api-tester-constructor-candidate/v2",
      identity: API_TESTER_V2_MIGRATION_CANDIDATE_IDENTITY,
      supportContractId: "api-tester-openapi-subset-v2",
      runtime: { bun: "1.3.14", node: "v23.8.0" },
      evidenceBoundary: { fullOpenApiValidator: false, changesReadiness: false },
    });
    const paths = new Set(candidate.executionSurface.map((entry) => entry.path));
    for (const required of [
      "bin/skvm.js",
      "bin/skvm-route.js",
      "src/cli/artifact.ts",
      "src/skill-ir/verified-artifact-presets.ts",
      "src/skill-ir/api-tester-production-contract-v2.ts",
      "src/skill-ir/api-tester-production-programs-v2.ts",
      "src/skill-ir/api-tester-production-artifact-v2.ts",
      "src/benchmarks/skill-ir/artifact-package.ts",
      "src/benchmarks/skill-ir/source-fixture.ts",
      "package.json",
      "bun.lock",
    ]) expect(paths.has(required)).toBe(true);
  });

  test("accepts Git-normalized source whose exact checkout bytes are candidate-bound", async () => {
    const child = Bun.spawn(["git", "-c", `safe.directory=${rootDir.replaceAll("\\", "/")}`, "rev-parse", "HEAD"], {
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    expect(exitCode).toBe(0);
    await expect(gitTrackedFileMatchesCommit({
      rootDir,
      commit: stdout.trim(),
      path: "bin/skvm.js",
    })).resolves.toBeUndefined();
  });

  test("freezes the predecessor as a machine-readable zero-row preflight failure", async () => {
    const failure = ApiTesterV2FeatureMigrationPreflightFailureSchema.parse(JSON.parse(await readFile(
      join(rootDir, "results", "skill-ir", "api-tester-v2-feature-migration-001", "preflight-failure.json"),
      "utf8",
    )));
    expect(failure).toMatchObject({
      experimentIdentity: API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY,
      status: "blocked-before-row-execution",
      activity: { rowsAttempted: 0, selectedInputBytesRead: 0, resultReportCreated: false },
      disposition: {
        candidateChanged: false,
        inputSetChanged: false,
        predictionsChanged: false,
        successorExperimentIdentity: API_TESTER_V2_FEATURE_MIGRATION_IDENTITY,
      },
    });
  });

  test("freezes six unique real sources in exact 2/2/2 strata plus four boundaries", async () => {
    const selection = ApiTesterV2FeatureMigrationSelectionSchema.parse(JSON.parse(await readFile(
      join(assetDir, "source-selection.json"),
      "utf8",
    )));
    const lock = ApiTesterV2FeatureMigrationLockSchema.parse(JSON.parse(await readFile(
      join(panelDir, "experiment-lock.json"),
      "utf8",
    )));
    expect(selection.selected).toHaveLength(6);
    expect(selection.excludedCandidates.length).toBeGreaterThanOrEqual(5);
    expect(new Set(selection.selected.map((row) => row.upstream.repository)).size).toBe(6);
    expect(selection.selected.reduce<Record<string, number>>((counts, row) => {
      counts[row.primaryFeature] = (counts[row.primaryFeature] ?? 0) + 1;
      return counts;
    }, {})).toEqual({ "local-component-ref": 2, "body-primitive-array": 2, "query-form-explode": 2 });
    expect(lock.denominator).toEqual({ realPublicInputs: 6, syntheticBoundaryCases: 4, total: 10 });
    expect(lock.result).toEqual({
      path: "results/skill-ir/api-tester-v2-feature-migration-002/first-run-report.json",
      writeMode: "exclusive-create-once",
    });
    expect(lock.rows).toHaveLength(10);
    expect(lock.rows.every((row) => row.prediction.basis.length > 0)).toBe(true);
    expect(lock.executionPolicy).toMatchObject({ attemptsPerRow: 1, retries: 0, replacements: 0, candidateFixes: 0 });
    expect(lock.predecessorPreflight).toMatchObject({
      experimentIdentity: API_TESTER_V2_FEATURE_MIGRATION_INPUT_SET_IDENTITY,
      rowsAttempted: 0,
      selectedInputBytesRead: 0,
    });
    expect(() => ApiTesterV2FeatureMigrationLockSchema.parse({ ...lock, rows: lock.rows.slice(1) }))
      .toThrow(/10|denominator/iu);
  });

  test("verifies source, license, binding, and boundary bytes without running the candidate", async () => {
    const lock = ApiTesterV2FeatureMigrationLockSchema.parse(JSON.parse(await readFile(
      join(panelDir, "experiment-lock.json"),
      "utf8",
    )));
    expect(await verifyApiTesterV2FeatureMigrationInputs({
      rootDir,
      cacheRoot: resolve(rootDir, "..", ".tmp-api-v2-feature-migration-20260908"),
      lock,
    })).toEqual({ rows: 10, realInputs: 6, boundaryInputs: 4, licenseFiles: 6, bindingFiles: 10 });

    const temporary = await mkdtemp(join(tmpdir(), "skvm-v2-migration-drift-"));
    await writeFile(join(temporary, "bad"), "drift", "utf8");
    const drifted = structuredClone(lock);
    drifted.rows[0]!.input.cachePath = "bad";
    await expect(verifyApiTesterV2FeatureMigrationInputs({ rootDir, cacheRoot: temporary, lock: drifted }))
      .rejects.toThrow(/byte|digest/iu);
  });

  test("retains all ten outcomes and keeps historical development tokens separate", async () => {
    const lock = ApiTesterV2FeatureMigrationLockSchema.parse(JSON.parse(await readFile(
      join(panelDir, "experiment-lock.json"),
      "utf8",
    )));
    const rows = lock.rows.map((row) => ({
      rowId: row.rowId,
      stratum: row.stratum,
      primaryFeature: row.primaryFeature,
      inputSha256: row.input.sha256,
      bindingSha256: row.bindingSha256,
      prediction: row.prediction,
      actual: row.prediction.expectedOutcome === "rejected" ? {
        outcome: "rejected" as const,
        rejectionCode: row.prediction.rejectionCode,
        error: null,
        checkerStatus: "not-run" as const,
        evidence: null,
      } : {
        outcome: "infrastructure-failed" as const,
        rejectionCode: null,
        error: "synthetic test failure",
        checkerStatus: "not-run" as const,
        evidence: null,
      },
      predictionParity: row.prediction.expectedOutcome === "rejected" ? "exact" as const : "mismatch" as const,
      adaptation: { extraCode: false, extraTemplate: false, extraRule: false, humanModificationMinutes: 0, note: "No modification in immutable run." },
      costs: {
        inputMaterializationMillis: 1,
        constructionMillis: null,
        generationMillis: null,
        checkingMillis: null,
        cliEndToEndMillis: 2,
        evidenceAnalysisMillis: 1,
        observerResolutionMillis: 5,
        coalescedMilestones: true,
      },
      accounting: { modelCalls: 0 as const, apiCalls: 0 as const, paidCalls: 0 as const },
    }));
    const report = buildApiTesterV2FeatureMigrationFirstRunReport({
      lock,
      lockSha256: "1".repeat(64),
      candidateSha256: lock.candidate.sha256,
      selectionSha256: lock.selection.sha256,
      freezeCommit: "2".repeat(40),
      completedAt: "2026-09-08T12:00:00.000Z",
      rows,
    });
    expect(report.denominator.attempted).toBe(10);
    expect(report.completedAt).toBe("2026-09-08T12:00:00.000Z");
    expect(report.costs.historicalDevelopment.agentTokens).toBe(467_220);
    expect(report.costs.runtime.modelCalls).toBe(0);
    expect(report.firstRunImmutable).toBe(true);
    expect(() => ApiTesterV2FeatureMigrationFirstRunReportSchema.parse({ ...report, rows: report.rows.slice(1) }))
      .toThrow(/10|denominator/iu);
  });

  test("accepts the committed candidate and not-run lock", async () => {
    const candidate = ApiTesterV2FeatureMigrationCandidateSchema.parse(JSON.parse(await readFile(
      join(rootDir, "benchmarks", "skill-ir", "classification", "api-tester-constructor-candidate-v2.json"),
      "utf8",
    )));
    const lock = ApiTesterV2FeatureMigrationLockSchema.parse(JSON.parse(await readFile(
      join(panelDir, "experiment-lock.json"),
      "utf8",
    )));
    expect(candidate.identity).toBe(API_TESTER_V2_MIGRATION_CANDIDATE_IDENTITY);
    expect(lock.resultState).toBe("not-run");
    expect(lock.candidate.identity).toBe(candidate.identity);
  });
});
