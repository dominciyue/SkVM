import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  createExperimentalDesignV2TaskSplitFreeze,
  validateExperimentalDesignV2TaskSets,
  verifyExperimentalDesignV2PublicContractSourceAudit,
  verifyExperimentalDesignV2TaskSplitFreeze,
} from "./experimental-design-v2-task-freeze.ts";
import { parseExperimentalDesignV2TaskSplitFreezeArgs } from "./experimental-design-v2-task-freeze-run.ts";

const rootDir = path.resolve(import.meta.dir, "../../..");
const v2Dir = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v2",
);
const taskCommit = "af7a84ee6ce9679f5d329b105221c04bec3ab0be";

async function loadJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

async function createFreeze() {
  return createExperimentalDesignV2TaskSplitFreeze(rootDir, taskCommit);
}

describe("experimental-design v2 task-split freeze", () => {
  test("accepts the exact 2+2 split, public provenance, and immutable v1 files", async () => {
    const freeze = await createFreeze();
    const verified = await verifyExperimentalDesignV2TaskSplitFreeze(
      rootDir,
      freeze,
    );

    expect(verified.taskCommit).toBe(taskCommit);
    expect(verified.developmentTasks.taskIds).toEqual([
      "experimental-design-v2-stratified-dev-001",
      "experimental-design-v2-cluster-sequential-dev-002",
    ]);
    expect(verified.heldoutTasks.taskIds).toEqual([
      "experimental-design-v2-stratified-sequential-heldout-001",
      "experimental-design-v2-cluster-stratified-heldout-002",
    ]);
    expect(verified.sourceClosure).toHaveLength(4);
    expect(verified.frozenV1).toHaveLength(6);
    expect(verified.heldoutSentinel).toMatch(
      /^TEST_ONLY_HELDOUT_V2_[A-Z0-9_]+$/,
    );
  });

  test("rejects task, public-contract, and source-audit digest drift", async () => {
    for (const mutate of [
      (value: any) => (value.developmentTasks.sha256 = "0".repeat(64)),
      (value: any) => (value.publicContract.sha256 = "0".repeat(64)),
      (value: any) =>
        (value.publicContractSourceAudit.sha256 = "0".repeat(64)),
    ]) {
      const freeze = structuredClone(await createFreeze());
      mutate(freeze);
      await expect(
        verifyExperimentalDesignV2TaskSplitFreeze(rootDir, freeze),
      ).rejects.toThrow(/digest mismatch/i);
    }
  });

  test("rejects development and held-out overlap or split mismatch", async () => {
    const overlap = structuredClone(await createFreeze());
    overlap.heldoutTasks.taskIds[0] = overlap.developmentTasks.taskIds[0]!;
    await expect(
      verifyExperimentalDesignV2TaskSplitFreeze(rootDir, overlap),
    ).rejects.toThrow(/overlap|task IDs/i);

    const wrongSplit = structuredClone(await createFreeze());
    wrongSplit.developmentTasks.split = "heldout";
    await expect(
      verifyExperimentalDesignV2TaskSplitFreeze(rootDir, wrongSplit),
    ).rejects.toThrow();
  });

  test("rejects fixture projection drift", async () => {
    const freeze = structuredClone(await createFreeze());
    freeze.fixtureProjectionSha256 = "0".repeat(64);
    await expect(
      verifyExperimentalDesignV2TaskSplitFreeze(rootDir, freeze),
    ).rejects.toThrow(/fixture projection/i);
  });

  test("rejects a task commit that does not contain the frozen task bytes", async () => {
    await expect(
      createExperimentalDesignV2TaskSplitFreeze(
        rootDir,
        "a8d6c60ab43148f3fd1868c13c35f1cfc846596e",
      ),
    ).rejects.toThrow(/task commit|committed bytes|git blob|source digest|contractRevision/i);
  });

  test("rejects any v1 frozen reference replacement or digest drift", async () => {
    const replacement = structuredClone(await createFreeze());
    replacement.frozenV1[0]!.path = replacement.publicContract.path;
    await expect(
      verifyExperimentalDesignV2TaskSplitFreeze(rootDir, replacement),
    ).rejects.toThrow(/frozen v1/i);

    const drift = structuredClone(await createFreeze());
    drift.frozenV1[0]!.sha256 = "0".repeat(64);
    await expect(
      verifyExperimentalDesignV2TaskSplitFreeze(rootDir, drift),
    ).rejects.toThrow(/digest mismatch/i);
  });

  test("rejects evaluator answers and held-out feedback in task inputs", async () => {
    const development = (await loadJson(
      "benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json",
    )) as any;
    const heldout = (await loadJson(
      "benchmarks/skill-ir/pilots/experimental-design/v2/heldout/tasks.json",
    )) as any;

    const leakedEval = structuredClone(development);
    leakedEval.tasks[0].eval[0].payload.expected = ["private-answer"];
    expect(() => validateExperimentalDesignV2TaskSets(leakedEval, heldout)).toThrow(
      /forbidden evaluator evidence/i,
    );

    const leakedPrompt = structuredClone(development);
    leakedPrompt.tasks[0].prompt += " Use held-out feedback from a prior run.";
    expect(() =>
      validateExperimentalDesignV2TaskSets(leakedPrompt, heldout),
    ).toThrow(/forbidden evaluator evidence/i);
  });

  test("production-verifies source digest, quote, uniqueness, and claim coverage", async () => {
    const contract = (await loadJson(
      "benchmarks/skill-ir/pilots/experimental-design/v2/public-contract.json",
    )) as any;
    const audit = (await loadJson(
      "benchmarks/skill-ir/pilots/experimental-design/v2/public-contract-source-audit.json",
    )) as any;

    await expect(
      verifyExperimentalDesignV2PublicContractSourceAudit(
        rootDir,
        contract,
        audit,
      ),
    ).resolves.toBeUndefined();

    const wrongQuote = structuredClone(audit);
    wrongQuote.entries[0].quote = "TEST_ONLY_NONEXISTENT_SOURCE_QUOTE";
    await expect(
      verifyExperimentalDesignV2PublicContractSourceAudit(
        rootDir,
        contract,
        wrongQuote,
      ),
    ).rejects.toThrow(/quote/i);

    const missingClaim = structuredClone(audit);
    missingClaim.entries.pop();
    await expect(
      verifyExperimentalDesignV2PublicContractSourceAudit(
        rootDir,
        contract,
        missingClaim,
      ),
    ).rejects.toThrow(/claim coverage/i);
  });

  test("verifies the persisted task-split freeze artifact", async () => {
    const persisted = JSON.parse(
      await readFile(path.join(v2Dir, "task-split-freeze.json"), "utf8"),
    );
    await expect(
      verifyExperimentalDesignV2TaskSplitFreeze(rootDir, persisted),
    ).resolves.toMatchObject({ taskCommit });
  });

  test("accepts only create or verify-only CLI modes", () => {
    expect(
      parseExperimentalDesignV2TaskSplitFreezeArgs([
        `--task-commit=${taskCommit}`,
        "--out=benchmarks/skill-ir/pilots/experimental-design/v2/task-split-freeze.json",
      ]),
    ).toEqual({
      mode: "create",
      taskCommit,
      out: "benchmarks/skill-ir/pilots/experimental-design/v2/task-split-freeze.json",
    });
    expect(
      parseExperimentalDesignV2TaskSplitFreezeArgs([
        "--verify-only=benchmarks/skill-ir/pilots/experimental-design/v2/task-split-freeze.json",
      ]),
    ).toEqual({
      mode: "verify",
      freezePath:
        "benchmarks/skill-ir/pilots/experimental-design/v2/task-split-freeze.json",
    });

    expect(() =>
      parseExperimentalDesignV2TaskSplitFreezeArgs(["--unknown=value"]),
    ).toThrow(/unknown argument/i);
    expect(() =>
      parseExperimentalDesignV2TaskSplitFreezeArgs([
        `--task-commit=${taskCommit}`,
        "--out=freeze.json",
        "--verify-only=freeze.json",
      ]),
    ).toThrow(/cannot be combined/i);
    expect(() => parseExperimentalDesignV2TaskSplitFreezeArgs([])).toThrow(
      /required/i,
    );
  });
});
