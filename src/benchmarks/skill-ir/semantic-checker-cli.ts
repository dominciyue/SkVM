import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  RuntimeSemanticValidationReportSchema,
  SemanticRuntimeContractSchema,
  type RuntimeSemanticValidationReport,
} from "./semantic-contract";

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

type OutputContract = {
  generatedFiles: string[];
  reportFields: string[];
  schemaRoot: string;
  allowedRuleFields: string[];
  syntheticSecretPrefix: string;
};

type ValidationPolicy = {
  runtimeContract: { path: string; protected: true };
  templateSentinel: string;
};

type ValidationError = RuntimeSemanticValidationReport["errors"][number];

const workDir = resolve(requiredArg("workdir"));
const outputContract = JSON.parse(await readFile(
  join(import.meta.dir, "../contracts/env-manager-output-contract.json"),
  "utf8",
)) as OutputContract;
const policy = JSON.parse(
  await readFile(join(import.meta.dir, "../../validation-policy.json"), "utf8"),
) as ValidationPolicy;
const semanticContract = SemanticRuntimeContractSchema.parse(JSON.parse(await readFile(
  join(workDir, policy.runtimeContract.path),
  "utf8",
)));
const errors: ValidationError[] = [];
const generatedText: string[] = [];

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

async function text(path: string): Promise<string | undefined> {
  try {
    const value = await readFile(join(workDir, path), "utf8");
    generatedText.push(value);
    return value;
  } catch {
    errors.push({ code: "MISSING_FILE", relativePath: path });
    return undefined;
  }
}

