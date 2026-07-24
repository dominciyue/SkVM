import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  readAndValidateBaselineCalibrationLock,
  type BaselineCalibrationLock,
} from "./baseline-calibration";
import {
  buildPlan,
  executePlan,
  type RealAgentRunArgs,
} from "./real-agent-run";
import type { RealAgentRunPlanEntry } from "./real-agent";
import {
  classifyProbeExecution,
  runCommandWithTimeout,
  type ProbeExecution,
} from "./route-probe";
import { runResourceProbeFile } from "./resource-contract-run";
import type { ResourceProbeResult } from "./resource-contract";
import { Sha256Schema } from "./artifact-package";
import { sha256Bytes } from "./source-fixture";

export type BaselineCalibrationPhase = "plan" | "route-probe" | "execute";

export type BaselineCalibrationRunArgs = {
  rootDir: string;
  lockPath: string;
  outDir: string;
  phase: BaselineCalibrationPhase;
};

export type BaselineCalibrationPlan = {
  schemaVersion: "skill-ir-baseline-calibration-plan/v1";
  calibrationId: string;
  methodEvidence: false;
  execute: boolean;
  lockPath: string;
  lockDigest: string;
  lock: BaselineCalibrationLock;
  runArgs: RealAgentRunArgs;
  plan: RealAgentRunPlanEntry[];
};

export const BaselineCalibrationRouteProbeResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-baseline-calibration-route-probe-result/v1"),
  calibrationId: z.string().min(1),
  lockDigest: Sha256Schema,
  methodEvidence: z.literal(false),
  model: z.string().min(1),
  caseId: z.string().min(1),
  system: z.literal("original"),
  status: z.enum(["ok", "timeout", "infrastructure", "agent"]),
  exitCode: z.number().int().optional(),
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
}).strict();

export type BaselineCalibrationRouteProbeResult = z.infer<
  typeof BaselineCalibrationRouteProbeResultSchema
>;

function resolveFromRoot(rootDir: string, value: string): string {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value);
}

function buildRunArgs(
  lock: BaselineCalibrationLock,
  rootDir: string,
  outDir: string,
  execute: boolean,
): RealAgentRunArgs {
  return {
    corpus: lock.corpus,
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.adapter.id,
    adapterVersion: lock.adapter.version,
    repetitions: lock.matrix.repetitions,
    panelConfigId: lock.calibrationId,
    outDir: path.join(outDir, "run"),
    limit: lock.matrix.expectedRows,
    execute,
    retries: lock.runtime.retries,
    retryDelayMs: 0,
    rootDir,
    allowTasksAuthored: false,
    allowDevelopmentReplay: false,
    allowArtifactDevelopmentReplay: false,
    skills: new Set([lock.skillId]),
    systems: new Set(lock.matrix.systems),
    contexts: new Set(lock.matrix.contexts),
    agents: new Set(lock.matrix.agents),
    environments: new Set(lock.matrix.environments),
    tasks: new Set(lock.matrix.taskIds),
    requireEnv: new Set([lock.runtime.apiKeyEnv]),
  };
}

export async function buildBaselineCalibrationPlan(
  opts: BaselineCalibrationRunArgs,
): Promise<BaselineCalibrationPlan> {
  const rootDir = path.resolve(opts.rootDir);
  const outDir = resolveFromRoot(rootDir, opts.outDir);
  const lockPath = resolveFromRoot(rootDir, opts.lockPath);
  const lockBytes = await readFile(lockPath);
  const lock = await readAndValidateBaselineCalibrationLock({ rootDir, lockPath });
  const runArgs = buildRunArgs(lock, rootDir, outDir, opts.phase === "execute");
  const plan = await buildPlan(runArgs);
  if (plan.length !== lock.matrix.expectedRows) {
    throw new Error(
      `Baseline calibration row mismatch: expected ${lock.matrix.expectedRows}, got ${plan.length}`,
    );
  }

  const pairs = new Map<string, Set<string>>();
  for (const row of plan) {
    if (
      !lock.matrix.systems.includes(row.system as "no-skill" | "original")
      || row.model !== lock.model.route
      || row.modelFamily !== lock.model.family
      || row.adapter !== lock.adapter.id
      || row.adapterVersion !== lock.adapter.version
      || row.panelConfigId !== lock.calibrationId
      || !lock.matrix.taskIds.some((taskId) => row.caseId.endsWith(`:${taskId}`))
      || !row.runIndex
      || row.runIndex < 1
      || row.runIndex > lock.matrix.repetitions
    ) {
      throw new Error("Baseline calibration plan identity drift");
    }
    const key = `${row.caseId}:${row.runIndex}`;
    const systems = pairs.get(key) ?? new Set<string>();
    systems.add(row.system);
    pairs.set(key, systems);
  }
  if (
    pairs.size !== lock.matrix.expectedPairs
    || [...pairs.values()].some((systems) =>
      systems.size !== lock.matrix.systems.length
      || lock.matrix.systems.some((system) => !systems.has(system)))
  ) {
    throw new Error("Baseline calibration plan does not contain complete pairs");
  }

  return {
    schemaVersion: "skill-ir-baseline-calibration-plan/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    execute: opts.phase === "execute",
    lockPath,
    lockDigest: sha256Bytes(lockBytes),
    lock,
    runArgs,
    plan,
  };
}

