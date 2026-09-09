import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
  API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL,
  API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS,
  ApiTesterOperationProspectiveExperimentLockSchema,
  ApiTesterOperationProspectiveFirstRunReportSchema,
  ApiTesterOperationSourceSelectionReportSchema,
  buildApiTesterOperationProspectiveExperimentLock,
  buildApiTesterOperationProspectiveFirstRunReport,
  buildApiTesterOperationProspectivePreSourceFreeze,
  createApiTesterOperationProspectiveRunState,
  markApiTesterOperationProspectiveRowDispatched,
  prepareNextApiTesterOperationProspectiveRow,
  qualifyApiTesterOperationSourceCandidate,
  recordApiTesterOperationProspectiveTerminal,
  remainingApiTesterOperationProspectiveRunMillis,
  runApiTesterOperationProspectiveRows,
  runApiTesterOperationSyntheticValidation,
  verifyApiTesterOperationProspectiveRunOutput,
  verifyApiTesterOperationSyntheticValidation,
  verifyApiTesterOperationProspectivePreSourceFreezeGitArchive,
  verifyApiTesterOperationProspectivePreSourceFreezeLocal,
} from "./api-tester-operation-prospective";
import { parseApiTesterOperationProspectiveCommand } from "./api-tester-operation-prospective-run";

const rootDir = process.cwd();
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function realSourceText(index: number): string {
  const suffix = String(index + 1).padStart(2, "0");
  return JSON.stringify({ openapi: "3.1.0", info: { title: suffix, version: "1" }, paths: { "/ok": { get: { responses: { "200": { description: "ok" } } } } } });
}

function realSelection(index: number, manifestSha256 = digest(`${String(index + 1).padStart(2, "0")}-manifest`)) {
  const suffix = String(index + 1).padStart(2, "0");
  const repository = `https://github.com/example-${suffix}/api`;
  const sourceText = realSourceText(index);
  return {
    rowId: `real-${suffix}-example-api`,
    selectionOrder: index + 1,
    queryId: "github-topic-openapi-specification",
    queryRank: index + 1,
    discoveredAt: "2026-09-10T03:00:00.000Z",
    repository: {
      url: repository,
      fullName: `example-${suffix}/api`,
      id: 10_000 + index,
      fork: false,
      archived: false,
      lineageKey: `github-repository-id:${10_000 + index}`,
      commit: digest(`commit-${suffix}`).slice(0, 40),
    },
    source: {
      repositoryPath: "openapi.yaml",
      rawUrl: `${repository}/raw/openapi.yaml`,
      archivePath: `benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/real/${suffix}/openapi.yaml`,
      manifestPath: `benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/manifests/${suffix}.json`,
      manifestSha256,
      format: "yaml" as const,
      bytes: Buffer.byteLength(sourceText),
      sha256: digest(sourceText),
      openapiVersion: "3.1.0",
      operationCount: 1,
    },
    license: {
      spdx: "MIT",
      repositoryPath: "LICENSE",
      rawUrl: `${repository}/raw/LICENSE`,
      archivePath: `benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/real/${suffix}/LICENSE`,
      bytes: Buffer.byteLength(`license-${suffix}`),
      sha256: digest(`license-${suffix}`),
    },
    selectionBasis: "First mechanically eligible document in the preregistered order.",
    candidateTrialsBeforeSelection: 0 as const,
  };
}

