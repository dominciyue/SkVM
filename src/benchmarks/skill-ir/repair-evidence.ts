import { z } from "zod";
import type { ScoredAgentRunRow } from "./scoring";

export type RepairKind =
  | "json-schema-contract"
  | "source-qualified-finding"
  | "source-audited-rule-enforcement";
export type RepairLineage = "reproduced" | "newly-observable";

export type RepairEvidenceRecord = {
  evidenceId: string;
  taskId: string;
  runIndex: number;
  criterionId: string;
  lineage: RepairLineage;
  repairKind: RepairKind;
  targetRef: string;
};

export type RepairDirectiveEvidence = {
  id: string;
  kind: RepairKind;
  targetRef: string;
  distinctTaskCount: number;
  observationCount: number;
  taskIds: string[];
  evidenceIds: string[];
};

export type DualSourceRepairEvidence = {
  schemaVersion: "skill-ir-repair-evidence/v1";
  policyVersion: "dual-source-residual/v1";
  lineageCatalog: "env-manager/v1";
  skillId: string;
  sourceSystems: ["original", "ir-static"];
  minDistinctTasks: number;
  records: RepairEvidenceRecord[];
  repairs: RepairDirectiveEvidence[];
  resolvedCriteria: string[];
  regressions: [];
};

export const RepairEvidenceDigestRefSchema = z.object({
  path: z.string().min(1).refine((value) => {
    if (value.includes("\\") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) return false;
    return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }, "repair evidence path must be repository-relative"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
}).strict();

const FORBIDDEN_CATALOG_KEYS = new Set([
  "expected",
  "expectedAnswer",
  "gold",
  "goldAnswer",
  "sourceQuote",
  "rawModelContent",
  "secret",
  "absolutePath",
  "heldoutPrompt",
  "heldoutFixture",
  "evaluatorPayload",
  "payload",
]);

function findForbiddenCatalogKey(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenCatalogKey(item);
      if (found) return found;
    }
    return undefined;
  }
  if (value === null || typeof value !== "object") return undefined;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_CATALOG_KEYS.has(key)) return key;
    const found = findForbiddenCatalogKey(nested);
    if (found) return found;
  }
  return undefined;
}

export const DualSourceRepairMappingCatalogSchema = z.object({
  schemaVersion: z.literal("skill-ir-dual-source-repair-mapping/v1"),
  catalogId: z.string().regex(/^[a-z0-9][a-z0-9.-]+$/),
  skillId: z.string().min(1),
  scope: z.enum(["prospective-development", "analysis-only"]),
  repairCatalog: z.enum(["typed-output-repair/v1", "typed-output-repair/v2", "typed-output-repair/v3"]),
  sourceAudit: RepairEvidenceDigestRefSchema,
  criteria: z.array(z.object({
    criterionId: z.string().min(1),
    directiveId: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
    repairKind: z.enum(["json-schema-contract", "source-qualified-finding", "source-audited-rule-enforcement"]),
    targetRef: z.string().min(1),
    evidenceTargetRefs: z.array(z.string().min(1)).min(1),
    prerequisites: z.array(z.string().min(1)),
  }).strict()),
  stability: z.object({
    minDistinctTasks: z.number().int().min(2),
    minRepetitionsPerTask: z.number().int().min(2),
  }).strict(),
}).strict().superRefine((catalog, context) => {
  const forbidden = findForbiddenCatalogKey(catalog);
  if (forbidden) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `forbidden repair mapping field: ${forbidden}` });
  }
  const criteria = new Set<string>();
  const directiveSemantics = new Map<string, { repairKind: RepairKind; targetRef: string }>();
  const targetByRepairKind: Partial<Record<RepairKind, string>> = {
    "json-schema-contract": "rule-json-schema-contract",
    "source-qualified-finding": "rule-source-qualified-findings",
  };
  for (const [index, mapping] of catalog.criteria.entries()) {
    if (criteria.has(mapping.criterionId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate repair mapping criterion: ${mapping.criterionId}`,
        path: ["criteria", index, "criterionId"],
      });
    }
    const existingDirective = directiveSemantics.get(mapping.directiveId);
    if (existingDirective
      && (existingDirective.repairKind !== mapping.repairKind || existingDirective.targetRef !== mapping.targetRef)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `directive ${mapping.directiveId} has incompatible repair semantics`,
        path: ["criteria", index, "directiveId"],
      });
    } else {
      directiveSemantics.set(mapping.directiveId, {
        repairKind: mapping.repairKind,
        targetRef: mapping.targetRef,
      });
    }
    if (mapping.repairKind === "source-audited-rule-enforcement") {
      if (catalog.repairCatalog !== "typed-output-repair/v3") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "source-audited-rule-enforcement requires typed-output-repair/v3",
          path: ["criteria", index, "repairKind"],
        });
      }
      if (!mapping.targetRef.startsWith("rule-")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "source-audited-rule-enforcement must target an existing rule-* base IR rule",
          path: ["criteria", index, "targetRef"],
        });
      }
      if (!mapping.evidenceTargetRefs.includes(`rule:${mapping.targetRef}`)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "source-audited-rule-enforcement requires a matching source-audit rule target",
          path: ["criteria", index, "evidenceTargetRefs"],
        });
      }
    } else if (mapping.targetRef !== targetByRepairKind[mapping.repairKind]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `typed repair target for ${mapping.repairKind} must be ${targetByRepairKind[mapping.repairKind]}`,
        path: ["criteria", index, "targetRef"],
      });
    }
    criteria.add(mapping.criterionId);
    if (new Set(mapping.evidenceTargetRefs).size !== mapping.evidenceTargetRefs.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate evidence target for criterion: ${mapping.criterionId}`,
        path: ["criteria", index, "evidenceTargetRefs"],
      });
    }
  }
});

