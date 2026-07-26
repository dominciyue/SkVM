import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  createExperimentalDesignV3TaskSplitFreeze,
  validateExperimentalDesignV3TaskSets,
  verifyExperimentalDesignV3PublicContractSourceAudit,
  verifyExperimentalDesignV3TaskSplitFreeze,
} from "./experimental-design-v3-task-freeze.ts";
import { parseExperimentalDesignV3TaskSplitFreezeArgs } from "./experimental-design-v3-task-freeze-run.ts";

const rootDir = path.resolve(import.meta.dir, "../../..");
const v3Dir = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/experimental-design/v3",
);
const taskCommit = "b7f5d299811ce3f5f309dc5d3963d88c219dc8ab";

async function loadJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

async function createFreeze() {
  return createExperimentalDesignV3TaskSplitFreeze(rootDir, taskCommit);
}

describe("experimental-design v3 task-split freeze", () => {
  test("accepts the exact 2+2 split, public provenance, and immutable v1/v2 files", async () => {
    const freeze = await createFreeze();
    const verified = await verifyExperimentalDesignV3TaskSplitFreeze(
      rootDir,
      freeze,
    );

    expect(verified.taskCommit).toBe(taskCommit);
    expect(verified.developmentTasks.taskIds).toEqual([
      "experimental-design-v3-stratified-dev-001",
      "experimental-design-v3-cluster-sequential-dev-002",
    ]);
    expect(verified.heldoutTasks.taskIds).toEqual([
      "experimental-design-v3-stratified-sequential-heldout-001",
      "experimental-design-v3-cluster-stratified-heldout-002",
    ]);
    expect(verified.sourceClosure).toHaveLength(4);
    expect(verified.frozenV1).toHaveLength(6);
    expect(verified.frozenV2).toHaveLength(8);
    expect(verified.heldoutSentinel).toMatch(
      /^TEST_ONLY_HELDOUT_V3_[A-Z0-9_]+$/,
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
        verifyExperimentalDesignV3TaskSplitFreeze(rootDir, freeze),
      ).rejects.toThrow(/digest mismatch/i);
    }
  });

  test("rejects development and held-out overlap or split mismatch", async () => {
    const overlap = structuredClone(await createFreeze());
    overlap.heldoutTasks.taskIds[0] = overlap.developmentTasks.taskIds[0]!;
    await expect(
      verifyExperimentalDesignV3TaskSplitFreeze(rootDir, overlap),
    ).rejects.toThrow(/overlap|task IDs/i);

    const wrongSplit = structuredClone(await createFreeze());
    wrongSplit.developmentTasks.split = "heldout";
    await expect(
      verifyExperimentalDesignV3TaskSplitFreeze(rootDir, wrongSplit),
    ).rejects.toThrow();
  });

  test("rejects fixture projection drift", async () => {
    const freeze = structuredClone(await createFreeze());
    freeze.fixtureProjectionSha256 = "0".repeat(64);
    await expect(
      verifyExperimentalDesignV3TaskSplitFreeze(rootDir, freeze),
    ).rejects.toThrow(/fixture projection/i);
  });

  test("rejects a task commit that does not contain the frozen task bytes", async () => {
    await expect(
      createExperimentalDesignV3TaskSplitFreeze(
        rootDir,
        "a8d6c60ab43148f3fd1868c13c35f1cfc846596e",
      ),
    ).rejects.toThrow(/task commit|committed bytes|git blob|source digest/i);
  });

  test("rejects any v1 frozen reference replacement or digest drift", async () => {
    const replacement = structuredClone(await createFreeze());
    replacement.frozenV1[0]!.path = replacement.publicContract.path;
    await expect(
      verifyExperimentalDesignV3TaskSplitFreeze(rootDir, replacement),
    ).rejects.toThrow(/frozen v1/i);

    const drift = structuredClone(await createFreeze());
    drift.frozenV1[0]!.sha256 = "0".repeat(64);
    await expect(
      verifyExperimentalDesignV3TaskSplitFreeze(rootDir, drift),
    ).rejects.toThrow(/digest mismatch/i);
  });

  test("rejects any v2 frozen reference replacement or digest drift", async () => {
    const replacement = structuredClone(await createFreeze());
    replacement.frozenV2[0]!.path = replacement.publicContract.path;
    await expect(
      verifyExperimentalDesignV3TaskSplitFreeze(rootDir, replacement),
    ).rejects.toThrow(/frozen v2/i);

    const drift = structuredClone(await createFreeze());
    drift.frozenV2[0]!.sha256 = "0".repeat(64);
    await expect(
      verifyExperimentalDesignV3TaskSplitFreeze(rootDir, drift),
    ).rejects.toThrow(/digest mismatch/i);
  });

  test("rejects evaluator answers and held-out feedback in task inputs", async () => {
    const development = (await loadJson(
      "benchmarks/skill-ir/pilots/experimental-design/v3/development/tasks.json",
    )) as any;
    const heldout = (await loadJson(
      "benchmarks/skill-ir/pilots/experimental-design/v3/heldout/tasks.json",
    )) as any;

    const leakedEval = structuredClone(development);
    leakedEval.tasks[0].eval[0].payload.expected = ["private-answer"];
    expect(() => validateExperimentalDesignV3TaskSets(leakedEval, heldout)).toThrow(
      /forbidden evaluator evidence/i,
    );

    const leakedPrompt = structuredClone(development);
    leakedPrompt.tasks[0].prompt += " Use held-out feedback from a prior run.";
    expect(() =>
      validateExperimentalDesignV3TaskSets(leakedPrompt, heldout),
    ).toThrow(/forbidden evaluator evidence/i);
  });

  test("production-verifies source digest, quote, uniqueness, and claim coverage", async () => {
    const contract = (await loadJson(
      "benchmarks/skill-ir/pilots/experimental-design/v3/public-contract.json",
    )) as any;
    const audit = (await loadJson(
      "benchmarks/skill-ir/pilots/experimental-design/v3/public-contract-source-audit.json",
    )) as any;

    await expect(
      verifyExperimentalDesignV3PublicContractSourceAudit(
        rootDir,
        contract,
        audit,
      ),
    ).resolves.toBeUndefined();

    expect(contract.workdirContract).toEqual({
      allowedRootEntries: ["study.json", "design-contract.json", "design"],
      allowedDesignEntries: [
        "design-plan.json",
        "allocation.csv",
        "design-report.md",
      ],
      rules: expect.any(Array),
    });

    const wrongQuote = structuredClone(audit);
    wrongQuote.entries[0].quote = "TEST_ONLY_NONEXISTENT_SOURCE_QUOTE";
    await expect(
      verifyExperimentalDesignV3PublicContractSourceAudit(
        rootDir,
        contract,
        wrongQuote,
      ),
    ).rejects.toThrow(/quote/i);

    const missingClaim = structuredClone(audit);
    missingClaim.entries.pop();
    await expect(
      verifyExperimentalDesignV3PublicContractSourceAudit(
        rootDir,
        contract,
        missingClaim,
      ),
    ).rejects.toThrow(/claim coverage/i);
  });

  test("verifies the persisted task-split freeze artifact", async () => {
    const persisted = JSON.parse(
      await readFile(path.join(v3Dir, "task-split-freeze.json"), "utf8"),
    );
    await expect(
      verifyExperimentalDesignV3TaskSplitFreeze(rootDir, persisted),
    ).resolves.toMatchObject({ taskCommit });
  });

  test("accepts only create or verify-only CLI modes", () => {
    expect(
      parseExperimentalDesignV3TaskSplitFreezeArgs([
        `--task-commit=${taskCommit}`,
        "--out=benchmarks/skill-ir/pilots/experimental-design/v3/task-split-freeze.json",
      ]),
    ).toEqual({
      mode: "create",
      taskCommit,
      out: "benchmarks/skill-ir/pilots/experimental-design/v3/task-split-freeze.json",
    });
    expect(
      parseExperimentalDesignV3TaskSplitFreezeArgs([
        "--verify-only=benchmarks/skill-ir/pilots/experimental-design/v3/task-split-freeze.json",
      ]),
    ).toEqual({
      mode: "verify",
      freezePath:
        "benchmarks/skill-ir/pilots/experimental-design/v3/task-split-freeze.json",
    });

    expect(() =>
      parseExperimentalDesignV3TaskSplitFreezeArgs(["--unknown=value"]),
    ).toThrow(/unknown argument/i);
    expect(() =>
      parseExperimentalDesignV3TaskSplitFreezeArgs([
        `--task-commit=${taskCommit}`,
        "--out=freeze.json",
        "--verify-only=freeze.json",
      ]),
    ).toThrow(/cannot be combined/i);
    expect(() => parseExperimentalDesignV3TaskSplitFreezeArgs([])).toThrow(
      /required/i,
    );
  });
});
