import { describe, expect, test } from "bun:test";
import {
  PUBLIC_CONTRACT_ERROR_CODE_CATALOG,
  PublicRuntimeContractSchema,
  RuntimePublicValidationReportSchema,
} from "./public-contract";

const digest = "a".repeat(64);

function validContract(): Record<string, unknown> {
  return {
    schemaVersion: "skill-ir-public-runtime-contract/v3",
    codeCatalog: PUBLIC_CONTRACT_ERROR_CODE_CATALOG,
    skillId: "env-manager",
    taskContractDigest: digest,
    generatedOutputs: [".env.example", ".env.schema.json", "env-report.json"],
    publicPrefixes: ["VITE_", "NEXT_PUBLIC_"],
    variables: [
      {
        name: "APP_PORT",
        definitions: [
          {
            relativePath: ".env",
            symbol: "APP_PORT",
            evidenceKind: "dotenv-definition",
          },
        ],
        references: [
          {
            relativePath: "src/config.js",
            symbol: "APP_PORT",
            evidenceKind: "environment-reference",
          },
        ],
        rules: [
          {
            field: "type",
            value: "integer",
            disposition: "confirmed",
            evidenceRefs: [
              {
                relativePath: "src/config.js",
                symbol: "APP_PORT",
                evidenceKind: "integer-conversion",
              },
            ],
          },
          {
            field: "minimum",
            value: 1,
            disposition: "advisory",
            evidenceRefs: [
              {
                relativePath: "SKILL.md",
                symbol: "APP_PORT",
                evidenceKind: "public-skill-rule",
              },
            ],
          },
        ],
      },
    ],
    sourceQualifiedFindings: [
      {
        relativePath: "src/auth.js",
        symbol: "INTERNAL_TOKEN",
        findingKind: "hardcoded-sensitive-literal",
        evidenceRefs: [
          {
            relativePath: "src/auth.js",
            symbol: "INTERNAL_TOKEN",
            evidenceKind: "sensitive-literal-shape",
          },
        ],
      },
    ],
    limitations: [
      {
        code: "unsupported-syntax",
        relativePath: "src/dynamic.js",
        evidenceRefs: [
          {
            relativePath: "src/dynamic.js",
            symbol: "dynamic-env-access",
            evidenceKind: "environment-reference",
          },
        ],
      },
    ],
  };
}

describe("V3 public runtime contract", () => {
  test("accepts provenance-bound confirmed and advisory public evidence", () => {
    const contract = PublicRuntimeContractSchema.parse(validContract());
    expect(contract.schemaVersion).toBe("skill-ir-public-runtime-contract/v3");
    expect(contract.variables[0]?.rules.map((rule) => rule.disposition)).toEqual([
      "confirmed",
      "advisory",
    ]);
  });

  test("rejects evaluator, secret, held-out, and final classification sinks", () => {
    const forbidden = [
      { expected: { APP_PORT: { type: "integer" } } },
      { secretValue: "TEST_ONLY_PUBLIC_CONTRACT_CANARY" },
      { heldOutPayload: { taskId: "heldout-001" } },
      { definedAndUsed: ["APP_PORT"] },
      { usedUndefined: ["SENDGRID_API_KEY"] },
    ];
    for (const extra of forbidden) {
      expect(() => PublicRuntimeContractSchema.parse({
        ...validContract(),
        ...extra,
      })).toThrow();
    }
  });

  test("requires provenance evidence for variables, rules, findings, and limitations", () => {
    const contract = validContract();
    const variables = structuredClone(contract.variables) as Array<Record<string, unknown>>;
    const variable = variables[0] as Record<string, unknown>;
    variable.definitions = [];
    variable.references = [];
    expect(() => PublicRuntimeContractSchema.parse({ ...contract, variables })).toThrow();

    const rulelessEvidence = structuredClone(contract.variables) as Array<Record<string, unknown>>;
    const rules = rulelessEvidence[0]?.rules as Array<Record<string, unknown>>;
    rules[0] = { ...rules[0], evidenceRefs: [] };
    expect(() => PublicRuntimeContractSchema.parse({
      ...contract,
      variables: rulelessEvidence,
    })).toThrow();

    const findings = structuredClone(contract.sourceQualifiedFindings) as Array<Record<string, unknown>>;
    findings[0] = { ...findings[0], evidenceRefs: [] };
    expect(() => PublicRuntimeContractSchema.parse({
      ...contract,
      sourceQualifiedFindings: findings,
    })).toThrow();
  });

  test("keeps repair reports on a contract-bound closed surface", () => {
    const report = RuntimePublicValidationReportSchema.parse({
      schemaVersion: "runtime-validation-report/v3",
      codeCatalog: PUBLIC_CONTRACT_ERROR_CODE_CATALOG,
      status: "fail",
      repairEligible: true,
      errors: [
        {
          code: "MISSING_CLASSIFICATION_ENTRY",
          relativePath: "env-report.json",
          jsonPointer: "/definedAndUsed",
          contractRef: "variables/APP_PORT/classification",
          operation: "set-report-entry",
        },
      ],
    });
    expect(report.errors[0]?.operation).toBe("set-report-entry");

    const baseError = report.errors[0];
    for (const extra of [
      { actual: "wrong" },
      { expected: "APP_PORT" },
      { message: "Copy TEST_ONLY_PUBLIC_CONTRACT_CANARY" },
      { secret: "TEST_ONLY_PUBLIC_CONTRACT_CANARY" },
    ]) {
      expect(() => RuntimePublicValidationReportSchema.parse({
        ...report,
        errors: [{ ...baseError, ...extra }],
      })).toThrow();
    }
    expect(() => RuntimePublicValidationReportSchema.parse({
      ...report,
      errors: [{ ...baseError, operation: "rewrite-everything" }],
    })).toThrow();
    expect(() => RuntimePublicValidationReportSchema.parse({
      ...report,
      errors: [{ ...baseError, contractRef: "../scorer/expected" }],
    })).toThrow();
  });

  test("keeps pass and fail states internally consistent", () => {
    expect(RuntimePublicValidationReportSchema.parse({
      schemaVersion: "runtime-validation-report/v3",
      codeCatalog: PUBLIC_CONTRACT_ERROR_CODE_CATALOG,
      status: "pass",
      repairEligible: false,
      errors: [],
    }).status).toBe("pass");
    expect(() => RuntimePublicValidationReportSchema.parse({
      schemaVersion: "runtime-validation-report/v3",
      codeCatalog: PUBLIC_CONTRACT_ERROR_CODE_CATALOG,
      status: "pass",
      repairEligible: true,
      errors: [],
    })).toThrow();
    expect(() => RuntimePublicValidationReportSchema.parse({
      schemaVersion: "runtime-validation-report/v3",
      codeCatalog: PUBLIC_CONTRACT_ERROR_CODE_CATALOG,
      status: "fail",
      repairEligible: true,
      errors: [],
    })).toThrow();
  });
});
