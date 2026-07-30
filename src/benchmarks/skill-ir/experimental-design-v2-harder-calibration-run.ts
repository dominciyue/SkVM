import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { SkillIRSchema } from "../../skill-ir/schema.ts"
import {
  buildRunPlanEntry,
  materializeCaseArtifacts,
  type RealAgentRunPlanEntry,
} from "./real-agent.ts"
import {
  assertRequiredEnv,
  executePlan,
  type RealAgentRunArgs,
} from "./real-agent-run.ts"
import {
  inspectPreIrPublicOutputs,
  PreIrOutputMaterializationSchema,
} from "./pre-ir-route-diagnostic.ts"
import { evaluatePreIrCalibrationGate, type PreIrCalibrationGateLock } from "./pre-ir-calibration-gate.ts"
import type { ResourceProbeResult } from "./resource-contract.ts"
import { runResourceProbeFile } from "./resource-contract-run.ts"
import { runCommandWithTimeout, type ProbeExecution } from "./route-probe.ts"
import { scoreRealAgentRuns } from "./score-real-agent-runs.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"
import {
  validateExperimentalDesignV2HarderDevelopmentTaskSet,
} from "./experimental-design-v2-harder-development.ts"
import {
  readAndValidateHarderCalibrationLock,
  type HarderCalibrationLock,
} from "./experimental-design-v2-harder-calibration.ts"

export type HarderCalibrationPhase = "plan" | "qualification" | "execute"
export type HarderCalibrationRunArgs = {
  rootDir: string
  lockPath: string
  outDir: string
  phase: HarderCalibrationPhase
}

export type HarderCalibrationPlan = {
  schemaVersion: "skill-ir-experimental-design-v2-harder-calibration-plan/v1"
  calibrationId: string
  methodEvidence: false
  phase: HarderCalibrationPhase
  lock: HarderCalibrationLock
  runArgs: RealAgentRunArgs
  plan: RealAgentRunPlanEntry[]
}

const LocalPiReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-local-pi-qualification/v1"),
  calibrationId: z.literal("experimental-design-v2-harder-pi-development-v1"),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  executable: z.literal("node_modules/.bin/pi.exe"),
  expectedVersion: z.literal("0.67.68"),
  observedVersion: z.string(),
  exitCode: z.number().int().optional(),
  timedOut: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
}).strict()

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

const RouteRowSchema = z.object({
  caseId: z.string().min(1),
  system: z.literal("original"),
  runIndex: z.literal(1),
  model: z.literal("xty/gpt-5.6-sol"),
  adapter: z.literal("pi"),
  adapterVersion: z.literal("0.67.68"),
  panelConfigId: z.literal("experimental-design-v2-harder-pi-development-v1"),
  exitCode: z.number().int(),
  runStatus: z.string(),
  durationMs: z.number().nonnegative(),
  attempts: z.literal(1),
}).strict()

export const HarderQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-v2-harder-qualification/v1"),
  calibrationId: z.literal("experimental-design-v2-harder-pi-development-v1"),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  localPi: LocalPiReportSchema,
  resourceProbe: ResourceProbeResultSchema,
  route: z.object({
    row: RouteRowSchema,
    outputs: PreIrOutputMaterializationSchema,
    harnessResidue: z.array(z.enum(["AGENTS.md", ".pi-skills"])),
  }).strict().nullable(),
}).strict()

export type HarderQualificationReport = z.infer<typeof HarderQualificationReportSchema>

function resolveOutput(rootDir: string, outDir: string): string {
  return path.isAbsolute(outDir) ? path.resolve(outDir) : path.resolve(rootDir, outDir)
}

function calibrationRunArgs(
  lock: HarderCalibrationLock,
  rootDir: string,
  outDir: string,
  execute: boolean,
): RealAgentRunArgs {
  return {
    corpus: "pilot",
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.harness.adapter,
    adapterVersion: lock.harness.adapterVersion,
    repetitions: lock.matrix.repetitions,
    panelConfigId: lock.calibrationId,
    outDir: path.join(outDir, "run"),
    limit: lock.matrix.expectedRows,
    execute,
    retries: lock.runtime.retries,
    retryDelayMs: 0,
    outerWatchdogMs: lock.runtime.outerWatchdogMs,
    rootDir,
    requireEnv: new Set([lock.runtime.apiKeyEnv]),
  }
}

