import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  materializeN10DevelopmentPanel,
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
});
