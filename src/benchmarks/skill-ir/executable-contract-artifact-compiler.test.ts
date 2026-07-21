import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateArtifactPackage } from "./artifact-package";
import { compileEnvManagerContractRepairArtifactPackage } from "./executable-contract-artifact-compiler";
import { parseExecutableContractArtifactRunArgs } from "./executable-contract-artifact-run";

const projectRoot = join(import.meta.dir, "../../..");
const pilotRoot = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager");
const evidenceRoot = join(
  projectRoot,
  "results/skill-ir/env-manager-v4-deterministic-replay-evidence-2026-07-22",
);
const inputs = {
  rootDir: projectRoot,
  baseIrPath: join(pilotRoot, "base-ir.json"),
  taskSetPath: join(pilotRoot, "tasks.json"),
  sourcePath: join(pilotRoot, "source/SKILL.md"),
  coverageAuditPath: join(evidenceRoot, "contract-coverage-audit.json"),
  replayFreezePath: join(pilotRoot, "env-manager-v4-deterministic-replay-freeze.json"),
  replaySummaryPath: join(evidenceRoot, "summary.json"),
};
const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skill-ir-v4-compiler-"));
  tempDirs.push(dir);
  return dir;
}

async function packageFiles(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for await (const relativePath of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true, dot: true })) {
    files[relativePath.replaceAll("\\", "/")] = await readFile(join(root, relativePath), "utf8");
  }
  return files;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("V4 contract-repair artifact compiler", () => {
  test("parses explicit compile and verify-only CLI boundaries", () => {
    expect(parseExecutableContractArtifactRunArgs([
      "--out-dir=out",
      "--base-ir=base.json",
      "--tasks=tasks.json",
      "--source=SKILL.md",
      "--coverage-audit=coverage.json",
      "--replay-freeze=freeze.json",
      "--replay-summary=summary.json",
    ])).toMatchObject({ outDir: "out", coverageAudit: "coverage.json" });
    expect(parseExecutableContractArtifactRunArgs(["--verify-only=package"])).toMatchObject({
      verifyOnly: "package",
    });
    expect(() => parseExecutableContractArtifactRunArgs(["--force=true"])).toThrow("Unknown argument");
  });

  test("emits a deterministic gold-isolated package with bound development lineage", async () => {
    const outA = await tempDir();
    const outB = await tempDir();
    await compileEnvManagerContractRepairArtifactPackage({ ...inputs, outDir: outA });
    await compileEnvManagerContractRepairArtifactPackage({ ...inputs, outDir: outB });

    const files = await packageFiles(outA);
    expect(files).toEqual(await packageFiles(outB));
    expect(Object.keys(files).sort()).toEqual([
      "artifacts/checks/executable-contract-checker.mjs",
      "artifacts/contracts/output-contract.json",
      "artifacts/contracts/public-policy.json",
      "artifacts/contracts/repair-recipe.json",
      "artifacts/schemas/public-runtime-contract.schema.json",
      "artifacts/scripts/deterministic-repairer.mjs",
      "artifacts/scripts/evidence-program.mjs",
      "artifacts/templates/.env.example",
      "artifacts/templates/.env.schema.json",
      "artifacts/templates/env-report.json",
      "package-manifest.json",
      "package-provenance.json",
      "skill-ir.json",
      "skill.md",
      "validation-policy.json",
    ]);
    const serialized = JSON.stringify(files);
    for (const prohibited of [
      "TEST_ONLY_NODE",
      "TEST_ONLY_VITE",
      "classificationGold",
      "evaluatorPayload",
      "held-out prompt",
      "sk-T1llC5",
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
    expect(files["artifacts/contracts/repair-recipe.json"]).not.toContain(
      "runtimeContractSha256",
    );

    await expect(validateArtifactPackage({
      packageDir: outA,
      expectedCatalog: "executable-contract-repair-artifact/v4",
    })).resolves.toMatchObject({
      manifest: {
        catalog: "executable-contract-repair-artifact/v4",
        runtimeContracts: {
          public: { path: ".skvm-artifact/public-runtime-contract.json" },
          executableRepair: { path: ".skvm-artifact/executable-repair-contract.json" },
        },
      },
      provenance: {
        constructionSplit: "development",
        learnedRules: [
          { ruleId: "server-dsn-sensitive/v1", status: "candidate" },
          { ruleId: "signing-key-minimum-length/v1", status: "candidate" },
        ],
      },
    });
  });

  test("rejects replay evidence that is not the frozen successful local mechanism record", async () => {
    const outDir = await tempDir();
    const driftedSummary = join(outDir, "summary.json");
    const summary = JSON.parse(await readFile(inputs.replaySummaryPath, "utf8"));
    summary.replayOnly.meanScoreAfter = 0.7;
    await Bun.write(driftedSummary, `${JSON.stringify(summary, null, 2)}\n`);
    await expect(compileEnvManagerContractRepairArtifactPackage({
      ...inputs,
      replaySummaryPath: driftedSummary,
      outDir: join(outDir, "package"),
    })).rejects.toThrow("replay evidence");
  });
});
