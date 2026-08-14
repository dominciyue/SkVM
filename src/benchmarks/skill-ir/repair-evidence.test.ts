import { describe, expect, test } from "bun:test";
import type { ScoredAgentRunRow } from "./scoring";
import {
  DualSourceRepairMappingCatalogSchema,
  DualSourceRepairEvidenceV2Schema,
  buildDualSourceRepairAdmission,
  buildDualSourceRepairEvidence,
  type DualSourceRepairAdmissionInput,
  type DualSourceRepairAdmissionStatus,
} from "./repair-evidence";

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

function admissionInput(rows: ScoredAgentRunRow[] = pairedResidualRows()): DualSourceRepairAdmissionInput {
  return {
    skillId: "env-manager",
    experimentId: "env-manager-static-v1",
    staticGate: {
      schemaVersion: "skill-ir-static-development-gate-report/v2",
      experimentId: "env-manager-static-v1",
      passed: true,
      selection: { complete: true, selectedTriplets: 4, selectedRows: 12, attemptedRows: 12 },
      selected: { regressedPairs: 0, hardGateRegressions: 0, activeExecutionFailures: 0 },
      allAttempts: { parserOrRuntimeBlockers: 0 },
      gates: { selectedDenominatorComplete: true, selectedScoringComplete: true, noExecutionBlocker: true },
      interpretation: { residualAuditAllowed: true },
    },
    bindings: {
      staticLock: { path: "lock.json", sha256: "1".repeat(64) },
      staticGate: { path: "gate.json", sha256: "2".repeat(64) },
      executionEnvelopes: { path: "envelopes.jsonl", sha256: "3".repeat(64) },
      scoredResults: { path: "scored.jsonl", sha256: "4".repeat(64) },
      baseIR: { path: "base-ir.json", sha256: "5".repeat(64) },
      sourceAudit: { path: "source-audit.json", sha256: "6".repeat(64) },
      mappingCatalog: { path: "mapping.json", sha256: "7".repeat(64) },
    },
    sourceAuditTargetRefs: ["rule:rule-json-schema-contract", "rule:rule-source-qualified-findings"],
    catalog: {
      schemaVersion: "skill-ir-dual-source-repair-mapping/v1",
      catalogId: "env-manager-public-residuals",
      skillId: "env-manager",
      scope: "prospective-development",
      repairCatalog: "typed-output-repair/v1",
      sourceAudit: { path: "source-audit.json", sha256: "6".repeat(64) },
      criteria: [
        {
          criterionId: "env-classification",
          directiveId: "repair-source-qualified-finding",
          repairKind: "source-qualified-finding",
          targetRef: "rule-source-qualified-findings",
          evidenceTargetRefs: ["rule:rule-source-qualified-findings"],
          prerequisites: ["env-required-artifacts"],
        },
        {
          criterionId: "env-schema-rules",
          directiveId: "repair-json-schema-contract",
          repairKind: "json-schema-contract",
          targetRef: "rule-json-schema-contract",
          evidenceTargetRefs: ["rule:rule-json-schema-contract"],
          prerequisites: ["env-required-artifacts"],
        },
      ],
      stability: { minDistinctTasks: 2, minRepetitionsPerTask: 2 },
    },
    rows,
  };
}

