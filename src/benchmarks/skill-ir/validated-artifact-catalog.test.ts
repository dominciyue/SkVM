import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ValidatedArtifactExecutionPlanSchema,
  ValidatedArtifactManifestSchema,
  validateValidatedArtifactPackage,
  type ValidatedArtifactExecutionPlan,
  type ValidatedArtifactManifest,
  type ValidatedArtifactProvenance,
} from "./validated-artifact-catalog";
import { sha256Bytes } from "./source-fixture";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function writePackageFile(root: string, relativePath: string, content: string): Promise<string> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return sha256Bytes(Buffer.from(content, "utf8"));
}

async function createPackage(skillId = "sample-skill") {
  const packageDir = await mkdtemp(join(tmpdir(), "validated-skill-artifact-"));
  tempDirs.push(packageDir);
  const files = {
    "skill-ir.json": await writePackageFile(packageDir, "skill-ir.json", "{}\n"),
    "skill.md": await writePackageFile(packageDir, "skill.md", "# Sample\n"),
    "artifacts/scripts/run.py": await writePackageFile(
      packageDir,
      "artifacts/scripts/run.py",
      "print('ok')\n",
    ),
    "artifacts/checks/check.py": await writePackageFile(
      packageDir,
      "artifacts/checks/check.py",
      "print('{\"schemaVersion\":\"skill-artifact-validation-report/v1\",\"status\":\"pass\",\"errors\":[]}')\n",
    ),
    "artifacts/tool-plans/default.json": await writePackageFile(
      packageDir,
      "artifacts/tool-plans/default.json",
      "{}\n",
    ),
  };
  const artifacts = [
    { id: "skill-ir", path: "skill-ir.json", kind: "skill-ir" as const, sha256: files["skill-ir.json"] },
    { id: "skill-view", path: "skill.md", kind: "skill-view" as const, sha256: files["skill.md"] },
    {
      id: "runner",
      path: "artifacts/scripts/run.py",
      kind: "script" as const,
      sha256: files["artifacts/scripts/run.py"],
    },
    {
      id: "checker",
      path: "artifacts/checks/check.py",
      kind: "check" as const,
      sha256: files["artifacts/checks/check.py"],
    },
    {
      id: "default-plan",
      path: "artifacts/tool-plans/default.json",
      kind: "tool-plan" as const,
      sha256: files["artifacts/tool-plans/default.json"],
    },
  ];
  const plan: ValidatedArtifactExecutionPlan = {
    schemaVersion: "skill-artifact-execution-plan/v1",
    entrypoint: "validate",
    nodes: [
      {
        id: "convert",
        kind: "process",
        dependsOn: [],
        command: {
          interpreter: { env: "SKVM_PYTHON", fallback: "python" },
          artifactId: "runner",
          args: ["document.txt", "--out-dir", "markdown/document"],
          envAllowlist: ["SKVM_PYTHON"],
        },
        timeoutMs: 30_000,
      },
      {
        id: "validate",
        kind: "validate",
        dependsOn: ["convert"],
        command: {
          interpreter: { env: "SKVM_PYTHON", fallback: "python" },
          artifactId: "checker",
          args: ["--workdir", "{workdir}"],
          envAllowlist: ["SKVM_PYTHON"],
        },
        timeoutMs: 10_000,
      },
    ],
  };
  const planText = `${JSON.stringify(plan, null, 2)}\n`;
  const planDigest = await writePackageFile(packageDir, "execution-plan.json", planText);
  const provenance: ValidatedArtifactProvenance = {
    schemaVersion: "validated-skill-artifact-provenance/v1",
    catalog: "validated-skill-artifact/v1",
    skillId,
    constructionSplit: "development",
    compiler: {
      id: "sample-compiler",
      version: "v1",
      configSha256: "a".repeat(64),
    },
    inputs: {
      sourceClosure: [{ path: "benchmarks/sample/SKILL.md", sha256: "b".repeat(64) }],
      baseIr: { path: "benchmarks/sample/base-ir.json", sha256: "c".repeat(64) },
      sourceAudit: { path: "benchmarks/sample/source-audit.json", sha256: "d".repeat(64) },
      resourceContract: { path: "benchmarks/sample/resource-contract.json", sha256: "e".repeat(64) },
      taskContract: {
        taskIds: ["sample-dev-001"],
        promptDigest: "f".repeat(64),
      },
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
  const provenanceText = `${JSON.stringify(provenance, null, 2)}\n`;
  const provenanceDigest = await writePackageFile(
    packageDir,
    "package-provenance.json",
    provenanceText,
  );
  const manifest: ValidatedArtifactManifest = {
    schemaVersion: "validated-skill-artifact-manifest/v1",
    catalog: "validated-skill-artifact/v1",
    skillId,
    provenance: { path: "package-provenance.json", sha256: provenanceDigest },
    executionPlan: { path: "execution-plan.json", sha256: planDigest },
    protectedInputs: ["document.txt"],
    generatedOutputs: ["markdown/document"],
    artifacts,
  };
  await writePackageFile(
    packageDir,
    "package-manifest.json",
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { packageDir, manifest, plan };
}

describe("validated skill artifact catalog", () => {
  test("validates the same catalog shape for arbitrary skill ids", async () => {
    const first = await createPackage("law-to-markdown");
    const second = await createPackage("experimental-design");

    expect((await validateValidatedArtifactPackage(first.packageDir)).manifest.skillId)
      .toBe("law-to-markdown");
    expect((await validateValidatedArtifactPackage(second.packageDir)).manifest.skillId)
      .toBe("experimental-design");
  });

  test("rejects digest drift and undeclared package files", async () => {
    const drifted = await createPackage();
    await writeFile(join(drifted.packageDir, "artifacts/scripts/run.py"), "print('changed')\n");
    await expect(validateValidatedArtifactPackage(drifted.packageDir)).rejects.toThrow(/digest/i);

    const extra = await createPackage();
    await writeFile(join(extra.packageDir, "unexpected.txt"), "not declared\n");
    await expect(validateValidatedArtifactPackage(extra.packageDir)).rejects.toThrow(/undeclared/i);
  });

  test("rejects shell commands and unresolved node or artifact references", async () => {
    expect(() => ValidatedArtifactExecutionPlanSchema.parse({
      schemaVersion: "skill-artifact-execution-plan/v1",
      entrypoint: "run",
      nodes: [{
        id: "run",
        kind: "process",
        dependsOn: ["missing-node"],
        shell: "python run.py && echo done",
        command: {
          interpreter: { env: "SKVM_PYTHON", fallback: "python" },
          artifactId: "missing-artifact",
          args: [],
          envAllowlist: ["SKVM_PYTHON"],
        },
        timeoutMs: 1000,
      }],
    })).toThrow();
  });

  test("rejects skill-specific fields in the generic manifest", async () => {
    const { manifest } = await createPackage();
    expect(() => ValidatedArtifactManifestSchema.parse({
      ...manifest,
      lawDecision: "auto",
    })).toThrow();
  });
});
