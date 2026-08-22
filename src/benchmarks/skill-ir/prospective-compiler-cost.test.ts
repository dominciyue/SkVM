import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { assembleValidatedArtifactPackage } from "./validated-artifact-assembly";
import {
  buildCompilerCostEnvironmentIdentity,
  captureProspectiveCompilerCost,
  ProspectiveCompilerCostIdentitySchema,
  type ProspectiveCompilerCostIdentity,
} from "./prospective-compiler-cost";

const repositoryRoot = path.resolve(import.meta.dir, "../../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function evidenceRef(rootDir: string, relativePath: string) {
  return { relativePath, sha256: sha256(await readFile(path.join(rootDir, relativePath))) };
}

const zeroUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

async function createFixtureIdentity(
  constructionOrigin: "automatic-prospective" | "manual-existing",
): Promise<{ rootDir: string; identity: ProspectiveCompilerCostIdentity }> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "skvm-prospective-cost-test-"));
  temporaryDirectories.push(rootDir);
  const paths = [
    "source/SKILL.md",
    "tasks.json",
    "public-contract.json",
    "resource-contract.json",
    "base-ir.json",
    "source-audit.json",
    "adapter.json",
    "compiler.ts",
    "catalog.ts",
    "runtime.ts",
  ];
  for (const relativePath of paths) {
    const target = path.join(rootDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await Bun.write(target, `${relativePath}\n`);
  }
  return {
    rootDir,
    identity: {
      schemaVersion: "skill-ir-prospective-compiler-cost/v1",
      experimentId: `fixture-${constructionOrigin}`,
      skillId: "fixture-auto",
      constructionOrigin,
      unautomatedConstructionSteps: constructionOrigin === "manual-existing" ? ["compiler design"] : [],
      evidence: {
        sourceClosure: [await evidenceRef(rootDir, "source/SKILL.md")],
        taskContract: await evidenceRef(rootDir, "tasks.json"),
        publicContract: await evidenceRef(rootDir, "public-contract.json"),
        resourceContract: await evidenceRef(rootDir, "resource-contract.json"),
        baseIr: await evidenceRef(rootDir, "base-ir.json"),
        sourceAudit: await evidenceRef(rootDir, "source-audit.json"),
        adapter: await evidenceRef(rootDir, "adapter.json"),
        compilerImplementation: await evidenceRef(rootDir, "compiler.ts"),
        catalogRuntime: [
          await evidenceRef(rootDir, "catalog.ts"),
          await evidenceRef(rootDir, "runtime.ts"),
        ],
      },
      environment: buildCompilerCostEnvironmentIdentity({
        runtime: "bun",
        runtimeVersion: Bun.version,
        platform: process.platform,
        architecture: process.arch,
      }),
    },
  };
}

async function assembleFixturePackage(
  packageDir: string,
  identity: ProspectiveCompilerCostIdentity,
) {
  const script = "process.stdout.write('{}\\n');\n";
  return assembleValidatedArtifactPackage({
    adapter: {
      schemaVersion: "validated-artifact-assembly-adapter/v1",
      catalog: "validated-skill-artifact/v1",
      skillId: "fixture-auto",
      adapterId: "fixture-auto-adapter",
      version: "v1",
      compiler: { id: "fixture-auto-compiler", version: "v1", configSha256: "f".repeat(64) },
      protectedInputs: ["input.txt"],
      generatedOutputs: ["output.txt"],
      executionPlan: {
        schemaVersion: "skill-artifact-execution-plan/v1",
        entrypoint: "validate-fixture",
        nodes: [
          {
            id: "generate-fixture",
            kind: "process",
            dependsOn: [],
            command: {
              interpreter: { env: "SKVM_NODE", fallback: "node" },
              artifactId: "fixture-script",
              args: [],
              envAllowlist: ["SKVM_NODE"],
            },
            timeoutMs: 1_000,
          },
          {
            id: "validate-fixture",
            kind: "validate",
            dependsOn: ["generate-fixture"],
            command: {
              interpreter: { env: "SKVM_NODE", fallback: "node" },
              artifactId: "fixture-check",
              args: [],
              envAllowlist: ["SKVM_NODE"],
            },
            timeoutMs: 1_000,
          },
        ],
      },
      artifactLayout: [
        { id: "skill-ir", path: "skill-ir.json", kind: "skill-ir" },
        { id: "skill-view", path: "skill.md", kind: "skill-view" },
        { id: "fixture-script", path: "artifacts/scripts/generate.mjs", kind: "script" },
        { id: "fixture-check", path: "artifacts/checks/validate.mjs", kind: "check" },
      ],
    },
    provenanceInputs: {
      sourceClosure: identity.evidence.sourceClosure.map((item) => ({
        path: item.relativePath,
        sha256: item.sha256,
      })),
      baseIr: {
        path: identity.evidence.baseIr.relativePath,
        sha256: identity.evidence.baseIr.sha256,
      },
      sourceAudit: {
        path: identity.evidence.sourceAudit.relativePath,
        sha256: identity.evidence.sourceAudit.sha256,
      },
      resourceContract: {
        path: identity.evidence.resourceContract.relativePath,
        sha256: identity.evidence.resourceContract.sha256,
      },
      taskContract: { taskIds: ["fixture-dev-1"], promptDigest: "e".repeat(64) },
    },
    artifactPayloads: [
      { id: "skill-ir", bytes: "{}\n" },
      { id: "skill-view", bytes: "# Fixture\n" },
      { id: "fixture-script", bytes: script },
      { id: "fixture-check", bytes: script },
    ],
  }, packageDir);
}

