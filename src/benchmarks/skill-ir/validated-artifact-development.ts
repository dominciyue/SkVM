import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SkillIRSchema } from "../../skill-ir/schema";
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit";
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package";
import type { ExperimentSystem } from "./matrix";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";
import type { RealAgentRunPlanEntry } from "./real-agent";
import { sha256Bytes } from "./source-fixture";
import {
  validateValidatedArtifactPackage,
  type ValidatedArtifactPackage,
} from "./validated-artifact-catalog";

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

const ModelSystemsSchema = z.tuple([
  z.literal("no-skill"),
  z.literal("original"),
  z.literal("ir-static"),
]);

export const ValidatedArtifactDevelopmentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-validated-artifact-development-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.literal("law-to-markdown-validated-artifact-development-v1"),
  methodEvidence: z.literal(true),
  corpus: z.literal("pilot"),
  skillId: z.literal("law-to-markdown"),
  frozenInputs: z.object({
    source: FrozenFileSchema,
    tasks: FrozenFileSchema,
    resourceContract: FrozenFileSchema,
    scorer: FrozenFileSchema,
    baseIr: FrozenFileSchema,
    sourceAudit: FrozenFileSchema,
  }).strict(),
  frozenPackage: z.object({
    directory: SafeRelativePathSchema,
    manifest: FrozenFileSchema,
    provenance: FrozenFileSchema,
    executionPlan: FrozenFileSchema,
  }).strict(),
  frozenImplementations: z.object({
    compiler: FrozenFileSchema,
    catalog: FrozenFileSchema,
    runtime: FrozenFileSchema,
    planner: FrozenFileSchema,
    directRunner: FrozenFileSchema,
    gate: FrozenFileSchema,
  }).strict(),
  model: z.object({
    route: z.literal("xty/gpt-5.6-sol"),
    family: z.literal("gpt"),
  }).strict(),
  adapter: z.object({
    id: z.literal("bare-agent"),
    version: z.literal("workspace-law-validated-artifact-v1"),
  }).strict(),
  directExecution: z.object({
    system: z.literal("validated-artifact"),
    model: z.literal("direct-deterministic"),
    modelFamily: z.literal("none"),
    adapter: z.literal("validated-artifact-runtime"),
    adapterVersion: z.literal("validated-artifact-runtime-v1"),
  }).strict(),
  matrix: z.object({
    modelSystems: ModelSystemsSchema,
    systems: z.tuple([
      z.literal("no-skill"),
      z.literal("original"),
      z.literal("ir-static"),
      z.literal("validated-artifact"),
    ]),
    contexts: z.tuple([z.literal("clean")]),
    agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]),
    taskSplit: z.literal("development"),
    taskIds: z.tuple([
      z.literal("law-to-markdown-statute-dev-001"),
      z.literal("law-to-markdown-standard-dev-002"),
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
    retries: z.literal(0),
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
  }).strict(),
  costAccounting: z.object({
    schemaVersion: z.literal("skill-ir-artifact-cost-accounting/v1"),
    compileCost: z.literal("measure-once"),
    profileCost: z.literal(0),
    researchDiagnosticCost: z.literal("report-separately"),
    modelGenerationTokens: z.literal("sum-model-arms"),
    modelRepairTokens: z.literal(0),
    deterministicProcessDuration: z.literal("sum-artifact-process-nodes"),
    validationDuration: z.literal("sum-artifact-validation-nodes"),
    packageBytes: z.literal("verified-package-bytes"),
    breakEven: z.literal("not-computed-quality-gate-pending"),
  }).strict(),
  promotionBoundary: z.object({
    corpusStatusAtRun: z.literal("runnable"),
    entersMainClaim: z.literal(false),
    permitsHeldOutPlanningAfterGate: z.literal(true),
    permitsHeldOutExecution: z.literal(false),
    permitsPgo: z.literal(false),
    permitsScorerRetuning: z.literal(false),
    permitsPackageRecompile: z.literal(false),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, ctx) => {
  if (new Set(lock.matrix.systems).size !== lock.matrix.systems.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Development systems must be unique" });
  }
  if (new Set(lock.matrix.taskIds).size !== lock.matrix.taskIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Development task ids must be unique" });
  }
});

