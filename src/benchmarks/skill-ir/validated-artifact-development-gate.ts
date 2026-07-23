import { extractTokenUsage, parseCaseId, type RawAgentRunRow, type ScoredAgentRunRow } from "./scoring";
import type { ValidatedArtifactDevelopmentLock } from "./validated-artifact-development";

type GateTask = {
  id: string;
  split: string;
  hardGateIds: string[];
};

type GateSystem = ValidatedArtifactDevelopmentLock["matrix"]["systems"][number];

type GateRowRecord = {
  taskId: string;
  runIndex: number;
  system: GateSystem;
  status: "complete" | "missing-raw" | "missing-scored";
  score: number;
  success: boolean;
  hardGateFailure: boolean;
  infrastructureFailure: boolean;
};

export type ValidatedArtifactDevelopmentGateReport = {
  schemaVersion: "skill-ir-validated-artifact-development-gate-report/v1";
  experimentId: string;
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
  records: GateRowRecord[];
  cost: {
    schemaVersion: "skill-ir-artifact-cost-accounting/v1";
    compileCost: {
      status: "preexisting-frozen-package";
      durationMs: null;
    };
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
    passed: boolean;
  };
};

type BuildGateOptions = {
  lock: ValidatedArtifactDevelopmentLock;
  tasks: GateTask[];
  rawRows: RawAgentRunRow[];
  scoredRows: ScoredAgentRunRow[];
};

function rowKey(taskId: string, runIndex: number, system: string): string {
  return `${taskId}\0${runIndex}\0${system}`;
}

function quartetKey(taskId: string, runIndex: number): string {
  return `${taskId}\0${runIndex}`;
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function scoreOf(row: ScoredAgentRunRow): number {
  return row.evaluatorScore ?? (row.success ? 1 : 0);
}

function hardGatesPass(row: ScoredAgentRunRow, hardGateIds: string[]): boolean {
  const summaries = new Map((row.evaluationSummary ?? [])
    .filter((summary): summary is typeof summary & { id: string } => Boolean(summary.id))
    .map((summary) => [summary.id, summary.pass]));
  return hardGateIds.every((id) => summaries.get(id) === true);
}

function expectedIdentity(lock: ValidatedArtifactDevelopmentLock, system: GateSystem) {
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

function assertRowIdentity(
  row: RawAgentRunRow | ScoredAgentRunRow,
  lock: ValidatedArtifactDevelopmentLock,
): { task: string; system: GateSystem; runIndex: number } {
  const parsed = parseCaseId(row.caseId);
  if (
    parsed.skill !== lock.skillId
    || !lock.matrix.agents.includes(parsed.agent as "skvm")
    || !lock.matrix.environments.includes(parsed.environment as "windows")
    || !lock.matrix.contexts.includes(parsed.context as "clean")
    || !lock.matrix.taskIds.includes(parsed.task as typeof lock.matrix.taskIds[number])
    || !lock.matrix.systems.includes(row.system as GateSystem)
    || row.panelConfigId !== lock.experimentId
    || !Number.isInteger(row.runIndex)
    || row.runIndex! < 1
    || row.runIndex! > lock.matrix.repetitions
  ) {
    throw new Error(`Validated artifact development gate identity drift: ${row.caseId}`);
  }
  const system = row.system as GateSystem;
  const expected = expectedIdentity(lock, system);
  for (const [label, actual, frozen] of [
    ["model", row.model, expected.model],
    ["model family", row.modelFamily, expected.modelFamily],
    ["adapter", row.adapter, expected.adapter],
    ["adapter version", row.adapterVersion, expected.adapterVersion],
  ] as const) {
    if (actual !== frozen) {
      throw new Error(`Validated artifact development gate ${label} drift`);
    }
  }
  if ("task" in row && row.task !== parsed.task) {
    throw new Error("Validated artifact development scored task drift");
  }
  if ("taskSplit" in row && row.taskSplit !== lock.matrix.taskSplit) {
    throw new Error("Validated artifact development scored split drift");
  }
  return { task: parsed.task, system, runIndex: row.runIndex! };
}

function indexRows<T extends RawAgentRunRow | ScoredAgentRunRow>(
  rows: T[],
  lock: ValidatedArtifactDevelopmentLock,
  label: string,
): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const row of rows) {
    const identity = assertRowIdentity(row, lock);
    const key = rowKey(identity.task, identity.runIndex, identity.system);
    if (indexed.has(key)) throw new Error(`Duplicate ${label} row: ${key}`);
    indexed.set(key, row);
  }
  return indexed;
}

