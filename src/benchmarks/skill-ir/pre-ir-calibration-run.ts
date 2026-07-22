import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  assertPreIrCalibrationExecutionState,
  readAndValidatePreIrCalibrationLock,
  type PreIrCalibrationLock,
} from "./pre-ir-calibration.ts"
import {
  buildPlan,
  executePlan,
  type RealAgentRunArgs,
} from "./real-agent-run.ts"
import type { RealAgentRunPlanEntry } from "./real-agent.ts"
import {
  classifyProbeExecution,
  runCommandWithTimeout,
  type ProbeExecution,
} from "./route-probe.ts"
import {
  runResourceProbeFile,
} from "./resource-contract-run.ts"
import type { ResourceProbeResult } from "./resource-contract.ts"

export type PreIrCalibrationPhase = "plan" | "route-probe" | "execute"

export type PreIrCalibrationRunArgs = {
  rootDir: string
  lockPath: string
  outDir: string
  phase: PreIrCalibrationPhase
}

export type PreIrCalibrationPlan = {
  schemaVersion: "skill-ir-pre-ir-calibration-plan/v1"
  calibrationId: string
  methodEvidence: false
  execute: boolean
  lock: PreIrCalibrationLock
  runArgs: RealAgentRunArgs
  plan: RealAgentRunPlanEntry[]
}

export const PreIrRouteProbeResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-pre-ir-route-probe-result/v1"),
  calibrationId: z.string().min(1),
  methodEvidence: z.literal(false),
  model: z.string().min(1),
  caseId: z.string().min(1),
  system: z.literal("original"),
  status: z.enum(["ok", "timeout", "infrastructure", "agent"]),
  exitCode: z.number().int().optional(),
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
}).strict()

export type PreIrRouteProbeResult = z.infer<typeof PreIrRouteProbeResultSchema>

function resolveFromRoot(rootDir: string, value: string): string {
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootDir, value)
}

function calibrationRunArgs(
  lock: PreIrCalibrationLock,
  rootDir: string,
  outDir: string,
  execute: boolean,
  allowTasksAuthored: boolean,
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
    allowTasksAuthored,
    allowDevelopmentReplay: false,
    allowArtifactDevelopmentReplay: false,
    skills: new Set([lock.skillId]),
    systems: new Set(lock.matrix.systems),
    contexts: new Set(lock.matrix.contexts),
    agents: new Set(lock.matrix.agents),
    environments: new Set(lock.matrix.environments),
    tasks: new Set(lock.matrix.taskIds),
    requireEnv: new Set([lock.runtime.apiKeyEnv]),
  }
}

export async function buildPreIrCalibrationPlan(
  opts: PreIrCalibrationRunArgs,
): Promise<PreIrCalibrationPlan> {
  const rootDir = path.resolve(opts.rootDir)
  const outDir = resolveFromRoot(rootDir, opts.outDir)
  const lockPath = resolveFromRoot(rootDir, opts.lockPath)
  const lock = await readAndValidatePreIrCalibrationLock({ rootDir, lockPath })
  const execute = opts.phase === "execute"
  const manifest = JSON.parse(await readFile(
    path.resolve(rootDir, "benchmarks/skill-ir/corpus/corpora/pilot.json"),
    "utf8",
  )) as { skills: Array<{ id?: string; status?: string }> }
  const allowTasksAuthored = manifest.skills.find((skill) => skill.id === lock.skillId)?.status === "tasks-authored"
  const runArgs = calibrationRunArgs(lock, rootDir, outDir, execute, allowTasksAuthored)
  const plan = await buildPlan(runArgs)
  if (plan.length !== lock.matrix.expectedRows) {
    throw new Error(`Pre-IR calibration row mismatch: expected ${lock.matrix.expectedRows}, got ${plan.length}`)
  }
  const allowedSystems = new Set(lock.matrix.systems)
  if (plan.some((row) => !allowedSystems.has(row.system as "no-skill" | "original"))) {
    throw new Error("Pre-IR calibration plan contains a forbidden system")
  }
  const pairKeys = new Map<string, Set<string>>()
  for (const row of plan) {
    if (row.model !== lock.model.route || row.modelFamily !== lock.model.family) {
      throw new Error("Pre-IR calibration model identity drift")
    }
    if (row.adapter !== lock.adapter.id || row.adapterVersion !== lock.adapter.version) {
      throw new Error("Pre-IR calibration adapter identity drift")
    }
    if (row.panelConfigId !== lock.calibrationId) {
      throw new Error("Pre-IR calibration panel identity drift")
    }
    const key = `${row.caseId}:${row.runIndex}`
    const systems = pairKeys.get(key) ?? new Set<string>()
    systems.add(row.system)
    pairKeys.set(key, systems)
  }
  if (
    pairKeys.size !== lock.matrix.expectedPairs
    || [...pairKeys.values()].some((systems) => systems.size !== 2)
  ) {
    throw new Error("Pre-IR calibration plan does not contain complete pairs")
  }
  return {
    schemaVersion: "skill-ir-pre-ir-calibration-plan/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    execute,
    lock,
    runArgs,
    plan,
  }
}

export function compactPreIrRouteProbe(input: {
  calibrationId: string
  model: string
  caseId: string
  execution: ProbeExecution
}): PreIrRouteProbeResult {
  return PreIrRouteProbeResultSchema.parse({
    schemaVersion: "skill-ir-pre-ir-route-probe-result/v1",
    calibrationId: input.calibrationId,
    methodEvidence: false,
    model: input.model,
    caseId: input.caseId,
    system: "original",
    status: classifyProbeExecution(input.execution),
    ...(input.execution.exitCode !== undefined ? { exitCode: input.execution.exitCode } : {}),
    timedOut: input.execution.timedOut,
    ...(input.execution.durationMs !== undefined ? { durationMs: input.execution.durationMs } : {}),
  })
}

