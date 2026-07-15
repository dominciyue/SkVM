import { describe, expect, test } from "bun:test";
import { RuntimeValidationReportSchema } from "./artifact-package";
import { ClassificationCandidateSchema } from "./classification-evidence";
import {
  RuntimeSemanticValidationReportSchema,
  SEMANTIC_ERROR_CODE_CATALOG,
  SemanticRuntimeContractSchema,
  SemanticValidationCodeSchema,
} from "./semantic-contract";

const validContract = {
  schemaVersion: "skill-ir-semantic-runtime-contract/v1",
  codeCatalog: "semantic-error-codes/v1",
  skillId: "env-manager",
  observedVariables: [
    {
      name: "APP_PORT",
      evidenceKinds: ["dotenv-definition", "environment-reference", "integer-conversion"],
      sourceRefs: [
        {
          relativePath: "src/config.ts",
          symbol: "APP_PORT",
          evidenceKind: "integer-conversion",
        },
      ],
      inferredType: "integer",
      constraints: [
        { field: "minimum", value: 1 },
        { field: "maximum", value: 65535 },
      ],
      sensitiveMarkerRequired: false,
    },
  ],
  sourceQualifiedFindings: [
    {
      relativePath: "src/auth.ts",
      symbol: "INTERNAL_TOKEN",
      findingKind: "hardcoded-sensitive-literal",
      evidenceRefs: [
        {
          relativePath: "src/auth.ts",
          symbol: "INTERNAL_TOKEN",
          evidenceKind: "literal-assignment",
        },
      ],
    },
  ],
  limitations: [],
} as const;

describe("semantic runtime contract", () => {
  test("accepts only confirmed A evidence and rejects B classification sinks", () => {
    const parsed = SemanticRuntimeContractSchema.parse(validContract);
    expect(parsed.codeCatalog).toBe(SEMANTIC_ERROR_CODE_CATALOG);
    expect(parsed.observedVariables[0]?.constraints).toEqual([
      { field: "minimum", value: 1 },
      { field: "maximum", value: 65535 },
    ]);

    const dormant = ClassificationCandidateSchema.parse({
      value: "B_CLASSIFICATION_CANARY",
      evidenceRefs: [{ relativePath: "src/config.ts", symbol: "APP_PORT" }],
      confidence: 0.9,
      disposition: "confirmed",
    });
    expect(() => SemanticRuntimeContractSchema.parse({
      ...validContract,
      classificationCandidates: [dormant],
    })).toThrow();
    expect(() => SemanticRuntimeContractSchema.parse({
      ...validContract,
      observedVariables: [{ ...validContract.observedVariables[0], actualValue: "3000" }],
    })).toThrow();
  });

  test("uses a closed versioned A error catalog without widening v1", () => {
    const semanticCodes = [
      "MISSING_OBSERVED_VARIABLE",
      "INVALID_RULE_TYPE",
      "MISSING_RULE_CONSTRAINT",
      "MISSING_SENSITIVE_MARKER",
      "UNSUPPORTED_RULE_FIELD",
      "INVALID_SOURCE_QUALIFIED_FINDING",
      "MISSING_SOURCE_QUALIFIED_FINDING",
    ] as const;
    for (const code of semanticCodes) {
      expect(SemanticValidationCodeSchema.parse(code)).toBe(code);
      expect(() => RuntimeValidationReportSchema.parse({
        schemaVersion: "runtime-validation-report/v1",
        status: "fail",
        repairEligible: true,
        errors: [{ code, relativePath: ".env.schema.json" }],
      })).toThrow();
    }
    expect(() => SemanticValidationCodeSchema.parse("FUTURE_UNFROZEN_CODE")).toThrow();
  });

  test("enforces semantic code field combinations and the five-field repair surface", () => {
    const report = RuntimeSemanticValidationReportSchema.parse({
      schemaVersion: "runtime-validation-report/v2",
      codeCatalog: "semantic-error-codes/v1",
      status: "fail",
      repairEligible: true,
      errors: [
        {
          code: "INVALID_RULE_TYPE",
          relativePath: ".env.schema.json",
          jsonPointer: "/variables/APP_PORT/type",
          expectedType: "integer",
        },
        {
          code: "MISSING_RULE_CONSTRAINT",
          relativePath: ".env.schema.json",
          jsonPointer: "/variables/APP_PORT/minimum",
          missingField: "minimum",
          expectedType: "number",
        },
      ],
    });
    expect(Object.keys(report.errors[0]!).sort()).toEqual([
      "code",
      "expectedType",
      "jsonPointer",
      "relativePath",
    ]);
    expect(() => RuntimeSemanticValidationReportSchema.parse({
      ...report,
      errors: [{ ...report.errors[0], message: "B_CLASSIFICATION_CANARY" }],
    })).toThrow();
    expect(() => RuntimeSemanticValidationReportSchema.parse({
      ...report,
      disposition: "confirmed",
    })).toThrow();
    expect(() => RuntimeSemanticValidationReportSchema.parse({
      ...report,
      errors: [{
        code: "INVALID_RULE_TYPE",
        relativePath: ".env.schema.json",
        jsonPointer: "/variables/APP_PORT/type",
      }],
    })).toThrow();
    expect(() => RuntimeSemanticValidationReportSchema.parse({
      ...report,
      errors: [{
        code: "MISSING_SENSITIVE_MARKER",
        relativePath: ".env.schema.json",
        jsonPointer: "/variables/API_TOKEN/sensitive",
        missingField: "sensitive",
        expectedType: "string",
      }],
    })).toThrow();
    expect(() => RuntimeSemanticValidationReportSchema.parse({
      ...report,
      errors: [{
        code: "MISSING_FILE",
        relativePath: "env-report.json",
        expectedType: "object",
      }],
    })).toThrow();
  });

  test("keeps passing and failing report states internally consistent", () => {
    expect(RuntimeSemanticValidationReportSchema.parse({
      schemaVersion: "runtime-validation-report/v2",
      codeCatalog: "semantic-error-codes/v1",
      status: "pass",
      repairEligible: false,
      errors: [],
    }).status).toBe("pass");
    expect(() => RuntimeSemanticValidationReportSchema.parse({
      schemaVersion: "runtime-validation-report/v2",
      codeCatalog: "semantic-error-codes/v1",
      status: "pass",
      repairEligible: true,
      errors: [{ code: "MISSING_FILE", relativePath: "env-report.json" }],
    })).toThrow();
    expect(() => RuntimeSemanticValidationReportSchema.parse({
      schemaVersion: "runtime-validation-report/v2",
      codeCatalog: "semantic-error-codes/v1",
      status: "fail",
      repairEligible: true,
      errors: [],
    })).toThrow();
  });
});
