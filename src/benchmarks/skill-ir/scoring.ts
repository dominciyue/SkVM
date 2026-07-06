import type { ExperimentSystem } from "./matrix";
import type { SkillIRBenchmarkTask } from "./real-agent";

export type ParsedCaseId = {
  skill: string;
  agent: string;
  environment: string;
  context: string;
  task: string;
};

export type RawAgentRunRow = {
  caseId: string;
  system: ExperimentSystem;
  taskPath: string;
  skillPath?: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  successSource: "execution-only";
};

export type ScoreRunOutputOptions = {
  exitCode: number;
  finalOutput: string;
  task: SkillIRBenchmarkTask;
};

export type RunScore = {
  success: boolean;
  ruleViolations: number;
  stepCoverage: number;
  failedCriteria: string[];
};

export type ScoredAgentRunRow = ParsedCaseId & {
  caseId: string;
  system: ExperimentSystem;
  success: boolean;
  ruleViolations: number;
  stepCoverage: number;
  latencyMs: number;
  successSource: "heuristic-success-criteria";
  failedCriteria: string[];
};

export function parseCaseId(caseId: string): ParsedCaseId {
  const [skill, agent, environment, context, ...taskParts] = caseId.split(":");
  const task = taskParts.join(":");

  if (!skill || !agent || !environment || !context || !task) {
    throw new Error(`Invalid Skill IR caseId: ${caseId}`);
  }

  return { skill, agent, environment, context, task };
}

export function extractFinalOutput(stdout: string): string {
  const marker = "final output:";
  const index = stdout.toLowerCase().lastIndexOf(marker);
  if (index === -1) {
    return stdout.trim();
  }
  return stdout.slice(index + marker.length).trim();
}

function firstNonEmptyLine(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
}

function containsAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function passesCriterion(criterion: string, output: string): boolean {
  const normalizedCriterion = criterion.toLowerCase();
  const normalizedOutput = output.toLowerCase();
  const firstLine = firstNonEmptyLine(normalizedOutput);

  if (normalizedCriterion === "findings appear before summary.") {
    return firstLine.startsWith("findings") || firstLine.startsWith("finding");
  }

  if (normalizedCriterion === "behavioral bug is mentioned.") {
    return containsAny(normalizedOutput, [/\bbehaviou?ral?\b/, /\bbug\b/, /\bregression\b/, /\brisk\b/]);
  }

  if (normalizedCriterion === "style-only issue is lower priority than behavioral bug.") {
    const styleIndex = normalizedOutput.indexOf("style");
    if (styleIndex === -1) {
      return true;
    }
    const behaviorIndexes = ["behavior", "behaviour", "bug", "regression", "risk"]
      .map((term) => normalizedOutput.indexOf(term))
      .filter((index) => index >= 0);
    return behaviorIndexes.length > 0 && Math.min(...behaviorIndexes) < styleIndex;
  }

  if (normalizedCriterion === "missing or insufficient tests are mentioned.") {
    return containsAny(normalizedOutput, [/\btests?\b/, /\bcoverage\b/]);
  }

  if (normalizedCriterion === "the finding explains the user-visible or regression risk.") {
    return containsAny(normalizedOutput, [
      /\brisk\b/,
      /\bregression\b/,
      /\buser-visible\b/,
      /\buser visible\b/,
      /\bimpact\b/,
    ]);
  }

  return false;
}

export function scoreRunOutput(opts: ScoreRunOutputOptions): RunScore {
  const failedCriteria = opts.task.successCriteria.filter((criterion) => !passesCriterion(criterion, opts.finalOutput));

  if (opts.exitCode !== 0) {
    failedCriteria.unshift(`process exited with code ${opts.exitCode}`);
  }

  return {
    success: failedCriteria.length === 0,
    ruleViolations: failedCriteria.length,
    stepCoverage: opts.finalOutput.trim().length > 0 ? 1 : 0,
    failedCriteria,
  };
}

export function scoreRawRunRows(
  rows: RawAgentRunRow[],
  taskById: Map<string, SkillIRBenchmarkTask>,
): ScoredAgentRunRow[] {
  return rows.map((row) => {
    const parsed = parseCaseId(row.caseId);
    const task = taskById.get(parsed.task);
    if (!task) {
      throw new Error(`Task ${parsed.task} was not found while scoring ${row.caseId}`);
    }

    const score = scoreRunOutput({
      exitCode: row.exitCode,
      finalOutput: extractFinalOutput(row.stdout),
      task,
    });

    return {
      caseId: row.caseId,
      system: row.system,
      ...parsed,
      success: score.success,
      ruleViolations: score.ruleViolations,
      stepCoverage: score.stepCoverage,
      latencyMs: row.durationMs,
      successSource: "heuristic-success-criteria",
      failedCriteria: score.failedCriteria,
    };
  });
}
