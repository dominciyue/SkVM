import { copyFile, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { SkillIRSchema } from "../../skill-ir/schema";
import { SkillIRSourceAuditSchema, verifySkillIRSourceAudit } from "../../skill-ir/source-audit";
import { SafeRelativePathSchema, Sha256Schema } from "./artifact-package";
import type { ExperimentSystem } from "./matrix";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";
import type { RealAgentRunPlanEntry } from "./real-agent";
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring";
import { sha256Bytes } from "./source-fixture";
import { validateValidatedArtifactPackage, type ValidatedArtifactPackage } from "./validated-artifact-catalog";
import { buildValidatedArtifactDevelopmentGateReport, type ValidatedArtifactDevelopmentGateReport } from "./validated-artifact-development-gate";
import type { ValidatedArtifactDevelopmentLock } from "./validated-artifact-development";

const FrozenFileSchema = z.object({ path: SafeRelativePathSchema, sha256: Sha256Schema }).strict();
const FrozenPackageSchema = z.object({
  variantId: z.enum(["node", "vite"]),
  directory: SafeRelativePathSchema,
  manifest: FrozenFileSchema,
  provenance: FrozenFileSchema,
  executionPlan: FrozenFileSchema,
}).strict();

export const EnvManagerV3ArtifactDevelopmentLockSchema = z.object({
  schemaVersion: z.literal("skill-ir-env-manager-v3-artifact-development-lock/v1"),
  status: z.literal("preregistered"),
  experimentId: z.literal("env-manager-v3-validated-artifact-development-v1"),
  methodEvidence: z.literal(true),
  corpus: z.literal("pilot"),
  skillId: z.literal("env-manager-v3"),
  frozenInputs: z.object({
    source: FrozenFileSchema, tasks: FrozenFileSchema, publicInterface: FrozenFileSchema,
    resourceContract: FrozenFileSchema, scorer: FrozenFileSchema, evaluatorRegistry: FrozenFileSchema,
    baseIr: FrozenFileSchema, sourceAudit: FrozenFileSchema, artifactAdapter: FrozenFileSchema,
    corpusManifest: FrozenFileSchema, staticGate: FrozenFileSchema,
  }).strict(),
  frozenPackages: z.object({ node: FrozenPackageSchema, vite: FrozenPackageSchema }).strict(),
  frozenImplementations: z.object({
    compiler: FrozenFileSchema, assembly: FrozenFileSchema, catalog: FrozenFileSchema, runtime: FrozenFileSchema,
    planner: FrozenFileSchema, directRunner: FrozenFileSchema, gate: FrozenFileSchema,
    modelRunner: FrozenFileSchema, scoring: FrozenFileSchema, sourceEntrypoint: FrozenFileSchema,
  }).strict(),
  harness: z.object({
    adapter: z.literal("pi"), adapterVersion: z.literal("0.67.68"), mode: z.literal("managed"),
    packageJson: FrozenFileSchema, bunLock: FrozenFileSchema, adapterSource: FrozenFileSchema,
    installedPackageJson: SafeRelativePathSchema, piCli: FrozenFileSchema,
    nodeCommand: z.literal("node"), nodeVersion: z.string().min(1), bunVersion: z.string().min(1),
    maximumWorkDirLength: z.literal(220),
  }).strict(),
  model: z.object({ route: z.literal("xty/gpt-5.6-sol"), family: z.literal("gpt") }).strict(),
  adapter: z.object({ id: z.literal("pi"), version: z.literal("0.67.68") }).strict(),
  directExecution: z.object({
    system: z.literal("validated-artifact"), model: z.literal("direct-deterministic"), modelFamily: z.literal("none"),
    adapter: z.literal("validated-artifact-runtime"), adapterVersion: z.literal("validated-artifact-runtime-v1"),
  }).strict(),
  matrix: z.object({
    modelSystems: z.tuple([z.literal("no-skill"), z.literal("original"), z.literal("ir-static")]),
    systems: z.tuple([z.literal("no-skill"), z.literal("original"), z.literal("ir-static"), z.literal("validated-artifact")]),
    contexts: z.tuple([z.literal("clean")]), agents: z.tuple([z.literal("skvm")]),
    environments: z.tuple([z.literal("windows")]), taskSplit: z.literal("development"),
    taskIds: z.tuple([z.literal("env-manager-scorer-authority-node-dev-001"), z.literal("env-manager-scorer-authority-vite-dev-002")]),
    repetitions: z.literal(2), expectedRows: z.literal(16), expectedModelRows: z.literal(12),
    expectedArtifactRows: z.literal(4), expectedQuartets: z.literal(4),
  }).strict(),
  qualification: z.object({
    system: z.literal("original"), taskId: z.literal("env-manager-scorer-authority-node-dev-001"), runIndex: z.literal(1),
  }).strict(),
  runtime: z.object({
    apiKeyEnv: z.literal("SKVM_XTY_API_KEY"), nodeEnv: z.literal("SKVM_NODE"), retries: z.literal(0),
    absoluteTimeoutMs: z.literal(600000), idleTimeoutMs: z.literal(120000), maxSteps: z.literal(30),
    outerWatchdogMs: z.literal(660000), routeProbeRequired: z.literal(true), resourceProbeRequired: z.literal(true),
  }).strict(),
  gate: z.object({
    minimumArtifactSuccesses: z.literal(4), minimumArtifactMeanScore: z.literal(1),
    minimumArtifactTaskMeanScore: z.literal(1), maximumInfrastructureFailures: z.literal(0),
    maximumArtifactHardGateFailures: z.literal(0), maximumPairwiseRegressions: z.literal(0),
  }).strict(),
  promotionBoundary: z.object({
    corpusStatusAtRun: z.literal("runnable"), developmentOnly: z.literal(true), methodDevelopmentOnly: z.literal(true),
    entersMainClaim: z.literal(false), permitsHeldOutPlanning: z.literal(false), permitsHeldOutExecution: z.literal(false),
    permitsPgo: z.literal(false), permitsScorerRetuning: z.literal(false), permitsPackageRecompile: z.literal(false),
  }).strict(),
  prohibited: z.array(z.string().min(1)).min(1),
}).strict();

export type EnvManagerV3ArtifactDevelopmentLock = z.infer<typeof EnvManagerV3ArtifactDevelopmentLockSchema>;
export type EnvManagerV3ArtifactVariantId = "node" | "vite";

async function verifyFrozenFile(rootDir: string, file: { path: string; sha256: string }, label: string): Promise<Buffer> {
  const root = path.resolve(rootDir);
  const absolute = path.resolve(root, ...file.path.split("/"));
  const relative = path.relative(root, absolute);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`${label} escapes repository root`);
  const stat = await lstat(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  const bytes = await readFile(absolute);
  if (sha256Bytes(bytes) !== file.sha256) throw new Error(`Env Manager v3 artifact development digest mismatch for ${file.path}`);
  return bytes;
}

export function selectEnvManagerV3ArtifactVariant(taskId: string): EnvManagerV3ArtifactVariantId {
  if (taskId === "env-manager-scorer-authority-node-dev-001") return "node";
  if (taskId === "env-manager-scorer-authority-vite-dev-002") return "vite";
  throw new Error(`No Env Manager v3 artifact variant for ${taskId}`);
}

export async function validateEnvManagerV3ArtifactDevelopmentLock(input: unknown, rootDir: string) {
  const lock = EnvManagerV3ArtifactDevelopmentLockSchema.parse(input);
  const allFiles = [
    ...Object.entries(lock.frozenInputs), ...Object.entries(lock.frozenImplementations),
    ["packageJson", lock.harness.packageJson] as const, ["bunLock", lock.harness.bunLock] as const,
    ["adapterSource", lock.harness.adapterSource] as const, ["piCli", lock.harness.piCli] as const,
    ...Object.values(lock.frozenPackages).flatMap((record) => [
      [`${record.variantId} manifest`, record.manifest] as const,
      [`${record.variantId} provenance`, record.provenance] as const,
      [`${record.variantId} execution plan`, record.executionPlan] as const,
    ]),
  ];
  const verified = new Map(await Promise.all(allFiles.map(async ([label, file]) =>
    [file.path, await verifyFrozenFile(rootDir, file, label)] as const)));
  const corpus = JSON.parse(verified.get(lock.frozenInputs.corpusManifest.path)!.toString("utf8")) as { skills?: Array<Record<string, unknown>> };
  const skill = corpus.skills?.find((entry) => entry.id === lock.skillId);
  if (!skill || skill.status !== "runnable" || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path
    || skill.irPath !== lock.frozenInputs.baseIr.path || skill.sourceAuditPath !== lock.frozenInputs.sourceAudit.path) {
    throw new Error("Env Manager v3 artifact development corpus identity drift");
  }
  const tasks = JSON.parse(verified.get(lock.frozenInputs.tasks.path)!.toString("utf8")) as { skillId?: string; tasks?: Array<{ id?: string; split?: string }> };
  if (tasks.skillId !== lock.skillId || lock.matrix.taskIds.some((id) => !tasks.tasks?.some((task) => task.id === id && task.split === "development"))) throw new Error("Env Manager v3 artifact task identity drift");
  const ir = SkillIRSchema.parse(JSON.parse(verified.get(lock.frozenInputs.baseIr.path)!.toString("utf8")));
  const audit = SkillIRSourceAuditSchema.parse(JSON.parse(verified.get(lock.frozenInputs.sourceAudit.path)!.toString("utf8")));
  const auditReport = await verifySkillIRSourceAudit(ir, audit, rootDir);
  if (auditReport.errors.length) throw new Error(`Env Manager v3 artifact source audit failed: ${auditReport.errors.join("; ")}`);
  const packages = {} as Record<EnvManagerV3ArtifactVariantId, ValidatedArtifactPackage>;
  for (const variant of ["node", "vite"] as const) {
    const frozen = lock.frozenPackages[variant];
    if (frozen.variantId !== variant) throw new Error("Env Manager v3 package variant drift");
    const validated = await validateValidatedArtifactPackage(path.resolve(rootDir, frozen.directory));
    if (validated.manifest.skillId !== lock.skillId) throw new Error("Env Manager v3 package skill drift");
    packages[variant] = validated;
  }
  const packageJson = JSON.parse(verified.get(lock.harness.packageJson.path)!.toString("utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const declaredPi = packageJson.dependencies?.["@mariozechner/pi-coding-agent"] ?? packageJson.devDependencies?.["@mariozechner/pi-coding-agent"];
  const installedPi = JSON.parse(await readFile(path.resolve(rootDir, lock.harness.installedPackageJson), "utf8")) as { version?: string };
  const node = Bun.which(lock.harness.nodeCommand);
  if (declaredPi !== lock.harness.adapterVersion || installedPi.version !== lock.harness.adapterVersion
    || Bun.version !== lock.harness.bunVersion || !node) throw new Error("Env Manager v3 artifact harness identity drift");
  return { lock, packages };
}

export async function readAndValidateEnvManagerV3ArtifactDevelopmentLock(options: { rootDir: string; lockPath?: string; input?: unknown }) {
  if ((options.lockPath === undefined) === (options.input === undefined)) throw new Error("Provide exactly one of lockPath or input");
  const input = options.input ?? JSON.parse(await readFile(path.resolve(options.lockPath!), "utf8"));
  return (await validateEnvManagerV3ArtifactDevelopmentLock(input, options.rootDir)).lock;
}

export type EnvManagerV3ArtifactDevelopmentPlanEntry = RealAgentRunPlanEntry & {
  executionClass: "model-agent" | "direct-deterministic";
  artifactVariantId?: EnvManagerV3ArtifactVariantId;
};

export type EnvManagerV3ArtifactDevelopmentPlan = {
  schemaVersion: "skill-ir-env-manager-v3-artifact-development-plan/v1";
  experimentId: string;
  methodEvidence: true;
  lock: EnvManagerV3ArtifactDevelopmentLock;
  packages: Record<EnvManagerV3ArtifactVariantId, ValidatedArtifactPackage>;
  modelRunArgs: RealAgentRunArgs;
  plan: EnvManagerV3ArtifactDevelopmentPlanEntry[];
};

function managedPlan(plan: RealAgentRunPlanEntry[], lock: EnvManagerV3ArtifactDevelopmentLock, rootDir: string) {
  return plan.map((row) => {
    const observationPath = path.join(path.dirname(row.workDir), "execution-observation.json");
    return { ...row, command: [
      process.execPath, "run", path.resolve(rootDir, lock.frozenImplementations.sourceEntrypoint.path), "run",
      ...row.command.slice(4).filter((arg) => !arg.startsWith("--adapter-config=") && !arg.startsWith("--timeout-ms=")
        && !arg.startsWith("--idle-timeout-ms=") && !arg.startsWith("--max-steps=") && !arg.startsWith("--execution-observation=")),
      "--adapter-config=managed", `--timeout-ms=${lock.runtime.absoluteTimeoutMs}`,
      `--idle-timeout-ms=${lock.runtime.idleTimeoutMs}`, `--max-steps=${lock.runtime.maxSteps}`,
      `--execution-observation=${observationPath}`,
    ] };
  });
}

async function buildDirectRows(rootDir: string, outDir: string, lock: EnvManagerV3ArtifactDevelopmentLock, modelRows: RealAgentRunPlanEntry[]) {
  return Promise.all(modelRows.filter((row) => row.system === "no-skill").map(async (row) => {
    const taskId = row.caseId.split(":").at(-1)!;
    const variant = selectEnvManagerV3ArtifactVariant(taskId);
    const caseDir = path.join(outDir, "artifacts", row.caseId.replace(/[^a-zA-Z0-9._-]+/g, "__"), "validated-artifact", `run-${row.runIndex}`);
    await Promise.all([mkdir(path.join(caseDir, "task"), { recursive: true }), mkdir(path.join(caseDir, "workdir"), { recursive: true })]);
    const taskPath = path.join(caseDir, "task", "task.json");
    await copyFile(row.taskPath, taskPath);
    return {
      caseId: row.caseId, system: lock.directExecution.system as ExperimentSystem, taskPath, workDir: path.join(caseDir, "workdir"),
      model: lock.directExecution.model, modelFamily: lock.directExecution.modelFamily, adapter: lock.directExecution.adapter,
      adapterVersion: lock.directExecution.adapterVersion, runIndex: row.runIndex, panelConfigId: lock.experimentId, command: [],
      artifactPackageDir: path.resolve(rootDir, lock.frozenPackages[variant].directory), artifactVariantId: variant,
      executionClass: "direct-deterministic" as const,
    };
  }));
}

export async function buildEnvManagerV3ArtifactDevelopmentPlan(options: { rootDir: string; lockPath: string; outDir: string }): Promise<EnvManagerV3ArtifactDevelopmentPlan> {
  const rootDir = path.resolve(options.rootDir), outDir = path.resolve(options.outDir);
  const validated = await validateEnvManagerV3ArtifactDevelopmentLock(JSON.parse(await readFile(path.resolve(options.lockPath), "utf8")), rootDir);
  const { lock } = validated;
  const modelRunArgs: RealAgentRunArgs = {
    corpus: lock.corpus, model: lock.model.route, modelFamily: lock.model.family, adapter: lock.adapter.id,
    adapterVersion: lock.adapter.version, repetitions: lock.matrix.repetitions, panelConfigId: lock.experimentId,
    outDir: path.join(outDir, "model-run"), limit: lock.matrix.expectedModelRows, execute: false, retries: 0,
    retryDelayMs: 0, outerWatchdogMs: lock.runtime.outerWatchdogMs, rootDir, allowTasksAuthored: false,
    allowDevelopmentReplay: false, allowArtifactDevelopmentReplay: false, skills: new Set([lock.skillId]),
    systems: new Set(lock.matrix.modelSystems), contexts: new Set(lock.matrix.contexts), agents: new Set(lock.matrix.agents),
    environments: new Set(lock.matrix.environments), tasks: new Set(lock.matrix.taskIds), requireEnv: new Set([lock.runtime.apiKeyEnv]),
  };
  const modelRows = managedPlan(await buildPlan(modelRunArgs), lock, rootDir);
  if (modelRows.length !== lock.matrix.expectedModelRows) throw new Error("Env Manager v3 artifact model row mismatch");
  const directRows = await buildDirectRows(rootDir, outDir, lock, modelRows);
  const plan = [...modelRows.map((row) => ({ ...row, executionClass: "model-agent" as const })), ...directRows];
  const quartets = new Map<string, Set<string>>();
  for (const row of plan) {
    if (row.workDir.length > lock.harness.maximumWorkDirLength) throw new Error("Env Manager v3 artifact path budget drift");
    const key = `${row.caseId}:${row.runIndex}`, systems = quartets.get(key) ?? new Set<string>();
    systems.add(row.system); quartets.set(key, systems);
  }
  if (plan.length !== 16 || directRows.length !== 4 || quartets.size !== 4
    || [...quartets.values()].some((systems) => lock.matrix.systems.some((system) => !systems.has(system)))) {
    throw new Error("Env Manager v3 artifact development requires complete quartets");
  }
  return { schemaVersion: "skill-ir-env-manager-v3-artifact-development-plan/v1", experimentId: lock.experimentId, methodEvidence: true, lock, packages: validated.packages, modelRunArgs, plan };
}

export function buildEnvManagerV3ArtifactDevelopmentGateReport(options: {
  lock: EnvManagerV3ArtifactDevelopmentLock;
  tasks: Array<{ id: string; split: string; hardGateIds: string[] }>;
  rawRows: RawAgentRunRow[];
  scoredRows: ScoredAgentRunRow[];
}): ValidatedArtifactDevelopmentGateReport {
  return buildValidatedArtifactDevelopmentGateReport({ ...options, lock: options.lock as unknown as ValidatedArtifactDevelopmentLock });
}
