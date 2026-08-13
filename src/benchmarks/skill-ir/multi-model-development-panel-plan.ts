import { copyFile, lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ExperimentSystem } from "./matrix";
import {
  ApiTesterArtifactDevelopmentLockSchema,
  selectApiTesterArtifactVariant,
  type ApiTesterArtifactDevelopmentLock,
} from "./api-tester-artifact-development";
import {
  EnvManagerV3ArtifactDevelopmentLockSchema,
  selectEnvManagerV3ArtifactVariant,
  type EnvManagerV3ArtifactDevelopmentLock,
} from "./env-manager-v3-artifact-development";
import {
  MultiModelDevelopmentPanelLockSchema,
  buildMultiModelPanelEntries,
  type MultiModelDevelopmentPanelLock,
  type MultiModelPanelPlanEntry,
} from "./multi-model-development-panel";
import { buildPlan, type RealAgentRunArgs } from "./real-agent-run";
import type { RealAgentRunPlanEntry, SkvmTaskJson } from "./real-agent";
import { sha256Bytes } from "./source-fixture";
import { runCommandWithTimeout } from "./route-probe";
import {
  validateValidatedArtifactPackage,
  type ValidatedArtifactPackage,
} from "./validated-artifact-catalog";

type FrozenFile = { path: string; sha256: string };

type PanelPackages = Record<string, ValidatedArtifactPackage>;

export type MultiModelDevelopmentPanelPlan = {
  schemaVersion: "skill-ir-multi-model-development-panel-plan/v1";
  experimentId: string;
  methodEvidence: true;
  lock: MultiModelDevelopmentPanelLock;
  runArgs: RealAgentRunArgs[];
  modelRows: MultiModelPanelPlanEntry[];
  artifactRows: MultiModelPanelPlanEntry[];
  packages: PanelPackages;
  caseInputs: Record<string, { tasksPath: string; resourceContractPath: string }>;
};

function resolveContained(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Multi-model frozen path escapes repository: ${relativePath}`);
  }
  return target;
}

async function verifyFrozenFile(rootDir: string, file: FrozenFile, label: string): Promise<Buffer> {
  const target = resolveContained(rootDir, file.path);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Multi-model ${label} must be a regular file`);
  const bytes = await readFile(target);
  if (sha256Bytes(bytes) !== file.sha256) throw new Error(`Multi-model digest mismatch: ${file.path}`);
  return bytes;
}

async function readFrozenBaseLock<T>(
  rootDir: string,
  frozen: FrozenFile,
  parse: (input: unknown) => T,
): Promise<T> {
  const bytes = await verifyFrozenFile(rootDir, frozen, "base lock");
  return parse(JSON.parse(bytes.toString("utf8")));
}

