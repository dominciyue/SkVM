import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";
import type { RealAgentRunPlanEntry, SkillIRBenchmarkTask } from "./real-agent";
import type { ExperimentSystem } from "./matrix";
import { sha256Bytes } from "./source-fixture";
import {
  readAndValidateValidatedArtifactExecutionFreeze,
} from "./validated-artifact-development-execution-freeze";
import type { ValidatedArtifactDevelopmentGateReport } from "./validated-artifact-development-gate";
import type { ValidatedArtifactPackage } from "./validated-artifact-catalog";

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

export const ValidatedArtifactHeldoutLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-validated-artifact-heldout-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.literal("law-to-markdown-validated-artifact-heldout-v1"),
  methodEvidence: z.literal(false),
  corpus: z.literal("pilot"),
  skillId: z.literal("law-to-markdown"),
  upstream: z.object({
    developmentLock: FrozenFileSchema,
    executionFreeze: FrozenFileSchema,
    developmentGate: FrozenFileSchema,
    developmentSummary: FrozenFileSchema,
  }).strict(),
  frozenInputs: z.object({
    tasks: FrozenFileSchema,
    resourceContract: FrozenFileSchema,
    scorer: FrozenFileSchema,
  }).strict(),
  frozenImplementations: z.object({
    planner: FrozenFileSchema,
    runner: FrozenFileSchema,
    gate: FrozenFileSchema,
  }).strict(),
  model: z.object({
    route: z.literal("xty/gpt-5.6-sol"),
    family: z.literal("gpt"),
  }).strict(),
  adapter: z.object({
    id: z.literal("bare-agent"),
    version: z.literal("workspace-law-validated-artifact-heldout-v1"),
  }).strict(),
  directExecution: z.object({
    system: z.literal("validated-artifact"),
    model: z.literal("direct-deterministic"),
    modelFamily: z.literal("none"),
    adapter: z.literal("validated-artifact-runtime"),
    adapterVersion: z.literal("validated-artifact-runtime-v1"),
  }).strict(),
  matrix: z.object({
    modelSystems: z.tuple([
      z.literal("no-skill"),
      z.literal("original"),
      z.literal("ir-static"),
    ]),
    systems: z.tuple([
      z.literal("no-skill"),
      z.literal("original"),
      z.literal("ir-static"),
      z.literal("validated-artifact"),
    ]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("held-out"),
    taskIds: z.tuple([
      z.literal("law-to-markdown-regulation-heldout-001"),
      z.literal("law-to-markdown-manual-heldout-002"),
    ]),
    repetitions: z.literal(2),
    expectedRows: z.literal(16),
    expectedModelRows: z.literal(12),
    expectedArtifactRows: z.literal(4),
    expectedQuartets: z.literal(4),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    pythonEnv: z.literal("SKVM_PYTHON"),
    phases: z.tuple([
      z.literal("plan"),
      z.literal("route-probe"),
      z.literal("execute"),
    ]),
    retries: z.literal(0),
    routeProbeTimeoutMs: z.literal(180000),
    routeProbeRequired: z.literal(true),
    resourceProbeRequired: z.literal(true),
  }).strict(),
  gate: z.object({
    minimumArtifactSuccesses: z.literal(4),
    minimumArtifactMeanScore: z.literal(0.85),
    minimumArtifactTaskMeanScore: z.literal(0.85),
    maximumInfrastructureFailures: z.literal(0),
    maximumArtifactHardGateFailures: z.literal(0),
    maximumPairwiseRegressions: z.literal(0),
    minimumPairwiseImprovements: z.literal(1),
  }).strict(),
  promotionBoundary: z.object({
    developmentGateRequired: z.literal(true),
    entersLawHeldoutClaimOnPass: z.literal(true),
    permitsPackageRecompile: z.literal(false),
    permitsScorerRetuning: z.literal(false),
    permitsHeldoutFeedback: z.literal(false),
    permitsPgo: z.literal(false),
    permitsRetry: z.literal(false),
    permitsCrossSkillClaim: z.literal(false),
    permitsBreakEvenClaim: z.literal(false),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict();

export type ValidatedArtifactHeldoutLock = z.infer<
  typeof ValidatedArtifactHeldoutLockSchema
>;

export type ValidatedArtifactHeldoutPlanEntry = RealAgentRunPlanEntry & {
  executionClass: "model-agent" | "direct-deterministic";
};

export type ValidatedArtifactHeldoutPlan = {
  schemaVersion: "skill-ir-validated-artifact-heldout-plan/v1";
  experimentId: string;
  methodEvidence: false;
  lock: ValidatedArtifactHeldoutLock;
  package: ValidatedArtifactPackage;
  modelRunArgs: RealAgentRunArgs;
  plan: ValidatedArtifactHeldoutPlanEntry[];
};

type TaskRegistry = {
  skillId?: string;
  tasks?: SkillIRBenchmarkTask[];
};

async function verifyDigest(
  rootDir: string,
  file: { path: string; sha256: string },
): Promise<void> {
  const actual = sha256Bytes(await readFile(path.resolve(rootDir, file.path)));
  if (actual !== file.sha256) {
    throw new Error(`Validated artifact held-out digest mismatch for ${file.path}`);
  }
}

function validatePassedDevelopmentEvidence(
  input: unknown,
  experimentId: string,
): ValidatedArtifactDevelopmentGateReport {
  const report = input as ValidatedArtifactDevelopmentGateReport;
  if (
    report?.schemaVersion !== "skill-ir-validated-artifact-development-gate-report/v1"
    || report.experimentId !== experimentId
    || report.counts?.observedRawRows !== 16
    || report.counts?.observedScoredRows !== 16
    || report.counts?.completeQuartets !== 4
    || report.counts?.infrastructureFailures !== 0
    || report.gate?.passed !== true
  ) {
    throw new Error("Validated artifact held-out requires a passed complete development gate");
  }
  return report;
}

function validateDevelopmentSummary(input: unknown, experimentId: string): void {
  const summary = input as {
    schemaVersion?: unknown;
    experimentId?: unknown;
    counts?: { observedRawRows?: unknown; observedScoredRows?: unknown };
    gate?: { passed?: unknown };
  };
  if (
    summary?.schemaVersion !== "skill-ir-validated-artifact-development-summary/v1"
    || summary.experimentId !== experimentId
    || summary.counts?.observedRawRows !== 16
    || summary.counts?.observedScoredRows !== 16
    || summary.gate?.passed !== true
  ) {
    throw new Error("Validated artifact held-out development summary is not passed and complete");
  }
}

export async function validateValidatedArtifactHeldoutLock(
  input: unknown,
  rootDir: string,
): Promise<{
  lock: ValidatedArtifactHeldoutLock;
  package: ValidatedArtifactPackage;
  developmentGate: ValidatedArtifactDevelopmentGateReport;
}> {
  const resolvedRoot = path.resolve(rootDir);
  const lock = ValidatedArtifactHeldoutLockSchema.parse(input);
  await Promise.all([
    ...Object.values(lock.upstream),
    ...Object.values(lock.frozenInputs),
    ...Object.values(lock.frozenImplementations),
  ].map((file) => verifyDigest(resolvedRoot, file)));

  const execution = await readAndValidateValidatedArtifactExecutionFreeze({
    rootDir: resolvedRoot,
    freezePath: path.resolve(resolvedRoot, lock.upstream.executionFreeze.path),
  });
  if (
    execution.freeze.parentLock.path !== lock.upstream.developmentLock.path
    || execution.freeze.parentLock.sha256 !== lock.upstream.developmentLock.sha256
    || execution.parent.lock.experimentId
      !== "law-to-markdown-validated-artifact-development-v1"
    || execution.parent.lock.model.route !== lock.model.route
    || execution.parent.lock.model.family !== lock.model.family
    || execution.parent.lock.adapter.id !== lock.adapter.id
  ) {
    throw new Error("Validated artifact held-out upstream identity drift");
  }
  for (const inputName of ["tasks", "resourceContract", "scorer"] as const) {
    const heldoutInput = lock.frozenInputs[inputName];
    const developmentInput = execution.parent.lock.frozenInputs[inputName];
    if (
      heldoutInput.path !== developmentInput.path
      || heldoutInput.sha256 !== developmentInput.sha256
    ) {
      throw new Error(`Validated artifact held-out ${inputName} input drift`);
    }
  }

  const developmentGate = validatePassedDevelopmentEvidence(JSON.parse(await readFile(
    path.resolve(resolvedRoot, lock.upstream.developmentGate.path),
    "utf8",
  )), execution.parent.lock.experimentId);
  validateDevelopmentSummary(JSON.parse(await readFile(
    path.resolve(resolvedRoot, lock.upstream.developmentSummary.path),
    "utf8",
  )), execution.parent.lock.experimentId);

  const registry = JSON.parse(await readFile(
    path.resolve(resolvedRoot, lock.frozenInputs.tasks.path),
    "utf8",
  )) as TaskRegistry;
  if (registry.skillId !== lock.skillId || !Array.isArray(registry.tasks)) {
    throw new Error("Validated artifact held-out task registry identity drift");
  }
  const splitById = new Map(registry.tasks.map((task) => [task.id, task.split]));
  if (lock.matrix.taskIds.some((taskId) => splitById.get(taskId) !== "held-out")) {
    throw new Error("Validated artifact held-out lock contains a non-held-out task");
  }

  const provenance = execution.parent.package.provenance;
  if (
    provenance.constructionSplit !== "development"
    || !provenance.forbiddenEvidenceClasses.includes("held-out")
    || lock.matrix.taskIds.some((taskId) =>
      provenance.inputs.taskContract.taskIds.includes(taskId))
  ) {
    throw new Error("Validated artifact held-out construction isolation failed");
  }
  return {
    lock,
    package: execution.parent.package,
    developmentGate,
  };
}

export async function readAndValidateValidatedArtifactHeldoutLock(opts: {
  rootDir: string;
  lockPath: string;
}) {
  const lockPath = path.isAbsolute(opts.lockPath)
    ? opts.lockPath
    : path.resolve(opts.rootDir, opts.lockPath);
  return validateValidatedArtifactHeldoutLock(
    JSON.parse(await readFile(lockPath, "utf8")),
    opts.rootDir,
  );
}

function directCaseDirectory(
  outDir: string,
  row: RealAgentRunPlanEntry,
): string {
  const safeCaseId = row.caseId.replace(/[^a-zA-Z0-9._-]+/g, "__");
  return path.join(
    outDir,
    "artifacts",
    safeCaseId,
    "validated-artifact",
    `run-${row.runIndex}`,
  );
}

async function buildDirectRows(opts: {
  outDir: string;
  lock: ValidatedArtifactHeldoutLock;
  package: ValidatedArtifactPackage;
  modelRows: RealAgentRunPlanEntry[];
}): Promise<ValidatedArtifactHeldoutPlanEntry[]> {
  const noSkillRows = opts.modelRows.filter((row) => row.system === "no-skill");
  return Promise.all(noSkillRows.map(async (row) => {
    const caseDir = directCaseDirectory(opts.outDir, row);
    const taskDir = path.join(caseDir, "task");
    const workDir = path.join(caseDir, "workdir");
    await Promise.all([mkdir(taskDir, { recursive: true }), mkdir(workDir, { recursive: true })]);
    const taskPath = path.join(taskDir, "task.json");
    await copyFile(row.taskPath, taskPath);
    return {
      caseId: row.caseId,
      system: opts.lock.directExecution.system as ExperimentSystem,
      taskPath,
      workDir,
      model: opts.lock.directExecution.model,
      modelFamily: opts.lock.directExecution.modelFamily,
      adapter: opts.lock.directExecution.adapter,
      adapterVersion: opts.lock.directExecution.adapterVersion,
      runIndex: row.runIndex,
      panelConfigId: opts.lock.experimentId,
      command: [],
      artifactPackageDir: opts.package.packageDir,
      executionClass: "direct-deterministic",
    };
  }));
}

export async function buildValidatedArtifactHeldoutPlan(opts: {
  rootDir: string;
  lockPath: string;
  outDir: string;
}): Promise<ValidatedArtifactHeldoutPlan> {
  const rootDir = path.resolve(opts.rootDir);
  const outDir = path.resolve(opts.outDir);
  const validated = await readAndValidateValidatedArtifactHeldoutLock({
    rootDir,
    lockPath: opts.lockPath,
  });
  const { lock } = validated;
  const modelRunArgs: RealAgentRunArgs = {
    corpus: lock.corpus,
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.adapter.id,
    adapterVersion: lock.adapter.version,
    repetitions: lock.matrix.repetitions,
    panelConfigId: lock.experimentId,
    outDir,
    limit: lock.matrix.expectedModelRows,
    execute: false,
    retries: lock.runtime.retries,
    retryDelayMs: 0,
    rootDir,
    allowTasksAuthored: false,
    allowDevelopmentReplay: false,
    allowArtifactDevelopmentReplay: false,
    skills: new Set([lock.skillId]),
    systems: new Set(lock.matrix.modelSystems),
    contexts: new Set(lock.matrix.contexts),
    agents: new Set(lock.matrix.agents),
    environments: new Set(lock.matrix.environments),
    tasks: new Set(lock.matrix.taskIds),
    requireEnv: new Set([lock.runtime.apiKeyEnv]),
  };
  const modelRows = await buildPlan(modelRunArgs);
  if (modelRows.length !== lock.matrix.expectedModelRows) {
    throw new Error("Validated artifact held-out model row count drift");
  }
  const directRows = await buildDirectRows({
    outDir,
    lock,
    package: validated.package,
    modelRows,
  });
  const plan: ValidatedArtifactHeldoutPlanEntry[] = [
    ...modelRows.map((row) => ({ ...row, executionClass: "model-agent" as const })),
    ...directRows,
  ];
  const quartets = new Map<string, Set<string>>();
  for (const row of plan) {
    if (
      row.panelConfigId !== lock.experimentId
      || !lock.matrix.taskIds.some((taskId) => row.caseId.endsWith(`:${taskId}`))
    ) {
      throw new Error("Validated artifact held-out plan identity drift");
    }
    const key = `${row.caseId}:${row.runIndex}`;
    const systems = quartets.get(key) ?? new Set<string>();
    systems.add(row.system);
    quartets.set(key, systems);
  }
  if (
    plan.length !== lock.matrix.expectedRows
    || directRows.length !== lock.matrix.expectedArtifactRows
    || quartets.size !== lock.matrix.expectedQuartets
    || [...quartets.values()].some((systems) =>
      systems.size !== lock.matrix.systems.length
      || lock.matrix.systems.some((system) => !systems.has(system)))
  ) {
    throw new Error("Validated artifact held-out plan does not contain complete quartets");
  }
  return {
    schemaVersion: "skill-ir-validated-artifact-heldout-plan/v1",
    experimentId: lock.experimentId,
    methodEvidence: false,
    lock,
    package: validated.package,
    modelRunArgs,
    plan,
  };
}
