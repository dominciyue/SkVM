import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  materializeN10DevelopmentPanel,
  readN10RequiredCompletionCounts,
  summarizeN10FirstRunRows,
  writeN10BaselineFromDevelopmentPanel,
  verifyN10Baseline,
  verifyN10DevelopmentPanel,
} from "./skill-family-current-v2-n10";

describe("current-v2 N10 development panel lock", () => {
  test("locks six original contracts, complete operation denominators, and reviewed task mappings before construction", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-n10-lock-"));
    try {
      const developmentDirectory = join(temporaryRoot, "development");
      const result = await materializeN10DevelopmentPanel({
        repositoryRoot: process.cwd(),
        developmentDirectory,
        lockedAt: "2026-09-12T11:30:00.000Z",
      });

      expect(result.lock.summary).toMatchObject({
        uniqueInputs: 6,
        providers: 3,
        operationDenominator: 47,
        taskContracts: 9,
        expectedCompleteTasks: 6,
        expectedCompleteProviders: 3,
      });
      expect(result.lock.sources.map((row) => row.inputId)).toEqual([
        "onepassword-connect",
        "onepassword-partnership",
        "visier-authentication",
        "visier-analytics",
        "zapier-actions",
        "zapier-embed",
      ]);
      expect(new Set(result.lock.sources.map((row) => row.provider))).toEqual(
        new Set(["1Password", "Visier", "Zapier"]),
      );
      expect(result.lock.sources.every((row) => row.enumeration.complete)).toBe(true);
      expect(result.lock.sources.every((row) =>
        row.enumeration.operationCount === row.enumeration.operations.length
        && new Set(row.enumeration.operations.map((operation: { key: string }) => operation.key)).size === row.enumeration.operationCount,
      )).toBe(true);
      expect(new Set(result.lock.tasks.map((row) => row.mapping.repository)).size).toBeGreaterThanOrEqual(3);
      expect(result.lock.tasks.every((row) => row.denominator.operationKeys.length > 0
        && row.denominator.requirements.length > 0)).toBe(true);
      expect(result.lock.comparisons.filter((row) => row.expectedRelation === "different-plan-and-artifact"))
        .toHaveLength(2);

      const verification = await verifyN10DevelopmentPanel({
        repositoryRoot: process.cwd(),
        developmentDirectory,
      });
      expect(verification).toEqual({ status: "pass", errors: [] });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("independently rejects a task byte change after the lock", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-n10-lock-tamper-"));
    try {
      const developmentDirectory = join(temporaryRoot, "development");
      const result = await materializeN10DevelopmentPanel({
        repositoryRoot: process.cwd(),
        developmentDirectory,
        lockedAt: "2026-09-12T11:30:00.000Z",
      });
      const taskPath = join(developmentDirectory, "task-contracts", `${result.lock.tasks[0]!.taskId}.json`);
      const task = JSON.parse(await readFile(taskPath, "utf8"));
      task.output = "pytest";
      await writeFile(taskPath, `${JSON.stringify(task, null, 2)}\n`);

      const verification = await verifyN10DevelopmentPanel({
        repositoryRoot: process.cwd(),
        developmentDirectory,
      });
      expect(verification.status).toBe("fail");
      expect(verification.errors).toContain(`TASK_SHA256_MISMATCH:${result.lock.tasks[0]!.taskId}`);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("records a source-only baseline without treating unbound specimens as completed tasks", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "skvm-n10-baseline-"));
    try {
      const developmentDirectory = join(temporaryRoot, "development");
      await materializeN10DevelopmentPanel({
        repositoryRoot: process.cwd(),
        developmentDirectory,
        lockedAt: "2026-09-12T11:30:00.000Z",
      });
      const built = await writeN10BaselineFromDevelopmentPanel({
        repositoryRoot: process.cwd(),
        developmentDirectory,
        lockCommit: "0000000000000000000000000000000000000000",
        executedAt: "2026-09-12T12:00:00.000Z",
      });

      expect(built.report.summary).toMatchObject({
        uniqueInputs: 6,
        operationDenominator: 47,
        taskContracts: 9,
        taskComplete: 0,
        taskPackageChecks: 0,
        nativeExecuted: 0,
      });
      expect(built.report.sources.every((row) => row.componentChecks === "pass"
        && row.repeat.semanticDigestMatches)).toBe(true);
      expect(built.report.tasks.every((row) => row.taskComplete === false
        && row.checkedBoundRequiredObligations === 0
        && row.packageCheck === "not-available")).toBe(true);
      expect(await verifyN10Baseline({ repositoryRoot: process.cwd(), developmentDirectory }))
        .toEqual({ status: "pass", errors: [] });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  test("summarizes every current first-run outcome without dropping expected negative rows", () => {
    const summary = summarizeN10FirstRunRows({
      uniqueInputs: 6,
      providers: 3,
      operationDenominator: 47,
      comparisonTotal: 2,
      comparisonPassed: 2,
      rows: [
        { taskId: "positive-a", provider: "A", taskComplete: true, expectedTaskComplete: true,
          packageCheck: "pass", required: { total: 2, checkedExported: 2, failed: 0, unresolved: 0, insufficientInput: 0, missing: 0 }, nativeExecuted: 0, modificationCount: 0 },
        { taskId: "negative-b", provider: "B", taskComplete: false, expectedTaskComplete: false,
          packageCheck: "pass", required: { total: 2, checkedExported: 1, failed: 0, unresolved: 1, insufficientInput: 0, missing: 0 }, nativeExecuted: 0, modificationCount: 0 },
        { taskId: "positive-c", provider: "C", taskComplete: true, expectedTaskComplete: true,
          packageCheck: "pass", required: { total: 1, checkedExported: 1, failed: 0, unresolved: 0, insufficientInput: 0, missing: 0 }, nativeExecuted: 0, modificationCount: 0 },
      ],
    });
    expect(summary).toMatchObject({
      taskContracts: 3,
      taskComplete: 2,
      completeProviders: 2,
      expectedOutcomeMatches: 3,
      expectedOutcomeMismatches: 0,
      packageChecksPassed: 3,
      requiredObligationDenominator: 5,
      checkedExportedRequiredObligations: 4,
      unresolvedRequiredObligations: 1,
      comparisonsPassed: 2,
    });
  });

  test("reads required completion counts from the artifact contract rather than a nonexistent counts field", () => {
    const required = { total: 3, checkedExported: 2, failed: 0, unresolved: 1, insufficientInput: 0, missing: 0 };
    expect(readN10RequiredCompletionCounts({ completion: { required, counts: { total: 999 } } })).toEqual(required);
    expect(() => readN10RequiredCompletionCounts({ completion: { counts: required } })).toThrow(
      "task package lacks completion.required counts",
    );
  });
});
