import { parseCaseId, type RawAgentRunRow, type ScoredAgentRunRow } from "./scoring";

export type ArtifactDevelopmentGateExpected = {
  system: RawAgentRunRow["system"];
  skillId: string;
  model: string;
  modelFamily: string;
  adapter: string;
  adapterVersion: string;
  panelConfigId: string;
  contexts: string[];
  agents: string[];
  environments: string[];
  taskIds: string[];
  repetitions: number;
  initialGenerationRows: number;
  minimumSuccesses: number;
  minimumMeanScore: number;
  maximumHardGateRegressions: number;
  maximumInfrastructureFailures: number;
};

export type ArtifactDevelopmentGateTask = {
  id: string;
  split: string;
  hardGateIds: string[];
};

export type ArtifactDevelopmentGateRecord = {
  taskId: string;
  runIndex: number;
  status: "paired" | "missing-generation" | "missing-pair";
  generationIdentity?: string;
  preScore?: number;
  postScore?: number;
  success: boolean;
  hardGateRegression: boolean;
  infrastructureFailure: boolean;
};

export type ArtifactDevelopmentGateReport = {
  schemaVersion: "skill-ir-artifact-development-gate-report/v1";
  denominator: "preregistered-generation";
  counts: {
    expectedGenerations: number;
    pairedGenerations: number;
    missingGenerations: number;
    missingPairs: number;
    successes: number;
    hardGateRegressions: number;
    infrastructureFailures: number;
  };
  meanScoreIncludingInfrastructure: number;
  records: ArtifactDevelopmentGateRecord[];
  gate: {
    minimumSuccesses: boolean;
    minimumMeanScore: boolean;
    maximumHardGateRegressions: boolean;
    maximumInfrastructureFailures: boolean;
    passed: boolean;
  };
};

type BuildGateOptions = {
  expected: ArtifactDevelopmentGateExpected;
  tasks: ArtifactDevelopmentGateTask[];
  rawRows: RawAgentRunRow[];
  scoredRows: ScoredAgentRunRow[];
};

function generationKey(taskId: string, runIndex: number): string {
  return `${taskId}\0${runIndex}`;
}

function scoreOf(row: ScoredAgentRunRow): number {
  return row.evaluatorScore ?? (row.success ? 1 : 0);
}

