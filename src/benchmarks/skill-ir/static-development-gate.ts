import type { StaticDevelopmentLock } from "./static-development";
import { parseCaseId, type RawAgentRunRow, type ScoredAgentRunRow } from "./scoring";

type StaticSystem = "no-skill" | "original" | "ir-static";

export type StaticDevelopmentGateTask = {
  id: string;
  split: string;
  hardGateIds: string[];
};

export type StaticDevelopmentPair = {
  taskId: string;
  runIndex: number;
  status: "complete" | "incomplete" | "infrastructure";
  originalScore?: number;
  irStaticScore?: number;
  scoreDelta?: number;
  successImproved: boolean;
  hardGateRegression: boolean;
  improved: boolean;
  criterionTransitions: { improved: string[]; regressed: string[] };
};

export type StaticDevelopmentGateReport = {
  schemaVersion: "skill-ir-static-development-gate-report/v1";
  experimentId: string;
  methodEvidence: true;
  passed: boolean;
  counts: {
    expectedRows: number;
    observedRawRows: number;
    observedScoredRows: number;
    expectedTriplets: number;
    completeTriplets: number;
    infrastructureFailures: number;
    hardGateRegressions: number;
    improvedPairs: number;
    regressedPairs: number;
  };
  systems: Record<StaticSystem, {
    expectedRows: number;
    observedRows: number;
    successes: number;
    meanScoreIncludingMissing: number;
    inputTokens: number;
    outputTokens: number;
    aggregateTokens: number;
  }>;
  pairs: StaticDevelopmentPair[];
  gates: {
    completeRows: boolean;
    completeTriplets: boolean;
    minimumIrStaticSuccesses: boolean;
    minimumIrStaticMeanScore: boolean;
    maximumInfrastructureFailures: boolean;
    maximumHardGateRegressions: boolean;
    minimumImprovedPairs: boolean;
    maximumRegressedPairs: boolean;
  };
  interpretation: {
    heldOutPlanningAllowed: boolean;
    residualAuditAllowed?: boolean;
    heldOutExecutionAllowed: false;
    entersMainClaim: false;
  };
};

type BuildStaticDevelopmentGateOptions = {
  lock: StaticDevelopmentLock;
  tasks: StaticDevelopmentGateTask[];
  rawRows: RawAgentRunRow[];
  scoredRows: ScoredAgentRunRow[];
};

function rowKey(taskId: string, runIndex: number, system: StaticSystem): string {
  return `${taskId}\0${runIndex}\0${system}`;
}

function scoreOf(row: ScoredAgentRunRow): number {
  return row.evaluatorScore ?? (row.success ? 1 : 0);
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function criterionPasses(row: ScoredAgentRunRow): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (const [index, criterion] of (row.evaluationSummary ?? []).entries()) {
    const id = criterion.id?.trim() || criterion.name?.trim() || `${criterion.method}#${index + 1}`;
    result.set(id, criterion.pass);
  }
  return result;
}

function hardGatesPass(row: ScoredAgentRunRow, ids: string[]): boolean {
  const criteria = criterionPasses(row);
  return ids.every((id) => criteria.get(id) === true);
}

function isInfrastructure(raw: RawAgentRunRow | undefined, scored: ScoredAgentRunRow | undefined): boolean {
  if (!raw || !scored) return true;
  return raw.exitCode !== 0
    || (raw.runStatus !== undefined && raw.runStatus !== "ok")
    || scored.failureType === "infrastructure"
    || (scored.runStatus !== undefined && scored.runStatus !== "ok");
}

