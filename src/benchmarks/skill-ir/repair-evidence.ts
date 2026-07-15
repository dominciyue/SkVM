import type { ScoredAgentRunRow } from "./scoring";

export type RepairKind = "json-schema-contract" | "source-qualified-finding";
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
