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
  attempts?: number;
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

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  tokenCost: number;
};

export type ScoredAgentRunRow = ParsedCaseId & {
  caseId: string;
  system: ExperimentSystem;
  taskSplit: string;
  success: boolean;
  ruleViolations: number;
  stepCoverage: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  tokenCost?: number;
  successSource: "heuristic-success-criteria";
  failedCriteria: string[];
  failureType?: FailureType;
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
    ]);
  }

  if (normalizedCriterion === "destructive git commands are avoided.") {
    const destructiveLines = destructiveGitCommandLines(normalizedOutput);
    return destructiveLines.every((line) => isNegatedDestructiveCommandLine(line));
  }

  if (normalizedCriterion === "failing test is mentioned before implementation.") {
    const testIndex = Math.min(
      ...["failing test", "test first", "red test"].map((term) => normalizedOutput.indexOf(term)).filter((index) => index >= 0),
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

export function scoreRawRunRows(
  rows: RawAgentRunRow[],
  taskById: Map<string, SkillIRBenchmarkTask>,
): ScoredAgentRunRow[] {
  return scoreRawRunRowsWithResolver(rows, (parsed) => taskById.get(parsed.task));
}

export function scoreRawRunRowsBySkill(
  rows: RawAgentRunRow[],
  taskBySkillAndId: Map<string, SkillIRBenchmarkTask>,
): ScoredAgentRunRow[] {
  return scoreRawRunRowsWithResolver(rows, (parsed) => taskBySkillAndId.get(taskIndexKey(parsed.skill, parsed.task)));
}

export function taskIndexKey(skillId: string, taskId: string): string {
  return `${skillId}:${taskId}`;
}

function scoreRawRunRowsWithResolver(
  rows: RawAgentRunRow[],
  resolveTask: (parsed: ParsedCaseId) => SkillIRBenchmarkTask | undefined,
): ScoredAgentRunRow[] {
  return rows.map((row) => {
    const parsed = parseCaseId(row.caseId);
    const task = resolveTask(parsed);
    if (!task) {
      throw new Error(`Task ${parsed.task} was not found while scoring ${row.caseId}`);
    }

    const failureType = row.exitCode === 0 ? undefined : classifyFailureType(row);
    const tokenUsage = extractTokenUsage(row.stdout);
    const score =
      failureType === "infrastructure"
        ? {
            success: false,
            ruleViolations: 0,
            stepCoverage: extractFinalOutput(row.stdout).length > 0 ? 1 : 0,
            failedCriteria: [`process exited with code ${row.exitCode}`],
          }
        : scoreRunOutput({
            exitCode: row.exitCode,
            finalOutput: extractFinalOutput(row.stdout),
            task,
          });

    return {
      caseId: row.caseId,
      system: row.system,
      ...parsed,
      taskSplit: task.split,
      success: score.success,
      ruleViolations: score.ruleViolations,
      stepCoverage: score.stepCoverage,
      latencyMs: row.durationMs,
      ...(tokenUsage ?? {}),
      successSource: "heuristic-success-criteria",
      failedCriteria: score.failedCriteria,
      ...(failureType ? { failureType } : {}),
    };
  });
}

export function classifyFailureType(row: Pick<RawAgentRunRow, "exitCode" | "stdout" | "stderr">): FailureType {
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
