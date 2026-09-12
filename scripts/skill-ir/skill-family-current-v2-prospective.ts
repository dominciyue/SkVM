import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { writeN1CorpusFromRepository } from "../../src/skill-ir/skill-family-current-v2-corpus";
import { writeN2GapMatrixFromRepository } from "../../src/skill-ir/skill-family-current-v2-n2";
import { writeN3SourceClosureReportFromRepository } from "../../src/skill-ir/skill-family-current-v2-n3";
import {
  verifyCurrentV2N4Maintenance,
  writeCurrentV2N4Maintenance,
  type CurrentV2N4BangumiReport,
  type CurrentV2N4MeilisearchReport,
} from "../../src/skill-ir/skill-family-current-v2-n4";
import {
  verifyCurrentV2N6ArchiveSearch,
  writeCurrentV2N6ArchiveSearch,
  type CurrentV2N6ArchiveSearchReport,
} from "../../src/skill-ir/skill-family-current-v2-n6";
import {
  runCurrentV2N14CleanReplay,
  verifyCurrentV2N14CleanReplay,
  type CurrentV2N14CleanReplayReport,
} from "../../src/skill-ir/skill-family-current-v2-n14";
import { writeN5ConsumerReportFromRepository } from "../../src/skill-ir/skill-family-current-v2-n5";
import { writeN8EngineReportFromRepository } from "../../src/skill-ir/skill-family-current-v2-n8";
import {
  materializeN10DevelopmentPanel,
  verifyN10Baseline,
  verifyN10DevelopmentPanel,
  verifyN10FirstRun,
  writeN10BaselineFromDevelopmentPanel,
  writeN10FirstRunFromDevelopmentPanel,
  type N10DevelopmentLock,
} from "../../src/skill-ir/skill-family-current-v2-n10";
import {
  buildN10RevisionDecision,
  verifyN10RevisionDecision,
  writeN10RevisionDecision,
  type N10RevisionReport,
} from "../../src/skill-ir/skill-family-current-v2-n10-revision";
import {
  verifyCurrentV2ReadinessReport,
  writeCurrentV2ReadinessReport,
  type CurrentV2ReadinessReport,
} from "../../src/skill-ir/skill-family-current-v2-readiness";
import {
  verifyCurrentV2ResearchNotExecutedReport,
  writeCurrentV2ResearchNotExecutedReport,
  type CurrentV2ResearchNotExecutedReport,
} from "../../src/skill-ir/skill-family-current-v2-research-gate";
import {
  verifyCurrentV2N13Comparison,
  writeCurrentV2N13Comparison,
  writeCurrentV2N13Reclassification,
  type CurrentV2N13Report,
} from "../../src/skill-ir/skill-family-current-v2-n13";

export const CURRENT_V2_IDENTITY = "skill-family-current-v2-source-repair-001" as const;
export const CURRENT_V2_RESULT_RELATIVE = "results/skill-ir/skill-family-current-v2-source-repair-001" as const;
export const CURRENT_V2_PLAN_RELATIVE = "docs/superpowers/plans/2026-09-12-skill-family-source-repair-and-prospective.md" as const;

export const TASK_STATUSES = [
  "pending",
  "running",
  "completed",
  "completed-with-limitation",
  "blocked",
  "not-executed",
] as const;

export type TaskStatus = typeof TASK_STATUSES[number];
export type TaskTrack = "engineering" | "research" | "maintenance";
export type TaskId =
  | "N0" | "N1" | "N2" | "N3" | "N4" | "N5" | "N6" | "N7"
  | "N8" | "N9" | "N10" | "N11" | "N12" | "N13" | "N14" | "N15";

export type TaskDefinition = {
  id: TaskId;
  title: string;
  track: TaskTrack;
  dependencies: TaskId[];
  dependencyPolicy: "successful" | "terminal";
  acceptance: string[];
  evidenceTargets: string[];
};

export type StageManifest = {
  schemaVersion: "skill-family-current-v2-stage/v1";
  identity: typeof CURRENT_V2_IDENTITY;
  planRevision: 2;
  plan: { path: typeof CURRENT_V2_PLAN_RELATIVE; baselineSha256: string };
  repository: { baseCommit: string; branch: string; upstream: string | null };
  environment: { bunVersion: string; nodeVersion: string };
  createdAt: string;
  executionOrder: TaskId[];
  tasks: TaskDefinition[];
  exposureLedger: {
    priorDevelopmentLedger: string;
    reviewPath: string;
    entries: Array<{ repository: string; scope: string; exposure: "development-exposed" }>;
  };
  protectedBoundaries: {
    historicalDocumentResult: "0/6-unchanged";
    historicalCandidateAndReports: "read-only";
    heldOutAndQ1Reserve: "read-only-until-separate-locked-protocol";
    readiness: "unchanged";
  };
};

export type TaskExecution = {
  status: TaskStatus;
  commit: string | null;
  evidence: string[];
  issues: string[];
  startedAt: string | null;
  completedAt: string | null;
};

export type ExecutionStatus = {
  schemaVersion: "skill-family-current-v2-execution-status/v1";
  identity: typeof CURRENT_V2_IDENTITY;
  planRevision: 2;
  overallStatus: "active" | "completed" | "blocked";
  currentStage: TaskId | null;
  commits: { baseCommit: string; codeCommit: string | null; evidenceCommit: string | null };
  baseline: {
    command: string;
    result: "passed" | "failed";
    branch: string;
    upstream: string | null;
    bunVersion: string;
    nodeVersion: string;
  };
  tasks: Record<TaskId, TaskExecution>;
  evidenceRoot: typeof CURRENT_V2_RESULT_RELATIVE;
  unresolvedIssues: string[];
  nextAction: string;
  accounting: {
    sourceApiCalls: number;
    businessApiCalls: number;
    modelCalls: number;
    paidCalls: number;
    nativeLoopbackHttpCalls: number;
    developmentAgentCost: "not-measured" | number;
  };
  protectedState: {
    historicalDocumentResult: "0/6-unchanged";
    heldOutReads: number;
    q1ReservedReads: number;
    prospectiveRuns: number;
  };
  createdAt: string;
  updatedAt: string;
};

type ManifestInput = {
  baseCommit: string;
  branch: string;
  upstream: string | null;
  bunVersion: string;
  nodeVersion: string;
  planSha256: string;
  createdAt: string;
};

const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;
const TERMINAL = new Set<TaskStatus>(["completed", "completed-with-limitation", "blocked", "not-executed"]);
const SUCCESSFUL = new Set<TaskStatus>(["completed", "completed-with-limitation"]);

const TASK_DEFINITIONS: TaskDefinition[] = [
  {
    id: "N0",
    title: "recovery and minimum baseline",
    track: "engineering",
    dependencies: [],
    dependencyPolicy: "successful",
    acceptance: ["persist environment and actual base commit", "status/resume locates first runnable task", "historical protected evidence remains read-only"],
    evidenceTargets: ["stage-manifest.json", "execution-status.json"],
  },
  {
    id: "N1",
    title: "requirement corpus and independent input sources",
    track: "engineering",
    dependencies: ["N0"],
    dependencyPolicy: "successful",
    acceptance: ["12-20 complete bodies across at least 6 repository origins are targeted without inventing membership", "at least 3 verified duties are usable by N2 or insufficient-evidence is explicit"],
    evidenceTargets: ["corpus/source-ledger.json", "corpus/duty-matrix.json", "corpus/exposure-ledger.json"],
  },
  {
    id: "N2",
    title: "TaskContract and complete obligation plan",
    track: "engineering",
    dependencies: ["N1"],
    dependencyPolicy: "successful",
    acceptance: ["different requirements change the plan and artifact obligations", "renaming a member or repository does not change plan semantics", "complete required denominator exists before construction"],
    evidenceTargets: ["baseline/gap-matrix.json"],
  },
  {
    id: "N3",
    title: "task-relevant source closure",
    track: "engineering",
    dependencies: ["N2"],
    dependencyPolicy: "successful",
    acceptance: ["dependency loss identifies affected requirements", "recursive resolution and witness constructibility are reported separately", "unaffected operations continue independently"],
    evidenceTargets: ["source-closure/report.json"],
  },
  {
    id: "N5",
    title: "real artifact consumption and fault loop",
    track: "engineering",
    dependencies: ["N2", "N3"],
    dependencyPolicy: "successful",
    acceptance: ["request-json and pytest packages are consumed outside the research runner", "two semantic loopback fixtures execute nonzero native tests", "eight preregistered faults are detected at their specified layers"],
    evidenceTargets: ["integration/consumer-report.json"],
  },
  {
    id: "N8",
    title: "shared engine integration",
    track: "engineering",
    dependencies: ["N2", "N3", "N5"],
    dependencyPolicy: "successful",
    acceptance: ["ordinary TaskContract input reaches plan, closure, construction, checking, bundle and consumer", "legacy and rich backends remain distinct", "normal temporary-directory execution succeeds"],
    evidenceTargets: ["integration/engine-report.json"],
  },
  {
    id: "N10",
    title: "development batch and method gate",
    track: "engineering",
    dependencies: ["N8"],
    dependencyPolicy: "successful",
    acceptance: ["at least 6 distinct original API contracts and 3 providers are locked", "three reviewed repository-distinct duty mappings are represented", "engineering minimum gate is computed without shrinking denominators"],
    evidenceTargets: ["development/lock.json", "development/report.json"],
  },
  {
    id: "N7",
    title: "non-circular readiness",
    track: "engineering",
    dependencies: ["N2"],
    dependencyPolicy: "successful",
    acceptance: ["dimensions use ready, not-ready or not-assessed with reasons", "one blocked task does not globally block unrelated tasks", "protocol, prospective, transfer and reproduction state are not circular"],
    evidenceTargets: ["readiness/report.json"],
  },
  {
    id: "N9",
    title: "freeze current code candidate",
    track: "research",
    dependencies: ["N7", "N10"],
    dependencyPolicy: "successful",
    acceptance: ["entry, runtime, checkers, dependencies and Git materialization are self-contained and locked", "calibration precedes the freeze", "research does not start when the N10 method gate fails"],
    evidenceTargets: ["prospective/code-candidate-lock.json"],
  },
  {
    id: "N11",
    title: "post-acquisition protocol and concrete predictions",
    track: "research",
    dependencies: ["N9"],
    dependencyPolicy: "successful",
    acceptance: ["method and selection rules precede authorized body reads", "concrete predictions precede construction", "exposed and protected sources are excluded from unseen claims"],
    evidenceTargets: ["prospective/source-lock.json", "prospective/predictions.json"],
  },
  {
    id: "N12",
    title: "one-shot first run",
    track: "research",
    dependencies: ["N11"],
    dependencyPolicy: "successful",
    acceptance: ["the complete locked denominator runs once", "algorithmic failures are not rerolled or replaced", "follow-up revisions remain separate from first-run results"],
    evidenceTargets: ["prospective/first-run-report.json"],
  },
  {
    id: "N13",
    title: "external Schemathesis comparison",
    track: "engineering",
    dependencies: ["N10"],
    dependencyPolicy: "successful",
    acceptance: ["same fixtures and constraints are compared when feasible", "installation or compatibility failure is retained explicitly", "the comparison does not inflate SkVM evidence"],
    evidenceTargets: ["comparison/schemathesis-report.json"],
  },
  {
    id: "N4",
    title: "time-boxed historical source repair",
    track: "maintenance",
    dependencies: ["N3"],
    dependencyPolicy: "successful",
    acceptance: ["Meilisearch and Bangumi each have an explained terminal state", "old reports are unchanged", "unresolved history blocks only dependent tasks"],
    evidenceTargets: ["source-repair/meilisearch-resolution.json", "source-repair/bangumi-external-closure.json"],
  },
  {
    id: "N6",
    title: "time-boxed clean-002 archive search",
    track: "maintenance",
    dependencies: ["N2"],
    dependencyPolicy: "successful",
    acceptance: ["the exact archive is recovered or the bounded search scope is recorded", "new clean evidence does not overwrite the historical digest"],
    evidenceTargets: ["archive-recovery/clean-002-search.json"],
  },
  {
    id: "N14",
    title: "clean environment replay",
    track: "engineering",
    dependencies: ["N9", "N11", "N12"],
    dependencyPolicy: "terminal",
    acceptance: ["a detached checkout installs locked dependencies offline", "ordinary entry and native consumption replay from committed inputs", "engineering replay remains possible when research is explicitly not executed"],
    evidenceTargets: ["clean-reproduction/report.json"],
  },
  {
    id: "N15",
    title: "final report and delivery",
    track: "engineering",
    dependencies: ["N0", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "N10", "N11", "N12", "N13", "N14"],
    dependencyPolicy: "terminal",
    acceptance: ["engineering and research outcomes are reported separately", "commands, evidence, remaining issues and next recommendation are reproducible", "focused, typecheck, docs, diff and clean evidence are fresh before delivery"],
    evidenceTargets: ["final-report.json"],
  },
];

