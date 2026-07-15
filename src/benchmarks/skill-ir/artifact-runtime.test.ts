import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileEnvManagerArtifactPackage } from "./artifact-package-compiler";
import { compileEnvManagerSemanticArtifactPackage } from "./semantic-artifact-compiler";
import { preflightArtifactRun, type PreparedArtifactRun } from "./artifact-preflight";
import {
  buildSanitizedRepairTask,
  executeArtifactValidator,
  runArtifactStateMachine,
  type ArtifactCommandResult,
} from "./artifact-runtime";
import type { RuntimeValidationReport } from "./artifact-package";
import type { RuntimeSemanticValidationReport } from "./semantic-contract";

const projectRoot = join(import.meta.dir, "../../..");
const tempDirs: string[] = [];
let prepared: PreparedArtifactRun;

const passReport: RuntimeValidationReport = {
  schemaVersion: "runtime-validation-report/v1",
  status: "pass",
  repairEligible: false,
  errors: [],
};
const failReport: RuntimeValidationReport = {
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
};
const semanticPassReport: RuntimeSemanticValidationReport = {
  schemaVersion: "runtime-validation-report/v2",
  codeCatalog: "semantic-error-codes/v1",
  status: "pass",
  repairEligible: false,
  errors: [],
};
const semanticFailReport: RuntimeSemanticValidationReport = {
  schemaVersion: "runtime-validation-report/v2",
  codeCatalog: "semantic-error-codes/v1",
  status: "fail",
  repairEligible: true,
  errors: [{
    code: "MISSING_RULE_CONSTRAINT",
    relativePath: ".env.schema.json",
    jsonPointer: "/variables/APP_PORT/minimum",
    missingField: "minimum",
    expectedType: "number",
  }],
};

function commandResult(label: string, inputTokens: number, outputTokens: number): ArtifactCommandResult {
  return {
    ok: true,
    exitCode: 0,
    durationMs: inputTokens + outputTokens,
    stdout: `Tokens: in=${inputTokens} out=${outputTokens}\nFinal output:\n${label}`,
    stderr: "",
    usage: { inputTokens, outputTokens, tokenCost: inputTokens + outputTokens },
  };
}

async function tempDir(label: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), label));
  tempDirs.push(dir);
  return dir;
}

async function prepareSemantic(): Promise<PreparedArtifactRun> {
  const root = await tempDir("skill-ir-semantic-runtime-");
  const packageDir = join(root, "package");
  const workDir = join(root, "workdir");
  await mkdir(join(workDir, "src"), { recursive: true });
  await writeFile(join(workDir, ".env"), "APP_PORT=3000\n", "utf8");
  await writeFile(join(workDir, "src/config.js"), "const port = Number(process.env.APP_PORT);\n", "utf8");
  await compileEnvManagerSemanticArtifactPackage({
    rootDir: projectRoot,
    baseIrPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json"),
    taskSetPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json"),
    sourcePath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
    outDir: packageDir,
  });
  const provenance = JSON.parse(await readFile(join(packageDir, "package-provenance.json"), "utf8")) as {
    taskContract: { sha256: string };
  };
  return preflightArtifactRun({
    packageDir,
    workDir,
    scope: {
      skillId: "env-manager",
      taskId: "env-manager-node-audit-dev-001",
      taskSplit: "development",
      model: "test/model",
      modelFamily: "test",
      adapter: "bare-agent",
      adapterVersion: "semantic-v2-test",
      environment: "windows",
      context: "clean",
    },
    expectedContractDigest: provenance.taskContract.sha256,
  });
}

