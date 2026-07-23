import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildValidatedArtifactHeldoutPlan,
  readAndValidateValidatedArtifactHeldoutLock,
  validateValidatedArtifactHeldoutLock,
} from "./validated-artifact-heldout";

const rootDir = path.resolve(import.meta.dir, "../../..");
const lockPath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/"
    + "law-to-markdown-validated-artifact-heldout-lock.json",
);

describe("validated artifact held-out contract", () => {
  test("validates passed development lineage and keeps held-out outside construction", async () => {
    const validated = await readAndValidateValidatedArtifactHeldoutLock({ rootDir, lockPath });

    expect(validated.lock.schemaVersion).toBe("skill-ir-validated-artifact-heldout-lock/v1");
    expect(validated.developmentGate.gate.passed).toBe(true);
    expect(validated.package.provenance.constructionSplit).toBe("development");
    expect(validated.package.provenance.forbiddenEvidenceClasses).toContain("held-out");
    expect(validated.lock.frozenInputs.tasks.path).toBe(
      "benchmarks/skill-ir/pilots/law-to-markdown/tasks.json",
    );
    expect(validated.lock.matrix.taskIds.some((taskId) =>
      validated.package.provenance.inputs.taskContract.taskIds.includes(taskId),
    )).toBe(false);
  });

  test("builds exactly four held-out quartets without development tasks", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "validated-artifact-heldout-plan-"));
    try {
      const result = await buildValidatedArtifactHeldoutPlan({ rootDir, lockPath, outDir });
      expect(result.schemaVersion).toBe("skill-ir-validated-artifact-heldout-plan/v1");
      expect(result.plan).toHaveLength(16);
      expect(result.plan.filter((row) => row.executionClass === "model-agent")).toHaveLength(12);
      expect(result.plan.filter(
        (row) => row.executionClass === "direct-deterministic",
      )).toHaveLength(4);
      expect(result.plan.every((row) => row.caseId.includes("heldout"))).toBe(true);
      expect(result.plan.every((row) => !row.caseId.includes("-dev-"))).toBe(true);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  test("rejects development evidence digest drift", async () => {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.upstream.developmentGate.sha256 = "0".repeat(64);

    await expect(validateValidatedArtifactHeldoutLock(lock, rootDir))
      .rejects.toThrow("digest mismatch");
  });

  test("rejects frozen scorer identity drift from development", async () => {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.frozenInputs.scorer.path = lock.frozenInputs.tasks.path;
    lock.frozenInputs.scorer.sha256 = lock.frozenInputs.tasks.sha256;

    await expect(validateValidatedArtifactHeldoutLock(lock, rootDir))
      .rejects.toThrow("scorer input drift");
  });
});
