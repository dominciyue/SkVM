import { cp, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import {
  ApiTesterProductionRunReportSchema,
  executeApiTesterProductionArtifact,
  prepareApiTesterProductionArtifact,
  runApiTesterProductionArtifact,
  validateApiTesterProductionArtifact,
} from "./api-tester-production-artifact";

const FIXTURES = join(import.meta.dir, "fixtures", "api-tester-production");
const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(name: "books" | "orders") {
  const root = await mkdtemp(join(tmpdir(), `skvm-api-artifact-${name}-`));
  temporaryDirectories.push(root);
  const fixtureRoot = join(root, "fixtures");
  const workDir = join(root, "workdir");
  const outDir = join(root, "out");
  await cp(join(FIXTURES, name), fixtureRoot, { recursive: true });
  await cp(join(FIXTURES, name), workDir, { recursive: true });
  return { root, fixtureRoot, workDir, outDir };
}

describe("API Tester production artifact", () => {
  test("builds an exact digest-bound package and runs both new inputs", async () => {
    for (const name of ["books", "orders"] as const) {
      const paths = await setup(name);
      const beforeInput = await readFile(join(paths.workDir, name === "books" ? "api/openapi.json" : "spec/openapi.yaml"));
      const report = ApiTesterProductionRunReportSchema.parse(await runApiTesterProductionArtifact({
        rootDir: paths.fixtureRoot,
        bindingPath: "binding.json",
        workDir: paths.workDir,
        outDir: paths.outDir,
        nodeExecutable: Bun.which("node")!,
      }));
      expect(report).toMatchObject({
        status: "passed",
        identity: "skill-ir-api-tester-production-binding-development-001",
        accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
        validation: { status: "pass" },
      });
      expect(report.package.generator.sha256).not.toBe(report.package.checker.sha256);
      expect(await validateApiTesterProductionArtifact(join(paths.outDir, "artifact"))).toMatchObject({
        manifest: { bindingId: `${name}-api` },
      });
      expect(await readFile(join(paths.workDir, report.binding.inputPath))).toEqual(beforeInput);
      expect((await lstat(join(paths.workDir, report.outputs.plan.path))).isFile()).toBe(true);
      expect((await lstat(join(paths.workDir, report.outputs.report.path))).isFile()).toBe(true);
      expect((await lstat(join(paths.outDir, "validation-report.json"))).isFile()).toBe(true);
    }
  });

  test("fails closed on protected-input or package drift", async () => {
    const inputDrift = await setup("books");
    const prepared = await prepareApiTesterProductionArtifact({
      rootDir: inputDrift.fixtureRoot,
      bindingPath: "binding.json",
      workDir: inputDrift.workDir,
      outDir: inputDrift.outDir,
    });
    await writeFile(join(inputDrift.workDir, "api/openapi.json"), "{}\n", "utf8");
    await expect(executeApiTesterProductionArtifact({
      packageDir: prepared.packageDir,
      workDir: inputDrift.workDir,
      outDir: inputDrift.outDir,
      nodeExecutable: Bun.which("node")!,
    })).rejects.toThrow(/input digest mismatch/u);

    const packageDrift = await setup("orders");
    const second = await prepareApiTesterProductionArtifact({
      rootDir: packageDrift.fixtureRoot,
      bindingPath: "binding.json",
      workDir: packageDrift.workDir,
      outDir: packageDrift.outDir,
    });
    await writeFile(join(second.packageDir, "artifacts/checks/api-test-check.mjs"), "tampered\n", "utf8");
    await expect(validateApiTesterProductionArtifact(second.packageDir)).rejects.toThrow(/digest mismatch/u);
  });

  test("rejects non-empty outputs, existing generated files, and path overlap", async () => {
    const nonEmpty = await setup("books");
    await mkdir(nonEmpty.outDir, { recursive: true });
    await writeFile(join(nonEmpty.outDir, "keep.txt"), "user file\n", "utf8");
    await expect(prepareApiTesterProductionArtifact({
      rootDir: nonEmpty.fixtureRoot,
      bindingPath: "binding.json",
      workDir: nonEmpty.workDir,
      outDir: nonEmpty.outDir,
    })).rejects.toThrow(/must be empty/u);

    const existing = await setup("orders");
    await mkdir(join(existing.workDir, "build"), { recursive: true });
    await writeFile(join(existing.workDir, "build/orders-plan.json"), "{}\n", "utf8");
    await expect(prepareApiTesterProductionArtifact({
      rootDir: existing.fixtureRoot,
      bindingPath: "binding.json",
      workDir: existing.workDir,
      outDir: existing.outDir,
    })).rejects.toThrow(/output already exists/u);

    const overlap = await setup("books");
    await expect(prepareApiTesterProductionArtifact({
      rootDir: overlap.fixtureRoot,
      bindingPath: "binding.json",
      workDir: overlap.workDir,
      outDir: join(overlap.workDir, "nested-output"),
    })).rejects.toThrow(/must not overlap/u);
  });

  test("rejects symlinked protected inputs when the platform permits creating one", async () => {
    const paths = await setup("books");
    const real = join(paths.workDir, "api/openapi-real.json");
    const linked = join(paths.workDir, "api/openapi.json");
    await writeFile(real, await readFile(linked));
    await rm(linked);
    try {
      await symlink(real, linked, "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    await expect(prepareApiTesterProductionArtifact({
      rootDir: paths.fixtureRoot,
      bindingPath: "binding.json",
      workDir: paths.workDir,
      outDir: paths.outDir,
    })).rejects.toThrow(/symbolic link/u);
  });
});
