import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import {
  ApiTesterProductionRunReportSchemaV2,
  executeApiTesterProductionArtifactV2,
  prepareApiTesterProductionArtifactV2,
  runApiTesterProductionArtifactV2,
  validateApiTesterProductionArtifactV2,
} from "./api-tester-production-artifact-v2";

const FIXTURE = join(import.meta.dir, "fixtures", "api-tester-production-v2", "local-ref-arrays");
const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "skvm-api-production-v2-artifact-"));
  temporaryDirectories.push(root);
  const fixtureRoot = join(root, "fixture");
  const workDir = join(root, "workdir");
  const outDir = join(root, "out");
  await cp(FIXTURE, fixtureRoot, { recursive: true });
  await cp(FIXTURE, workDir, { recursive: true });
  return { root, fixtureRoot, workDir, outDir };
}

describe("API Tester production artifact v2", () => {
  test("builds, validates, and runs an exact v2 package", async () => {
    const paths = await setup();
    const before = await readFile(join(paths.workDir, "openapi.yaml"));
    const report = ApiTesterProductionRunReportSchemaV2.parse(await runApiTesterProductionArtifactV2({
      rootDir: paths.fixtureRoot,
      bindingPath: "binding.json",
      workDir: paths.workDir,
      outDir: paths.outDir,
      nodeExecutable: Bun.which("node")!,
    }));
    expect(report).toMatchObject({
      status: "passed",
      identity: "skill-ir-api-tester-production-binding-successor-development-001",
      supportContractId: "api-tester-openapi-subset-v2",
      accounting: { modelCalls: 0, apiCalls: 0, paidCalls: 0 },
      validation: { status: "pass", checks: { arrayEncoding: true, schemaDerivedCases: true } },
    });
    expect(report.package.generator.sha256).not.toBe(report.package.checker.sha256);
    expect(await validateApiTesterProductionArtifactV2(join(paths.outDir, "artifact"))).toMatchObject({
      manifest: { bindingId: "local-ref-arrays-api" },
      contract: { supportContractId: "api-tester-openapi-subset-v2" },
    });
    expect(await readFile(join(paths.workDir, "openapi.yaml"))).toEqual(before);
    expect((await lstat(join(paths.workDir, report.outputs.plan.path))).isFile()).toBe(true);
    expect((await lstat(join(paths.workDir, report.outputs.report.path))).isFile()).toBe(true);
    expect((await lstat(join(paths.outDir, "validation-report.json"))).isFile()).toBe(true);
  });

  test("fails closed on protected-input and package drift", async () => {
    const inputDrift = await setup();
    const prepared = await prepareApiTesterProductionArtifactV2({
      rootDir: inputDrift.fixtureRoot,
      bindingPath: "binding.json",
      workDir: inputDrift.workDir,
      outDir: inputDrift.outDir,
    });
    await writeFile(join(inputDrift.workDir, "openapi.yaml"), "openapi: 3.1.0\n", "utf8");
    await expect(executeApiTesterProductionArtifactV2({
      packageDir: prepared.packageDir,
      workDir: inputDrift.workDir,
      outDir: inputDrift.outDir,
      nodeExecutable: Bun.which("node")!,
    })).rejects.toThrow(/input digest mismatch/u);

    const packageDrift = await setup();
    const second = await prepareApiTesterProductionArtifactV2({
      rootDir: packageDrift.fixtureRoot,
      bindingPath: "binding.json",
      workDir: packageDrift.workDir,
      outDir: packageDrift.outDir,
    });
    await writeFile(join(second.packageDir, "artifacts/checks/api-test-check.mjs"), "tampered\n", "utf8");
    await expect(validateApiTesterProductionArtifactV2(second.packageDir)).rejects.toThrow(/digest mismatch/u);
  });

  test("rejects non-empty output, existing generated files, and overlap", async () => {
    const nonEmpty = await setup();
    await mkdir(nonEmpty.outDir, { recursive: true });
    await writeFile(join(nonEmpty.outDir, "keep.txt"), "user file\n", "utf8");
    await expect(prepareApiTesterProductionArtifactV2({
      rootDir: nonEmpty.fixtureRoot,
      bindingPath: "binding.json",
      workDir: nonEmpty.workDir,
      outDir: nonEmpty.outDir,
    })).rejects.toThrow(/must be empty/u);

    const existing = await setup();
    await mkdir(join(existing.workDir, "generated"), { recursive: true });
    await writeFile(join(existing.workDir, "generated/plan.json"), "{}\n", "utf8");
    await expect(prepareApiTesterProductionArtifactV2({
      rootDir: existing.fixtureRoot,
      bindingPath: "binding.json",
      workDir: existing.workDir,
      outDir: existing.outDir,
    })).rejects.toThrow(/output already exists/u);

    const overlap = await setup();
    await expect(prepareApiTesterProductionArtifactV2({
      rootDir: overlap.fixtureRoot,
      bindingPath: "binding.json",
      workDir: overlap.workDir,
      outDir: join(overlap.workDir, "out"),
    })).rejects.toThrow(/must not overlap/u);
  });
});