export type DualSourceRepairMappingCatalog = z.infer<typeof DualSourceRepairMappingCatalogSchema>;

const StaticGateAdmissionSchema = z.object({
  schemaVersion: z.literal("skill-ir-static-development-gate-report/v2"),
  experimentId: z.string().min(1),
  passed: z.boolean(),
  selection: z.object({
    complete: z.boolean(),
    selectedTriplets: z.number().int().nonnegative(),
    selectedRows: z.number().int().nonnegative(),
    attemptedRows: z.number().int().nonnegative(),
  }).passthrough(),
  selected: z.object({
    regressedPairs: z.number().int().nonnegative(),
    hardGateRegressions: z.number().int().nonnegative(),
    activeExecutionFailures: z.number().int().nonnegative(),
  }).passthrough(),
  allAttempts: z.object({
    parserOrRuntimeBlockers: z.number().int().nonnegative(),
  }).passthrough(),
  gates: z.object({
    selectedDenominatorComplete: z.boolean(),
    selectedScoringComplete: z.boolean(),
    noExecutionBlocker: z.boolean(),
  }).passthrough(),
  interpretation: z.object({ residualAuditAllowed: z.boolean() }).passthrough(),
}).passthrough();

export type DualSourceRepairAdmissionStatus =
  | "eligible"
  | "no-reproducible-residual"
  | "blocked-catalog-scope"
  | "blocked-static-gate"
  | "blocked-infrastructure"
  | "blocked-incomplete-denominator"
  | "blocked-static-regression"
  | "blocked-unmapped-residual";

type AdmissionBindings = {
  staticLock: z.infer<typeof RepairEvidenceDigestRefSchema>;
  staticGate: z.infer<typeof RepairEvidenceDigestRefSchema>;
  executionEnvelopes: z.infer<typeof RepairEvidenceDigestRefSchema>;
  scoredResults: z.infer<typeof RepairEvidenceDigestRefSchema>;
  baseIR: z.infer<typeof RepairEvidenceDigestRefSchema>;
  sourceAudit: z.infer<typeof RepairEvidenceDigestRefSchema>;
  mappingCatalog: z.infer<typeof RepairEvidenceDigestRefSchema>;
};

export type DualSourceRepairAdmissionInput = {
  skillId: string;
  experimentId: string;
  staticGate: z.input<typeof StaticGateAdmissionSchema>;
  bindings: AdmissionBindings;
  sourceAuditTargetRefs: string[];
  catalog: z.input<typeof DualSourceRepairMappingCatalogSchema>;
  rows: ScoredAgentRunRow[];
};

