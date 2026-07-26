import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  assertNoExperimentalDesignV3HeldoutEvidence,
  createExperimentalDesignV3HeldoutFreeze,
  validateExperimentalDesignV3HeldoutAuditBoundary,
  verifyExperimentalDesignV3HeldoutFreeze,
} from "./experimental-design-v3-heldout-freeze.ts";
import { parseExperimentalDesignV3HeldoutFreezeArgs } from "./experimental-design-v3-heldout-freeze-run.ts";

const rootDir = path.resolve(import.meta.dir, "../../..");
const inputsCommit = "31bf56527f01d2b192fd462b8065ad55bde6f8d6";
const oldTaskCommit = "c9d8c2e198206d5956de178e47e65ae9fafb071d";
const v3Root = "benchmarks/skill-ir/pilots/experimental-design/v3";

async function loadJson(relativePath: string): Promise<any> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

async function createFreeze() {
  return createExperimentalDesignV3HeldoutFreeze(rootDir, inputsCommit);
}

describe("experimental-design v3 held-out identity freeze", () => {
  test("accepts the exact task split, scorer, passed audit, and inputs commit", async () => {
    const freeze = await createFreeze();
    const verified = await verifyExperimentalDesignV3HeldoutFreeze(rootDir, freeze);

    expect(verified.inputsCommit).toBe(inputsCommit);
    expect(verified.taskSplitFreeze.path).toBe(`${v3Root}/task-split-freeze.json`);
    expect(verified.heldoutTasks.path).toBe(`${v3Root}/heldout/tasks.json`);
    expect(verified.scorer).toMatchObject({
      path: "src/bench/evaluators/experimental-design-grade-v3.ts",
      evaluatorId: "skill-ir-experimental-design-v3",
    });
    expect(verified.auditManifest.path).toBe(`${v3Root}/benchmark-contract-audit.json`);
    expect(verified.auditReport.path).toBe(
      "results/skill-ir/benchmark-contract-audit/experimental-design-v3.json",
    );
  });

  test("rejects held-out task, scorer, audit, and task-split digest drift", async () => {
    for (const mutate of [
      (value: any) => (value.heldoutTasks.sha256 = "0".repeat(64)),
      (value: any) => (value.scorer.sha256 = "0".repeat(64)),
      (value: any) => (value.auditManifest.sha256 = "0".repeat(64)),
      (value: any) => (value.auditReport.sha256 = "0".repeat(64)),
      (value: any) => (value.taskSplitFreeze.sha256 = "0".repeat(64)),
    ]) {
      const freeze = structuredClone(await createFreeze());
      mutate(freeze);
      await expect(
        verifyExperimentalDesignV3HeldoutFreeze(rootDir, freeze),
      ).rejects.toThrow(/digest mismatch/i);
    }
  });

  test("rejects a non-passed report and held-out references in the audit boundary", async () => {
    const [taskSplit, manifest, report] = await Promise.all([
      loadJson(`${v3Root}/task-split-freeze.json`),
      loadJson(`${v3Root}/benchmark-contract-audit.json`),
      loadJson("results/skill-ir/benchmark-contract-audit/experimental-design-v3.json"),
    ]);
    expect(() =>
      validateExperimentalDesignV3HeldoutAuditBoundary(taskSplit, manifest, report),
    ).not.toThrow();

    const failedReport = structuredClone(report);
    failedReport.status = "failed";
    expect(() =>
      validateExperimentalDesignV3HeldoutAuditBoundary(
        taskSplit,
        manifest,
        failedReport,
      ),
    ).toThrow(/audit report.*passed/i);

    for (const leak of [
      taskSplit.heldoutTasks.taskIds[0],
      taskSplit.heldoutTasks.path,
      taskSplit.heldoutTasks.sha256,
      taskSplit.fixtureProjectionSha256,
      taskSplit.heldoutSentinel,
    ]) {
      const leakedManifest = structuredClone(manifest);
      leakedManifest.requirements[0].contractTokens.push(leak);
      expect(() =>
        validateExperimentalDesignV3HeldoutAuditBoundary(
          taskSplit,
          leakedManifest,
          report,
        ),
      ).toThrow(/held-out evidence/i);
    }
  });

  test("rejects held-out evidence in each construction-shaped sink", async () => {
    const freeze = await createFreeze();
    const tokens = [
      "experimental-design-v3-stratified-sequential-heldout-001",
      freeze.heldoutTasks.path,
      freeze.heldoutTasks.sha256,
      freeze.heldoutSentinel,
    ];
    for (const sinkName of [
      "development-lock",
      "compiler",
      "package",
      "feedback",
    ] as const) {
      expect(() =>
        assertNoExperimentalDesignV3HeldoutEvidence(
          sinkName,
          { nested: { value: tokens.shift() ?? freeze.heldoutSentinel } },
          freeze,
        ),
      ).toThrow(new RegExp(`${sinkName}.*held-out`, "i"));
      expect(() =>
        assertNoExperimentalDesignV3HeldoutEvidence(
          sinkName,
          { constructionSplit: "development", publicContract: true },
          freeze,
        ),
      ).not.toThrow();
    }
  });

  test("rejects an inputs commit that predates the scorer and passed audit", async () => {
    await expect(
      createExperimentalDesignV3HeldoutFreeze(rootDir, oldTaskCommit),
    ).rejects.toThrow(/inputs commit|git blob|committed bytes/i);
  });

  test("rejects scorer registry identity drift", async () => {
    const freeze = structuredClone(await createFreeze());
    (freeze.scorer as any).evaluatorId = "skill-ir-experimental-design-v1";
    await expect(
      verifyExperimentalDesignV3HeldoutFreeze(rootDir, freeze),
    ).rejects.toThrow(/evaluator|scorer/i);
  });

  test("verifies the persisted held-out freeze artifact", async () => {
    const persisted = await loadJson(`${v3Root}/heldout-freeze.json`);
    await expect(
      verifyExperimentalDesignV3HeldoutFreeze(rootDir, persisted),
    ).resolves.toMatchObject({ inputsCommit });
  });

  test("accepts only create or verify-only CLI modes", () => {
    expect(
      parseExperimentalDesignV3HeldoutFreezeArgs([
        `--inputs-commit=${inputsCommit}`,
        `--out=${v3Root}/heldout-freeze.json`,
      ]),
    ).toEqual({
      mode: "create",
      inputsCommit,
      out: `${v3Root}/heldout-freeze.json`,
    });
    expect(
      parseExperimentalDesignV3HeldoutFreezeArgs([
        `--verify-only=${v3Root}/heldout-freeze.json`,
      ]),
    ).toEqual({ mode: "verify", freezePath: `${v3Root}/heldout-freeze.json` });
    expect(() =>
      parseExperimentalDesignV3HeldoutFreezeArgs(["--unknown=value"]),
    ).toThrow(/unknown argument/i);
    expect(() =>
      parseExperimentalDesignV3HeldoutFreezeArgs([
        `--inputs-commit=${inputsCommit}`,
        "--out=freeze.json",
        "--verify-only=freeze.json",
      ]),
    ).toThrow(/cannot be combined/i);
  });
});
