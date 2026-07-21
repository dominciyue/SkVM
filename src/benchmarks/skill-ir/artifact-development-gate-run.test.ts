import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runArtifactDevelopmentGateCli } from "./artifact-development-gate-run";

describe("artifact development gate CLI", () => {
  test("keeps every frozen generation in the report when run files are empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "skill-ir-v4-gate-"));
    const rawPath = join(dir, "raw-runs.jsonl");
    const scoredPath = join(dir, "scored-runs.jsonl");
    const outPath = join(dir, "gate-report.json");
    await Promise.all([writeFile(rawPath, "", "utf8"), writeFile(scoredPath, "", "utf8")]);

    const report = await runArtifactDevelopmentGateCli([
      `--raw=${rawPath}`,
      `--scored=${scoredPath}`,
      "--lock=benchmarks/skill-ir/pilots/env-manager/env-manager-contract-repair-artifact-v4-lock.json",
      `--out=${outPath}`,
      `--root-dir=${process.cwd()}`,
    ]);

    expect(report.counts).toEqual({
      expectedGenerations: 4,
      pairedGenerations: 0,
      missingGenerations: 4,
      missingPairs: 0,
      successes: 0,
      hardGateRegressions: 0,
      infrastructureFailures: 4,
    });
    expect(report.gate.passed).toBe(false);
    expect(JSON.parse(await readFile(outPath, "utf8"))).toEqual(report);
  });

  test("rejects a frozen scorer digest that no longer matches the repository", async () => {
    const dir = await mkdtemp(join(tmpdir(), "skill-ir-v4-gate-drift-"));
    const rawPath = join(dir, "raw-runs.jsonl");
    const scoredPath = join(dir, "scored-runs.jsonl");
    const lockPath = join(dir, "lock.json");
    await Promise.all([writeFile(rawPath, "", "utf8"), writeFile(scoredPath, "", "utf8")]);
    const sourceLock = JSON.parse(await readFile(
      "benchmarks/skill-ir/pilots/env-manager/env-manager-contract-repair-artifact-v4-lock.json",
      "utf8",
    ));
    sourceLock.scorer.sha256 = "0".repeat(64);
    await writeFile(lockPath, `${JSON.stringify(sourceLock)}\n`, "utf8");

    await expect(runArtifactDevelopmentGateCli([
      `--raw=${rawPath}`,
      `--scored=${scoredPath}`,
      `--lock=${lockPath}`,
      `--out=${join(dir, "report.json")}`,
      `--root-dir=${process.cwd()}`,
    ])).rejects.toThrow("scorer digest mismatch");
  });
});
