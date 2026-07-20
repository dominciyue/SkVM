import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PublicRuntimeContract } from "./public-contract";
import { validatePublicContractOutputs } from "./public-contract-checker";

const tempDirs: string[] = [];

const contract: PublicRuntimeContract = {
  schemaVersion: "skill-ir-public-runtime-contract/v3",
  codeCatalog: "public-contract-error-codes/v2",
  skillId: "env-manager",
  taskContractDigest: "a".repeat(64),
  generatedOutputs: [".env.example", ".env.schema.json", "env-report.json"],
  publicPrefixes: ["VITE_"],
  variables: [
    {
      name: "APP_PORT",
      definitions: [{ relativePath: ".env", symbol: "APP_PORT", evidenceKind: "dotenv-definition" }],
      references: [{
        relativePath: "src/config.ts",
        symbol: "APP_PORT",
        evidenceKind: "environment-reference",
      }],
      rules: [
        {
          field: "required",
          value: true,
          disposition: "confirmed",
          evidenceRefs: [{
            relativePath: "src/config.ts",
            symbol: "APP_PORT",
            evidenceKind: "environment-reference",
          }],
        },
        {
          field: "type",
          value: "integer",
          disposition: "confirmed",
          evidenceRefs: [{
            relativePath: "src/config.ts",
            symbol: "APP_PORT",
            evidenceKind: "integer-conversion",
          }],
        },
      ],
    },
    {
      name: "REDIS_URL",
      definitions: [],
      references: [{
        relativePath: "src/config.ts",
        symbol: "REDIS_URL",
        evidenceKind: "environment-reference",
      }],
      rules: [{
        field: "required",
        value: true,
        disposition: "confirmed",
        evidenceRefs: [{
          relativePath: "src/config.ts",
          symbol: "REDIS_URL",
          evidenceKind: "environment-reference",
        }],
      }],
    },
  ],
  sourceQualifiedFindings: [{
    relativePath: "src/auth.ts",
    symbol: "INTERNAL_TOKEN",
    findingKind: "hardcoded-sensitive-literal",
    evidenceRefs: [{
      relativePath: "src/auth.ts",
      symbol: "INTERNAL_TOKEN",
      evidenceKind: "sensitive-literal-shape",
    }],
  }],
  limitations: [],
};

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
  allowedRuleFields: [
    "type",
    "required",
    "minimum",
    "maximum",
    "format",
    "minLength",
    "sensitive",
  ],
  syntheticSecretPrefix: "TEST_ONLY_",
};

async function workdir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "skill-ir-public-checker-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("V3 public contract checker", () => {
  test("turns classification and schema residuals into contract-bound repair errors", async () => {
    const root = await workdir();
    await writeFile(join(root, ".env.example"), "APP_PORT=\nREDIS_URL=\n", "utf8");
    await writeFile(
      join(root, ".env.schema.json"),
      JSON.stringify({ variables: { APP_PORT: { type: "string" } } }),
      "utf8",
    );
    await writeFile(
      join(root, "env-report.json"),
      JSON.stringify({
        definedAndUsed: [],
        definedUnconfirmedUnused: [],
        usedUndefined: [],
        hardcodedSecrets: [],
        exposureRisks: [],
      }),
      "utf8",
    );

    const result = await validatePublicContractOutputs({
      workDir: root,
      contract,
      outputContract,
      templateSentinel: "__SKVM_REQUIRED__",
    });
    expect(result.status).toBe("fail");
    expect(result.repairEligible).toBe(true);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "MISSING_CLASSIFICATION_ENTRY",
      "MISSING_SCHEMA_RULE",
      "INVALID_SCHEMA_RULE_TYPE",
    ]));
    expect(result.errors.every((error) => error.contractRef && error.operation)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("APP_PORT=3000");
  });

  test("passes outputs that match only the confirmed public contract", async () => {
    const root = await workdir();
    await writeFile(join(root, ".env.example"), "APP_PORT=\nREDIS_URL=\n", "utf8");
    await writeFile(
      join(root, ".env.schema.json"),
      JSON.stringify({
        variables: {
          APP_PORT: { type: "integer", required: true },
          REDIS_URL: { required: true },
        },
      }),
      "utf8",
    );
    await writeFile(
      join(root, "env-report.json"),
      JSON.stringify({
        definedAndUsed: ["APP_PORT"],
        definedUnconfirmedUnused: [],
        usedUndefined: ["REDIS_URL"],
        hardcodedSecrets: ["src/auth.ts:INTERNAL_TOKEN"],
        exposureRisks: [],
      }),
      "utf8",
    );

    const result = await validatePublicContractOutputs({
      workDir: root,
      contract,
      outputContract,
      templateSentinel: "__SKVM_REQUIRED__",
    });
    expect(result).toEqual({
      schemaVersion: "runtime-validation-report/v3",
      codeCatalog: "public-contract-error-codes/v2",
      status: "pass",
      repairEligible: false,
      errors: [],
    });
  });

  test("rejects unsupported report entries, schema fields, sentinels, and secret prefixes", async () => {
    const root = await workdir();
    await writeFile(
      join(root, ".env.example"),
      "APP_PORT=__SKVM_REQUIRED__\nREDIS_URL=TEST_ONLY_CANARY\n",
      "utf8",
    );
    await writeFile(
      join(root, ".env.schema.json"),
      JSON.stringify({
        variables: {
          APP_PORT: { type: "integer", required: true, description: "not allowed" },
          REDIS_URL: { required: true },
        },
      }),
      "utf8",
    );
    await writeFile(
      join(root, "env-report.json"),
      JSON.stringify({
        definedAndUsed: ["APP_PORT", "UNKNOWN"],
        definedUnconfirmedUnused: [],
        usedUndefined: ["REDIS_URL"],
        hardcodedSecrets: ["src/auth.ts:INTERNAL_TOKEN"],
        exposureRisks: [],
      }),
      "utf8",
    );

    const result = await validatePublicContractOutputs({
      workDir: root,
      contract,
      outputContract,
      templateSentinel: "__SKVM_REQUIRED__",
    });
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "UNSUPPORTED_CLASSIFICATION_ENTRY",
      "UNSUPPORTED_SCHEMA_RULE",
      "UNSAFE_EXAMPLE_ENTRY",
      "SECRET_PATTERN_PRESENT",
    ]));
  });
});