export function compactBaselineRouteProbe(input: {
  calibrationId: string;
  lockDigest: string;
  model: string;
  caseId: string;
  execution: ProbeExecution;
}): BaselineCalibrationRouteProbeResult {
  return BaselineCalibrationRouteProbeResultSchema.parse({
    schemaVersion: "skill-ir-baseline-calibration-route-probe-result/v1",
    calibrationId: input.calibrationId,
    lockDigest: input.lockDigest,
    methodEvidence: false,
    model: input.model,
    caseId: input.caseId,
    system: "original",
    status: classifyProbeExecution(input.execution),
    ...(input.execution.exitCode !== undefined ? { exitCode: input.execution.exitCode } : {}),
    timedOut: input.execution.timedOut,
    ...(input.execution.durationMs !== undefined ? { durationMs: input.execution.durationMs } : {}),
  });
}

function expectedProbeCaseId(lock: BaselineCalibrationLock): string {
  return [
    lock.skillId,
    lock.matrix.agents[0],
    lock.matrix.environments[0],
    lock.matrix.contexts[0],
    lock.matrix.taskIds[0],
  ].join(":");
}

export function assertBaselineProbeEvidence(
  lock: BaselineCalibrationLock,
  lockDigest: string,
  resource: ResourceProbeResult,
  route: BaselineCalibrationRouteProbeResult,
): void {
  if (resource.methodEvidence !== false || resource.status !== "ok") {
    throw new Error("Baseline calibration resource probe did not pass");
  }
  if (
    route.methodEvidence !== false
    || route.status !== "ok"
    || route.calibrationId !== lock.calibrationId
    || route.lockDigest !== lockDigest
    || route.model !== lock.model.route
    || route.system !== "original"
    || route.caseId !== expectedProbeCaseId(lock)
  ) {
    throw new Error("Baseline calibration route probe identity or status mismatch");
  }
}

export function assertBaselineExecutionPrerequisites(
  lock: BaselineCalibrationLock,
  lockDigest: string,
  resource: ResourceProbeResult,
  route: BaselineCalibrationRouteProbeResult,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!env[lock.runtime.apiKeyEnv]?.trim()) {
    throw new Error(`Baseline calibration API key env ${lock.runtime.apiKeyEnv} is missing`);
  }
  assertBaselineProbeEvidence(lock, lockDigest, resource, route);
}

function serializableRunArgs(args: RealAgentRunArgs): Record<string, unknown> {
  return {
    ...args,
    skills: args.skills ? [...args.skills] : undefined,
    systems: args.systems ? [...args.systems] : undefined,
    contexts: args.contexts ? [...args.contexts] : undefined,
    agents: args.agents ? [...args.agents] : undefined,
    environments: args.environments ? [...args.environments] : undefined,
    tasks: args.tasks ? [...args.tasks] : undefined,
    requireEnv: args.requireEnv ? [...args.requireEnv] : undefined,
  };
}

async function writePlan(result: BaselineCalibrationPlan, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const planPath = path.join(outDir, "plan.json");
  await writeFile(planPath, `${JSON.stringify({
    ...result,
    runArgs: serializableRunArgs(result.runArgs),
  }, null, 2)}\n`, "utf8");
  return planPath;
}