function hardGatesPass(row: ScoredAgentRunRow, hardGateIds: string[]): boolean {
  if (hardGateIds.length === 0) return true;
  const summaries = new Map((row.evaluationSummary ?? [])
    .filter((summary): summary is typeof summary & { id: string } => Boolean(summary.id))
    .map((summary) => [summary.id, summary]));
  return hardGateIds.every((id) => summaries.get(id)?.pass === true);
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function assertFrozenRowIdentity(
  row: RawAgentRunRow | ScoredAgentRunRow,
  expected: ArtifactDevelopmentGateExpected,
): ReturnType<typeof parseCaseId> {
  const parsed = parseCaseId(row.caseId);
  for (const [label, actual, frozen] of [
    ["skill", parsed.skill, expected.skillId],
    ["model", row.model, expected.model],
    ["model family", row.modelFamily, expected.modelFamily],
    ["adapter", row.adapter, expected.adapter],
    ["adapter version", row.adapterVersion, expected.adapterVersion],
    ["panel", row.panelConfigId, expected.panelConfigId],
  ] as const) {
    if (actual !== frozen) throw new Error(`Artifact gate ${label} identity mismatch`);
  }
  for (const [label, actual, frozen] of [
    ["context", parsed.context, expected.contexts],
    ["agent", parsed.agent, expected.agents],
    ["environment", parsed.environment, expected.environments],
  ] as const) {
    if (!frozen.includes(actual)) throw new Error(`Artifact gate ${label} identity mismatch`);
  }
  if (!Number.isInteger(row.runIndex) || row.runIndex! < 1 || row.runIndex! > expected.repetitions) {
    throw new Error(`Artifact gate run index is outside the frozen repetitions: ${row.runIndex}`);
  }
  return parsed;
}

export function buildArtifactDevelopmentGateReport(
  options: BuildGateOptions,
): ArtifactDevelopmentGateReport {
  const { expected } = options;
  if (expected.initialGenerationRows !== expected.taskIds.length * expected.repetitions) {
    throw new Error("initial generation row count does not match task x repetition registry");
  }

  const taskById = new Map(options.tasks.map((task) => [task.id, task]));
  for (const taskId of expected.taskIds) {
    const task = taskById.get(taskId);
    if (!task || task.split !== "development") {
      throw new Error(`Artifact gate requires a registered development task: ${taskId}`);
    }
  }

  const rawByKey = new Map<string, RawAgentRunRow>();
  const generationIdentities = new Set<string>();
  for (const row of options.rawRows) {
    const parsed = assertFrozenRowIdentity(row, expected);
    const runIndex = row.runIndex!;
    if (!expected.taskIds.includes(parsed.task) || row.system !== expected.system) {
      throw new Error(`Raw generation identity is outside the frozen gate: ${row.caseId}`);
    }
    const key = generationKey(parsed.task, runIndex);
    if (rawByKey.has(key)) throw new Error(`duplicate raw generation: ${parsed.task}#${runIndex}`);
    rawByKey.set(key, row);
    const identity = row.artifactRuntime?.generationIdentity;
    if (identity) {
      if (generationIdentities.has(identity)) throw new Error(`duplicate generation identity: ${identity}`);
      generationIdentities.add(identity);
    }
  }

  const scoredByKey = new Map<string, Map<string, ScoredAgentRunRow>>();
  for (const row of options.scoredRows) {
    const parsed = assertFrozenRowIdentity(row, expected);
    const runIndex = row.runIndex!;
    if (
      row.task !== parsed.task
      || row.skill !== parsed.skill
      || row.context !== parsed.context
      || row.agent !== parsed.agent
      || row.environment !== parsed.environment
      || !expected.taskIds.includes(row.task)
      || row.system !== expected.system
    ) {
      throw new Error(`Scored generation identity is outside the frozen gate: ${row.caseId}`);
    }
    if (!row.artifactLogicalArm) continue;
    const key = generationKey(row.task, runIndex);
    const arms = scoredByKey.get(key) ?? new Map<string, ScoredAgentRunRow>();
    if (arms.has(row.artifactLogicalArm)) {
      throw new Error(`duplicate scored logical arm: ${row.task}#${runIndex}#${row.artifactLogicalArm}`);
    }
    arms.set(row.artifactLogicalArm, row);
    scoredByKey.set(key, arms);
  }

  const records: ArtifactDevelopmentGateRecord[] = [];
  for (const taskId of expected.taskIds) {
    const task = taskById.get(taskId)!;
    for (let runIndex = 1; runIndex <= expected.repetitions; runIndex += 1) {
      const key = generationKey(taskId, runIndex);
      const raw = rawByKey.get(key);
      if (!raw) {
        records.push({
          taskId,
          runIndex,
          status: "missing-generation",
          success: false,
          hardGateRegression: false,
          infrastructureFailure: true,
        });
        continue;
      }
      const arms = scoredByKey.get(key);
      const pre = arms?.get("check-only");
      const post = arms?.get("one-repair");
      const generationIdentity = raw.artifactRuntime?.generationIdentity;
      if (
        !pre
        || !post
        || !generationIdentity
        || pre.generationIdentity !== generationIdentity
        || post.generationIdentity !== generationIdentity
      ) {
        records.push({
          taskId,
          runIndex,
          status: "missing-pair",
          ...(generationIdentity ? { generationIdentity } : {}),
          success: false,
          hardGateRegression: false,
          infrastructureFailure: true,
        });
        continue;
      }
      const preHardGatesPass = hardGatesPass(pre, task.hardGateIds);
      const postHardGatesPass = hardGatesPass(post, task.hardGateIds);
      records.push({
        taskId,
        runIndex,
        status: "paired",
        generationIdentity,
        preScore: round4(scoreOf(pre)),
        postScore: round4(scoreOf(post)),
        success: post.success,
        hardGateRegression: preHardGatesPass && !postHardGatesPass,
        infrastructureFailure: false,
      });
    }
  }

  const counts = {
    expectedGenerations: records.length,
    pairedGenerations: records.filter((record) => record.status === "paired").length,
    missingGenerations: records.filter((record) => record.status === "missing-generation").length,
    missingPairs: records.filter((record) => record.status === "missing-pair").length,
    successes: records.filter((record) => record.success).length,
    hardGateRegressions: records.filter((record) => record.hardGateRegression).length,
    infrastructureFailures: records.filter((record) => record.infrastructureFailure).length,
  };
  const meanScoreIncludingInfrastructure = round4(
    records.reduce((sum, record) => sum + (record.postScore ?? 0), 0) / records.length,
  );
  const gate = {
    minimumSuccesses: counts.successes >= expected.minimumSuccesses,
    minimumMeanScore: meanScoreIncludingInfrastructure >= expected.minimumMeanScore,
    maximumHardGateRegressions:
      counts.hardGateRegressions <= expected.maximumHardGateRegressions,
    maximumInfrastructureFailures:
      counts.infrastructureFailures <= expected.maximumInfrastructureFailures,
    passed: false,
  };
  gate.passed = gate.minimumSuccesses
    && gate.minimumMeanScore
    && gate.maximumHardGateRegressions
    && gate.maximumInfrastructureFailures;

  return {
    schemaVersion: "skill-ir-artifact-development-gate-report/v1",
    denominator: "preregistered-generation",
    counts,
    meanScoreIncludingInfrastructure,
    records,
    gate,
  };
}
