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
import type { CapabilityDiagnosticLock } from "./capability-diagnostic";
import {
  assertDiagnosticRows,
  writeFailureAuditOutputs,
} from "./failure-audit-run";

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

function diagnosticRows(
  lock: CapabilityDiagnosticLock,
  cohort: "historical" | "strong",
): ScoredAgentRunRow[] {
  const artifactModes = new Set(["check-only", "one-repair"]);
  return lock.matrix.systems.flatMap((logicalSystem) =>
    lock.matrix.taskIds.flatMap((task) =>
      Array.from({ length: lock.matrix.repetitions }, (_, offset) => {
        const artifactMode = logicalSystem === "check-only" || logicalSystem === "one-repair"
          ? logicalSystem
          : undefined;
        const artifact = artifactModes.has(logicalSystem);
        const panelConfigId = cohort === "strong"
          ? `${lock.diagnosticId}-${logicalSystem === "no-skill"
            || logicalSystem === "original"
            || logicalSystem === "ir-static"
            ? "baseline"
            : logicalSystem}`
          : logicalSystem === "no-skill"
            || logicalSystem === "original"
            || logicalSystem === "ir-static"
            ? "env-manager-static-v1"
            : `env-manager-semantic-artifact-v2-${logicalSystem}`;
        return row({
          caseId: `${lock.skillId}:skvm:windows:clean:${task}`,
          system: logicalSystem === "check-only" || logicalSystem === "one-repair"
            ? "ir-artifact-dev"
            : logicalSystem,
          success: false,
          model: cohort === "strong" ? lock.model.diagnosticRoute : lock.model.historicalRoute,
          modelFamily: lock.model.family,
          adapter: lock.adapter.id,
          adapterVersion: artifact ? lock.adapter.artifactVersion : lock.adapter.baselineVersion,
          runIndex: offset + 1,
          panelConfigId,
          skillProvenance: "real-public",
          evidenceWeight: "main-real",
          task,
          evaluationSummary: lock.criteria.map((criterion) => ({
            method: "custom",
            id: criterion.id,
            pass: false,
            score: 0,
            details: "Criterion result",
          })),
          ...(artifactMode
            ? {
                artifactRuntime: {
                  mode: artifactMode,
                  status: "semantic-failure",
                  repairAttempted: artifactMode === "one-repair",
                  repairedToPass: false,
                  aggregateUsage: {
                    inputTokens: 1,
                    outputTokens: 1,
                    tokenCost: 2,
                    modelDurationMs: 3,
                  },
                  validationDurationMs: 1,
                },
              }
            : {}),
        });
      }),
    ),
  );
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
              expectedType: "array",
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
      expectedType: "array",
    });
    expect(serialized).not.toContain("TEST_ONLY_");
    expect(serialized).not.toContain("stdout");
    expect(serialized).not.toContain("details");
  });

  test("audits V3 contract-bound failures without widening the safe projection", () => {
    const [audit] = auditScoredRows([row({
      system: "ir-public-artifact-dev",
      success: false,
      artifactLogicalArm: "one-repair",
      artifactRuntime: {
        mode: "one-repair",
        status: "semantic-failure",
        failureStage: "revalidation",
        initialValidation: {
          schemaVersion: "runtime-validation-report/v3",
          codeCatalog: "public-contract-error-codes/v2",
          status: "fail",
          repairEligible: true,
          errors: [{
            code: "MISSING_CLASSIFICATION_ENTRY",
            relativePath: "env-report.json",
            jsonPointer: "/definedAndUsed",
            contractRef: "variables/APP_PORT/classification",
            operation: "set-report-entry",
          }],
        },
        repairAttempted: true,
        repairedToPass: false,
        aggregateUsage: { inputTokens: 2, outputTokens: 1, tokenCost: 3, modelDurationMs: 4 },
        validationDurationMs: 1,
      },
    })]);

    expect(audit?.runtime?.initial?.errors[0]).toEqual({
      code: "MISSING_CLASSIFICATION_ENTRY",
      relativePath: "env-report.json",
      jsonPointer: "/definedAndUsed",
      contractRef: "variables/APP_PORT/classification",
      operation: "set-report-entry",
    });
    expect(JSON.stringify(audit)).not.toContain("expected");
  });

  test("rejects validation fields that can carry absolute paths or secret canaries", () => {
    const unsafeReport = (error: Record<string, string>) => row({
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
          errors: [{ code: "MISSING_FIELD", expectedType: "string", ...error }],
        },
        repairAttempted: false,
        repairedToPass: false,
        aggregateUsage: { inputTokens: 1, outputTokens: 1, tokenCost: 2, modelDurationMs: 3 },
        validationDurationMs: 1,
      } as ScoredAgentRunRow["artifactRuntime"],
    });

    expect(() => auditScoredRows([unsafeReport({
      relativePath: "C:\\private\\env-report.json",
      jsonPointer: "/safe",
      missingField: "safe",
    })])).toThrow();
    expect(() => auditScoredRows([unsafeReport({
      relativePath: "env-report.json",
      jsonPointer: "/TEST_ONLY_SECRET_VALUE",
      missingField: "TEST_ONLY_SECRET_VALUE",
    })])).toThrow("Unsafe validation audit field");
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

  test("rejects duplicate audit identities instead of silently overwriting them", () => {
    const duplicate = auditScoredRows([
      row({ system: "ir-static", success: false }),
      row({ system: "ir-static", success: false }),
    ]);

    expect(() => compareCapabilityAudits(duplicate, duplicate)).toThrow(
      "Duplicate failure-audit identity",
    );
  });

  test("validates every frozen 12+4+4 matrix cell and complete run identity", async () => {
    const lock = (await import(
      "../../../benchmarks/skill-ir/pilots/env-manager/env-manager-gpt41-capability-diagnostic-lock.json",
      { with: { type: "json" } }
    )).default as CapabilityDiagnosticLock;
    const historical = diagnosticRows(lock, "historical");
    const strong = diagnosticRows(lock, "strong");

    expect(() => assertDiagnosticRows(historical, lock, "historical")).not.toThrow();
    expect(() => assertDiagnosticRows(strong, lock, "strong")).not.toThrow();

    const duplicate = [...strong];
    duplicate[duplicate.length - 1] = { ...duplicate[0]! };
    expect(() => assertDiagnosticRows(duplicate, lock, "strong")).toThrow(
      "Duplicate diagnostic row identity",
    );

    const wrongPanel = strong.map((item, index) =>
      index === 0 ? { ...item, panelConfigId: "post-hoc-panel" } : item
    );
    expect(() => assertDiagnosticRows(wrongPanel, lock, "strong")).toThrow(
      "panelConfigId",
    );

    const wrongContext = historical.map((item, index) =>
      index === 0 ? { ...item, context: "noisy" } : item
    );
    expect(() => assertDiagnosticRows(wrongContext, lock, "historical")).toThrow(
      "context",
    );
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
