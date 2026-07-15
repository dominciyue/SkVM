import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileEnvManagerArtifactPackage } from "./artifact-package-compiler";
import { validateArtifactPackage } from "./artifact-package";
import { ClassificationCandidateSchema } from "./classification-evidence";
import {
  compileEnvManagerSemanticArtifactPackage,
} from "./semantic-artifact-compiler";

const projectRoot = join(import.meta.dir, "../../..");
const baseIrPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json");
const taskSetPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json");
const sourcePath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md");
const repairEvidencePath = join(
  projectRoot,
  "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/repair-evidence.json",
);
const predecessorPaths = [
  join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v1-2026-07-16/provenance.json"),
  join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/provenance.json"),
];
const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skill-ir-semantic-compiler-"));
  tempDirs.push(dir);
  return dir;
}

async function packageFiles(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for await (const relativePath of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true })) {
    files[relativePath.replaceAll("\\", "/")] = await readFile(join(root, relativePath), "utf8");
  }
  return files;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("env-manager executable semantic artifact compiler", () => {
  test("emits only the reviewed v2 layout and excludes every forbidden sink canary", async () => {
    const fixtureRoot = await tempDir();
    const copiedTasks = join(fixtureRoot, "tasks.json");
    const taskSet = JSON.parse(await readFile(taskSetPath, "utf8")) as {
      tasks: Array<Record<string, unknown> & { split: string; prompt: string }>;
    };
    const dormantB = ClassificationCandidateSchema.parse({
      value: "B_CLASSIFICATION_CANARY",
      evidenceRefs: [{ relativePath: "src/config.js", symbol: "APP_PORT" }],
      confidence: 0.91,
      disposition: "confirmed",
    });
    taskSet.tasks = taskSet.tasks.map((task) => ({
      ...task,
      eval: [{
        id: "EVALUATOR_CRITERION_CANARY",
        payload: {
          expected: ["EVALUATOR_EXPECTED_CANARY"],
          secret: "TEST_ONLY_EVALUATOR_SECRET_CANARY",
        },
      }],
      hardGateIds: ["HARD_GATE_ID_CANARY"],
      passThreshold: "PASS_THRESHOLD_CANARY_0_731927",
      classificationCandidates: [dormantB],
      ...(task.split === "held-out"
        ? { prompt: `${task.prompt} HELD_OUT_PROMPT_CANARY` }
        : {}),
    }));
    await writeFile(copiedTasks, `${JSON.stringify(taskSet, null, 2)}\n`, "utf8");

    const outDir = join(fixtureRoot, "package");
    await compileEnvManagerSemanticArtifactPackage({
      rootDir: projectRoot,
      baseIrPath,
      taskSetPath: copiedTasks,
      sourcePath,
      outDir,
    });

    const files = await packageFiles(outDir);
    expect(Object.keys(files).sort()).toEqual([
      "artifacts/checks/validate-semantic-output.ts",
      "artifacts/contracts/env-manager-output-contract.json",
      "artifacts/contracts/semantic-contract-schema.json",
      "artifacts/scripts/derive-semantic-contract.js",
      "artifacts/templates/env-report.template.json",
      "artifacts/templates/env-schema.template.json",
      "package-manifest.json",
      "package-provenance.json",
      "skill-ir.json",
      "skill.md",
      "validation-policy.json",
    ]);
    expect(files["skill.md"]).toContain(".skvm-artifact/semantic-contract.json");
    const serialized = JSON.stringify(files);
    for (const canary of [
      "EVALUATOR_CRITERION_CANARY",
      "EVALUATOR_EXPECTED_CANARY",
      "TEST_ONLY_EVALUATOR_SECRET_CANARY",
      "HARD_GATE_ID_CANARY",
      "PASS_THRESHOLD_CANARY_0_731927",
      "HELD_OUT_PROMPT_CANARY",
      "B_CLASSIFICATION_CANARY",
      "classificationCandidates",
      "disposition",
    ]) {
      expect(serialized).not.toContain(canary);
    }
  });

  test("is byte deterministic and validates through the catalog-dispatched package API", async () => {
    const fixtureRoot = await tempDir();
    const outA = join(fixtureRoot, "package-a");
    const outB = join(fixtureRoot, "package-b");
    const common = { rootDir: projectRoot, baseIrPath, taskSetPath, sourcePath };
    await compileEnvManagerSemanticArtifactPackage({ ...common, outDir: outA });
    await compileEnvManagerSemanticArtifactPackage({ ...common, outDir: outB });

    expect(await packageFiles(outA)).toEqual(await packageFiles(outB));
    await expect(validateArtifactPackage({
      packageDir: outA,
      expectedCatalog: "executable-semantic-artifact/v2",
    })).resolves.toMatchObject({
      manifest: {
        catalog: "executable-semantic-artifact/v2",
        runtimeContract: { path: ".skvm-artifact/semantic-contract.json" },
      },
      provenance: { constructionSplit: "development" },
    });
  });

  test("keeps frozen v1 compilation and literal validation intact", async () => {
    const fixtureRoot = await tempDir();
    const outDir = join(fixtureRoot, "v1-package");
    await compileEnvManagerArtifactPackage({
      rootDir: projectRoot,
      baseIrPath,
      repairEvidencePath,
      taskSetPath,
      sourcePath,
      predecessorPaths,
      outDir,
      scope: {
        model: "xty/gpt-4.1-mini",
        modelFamily: "gpt",
        adapter: "bare-agent",
        adapterVersion: "workspace-executable-artifact-v1",
        environment: "windows",
        context: "clean",
      },
    });
    await expect(validateArtifactPackage({
      packageDir: outDir,
      expectedCatalog: "executable-artifact/v1",
    })).resolves.toMatchObject({ manifest: { catalog: "executable-artifact/v1" } });
  });

  test("provides reproducible compile and verify-only CLI entrypoints", async () => {
    const fixtureRoot = await tempDir();
    const outDir = join(fixtureRoot, "cli-package");
    const runPath = join(import.meta.dir, "semantic-artifact-run.ts");
    const compile = Bun.spawn([
      process.execPath,
      runPath,
      `--root-dir=${projectRoot}`,
      `--base-ir=${baseIrPath}`,
      `--tasks=${taskSetPath}`,
      `--source=${sourcePath}`,
      `--out-dir=${outDir}`,
    ], { stdout: "pipe", stderr: "pipe" });
    expect(await compile.exited).toBe(0);
    expect(await new Response(compile.stdout).text()).toContain("executable-semantic-artifact/v2");

    const verify = Bun.spawn([
      process.execPath,
      runPath,
      `--verify-only=${outDir}`,
    ], { stdout: "pipe", stderr: "pipe" });
    expect(await verify.exited).toBe(0);
    expect(await new Response(verify.stdout).text()).toContain('"verified": true');
  });
});
