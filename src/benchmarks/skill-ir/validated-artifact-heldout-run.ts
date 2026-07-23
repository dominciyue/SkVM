import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseSafeRelativePath, Sha256Schema } from "./artifact-package";
import {
  buildValidatedArtifactHeldoutPlan,
  type ValidatedArtifactHeldoutLock,
  type ValidatedArtifactHeldoutPlan,
  type ValidatedArtifactHeldoutPlanEntry,
} from "./validated-artifact-heldout";
import {
  buildValidatedArtifactHeldoutGateReport,
  type ValidatedArtifactHeldoutGateReport,
} from "./validated-artifact-heldout-gate";
import { executePlan } from "./real-agent-run";
import {
  classifyProbeExecution,
  runCommandWithTimeout,
  type ProbeExecution,
} from "./route-probe";
import { ResourceContractSchema, runResourceProbe, type ResourceProbeResult } from "./resource-contract";
import {
  scoreRawRunRows,
  type RawAgentRunRow,
  type ScoredAgentRunRow,
} from "./scoring";
import type { SkillIRBenchmarkTask, SkvmTaskJson } from "./real-agent";
import { sha256Bytes } from "./source-fixture";
import { runValidatedArtifactPlan } from "./validated-artifact-runtime";

export type ValidatedArtifactHeldoutPhase = "plan" | "route-probe" | "execute";

export type ValidatedArtifactHeldoutRunArgs = {
  rootDir: string;
  lockPath: string;
  outDir: string;
  phase: ValidatedArtifactHeldoutPhase;
};

export const ValidatedArtifactHeldoutRouteProbeSchema = z.object({
  schemaVersion: z.literal("skill-ir-validated-artifact-heldout-route-probe-result/v1"),
  experimentId: z.literal("law-to-markdown-validated-artifact-heldout-v1"),
  methodEvidence: z.literal(false),
  evidenceClass: z.literal("route-health"),
  heldoutLockSha256: Sha256Schema,
  executionFreezeSha256: Sha256Schema,
  model: z.literal("xty/gpt-5.6-sol"),
  caseId: z.string().min(1),
  system: z.literal("original"),
  status: z.enum(["ok", "timeout", "infrastructure", "agent"]),
  exitCode: z.number().int().optional(),
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
}).strict();

export type ValidatedArtifactHeldoutRouteProbe = z.infer<
  typeof ValidatedArtifactHeldoutRouteProbeSchema
>;

type TaskRegistry = {
  skillId: string;
  tasks: SkillIRBenchmarkTask[];
};

