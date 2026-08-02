import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { z } from "zod"
import {
  evaluateMethodCaseCalibrationGate,
  readAndValidateMethodCaseCalibrationLock,
  type MethodCaseCalibrationGateReport,
  type MethodCaseCalibrationLock,
} from "./method-case-calibration.ts"
import { assertRequiredEnv, buildPlan, executePlan, type RealAgentRunArgs } from "./real-agent-run.ts"
import type { RealAgentRunPlanEntry } from "./real-agent.ts"
import { runResourceProbeFile } from "./resource-contract-run.ts"
import { runCommandWithTimeout } from "./route-probe.ts"
import { scoreRealAgentRuns } from "./score-real-agent-runs.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"

export type MethodCaseCalibrationPhase = "plan" | "qualification" | "execute"
export type MethodCaseCalibrationRunArgs = {
  rootDir: string
  lockPath: string
  outDir: string
  phase: MethodCaseCalibrationPhase
}
export type MethodCaseCalibrationPlan = {
  schemaVersion: "skill-ir-method-case-calibration-plan/v1"
  calibrationId: string
  methodEvidence: false
  phase: MethodCaseCalibrationPhase
  lock: MethodCaseCalibrationLock
  runArgs: RealAgentRunArgs
  plan: RealAgentRunPlanEntry[]
}

const LocalPiSchema = z.object({
  status: z.enum(["passed", "failed"]),
  observedVersion: z.string(),
  exitCode: z.number().int().optional(),
  timedOut: z.boolean(),
}).strict()
const ResourceProbeSchema = z.object({
  status: z.enum(["ok", "failed", "unavailable"]),
  requiredModules: z.array(z.string()),
}).passthrough()
const OutputQualificationSchema = z.object({
  declared: z.number().int().positive(),
  present: z.number().int().nonnegative(),
  missing: z.array(z.string()),
}).strict()
const RouteSchema = z.object({
  row: z.object({
    caseId: z.string().min(1),
    exitCode: z.number().int(),
    runStatus: z.string(),
    durationMs: z.number().nonnegative(),
  }).strict(),
  outputs: OutputQualificationSchema,
  harnessResidue: z.array(z.enum(["AGENTS.md", ".pi-skills"])),
}).strict()

export const MethodCaseQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-method-case-qualification/v1"),
  calibrationId: z.string().min(1),
  skillId: z.string().min(1),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  localPi: LocalPiSchema,
  resourceProbe: z.object({
    status: z.enum(["ok", "failed", "unavailable"]),
    requiredModules: z.array(z.string()),
  }).strict(),
  route: RouteSchema.nullable(),
}).strict()
export type MethodCaseQualificationReport = z.infer<typeof MethodCaseQualificationReportSchema>