export type DualSourceRepairEvidenceV2 = {
  schemaVersion: "skill-ir-repair-evidence/v2";
  policyVersion: "dual-source-residual/v2";
  skillId: string;
  experimentId: string;
  catalogId: string;
  catalogScope: DualSourceRepairMappingCatalog["scope"];
  repairCatalog: DualSourceRepairMappingCatalog["repairCatalog"];
  sourceSystems: ["original", "ir-static"];
  stability: DualSourceRepairMappingCatalog["stability"];
  bindings: AdmissionBindings;
  admission: { status: DualSourceRepairAdmissionStatus; reasons: string[] };
  records: RepairEvidenceRecord[];
  repairs: Array<RepairDirectiveEvidence & { minRepetitionsPerTask: number }>;
  resolvedCriteria: string[];
  regressions: string[];
  unstableCriteria: string[];
  unmappedCriteria: string[];
};

export const DualSourceRepairEvidenceV2Schema = z.object({
  schemaVersion: z.literal("skill-ir-repair-evidence/v2"),
  policyVersion: z.literal("dual-source-residual/v2"),
  skillId: z.string().min(1),
  experimentId: z.string().min(1),
  catalogId: z.string().min(1),
  catalogScope: z.enum(["prospective-development", "analysis-only"]),
  repairCatalog: z.enum(["typed-output-repair/v1", "typed-output-repair/v2", "typed-output-repair/v3"]),
  sourceSystems: z.tuple([z.literal("original"), z.literal("ir-static")]),
  stability: z.object({
    minDistinctTasks: z.number().int().min(2),
    minRepetitionsPerTask: z.number().int().min(2),
  }).strict(),
  bindings: z.object({
    staticLock: RepairEvidenceDigestRefSchema,
    staticGate: RepairEvidenceDigestRefSchema,
    executionEnvelopes: RepairEvidenceDigestRefSchema,
    scoredResults: RepairEvidenceDigestRefSchema,
    baseIR: RepairEvidenceDigestRefSchema,
    sourceAudit: RepairEvidenceDigestRefSchema,
    mappingCatalog: RepairEvidenceDigestRefSchema,
  }).strict(),
  admission: z.object({
    status: z.enum([
      "eligible", "no-reproducible-residual", "blocked-catalog-scope", "blocked-static-gate",
      "blocked-infrastructure", "blocked-incomplete-denominator", "blocked-static-regression",
      "blocked-unmapped-residual",
    ]),
    reasons: z.array(z.string().min(1)),
  }).strict(),
  records: z.array(z.object({
    evidenceId: z.string().min(1), taskId: z.string().min(1), runIndex: z.number().int().positive(),
    criterionId: z.string().min(1), lineage: z.enum(["reproduced", "newly-observable"]),
    repairKind: z.enum(["json-schema-contract", "source-qualified-finding", "source-audited-rule-enforcement"]), targetRef: z.string().min(1),
  }).strict()),
  repairs: z.array(z.object({
    id: z.string().min(1), kind: z.enum(["json-schema-contract", "source-qualified-finding", "source-audited-rule-enforcement"]),
    targetRef: z.string().min(1), distinctTaskCount: z.number().int().nonnegative(),
    observationCount: z.number().int().nonnegative(), minRepetitionsPerTask: z.number().int().nonnegative(),
    taskIds: z.array(z.string().min(1)), evidenceIds: z.array(z.string().min(1)),
  }).strict()),
  resolvedCriteria: z.array(z.string().min(1)),
  regressions: z.array(z.string().min(1)),
  unstableCriteria: z.array(z.string().min(1)),
  unmappedCriteria: z.array(z.string().min(1)),
}).strict().superRefine((evidence, context) => {
  if (evidence.admission.status === "eligible") {
    if (evidence.admission.reasons.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "eligible evidence cannot contain stop reasons",
        path: ["admission", "reasons"],
      });
    }
    if (evidence.catalogScope !== "prospective-development" || evidence.repairs.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "eligible evidence requires prospective scope and at least one repair",
        path: ["admission", "status"],
      });
    }
  } else if (evidence.repairs.length > 0 || evidence.records.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "stopped evidence cannot contain repairs or admitted records",
      path: ["repairs"],
    });
  }
  for (const [index, repair] of evidence.repairs.entries()) {
    if (repair.distinctTaskCount < evidence.stability.minDistinctTasks
      || repair.minRepetitionsPerTask < evidence.stability.minRepetitionsPerTask) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "repair stability is below the admitted threshold",
        path: ["repairs", index],
      });
    }
    if (repair.distinctTaskCount !== new Set(repair.taskIds).size
      || repair.observationCount !== new Set(repair.evidenceIds).size) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "repair evidence counts do not match deduplicated identities",
        path: ["repairs", index],
      });
    }
    const recordsById = new Map(evidence.records.map((record) => [record.evidenceId, record]));
    if (repair.evidenceIds.some((evidenceId) => {
      const record = recordsById.get(evidenceId);
      return !record || record.repairKind !== repair.kind || record.targetRef !== repair.targetRef;
    })) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "repair evidence ids must resolve to admitted records with matching semantics",
        path: ["repairs", index, "evidenceIds"],
      });
    }
  }
});

