import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  buildStaticDevelopmentPlan,
  type StaticDevelopmentLock,
  type StaticDevelopmentPlan,
} from "./static-development";
import { executePlan } from "./real-agent-run";
import {
  classifyProbeExecution,
  runCommandWithTimeout,
  type ProbeExecution,
} from "./route-probe";
import { runResourceProbeFile } from "./resource-contract-run";
import type { ResourceProbeResult } from "./resource-contract";
import { sha256Bytes } from "./source-fixture";

export type StaticDevelopmentPhase = "plan" | "route-probe" | "execute";

export type StaticDevelopmentRunArgs = {
  rootDir: string;
  lockPath: string;
  outDir: string;
  phase: StaticDevelopmentPhase;
};

export const StaticRouteProbeResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-static-route-probe-result/v1"),
  experimentId: z.string().min(1),
  methodEvidence: z.literal(false),
  lockSha256: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string().min(1),
  caseId: z.string().min(1),
  system: z.literal("original"),
  status: z.enum(["ok", "timeout", "infrastructure", "agent"]),
  exitCode: z.number().int().optional(),
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
}).strict();

export type StaticRouteProbeResult = z.infer<typeof StaticRouteProbeResultSchema>;

export function parseStaticDevelopmentRunArgs(argv: string[]): StaticDevelopmentRunArgs {
  const args: Partial<StaticDevelopmentRunArgs> = { rootDir: process.cwd() };
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) args.rootDir = arg.slice("--root-dir=".length);
    else if (arg.startsWith("--lock=")) args.lockPath = arg.slice("--lock=".length);
    else if (arg.startsWith("--out-dir=")) args.outDir = arg.slice("--out-dir=".length);
    else if (arg.startsWith("--phase=")) {
      const phase = arg.slice("--phase=".length);
      if (phase !== "plan" && phase !== "route-probe" && phase !== "execute") {
        throw new Error("--phase must be plan, route-probe, or execute");
      }
      args.phase = phase;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.lockPath) throw new Error("--lock is required");
  if (!args.outDir) throw new Error("--out-dir is required");
  if (!args.phase) throw new Error("--phase is required");
  return args as StaticDevelopmentRunArgs;
}

function serializablePlan(result: StaticDevelopmentPlan): Record<string, unknown> {
  return {
    ...result,
    runArgs: {
      ...result.runArgs,
      skills: result.runArgs.skills ? [...result.runArgs.skills] : undefined,
      systems: result.runArgs.systems ? [...result.runArgs.systems] : undefined,
      contexts: result.runArgs.contexts ? [...result.runArgs.contexts] : undefined,
      agents: result.runArgs.agents ? [...result.runArgs.agents] : undefined,
      environments: result.runArgs.environments ? [...result.runArgs.environments] : undefined,
      tasks: result.runArgs.tasks ? [...result.runArgs.tasks] : undefined,
      requireEnv: result.runArgs.requireEnv ? [...result.runArgs.requireEnv] : undefined,
    },
  };
}

function expectedProbeCaseId(lock: StaticDevelopmentLock): string {
  return [
    lock.skillId,
    lock.matrix.agents[0],
    lock.matrix.environments[0],
    lock.matrix.contexts[0],
    lock.matrix.taskIds[0],
  ].join(":");
}

export function compactStaticRouteProbe(input: {
  experimentId: string;
  lockSha256: string;
  model: string;
  caseId: string;
  execution: ProbeExecution;
}): StaticRouteProbeResult {
  return StaticRouteProbeResultSchema.parse({
    schemaVersion: "skill-ir-static-route-probe-result/v1",
    experimentId: input.experimentId,
    methodEvidence: false,
    lockSha256: input.lockSha256,
    model: input.model,
    caseId: input.caseId,
    system: "original",
    status: classifyProbeExecution(input.execution),
    ...(input.execution.exitCode !== undefined ? { exitCode: input.execution.exitCode } : {}),
    timedOut: input.execution.timedOut,
    ...(input.execution.durationMs !== undefined ? { durationMs: input.execution.durationMs } : {}),
  });
}

