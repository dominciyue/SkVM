import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { experimentalDesignGradeV2 } from "../../bench/evaluators/experimental-design-grade-v2";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

async function tempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

type Task = {
  id: string;
  split: "development";
  fixtures: Record<string, string>;
  eval: Array<{
    method: "custom";
    id: string;
    name: string;
    weight: number;
    evaluatorId: string;
    payload: unknown;
  }>;
  hardGateIds: string[];
  passThreshold: number;
};

describe("experimental-design v2 validated artifact activation", () => {
  test.skipIf(!process.env.SKVM_PYTHON)(
    "passes both public-contract development tasks with zero runtime model tokens",
    async () => {
      const module = await import("./experimental-design-v2-artifact-compiler").catch(() => ({}));
      expect(module).toHaveProperty("compileExperimentalDesignV2Artifact");
      const compiler = module as {
        compileExperimentalDesignV2Artifact: (input: unknown, outDir: string) => Promise<void>;
        loadExperimentalDesignV2ArtifactCompilerInput: (rootDir: string) => Promise<unknown>;
      };
      const rootDir = process.cwd();
      const packageDir = await tempDir("experimental-design-v2-activation-package-");
      await compiler.compileExperimentalDesignV2Artifact(
        await compiler.loadExperimentalDesignV2ArtifactCompilerInput(rootDir),
        packageDir,
      );
      const packageRecord = await validateValidatedArtifactPackage(packageDir);
      const registry = JSON.parse(await readFile(join(
        rootDir,
        "benchmarks/skill-ir/pilots/experimental-design/v2/development/tasks.json",
      ), "utf8")) as { tasks: Task[] };
      expect(registry.tasks).toHaveLength(2);

      for (const task of registry.tasks) {
        const workDir = await tempDir(`experimental-design-v2-${task.id}-`);
        for (const [relativePath, content] of Object.entries(task.fixtures)) {
          await writeFile(join(workDir, relativePath), content, "utf8");
        }
        const protectedBefore = await Promise.all(["study.json", "design-contract.json"].map(async (path) =>
          createHash("sha256").update(await readFile(join(workDir, path))).digest("hex")
        ));
        const initialWorkdirManifest = await writeInitialWorkdirManifest({
          workDir,
          manifestPath: `${workDir}-initial-workdir-manifest.json`,
        });

        const runtime = await runValidatedArtifactPlan({
          package: packageRecord,
          workDir,
          env: { SKVM_PYTHON: process.env.SKVM_PYTHON },
        });
        const criterionRows = await Promise.all(task.eval.map(async (criterion) => ({
          criterion,
          result: await experimentalDesignGradeV2.run({
            criterion,
            runResult: { workDir, initialWorkdirManifest },
          } as never),
        })));
        const score = criterionRows.reduce(
          (sum, row) => sum + row.criterion.weight * row.result.score,
          0,
        );
        const hardGateFailures = criterionRows.filter((row) =>
          task.hardGateIds.includes(row.criterion.id) && !row.result.pass
        );

        expect(runtime.status).toBe("complete");
        expect(runtime.validation?.status).toBe("pass");
        expect(runtime.modelGenerationTokens).toBe(0);
        expect(runtime.modelRepairTokens).toBe(0);
        expect(score).toBeCloseTo(1, 8);
        expect(hardGateFailures).toEqual([]);
        expect(await Promise.all(["study.json", "design-contract.json"].map(async (path) =>
          createHash("sha256").update(await readFile(join(workDir, path))).digest("hex")
        ))).toEqual(protectedBefore);
      }
    },
    120_000,
  );
});