function runArgs(
  lock: MethodCaseCalibrationLock,
  rootDir: string,
  outDir: string,
  phase: MethodCaseCalibrationPhase,
): RealAgentRunArgs {
  return {
    corpus: lock.corpus,
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.harness.adapter,
    adapterVersion: lock.harness.adapterVersion,
    repetitions: lock.matrix.repetitions,
    panelConfigId: lock.calibrationId,
    outDir: path.join(outDir, "run"),
    limit: lock.matrix.expectedRows,
    execute: phase !== "plan",
    retries: lock.runtime.retries,
    retryDelayMs: 0,
    outerWatchdogMs: lock.runtime.outerWatchdogMs,
    rootDir,
    allowTasksAuthored: true,
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

function projectManagedPlan(
  plan: RealAgentRunPlanEntry[],
  lock: MethodCaseCalibrationLock,
  rootDir: string,
): RealAgentRunPlanEntry[] {
  return plan.map((row) => ({
    ...row,
    command: [
      process.execPath,
      "run",
      path.resolve(rootDir, lock.harness.execution.sourceEntrypoint.path),
      "run",
      ...row.command.slice(4).filter((arg) =>
        !arg.startsWith("--adapter-config=") && !arg.startsWith("--timeout-ms=") && !arg.startsWith("--max-steps=")),
      "--adapter-config=managed",
      `--timeout-ms=${lock.runtime.taskTimeoutMs}`,
      `--max-steps=${lock.runtime.maxSteps}`,
    ],
  }))
}

function assertPlan(plan: RealAgentRunPlanEntry[], lock: MethodCaseCalibrationLock, rootDir: string): void {
  if (plan.length !== lock.matrix.expectedRows) throw new Error("Method-case calibration row mismatch")
  const pairs = new Map<string, Set<string>>()
  for (const row of plan) {
    const taskId = row.caseId.split(":").at(-1)
    if (!taskId || !lock.matrix.taskIds.includes(taskId)
      || row.model !== lock.model.route || row.modelFamily !== lock.model.family
      || row.adapter !== lock.harness.adapter || row.adapterVersion !== lock.harness.adapterVersion
      || row.panelConfigId !== lock.calibrationId || row.command[0] !== process.execPath
      || row.command[2] !== path.resolve(rootDir, lock.harness.execution.sourceEntrypoint.path)
      || !row.command.includes("--adapter-config=managed")
      || !row.command.includes(`--timeout-ms=${lock.runtime.taskTimeoutMs}`)
      || !row.command.includes(`--max-steps=${lock.runtime.maxSteps}`)) {
      throw new Error("Method-case calibration plan identity drift")
    }
    const key = `${row.caseId}:${row.runIndex}`
    const systems = pairs.get(key) ?? new Set<string>()
    systems.add(row.system)
    pairs.set(key, systems)
  }
  if (pairs.size !== lock.matrix.expectedPairs || [...pairs.values()].some((systems) => systems.size !== 2)) {
    throw new Error("Method-case calibration incomplete pairs")
  }
}

export function assertMethodCaseWorkDirBudget(
  plan: Array<Pick<RealAgentRunPlanEntry, "workDir">>,
  maximumWorkDirLength: number,
): void {
  const over = plan.find((row) => path.resolve(row.workDir).length > maximumWorkDirLength)
  if (over) throw new Error(`Method-case calibration workdir length exceeds ${maximumWorkDirLength}`)
}

export async function buildMethodCaseCalibrationPlan(
  input: MethodCaseCalibrationRunArgs,
): Promise<MethodCaseCalibrationPlan> {
  const rootDir = path.resolve(input.rootDir)
  const lockPath = path.isAbsolute(input.lockPath) ? input.lockPath : path.resolve(rootDir, input.lockPath)
  const lock = await readAndValidateMethodCaseCalibrationLock({ rootDir, lockPath })
  const baseOutDir = path.resolve(rootDir, lock.harness.execution.outputRoot)
  const expected = input.phase === "qualification" ? path.join(baseOutDir, "qualification-work") : baseOutDir
  const outDir = path.isAbsolute(input.outDir) ? path.resolve(input.outDir) : path.resolve(rootDir, input.outDir)
  if (outDir !== path.resolve(expected)) throw new Error("Method-case calibration output root drift")
  const args = runArgs(lock, rootDir, outDir, input.phase)
  const plan = projectManagedPlan(await buildPlan(args), lock, rootDir)
  assertPlan(plan, lock, rootDir)
  assertMethodCaseWorkDirBudget(plan, lock.harness.execution.maximumWorkDirLength)
  return {
    schemaVersion: "skill-ir-method-case-calibration-plan/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    phase: input.phase,
    lock,
    runArgs: args,
    plan,
  }
}

export function selectMethodCaseQualificationRow(
  plan: RealAgentRunPlanEntry[],
  lock: MethodCaseCalibrationLock,
): RealAgentRunPlanEntry {
  const matches = plan.filter((row) => row.system === lock.qualification.system
    && row.runIndex === lock.qualification.runIndex && row.caseId.endsWith(`:${lock.qualification.taskId}`))
  if (matches.length !== 1) throw new Error(`Method-case qualification requires one row, got ${matches.length}`)
  return matches[0]!
}

export function buildMethodCasePiVersionCommand(lock: MethodCaseCalibrationLock, rootDir: string): string[] {
  const node = Bun.which(lock.harness.execution.nodeCommand)
  if (!node) throw new Error("Method-case Node executable unavailable")
  return [node, path.resolve(rootDir, lock.harness.execution.piCli.path), "--version"]
}

export async function inspectMethodCaseOutputs(
  workDir: string,
  outputs: readonly string[],
): Promise<z.infer<typeof OutputQualificationSchema>> {
  const missing: string[] = []
  for (const relativePath of outputs) {
    try {
      const stat = await lstat(path.join(workDir, ...relativePath.split("/")))
      if (!stat.isFile() || stat.isSymbolicLink()) missing.push(relativePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      missing.push(relativePath)
    }
  }
  return OutputQualificationSchema.parse({
    declared: outputs.length,
    present: outputs.length - missing.length,
    missing,
  })
}

export async function loadMethodCaseScorer(rootDir: string, scorerPath: string): Promise<void> {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...scorerPath.split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Method-case scorer module escapes repository root")
  }
  const url = pathToFileURL(absolute)
  url.searchParams.set("method-case-calibration", "1")
  await import(url.href)
}

async function inspectHarnessResidue(workDir: string): Promise<Array<"AGENTS.md" | ".pi-skills">> {
  const found: Array<"AGENTS.md" | ".pi-skills"> = []
  for (const name of ["AGENTS.md", ".pi-skills"] as const) {
    try {
      await lstat(path.join(workDir, name))
      found.push(name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return found
}

export function buildMethodCaseQualificationReport(input: {
  lock: MethodCaseCalibrationLock
  localPi: z.input<typeof LocalPiSchema>
  resourceProbe: unknown
  route: z.input<typeof RouteSchema> | null
}): MethodCaseQualificationReport {
  const localPi = LocalPiSchema.parse(input.localPi)
  const resource = ResourceProbeSchema.parse(input.resourceProbe)
  const resourceProbe = { status: resource.status, requiredModules: resource.requiredModules }
  const route = input.route === null ? null : RouteSchema.parse(input.route)
  const passed = localPi.status === "passed" && resourceProbe.status === "ok" && route !== null
    && route.row.caseId.endsWith(`:${input.lock.qualification.taskId}`)
    && route.row.exitCode === 0 && route.row.runStatus === "ok"
    && route.outputs.present === route.outputs.declared && route.outputs.missing.length === 0
    && route.harnessResidue.length === 0
  return MethodCaseQualificationReportSchema.parse({
    schemaVersion: "skill-ir-method-case-qualification/v1",
    calibrationId: input.lock.calibrationId,
    skillId: input.lock.skillId,
    methodEvidence: false,
    status: passed ? "passed" : "failed",
    localPi,
    resourceProbe,
    route,
  })
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

async function writePlan(plan: MethodCaseCalibrationPlan, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, "plan.json"), `${JSON.stringify(plan, null, 2)}\n`, "utf8")
}

export async function runMethodCaseCalibration(
  input: MethodCaseCalibrationRunArgs,
  env: Record<string, string | undefined> = process.env,
): Promise<MethodCaseCalibrationPlan | MethodCaseQualificationReport | MethodCaseCalibrationGateReport> {
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.isAbsolute(input.outDir) ? path.resolve(input.outDir) : path.resolve(rootDir, input.outDir)
  await mkdir(outDir, { recursive: true })
  if (input.phase === "plan") {
    const built = await buildMethodCaseCalibrationPlan({ ...input, rootDir, outDir })
    await writePlan(built, outDir)
    return built
  }

  const planOutDir = input.phase === "qualification" ? path.join(outDir, "qualification-work") : outDir
  const built = await buildMethodCaseCalibrationPlan({ ...input, rootDir, outDir: planOutDir })
  const childEnv = { ...env, SKVM_AUTO_PROBE: "0" }
  assertRequiredEnv(built.runArgs, childEnv)
  if (input.phase === "qualification") {
    await writePlan(built, planOutDir)
    const version = await runCommandWithTimeout(buildMethodCasePiVersionCommand(built.lock, rootDir), 30_000, childEnv)
    const observedVersion = version.stdout.trim() || version.stderr.trim()
    const localPi = {
      status: version.exitCode === 0 && !version.timedOut && observedVersion === built.lock.harness.adapterVersion
        ? "passed" as const : "failed" as const,
      observedVersion,
      ...(version.exitCode !== undefined ? { exitCode: version.exitCode } : {}),
      timedOut: version.timedOut,
    }
    const probeOut = path.relative(rootDir, path.join(outDir, "resource-probe.json")).split(path.sep).join("/")
    if (!probeOut || probeOut.startsWith("../")) throw new Error("Method-case output must remain inside repository")
    const resourceProbe = await runResourceProbeFile({
      rootDir,
      contract: built.lock.frozenInputs.resourceContract.path,
      out: probeOut,
    }, childEnv)
    let route: z.input<typeof RouteSchema> | null = null
    if (localPi.status === "passed" && resourceProbe.status === "ok") {
      const selected = selectMethodCaseQualificationRow(built.plan, built.lock)
      await executePlan([selected], built.runArgs, childEnv)
      const rows = await readJsonl<RawAgentRunRow>(path.join(built.runArgs.outDir, "raw-runs.jsonl"))
      if (rows.length !== 1) throw new Error(`Method-case qualification expected one row, got ${rows.length}`)
      route = {
        row: {
          caseId: rows[0]!.caseId,
          exitCode: rows[0]!.exitCode,
          runStatus: rows[0]!.runStatus ?? "ok",
          durationMs: rows[0]!.durationMs,
        },
        outputs: await inspectMethodCaseOutputs(selected.workDir, built.lock.outputs),
        harnessResidue: await inspectHarnessResidue(selected.workDir),
      }
    }
    const report = buildMethodCaseQualificationReport({ lock: built.lock, localPi, resourceProbe, route })
    await writeFile(path.join(outDir, "qualification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
    return report
  }

  const qualification = MethodCaseQualificationReportSchema.parse(JSON.parse(await readFile(
    path.join(outDir, "qualification.json"), "utf8",
  )))
  if (qualification.status !== "passed" || qualification.calibrationId !== built.lock.calibrationId
    || qualification.skillId !== built.lock.skillId) {
    throw new Error("Method-case qualification did not pass or identity drifted")
  }
  await writePlan(built, outDir)
  await executePlan(built.plan, built.runArgs, childEnv)
  await loadMethodCaseScorer(rootDir, built.lock.frozenInputs.scorer.path)
  const scoredPath = path.join(outDir, "scored-runs.jsonl")
  await scoreRealAgentRuns({
    raw: path.join(built.runArgs.outDir, "raw-runs.jsonl"),
    tasks: built.lock.frozenInputs.tasks.path,
    corpus: built.lock.corpus,
    rootDir,
    out: scoredPath,
    allowTasksAuthored: true,
    normalizePreIrRuntime: false,
  })
  const gate = evaluateMethodCaseCalibrationGate(await readJsonl<ScoredAgentRunRow>(scoredPath), built.lock)
  await writeFile(path.join(outDir, "gate-report.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8")
  return gate
}

export function parseMethodCaseCalibrationRunArgs(argv: string[]): MethodCaseCalibrationRunArgs {
  let rootDir = process.cwd()
  let lockPath: string | undefined
  let outDir: string | undefined
  let phase: MethodCaseCalibrationPhase | undefined
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = arg.slice(11)
    else if (arg.startsWith("--lock=")) lockPath = arg.slice(7)
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice(10)
    else if (arg.startsWith("--phase=")) {
      const value = arg.slice(8)
      if (value !== "plan" && value !== "qualification" && value !== "execute") throw new Error("invalid phase")
      phase = value
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!lockPath || !outDir || !phase) throw new Error("--lock, --out-dir, and --phase are required")
  return { rootDir, lockPath, outDir, phase }
}

if (import.meta.main) {
  runMethodCaseCalibration(parseMethodCaseCalibrationRunArgs(process.argv.slice(2))).then((result) => {
    const status = "status" in result ? result.status : "passed" in result ? (result.passed ? "passed" : "failed") : result.phase
    console.log(JSON.stringify({ status }, null, 2))
    if (status === "failed") process.exitCode = 1
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
