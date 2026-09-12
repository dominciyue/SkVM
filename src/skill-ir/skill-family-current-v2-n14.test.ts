import { resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  areCurrentV2N14ExternalPathsDisjoint,
  buildCurrentV2N14CleanReplayReport,
  compareCurrentV2N14TaskRows,
  summarizeCurrentV2N14NativeConsumer,
} from "./skill-family-current-v2-n14";

const COMMIT = "a".repeat(40);

test("N14 native accounting keeps attempted, executed, failed, errors, and skipped distinct", () => {
  const summary = summarizeCurrentV2N14NativeConsumer({
    fixtures: [
      { fixtureId: "json", status: "pass", junit: { tests: 4, executed: 2, passed: 2, failed: 0, errors: 0, skipped: 2 } },
      { fixtureId: "form", status: "pass", junit: { tests: 5, executed: 2, passed: 2, failed: 0, errors: 0, skipped: 3 } },
    ],
    accounting: { loopbackHttpCalls: 4, remoteHttpCalls: 0, projectModelCalls: 0, paidCalls: 0 },
  });
  expect(summary).toEqual({
    attempted: 9,
    executed: 4,
    passed: 4,
    failed: 0,
    errors: 0,
    skipped: 5,
    loopbackHttpCalls: 4,
    remoteHttpCalls: 0,
    projectModelCalls: 0,
    paidCalls: 0,
    conservation: true,
  });
});

test("N14 task comparison preserves unresolved failure semantics, not only aggregate counts", () => {
  const baseline = {
    taskId: "form-negative",
    taskComplete: false,
    packageCheck: "pass",
    required: { total: 1, checkedExported: 0, failed: 0, unresolved: 1, insufficientInput: 0, missing: 0 },
    semanticPlanSha256: "b".repeat(64),
    taskPackageSha256: "c".repeat(64),
    backend: { kind: "request-json", constructed: 0, unresolved: 1 },
    consumer: { status: "exported", executed: 0, reason: "request JSON is a checked data artifact" },
    obligationResults: [{ obligationId: "o1", state: "unresolved", reason: "form field count unsupported" }],
    sourceClosureSummary: { blocking: 0, advisories: 0 },
  };
  expect(compareCurrentV2N14TaskRows(baseline, structuredClone(baseline))).toMatchObject({
    semanticEqual: true,
    failureSemanticsEqual: true,
    passed: true,
  });
  const drift = structuredClone(baseline);
  drift.obligationResults[0]!.reason = "silently accepted";
  expect(compareCurrentV2N14TaskRows(baseline, drift)).toMatchObject({
    semanticEqual: false,
    failureSemanticsEqual: false,
    passed: false,
  });
});

test("N14 final report is an engineering replay and cannot invent a research candidate", () => {
  const input = {
    codeCommit: COMMIT,
    completedAt: "2026-09-12T15:00:00.000Z",
    attempt: 1,
    checkout: { path: "D:/cv2-n14-a", head: COMMIT, detached: true, trackedCleanBefore: true, trackedCleanAfter: true },
    dependencies: {
      bunInstall: { command: "bun install --frozen-lockfile --offline", exitCode: 0, lockSha256: "d".repeat(64) },
      python: { manifestSha256: "e".repeat(64), archiveSha256: "4337563df85d7ae9a6669aaf757b87e594189f077883bd03f5ecbd0b8dcac1de",
        archiveBytes: 904839, distributions: 13, files: 356, extractVerified: true },
    },
    research: { chainStatus: "not-executed", candidate: null, prospectiveRuns: 0 },
    replay: {
      n8: { status: "pass", cases: 4, bundleReplay: true },
      n10: { status: "pass", tasks: 9, packageChecksPassed: 9, taskComplete: 4, required: 18,
        checkedExported: 8, unresolved: 10, failureSemanticsEqual: true },
      native: { status: "pass", attempted: 9, executed: 4, passed: 4, failed: 0, errors: 0, skipped: 5,
        loopbackHttpCalls: 4, directPackageExecution: true },
    },
    verification: { focusedTests: { exitCode: 0, passed: 20, failed: 0 }, typecheck: { exitCode: 0 } },
    provenance: {
      attempt: { path: "results/skill-ir/skill-family-current-v2-source-repair-001/clean-replay/attempt-001.json", sha256: "f".repeat(64), bytes: 100 },
      insideReport: { path: "results/skill-ir/skill-family-current-v2-source-repair-001/clean-replay/cache/inside-report.json", sha256: "2".repeat(64), bytes: 100 },
      archiveManifest: { path: "results/skill-ir/skill-family-current-v2-source-repair-001/clean-replay/archive-manifest.json", sha256: "1".repeat(64), bytes: 100 },
    },
  } as const;
  const report = buildCurrentV2N14CleanReplayReport(input);
  expect(report.decision).toBe("passed");
  expect(report.engineeringCodeCommit).toBe(COMMIT);
  expect(report.researchCandidate).toBeNull();
  expect(report.protectedBoundary).toMatchObject({ heldOutReads: 0, q1ReservedReads: 0, prospectiveRuns: 0 });

  const untrustedInput: unknown = {
    ...input,
    research: { chainStatus: "not-executed", candidate: COMMIT, prospectiveRuns: 0 },
  };
  expect(() => buildCurrentV2N14CleanReplayReport(
    untrustedInput as Parameters<typeof buildCurrentV2N14CleanReplayReport>[0],
  )).toThrow("research candidate");

  const negativeDenominator: unknown = {
    ...input,
    replay: {
      ...input.replay,
      native: { ...input.replay.native, attempted: -1, executed: -1, passed: -1 },
    },
  };
  expect(() => buildCurrentV2N14CleanReplayReport(
    negativeDenominator as Parameters<typeof buildCurrentV2N14CleanReplayReport>[0],
  )).toThrow("denominator");

  const escapingProvenance: unknown = {
    ...input,
    provenance: { ...input.provenance, attempt: { ...input.provenance.attempt, path: "../escape.json" } },
  };
  expect(() => buildCurrentV2N14CleanReplayReport(
    escapingProvenance as Parameters<typeof buildCurrentV2N14CleanReplayReport>[0],
  )).toThrow("provenance path");
});

test("N14 requires checkout and output roots to be separate external trees", () => {
  const checkout = resolve("C:/n14/checkout");
  const output = resolve("C:/n14/output");
  expect(areCurrentV2N14ExternalPathsDisjoint(checkout, output)).toBeTrue();
  expect(areCurrentV2N14ExternalPathsDisjoint(checkout, checkout)).toBeFalse();
  expect(areCurrentV2N14ExternalPathsDisjoint(checkout, resolve(checkout, "evidence"))).toBeFalse();
  expect(areCurrentV2N14ExternalPathsDisjoint(resolve(output, "nested"), output)).toBeFalse();
});
