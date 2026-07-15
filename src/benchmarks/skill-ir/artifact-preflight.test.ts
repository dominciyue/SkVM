import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileEnvManagerArtifactPackage } from "./artifact-package-compiler";
import {
  materializeArtifactTemplates,
  preflightArtifactRun,
  verifyProtectedWorkdir,
  type ArtifactRunScope,
} from "./artifact-preflight";

const projectRoot = join(import.meta.dir, "../../..");
const tempDirs: string[] = [];
let packageDir: string;
let workDir: string;

const scope: ArtifactRunScope = {
  skillId: "env-manager",
  taskId: "env-manager-node-audit-dev-001",
  taskSplit: "development",
  model: "xty/gpt-4.1-mini",
  modelFamily: "gpt",
  adapter: "bare-agent",
  adapterVersion: "workspace-executable-artifact-v1",
  environment: "windows",
  context: "clean",
};

async function tempDir(label: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), label));
  tempDirs.push(dir);
  return dir;
}

beforeEach(async () => {
  const root = await tempDir("skill-ir-preflight-");
  packageDir = join(root, "package");
  workDir = join(root, "workdir");
  await mkdir(workDir, { recursive: true });
  await compileEnvManagerArtifactPackage({
    rootDir: projectRoot,
    baseIrPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json"),
    repairEvidencePath: join(
      projectRoot,
      "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/repair-evidence.json",
    ),
    taskSetPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json"),
    sourcePath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
    predecessorPaths: [
      join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v1-2026-07-16/provenance.json"),
      join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/provenance.json"),
    ],
    outDir: packageDir,
    scope: {
      model: scope.model,
      modelFamily: scope.modelFamily,
      adapter: scope.adapter,
      adapterVersion: scope.adapterVersion,
      environment: scope.environment,
      context: scope.context,
    },
  });
});

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("artifact preflight", () => {
  test("validates scope and snapshots all protected fixture files by digest", async () => {
    await mkdir(join(workDir, "src"), { recursive: true });
    await writeFile(join(workDir, "src/index.ts"), "export const value = 1;\n", "utf8");
    await writeFile(join(workDir, ".env"), "TOKEN=TEST_ONLY_LOCAL\n", "utf8");
    const contract = JSON.parse(
      await readFile(join(packageDir, "package-provenance.json"), "utf8"),
    ) as { taskContract: { sha256: string } };

    const prepared = await preflightArtifactRun({
      packageDir,
      workDir,
      scope,
      expectedContractDigest: contract.taskContract.sha256,
    });

    expect(prepared.protectedFiles.map((file) => file.relativePath)).toEqual([".env", "src/index.ts"]);
    expect(prepared.protectedFiles.every((file) => /^[0-9a-f]{64}$/.test(file.sha256))).toBe(true);
    expect(prepared.generatedOutputs).toEqual([".env.example", ".env.schema.json", "env-report.json"]);
  });

  test("materializes only declared templates and leaves untargeted output for generation", async () => {
    await writeFile(join(workDir, "fixture.txt"), "keep\n", "utf8");
    const provenance = JSON.parse(
      await readFile(join(packageDir, "package-provenance.json"), "utf8"),
    ) as { taskContract: { sha256: string } };
    const prepared = await preflightArtifactRun({
      packageDir,
      workDir,
      scope,
      expectedContractDigest: provenance.taskContract.sha256,
    });

    await materializeArtifactTemplates(prepared);

    expect(await readFile(join(workDir, "env-report.json"), "utf8")).toContain("__SKVM_REQUIRED__");
    expect(await readFile(join(workDir, ".env.schema.json"), "utf8")).toContain("__SKVM_REQUIRED__");
    expect(await Bun.file(join(workDir, ".env.example")).exists()).toBe(false);
    expect(await readFile(join(workDir, "fixture.txt"), "utf8")).toBe("keep\n");
  });

  test("detects protected mutation without returning file bytes", async () => {
    await writeFile(join(workDir, "fixture.txt"), "sensitive fixture bytes\n", "utf8");
    const provenance = JSON.parse(
      await readFile(join(packageDir, "package-provenance.json"), "utf8"),
    ) as { taskContract: { sha256: string } };
    const prepared = await preflightArtifactRun({
      packageDir,
      workDir,
      scope,
      expectedContractDigest: provenance.taskContract.sha256,
    });
    await writeFile(join(workDir, "fixture.txt"), "changed bytes\n", "utf8");

    const result = await verifyProtectedWorkdir(prepared);

    expect(result).toEqual({ ok: false, mutatedPaths: ["fixture.txt"] });
    expect(JSON.stringify(result)).not.toContain("sensitive fixture bytes");
    expect(JSON.stringify(result)).not.toContain("changed bytes");
  });

  test("fails closed on package, task, contract, and runtime scope drift", async () => {
    const provenance = JSON.parse(
      await readFile(join(packageDir, "package-provenance.json"), "utf8"),
    ) as { taskContract: { sha256: string } };
    const valid = {
      packageDir,
      workDir,
      scope,
      expectedContractDigest: provenance.taskContract.sha256,
    };
    const invalid: Array<[string, Parameters<typeof preflightArtifactRun>[0]]> = [
      ["development", { ...valid, scope: { ...scope, taskSplit: "held-out" } }],
      ["task", { ...valid, scope: { ...scope, taskId: "unknown-dev-task" } }],
      ["model", { ...valid, scope: { ...scope, model: "other/model" } }],
      ["adapter", { ...valid, scope: { ...scope, adapter: "other-agent" } }],
      ["context", { ...valid, scope: { ...scope, context: "noisy" } }],
      ["environment", { ...valid, scope: { ...scope, environment: "linux" } }],
      ["contract", { ...valid, expectedContractDigest: "f".repeat(64) }],
      ["runtime", { ...valid, runtimeExecutable: join(workDir, "missing-bun.exe") }],
    ];
    for (const [message, input] of invalid) {
      await expect(preflightArtifactRun(input)).rejects.toThrow(message);
    }

    await writeFile(join(packageDir, "skill.md"), "tampered\n", "utf8");
    await expect(preflightArtifactRun(valid)).rejects.toThrow("digest mismatch");
  });

  test("rejects generated output paths or workdirs outside their declared roots", async () => {
    const provenance = JSON.parse(
      await readFile(join(packageDir, "package-provenance.json"), "utf8"),
    ) as { taskContract: { sha256: string } };
    const manifestPath = join(packageDir, "package-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { generatedOutputs: string[] };
    manifest.generatedOutputs = ["../escape.json"];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await expect(preflightArtifactRun({
      packageDir,
      workDir,
      scope,
      expectedContractDigest: provenance.taskContract.sha256,
    })).rejects.toThrow();
  });
});