function assertPlan(plan: RealAgentRunPlanEntry[], lock: HarderCalibrationLock): void {
  if (plan.length !== lock.matrix.expectedRows) {
    throw new Error(`Harder calibration expected ${lock.matrix.expectedRows} rows, got ${plan.length}`)
  }
  const pairs = new Map<string, Set<string>>()
  for (const row of plan) {
    const taskId = row.caseId.split(":").at(-1)
    if (
      !lock.matrix.taskIds.includes(taskId as typeof lock.matrix.taskIds[number])
      || row.model !== lock.model.route
      || row.modelFamily !== lock.model.family
      || row.adapter !== lock.harness.adapter
      || row.adapterVersion !== lock.harness.adapterVersion
      || row.panelConfigId !== lock.calibrationId
      || !row.command.includes("--adapter-config=managed")
      || !row.command.includes(`--timeout-ms=${lock.runtime.taskTimeoutMs}`)
      || !row.command.includes(`--max-steps=${lock.runtime.maxSteps}`)
    ) {
      throw new Error("Harder calibration plan identity or runtime drift")
    }
    const pair = `${row.caseId}:${row.runIndex}`
    const systems = pairs.get(pair) ?? new Set<string>()
    systems.add(row.system)
    pairs.set(pair, systems)
  }
  if (pairs.size !== lock.matrix.expectedPairs || [...pairs.values()].some((systems) => systems.size !== 2)) {
    throw new Error("Harder calibration plan does not contain four complete pairs")
  }
}

export async function buildHarderCalibrationPlan(
  opts: HarderCalibrationRunArgs,
): Promise<HarderCalibrationPlan> {
  const rootDir = path.resolve(opts.rootDir)
  const outDir = resolveOutput(rootDir, opts.outDir)
  const lockPath = path.isAbsolute(opts.lockPath)
    ? path.resolve(opts.lockPath)
    : path.resolve(rootDir, opts.lockPath)
  const lock = await readAndValidateHarderCalibrationLock({ rootDir, lockPath })
  const publicContractBytes = await readFile(path.resolve(rootDir, lock.frozenInputs.publicContract.path))
  const taskSet = validateExperimentalDesignV2HarderDevelopmentTaskSet(
    JSON.parse(await readFile(path.resolve(rootDir, lock.frozenInputs.tasks.path), "utf8")),
    publicContractBytes,
  )
  const ir = SkillIRSchema.parse({
    schemaVersion: "skill-ir/v1",
    id: lock.skillId,
    name: "Experimental Design v2 Benchmark",
    category: ["workflow", "tool-use", "generative"],
    intent: "Pre-IR exact-source supplemental development calibration envelope; not optimized IR.",
    source: {
      kind: "file",
      path: lock.frozenInputs.source.path,
      sha256: lock.frozenInputs.source.sha256,
    },
    inputs: [],
    outputs: [],
    preconditions: [],
    steps: [],
    rules: [],
    tools: [],
    environment: [],
    checks: [],
    recovery: [],
    profile: [],
  })
  const runArgs = calibrationRunArgs(lock, rootDir, outDir, opts.phase !== "plan")
  const plan: RealAgentRunPlanEntry[] = []
  for (const task of taskSet.tasks) {
    const caseId = `${lock.skillId}:skvm:windows:clean:${task.id}`
    for (const system of lock.matrix.systems) {
      for (let runIndex = 1; runIndex <= lock.matrix.repetitions; runIndex += 1) {
        const materialized = await materializeCaseArtifacts({
          outDir: path.join(runArgs.outDir, "artifacts"),
          rootDir,
          ir,
          sourceFiles: lock.sourceClosure,
          task,
          context: "clean",
          system,
          caseId,
          runIndex,
        })
        const row = buildRunPlanEntry({
          ...materialized,
          skillProvenance: "real-public",
          evidenceWeight: "support-real",
        }, {
          model: lock.model.route,
          modelFamily: lock.model.family,
          adapter: lock.harness.adapter,
          adapterVersion: lock.harness.adapterVersion,
          runIndex,
          panelConfigId: lock.calibrationId,
          timeoutMs: lock.runtime.taskTimeoutMs,
          maxSteps: lock.runtime.maxSteps,
        })
        row.command.push("--adapter-config=managed")
        plan.push(row)
      }
    }
  }
  assertPlan(plan, lock)
  return {
    schemaVersion: "skill-ir-experimental-design-v2-harder-calibration-plan/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    phase: opts.phase,
    lock,
    runArgs,
    plan,
  }
}

