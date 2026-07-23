import { parseCaseId, type RawAgentRunRow, type ScoredAgentRunRow } from "./scoring";
import type { ValidatedArtifactHeldoutLock } from "./validated-artifact-heldout";

type GateTask = {
  id: string;
  split: string;
  hardGateIds: string[];
};

type GateSystem = ValidatedArtifactHeldoutLock["matrix"]["systems"][number];

type GateRecord = {
  taskId: string;
  runIndex: number;
  system: GateSystem;
  status: "complete" | "missing-raw" | "missing-scored";
  score: number;
  success: boolean;
  hardGateFailure: boolean;
  infrastructureFailure: boolean;
};

export type ValidatedArtifactHeldoutGateReport = {
  schemaVersion: "skill-ir-validated-artifact-heldout-gate-report/v1";
  experimentId: string;
  evidenceClass: "held-out";
  denominator: "preregistered-logical-row";
  counts: {
    expectedRows: number;
    observedRawRows: number;
    observedScoredRows: number;
    expectedQuartets: number;
    completeQuartets: number;
    artifactSuccesses: number;
    artifactHardGateFailures: number;
    pairwiseRegressions: number;
    pairwiseImprovements: number;
    infrastructureFailures: number;
  };
  systems: Record<GateSystem, {
    expectedRows: number;
    observedRows: number;
    successes: number;
    meanScoreIncludingMissing: number;
    aggregateTokens: number;
  }>;
  artifactTaskMeanScores: Record<string, number>;
  records: GateRecord[];
  cost: {
    schemaVersion: "skill-ir-artifact-cost-accounting/v1";
    compileCost: { status: "preexisting-frozen-package"; durationMs: null };
    profileCost: 0;
    researchDiagnosticCost: "reported-separately-not-production-input";
    modelGenerationTokens: number;
    modelRepairTokens: 0;
    deterministicProcessDurationMs: number;
    validationDurationMs: number;
    packageBytes: number;
    breakEven: "not-computed-quality-gate-pending";
  };
  gate: {
    completeRows: boolean;
    completeQuartets: boolean;
    minimumArtifactSuccesses: boolean;
    minimumArtifactMeanScore: boolean;
    minimumArtifactTaskMeanScore: boolean;
    maximumInfrastructureFailures: boolean;
    maximumArtifactHardGateFailures: boolean;
    maximumPairwiseRegressions: boolean;
    minimumPairwiseImprovements: boolean;
    passed: boolean;
  };
};

function key(taskId: string, runIndex: number, system: string): string {
  return `${taskId}\0${runIndex}\0${system}`;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function scoreOf(row: ScoredAgentRunRow): number {
  return row.evaluatorScore ?? (row.success ? 1 : 0);
}

function hardGatesPass(row: ScoredAgentRunRow, ids: string[]): boolean {
  const summaries = new Map((row.evaluationSummary ?? [])
    .filter((item): item is typeof item & { id: string } => Boolean(item.id))
    .map((item) => [item.id, item.pass]));
  return ids.every((id) => summaries.get(id) === true);
}

function expectedIdentity(lock: ValidatedArtifactHeldoutLock, system: GateSystem) {
  return system === lock.directExecution.system
    ? {
        model: lock.directExecution.model,
        modelFamily: lock.directExecution.modelFamily,
        adapter: lock.directExecution.adapter,
        adapterVersion: lock.directExecution.adapterVersion,
      }
    : {
        model: lock.model.route,
        modelFamily: lock.model.family,
        adapter: lock.adapter.id,
        adapterVersion: lock.adapter.version,
      };
}

function assertIdentity(
  row: RawAgentRunRow | ScoredAgentRunRow,
  lock: ValidatedArtifactHeldoutLock,
) {
  const parsed = parseCaseId(row.caseId);
  const system = row.system as GateSystem;
  if (
    parsed.skill !== lock.skillId
    || parsed.agent !== lock.matrix.agents[0]
    || parsed.environment !== lock.matrix.environments[0]
    || parsed.context !== lock.matrix.contexts[0]
    || !lock.matrix.taskIds.includes(parsed.task as typeof lock.matrix.taskIds[number])
    || !lock.matrix.systems.includes(system)
    || row.panelConfigId !== lock.experimentId
    || !Number.isInteger(row.runIndex)
    || row.runIndex! < 1
    || row.runIndex! > lock.matrix.repetitions
  ) {
    throw new Error(`Validated artifact held-out gate identity drift: ${row.caseId}`);
  }
  const expected = expectedIdentity(lock, system);
  for (const [label, actual, frozen] of [
    ["model", row.model, expected.model],
    ["model family", row.modelFamily, expected.modelFamily],
    ["adapter", row.adapter, expected.adapter],
    ["adapter version", row.adapterVersion, expected.adapterVersion],
  ] as const) {
    if (actual !== frozen) throw new Error(`Validated artifact held-out gate ${label} drift`);
  }
  if ("task" in row && row.task !== parsed.task) {
    throw new Error("Validated artifact held-out scored task drift");
  }
  if ("taskSplit" in row && row.taskSplit !== "held-out") {
    throw new Error("Validated artifact held-out scored split drift");
  }
  return { task: parsed.task, system, runIndex: row.runIndex! };
}

function indexRows<T extends RawAgentRunRow | ScoredAgentRunRow>(
  rows: T[],
  lock: ValidatedArtifactHeldoutLock,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const identity = assertIdentity(row, lock);
    const rowKey = key(identity.task, identity.runIndex, identity.system);
    if (result.has(rowKey)) throw new Error(`Duplicate held-out ${label} row: ${rowKey}`);
    result.set(rowKey, row);
  }
  return result;
}

