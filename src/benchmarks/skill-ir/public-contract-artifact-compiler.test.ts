import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateArtifactPackage } from "./artifact-package";
import { compileEnvManagerPublicContractArtifactPackage } from "./public-contract-artifact-compiler";

const projectRoot = join(import.meta.dir, "../../..");
const baseIrPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json");
const taskSetPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json");
const sourcePath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md");
const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skill-ir-public-contract-compiler-"));
  tempDirs.push(dir);
  return dir;
}

async function packageFiles(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for await (const relativePath of new Bun.Glob("**/*").scan({
    cwd: root,
    onlyFiles: true,
    dot: true,
  })) {
    files[relativePath.replaceAll("\\", "/")] = await readFile(join(root, relativePath), "utf8");
  }
  return files;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("V3 public-contract artifact compiler", () => {
  test("emits the reviewed V3 layout without evaluator, held-out, secret, or gold sinks", async () => {
    const fixtureRoot = await tempDir();
    const copiedTasks = join(fixtureRoot, "tasks.json");
    const taskSet = JSON.parse(await readFile(taskSetPath, "utf8")) as {
      tasks: Array<Record<string, unknown> & { split: string; prompt: string }>;
    };
    taskSet.tasks = taskSet.tasks.map((task) => ({
      ...task,
      eval: [{
        id: "V3_EVALUATOR_CANARY",
        payload: {
          expected: ["V3_EXPECTED_GOLD_CANARY"],
          secret: "TEST_ONLY_V3_SECRET_CANARY",
        },
      }],
      classificationGold: { definedAndUsed: ["V3_CLASSIFICATION_GOLD_CANARY"] },
      ...(task.split === "held-out"
        ? { prompt: `${task.prompt} V3_HELD_OUT_PROMPT_CANARY` }
        : {}),
    }));
    await writeFile(copiedTasks, `${JSON.stringify(taskSet, null, 2)}\n`, "utf8");

    const outDir = join(fixtureRoot, "package");
    await compileEnvManagerPublicContractArtifactPackage({
      rootDir: projectRoot,
      baseIrPath,
      taskSetPath: copiedTasks,
      sourcePath,
      outDir,
    });
    const files = await packageFiles(outDir);
    expect(Object.keys(files).sort()).toEqual([
      "artifacts/checks/public-contract-checker.mjs",
      "artifacts/contracts/output-contract.json",
      "artifacts/contracts/public-policy.json",
      "artifacts/schemas/public-runtime-contract.schema.json",
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
    expect(files["skill.md"]).toContain(".skvm-artifact/public-runtime-contract.json");
    const serialized = JSON.stringify(files);
    for (const canary of [
      "V3_EVALUATOR_CANARY",
      "V3_EXPECTED_GOLD_CANARY",
      "TEST_ONLY_V3_SECRET_CANARY",
      "V3_CLASSIFICATION_GOLD_CANARY",
      "V3_HELD_OUT_PROMPT_CANARY",
      "classificationGold",
    ]) {
      expect(serialized).not.toContain(canary);
    }
  });

  test("is byte deterministic and validates through the V3 catalog dispatch", async () => {
    const fixtureRoot = await tempDir();
    const outA = join(fixtureRoot, "package-a");
    const outB = join(fixtureRoot, "package-b");
    const common = { rootDir: projectRoot, baseIrPath, taskSetPath, sourcePath };
    await compileEnvManagerPublicContractArtifactPackage({ ...common, outDir: outA });
    await compileEnvManagerPublicContractArtifactPackage({ ...common, outDir: outB });
    expect(await packageFiles(outA)).toEqual(await packageFiles(outB));
    await expect(validateArtifactPackage({
      packageDir: outA,
      expectedCatalog: "executable-public-contract-artifact/v3",
    })).resolves.toMatchObject({
      manifest: {
        catalog: "executable-public-contract-artifact/v3",
        runtimeContract: { path: ".skvm-artifact/public-runtime-contract.json" },
      },
      provenance: { constructionSplit: "development" },
    });
  });
});