async function writeTestFile(testRoot: string, path: string, bytes: string | Uint8Array): Promise<void> {
  const target = join(testRoot, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

async function rebindProspectiveOutputManifest(outRoot: string, path: string): Promise<void> {
  const manifestPath = join(outRoot, "output-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files: Array<{ path: string; sha256: string }> };
  const ref = manifest.files.find((entry) => entry.path === path);
  if (!ref) throw new Error(`missing output manifest ref: ${path}`);
  ref.sha256 = createHash("sha256").update(await readFile(join(outRoot, path))).digest("hex");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function materializeSyntheticOnlyEighteenRowLock(testRoot: string) {
  const freezeText = "pre-source-freeze\n";
  const selectionText = "source-selection\n";
  const predictionsText = "predictions\n";
  await writeTestFile(testRoot, "pre-source-freeze.json", freezeText);
  await writeTestFile(testRoot, "source-selection.json", selectionText);
  await writeTestFile(testRoot, "predictions.json", predictionsText);
  const selections = [];
  for (let index = 0; index < 12; index += 1) {
    const selection = realSelection(index);
    const sourceText = realSourceText(index);
    const licenseText = `license-${String(index + 1).padStart(2, "0")}`;
    const manifest = {
      schemaVersion: "skill-ir-api-tester-operation-input-manifest/v1",
      identity: "skill-ir-api-tester-operation-input-development-001",
      bindingId: `prospective-test-real-${String(index + 1).padStart(2, "0")}`,
      supportContractId: "api-tester-openapi-subset-v2",
      input: { path: selection.source.archivePath, format: selection.source.format, bytes: Buffer.byteLength(sourceText), sha256: digest(sourceText) },
      output: { path: "candidate-output", writeMode: "exclusive-create-once" },
    };
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeTestFile(testRoot, selection.source.archivePath, sourceText);
    await writeTestFile(testRoot, selection.license.archivePath, licenseText);
    await writeTestFile(testRoot, selection.source.manifestPath, manifestText);
    selections.push(realSelection(index, digest(manifestText)));
  }
  const syntheticRows = [];
  for (const entry of API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS) {
    const source = await readFile(join(rootDir, entry.path));
    const manifest = await readFile(join(rootDir, entry.manifestPath));
    await mkdir(dirname(join(testRoot, entry.path)), { recursive: true });
    await mkdir(dirname(join(testRoot, entry.manifestPath)), { recursive: true });
    await cp(join(rootDir, entry.path), join(testRoot, entry.path));
    await cp(join(rootDir, entry.manifestPath), join(testRoot, entry.manifestPath));
    syntheticRows.push({ ...entry, bytes: source.byteLength, sha256: createHash("sha256").update(source).digest("hex"), manifestSha256: createHash("sha256").update(manifest).digest("hex") });
  }
  return buildApiTesterOperationProspectiveExperimentLock({
    preSourceFreeze: { path: "pre-source-freeze.json", sha256: digest(freezeText), commit: "a".repeat(40) },
    selectionReport: { path: "source-selection.json", sha256: digest(selectionText) },
    predictionsReport: { path: "predictions.json", sha256: digest(predictionsText) },
    selectionCommit: "b".repeat(40),
    frozenAt: "2026-09-10T05:00:00.000Z",
    realSelections: selections,
    realPredictions: Array.from({ length: 12 }, (_, index) => realPrediction(index)),
    syntheticRows,
  });
}

function realPrediction(index: number) {
  const suffix = String(index + 1).padStart(2, "0");
  return {
    rowId: `real-${suffix}-example-api`,
    authoredAt: "2026-09-10T04:00:00.000Z",
    expectedDocumentOutcome: "unknown" as const,
    expectedAcceptedOperations: { kind: "unknown" as const },
    basis: "No candidate trial was used; the operation-level result is intentionally unknown.",
    candidateTrialsBeforePrediction: 0 as const,
  };
}

describe("API Tester operation prospective pre-source freeze", () => {
  test("preregisters a reconstructable source protocol and six separate synthetic boundaries", () => {
    expect(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL).toMatchObject({
      identity: "skill-ir-api-tester-operation-prospective-001",
      denominator: { realDocuments: 12, independentRepositoryTarget: 12, syntheticDocuments: 6, totalDocuments: 18 },
      executionPolicy: { attemptsPerRow: 1, retries: 0, replacements: 0, candidateFixes: 0 },
      sourceDiscovery: {
        provider: "github-public-repository-search",
        order: "query-index-then-api-rank-then-repository-full-name-then-document-path",
      },
      resourceLimits: { maximumSourceBytes: 2_097_152, maximumOperations: 2_000 },
      audit: { heldOutAccesses: 0, q1ReservedAccesses: 0, modelCalls: 0, businessApiCalls: 0, paidCalls: 0 },
    });
    expect(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.sourceDiscovery.queries).toHaveLength(2);
    expect(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL.exclusions.exposedRepositories).toHaveLength(10);
    expect(API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS).toHaveLength(6);
    expect(new Set(API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS.map((entry) => entry.rowId)).size).toBe(6);
  });

  test("qualifies source structure without importing or executing the candidate", () => {
    const source = Buffer.from(JSON.stringify({
      openapi: "3.1.0",
      info: { title: "ordinary", version: "1" },
      paths: { "/items": { get: { responses: { "200": { description: "ok" } } } } },
    }));
    const license = Buffer.from("MIT License\n");
    expect(qualifyApiTesterOperationSourceCandidate({
      repositoryFullName: "fresh/example",
      repositoryFork: false,
      repositoryArchived: false,
      sourcePath: "spec/openapi.json",
      sourceFormat: "json",
      sourceBytes: source,
      licenseSpdx: "MIT",
      licenseBytes: license,
      priorSourceDigests: [],
      priorLineageKeys: [],
      lineageKey: "github-repository-id:42",
    })).toMatchObject({ status: "eligible", openapiVersion: "3.1.0", operationCount: 1 });

    expect(qualifyApiTesterOperationSourceCandidate({
      repositoryFullName: "oracle/opengrok",
      repositoryFork: false,
      repositoryArchived: false,
      sourcePath: "openapi.yaml",
      sourceFormat: "yaml",
      sourceBytes: Buffer.from("openapi: 3.0.3\ninfo: {title: x, version: '1'}\npaths: {}\n"),
      licenseSpdx: "CDDL-1.0",
      licenseBytes: license,
      priorSourceDigests: [],
      priorLineageKeys: [],
      lineageKey: "github-repository-id:43",
    })).toMatchObject({ status: "excluded", reasons: ["EXPOSED_REPOSITORY"] });
  });

  test("records a deterministic real-source shortfall without relaxing the protocol", () => {
    const report = ApiTesterOperationSourceSelectionReportSchema.parse({
      schemaVersion: "skill-ir-api-tester-operation-prospective-source-selection/v1",
      identity: "skill-ir-api-tester-operation-prospective-001",
      selectedAt: "2026-09-10T04:30:00.000Z",
      preSourceFreeze: { path: "pre-source-freeze.json", sha256: "a".repeat(64), commit: "b".repeat(40) },
      protocolSha256: digest(JSON.stringify(API_TESTER_OPERATION_PROSPECTIVE_PROTOCOL)),
      discovery: {
        requests: [{
          queryId: "github-topic-openapi-specification",
          requestedAt: "2026-09-10T04:00:00.000Z",
          url: "https://api.github.com/search/repositories?q=topic%3Aopenapi-specification",
          statusCode: 200,
          response: { path: "discovery/search-1.json", sha256: "c".repeat(64), bytes: 2 },
          sourceAcquisitionMillis: 1,
        }],
        candidatesInspected: 0,
        eligibleCandidates: 0,
        excludedCandidates: 0,
        orderingApplied: "query-index-then-api-rank-then-repository-full-name-then-document-path",
      },
      selected: [],
      excluded: [],
      shortfall: { target: 12, actual: 0, missing: 12, ruleRelaxed: false },
      accounting: {
        publicSourceSearchRequests: 1,
        publicSourceDownloadRequests: 0,
        candidateTrialsBeforeSelection: 0,
        modelCalls: 0,
        businessApiCalls: 0,
        paidCalls: 0,
        heldOutAccesses: 0,
        q1ReservedAccesses: 0,
        developmentAgentUsage: "host-external-not-measured-by-runner",
      },
      claimBoundary: "A shortfall remains a frozen negative source-selection outcome.",
    });
    expect(report.shortfall).toEqual({ target: 12, actual: 0, missing: 12, ruleRelaxed: false });
  });

  test("builds exactly twelve real rows plus six synthetics with predictions before execution", () => {
    const lock = buildApiTesterOperationProspectiveExperimentLock({
      preSourceFreeze: {
        path: "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/pre-source-freeze.json",
        sha256: "a".repeat(64),
        commit: "b".repeat(40),
      },
      selectionReport: { path: "source-selection.json", sha256: "9".repeat(64) },
      predictionsReport: { path: "predictions.json", sha256: "8".repeat(64) },
      selectionCommit: "c".repeat(40),
      frozenAt: "2026-09-10T05:00:00.000Z",
      realSelections: Array.from({ length: 12 }, (_, index) => realSelection(index)),
      realPredictions: Array.from({ length: 12 }, (_, index) => realPrediction(index)),
      syntheticRows: API_TESTER_OPERATION_PROSPECTIVE_SYNTHETICS.map((entry) => ({
        ...entry,
        bytes: 10,
        sha256: digest(entry.rowId),
        manifestSha256: digest(`${entry.rowId}-manifest`),
      })),
    });
    expect(lock).toMatchObject({
      status: "not-run",
      denominator: { realDocuments: 12, syntheticDocuments: 6, totalDocuments: 18 },
      executionPolicy: { attemptsPerRow: 1, retries: 0, replacements: 0, candidateFixes: 0 },
      accounting: { prospectiveRuns: 0, modelCalls: 0, businessApiCalls: 0, paidCalls: 0 },
    });
    expect(lock.rows).toHaveLength(18);
    expect(lock.rows.slice(0, 12).every((row) => row.stratum === "real-public-document")).toBe(true);
    expect(lock.rows.slice(12).every((row) => row.stratum === "synthetic-boundary")).toBe(true);
    expect(new Set(lock.rows.map((row) => row.rowId)).size).toBe(18);
    expect(() => ApiTesterOperationProspectiveExperimentLockSchema.parse({ ...lock, rows: lock.rows.slice(1) }))
      .toThrow(/18|denominator/iu);
  });

  test("enforces one dispatch and a contiguous independently bound terminal prefix", () => {
    const rowOrder = Array.from({ length: 18 }, (_, index) => `row-${String(index + 1).padStart(2, "0")}`);
    const initial = createApiTesterOperationProspectiveRunState({
      runKind: "first-run",
      lockSha256: "d".repeat(64),
      rowOrder,
      createdAt: "2026-09-10T06:00:00.000Z",
    });
    const prepared = prepareNextApiTesterOperationProspectiveRow(initial);
    const dispatched = markApiTesterOperationProspectiveRowDispatched(prepared, "2026-09-10T06:01:00.000Z");
    expect(() => markApiTesterOperationProspectiveRowDispatched(dispatched, "2026-09-10T06:02:00.000Z"))
      .toThrow(/dispatch|already/iu);
    expect(() => prepareNextApiTesterOperationProspectiveRow(dispatched)).toThrow(/dispatched|terminal/iu);

    const terminal = {
      rowId: rowOrder[0]!,
      rowIndex: 0,
      attemptId: "first-run-row-001",
      terminalSha256: "e".repeat(64),
      terminalAt: "2026-09-10T06:03:00.000Z",
    };
    const recorded = recordApiTesterOperationProspectiveTerminal(dispatched, terminal);
    expect(recorded).toMatchObject({ completedRows: 1, nextRowIndex: 1, dispatchCount: 1 });
    expect(() => recordApiTesterOperationProspectiveTerminal(recorded, terminal)).toThrow(/duplicate|current|terminal/iu);
  });

  test("enforces the preregistered aggregate runtime budget before another candidate process", () => {
    expect(remainingApiTesterOperationProspectiveRunMillis(0)).toBe(2_160_000);
    expect(remainingApiTesterOperationProspectiveRunMillis(2_159_999.2)).toBe(0);
    expect(remainingApiTesterOperationProspectiveRunMillis(2_160_001)).toBe(0);
  });

  test("derives first-run denominators from all rows and rejects report-only drift", () => {
    const rows = Array.from({ length: 18 }, (_, index) => ({
      rowId: `row-${String(index + 1).padStart(2, "0")}`,
      rowIndex: index,
      stratum: index < 12 ? "real-public-document" as const : "synthetic-boundary" as const,
      inputSha256: digest(`input-${index}`),
      manifestSha256: digest(`manifest-${index}`),
      terminal: {
        status: "completed" as const,
        reportSha256: digest(`report-${index}`),
        outputManifestSha256: digest(`output-${index}`),
        portableSemanticSha256: digest(`semantic-${index}`),
        documentDisposition: index % 2 === 0 ? "partial" as const : "rejected" as const,
        totals: { operations: 3, accepted: index % 2 === 0 ? 1 : 0, rejected: index % 2 === 0 ? 2 : 3, unresolved: 0, artifactCheckedPassedOperations: index % 2 === 0 ? 1 : 0 },
        gates: { implementationCorrectness: "pass" as const, sourceCorrectness: "pass" as const },
        obligationCoverage: { total: 1, covered: 1, uncovered: 0, status: "pass" as const },
        sourceIssues: { blocking: 0, advisories: 0 },
      },
      durationMillis: 1,
      accounting: { modelCalls: 0 as const, businessApiCalls: 0 as const, paidCalls: 0 as const },
    }));
    const report = buildApiTesterOperationProspectiveFirstRunReport({
      runKind: "first-run",
      lock: { path: "lock.json", sha256: "f".repeat(64), commit: "1".repeat(40) },
      startedAt: "2026-09-10T07:00:00.000Z",
      completedAt: "2026-09-10T07:01:00.000Z",
      rows,
    });
    expect(report.totals).toMatchObject({ documents: 18, operations: 54, acceptedOperations: 9, rejectedOperations: 45, unresolvedOperations: 0, artifactCheckedPassedOperations: 9 });
    expect(report.strata.realPublicDocuments.documents).toBe(12);
    expect(report.strata.syntheticBoundaries.documents).toBe(6);
    expect(() => ApiTesterOperationProspectiveFirstRunReportSchema.parse({
      ...report,
      totals: { ...report.totals, acceptedOperations: report.totals.acceptedOperations + 1 },
    })).toThrow(/derived|totals|denominator/iu);
  });

  test("executes the fixed eighteen-row loop once and strictly replays its archived closure", async () => {
    const testRoot = await mkdtemp(join(tmpdir(), "skvm-operation-prospective-eighteen-row-test-"));
    try {
      const lock = await materializeSyntheticOnlyEighteenRowLock(testRoot);
      const lockText = `${JSON.stringify(lock, null, 2)}\n`;
      await writeTestFile(testRoot, "experiment-lock.json", lockText);
      const outRoot = join(testRoot, "run");
      const report = await runApiTesterOperationProspectiveRows({
        rootDir: testRoot,
        lock,
        lockRef: { path: "experiment-lock.json", sha256: digest(lockText), commit: "c".repeat(40) },
        outRoot,
        nodeExecutable: Bun.which("node")!,
        runKind: "first-run",
        startedAt: "2026-09-10T07:30:00.000Z",
      });
      expect(report).toMatchObject({
        status: "completed",
        runKind: "first-run",
        denominator: { planned: 18, attempted: 18, realDocuments: 12, syntheticDocuments: 6 },
        accounting: { prospectiveRuns: 1, rowDispatches: 18, modelCalls: 0, businessApiCalls: 0, paidCalls: 0 },
      });
      expect(report.rows).toHaveLength(18);
      expect(JSON.parse(await readFile(join(outRoot, "journal", "first-run-row-001", "invocation.json"), "utf8"))).toMatchObject({
        rowId: report.rows[0]!.rowId,
        timeoutMillis: 120_000,
        entry: "src/skill-ir/api-tester-operation-input-run.ts",
      });
      expect(JSON.parse(await readFile(join(outRoot, "journal", "first-run-row-001", "exit.json"), "utf8"))).toMatchObject({
        status: 0,
        timedOut: false,
      });
      await expect(verifyApiTesterOperationProspectiveRunOutput({
        rootDir: testRoot,
        lock,
        outRoot,
        nodeExecutable: Bun.which("node")!,
        expectedRunKind: "first-run",
      })).resolves.toMatchObject({ status: "verified", rows: 18, prospectiveRuns: 1 });

      await writeFile(join(testRoot, "experiment-lock.json"), `${lockText} `, "utf8");
      await expect(verifyApiTesterOperationProspectiveRunOutput({
        rootDir: testRoot,
        lock,
        outRoot,
        nodeExecutable: Bun.which("node")!,
        expectedRunKind: "first-run",
      })).rejects.toThrow(/lock.*digest|digest.*lock/iu);
      await writeFile(join(testRoot, "experiment-lock.json"), lockText, "utf8");

      const invocationPath = "journal/first-run-row-001/invocation.json";
      const invocationBytes = await readFile(join(outRoot, invocationPath), "utf8");
      const driftedInvocation = JSON.parse(invocationBytes);
      driftedInvocation.entry = "src/skill-ir/not-the-frozen-entry.ts";
      await writeFile(join(outRoot, invocationPath), `${JSON.stringify(driftedInvocation, null, 2)}\n`, "utf8");
      await rebindProspectiveOutputManifest(outRoot, invocationPath);
      await expect(verifyApiTesterOperationProspectiveRunOutput({
        rootDir: testRoot,
        lock,
        outRoot,
        nodeExecutable: Bun.which("node")!,
        expectedRunKind: "first-run",
      })).rejects.toThrow(/invocation|journal/iu);
      await writeFile(join(outRoot, invocationPath), invocationBytes, "utf8");
      await rebindProspectiveOutputManifest(outRoot, invocationPath);

      const firstInventory = join(outRoot, "rows", report.rows[0]!.rowId, "candidate-output", "operation-inventory.json");
      await writeFile(firstInventory, `${await readFile(firstInventory, "utf8")} `, "utf8");
      await expect(verifyApiTesterOperationProspectiveRunOutput({
        rootDir: testRoot,
        lock,
        outRoot,
        nodeExecutable: Bun.which("node")!,
        expectedRunKind: "first-run",
      })).rejects.toThrow(/digest|output|closure/iu);
    } finally {
      await rm(testRoot, { recursive: true, force: true });
    }
  }, 30_000);

  test("runs all six synthetic documents through the ordinary entry without counting a prospective run", async () => {
    const outRoot = await mkdtemp(join(tmpdir(), "skvm-operation-prospective-synthetic-test-"));
    try {
      const report = await runApiTesterOperationSyntheticValidation({
        rootDir,
        outRoot,
        nodeExecutable: Bun.which("node")!,
        completedAt: "2026-09-10T08:00:00.000Z",
      });
      expect(report).toMatchObject({
        status: "completed",
        totals: { syntheticDocuments: 6, attempted: 6, infrastructureFailed: 0 },
        accounting: { prospectiveRuns: 0, realDocumentsRead: 0, modelCalls: 0, businessApiCalls: 0, paidCalls: 0 },
      });
      expect(report.rows).toHaveLength(6);
      expect(report.rows.every((row) => row.validationStatus === "pass")).toBe(true);
      expect(JSON.parse(await readFile(join(outRoot, "report.json"), "utf8"))).toEqual(report);
      await expect(verifyApiTesterOperationSyntheticValidation({ rootDir, outRoot, nodeExecutable: Bun.which("node")! }))
        .resolves.toEqual({ status: "verified", syntheticDocuments: 6, expectedSourceCoverageFailures: 1, prospectiveRuns: 0 });

      const inventory = join(outRoot, report.rows[0]!.output!.inventory.path);
      await writeFile(inventory, `${await readFile(inventory, "utf8")} `, "utf8");
      await expect(verifyApiTesterOperationSyntheticValidation({ rootDir, outRoot, nodeExecutable: Bun.which("node")! }))
        .rejects.toThrow(/digest|output|inventory/iu);
    } finally {
      await rm(outRoot, { recursive: true, force: true });
    }
  });

  test("binds candidate, protocol, runner, synthetic bytes, runtime, and zero unseen state", async () => {
    const validationPath = "benchmarks/skill-ir/classification/api-tester-operation-candidate-binding-v1.json";
    const candidateBytes = await readFile(join(rootDir, validationPath), "utf8");
    const validationSha256 = digest(candidateBytes);
    const candidate = JSON.parse(candidateBytes) as { runtime: { node: string } };
    const freeze = await buildApiTesterOperationProspectivePreSourceFreeze({
      rootDir,
      executionCommit: "2".repeat(40),
      frozenAt: "2026-09-10T09:00:00.000Z",
      bunVersion: Bun.version,
      nodeVersion: candidate.runtime.node,
      syntheticValidation: { path: validationPath, sha256: validationSha256 },
    });
    expect(freeze).toMatchObject({
      status: "frozen-pending-push",
      candidate: { identity: "skill-ir-api-tester-operation-candidate-binding-002" },
      sourceState: { realSourcesSearched: 0, realSourcesRead: 0, selectedRealDocuments: 0, realPredictionsAuthored: 0, prospectiveRuns: 0 },
      runtime: { bun: Bun.version, node: candidate.runtime.node },
    });
    expect(freeze.implementation.map((entry) => entry.path)).toEqual([
      "src/benchmarks/skill-ir/api-tester-operation-prospective-run.ts",
      "src/benchmarks/skill-ir/api-tester-operation-prospective.ts",
    ]);
    await expect(verifyApiTesterOperationProspectivePreSourceFreezeLocal({ rootDir, freeze, bunVersion: Bun.version, nodeVersion: candidate.runtime.node }))
      .resolves.toMatchObject({ status: "verified", syntheticDocuments: 6, prospectiveRuns: 0 });
    const drifted = structuredClone(freeze);
    drifted.implementation[0]!.sha256 = "0".repeat(64);
    await expect(verifyApiTesterOperationProspectivePreSourceFreezeLocal({ rootDir, freeze: drifted, bunVersion: Bun.version, nodeVersion: candidate.runtime.node }))
      .rejects.toThrow(/implementation|digest/iu);
  });

  test("rejects a pre-source freeze whose validation closure is absent from its execution commit", async () => {
    const freeze = JSON.parse(await readFile(join(
      rootDir,
      "benchmarks/skill-ir/pilots/api-tester/operation-prospective-001/pre-source-freeze.json",
    ), "utf8"));
    await expect(verifyApiTesterOperationProspectivePreSourceFreezeGitArchive({
      rootDir,
      freeze,
      nodeExecutable: Bun.which("node")!,
      gitExecutable: "git",
    })).rejects.toThrow(/validation closure.*missing/iu);
  });

  test("CLI separates pre-source freeze, verification, synthetic validation, lock, first run, and reproduction", () => {
    expect(parseApiTesterOperationProspectiveCommand([
      "--mode=verify-synthetic", "--root=repo", "--out=synthetic", "--node=node",
    ])).toMatchObject({ mode: "verify-synthetic", rootDir: "repo", outputRoot: "synthetic" });
    expect(parseApiTesterOperationProspectiveCommand([
      "--mode=create-pre-source-freeze", "--root=repo", "--out=freeze.json", "--execution-commit=1" + "0".repeat(39),
      "--frozen-at=2026-09-10T09:00:00.000Z", "--node=node", "--git=git", "--synthetic-validation=synthetic/report.json",
    ])).toMatchObject({ mode: "create-pre-source-freeze", rootDir: "repo", outputPath: "freeze.json" });
    expect(parseApiTesterOperationProspectiveCommand([
      "--mode=execute", "--root=repo", "--lock=lock.json", "--freeze=freeze.json", "--freeze-commit=3" + "0".repeat(39), "--execution-commit=2" + "0".repeat(39),
      "--out=run", "--node=node", "--git=git", "--started-at=2026-09-10T10:00:00.000Z",
    ])).toMatchObject({ mode: "execute", outputRoot: "run" });
    expect(() => parseApiTesterOperationProspectiveCommand(["--mode=create-pre-source-freeze", "--source=unseen.yaml"]))
      .toThrow(/unknown|root|required/iu);
  });
});
