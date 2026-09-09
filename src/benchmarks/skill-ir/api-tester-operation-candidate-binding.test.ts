import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  API_TESTER_OPERATION_CANDIDATE_BINDING_IDENTITY,
  API_TESTER_OPERATION_CANDIDATE_BINDING_PATH,
  ApiTesterOperationCandidateBindingSchema,
  auditLocalRuntimeImports,
  buildApiTesterOperationCandidateBinding,
  verifyApiTesterOperationCandidateBindingAgainstLiveTree,
  verifyLocalRuntimeImportAudit,
} from "./api-tester-operation-candidate-binding";
import { parseApiTesterOperationCandidateBindingArgs } from "./api-tester-operation-candidate-binding-run";

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("API Tester operation candidate runtime binding", () => {
  test("discovers the complete local runtime closure and separates type-only, built-in, and third-party imports", async () => {
    const audit = await auditLocalRuntimeImports({
      rootDir: process.cwd(),
      entryPaths: ["src/skill-ir/api-tester-operation-input-run.ts"],
    });
    const runtimePaths = audit.localRuntimeModules.map((module) => module.path);

    expect(runtimePaths).toContain("src/skill-ir/api-tester-production-contract.ts");
    expect(runtimePaths).toContain("src/benchmarks/skill-ir/source-fixture.ts");
    expect(runtimePaths).not.toContain("src/skill-ir/schema.ts");
    expect(audit.typeOnlyLocalImports).toContainEqual({
      importer: "src/benchmarks/skill-ir/source-fixture.ts",
      path: "src/skill-ir/schema.ts",
    });
    expect(audit.builtinModules).toEqual(expect.arrayContaining([
      "node:crypto",
      "node:fs/promises",
      "node:os",
      "node:path",
    ]));
    expect(audit.thirdPartyPackages).toEqual(["yaml", "zod"]);
    expect(audit.unresolvedImports).toEqual([]);
  });

  test("rejects a missing bound runtime module before any input execution", async () => {
    const binding = await buildApiTesterOperationCandidateBinding({
      rootDir: process.cwd(),
      frozenAt: "2026-09-10T01:00:00.000Z",
      executionCommit: "a".repeat(40),
      bunVersion: Bun.version,
      nodeVersion: "v23.8.0",
    });
    const missing = structuredClone(binding);
    missing.productionDependencies.localRuntimeModules = missing.productionDependencies.localRuntimeModules.filter(
      (module) => module.path !== "src/benchmarks/skill-ir/source-fixture.ts",
    );

    await expect(verifyApiTesterOperationCandidateBindingAgainstLiveTree({
      rootDir: process.cwd(),
      binding: missing,
      bunVersion: Bun.version,
      nodeVersion: "v23.8.0",
    })).rejects.toThrow(/runtime closure mismatch/u);
  });

  test("rejects dependency byte drift against a previously built import audit", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "skvm-api-runtime-audit-"));
    temporaryDirectories.push(rootDir);
    await mkdir(join(rootDir, "src"));
    await writeFile(join(rootDir, "src/entry.ts"), "import { value } from './dependency';\nexport { value };\n", "utf8");
    await writeFile(join(rootDir, "src/dependency.ts"), "export const value = 1;\n", "utf8");
    const audit = await auditLocalRuntimeImports({ rootDir, entryPaths: ["src/entry.ts"] });
    await writeFile(join(rootDir, "src/dependency.ts"), "export const value = 2;\n", "utf8");

    await expect(verifyLocalRuntimeImportAudit({ rootDir, audit })).rejects.toThrow(/runtime dependency digest mismatch/u);
  });

  test("builds an additive binding while preserving candidate-001 and zero prospective state", async () => {
    const candidate001Before = await readFile(
      join(process.cwd(), "benchmarks/skill-ir/classification/api-tester-operation-candidate-v1.json"),
    );
    const binding = await buildApiTesterOperationCandidateBinding({
      rootDir: process.cwd(),
      frozenAt: "2026-09-10T01:00:00.000Z",
      executionCommit: "a".repeat(40),
      bunVersion: Bun.version,
      nodeVersion: "v23.8.0",
    });

    expect(ApiTesterOperationCandidateBindingSchema.parse(binding)).toMatchObject({
      identity: API_TESTER_OPERATION_CANDIDATE_BINDING_IDENTITY,
      supportContractId: "api-tester-openapi-subset-v2",
      parentCandidate: {
        path: "benchmarks/skill-ir/classification/api-tester-operation-candidate-v1.json",
        identity: "skill-ir-api-tester-operation-candidate-001",
      },
      changes: {
        supportContract: false,
        operationAlgorithm: false,
        candidate001: false,
        dependencyBindingOnly: true,
      },
      prospective: {
        inputSelection: "not-started",
        predictions: "not-authored",
        prospectiveRuns: 0,
      },
    });
    expect(binding.addedRuntimeDependencies.map((dependency) => dependency.path)).toEqual([
      "src/benchmarks/skill-ir/source-fixture.ts",
      "src/skill-ir/api-tester-production-contract.ts",
    ]);
    expect(await readFile(
      join(process.cwd(), "benchmarks/skill-ir/classification/api-tester-operation-candidate-v1.json"),
    )).toEqual(candidate001Before);
  });

  test("parses create and verify commands without exposing an input argument", () => {
    expect(API_TESTER_OPERATION_CANDIDATE_BINDING_PATH).toBe(
      "benchmarks/skill-ir/classification/api-tester-operation-candidate-binding-v1.json",
    );
    expect(parseApiTesterOperationCandidateBindingArgs([
      "--mode=create",
      "--root=repo",
      "--node=node",
      "--git=git",
      `--execution-commit=${"a".repeat(40)}`,
      "--frozen-at=2026-09-10T01:00:00.000Z",
    ])).toMatchObject({ mode: "create", rootDir: "repo", nodeExecutable: "node", gitExecutable: "git" });
    expect(parseApiTesterOperationCandidateBindingArgs([
      "--mode=verify",
      "--root=repo",
      "--node=node",
      "--git=git",
      "--binding=benchmarks/binding.json",
    ])).toEqual({
      mode: "verify",
      rootDir: "repo",
      nodeExecutable: "node",
      gitExecutable: "git",
      bindingPath: "benchmarks/binding.json",
    });
    expect(() => parseApiTesterOperationCandidateBindingArgs([
      "--mode=verify",
      "--root=repo",
      "--node=node",
      "--git=git",
      "--binding=benchmarks/binding.json",
      "--input=unseen.json",
    ])).toThrow(/invalid or duplicate argument/u);
  });
});
