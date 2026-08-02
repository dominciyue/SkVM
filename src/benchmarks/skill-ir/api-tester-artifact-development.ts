import { copyFile, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SkillIRSchema } from "../../skill-ir/schema";
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit";
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package";
import { ApiTesterContractAuditReportSchema } from "./api-tester-contract-audit";
import { ApiTesterMaterializationAuditReportSchema } from "./api-tester-materialization-audit";
import type { ExperimentSystem } from "./matrix";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";
import type { RealAgentRunPlanEntry, SkvmTaskJson } from "./real-agent";
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";
import {
  validateValidatedArtifactPackage,
  type ValidatedArtifactPackage,
} from "./validated-artifact-catalog";
import {
  buildValidatedArtifactDevelopmentGateReport,
  type ValidatedArtifactDevelopmentGateReport,
} from "./validated-artifact-development-gate";
import type { ValidatedArtifactDevelopmentLock } from "./validated-artifact-development";

const FrozenFileSchema = z.object({
  path: SafeRelativePathSchema,
  sha256: Sha256Schema,
}).strict();

const FrozenPackageSchema = z.object({
  variantId: z.enum(["openapi-yaml", "openapi-json"]),
  inputPath: z.enum(["api/openapi.yaml", "api/openapi.json"]),
  directory: SafeRelativePathSchema,
  manifest: FrozenFileSchema,
  provenance: FrozenFileSchema,
  executionPlan: FrozenFileSchema,
}).strict();

const ModelSystemsSchema = z.tuple([
  z.literal("no-skill"),
  z.literal("original"),
  z.literal("ir-static"),
]);

export const ApiTesterArtifactDevelopmentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-artifact-development-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.literal("api-tester-schema-derived-artifact-development-v1"),
  methodEvidence: z.literal(true),
  corpus: z.literal("pilot"),
  skillId: z.literal("api-tester"),
  frozenInputs: z.object({
    source: FrozenFileSchema,
    tasks: FrozenFileSchema,
    publicInterface: FrozenFileSchema,
    resourceContract: FrozenFileSchema,
    scorer: FrozenFileSchema,
    oracle: FrozenFileSchema,
    evaluatorRegistry: FrozenFileSchema,
    baseIr: FrozenFileSchema,
    sourceAudit: FrozenFileSchema,
    artifactAdapter: FrozenFileSchema,
    corpusManifest: FrozenFileSchema,
  }).strict(),
  benchmarkGuards: z.object({
    taskSplitFreeze: FrozenFileSchema,
    sourceProvenance: FrozenFileSchema,
    contractAudit: FrozenFileSchema,
    materializationAudit: FrozenFileSchema,
  }).strict(),
  frozenPackages: z.object({
    openapiYaml: FrozenPackageSchema,
    openapiJson: FrozenPackageSchema,
  }).strict(),
  frozenImplementations: z.object({
    compiler: FrozenFileSchema,
    catalog: FrozenFileSchema,
    runtime: FrozenFileSchema,
    planner: FrozenFileSchema,
    directRunner: FrozenFileSchema,
    gate: FrozenFileSchema,
    modelRunner: FrozenFileSchema,
    scoring: FrozenFileSchema,
    sourceEntrypoint: FrozenFileSchema,
  }).strict(),
  harness: z.object({
    adapter: z.literal("pi"),
    adapterVersion: z.literal("0.67.68"),
    mode: z.literal("managed"),
    packageJson: FrozenFileSchema,
    bunLock: FrozenFileSchema,
    adapterSource: FrozenFileSchema,
    installedPackageJson: SafeRelativePathSchema,
    piCli: FrozenFileSchema,
    nodeCommand: z.literal("node"),
    nodeVersion: z.literal("v23.8.0"),
    nodeExecutableSha256: Sha256Schema,
    bunVersion: z.literal("1.3.14"),
    maximumWorkDirLength: z.literal(220),
  }).strict(),
  model: z.object({ route: z.literal("xty/gpt-5.6-sol"), family: z.literal("gpt") }).strict(),
  adapter: z.object({ id: z.literal("pi"), version: z.literal("0.67.68") }).strict(),
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
      z.literal("api-tester-openapi-users-dev-001"),
      z.literal("api-tester-openapi-inventory-dev-002"),
    ]),
    repetitions: z.literal(2),
    expectedRows: z.literal(16),
    expectedModelRows: z.literal(12),
    expectedArtifactRows: z.literal(4),
    expectedQuartets: z.literal(4),
  }).strict(),
  qualification: z.object({
    system: z.literal("original"),
    taskId: z.literal("api-tester-openapi-users-dev-001"),
    runIndex: z.literal(1),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"),
    nodeEnv: z.literal("SKVM_NODE"),
    retries: z.literal(0),
    taskTimeoutMs: z.literal(300000),
    maxSteps: z.literal(30),
    outerWatchdogMs: z.literal(360000),
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
  promotionBoundary: z.object({
    corpusStatusAtRun: z.literal("runnable"),
    developmentOnly: z.literal(true),
    methodDevelopmentOnly: z.literal(true),
    entersMainClaim: z.literal(false),
    permitsHeldOutPlanning: z.literal(false),
    permitsHeldOutExecution: z.literal(false),
    permitsPgo: z.literal(false),
    permitsScorerRetuning: z.literal(false),
    permitsPackageRecompile: z.literal(false),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict().superRefine((lock, context) => {
  if (lock.frozenPackages.openapiYaml.variantId !== "openapi-yaml"
    || lock.frozenPackages.openapiYaml.inputPath !== "api/openapi.yaml"
    || lock.frozenPackages.openapiJson.variantId !== "openapi-json"
    || lock.frozenPackages.openapiJson.inputPath !== "api/openapi.json") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "API Tester package variant mapping drift" });
  }
});

export type ApiTesterArtifactDevelopmentLock = z.infer<
  typeof ApiTesterArtifactDevelopmentLockSchema
>;
export type ApiTesterArtifactVariantId = "openapi-yaml" | "openapi-json";

type CorpusManifest = {
  skills?: Array<Record<string, unknown>>;
};

type TaskRegistry = {
  skillId?: string;
  tasks?: Array<{
    id?: string;
    split?: string;
    fixtures?: Record<string, string>;
    hardGateIds?: string[];
  }>;
};

async function verifyFrozenFile(
  rootDir: string,
  file: { path: string; sha256: string },
  label: string,
): Promise<Buffer> {
  const root = path.resolve(rootDir);
  const absolute = path.resolve(root, ...file.path.split("/"));
  const relative = path.relative(root, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`API Tester artifact development ${label} escapes repository root`);
  }
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`API Tester artifact development ${label} must be a regular file`);
  }
  const bytes = await readFile(absolute);
  if (sha256Bytes(bytes) !== file.sha256) {
    throw new Error(`API Tester artifact development digest mismatch for ${file.path}`);
  }
  return bytes;
}