async function verifyApiSemanticClosure(rootDir: string, lock: ApiTesterArtifactDevelopmentLock): Promise<PanelPackages> {
  const files = [
    ...Object.entries(lock.frozenInputs).filter(([label]) =>
      label !== "corpusManifest" && label !== "evaluatorRegistry"),
    ...Object.entries(lock.benchmarkGuards),
    ...Object.values(lock.frozenPackages).flatMap((item) => [item.manifest, item.provenance, item.executionPlan]
      .map((file, index) => [`${item.variantId}-${index}`, file] as const)),
  ] as Array<readonly [string, FrozenFile]>;
  await Promise.all(files.map(([label, file]) => verifyFrozenFile(rootDir, file, `API Tester ${label}`)));
  const currentCorpus = JSON.parse(await readFile(
    resolveContained(rootDir, lock.frozenInputs.corpusManifest.path), "utf8",
  )) as { skills?: Array<Record<string, unknown>> };
  const skill = currentCorpus.skills?.find((item) => item.id === lock.skillId);
  if (!skill || skill.status !== lock.promotionBoundary.corpusStatusAtRun
    || skill.sourcePath !== lock.frozenInputs.source.path
    || skill.tasksPath !== lock.frozenInputs.tasks.path
    || skill.resourceContractPath !== lock.frozenInputs.resourceContract.path
    || skill.irPath !== lock.frozenInputs.baseIr.path
    || skill.sourceAuditPath !== lock.frozenInputs.sourceAudit.path) {
    throw new Error("Multi-model API Tester current corpus projection drift");
  }
  const evaluatorRegistry = await readFile(
    resolveContained(rootDir, lock.frozenInputs.evaluatorRegistry.path), "utf8",
  );
  for (const required of [
    'import "./api-tester-grade.ts"',
    '["skill-ir-api-tester", "src/bench/evaluators/api-tester-grade.ts"]',
    `["skill-ir-api-tester", "${lock.frozenInputs.scorer.sha256}"]`,
  ]) {
    if (!evaluatorRegistry.includes(required)) {
      throw new Error(`Multi-model API Tester evaluator registry projection drift: ${required}`);
    }
  }
  return {
    "api-tester:openapi-yaml": await validateValidatedArtifactPackage(
      resolveContained(rootDir, lock.frozenPackages.openapiYaml.directory),
    ),
    "api-tester:openapi-json": await validateValidatedArtifactPackage(
      resolveContained(rootDir, lock.frozenPackages.openapiJson.directory),
    ),
  };
}

async function verifyEnvSemanticClosure(rootDir: string, lock: EnvManagerV3ArtifactDevelopmentLock): Promise<PanelPackages> {
  const files = [
    ...Object.entries(lock.frozenInputs),
    ...Object.values(lock.frozenPackages).flatMap((item) => [item.manifest, item.provenance, item.executionPlan]
      .map((file, index) => [`${item.variantId}-${index}`, file] as const)),
  ] as Array<readonly [string, FrozenFile]>;
  await Promise.all(files.map(([label, file]) => verifyFrozenFile(rootDir, file, `Env Manager v3 ${label}`)));
  return {
    "env-manager-v3:node": await validateValidatedArtifactPackage(
      resolveContained(rootDir, lock.frozenPackages.node.directory),
    ),
    "env-manager-v3:vite": await validateValidatedArtifactPackage(
      resolveContained(rootDir, lock.frozenPackages.vite.directory),
    ),
  };
}

function runArgs(options: {
  rootDir: string;
  outDir: string;
  lock: MultiModelDevelopmentPanelLock;
  model: MultiModelDevelopmentPanelLock["models"][number];
  skillId: string;
  taskIds: readonly string[];
}): RealAgentRunArgs {
  const { lock } = options;
  return {
    corpus: "pilot",
    model: options.model.route,
    modelFamily: options.model.family,
    adapter: lock.harness.adapter,
    adapterVersion: lock.harness.adapterVersion,
    repetitions: lock.matrix.targetBlocksPerCell + lock.matrix.reserveBlocksPerCell,
    panelConfigId: lock.experimentId,
    outDir: options.outDir,
    limit: options.taskIds.length * lock.matrix.modelSystems.length
      * (lock.matrix.targetBlocksPerCell + lock.matrix.reserveBlocksPerCell),
    execute: false,
    retries: lock.runtime.retries,
    retryDelayMs: 0,
    outerWatchdogMs: lock.runtime.outerWatchdogMs,
    rootDir: options.rootDir,
    allowTasksAuthored: false,
    allowDevelopmentReplay: false,
    allowArtifactDevelopmentReplay: false,
    skills: new Set([options.skillId]),
    systems: new Set(lock.matrix.modelSystems),
    contexts: new Set([lock.harness.context]),
    agents: new Set(["skvm"]),
    environments: new Set([lock.harness.environment]),
    tasks: new Set(options.taskIds),
    requireEnv: new Set([lock.runtime.apiKeyEnv]),
  };
}

