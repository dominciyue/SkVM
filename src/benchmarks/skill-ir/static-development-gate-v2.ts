import type { ScoredAgentRunRow } from "./scoring";
import {
  ExecutionEnvelopeSchema,
  selectMatchedExecutionBlocks,
  type ExecutionEnvelope,
  type ExecutionFailureClassification,
} from "./execution-resilience";
import type { StaticDevelopmentV2Lock } from "./static-development-v2";

type StaticSystem = "no-skill" | "original" | "ir-static";

export type StaticDevelopmentV2GateTask = {
  id: string;
  split: string;
  hardGateIds: string[];
};

type SystemSummary = {
  expectedRows: number;
  scoredRows: number;
  successes: number;
  meanScore: number;
  inputTokens: number;
  outputTokens: number;
  aggregateTokens: number;
};

export type StaticDevelopmentV2GateReport = {
  schemaVersion: "skill-ir-static-development-gate-report/v2";
  experimentId: string;
  methodEvidence: true;
  passed: boolean;
  selection: {
    complete: boolean;
    selectedTriplets: number;
    replacedTriplets: number;
    selectedRows: number;
    attemptedRows: number;
    abortReason?: string;
    replaced: Array<{ taskId: string; candidateBlock: number; reasons: ExecutionFailureClassification[] }>;
  };
  selected: {
    systems: Record<StaticSystem, SystemSummary>;
    improvedPairs: number;
    regressedPairs: number;
    hardGateRegressions: number;
    activeExecutionFailures: number;
  };
  allAttempts: {
    transientFailures: number;
    activeExecutionFailures: number;
    parserOrRuntimeBlockers: number;
    attemptedTokens: number;
    attemptedDurationMs: number;
    perSystemTransientFailures: Record<StaticSystem, number>;
    methodDirection: "positive" | "neutral" | "negative" | "unavailable";
  };
  gates: {
    selectedDenominatorComplete: boolean;
    selectedScoringComplete: boolean;
    minimumIrStaticSuccesses: boolean;
    minimumIrStaticMeanScore: boolean;
    maximumActiveExecutionFailures: boolean;
    maximumHardGateRegressions: boolean;
    minimumImprovedPairs: boolean;
    maximumRegressedPairs: boolean;
    noExecutionBlocker: boolean;
  };
  interpretation: {
    infrastructureSensitive: boolean;
    residualAuditAllowed: boolean;
    heldOutPlanningAllowed: false;
    heldOutExecutionAllowed: false;
    entersMainClaim: false;
  };
};

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function rowKey(taskId: string, block: number, system: string): string {
  return `${taskId}\0${block}\0${system}`;
}

function scoreOf(row: ScoredAgentRunRow): number {
  return row.evaluatorScore ?? (row.success ? 1 : 0);
}

function criterionPasses(row: ScoredAgentRunRow): Map<string, boolean> {
  return new Map((row.evaluationSummary ?? []).map((criterion, index) => [
    criterion.id?.trim() || criterion.name?.trim() || `${criterion.method}#${index + 1}`,
    criterion.pass,
  ]));
}

function hardGatesPass(row: ScoredAgentRunRow, ids: string[]): boolean {
  const criteria = criterionPasses(row);
  return ids.every((id) => criteria.get(id) === true);
}

function assertScoredIdentity(row: ScoredAgentRunRow, lock: StaticDevelopmentV2Lock): void {
  if (
    row.model !== lock.model.route
    || row.modelFamily !== lock.model.family
    || row.adapter !== lock.adapter.id
    || row.adapterVersion !== lock.adapter.version
    || row.panelConfigId !== lock.experimentId
    || row.skill !== lock.skillId
    || row.agent !== lock.matrix.agents[0]
    || row.environment !== lock.matrix.environments[0]
    || row.context !== lock.matrix.contexts[0]
    || row.taskSplit !== lock.matrix.taskSplit
    || !lock.matrix.taskIds.includes(row.task)
    || !lock.matrix.systems.includes(row.system as StaticSystem)
    || !Number.isInteger(row.runIndex)
  ) {
    throw new Error("Static development v2 scored identity mismatch");
  }
}