function fail(message: string): never {
  throw new Error(`invalid current-v2 stage: ${message}`);
}

function isSafeRelativePath(value: string): boolean {
  return Boolean(value)
    && !isAbsolute(value)
    && !/^[A-Za-z]:[\\/]/u.test(value)
    && !value.startsWith("\\\\")
    && !value.split(/[\\/]+/u).includes("..");
}

function dependencySatisfied(definition: TaskDefinition, status: ExecutionStatus): boolean {
  const allowed = definition.dependencyPolicy === "terminal" ? TERMINAL : SUCCESSFUL;
  return definition.dependencies.every((dependency) => allowed.has(status.tasks[dependency].status));
}

export function buildStageManifest(input: ManifestInput): StageManifest {
  return {
    schemaVersion: "skill-family-current-v2-stage/v1",
    identity: CURRENT_V2_IDENTITY,
    planRevision: 2,
    plan: { path: CURRENT_V2_PLAN_RELATIVE, baselineSha256: input.planSha256 },
    repository: { baseCommit: input.baseCommit, branch: input.branch, upstream: input.upstream },
    environment: { bunVersion: input.bunVersion, nodeVersion: input.nodeVersion },
    createdAt: input.createdAt,
    executionOrder: TASK_DEFINITIONS.map(({ id }) => id),
    tasks: TASK_DEFINITIONS.map((task) => ({ ...task, dependencies: [...task.dependencies], acceptance: [...task.acceptance], evidenceTargets: [...task.evidenceTargets] })),
    exposureLedger: {
      priorDevelopmentLedger: "results/skill-ir/skill-family-deepening-20260911/source-index.json",
      reviewPath: "docs/skill-ir/skill-family-plan-review-20260912.md",
      entries: [
        { repository: "LambdaTest/agent-skills", scope: "api-to-testcase-generator and API-related index excerpts", exposure: "development-exposed" },
        { repository: "pactflow/pactflow-agent-skills", scope: "openapi-parser, pactflow and contract-testing-flywheel excerpts", exposure: "development-exposed" },
        { repository: "borghei/Claude-Skills", scope: "engineering/api-test-suite-builder", exposure: "development-exposed" },
        { repository: "event4u-app/agent-config", scope: "src/skills/api-testing", exposure: "development-exposed" },
        { repository: "laurigates/claude-plugins", scope: "configure-api-tests index/body excerpts", exposure: "development-exposed" },
        { repository: "he8um/api-design-skills", scope: "search-result description", exposure: "development-exposed" },
      ],
    },
    protectedBoundaries: {
      historicalDocumentResult: "0/6-unchanged",
      historicalCandidateAndReports: "read-only",
      heldOutAndQ1Reserve: "read-only-until-separate-locked-protocol",
      readiness: "unchanged",
    },
  };
}