type Options = {
  skillId: string;
  lineageCatalog: "env-manager/v1";
  minDistinctTasks: number;
};

type CriterionState = Map<string, boolean>;

const REPAIR_BY_CRITERION: Record<string, { kind: RepairKind; targetRef: string; prerequisites: string[] }> = {
  "env-classification": {
    kind: "source-qualified-finding",
    targetRef: "rule-source-qualified-findings",
    prerequisites: ["env-required-artifacts"],
  },
  "env-schema-rules": {
    kind: "json-schema-contract",
    targetRef: "rule-json-schema-contract",
    prerequisites: ["env-required-artifacts"],
  },
};

const IDENTITY_FIELDS = [
  "model",
  "modelFamily",
  "adapter",
  "adapterVersion",
  "runIndex",
  "panelConfigId",
] as const;

function completeIdentity(row: ScoredAgentRunRow): void {
  if (IDENTITY_FIELDS.some((field) => row[field] === undefined)) {
    throw new Error(`Dual-source row ${row.caseId} must provide complete run identity`);
  }
}

function pairKey(row: ScoredAgentRunRow): string {
  return JSON.stringify([
    row.caseId,
    row.model,
    row.modelFamily,
    row.adapter,
    row.adapterVersion,
    row.panelConfigId,
    row.runIndex,
  ]);
}

function criterionStates(row: ScoredAgentRunRow): CriterionState {
  if (row.successSource !== "deterministic-evaluator" || !row.evaluationSummary) {
    throw new Error(`Dual-source row ${row.caseId} requires deterministic evaluation summaries`);
  }
  const states = new Map<string, boolean>();
  for (const summary of row.evaluationSummary) {
    if (!summary.id) {
      throw new Error(`Dual-source row ${row.caseId} has a criterion without an id`);
    }
    if (states.has(summary.id)) {
      throw new Error(`Dual-source row ${row.caseId} has duplicate criterion ${summary.id}`);
    }
    states.set(summary.id, summary.pass);
  }
  return states;
}

function evidenceId(row: ScoredAgentRunRow, criterionId: string): string {
  return [
    "repair",
    row.skill,
    row.task,
    criterionId,
    `model=${encodeURIComponent(row.model!)}`,
    `adapter=${encodeURIComponent(row.adapter!)}`,
    `panel=${encodeURIComponent(row.panelConfigId!)}`,
    `run=${row.runIndex}`,
  ].join("-");
}

