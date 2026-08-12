import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const rootDir = process.cwd();
const lockPath = join(rootDir, "benchmarks/skill-ir/pilots/env-manager/successor-v3/artifact-development-lock-v1.json");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Env Manager v3 artifact development", () => {
  test("maps each public development task to one frozen package variant", async () => {
    const development = await import("./env-manager-v3-artifact-development");
    expect(development.selectEnvManagerV3ArtifactVariant("env-manager-scorer-authority-node-dev-001"))
      .toBe("node");
    expect(development.selectEnvManagerV3ArtifactVariant("env-manager-scorer-authority-vite-dev-002"))
      .toBe("vite");
    expect(() => development.selectEnvManagerV3ArtifactVariant("unknown")).toThrow();
  });

  test("validates the lock and builds four complete quartets", async () => {
    const development = await import("./env-manager-v3-artifact-development");
    const lock = await development.readAndValidateEnvManagerV3ArtifactDevelopmentLock({ rootDir, lockPath });
    expect(lock.promotionBoundary.permitsHeldOutExecution).toBe(false);
    const outDir = await mkdtemp(join(tmpdir(), "env-manager-v3-artifact-dev-"));
    tempDirs.push(outDir);
    const built = await development.buildEnvManagerV3ArtifactDevelopmentPlan({ rootDir, lockPath, outDir });
    expect(built.plan).toHaveLength(16);
    expect(built.plan.filter((row: { executionClass: string }) => row.executionClass === "model-agent")).toHaveLength(12);
    expect(built.plan.filter((row: { executionClass: string }) => row.executionClass === "direct-deterministic")).toHaveLength(4);
  });

  test("fails closed when a frozen digest drifts", async () => {
    const development = await import("./env-manager-v3-artifact-development");
    const value = JSON.parse(await readFile(lockPath, "utf8"));
    value.frozenInputs.source.sha256 = "0".repeat(64);
    await expect(development.readAndValidateEnvManagerV3ArtifactDevelopmentLock({ rootDir, input: value }))
      .rejects.toThrow(/digest mismatch/u);
  });
});