function packageForVariant(
  lock: ApiTesterArtifactDevelopmentLock,
  variantId: ApiTesterArtifactVariantId,
) {
  return variantId === "openapi-yaml"
    ? lock.frozenPackages.openapiYaml
    : lock.frozenPackages.openapiJson;
}

export function selectApiTesterArtifactVariant(
  fixtures: Record<string, string>,
): ApiTesterArtifactVariantId {
  const variants = [
    fixtures["api/openapi.yaml"] !== undefined ? "openapi-yaml" as const : undefined,
    fixtures["api/openapi.json"] !== undefined ? "openapi-json" as const : undefined,
  ].filter((value): value is ApiTesterArtifactVariantId => value !== undefined);
  if (variants.length !== 1) {
    throw new Error(`API Tester task requires exactly one public OpenAPI fixture, got ${variants.length}`);
  }
  return variants[0]!;
}

async function validatePackage(
  rootDir: string,
  frozen: z.infer<typeof FrozenPackageSchema>,
): Promise<ValidatedArtifactPackage> {
  const packageRecord = await validateValidatedArtifactPackage(path.resolve(rootDir, frozen.directory));
  if (packageRecord.manifest.skillId !== "api-tester") {
    throw new Error("API Tester artifact package skill mismatch");
  }
  if (!packageRecord.manifest.protectedInputs.includes(frozen.inputPath)
    || !packageRecord.manifest.protectedInputs.includes("api-test-interface.json")) {
    throw new Error(`API Tester artifact package ${frozen.variantId} protected input drift`);
  }
  for (const [label, actual, expected] of [
    ["manifest", frozen.manifest.path, "package-manifest.json"],
    ["provenance", frozen.provenance.path, packageRecord.manifest.provenance.path],
    ["execution plan", frozen.executionPlan.path, packageRecord.manifest.executionPlan.path],
  ] as const) {
    if (actual !== path.posix.join(frozen.directory, expected)) {
      throw new Error(`API Tester artifact package ${label} path drift`);
    }
  }
  return packageRecord;
}

