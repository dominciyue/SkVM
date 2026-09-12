import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

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

if (import.meta.main) {
  const step = process.argv.find((argument) => argument.startsWith("--step="))?.slice("--step=".length);
  if (step === "status") console.log(JSON.stringify((await readStageState(process.cwd())).view, null, 2));
  else if (step === "resume") console.log(JSON.stringify(await resumeStage(process.cwd()), null, 2));
  else throw new Error("usage: bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=status|resume");
}
