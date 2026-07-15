import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileEnvManagerArtifactPackage } from "./artifact-package-compiler";
import { compileEnvManagerSemanticArtifactPackage } from "./semantic-artifact-compiler";
import { preflightArtifactRun, type ArtifactRunScope, type PreparedArtifactRun } from "./artifact-preflight";
import { executeArtifactValidator, runArtifactStateMachine, type ArtifactCommandResult } from "./artifact-runtime";

const projectRoot = join(import.meta.dir, "../../..");
const baseIrPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json");
const taskSetPath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json");
const sourcePath = join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md");
const tempDirs: string[] = [];

const scope: ArtifactRunScope = {
  skillId: "env-manager",
  taskId: "env-manager-node-audit-dev-001",
  taskSplit: "development",
  model: "local/deterministic",
  modelFamily: "local",
  adapter: "fixture",
  adapterVersion: "semantic-activation-v1",
  environment: "windows",
  context: "clean",
};

async function tempDir(label: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), label));
  tempDirs.push(dir);
  return dir;
}

async function writePublicFixture(workDir: string): Promise<void> {
  await mkdir(join(workDir, "src"), { recursive: true });
  await writeFile(join(workDir, ".env"), "APP_PORT=3000\n", "utf8");
  await writeFile(join(workDir, "src/config.js"), "const port = Number(process.env.APP_PORT);\n", "utf8");
}

async function writeKnownFailure(workDir: string): Promise<void> {
  await writeFile(join(workDir, ".env.example"), "APP_PORT=\n", "utf8");
  await writeFile(join(workDir, ".env.schema.json"), `${JSON.stringify({ variables: {} }, null, 2)}\n`, "utf8");
  await writeFile(join(workDir, "env-report.json"), `${JSON.stringify({
    definedAndUsed: [],
    definedUnconfirmedUnused: [],
    usedUndefined: [],
    hardcodedSecrets: [],
    exposureRisks: [],
  }, null, 2)}\n`, "utf8");
}

async function repairKnownFailure(workDir: string): Promise<void> {
  await writeFile(join(workDir, ".env.schema.json"), `${JSON.stringify({
    variables: { APP_PORT: { type: "integer", minimum: 1, maximum: 65535 } },
  }, null, 2)}\n`, "utf8");
}

function command(label: string): ArtifactCommandResult {
  return { ok: true, exitCode: 0, durationMs: 1, stdout: label, stderr: "" };
}

async function prepareV2(): Promise<PreparedArtifactRun> {
  const root = await tempDir("skill-ir-v2-activation-");
  const packageDir = join(root, "package");
  const workDir = join(root, "workdir");
  await mkdir(workDir, { recursive: true });
  await writePublicFixture(workDir);
  await compileEnvManagerSemanticArtifactPackage({
    rootDir: projectRoot,
    baseIrPath,
    taskSetPath,
    sourcePath,
    outDir: packageDir,
  });
  const provenance = JSON.parse(await readFile(join(packageDir, "package-provenance.json"), "utf8")) as {
    taskContract: { sha256: string };
  };
  return preflightArtifactRun({
    packageDir,
    workDir,
    scope,
    expectedContractDigest: provenance.taskContract.sha256,
  });
}

async function prepareV1(): Promise<PreparedArtifactRun> {
  const root = await tempDir("skill-ir-v1-activation-");
  const packageDir = join(root, "package");
  const workDir = join(root, "workdir");
  await mkdir(workDir, { recursive: true });
  await writePublicFixture(workDir);
  await compileEnvManagerArtifactPackage({
    rootDir: projectRoot,
    baseIrPath,
    repairEvidencePath: join(
      projectRoot,
      "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/repair-evidence.json",
    ),
    taskSetPath,
    sourcePath,
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
  const provenance = JSON.parse(await readFile(join(packageDir, "package-provenance.json"), "utf8")) as {
    taskContract: { sha256: string };
  };
  return preflightArtifactRun({
    packageDir,
    workDir,
    scope,
    expectedContractDigest: provenance.taskContract.sha256,
  });
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("env-manager semantic repair activation", () => {
  test("freezes one v1-pass and v2-repair-eligible known failure", async () => {
    const v1 = await prepareV1();
    const v2 = await prepareV2();
    await writeKnownFailure(v1.workDir);
    await writeKnownFailure(v2.workDir);

    const v1Report = await executeArtifactValidator(v1);
    const v2Report = await executeArtifactValidator(v2);

    expect(v1Report).toMatchObject({ schemaVersion: "runtime-validation-report/v1", status: "pass" });
    expect(v2Report).toMatchObject({
      schemaVersion: "runtime-validation-report/v2",
      status: "fail",
      repairEligible: true,
      errors: [{
        code: "MISSING_OBSERVED_VARIABLE",
        relativePath: ".env.schema.json",
        jsonPointer: "/variables/APP_PORT",
        expectedType: "object",
      }],
    });
  });

  test("repairs the known failure exactly once and passes revalidation", async () => {
    const prepared = await prepareV2();
    let repairs = 0;
    let prompt = "";
    const result = await runArtifactStateMachine({
      mode: "one-repair",
      prepared,
      runGeneration: async () => { await writeKnownFailure(prepared.workDir); return command("generated"); },
      runRepair: async (task) => {
        repairs += 1;
        prompt = task.prompt;
        await repairKnownFailure(prepared.workDir);
        return command("repaired");
      },
    });

    expect(repairs).toBe(1);
    expect(prompt).toContain(".skvm-artifact/semantic-contract.json");
    expect(result).toMatchObject({
      status: "complete",
      repairAttempted: true,
      repairedToPass: true,
      initialValidation: { status: "fail" },
      finalValidation: { status: "pass" },
    });
  });

  test("stops after one no-op repair and the second failed validation", async () => {
    const prepared = await prepareV2();
    let repairs = 0;
    const result = await runArtifactStateMachine({
      mode: "one-repair",
      prepared,
      runGeneration: async () => { await writeKnownFailure(prepared.workDir); return command("generated"); },
      runRepair: async () => { repairs += 1; return command("no-op"); },
    });

    expect(repairs).toBe(1);
    expect(result).toMatchObject({
      status: "semantic-failure",
      failureStage: "revalidation",
      repairAttempted: true,
      repairedToPass: false,
      initialValidation: { status: "fail" },
      finalValidation: { status: "fail" },
    });
  });
});
