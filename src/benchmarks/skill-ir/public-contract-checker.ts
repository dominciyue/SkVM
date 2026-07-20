import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { derivePublicContractClassification } from "./classification-evidence";
import {
  PublicRuntimeContractSchema,
  RuntimePublicValidationReportSchema,
  type PublicRepairOperation,
  type PublicRuntimeContract,
  type RuntimePublicValidationReport,
} from "./public-contract";

export type PublicOutputContract = {
  generatedFiles: string[];
  reportFields: string[];
  schemaRoot: string;
  allowedRuleFields: string[];
  syntheticSecretPrefix: string;
};

export type ValidatePublicContractOutputsOptions = {
  workDir: string;
  contract: PublicRuntimeContract;
  outputContract: PublicOutputContract;
  templateSentinel: string;
};

type ValidationError = RuntimePublicValidationReport["errors"][number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function outputRef(path: string): `outputs/${string}` {
  return `outputs/${path}`;
}

function errorForOutput(
  code: ValidationError["code"],
  relativePath: string,
  operation: PublicRepairOperation,
  extra: Partial<ValidationError> = {},
): ValidationError {
  return {
    code,
    relativePath,
    contractRef: outputRef(relativePath),
    operation,
    ...extra,
  };
}

function classificationRef(
  contract: PublicRuntimeContract,
  field: string,
  value: string,
): string {
  if (field === "hardcodedSecrets") {
    const index = contract.sourceQualifiedFindings.findIndex(
      (finding) => `${finding.relativePath}:${finding.symbol}` === value,
    );
    if (index >= 0) return `findings/${index}`;
  }
  const name = field === "exposureRisks" ? value.slice(value.lastIndexOf(":") + 1) : value;
  if (contract.variables.some((variable) => variable.name === name)) {
    return `variables/${name}/classification`;
  }
  return "outputs/env-report.json";
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function validatePublicContractOutputs(
  options: ValidatePublicContractOutputsOptions,
): Promise<RuntimePublicValidationReport> {
  const workDir = resolve(options.workDir);
  const contract = PublicRuntimeContractSchema.parse(options.contract);
  const errors: ValidationError[] = [];
  const generatedText: string[] = [];

  async function text(path: string): Promise<string | undefined> {
    try {
      const value = await readFile(join(workDir, path), "utf8");
      generatedText.push(value);
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      errors.push(errorForOutput("MISSING_FILE", path, "create-output"));
      return undefined;
    }
  }

  async function json(path: string): Promise<unknown> {
    const value = await text(path);
    if (value === undefined) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      errors.push(errorForOutput("INVALID_JSON", path, "create-output"));
      return undefined;
    }
  }

  const exampleText = await text(".env.example");
  const rawSchema = await json(".env.schema.json");
  const rawReport = await json("env-report.json");

  let report: Record<string, unknown> | undefined;
  if (rawReport !== undefined) {
    if (!isRecord(rawReport)) {
      errors.push(errorForOutput(
        "INVALID_REPORT_FIELD_TYPE",
        "env-report.json",
        "set-report-entry",
        { jsonPointer: "/", expectedType: "object" },
      ));
    } else {
      report = rawReport;
      for (const field of options.outputContract.reportFields) {
        const pointer = `/${pointerSegment(field)}`;
        if (!(field in report)) {
          errors.push(errorForOutput(
            "MISSING_REPORT_FIELD",
            "env-report.json",
            "set-report-entry",
            { jsonPointer: pointer, missingField: field, expectedType: "array" },
          ));
        } else if (
          !Array.isArray(report[field])
          || (report[field] as unknown[]).some((item) => typeof item !== "string")
        ) {
          errors.push(errorForOutput(
            "INVALID_REPORT_FIELD_TYPE",
            "env-report.json",
            "set-report-entry",
            { jsonPointer: pointer, expectedType: "array" },
          ));
        }
      }
      for (const field of Object.keys(report).sort()) {
        if (!options.outputContract.reportFields.includes(field)) {
          errors.push(errorForOutput(
            "EXTRA_REPORT_FIELD",
            "env-report.json",
            "remove-report-entry",
            { jsonPointer: `/${pointerSegment(field)}` },
          ));
        }
      }
    }
  }

  if (report) {
    const expected = derivePublicContractClassification(contract);
    for (const field of options.outputContract.reportFields) {
      const actualValues = Array.isArray(report[field])
        ? (report[field] as unknown[]).filter((item): item is string => typeof item === "string")
        : [];
      const expectedValues = expected[field as keyof typeof expected] ?? [];
      const actual = new Set(actualValues);
      const wanted = new Set(expectedValues);
      for (const value of expectedValues) {
        if (!actual.has(value)) {
          errors.push({
            code: "MISSING_CLASSIFICATION_ENTRY",
            relativePath: "env-report.json",
            jsonPointer: `/${pointerSegment(field)}`,
            contractRef: classificationRef(contract, field, value),
            operation: "set-report-entry",
          });
        }
      }
      for (const value of actualValues) {
        if (!wanted.has(value)) {
          errors.push({
            code: "UNSUPPORTED_CLASSIFICATION_ENTRY",
            relativePath: "env-report.json",
            jsonPointer: `/${pointerSegment(field)}`,
            contractRef: classificationRef(contract, field, value),
            operation: "remove-report-entry",
          });
        }
      }
    }
  }

  let schemaVariables: Record<string, unknown> | undefined;
  if (rawSchema !== undefined) {
    if (!isRecord(rawSchema) || !isRecord(rawSchema[options.outputContract.schemaRoot])) {
      errors.push(errorForOutput(
        "MISSING_SCHEMA_RULE",
        ".env.schema.json",
        "set-schema-rule",
        {
          jsonPointer: `/${pointerSegment(options.outputContract.schemaRoot)}`,
          missingField: options.outputContract.schemaRoot,
          expectedType: "object",
        },
      ));
    } else {
      schemaVariables = rawSchema[options.outputContract.schemaRoot] as Record<string, unknown>;
    }
  }

  if (schemaVariables) {
    for (const variable of contract.variables) {
      const variablePointer = `/${pointerSegment(options.outputContract.schemaRoot)}/${pointerSegment(variable.name)}`;
      const actual = schemaVariables[variable.name];
      if (!isRecord(actual)) {
        errors.push({
          code: "MISSING_SCHEMA_RULE",
          relativePath: ".env.schema.json",
          jsonPointer: variablePointer,
          expectedType: "object",
          contractRef: `variables/${variable.name}/rules/required`,
          operation: "set-schema-rule",
        });
        continue;
      }
      for (const field of Object.keys(actual).sort()) {
        if (!options.outputContract.allowedRuleFields.includes(field)) {
          errors.push(errorForOutput(
            "UNSUPPORTED_SCHEMA_RULE",
            ".env.schema.json",
            "remove-schema-rule",
            { jsonPointer: `${variablePointer}/${pointerSegment(field)}` },
          ));
        }
      }
      for (const rule of variable.rules.filter((candidate) => candidate.disposition === "confirmed")) {
        const pointer = `${variablePointer}/${pointerSegment(rule.field)}`;
        if (!(rule.field in actual)) {
          errors.push({
            code: "MISSING_SCHEMA_RULE",
            relativePath: ".env.schema.json",
            jsonPointer: pointer,
            missingField: rule.field,
            contractRef: `variables/${variable.name}/rules/${rule.field}`,
            operation: "set-schema-rule",
          });
        } else if (!sameValue(actual[rule.field], rule.value)) {
          errors.push({
            code: "INVALID_SCHEMA_RULE_TYPE",
            relativePath: ".env.schema.json",
            jsonPointer: pointer,
            contractRef: `variables/${variable.name}/rules/${rule.field}`,
            operation: "set-schema-rule",
          });
        }
      }
    }
  }

  if (exampleText !== undefined) {
    const names = new Set(
      exampleText
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
        .filter((name): name is string => Boolean(name)),
    );
    for (const variable of contract.variables) {
      if (!names.has(variable.name)) {
        errors.push(errorForOutput(
          "MISSING_EXAMPLE_ENTRY",
          ".env.example",
          "set-redacted-example",
          { missingField: variable.name },
        ));
      }
    }
    if (exampleText.includes(options.templateSentinel)) {
      errors.push(errorForOutput("UNSAFE_EXAMPLE_ENTRY", ".env.example", "set-redacted-example"));
    }
  }
  if (generatedText.some((value) => value.includes(options.outputContract.syntheticSecretPrefix))) {
    errors.push(errorForOutput("SECRET_PATTERN_PRESENT", ".env.example", "set-redacted-example"));
  }

  return RuntimePublicValidationReportSchema.parse({
    schemaVersion: "runtime-validation-report/v3",
    codeCatalog: "public-contract-error-codes/v2",
    status: errors.length === 0 ? "pass" : "fail",
    repairEligible: errors.length > 0,
    errors,
  });
}
