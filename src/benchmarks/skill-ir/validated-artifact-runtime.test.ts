import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  validateValidatedArtifactPackage,
  type ValidatedArtifactExecutionPlan,
  type ValidatedArtifactManifest,
  type ValidatedArtifactProvenance,
} from "./validated-artifact-catalog";
import {
  SkillArtifactValidationReportSchema,
  runValidatedArtifactPlan,
} from "./validated-artifact-runtime";
import { sha256Bytes } from "./source-fixture";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function write(root: string, path: string, content: string): Promise<string> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content, "utf8");
  return sha256Bytes(Buffer.from(content, "utf8"));
}

async function createRuntimePackage(processSource: string, checkerSource: string) {
  const packageDir = await tempDir("validated-artifact-runtime-package-");
  const digests = {
    ir: await write(packageDir, "skill-ir.json", "{}\n"),
    view: await write(packageDir, "skill.md", "# Test\n"),
    process: await write(packageDir, "artifacts/scripts/run.ts", processSource),
    checker: await write(packageDir, "artifacts/checks/check.ts", checkerSource),
  };
  const artifacts = [
    { id: "skill-ir", path: "skill-ir.json", kind: "skill-ir" as const, sha256: digests.ir },
    { id: "skill-view", path: "skill.md", kind: "skill-view" as const, sha256: digests.view },
    {
      id: "runner",
      path: "artifacts/scripts/run.ts",
      kind: "script" as const,
      sha256: digests.process,
    },
    {
      id: "checker",
      path: "artifacts/checks/check.ts",
      kind: "check" as const,
      sha256: digests.checker,
    },
  ];
  const plan: ValidatedArtifactExecutionPlan = {
    schemaVersion: "skill-artifact-execution-plan/v1",
    entrypoint: "validate",
    nodes: [
      {
        id: "generate",
        kind: "process",
        dependsOn: [],
        command: {
          interpreter: { env: "SKVM_TEST_EXECUTABLE", fallback: "bun" },
          artifactId: "runner",
          args: ["{artifact:skill-view}", "{env:SKVM_MARKER}"],
          envAllowlist: ["SKVM_TEST_EXECUTABLE", "SKVM_MARKER"],
        },
        timeoutMs: 10_000,
      },
      {
        id: "validate",
        kind: "validate",
        dependsOn: ["generate"],
        command: {
          interpreter: { env: "SKVM_TEST_EXECUTABLE", fallback: "bun" },
          artifactId: "checker",
          args: ["--workdir", "{workdir}"],
          envAllowlist: ["SKVM_TEST_EXECUTABLE"],
        },
        timeoutMs: 10_000,
      },
    ],
  };
  const planDigest = await write(packageDir, "execution-plan.json", `${JSON.stringify(plan, null, 2)}\n`);
  const provenance: ValidatedArtifactProvenance = {
    schemaVersion: "validated-skill-artifact-provenance/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: "runtime-test",
    constructionSplit: "development",
    compiler: { id: "runtime-test-compiler", version: "v1", configSha256: "a".repeat(64) },
    inputs: {
      sourceClosure: [{ path: "source/SKILL.md", sha256: "b".repeat(64) }],
      baseIr: { path: "base-ir.json", sha256: "c".repeat(64) },
      sourceAudit: { path: "source-audit.json", sha256: "d".repeat(64) },
      resourceContract: { path: "resource-contract.json", sha256: "e".repeat(64) },
      taskContract: { taskIds: ["runtime-dev-001"], promptDigest: "f".repeat(64) },
    },
    forbiddenEvidenceClasses: [
      "evaluator-payload",
      "held-out",
      "runtime-output",
      "profile-feedback",
      "secret-value",
    ],
    artifacts,
  };
  const provenanceDigest = await write(
    packageDir,
    "package-provenance.json",
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
  const manifest: ValidatedArtifactManifest = {
    schemaVersion: "validated-skill-artifact-manifest/v1",
    catalog: "validated-skill-artifact/v1",
    skillId: "runtime-test",
    provenance: { path: "package-provenance.json", sha256: provenanceDigest },
    executionPlan: { path: "execution-plan.json", sha256: planDigest },
    protectedInputs: ["document.txt"],
    generatedOutputs: ["result.json"],
    artifacts,
  };
  await write(packageDir, "package-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  return validateValidatedArtifactPackage(packageDir);
}

const passingChecker = `
const workdir = process.argv[process.argv.indexOf("--workdir") + 1];
const file = Bun.file(workdir + "/result.json");
const pass = await file.exists();
console.log(JSON.stringify({
  schemaVersion: "skill-artifact-validation-report/v1",
  status: pass ? "pass" : "fail",
  errors: pass ? [] : [{ code: "MISSING_OUTPUT", relativePath: "result.json" }]
}));
`;

describe("validated artifact runtime", () => {
  test("runs a dependency graph without shell and returns a sanitized cost record", async () => {
    const packageRecord = await createRuntimePackage(
      `await Bun.write("result.json", JSON.stringify({ artifact: process.argv[2], marker: process.argv[3] }));\nconsole.log("PRIVATE_STDOUT");\n`,
      passingChecker,
    );
    const workDir = await tempDir("validated-artifact-runtime-work-");
    await writeFile(join(workDir, "document.txt"), "protected\n", "utf8");

    const result = await runValidatedArtifactPlan({
      package: packageRecord,
      workDir,
      env: { SKVM_TEST_EXECUTABLE: process.execPath, SKVM_MARKER: "approved-marker" },
    });

    expect(result.status).toBe("complete");
    expect(result.validation?.status).toBe("pass");
    expect(result.nodes.map((node) => node.id)).toEqual(["generate", "validate"]);
    expect(result.modelGenerationTokens).toBe(0);
    expect(result.modelRepairTokens).toBe(0);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_STDOUT");
    expect(JSON.stringify(result)).not.toContain(workDir);
    const output = JSON.parse(await readFile(join(workDir, "result.json"), "utf8"));
    expect(output.marker).toBe("approved-marker");
    expect(output.artifact.endsWith(`${process.platform === "win32" ? "\\" : "/"}skill.md`))
      .toBe(true);
    expect(output.artifact.startsWith(packageRecord.packageDir)).toBe(false);
  });

  test("fails closed when a process mutates a protected input", async () => {
    const packageRecord = await createRuntimePackage(
      `await Bun.write("document.txt", "mutated\\n");\nawait Bun.write("result.json", "{}");\n`,
      passingChecker,
    );
    const workDir = await tempDir("validated-artifact-runtime-protected-");
    await writeFile(join(workDir, "document.txt"), "protected\n", "utf8");

    const result = await runValidatedArtifactPlan({
      package: packageRecord,
      workDir,
      env: { SKVM_TEST_EXECUTABLE: process.execPath, SKVM_MARKER: "approved-marker" },
    });

    expect(result.status).toBe("protected-input-failure");
    expect(result.nodes.at(-1)?.failureClass).toBe("protected-input-mutated");
  });

  test("executes from an isolated snapshot without mutating the frozen package", async () => {
    const packageRecord = await createRuntimePackage(
      `await Bun.write(new URL("./runtime-cache.tmp", import.meta.url), "cache");\n`
        + `await Bun.write("result.json", "{}");\n`,
      passingChecker,
    );
    const workDir = await tempDir("validated-artifact-runtime-package-isolation-");
    await writeFile(join(workDir, "document.txt"), "protected\n", "utf8");

    const result = await runValidatedArtifactPlan({
      package: packageRecord,
      workDir,
      env: { SKVM_TEST_EXECUTABLE: process.execPath, SKVM_MARKER: "approved-marker" },
    });

    expect(result.status).toBe("complete");
    expect(await Bun.file(join(
      packageRecord.packageDir,
      "artifacts/scripts/runtime-cache.tmp",
    )).exists()).toBe(false);
  });

  test("keeps validator failure separate from infrastructure failure", async () => {
    const packageRecord = await createRuntimePackage(
      `await Bun.write("result.json", "{}");\n`,
      `console.log(JSON.stringify({
        schemaVersion: "skill-artifact-validation-report/v1",
        status: "fail",
        errors: [{ code: "INVALID_OUTPUT", relativePath: "result.json", contractRef: "report/v1" }]
      }));\n`,
    );
    const workDir = await tempDir("validated-artifact-runtime-invalid-");
    await writeFile(join(workDir, "document.txt"), "protected\n", "utf8");

    const result = await runValidatedArtifactPlan({
      package: packageRecord,
      workDir,
      env: { SKVM_TEST_EXECUTABLE: process.execPath, SKVM_MARKER: "approved-marker" },
    });

    expect(result.status).toBe("validation-failure");
    expect(result.validation?.errors).toEqual([{
      code: "INVALID_OUTPUT",
      relativePath: "result.json",
      contractRef: "report/v1",
    }]);
  });

  test("rejects validation reports containing free-form messages", () => {
    expect(() => SkillArtifactValidationReportSchema.parse({
      schemaVersion: "skill-artifact-validation-report/v1",
      status: "fail",
      errors: [{ code: "INVALID_OUTPUT", message: "gold answer" }],
    })).toThrow();
  });
});
