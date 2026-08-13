import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeInitialWorkdirManifest } from "../../core/workdir-manifest";
import { RunExecutionObservationSchema, type RunExecutionObservation } from "../../core/types";
import { parseSafeRelativePath } from "./artifact-package";
import {
  buildMultiModelDevelopmentPanelQualification,
  buildMultiModelDevelopmentPanelQualificationV2,
  buildMultiModelDevelopmentPanelQualificationV3,
  buildMultiModelDevelopmentPanelQualificationV4,
  buildMultiModelDevelopmentPanelReport,
  MultiModelDevelopmentPanelQualificationSchema,
  MultiModelDevelopmentPanelQualificationV2Schema,
  MultiModelDevelopmentPanelQualificationV3Schema,
  MultiModelDevelopmentPanelQualificationV4Schema,
  selectMultiModelQualificationAttempt,
  selectMultiModelInfrastructureQualificationAttempt,
  type MultiModelDevelopmentPanelQualification,
  type MultiModelDevelopmentPanelQualificationV2,
  type MultiModelDevelopmentPanelQualificationV3,
  type MultiModelDevelopmentPanelQualificationV4,
} from "./multi-model-development-panel";
import { buildMultiModelDevelopmentPanelPlan, type MultiModelDevelopmentPanelPlan } from "./multi-model-development-panel-plan";
import { executeMatchedExecutionBlocks, type ExecutionEnvelope } from "./execution-resilience";
import type { MatchedExecutionBlockSelection } from "./execution-resilience";
import { assertRequiredEnv, executeGenericPlanRow } from "./real-agent-run";
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring";
import { scoreRawRunRows } from "./scoring";
import type { SkillIRBenchmarkTask, SkvmTaskJson } from "./real-agent";
import { ResourceContractSchema, runResourceProbe } from "./resource-contract";
import { runCommandWithTimeout } from "./route-probe";
import { sha256Bytes } from "./source-fixture";
import { buildExecutionEnvelope } from "./static-development-v2-run";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

export type MultiModelDevelopmentPanelPhase = "plan" | "qualification" | "execute";

export type MultiModelDevelopmentPanelRunArgs = {
  rootDir: string;
  lockPath: string;
  outDir: string;
  phase: MultiModelDevelopmentPanelPhase;
};

export function parseMultiModelDevelopmentPanelRunArgs(
  argv: string[],
): MultiModelDevelopmentPanelRunArgs {
  let rootDir = process.cwd();
  let lockPath: string | undefined;
  let outDir: string | undefined;
  let phase: MultiModelDevelopmentPanelPhase | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = arg.slice("--root-dir=".length);
    else if (arg.startsWith("--lock=")) lockPath = arg.slice("--lock=".length);
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--phase=")) {
      const candidate = arg.slice("--phase=".length);
      if (candidate !== "plan" && candidate !== "qualification" && candidate !== "execute") {
        throw new Error(`Unsupported multi-model panel phase: ${candidate}`);
      }
      phase = candidate;
    } else throw new Error(`Unknown multi-model panel argument: ${arg}`);
  }
  if (!lockPath || !outDir || !phase) throw new Error("--lock, --out-dir, and --phase are required");
  return {
    rootDir: path.resolve(rootDir),
    lockPath: path.resolve(rootDir, lockPath),
    outDir: path.resolve(rootDir, outDir),
    phase,
  };
}

export function selectMultiModelPanelRawRowsForScoring<Raw extends {
  caseId: string;
  system: string;
  runIndex?: number;
  modelFamily?: string;
}>(input: {
  rawRows: Raw[];
  envelopes: ExecutionEnvelope[];
  selectedCells: Array<{
    modelFamily: string;
    skillId: string;
    taskId: string;
    candidateBlock: number;
  }>;
}): Raw[] {
  const selected = new Set(input.selectedCells.map((item) =>
    `${item.modelFamily}\0${item.skillId}\0${item.taskId}\0${item.candidateBlock}`));
  const semantic = new Set(input.envelopes.filter((item) => item.classification === "semantic-complete")
    .map((item) => item.attemptId));
  return input.rawRows.filter((row) => {
    const parts = row.caseId.split(":");
    const skillId = parts[0] ?? "";
    const taskId = parts.at(-1) ?? "";
    const block = row.runIndex ?? 0;
    const family = row.modelFamily ?? "";
    return selected.has(`${family}\0${skillId}\0${taskId}\0${block}`)
      && semantic.has(`${family}:${skillId}:${taskId}:block-${block}:${row.system}`);
  });
}

