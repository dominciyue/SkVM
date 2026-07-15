import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileEnvManagerArtifactPackage } from "./artifact-package-compiler";
import { compileEnvManagerSemanticArtifactPackage } from "./semantic-artifact-compiler";
import { SemanticRuntimeContractSchema } from "./semantic-contract";
import { sha256Bytes } from "./source-fixture";
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

async function compileSemanticPackage(): Promise<string> {
  const outDir = join(await tempDir("skill-ir-semantic-preflight-package-"), "package");
  await compileEnvManagerSemanticArtifactPackage({
    rootDir: projectRoot,
    baseIrPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json"),
    taskSetPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json"),
    sourcePath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
    outDir,
  });
  return outDir;
}

async function taskContractDigest(dir: string): Promise<string> {
  const provenance = JSON.parse(await readFile(join(dir, "package-provenance.json"), "utf8")) as {
    taskContract: { sha256: string };
  };
  return provenance.taskContract.sha256;
}

async function replaceEvidenceProgram(
  dir: string,
  source: string,
  timeoutMs: number,
): Promise<void> {
  const manifestPath = join(dir, "package-manifest.json");
  const provenancePath = join(dir, "package-provenance.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as any;
  const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as any;
  const programPath = join(dir, manifest.evidenceProgram.path);
  await writeFile(programPath, source, "utf8");
  const digest = sha256Bytes(Buffer.from(source, "utf8"));
  manifest.evidenceProgram.timeoutMs = timeoutMs;
  manifest.artifacts.find((item: any) => item.path === manifest.evidenceProgram.path).sha256 = digest;
  provenance.artifacts.find((item: any) => item.path === manifest.evidenceProgram.path).sha256 = digest;
  const provenanceText = `${JSON.stringify(provenance, null, 2)}\n`;
  await writeFile(provenancePath, provenanceText, "utf8");
  manifest.provenance.sha256 = sha256Bytes(Buffer.from(provenanceText, "utf8"));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
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

  test("derives the v2 runtime contract before generation and protects its digest", async () => {
    const semanticPackage = await compileSemanticPackage();
    await writeFile(join(workDir, ".env"), "APP_PORT=3000\nDB_PASSWORD=TEST_ONLY_LOCAL\n", "utf8");
    await mkdir(join(workDir, "src"), { recursive: true });
    await writeFile(
      join(workDir, "src/config.js"),
      "const port = Number(process.env.APP_PORT);\nconst password = process.env.DB_PASSWORD;\n",
      "utf8",
    );

    const prepared = await preflightArtifactRun({
      packageDir: semanticPackage,
      workDir,
      scope,
      expectedContractDigest: await taskContractDigest(semanticPackage),
    });
    const contractPath = join(workDir, ".skvm-artifact", "semantic-contract.json");
    const contract = SemanticRuntimeContractSchema.parse(JSON.parse(await readFile(contractPath, "utf8")));

    expect(prepared.package.manifest.catalog).toBe("executable-semantic-artifact/v2");
    expect(contract.observedVariables.map((item) => item.name)).toEqual(["APP_PORT", "DB_PASSWORD"]);
    expect(prepared.protectedFiles.map((file) => file.relativePath)).toContain(
      ".skvm-artifact/semantic-contract.json",
    );
    expect(JSON.stringify(prepared)).not.toContain("TEST_ONLY_LOCAL");
  });

  test("keeps v1 behavior free of semantic runtime contract materialization", async () => {
    const prepared = await preflightArtifactRun({
      packageDir,
      workDir,
      scope,
      expectedContractDigest: await taskContractDigest(packageDir),
    });
    expect(await Bun.file(join(workDir, ".skvm-artifact", "semantic-contract.json")).exists()).toBe(false);
    expect(prepared.package.manifest.catalog).toBe("executable-artifact/v1");
  });

  test("rejects a pre-existing runtime contract link and an escaping declared path", async () => {
    const semanticPackage = await compileSemanticPackage();
    const outside = await tempDir("skill-ir-contract-outside-");
    await symlink(outside, join(workDir, ".skvm-artifact"), "junction");
    const input = {
      packageDir: semanticPackage,
      workDir,
      scope,
      expectedContractDigest: await taskContractDigest(semanticPackage),
    };
    await expect(preflightArtifactRun(input)).rejects.toThrow(/symbolic link|reparse|pre-existing/i);

    await rm(join(workDir, ".skvm-artifact"), { recursive: true, force: true });
    const manifestPath = join(semanticPackage, "package-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as any;
    manifest.runtimeContract.path = "../escaped-contract.json";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await expect(preflightArtifactRun(input)).rejects.toThrow();
  });

  test("treats evidence timeout and invalid JSON as preflight infrastructure failures", async () => {
    const timeoutPackage = await compileSemanticPackage();
    await replaceEvidenceProgram(timeoutPackage, "await Bun.sleep(1000);\n", 20);
    await expect(preflightArtifactRun({
      packageDir: timeoutPackage,
      workDir,
      scope,
      expectedContractDigest: await taskContractDigest(timeoutPackage),
    })).rejects.toThrow(/timed out/i);

    const invalidPackage = await compileSemanticPackage();
    await replaceEvidenceProgram(invalidPackage, `
const arg = process.argv.find((value) => value.startsWith("--out="));
if (!arg) throw new Error("missing out");
await Bun.write(arg.slice("--out=".length), "not-json");
`, 5000);
    await expect(preflightArtifactRun({
      packageDir: invalidPackage,
      workDir,
      scope,
      expectedContractDigest: await taskContractDigest(invalidPackage),
    })).rejects.toThrow(/JSON|contract/i);
  });
});