function expectedProbeCaseId(lock: PreIrCalibrationLock): string {
  return [
    lock.skillId,
    lock.matrix.agents[0],
    lock.matrix.environments[0],
    lock.matrix.contexts[0],
    lock.matrix.taskIds[0],
  ].join(":")
}

export function assertPreIrExecutionPrerequisites(
  lock: PreIrCalibrationLock,
  resource: ResourceProbeResult,
  route: PreIrRouteProbeResult,
  env: Record<string, string | undefined> = process.env,
): void {
  if (!env[lock.runtime.apiKeyEnv]?.trim()) {
    throw new Error(`Pre-IR calibration API key env ${lock.runtime.apiKeyEnv} is missing`)
  }
  assertPreIrProbeEvidence(lock, resource, route)
}

export function assertPreIrProbeEvidence(
  lock: PreIrCalibrationLock,
  resource: ResourceProbeResult,
  route: PreIrRouteProbeResult,
): void {
  if (resource.methodEvidence !== false || resource.status !== "ok") {
    throw new Error("Pre-IR calibration resource probe did not pass")
  }
  if (
    route.methodEvidence !== false
    || route.status !== "ok"
    || route.calibrationId !== lock.calibrationId
    || route.model !== lock.model.route
    || route.system !== "original"
    || route.caseId !== expectedProbeCaseId(lock)
  ) {
    throw new Error("Pre-IR calibration route probe identity or status mismatch")
  }
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
  }
}

async function writePlan(result: PreIrCalibrationPlan, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true })
  const planPath = path.join(outDir, "plan.json")
  await writeFile(planPath, `${JSON.stringify({
    ...result,
    runArgs: serializableRunArgs(result.runArgs),
  }, null, 2)}\n`, "utf8")
  return planPath
}

async function runResourcePreflight(
  result: PreIrCalibrationPlan,
  outDir: string,
): Promise<ResourceProbeResult> {
  return runResourceProbeFile({
    rootDir: result.runArgs.rootDir,
    contract: result.lock.frozenInputs.resourceContract.path,
    out: path.relative(result.runArgs.rootDir, path.join(outDir, "resource-probe.json")).replaceAll("\\", "/"),
  })
}

export async function runPreIrCalibrationPhase(opts: PreIrCalibrationRunArgs): Promise<Record<string, unknown>> {
  const result = await buildPreIrCalibrationPlan(opts)
  const outDir = resolveFromRoot(result.runArgs.rootDir, opts.outDir)
  const planPath = await writePlan(result, outDir)
  if (opts.phase === "plan") {
    return { calibrationId: result.calibrationId, phase: opts.phase, rows: result.plan.length, planPath }
  }

  await assertPreIrCalibrationExecutionState(result.lock, result.runArgs.rootDir)

  const resource = await runResourcePreflight(result, outDir)
  if (opts.phase === "route-probe") {
    if (!process.env[result.lock.runtime.apiKeyEnv]?.trim()) {
      throw new Error(`Pre-IR calibration API key env ${result.lock.runtime.apiKeyEnv} is missing`)
    }
    if (resource.status !== "ok") throw new Error("Pre-IR calibration resource probe did not pass")
    const entry = result.plan.find((row) =>
      row.system === "original" && row.caseId === expectedProbeCaseId(result.lock) && row.runIndex === 1)
    if (!entry) throw new Error("Pre-IR calibration route probe plan entry is missing")
    const execution = await runCommandWithTimeout(entry.command, result.lock.runtime.routeProbeTimeoutMs)
    const probe = compactPreIrRouteProbe({
      calibrationId: result.calibrationId,
      model: result.lock.model.route,
      caseId: entry.caseId,
      execution,
    })
    const probePath = path.join(outDir, "route-probe.json")
    await writeFile(probePath, `${JSON.stringify(probe, null, 2)}\n`, "utf8")
    if (probe.status !== "ok") throw new Error(`Pre-IR calibration route probe failed: ${probe.status}`)
    return { calibrationId: result.calibrationId, phase: opts.phase, resource, route: probe, probePath }
  }

  const route = PreIrRouteProbeResultSchema.parse(JSON.parse(
    await readFile(path.join(outDir, "route-probe.json"), "utf8"),
  ))
  assertPreIrExecutionPrerequisites(result.lock, resource, route)
  await executePlan(result.plan, result.runArgs)
  return {
    calibrationId: result.calibrationId,
    phase: opts.phase,
    rows: result.plan.length,
    rawPath: path.join(result.runArgs.outDir, "raw-runs.jsonl"),
  }
}

export function parsePreIrCalibrationRunArgs(argv: string[]): PreIrCalibrationRunArgs {
  let rootDir = process.cwd()
  let lockPath: string | undefined
  let outDir: string | undefined
  let phase: PreIrCalibrationPhase | undefined
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = path.resolve(arg.slice("--root-dir=".length))
    else if (arg.startsWith("--lock=")) lockPath = arg.slice("--lock=".length)
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice("--out-dir=".length)
    else if (arg.startsWith("--phase=")) {
      const value = arg.slice("--phase=".length)
      if (value !== "plan" && value !== "route-probe" && value !== "execute") {
        throw new Error("--phase must be plan, route-probe, or execute")
      }
      phase = value
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!lockPath) throw new Error("--lock is required")
  if (!outDir) throw new Error("--out-dir is required")
  if (!phase) throw new Error("--phase is required")
  return { rootDir, lockPath, outDir, phase }
}

if (import.meta.main) {
  runPreIrCalibrationPhase(parsePreIrCalibrationRunArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
