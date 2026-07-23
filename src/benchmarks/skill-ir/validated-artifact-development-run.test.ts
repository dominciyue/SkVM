import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildValidatedArtifactDevelopmentPlan } from "./validated-artifact-development";
import { executeValidatedArtifactDevelopmentRows } from "./validated-artifact-development-run";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test.skipIf(!process.env.SKVM_PYTHON)(
  "executes and scores the four frozen direct development rows",
  async () => {
  const outDir = await mkdtemp(join(tmpdir(), "validated-artifact-run-"));
  tempDirs.push(outDir);
  const rootDir = process.cwd();
  const plan = await buildValidatedArtifactDevelopmentPlan({
    rootDir,
    lockPath: join(
      rootDir,
      "benchmarks/skill-ir/pilots/law-to-markdown/"
        + "law-to-markdown-validated-artifact-development-lock.json",
    ),
    outDir,
  });

  const result = await executeValidatedArtifactDevelopmentRows({
    rootDir,
    developmentPlan: plan,
    env: {
      SKVM_PYTHON: process.env.SKVM_PYTHON,
    },
  });

  expect(result.resourceProbe.status).toBe("ok");
  expect(result.rawRows).toHaveLength(4);
  expect(result.scoredRows).toHaveLength(4);
  expect(result.scoredRows.every((row) => row.success)).toBe(true);
  expect(result.scoredRows.map((row) => Number(row.evaluatorScore?.toFixed(2))).sort())
    .toEqual([0.85, 0.85, 1, 1]);
  expect(result.scoredRows.every((row) =>
    row.validatedArtifactRuntime?.status === "complete"
    && row.inputTokens === 0
    && row.outputTokens === 0
    && row.tokenCost === 0,
  )).toBe(true);
  expect(result.cost.profileCost).toBe(0);
  expect(result.cost.modelGenerationTokens).toBe(0);
  expect(result.cost.modelRepairTokens).toBe(0);
  expect(result.cost.packageBytes).toBe(plan.package.packageBytes);
  expect(result.cost.breakEven).toBe("not-computed-quality-gate-pending");
  },
  180_000,
);
