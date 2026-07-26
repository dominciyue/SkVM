import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  assertNoExperimentalDesignV2HeldoutEvidence,
  createExperimentalDesignV2HeldoutFreeze,
  validateExperimentalDesignV2HeldoutAuditBoundary,
  verifyExperimentalDesignV2HeldoutFreeze,
} from "./experimental-design-v2-heldout-freeze.ts";
import { parseExperimentalDesignV2HeldoutFreezeArgs } from "./experimental-design-v2-heldout-freeze-run.ts";

const rootDir = path.resolve(import.meta.dir, "../../..");
const inputsCommit = "826de3b0178d964028eb9428c8e6d924eb1a4c52";
const oldTaskCommit = "00af684372f668fbf17cc50eba22920b57170d5e";
const v2Root = "benchmarks/skill-ir/pilots/experimental-design/v2";

async function loadJson(relativePath: string): Promise<any> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

async function createFreeze() {
  return createExperimentalDesignV2HeldoutFreeze(rootDir, inputsCommit);
}

describe("experimental-design v2 held-out identity freeze", () => {
  test("accepts the exact task split, scorer, passed audit, and inputs commit", async () => {
    const freeze = await createFreeze();
    const verified = await verifyExperimentalDesignV2HeldoutFreeze(rootDir, freeze);

    expect(verified.inputsCommit).toBe(inputsCommit);
    expect(verified.taskSplitFreeze.path).toBe(`${v2Root}/task-split-freeze.json`);
    expect(verified.heldoutTasks.path).toBe(`${v2Root}/heldout/tasks.json`);
    expect(verified.scorer).toMatchObject({
      path: "src/bench/evaluators/experimental-design-grade-v2.ts",
      evaluatorId: "skill-ir-experimental-design-v2",
    });
    expect(verified.auditManifest.path).toBe(`${v2Root}/benchmark-contract-audit.json`);
    expect(verified.auditReport.path).toBe(
      "results/skill-ir/benchmark-contract-audit/experimental-design-v2.json",
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
        verifyExperimentalDesignV2HeldoutFreeze(rootDir, freeze),
      ).rejects.toThrow(/digest mismatch/i);
    }
  });

  test("rejects a non-passed report and held-out references in the audit boundary", async () => {
    const [taskSplit, manifest, report] = await Promise.all([
      loadJson(`${v2Root}/task-split-freeze.json`),
      loadJson(`${v2Root}/benchmark-contract-audit.json`),
      loadJson("results/skill-ir/benchmark-contract-audit/experimental-design-v2.json"),
    ]);
    expect(() =>
      validateExperimentalDesignV2HeldoutAuditBoundary(taskSplit, manifest, report),
    ).not.toThrow();

    const failedReport = structuredClone(report);
    failedReport.status = "failed";
    expect(() =>
      validateExperimentalDesignV2HeldoutAuditBoundary(
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
        validateExperimentalDesignV2HeldoutAuditBoundary(
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
      "experimental-design-v2-stratified-sequential-heldout-001",
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
        assertNoExperimentalDesignV2HeldoutEvidence(
          sinkName,
          { nested: { value: tokens.shift() ?? freeze.heldoutSentinel } },
          freeze,
        ),
      ).toThrow(new RegExp(`${sinkName}.*held-out`, "i"));
      expect(() =>
        assertNoExperimentalDesignV2HeldoutEvidence(
          sinkName,
          { constructionSplit: "development", publicContract: true },
          freeze,
        ),
      ).not.toThrow();
    }
  });

  test("rejects an inputs commit that predates the scorer and passed audit", async () => {
    await expect(
      createExperimentalDesignV2HeldoutFreeze(rootDir, oldTaskCommit),
    ).rejects.toThrow(/inputs commit|git blob|committed bytes/i);
  });

  test("rejects scorer registry identity drift", async () => {
    const freeze = structuredClone(await createFreeze());
    (freeze.scorer as any).evaluatorId = "skill-ir-experimental-design-v1";
    await expect(
      verifyExperimentalDesignV2HeldoutFreeze(rootDir, freeze),
    ).rejects.toThrow(/evaluator|scorer/i);
  });

  test("verifies the persisted held-out freeze artifact", async () => {
    const persisted = await loadJson(`${v2Root}/heldout-freeze.json`);
    await expect(
      verifyExperimentalDesignV2HeldoutFreeze(rootDir, persisted),
    ).resolves.toMatchObject({ inputsCommit });
  });

  test("accepts only create or verify-only CLI modes", () => {
    expect(
      parseExperimentalDesignV2HeldoutFreezeArgs([
        `--inputs-commit=${inputsCommit}`,
        `--out=${v2Root}/heldout-freeze.json`,
      ]),
    ).toEqual({
      mode: "create",
      inputsCommit,
      out: `${v2Root}/heldout-freeze.json`,
    });
    expect(
      parseExperimentalDesignV2HeldoutFreezeArgs([
        `--verify-only=${v2Root}/heldout-freeze.json`,
      ]),
    ).toEqual({ mode: "verify", freezePath: `${v2Root}/heldout-freeze.json` });
    expect(() =>
      parseExperimentalDesignV2HeldoutFreezeArgs(["--unknown=value"]),
    ).toThrow(/unknown argument/i);
    expect(() =>
      parseExperimentalDesignV2HeldoutFreezeArgs([
        `--inputs-commit=${inputsCommit}`,
        "--out=freeze.json",
        "--verify-only=freeze.json",
      ]),
    ).toThrow(/cannot be combined/i);
  });
});
