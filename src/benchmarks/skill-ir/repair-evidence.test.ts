import { describe, expect, test } from "bun:test";
import type { ScoredAgentRunRow } from "./scoring";
import { buildDualSourceRepairEvidence } from "./repair-evidence";

function criterion(id: string, pass: boolean) {
  return { method: "custom", id, name: id, pass, score: pass ? 1 : 0, details: pass ? "Criterion passed" : "Criterion failed" };
}

function row(
  system: "original" | "ir-static",
  task: string,
  runIndex: number,
  summaries: ReturnType<typeof criterion>[],
  overrides: Partial<ScoredAgentRunRow> = {},
): ScoredAgentRunRow {
  return {
    caseId: `env-manager:skvm:windows:clean:${task}`,
    system,
    skill: "env-manager",
    agent: "skvm",
    environment: "windows",
    context: "clean",
    task,
    taskSplit: "development",
    model: "xty/gpt-4.1-mini",
    modelFamily: "gpt",
    adapter: "bare-agent",
    adapterVersion: "workspace-static-v1",
    runIndex,
    panelConfigId: "env-manager-static-v1",
    success: false,
    ruleViolations: summaries.filter((summary) => !summary.pass).length,
    stepCoverage: 1,
    latencyMs: 10,
    tokenCost: 100,
    successSource: "deterministic-evaluator",
    failedCriteria: summaries.filter((summary) => !summary.pass).map((summary) => summary.id),
    evaluationSummary: summaries,
    ...overrides,
  };
}

const protectedPass = criterion("env-protected-files", true);
const requiredPass = criterion("env-required-artifacts", true);
const classificationFail = criterion("env-classification", false);
const schemaFail = criterion("env-schema-rules", false);

function pairedResidualRows(): ScoredAgentRunRow[] {
  return ["node-dev", "vite-dev"].flatMap((task) => [1, 2].flatMap((runIndex) => [
    row("original", task, runIndex, [protectedPass, requiredPass, classificationFail, schemaFail]),
    row("ir-static", task, runIndex, [protectedPass, requiredPass, classificationFail, schemaFail]),
  ]));
}

describe("dual-source repair evidence", () => {
  test("aggregates reproduced static residuals by distinct task and strips gold canaries", () => {
    const rows = pairedResidualRows();
    const poisoned = rows.map((candidate) => ({
      ...candidate,
      expected: { definedAndUsed: ["GOLD_VARIABLE"] },
      payload: { secret: "TEST_ONLY_REPAIR_CANARY" },
    })) as ScoredAgentRunRow[];

    const evidence = buildDualSourceRepairEvidence(poisoned, {
      skillId: "env-manager",
      lineageCatalog: "env-manager/v1",
      minDistinctTasks: 2,
    });

    expect(evidence).toMatchObject({
      schemaVersion: "skill-ir-repair-evidence/v1",
      policyVersion: "dual-source-residual/v1",
      lineageCatalog: "env-manager/v1",
      skillId: "env-manager",
      sourceSystems: ["original", "ir-static"],
      regressions: [],
    });
    expect(evidence.records).toHaveLength(8);
    expect(new Set(evidence.records.map((record) => record.lineage))).toEqual(new Set(["reproduced"]));
    expect(evidence.repairs).toEqual([
      expect.objectContaining({
        kind: "json-schema-contract",
        targetRef: "rule-json-schema-contract",
        distinctTaskCount: 2,
        observationCount: 4,
      }),
      expect.objectContaining({
        kind: "source-qualified-finding",
        targetRef: "rule-source-qualified-findings",
        distinctTaskCount: 2,
        observationCount: 4,
      }),
    ]);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("GOLD_VARIABLE");
    expect(serialized).not.toContain("TEST_ONLY_REPAIR_CANARY");
    expect(serialized).not.toContain('"expected"');
    expect(serialized).not.toContain('"payload"');
  });

  test("accepts a finer static residual when original failed its prerequisite", () => {
    const original = row("original", "node-dev", 1, [
      protectedPass,
      criterion("env-required-artifacts", false),
    ]);
    const staticRow = row("ir-static", "node-dev", 1, [protectedPass, requiredPass, schemaFail]);

    const evidence = buildDualSourceRepairEvidence([original, staticRow], {
      skillId: "env-manager",
      lineageCatalog: "env-manager/v1",
      minDistinctTasks: 1,
    });

    expect(evidence.records).toEqual([
      expect.objectContaining({
        criterionId: "env-schema-rules",
        lineage: "newly-observable",
        repairKind: "json-schema-contract",
      }),
    ]);
  });

  test("does not repair an original failure that static compilation resolved", () => {
    const original = row("original", "node-dev", 1, [classificationFail]);
    const staticRow = row("ir-static", "node-dev", 1, [criterion("env-classification", true)]);

    const evidence = buildDualSourceRepairEvidence([original, staticRow], {
      skillId: "env-manager",
      lineageCatalog: "env-manager/v1",
      minDistinctTasks: 1,
    });

    expect(evidence.records).toEqual([]);
    expect(evidence.repairs).toEqual([]);
    expect(evidence.resolvedCriteria).toEqual(["env-classification"]);
  });

  test("blocks Final IR evidence when static compilation introduces a regression", () => {
    const original = row("original", "node-dev", 1, [criterion("env-schema-rules", true)]);
    const staticRow = row("ir-static", "node-dev", 1, [schemaFail]);

    expect(() => buildDualSourceRepairEvidence([original, staticRow], {
      skillId: "env-manager",
      lineageCatalog: "env-manager/v1",
      minDistinctTasks: 1,
    })).toThrow("Static regression env-schema-rules");
  });

  test("counts task diversity rather than repeated rows", () => {
    const rows = [1, 2].flatMap((runIndex) => [
      row("original", "node-dev", runIndex, [schemaFail]),
      row("ir-static", "node-dev", runIndex, [schemaFail]),
    ]);

    const evidence = buildDualSourceRepairEvidence(rows, {
      skillId: "env-manager",
      lineageCatalog: "env-manager/v1",
      minDistinctTasks: 2,
    });

    expect(evidence.records).toHaveLength(2);
    expect(evidence.repairs).toEqual([]);
  });

  test("rejects held-out, partial identity, unmatched, and duplicate construction rows", () => {
    const [original, staticRow] = pairedResidualRows();
    if (!original || !staticRow) throw new Error("missing test rows");

    expect(() => buildDualSourceRepairEvidence([
      { ...original, taskSplit: "held-out" },
      { ...staticRow, taskSplit: "held-out" },
    ], { skillId: "env-manager", lineageCatalog: "env-manager/v1", minDistinctTasks: 1 })).toThrow("development");

    expect(() => buildDualSourceRepairEvidence([
      { ...original, modelFamily: undefined },
      staticRow,
    ], { skillId: "env-manager", lineageCatalog: "env-manager/v1", minDistinctTasks: 1 })).toThrow("complete run identity");

    expect(() => buildDualSourceRepairEvidence([staticRow], {
      skillId: "env-manager", lineageCatalog: "env-manager/v1", minDistinctTasks: 1,
    })).toThrow("paired original and ir-static");

    expect(() => buildDualSourceRepairEvidence([original, original, staticRow], {
      skillId: "env-manager", lineageCatalog: "env-manager/v1", minDistinctTasks: 1,
    })).toThrow("duplicate");
  });
});