export function assertStaticProbeEvidence(
  lock: StaticDevelopmentLock,
  resource: ResourceProbeResult,
  route: StaticRouteProbeResult,
  expectedLockSha256: string,
): void {
  if (resource.methodEvidence !== false || resource.status !== "ok") {
    throw new Error("Static development resource probe did not pass");
  }
  if (
    route.methodEvidence !== false
    || route.status !== "ok"
    || route.lockSha256 !== expectedLockSha256
    || route.experimentId !== lock.experimentId
    || route.model !== lock.model.route
    || route.system !== "original"
    || route.caseId !== expectedProbeCaseId(lock)
  ) {
    throw new Error("Static development route probe identity or status mismatch");
  }
}

export function assertStaticExecutionPrerequisites(
  lock: StaticDevelopmentLock,
  resource: ResourceProbeResult,
  route: StaticRouteProbeResult,
  env: Record<string, string | undefined>,
  expectedLockSha256: string,
): void {
  if (!env[lock.runtime.apiKeyEnv]?.trim()) {
    throw new Error(`Static development API key env ${lock.runtime.apiKeyEnv} is missing`);
  }
  assertStaticProbeEvidence(lock, resource, route, expectedLockSha256);
}

async function writePlan(result: StaticDevelopmentPlan, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const planPath = path.join(outDir, "plan.json");
  await writeFile(planPath, `${JSON.stringify(serializablePlan(result), null, 2)}\n`, "utf8");
  return planPath;
}

async function runResourcePreflight(
  result: StaticDevelopmentPlan,
  outDir: string,
): Promise<ResourceProbeResult> {
  const relativeOut = path.relative(result.runArgs.rootDir, path.join(outDir, "resource-probe.json"))
    .replaceAll("\\", "/");
  return runResourceProbeFile({
    rootDir: result.runArgs.rootDir,
    contract: result.lock.frozenInputs.resourceContract.path,
    out: relativeOut,
  });
}

export async function runStaticDevelopmentPhase(
  args: StaticDevelopmentRunArgs,
): Promise<Record<string, unknown>> {
  const outDir = path.isAbsolute(args.outDir) ? path.resolve(args.outDir) : path.resolve(args.rootDir, args.outDir);
  const lockFilePath = path.isAbsolute(args.lockPath)
    ? path.resolve(args.lockPath)
    : path.resolve(args.rootDir, args.lockPath);
  const lockSha256 = sha256Bytes(await readFile(lockFilePath));
  const result = await buildStaticDevelopmentPlan({
    ...args,
    outDir: path.join(outDir, "run"),
    execute: args.phase === "execute",
  });
  const planPath = await writePlan(result, outDir);
  if (args.phase === "plan") {
    return { experimentId: result.experimentId, phase: args.phase, rows: result.plan.length, planPath };
  }

  const resource = await runResourcePreflight(result, outDir);
  if (args.phase === "route-probe") {
    if (!process.env[result.lock.runtime.apiKeyEnv]?.trim()) {
      throw new Error(`Static development API key env ${result.lock.runtime.apiKeyEnv} is missing`);
    }
    if (resource.status !== "ok") throw new Error("Static development resource probe did not pass");
    const entry = result.plan.find((row) =>
      row.system === "original"
      && row.caseId === expectedProbeCaseId(result.lock)
      && row.runIndex === 1);
    if (!entry) throw new Error("Static development route probe plan entry is missing");
    const execution = await runCommandWithTimeout(entry.command, result.lock.runtime.routeProbeTimeoutMs);
    const route = compactStaticRouteProbe({
      experimentId: result.experimentId,
      lockSha256,
      model: result.lock.model.route,
      caseId: entry.caseId,
      execution,
    });
    const routePath = path.join(outDir, "route-probe.json");
    await writeFile(routePath, `${JSON.stringify(route, null, 2)}\n`, "utf8");
    if (route.status !== "ok") throw new Error(`Static development route probe failed: ${route.status}`);
    return { experimentId: result.experimentId, phase: args.phase, resource, route, routePath };
  }

  const route = StaticRouteProbeResultSchema.parse(JSON.parse(
    await readFile(path.join(outDir, "route-probe.json"), "utf8"),
  ));
  assertStaticExecutionPrerequisites(result.lock, resource, route, process.env, lockSha256);
  await executePlan(result.plan, result.runArgs);
  return {
    experimentId: result.experimentId,
    phase: args.phase,
    rows: result.plan.length,
    rawPath: path.join(result.runArgs.outDir, "raw-runs.jsonl"),
  };
}

if (import.meta.main) {
  runStaticDevelopmentPhase(parseStaticDevelopmentRunArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