export function buildDualSourceRepairEvidence(
  rows: ScoredAgentRunRow[],
  options: Options,
): DualSourceRepairEvidence {
  if (!Number.isInteger(options.minDistinctTasks) || options.minDistinctTasks < 1) {
    throw new Error("minDistinctTasks must be a positive integer");
  }

  const relevant = rows.filter(
    (row) => row.skill === options.skillId && (row.system === "original" || row.system === "ir-static"),
  );
  const pairs = new Map<string, Partial<Record<"original" | "ir-static", ScoredAgentRunRow>>>();

  for (const row of relevant) {
    if (row.taskSplit !== "development") {
      throw new Error(`Dual-source construction accepts development rows only: ${row.task}`);
    }
    completeIdentity(row);
    const key = pairKey(row);
    const pair = pairs.get(key) ?? {};
    if (pair[row.system as "original" | "ir-static"]) {
      throw new Error(`Dual-source construction contains duplicate ${row.system} row for ${row.caseId}`);
    }
    pair[row.system as "original" | "ir-static"] = row;
    pairs.set(key, pair);
  }

  if (pairs.size === 0 || [...pairs.values()].some((pair) => !pair.original || !pair["ir-static"])) {
    throw new Error("Dual-source construction requires paired original and ir-static rows");
  }

  const records: RepairEvidenceRecord[] = [];
  const resolvedCriteria = new Set<string>();

  for (const pair of pairs.values()) {
    const original = pair.original!;
    const staticRow = pair["ir-static"]!;
    if (original.failureType === "infrastructure" || staticRow.failureType === "infrastructure") {
      continue;
    }
    const originalStates = criterionStates(original);
    const staticStates = criterionStates(staticRow);
    const criterionIds = new Set([...originalStates.keys(), ...staticStates.keys()]);

    for (const criterionId of criterionIds) {
      const originalPass = originalStates.get(criterionId);
      const staticPass = staticStates.get(criterionId);

      if (originalPass === true && staticPass === false) {
        throw new Error(`Static regression ${criterionId} for ${staticRow.caseId}`);
      }
      if (originalPass === false && staticPass === true) {
        resolvedCriteria.add(criterionId);
        continue;
      }
      if (staticPass !== false) {
        continue;
      }

      const mapping = REPAIR_BY_CRITERION[criterionId];
      if (!mapping) {
        throw new Error(`No typed repair mapping for static residual ${criterionId}`);
      }

      let lineage: RepairLineage;
      if (originalPass === false) {
        lineage = "reproduced";
      } else if (
        originalPass === undefined &&
        mapping.prerequisites.some((prerequisite) => originalStates.get(prerequisite) === false)
      ) {
        lineage = "newly-observable";
      } else {
        throw new Error(`Static residual ${criterionId} has no original failure lineage`);
      }

      records.push({
        evidenceId: evidenceId(staticRow, criterionId),
        taskId: staticRow.task,
        runIndex: staticRow.runIndex!,
        criterionId,
        lineage,
        repairKind: mapping.kind,
        targetRef: mapping.targetRef,
      });
    }
  }

  records.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const grouped = new Map<RepairKind, RepairEvidenceRecord[]>();
  for (const record of records) {
    grouped.set(record.repairKind, [...(grouped.get(record.repairKind) ?? []), record]);
  }

  const repairs = [...grouped.entries()]
    .map(([kind, kindRecords]) => {
      const taskIds = [...new Set(kindRecords.map((record) => record.taskId))].sort();
      const targetRef = kindRecords[0]!.targetRef;
      return {
        id: `repair-${kind}`,
        kind,
        targetRef,
        distinctTaskCount: taskIds.length,
        observationCount: kindRecords.length,
        taskIds,
        evidenceIds: kindRecords.map((record) => record.evidenceId).sort(),
      };
    })
    .filter((repair) => repair.distinctTaskCount >= options.minDistinctTasks)
    .sort((left, right) => left.kind.localeCompare(right.kind));

  return {
    schemaVersion: "skill-ir-repair-evidence/v1",
    policyVersion: "dual-source-residual/v1",
    lineageCatalog: options.lineageCatalog,
    skillId: options.skillId,
    sourceSystems: ["original", "ir-static"],
    minDistinctTasks: options.minDistinctTasks,
    records,
    repairs,
    resolvedCriteria: [...resolvedCriteria].sort(),
    regressions: [],
  };
}