async function runResourcePreflight(
  result: BaselineCalibrationPlan,
  outDir: string,
): Promise<ResourceProbeResult> {
  return runResourceProbeFile({
    rootDir: result.runArgs.rootDir,
    contract: result.lock.frozenInputs.resourceContract.path,
    out: path.relative(
      result.runArgs.rootDir,
      path.join(outDir, "resource-probe.json"),
    ).replaceAll("\\", "/"),
  });
}

export async function runBaselineCalibrationPhase(
  opts: BaselineCalibrationRunArgs,
): Promise<Record<string, unknown>> {
  const result = await buildBaselineCalibrationPlan(opts);
  const outDir = resolveFromRoot(result.runArgs.rootDir, opts.outDir);
  const planPath = await writePlan(result, outDir);
  if (opts.phase === "plan") {
    return {
      calibrationId: result.calibrationId,
      phase: opts.phase,
      rows: result.plan.length,
      planPath,
    };
  }

  // Re-read the lock at the paid boundary so lifecycle and all digests are fresh.
  await readAndValidateBaselineCalibrationLock({
    rootDir: result.runArgs.rootDir,
    lockPath: result.lockPath,
  });
  const resource = await runResourcePreflight(result, outDir);
  if (opts.phase === "route-probe") {
    if (!process.env[result.lock.runtime.apiKeyEnv]?.trim()) {
      throw new Error(
        `Baseline calibration API key env ${result.lock.runtime.apiKeyEnv} is missing`,
      );
    }
    if (resource.status !== "ok") {
      throw new Error("Baseline calibration resource probe did not pass");
    }
    const entry = result.plan.find((row) =>
      row.system === "original"
      && row.caseId === expectedProbeCaseId(result.lock)
      && row.runIndex === 1);
    if (!entry) throw new Error("Baseline calibration route probe plan entry is missing");
    const execution = await runCommandWithTimeout(
      entry.command,
      result.lock.runtime.routeProbeTimeoutMs,
    );
    const route = compactBaselineRouteProbe({
      calibrationId: result.calibrationId,
      lockDigest: result.lockDigest,
      model: result.lock.model.route,
      caseId: entry.caseId,
      execution,
    });
    const routePath = path.join(outDir, "route-probe.json");
    await writeFile(routePath, `${JSON.stringify(route, null, 2)}\n`, "utf8");
    if (route.status !== "ok") {
      throw new Error(`Baseline calibration route probe failed: ${route.status}`);
    }
    return {
      calibrationId: result.calibrationId,
      phase: opts.phase,
      resource,
      route,
      routePath,
    };
  }

  const route = BaselineCalibrationRouteProbeResultSchema.parse(JSON.parse(
    await readFile(path.join(outDir, "route-probe.json"), "utf8"),
  ));
  assertBaselineExecutionPrerequisites(
    result.lock,
    result.lockDigest,
    resource,
    route,
  );
  await executePlan(result.plan, result.runArgs);
  return {
    calibrationId: result.calibrationId,
    phase: opts.phase,
    rows: result.plan.length,
    rawPath: path.join(result.runArgs.outDir, "raw-runs.jsonl"),
  };
}

export function parseBaselineCalibrationRunArgs(
  argv: string[],
): BaselineCalibrationRunArgs {
  let rootDir = process.cwd();
  let lockPath: string | undefined;
  let outDir: string | undefined;
  let phase: BaselineCalibrationPhase | undefined;
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = path.resolve(arg.slice("--root-dir=".length));
    else if (arg.startsWith("--lock=")) lockPath = arg.slice("--lock=".length);
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--phase=")) {
      const value = arg.slice("--phase=".length);
      if (value !== "plan" && value !== "route-probe" && value !== "execute") {
        throw new Error("--phase must be plan, route-probe, or execute");
      }
      phase = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!lockPath) throw new Error("--lock is required");
  if (!outDir) throw new Error("--out-dir is required");
  if (!phase) throw new Error("--phase is required");
  return { rootDir, lockPath, outDir, phase };
}

if (import.meta.main) {
  runBaselineCalibrationPhase(
    parseBaselineCalibrationRunArgs(process.argv.slice(2)),
  ).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
