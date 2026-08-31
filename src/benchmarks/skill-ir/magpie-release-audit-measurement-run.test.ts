import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  MAGPIE_MEASUREMENT_POLICY_PATH,
  buildMagpieReleaseAuditOrderedRows,
} from "./magpie-release-audit-measurement";
import {
  initializeMagpieMeasurementSerialState,
  buildMagpieReleaseAuditFinalResult,
  readMagpieMeasurementSerialStatus,
  prepareMagpieReleaseAuditMeasurementRun,
  runMagpieReleaseAuditExecutableQualification,
  runMagpieMeasurementSerial,
  snapshotMagpieActiveTree,
} from "./magpie-release-audit-measurement-run";
import { resetPersistentWorkDir } from "./real-agent-run";

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function fakeEntry(row: ReturnType<typeof buildMagpieReleaseAuditOrderedRows>[number], rowIndex: number) {
  return {
    row,
    attemptId: `row-${rowIndex + 1}`,
    status: "complete" as const,
    infrastructureFailure: false,
    durationMs: 1,
    executionClassification: row.system === "original" ? "semantic-complete" as const : "deterministic-complete" as const,
    usage: { available: true, input: row.system === "original" ? 10 : 0, output: row.system === "original" ? 2 : 0, cacheRead: 0, cacheWrite: 0 },
    quality: { passed: true, failures: [] },
    outputSha256: "a".repeat(64),
  };
}

