import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  readAndValidateValidatedArtifactExecutionFreeze,
  validateValidatedArtifactExecutionFreeze,
} from "./validated-artifact-development-execution-freeze";

const rootDir = path.resolve(import.meta.dir, "../../..");
const freezePath = path.join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/"
    + "law-to-markdown-validated-artifact-execution-freeze.json",
);

describe("validated artifact development execution freeze", () => {
  test("binds the parent lock and every live execution implementation", async () => {
    const result = await readAndValidateValidatedArtifactExecutionFreeze({
      rootDir,
      freezePath,
    });

    expect(result.freeze.schemaVersion)
      .toBe("skill-ir-validated-artifact-development-execution-freeze/v1");
    expect(result.parent.lock.experimentId)
      .toBe("law-to-markdown-validated-artifact-development-v1");
    expect(result.freeze.matrix).toEqual({
      expectedModelRows: 12,
      expectedArtifactRows: 4,
      expectedRows: 16,
    });
  });

  test("rejects execution implementation digest drift", async () => {
    const freeze = JSON.parse(await readFile(freezePath, "utf8"));
    freeze.frozenImplementations.modelRunner.sha256 = "0".repeat(64);

    await expect(validateValidatedArtifactExecutionFreeze(freeze, rootDir))
      .rejects.toThrow("digest mismatch");
  });

  test("rejects parent development lock digest drift", async () => {
    const freeze = JSON.parse(await readFile(freezePath, "utf8"));
    freeze.parentLock.sha256 = "0".repeat(64);

    await expect(validateValidatedArtifactExecutionFreeze(freeze, rootDir))
      .rejects.toThrow("digest mismatch");
  });
});
