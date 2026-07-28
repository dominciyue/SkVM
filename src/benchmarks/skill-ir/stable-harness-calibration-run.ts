import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  LocalPiQualificationReportSchema,
  readAndValidateStableHarnessCalibrationLock,
  summarizeLocalPiQualification,
  type LocalPiQualificationReport,
  type StableHarnessCalibrationLock,
} from "./stable-harness-calibration.ts"
import {
  assertRequiredEnv,
  buildPlan,
  executePlan,
  type RealAgentRunArgs,
} from "./real-agent-run.ts"
import type { RealAgentRunPlanEntry } from "./real-agent.ts"
import {
  inspectPreIrPublicOutputs,
  PreIrOutputMaterializationSchema,
} from "./pre-ir-route-diagnostic.ts"
import type { ResourceProbeResult } from "./resource-contract.ts"
import { runResourceProbeFile } from "./resource-contract-run.ts"
import { runCommandWithTimeout } from "./route-probe.ts"
import { scoreRealAgentRuns } from "./score-real-agent-runs.ts"
import { evaluatePreIrCalibrationGate, type PreIrCalibrationGateLock } from "./pre-ir-calibration-gate.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"

export type StableHarnessCalibrationPhase = "plan" | "qualification" | "execute"

export type StableHarnessCalibrationRunArgs = {
  rootDir: string
  lockPath: string
  outDir: string
  phase: StableHarnessCalibrationPhase
}

export type StableHarnessCalibrationPlan = {
  schemaVersion: "skill-ir-stable-harness-calibration-plan/v1"
  calibrationId: string
  methodEvidence: false
  phase: StableHarnessCalibrationPhase
  lock: StableHarnessCalibrationLock
  runArgs: RealAgentRunArgs
  plan: RealAgentRunPlanEntry[]
}

const ResourceProbeResultSchema = z.object({
  schemaVersion: z.literal("skill-ir-resource-probe-result/v1"),
  methodEvidence: z.literal(false),
  status: z.enum(["ok", "failed", "unavailable"]),
  executableSource: z.enum(["env", "fallback"]),
  requiredModules: z.array(z.string()),
  exitCode: z.number().int().nullable(),
  stderrClass: z.enum(["none", "probe-nonzero", "marker-missing", "spawn-failed"]),
  durationMs: z.number().nonnegative(),
}).strict()

const StableHarnessRouteRowSchema = z.object({
  caseId: z.string().min(1),
  system: z.literal("original"),
  runIndex: z.literal(1),
  model: z.literal("xty/gpt-5.6-sol"),
  adapter: z.literal("pi"),
  adapterVersion: z.literal("0.67.68"),
  panelConfigId: z.literal("experimental-design-v2-pi-post-injection-cleanup-v1"),
  exitCode: z.number().int(),
  runStatus: z.string(),
  durationMs: z.number().nonnegative(),
  attempts: z.literal(1),
}).strict()

export const StableHarnessQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-stable-harness-qualification/v1"),
  calibrationId: z.literal("experimental-design-v2-pi-post-injection-cleanup-v1"),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  localPi: LocalPiQualificationReportSchema,
  resourceProbe: ResourceProbeResultSchema,
  route: z.object({
    row: StableHarnessRouteRowSchema,
    outputs: PreIrOutputMaterializationSchema,
    harnessResidue: z.array(z.enum(["AGENTS.md", ".pi-skills"])),
  }).strict().nullable(),
}).strict()

export type StableHarnessQualificationReport = z.infer<typeof StableHarnessQualificationReportSchema>

