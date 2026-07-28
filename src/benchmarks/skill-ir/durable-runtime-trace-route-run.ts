import { createHash } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import type { RealAgentRunPlanEntry } from "./real-agent.ts"
import {
  buildPreIrCalibrationPlan,
  withQualifiedPreIrRuntimeEnvironment,
} from "./pre-ir-calibration-run.ts"
import { inspectPreIrPublicOutputs } from "./pre-ir-route-diagnostic.ts"
import { runCommandWithTimeout } from "./route-probe.ts"
import {
  DurableRuntimeTraceRouteLockSchema,
  buildDurableRuntimeTraceRouteReport,
  validateDurableRuntimeTraceRouteLock,
  type DurableRuntimeTraceRouteLock,
} from "./durable-runtime-trace-route.ts"

export type DurableRuntimeTraceRouteRunArgs = {
  rootDir: string
  lockPath: string
  outDir: string
  phase: "plan" | "execute"
}

function caseId(lock: DurableRuntimeTraceRouteLock): string {
  return [
    lock.route.skillId,
    lock.route.agent,
    lock.route.environment,
    lock.route.context,
    lock.route.taskId,
  ].join(":")
}

export function selectDurableRuntimeTraceRouteEntry(
  plan: RealAgentRunPlanEntry[],
  lock: DurableRuntimeTraceRouteLock,
): RealAgentRunPlanEntry {
  const matches = plan.filter((entry) =>
    entry.caseId === caseId(lock)
    && entry.system === lock.route.system
    && entry.model === lock.route.model
    && entry.modelFamily === lock.route.modelFamily
    && entry.adapter === lock.route.adapter
    && entry.runIndex === lock.route.runIndex)
  if (matches.length !== 1) {
    throw new Error(`Durable runtime trace route expected exactly one frozen row, observed ${matches.length}`)
  }
  return matches[0]!
}

export function parseDurableRuntimeTraceRouteRunArgs(argv: string[]): DurableRuntimeTraceRouteRunArgs {
  let rootDir = process.cwd()
  let lockPath: string | undefined
  let outDir: string | undefined
  let phase: "plan" | "execute" | undefined
  for (const arg of argv) {
    if (arg.startsWith("--root=")) rootDir = resolve(arg.slice("--root=".length))
    else if (arg.startsWith("--lock=")) lockPath = arg.slice("--lock=".length)
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice("--out-dir=".length)
    else if (arg === "--phase=plan") phase = "plan"
    else if (arg === "--phase=execute") phase = "execute"
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!lockPath) throw new Error("--lock is required")
  if (!outDir) throw new Error("--out-dir is required")
  if (!phase) throw new Error("--phase must be plan or execute")
  return { rootDir: resolve(rootDir), lockPath, outDir, phase }
}

async function buildRoutePlan(args: DurableRuntimeTraceRouteRunArgs) {
  const rootDir = resolve(args.rootDir)
  const lockPath = resolve(rootDir, args.lockPath)
  const outDir = resolve(rootDir, args.outDir)
  const lockText = await readFile(lockPath, "utf8")
  const lock = await validateDurableRuntimeTraceRouteLock(
    JSON.parse(lockText),
    rootDir,
  )
  const base = await buildPreIrCalibrationPlan({
    rootDir,
    lockPath: lock.baseCalibrationLock.path,
    outDir: resolve(outDir, "materialization"),
    phase: "plan",
  })
  const entry = selectDurableRuntimeTraceRouteEntry(base.plan, lock)
  return { rootDir, outDir, lock, lockSha256: sha256(lockText), baseLock: base.lock, entry }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

export async function runDurableRuntimeTraceRoute(args: DurableRuntimeTraceRouteRunArgs) {
  const plan = await buildRoutePlan(args)
  await mkdir(plan.outDir, { recursive: true })
  const compactPlan = {
    schemaVersion: "skill-ir-durable-runtime-trace-route-plan/v1",
    diagnosticId: plan.lock.diagnosticId,
    execute: args.phase === "execute",
    route: plan.lock.route,
    caseId: plan.entry.caseId,
    commandSha256: sha256(JSON.stringify(plan.entry.command)),
    claimBoundary: plan.lock.claimBoundary,
  }
  const planPath = resolve(plan.outDir, "plan.json")
  await writeFile(planPath, `${JSON.stringify(compactPlan, null, 2)}\n`, "utf8")
  if (args.phase === "plan") {
    return { phase: args.phase, diagnosticId: plan.lock.diagnosticId, rows: 1, planPath }
  }

  const apiKeyEnv = plan.baseLock.runtime.apiKeyEnv
  if (!process.env[apiKeyEnv]?.trim()) throw new Error(`Durable runtime trace route API key env ${apiKeyEnv} is missing`)
  const tracePath = resolve(plan.outDir, "raw-runtime-trace.jsonl")
  await rm(tracePath, { force: true })
  const execution = await withQualifiedPreIrRuntimeEnvironment(
    plan.baseLock,
    plan.rootDir,
    (baseEnv) => runCommandWithTimeout(plan.entry.command, plan.lock.route.timeoutMs, {
      ...baseEnv,
      SKVM_AUTO_PROBE: "0",
      SKVM_DURABLE_RUNTIME_TRACE: tracePath,
    }),
  )
  const report = buildDurableRuntimeTraceRouteReport({
    lock: plan.lock,
    lockSha256: plan.lockSha256,
    execution,
    traceText: await readOptionalText(tracePath),
    outputMaterialization: await inspectPreIrPublicOutputs(plan.entry.workDir),
  })
  const reportPath = resolve(plan.outDir, "route-report.json")
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return {
    phase: args.phase,
    diagnosticId: plan.lock.diagnosticId,
    reportPath,
    execution: report.execution,
    trace: report.trace,
  }
}

if (import.meta.main) {
  runDurableRuntimeTraceRoute(parseDurableRuntimeTraceRouteRunArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
