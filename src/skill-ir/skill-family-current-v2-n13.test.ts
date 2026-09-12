import { createHash } from "node:crypto";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { currentV2LoopbackFixtures } from "./skill-family-current-v2-n5";
import {
  collectSchemathesisFailureChecks,
  createCurrentV2SchemathesisEnvironment,
  createCurrentV2SchemathesisArguments,
  deriveCurrentV2AddedValueEvidence,
  summarizeCurrentV2SchemathesisRuns,
  verifyCurrentV2N13Comparison,
  writeCurrentV2N13Reclassification,
} from "./skill-family-current-v2-n13";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

test("N13 fixes the actual external-tool budget while reusing the exact N5 fixtures", async () => {
  const fixtures = currentV2LoopbackFixtures();
  expect(fixtures.map((row) => [row.id, sha(row.source)])).toEqual([
    ["json-reference", "ea2dfe81ded878cf9aa4cfa6d51bd24d5f7e47e606c9d707d165b80f9581b81b"],
    ["form-wire", "ccad5c315e8fb3c7a9d000c3c60b31a4ef9ba81b2d667860b856aa5815caa3d5"],
  ]);
  const arguments_ = createCurrentV2SchemathesisArguments({
    sourcePath: "source.json",
    baseUrl: "http://127.0.0.1:43123",
    reportDirectory: "report",
  });
  expect(arguments_).toContain("--max-examples=2");
  expect(arguments_).toContain("--request-timeout=5");
  expect(arguments_).toContain("--max-time=30");
  expect(arguments_).toContain("--request-retries=0");
  expect(arguments_).toContain("--seed=20260912");
  expect(arguments_).toContain("--generation-deterministic");
  expect(arguments_).toContain("--generation-unique-inputs");
  expect(arguments_).not.toContain("--generation-database=none");
  expect(arguments_).toContain("--workers=1");
  expect(arguments_).toContain("--mode=positive");
  expect(arguments_).toContain("--phases=fuzzing");
});

test("N13 attributes a fault only to the named Schemathesis check", () => {
  const raw = {
    events: [{ failures: [
      { type: "JsonSchemaError", title: "body mismatch" },
      { type: "UndefinedStatusCode", title: "status mismatch" },
    ] }],
    command: "--checks=not_a_server_error,status_code_conformance,content_type_conformance,response_headers_conformance,response_schema_conformance",
  };
  expect(collectSchemathesisFailureChecks(raw)).toEqual([
    "response_schema_conformance",
    "status_code_conformance",
  ]);
  expect(collectSchemathesisFailureChecks({ error: "some unrelated crash" })).toEqual([]);
});

test("N13 fault counts are exclusive, non-negative, and require actual injection", () => {
  const summary = summarizeCurrentV2SchemathesisRuns([{
    scenarioId: "fault-not-applied",
    fixtureId: "json-reference",
    faultId: "undocumented-status",
    expectedCheck: "status_code_conformance",
    expectedCheckDetected: true,
    faultAppliedCount: 0,
    exitCode: 1,
    timedOut: false,
    budgetExceeded: false,
    requestCount: 2,
    uniqueWireRequests: 2,
    validFixtureRequests: 0,
  } as any]);
  expect(summary).toMatchObject({
    faultInjections: 1,
    correctlyDetectedFaults: 0,
    missedFaults: 0,
    notApplicableFaults: 1,
  });
  expect(summary.correctlyDetectedFaults + summary.missedFaults + summary.notApplicableFaults)
    .toBe(summary.faultInjections);
});

test("N13 forces UTF-8 for Schemathesis subprocess output on Windows", () => {
  const environment = createCurrentV2SchemathesisEnvironment({ PATH: "fixture-path" });
  expect(environment.PATH).toBe("fixture-path");
  expect(environment.PYTHONUTF8).toBe("1");
  expect(environment.PYTHONIOENCODING).toBe("utf-8");
  expect(environment.NO_PROXY).toBe("127.0.0.1,localhost");
});

test("N13 derives traceability and task-conditioned deltas from archived evidence", async () => {
  const repositoryRoot = resolve(import.meta.dir, "../..");
  const evidence = await deriveCurrentV2AddedValueEvidence(repositoryRoot);
  expect(evidence.traceability.requiredObligations).toBeGreaterThan(0);
  expect(evidence.traceability.allRequiredObligationsLocated).toBe(true);
  expect(evidence.sameSourceTaskDelta.sourceInputId).toBe("zapier-embed");
  expect(evidence.sameSourceTaskDelta.semanticPlansDiffer).toBe(true);
  expect(evidence.sameSourceTaskDelta.requiredOutcomesDiffer).toBe(true);
  expect(evidence.modelCalls).toBe(0);
});

test("N13 verifier rejects the archived revision-002 negative fault denominator", async () => {
  const repositoryRoot = resolve(import.meta.dir, "../..");
  const report = await Bun.file(resolve(repositoryRoot,
    "results/skill-ir/skill-family-current-v2-source-repair-001/comparison/revision-002/schemathesis-report.json")).json();
  const verification = await verifyCurrentV2N13Comparison({ repositoryRoot, report });
  expect(verification.status).toBe("fail");
  expect(verification.errors).toContain("N13_FAULT_DENOMINATOR_INVALID");
});

test("N13 reclassifies archived raw evidence without another external execution", async () => {
  const repositoryRoot = resolve(import.meta.dir, "../..");
  const temporaryRoot = await mkdtemp(resolve(repositoryRoot, ".tmp-n13-reclassification-"));
  try {
    const codeCommit = (await Bun.$`git rev-parse HEAD`.cwd(repositoryRoot).text()).trim();
    const built = await writeCurrentV2N13Reclassification({
      repositoryRoot,
      codeCommit,
      evaluatedAt: "2026-09-12T04:00:00.000Z",
      sourceReportPath:
        "results/skill-ir/skill-family-current-v2-source-repair-001/comparison/revision-002/schemathesis-report.json",
      relativeOutputDirectory: relative(repositoryRoot, temporaryRoot).replaceAll("\\", "/"),
    });
    expect(built.report.summary).toEqual({
      baselineRuns: 2,
      baselinePassed: 0,
      baselineRequests: 3,
      baselineUniqueWireRequests: 3,
      baselineValidFixtureRequests: 0,
      faultInjections: 3,
      correctlyDetectedFaults: 0,
      missedFaults: 0,
      notApplicableFaults: 3,
      actualLoopbackHttpCalls: 9,
    });
    expect(built.tool.reclassification).toMatchObject({
      externalToolReexecuted: false,
      additionalLoopbackHttpCalls: 0,
      classificationRevision: "fault-denominator-v2",
    });
    const verification = await verifyCurrentV2N13Comparison({ repositoryRoot, report: built.report });
    expect(verification).toEqual({ status: "pass", errors: [] });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