export function buildValidatedArtifactHeldoutGateReport(options: {
  lock: ValidatedArtifactHeldoutLock;
  tasks: GateTask[];
  rawRows: RawAgentRunRow[];
  scoredRows: ScoredAgentRunRow[];
}): ValidatedArtifactHeldoutGateReport {
  const { lock } = options;
  const tasks = new Map(options.tasks.map((task) => [task.id, task]));
  for (const taskId of lock.matrix.taskIds) {
    const task = tasks.get(taskId);
    if (!task || task.split !== "held-out") {
      throw new Error(`Validated artifact held-out gate requires task ${taskId}`);
    }
  }
  const raw = indexRows(options.rawRows, lock, "raw");
  const scored = indexRows(options.scoredRows, lock, "scored");
  const records: GateRecord[] = [];
  for (const taskId of lock.matrix.taskIds) {
    const task = tasks.get(taskId)!;
    for (let runIndex = 1; runIndex <= lock.matrix.repetitions; runIndex += 1) {
      for (const system of lock.matrix.systems) {
        const rawRow = raw.get(key(taskId, runIndex, system));
        const scoredRow = scored.get(key(taskId, runIndex, system));
        const status = !rawRow ? "missing-raw" : !scoredRow ? "missing-scored" : "complete";
        const rawInfrastructure = rawRow !== undefined
          && ((rawRow.runStatus !== undefined && rawRow.runStatus !== "ok")
            || (rawRow.exitCode !== 0 && rawRow.runStatus !== undefined));
        records.push({
          taskId,
          runIndex,
          system,
          status,
          score: scoredRow ? round4(scoreOf(scoredRow)) : 0,
          success: scoredRow?.success ?? false,
          hardGateFailure: system === "validated-artifact"
            && scoredRow !== undefined
            && !hardGatesPass(scoredRow, task.hardGateIds),
          infrastructureFailure: status !== "complete"
            || rawInfrastructure
            || scoredRow?.failureType === "infrastructure",
        });
      }
    }
  }

  let completeQuartets = 0;
  let pairwiseRegressions = 0;
  let pairwiseImprovements = 0;
  for (const taskId of lock.matrix.taskIds) {
    for (let runIndex = 1; runIndex <= lock.matrix.repetitions; runIndex += 1) {
      const quartet = records.filter(
        (record) => record.taskId === taskId && record.runIndex === runIndex,
      );
      if (
        quartet.length === lock.matrix.systems.length
        && quartet.every((record) => record.status === "complete")
      ) completeQuartets += 1;
      const bySystem = new Map(quartet.map((record) => [record.system, record]));
      const artifact = bySystem.get("validated-artifact");
      const baselines = ["no-skill", "original", "ir-static"]
        .map((system) => bySystem.get(system as GateSystem));
      if (!artifact || baselines.some((row) => !row)
        || artifact.status !== "complete"
        || baselines.some((row) => row!.status !== "complete")) {
        pairwiseRegressions += 1;
        continue;
      }
      const bestScore = Math.max(...baselines.map((row) => row!.score));
      const anyBaselineSuccess = baselines.some((row) => row!.success);
      if (
        artifact.score < bestScore
        || (anyBaselineSuccess && !artifact.success)
      ) pairwiseRegressions += 1;
      if (artifact.score > bestScore) pairwiseImprovements += 1;
    }
  }

  const expectedPerSystem = lock.matrix.taskIds.length * lock.matrix.repetitions;
  const systems = Object.fromEntries(lock.matrix.systems.map((system) => {
    const rows = records.filter((record) => record.system === system);
    return [system, {
      expectedRows: expectedPerSystem,
      observedRows: rows.filter((record) => record.status === "complete").length,
      successes: rows.filter((record) => record.success).length,
      meanScoreIncludingMissing: round4(
        rows.reduce((sum, record) => sum + record.score, 0) / expectedPerSystem,
      ),
      aggregateTokens: options.scoredRows
        .filter((row) => row.system === system)
        .reduce((sum, row) => sum + (row.tokenCost ?? 0), 0),
    }];
  })) as ValidatedArtifactHeldoutGateReport["systems"];
  const artifactRows = records.filter((record) => record.system === "validated-artifact");
  const artifactTaskMeanScores = Object.fromEntries(lock.matrix.taskIds.map((taskId) => {
    const rows = artifactRows.filter((record) => record.taskId === taskId);
    return [taskId, round4(
      rows.reduce((sum, record) => sum + record.score, 0) / lock.matrix.repetitions,
    )];
  }));
  const infrastructureFailures = records.filter((record) => record.infrastructureFailure).length;
  const artifactHardGateFailures = artifactRows.filter((record) => record.hardGateFailure).length;
  const counts = {
    expectedRows: lock.matrix.expectedRows,
    observedRawRows: raw.size,
    observedScoredRows: scored.size,
    expectedQuartets: lock.matrix.expectedQuartets,
    completeQuartets,
    artifactSuccesses: artifactRows.filter((record) => record.success).length,
    artifactHardGateFailures,
    pairwiseRegressions,
    pairwiseImprovements,
    infrastructureFailures,
  };
  const cost = {
    schemaVersion: "skill-ir-artifact-cost-accounting/v1" as const,
    compileCost: { status: "preexisting-frozen-package" as const, durationMs: null },
    profileCost: 0 as const,
    researchDiagnosticCost: "reported-separately-not-production-input" as const,
    modelGenerationTokens: options.scoredRows
      .filter((row) => row.system !== "validated-artifact")
      .reduce((sum, row) => sum + (row.tokenCost ?? 0), 0),
    modelRepairTokens: 0 as const,
    deterministicProcessDurationMs: options.rawRows.reduce(
      (sum, row) => sum + (row.validatedArtifactRuntime?.deterministicProcessDurationMs ?? 0),
      0,
    ),
    validationDurationMs: options.rawRows.reduce(
      (sum, row) => sum + (row.validatedArtifactRuntime?.validationDurationMs ?? 0),
      0,
    ),
    packageBytes: Math.max(
      0,
      ...options.rawRows.map((row) => row.validatedArtifactRuntime?.packageBytes ?? 0),
    ),
    breakEven: "not-computed-quality-gate-pending" as const,
  };
  const artifactMean = systems["validated-artifact"].meanScoreIncludingMissing;
  const gate = {
    completeRows: raw.size === lock.matrix.expectedRows
      && scored.size === lock.matrix.expectedRows,
    completeQuartets: completeQuartets === lock.matrix.expectedQuartets,
    minimumArtifactSuccesses:
      counts.artifactSuccesses >= lock.gate.minimumArtifactSuccesses,
    minimumArtifactMeanScore:
      artifactMean >= lock.gate.minimumArtifactMeanScore,
    minimumArtifactTaskMeanScore: Object.values(artifactTaskMeanScores)
      .every((score) => score >= lock.gate.minimumArtifactTaskMeanScore),
    maximumInfrastructureFailures:
      infrastructureFailures <= lock.gate.maximumInfrastructureFailures,
    maximumArtifactHardGateFailures:
      artifactHardGateFailures <= lock.gate.maximumArtifactHardGateFailures,
    maximumPairwiseRegressions:
      pairwiseRegressions <= lock.gate.maximumPairwiseRegressions,
    minimumPairwiseImprovements:
      pairwiseImprovements >= lock.gate.minimumPairwiseImprovements,
    passed: false,
  };
  gate.passed = Object.entries(gate)
    .filter(([name]) => name !== "passed")
    .every(([, passed]) => passed);
  return {
    schemaVersion: "skill-ir-validated-artifact-heldout-gate-report/v1",
    experimentId: lock.experimentId,
    evidenceClass: "held-out",
    denominator: "preregistered-logical-row",
    counts,
    systems,
    artifactTaskMeanScores,
    records,
    cost,
    gate,
  };
}
