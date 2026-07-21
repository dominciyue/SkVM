import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ArtifactPackageManifestSchema,
  ArtifactPackageProvenanceSchema,
  ContractRepairArtifactDevelopmentLockSchema,
  ContractRepairArtifactPackageManifestSchema,
  ContractRepairArtifactPackageProvenanceSchema,
  PublicContractArtifactDevelopmentLockSchema,
  PublicContractArtifactPackageManifestSchema,
  PublicContractArtifactPackageProvenanceSchema,
  RuntimeValidationReportSchema,
  parseSafeRelativePath,
  validateArtifactPackage,
  type ArtifactPackageManifest,
  type ArtifactPackageProvenance,
  type PublicContractArtifactPackageManifest,
  type PublicContractArtifactPackageProvenance,
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

async function createValidV3Package(): Promise<{
  packageDir: string;
  manifest: PublicContractArtifactPackageManifest;
  provenance: PublicContractArtifactPackageProvenance;
}> {
  const packageDir = await tempDir();
  const files = {
    "skill-ir.json": await writeBytes(packageDir, "skill-ir.json", "{}\n"),
    "skill.md": await writeBytes(packageDir, "skill.md", "# Skill\n"),
    "artifacts/contracts/output-contract.json": await writeBytes(
      packageDir,
      "artifacts/contracts/output-contract.json",
      "{}\n",
    ),
    "artifacts/contracts/public-policy.json": await writeBytes(
      packageDir,
      "artifacts/contracts/public-policy.json",
      "{}\n",
    ),
    "artifacts/schemas/public-runtime-contract.schema.json": await writeBytes(
      packageDir,
      "artifacts/schemas/public-runtime-contract.schema.json",
      "{}\n",
    ),
    "artifacts/scripts/evidence-program.mjs": await writeBytes(
      packageDir,
      "artifacts/scripts/evidence-program.mjs",
      "console.log('{}');\n",
    ),
    "artifacts/checks/public-contract-checker.mjs": await writeBytes(
      packageDir,
      "artifacts/checks/public-contract-checker.mjs",
      "console.log('{}');\n",
    ),
    "artifacts/templates/env-report.json": await writeBytes(
      packageDir,
      "artifacts/templates/env-report.json",
      "{}\n",
    ),
  };
  const artifacts = [
    { path: "skill-ir.json", kind: "skill-ir" as const, sha256: files["skill-ir.json"] },
    { path: "skill.md", kind: "skill-view" as const, sha256: files["skill.md"] },
    {
      path: "artifacts/contracts/output-contract.json",
      kind: "output-contract" as const,
      sha256: files["artifacts/contracts/output-contract.json"],
    },
    {
      path: "artifacts/contracts/public-policy.json",
      kind: "public-policy" as const,
      sha256: files["artifacts/contracts/public-policy.json"],
    },
    {
      path: "artifacts/schemas/public-runtime-contract.schema.json",
      kind: "public-contract-schema" as const,
      sha256: files["artifacts/schemas/public-runtime-contract.schema.json"],
    },
    {
      path: "artifacts/scripts/evidence-program.mjs",
      kind: "evidence-program" as const,
      sha256: files["artifacts/scripts/evidence-program.mjs"],
    },
    {
      path: "artifacts/checks/public-contract-checker.mjs",
      kind: "checker" as const,
      sha256: files["artifacts/checks/public-contract-checker.mjs"],
    },
    {
      path: "artifacts/templates/env-report.json",
      kind: "template" as const,
      sha256: files["artifacts/templates/env-report.json"],
      targetPath: "env-report.json",
    },
  ];
  const provenance: PublicContractArtifactPackageProvenance = {
    schemaVersion: "skill-ir-public-contract-artifact-package-provenance/v1",
    catalog: "executable-public-contract-artifact/v3",
    skillId: "env-manager",
    constructionSplit: "development",
    source: { path: "benchmarks/source/SKILL.md", sha256: "a".repeat(64) },
    baseIr: { path: "benchmarks/base-ir.json", sha256: "b".repeat(64) },
    taskContract: {
      taskIds: ["env-manager-node-audit-dev-001"],
      promptDigest: "c".repeat(64),
      sha256: "d".repeat(64),
    },
    compiler: {
      id: "env-manager-public-contract-artifact-compiler",
      version: "v3",
      configSha256: "e".repeat(64),
    },
    artifacts,
  };
  const provenanceDigest = await writeBytes(
    packageDir,
    "package-provenance.json",
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
  const manifest: PublicContractArtifactPackageManifest = {
    schemaVersion: "skill-ir-public-contract-artifact-package-manifest/v1",
    catalog: "executable-public-contract-artifact/v3",
    skillId: "env-manager",
    provenance: { path: "package-provenance.json", sha256: provenanceDigest },
    outputContract: {
      path: "artifacts/contracts/output-contract.json",
      sha256: files["artifacts/contracts/output-contract.json"],
    },
    publicPolicy: {
      path: "artifacts/contracts/public-policy.json",
      sha256: files["artifacts/contracts/public-policy.json"],
    },
    publicRuntimeContractSchema: {
      path: "artifacts/schemas/public-runtime-contract.schema.json",
      sha256: files["artifacts/schemas/public-runtime-contract.schema.json"],
    },
    evidenceProgram: {
      path: "artifacts/scripts/evidence-program.mjs",
      timeoutMs: 5000,
    },
    checker: {
      path: "artifacts/checks/public-contract-checker.mjs",
      timeoutMs: 5000,
    },
    runtimeContract: {
      path: ".skvm-artifact/public-runtime-contract.json",
      protected: true,
    },
    generatedOutputs: ["env-report.json"],
    artifacts,
  };
  await writeBytes(
    packageDir,
    "package-manifest.json",
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
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

  test("validates a V3 public-contract package without widening V1", async () => {
    const { packageDir, manifest, provenance } = await createValidV3Package();
    expect(PublicContractArtifactPackageManifestSchema.parse(manifest).catalog).toBe(
      "executable-public-contract-artifact/v3",
    );
    expect(PublicContractArtifactPackageProvenanceSchema.parse(provenance).compiler.version).toBe(
      "v3",
    );
    const validated = await validateArtifactPackage({
      packageDir,
      expectedCatalog: "executable-public-contract-artifact/v3",
    });
    expect(validated.manifest.catalog).toBe("executable-public-contract-artifact/v3");

    const v1 = await createValidPackage();
    expect((await validateArtifactPackage({
      packageDir: v1.packageDir,
      expectedCatalog: "executable-artifact/v1",
    })).manifest.catalog).toBe("executable-artifact/v1");
  });

  test("keeps the V3 development lock preregistered and shared-generation only", () => {
    const lock = {
      schemaVersion: "skill-ir-env-manager-executable-public-contract-artifact-lock/v1",
      stage: "executable-public-contract-artifact-development",
      status: "preregistered",
      catalog: "executable-public-contract-artifact/v3",
      codeCatalog: "public-contract-error-codes/v2",
      corpus: "pilot",
      skillId: "env-manager",
      package: {
        path: "benchmarks/skill-ir/pilots/env-manager/packages/v3",
        manifestSha256: "a".repeat(64),
        provenanceSha256: "b".repeat(64),
      },
      model: { route: "xty/gpt-5.6-sol", family: "gpt" },
      adapter: { id: "bare-agent", version: "workspace-v1" },
      matrix: {
        system: "ir-public-artifact-dev",
        contexts: ["clean"],
        agents: ["skvm"],
        environments: ["windows"],
        taskSplit: "development",
        taskIds: ["env-manager-node-audit-dev-001"],
        repetitions: 1,
        initialGenerationRows: 1,
      },
      runtime: {
        stateMachine: [
          "preflight",
          "generation",
          "capture-pre-repair-snapshot",
          "validate",
          "optional-one-repair",
          "revalidate",
          "capture-post-repair-snapshot",
          "stop",
        ],
        maxSemanticRepairCalls: 1,
        apiKeyEnv: "SKVM_XTY_API_KEY",
        sharedGeneration: true,
      },
      scoring: {
        authority: "existing-deterministic-env-manager-scorer",
        runtimeValidatorIsScorer: false,
        repairCostReportedSeparately: true,
        logicalArms: ["check-only", "one-repair"],
      },
      attributionGate: {
        minimumRepairAttempts: 1,
        requireSharedGenerationIdentity: true,
        scorerAuthorityUnchanged: true,
      },
      developmentGate: {
        minimumSuccesses: 1,
        minimumMeanScore: 0.85,
        maximumHardGateRegressions: 0,
        maximumInfrastructureFailures: 0,
      },
      prohibited: ["held-out evidence", "scorer expected payload"],
    };
    expect(PublicContractArtifactDevelopmentLockSchema.parse(lock).runtime.sharedGeneration).toBe(
      true,
    );
    expect(() => PublicContractArtifactDevelopmentLockSchema.parse({
      ...lock,
      runtime: { ...lock.runtime, sharedGeneration: false },
    })).toThrow();
    expect(() => PublicContractArtifactDevelopmentLockSchema.parse({
      ...lock,
      status: "optimized",
    })).toThrow();
  });

  test("keeps V4 package and lock identities separate from frozen V3", () => {
    const artifacts = [
      { path: "skill-ir.json", kind: "skill-ir", sha256: "1".repeat(64) },
      { path: "skill.md", kind: "skill-view", sha256: "2".repeat(64) },
      { path: "artifacts/contracts/output-contract.json", kind: "output-contract", sha256: "3".repeat(64) },
      { path: "artifacts/contracts/repair-recipe.json", kind: "repair-recipe", sha256: "4".repeat(64) },
      { path: "artifacts/contracts/public-policy.json", kind: "public-policy", sha256: "5".repeat(64) },
      { path: "artifacts/schemas/public-runtime-contract.schema.json", kind: "public-contract-schema", sha256: "6".repeat(64) },
      { path: "artifacts/scripts/evidence-program.mjs", kind: "evidence-program", sha256: "7".repeat(64) },
      { path: "artifacts/checks/executable-contract-checker.mjs", kind: "checker", sha256: "8".repeat(64) },
      { path: "artifacts/scripts/deterministic-repairer.mjs", kind: "deterministic-repairer", sha256: "9".repeat(64) },
      { path: "validation-policy.json", kind: "validation-policy", sha256: "a".repeat(64) },
    ];
    const provenance = {
      schemaVersion: "skill-ir-contract-repair-artifact-package-provenance/v1",
      catalog: "executable-contract-repair-artifact/v4",
      skillId: "env-manager",
      constructionSplit: "development",
      source: { path: "benchmarks/source/SKILL.md", sha256: "b".repeat(64) },
      baseIr: { path: "benchmarks/base-ir.json", sha256: "c".repeat(64) },
      taskContract: {
        taskIds: ["env-manager-node-audit-dev-001"],
        promptDigest: "d".repeat(64),
        sha256: "3".repeat(64),
      },
      developmentEvidence: {
        coverageAudit: { path: "results/coverage.json", sha256: "e".repeat(64) },
        replayFreeze: { path: "benchmarks/replay-freeze.json", sha256: "f".repeat(64) },
        replaySummary: { path: "results/replay-summary.json", sha256: "0".repeat(64) },
      },
      learnedRules: [
        {
          ruleId: "server-dsn-sensitive/v1",
          sourceCriterion: "env-schema-rules",
          evidenceSha256: "e".repeat(64),
          status: "candidate",
        },
        {
          ruleId: "signing-key-minimum-length/v1",
          sourceCriterion: "env-schema-rules",
          evidenceSha256: "e".repeat(64),
          status: "candidate",
        },
      ],
      compiler: {
        id: "env-manager-contract-repair-artifact-compiler",
        version: "v4",
        configSha256: "1".repeat(64),
      },
      artifacts,
    };
    const manifest = {
      schemaVersion: "skill-ir-contract-repair-artifact-package-manifest/v1",
      catalog: "executable-contract-repair-artifact/v4",
      skillId: "env-manager",
      provenance: { path: "package-provenance.json", sha256: "2".repeat(64) },
      outputContract: { path: "artifacts/contracts/output-contract.json", sha256: "3".repeat(64) },
      repairRecipe: { path: "artifacts/contracts/repair-recipe.json", sha256: "4".repeat(64) },
      publicPolicy: { path: "artifacts/contracts/public-policy.json", sha256: "5".repeat(64) },
      publicRuntimeContractSchema: {
        path: "artifacts/schemas/public-runtime-contract.schema.json",
        sha256: "6".repeat(64),
      },
      evidenceProgram: { path: "artifacts/scripts/evidence-program.mjs", timeoutMs: 5000 },
      checker: { path: "artifacts/checks/executable-contract-checker.mjs", timeoutMs: 5000 },
      deterministicRepairer: {
        path: "artifacts/scripts/deterministic-repairer.mjs",
        timeoutMs: 5000,
      },
      runtimeContracts: {
        public: { path: ".skvm-artifact/public-runtime-contract.json", protected: true },
        executableRepair: {
          path: ".skvm-artifact/executable-repair-contract.json",
          protected: true,
        },
      },
      generatedOutputs: ["env-report.json", ".env.schema.json", ".env.example"],
      artifacts,
    };
    expect(ContractRepairArtifactPackageManifestSchema.parse(manifest).catalog).toBe(
      "executable-contract-repair-artifact/v4",
    );
    expect(ContractRepairArtifactPackageProvenanceSchema.parse(provenance).learnedRules).toHaveLength(2);
    expect(() => ContractRepairArtifactPackageManifestSchema.parse({
      ...manifest,
      catalog: "executable-public-contract-artifact/v3",
    })).toThrow();

    const lock = {
      schemaVersion: "skill-ir-env-manager-contract-repair-artifact-lock/v1",
      stage: "contract-repair-artifact-development",
      status: "preregistered",
      catalog: "executable-contract-repair-artifact/v4",
      codeCatalog: "public-contract-error-codes/v2",
      corpus: "pilot",
      skillId: "env-manager",
      package: {
        path: "benchmarks/skill-ir/pilots/env-manager/packages/v4",
        manifestSha256: "1".repeat(64),
        provenanceSha256: "2".repeat(64),
      },
      scorer: { path: "src/bench/evaluators/env-manager-grade.ts", sha256: "3".repeat(64) },
      tasks: { path: "benchmarks/skill-ir/pilots/env-manager/tasks.json", sha256: "4".repeat(64) },
      model: { route: "xty/gpt-5.6-sol", family: "openai" },
      adapter: { id: "bare-agent", version: "workspace" },
      matrix: {
        system: "ir-contract-artifact-dev",
        panelConfigId: "env-manager-v4-development-v1",
        contexts: ["clean"],
        agents: ["skvm"],
        environments: ["windows"],
        taskSplit: "development",
        taskIds: ["env-manager-node-audit-dev-001"],
        repetitions: 1,
        initialGenerationRows: 1,
      },
      runtime: {
        stateMachine: [
          "preflight",
          "generation",
          "capture-pre-repair-snapshot",
          "validate",
          "deterministic-repair",
          "revalidate",
          "optional-one-model-repair-for-residual",
          "final-validate",
          "capture-post-repair-snapshot",
          "stop",
        ],
        maxDeterministicRepairCalls: 1,
        maxModelRepairCalls: 1,
        apiKeyEnv: "SKVM_XTY_API_KEY",
        sharedGeneration: true,
      },
      scoring: {
        authority: "existing-deterministic-env-manager-scorer",
        runtimeValidatorIsScorer: false,
        generationDenominator: "preregistered-generation",
        missingPairIsInfrastructure: true,
        deterministicRepairCostReportedSeparately: true,
        modelRepairCostReportedSeparately: true,
        logicalArms: ["check-only", "one-repair"],
      },
      attributionGate: {
        minimumDeterministicRepairAttempts: 1,
        requireSharedGenerationIdentity: true,
        scorerAuthorityUnchanged: true,
      },
      developmentGate: {
        minimumSuccesses: 1,
        minimumMeanScore: 0.85,
        maximumHardGateRegressions: 0,
        maximumInfrastructureFailures: 0,
      },
      prohibited: ["held-out execution before the development gate passes"],
    };
    expect(ContractRepairArtifactDevelopmentLockSchema.parse(lock).scoring.missingPairIsInfrastructure).toBe(true);
    expect(() => ContractRepairArtifactDevelopmentLockSchema.parse({
      ...lock,
      scoring: { ...lock.scoring, missingPairIsInfrastructure: false },
    })).toThrow();
  });
});