function managedRows(
  rows: RealAgentRunPlanEntry[],
  rootDir: string,
  lock: MultiModelDevelopmentPanelLock,
): RealAgentRunPlanEntry[] {
  return rows.map((row) => {
    const observationPath = path.join(path.dirname(row.workDir), "execution-observation.json");
    return {
      ...row,
      command: [
        process.execPath,
        "run",
        path.resolve(rootDir, "src/index.ts"),
        "run",
        ...row.command.slice(4).filter((arg) => !arg.startsWith("--adapter-config=")
          && !arg.startsWith("--timeout-ms=") && !arg.startsWith("--idle-timeout-ms=")
          && !arg.startsWith("--max-steps=") && !arg.startsWith("--execution-observation=")),
        "--adapter-config=managed",
        `--timeout-ms=${lock.runtime.absoluteTimeoutMs}`,
        `--idle-timeout-ms=${lock.runtime.idleTimeoutMs}`,
        `--max-steps=${lock.runtime.maxSteps}`,
        `--execution-observation=${observationPath}`,
      ],
    };
  });
}

async function buildArtifactRows(options: {
  rootDir: string;
  outDir: string;
  lock: MultiModelDevelopmentPanelLock;
  basePlans: Record<string, RealAgentRunPlanEntry[]>;
  apiLock: ApiTesterArtifactDevelopmentLock;
  envLock: EnvManagerV3ArtifactDevelopmentLock;
}): Promise<Array<RealAgentRunPlanEntry & { artifactPackageDir: string }>> {
  const gptPlans = [
    ...options.basePlans["gpt:api-tester"]!,
    ...options.basePlans["gpt:env-manager-v3"]!,
  ];
  const rows: Array<RealAgentRunPlanEntry & { artifactPackageDir: string }> = [];
  for (const panelCase of options.lock.cases) for (const taskId of panelCase.taskIds) {
    const source = gptPlans.find((row) => row.system === "no-skill" && row.runIndex === 1
      && row.caseId.endsWith(`:${taskId}`));
    if (!source) throw new Error(`Multi-model artifact source task missing: ${taskId}`);
    const caseDir = path.join(options.outDir, "shared-artifacts", panelCase.skillId, taskId);
    const taskDir = path.join(caseDir, "task");
    const workDir = path.join(caseDir, "workdir");
    await Promise.all([mkdir(taskDir, { recursive: true }), mkdir(workDir, { recursive: true })]);
    const taskPath = path.join(taskDir, "task.json");
    await copyFile(source.taskPath, taskPath);
    let artifactPackageDir: string;
    if (panelCase.skillId === "api-tester") {
      const task = JSON.parse(await readFile(taskPath, "utf8")) as SkvmTaskJson;
      const variant = selectApiTesterArtifactVariant(task.fixtures ?? {});
      const frozen = variant === "openapi-yaml"
        ? options.apiLock.frozenPackages.openapiYaml : options.apiLock.frozenPackages.openapiJson;
      artifactPackageDir = resolveContained(options.rootDir, frozen.directory);
    } else {
      const variant = selectEnvManagerV3ArtifactVariant(taskId);
      artifactPackageDir = resolveContained(options.rootDir, options.envLock.frozenPackages[variant].directory);
    }
    rows.push({
      ...source,
      system: "validated-artifact" as ExperimentSystem,
      taskPath,
      workDir,
      model: "direct-deterministic",
      modelFamily: "none",
      adapter: "validated-artifact-runtime",
      adapterVersion: "validated-artifact-runtime-v1",
      runIndex: 1,
      panelConfigId: options.lock.experimentId,
      command: [],
      artifactPackageDir,
    });
  }
  return rows;
}

