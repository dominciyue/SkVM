import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { preflightArtifactRun, type ArtifactRunScope } from "./artifact-preflight";
import { executeArtifactValidator, runArtifactStateMachine, type ArtifactCommandResult } from "./artifact-runtime";
import { verifyArtifactSnapshot } from "./artifact-snapshot";
import { compileEnvManagerPublicContractArtifactPackage } from "./public-contract-artifact-compiler";

const projectRoot = join(import.meta.dir, "../../..");
const tempDirs: string[] = [];
const scope: ArtifactRunScope = {
  skillId: "env-manager",
  taskId: "env-manager-node-audit-dev-001",
  taskSplit: "development",
  model: "local/deterministic",
  modelFamily: "local",
  adapter: "fixture",
  adapterVersion: "public-contract-activation-v1",
  environment: "windows",
  context: "clean",
};

async function tempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "skill-ir-v3-activation-"));
  tempDirs.push(root);
  return root;
}

async function prepare() {
  const root = await tempDir();
  const packageDir = join(root, "package");
  const workDir = join(root, "workdir");
  await mkdir(join(workDir, "src"), { recursive: true });
  await writeFile(join(workDir, ".env"), "APP_PORT=3000\n", "utf8");
  await writeFile(join(workDir, "src/config.js"), "const port = Number(process.env.APP_PORT);\n", "utf8");
  await compileEnvManagerPublicContractArtifactPackage({
    rootDir: projectRoot,
    baseIrPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json"),
    taskSetPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json"),
    sourcePath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
    outDir: packageDir,
  });
  const provenance = JSON.parse(await readFile(join(packageDir, "package-provenance.json"), "utf8")) as {
    taskContract: { sha256: string };
  };
  const prepared = await preflightArtifactRun({
    packageDir,
    workDir,
    scope,
    expectedContractDigest: provenance.taskContract.sha256,
  });
  return { root, prepared };
}

async function writeKnownFailure(workDir: string): Promise<void> {
  await writeFile(join(workDir, ".env.example"), "APP_PORT=\n", "utf8");
  await writeFile(join(workDir, ".env.schema.json"), '{"variables":{}}\n', "utf8");
  await writeFile(join(workDir, "env-report.json"), JSON.stringify({
    definedAndUsed: [],
    definedUnconfirmedUnused: [],
    usedUndefined: [],
    hardcodedSecrets: [],
    exposureRisks: [],
  }), "utf8");
}

async function repairKnownFailure(workDir: string): Promise<void> {
  await writeFile(join(workDir, ".env.schema.json"), JSON.stringify({
    variables: { APP_PORT: { type: "integer", required: true, minimum: 1, maximum: 65535 } },
  }), "utf8");
  await writeFile(join(workDir, "env-report.json"), JSON.stringify({
    definedAndUsed: ["APP_PORT"],
    definedUnconfirmedUnused: [],
    usedUndefined: [],
    hardcodedSecrets: [],
    exposureRisks: [],
  }), "utf8");
}

function command(label: string): ArtifactCommandResult {
  return { ok: true, exitCode: 0, durationMs: 1, stdout: label, stderr: "" };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("env-manager public-contract repair activation", () => {
  test("dispatches a contract-bound V3 known failure", async () => {
    const { prepared } = await prepare();
    await writeKnownFailure(prepared.workDir);

    const report = await executeArtifactValidator(prepared);

    expect(report).toMatchObject({
      schemaVersion: "runtime-validation-report/v3",
      codeCatalog: "public-contract-error-codes/v2",
      status: "fail",
      repairEligible: true,
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_CLASSIFICATION_ENTRY",
          contractRef: "variables/APP_PORT/classification",
          operation: "set-report-entry",
        }),
        expect.objectContaining({
          code: "MISSING_SCHEMA_RULE",
          contractRef: "variables/APP_PORT/rules/required",
          operation: "set-schema-rule",
        }),
      ]),
    });
  });

  test("uses one sanitized repair and reaches V3 pass with shared snapshots", async () => {
    const { root, prepared } = await prepare();
    let repairPrompt = "";
    const result = await runArtifactStateMachine({
      mode: "one-repair",
      prepared,
      snapshot: { snapshotRoot: join(root, "snapshots"), generationIdentity: "e".repeat(64) },
      runGeneration: async () => { await writeKnownFailure(prepared.workDir); return command("generated"); },
      runRepair: async (task) => {
        repairPrompt = task.prompt;
        await repairKnownFailure(prepared.workDir);
        return command("repaired");
      },
    });

    expect(result).toMatchObject({
      status: "complete",
      repairAttempted: true,
      repairedToPass: true,
      initialValidation: { schemaVersion: "runtime-validation-report/v3", status: "fail" },
      finalValidation: { schemaVersion: "runtime-validation-report/v3", status: "pass" },
      preRepairSnapshot: { phase: "pre-repair" },
      postRepairSnapshot: { phase: "post-repair" },
    });
    expect(repairPrompt).toContain(".skvm-artifact/public-runtime-contract.json");
    expect(repairPrompt).toContain('"contractRef":"variables/APP_PORT/classification"');
    expect(repairPrompt).toContain('"operation":"set-report-entry"');
    expect(repairPrompt).not.toContain('"expected"');
    await expect(verifyArtifactSnapshot(result.preRepairSnapshot!)).resolves.toBeDefined();
    await expect(verifyArtifactSnapshot(result.postRepairSnapshot!)).resolves.toBeDefined();
    expect(dirname(result.preRepairSnapshot!.path)).toBe(dirname(result.postRepairSnapshot!.path));
  });
});