function emptyAdmissionEvidence(input: {
  skillId: string;
  experimentId: string;
  catalog: DualSourceRepairMappingCatalog;
  bindings: AdmissionBindings;
  status: DualSourceRepairAdmissionStatus;
  reasons: string[];
  resolvedCriteria?: string[];
  regressions?: string[];
  unstableCriteria?: string[];
  unmappedCriteria?: string[];
}): DualSourceRepairEvidenceV2 {
  return DualSourceRepairEvidenceV2Schema.parse({
    schemaVersion: "skill-ir-repair-evidence/v2",
    policyVersion: "dual-source-residual/v2",
    skillId: input.skillId,
    experimentId: input.experimentId,
    catalogId: input.catalog.catalogId,
    catalogScope: input.catalog.scope,
    repairCatalog: input.catalog.repairCatalog,
    sourceSystems: ["original", "ir-static"],
    stability: input.catalog.stability,
    bindings: input.bindings,
    admission: { status: input.status, reasons: [...input.reasons].sort() },
    records: [],
    repairs: [],
    resolvedCriteria: [...(input.resolvedCriteria ?? [])].sort(),
    regressions: [...(input.regressions ?? [])].sort(),
    unstableCriteria: [...(input.unstableCriteria ?? [])].sort(),
    unmappedCriteria: [...(input.unmappedCriteria ?? [])].sort(),
  });
}

function admissionPairRows(rows: ScoredAgentRunRow[], skillId: string) {
  const relevant = rows.filter(
    (row) => row.skill === skillId && (row.system === "original" || row.system === "ir-static"),
  );
  const pairs = new Map<string, Partial<Record<"original" | "ir-static", ScoredAgentRunRow>>>();
  for (const row of relevant) {
    if (row.taskSplit !== "development") {
      throw new Error(`Dual-source construction accepts development rows only: ${row.task}`);
    }
    completeIdentity(row);
    const key = pairKey(row);
    const pair = pairs.get(key) ?? {};
    if (pair[row.system as "original" | "ir-static"]) {
      throw new Error(`Dual-source construction contains duplicate ${row.system} row for ${row.caseId}`);
    }
    pair[row.system as "original" | "ir-static"] = row;
    pairs.set(key, pair);
  }
  if (pairs.size === 0 || [...pairs.values()].some((pair) => !pair.original || !pair["ir-static"])) {
    throw new Error("Dual-source construction requires paired original and ir-static rows");
  }
  return [...pairs.values()] as Array<{ original: ScoredAgentRunRow; "ir-static": ScoredAgentRunRow }>;
}