export function selectHarderQualificationRow(
  plan: RealAgentRunPlanEntry[],
  lock: HarderCalibrationLock,
): RealAgentRunPlanEntry {
  const matches = plan.filter((row) =>
    row.system === lock.qualification.system
    && row.runIndex === lock.qualification.runIndex
    && row.caseId.endsWith(`:${lock.qualification.taskId}`)
  )
  if (matches.length !== 1) {
    throw new Error(`Harder calibration qualification expected one row, got ${matches.length}`)
  }
  return matches[0]!
}

function summarizeLocalPi(lock: HarderCalibrationLock, execution: ProbeExecution) {
  const stdout = execution.stdout.trim()
  const stderr = execution.stderr.trim()
  const observedVersion = stdout && stderr ? "" : stdout || stderr
  return LocalPiReportSchema.parse({
    schemaVersion: "skill-ir-local-pi-qualification/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    status: execution.exitCode === 0 && !execution.timedOut
      && observedVersion === lock.harness.adapterVersion ? "passed" : "failed",
    executable: lock.harness.executable,
    expectedVersion: lock.harness.adapterVersion,
    observedVersion,
    ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
    timedOut: execution.timedOut,
    ...(execution.durationMs !== undefined ? { durationMs: execution.durationMs } : {}),
  })
}

export function buildHarderQualificationReport(input: {
  lock: HarderCalibrationLock
  localPi: z.infer<typeof LocalPiReportSchema>
  resourceProbe: ResourceProbeResult
  route: z.input<typeof HarderQualificationReportSchema>["route"]
}): HarderQualificationReport {
  const route = input.route
  const passed = input.localPi.status === "passed"
    && input.resourceProbe.status === "ok"
    && route !== null
    && route.row.caseId.endsWith(`:${input.lock.qualification.taskId}`)
    && route.row.exitCode === 0
    && route.row.runStatus === "ok"
    && route.outputs.declared === 3
    && route.outputs.present === 3
    && route.outputs.missing.length === 0
    && route.harnessResidue.length === 0
  return HarderQualificationReportSchema.parse({
    schemaVersion: "skill-ir-experimental-design-v2-harder-qualification/v1",
    calibrationId: input.lock.calibrationId,
    methodEvidence: false,
    status: passed ? "passed" : "failed",
    localPi: input.localPi,
    resourceProbe: input.resourceProbe,
    route,
  })
}