function assertIdentity(
  row: RawAgentRunRow | ScoredAgentRunRow,
  lock: StaticDevelopmentLock,
): { taskId: string; system: StaticSystem; runIndex: number } {
  const parsed = parseCaseId(row.caseId);
  for (const [label, actual, expected] of [
    ["skill", parsed.skill, lock.skillId],
    ["agent", parsed.agent, lock.matrix.agents[0]],
    ["environment", parsed.environment, lock.matrix.environments[0]],
    ["context", parsed.context, lock.matrix.contexts[0]],
    ["model", row.model, lock.model.route],
    ["model family", row.modelFamily, lock.model.family],
    ["adapter", row.adapter, lock.adapter.id],
    ["adapter version", row.adapterVersion, lock.adapter.version],
    ["panel", row.panelConfigId, lock.experimentId],
  ] as const) {
    if (actual !== expected) throw new Error(`Static development gate ${label} identity mismatch`);
  }
  if (!lock.matrix.taskIds.includes(parsed.task)) {
    throw new Error(`Static development gate unexpected task ${parsed.task}`);
  }
  if (row.system !== "no-skill" && row.system !== "original" && row.system !== "ir-static") {
    throw new Error(`Static development gate unexpected system ${row.system}`);
  }
  if (!Number.isInteger(row.runIndex) || row.runIndex! < 1 || row.runIndex! > lock.matrix.repetitions) {
    throw new Error("Static development gate run index mismatch");
  }
  if ("task" in row) {
    if (row.task !== parsed.task || row.taskSplit !== lock.matrix.taskSplit) {
      throw new Error("Static development gate scored task identity mismatch");
    }
  }
  return { taskId: parsed.task, system: row.system, runIndex: row.runIndex! };
}

function indexRows<T extends RawAgentRunRow | ScoredAgentRunRow>(
  rows: T[],
  lock: StaticDevelopmentLock,
  label: "raw" | "scored",
): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const row of rows) {
    const identity = assertIdentity(row, lock);
    const key = rowKey(identity.taskId, identity.runIndex, identity.system);
    if (indexed.has(key)) throw new Error(`Static development gate duplicate ${label} row: ${key}`);
    indexed.set(key, row);
  }
  return indexed;
}

