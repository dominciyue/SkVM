import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ArtifactPackageManifestSchema,
  ArtifactPackageProvenanceSchema,
  RuntimeValidationReportSchema,
  parseSafeRelativePath,
  validateArtifactPackage,
  type ArtifactPackageManifest,
  type ArtifactPackageProvenance,
} from "./artifact-package";
import { sha256Bytes } from "./source-fixture";

const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skill-ir-artifact-package-"));
  tempDirs.push(dir);
  return dir;
}

async function writeBytes(root: string, relativePath: string, content: string): Promise<string> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return sha256Bytes(Buffer.from(content, "utf8"));
}

async function createValidPackage(): Promise<{
  packageDir: string;
  manifest: ArtifactPackageManifest;
  provenance: ArtifactPackageProvenance;
}> {
  const packageDir = await tempDir();
  const irDigest = await writeBytes(packageDir, "skill-ir.json", "{}\n");
  const skillDigest = await writeBytes(packageDir, "skill.md", "# Skill\n");
  const contractDigest = await writeBytes(
    packageDir,
    "artifacts/contracts/env-manager-output-contract.json",
    "{}\n",
  );
  const templateDigest = await writeBytes(
    packageDir,
    "artifacts/templates/env-report.template.json",
    "{}\n",
  );
  const checkerDigest = await writeBytes(
    packageDir,
    "artifacts/checks/validate-output.ts",
    "console.log('{}');\n",
  );
  const policyDigest = await writeBytes(packageDir, "validation-policy.json", "{}\n");

  const artifacts = [
    { path: "skill-ir.json", kind: "skill-ir" as const, sha256: irDigest },
    { path: "skill.md", kind: "skill-view" as const, sha256: skillDigest },
    {
      path: "artifacts/contracts/env-manager-output-contract.json",
      kind: "contract" as const,
      sha256: contractDigest,
    },
    {
      path: "artifacts/templates/env-report.template.json",
      kind: "template" as const,
      sha256: templateDigest,
      targetPath: "env-report.json",
    },
    {
      path: "artifacts/checks/validate-output.ts",
      kind: "checker" as const,
      sha256: checkerDigest,
    },
    { path: "validation-policy.json", kind: "validation-policy" as const, sha256: policyDigest },
  ];
  const provenance: ArtifactPackageProvenance = {
    schemaVersion: "skill-ir-artifact-package-provenance/v1",
    catalog: "executable-artifact/v1",
    skillId: "env-manager",
    constructionSplit: "development",
    source: { path: "benchmarks/source/SKILL.md", sha256: "a".repeat(64) },
    baseIr: { path: "benchmarks/base-ir.json", sha256: "b".repeat(64) },
    repairEvidence: { path: "results/repair-evidence.json", sha256: "c".repeat(64) },
    taskContract: { taskIds: ["env-dev-1"], promptDigest: "d".repeat(64), sha256: contractDigest },
    compiler: { id: "env-manager-artifact-compiler", version: "v1", configSha256: "e".repeat(64) },
    predecessors: [],
    scope: {
      model: "test/model",
      modelFamily: "test",
      adapter: "bare-agent",
      adapterVersion: "workspace-v1",
      environment: "windows",
      context: "clean",
    },
    artifacts,
  };
  const provenanceText = `${JSON.stringify(provenance, null, 2)}\n`;
  const provenanceDigest = await writeBytes(packageDir, "package-provenance.json", provenanceText);
  const manifest: ArtifactPackageManifest = {
    schemaVersion: "skill-ir-artifact-package-manifest/v1",
    catalog: "executable-artifact/v1",
    skillId: "env-manager",
    provenance: { path: "package-provenance.json", sha256: provenanceDigest },
    contract: {
      path: "artifacts/contracts/env-manager-output-contract.json",
      sha256: contractDigest,
    },
    checker: { path: "artifacts/checks/validate-output.ts", timeoutMs: 5000 },
    generatedOutputs: ["env-report.json"],
    artifacts,
  };
  await writeBytes(packageDir, "package-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  return { packageDir, manifest, provenance };
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("artifact package contracts", () => {
  test("accepts normalized package-relative paths and rejects escapes or absolute paths", () => {
    expect(parseSafeRelativePath("artifacts/checks/validate-output.ts")).toBe(
      "artifacts/checks/validate-output.ts",
    );
    for (const path of ["", "../secret.txt", "a/../../secret.txt", "/tmp/secret", "C:\\secret.txt"]) {
      expect(() => parseSafeRelativePath(path)).toThrow();
    }
    expect(() => parseSafeRelativePath("artifacts\\checks\\validator.ts")).toThrow("normalized");
  });

  test("keeps runtime repair reports on a strict field and enum whitelist", () => {
    const valid = RuntimeValidationReportSchema.parse({
      schemaVersion: "runtime-validation-report/v1",
      status: "fail",
      repairEligible: true,
      errors: [
        {
          code: "MISSING_FIELD",
          relativePath: "env-report.json",
          jsonPointer: "/missing",
          missingField: "missing",
          expectedType: "array",
        },
      ],
    });
    expect(valid.errors[0]).toEqual({
      code: "MISSING_FIELD",
      relativePath: "env-report.json",
      jsonPointer: "/missing",
      missingField: "missing",
      expectedType: "array",
    });

    const base = {
      schemaVersion: "runtime-validation-report/v1",
      status: "fail",
      repairEligible: true,
      errors: [{ code: "MISSING_FIELD", relativePath: "env-report.json" }],
    };
    expect(() => RuntimeValidationReportSchema.parse({
      ...base,
      errors: [{ ...base.errors[0], message: "secret material" }],
    })).toThrow();
    expect(() => RuntimeValidationReportSchema.parse({
      ...base,
      errors: [{ code: "UNKNOWN_CODE", relativePath: "env-report.json" }],
    })).toThrow();
    expect(() => RuntimeValidationReportSchema.parse({
      ...base,
      errors: [{ code: "MISSING_FIELD", relativePath: "C:\\secret.txt" }],
    })).toThrow();
    expect(() => RuntimeValidationReportSchema.parse({
      ...base,
      errors: [{ code: "TYPE_MISMATCH", relativePath: "env-report.json", expectedType: "password" }],
    })).toThrow();
  });

  test("uses closed artifact catalogs and provenance schemas", async () => {
    const { manifest, provenance } = await createValidPackage();
    expect(ArtifactPackageManifestSchema.parse(manifest).catalog).toBe("executable-artifact/v1");
    expect(ArtifactPackageProvenanceSchema.parse(provenance).constructionSplit).toBe("development");
    expect(() => ArtifactPackageManifestSchema.parse({ ...manifest, catalog: "dual-overlay/v2" })).toThrow();
    expect(() => ArtifactPackageProvenanceSchema.parse({ ...provenance, constructionSplit: "held-out" })).toThrow();
  });

  test("validates every declared digest and rejects undeclared package files", async () => {
    const { packageDir } = await createValidPackage();
    const validated = await validateArtifactPackage({ packageDir });
    expect(validated.manifest.skillId).toBe("env-manager");
    expect(validated.provenance.catalog).toBe("executable-artifact/v1");

    await writeFile(join(packageDir, "skill.md"), "# Tampered\n", "utf8");
    await expect(validateArtifactPackage({ packageDir })).rejects.toThrow("digest mismatch");
  });

  test("rejects files that are not declared by the manifest", async () => {
    const { packageDir } = await createValidPackage();
    await writeFile(join(packageDir, "hidden-secret.txt"), "not declared", "utf8");
    await expect(validateArtifactPackage({ packageDir })).rejects.toThrow("Undeclared package file");
  });

  test("rejects manifest and provenance identity drift", async () => {
    const { packageDir, manifest } = await createValidPackage();
    const drifted = { ...manifest, skillId: "different-skill" };
    await writeFile(join(packageDir, "package-manifest.json"), `${JSON.stringify(drifted, null, 2)}\n`, "utf8");
    await expect(validateArtifactPackage({ packageDir })).rejects.toThrow("skill identity mismatch");
  });
});