function requiredArg(argv: string[], name: string, fallback?: string): string {
  const prefix = `--${name}=`;
  const value = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

export function parseValidatedArtifactHeldoutRunArgs(
  argv: string[],
): ValidatedArtifactHeldoutRunArgs {
  const known = new Set(["root-dir", "lock", "out-dir", "phase"]);
  for (const arg of argv) {
    const name = arg.startsWith("--") ? (arg.slice(2).split("=", 1)[0] ?? "") : "";
    if (!known.has(name)) throw new Error(`Unknown argument: ${arg}`);
  }
  const rootDir = path.resolve(requiredArg(argv, "root-dir", process.cwd()));
  const phase = requiredArg(argv, "phase");
  if (phase !== "plan" && phase !== "route-probe" && phase !== "execute") {
    throw new Error("--phase must be plan, route-probe, or execute");
  }
  return {
    rootDir,
    lockPath: path.resolve(rootDir, requiredArg(
      argv,
      "lock",
      "benchmarks/skill-ir/pilots/law-to-markdown/"
        + "law-to-markdown-validated-artifact-heldout-lock.json",
    )),
    outDir: path.resolve(rootDir, requiredArg(argv, "out-dir")),
    phase,
  };
}

function expectedProbeCaseId(lock: ValidatedArtifactHeldoutLock): string {
  return [
    lock.skillId,
    lock.matrix.agents[0],
    lock.matrix.environments[0],
    lock.matrix.contexts[0],
    lock.matrix.taskIds[0],
  ].join(":");
}

export function compactValidatedArtifactHeldoutRouteProbe(input: {
  experimentId: string;
  heldoutLockSha256: string;
  executionFreezeSha256: string;
  model: string;
  caseId: string;
  execution: ProbeExecution;
}): ValidatedArtifactHeldoutRouteProbe {
  return ValidatedArtifactHeldoutRouteProbeSchema.parse({
    schemaVersion: "skill-ir-validated-artifact-heldout-route-probe-result/v1",
    experimentId: input.experimentId,
    methodEvidence: false,
    evidenceClass: "route-health",
    heldoutLockSha256: input.heldoutLockSha256,
    executionFreezeSha256: input.executionFreezeSha256,
    model: input.model,
    caseId: input.caseId,
    system: "original",
    status: classifyProbeExecution(input.execution),
    ...(input.execution.exitCode !== undefined ? { exitCode: input.execution.exitCode } : {}),
    timedOut: input.execution.timedOut,
    ...(input.execution.durationMs !== undefined ? { durationMs: input.execution.durationMs } : {}),
  });
}

export function assertValidatedArtifactHeldoutPrerequisites(opts: {
  lock: ValidatedArtifactHeldoutLock;
  resource: ResourceProbeResult;
  route: ValidatedArtifactHeldoutRouteProbe;
  env: Record<string, string | undefined>;
  heldoutLockSha256: string;
}): void {
  if (!opts.env[opts.lock.runtime.apiKeyEnv]?.trim()) {
    throw new Error(`Validated artifact held-out API key env ${opts.lock.runtime.apiKeyEnv} is missing`);
  }
  if (opts.resource.methodEvidence !== false || opts.resource.status !== "ok") {
    throw new Error("Validated artifact held-out resource probe did not pass");
  }
  if (
    opts.route.status !== "ok"
    || opts.route.experimentId !== opts.lock.experimentId
    || opts.route.heldoutLockSha256 !== opts.heldoutLockSha256
    || opts.route.executionFreezeSha256 !== opts.lock.upstream.executionFreeze.sha256
    || opts.route.model !== opts.lock.model.route
    || opts.route.caseId !== expectedProbeCaseId(opts.lock)
    || opts.route.system !== "original"
  ) {
    throw new Error("Validated artifact held-out route probe identity or status mismatch");
  }
}

function assertContained(root: string, relativePath: string): string {
  const safe = parseSafeRelativePath(relativePath);
  const destination = path.resolve(root, safe);
  const relative = path.relative(path.resolve(root), destination);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Held-out fixture escapes workdir: ${relativePath}`);
  }
  return destination;
}

async function materializeFixtures(row: ValidatedArtifactHeldoutPlanEntry): Promise<void> {
  await rm(row.workDir, { recursive: true, force: true });
  await mkdir(row.workDir, { recursive: true });
  const task = JSON.parse(await readFile(row.taskPath, "utf8")) as SkvmTaskJson;
  for (const [relativePath, content] of Object.entries(task.fixtures ?? {})) {
    const destination = assertContained(row.workDir, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
}

async function executeDirectRows(opts: {
  plan: ValidatedArtifactHeldoutPlan;
  env: Record<string, string | undefined>;
}): Promise<{ rawRows: RawAgentRunRow[]; scoredRows: ScoredAgentRunRow[] }> {
  const rows = opts.plan.plan.filter((row) => row.executionClass === "direct-deterministic");
  if (rows.length !== opts.plan.lock.matrix.expectedArtifactRows) {
    throw new Error("Validated artifact held-out direct row count drift");
  }
  const rawRows: RawAgentRunRow[] = [];
  for (const row of rows) {
    await materializeFixtures(row);
    const startedAt = performance.now();
    const runtime = await runValidatedArtifactPlan({
      package: opts.plan.package,
      workDir: row.workDir,
      env: opts.env,
    });
    const infrastructure = runtime.status === "infrastructure-failure";
    rawRows.push({
      caseId: row.caseId,
      system: row.system,
      model: row.model,
      modelFamily: row.modelFamily,
      adapter: row.adapter,
      adapterVersion: row.adapterVersion,
      runIndex: row.runIndex,
      panelConfigId: row.panelConfigId,
      taskPath: row.taskPath,
      workDir: row.workDir,
      exitCode: runtime.status === "complete" ? 0 : 1,
      ...(infrastructure ? { runStatus: "adapter-crashed" as const } : {}),
      durationMs: Math.round(performance.now() - startedAt),
      stdout: "final output: validated artifact held-out direct execution complete",
      stderr: "",
      successSource: "execution-only",
      validatedArtifactRuntime: runtime,
    });
  }
  const taskSet = JSON.parse(await readFile(
    path.resolve(opts.plan.modelRunArgs.rootDir, opts.plan.lock.frozenInputs.tasks.path),
    "utf8",
  )) as TaskRegistry;
  const taskById = new Map(taskSet.tasks.map((task) => [task.id, task]));
  return { rawRows, scoredRows: await scoreRawRunRows(rawRows, taskById) };
}

function toGateTasks(tasks: SkillIRBenchmarkTask[]) {
  return tasks.map((task) => {
    if (!Array.isArray(task.hardGateIds)) {
      throw new Error(`Validated artifact held-out task ${task.id} omits hardGateIds`);
    }
    return { id: task.id, split: task.split, hardGateIds: task.hardGateIds };
  });
}

async function runResourcePreflight(
  rootDir: string,
  plan: ValidatedArtifactHeldoutPlan,
): Promise<ResourceProbeResult> {
  const contract = ResourceContractSchema.parse(JSON.parse(await readFile(
    path.resolve(rootDir, plan.lock.frozenInputs.resourceContract.path),
    "utf8",
  )));
  return runResourceProbe(contract, { env: process.env });
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath: string, rows: unknown[]): Promise<void> {
  await writeFile(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8"))
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function planSummary(plan: ValidatedArtifactHeldoutPlan) {
  return {
    schemaVersion: plan.schemaVersion,
    experimentId: plan.experimentId,
    methodEvidence: plan.methodEvidence,
    count: plan.plan.length,
    modelRows: plan.plan.filter((row) => row.executionClass === "model-agent").length,
    artifactRows: plan.plan.filter((row) => row.executionClass === "direct-deterministic").length,
    plan: plan.plan,
  };
}

function compactSummary(report: ValidatedArtifactHeldoutGateReport) {
  return {
    schemaVersion: "skill-ir-validated-artifact-heldout-summary/v1",
    experimentId: report.experimentId,
    evidenceClass: report.evidenceClass,
    counts: report.counts,
    systems: report.systems,
    artifactTaskMeanScores: report.artifactTaskMeanScores,
    cost: report.cost,
    gate: report.gate,
    permitsCrossSkillClaim: false,
    permitsBreakEvenClaim: false,
  };
}

export async function runValidatedArtifactHeldoutPhase(
  args: ValidatedArtifactHeldoutRunArgs,
): Promise<Record<string, unknown>> {
  await mkdir(args.outDir, { recursive: true });
  const heldoutLockSha256 = sha256Bytes(await readFile(args.lockPath));
  const plan = await buildValidatedArtifactHeldoutPlan({
    rootDir: args.rootDir,
    lockPath: args.lockPath,
    outDir: path.join(args.outDir, "run"),
  });
  const planPath = path.join(args.outDir, "plan.json");
  await writeJson(planPath, planSummary(plan));
  if (args.phase === "plan") {
    return { experimentId: plan.experimentId, phase: args.phase, rows: plan.plan.length, planPath };
  }

  const resource = await runResourcePreflight(args.rootDir, plan);
  await writeJson(path.join(args.outDir, "resource-probe.json"), resource);
  if (!process.env[plan.lock.runtime.apiKeyEnv]?.trim()) {
    throw new Error(`Validated artifact held-out API key env ${plan.lock.runtime.apiKeyEnv} is missing`);
  }
  if (resource.status !== "ok") {
    throw new Error("Validated artifact held-out resource probe did not pass");
  }

  if (args.phase === "route-probe") {
    const row = plan.plan.find((candidate) =>
      candidate.executionClass === "model-agent"
      && candidate.system === "original"
      && candidate.caseId === expectedProbeCaseId(plan.lock)
      && candidate.runIndex === 1);
    if (!row) throw new Error("Validated artifact held-out route row missing");
    const execution = await runCommandWithTimeout(row.command, plan.lock.runtime.routeProbeTimeoutMs);
    const route = compactValidatedArtifactHeldoutRouteProbe({
      experimentId: plan.experimentId,
      heldoutLockSha256,
      executionFreezeSha256: plan.lock.upstream.executionFreeze.sha256,
      model: plan.lock.model.route,
      caseId: row.caseId,
      execution,
    });
    const routePath = path.join(args.outDir, "route-probe.json");
    await writeJson(routePath, route);
    if (route.status !== "ok") {
      throw new Error(`Validated artifact held-out route probe failed: ${route.status}`);
    }
    return { experimentId: plan.experimentId, phase: args.phase, resource, route, routePath };
  }

  const route = ValidatedArtifactHeldoutRouteProbeSchema.parse(JSON.parse(await readFile(
    path.join(args.outDir, "route-probe.json"),
    "utf8",
  )));
  assertValidatedArtifactHeldoutPrerequisites({
    lock: plan.lock,
    resource,
    route,
    env: process.env,
    heldoutLockSha256,
  });
  const modelRows = plan.plan.filter((row) => row.executionClass === "model-agent");
  await executePlan(modelRows, {
    ...plan.modelRunArgs,
    execute: true,
    outDir: path.join(args.outDir, "run"),
  });
  const modelRawRows = await readJsonl<RawAgentRunRow>(
    path.join(args.outDir, "run", "raw-runs.jsonl"),
  );
  if (modelRawRows.length !== plan.lock.matrix.expectedModelRows) {
    throw new Error("Validated artifact held-out model raw row count drift");
  }
  const taskSet = JSON.parse(await readFile(
    path.resolve(args.rootDir, plan.lock.frozenInputs.tasks.path),
    "utf8",
  )) as TaskRegistry;
  const taskById = new Map(taskSet.tasks.map((task) => [task.id, task]));
  const modelScoredRows = await scoreRawRunRows(modelRawRows, taskById);
  const direct = await executeDirectRows({ plan, env: process.env });
  const rawRows = [...modelRawRows, ...direct.rawRows];
  const scoredRows = [...modelScoredRows, ...direct.scoredRows];
  const gate = buildValidatedArtifactHeldoutGateReport({
    lock: plan.lock,
    tasks: toGateTasks(taskSet.tasks),
    rawRows,
    scoredRows,
  });
  await Promise.all([
    writeJsonl(path.join(args.outDir, "raw-runs.jsonl"), rawRows),
    writeJsonl(path.join(args.outDir, "scored-results.jsonl"), scoredRows),
    writeJson(path.join(args.outDir, "gate-report.json"), gate),
    writeJson(path.join(args.outDir, "summary.json"), compactSummary(gate)),
  ]);
  return {
    experimentId: plan.experimentId,
    phase: args.phase,
    rows: rawRows.length,
    gatePassed: gate.gate.passed,
    gatePath: path.join(args.outDir, "gate-report.json"),
  };
}

if (import.meta.main) {
  runValidatedArtifactHeldoutPhase(parseValidatedArtifactHeldoutRunArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
