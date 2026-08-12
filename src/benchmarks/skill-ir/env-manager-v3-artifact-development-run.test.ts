import { describe, expect, test } from "bun:test";
import path from "node:path";
import { parseEnvManagerV3ArtifactDevelopmentRunArgs } from "./env-manager-v3-artifact-development-run";

describe("Env Manager v3 artifact development runner", () => {
  test("requires an explicit frozen lock, output directory, and phase", () => {
    const rootDir = process.cwd();
    expect(parseEnvManagerV3ArtifactDevelopmentRunArgs([
      `--root-dir=${rootDir}`,
      "--lock=benchmarks/skill-ir/pilots/env-manager/successor-v3/artifact-development-lock-v1.json",
      "--out-dir=results/skill-ir/env-manager-v3-validated-artifact-development-v1",
      "--phase=plan",
    ])).toEqual({
      rootDir: path.resolve(rootDir),
      lockPath: path.resolve(rootDir, "benchmarks/skill-ir/pilots/env-manager/successor-v3/artifact-development-lock-v1.json"),
      outDir: path.resolve(rootDir, "results/skill-ir/env-manager-v3-validated-artifact-development-v1"),
      phase: "plan",
    });
    expect(() => parseEnvManagerV3ArtifactDevelopmentRunArgs(["--phase=unknown"])).toThrow(/Unsupported/u);
    expect(() => parseEnvManagerV3ArtifactDevelopmentRunArgs(["--phase=plan"])).toThrow(/required/u);
  });
});
