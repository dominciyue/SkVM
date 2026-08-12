import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { envManagerGradeV3 } from "../../bench/evaluators/env-manager-grade-v3";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest";
import {
  compileEnvManagerV3ValidatedArtifact,
  loadEnvManagerV3ArtifactCompilerInput,
} from "./env-manager-v3-artifact-compiler";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

const rootDir = process.cwd();
const pilotDir = "benchmarks/skill-ir/pilots/env-manager/successor-v3";
const tempDirs: string[] = [];

type Task = {
  id: string;
  fixtures: Record<string, string>;
  eval: Array<{ id: string; weight: number; payload: unknown }>;
  hardGateIds: string[];
  passThreshold: number;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function materialize(task: Task, workDir: string) {
  for (const [relativePath, content] of Object.entries(task.fixtures)) {
    await mkdir(dirname(join(workDir, relativePath)), { recursive: true });
    await writeFile(join(workDir, relativePath), content, "utf8");
  }
}

async function score(task: Task, workDir: string, initialWorkdirManifest: unknown) {
  const rows = await Promise.all(task.eval.map(async (criterion) => ({
    criterion,
    result: await envManagerGradeV3.run({
      criterion: { ...criterion, method: "custom", name: criterion.id, evaluatorId: "skill-ir-env-manager-v3" },
      runResult: { workDir, initialWorkdirManifest, text: "" },
    } as never),
  })));
  const evaluatorScore = rows.reduce((sum, row) => sum + row.criterion.weight * row.result.score, 0);
  const hardGateFailures = rows.filter((row) => task.hardGateIds.includes(row.criterion.id) && !row.result.pass);
  return { evaluatorScore, success: evaluatorScore >= task.passThreshold && hardGateFailures.length === 0 };
}

describe("Env Manager v3 validated artifact activation", () => {
  test("executes both development variants and reaches deterministic scorer success", async () => {
    const registry = JSON.parse(await readFile(join(rootDir, pilotDir, "development/tasks.json"), "utf8")) as { tasks: Task[] };
    for (const task of registry.tasks) {
      const variantId = task.id.includes("node") ? "node" : "vite";
      const packageDir = await tempDir(`env-manager-v3-package-${variantId}-`);
      await compileEnvManagerV3ValidatedArtifact(
        await loadEnvManagerV3ArtifactCompilerInput(rootDir, variantId), packageDir,
      );
      const artifactPackage = await validateValidatedArtifactPackage(packageDir);
      const workDir = await tempDir(`env-manager-v3-work-${variantId}-`);
      await materialize(task, workDir);
      const manifest = await writeInitialWorkdirManifest({
        workDir, manifestPath: join(await tempDir("env-manager-v3-manifest-"), "initial.json"),
      });
      const runtime = await runValidatedArtifactPlan({
        package: artifactPackage,
        workDir,
        env: { SKVM_NODE: process.env.SKVM_NODE ?? "node" },
      });
      expect(runtime.status).toBe("complete");
      expect(runtime.validation?.status).toBe("pass");
      expect(runtime.modelGenerationTokens).toBe(0);
      expect(await score(task, workDir, manifest)).toEqual({ evaluatorScore: 1, success: true });
    }
  }, 120_000);
});
