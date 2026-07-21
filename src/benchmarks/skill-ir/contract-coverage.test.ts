import { describe, expect, test } from "bun:test";
import {
  ENV_MANAGER_CRITERION_IDS,
  buildEnvManagerContractCoverageAudit,
} from "./contract-coverage";
import { parseContractCoverageArgs } from "./contract-coverage-run";

const V3_RUNTIME_CODES = [
  "INVALID_REPORT_FIELD_TYPE",
  "MISSING_CLASSIFICATION_ENTRY",
] as const;

describe("env-manager failure-to-contract coverage audit", () => {
  test("parses explicit audit inputs and rejects unknown CLI arguments", () => {
    expect(parseContractCoverageArgs([
      "--runtime-codes=INVALID_REPORT_FIELD_TYPE,MISSING_CLASSIFICATION_ENTRY",
      "--failed-criteria=env-classification,env-schema-rules",
      "--tasks=tasks.json",
      "--out=results/audit.json",
    ])).toEqual({
      runtimeCodes: ["INVALID_REPORT_FIELD_TYPE", "MISSING_CLASSIFICATION_ENTRY"],
      failedCriteria: ["env-classification", "env-schema-rules"],
      tasks: "tasks.json",
      out: "results/audit.json",
    });
    expect(() => parseContractCoverageArgs(["--unknown=x"])).toThrow("Unknown argument");
  });

  test("maps every registered scorer criterion to public checks and repair capabilities", () => {
    const audit = buildEnvManagerContractCoverageAudit({
      criterionIds: [...ENV_MANAGER_CRITERION_IDS],
      observedRuntimeCodes: [...V3_RUNTIME_CODES],
      observedFailedCriteria: ["env-classification", "env-schema-rules"],
    });

    expect(audit.schemaVersion).toBe("skill-ir-contract-coverage-audit/v1");
    expect(audit.catalog).toBe("executable-contract-repair-artifact/v4");
    expect(audit.criteria).toHaveLength(6);
    expect(audit.criteria.map((entry) => entry.criterionId)).toEqual(
      [...ENV_MANAGER_CRITERION_IDS].sort(),
    );

    const classification = audit.criteria.find(
      (entry) => entry.criterionId === "env-classification",
    );
    expect(classification).toMatchObject({
      runtimeCoverage: "partial",
      observedStatus: "runtime-and-scorer-failed",
    });
    expect(classification?.validatorChecks).toContain("classification-set-equality");
    expect(classification?.deterministicRepairOperations).toContain(
      "rewrite-canonical-report",
    );

    const schema = audit.criteria.find(
      (entry) => entry.criterionId === "env-schema-rules",
    );
    expect(schema).toMatchObject({
      runtimeCoverage: "partial",
      observedStatus: "scorer-failed-without-runtime-code",
    });
    expect(schema?.gaps).toContain("public-rule-lowering-incomplete");
    expect(audit.unknownRuntimeCodes).toEqual([]);
    expect(audit.claimBoundary).toContain("not a scorer");
  });

  test("rejects criterion drift and unknown runtime codes", () => {
    expect(() => buildEnvManagerContractCoverageAudit({
      criterionIds: ENV_MANAGER_CRITERION_IDS.slice(0, -1),
      observedRuntimeCodes: [],
      observedFailedCriteria: [],
    })).toThrow("criterion registry drift");

    expect(() => buildEnvManagerContractCoverageAudit({
      criterionIds: [...ENV_MANAGER_CRITERION_IDS],
      observedRuntimeCodes: ["NEW_UNREVIEWED_CODE"],
      observedFailedCriteria: [],
    })).toThrow("unknown runtime validation code");
  });

  test("serializes no evaluator gold, secret values, or task-specific expected sets", () => {
    const audit = buildEnvManagerContractCoverageAudit({
      criterionIds: [...ENV_MANAGER_CRITERION_IDS],
      observedRuntimeCodes: [...V3_RUNTIME_CODES],
      observedFailedCriteria: ["env-classification", "env-schema-rules"],
    });
    const serialized = JSON.stringify(audit);

    expect(serialized).not.toContain("expected");
    expect(serialized).not.toContain("TEST_ONLY_");
    expect(serialized).not.toContain("APP_PORT");
    expect(serialized).not.toContain("SENDGRID_API_KEY");
    expect(serialized).not.toContain("held-out");
  });
});
