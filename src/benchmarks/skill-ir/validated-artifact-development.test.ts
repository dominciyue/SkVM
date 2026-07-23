import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildValidatedArtifactDevelopmentPlan,
  validateValidatedArtifactDevelopmentLock,
} from "./validated-artifact-development";

const rootDir = process.cwd();
const lockPath = join(
  rootDir,
  "benchmarks/skill-ir/pilots/law-to-markdown/"
    + "law-to-markdown-validated-artifact-development-lock.json",
);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "validated-artifact-development-"));
  tempDirs.push(dir);
  return dir;
}

describe("validated artifact development contract", () => {
  test("builds the frozen 16-row development quartet matrix", async () => {
    const outDir = await tempDir();
    const result = await buildValidatedArtifactDevelopmentPlan({
      rootDir,
      lockPath,
      outDir,
    });

    expect(result.schemaVersion).toBe("skill-ir-validated-artifact-development-plan/v1");
    expect(result.plan).toHaveLength(16);
    expect(result.plan.filter((row) => row.executionClass === "model-agent")).toHaveLength(12);
    expect(result.plan.filter((row) => row.executionClass === "direct-deterministic")).toHaveLength(4);
    expect(result.plan.every((row) => row.caseId.includes(":windows:clean:"))).toBe(true);
    expect(result.plan.every((row) => !row.caseId.includes("heldout"))).toBe(true);

    const quartets = new Map<string, Set<string>>();
    for (const row of result.plan) {
      const key = `${row.caseId}:${row.runIndex}`;
      const systems = quartets.get(key) ?? new Set<string>();
      systems.add(row.system);
      quartets.set(key, systems);
    }
    expect(quartets.size).toBe(4);
    expect([...quartets.values()].every((systems) =>
      [...systems].sort().join(",")
        === ["ir-static", "no-skill", "original", "validated-artifact"].sort().join(","),
    )).toBe(true);

    for (const row of result.plan.filter((item) => item.executionClass === "direct-deterministic")) {
      expect(row.command).toEqual([]);
      expect(row.model).toBe("direct-deterministic");
      expect(row.adapter).toBe("validated-artifact-runtime");
      expect(row.artifactPackageDir).toBe(result.package.packageDir);
    }
  });

  test("rejects frozen implementation digest drift", async () => {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.frozenImplementations.runtime.sha256 = "0".repeat(64);

    await expect(validateValidatedArtifactDevelopmentLock(lock, rootDir))
      .rejects.toThrow("digest mismatch");
  });
});