async function json(path: string): Promise<unknown> {
  const value = await text(path);
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    errors.push({ code: "INVALID_JSON", relativePath: path });
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

await text(".env.example");
const rawSchema = await json(".env.schema.json");
const rawReport = await json("env-report.json");
let variables: Record<string, unknown> | undefined;
let report: Record<string, unknown> | undefined;

if (rawSchema !== undefined) {
  if (!isRecord(rawSchema)) {
    errors.push({
      code: "TYPE_MISMATCH",
      relativePath: ".env.schema.json",
      jsonPointer: "/",
      expectedType: "object",
    });
  } else if (!(outputContract.schemaRoot in rawSchema)) {
    errors.push({
      code: "MISSING_FIELD",
      relativePath: ".env.schema.json",
      jsonPointer: `/${pointerSegment(outputContract.schemaRoot)}`,
      missingField: outputContract.schemaRoot,
      expectedType: "object",
    });
  } else if (!isRecord(rawSchema[outputContract.schemaRoot])) {
    errors.push({
      code: "TYPE_MISMATCH",
      relativePath: ".env.schema.json",
      jsonPointer: `/${pointerSegment(outputContract.schemaRoot)}`,
      expectedType: "object",
    });
  } else {
    variables = rawSchema[outputContract.schemaRoot] as Record<string, unknown>;
  }
}

if (rawReport !== undefined) {
  if (!isRecord(rawReport)) {
    errors.push({
      code: "TYPE_MISMATCH",
      relativePath: "env-report.json",
      jsonPointer: "/",
      expectedType: "object",
    });
  } else {
    report = rawReport;
    for (const field of outputContract.reportFields) {
      const pointer = `/${pointerSegment(field)}`;
      if (!(field in report)) {
        errors.push({
          code: "MISSING_FIELD",
          relativePath: "env-report.json",
          jsonPointer: pointer,
          missingField: field,
          expectedType: "array",
        });
      } else if (!Array.isArray(report[field])) {
        errors.push({
          code: "TYPE_MISMATCH",
          relativePath: "env-report.json",
          jsonPointer: pointer,
          expectedType: "array",
        });
      } else if ((report[field] as unknown[]).some((item) => typeof item !== "string")) {
        errors.push({
          code: "TYPE_MISMATCH",
          relativePath: "env-report.json",
          jsonPointer: pointer,
          expectedType: "string",
        });
      }
    }
    for (const field of Object.keys(report).sort()) {
      if (!outputContract.reportFields.includes(field)) {
        errors.push({
          code: "EXTRA_FIELD",
          relativePath: "env-report.json",
          jsonPointer: `/${pointerSegment(field)}`,
        });
      }
    }
  }
}

if (generatedText.some((value) => value.includes(policy.templateSentinel))) {
  errors.push({ code: "UNFILLED_TEMPLATE" });
}
if (generatedText.some((value) => value.includes(outputContract.syntheticSecretPrefix))) {
  errors.push({ code: "SECRET_PATTERN_PRESENT" });
}

if (variables) {
  for (const variable of semanticContract.observedVariables) {
    const variablePointer = `/${pointerSegment(outputContract.schemaRoot)}/${pointerSegment(variable.name)}`;
    const rule = variables[variable.name];
    if (!isRecord(rule)) {
      errors.push({
        code: "MISSING_OBSERVED_VARIABLE",
        relativePath: ".env.schema.json",
        jsonPointer: variablePointer,
        expectedType: "object",
      });
      continue;
    }
    for (const field of Object.keys(rule).sort()) {
      if (!outputContract.allowedRuleFields.includes(field)) {
        errors.push({
          code: "UNSUPPORTED_RULE_FIELD",
          relativePath: ".env.schema.json",
          jsonPointer: `${variablePointer}/${pointerSegment(field)}`,
        });
      }
    }
    if (variable.inferredType && rule.type !== variable.inferredType) {
      errors.push({
        code: "INVALID_RULE_TYPE",
        relativePath: ".env.schema.json",
        jsonPointer: `${variablePointer}/type`,
        expectedType: variable.inferredType,
      });
    }
    for (const constraint of variable.constraints) {
      if (!(constraint.field in rule)) {
        errors.push({
          code: "MISSING_RULE_CONSTRAINT",
          relativePath: ".env.schema.json",
          jsonPointer: `${variablePointer}/${constraint.field}`,
          missingField: constraint.field,
          expectedType: constraint.field === "format" ? "string" : "number",
        });
      }
    }
    if (variable.sensitiveMarkerRequired && rule.sensitive !== true) {
      errors.push({
        code: "MISSING_SENSITIVE_MARKER",
        relativePath: ".env.schema.json",
        jsonPointer: `${variablePointer}/sensitive`,
        missingField: "sensitive",
        expectedType: "boolean",
      });
    }
  }
}

const hardcoded = report?.hardcodedSecrets;
if (Array.isArray(hardcoded) && hardcoded.every((item) => typeof item === "string")) {
  const knownReferences = new Set<string>();
  for (const variable of semanticContract.observedVariables) {
    for (const ref of variable.sourceRefs) knownReferences.add(`${ref.relativePath}:${ref.symbol}`);
  }
  for (const finding of semanticContract.sourceQualifiedFindings) {
    knownReferences.add(`${finding.relativePath}:${finding.symbol}`);
  }
  for (const [index, value] of hardcoded.entries()) {
    if (!knownReferences.has(value)) {
      errors.push({
        code: "INVALID_SOURCE_QUALIFIED_FINDING",
        relativePath: "env-report.json",
        jsonPointer: `/hardcodedSecrets/${index}`,
      });
    }
  }
  const actual = new Set(hardcoded);
  if (semanticContract.sourceQualifiedFindings.some(
    (finding) => !actual.has(`${finding.relativePath}:${finding.symbol}`),
  )) {
    errors.push({
      code: "MISSING_SOURCE_QUALIFIED_FINDING",
      relativePath: "env-report.json",
      jsonPointer: "/hardcodedSecrets",
    });
  }
}

const result = RuntimeSemanticValidationReportSchema.parse({
  schemaVersion: "runtime-validation-report/v2",
  codeCatalog: "semantic-error-codes/v1",
  status: errors.length === 0 ? "pass" : "fail",
  repairEligible: errors.length > 0,
  errors,
});
console.log(JSON.stringify(result));