export type ValidatedArtifactDevelopmentLock = z.infer<
  typeof ValidatedArtifactDevelopmentLockSchema
>;

type CorpusManifest = {
  skills: Array<{
    id?: string;
    status?: string;
    sourcePath?: string;
    tasksPath?: string;
    resourceContractPath?: string;
    irPath?: string;
    sourceAuditPath?: string;
  }>;
};

type TaskSet = {
  skillId?: string;
  tasks?: Array<{ id?: string; split?: string }>;
};

async function verifyDigest(
  rootDir: string,
  file: { path: string; sha256: string },
): Promise<void> {
  const actual = sha256Bytes(await readFile(path.resolve(rootDir, file.path)));
  if (actual !== file.sha256) {
    throw new Error(`Validated artifact development digest mismatch for ${file.path}`);
  }
}

export async function validateValidatedArtifactDevelopmentLock(
  input: unknown,
  rootDir: string,
): Promise<{
  lock: ValidatedArtifactDevelopmentLock;
  package: ValidatedArtifactPackage;
}> {
  const resolvedRoot = path.resolve(rootDir);
  const lock = ValidatedArtifactDevelopmentLockSchema.parse(input);
  await Promise.all([
    ...Object.values(lock.frozenInputs),
    lock.frozenPackage.manifest,
    lock.frozenPackage.provenance,
    lock.frozenPackage.executionPlan,
    ...Object.values(lock.frozenImplementations),
  ].map((file) => verifyDigest(resolvedRoot, file)));

  const manifest = JSON.parse(await readFile(
    path.resolve(resolvedRoot, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
    "utf8",
  )) as CorpusManifest;
  const skill = manifest.skills.find((entry) => entry.id === lock.skillId);
  if (
    !skill
    || skill.status !== lock.promotionBoundary.corpusStatusAtRun
    || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path
    || skill.irPath !== lock.frozenInputs.baseIr.path
    || skill.sourceAuditPath !== lock.frozenInputs.sourceAudit.path
  ) {
    throw new Error("Validated artifact development corpus identity drift");
  }

  const taskSet = JSON.parse(await readFile(
    path.resolve(resolvedRoot, lock.frozenInputs.tasks.path),
    "utf8",
  )) as TaskSet;
  if (taskSet.skillId !== lock.skillId) {
    throw new Error("Validated artifact development task set skill mismatch");
  }
  const splitById = new Map((taskSet.tasks ?? []).map((task) => [task.id, task.split]));
  if (lock.matrix.taskIds.some((taskId) => splitById.get(taskId) !== lock.matrix.taskSplit)) {
    throw new Error("Validated artifact development contains a non-development task");
  }

  const ir = SkillIRSchema.parse(JSON.parse(await readFile(
    path.resolve(resolvedRoot, lock.frozenInputs.baseIr.path),
    "utf8",
  )));
  const audit = SkillIRSourceAuditSchema.parse(JSON.parse(await readFile(
    path.resolve(resolvedRoot, lock.frozenInputs.sourceAudit.path),
    "utf8",
  )));
  const auditReport = await verifySkillIRSourceAudit(ir, audit, resolvedRoot);
  if (auditReport.errors.length > 0) {
    throw new Error(`Validated artifact development source audit failed: ${auditReport.errors.join("; ")}`);
  }

  const packageDir = path.resolve(resolvedRoot, lock.frozenPackage.directory);
  const packageRecord = await validateValidatedArtifactPackage(packageDir);
  if (packageRecord.manifest.skillId !== lock.skillId) {
    throw new Error("Validated artifact development package skill mismatch");
  }
  const expectedRefs: Array<[string, string, string]> = [
    ["manifest", lock.frozenPackage.manifest.path, "package-manifest.json"],
    ["provenance", lock.frozenPackage.provenance.path, packageRecord.manifest.provenance.path],
    ["execution plan", lock.frozenPackage.executionPlan.path, packageRecord.manifest.executionPlan.path],
  ];
  for (const [label, actual, expected] of expectedRefs) {
    const expectedPath = path.posix.join(lock.frozenPackage.directory, expected);
    if (actual !== expectedPath) {
      throw new Error(`Validated artifact development ${label} path mismatch`);
    }
  }
  return { lock, package: packageRecord };
}

export async function readAndValidateValidatedArtifactDevelopmentLock(opts: {
  rootDir: string;
  lockPath: string;
}): Promise<{
  lock: ValidatedArtifactDevelopmentLock;
  package: ValidatedArtifactPackage;
}> {
  return validateValidatedArtifactDevelopmentLock(
    JSON.parse(await readFile(path.resolve(opts.lockPath), "utf8")),
    opts.rootDir,
  );
}

export type ValidatedArtifactDevelopmentPlanEntry = RealAgentRunPlanEntry & {
  executionClass: "model-agent" | "direct-deterministic";
};

export type ValidatedArtifactDevelopmentPlan = {
  schemaVersion: "skill-ir-validated-artifact-development-plan/v1";
  experimentId: string;
  methodEvidence: true;
  lock: ValidatedArtifactDevelopmentLock;
  package: ValidatedArtifactPackage;
  modelRunArgs: RealAgentRunArgs;
  plan: ValidatedArtifactDevelopmentPlanEntry[];
};

function directCaseDirectory(outDir: string, row: RealAgentRunPlanEntry): string {
  const safeCaseId = row.caseId.replace(/[^a-zA-Z0-9._-]+/g, "__");
  return path.join(outDir, "artifacts", safeCaseId, "validated-artifact", `run-${row.runIndex}`);
}

async function buildDirectRows(opts: {
  outDir: string;
  lock: ValidatedArtifactDevelopmentLock;
  package: ValidatedArtifactPackage;
  modelRows: RealAgentRunPlanEntry[];
}): Promise<ValidatedArtifactDevelopmentPlanEntry[]> {
  const noSkillRows = opts.modelRows.filter((row) => row.system === "no-skill");
  return Promise.all(noSkillRows.map(async (row) => {
    const caseDir = directCaseDirectory(opts.outDir, row);
    const taskDir = path.join(caseDir, "task");
    const workDir = path.join(caseDir, "workdir");
    await Promise.all([
      mkdir(taskDir, { recursive: true }),
      mkdir(workDir, { recursive: true }),
    ]);
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

export async function buildValidatedArtifactDevelopmentPlan(opts: {
  rootDir: string;
  lockPath: string;
  outDir: string;
}): Promise<ValidatedArtifactDevelopmentPlan> {
  const rootDir = path.resolve(opts.rootDir);
  const outDir = path.resolve(opts.outDir);
  const { lock, package: packageRecord } =
    await readAndValidateValidatedArtifactDevelopmentLock({
      rootDir,
      lockPath: path.isAbsolute(opts.lockPath) ? opts.lockPath : path.resolve(rootDir, opts.lockPath),
    });
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
    throw new Error(
      `Validated artifact model row mismatch: expected ${lock.matrix.expectedModelRows}, got ${modelRows.length}`,
    );
  }
  const directRows = await buildDirectRows({
    outDir,
    lock,
    package: packageRecord,
    modelRows,
  });
  const plan: ValidatedArtifactDevelopmentPlanEntry[] = [
    ...modelRows.map((row) => ({ ...row, executionClass: "model-agent" as const })),
    ...directRows,
  ];

  const quartets = new Map<string, Set<string>>();
  for (const row of plan) {
    if (row.panelConfigId !== lock.experimentId) {
      throw new Error("Validated artifact development panel identity drift");
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
      lock.matrix.systems.some((system) => !systems.has(system))
      || systems.size !== lock.matrix.systems.length)
  ) {
    throw new Error("Validated artifact development plan does not contain complete quartets");
  }

  return {
    schemaVersion: "skill-ir-validated-artifact-development-plan/v1",
    experimentId: lock.experimentId,
    methodEvidence: true,
    lock,
    package: packageRecord,
    modelRunArgs,
    plan,
  };
}