function stableRunArgs(
  lock: StableHarnessCalibrationLock,
  rootDir: string,
  outDir: string,
  phase: StableHarnessCalibrationPhase,
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

function projectManagedPiPlan(
  plan: RealAgentRunPlanEntry[],
  lock: StableHarnessCalibrationLock,
): RealAgentRunPlanEntry[] {
  return plan.map((row) => ({
    ...row,
    command: [
      ...row.command.filter((arg) =>
        !arg.startsWith("--adapter-config=")
        && !arg.startsWith("--timeout-ms=")
        && !arg.startsWith("--max-steps=")),
      "--adapter-config=managed",
      `--timeout-ms=${lock.runtime.taskTimeoutMs}`,
      `--max-steps=${lock.runtime.maxSteps}`,
    ],
  }))
}

function assertStablePlan(
  plan: RealAgentRunPlanEntry[],
  lock: StableHarnessCalibrationLock,
): void {
  if (plan.length !== lock.matrix.expectedRows) {
    throw new Error(`Stable harness row mismatch: expected ${lock.matrix.expectedRows}, got ${plan.length}`)
  }
  const pairSystems = new Map<string, Set<string>>()
  for (const row of plan) {
    const taskId = row.caseId.split(":").at(-1)
    if (
      !lock.matrix.taskIds.includes(taskId as typeof lock.matrix.taskIds[number])
      || row.model !== lock.model.route
      || row.modelFamily !== lock.model.family
      || row.adapter !== lock.harness.adapter
      || row.adapterVersion !== lock.harness.adapterVersion
      || row.panelConfigId !== lock.calibrationId
      || !lock.matrix.systems.includes(row.system as typeof lock.matrix.systems[number])
      || !row.command.includes("--adapter-config=managed")
      || !row.command.includes(`--timeout-ms=${lock.runtime.taskTimeoutMs}`)
      || !row.command.includes(`--max-steps=${lock.runtime.maxSteps}`)
    ) {
      throw new Error("Stable harness plan identity or runtime drift")
    }
    const key = `${row.caseId}:${row.runIndex}`
    const systems = pairSystems.get(key) ?? new Set<string>()
    systems.add(row.system)
    pairSystems.set(key, systems)
  }
  if (
    pairSystems.size !== lock.matrix.expectedPairs
    || [...pairSystems.values()].some((systems) => systems.size !== 2)
  ) {
    throw new Error("Stable harness plan does not contain complete pairs")
  }
}

export async function buildStableHarnessCalibrationPlan(
  opts: StableHarnessCalibrationRunArgs,
): Promise<StableHarnessCalibrationPlan> {
  const rootDir = path.resolve(opts.rootDir)
  const outDir = path.isAbsolute(opts.outDir) ? path.resolve(opts.outDir) : path.resolve(rootDir, opts.outDir)
  const lockPath = path.isAbsolute(opts.lockPath) ? path.resolve(opts.lockPath) : path.resolve(rootDir, opts.lockPath)
  const lock = await readAndValidateStableHarnessCalibrationLock({ rootDir, lockPath })
  const runArgs = stableRunArgs(lock, rootDir, outDir, opts.phase)
  const plan = projectManagedPiPlan(await buildPlan(runArgs), lock)
  assertStablePlan(plan, lock)
  return {
    schemaVersion: "skill-ir-stable-harness-calibration-plan/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    phase: opts.phase,
    lock,
    runArgs,
    plan,
  }
}

export function selectStableHarnessQualificationRow(
  plan: RealAgentRunPlanEntry[],
  lock: StableHarnessCalibrationLock,
): RealAgentRunPlanEntry {
  const matches = plan.filter((row) =>
    row.system === lock.qualification.system
    && row.runIndex === lock.qualification.runIndex
    && row.caseId.endsWith(`:${lock.qualification.taskId}`)
  )
  if (matches.length !== 1) {
    throw new Error(`Stable harness qualification requires exactly one row, got ${matches.length}`)
  }
  return matches[0]!
}

export function buildStableHarnessQualificationReport(input: {
  lock: StableHarnessCalibrationLock
  localPi: LocalPiQualificationReport
  resourceProbe: ResourceProbeResult
  route: {
    row: z.input<typeof StableHarnessRouteRowSchema>
    outputs: z.input<typeof PreIrOutputMaterializationSchema>
    harnessResidue: Array<"AGENTS.md" | ".pi-skills">
  } | null
}): StableHarnessQualificationReport {
  const localPi = LocalPiQualificationReportSchema.parse(input.localPi)
  const resourceProbe = ResourceProbeResultSchema.parse(input.resourceProbe)
  const route = input.route === null ? null : {
    row: StableHarnessRouteRowSchema.parse(input.route.row),
    outputs: PreIrOutputMaterializationSchema.parse(input.route.outputs),
    harnessResidue: input.route.harnessResidue,
  }
  const expectedCaseSuffix = `:${input.lock.qualification.taskId}`
  const passed = localPi.status === "passed"
    && resourceProbe.status === "ok"
    && route !== null
    && route.row.caseId.endsWith(expectedCaseSuffix)
    && route.row.exitCode === 0
    && route.row.runStatus === "ok"
    && route.outputs.declared === 3
    && route.outputs.present === route.outputs.declared
    && route.outputs.missing.length === 0
    && route.harnessResidue.length === 0
  return StableHarnessQualificationReportSchema.parse({
    schemaVersion: "skill-ir-stable-harness-qualification/v1",
    calibrationId: input.lock.calibrationId,
    methodEvidence: false,
    status: passed ? "passed" : "failed",
    localPi,
    resourceProbe,
    route,
  })
}

export async function writeStableHarnessPlan(
  built: StableHarnessCalibrationPlan,
  outDir: string,
): Promise<string> {
  await mkdir(outDir, { recursive: true })
  const planPath = path.join(outDir, "plan.json")
  await writeFile(planPath, `${JSON.stringify(built, null, 2)}\n`, "utf8")
  return planPath
}

export async function executeStableHarnessPlan(
  plan: RealAgentRunPlanEntry[],
  runArgs: RealAgentRunArgs,
  env: Record<string, string | undefined>,
): Promise<void> {
  await executePlan(plan, runArgs, env)
}

export async function readStableHarnessQualificationReport(
  reportPath: string,
): Promise<StableHarnessQualificationReport> {
  const report = StableHarnessQualificationReportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")))
  if (report.status !== "passed") throw new Error("Stable harness qualification did not pass")
  return report
}

function stableHarnessEnvironment(
  rootDir: string,
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const localBin = path.resolve(rootDir, "node_modules/.bin")
  const currentPath = env.PATH ?? env.Path ?? ""
  const mergedPath = `${localBin}${path.delimiter}${currentPath}`
  return {
    ...env,
    PATH: mergedPath,
    ...(process.platform === "win32" ? { Path: mergedPath } : {}),
    SKVM_AUTO_PROBE: "0",
  }
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

function projectRouteRow(row: RawAgentRunRow): z.input<typeof StableHarnessRouteRowSchema> {
  return {
    caseId: row.caseId,
    system: "original",
    runIndex: 1,
    model: "xty/gpt-5.6-sol",
    adapter: "pi",
    adapterVersion: "0.67.68",
    panelConfigId: "experimental-design-v2-pi-post-injection-cleanup-v1",
    exitCode: row.exitCode,
    runStatus: row.runStatus ?? "ok",
    durationMs: row.durationMs,
    attempts: 1,
  }
}

async function inspectPiHarnessResidue(workDir: string): Promise<Array<"AGENTS.md" | ".pi-skills">> {
  const residue: Array<"AGENTS.md" | ".pi-skills"> = []
  for (const relativePath of ["AGENTS.md", ".pi-skills"] as const) {
    try {
      await lstat(path.join(workDir, relativePath))
      residue.push(relativePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return residue
}

function toGateLock(lock: StableHarnessCalibrationLock): PreIrCalibrationGateLock {
  return {
    calibrationId: lock.calibrationId,
    skillId: lock.skillId,
    model: lock.model,
    adapter: { id: lock.harness.adapter, version: lock.harness.adapterVersion },
    matrix: lock.matrix,
    gate: lock.gate,
  }
}

export async function runStableHarnessCalibration(
  opts: StableHarnessCalibrationRunArgs,
  baseEnv: Record<string, string | undefined> = process.env,
): Promise<StableHarnessCalibrationPlan | StableHarnessQualificationReport | ReturnType<typeof evaluatePreIrCalibrationGate>> {
  const rootDir = path.resolve(opts.rootDir)
  const outDir = path.isAbsolute(opts.outDir) ? path.resolve(opts.outDir) : path.resolve(rootDir, opts.outDir)
  await mkdir(outDir, { recursive: true })

  if (opts.phase === "plan") {
    const built = await buildStableHarnessCalibrationPlan({ ...opts, rootDir, outDir })
    await writeStableHarnessPlan(built, outDir)
    return built
  }

  const env = stableHarnessEnvironment(rootDir, baseEnv)
  const planOutDir = opts.phase === "qualification" ? path.join(outDir, "qualification-work") : outDir
  const built = await buildStableHarnessCalibrationPlan({ ...opts, rootDir, outDir: planOutDir })
  assertRequiredEnv(built.runArgs, env)

  if (opts.phase === "qualification") {
    await writeStableHarnessPlan(built, planOutDir)
    const localPi = summarizeLocalPiQualification({
      lock: built.lock,
      execution: await runCommandWithTimeout(
        [path.resolve(rootDir, built.lock.harness.executable), "--version"],
        30000,
        env,
      ),
    })
    const relativeProbePath = path.relative(rootDir, path.join(outDir, "resource-probe.json"))
      .split(path.sep).join("/")
    if (!relativeProbePath || relativeProbePath.startsWith("../")) {
      throw new Error("Stable harness output directory must remain inside the repository root")
    }
    const resourceProbe = await runResourceProbeFile({
      rootDir,
      contract: built.lock.frozenInputs.resourceContract.path,
      out: relativeProbePath,
    }, env)

    let route: {
      row: z.input<typeof StableHarnessRouteRowSchema>
      outputs: z.input<typeof PreIrOutputMaterializationSchema>
      harnessResidue: Array<"AGENTS.md" | ".pi-skills">
    } | null = null
    if (localPi.status === "passed" && resourceProbe.status === "ok") {
      const qualificationRow = selectStableHarnessQualificationRow(built.plan, built.lock)
      await executeStableHarnessPlan([qualificationRow], built.runArgs, env)
      const rawRows = await readJsonl<RawAgentRunRow>(path.join(built.runArgs.outDir, "raw-runs.jsonl"))
      if (rawRows.length !== 1) {
        throw new Error(`Stable harness qualification expected one raw row, got ${rawRows.length}`)
      }
      const rawRow = rawRows[0]!
      route = {
        row: projectRouteRow(rawRow),
        outputs: await inspectPreIrPublicOutputs(qualificationRow.workDir),
        harnessResidue: await inspectPiHarnessResidue(qualificationRow.workDir),
      }
    }
    const report = buildStableHarnessQualificationReport({
      lock: built.lock,
      localPi,
      resourceProbe,
      route,
    })
    await writeFile(path.join(outDir, "qualification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
    return report
  }

  await readStableHarnessQualificationReport(path.join(outDir, "qualification.json"))
  await writeStableHarnessPlan(built, outDir)
  await executeStableHarnessPlan(built.plan, built.runArgs, env)
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
  const scoredRows = await readJsonl<ScoredAgentRunRow>(scoredPath)
  const gate = evaluatePreIrCalibrationGate(scoredRows, toGateLock(built.lock))
  await writeFile(path.join(outDir, "gate-report.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8")
  return gate
}

export function parseStableHarnessCalibrationRunArgs(argv: string[]): StableHarnessCalibrationRunArgs {
  let rootDir = process.cwd()
  let lockPath: string | undefined
  let outDir: string | undefined
  let phase: StableHarnessCalibrationPhase | undefined
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = arg.slice("--root-dir=".length)
    else if (arg.startsWith("--lock=")) lockPath = arg.slice("--lock=".length)
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice("--out-dir=".length)
    else if (arg.startsWith("--phase=")) {
      const value = arg.slice("--phase=".length)
      if (value !== "plan" && value !== "qualification" && value !== "execute") {
        throw new Error("--phase must be plan, qualification, or execute")
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
  runStableHarnessCalibration(parseStableHarnessCalibrationRunArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify({
        phase: "phase" in result ? result.phase : undefined,
        status: "status" in result ? result.status : "passed" in result ? (result.passed ? "passed" : "failed") : undefined,
      }, null, 2))
      if (("status" in result && result.status === "failed") || ("passed" in result && !result.passed)) {
        process.exitCode = 1
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