export function buildInitialExecutionStatus(
  manifest: StageManifest,
  input: { createdAt: string; baselineStatusCommand: string; baselineStatus: "passed" | "failed" },
): ExecutionStatus {
  const tasks = Object.fromEntries(manifest.tasks.map((task) => [task.id, {
    status: task.id === "N0" ? "completed" : "pending",
    commit: null,
    evidence: task.id === "N0" ? [
      `${CURRENT_V2_RESULT_RELATIVE}/stage-manifest.json`,
      `${CURRENT_V2_RESULT_RELATIVE}/execution-status.json`,
      "scripts/skill-ir/skill-family-current-v2-prospective.test.ts",
    ] : [],
    issues: [],
    startedAt: task.id === "N0" ? input.createdAt : null,
    completedAt: task.id === "N0" ? input.createdAt : null,
  }])) as Record<TaskId, TaskExecution>;
  return {
    schemaVersion: "skill-family-current-v2-execution-status/v1",
    identity: CURRENT_V2_IDENTITY,
    planRevision: 2,
    overallStatus: "active",
    currentStage: "N1",
    commits: { baseCommit: manifest.repository.baseCommit, codeCommit: null, evidenceCommit: null },
    baseline: {
      command: input.baselineStatusCommand,
      result: input.baselineStatus,
      branch: manifest.repository.branch,
      upstream: manifest.repository.upstream,
      bunVersion: manifest.environment.bunVersion,
      nodeVersion: manifest.environment.nodeVersion,
    },
    tasks,
    evidenceRoot: CURRENT_V2_RESULT_RELATIVE,
    unresolvedIssues: [
      "historical-clean-002-archive-missing",
      "meilisearch-total-reference-unresolved-for-dependent-construction",
      "bangumi-external-response-source-validity-advisory",
    ],
    nextAction: "N1: build corpus/source-ledger.json, corpus/duty-matrix.json, and corpus/exposure-ledger.json from archived bodies before new acquisition",
    accounting: {
      sourceApiCalls: 0,
      businessApiCalls: 0,
      modelCalls: 0,
      paidCalls: 0,
      nativeLoopbackHttpCalls: 0,
      developmentAgentCost: "not-measured",
    },
    protectedState: {
      historicalDocumentResult: "0/6-unchanged",
      heldOutReads: 0,
      q1ReservedReads: 0,
      prospectiveRuns: 0,
    },
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function validateStageState(manifest: StageManifest, status: ExecutionStatus): void {
  if (manifest.schemaVersion !== "skill-family-current-v2-stage/v1" || manifest.identity !== CURRENT_V2_IDENTITY || manifest.planRevision !== 2) fail("manifest identity or revision");
  if (!HEX_40.test(manifest.repository.baseCommit)) fail("base commit");
  if (!HEX_64.test(manifest.plan.baselineSha256)) fail("plan digest");
  if (manifest.executionOrder.join("|") !== manifest.tasks.map(({ id }) => id).join("|")) fail("execution order does not match task definitions");
  const definitions = new Map<TaskId, TaskDefinition>();
  for (const task of manifest.tasks) {
    if (definitions.has(task.id)) fail(`duplicate task ${task.id}`);
    definitions.set(task.id, task);
  }
  for (const task of manifest.tasks) {
    for (const dependency of task.dependencies) {
      if (!definitions.has(dependency) || dependency === task.id) fail(`${task.id} has invalid dependency ${dependency}`);
    }
  }
  const visiting = new Set<TaskId>();
  const visited = new Set<TaskId>();
  const visit = (taskId: TaskId) => {
    if (visiting.has(taskId)) fail(`dependency cycle at ${taskId}`);
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependency of definitions.get(taskId)!.dependencies) visit(dependency);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of manifest.tasks) visit(task.id);

  if (status.schemaVersion !== "skill-family-current-v2-execution-status/v1" || status.identity !== manifest.identity || status.planRevision !== manifest.planRevision) fail("status identity or revision");
  if (status.commits.baseCommit !== manifest.repository.baseCommit) fail("status base commit does not match manifest");
  const statusIds = Object.keys(status.tasks).sort();
  const manifestIds = manifest.tasks.map(({ id }) => id).sort();
  if (statusIds.join("|") !== manifestIds.join("|")) fail("status task set does not match manifest");
  let runningCount = 0;
  for (const definition of manifest.tasks) {
    const task = status.tasks[definition.id];
    if (!TASK_STATUSES.includes(task.status)) fail(`${definition.id} has invalid status`);
    if (task.status === "running") runningCount += 1;
    if (["running", "completed", "completed-with-limitation"].includes(task.status) && !dependencySatisfied(definition, status)) {
      const unmet = definition.dependencies.find((dependency) => {
        const allowed = definition.dependencyPolicy === "terminal" ? TERMINAL : SUCCESSFUL;
        return !allowed.has(status.tasks[dependency].status);
      });
      fail(`${definition.id} cannot be ${task.status} before dependency ${unmet}`);
    }
    if (["blocked", "not-executed"].includes(task.status) && task.issues.length === 0) fail(`${definition.id} ${task.status} requires an issue`);
    for (const path of task.evidence) if (!isSafeRelativePath(path)) fail(`${definition.id} unsafe evidence path`);
    if (task.commit !== null && !HEX_40.test(task.commit)) fail(`${definition.id} commit`);
  }
  if (runningCount > 1) fail("more than one task is running");
  if (status.protectedState.historicalDocumentResult !== "0/6-unchanged") fail("historical document result changed");
  for (const count of [status.protectedState.heldOutReads, status.protectedState.q1ReservedReads, status.protectedState.prospectiveRuns]) {
    if (!Number.isInteger(count) || count < 0) fail("protected count");
  }
}

function selectNextRunnableTaskUnchecked(manifest: StageManifest, status: ExecutionStatus): TaskId | null {
  const running = manifest.tasks.find((task) => status.tasks[task.id].status === "running");
  if (running) return running.id;
  return manifest.tasks.find((task) => status.tasks[task.id].status === "pending" && dependencySatisfied(task, status))?.id ?? null;
}

export function selectNextRunnableTask(manifest: StageManifest, status: ExecutionStatus): TaskId | null {
  validateStageState(manifest, status);
  return selectNextRunnableTaskUnchecked(manifest, status);
}

export function completeTask(
  manifest: StageManifest,
  status: ExecutionStatus,
  taskId: TaskId,
  input: {
    completedAt: string;
    evidence: string[];
    nextAction: string;
    outcome?: "completed" | "completed-with-limitation";
    issues?: string[];
    commit?: string | null;
  },
): ExecutionStatus {
  validateStageState(manifest, status);
  const runnable = selectNextRunnableTaskUnchecked(manifest, status);
  if (runnable !== taskId) fail(`${taskId} is not the current runnable task (${runnable ?? "none"})`);
  const outcome = input.outcome ?? "completed";
  const issues = [...(input.issues ?? [])];
  if (outcome === "completed-with-limitation" && issues.length === 0) fail(`${taskId} completed-with-limitation requires an issue`);
  const next = structuredClone(status);
  next.tasks[taskId] = {
    status: outcome,
    commit: input.commit ?? null,
    evidence: [...input.evidence],
    issues,
    startedAt: status.tasks[taskId].startedAt ?? input.completedAt,
    completedAt: input.completedAt,
  };
  next.updatedAt = input.completedAt;
  next.nextAction = input.nextAction;
  next.currentStage = selectNextRunnableTaskUnchecked(manifest, next);
  next.overallStatus = manifest.tasks.every((task) => TERMINAL.has(next.tasks[task.id].status))
    ? "completed"
    : next.currentStage === null ? "blocked" : "active";
  validateStageState(manifest, next);
  return next;
}

export function deriveStageView(manifest: StageManifest, status: ExecutionStatus) {
  validateStageState(manifest, status);
  const currentTask = selectNextRunnableTaskUnchecked(manifest, status);
  const tracks = Object.fromEntries((["engineering", "research", "maintenance"] as const).map((track) => {
    const ids = manifest.tasks.filter((task) => task.track === track).map((task) => task.id);
    const rows = ids.map((id) => status.tasks[id]);
    return [track, {
      total: rows.length,
      completed: rows.filter((row) => SUCCESSFUL.has(row.status)).length,
      pending: rows.filter((row) => row.status === "pending").length,
      running: rows.filter((row) => row.status === "running").length,
      blocked: rows.filter((row) => row.status === "blocked").length,
      notExecuted: rows.filter((row) => row.status === "not-executed").length,
    }];
  })) as Record<TaskTrack, { total: number; completed: number; pending: number; running: number; blocked: number; notExecuted: number }>;
  const allTerminal = manifest.tasks.every((task) => TERMINAL.has(status.tasks[task.id].status));
  const overallStatus = allTerminal ? "completed" : currentTask === null ? "blocked" : "active";
  return {
    identity: manifest.identity,
    planRevision: manifest.planRevision,
    overallStatus,
    currentTask,
    nextAction: status.nextAction,
    commits: status.commits,
    tracks,
    blockingIssues: manifest.tasks.flatMap((task) => status.tasks[task.id].status === "blocked" ? status.tasks[task.id].issues : []),
    unresolvedIssues: status.unresolvedIssues,
    evidenceRoot: status.evidenceRoot,
    accounting: status.accounting,
    protectedState: status.protectedState,
  };
}

export async function readStageState(root: string) {
  const resultRoot = join(root, CURRENT_V2_RESULT_RELATIVE);
  const manifest = JSON.parse(await readFile(join(resultRoot, "stage-manifest.json"), "utf8")) as StageManifest;
  const status = JSON.parse(await readFile(join(resultRoot, "execution-status.json"), "utf8")) as ExecutionStatus;
  return { manifest, status, view: deriveStageView(manifest, status) };
}

export async function resumeStage(root: string) {
  const state = await readStageState(root);
  const taskId = selectNextRunnableTask(state.manifest, state.status);
  if (taskId === null) return { ...state.view, resume: { taskId: null, action: "no-runnable-task" as const } };
  const definition = state.manifest.tasks.find((task) => task.id === taskId)!;
  return {
    ...state.view,
    resume: {
      taskId,
      title: definition.title,
      action: "run-declared-stage" as const,
      dependencies: definition.dependencies,
      acceptance: definition.acceptance,
      evidenceTargets: definition.evidenceTargets,
    },
  };
}

export async function runN1CorpusStage(root: string) {
  const state = await readStageState(root);
  const current = selectNextRunnableTask(state.manifest, state.status);
  if (current !== "N1" && state.status.tasks.N1.status !== "completed") {
    fail(`N1 cannot run while current task is ${current ?? "none"}`);
  }
  const corpus = await writeN1CorpusFromRepository(root);
  if (state.status.tasks.N1.status === "completed") {
    return { taskId: "N1" as const, outcome: "verified-existing" as const, files: corpus.files, view: state.view };
  }
  const completedAt = new Date().toISOString();
  const status = completeTask(state.manifest, state.status, "N1", {
    completedAt,
    evidence: [
      ...corpus.files.map(({ path }) => path),
      "src/skill-ir/skill-family-current-v2-corpus.ts",
      "src/skill-ir/skill-family-current-v2-corpus.test.ts",
    ],
    nextAction: "N2: implement the TaskContract compiler and complete obligation plan, then generate baseline/gap-matrix.json",
  });
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N1" as const,
    outcome: "completed" as const,
    files: corpus.files,
    summaries: {
      source: corpus.result.sourceLedger.summary,
      duties: corpus.result.dutyMatrix.summary,
      apiInputs: corpus.result.exposureLedger.apiInputs.summary,
    },
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN2TaskContractStage(root: string) {
  const state = await readStageState(root);
  const current = selectNextRunnableTask(state.manifest, state.status);
  if (current !== "N2" && state.status.tasks.N2.status !== "completed") {
    fail(`N2 cannot run while current task is ${current ?? "none"}`);
  }
  const built = await writeN2GapMatrixFromRepository(root);
  if (state.status.tasks.N2.status === "completed") {
    return { taskId: "N2" as const, outcome: "verified-existing" as const, file: built.file, view: state.view };
  }
  const completedAt = new Date().toISOString();
  const status = completeTask(state.manifest, state.status, "N2", {
    completedAt,
    evidence: [
      built.file.path,
      "src/skill-ir/api-task-contract.ts",
      "src/skill-ir/api-task-contract.test.ts",
      "src/skill-ir/api-task-plan.ts",
      "src/skill-ir/api-task-plan-checker.ts",
      "src/skill-ir/api-task-plan.test.ts",
      "src/skill-ir/skill-family-current-v2-n2.ts",
      "src/skill-ir/skill-family-current-v2-n2.test.ts",
    ],
    nextAction: "N3: implement task-relevant source closure with per-reference requirement and operation impact reporting",
  });
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N2" as const,
    outcome: "completed" as const,
    file: built.file,
    summary: {
      demonstrations: built.report.demonstrations.length,
      mappingSources: built.report.mappingReview.sourceSkills,
      relations: built.report.relations,
      gaps: built.report.gaps.summary,
    },
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN3SourceClosureStage(root: string) {
  const state = await readStageState(root);
  const current = selectNextRunnableTask(state.manifest, state.status);
  if (current !== "N3" && state.status.tasks.N3.status !== "completed") {
    fail(`N3 cannot run while current task is ${current ?? "none"}`);
  }
  const built = await writeN3SourceClosureReportFromRepository(root);
  if (built.report.decision !== "passed") fail("N3 source closure evidence did not satisfy its registered relations");
  if (state.status.tasks.N3.status === "completed") {
    return { taskId: "N3" as const, outcome: "verified-existing" as const, file: built.file, view: state.view };
  }
  const completedAt = new Date().toISOString();
  const status = completeTask(state.manifest, state.status, "N3", {
    completedAt,
    evidence: [
      built.file.path,
      "src/skill-ir/api-tester-source-closure.ts",
      "src/skill-ir/api-tester-source-closure.test.ts",
      "src/skill-ir/skill-family-current-v2-n3.ts",
      "src/skill-ir/skill-family-current-v2-n3.test.ts",
    ],
    nextAction: "N5: connect TaskContract plans to request-json and pytest packages, run two independent loopback consumers, and verify eight fault layers",
  });
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N3" as const,
    outcome: "completed" as const,
    file: built.file,
    realSummary: built.report.realSummary,
    syntheticSummary: built.report.syntheticSummary,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN5ConsumerStage(root: string, pythonExecutable = "python") {
  const state = await readStageState(root);
  const current = selectNextRunnableTask(state.manifest, state.status);
  if (current !== "N5" && state.status.tasks.N5.status !== "completed") {
    fail(`N5 cannot run while current task is ${current ?? "none"}`);
  }
  if (state.status.tasks.N5.status === "completed") {
    const path = `${CURRENT_V2_RESULT_RELATIVE}/integration/consumer-report.json`;
    const bytes = await readFile(join(root, path));
    const report = JSON.parse(bytes.toString("utf8"));
    if (report.schemaVersion !== "skill-family-current-v2-n5-consumer/v1" || report.decision !== "passed") {
      fail("persisted N5 consumer report is invalid");
    }
    return { taskId: "N5" as const, outcome: "verified-existing" as const,
      file: { path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength }, view: state.view };
  }
  const built = await writeN5ConsumerReportFromRepository(root, pythonExecutable);
  if (built.report.decision !== "passed") fail("N5 consumer evidence did not satisfy its registered relations");
  const completedAt = new Date().toISOString();
  const status = completeTask(state.manifest, state.status, "N5", {
    completedAt,
    evidence: [
      built.file.path,
      "src/skill-ir/api-task-artifact.ts",
      "src/skill-ir/api-task-artifact-checker.ts",
      "src/skill-ir/api-task-artifact.test.ts",
      "src/skill-ir/skill-family-current-v2-n5.ts",
      "src/skill-ir/skill-family-current-v2-n5.test.ts",
    ],
    nextAction: "N8: integrate TaskContract, source closure, construction, independent checking, bundle, and consumer behind the ordinary API task entry",
  });
  status.accounting.nativeLoopbackHttpCalls += built.report.accounting.loopbackHttpCalls;
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N5" as const,
    outcome: "completed" as const,
    file: built.file,
    fixtures: built.report.fixtures.map((row) => ({ id: row.fixtureId, junit: row.junit, status: row.status })),
    faultInjection: built.report.faultInjection.summary,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN8EngineStage(root: string) {
  const state = await readStageState(root);
  const current = selectNextRunnableTask(state.manifest, state.status);
  if (current !== "N8" && state.status.tasks.N8.status !== "completed") {
    fail(`N8 cannot run while current task is ${current ?? "none"}`);
  }
  if (state.status.tasks.N8.status === "completed") {
    const path = `${CURRENT_V2_RESULT_RELATIVE}/integration/engine-report.json`;
    const bytes = await readFile(join(root, path));
    const report = JSON.parse(bytes.toString("utf8"));
    if (report.schemaVersion !== "skill-family-current-v2-n8-engine/v1" || report.decision !== "passed") {
      fail("persisted N8 engine report is invalid");
    }
    return { taskId: "N8" as const, outcome: "verified-existing" as const,
      file: { path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength }, view: state.view };
  }
  const built = await writeN8EngineReportFromRepository(root);
  if (built.report.decision !== "passed") fail("N8 engine evidence did not satisfy its registered relations");
  const completedAt = new Date().toISOString();
  const status = completeTask(state.manifest, state.status, "N8", {
    completedAt,
    evidence: [
      built.file.path,
      "src/skill-ir/api-task-run.ts",
      "src/skill-ir/api-task-run.test.ts",
      "src/skill-ir/api-task-artifact.ts",
      "src/skill-ir/api-task-artifact-checker.ts",
      "src/cli/api-task.ts",
      "src/cli/api-task.test.ts",
      "src/cli/artifact.ts",
      "src/skill-ir/skill-family-current-v2-n8.ts",
      "src/skill-ir/skill-family-current-v2-n8.test.ts",
    ],
    nextAction: "N10: lock the six-contract/three-provider development panel, run baseline then current engine on fixed denominators, and compute the method gate",
  });
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N8" as const,
    outcome: "completed" as const,
    file: built.file,
    relations: built.report.relations,
    cases: built.report.cases.map((row) => ({ id: row.id, backend: row.actualBackend, taskComplete: row.taskComplete })),
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN10LockStage(root: string, lockedAt = new Date().toISOString()) {
  const state = await readStageState(root);
  const current = selectNextRunnableTask(state.manifest, state.status);
  if (current !== "N10" && state.status.tasks.N10.status !== "running") {
    fail(`N10 lock cannot run while current task is ${current ?? "none"}`);
  }
  const developmentRelative = `${CURRENT_V2_RESULT_RELATIVE}/development`;
  const developmentDirectory = join(root, developmentRelative);
  const lockPath = join(developmentDirectory, "input-lock.json");
  let lock: N10DevelopmentLock;
  let lockSha256: string;
  try {
    const bytes = await readFile(lockPath);
    lock = JSON.parse(bytes.toString("utf8")) as N10DevelopmentLock;
    lockSha256 = createHash("sha256").update(bytes).digest("hex");
  } catch {
    const result = await materializeN10DevelopmentPanel({ repositoryRoot: root, developmentDirectory, lockedAt });
    lock = result.lock;
    lockSha256 = result.sha256;
  }
  const verification = await verifyN10DevelopmentPanel({ repositoryRoot: root, developmentDirectory });
  if (verification.status !== "pass") fail(`N10 input lock verification failed: ${verification.errors.join("; ")}`);

  const now = new Date().toISOString();
  const status = structuredClone(state.status);
  status.tasks.N10 = {
    status: "running",
    commit: null,
    evidence: [
      `${developmentRelative}/input-lock.json`,
      ...lock.sources.map((row) => `${developmentRelative}/${row.lockedCopy.path}`),
      ...lock.tasks.map((row) => `${developmentRelative}/${row.taskPath}`),
    ],
    issues: [],
    startedAt: status.tasks.N10.startedAt ?? now,
    completedAt: null,
  };
  status.currentStage = "N10";
  status.updatedAt = now;
  status.nextAction = "N10 locked: commit and push the fixed panel before running the source-only baseline or rich task engine";
  validateStageState(state.manifest, status);
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N10" as const,
    outcome: "lock-created-and-verified" as const,
    file: { path: `${developmentRelative}/input-lock.json`, sha256: lockSha256 },
    summary: lock.summary,
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

async function gitBytes(root: string, arguments_: string[]): Promise<Uint8Array> {
  const process = Bun.spawn(["git", ...arguments_], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) fail(`git ${arguments_.join(" ")} failed: ${stderr.trim()}`);
  return new Uint8Array(stdout);
}

async function requirePushedN10Lock(root: string): Promise<string> {
  const head = new TextDecoder().decode(await gitBytes(root, ["rev-parse", "HEAD"])).trim();
  const upstream = new TextDecoder().decode(await gitBytes(root, ["rev-parse", "origin/skill-ir-aot"])).trim();
  if (head !== upstream) fail(`N10 lock commit is not aligned with origin/skill-ir-aot: HEAD=${head}, origin=${upstream}`);
  const relativePath = `${CURRENT_V2_RESULT_RELATIVE}/development/input-lock.json`;
  const lockCommit = new TextDecoder().decode(await gitBytes(root, [
    "log", "--diff-filter=A", "--format=%H", "-1", "--", relativePath,
  ])).trim();
  if (!/^[0-9a-f]{40}$/u.test(lockCommit)) fail("N10 lock creation commit was not found in pushed history");
  const [worktree, committed] = await Promise.all([
    readFile(join(root, relativePath)),
    gitBytes(root, ["show", `${lockCommit}:${relativePath}`]),
  ]);
  if (createHash("sha256").update(worktree).digest("hex")
    !== createHash("sha256").update(committed).digest("hex")) {
    fail("N10 worktree lock bytes do not match the pushed commit");
  }
  return lockCommit;
}

async function requirePushedImmutableFile(root: string, relativePath: string): Promise<{ head: string; creationCommit: string }> {
  const head = new TextDecoder().decode(await gitBytes(root, ["rev-parse", "HEAD"])).trim();
  const upstream = new TextDecoder().decode(await gitBytes(root, ["rev-parse", "origin/skill-ir-aot"])).trim();
  if (head !== upstream) fail(`pushed evidence prerequisite is not aligned: HEAD=${head}, origin=${upstream}`);
  const creationCommit = new TextDecoder().decode(await gitBytes(root, [
    "log", "--diff-filter=A", "--format=%H", "-1", "--", relativePath,
  ])).trim();
  if (!/^[0-9a-f]{40}$/u.test(creationCommit)) fail(`creation commit was not found for ${relativePath}`);
  const [worktree, committed] = await Promise.all([
    readFile(join(root, relativePath)),
    gitBytes(root, ["show", `${creationCommit}:${relativePath}`]),
  ]);
  if (createHash("sha256").update(worktree).digest("hex")
    !== createHash("sha256").update(committed).digest("hex")) {
    fail(`worktree bytes changed after the immutable evidence commit: ${relativePath}`);
  }
  return { head, creationCommit };
}

export async function runN10BaselineStage(root: string, executedAt = new Date().toISOString()) {
  const state = await readStageState(root);
  if (selectNextRunnableTask(state.manifest, state.status) !== "N10" || state.status.tasks.N10.status !== "running") {
    fail("N10 baseline requires the running N10 stage");
  }
  const developmentRelative = `${CURRENT_V2_RESULT_RELATIVE}/development`;
  const developmentDirectory = join(root, developmentRelative);
  const lockCommit = await requirePushedN10Lock(root);
  let built: Awaited<ReturnType<typeof writeN10BaselineFromDevelopmentPanel>> | null = null;
  try {
    await readFile(join(developmentDirectory, "baseline.json"));
  } catch {
    built = await writeN10BaselineFromDevelopmentPanel({
      repositoryRoot: root,
      developmentDirectory,
      lockCommit,
      executedAt,
    });
  }
  const verification = await verifyN10Baseline({ repositoryRoot: root, developmentDirectory });
  if (verification.status !== "pass") fail(`N10 baseline verification failed: ${verification.errors.join("; ")}`);
  const baselineBytes = await readFile(join(developmentDirectory, "baseline.json"));
  const report = JSON.parse(baselineBytes.toString("utf8"));
  const now = new Date().toISOString();
  const status = structuredClone(state.status);
  status.tasks.N10.commit = lockCommit;
  status.tasks.N10.evidence = [...new Set([
    ...status.tasks.N10.evidence,
    `${developmentRelative}/baseline.json`,
  ])];
  status.updatedAt = now;
  status.nextAction = "N10 baseline archived: commit and push baseline before running the rich task engine first-run";
  validateStageState(state.manifest, status);
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N10" as const,
    outcome: built ? "baseline-created-and-verified" as const : "baseline-verified-existing" as const,
    file: {
      path: `${developmentRelative}/baseline.json`,
      sha256: createHash("sha256").update(baselineBytes).digest("hex"),
      bytes: baselineBytes.byteLength,
    },
    summary: report.summary,
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN10FirstRunStage(root: string, executedAt = new Date().toISOString()) {
  const state = await readStageState(root);
  if (selectNextRunnableTask(state.manifest, state.status) !== "N10" || state.status.tasks.N10.status !== "running") {
    fail("N10 first run requires the running N10 stage");
  }
  const developmentRelative = `${CURRENT_V2_RESULT_RELATIVE}/development`;
  const developmentDirectory = join(root, developmentRelative);
  const lockCommit = await requirePushedN10Lock(root);
  const baselineBinding = await requirePushedImmutableFile(root, `${developmentRelative}/baseline.json`);
  let engineCodeCommit = baselineBinding.head;
  try {
    const firstLockedTask = JSON.parse(await readFile(join(developmentDirectory, "input-lock.json"), "utf8")).tasks[0];
    const existingRow = JSON.parse(await readFile(join(developmentDirectory, "first-run-rows", `${firstLockedTask.taskId}.json`), "utf8"));
    if (!/^[0-9a-f]{40}$/u.test(existingRow.engineCodeCommit)) fail("persisted N10 first-run row has an invalid engine commit");
    const mergeBase = new TextDecoder().decode(await gitBytes(root, ["merge-base", existingRow.engineCodeCommit, baselineBinding.head])).trim();
    if (mergeBase !== existingRow.engineCodeCommit) fail("persisted N10 first-run engine commit is not an ancestor of pushed HEAD");
    engineCodeCommit = existingRow.engineCodeCommit;
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("persisted N10") || error.message.startsWith("git merge-base"))) throw error;
  }
  let built: Awaited<ReturnType<typeof writeN10FirstRunFromDevelopmentPanel>> | null = null;
  try {
    await readFile(join(developmentDirectory, "first-run.json"));
  } catch {
    built = await writeN10FirstRunFromDevelopmentPanel({
      repositoryRoot: root,
      developmentDirectory,
      lockCommit,
      baselineCommit: baselineBinding.creationCommit,
      engineCodeCommit,
      executedAt,
    });
  }
  const verification = await verifyN10FirstRun({ repositoryRoot: root, developmentDirectory });
  if (verification.status !== "pass") fail(`N10 first-run verification failed: ${verification.errors.join("; ")}`);
  const firstRunBytes = await readFile(join(developmentDirectory, "first-run.json"));
  const report = JSON.parse(firstRunBytes.toString("utf8"));
  const now = new Date().toISOString();
  const status = structuredClone(state.status);
  status.tasks.N10.commit = report.bindings.engineCodeCommit;
  status.tasks.N10.evidence = [...new Set([
    ...status.tasks.N10.evidence,
    `${developmentRelative}/first-run.json`,
    ...report.tasks.map((row: any) => `${developmentRelative}/${row.rowFile}`),
  ])];
  status.updatedAt = now;
  status.nextAction = report.methodGate.decision === "passed"
    ? "N10 first-run archived: commit and push it, audit residuals, then record revision-001/no-revision and complete the method gate"
    : "N10 first-run archived unchanged: commit and push it, diagnose shared defects, then repair and write revision-001 on the same denominator";
  validateStageState(state.manifest, status);
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N10" as const,
    outcome: built ? "first-run-created-and-verified" as const : "first-run-verified-existing" as const,
    file: {
      path: `${developmentRelative}/first-run.json`,
      sha256: createHash("sha256").update(firstRunBytes).digest("hex"),
      bytes: firstRunBytes.byteLength,
    },
    summary: report.summary,
    methodGate: report.methodGate,
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN10RevisionStage(root: string, evaluatedAt = new Date().toISOString()) {
  const state = await readStageState(root);
  const developmentRelative = `${CURRENT_V2_RESULT_RELATIVE}/development`;
  const developmentDirectory = join(root, developmentRelative);
  const revisionRelative = `${developmentRelative}/revision-001.json`;
  if (!["running", "completed", "completed-with-limitation"].includes(state.status.tasks.N10.status)) {
    fail(`N10 revision cannot run while N10 is ${state.status.tasks.N10.status}`);
  }
  const firstRunBinding = await requirePushedImmutableFile(root, `${developmentRelative}/first-run.json`);
  let report: N10RevisionReport;
  let built: Awaited<ReturnType<typeof writeN10RevisionDecision>> | null = null;
  try {
    report = JSON.parse(await readFile(join(root, revisionRelative), "utf8")) as N10RevisionReport;
    const mergeBase = new TextDecoder().decode(await gitBytes(root, [
      "merge-base", report.revisionCodeCommit, firstRunBinding.head,
    ])).trim();
    if (mergeBase !== report.revisionCodeCommit) fail("persisted N10 revision code commit is not an ancestor of pushed HEAD");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid current-v2 stage: persisted N10")) throw error;
    const analysis = await buildN10RevisionDecision({
      repositoryRoot: root,
      developmentDirectory,
      revisionCodeCommit: firstRunBinding.head,
      evaluatedAt,
    });
    if (analysis.decision === "shared-revision-required") {
      fail("N10 revision analysis found an unclassified shared implementation defect; repair it before writing revision-001");
    }
    built = await writeN10RevisionDecision({
      repositoryRoot: root,
      developmentDirectory,
      revisionCodeCommit: firstRunBinding.head,
      evaluatedAt,
    });
    report = built.report;
  }
  const verification = await verifyN10RevisionDecision({ repositoryRoot: root, developmentDirectory, report });
  if (verification.status !== "pass") fail(`N10 revision verification failed: ${verification.errors.join("; ")}`);

  if (["completed", "completed-with-limitation"].includes(state.status.tasks.N10.status)) {
    const bytes = await readFile(join(root, revisionRelative));
    return {
      taskId: "N10" as const,
      outcome: "revision-verified-existing" as const,
      file: { path: revisionRelative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
      decision: report.decision,
      verification,
      view: state.view,
    };
  }

  const completedAt = new Date().toISOString();
  const limitation = report.decision === "no-safe-shared-revision";
  const status = completeTask(state.manifest, state.status, "N10", {
    completedAt,
    evidence: [...new Set([...state.status.tasks.N10.evidence, revisionRelative])],
    nextAction: "N7: derive non-circular readiness from task/source scope; research candidate work remains ineligible while the N10 method gate is not ready",
    outcome: limitation ? "completed-with-limitation" : "completed",
    issues: limitation ? [
      "N10 method gate remains method-not-ready: only one of two demand-change relations passed",
      "Visier form minimal and constraint-negative obligations are outside the bound nonempty-form and JSON-body-negative contracts; no unresolved row was promoted",
    ] : [],
    commit: report.revisionCodeCommit,
  });
  status.commits.codeCommit = report.revisionCodeCommit;
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  const bytes = await readFile(join(root, revisionRelative));
  return {
    taskId: "N10" as const,
    outcome: limitation ? "completed-with-limitation" as const : "completed" as const,
    file: { path: revisionRelative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
    decision: report.decision,
    rootCauses: report.rootCauses,
    verification,
    view: deriveStageView(state.manifest, status),
    created: built !== null,
  };
}

export async function runN7ReadinessStage(root: string, evaluatedAt = new Date().toISOString()) {
  const state = await readStageState(root);
  const reportRelative = `${CURRENT_V2_RESULT_RELATIVE}/readiness/report.json`;
  if (state.status.tasks.N7.status === "completed") {
    const bytes = await readFile(join(root, reportRelative));
    const report = JSON.parse(bytes.toString("utf8")) as CurrentV2ReadinessReport;
    const verification = await verifyCurrentV2ReadinessReport({ repositoryRoot: root, report });
    if (verification.status !== "pass") fail(`N7 readiness verification failed: ${verification.errors.join("; ")}`);
    return {
      taskId: "N7" as const,
      outcome: "verified-existing" as const,
      file: { path: reportRelative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
      verification,
      view: state.view,
    };
  }
  if (selectNextRunnableTask(state.manifest, state.status) !== "N7") fail("N7 is not the current runnable stage");
  const revisionBinding = await requirePushedImmutableFile(root, `${CURRENT_V2_RESULT_RELATIVE}/development/revision-001.json`);
  const built = await writeCurrentV2ReadinessReport({
    repositoryRoot: root,
    codeCommit: revisionBinding.head,
    evaluatedAt,
  });
  const verification = await verifyCurrentV2ReadinessReport({ repositoryRoot: root, report: built.report });
  if (verification.status !== "pass") fail(`N7 readiness verification failed: ${verification.errors.join("; ")}`);
  const completedAt = new Date().toISOString();
  const status = completeTask(state.manifest, state.status, "N7", {
    completedAt,
    evidence: [
      built.file.path,
      "src/skill-ir/skill-family-current-v2-readiness.ts",
      "src/skill-ir/skill-family-current-v2-readiness.test.ts",
    ],
    nextAction: "N9: record candidate freeze as not executed because the N10 capability/method gate is not ready",
    commit: revisionBinding.head,
  });
  status.commits.codeCommit = revisionBinding.head;
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N7" as const,
    outcome: "completed" as const,
    file: built.file,
    decision: built.report.decision,
    dimensions: built.report.dimensions,
    summary: built.report.summary,
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runResearchGateStage(root: string, evaluatedAt = new Date().toISOString()) {
  const state = await readStageState(root);
  const reportRelative = `${CURRENT_V2_RESULT_RELATIVE}/prospective/not-executed-report.json`;
  const researchTaskIds = ["N9", "N11", "N12"] as const;
  if (researchTaskIds.every((taskId) => state.status.tasks[taskId].status === "not-executed")) {
    const bytes = await readFile(join(root, reportRelative));
    const report = JSON.parse(bytes.toString("utf8")) as CurrentV2ResearchNotExecutedReport;
    const verification = await verifyCurrentV2ResearchNotExecutedReport({ repositoryRoot: root, report });
    if (verification.status !== "pass") fail(`research gate verification failed: ${verification.errors.join("; ")}`);
    return {
      taskId: "N9/N11/N12" as const,
      outcome: "verified-existing" as const,
      file: { path: reportRelative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
      verification,
      view: state.view,
    };
  }
  if (selectNextRunnableTask(state.manifest, state.status) !== "N9") fail("research gate requires N9 as the current runnable task");
  const readinessBinding = await requirePushedImmutableFile(root, `${CURRENT_V2_RESULT_RELATIVE}/readiness/report.json`);
  const built = await writeCurrentV2ResearchNotExecutedReport({
    repositoryRoot: root,
    codeCommit: readinessBinding.head,
    evaluatedAt,
  });
  const verification = await verifyCurrentV2ResearchNotExecutedReport({ repositoryRoot: root, report: built.report });
  if (verification.status !== "pass") fail(`research gate verification failed: ${verification.errors.join("; ")}`);
  const completedAt = new Date().toISOString();
  const status = structuredClone(state.status);
  for (const row of built.report.tasks) {
    status.tasks[row.taskId] = {
      status: "not-executed",
      commit: readinessBinding.head,
      evidence: [built.file.path],
      issues: [row.reason],
      startedAt: null,
      completedAt,
    };
  }
  status.updatedAt = completedAt;
  status.nextAction = "N13: run the bounded external Schemathesis comparison on development/synthetic inputs without changing SkVM evidence";
  status.commits.codeCommit = readinessBinding.head;
  status.currentStage = selectNextRunnableTask(state.manifest, status);
  status.overallStatus = "active";
  validateStageState(state.manifest, status);
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N9/N11/N12" as const,
    outcome: "not-executed" as const,
    file: built.file,
    decision: built.report.decision,
    tasks: built.report.tasks,
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN13ComparisonStage(
  root: string,
  schemathesisExecutable = "schemathesis",
  evaluatedAt = new Date().toISOString(),
) {
  const state = await readStageState(root);
  const reportRelative = `${CURRENT_V2_RESULT_RELATIVE}/comparison/schemathesis-report.json`;
  if (["completed", "completed-with-limitation"].includes(state.status.tasks.N13.status)) {
    const latestReport = [...state.status.tasks.N13.evidence].reverse()
      .find((path) => /comparison\/revision-[0-9]+\/schemathesis-report\.json$/u.test(path))
      ?? reportRelative;
    const bytes = await readFile(join(root, latestReport));
    const report = JSON.parse(bytes.toString("utf8")) as CurrentV2N13Report;
    const verification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report });
    if (verification.status !== "pass") fail(`N13 comparison verification failed: ${verification.errors.join("; ")}`);
    return {
      taskId: "N13" as const,
      outcome: "verified-existing" as const,
      file: { path: latestReport, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
      decision: report.decision,
      summary: report.summary,
      verification,
      view: state.view,
    };
  }
  if (selectNextRunnableTask(state.manifest, state.status) !== "N13") fail("N13 is not the current runnable stage");
  const pushed = await requirePushedImmutableFile(root, `${CURRENT_V2_RESULT_RELATIVE}/prospective/not-executed-report.json`);
  let report: CurrentV2N13Report;
  let files: Array<{ path: string; sha256: string; bytes: number }>;
  try {
    const bytes = await readFile(join(root, reportRelative));
    report = JSON.parse(bytes.toString("utf8")) as CurrentV2N13Report;
    if (report.codeCommit !== pushed.head) fail("N13 persisted comparison does not bind the current pushed code commit");
    files = await Promise.all([
      reportRelative,
      `${CURRENT_V2_RESULT_RELATIVE}/comparison/tool-baseline.json`,
      `${CURRENT_V2_RESULT_RELATIVE}/comparison/added-value.md`,
    ].map(async (path) => {
      const fileBytes = await readFile(join(root, path));
      return { path, sha256: createHash("sha256").update(fileBytes).digest("hex"), bytes: fileBytes.byteLength };
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid current-v2 stage: N13 persisted")) throw error;
    const built = await writeCurrentV2N13Comparison({
      repositoryRoot: root,
      codeCommit: pushed.head,
      executedAt: evaluatedAt,
      schemathesisExecutable,
    });
    report = built.report;
    files = built.files;
  }
  const verification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report });
  if (verification.status !== "pass") fail(`N13 comparison verification failed: ${verification.errors.join("; ")}`);
  const completedAt = new Date().toISOString();
  const status = completeTask(state.manifest, state.status, "N13", {
    completedAt,
    evidence: [
      ...files.map((file) => file.path),
      "src/skill-ir/skill-family-current-v2-n13.ts",
      "src/skill-ir/skill-family-current-v2-n13.test.ts",
    ],
    nextAction: "N4: run the time-boxed Meilisearch and Bangumi source maintenance without broadening the construction contract",
    outcome: report.decision,
    issues: report.issues,
    commit: report.codeCommit,
  });
  status.accounting.nativeLoopbackHttpCalls += report.accounting.loopbackHttpCalls;
  status.commits.codeCommit = report.codeCommit;
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N13" as const,
    outcome: report.decision,
    files,
    summary: report.summary,
    issues: report.issues,
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN13RevisionStage(
  root: string,
  schemathesisExecutable = "schemathesis",
  evaluatedAt = new Date().toISOString(),
) {
  const state = await readStageState(root);
  const initialRelative = `${CURRENT_V2_RESULT_RELATIVE}/comparison/schemathesis-report.json`;
  const revisionDirectory = `${CURRENT_V2_RESULT_RELATIVE}/comparison/revision-001`;
  const revisionRelative = `${revisionDirectory}/schemathesis-report.json`;
  const existingRevision = state.status.tasks.N13.evidence.includes(revisionRelative);
  if (existingRevision) {
    const bytes = await readFile(join(root, revisionRelative));
    const report = JSON.parse(bytes.toString("utf8")) as CurrentV2N13Report;
    const verification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report });
    if (verification.status !== "pass") fail(`N13 revision verification failed: ${verification.errors.join("; ")}`);
    return {
      taskId: "N13" as const,
      outcome: "revision-verified-existing" as const,
      file: { path: revisionRelative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
      decision: report.decision,
      summary: report.summary,
      verification,
      view: state.view,
    };
  }
  if (state.status.tasks.N13.status !== "completed-with-limitation"
    || !state.status.tasks.N13.issues.includes("external-baseline-has-failures")) {
    fail("N13 revision requires the archived zero-request initial limitation");
  }
  const pushed = await requirePushedImmutableFile(root, initialRelative);
  const initialBytes = await readFile(join(root, initialRelative));
  const initialReport = JSON.parse(initialBytes.toString("utf8")) as CurrentV2N13Report;
  const initialVerification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report: initialReport });
  if (initialVerification.status !== "pass" || initialReport.summary.actualLoopbackHttpCalls !== 0
    || initialReport.summary.notApplicableFaults !== 3) {
    fail("N13 initial failure does not match the preserved preflight conflict");
  }
  let report: CurrentV2N13Report;
  let files: Array<{ path: string; sha256: string; bytes: number }>;
  try {
    const bytes = await readFile(join(root, revisionRelative));
    report = JSON.parse(bytes.toString("utf8")) as CurrentV2N13Report;
    if (report.codeCommit !== pushed.head) fail("N13 revision does not bind the current pushed code commit");
    files = await Promise.all([
      revisionRelative,
      `${revisionDirectory}/tool-baseline.json`,
      `${revisionDirectory}/added-value.md`,
    ].map(async (path) => {
      const fileBytes = await readFile(join(root, path));
      return { path, sha256: createHash("sha256").update(fileBytes).digest("hex"), bytes: fileBytes.byteLength };
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid current-v2 stage: N13 revision")) throw error;
    const built = await writeCurrentV2N13Comparison({
      repositoryRoot: root,
      codeCommit: pushed.head,
      executedAt: evaluatedAt,
      schemathesisExecutable,
      relativeOutputDirectory: revisionDirectory,
    });
    report = built.report;
    files = built.files;
  }
  const verification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report });
  if (verification.status !== "pass") fail(`N13 revision verification failed: ${verification.errors.join("; ")}`);
  const completedAt = new Date().toISOString();
  const status = structuredClone(state.status);
  status.tasks.N13 = {
    status: report.decision,
    commit: report.codeCommit,
    evidence: [...new Set([...status.tasks.N13.evidence, ...files.map((file) => file.path)])],
    issues: report.issues,
    startedAt: status.tasks.N13.startedAt,
    completedAt,
  };
  status.updatedAt = completedAt;
  status.nextAction = "N4: run the time-boxed Meilisearch and Bangumi source maintenance without broadening the construction contract";
  status.commits.codeCommit = report.codeCommit;
  status.accounting.nativeLoopbackHttpCalls += report.accounting.loopbackHttpCalls;
  validateStageState(state.manifest, status);
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N13" as const,
    outcome: report.decision,
    files,
    summary: report.summary,
    issues: report.issues,
    initialFailure: { path: initialRelative, sha256: createHash("sha256").update(initialBytes).digest("hex") },
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN13Revision2Stage(
  root: string,
  schemathesisExecutable = "schemathesis",
  evaluatedAt = new Date().toISOString(),
) {
  const state = await readStageState(root);
  const previousRelative = `${CURRENT_V2_RESULT_RELATIVE}/comparison/revision-001/schemathesis-report.json`;
  const revisionDirectory = `${CURRENT_V2_RESULT_RELATIVE}/comparison/revision-002`;
  const revisionRelative = `${revisionDirectory}/schemathesis-report.json`;
  if (state.status.tasks.N13.evidence.includes(revisionRelative)) {
    const bytes = await readFile(join(root, revisionRelative));
    const report = JSON.parse(bytes.toString("utf8")) as CurrentV2N13Report;
    const verification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report });
    if (verification.status !== "pass") fail(`N13 revision-002 verification failed: ${verification.errors.join("; ")}`);
    return {
      taskId: "N13" as const,
      outcome: "revision-002-verified-existing" as const,
      file: { path: revisionRelative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
      decision: report.decision,
      summary: report.summary,
      verification,
      view: state.view,
    };
  }
  if (state.status.tasks.N13.status !== "completed-with-limitation"
    || !state.status.tasks.N13.evidence.includes(previousRelative)) {
    fail("N13 revision-002 requires the archived revision-001 limitation");
  }
  const pushed = await requirePushedImmutableFile(root, previousRelative);
  const previousBytes = await readFile(join(root, previousRelative));
  const previousReport = JSON.parse(previousBytes.toString("utf8")) as CurrentV2N13Report;
  const previousVerification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report: previousReport });
  const encodingFailure = await readFile(join(root,
    `${CURRENT_V2_RESULT_RELATIVE}/comparison/revision-001/raw/baseline-json-reference/stdout.txt`), "utf8");
  if (previousVerification.status !== "pass" || previousReport.summary.actualLoopbackHttpCalls !== 0
    || !encodingFailure.includes("UnicodeEncodeError: 'gbk' codec can't encode character")) {
    fail("N13 revision-001 does not match the preserved Windows encoding failure");
  }
  let report: CurrentV2N13Report;
  let files: Array<{ path: string; sha256: string; bytes: number }>;
  try {
    const bytes = await readFile(join(root, revisionRelative));
    report = JSON.parse(bytes.toString("utf8")) as CurrentV2N13Report;
    if (report.codeCommit !== pushed.head) fail("N13 revision-002 does not bind the current pushed code commit");
    files = await Promise.all([
      revisionRelative,
      `${revisionDirectory}/tool-baseline.json`,
      `${revisionDirectory}/added-value.md`,
    ].map(async (path) => {
      const fileBytes = await readFile(join(root, path));
      return { path, sha256: createHash("sha256").update(fileBytes).digest("hex"), bytes: fileBytes.byteLength };
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid current-v2 stage: N13 revision-002")) throw error;
    const built = await writeCurrentV2N13Comparison({
      repositoryRoot: root,
      codeCommit: pushed.head,
      executedAt: evaluatedAt,
      schemathesisExecutable,
      relativeOutputDirectory: revisionDirectory,
    });
    report = built.report;
    files = built.files;
  }
  const verification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report });
  if (verification.status !== "pass") fail(`N13 revision-002 verification failed: ${verification.errors.join("; ")}`);
  const completedAt = new Date().toISOString();
  const status = structuredClone(state.status);
  status.tasks.N13 = {
    status: report.decision,
    commit: report.codeCommit,
    evidence: [...new Set([...status.tasks.N13.evidence, ...files.map((file) => file.path)])],
    issues: report.issues,
    startedAt: status.tasks.N13.startedAt,
    completedAt,
  };
  status.updatedAt = completedAt;
  status.nextAction = "N4: run the time-boxed Meilisearch and Bangumi source maintenance without broadening the construction contract";
  status.commits.codeCommit = report.codeCommit;
  status.accounting.nativeLoopbackHttpCalls += report.accounting.loopbackHttpCalls;
  validateStageState(state.manifest, status);
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N13" as const,
    outcome: report.decision,
    files,
    summary: report.summary,
    issues: report.issues,
    previousFailure: { path: previousRelative, sha256: createHash("sha256").update(previousBytes).digest("hex") },
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN13ReclassificationStage(
  root: string,
  evaluatedAt = new Date().toISOString(),
) {
  const state = await readStageState(root);
  const sourceRelative = `${CURRENT_V2_RESULT_RELATIVE}/comparison/revision-002/schemathesis-report.json`;
  const revisionDirectory = `${CURRENT_V2_RESULT_RELATIVE}/comparison/revision-003`;
  const revisionRelative = `${revisionDirectory}/schemathesis-report.json`;
  if (state.status.tasks.N13.evidence.includes(revisionRelative)) {
    const bytes = await readFile(join(root, revisionRelative));
    const report = JSON.parse(bytes.toString("utf8")) as CurrentV2N13Report;
    const verification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report });
    if (verification.status !== "pass") fail(`N13 revision-003 verification failed: ${verification.errors.join("; ")}`);
    return {
      taskId: "N13" as const,
      outcome: "revision-003-verified-existing" as const,
      file: { path: revisionRelative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
      decision: report.decision,
      summary: report.summary,
      additionalLoopbackHttpCalls: 0,
      verification,
      view: state.view,
    };
  }
  if (state.status.tasks.N13.status !== "completed-with-limitation"
    || !state.status.tasks.N13.evidence.includes(sourceRelative)) {
    fail("N13 revision-003 requires the archived revision-002 evidence");
  }
  const pushed = await requirePushedImmutableFile(root, sourceRelative);
  const sourceBytes = await readFile(join(root, sourceRelative));
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const sourceReport = JSON.parse(sourceBytes.toString("utf8")) as CurrentV2N13Report;
  const sourceVerification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report: sourceReport });
  if (sourceSha256 !== "406af8a0bf3f045b64c51c71dcf955f076bcaa6c9b07377220b6d02e17f83442"
    || JSON.stringify(sourceVerification.errors) !== JSON.stringify([
      "N13_FAULT_DENOMINATOR_INVALID",
      "N13_SUMMARY_MISMATCH",
    ])
    || sourceReport.summary.actualLoopbackHttpCalls !== 9) {
    fail("N13 revision-002 does not match the preserved fault-denominator defect");
  }
  let report: CurrentV2N13Report;
  let files: Array<{ path: string; sha256: string; bytes: number }>;
  try {
    const bytes = await readFile(join(root, revisionRelative));
    report = JSON.parse(bytes.toString("utf8")) as CurrentV2N13Report;
    if (report.codeCommit !== pushed.head) fail("N13 revision-003 does not bind the current pushed code commit");
    files = await Promise.all([
      revisionRelative,
      `${revisionDirectory}/tool-baseline.json`,
      `${revisionDirectory}/added-value.md`,
    ].map(async (path) => {
      const fileBytes = await readFile(join(root, path));
      return { path, sha256: createHash("sha256").update(fileBytes).digest("hex"), bytes: fileBytes.byteLength };
    }));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("invalid current-v2 stage: N13 revision-003")) throw error;
    const built = await writeCurrentV2N13Reclassification({
      repositoryRoot: root,
      codeCommit: pushed.head,
      evaluatedAt,
      sourceReportPath: sourceRelative,
      relativeOutputDirectory: revisionDirectory,
    });
    report = built.report;
    files = built.files;
  }
  const verification = await verifyCurrentV2N13Comparison({ repositoryRoot: root, report });
  if (verification.status !== "pass") fail(`N13 revision-003 verification failed: ${verification.errors.join("; ")}`);
  const completedAt = new Date().toISOString();
  const status = structuredClone(state.status);
  status.tasks.N13 = {
    status: report.decision,
    commit: report.codeCommit,
    evidence: [...new Set([...status.tasks.N13.evidence, ...files.map((file) => file.path)])],
    issues: report.issues,
    startedAt: status.tasks.N13.startedAt,
    completedAt,
  };
  status.updatedAt = completedAt;
  status.nextAction = "N4: run the time-boxed Meilisearch and Bangumi source maintenance without broadening the construction contract";
  status.commits.codeCommit = report.codeCommit;
  validateStageState(state.manifest, status);
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N13" as const,
    outcome: report.decision,
    files,
    summary: report.summary,
    issues: report.issues,
    sourceDefect: { path: sourceRelative, sha256: sourceSha256, errors: sourceVerification.errors },
    additionalLoopbackHttpCalls: 0,
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN4SourceMaintenanceStage(
  root: string,
  legacyCacheRoot: string,
  observedAt = new Date().toISOString(),
  exploratoryMetadataCalls = 0,
) {
  const state = await readStageState(root);
  const meiliRelative = `${CURRENT_V2_RESULT_RELATIVE}/source-repair/meilisearch-resolution.json`;
  const bangumiRelative = `${CURRENT_V2_RESULT_RELATIVE}/source-repair/bangumi-external-closure.json`;
  if (["completed", "completed-with-limitation"].includes(state.status.tasks.N4.status)) {
    const [meiliBytes, bangumiBytes] = await Promise.all([
      readFile(join(root, meiliRelative)), readFile(join(root, bangumiRelative)),
    ]);
    const meilisearchReport = JSON.parse(meiliBytes.toString("utf8")) as CurrentV2N4MeilisearchReport;
    const bangumiReport = JSON.parse(bangumiBytes.toString("utf8")) as CurrentV2N4BangumiReport;
    const verification = await verifyCurrentV2N4Maintenance({ repositoryRoot: root, meilisearchReport, bangumiReport });
    if (verification.status !== "pass") fail(`N4 verification failed: ${verification.errors.join("; ")}`);
    return {
      taskId: "N4" as const,
      outcome: "verified-existing" as const,
      reports: [
        { path: meiliRelative, sha256: createHash("sha256").update(meiliBytes).digest("hex"), bytes: meiliBytes.byteLength },
        { path: bangumiRelative, sha256: createHash("sha256").update(bangumiBytes).digest("hex"), bytes: bangumiBytes.byteLength },
      ],
      verification,
      view: state.view,
    };
  }
  if (selectNextRunnableTask(state.manifest, state.status) !== "N4") fail("N4 is not the current runnable stage");
  if (!legacyCacheRoot || !isAbsolute(legacyCacheRoot)) fail("N4 requires an absolute legacy cache root");
  if (!Number.isInteger(exploratoryMetadataCalls) || exploratoryMetadataCalls < 0) fail("N4 exploratory source API count is invalid");
  const pushed = await requirePushedImmutableFile(root,
    `${CURRENT_V2_RESULT_RELATIVE}/comparison/revision-003/schemathesis-report.json`);
  const built = await writeCurrentV2N4Maintenance({
    repositoryRoot: root,
    codeCommit: pushed.head,
    observedAt,
    legacyCacheRoot,
    exploratoryMetadataCalls,
  });
  const verification = await verifyCurrentV2N4Maintenance({
    repositoryRoot: root,
    meilisearchReport: built.meilisearch,
    bangumiReport: built.bangumi,
  });
  if (verification.status !== "pass") fail(`N4 verification failed: ${verification.errors.join("; ")}`);
  const issues = [
    ...(built.meilisearch.resolution.decision === "source-blocked-unresolved" ? ["meilisearch-source-blocked-unresolved"] : []),
    ...(built.bangumi.resolution.decision === "partial-source-validity" ? ["bangumi-partial-source-validity"] : []),
  ];
  const completedAt = new Date().toISOString();
  const status = completeTask(state.manifest, state.status, "N4", {
    completedAt,
    evidence: [...built.files.map((file) => file.path),
      "src/skill-ir/skill-family-current-v2-n4.ts", "src/skill-ir/skill-family-current-v2-n4.test.ts"],
    nextAction: "N6: perform the bounded search for the historical clean-002 archive",
    outcome: issues.length === 0 ? "completed" : "completed-with-limitation",
    issues,
    commit: pushed.head,
  });
  status.accounting.sourceApiCalls += built.accounting.sourceApiCalls;
  status.commits.codeCommit = pushed.head;
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N4" as const,
    outcome: status.tasks.N4.status,
    files: built.files,
    meilisearch: built.meilisearch.resolution,
    bangumi: { summary: built.bangumi.summary, resolution: built.bangumi.resolution },
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN6ArchiveRecoveryStage(
  root: string,
  searchedAt = new Date().toISOString(),
) {
  const state = await readStageState(root);
  const reportRelative = `${CURRENT_V2_RESULT_RELATIVE}/archive-recovery/clean-002-search.json`;
  if (["completed", "completed-with-limitation"].includes(state.status.tasks.N6.status)) {
    const bytes = await readFile(join(root, reportRelative));
    const report = JSON.parse(bytes.toString("utf8")) as CurrentV2N6ArchiveSearchReport;
    const verification = await verifyCurrentV2N6ArchiveSearch({ repositoryRoot: root, report });
    if (verification.status !== "pass") fail(`N6 verification failed: ${verification.errors.join("; ")}`);
    return {
      taskId: "N6" as const,
      outcome: "verified-existing" as const,
      file: { path: reportRelative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
      result: report.result,
      verification,
      view: state.view,
    };
  }
  if (selectNextRunnableTask(state.manifest, state.status) !== "N6") fail("N6 is not the current runnable stage");
  const pushed = await requirePushedImmutableFile(root,
    `${CURRENT_V2_RESULT_RELATIVE}/source-repair/meilisearch-resolution.json`);
  let report: CurrentV2N6ArchiveSearchReport;
  let files: Array<{ path: string; sha256: string; bytes: number }>;
  let existingBytes: Uint8Array | null = null;
  try {
    existingBytes = new Uint8Array(await readFile(join(root, reportRelative)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existingBytes) {
    report = JSON.parse(new TextDecoder().decode(existingBytes)) as CurrentV2N6ArchiveSearchReport;
    if (report.codeCommit !== pushed.head) fail("N6 existing report does not bind the current pushed code commit");
    const evidencePaths = [
      report.provenance.searchTranscript.path,
      ...(report.result.recoveredCandidate?.archivedCopy ? [report.result.recoveredCandidate.archivedCopy.path] : []),
      reportRelative,
    ];
    files = await Promise.all(evidencePaths.map(async (path) => {
      const bytes = new Uint8Array(await readFile(join(root, path)));
      return { path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength };
    }));
  } else {
    const built = await writeCurrentV2N6ArchiveSearch({
      repositoryRoot: root,
      codeCommit: pushed.head,
      searchedAt,
    });
    report = built.report;
    files = built.files;
  }
  const verification = await verifyCurrentV2N6ArchiveSearch({ repositoryRoot: root, report });
  if (verification.status !== "pass") fail(`N6 verification failed: ${verification.errors.join("; ")}`);
  const recovered = report.result.decision === "recovered-exact";
  const issue = "historical-clean-002-not-recovered-within-bounded-scope";
  const completedAt = new Date().toISOString();
  const status = completeTask(state.manifest, state.status, "N6", {
    completedAt,
    evidence: [...files.map((file) => file.path),
      "src/skill-ir/skill-family-current-v2-n6.ts", "src/skill-ir/skill-family-current-v2-n6.test.ts",
      "docs/skill-ir/skill-family-current-v2-archive-recovery.md"],
    nextAction: "N14: replay the engineering delivery from a detached clean checkout without creating a research candidate",
    outcome: recovered ? "completed" : "completed-with-limitation",
    issues: recovered ? [] : [issue],
    commit: pushed.head,
  });
  status.unresolvedIssues = recovered
    ? status.unresolvedIssues.filter((entry) => entry !== "historical-clean-002-archive-missing")
    : status.unresolvedIssues;
  status.commits.codeCommit = pushed.head;
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N6" as const,
    outcome: status.tasks.N6.status,
    files,
    result: report.result,
    scope: report.scope,
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

export async function runN14CleanReplayStage(root: string, options?: {
  checkoutRoot?: string;
  outputRoot?: string;
  pythonBaseExecutable?: string;
  pythonArchive?: string;
  attempt?: number;
  completedAt?: string;
}) {
  const state = await readStageState(root);
  const reportRelative = `${CURRENT_V2_RESULT_RELATIVE}/clean-replay/report.json`;
  if (state.status.tasks.N14.status === "completed") {
    const bytes = await readFile(join(root, reportRelative));
    const report = JSON.parse(bytes.toString("utf8")) as CurrentV2N14CleanReplayReport;
    const verification = await verifyCurrentV2N14CleanReplay({ repositoryRoot: root, report });
    if (verification.status !== "pass") fail(`N14 verification failed: ${verification.errors.join("; ")}`);
    return {
      taskId: "N14" as const,
      outcome: "verified-existing" as const,
      file: { path: reportRelative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength },
      replay: report.replay,
      verification,
      view: state.view,
    };
  }
  if (selectNextRunnableTask(state.manifest, state.status) !== "N14") fail("N14 is not the current runnable stage");
  if (["N9", "N11", "N12"].some((task) => state.status.tasks[task as "N9" | "N11" | "N12"].status !== "not-executed")) {
    fail("N14 engineering fallback requires the actual not-executed research chain");
  }
  const pushed = await requirePushedImmutableFile(root,
    `${CURRENT_V2_RESULT_RELATIVE}/archive-recovery/clean-002-search.json`);
  let existing: Uint8Array | null = null;
  try {
    existing = new Uint8Array(await readFile(join(root, reportRelative)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let report: CurrentV2N14CleanReplayReport;
  let files: Array<{ path: string; sha256: string; bytes: number }>;
  if (existing) {
    report = JSON.parse(new TextDecoder().decode(existing)) as CurrentV2N14CleanReplayReport;
    files = [report.provenance.attempt, report.provenance.insideReport, report.provenance.archiveManifest,
      { path: reportRelative, sha256: createHash("sha256").update(existing).digest("hex"), bytes: existing.byteLength }];
  } else {
    const required = {
      checkoutRoot: options?.checkoutRoot,
      outputRoot: options?.outputRoot,
      pythonBaseExecutable: options?.pythonBaseExecutable,
      pythonArchive: options?.pythonArchive,
    };
    if (Object.values(required).some((value) => !value)) fail("N14 requires checkout, output, Python base, and Python archive paths");
    const built = await runCurrentV2N14CleanReplay({
      repositoryRoot: root,
      codeCommit: pushed.head,
      checkoutRoot: required.checkoutRoot!,
      outputRoot: required.outputRoot!,
      pythonBaseExecutable: required.pythonBaseExecutable!,
      pythonArchive: required.pythonArchive!,
      attempt: options?.attempt ?? 1,
      completedAt: options?.completedAt,
    });
    if (built.outcome === "failed") {
      const now = new Date().toISOString();
      const status = structuredClone(state.status);
      status.tasks.N14 = {
        status: "running",
        commit: pushed.head,
        evidence: [...new Set([...status.tasks.N14.evidence, ...built.files.map((file) => file.path)])],
        issues: built.issues,
        startedAt: status.tasks.N14.startedAt ?? now,
        completedAt: null,
      };
      status.currentStage = "N14";
      status.updatedAt = now;
      status.nextAction = `N14: preserve attempt ${options?.attempt ?? 1} and repair the recorded clean-replay failure without relaxing semantics`;
      status.commits.codeCommit = pushed.head;
      validateStageState(state.manifest, status);
      await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
      return { taskId: "N14" as const, outcome: "failed-attempt-preserved" as const,
        files: built.files, issues: built.issues, view: deriveStageView(state.manifest, status) };
    }
    report = built.report;
    files = built.files;
  }
  if (report.engineeringCodeCommit !== pushed.head || report.researchCandidate !== null) {
    fail("N14 report does not bind the current pushed engineering code or invented a research candidate");
  }
  const verification = await verifyCurrentV2N14CleanReplay({ repositoryRoot: root, report });
  if (verification.status !== "pass") fail(`N14 verification failed: ${verification.errors.join("; ")}`);
  const completedAt = new Date().toISOString();
  const status = completeTask(state.manifest, state.status, "N14", {
    completedAt,
    evidence: [...new Set([...state.status.tasks.N14.evidence, ...files.map((file) => file.path),
      "src/skill-ir/skill-family-current-v2-n14.ts", "src/skill-ir/skill-family-current-v2-n14.test.ts",
      "scripts/skill-ir/skill-family-current-v2-clean-replay.ts",
      "docs/skill-ir/skill-family-current-v2-clean-replay.md"])],
    nextAction: "N15: produce the final engineering/research-separated report and fresh delivery verification",
    outcome: "completed",
    commit: pushed.head,
  });
  status.accounting.nativeLoopbackHttpCalls += report.accounting.nativeLoopbackHttpCalls;
  status.commits.codeCommit = pushed.head;
  await writeFile(join(root, CURRENT_V2_RESULT_RELATIVE, "execution-status.json"), `${JSON.stringify(status, null, 2)}\n`);
  return {
    taskId: "N14" as const,
    outcome: "completed" as const,
    files,
    replay: report.replay,
    archive: report.provenance.archiveManifest,
    verification,
    view: deriveStageView(state.manifest, status),
  };
}

if (import.meta.main) {
  const step = process.argv.find((argument) => argument.startsWith("--step="))?.slice("--step=".length);
  if (step === "status") console.log(JSON.stringify((await readStageState(process.cwd())).view, null, 2));
  else if (step === "resume") console.log(JSON.stringify(await resumeStage(process.cwd()), null, 2));
  else if (step === "n1") console.log(JSON.stringify(await runN1CorpusStage(process.cwd()), null, 2));
  else if (step === "n2") console.log(JSON.stringify(await runN2TaskContractStage(process.cwd()), null, 2));
  else if (step === "n3") console.log(JSON.stringify(await runN3SourceClosureStage(process.cwd()), null, 2));
  else if (step === "n4") {
    const cacheRoot = process.argv.find((argument) => argument.startsWith("--legacy-cache-root="))?.slice("--legacy-cache-root=".length);
    const observedAt = process.argv.find((argument) => argument.startsWith("--observed-at="))?.slice("--observed-at=".length);
    const exploratoryCalls = Number(process.argv.find((argument) => argument.startsWith("--exploratory-source-api-calls="))
      ?.slice("--exploratory-source-api-calls=".length) ?? "0");
    console.log(JSON.stringify(await runN4SourceMaintenanceStage(process.cwd(), cacheRoot ?? "", observedAt, exploratoryCalls), null, 2));
  }
  else if (step === "n6") {
    const searchedAt = process.argv.find((argument) => argument.startsWith("--searched-at="))?.slice("--searched-at=".length);
    console.log(JSON.stringify(await runN6ArchiveRecoveryStage(process.cwd(), searchedAt), null, 2));
  }
  else if (step === "n14") {
    const checkoutRoot = process.argv.find((argument) => argument.startsWith("--checkout="))?.slice("--checkout=".length);
    const outputRoot = process.argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length);
    const pythonBaseExecutable = process.argv.find((argument) => argument.startsWith("--python-base="))?.slice("--python-base=".length);
    const pythonArchive = process.argv.find((argument) => argument.startsWith("--python-archive="))?.slice("--python-archive=".length);
    const attempt = Number(process.argv.find((argument) => argument.startsWith("--attempt="))?.slice("--attempt=".length) ?? "1");
    const completedAt = process.argv.find((argument) => argument.startsWith("--completed-at="))?.slice("--completed-at=".length);
    console.log(JSON.stringify(await runN14CleanReplayStage(process.cwd(), {
      checkoutRoot, outputRoot, pythonBaseExecutable, pythonArchive, attempt, completedAt,
    }), null, 2));
  }
  else if (step === "n5") {
    const python = process.argv.find((argument) => argument.startsWith("--python="))?.slice("--python=".length) ?? "python";
    console.log(JSON.stringify(await runN5ConsumerStage(process.cwd(), python), null, 2));
  } else if (step === "n8") console.log(JSON.stringify(await runN8EngineStage(process.cwd()), null, 2));
  else if (step === "n10-lock") {
    const lockedAt = process.argv.find((argument) => argument.startsWith("--locked-at="))?.slice("--locked-at=".length);
    console.log(JSON.stringify(await runN10LockStage(process.cwd(), lockedAt), null, 2));
  } else if (step === "n10-baseline") {
    const executedAt = process.argv.find((argument) => argument.startsWith("--executed-at="))?.slice("--executed-at=".length);
    console.log(JSON.stringify(await runN10BaselineStage(process.cwd(), executedAt), null, 2));
  } else if (step === "n10-first-run") {
    const executedAt = process.argv.find((argument) => argument.startsWith("--executed-at="))?.slice("--executed-at=".length);
    console.log(JSON.stringify(await runN10FirstRunStage(process.cwd(), executedAt), null, 2));
  } else if (step === "n10-revision") {
    const evaluatedAt = process.argv.find((argument) => argument.startsWith("--evaluated-at="))?.slice("--evaluated-at=".length);
    console.log(JSON.stringify(await runN10RevisionStage(process.cwd(), evaluatedAt), null, 2));
  } else if (step === "n7") {
    const evaluatedAt = process.argv.find((argument) => argument.startsWith("--evaluated-at="))?.slice("--evaluated-at=".length);
    console.log(JSON.stringify(await runN7ReadinessStage(process.cwd(), evaluatedAt), null, 2));
  } else if (step === "n9-gate") {
    const evaluatedAt = process.argv.find((argument) => argument.startsWith("--evaluated-at="))?.slice("--evaluated-at=".length);
    console.log(JSON.stringify(await runResearchGateStage(process.cwd(), evaluatedAt), null, 2));
  } else if (step === "n13") {
    const executable = process.argv.find((argument) => argument.startsWith("--schemathesis="))?.slice("--schemathesis=".length) ?? "schemathesis";
    const evaluatedAt = process.argv.find((argument) => argument.startsWith("--evaluated-at="))?.slice("--evaluated-at=".length);
    console.log(JSON.stringify(await runN13ComparisonStage(process.cwd(), executable, evaluatedAt), null, 2));
  } else if (step === "n13-revision") {
    const executable = process.argv.find((argument) => argument.startsWith("--schemathesis="))?.slice("--schemathesis=".length) ?? "schemathesis";
    const evaluatedAt = process.argv.find((argument) => argument.startsWith("--evaluated-at="))?.slice("--evaluated-at=".length);
    console.log(JSON.stringify(await runN13RevisionStage(process.cwd(), executable, evaluatedAt), null, 2));
  } else if (step === "n13-revision-002") {
    const executable = process.argv.find((argument) => argument.startsWith("--schemathesis="))?.slice("--schemathesis=".length) ?? "schemathesis";
    const evaluatedAt = process.argv.find((argument) => argument.startsWith("--evaluated-at="))?.slice("--evaluated-at=".length);
    console.log(JSON.stringify(await runN13Revision2Stage(process.cwd(), executable, evaluatedAt), null, 2));
  } else if (step === "n13-reclassify") {
    const evaluatedAt = process.argv.find((argument) => argument.startsWith("--evaluated-at="))?.slice("--evaluated-at=".length);
    console.log(JSON.stringify(await runN13ReclassificationStage(process.cwd(), evaluatedAt), null, 2));
  } else throw new Error("usage: bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=status|resume|n1|n2|n3|n4|n5|n6|n8|n10-lock|n10-baseline|n10-first-run|n10-revision|n7|n9-gate|n13|n13-revision|n13-revision-002|n13-reclassify|n14 [--legacy-cache-root=<absolute-path>] [--exploratory-source-api-calls=<count>] [--python=<executable>] [--schemathesis=<executable>] [--locked-at=<ISO>] [--executed-at=<ISO>] [--evaluated-at=<ISO>] [--observed-at=<ISO>] [--searched-at=<ISO>] [--checkout=<absolute-path>] [--output=<absolute-path>] [--python-base=<absolute-path>] [--python-archive=<absolute-path>] [--attempt=<number>] [--completed-at=<ISO>]");
}