export function buildDualSourceRepairAdmission(
  input: DualSourceRepairAdmissionInput,
): DualSourceRepairEvidenceV2 {
  const gate = StaticGateAdmissionSchema.parse(input.staticGate);
  const catalog = DualSourceRepairMappingCatalogSchema.parse(input.catalog);
  const bindings = Object.fromEntries(
    Object.entries(input.bindings).map(([key, value]) => [key, RepairEvidenceDigestRefSchema.parse(value)]),
  ) as AdmissionBindings;
  if (catalog.skillId !== input.skillId) {
    throw new Error(`Repair mapping catalog skill ${catalog.skillId} does not match ${input.skillId}`);
  }
  if (gate.experimentId !== input.experimentId) {
    throw new Error(`Static gate experiment ${gate.experimentId} does not match ${input.experimentId}`);
  }
  if (catalog.sourceAudit.path !== bindings.sourceAudit.path
    || catalog.sourceAudit.sha256 !== bindings.sourceAudit.sha256) {
    throw new Error("Repair mapping catalog source audit binding mismatch");
  }
  const publicTargets = new Set(input.sourceAuditTargetRefs);
  for (const mapping of catalog.criteria) {
    for (const target of mapping.evidenceTargetRefs) {
      if (!publicTargets.has(target)) {
        throw new Error(`Repair mapping ${mapping.criterionId} references missing source-audit target ${target}`);
      }
    }
  }

  const base = { skillId: input.skillId, experimentId: input.experimentId, catalog, bindings };
  if (!gate.selection.complete
    || !gate.gates.selectedDenominatorComplete
    || !gate.gates.selectedScoringComplete
    || gate.selection.selectedRows !== gate.selection.selectedTriplets * 3
    || gate.selection.attemptedRows < gate.selection.selectedRows) {
    return emptyAdmissionEvidence({
      ...base,
      status: "blocked-incomplete-denominator",
      reasons: ["static selected denominator or deterministic scoring is incomplete"],
    });
  }
  if (gate.selected.activeExecutionFailures > 0
    || gate.allAttempts.parserOrRuntimeBlockers > 0
    || !gate.gates.noExecutionBlocker) {
    return emptyAdmissionEvidence({
      ...base,
      status: "blocked-infrastructure",
      reasons: ["static evidence contains an active execution, parser, runtime, or measurement blocker"],
    });
  }
  if (!gate.passed || !gate.interpretation.residualAuditAllowed) {
    return emptyAdmissionEvidence({
      ...base,
      status: "blocked-static-gate",
      reasons: ["static development gate does not permit residual audit"],
    });
  }

  const pairs = admissionPairRows(input.rows, input.skillId);
  if (pairs.length !== gate.selection.selectedTriplets) {
    return emptyAdmissionEvidence({
      ...base,
      status: "blocked-incomplete-denominator",
      reasons: ["paired original/ir-static rows do not match the selected static triplet denominator"],
    });
  }
  const mappingByCriterion = new Map(catalog.criteria.map((mapping) => [mapping.criterionId, mapping]));
  const records: RepairEvidenceRecord[] = [];
  const resolvedCriteria = new Set<string>();
  const regressionCriteria = new Set<string>();
  const unmappedCriteria = new Set<string>();

  for (const pair of pairs) {
    const original = pair.original;
    const staticRow = pair["ir-static"];
    if (original.failureType === "infrastructure" || staticRow.failureType === "infrastructure") {
      return emptyAdmissionEvidence({
        ...base,
        status: "blocked-infrastructure",
        reasons: ["selected scored pair contains an infrastructure failure"],
      });
    }
    const originalStates = criterionStates(original);
    const staticStates = criterionStates(staticRow);
    const originalOnlyCriteria = [...originalStates.keys()].filter((criterionId) => !staticStates.has(criterionId));
    const unexplainedStaticOnlyCriteria = [...staticStates.keys()].filter((criterionId) => {
      if (originalStates.has(criterionId)) return false;
      const mapping = mappingByCriterion.get(criterionId);
      return !mapping || !mapping.prerequisites.some((prerequisite) => originalStates.get(prerequisite) === false);
    });
    if (originalOnlyCriteria.length > 0 || unexplainedStaticOnlyCriteria.length > 0) {
      return emptyAdmissionEvidence({
        ...base,
        status: "blocked-incomplete-denominator",
        reasons: ["paired original/ir-static criterion drift is not explained by a public failed prerequisite"],
      });
    }
    const criterionIds = new Set([...originalStates.keys(), ...staticStates.keys()]);
    for (const criterionId of criterionIds) {
      const originalPass = originalStates.get(criterionId);
      const staticPass = staticStates.get(criterionId);
      if (originalPass === true && staticPass === false) {
        regressionCriteria.add(criterionId);
        continue;
      }
      if (originalPass === false && staticPass === true) {
        resolvedCriteria.add(criterionId);
        continue;
      }
      if (staticPass !== false) continue;
      const mapping = mappingByCriterion.get(criterionId);
      if (!mapping) {
        unmappedCriteria.add(criterionId);
        continue;
      }
      let lineage: RepairLineage | undefined;
      if (originalPass === false) {
        lineage = "reproduced";
      } else if (originalPass === undefined
        && mapping.prerequisites.some((prerequisite) => originalStates.get(prerequisite) === false)) {
        lineage = "newly-observable";
      }
      if (!lineage) continue;
      records.push({
        evidenceId: evidenceId(staticRow, criterionId),
        taskId: staticRow.task,
        runIndex: staticRow.runIndex!,
        criterionId,
        lineage,
        repairKind: mapping.repairKind,
        targetRef: mapping.targetRef,
      });
    }
  }

  if (regressionCriteria.size > 0 || gate.selected.regressedPairs > 0 || gate.selected.hardGateRegressions > 0) {
    return emptyAdmissionEvidence({
      ...base,
      status: "blocked-static-regression",
      reasons: ["static evidence contains a criterion, score, or hard-gate regression"],
      resolvedCriteria: [...resolvedCriteria],
      regressions: [...regressionCriteria],
    });
  }

  const stableCriteria = new Set<string>();
  const unstableCriteria = new Set<string>();
  const residualObservations = new Map<string, Array<{ taskId: string; runIndex: number }>>();
  for (const record of records) {
    residualObservations.set(record.criterionId, [
      ...(residualObservations.get(record.criterionId) ?? []),
      { taskId: record.taskId, runIndex: record.runIndex },
    ]);
  }
  for (const pair of pairs) {
    const originalStates = criterionStates(pair.original);
    const staticStates = criterionStates(pair["ir-static"]);
    for (const criterionId of unmappedCriteria) {
      if (originalStates.get(criterionId) === false && staticStates.get(criterionId) === false) {
        residualObservations.set(criterionId, [
          ...(residualObservations.get(criterionId) ?? []),
          { taskId: pair["ir-static"].task, runIndex: pair["ir-static"].runIndex! },
        ]);
      }
    }
  }
  for (const [criterionId, observations] of residualObservations) {
    const repetitionsByTask = new Map<string, Set<number>>();
    for (const observation of observations) {
      const repetitions = repetitionsByTask.get(observation.taskId) ?? new Set<number>();
      repetitions.add(observation.runIndex);
      repetitionsByTask.set(observation.taskId, repetitions);
    }
    const stableTasks = [...repetitionsByTask.values()]
      .filter((repetitions) => repetitions.size >= catalog.stability.minRepetitionsPerTask).length;
    if (stableTasks >= catalog.stability.minDistinctTasks) stableCriteria.add(criterionId);
    else unstableCriteria.add(criterionId);
  }

  const stableUnmapped = [...unmappedCriteria].filter((criterionId) => stableCriteria.has(criterionId));
  if (stableUnmapped.length > 0) {
    return emptyAdmissionEvidence({
      ...base,
      status: "blocked-unmapped-residual",
      reasons: ["static residual has no public typed repair mapping"],
      resolvedCriteria: [...resolvedCriteria],
      unstableCriteria: [...unstableCriteria],
      unmappedCriteria: stableUnmapped,
    });
  }

  const stableRecords = records
    .filter((record) => stableCriteria.has(record.criterionId))
    .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  const grouped = new Map<string, RepairEvidenceRecord[]>();
  for (const record of stableRecords) {
    const mapping = mappingByCriterion.get(record.criterionId)!;
    grouped.set(mapping.directiveId, [...(grouped.get(mapping.directiveId) ?? []), record]);
  }
  const repairs = [...grouped.entries()].map(([directiveId, directiveRecords]) => {
    const first = directiveRecords[0]!;
    const taskIds = [...new Set(directiveRecords.map((record) => record.taskId))].sort();
    const repetitionsByTask = taskIds.map((taskId) =>
      new Set(directiveRecords.filter((record) => record.taskId === taskId).map((record) => record.runIndex)).size);
    return {
      id: directiveId,
      kind: first.repairKind,
      targetRef: first.targetRef,
      distinctTaskCount: taskIds.length,
      observationCount: directiveRecords.length,
      minRepetitionsPerTask: Math.min(...repetitionsByTask),
      taskIds,
      evidenceIds: directiveRecords.map((record) => record.evidenceId).sort(),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));

  if (repairs.length > 0 && catalog.scope !== "prospective-development") {
    return emptyAdmissionEvidence({
      ...base,
      status: "blocked-catalog-scope",
      reasons: ["analysis-only repair mapping catalog cannot authorize Final IR construction"],
      resolvedCriteria: [...resolvedCriteria],
      unstableCriteria: [...unstableCriteria],
    });
  }

  const status: DualSourceRepairAdmissionStatus = repairs.length > 0
    ? "eligible"
    : "no-reproducible-residual";
  return DualSourceRepairEvidenceV2Schema.parse({
    schemaVersion: "skill-ir-repair-evidence/v2",
    policyVersion: "dual-source-residual/v2",
    skillId: input.skillId,
    experimentId: input.experimentId,
    catalogId: catalog.catalogId,
    catalogScope: catalog.scope,
    repairCatalog: catalog.repairCatalog,
    sourceSystems: ["original", "ir-static"],
    stability: catalog.stability,
    bindings,
    admission: {
      status,
      reasons: status === "eligible" ? [] : ["no criterion residual met the preregistered task/repetition threshold"],
    },
    records: stableRecords,
    repairs,
    resolvedCriteria: [...resolvedCriteria].sort(),
    regressions: [],
    unstableCriteria: [...unstableCriteria].sort(),
    unmappedCriteria: [],
  });
}