describe("prospective optimizer/compiler cost capture", () => {
  test("requires task, public, and resource contracts in the construction identity", async () => {
    const { identity } = await createFixtureIdentity("manual-existing");
    const incomplete = structuredClone(identity) as Record<string, unknown>;
    const evidence = incomplete.evidence as Record<string, unknown>;
    delete evidence.taskContract;
    delete evidence.publicContract;
    delete evidence.resourceContract;
    expect(() => ProspectiveCompilerCostIdentitySchema.parse(incomplete)).toThrow();
  });

  test("rejects absolute and duplicate evidence paths", async () => {
    const { identity } = await createFixtureIdentity("manual-existing");
    const absolute = structuredClone(identity);
    absolute.evidence.adapter.relativePath = "D:/private/adapter.json";
    expect(() => ProspectiveCompilerCostIdentitySchema.parse(absolute)).toThrow();

    const duplicate = structuredClone(identity);
    duplicate.evidence.catalogRuntime[0] = duplicate.evidence.adapter;
    expect(() => ProspectiveCompilerCostIdentitySchema.parse(duplicate)).toThrow("duplicate cost evidence path");
  });

  test("captures staged automatic construction and validates package identity", async () => {
    const { rootDir, identity } = await createFixtureIdentity("automatic-prospective");
    const report = await captureProspectiveCompilerCost({ rootDir, identity }, async (context) => {
      await context.measureStage("optimizer", async () => ({ value: undefined, modelCalls: 0, usage: zeroUsage }));
      await context.measureStage("compiler", async () => ({ value: undefined, modelCalls: 0, usage: zeroUsage }));
      const packageDir = path.join(context.outRoot, "fixture");
      await context.measureStage("package", async () => ({
        value: await assembleFixturePackage(packageDir, identity),
        modelCalls: 0,
        usage: zeroUsage,
      }));
      return { packages: [{ id: "fixture", directory: packageDir }] };
    });

    expect(report.identity.constructionOrigin).toBe("automatic-prospective");
    expect(report.stages.map((stage) => stage.id)).toEqual(["optimizer", "compiler", "package"]);
    expect(report.packages).toHaveLength(1);
    expect(report.packages[0]).toMatchObject({ id: "fixture", skillId: "fixture-auto", validation: "passed" });
    expect(report.summary).toMatchObject({ modelCalls: 0, aggregateModelTokens: 0, packageCount: 1 });
    expect(report.eligibility).toEqual({ status: "eligible", reasons: [] });
  });

  test("keeps an existing hand-written compiler mechanism-only even when the observed run uses zero model tokens", async () => {
    const { rootDir, identity } = await createFixtureIdentity("manual-existing");
    const report = await captureProspectiveCompilerCost({ rootDir, identity }, async (context) => {
      const packageDir = path.join(context.outRoot, "fixture");
      await context.measureStage("compiler-package", async () => ({
        value: await assembleFixturePackage(packageDir, identity),
        modelCalls: 0,
        usage: zeroUsage,
      }));
      return { packages: [{ id: "fixture", directory: packageDir }] };
    });

    expect(report.summary.aggregateModelTokens).toBe(0);
    expect(report.eligibility.status).toBe("mechanism-only");
    expect(report.eligibility.reasons).toContain("compiler construction origin is manual-existing");
    expect(report.eligibility.reasons).toContain("unautomated construction steps remain");
  });

  test("rejects a claimed model call whose token usage is entirely zero", async () => {
    const { rootDir, identity } = await createFixtureIdentity("automatic-prospective");
    await expect(captureProspectiveCompilerCost({ rootDir, identity }, async (context) => {
      await context.measureStage("optimizer", async () => ({ value: undefined, modelCalls: 1, usage: zeroUsage }));
      throw new Error("must not reach package generation");
    })).rejects.toThrow("positive model calls require non-zero model usage");
  });

  test("fails before invoking the compiler when bound evidence drifts", async () => {
    const { rootDir, identity } = await createFixtureIdentity("manual-existing");
    identity.evidence.compilerImplementation.sha256 = "0".repeat(64);
    let invoked = false;

    await expect(captureProspectiveCompilerCost({ rootDir, identity }, async () => {
      invoked = true;
      throw new Error("must not run");
    })).rejects.toThrow("evidence digest mismatch");
    expect(invoked).toBe(false);
  });

  test("does not emit a successful report when the compiler callback fails", async () => {
    const { rootDir, identity } = await createFixtureIdentity("manual-existing");
    await expect(captureProspectiveCompilerCost({ rootDir, identity }, async (context) => {
      await context.measureStage("compiler-package", async () => {
        throw new Error("compiler failed");
      });
      return { packages: [] };
    })).rejects.toThrow("compiler failed");
  });

  test("environment identity digest is stable and does not expose an absolute path", () => {
    const environment = buildCompilerCostEnvironmentIdentity({
      runtime: "bun",
      runtimeVersion: "1.2.3",
      platform: "win32",
      architecture: "x64",
    });
    expect(environment.identitySha256).toBe(sha256(JSON.stringify({
      runtime: "bun",
      runtimeVersion: "1.2.3",
      platform: "win32",
      architecture: "x64",
    })));
    expect(JSON.stringify(environment)).not.toContain(repositoryRoot);
  });
});