async function inspectHarnessResidue(workDir: string): Promise<Array<"AGENTS.md" | ".pi-skills">> {
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

function runEnvironment(
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

function gateLock(lock: HarderCalibrationLock): PreIrCalibrationGateLock {
  return {
    calibrationId: lock.calibrationId,
    skillId: lock.skillId,
    model: lock.model,
    adapter: { id: lock.harness.adapter, version: lock.harness.adapterVersion },
    matrix: lock.matrix,
    gate: lock.gate,
  }
}

export async function runHarderCalibration(
  opts: HarderCalibrationRunArgs,
  baseEnv: Record<string, string | undefined> = process.env,
): Promise<HarderCalibrationPlan | HarderQualificationReport | ReturnType<typeof evaluatePreIrCalibrationGate>> {
  const rootDir = path.resolve(opts.rootDir)
  const outDir = resolveOutput(rootDir, opts.outDir)
  await mkdir(outDir, { recursive: true })
  if (opts.phase === "plan") {
    const built = await buildHarderCalibrationPlan({ ...opts, rootDir, outDir })
    await writeFile(path.join(outDir, "plan.json"), `${JSON.stringify(built, null, 2)}\n`, "utf8")
    return built
  }

  const env = runEnvironment(rootDir, baseEnv)
  const planOutDir = opts.phase === "qualification" ? path.join(outDir, "qualification-work") : outDir
  const built = await buildHarderCalibrationPlan({ ...opts, rootDir, outDir: planOutDir })
  assertRequiredEnv(built.runArgs, env)
  if (opts.phase === "qualification") {
    await writeFile(path.join(planOutDir, "plan.json"), `${JSON.stringify(built, null, 2)}\n`, "utf8")
    const localPi = summarizeLocalPi(built.lock, await runCommandWithTimeout(
      [path.resolve(rootDir, built.lock.harness.executable), "--version"],
      30000,
      env,
    ))
    const probePath = path.join(outDir, "resource-probe.json")
    const relativeProbePath = path.relative(rootDir, probePath).split(path.sep).join("/")
    if (!relativeProbePath || relativeProbePath.startsWith("../")) {
      throw new Error("Harder calibration output directory must remain inside repository root")
    }
    const resourceProbe = await runResourceProbeFile({
      rootDir,
      contract: built.lock.frozenInputs.resourceContract.path,
      out: relativeProbePath,
    }, env)
    let route: z.input<typeof HarderQualificationReportSchema>["route"] = null
    if (localPi.status === "passed" && resourceProbe.status === "ok") {
      const qualification = selectHarderQualificationRow(built.plan, built.lock)
      await executePlan([qualification], built.runArgs, env)
      const rows = await readJsonl<RawAgentRunRow>(path.join(built.runArgs.outDir, "raw-runs.jsonl"))
      if (rows.length !== 1) throw new Error(`Harder qualification expected one row, got ${rows.length}`)
      const row = rows[0]!
      route = {
        row: {
          caseId: row.caseId,
          system: "original",
          runIndex: 1,
          model: built.lock.model.route,
          adapter: built.lock.harness.adapter,
          adapterVersion: built.lock.harness.adapterVersion,
          panelConfigId: built.lock.calibrationId,
          exitCode: row.exitCode,
          runStatus: row.runStatus ?? "ok",
          durationMs: row.durationMs,
          attempts: 1,
        },
        outputs: await inspectPreIrPublicOutputs(qualification.workDir),
        harnessResidue: await inspectHarnessResidue(qualification.workDir),
      }
    }
    const report = buildHarderQualificationReport({ lock: built.lock, localPi, resourceProbe, route })
    await writeFile(path.join(outDir, "qualification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
    return report
  }

  const qualification = HarderQualificationReportSchema.parse(JSON.parse(await readFile(
    path.join(outDir, "qualification.json"),
    "utf8",
  )))
  if (qualification.status !== "passed") throw new Error("Harder calibration qualification did not pass")
  await writeFile(path.join(outDir, "plan.json"), `${JSON.stringify(built, null, 2)}\n`, "utf8")
  await executePlan(built.plan, built.runArgs, env)
  const scoredPath = path.join(outDir, "scored-runs.jsonl")
  await scoreRealAgentRuns({
    raw: path.join(built.runArgs.outDir, "raw-runs.jsonl"),
    tasks: path.resolve(rootDir, built.lock.frozenInputs.tasks.path),
    rootDir,
    out: scoredPath,
    normalizePreIrRuntime: false,
  })
  const scoredRows = await readJsonl<ScoredAgentRunRow>(scoredPath)
  const gate = evaluatePreIrCalibrationGate(scoredRows, gateLock(built.lock))
  await writeFile(path.join(outDir, "gate-report.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8")
  return gate
}

export function parseHarderCalibrationRunArgs(argv: string[]): HarderCalibrationRunArgs {
  let rootDir = process.cwd()
  let lockPath: string | undefined
  let outDir: string | undefined
  let phase: HarderCalibrationPhase | undefined
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
  runHarderCalibration(parseHarderCalibrationRunArgs(process.argv.slice(2)))
    .then((result) => {
      const status = "status" in result ? result.status : "passed" in result
        ? (result.passed ? "passed" : "failed") : "planned"
      console.log(JSON.stringify({ status }, null, 2))
      if (status === "failed") process.exitCode = 1
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    })
}