describe("generic dual-source residual admission", () => {
  test("admits only per-criterion residuals reproduced across tasks and repetitions", () => {
    const evidence = buildDualSourceRepairAdmission(admissionInput());

    expect(evidence).toMatchObject({
      schemaVersion: "skill-ir-repair-evidence/v2",
      policyVersion: "dual-source-residual/v2",
      admission: { status: "eligible" },
      catalogId: "env-manager-public-residuals",
      catalogScope: "prospective-development",
      repairCatalog: "typed-output-repair/v1",
      repairs: [
        { id: "repair-json-schema-contract", distinctTaskCount: 2, minRepetitionsPerTask: 2 },
        { id: "repair-source-qualified-finding", distinctTaskCount: 2, minRepetitionsPerTask: 2 },
      ],
    });
    expect(evidence.bindings.mappingCatalog.sha256).toBe("7".repeat(64));
  });

  test("returns a typed stop when the static gate passed but no stable residual remains", () => {
    const rows = ["node-dev", "vite-dev"].flatMap((task) => [1, 2].flatMap((runIndex) => [
      row("original", task, runIndex, [criterion("env-schema-rules", false)]),
      row("ir-static", task, runIndex, [criterion("env-schema-rules", true)]),
    ]));

    const evidence = buildDualSourceRepairAdmission(admissionInput(rows));

    expect(evidence.admission.status).toBe("no-reproducible-residual");
    expect(evidence.repairs).toEqual([]);
    expect(evidence.resolvedCriteria).toEqual(["env-schema-rules"]);
  });

  test("does not pool different one-task criteria into one repair", () => {
    const rows = [1, 2].flatMap((runIndex) => [
      row("original", "node-dev", runIndex, [schemaFail]),
      row("ir-static", "node-dev", runIndex, [schemaFail]),
      row("original", "vite-dev", runIndex, [classificationFail]),
      row("ir-static", "vite-dev", runIndex, [classificationFail]),
    ]);

    const evidence = buildDualSourceRepairAdmission(admissionInput(rows));

    expect(evidence.admission.status).toBe("no-reproducible-residual");
    expect(evidence.repairs).toEqual([]);
  });

  test("admits a stable static-only residual only when its public prerequisite failed in original", () => {
    const rows = ["node-dev", "vite-dev"].flatMap((task) => [1, 2].flatMap((runIndex) => [
      row("original", task, runIndex, [criterion("env-required-artifacts", false)]),
      row("ir-static", task, runIndex, [requiredPass, schemaFail]),
    ]));

    const evidence = buildDualSourceRepairAdmission(admissionInput(rows));

    expect(evidence.admission.status).toBe("eligible");
    expect(evidence.records).toHaveLength(4);
    expect(evidence.records.every((record) => record.lineage === "newly-observable")).toBe(true);
  });

  test("blocks unexplained static-only criterion drift", () => {
    const rows = ["node-dev", "vite-dev"].flatMap((task) => [1, 2].flatMap((runIndex) => [
      row("original", task, runIndex, [requiredPass]),
      row("ir-static", task, runIndex, [requiredPass, schemaFail]),
    ]));

    expect(buildDualSourceRepairAdmission(admissionInput(rows)).admission.status)
      .toBe("blocked-incomplete-denominator");
  });

  test("does not block on an unmapped residual below the stability threshold", () => {
    const base = admissionInput();
    const rows = pairedResidualRows().map((candidate) => candidate.task === "node-dev" && candidate.runIndex === 1
      ? {
          ...candidate,
          evaluationSummary: [...candidate.evaluationSummary!, criterion("one-off-public-criterion", false)],
        }
      : candidate);

    const evidence = buildDualSourceRepairAdmission({ ...base, rows });

    expect(evidence.admission.status).toBe("eligible");
    expect(evidence.unmappedCriteria).toEqual([]);
    expect(evidence.unstableCriteria).toContain("one-off-public-criterion");
  });

  test("blocks a stable residual when the catalog is analysis-only", () => {
    const base = admissionInput();
    const evidence = buildDualSourceRepairAdmission({
      ...base,
      catalog: { ...base.catalog, scope: "analysis-only" },
    });

    expect(evidence.admission.status).toBe("blocked-catalog-scope");
    expect(evidence.repairs).toEqual([]);
  });

  test("binds the selected typed repair catalog into admission evidence", () => {
    const base = admissionInput();
    const evidence = buildDualSourceRepairAdmission({
      ...base,
      catalog: { ...base.catalog, repairCatalog: "typed-output-repair/v2" },
    });

    expect(evidence.repairCatalog).toBe("typed-output-repair/v2");
  });

  test("admits generic rule enforcement only with a v3 catalog and the matching audited rule target", () => {
    const base = admissionInput();
    const rows = ["power-dev-a", "power-dev-b"].flatMap((task) => [1, 2].flatMap((runIndex) => [
      row("original", task, runIndex, [criterion("power-sensitivity", false)]),
      row("ir-static", task, runIndex, [criterion("power-sensitivity", false)]),
    ]));
    const genericCatalog = {
      ...base.catalog,
      catalogId: "statistical-power-public-residuals",
      repairCatalog: "typed-output-repair/v3",
      criteria: [{
        criterionId: "power-sensitivity",
        directiveId: "repair-sensitivity-analysis",
        repairKind: "source-audited-rule-enforcement",
        targetRef: "rule-sensitivity-analysis",
        evidenceTargetRefs: ["rule:rule-sensitivity-analysis"],
        prerequisites: [],
      }],
    };

    const evidence = buildDualSourceRepairAdmission({
      ...base,
      rows,
      sourceAuditTargetRefs: ["rule:rule-sensitivity-analysis"],
      catalog: genericCatalog,
    } as never);

    expect(evidence.admission.status).toBe("eligible");
    expect(evidence.repairCatalog).toBe("typed-output-repair/v3");
    expect(evidence.repairs).toContainEqual(expect.objectContaining({
      id: "repair-sensitivity-analysis",
      kind: "source-audited-rule-enforcement",
      targetRef: "rule-sensitivity-analysis",
    }));

    expect(() => DualSourceRepairMappingCatalogSchema.parse({
      ...genericCatalog,
      repairCatalog: "typed-output-repair/v2",
    })).toThrow("requires typed-output-repair/v3");
    expect(() => DualSourceRepairMappingCatalogSchema.parse({
      ...genericCatalog,
      criteria: [{ ...genericCatalog.criteria[0], targetRef: "step-sensitivity-analysis" }],
    })).toThrow("existing rule");
    expect(() => DualSourceRepairMappingCatalogSchema.parse({
      ...genericCatalog,
      criteria: [{
        ...genericCatalog.criteria[0],
        evidenceTargetRefs: ["rule:rule-other"],
      }],
    })).toThrow("matching source-audit rule target");
  });

  test("fails closed on criterion-set drift and a mismatched pair denominator", () => {
    const base = admissionInput();
    const criterionDrift = base.rows.map((candidate, index) => index === 0
      ? { ...candidate, evaluationSummary: candidate.evaluationSummary!.slice(1) }
      : candidate);
    expect(buildDualSourceRepairAdmission({ ...base, rows: criterionDrift }).admission.status)
      .toBe("blocked-incomplete-denominator");
    expect(buildDualSourceRepairAdmission({ ...base, rows: base.rows.slice(0, 2) }).admission.status)
      .toBe("blocked-incomplete-denominator");
    expect(buildDualSourceRepairAdmission({
      ...base,
      staticGate: {
        ...base.staticGate,
        selection: { ...base.staticGate.selection, selectedRows: 11 },
      },
    }).admission.status).toBe("blocked-incomplete-denominator");
  });

  test("blocks incomplete, infrastructure, gate-failed, regression, and unmapped residual evidence", () => {
    const base = admissionInput();
    const regressionRows = ["node-dev", "vite-dev"].flatMap((task) => [1, 2].flatMap((runIndex) => [
      row("original", task, runIndex, [criterion("env-schema-rules", true)]),
      row("ir-static", task, runIndex, [criterion(
        "env-schema-rules",
        !(task === "node-dev" && runIndex === 1),
      )]),
    ]));
    const cases: Array<[Partial<DualSourceRepairAdmissionInput>, DualSourceRepairAdmissionStatus]> = [
      [{ staticGate: { ...base.staticGate, selection: { ...base.staticGate.selection, complete: false } } }, "blocked-incomplete-denominator"],
      [{ staticGate: { ...base.staticGate, selected: { ...base.staticGate.selected, activeExecutionFailures: 1 } } }, "blocked-infrastructure"],
      [{ staticGate: { ...base.staticGate, passed: false, interpretation: { residualAuditAllowed: false } } }, "blocked-static-gate"],
      [{ rows: regressionRows }, "blocked-static-regression"],
      [{ catalog: { ...base.catalog, criteria: [] } }, "blocked-unmapped-residual"],
    ];

    for (const [overrides, expected] of cases) {
      const evidence = buildDualSourceRepairAdmission({ ...base, ...overrides });
      expect(evidence.admission.status).toBe(expected);
      expect(evidence.repairs).toEqual([]);
    }
  });

  test("requires public source-audit targets and rejects forbidden sinks", () => {
    const base = admissionInput();
    expect(() => buildDualSourceRepairAdmission({
      ...base,
      sourceAuditTargetRefs: ["rule:rule-json-schema-contract"],
    })).toThrow("source-audit target");
    expect(() => buildDualSourceRepairAdmission({
      ...base,
      catalog: {
        ...base.catalog,
        sourceAudit: { ...base.catalog.sourceAudit, sha256: "8".repeat(64) },
      },
    })).toThrow("source audit binding");
    expect(() => DualSourceRepairMappingCatalogSchema.parse({
      ...base.catalog,
      expected: { secret: "TEST_ONLY_GOLD" },
    })).toThrow();
  });

  test("rejects one directive id mapped to incompatible repair semantics", () => {
    const base = admissionInput();
    expect(() => DualSourceRepairMappingCatalogSchema.parse({
      ...base.catalog,
      criteria: base.catalog.criteria.map((mapping, index) => index === 0
        ? { ...mapping, directiveId: "repair-shared" }
        : { ...mapping, directiveId: "repair-shared" }),
    })).toThrow("incompatible repair semantics");
    expect(() => DualSourceRepairMappingCatalogSchema.parse({
      ...base.catalog,
      criteria: base.catalog.criteria.map((mapping, index) => index === 0
        ? { ...mapping, targetRef: "rule-wrong-template" }
        : mapping),
    })).toThrow("typed repair target");
  });

  test("rejects internally inconsistent admitted evidence", () => {
    const eligible = buildDualSourceRepairAdmission(admissionInput());
    expect(() => DualSourceRepairEvidenceV2Schema.parse({
      ...eligible,
      admission: { status: "eligible", reasons: ["contradiction"] },
    })).toThrow("eligible evidence cannot contain stop reasons");
    expect(() => DualSourceRepairEvidenceV2Schema.parse({
      ...eligible,
      admission: { status: "no-reproducible-residual", reasons: ["none"] },
    })).toThrow("stopped evidence cannot contain repairs");
    expect(() => DualSourceRepairEvidenceV2Schema.parse({
      ...eligible,
      repairs: eligible.repairs.map((repair) => ({ ...repair, distinctTaskCount: 1 })),
    })).toThrow("repair stability is below the admitted threshold");
    expect(() => DualSourceRepairEvidenceV2Schema.parse({
      ...eligible,
      records: [],
    })).toThrow("repair evidence ids must resolve to admitted records");
    expect(() => DualSourceRepairEvidenceV2Schema.parse({
      ...eligible,
      repairs: eligible.repairs.map((repair, index) => index === 0
        ? { ...repair, observationCount: repair.observationCount + 1 }
        : repair),
    })).toThrow("repair evidence counts");
  });
});
