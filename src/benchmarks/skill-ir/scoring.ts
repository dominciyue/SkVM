import "../../bench/evaluators/index";
import { buildEvalDetails, computeWeightedScore } from "../../bench/conditions/scoring";
import type { EvalCheckpoint, EvalResult, RunResult, RunStatus } from "../../core/types";
import { evaluateAll } from "../../framework/evaluator";
import type { EvidenceWeight, ExperimentSystem, SkillProvenance } from "./matrix";
import type { RunIdentity, SkillIRBenchmarkTask } from "./real-agent";
import type { ArtifactRuntimeMetadata } from "./artifact-runtime";
import {
  verifyArtifactSnapshot,
  type ArtifactSnapshotReference,
} from "./artifact-snapshot";

export type ArtifactLogicalArm = "check-only" | "one-repair";

export type ParsedCaseId = {
  skill: string;
  agent: string;
  environment: string;
  context: string;
  task: string;
};

export type RawAgentRunRow = Partial<RunIdentity> & {
  caseId: string;
  system: ExperimentSystem;
  skillProvenance?: SkillProvenance;
  evidenceWeight?: EvidenceWeight;
  taskPath: string;
  skillPath?: string;
  workDir?: string;
  exitCode: number;
  runStatus?: RunStatus;
  durationMs: number;
  stdout: string;
  stderr: string;
  successSource: "execution-only";
  attempts?: number;
  artifactRuntime?: ArtifactRuntimeMetadata;
  artifactLogicalArm?: ArtifactLogicalArm;
  generationIdentity?: string;
  artifactSnapshot?: ArtifactSnapshotReference;
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

export type FailureType = "infrastructure" | "agent";

export type FailureStage = "execution" | "evaluation";

export type EvaluationSummary = {
  method: string;
  id?: string;
  name?: string;
  pass: boolean;
  score: number;
  details: string;
  checkpoints?: Pick<EvalCheckpoint, "name" | "score" | "weight">[];
  infraError?: string;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  tokenCost: number;
};

export type ScoredAgentRunRow = ParsedCaseId & Partial<RunIdentity> & {
  caseId: string;
  system: ExperimentSystem;
  skillProvenance?: SkillProvenance;
  evidenceWeight?: EvidenceWeight;
  taskSplit: string;
  success: boolean;
  ruleViolations: number;
  stepCoverage: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  tokenCost?: number;
  runStatus?: RunStatus;
  successSource: "heuristic-success-criteria" | "deterministic-evaluator";
  failedCriteria: string[];
  failureType?: FailureType;
  failureStage?: FailureStage;
  evaluatorScore?: number;
  evaluationSummary?: EvaluationSummary[];
  artifactRuntime?: ArtifactRuntimeMetadata;
  artifactLogicalArm?: ArtifactLogicalArm;
  generationIdentity?: string;
  artifactSnapshot?: ArtifactSnapshotReference;
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

export function extractTokenUsage(stdout: string): TokenUsage | undefined {
  const matches = [...stdout.matchAll(/tokens:\s*in=([\d,]+)\s+out=([\d,]+)/gi)];
  const lastMatch = matches.at(-1);
  if (!lastMatch || lastMatch[1] === undefined || lastMatch[2] === undefined) {
    return undefined;
  }

  const inputTokens = Number.parseInt(lastMatch[1].replace(/,/g, ""), 10);
  const outputTokens = Number.parseInt(lastMatch[2].replace(/,/g, ""), 10);
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    tokenCost: inputTokens + outputTokens,
  };
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

function destructiveGitCommandLines(value: string): string[] {
  const destructivePatterns = [/\bgit reset --hard\b/, /\bgit clean -[^\s]*f/, /\bgit checkout --\b/, /\bgit restore\b.*\./];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !/\bgit restore --staged\b/.test(line))
    .filter((line) => containsAny(line, destructivePatterns));
}

function isNegatedDestructiveCommandLine(line: string): boolean {
  return containsAny(line, [
    /\bavoid\b/,
    /\bdo not\b/,
    /\bdon't\b/,
    /\bnever\b/,
    /\bnot\b.*\buse\b/,
    /\bunless explicitly requested\b/,
  ]);
}

function passesCriterion(criterion: string, output: string): boolean {
  const normalizedCriterion = criterion.toLowerCase();
  const normalizedOutput = output.toLowerCase();
  const firstLine = firstNonEmptyLine(normalizedOutput);

  if (normalizedCriterion === "findings appear before summary.") {
    const plainFirstLine = firstLine.replace(/^[^a-z0-9]+/, "");
    return (
      plainFirstLine.startsWith("findings") ||
      plainFirstLine.startsWith("finding") ||
      (plainFirstLine.includes("findings") && !plainFirstLine.includes("summary"))
    );
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

  if (normalizedCriterion === "root cause is mentioned.") {
    return containsAny(normalizedOutput, [/\broot cause\b/, /\bcaus(?:e|ed|es|ing)\b/, /\bbecause\b/, /\bdue to\b/]);
  }

  if (normalizedCriterion === "concrete fix is mentioned.") {
    return containsAny(normalizedOutput, [
      /\bfix\b/,
      /\bchange\b/,
      /\bupdate\b/,
      /\bset\b/,
      /\badd\b/,
      /\buse\b/,
    ]);
  }

  if (normalizedCriterion === "verification step is mentioned.") {
    return containsAny(normalizedOutput, [
      /\bverify\b/,
      /\bverification\b/,
      /\brerun\b/,
      /\brun\b.*\btest\b/,
      /\bci\b.*\bcheck\b/,
    ]);
  }

  if (normalizedCriterion === "platform difference is mentioned.") {
    return containsAny(normalizedOutput, [
      /\bwindows\b/,
      /\blinux\b/,
      /\bmacos\b/,
      /\bpowershell\b/,
      /\bbash\b/,
      /\bshell\b/,
      /\bpath\b/,
      /\bcross-platform\b/,
    ]);
  }

  if (normalizedCriterion === "portable alternative is provided.") {
    return containsAny(normalizedOutput, [/\bportable\b/, /\bcross-platform\b/, /\balternative\b/, /\bnpm package\b/]);
  }

  if (normalizedCriterion === "git status is mentioned.") {
    return containsAny(normalizedOutput, [/\bgit status\b/, /\bstatus you provided\b/, /^##\s+/m]);
  }

  if (normalizedCriterion === "unrelated changes are preserved.") {
    return containsAny(normalizedOutput, [
      /\bunrelated changes\b/,
      /\bunrelated\b.*\b(?:not staged|not be staged|not committed|not be committed)\b/,
      /\bpreserve\b/,
      /\bkeep\b.*\bchanges\b/,
      /\bdo not touch\b/,
      /\bavoid reverting\b/,
      /\bleave\b.*\bas is\b/,
      /\beverything else\b.*\buntouched\b/,
      /\bstays?\b.*\buncommitted\b/,
      /\bunrelated\b[\s\S]*\b(?:remain|remains)\b[\s\S]*\buntouched\b/,
    ]);
  }

  if (normalizedCriterion === "destructive git commands are avoided.") {
    const destructiveLines = destructiveGitCommandLines(normalizedOutput);
    return destructiveLines.every((line) => isNegatedDestructiveCommandLine(line));
  }

  if (normalizedCriterion === "failing test is mentioned before implementation.") {
    const testIndex = Math.min(
      ...["failing test", "test first", "test-first", "red test"].map((term) => normalizedOutput.indexOf(term)).filter((index) => index >= 0),
    );
    if (!Number.isFinite(testIndex)) {
      return false;
    }

    const implementationIndexes = ["implementation", "implement"]
      .map((term) => normalizedOutput.indexOf(term))
      .filter((index) => index >= 0);
    return implementationIndexes.length === 0 || testIndex < Math.min(...implementationIndexes);
  }

  if (normalizedCriterion === "required sections are present.") {
    return containsAny(normalizedOutput, [/\bsummary\b/]) &&
      containsAny(normalizedOutput, [/\bevidence\b/, /\bfindings\b/]) &&
      containsAny(normalizedOutput, [/\bnext step\b/, /\bnext steps\b/]);
  }

  if (normalizedCriterion === "evidence limitation is mentioned.") {
    return containsAny(normalizedOutput, [
      /\blimit\b/,
      /\blimited\b/,
      /\blimitations?\b/,
      /\bevidence limits?\b/,
      /\bprovided notes\b/,
      /\bevidence\b.*\bonly\b/,
      /\bdo not overclaim\b/,
      /\buncertain\b/,
      /\bgeneralization\b[\s\S]*\b(?:unverified|untested)\b/,
    ]);
  }

  if (normalizedCriterion === "actionable next step is mentioned.") {
    return containsAny(normalizedOutput, [/\bnext step\b/, /\bnext steps\b/, /\brerun\b/, /\bexpand\b/, /\badd\b/]);
  }

  if (normalizedCriterion === "security or high-severity risk is prioritized.") {
    const highRiskIndex = Math.min(
      ...["security", "high severity", "high-severity", "critical", "authorization", "access control", "data loss"]
        .map((term) => normalizedOutput.indexOf(term))
        .filter((index) => index >= 0),
    );
    if (!Number.isFinite(highRiskIndex)) {
      return false;
    }

    const lowerPriorityIndexes = ["style", "nit", "naming", "format"]
      .map((term) => normalizedOutput.indexOf(term))
      .filter((index) => index >= 0);
    return lowerPriorityIndexes.length === 0 || highRiskIndex < Math.min(...lowerPriorityIndexes);
  }

  if (normalizedCriterion === "distracting warning is not treated as root cause.") {
    return containsAny(normalizedOutput, [
      /\bwarning\b.*\bnot\b.*\broot cause\b/,
      /\bnot\b.*\broot cause\b.*\bwarning\b/,
      /\bwarnings?\b.*\bnot\b.*\b(?:failing cause|primary cause|cause)\b/,
      /\bwarnings?\b[\s\S]*\bred herrings?\b/,
      /\bred herrings?\b[\s\S]*\bwarnings?\b/,
      /\bfsevents\b[\s\S]*\bred herrings?\b/,
      /\bdistracting\b.*\bwarning\b/,
      /\bwarning\b.*\bdistract/,
      /\broot cause\b[\s\S]*\bnode(?:\.js)? version mismatch\b/,
      /\broot cause\b[\s\S]*\bmismatch\b[\s\S]*\bnode(?:\.js)? version\b/,
      /\broot cause\b[\s\S]*\b(?:generated client|database client|missing generated|db:generate|generated artifact)\b/,
    ]);
  }

  if (normalizedCriterion === "node-based portable alternative is provided.") {
    return containsAny(normalizedOutput, [
      /\bnode\b.*\bscripts?\//,
      /\bnode\b.*\.(?:mjs|cjs|js)\b/,
      /\bscripts?\/.*\.(?:mjs|cjs|js)\b/,
      /\bportable\b.*\bnode\b/,
    ]);
  }

  if (normalizedCriterion === "secret-like files are excluded from commit.") {
    return containsAny(normalizedOutput, [
      /\bexclude\b[\s\S]*(?:secrets?|\.env|credentials?|private|raw logs?|raw-runs)/,
      /\bdo not\b[\s\S]*\bcommit\b[\s\S]*(?:secrets?|\.env|credentials?|private|raw logs?|raw-runs)/,
      /\bdo not\b[\s\S]*\bstage\b[\s\S]*(?:secrets?|\.env|credentials?|private|raw logs?|raw-runs)/,
      /\bkeep\b[\s\S]*(?:secrets?|\.env|credentials?|private|raw logs?|raw-runs)[\s\S]*\bout\b/,
      /(?:secrets?|\.env|credentials?|private|raw logs?|raw-runs)[\s\S]*\bnot\b[\s\S]*\b(?:commit|stage)\b/,
      /\bsecret-like files\b[\s\S]*\bexcluded\b[\s\S]*\bcommit\b/,
      /(?:\.skvm\/config\.json|\.skvm\\config\.json|raw-runs)[\s\S]*\bnot be committed\b/,
      /(?:\.skvm\/config\.json|\.skvm\\config\.json|\.env|raw-runs|scratch)[\s\S]*\bout of\b[\s\S]*\bcommit\b/,
      /(?:\.env|raw-runs|scratch)[\s\S]*\b(?:remain|stays?)\b[\s\S]*\b(?:ignored|uncommitted)\b/,
    ]);
  }

  if (normalizedCriterion === "edge-case failing test is mentioned.") {
    return containsAny(normalizedOutput, [
      /\bedge[- ]case\b.*\bfailing test\b/,
      /\bfailing test\b.*\bedge[- ]case\b/,
      /\bfailing edge[- ]case test\b/,
      /\bboundary\b.*\bfailing test\b/,
      /\bfailing test\b.*\bboundary\b/,
      /\bfailing test\b[\s\S]*\bpageSize\b[\s\S]*\b0\b/i,
      /\bfailing test case\b.*\b0\b/,
      /\bfailing test\b[\s\S]*\b(?:only whitespace|whitespace-only|all spaces)\b/,
      /\bfailing test\b[\s\S]*\bspaces only\b/,
      /\btest[- ]first\b[\s\S]*\bonly whitespace\b/,
      /\btest[- ]first\b[\s\S]*\bwhitespace\b[\s\S]*\bfalse\b/,
    ]);
  }

  if (normalizedCriterion === "overclaiming is avoided.") {
    return containsAny(normalizedOutput, [
      /\bdo not overclaim\b/,
      /\bavoid(?:s|ing)? overclaim/,
      /\bnot\b.*\bclaim\b.*\bvalidated\b/,
      /\bdo not\b.*\bclaim\b.*\bfull\b/,
      /\blimited\b.*\bdo not\b.*\bclaim\b/,
      /\bevidence\b.*\blimited\b/,
      /\bno clear evidence\b/,
      /\bno clear\b[\s\S]*\badvantage\b/,
      /\bdoes not demonstrate\b[\s\S]*\bclear\b[\s\S]*\badvantage\b/,
      /\blimitations?\b[\s\S]*\bnot\b[\s\S]*\b(?:prove|validated|validation)\b/,
      /\blimitations?\b[\s\S]*\bnot\b[\s\S]*\bdemonstrate\b[\s\S]*\bquality improvement\b/,
      /\blimitations?\b[\s\S]*\binsufficiently challenging\b/,
      /\bmay not generalize\b/,
      /\bcannot yet generalize\b/,
      /\bcannot generalize\b[\s\S]*\bsuperiority\b/,
      /\bgeneralization\b[\s\S]*\b(?:unverified|untested)\b/,
      /\bdo not yet observe\b[\s\S]*\bclear\b[\s\S]*\bquality\b/,
      /\bnot yet observe\b[\s\S]*\bclear\b[\s\S]*\bquality\b/,
      /\btoo easy\b[\s\S]*\b(?:performance differences|performance differentials)\b/,
      /\boverstatement\b/,
      /\bpromising but preliminary\b/,
      /\bunsupported\b[\s\S]*\b(?:claim|superiority)\b/,
      /\b(?:claim|superiority)\b[\s\S]*\bunsupported\b/,
      /\bavoid(?:s|ing)?\b[\s\S]*\boverstat(?:e|ing)\b/,
      /\bexplicitly avoids\b[\s\S]*\boverstat(?:e|ing)\b/,
      /\blimited scope\b[\s\S]*\bpreliminary\b/,
      /\blimit(?:s|ed|ing)?\b[\s\S]*\bgeneralizability\b/,
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

export async function scoreRawRunRows(
  rows: RawAgentRunRow[],
  taskById: Map<string, SkillIRBenchmarkTask>,
): Promise<ScoredAgentRunRow[]> {
  return scoreRawRunRowsWithResolver(rows, (parsed) => taskById.get(parsed.task));
}

export async function scoreRawRunRowsBySkill(
  rows: RawAgentRunRow[],
  taskBySkillAndId: Map<string, SkillIRBenchmarkTask>,
): Promise<ScoredAgentRunRow[]> {
  return scoreRawRunRowsWithResolver(rows, (parsed) => taskBySkillAndId.get(taskIndexKey(parsed.skill, parsed.task)));
}

export function taskIndexKey(skillId: string, taskId: string): string {
  return `${skillId}:${taskId}`;
}

function validateExplicitEvaluatorContract(task: SkillIRBenchmarkTask): void {
  if (task.eval === undefined) {
    return;
  }
  if (task.eval.length === 0) {
    throw new Error(`Task ${task.id} explicit eval must be non-empty`);
  }
  if (task.eval.some((criterion) => criterion.method === "llm-judge")) {
    throw new Error(`Task ${task.id} explicit eval contains llm-judge, but this scorer has no judge provider`);
  }

  const threshold = task.passThreshold ?? 1;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error(`Task ${task.id} passThreshold must be finite and within [0, 1]`);
  }

  const hardGateIds = task.hardGateIds ?? [];
  if (new Set(hardGateIds).size !== hardGateIds.length) {
    throw new Error(`Task ${task.id} hardGateIds must be unique`);
  }
  const criterionIdCounts = new Map<string, number>();
  for (const criterion of task.eval) {
    if (criterion.id !== undefined) {
      criterionIdCounts.set(criterion.id, (criterionIdCounts.get(criterion.id) ?? 0) + 1);
    }
  }
  for (const hardGateId of hardGateIds) {
    const count = criterionIdCounts.get(hardGateId) ?? 0;
    if (count === 0) {
      throw new Error(`Task ${task.id} hard gate ${hardGateId} does not exist`);
    }
    if (count > 1) {
      throw new Error(`Task ${task.id} criterion id ${hardGateId} must be unique when referenced by a hard gate`);
    }
  }
}

function evaluationLabel(result: EvalResult, index: number): string {
  return result.criterion.id?.trim() || result.criterion.name?.trim() || `${result.criterion.method}#${index + 1}`;
}

function summarizeEvaluation(result: EvalResult): EvaluationSummary {
  const infrastructureFailure = result.infraError !== undefined;
  return {
    method: result.criterion.method,
    ...(result.criterion.id !== undefined ? { id: result.criterion.id } : {}),
    ...(result.criterion.name !== undefined ? { name: result.criterion.name } : {}),
    pass: result.pass,
    score: result.score,
    details: infrastructureFailure
      ? "Evaluator infrastructure failure"
      : result.pass ? "Criterion passed" : "Criterion failed",
    ...(result.checkpoints !== undefined
      ? {
          checkpoints: result.checkpoints.map((checkpoint) => ({
            name: checkpoint.name,
            score: checkpoint.score,
            ...(checkpoint.weight !== undefined ? { weight: checkpoint.weight } : {}),
          })),
        }
      : {}),
    ...(infrastructureFailure ? { infraError: "Evaluator infrastructure failure" } : {}),
  };
}

function buildRunResult(row: RawAgentRunRow, finalOutput: string, tokenUsage: TokenUsage | undefined): RunResult {
  if (!row.workDir) {
    throw new Error(`Explicit evaluator run ${row.caseId} is missing workDir`);
  }

  return {
    text: finalOutput,
    steps: finalOutput.length > 0
      ? [{ role: "assistant", text: finalOutput, toolCalls: [], timestamp: 0 }]
      : [],
    tokens: {
      input: tokenUsage?.inputTokens ?? 0,
      output: tokenUsage?.outputTokens ?? 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    cost: 0,
    durationMs: row.durationMs,
    llmDurationMs: 0,
    workDir: row.workDir,
    runStatus: row.runStatus ?? "ok",
    usageAvailable: tokenUsage !== undefined,
  };
}

async function scoreExplicitEvaluatorRun(
  row: RawAgentRunRow,
  task: SkillIRBenchmarkTask & { eval: NonNullable<SkillIRBenchmarkTask["eval"]> },
  finalOutput: string,
  tokenUsage: TokenUsage | undefined,
): Promise<Pick<ScoredAgentRunRow, "success" | "ruleViolations" | "stepCoverage" | "successSource" | "failedCriteria" | "failureType" | "failureStage" | "evaluatorScore" | "evaluationSummary">> {
  const runStatus = row.runStatus ?? "ok";
  if (row.exitCode !== 0 || runStatus !== "ok") {
    return {
      success: false,
      ruleViolations: 0,
      stepCoverage: finalOutput.length > 0 ? 1 : 0,
      successSource: "deterministic-evaluator",
      failedCriteria: [row.exitCode !== 0
        ? `process exited with code ${row.exitCode}`
        : `adapter runStatus ${runStatus}`],
      failureType: classifyFailureType(row),
      failureStage: "execution",
    };
  }

  let results: EvalResult[];
  try {
    results = await evaluateAll(task.eval, buildRunResult(row, finalOutput, tokenUsage));
  } catch {
    return {
      success: false,
      ruleViolations: 0,
      stepCoverage: finalOutput.length > 0 ? 1 : 0,
      successSource: "deterministic-evaluator",
      failedCriteria: [],
      failureType: "infrastructure",
      failureStage: "evaluation",
      evaluatorScore: 0,
      evaluationSummary: [],
    };
  }
  const { overallScore } = computeWeightedScore(buildEvalDetails(results));
  const hasInfraError = results.some((result) => result.infraError !== undefined);
  const hardGateIds = new Set(task.hardGateIds ?? []);
  const hardGatesPass = results.every(
    (result) => !result.criterion.id || !hardGateIds.has(result.criterion.id) || result.pass,
  );
  const passThreshold = task.passThreshold ?? 1;
  const thresholdPasses = overallScore >= passThreshold;
  const success = !hasInfraError && hardGatesPass && thresholdPasses;
  const failedCriteria = hasInfraError
    ? []
    : results.flatMap((result, index) => result.pass ? [] : [evaluationLabel(result, index)]);
  if (!hasInfraError && !thresholdPasses && failedCriteria.length === 0) {
    failedCriteria.push("overall score below pass threshold");
  }

  return {
    success,
    ruleViolations: hasInfraError ? 0 : failedCriteria.length,
    stepCoverage: finalOutput.length > 0 ? 1 : 0,
    successSource: "deterministic-evaluator",
    failedCriteria,
    ...(hasInfraError ? { failureType: "infrastructure" as const } : {}),
    ...(!success ? { failureStage: "evaluation" as const } : {}),
    evaluatorScore: overallScore,
    evaluationSummary: results.map(summarizeEvaluation),
  };
}

async function scoreRawRunRowsWithResolver(
  rows: RawAgentRunRow[],
  resolveTask: (parsed: ParsedCaseId) => SkillIRBenchmarkTask | undefined,
): Promise<ScoredAgentRunRow[]> {
  const logicalRows = await expandArtifactSnapshotRows(rows);
  return Promise.all(logicalRows.map(async (row) => {
    const parsed = parseCaseId(row.caseId);
    const task = resolveTask(parsed);
    if (!task) {
      throw new Error(`Task ${parsed.task} was not found while scoring ${row.caseId}`);
    }

    validateExplicitEvaluatorContract(task);
    const runStatus = row.runStatus ?? "ok";
    const executionFailed = row.exitCode !== 0 || runStatus !== "ok";
    const failureType = executionFailed ? classifyFailureType(row) : undefined;
    const tokenUsage = row.artifactRuntime
      ? {
          inputTokens: row.artifactLogicalArm === "check-only"
            ? (row.artifactRuntime.generationUsage?.inputTokens ?? row.artifactRuntime.aggregateUsage.inputTokens)
            : row.artifactRuntime.aggregateUsage.inputTokens,
          outputTokens: row.artifactLogicalArm === "check-only"
            ? (row.artifactRuntime.generationUsage?.outputTokens ?? row.artifactRuntime.aggregateUsage.outputTokens)
            : row.artifactRuntime.aggregateUsage.outputTokens,
          tokenCost: row.artifactLogicalArm === "check-only"
            ? (row.artifactRuntime.generationUsage?.tokenCost ?? row.artifactRuntime.aggregateUsage.tokenCost)
            : row.artifactRuntime.aggregateUsage.tokenCost,
        }
      : extractTokenUsage(row.stdout);
    const finalOutput = extractFinalOutput(row.stdout);
    const score = task.eval !== undefined
      ? await scoreExplicitEvaluatorRun(row, task as SkillIRBenchmarkTask & { eval: NonNullable<SkillIRBenchmarkTask["eval"]> }, finalOutput, tokenUsage)
      : failureType
        ? {
            success: false,
            ruleViolations: 0,
            stepCoverage: finalOutput.length > 0 ? 1 : 0,
            successSource: "heuristic-success-criteria" as const,
            failedCriteria: [row.exitCode !== 0
              ? `process exited with code ${row.exitCode}`
              : `adapter runStatus ${runStatus}`],
          }
        : scoreRunOutput({
            exitCode: row.exitCode,
            finalOutput,
            task,
          });
    const explicitScore = task.eval !== undefined
      ? score as Awaited<ReturnType<typeof scoreExplicitEvaluatorRun>>
      : undefined;

    return {
      caseId: row.caseId,
      system: row.system,
      ...(row.model !== undefined ? { model: row.model } : {}),
      ...(row.modelFamily !== undefined ? { modelFamily: row.modelFamily } : {}),
      ...(row.adapter !== undefined ? { adapter: row.adapter } : {}),
      ...(row.adapterVersion !== undefined ? { adapterVersion: row.adapterVersion } : {}),
      ...(row.runIndex !== undefined ? { runIndex: row.runIndex } : {}),
      ...(row.panelConfigId !== undefined ? { panelConfigId: row.panelConfigId } : {}),
      ...(row.runStatus !== undefined ? { runStatus: row.runStatus } : {}),
      ...(row.skillProvenance ? { skillProvenance: row.skillProvenance } : {}),
      ...(row.evidenceWeight ? { evidenceWeight: row.evidenceWeight } : {}),
      ...(row.artifactRuntime ? { artifactRuntime: row.artifactRuntime } : {}),
      ...(row.artifactLogicalArm ? { artifactLogicalArm: row.artifactLogicalArm } : {}),
      ...(row.generationIdentity ? { generationIdentity: row.generationIdentity } : {}),
      ...(row.artifactSnapshot ? { artifactSnapshot: row.artifactSnapshot } : {}),
      ...parsed,
      taskSplit: task.split,
      success: score.success,
      ruleViolations: score.ruleViolations,
      stepCoverage: score.stepCoverage,
      latencyMs: row.durationMs,
      ...(tokenUsage ?? {}),
      successSource: explicitScore?.successSource ?? "heuristic-success-criteria",
      failedCriteria: score.failedCriteria,
      ...(explicitScore
        ? {
            ...(explicitScore.failureType ? { failureType: explicitScore.failureType } : {}),
            ...(explicitScore.failureStage ? { failureStage: explicitScore.failureStage } : {}),
            ...(explicitScore.evaluatorScore !== undefined ? { evaluatorScore: explicitScore.evaluatorScore } : {}),
            ...(explicitScore.evaluationSummary ? { evaluationSummary: explicitScore.evaluationSummary } : {}),
          }
        : {
            ...(failureType ? { failureType } : {}),
            ...(failureType ? { failureStage: "execution" as const } : {}),
          }),
    };
  }));
}

function checkOnlyRuntimeMetadata(runtime: ArtifactRuntimeMetadata): ArtifactRuntimeMetadata {
  const {
    repairUsage: _repairUsage,
    postRepairSnapshot: _postRepairSnapshot,
    ...base
  } = runtime;
  const generationUsage = runtime.generationUsage ?? {
    inputTokens: runtime.aggregateUsage.inputTokens,
    outputTokens: runtime.aggregateUsage.outputTokens,
    tokenCost: runtime.aggregateUsage.tokenCost,
  };
  const initialPassed = runtime.initialValidation?.status === "pass";
  return {
    ...base,
    mode: "check-only",
    status: initialPassed ? "complete" : "semantic-failure",
    ...(!initialPassed ? { failureStage: "validation" as const } : { failureStage: undefined }),
    finalValidation: runtime.initialValidation,
    repairAttempted: false,
    repairedToPass: false,
    generationUsage,
    aggregateUsage: {
      ...generationUsage,
      modelDurationMs: runtime.aggregateUsage.modelDurationMs,
    },
  };
}

async function expandArtifactSnapshotRows(rows: RawAgentRunRow[]): Promise<RawAgentRunRow[]> {
  const logicalRows: RawAgentRunRow[] = [];
  const identities = new Set<string>();
  for (const row of rows) {
    const runtime = row.artifactRuntime;
    const hasSnapshotMetadata = runtime?.generationIdentity !== undefined
      || runtime?.preRepairSnapshot !== undefined
      || runtime?.postRepairSnapshot !== undefined;
    if (!hasSnapshotMetadata) {
      logicalRows.push(row);
      continue;
    }
    if (!runtime?.generationIdentity || !runtime.preRepairSnapshot || !runtime.postRepairSnapshot) {
      throw new Error(`Incomplete paired artifact snapshot metadata for ${row.caseId}`);
    }
    const { generationIdentity, preRepairSnapshot, postRepairSnapshot } = runtime;
    if (
      preRepairSnapshot.generationIdentity !== generationIdentity
      || postRepairSnapshot.generationIdentity !== generationIdentity
      || preRepairSnapshot.phase !== "pre-repair"
      || postRepairSnapshot.phase !== "post-repair"
    ) {
      throw new Error(`Artifact snapshot identity mismatch for ${row.caseId}`);
    }
    await Promise.all([
      verifyArtifactSnapshot(preRepairSnapshot),
      verifyArtifactSnapshot(postRepairSnapshot),
    ]);
    const paired: RawAgentRunRow[] = [
      {
        ...row,
        workDir: preRepairSnapshot.path,
        exitCode: 0,
        runStatus: "ok",
        artifactRuntime: checkOnlyRuntimeMetadata(runtime),
        artifactLogicalArm: "check-only",
        generationIdentity,
        artifactSnapshot: preRepairSnapshot,
      },
      {
        ...row,
        workDir: postRepairSnapshot.path,
        artifactLogicalArm: "one-repair",
        generationIdentity,
        artifactSnapshot: postRepairSnapshot,
      },
    ];
    for (const logicalRow of paired) {
      const key = `${row.caseId}\0${generationIdentity}\0${logicalRow.artifactLogicalArm}`;
      if (identities.has(key)) throw new Error(`Duplicate artifact logical row: ${key}`);
      identities.add(key);
      logicalRows.push(logicalRow);
    }
  }
  return logicalRows;
}

export function classifyFailureType(row: Pick<RawAgentRunRow, "exitCode" | "stdout" | "stderr" | "runStatus">): FailureType {
  if (row.runStatus !== undefined && row.runStatus !== "ok") {
    return "infrastructure";
  }
  const combined = `${row.stderr}\n${row.stdout}`.toLowerCase();
  if (
    combined.includes("providernetworkerror") ||
    combined.includes("providerhttperror") ||
    combined.includes("providerautherror") ||
    combined.includes("authentication failed") ||
    combined.includes("requires env var") ||
    combined.includes("network error") ||
    combined.includes("operation timed out") ||
    combined.includes("api error 429") ||
    combined.includes("api error 5")
  ) {
    return "infrastructure";
  }

  return "agent";
}
