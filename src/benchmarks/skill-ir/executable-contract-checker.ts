import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  ExecutableRepairContractSchema,
  type ExecutableRepairContract,
} from "./executable-repair-contract";
import { deriveEnvManagerDeterministicArtifacts } from "./deterministic-artifact-repairer";
import {
  PublicRuntimeContractSchema,
  RuntimePublicValidationReportSchema,
  type RuntimePublicValidationReport,
} from "./public-contract";
import {
  validatePublicContractOutputs,
  type PublicOutputContract,
} from "./public-contract-checker";
import { sha256Bytes } from "./source-fixture";

export type ValidateExecutableContractOutputsOptions = {
  workDir: string;
  outputContract: PublicOutputContract;
  runtimeContractBytes: Uint8Array;
  repairContract: ExecutableRepairContract;
  templateSentinel: string;
};

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

export async function validateExecutableContractOutputs(
  options: ValidateExecutableContractOutputsOptions,
): Promise<RuntimePublicValidationReport> {
  const runtimeBytes = Buffer.from(options.runtimeContractBytes);
  const runtimeContract = PublicRuntimeContractSchema.parse(
    JSON.parse(runtimeBytes.toString("utf8")),
  );
  const repairContract = ExecutableRepairContractSchema.parse(options.repairContract);
  if (sha256Bytes(runtimeBytes) !== repairContract.runtimeContractSha256) {
    throw new Error("runtime contract digest mismatch");
  }
  if (runtimeContract.taskContractDigest !== repairContract.taskContractDigest) {
    throw new Error("runtime and repair task contract digests differ");
  }
  const outputPaths = [...repairContract.outputs.map((output) => output.relativePath)].sort();
  if (JSON.stringify(outputPaths) !== JSON.stringify([...options.outputContract.generatedFiles].sort())) {
    throw new Error("runtime repair output registry mismatch");
  }

  const base = await validatePublicContractOutputs({
    workDir: options.workDir,
    contract: runtimeContract,
    outputContract: options.outputContract,
    templateSentinel: options.templateSentinel,
  });
  const errors: RuntimePublicValidationReport["errors"] = [...base.errors];
  const desired = deriveEnvManagerDeterministicArtifacts(runtimeContract, repairContract);
  const root = resolve(options.workDir);

  const report = await readJson(join(root, "env-report.json"));
  if (report !== undefined && !sameJson(report, desired.report)) {
    errors.push({
      code: "INVALID_REPORT_FIELD_TYPE",
      relativePath: "env-report.json",
      jsonPointer: "/",
      expectedType: "object",
      contractRef: "outputs/env-report.json",
      operation: "set-report-entry",
    });
  }

  const example = await readFile(join(root, ".env.example"), "utf8").catch(() => undefined);
  if (example !== undefined && example !== desired.exampleText) {
    errors.push({
      code: "UNSAFE_EXAMPLE_ENTRY",
      relativePath: ".env.example",
      contractRef: "outputs/.env.example",
      operation: "set-redacted-example",
    });
  }

  const schema = await readJson(join(root, ".env.schema.json"));
  if (schema !== undefined && !sameJson(schema, desired.schema)) {
    const actualVariables = typeof schema === "object" && schema !== null && !Array.isArray(schema)
      && typeof (schema as Record<string, unknown>).variables === "object"
      && (schema as Record<string, unknown>).variables !== null
      && !Array.isArray((schema as Record<string, unknown>).variables)
      ? (schema as { variables: Record<string, unknown> }).variables
      : {};
    for (const [name, desiredRules] of Object.entries(desired.schema.variables)) {
      const actualRules = typeof actualVariables[name] === "object"
        && actualVariables[name] !== null
        && !Array.isArray(actualVariables[name])
        ? actualVariables[name] as Record<string, unknown>
        : {};
      for (const [field, value] of Object.entries(desiredRules)) {
        if (sameJson(actualRules[field], value)) continue;
        errors.push({
          code: field in actualRules ? "INVALID_SCHEMA_RULE_TYPE" : "MISSING_SCHEMA_RULE",
          relativePath: ".env.schema.json",
          jsonPointer: `/variables/${pointerSegment(name)}/${pointerSegment(field)}`,
          ...(!(field in actualRules) ? { missingField: field } : {}),
          contractRef: `variables/${name}/rules/${field}`,
          operation: "set-schema-rule",
        });
      }
    }
  }

  return RuntimePublicValidationReportSchema.parse({
    schemaVersion: "runtime-validation-report/v3",
    codeCatalog: "public-contract-error-codes/v2",
    status: errors.length === 0 ? "pass" : "fail",
    repairEligible: errors.length > 0,
    errors,
  });
}
