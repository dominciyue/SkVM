import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lawToMarkdownGrade } from "../../bench/evaluators/law-to-markdown-grade";
import {
  compileLawValidatedArtifact,
  loadLawArtifactCompilerInput,
} from "./law-artifact-compiler";
import { runResourceProbe, ResourceContractSchema } from "./resource-contract";
import { validateValidatedArtifactPackage } from "./validated-artifact-catalog";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

type Task = {
  id: string;
  split: "development" | "held-out";
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

async function scoreTask(task: Task, workDir: string) {
  const criteria = await Promise.all(task.eval.map(async (criterion) => ({
    criterion,
    result: await lawToMarkdownGrade.run({
      criterion,
      runResult: { workDir },
    } as never),
  })));
  const score = criteria.reduce(
    (sum, row) => sum + row.criterion.weight * row.result.score,
    0,
  );
  const hardGateFailures = criteria
    .filter((row) => task.hardGateIds.includes(row.criterion.id) && !row.result.pass)
    .map((row) => row.criterion.id);
  return {
    score,
    success: score >= task.passThreshold && hardGateFailures.length === 0,
    hardGateFailures,
    criteria: Object.fromEntries(criteria.map((row) => [row.criterion.id, row.result.pass])),
  };
}

describe("law validated artifact activation", () => {
  test.skipIf(!process.env.SKVM_PYTHON)(
    "executes both development branches without shell and scores the final workdir",
    async () => {
      const rootDir = process.cwd();
      const packageDir = await tempDir("law-artifact-activation-package-");
      await compileLawValidatedArtifact(await loadLawArtifactCompilerInput(rootDir), packageDir);
      const packageRecord = await validateValidatedArtifactPackage(packageDir);
      const resourceContract = ResourceContractSchema.parse(JSON.parse(await readFile(
        join(rootDir, "benchmarks/skill-ir/pilots/law-to-markdown/resource-contract.json"),
        "utf8",
      )));
      const probe = await runResourceProbe(resourceContract, {
        env: { SKVM_PYTHON: process.env.SKVM_PYTHON },
      });
      expect(probe.status).toBe("ok");
      const emptyWorkDir = await tempDir("law-artifact-empty-check-");
      const checker = packageRecord.manifest.artifacts.find(
        (artifact) => artifact.id === "law-runtime-checker",
      );
      expect(checker).toBeDefined();
      const checkerProcess = Bun.spawn([
        process.env.SKVM_PYTHON!,
        join(packageDir, checker!.path),
        "--workdir",
        emptyWorkDir,
      ], { stdout: "pipe", stderr: "pipe" });
      const [checkerExit, checkerOutput] = await Promise.all([
        checkerProcess.exited,
        new Response(checkerProcess.stdout).text(),
        new Response(checkerProcess.stderr).text(),
      ]);
      expect(checkerExit).toBe(0);
      expect(JSON.parse(checkerOutput).errors[0].relativePath)
        .toBe("markdown/document/document+审核报告.md");

      const registry = JSON.parse(await readFile(
        join(rootDir, "benchmarks/skill-ir/pilots/law-to-markdown/tasks.json"),
        "utf8",
      )) as { tasks: Task[] };
      const development = registry.tasks.filter((task) => task.split === "development");
      expect(development).toHaveLength(2);

      for (const task of development) {
        const workDir = await tempDir(`law-artifact-${task.id}-`);
        for (const [path, content] of Object.entries(task.fixtures)) {
          await writeFile(join(workDir, path), content, "utf8");
        }
        const before = await scoreTask(task, workDir);
        expect(before.success).toBe(false);

        const runtime = await runValidatedArtifactPlan({
          package: packageRecord,
          workDir,
          env: { SKVM_PYTHON: process.env.SKVM_PYTHON },
        });
        const after = await scoreTask(task, workDir);

        expect(runtime.status).toBe("complete");
        expect(runtime.validation?.status).toBe("pass");
        expect(runtime.modelGenerationTokens).toBe(0);
        expect(after.hardGateFailures).toEqual([]);
        expect(after.criteria["law-review-outcome"]).toBe(true);
        expect(after.score).toBeGreaterThan(before.score);
        expect(after.success).toBe(true);
        expect(after.score).toBeCloseTo(
          task.id === "law-to-markdown-statute-dev-001" ? 0.85 : 1,
          8,
        );
      }
    },
    180_000,
  );
});