export function buildStaticDevelopmentV2GateReport(input: {
  lock: StaticDevelopmentV2Lock;
  tasks: StaticDevelopmentV2GateTask[];
  envelopes: ExecutionEnvelope[];
  scoredRows: ScoredAgentRunRow[];
}): StaticDevelopmentV2GateReport {
  const { lock } = input;
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  for (const taskId of lock.matrix.taskIds) {
    if (taskById.get(taskId)?.split !== lock.matrix.taskSplit) {
      throw new Error(`Static development v2 requires development task ${taskId}`);
    }
  }
  const envelopes = input.envelopes.map((item) => ExecutionEnvelopeSchema.parse(item));
  const envelopeKeys = new Set<string>();
  for (const envelope of envelopes) {
    if (
      envelope.experimentId !== lock.experimentId
      || !lock.matrix.taskIds.includes(envelope.taskId)
      || !lock.matrix.systems.includes(envelope.system as StaticSystem)
      || envelope.candidateBlock > lock.matrix.targetBlocksPerTask + lock.matrix.reserveBlocksPerTask
    ) {
      throw new Error("Static development v2 envelope identity mismatch");
    }
    const key = rowKey(envelope.taskId, envelope.candidateBlock, envelope.system);
    if (envelopeKeys.has(key)) throw new Error(`Static development v2 duplicate envelope: ${key}`);
    envelopeKeys.add(key);
  }

  const scored = new Map<string, ScoredAgentRunRow>();
  for (const row of input.scoredRows) {
    assertScoredIdentity(row, lock);
    const key = rowKey(row.task, row.runIndex!, row.system);
    if (scored.has(key)) throw new Error(`Static development v2 duplicate scored row: ${key}`);
    scored.set(key, row);
  }

  const selection = selectMatchedExecutionBlocks({
    taskIds: lock.matrix.taskIds,
    systems: lock.matrix.systems,
    targetBlocksPerTask: lock.matrix.targetBlocksPerTask,
    reserveBlocksPerTask: lock.matrix.reserveBlocksPerTask,
    envelopes,
  });
  const selectedKeys = new Set(selection.selectedBlocks.map((block) =>
    `${block.taskId}\0${block.candidateBlock}`));
  const selectedEnvelopes = envelopes.filter((item) =>
    selectedKeys.has(`${item.taskId}\0${item.candidateBlock}`));

  const activeClassifications = new Set<ExecutionFailureClassification>([
    "active-idle-timeout", "active-absolute-timeout", "step-limit",
  ]);
  const blockerClassifications = new Set<ExecutionFailureClassification>([
    "qualification-failure", "parser-incompatible", "runtime-crash", "measurement-invalid",
  ]);
  const activeExecutionFailures = selectedEnvelopes.filter((item) =>
    activeClassifications.has(item.classification)).length;

  const systems = Object.fromEntries(lock.matrix.systems.map((system) => {
    const armEnvelopes = selectedEnvelopes.filter((item) => item.system === system);
    const armRows = armEnvelopes.map((item) => scored.get(rowKey(item.taskId, item.candidateBlock, system)));
    const validRows = armRows.filter((row): row is ScoredAgentRunRow => row !== undefined);
    const expectedRows = lock.matrix.expectedSelectedTriplets;
    const scoreTotal = armEnvelopes.reduce((sum, item) => {
      if (item.classification !== "semantic-complete") return sum;
      return sum + scoreOf(scored.get(rowKey(item.taskId, item.candidateBlock, system)) ?? ({ success: false } as ScoredAgentRunRow));
    }, 0);
    const inputTokens = armEnvelopes.reduce((sum, item) => sum + item.usage.input, 0);
    const outputTokens = armEnvelopes.reduce((sum, item) => sum + item.usage.output, 0);
    return [system, {
      expectedRows,
      scoredRows: validRows.length,
      successes: armEnvelopes.filter((item) => {
        if (item.classification !== "semantic-complete") return false;
        return scored.get(rowKey(item.taskId, item.candidateBlock, system))?.success === true;
      }).length,
      meanScore: round4(scoreTotal / expectedRows),
      inputTokens,
      outputTokens,
      aggregateTokens: inputTokens + outputTokens,
    }];
  })) as Record<StaticSystem, SystemSummary>;

  let improvedPairs = 0;
  let regressedPairs = 0;
  let hardGateRegressions = 0;
  for (const block of selection.selectedBlocks) {
    const originalEnvelope = selectedEnvelopes.find((item) =>
      item.taskId === block.taskId && item.candidateBlock === block.candidateBlock && item.system === "original");
    const staticEnvelope = selectedEnvelopes.find((item) =>
      item.taskId === block.taskId && item.candidateBlock === block.candidateBlock && item.system === "ir-static");
    if (originalEnvelope?.classification !== "semantic-complete"
      || staticEnvelope?.classification !== "semantic-complete") continue;
    const original = scored.get(rowKey(block.taskId, block.candidateBlock, "original"));
    const irStatic = scored.get(rowKey(block.taskId, block.candidateBlock, "ir-static"));
    if (!original || !irStatic) continue;
    const delta = scoreOf(irStatic) - scoreOf(original);
    if ((!original.success && irStatic.success) || delta > 0) improvedPairs += 1;
    if (delta < 0) regressedPairs += 1;
    if (hardGatesPass(original, taskById.get(block.taskId)!.hardGateIds)
      && !hardGatesPass(irStatic, taskById.get(block.taskId)!.hardGateIds)) {
      hardGateRegressions += 1;
    }
  }

  const transientFailures = envelopes.filter((item) => item.replacementEligible).length;
  const perSystemTransientFailures = Object.fromEntries(lock.matrix.systems.map((system) => [
    system,
    envelopes.filter((item) => item.system === system && item.replacementEligible).length,
  ])) as Record<StaticSystem, number>;
  const allActiveFailures = envelopes.filter((item) => activeClassifications.has(item.classification)).length;
  const parserOrRuntimeBlockers = envelopes.filter((item) => blockerClassifications.has(item.classification)).length;
  const attemptedTokens = envelopes.reduce((sum, item) =>
    sum + item.usage.input + item.usage.output + item.usage.cacheRead + item.usage.cacheWrite, 0);
  const attemptedDurationMs = envelopes.reduce((sum, item) => sum + item.process.durationMs, 0);
  const allAttemptDeltas: number[] = [];
  const blocks = new Set(envelopes.map((item) => `${item.taskId}\0${item.candidateBlock}`));
  for (const block of blocks) {
    const [taskId, rawCandidate] = block.split("\0");
    const candidateBlock = Number(rawCandidate);
    const originalEnvelope = envelopes.find((item) => item.taskId === taskId
      && item.candidateBlock === candidateBlock && item.system === "original");
    const staticEnvelope = envelopes.find((item) => item.taskId === taskId
      && item.candidateBlock === candidateBlock && item.system === "ir-static");
    if (originalEnvelope?.classification !== "semantic-complete"
      || staticEnvelope?.classification !== "semantic-complete") continue;
    const original = scored.get(rowKey(taskId!, candidateBlock, "original"));
    const irStatic = scored.get(rowKey(taskId!, candidateBlock, "ir-static"));
    if (original && irStatic) allAttemptDeltas.push(scoreOf(irStatic) - scoreOf(original));
  }
  const allAttemptDelta = allAttemptDeltas.reduce((sum, value) => sum + value, 0);
  const methodDirection = allAttemptDeltas.length === 0 ? "unavailable" as const
    : allAttemptDelta > 0 ? "positive" as const
      : allAttemptDelta < 0 ? "negative" as const : "neutral" as const;
  const selectedDirection = improvedPairs > regressedPairs ? "positive"
    : improvedPairs < regressedPairs ? "negative" : "neutral";
  const selectedScoringComplete = selectedEnvelopes.every((item) =>
    item.classification !== "semantic-complete"
    || scored.has(rowKey(item.taskId, item.candidateBlock, item.system)));
  const gates = {
    selectedDenominatorComplete: selection.complete
      && selection.selectedRows === lock.matrix.expectedSelectedRows,
    selectedScoringComplete,
    minimumIrStaticSuccesses: systems["ir-static"].successes >= lock.gate.minimumIrStaticSuccesses,
    minimumIrStaticMeanScore: systems["ir-static"].meanScore >= lock.gate.minimumIrStaticMeanScore,
    maximumActiveExecutionFailures:
      activeExecutionFailures <= lock.gate.maximumActiveExecutionFailures,
    maximumHardGateRegressions: hardGateRegressions <= lock.gate.maximumHardGateRegressions,
    minimumImprovedPairs: improvedPairs >= lock.gate.minimumImprovedPairs,
    maximumRegressedPairs: regressedPairs <= lock.gate.maximumRegressedPairs,
    noExecutionBlocker: parserOrRuntimeBlockers === 0,
  };
  const passed = Object.values(gates).every(Boolean);
  const transientCounts = Object.values(perSystemTransientFailures);
  const infrastructureSensitive = selection.replacedBlocks.length > 0
    || new Set(transientCounts).size > 1
    || (methodDirection !== "unavailable" && methodDirection !== selectedDirection);

  return {
    schemaVersion: "skill-ir-static-development-gate-report/v2",
    experimentId: lock.experimentId,
    methodEvidence: true,
    passed,
    selection: {
      complete: selection.complete,
      selectedTriplets: selection.selectedBlocks.length,
      replacedTriplets: selection.replacedBlocks.length,
      selectedRows: selection.selectedRows,
      attemptedRows: selection.attemptedRows,
      ...(selection.abortReason ? { abortReason: selection.abortReason } : {}),
      replaced: selection.replacedBlocks,
    },
    selected: {
      systems,
      improvedPairs,
      regressedPairs,
      hardGateRegressions,
      activeExecutionFailures,
    },
    allAttempts: {
      transientFailures,
      activeExecutionFailures: allActiveFailures,
      parserOrRuntimeBlockers,
      attemptedTokens,
      attemptedDurationMs,
      perSystemTransientFailures,
      methodDirection,
    },
    gates,
    interpretation: {
      infrastructureSensitive,
      residualAuditAllowed: passed && lock.promotionBoundary.permitsResidualAudit,
      heldOutPlanningAllowed: false,
      heldOutExecutionAllowed: false,
      entersMainClaim: false,
    },
  };
}