beforeEach(async () => {
  const root = await tempDir("skill-ir-runtime-");
  const packageDir = join(root, "package");
  const workDir = join(root, "workdir");
  await mkdir(workDir, { recursive: true });
  await writeFile(join(workDir, "fixture.txt"), "protected fixture\n", "utf8");
  await compileEnvManagerArtifactPackage({
    rootDir: projectRoot,
    baseIrPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/base-ir.json"),
    repairEvidencePath: join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/repair-evidence.json"),
    taskSetPath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/tasks.json"),
    sourcePath: join(projectRoot, "benchmarks/skill-ir/pilots/env-manager/source/SKILL.md"),
    predecessorPaths: [
      join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v1-2026-07-16/provenance.json"),
      join(projectRoot, "results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/provenance.json"),
    ],
    outDir: packageDir,
    scope: {
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-executable-artifact-v1",
      environment: "windows",
      context: "clean",
    },
  });
  const provenance = JSON.parse(await readFile(join(packageDir, "package-provenance.json"), "utf8")) as {
    taskContract: { sha256: string };
  };
  prepared = await preflightArtifactRun({
    packageDir,
    workDir,
    scope: {
      skillId: "env-manager",
      taskId: "env-manager-node-audit-dev-001",
      taskSplit: "development",
      model: "xty/gpt-4.1-mini",
      modelFamily: "gpt",
      adapter: "bare-agent",
      adapterVersion: "workspace-executable-artifact-v1",
      environment: "windows",
      context: "clean",
    },
    expectedContractDigest: provenance.taskContract.sha256,
  });
});

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("artifact runtime", () => {
  test("stops after generation when initial validation passes", async () => {
    let repairs = 0;
    const result = await runArtifactStateMachine({
      mode: "one-repair",
      prepared,
      runGeneration: async () => commandResult("generated", 10, 5),
      runRepair: async () => {
        repairs += 1;
        return commandResult("repaired", 7, 3);
      },
      runValidator: async () => passReport,
    });
    expect(repairs).toBe(0);
    expect(result).toMatchObject({
      status: "complete",
      repairAttempted: false,
      repairedToPass: false,
      initialValidation: { status: "pass" },
      finalValidation: { status: "pass" },
      aggregateUsage: { inputTokens: 10, outputTokens: 5, tokenCost: 15, modelDurationMs: 15 },
    });
  });

  test("check-only records an eligible failure without calling repair", async () => {
    let repairs = 0;
    const result = await runArtifactStateMachine({
      mode: "check-only",
      prepared,
      runGeneration: async () => commandResult("generated", 10, 5),
      runRepair: async () => {
        repairs += 1;
        return commandResult("repaired", 7, 3);
      },
      runValidator: async () => failReport,
    });
    expect(repairs).toBe(0);
    expect(result).toMatchObject({
      status: "semantic-failure",
      repairAttempted: false,
      initialValidation: { status: "fail" },
      finalValidation: { status: "fail" },
    });
    expect(result.repairUsage).toBeUndefined();
  });

  test("performs exactly one repair and one revalidation", async () => {
    let repairs = 0;
    let validations = 0;
    let repairPrompt = "";
    const result = await runArtifactStateMachine({
      mode: "one-repair",
      prepared,
      runGeneration: async () => commandResult("generated", 10, 5),
      runRepair: async (task) => {
        repairs += 1;
        repairPrompt = task.prompt;
        return commandResult("repaired", 7, 3);
      },
      runValidator: async () => (++validations === 1 ? failReport : passReport),
    });
    expect(repairs).toBe(1);
    expect(validations).toBe(2);
    expect(result).toMatchObject({
      status: "complete",
      repairAttempted: true,
      repairedToPass: true,
      generationUsage: { inputTokens: 10, outputTokens: 5, tokenCost: 15 },
      repairUsage: { inputTokens: 7, outputTokens: 3, tokenCost: 10 },
      aggregateUsage: { inputTokens: 17, outputTokens: 8, tokenCost: 25, modelDurationMs: 25 },
    });
    expect(repairPrompt).toContain('"code":"MISSING_FIELD"');
  });

  test("stops after the second validation failure without a third call", async () => {
    let repairs = 0;
    let validations = 0;
    const result = await runArtifactStateMachine({
      mode: "one-repair",
      prepared,
      runGeneration: async () => commandResult("generated", 4, 2),
      runRepair: async () => {
        repairs += 1;
        return commandResult("still invalid", 3, 1);
      },
      runValidator: async () => {
        validations += 1;
        return failReport;
      },
    });
    expect(repairs).toBe(1);
    expect(validations).toBe(2);
    expect(result.status).toBe("semantic-failure");
    expect(result.repairedToPass).toBe(false);
  });

  test("never repairs provider, validator, or protected-file failures", async () => {
    let repairs = 0;
    const runRepair = async () => {
      repairs += 1;
      return commandResult("repair", 1, 1);
    };
    const provider = await runArtifactStateMachine({
      mode: "one-repair",
      prepared,
      runGeneration: async () => ({
        ok: false,
        failureType: "infrastructure",
        exitCode: 1,
        durationMs: 5,
        stdout: "",
        stderr: "provider unavailable",
      }),
      runRepair,
      runValidator: async () => passReport,
    });
    expect(provider.status).toBe("infrastructure-failure");

    const validator = await runArtifactStateMachine({
      mode: "one-repair",
      prepared,
      runGeneration: async () => commandResult("generated", 1, 1),
      runRepair,
      runValidator: async () => {
        throw new Error("checker crashed");
      },
    });
    expect(validator.status).toBe("infrastructure-failure");

    await writeFile(join(prepared.workDir, "fixture.txt"), "mutated\n", "utf8");
    const protectedFailure = await runArtifactStateMachine({
      mode: "one-repair",
      prepared,
      runGeneration: async () => commandResult("generated", 1, 1),
      runRepair,
      runValidator: async () => failReport,
    });
    expect(protectedFailure.status).toBe("protected-file-failure");
    expect(protectedFailure.finalValidation?.errors).toEqual([
      { code: "PROTECTED_FILE_MUTATED", relativePath: "fixture.txt" },
    ]);
    expect(repairs).toBe(0);
  });

  test("builds a minimal repair task from the strict report projection", () => {
    const task = buildSanitizedRepairTask(failReport);
    expect(task).toMatchObject({
      gradingType: "llm_judge",
      eval: [],
    });
    expect("fixtures" in task).toBe(false);
    const serialized = JSON.stringify(task);
    expect(task.prompt).toContain('"code":"MISSING_FIELD"');
    for (const forbidden of [
      "TEST_ONLY_SECRET_VALUE",
      "C:\\",
      '"payload"',
      '"hardGateIds"',
      '"actual"',
      '"message"',
      '"fixtures"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(() => buildSanitizedRepairTask({
      ...failReport,
      errors: [{ ...failReport.errors[0], relativePath: "C:\\secret.txt" }],
    } as RuntimeValidationReport)).toThrow();
  });

  test("executes the emitted standalone validator and parses its closed report", async () => {
    const initial = await executeArtifactValidator(prepared);
    expect(initial).toMatchObject({ status: "fail", repairEligible: true });
    expect(initial.errors.map((error) => error.code)).toContain("MISSING_FILE");

    await writeFile(join(prepared.workDir, ".env.example"), "PORT=3000\n", "utf8");
    await writeFile(join(prepared.workDir, ".env.schema.json"), JSON.stringify({
      variables: { PORT: { type: "integer", required: true } },
    }), "utf8");
    await writeFile(join(prepared.workDir, "env-report.json"), JSON.stringify({
      definedAndUsed: ["PORT"],
      definedUnconfirmedUnused: [],
      usedUndefined: [],
      hardcodedSecrets: [],
      exposureRisks: [],
    }), "utf8");
    const valid = await executeArtifactValidator(prepared);
    expect(valid).toEqual(passReport);
  });

  test("dispatches v2 checker output through the strict semantic report schema", async () => {
    const semanticPrepared = await prepareSemantic();
    const report = await executeArtifactValidator(semanticPrepared);
    expect(report.schemaVersion).toBe("runtime-validation-report/v2");
    expect(report).toMatchObject({ codeCatalog: "semantic-error-codes/v1", status: "fail" });

    let repairs = 0;
    const invalid = await runArtifactStateMachine({
      mode: "one-repair",
      prepared: semanticPrepared,
      runGeneration: async () => commandResult("generated", 1, 1),
      runRepair: async () => { repairs += 1; return commandResult("repair", 1, 1); },
      runValidator: async () => ({
        ...semanticFailReport,
        classificationCandidates: [{ disposition: "B_DISPOSITION_CANARY" }],
      } as RuntimeSemanticValidationReport),
    });
    expect(invalid.status).toBe("infrastructure-failure");
    expect(invalid.failureStage).toBe("validation");
    expect(repairs).toBe(0);
  });

  test("builds v2 repair input from five fields plus only the static protected path", async () => {
    const semanticPrepared = await prepareSemantic();
    const task = buildSanitizedRepairTask(semanticFailReport, semanticPrepared);
    expect(task.prompt).toContain(".skvm-artifact/semantic-contract.json");
    expect(task.prompt).toContain('"code":"MISSING_RULE_CONSTRAINT"');
    for (const forbidden of [
      "B_DISPOSITION_CANARY",
      "classificationCandidates",
      "sourceQualifiedFindings",
      "observedVariables",
      "TEST_ONLY_",
      '"actual"',
      '"message"',
    ]) {
      expect(task.prompt).not.toContain(forbidden);
    }
  });

  test("keeps v2 bounded to one repair and one revalidation", async () => {
    const semanticPrepared = await prepareSemantic();
    let repairs = 0;
    let validations = 0;
    let repairPrompt = "";
    const result = await runArtifactStateMachine({
      mode: "one-repair",
      prepared: semanticPrepared,
      runGeneration: async () => commandResult("generated", 5, 2),
      runRepair: async (task) => {
        repairs += 1;
        repairPrompt = task.prompt;
        return commandResult("repaired", 3, 1);
      },
      runValidator: async () => (++validations === 1 ? semanticFailReport : semanticPassReport),
    });
    expect(repairs).toBe(1);
    expect(validations).toBe(2);
    expect(repairPrompt).toContain(".skvm-artifact/semantic-contract.json");
    expect(result).toMatchObject({
      status: "complete",
      repairAttempted: true,
      repairedToPass: true,
      initialValidation: { schemaVersion: "runtime-validation-report/v2" },
      finalValidation: { schemaVersion: "runtime-validation-report/v2", status: "pass" },
      aggregateUsage: { inputTokens: 8, outputTokens: 3, tokenCost: 11, modelDurationMs: 11 },
    });
  });
});