export async function buildMultiModelDevelopmentPanelPlan(options: {
  rootDir: string;
  lockPath: string;
  outDir: string;
}): Promise<MultiModelDevelopmentPanelPlan> {
  const rootDir = path.resolve(options.rootDir);
  const outDir = path.resolve(options.outDir);
  const lock = MultiModelDevelopmentPanelLockSchema.parse(JSON.parse(
    await readFile(path.resolve(options.lockPath), "utf8"),
  ));
  await Promise.all(Object.entries(lock.frozenImplementations).map(([label, file]) =>
    verifyFrozenFile(rootDir, file, label)));
  await Promise.all([
    verifyFrozenFile(rootDir, lock.harness.packageJson, "package.json"),
    verifyFrozenFile(rootDir, lock.harness.bunLock, "bun.lock"),
    verifyFrozenFile(rootDir, lock.harness.piCli, "Pi CLI"),
  ]);
  const installedPi = JSON.parse(await readFile(
    resolveContained(rootDir, lock.harness.installedPackageJson), "utf8",
  )) as { version?: string };
  const node = Bun.which(lock.harness.nodeCommand);
  const nodeVersion = node ? await runCommandWithTimeout([node, "--version"], 30_000) : undefined;
  if (installedPi.version !== lock.harness.adapterVersion || Bun.version !== lock.harness.bunVersion
    || !node || sha256Bytes(await readFile(node)) !== lock.harness.nodeExecutableSha256
    || nodeVersion?.exitCode !== 0 || nodeVersion.stdout.trim() !== lock.harness.nodeVersion) {
    throw new Error("Multi-model panel harness identity drift");
  }
  const apiLock = await readFrozenBaseLock(rootDir, lock.cases[0].baseLock,
    (input) => ApiTesterArtifactDevelopmentLockSchema.parse(input));
  const envLock = await readFrozenBaseLock(rootDir, lock.cases[1].baseLock,
    (input) => EnvManagerV3ArtifactDevelopmentLockSchema.parse(input));
  const packageEntries = await Promise.all([
    verifyApiSemanticClosure(rootDir, apiLock),
    verifyEnvSemanticClosure(rootDir, envLock),
  ]);
  const packages = Object.assign({}, ...packageEntries) as PanelPackages;
  const basePlans: Record<string, RealAgentRunPlanEntry[]> = {};
  const args: RealAgentRunArgs[] = [];
  for (const model of lock.models) for (const panelCase of lock.cases) {
    const key = `${model.family}:${panelCase.skillId}`;
    const currentArgs = runArgs({
      rootDir,
      outDir: path.join(outDir, "model", model.family, panelCase.skillId),
      lock,
      model,
      skillId: panelCase.skillId,
      taskIds: panelCase.taskIds,
    });
    args.push(currentArgs);
    basePlans[key] = managedRows(await buildPlan(currentArgs), rootDir, lock);
  }
  const artifactRows = await buildArtifactRows({
    rootDir, outDir, lock, basePlans, apiLock, envLock,
  });
  const entries = buildMultiModelPanelEntries({ lock, basePlans, artifactRows });
  if ([...entries.modelRows, ...entries.artifactRows].some((row) =>
    row.workDir.length > lock.harness.maximumWorkDirLength)) {
    throw new Error("Multi-model panel workdir exceeds frozen path budget");
  }
  return {
    schemaVersion: "skill-ir-multi-model-development-panel-plan/v1",
    experimentId: lock.experimentId,
    methodEvidence: true,
    lock,
    runArgs: args,
    modelRows: entries.modelRows,
    artifactRows: entries.artifactRows,
    packages,
    caseInputs: {
      "api-tester": {
        tasksPath: resolveContained(rootDir, apiLock.frozenInputs.tasks.path),
        resourceContractPath: resolveContained(rootDir, apiLock.frozenInputs.resourceContract.path),
      },
      "env-manager-v3": {
        tasksPath: resolveContained(rootDir, envLock.frozenInputs.tasks.path),
        resourceContractPath: resolveContained(rootDir, envLock.frozenInputs.resourceContract.path),
      },
    },
  };
}