describe("Magpie release-audit foreground serial control plane", () => {
  test("qualifies the real executable spawn and complete 36-row read-only status tree", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "magpie-executable-qualification-"));
    temporary.push(fixtureRoot);
    const reportPath = join(fixtureRoot, "qualification.json");

    const report = await runMagpieReleaseAuditExecutableQualification({
      rootDir: resolve(import.meta.dir, "../../.."),
      outputPath: reportPath,
      qualifiedAt: "2026-08-31T08:00:00.000Z",
    });

    expect(report.status).toBe("passed");
    expect(report.runtime.smoke).toEqual(expect.objectContaining({ exitCode: 0, observedVersion: Bun.version }));
    expect(report.controlPlane).toEqual(expect.objectContaining({
      materializedRows: 36,
      concurrentStatusReads: 12,
      byteIdentical: true,
    }));
    expect(report.controlPlane.before).toEqual(report.controlPlane.after);
    expect(report.predecessors.failures).toHaveLength(2);
    expect(report.predecessors.reusedRows).toBe(0);
    expect(report.accounting).toEqual({
      modelCalls: 0,
      apiCalls: 0,
      paidCalls: 0,
      retries: 0,
      heldOutAccesses: 0,
    });
    expect(report.humanMinutes).toBeNull();
    expect(await Bun.file(reportPath).exists()).toBe(true);
    expect(await readFile(reportPath, "utf8")).not.toContain(process.execPath);
  });

  test("prepares original rows in the persistent run-N workdir ABI", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "magpie-measurement-prepare-"));
    temporary.push(fixtureRoot);
    const activeDir = join(fixtureRoot, "run");
    await prepareMagpieReleaseAuditMeasurementRun(resolve(import.meta.dir, "../../.."), activeDir);
    const workDir = join(activeDir, "rows", "run-1", "workdir");

    await resetPersistentWorkDir(workDir);

    expect((await stat(workDir)).isDirectory()).toBe(true);
    expect(await Bun.file(join(activeDir, "rows", "run-1", "task.json")).exists()).toBe(true);
  });

  test("commits rows in order and makes repeated status reads byte-identical", async () => {
    const activeDir = await mkdtemp(join(tmpdir(), "magpie-measurement-serial-"));
    temporary.push(activeDir);
    const rows = buildMagpieReleaseAuditOrderedRows().slice(0, 4);
    await initializeMagpieMeasurementSerialState({
      activeDir,
      experimentId: "serial-test",
      identityDigest: "b".repeat(64),
      rows,
      preparedFiles: [],
    });
    const state = await runMagpieMeasurementSerial({
      activeDir,
      experimentId: "serial-test",
      identityDigest: "b".repeat(64),
      rows,
      executeRow: async (row, rowIndex) => ({ entry: fakeEntry(row, rowIndex), stopAfterCommit: false }),
    });
    expect(state.phase).toBe("done");
    expect(state.completedRows).toBe(4);
    expect(state.dispatchCount).toBe(4);
    const before = await snapshotMagpieActiveTree(activeDir);
    await Promise.all(Array.from({ length: 12 }, () => readMagpieMeasurementSerialStatus({
      activeDir, experimentId: "serial-test", identityDigest: "b".repeat(64), rows,
    })));
    const after = await snapshotMagpieActiveTree(activeDir);
    expect(after).toEqual(before);
  });

  test("fails closed when dispatch was persisted without a terminal prefix", async () => {
    const activeDir = await mkdtemp(join(tmpdir(), "magpie-measurement-inflight-"));
    temporary.push(activeDir);
    const rows = buildMagpieReleaseAuditOrderedRows().slice(0, 2);
    await initializeMagpieMeasurementSerialState({
      activeDir, experimentId: "serial-test", identityDigest: "c".repeat(64), rows, preparedFiles: [],
    });
    const statePath = join(activeDir, "serial-state.json");
    const state = JSON.parse(await readFile(statePath, "utf8"));
    await Bun.write(statePath, `${JSON.stringify({ ...state, phase: "running", dispatchCount: 1, inFlightRowIndex: 0 }, null, 2)}\n`);
    let calls = 0;
    const failed = await runMagpieMeasurementSerial({
      activeDir,
      experimentId: "serial-test",
      identityDigest: "c".repeat(64),
      rows,
      executeRow: async (row, rowIndex) => {
        calls += 1;
        return { entry: fakeEntry(row, rowIndex), stopAfterCommit: false };
      },
    });
    expect(failed.phase).toBe("failed");
    expect(failed.failure).toBe("dispatched-without-terminal:row-01");
    expect(calls).toBe(0);
  });

  test("recomputes the complete denominator while keeping research efficiency ineligible", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "magpie-measurement-result-"));
    temporary.push(rootDir);
    const activeDir = join(rootDir, "results", "skill-ir", "candidate", "run");
    await mkdir(activeDir, { recursive: true });
    const policyPath = resolve(rootDir, ...MAGPIE_MEASUREMENT_POLICY_PATH.split("/"));
    await mkdir(join(policyPath, ".."), { recursive: true });
    await writeFile(policyPath, "{\"frozen\":true}\n", "utf8");
    const rows = buildMagpieReleaseAuditOrderedRows();
    const entries = rows.map((row, rowIndex) => fakeEntry(row, rowIndex));
    await writeFile(join(activeDir, "matrix-prefix.json"), `${JSON.stringify(entries, null, 2)}\n`, "utf8");

    const result = await buildMagpieReleaseAuditFinalResult({ rootDir, activeDir, entries });

    expect(result.denominator).toEqual({ expectedRows: 36, observedRows: 36, pairs: 18, paidOriginalRows: 18, deterministicArtifactRows: 18, retries: 0 });
    expect(result.quality).toEqual({ originalPasses: 18, artifactPasses: 18, completePairs: 18, infrastructureFailures: 0, pairwiseRegressions: 0, machineCheckedEquivalent: true });
    expect(result.runtimeCost.original.aggregateInputTokens).toBe(180);
    expect(result.runtimeCost.original.aggregateOutputTokens).toBe(36);
    expect(result.runtimeCost.meanModelTokensSavedPerRun).toBe(12);
    expect(result.runtimeCost.conditionalExplicitApiTokenBreakEven).toEqual({ status: "computed", calls: 0, firstRecurringRunNetPositive: true });
    expect(result.researchEligibility).toEqual({ allAttemptCostComplete: false, efficiencyPositiveEligible: false, classification: "not-eligible-unobservable-development-agent-cost" });
  });
});