export function buildValidatedArtifactDevelopmentGateReport(
  options: BuildGateOptions,
): ValidatedArtifactDevelopmentGateReport {
  const { lock } = options;
  const tasks = new Map(options.tasks.map((task) => [task.id, task]));
  for (const taskId of lock.matrix.taskIds) {
    const task = tasks.get(taskId);
    if (!task || task.split !== lock.matrix.taskSplit) {
      throw new Error(`Validated artifact gate requires development task ${taskId}`);
    }
  }
  const raw = indexRows(options.rawRows, lock, "raw");
  const scored = indexRows(options.scoredRows, lock, "scored");
  const records: GateRowRecord[] = [];

  for (const taskId of lock.matrix.taskIds) {
    const task = tasks.get(taskId)!;
    for (let runIndex = 1; runIndex <= lock.matrix.repetitions; runIndex += 1) {
      for (const system of lock.matrix.systems) {
        const key = rowKey(taskId, runIndex, system);
        const rawRow = raw.get(key);
        const scoredRow = scored.get(key);
        const status = !rawRow ? "missing-raw" : !scoredRow ? "missing-scored" : "complete";
        const rawInfrastructure = rawRow !== undefined
          && (rawRow.exitCode !== 0 && rawRow.runStatus !== undefined)
          || (rawRow?.runStatus !== undefined && rawRow.runStatus !== "ok");
        records.push({
          taskId,
          runIndex,
          system,
          status,
          score: scoredRow ? round4(scoreOf(scoredRow)) : 0,
          success: scoredRow?.success ?? false,
          hardGateFailure: system === lock.directExecution.system
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
  for (const taskId of lock.matrix.taskIds) {
    for (let runIndex = 1; runIndex <= lock.matrix.repetitions; runIndex += 1) {
      const quartet = records.filter(
        (record) => record.taskId === taskId && record.runIndex === runIndex,
      );
      if (quartet.length === lock.matrix.systems.length
        && quartet.every((record) => record.status === "complete")) {
        completeQuartets += 1;
      }
      const bySystem = new Map(quartet.map((record) => [record.system, record]));
      const artifact = bySystem.get(lock.directExecution.system);
      const original = bySystem.get("original");
      const staticRow = bySystem.get("ir-static");
      if (
        !artifact
        || !original
        || !staticRow
        || artifact.status !== "complete"
        || original.status !== "complete"
        || staticRow.status !== "complete"
        || artifact.score < Math.max(original.score, staticRow.score)
        || ((original.success || staticRow.success) && !artifact.success)
      ) {
        pairwiseRegressions += 1;
      }
    }
  }

  const expectedPerSystem = lock.matrix.taskIds.length * lock.matrix.repetitions;
  const systems = Object.fromEntries(lock.matrix.systems.map((system) => {
    const systemRecords = records.filter((record) => record.system === system);
    const scoredRows = options.scoredRows.filter((row) => row.system === system);
    return [system, {
      expectedRows: expectedPerSystem,
      observedRows: systemRecords.filter((record) => record.status === "complete").length,
      successes: systemRecords.filter((record) => record.success).length,
      meanScoreIncludingMissing: round4(
        systemRecords.reduce((sum, record) => sum + record.score, 0) / expectedPerSystem,
      ),
      aggregateTokens: scoredRows.reduce(
        (sum, row) => sum + (row.tokenCost ?? 0),
        0,
      ),
    }];
  })) as ValidatedArtifactDevelopmentGateReport["systems"];
  const artifactRecords = records.filter(
    (record) => record.system === lock.directExecution.system,
  );
  const artifactTaskMeanScores = Object.fromEntries(lock.matrix.taskIds.map((taskId) => {
    const rows = artifactRecords.filter((record) => record.taskId === taskId);
    return [taskId, round4(
      rows.reduce((sum, record) => sum + record.score, 0) / lock.matrix.repetitions,
    )];
  }));
  const infrastructureFailures = records.filter(
    (record) => record.infrastructureFailure,
  ).length;
  const artifactHardGateFailures = artifactRecords.filter(
    (record) => record.hardGateFailure,
  ).length;
  const counts = {
    expectedRows: lock.matrix.expectedRows,
    observedRawRows: raw.size,
    observedScoredRows: scored.size,
    expectedQuartets: lock.matrix.expectedQuartets,
    completeQuartets,
    artifactSuccesses: artifactRecords.filter((record) => record.success).length,
    artifactHardGateFailures,
    pairwiseRegressions,
    infrastructureFailures,
  };
  const allRows = options.rawRows;
  const cost = {
    schemaVersion: "skill-ir-artifact-cost-accounting/v1" as const,
    compileCost: {
      status: "preexisting-frozen-package" as const,
      durationMs: null,
    },
    profileCost: 0 as const,
    researchDiagnosticCost: "reported-separately-not-production-input" as const,
    modelGenerationTokens: options.scoredRows
      .filter((row) => row.system !== lock.directExecution.system)
      .reduce((sum, row) => sum + (row.tokenCost ?? 0), 0),
    modelRepairTokens: 0 as const,
    deterministicProcessDurationMs: allRows.reduce(
      (sum, row) => sum
        + (row.validatedArtifactRuntime?.deterministicProcessDurationMs ?? 0),
      0,
    ),
    validationDurationMs: allRows.reduce(
      (sum, row) => sum + (row.validatedArtifactRuntime?.validationDurationMs ?? 0),
      0,
    ),
    packageBytes: Math.max(
      0,
      ...allRows.map((row) => row.validatedArtifactRuntime?.packageBytes ?? 0),
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
    minimumArtifactTaskMeanScore:
      Object.values(artifactTaskMeanScores).every(
        (score) => score >= lock.gate.minimumArtifactTaskMeanScore,
      ),
    maximumInfrastructureFailures:
      infrastructureFailures <= lock.gate.maximumInfrastructureFailures,
    maximumArtifactHardGateFailures:
      artifactHardGateFailures <= lock.gate.maximumArtifactHardGateFailures,
    maximumPairwiseRegressions:
      pairwiseRegressions <= lock.gate.maximumPairwiseRegressions,
    passed: false,
  };
  gate.passed = Object.entries(gate)
    .filter(([key]) => key !== "passed")
    .every(([, value]) => value);

  return {
    schemaVersion: "skill-ir-validated-artifact-development-gate-report/v1",
    experimentId: lock.experimentId,
    denominator: "preregistered-logical-row",
    counts,
    systems,
    artifactTaskMeanScores,
    records,
    cost,
    gate,
  };
}