export function sanitizeMultiModelPanelScoredRows<Row extends Record<string, unknown>>(
  rows: readonly Row[],
): Array<Omit<Row, "initialWorkdirManifest"> & { initialWorkdirManifestSha256?: string }> {
  return rows.map(({ initialWorkdirManifest: localProvenance, ...portable }) => {
    const sha256 = typeof localProvenance === "object" && localProvenance !== null
      && "sha256" in localProvenance && typeof localProvenance.sha256 === "string"
      ? localProvenance.sha256 : undefined;
    return { ...portable, ...(sha256 ? { initialWorkdirManifestSha256: sha256 } : {}) };
  });
}

export async function multiModelQualificationOutputsPresent(workDir: string): Promise<boolean> {
  for (const relativePath of [
    "api-test-generator.mjs",
    "generated/api-test-plan.json",
    "api-test-report.json",
  ]) {
    try {
      const stat = await lstat(path.join(workDir, ...relativePath.split("/")));
      if (!stat.isFile() || stat.isSymbolicLink()) return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
  return true;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await writeFile(filePath, rows.length === 0 ? "" : `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function lockDigest(lockPath: string): Promise<string> {
  return sha256Bytes(await readFile(lockPath));
}

function taskIdOf(caseId: string): string {
  const taskId = caseId.split(":").at(-1);
  if (!taskId) throw new Error(`Multi-model task id missing: ${caseId}`);
  return taskId;
}

async function countFiles(root: string): Promise<number> {
  let count = 0;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) count += 1;
    }
  };
  await visit(root);
  return count;
}

async function executeModelRow(
  plan: MultiModelDevelopmentPanelPlan,
  row: MultiModelDevelopmentPanelPlan["modelRows"][number],
  env: Record<string, string | undefined>,
): Promise<{ raw: RawAgentRunRow; envelope: ExecutionEnvelope }> {
  const observationArg = row.command.find((arg) => arg.startsWith("--execution-observation="));
  if (!observationArg) throw new Error(`Multi-model observation path missing: ${row.caseId}`);
  const observationPath = observationArg.slice("--execution-observation=".length);
  await rm(observationPath, { force: true });
  const raw = await executeGenericPlanRow(
    row,
    { outerWatchdogMs: plan.lock.runtime.outerWatchdogMs, exposeOuterTimedOut: true },
    env,
  ) as RawAgentRunRow & { outerTimedOut?: boolean };
  let observation: RunExecutionObservation;
  try {
    observation = RunExecutionObservationSchema.parse(JSON.parse(await readFile(observationPath, "utf8")));
  } catch {
    observation = {
      schemaVersion: "skvm-run-execution-observation/v1",
      process: {
        exitCode: raw.exitCode,
        termination: raw.outerTimedOut ? "absolute-timeout" : raw.exitCode === 0 ? "natural" : "crash",
        durationMs: raw.durationMs,
      },
      activity: { requestDispatched: false, providerResponses: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0 },
      terminal: { present: false },
      usage: { available: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      parser: { outcome: raw.exitCode === 0 ? "incompatible" : "empty", unknownTypes: raw.exitCode === 0 ? ["missing-sidecar"] : [] },
    };
  }
  const taskId = taskIdOf(row.caseId);
  return {
    raw,
    envelope: buildExecutionEnvelope({
      experimentId: plan.lock.experimentId,
      taskId,
      system: row.system,
      candidateBlock: row.runIndex,
      attemptId: `${row.modelFamily}:${row.caseId.split(":")[0]}:${taskId}:block-${row.runIndex}:${row.system}`,
      observation,
      outputFileCount: await countFiles(row.workDir),
      outerWatchdog: raw.outerTimedOut,
    }),
  };
}

async function runQualification(
  args: MultiModelDevelopmentPanelRunArgs,
  plan: MultiModelDevelopmentPanelPlan,
  env: Record<string, string | undefined>,
): Promise<MultiModelDevelopmentPanelQualification> {
  for (const item of plan.runArgs) assertRequiredEnv(item, env);
  const node = Bun.which(plan.lock.harness.nodeCommand);
  if (!node) throw new Error("Multi-model qualification Node executable unavailable");
  const version = await runCommandWithTimeout([
    node, path.resolve(args.rootDir, plan.lock.harness.piCli.path), "--version",
  ], 30_000, env);
  const observedVersion = version.stdout.trim() || version.stderr.trim();
  const localPi = {
    status: version.exitCode === 0 && !version.timedOut && observedVersion === plan.lock.harness.adapterVersion
      ? "passed" as const : "failed" as const,
    observedVersion,
  };
  const resources = [] as MultiModelDevelopmentPanelQualification["resources"][number][];
  for (const panelCase of plan.lock.cases) {
    const contract = ResourceContractSchema.parse(JSON.parse(await readFile(
      plan.caseInputs[panelCase.skillId]!.resourceContractPath, "utf8",
    )));
    const result = await runResourceProbe(contract, { env });
    resources.push({ skillId: panelCase.skillId, status: result.status });
  }
  const routes = [] as MultiModelDevelopmentPanelQualification["routes"][number][];
  for (const model of plan.lock.models) {
    const row = plan.modelRows.find((item) => item.modelFamily === model.family
      && item.system === plan.lock.qualification.system && item.runIndex === 1
      && item.caseId.endsWith(`:${plan.lock.qualification.taskId}`));
    if (!row) throw new Error(`Multi-model qualification row missing: ${model.family}`);
    const executed = await executeModelRow(plan, row, { ...env, SKVM_AUTO_PROBE: "0" });
    routes.push({
      family: model.family,
      route: model.route,
      classification: executed.envelope.classification,
      outputsPresent: await multiModelQualificationOutputsPresent(row.workDir),
    });
  }
  return buildMultiModelDevelopmentPanelQualification({
    lockSha256: await lockDigest(args.lockPath),
    localPi,
    resources: resources as MultiModelDevelopmentPanelQualification["resources"],
    routes: routes as MultiModelDevelopmentPanelQualification["routes"],
  });
}

async function runQualificationBounded(
  args: MultiModelDevelopmentPanelRunArgs,
  plan: MultiModelDevelopmentPanelPlan,
  env: Record<string, string | undefined>,
): Promise<MultiModelDevelopmentPanelQualificationV2 | MultiModelDevelopmentPanelQualificationV3 | MultiModelDevelopmentPanelQualificationV4> {
  for (const item of plan.runArgs) assertRequiredEnv(item, env);
  const node = Bun.which(plan.lock.harness.nodeCommand);
  if (!node) throw new Error("Multi-model qualification Node executable unavailable");
  const version = await runCommandWithTimeout([
    node, path.resolve(args.rootDir, plan.lock.harness.piCli.path), "--version",
  ], 30_000, env);
  const observedVersion = version.stdout.trim() || version.stderr.trim();
  const localPi = {
    status: version.exitCode === 0 && !version.timedOut && observedVersion === plan.lock.harness.adapterVersion
      ? "passed" as const : "failed" as const,
    observedVersion,
  };
  const resources = [] as MultiModelDevelopmentPanelQualificationV2["resources"][number][];
  for (const panelCase of plan.lock.cases) {
    const contract = ResourceContractSchema.parse(JSON.parse(await readFile(
      plan.caseInputs[panelCase.skillId]!.resourceContractPath, "utf8",
    )));
    const result = await runResourceProbe(contract, { env });
    resources.push({ skillId: panelCase.skillId, status: result.status });
  }
  const routes = [] as MultiModelDevelopmentPanelQualificationV2["routes"][number][];
  for (const model of plan.lock.models) {
    const attempts: Array<{ candidate: 1 | 2; classification: ExecutionEnvelope["classification"]; outputsPresent: boolean }> = [];
    for (const candidate of [1, 2] as const) {
      if (candidate === 2) {
        const decision = selectMultiModelQualificationAttempt(attempts);
        const first = attempts[0]!;
        if (decision.passed || !first || !first.classification
          || !["transport-transient", "empty-terminal", "pre-semantic-idle-timeout"].includes(first.classification)) break;
      }
      const row = plan.modelRows.find((item) => item.modelFamily === model.family
        && item.system === plan.lock.qualification.system && item.runIndex === candidate
        && item.caseId.endsWith(`:${plan.lock.qualification.taskId}`));
      if (!row) throw new Error(`Multi-model qualification row missing: ${model.family}/${candidate}`);
      const executed = await executeModelRow(plan, row, { ...env, SKVM_AUTO_PROBE: "0" });
      attempts.push({
        candidate,
        classification: executed.envelope.classification,
        outputsPresent: await multiModelQualificationOutputsPresent(row.workDir),
      });
      if (attempts.at(-1)!.classification === "semantic-complete" && attempts.at(-1)!.outputsPresent) break;
      if (!["transport-transient", "empty-terminal", "pre-semantic-idle-timeout"].includes(attempts.at(-1)!.classification)) break;
    }
    const selection = plan.lock.schemaVersion.endsWith("/v4")
      ? selectMultiModelInfrastructureQualificationAttempt(attempts)
      : selectMultiModelQualificationAttempt(attempts);
    routes.push({
      family: model.family,
      route: model.route,
      attempts,
      selectedCandidate: selection.selectedCandidate,
      status: selection.passed ? "passed" : "failed",
    } as MultiModelDevelopmentPanelQualificationV2["routes"][number]);
  }
  const input = {
    lockSha256: await lockDigest(args.lockPath),
    localPi,
    resources: resources as MultiModelDevelopmentPanelQualificationV2["resources"],
    routes: routes as MultiModelDevelopmentPanelQualificationV2["routes"],
  };
  return plan.lock.schemaVersion.endsWith("/v4")
    ? buildMultiModelDevelopmentPanelQualificationV4(input)
    : plan.lock.schemaVersion.endsWith("/v3")
      ? buildMultiModelDevelopmentPanelQualificationV3(input)
      : buildMultiModelDevelopmentPanelQualificationV2(input);
}

async function executeModelMatrix(
  plan: MultiModelDevelopmentPanelPlan,
  env: Record<string, string | undefined>,
) {
  const rawRows: RawAgentRunRow[] = [];
  const selectedCells: Array<{ modelFamily: string; skillId: string; taskId: string; candidateBlock: number }> = [];
  const executed = await executeMultiModelPanelCells({
    cells: plan.lock.models.flatMap((model) => plan.lock.cases.flatMap((panelCase) =>
      panelCase.taskIds.map((taskId) => ({ modelFamily: model.family, skillId: panelCase.skillId, taskId })))),
    systems: plan.lock.matrix.modelSystems,
    targetBlocksPerCell: plan.lock.matrix.targetBlocksPerCell,
    reserveBlocksPerCell: plan.lock.matrix.reserveBlocksPerCell,
    executeBlock: async (cell, candidateBlock) => {
      const { modelFamily: family, skillId, taskId } = cell;
      const rows = plan.modelRows.filter((row) => row.modelFamily === family
        && row.caseId.startsWith(`${skillId}:`) && row.caseId.endsWith(`:${taskId}`)
        && row.runIndex === candidateBlock);
      const envelopes: ExecutionEnvelope[] = [];
      for (const system of plan.lock.matrix.modelSystems) {
        const row = rows.find((item) => item.system === system);
        if (!row) throw new Error(`Multi-model execution arm missing: ${family}/${skillId}/${taskId}/${candidateBlock}/${system}`);
        const executed = await executeModelRow(plan, row, env);
        rawRows.push(executed.raw);
        envelopes.push(executed.envelope);
      }
      return envelopes;
    },
  });
  for (const item of executed.cells) {
    for (const block of item.selection.selectedBlocks) {
      selectedCells.push({ ...item.cell, candidateBlock: block.candidateBlock });
    }
  }
  return {
    rawRows,
    envelopes: executed.envelopes,
    selectedCells,
    selection: executed.cells.map((item) => ({ cell: item.cell, ...item.selection })),
  };
}

export type MultiModelPanelCell = { modelFamily: string; skillId: string; taskId: string };

export async function executeMultiModelPanelCells(input: {
  cells: MultiModelPanelCell[];
  systems: readonly string[];
  targetBlocksPerCell: number;
  reserveBlocksPerCell: number;
  executeBlock: (cell: MultiModelPanelCell, candidateBlock: number) => Promise<ExecutionEnvelope[]>;
}): Promise<{
  cells: Array<{ cell: MultiModelPanelCell; selection: MatchedExecutionBlockSelection }>;
  envelopes: ExecutionEnvelope[];
}> {
  const cells: Array<{ cell: MultiModelPanelCell; selection: MatchedExecutionBlockSelection }> = [];
  const envelopes: ExecutionEnvelope[] = [];
  for (const cell of input.cells) {
    const result = await executeMatchedExecutionBlocks({
      taskIds: [cell.taskId],
      systems: input.systems,
      targetBlocksPerTask: input.targetBlocksPerCell,
      reserveBlocksPerTask: input.reserveBlocksPerCell,
      executeBlock: async (_taskId, block) => input.executeBlock(cell, block),
    });
    envelopes.push(...result.envelopes);
    const { envelopes: _ignored, ...selection } = result;
    cells.push({ cell, selection });
  }
  return { cells, envelopes };
}

function assertContained(root: string, relativePath: string): string {
  const safe = parseSafeRelativePath(relativePath);
  const target = path.resolve(root, safe);
  const relative = path.relative(path.resolve(root), target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Multi-model artifact fixture escapes workdir: ${relativePath}`);
  }
  return target;
}

async function executeArtifacts(
  plan: MultiModelDevelopmentPanelPlan,
  env: Record<string, string | undefined>,
): Promise<RawAgentRunRow[]> {
  const rows: RawAgentRunRow[] = [];
  for (const row of plan.artifactRows) {
    await rm(row.workDir, { recursive: true, force: true });
    await mkdir(row.workDir, { recursive: true });
    const task = JSON.parse(await readFile(row.taskPath, "utf8")) as SkvmTaskJson;
    for (const [relativePath, content] of Object.entries(task.fixtures ?? {})) {
      const target = assertContained(row.workDir, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    const initialWorkdirManifest = await writeInitialWorkdirManifest({
      workDir: row.workDir,
      manifestPath: path.join(path.dirname(row.workDir), "initial-workdir-manifest.json"),
    });
    const packageRecord = Object.values(plan.packages).find((item) => item.packageDir === row.artifactPackageDir);
    if (!packageRecord) throw new Error(`Multi-model artifact package missing: ${row.artifactPackageDir}`);
    const startedAt = performance.now();
    const runtime = await runValidatedArtifactPlan({ package: packageRecord, workDir: row.workDir, env });
    const infrastructureFailure = runtime.status === "infrastructure-failure";
    rows.push({
      caseId: row.caseId, system: row.system, model: row.model, modelFamily: row.modelFamily,
      adapter: row.adapter, adapterVersion: row.adapterVersion, runIndex: row.runIndex,
      panelConfigId: row.panelConfigId, taskPath: row.taskPath, workDir: row.workDir,
      initialWorkdirManifest, exitCode: runtime.status === "complete" ? 0 : 1,
      runStatus: infrastructureFailure ? "adapter-crashed" : "ok",
      durationMs: Math.round(performance.now() - startedAt),
      stdout: "final output: validated artifact direct execution complete",
      stderr: infrastructureFailure ? "validated artifact infrastructure failure" : "",
      successSource: "execution-only", validatedArtifactRuntime: runtime,
    });
  }
  return rows;
}

async function readTasks(plan: MultiModelDevelopmentPanelPlan): Promise<SkillIRBenchmarkTask[]> {
  const tasks: SkillIRBenchmarkTask[] = [];
  for (const panelCase of plan.lock.cases) {
    const registry = JSON.parse(await readFile(plan.caseInputs[panelCase.skillId]!.tasksPath, "utf8")) as {
      tasks: SkillIRBenchmarkTask[];
    };
    tasks.push(...registry.tasks.filter((item) => panelCase.taskIds.includes(item.id as never)));
  }
  return tasks;
}

export async function runMultiModelDevelopmentPanel(
  args: MultiModelDevelopmentPanelRunArgs,
  env: Record<string, string | undefined> = process.env,
): Promise<unknown> {
  await mkdir(args.outDir, { recursive: true });
  const plan = await buildMultiModelDevelopmentPanelPlan(args);
  const projection = {
    schemaVersion: plan.schemaVersion,
    experimentId: plan.experimentId,
    methodEvidence: plan.methodEvidence,
    candidateModelRows: plan.modelRows.length,
    sharedArtifactRows: plan.artifactRows.length,
    modelRows: plan.modelRows,
    artifactRows: plan.artifactRows,
  };
  await writeJson(path.join(args.outDir, "plan.json"), projection);
  if (args.phase === "plan") return projection;
  if (args.phase === "qualification") {
    const qualification = !plan.lock.schemaVersion.endsWith("/v1")
      ? await runQualificationBounded(args, plan, env)
      : await runQualification(args, plan, env);
    await writeJson(path.join(args.outDir, "qualification.json"), qualification);
    return qualification;
  }
  const qualificationInput = JSON.parse(await readFile(path.join(args.outDir, "qualification.json"), "utf8"));
  const qualification = plan.lock.schemaVersion.endsWith("/v4")
    ? MultiModelDevelopmentPanelQualificationV4Schema.parse(qualificationInput)
    : plan.lock.schemaVersion.endsWith("/v3")
      ? MultiModelDevelopmentPanelQualificationV3Schema.parse(qualificationInput)
      : plan.lock.schemaVersion.endsWith("/v2")
      ? MultiModelDevelopmentPanelQualificationV2Schema.parse(qualificationInput)
      : MultiModelDevelopmentPanelQualificationSchema.parse(qualificationInput);
  if (qualification.status !== "passed" || qualification.lockSha256 !== await lockDigest(args.lockPath)) {
    throw new Error("Multi-model panel qualification is absent, failed, or stale");
  }
  const childEnv = { ...env, SKVM_AUTO_PROBE: "0" };
  for (const item of plan.runArgs) assertRequiredEnv(item, childEnv);
  const execution = await executeModelMatrix(plan, childEnv);
  const selectedRaw = selectMultiModelPanelRawRowsForScoring({
    rawRows: execution.rawRows,
    envelopes: execution.envelopes,
    selectedCells: execution.selectedCells,
  });
  const artifactRaw = await executeArtifacts(plan, childEnv);
  const tasks = await readTasks(plan);
  const taskById = new Map(tasks.map((item) => [item.id, item]));
  const scoredRows = await scoreRawRunRows([...selectedRaw, ...artifactRaw], taskById);
  const report = buildMultiModelDevelopmentPanelReport({
    lock: plan.lock,
    qualificationPassed: true,
    tasks: tasks.map((item) => ({ id: item.id, hardGateIds: item.hardGateIds ?? [] })),
    envelopes: execution.envelopes,
    scoredRows,
  });
  await Promise.all([
    writeJsonl(path.join(args.outDir, "all-attempt-raw-runs.jsonl"), execution.rawRows),
    writeJsonl(path.join(args.outDir, "execution-envelopes.jsonl"), execution.envelopes),
    writeJsonl(
      path.join(args.outDir, "selected-scored-runs.jsonl"),
      sanitizeMultiModelPanelScoredRows(scoredRows),
    ),
    writeJson(path.join(args.outDir, "panel-report.json"), report),
  ]);
  return report;
}

if (import.meta.main) {
  runMultiModelDevelopmentPanel(parseMultiModelDevelopmentPanelRunArgs(process.argv.slice(2)))
    .then((result) => {
      const status = typeof result === "object" && result !== null && "status" in result
        ? String(result.status) : "planned";
      console.log(JSON.stringify({ status }, null, 2));
      if (status === "failed" || status === "blocked") process.exitCode = 1;
    })
    .catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
}