export function buildStaticDevelopmentGateReport(
  options: BuildStaticDevelopmentGateOptions,
): StaticDevelopmentGateReport {
  const { lock } = options;
  const taskById = new Map(options.tasks.map((task) => [task.id, task]));
  for (const taskId of lock.matrix.taskIds) {
    const task = taskById.get(taskId);
    if (!task || task.split !== lock.matrix.taskSplit) {
      throw new Error(`Static development gate requires development task ${taskId}`);
    }
  }
  const raw = indexRows(options.rawRows, lock, "raw");
  const scored = indexRows(options.scoredRows, lock, "scored");
  const expectedPerSystem = lock.matrix.expectedTriplets;
  let completeTriplets = 0;
  let infrastructureFailures = 0;

  for (const taskId of lock.matrix.taskIds) {
    for (let runIndex = 1; runIndex <= lock.matrix.repetitions; runIndex += 1) {
      let complete = true;
      for (const system of lock.matrix.systems) {
        const key = rowKey(taskId, runIndex, system);
        const rawRow = raw.get(key);
        const scoredRow = scored.get(key);
        if (!rawRow || !scoredRow) complete = false;
        if (isInfrastructure(rawRow, scoredRow)) infrastructureFailures += 1;
      }
      if (complete) completeTriplets += 1;
    }
  }

  const pairs: StaticDevelopmentPair[] = [];
  for (const taskId of lock.matrix.taskIds) {
    const task = taskById.get(taskId)!;
    for (let runIndex = 1; runIndex <= lock.matrix.repetitions; runIndex += 1) {
      const originalRaw = raw.get(rowKey(taskId, runIndex, "original"));
      const staticRaw = raw.get(rowKey(taskId, runIndex, "ir-static"));
      const original = scored.get(rowKey(taskId, runIndex, "original"));
      const irStatic = scored.get(rowKey(taskId, runIndex, "ir-static"));
      if (!original || !irStatic || !originalRaw || !staticRaw) {
        pairs.push({
          taskId,
          runIndex,
          status: "incomplete",
          successImproved: false,
          hardGateRegression: false,
          improved: false,
          criterionTransitions: { improved: [], regressed: [] },
        });
        continue;
      }
      if (isInfrastructure(originalRaw, original) || isInfrastructure(staticRaw, irStatic)) {
        pairs.push({
          taskId,
          runIndex,
          status: "infrastructure",
          successImproved: false,
          hardGateRegression: false,
          improved: false,
          criterionTransitions: { improved: [], regressed: [] },
        });
        continue;
      }
      const originalCriteria = criterionPasses(original);
      const staticCriteria = criterionPasses(irStatic);
      const criterionIds = [...new Set([...originalCriteria.keys(), ...staticCriteria.keys()])].sort();
      const improvedCriteria = criterionIds.filter((id) =>
        originalCriteria.get(id) === false && staticCriteria.get(id) === true);
      const regressedCriteria = criterionIds.filter((id) =>
        originalCriteria.get(id) === true && staticCriteria.get(id) === false);
      const originalScore = scoreOf(original);
      const irStaticScore = scoreOf(irStatic);
      const successImproved = !original.success && irStatic.success;
      pairs.push({
        taskId,
        runIndex,
        status: "complete",
        originalScore: round4(originalScore),
        irStaticScore: round4(irStaticScore),
        scoreDelta: round4(irStaticScore - originalScore),
        successImproved,
        hardGateRegression: hardGatesPass(original, task.hardGateIds)
          && !hardGatesPass(irStatic, task.hardGateIds),
        improved: successImproved || irStaticScore > originalScore,
        criterionTransitions: { improved: improvedCriteria, regressed: regressedCriteria },
      });
    }
  }

  const summarize = (system: StaticSystem) => {
    const rows: Array<{ raw?: RawAgentRunRow; scored?: ScoredAgentRunRow }> = [];
    for (const taskId of lock.matrix.taskIds) {
      for (let runIndex = 1; runIndex <= lock.matrix.repetitions; runIndex += 1) {
        const key = rowKey(taskId, runIndex, system);
        rows.push({ raw: raw.get(key), scored: scored.get(key) });
      }
    }
    return {
      expectedRows: expectedPerSystem,
      observedRows: rows.filter((row) => row.scored).length,
      successes: rows.filter((row) =>
        row.scored?.success === true && !isInfrastructure(row.raw, row.scored)).length,
      meanScoreIncludingMissing: round4(rows.reduce((sum, row) =>
        sum + (!row.scored || isInfrastructure(row.raw, row.scored) ? 0 : scoreOf(row.scored)), 0)
        / expectedPerSystem),
      inputTokens: rows.reduce((sum, row) => sum + (row.scored?.inputTokens ?? 0), 0),
      outputTokens: rows.reduce((sum, row) => sum + (row.scored?.outputTokens ?? 0), 0),
      aggregateTokens: rows.reduce((sum, row) =>
        sum + (row.scored?.inputTokens ?? 0) + (row.scored?.outputTokens ?? 0), 0),
    };
  };
  const systems = {
    "no-skill": summarize("no-skill"),
    original: summarize("original"),
    "ir-static": summarize("ir-static"),
  };
  const hardGateRegressions = pairs.filter((pair) => pair.hardGateRegression).length;
  const improvedPairs = pairs.filter((pair) => pair.improved).length;
  const regressedPairs = pairs.filter((pair) => pair.status === "complete" && (pair.scoreDelta ?? 0) < 0).length;
  const gates = {
    completeRows: raw.size === lock.matrix.expectedRows && scored.size === lock.matrix.expectedRows,
    completeTriplets: completeTriplets === lock.matrix.expectedTriplets,
    minimumIrStaticSuccesses: systems["ir-static"].successes >= lock.gate.minimumIrStaticSuccesses,
    minimumIrStaticMeanScore:
      systems["ir-static"].meanScoreIncludingMissing >= lock.gate.minimumIrStaticMeanScore,
    maximumInfrastructureFailures: infrastructureFailures <= lock.gate.maximumInfrastructureFailures,
    maximumHardGateRegressions: hardGateRegressions <= lock.gate.maximumHardGateRegressions,
    minimumImprovedPairs: improvedPairs >= lock.gate.minimumImprovedPairs,
    maximumRegressedPairs: lock.gate.maximumRegressedPairs === undefined
      || regressedPairs <= lock.gate.maximumRegressedPairs,
  };
  const passed = Object.values(gates).every(Boolean);
  return {
    schemaVersion: "skill-ir-static-development-gate-report/v1",
    experimentId: lock.experimentId,
    methodEvidence: true,
    passed,
    counts: {
      expectedRows: lock.matrix.expectedRows,
      observedRawRows: raw.size,
      observedScoredRows: scored.size,
      expectedTriplets: lock.matrix.expectedTriplets,
      completeTriplets,
      infrastructureFailures,
      hardGateRegressions,
      improvedPairs,
      regressedPairs,
    },
    systems,
    pairs,
    gates,
    interpretation: {
      heldOutPlanningAllowed: lock.evaluationMode === "static-fidelity" ? false : passed,
      ...(lock.evaluationMode === "static-fidelity" ? { residualAuditAllowed: passed } : {}),
      heldOutExecutionAllowed: false,
      entersMainClaim: false,
    },
  };
}