export async function validateApiTesterArtifactDevelopmentLock(
  input: unknown,
  rootDir: string,
): Promise<{
  lock: ApiTesterArtifactDevelopmentLock;
  packages: Record<ApiTesterArtifactVariantId, ValidatedArtifactPackage>;
}> {
  const root = path.resolve(rootDir);
  const lock = ApiTesterArtifactDevelopmentLockSchema.parse(input);
  const allFiles = [
    ...Object.entries(lock.frozenInputs).map(([label, file]) => [label, file] as const),
    ...Object.entries(lock.benchmarkGuards).map(([label, file]) => [label, file] as const),
    ...Object.entries(lock.frozenImplementations).map(([label, file]) => [label, file] as const),
    ["package.json", lock.harness.packageJson] as const,
    ["bun.lock", lock.harness.bunLock] as const,
    ["Pi adapter", lock.harness.adapterSource] as const,
    ["Pi CLI", lock.harness.piCli] as const,
    ...Object.values(lock.frozenPackages).flatMap((record) => [
      [`${record.variantId} manifest`, record.manifest] as const,
      [`${record.variantId} provenance`, record.provenance] as const,
      [`${record.variantId} execution plan`, record.executionPlan] as const,
    ]),
  ];
  const verified = new Map(await Promise.all(allFiles.map(async ([label, file]) =>
    [file.path, await verifyFrozenFile(root, file, label)] as const)));

  const manifest = JSON.parse(
    verified.get(lock.frozenInputs.corpusManifest.path)!.toString("utf8"),
  ) as CorpusManifest;
  const skill = manifest.skills?.find((entry) => entry.id === lock.skillId);
  if (!skill
    || skill.status !== lock.promotionBoundary.corpusStatusAtRun
    || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path
    || skill.irPath !== lock.frozenInputs.baseIr.path
    || skill.sourceAuditPath !== lock.frozenInputs.sourceAudit.path) {
    throw new Error("API Tester artifact development corpus identity drift");
  }

  const tasks = JSON.parse(verified.get(lock.frozenInputs.tasks.path)!.toString("utf8")) as TaskRegistry;
  if (tasks.skillId !== lock.skillId) throw new Error("API Tester artifact task set skill drift");
  const taskById = new Map((tasks.tasks ?? []).map((task) => [task.id, task]));
  for (const taskId of lock.matrix.taskIds) {
    const task = taskById.get(taskId);
    if (!task || task.split !== lock.matrix.taskSplit || !task.fixtures) {
      throw new Error(`API Tester artifact development requires frozen development task ${taskId}`);
    }
    const variant = selectApiTesterArtifactVariant(task.fixtures);
    if (packageForVariant(lock, variant).variantId !== variant) {
      throw new Error(`API Tester artifact task ${taskId} package mapping drift`);
    }
  }

  const ir = SkillIRSchema.parse(JSON.parse(verified.get(lock.frozenInputs.baseIr.path)!.toString("utf8")));
  const audit = SkillIRSourceAuditSchema.parse(JSON.parse(
    verified.get(lock.frozenInputs.sourceAudit.path)!.toString("utf8"),
  ));
  const auditReport = await verifySkillIRSourceAudit(ir, audit, root);
  if (auditReport.errors.length > 0) {
    throw new Error(`API Tester artifact source audit failed: ${auditReport.errors.join("; ")}`);
  }

  const contractAudit = ApiTesterContractAuditReportSchema.parse(JSON.parse(
    verified.get(lock.benchmarkGuards.contractAudit.path)!.toString("utf8"),
  ));
  const materializationAudit = ApiTesterMaterializationAuditReportSchema.parse(JSON.parse(
    verified.get(lock.benchmarkGuards.materializationAudit.path)!.toString("utf8"),
  ));
  if (contractAudit.status !== "passed" || contractAudit.issues.length > 0
    || materializationAudit.status !== "passed" || materializationAudit.issues.length > 0) {
    throw new Error("API Tester artifact development benchmark audit did not pass");
  }

  const packageJson = JSON.parse(verified.get(lock.harness.packageJson.path)!.toString("utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declaredPi = packageJson.dependencies?.["@mariozechner/pi-coding-agent"]
    ?? packageJson.devDependencies?.["@mariozechner/pi-coding-agent"];
  const installedPi = JSON.parse(
    await readFile(path.resolve(root, lock.harness.installedPackageJson), "utf8"),
  ) as { version?: string };
  const node = Bun.which(lock.harness.nodeCommand);
  if (declaredPi !== lock.harness.adapterVersion
    || installedPi.version !== lock.harness.adapterVersion
    || Bun.version !== lock.harness.bunVersion
    || !node
    || sha256Bytes(await readFile(node)) !== lock.harness.nodeExecutableSha256) {
    throw new Error("API Tester artifact development harness identity drift");
  }

  const [yamlPackage, jsonPackage] = await Promise.all([
    validatePackage(root, lock.frozenPackages.openapiYaml),
    validatePackage(root, lock.frozenPackages.openapiJson),
  ]);
  return {
    lock,
    packages: {
      "openapi-yaml": yamlPackage,
      "openapi-json": jsonPackage,
    },
  };
}

export async function readAndValidateApiTesterArtifactDevelopmentLock(options: {
  rootDir: string;
  lockPath?: string;
  input?: unknown;
}): Promise<ApiTesterArtifactDevelopmentLock> {
  if ((options.lockPath === undefined) === (options.input === undefined)) {
    throw new Error("Provide exactly one of lockPath or input");
  }
  const input = options.input ?? JSON.parse(await readFile(path.resolve(options.lockPath!), "utf8"));
  return (await validateApiTesterArtifactDevelopmentLock(input, options.rootDir)).lock;
}

export type ApiTesterArtifactDevelopmentPlanEntry = RealAgentRunPlanEntry & {
  executionClass: "model-agent" | "direct-deterministic";
  artifactVariantId?: ApiTesterArtifactVariantId;
};

export type ApiTesterArtifactDevelopmentPlan = {
  schemaVersion: "skill-ir-api-tester-artifact-development-plan/v1";
  experimentId: string;
  methodEvidence: true;
  lock: ApiTesterArtifactDevelopmentLock;
  packages: Record<ApiTesterArtifactVariantId, ValidatedArtifactPackage>;
  modelRunArgs: RealAgentRunArgs;
  plan: ApiTesterArtifactDevelopmentPlanEntry[];
};

function managedPlan(
  plan: RealAgentRunPlanEntry[],
  lock: ApiTesterArtifactDevelopmentLock,
  rootDir: string,
): RealAgentRunPlanEntry[] {
  return plan.map((row) => ({
    ...row,
    command: [
      process.execPath,
      "run",
      path.resolve(rootDir, lock.frozenImplementations.sourceEntrypoint.path),
      "run",
      ...row.command.slice(4).filter((arg) =>
        !arg.startsWith("--adapter-config=")
        && !arg.startsWith("--timeout-ms=")
        && !arg.startsWith("--max-steps=")),
      "--adapter-config=managed",
      `--timeout-ms=${lock.runtime.taskTimeoutMs}`,
      `--max-steps=${lock.runtime.maxSteps}`,
    ],
  }));
}

function directCaseDirectory(outDir: string, row: RealAgentRunPlanEntry): string {
  const safeCaseId = row.caseId.replace(/[^a-zA-Z0-9._-]+/g, "__");
  return path.join(outDir, "artifacts", safeCaseId, "validated-artifact", `run-${row.runIndex}`);
}

async function buildDirectRows(options: {
  outDir: string;
  lock: ApiTesterArtifactDevelopmentLock;
  modelRows: RealAgentRunPlanEntry[];
}): Promise<ApiTesterArtifactDevelopmentPlanEntry[]> {
  const noSkillRows = options.modelRows.filter((row) => row.system === "no-skill");
  return Promise.all(noSkillRows.map(async (row) => {
    const task = JSON.parse(await readFile(row.taskPath, "utf8")) as SkvmTaskJson;
    const variant = selectApiTesterArtifactVariant(task.fixtures ?? {});
    const frozenPackage = packageForVariant(options.lock, variant);
    const caseDir = directCaseDirectory(options.outDir, row);
    const taskDir = path.join(caseDir, "task");
    const workDir = path.join(caseDir, "workdir");
    await Promise.all([mkdir(taskDir, { recursive: true }), mkdir(workDir, { recursive: true })]);
    const taskPath = path.join(taskDir, "task.json");
    await copyFile(row.taskPath, taskPath);
    return {
      caseId: row.caseId,
      system: options.lock.directExecution.system as ExperimentSystem,
      taskPath,
      workDir,
      model: options.lock.directExecution.model,
      modelFamily: options.lock.directExecution.modelFamily,
      adapter: options.lock.directExecution.adapter,
      adapterVersion: options.lock.directExecution.adapterVersion,
      runIndex: row.runIndex,
      panelConfigId: options.lock.experimentId,
      command: [],
      artifactPackageDir: path.resolve(frozenPackage.directory),
      artifactVariantId: variant,
      executionClass: "direct-deterministic",
    };
  }));
}

export async function buildApiTesterArtifactDevelopmentPlan(options: {
  rootDir: string;
  lockPath: string;
  outDir: string;
}): Promise<ApiTesterArtifactDevelopmentPlan> {
  const rootDir = path.resolve(options.rootDir);
  const outDir = path.resolve(options.outDir);
  const validated = await validateApiTesterArtifactDevelopmentLock(
    JSON.parse(await readFile(path.resolve(options.lockPath), "utf8")),
    rootDir,
  );
  const { lock } = validated;
  const modelRunArgs: RealAgentRunArgs = {
    corpus: lock.corpus,
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.adapter.id,
    adapterVersion: lock.adapter.version,
    repetitions: lock.matrix.repetitions,
    panelConfigId: lock.experimentId,
    outDir: path.join(outDir, "model-run"),
    limit: lock.matrix.expectedModelRows,
    execute: false,
    retries: lock.runtime.retries,
    retryDelayMs: 0,
    outerWatchdogMs: lock.runtime.outerWatchdogMs,
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
  const modelRows = managedPlan(await buildPlan(modelRunArgs), lock, rootDir);
  if (modelRows.length !== lock.matrix.expectedModelRows) {
    throw new Error(`API Tester artifact model row mismatch: ${modelRows.length}`);
  }
  const directRows = await buildDirectRows({ outDir, lock, modelRows });
  const plan: ApiTesterArtifactDevelopmentPlanEntry[] = [
    ...modelRows.map((row) => ({ ...row, executionClass: "model-agent" as const })),
    ...directRows,
  ];

  const quartets = new Map<string, Set<string>>();
  for (const row of plan) {
    if (row.panelConfigId !== lock.experimentId
      || row.workDir.length > lock.harness.maximumWorkDirLength) {
      throw new Error("API Tester artifact development plan identity or path budget drift");
    }
    const key = `${row.caseId}:${row.runIndex}`;
    const entry = quartets.get(key) ?? new Set<string>();
    entry.add(row.system);
    quartets.set(key, entry);
  }
  if (plan.length !== lock.matrix.expectedRows
    || directRows.length !== lock.matrix.expectedArtifactRows
    || quartets.size !== lock.matrix.expectedQuartets
    || [...quartets.values()].some((entry) =>
      entry.size !== lock.matrix.systems.length
      || lock.matrix.systems.some((system) => !entry.has(system)))) {
    throw new Error("API Tester artifact development plan requires complete quartets");
  }
  return {
    schemaVersion: "skill-ir-api-tester-artifact-development-plan/v1",
    experimentId: lock.experimentId,
    methodEvidence: true,
    lock,
    packages: validated.packages,
    modelRunArgs,
    plan,
  };
}

export function buildApiTesterArtifactDevelopmentGateReport(options: {
  lock: ApiTesterArtifactDevelopmentLock;
  tasks: Array<{ id: string; split: string; hardGateIds: string[] }>;
  rawRows: RawAgentRunRow[];
  scoredRows: ScoredAgentRunRow[];
}): ValidatedArtifactDevelopmentGateReport {
  return buildValidatedArtifactDevelopmentGateReport({
    ...options,
    lock: options.lock as unknown as ValidatedArtifactDevelopmentLock,
  });
}
