import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScoredAgentRunRow } from "./scoring";
import {
  auditScoredRows,
  compareCapabilityAudits,
  type FailureAuditClassification,
} from "./failure-audit";
import { writeFailureAuditOutputs } from "./failure-audit-run";

function row(
  overrides: Partial<ScoredAgentRunRow> & Pick<ScoredAgentRunRow, "system" | "success">,
): ScoredAgentRunRow {
  return {
    caseId: "env-manager:skvm:windows:clean:env-manager-node-audit-dev-001",
    skill: "env-manager",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task: "env-manager-node-audit-dev-001",
    taskSplit: "development",
    ruleViolations: 0,
    stepCoverage: 1,
    latencyMs: 10,
    successSource: "deterministic-evaluator",
    failedCriteria: overrides.success ? [] : ["env-schema-rules"],
    evaluationSummary: [
      {
        method: "custom",
        id: "env-schema-rules",
        pass: overrides.success,
        score: overrides.success ? 1 : 0,
        details: "Criterion result",
      },
    ],
    model: "xty/gpt-4.1-mini",
    modelFamily: "gpt",
    adapter: "bare-agent",
    adapterVersion: "workspace-semantic-artifact-v2",
    runIndex: 1,
    panelConfigId: "fixture",
    ...overrides,
  };
}

describe("failure audit", () => {
  test("classifies baseline, aligned runtime failure, false pass, repair failure, success, and infra", () => {
    const rows = [
      row({ system: "original", success: false }),
      row({
        system: "ir-artifact-dev",
        success: false,
        artifactRuntime: {
          mode: "check-only",
          status: "semantic-failure",
          failureStage: "validation",
          initialValidation: {
            schemaVersion: "runtime-validation-report/v2",
            codeCatalog: "semantic-error-codes/v1",
            status: "fail",
            repairEligible: true,
            errors: [{ code: "INVALID_RULE_TYPE", relativePath: ".env.schema.json", jsonPointer: "/variables/PORT/type", expectedType: "integer" }],
          },
          repairAttempted: false,
          repairedToPass: false,
          aggregateUsage: { inputTokens: 1, outputTokens: 1, tokenCost: 2, modelDurationMs: 3 },
          validationDurationMs: 1,
        },
      }),
      row({
        system: "ir-artifact-dev",
        success: false,
        artifactRuntime: {
          mode: "check-only",
          status: "complete",
          initialValidation: {
            schemaVersion: "runtime-validation-report/v2",
            codeCatalog: "semantic-error-codes/v1",
            status: "pass",
            repairEligible: false,
            errors: [],
          },
          repairAttempted: false,
          repairedToPass: false,
          aggregateUsage: { inputTokens: 1, outputTokens: 1, tokenCost: 2, modelDurationMs: 3 },
          validationDurationMs: 1,
        },
      }),
      row({
        system: "ir-artifact-dev",
        success: false,
        artifactRuntime: {
          mode: "one-repair",
          status: "semantic-failure",
          failureStage: "revalidation",
          initialValidation: {
            schemaVersion: "runtime-validation-report/v2",
            codeCatalog: "semantic-error-codes/v1",
            status: "fail",
            repairEligible: true,
            errors: [{ code: "INVALID_RULE_TYPE", relativePath: ".env.schema.json", jsonPointer: "/variables/PORT/type", expectedType: "integer" }],
          },
          finalValidation: {
            schemaVersion: "runtime-validation-report/v2",
            codeCatalog: "semantic-error-codes/v1",
            status: "fail",
            repairEligible: true,
            errors: [{ code: "TYPE_MISMATCH", relativePath: "env-report.json", jsonPointer: "/hardcodedSecrets", expectedType: "string" }],
          },
          repairAttempted: true,
          repairedToPass: false,
          aggregateUsage: { inputTokens: 2, outputTokens: 2, tokenCost: 4, modelDurationMs: 5 },
          validationDurationMs: 1,
        },
      }),
      row({ system: "ir-static", success: true }),
      row({ system: "original", success: false, failureType: "infrastructure" }),
    ];

    const classifications = auditScoredRows(rows).map((item) => item.classification);

    expect(classifications).toEqual<FailureAuditClassification[]>([
      "scorer-failure-no-runtime",
      "runtime-scorer-aligned-failure",
      "runtime-false-pass",
      "repair-revalidation-failure",
      "success",
      "infrastructure",
    ]);
  });

  test("projects only allowlisted validation fields and criterion summaries", () => {
    const [audit] = auditScoredRows([
      row({
        system: "ir-artifact-dev",
        success: false,
        artifactRuntime: {
          mode: "check-only",
          status: "semantic-failure",
          initialValidation: {
            schemaVersion: "runtime-validation-report/v2",
            codeCatalog: "semantic-error-codes/v1",
            status: "fail",
            repairEligible: true,
            errors: [{
              code: "MISSING_FIELD",
              relativePath: "env-report.json",
              jsonPointer: "/definedAndUsed",
              missingField: "definedAndUsed",
            }],
          },
          repairAttempted: false,
          repairedToPass: false,
          aggregateUsage: { inputTokens: 1, outputTokens: 1, tokenCost: 2, modelDurationMs: 3 },
          validationDurationMs: 1,
        },
      }),
    ]);

    const serialized = JSON.stringify(audit);
    expect(audit?.runtime?.initial?.errors[0]).toEqual({
      code: "MISSING_FIELD",
      relativePath: "env-report.json",
      jsonPointer: "/definedAndUsed",
      missingField: "definedAndUsed",
    });
    expect(serialized).not.toContain("TEST_ONLY_");
    expect(serialized).not.toContain("stdout");
    expect(serialized).not.toContain("details");
  });

  test("reports criterion transitions without claiming causality", () => {
    const mini = auditScoredRows([
      row({ system: "ir-static", success: false, model: "xty/gpt-4.1-mini" }),
    ]);
    const strong = auditScoredRows([
      row({ system: "ir-static", success: true, model: "xty/gpt-4.1" }),
    ]);

    const comparison = compareCapabilityAudits(mini, strong);

    expect(comparison.transitions).toEqual([
      {
        key: "ir-static|env-manager-node-audit-dev-001|1",
        criterionId: "env-schema-rules",
        miniPass: false,
        strongPass: true,
        transition: "mini-fail-strong-pass",
      },
    ]);
    expect(comparison.capabilitySignalCandidates).toBe(1);
    expect(comparison.causalClaimAvailable).toBe(false);
  });

  test("writes compact audit JSONL and an optional model comparison", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-ir-failure-audit-"));
    try {
      const miniRows = [row({ system: "ir-static", success: false, model: "xty/gpt-4.1-mini" })];
      const strongRows = [row({ system: "ir-static", success: true, model: "xty/gpt-4.1" })];

      const result = await writeFailureAuditOutputs({ outDir, miniRows, strongRows });
      const miniText = await readFile(result.miniAuditPath, "utf8");
      const comparison = JSON.parse(await readFile(result.comparisonPath!, "utf8")) as {
        capabilitySignalCandidates: number;
      };

      expect(miniText.trim().split(/\r?\n/)).toHaveLength(1);
      expect(miniText).not.toContain("stdout");
      expect(comparison.capabilitySignalCandidates).toBe(1);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
