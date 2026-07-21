import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEnvManagerExecutableRepairContract } from "./executable-repair-contract";
import { repairEnvManagerArtifactsDeterministically } from "./deterministic-artifact-repairer";
import { validateExecutableContractOutputs } from "./executable-contract-checker";
import { PublicRuntimeContractSchema } from "./public-contract";
import { sha256Bytes } from "./source-fixture";

const roots: string[] = [];
const TASK_DIGEST = "a".repeat(64);
const DEVELOPMENT_DIGEST = "b".repeat(64);
const outputContract = {
  generatedFiles: [".env.example", ".env.schema.json", "env-report.json"],
  reportFields: [
    "definedAndUsed",
    "definedUnconfirmedUnused",
    "usedUndefined",
    "hardcodedSecrets",
    "exposureRisks",
  ],
  schemaRoot: "variables",
  allowedRuleFields: ["type", "required", "minimum", "maximum", "format", "minLength", "sensitive"],
  syntheticSecretPrefix: "TEST_ONLY_",
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "skvm-v4-checker-"));
  roots.push(root);
  await mkdir(join(root, ".skvm-artifact"), { recursive: true });
  await writeFile(join(root, ".env"), "SERVER_SIGNING_KEY=test-only-value\n", "utf8");
  await writeFile(join(root, ".env.example"), "SERVER_SIGNING_KEY=\n", "utf8");
  await writeFile(join(root, ".env.schema.json"), "{\"variables\":{}}\n", "utf8");
  await writeFile(join(root, "env-report.json"), "{}\n", "utf8");
  const runtimeContract = PublicRuntimeContractSchema.parse({
    schemaVersion: "skill-ir-public-runtime-contract/v3",
    codeCatalog: "public-contract-error-codes/v2",
    skillId: "env-manager",
    taskContractDigest: TASK_DIGEST,
    generatedOutputs: outputContract.generatedFiles,
    publicPrefixes: [],
    variables: [{
      name: "SERVER_SIGNING_KEY",
      definitions: [{
        relativePath: ".env",
        symbol: "SERVER_SIGNING_KEY",
        evidenceKind: "dotenv-definition",
      }],
      references: [{
        relativePath: "src/config.ts",
        symbol: "SERVER_SIGNING_KEY",
        evidenceKind: "environment-reference",
      }],
      rules: [{
        field: "sensitive",
        value: true,
        disposition: "confirmed",
        evidenceRefs: [{
          relativePath: "SKILL.md",
          symbol: "SERVER_SIGNING_KEY",
          evidenceKind: "public-skill-rule",
        }],
      }],
    }],
    sourceQualifiedFindings: [],
    limitations: [],
  });
  const runtimeText = `${JSON.stringify(runtimeContract, null, 2)}\n`;
  const runtimeBytes = Buffer.from(runtimeText, "utf8");
  await writeFile(join(root, ".skvm-artifact", "public-runtime-contract.json"), runtimeBytes);
  const repairContract = buildEnvManagerExecutableRepairContract({
    taskContractDigest: TASK_DIGEST,
    runtimeContractSha256: sha256Bytes(runtimeBytes),
    developmentEvidenceSha256: DEVELOPMENT_DIGEST,
  });
  await writeFile(
    join(root, ".skvm-artifact", "executable-repair-contract.json"),
    `${JSON.stringify(repairContract, null, 2)}\n`,
    "utf8",
  );
  await repairEnvManagerArtifactsDeterministically({ workDir: root, repairContract });
  return { root, runtimeBytes, runtimeContract, repairContract };
}

describe("V4 executable contract checker", () => {
  test("passes canonical deterministic outputs and enforces development policy residuals", async () => {
    const data = await fixture();
    const passing = await validateExecutableContractOutputs({
      workDir: data.root,
      outputContract,
      runtimeContractBytes: data.runtimeBytes,
      repairContract: data.repairContract,
      templateSentinel: "__SKVM_REQUIRED__",
    });
    expect(passing.status).toBe("pass");

    const schema = JSON.parse(await readFile(join(data.root, ".env.schema.json"), "utf8"));
    delete schema.variables.SERVER_SIGNING_KEY.minLength;
    await writeFile(join(data.root, ".env.schema.json"), `${JSON.stringify(schema, null, 2)}\n`, "utf8");
    const failing = await validateExecutableContractOutputs({
      workDir: data.root,
      outputContract,
      runtimeContractBytes: data.runtimeBytes,
      repairContract: data.repairContract,
      templateSentinel: "__SKVM_REQUIRED__",
    });
    expect(failing.status).toBe("fail");
    expect(failing.errors).toContainEqual(expect.objectContaining({
      code: "MISSING_SCHEMA_RULE",
      relativePath: ".env.schema.json",
      jsonPointer: "/variables/SERVER_SIGNING_KEY/minLength",
    }));
  });

  test("rejects a repair contract that is not bound to the supplied runtime bytes", async () => {
    const data = await fixture();
    const drifted = { ...data.repairContract, runtimeContractSha256: "c".repeat(64) };
    await expect(validateExecutableContractOutputs({
      workDir: data.root,
      outputContract,
      runtimeContractBytes: data.runtimeBytes,
      repairContract: drifted,
      templateSentinel: "__SKVM_REQUIRED__",
    })).rejects.toThrow("runtime contract digest mismatch");
  });
});
