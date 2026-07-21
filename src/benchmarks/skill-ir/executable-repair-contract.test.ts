import { describe, expect, test } from "bun:test";
import {
  ExecutableRepairContractSchema,
  buildEnvManagerExecutableRepairContract,
} from "./executable-repair-contract";

const DIGEST = "a".repeat(64);
const RUNTIME_DIGEST = "b".repeat(64);
const DEVELOPMENT_DIGEST = "c".repeat(64);

function buildContract() {
  return buildEnvManagerExecutableRepairContract({
    taskContractDigest: DIGEST,
    runtimeContractSha256: RUNTIME_DIGEST,
    developmentEvidenceSha256: DEVELOPMENT_DIGEST,
  });
}

describe("V4 executable repair contract", () => {
  test("expresses canonical report item shape and versioned public rule policy", () => {
    const contract = buildContract();
    const report = contract.outputs.find((output) => output.relativePath === "env-report.json");

    expect(report?.shape).toMatchObject({
      kind: "object",
      additionalProperties: false,
      required: [
        "definedAndUsed",
        "definedUnconfirmedUnused",
        "usedUndefined",
        "hardcodedSecrets",
        "exposureRisks",
      ],
    });
    expect(report?.shape.kind).toBe("object");
    if (report?.shape.kind !== "object") throw new Error("report shape is not an object");
    expect(report.shape.properties.definedAndUsed).toEqual({
      kind: "array",
      items: { kind: "string", canonical: "environment-variable-name" },
      semantics: "set",
      uniqueItems: true,
      order: "lexicographic",
      valueSource: "classification/definedAndUsed",
    });
    expect(report.shape.properties.hardcodedSecrets).toMatchObject({
      items: { kind: "string", canonical: "source-qualified-symbol" },
    });
    expect(contract.schemaRulePolicy).toMatchObject({
      schemaVersion: "env-manager-development-repair-policy/v1",
      policyClass: "development-learned-candidate",
      developmentEvidenceSha256: DEVELOPMENT_DIGEST,
      defaultStringEvidenceKinds: [
        "dotenv-definition",
        "environment-reference",
        "client-environment-reference",
      ],
      uriNameSuffixes: ["_DSN", "_URI", "_URL"],
      learnedRules: [
        {
          ruleId: "server-dsn-sensitive/v1",
          kind: "server-sensitive-suffix",
          nameSuffix: "_DSN",
          sourceCriterion: "env-schema-rules",
          evidenceSha256: DEVELOPMENT_DIGEST,
          status: "candidate",
        },
        {
          ruleId: "signing-key-minimum-length/v1",
          kind: "sensitive-minimum-length-suffix",
          nameSuffix: "_SIGNING_KEY",
          minimum: 32,
          sourceCriterion: "env-schema-rules",
          evidenceSha256: DEVELOPMENT_DIGEST,
          status: "candidate",
        },
      ],
    });
  });

  test("keeps repair operations closed and serializes no task-specific classification values", () => {
    const contract = buildContract();
    const serialized = JSON.stringify(contract);

    expect(contract.allowedOperations).toEqual([
      "rewrite-canonical-report",
      "rewrite-redacted-example",
      "upsert-confirmed-schema-rules",
    ]);
    expect(serialized).not.toContain("APP_PORT");
    expect(serialized).not.toContain("SENDGRID_API_KEY");
    expect(serialized).not.toContain("TEST_ONLY_");
    expect(serialized).not.toContain("evaluator");
    expect(serialized).not.toContain("held-out");
  });

  test("rejects gold-like fields, arbitrary operations, and unsafe provenance", () => {
    const contract = buildContract();

    expect(() => ExecutableRepairContractSchema.parse({
      ...contract,
      expected: { definedAndUsed: ["LEAKED_NAME"] },
    })).toThrow();

    const wrongSource = structuredClone(contract);
    const report = wrongSource.outputs.find((output) => output.relativePath === "env-report.json");
    if (!report || report.shape.kind !== "object") throw new Error("missing report contract");
    report.shape.properties.definedAndUsed!.valueSource = "classification/usedUndefined";
    expect(() => ExecutableRepairContractSchema.parse(wrongSource)).toThrow(
      "report value source drift",
    );
    const wrongLineage = structuredClone(contract);
    wrongLineage.schemaRulePolicy.learnedRules[0].evidenceSha256 = "d".repeat(64);
    expect(() => ExecutableRepairContractSchema.parse(wrongLineage)).toThrow(
      "learned rule evidence drift",
    );
    expect(() => ExecutableRepairContractSchema.parse({
      ...contract,
      allowedOperations: [...contract.allowedOperations, "run-arbitrary-command"],
    })).toThrow();
    expect(() => ExecutableRepairContractSchema.parse({
      ...contract,
      provenance: {
        ...contract.provenance,
        sources: [...contract.provenance.sources, "evaluator-payload"],
      },
    })).toThrow();
  });
});
