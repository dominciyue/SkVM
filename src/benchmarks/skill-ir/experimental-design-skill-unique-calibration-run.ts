import { lstat, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import {
  evaluateExperimentalDesignSkillUniqueCalibrationGate,
  readAndValidateExperimentalDesignSkillUniqueCalibrationLock,
  type ExperimentalDesignSkillUniqueCalibrationGateReport,
  type ExperimentalDesignSkillUniqueCalibrationLock,
} from "./experimental-design-skill-unique-calibration.ts"
import {
  assertRequiredEnv,
  buildPlan,
  executePlan,
  type RealAgentRunArgs,
} from "./real-agent-run.ts"
import type { RealAgentRunPlanEntry } from "./real-agent.ts"
import type { ResourceProbeResult } from "./resource-contract.ts"
import { runResourceProbeFile } from "./resource-contract-run.ts"
import { runCommandWithTimeout } from "./route-probe.ts"
import { scoreRealAgentRuns } from "./score-real-agent-runs.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"

export type ExperimentalDesignSkillUniqueCalibrationPhase = "plan" | "qualification" | "execute"

export type ExperimentalDesignSkillUniqueCalibrationRunArgs = {
  rootDir: string
  lockPath: string
  outDir: string
  phase: ExperimentalDesignSkillUniqueCalibrationPhase
}

export type ExperimentalDesignSkillUniqueCalibrationPlan = {
  schemaVersion: "skill-ir-experimental-design-skill-unique-calibration-plan/v1"
  calibrationId: string
  methodEvidence: false
  phase: ExperimentalDesignSkillUniqueCalibrationPhase
  lock: ExperimentalDesignSkillUniqueCalibrationLock
  runArgs: RealAgentRunArgs
  plan: RealAgentRunPlanEntry[]
}

const LocalPiQualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-local-pi-qualification/v1"),
  calibrationId: z.enum([
    "experimental-design-skill-unique-pi-development-v1",
    "experimental-design-skill-unique-pi-direct-cli-development-v1",
  ]),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  executable: z.enum([
    "node_modules/.bin/pi.exe",
    "node_modules/@mariozechner/pi-coding-agent/dist/cli.js",
  ]),
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

const OutputQualificationSchema = z.object({
  declared: z.literal(2),
  present: z.number().int().min(0).max(2),
  missing: z.array(z.enum(["design/replication-plan.json", "design/analysis-plan.json"])),
}).strict()

const RouteRowSchema = z.object({
  caseId: z.string().min(1),
  system: z.literal("original"),
  runIndex: z.literal(1),
  model: z.literal("xty/gpt-5.6-sol"),
  adapter: z.literal("pi"),
  adapterVersion: z.literal("0.67.68"),
  panelConfigId: z.enum([
    "experimental-design-skill-unique-pi-development-v1",
    "experimental-design-skill-unique-pi-direct-cli-development-v1",
  ]),
  exitCode: z.number().int(),
  runStatus: z.string(),
  durationMs: z.number().nonnegative(),
  attempts: z.literal(1),
}).strict()

export const ExperimentalDesignSkillUniqueQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-experimental-design-skill-unique-qualification/v1"),
  calibrationId: z.enum([
    "experimental-design-skill-unique-pi-development-v1",
    "experimental-design-skill-unique-pi-direct-cli-development-v1",
  ]),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  localPi: LocalPiQualificationSchema,
  resourceProbe: ResourceProbeResultSchema,
  route: z.object({
    row: RouteRowSchema,
    outputs: OutputQualificationSchema,
    harnessResidue: z.array(z.enum(["AGENTS.md", ".pi-skills"])),
  }).strict().nullable(),
}).strict()

export type ExperimentalDesignSkillUniqueQualificationReport = z.infer<
  typeof ExperimentalDesignSkillUniqueQualificationReportSchema
>

function calibrationRunArgs(
  lock: ExperimentalDesignSkillUniqueCalibrationLock,
  rootDir: string,
  outDir: string,
  phase: ExperimentalDesignSkillUniqueCalibrationPhase,
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
  lock: ExperimentalDesignSkillUniqueCalibrationLock,
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
        !arg.startsWith("--adapter-config=")
        && !arg.startsWith("--timeout-ms=")
        && !arg.startsWith("--max-steps=")),
      "--adapter-config=managed",
      `--timeout-ms=${lock.runtime.taskTimeoutMs}`,
      `--max-steps=${lock.runtime.maxSteps}`,
    ],
  }))
}

function assertCalibrationPlan(
  plan: RealAgentRunPlanEntry[],
  lock: ExperimentalDesignSkillUniqueCalibrationLock,
  rootDir: string,
): void {
  if (plan.length !== lock.matrix.expectedRows) {
    throw new Error(`Skill-unique calibration row mismatch: expected ${lock.matrix.expectedRows}, got ${plan.length}`)
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
      || row.command[0] !== process.execPath
      || row.command[1] !== "run"
      || row.command[2] !== path.resolve(rootDir, lock.harness.execution.sourceEntrypoint.path)
      || row.command[3] !== "run"
    ) {
      throw new Error("Skill-unique calibration plan identity or runtime drift")
    }
    const pairKey = `${row.caseId}:${row.runIndex}`
    const systems = pairSystems.get(pairKey) ?? new Set<string>()
    systems.add(row.system)
    pairSystems.set(pairKey, systems)
  }
  if (
    pairSystems.size !== lock.matrix.expectedPairs
    || [...pairSystems.values()].some((systems) => systems.size !== 2)
  ) {
    throw new Error("Skill-unique calibration plan does not contain complete pairs")
  }
}

export async function buildExperimentalDesignSkillUniqueCalibrationPlan(
  input: ExperimentalDesignSkillUniqueCalibrationRunArgs,
): Promise<ExperimentalDesignSkillUniqueCalibrationPlan> {
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.isAbsolute(input.outDir) ? path.resolve(input.outDir) : path.resolve(rootDir, input.outDir)
  const lockPath = path.isAbsolute(input.lockPath) ? input.lockPath : path.resolve(rootDir, input.lockPath)
  const lock = await readAndValidateExperimentalDesignSkillUniqueCalibrationLock({ rootDir, lockPath })
  const runArgs = calibrationRunArgs(lock, rootDir, outDir, input.phase)
  const plan = projectManagedPiPlan(await buildPlan(runArgs), lock, rootDir)
  assertCalibrationPlan(plan, lock, rootDir)
  return {
    schemaVersion: "skill-ir-experimental-design-skill-unique-calibration-plan/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    phase: input.phase,
    lock,
    runArgs,
    plan,
  }
}

export function selectExperimentalDesignSkillUniqueQualificationRow(
  plan: RealAgentRunPlanEntry[],
  lock: ExperimentalDesignSkillUniqueCalibrationLock,
): RealAgentRunPlanEntry {
  const matches = plan.filter((row) =>
    row.system === lock.qualification.system
    && row.runIndex === lock.qualification.runIndex
    && row.caseId.endsWith(`:${lock.qualification.taskId}`)
  )
  if (matches.length !== 1) {
    throw new Error(`Skill-unique qualification requires exactly one row, got ${matches.length}`)
  }
  return matches[0]!
}

export function buildExperimentalDesignSkillUniqueQualificationReport(input: {
  lock: ExperimentalDesignSkillUniqueCalibrationLock
  localPi: z.input<typeof LocalPiQualificationSchema>
  resourceProbe: z.input<typeof ResourceProbeResultSchema>
  route: {
    row: z.input<typeof RouteRowSchema>
    outputs: z.input<typeof OutputQualificationSchema>
    harnessResidue: Array<"AGENTS.md" | ".pi-skills">
  } | null
}): ExperimentalDesignSkillUniqueQualificationReport {
  const localPi = LocalPiQualificationSchema.parse(input.localPi)
  const resourceProbe = ResourceProbeResultSchema.parse(input.resourceProbe)
  const route = input.route === null ? null : {
    row: RouteRowSchema.parse(input.route.row),
    outputs: OutputQualificationSchema.parse(input.route.outputs),
    harnessResidue: input.route.harnessResidue,
  }
  const passed = localPi.status === "passed"
    && resourceProbe.status === "ok"
    && route !== null
    && route.row.caseId.endsWith(`:${input.lock.qualification.taskId}`)
    && route.row.exitCode === 0
    && route.row.runStatus === "ok"
    && route.outputs.present === route.outputs.declared
    && route.outputs.missing.length === 0
    && route.harnessResidue.length === 0
  return ExperimentalDesignSkillUniqueQualificationReportSchema.parse({
    schemaVersion: "skill-ir-experimental-design-skill-unique-qualification/v1",
    calibrationId: input.lock.calibrationId,
    methodEvidence: false,
    status: passed ? "passed" : "failed",
    localPi,
    resourceProbe,
    route,
  })
}

export async function ensureExperimentalDesignSkillUniqueAsciiNodeModules(
  rootDir: string,
  linkRoot: string,
): Promise<string> {
  const resolvedLinkRoot = path.resolve(linkRoot)
  if (!/^[\x00-\x7f]+$/u.test(resolvedLinkRoot)) {
    throw new Error("Skill-unique Pi junction root must be ASCII")
  }
  await mkdir(resolvedLinkRoot, { recursive: true })
  const target = await realpath(path.resolve(rootDir, "node_modules"))
  const linkPath = path.join(resolvedLinkRoot, "skvm-node-modules-pi-0.67.68")
  try {
    const stat = await lstat(linkPath)
    if (!stat.isSymbolicLink()) {
      throw new Error("Skill-unique Pi ASCII path exists but is not a junction")
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    await symlink(target, linkPath, "junction")
  }
  const observedTarget = await realpath(linkPath)
  const normalize = (value: string) => process.platform === "win32" ? value.toLowerCase() : value
  if (normalize(observedTarget) !== normalize(target)) {
    throw new Error("Skill-unique Pi ASCII junction target mismatch")
  }
  return linkPath
}

async function calibrationEnvironment(
  rootDir: string,
  env: Record<string, string | undefined>,
  lock: ExperimentalDesignSkillUniqueCalibrationLock,
): Promise<Record<string, string | undefined>> {
  if (lock.harness.execution.piResolution === "installed-package-node") {
    return { ...env, SKVM_AUTO_PROBE: "0" }
  }
  const asciiNodeModules = await ensureExperimentalDesignSkillUniqueAsciiNodeModules(
    rootDir,
    path.join(tmpdir(), "skvm-skill-ir-harness"),
  )
  const localBin = path.join(asciiNodeModules, ".bin")
  const currentPath = env.PATH ?? env.Path ?? ""
  const mergedPath = `${localBin}${path.delimiter}${currentPath}`
  return {
    ...env,
    PATH: mergedPath,
    ...(process.platform === "win32" ? { Path: mergedPath } : {}),
    SKVM_AUTO_PROBE: "0",
  }
}

export function buildExperimentalDesignSkillUniquePiVersionCommand(
  lock: ExperimentalDesignSkillUniqueCalibrationLock,
  rootDir: string,
): string[] {
  if (lock.harness.execution.piResolution === "installed-package-node") {
    const node = Bun.which(lock.harness.execution.nodeCommand)
    if (!node) throw new Error("Skill-unique calibration Node executable is unavailable")
    return [node, path.resolve(rootDir, lock.harness.execution.piCli.path), "--version"]
  }
  return [path.resolve(rootDir, lock.harness.executable), "--version"]
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

function summarizeLocalPi(
  lock: ExperimentalDesignSkillUniqueCalibrationLock,
  execution: { exitCode?: number; timedOut: boolean; durationMs?: number; stdout: string; stderr: string },
): z.infer<typeof LocalPiQualificationSchema> {
  const stdout = execution.stdout.trim()
  const stderr = execution.stderr.trim()
  const observedVersion = stdout.length > 0 && stderr.length > 0 ? "" : stdout || stderr
  return LocalPiQualificationSchema.parse({
    schemaVersion: "skill-ir-local-pi-qualification/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    status: execution.exitCode === 0 && !execution.timedOut && observedVersion === lock.harness.adapterVersion
      ? "passed"
      : "failed",
    executable: lock.harness.executable,
    expectedVersion: lock.harness.adapterVersion,
    observedVersion,
    ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
    timedOut: execution.timedOut,
    ...(execution.durationMs !== undefined ? { durationMs: execution.durationMs } : {}),
  })
}

async function inspectOutputs(workDir: string): Promise<z.infer<typeof OutputQualificationSchema>> {
  const declaredPaths = ["design/replication-plan.json", "design/analysis-plan.json"] as const
  const missing: Array<typeof declaredPaths[number]> = []
  for (const relativePath of declaredPaths) {
    try {
      const stat = await lstat(path.join(workDir, ...relativePath.split("/")))
      if (!stat.isFile() || stat.isSymbolicLink()) missing.push(relativePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      missing.push(relativePath)
    }
  }
  return { declared: 2, present: declaredPaths.length - missing.length, missing }
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

function projectRouteRow(
  row: RawAgentRunRow,
  lock: ExperimentalDesignSkillUniqueCalibrationLock,
): z.input<typeof RouteRowSchema> {
  return {
    caseId: row.caseId,
    system: "original",
    runIndex: 1,
    model: lock.model.route,
    adapter: lock.harness.adapter,
    adapterVersion: lock.harness.adapterVersion,
    panelConfigId: lock.calibrationId,
    exitCode: row.exitCode,
    runStatus: row.runStatus ?? "ok",
    durationMs: row.durationMs,
    attempts: 1,
  }
}

async function writePlan(built: ExperimentalDesignSkillUniqueCalibrationPlan, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, "plan.json"), `${JSON.stringify(built, null, 2)}\n`, "utf8")
}

async function readPassedQualification(filePath: string): Promise<ExperimentalDesignSkillUniqueQualificationReport> {
  const report = ExperimentalDesignSkillUniqueQualificationReportSchema.parse(
    JSON.parse(await readFile(filePath, "utf8")),
  )
  if (report.status !== "passed") throw new Error("Skill-unique qualification did not pass")
  return report
}

export async function runExperimentalDesignSkillUniqueCalibration(
  input: ExperimentalDesignSkillUniqueCalibrationRunArgs,
  baseEnv: Record<string, string | undefined> = process.env,
): Promise<
  ExperimentalDesignSkillUniqueCalibrationPlan
  | ExperimentalDesignSkillUniqueQualificationReport
  | ExperimentalDesignSkillUniqueCalibrationGateReport
> {
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.isAbsolute(input.outDir) ? path.resolve(input.outDir) : path.resolve(rootDir, input.outDir)
  await mkdir(outDir, { recursive: true })
  if (input.phase === "plan") {
    const built = await buildExperimentalDesignSkillUniqueCalibrationPlan({ ...input, rootDir, outDir })
    await writePlan(built, outDir)
    return built
  }

  const planOutDir = input.phase === "qualification" ? path.join(outDir, "qualification-work") : outDir
  const built = await buildExperimentalDesignSkillUniqueCalibrationPlan({ ...input, rootDir, outDir: planOutDir })
  const env = await calibrationEnvironment(rootDir, baseEnv, built.lock)
  assertRequiredEnv(built.runArgs, env)
  if (input.phase === "qualification") {
    await writePlan(built, planOutDir)
    const localPi = summarizeLocalPi(
      built.lock,
      await runCommandWithTimeout(
        buildExperimentalDesignSkillUniquePiVersionCommand(built.lock, rootDir),
        30000,
        env,
      ),
    )
    const probePath = path.relative(rootDir, path.join(outDir, "resource-probe.json")).split(path.sep).join("/")
    if (!probePath || probePath.startsWith("../")) {
      throw new Error("Skill-unique calibration output directory must remain inside repository root")
    }
    const resourceProbe = await runResourceProbeFile({
      rootDir,
      contract: built.lock.frozenInputs.resourceContract.path,
      out: probePath,
    }, env)
    let route: Parameters<typeof buildExperimentalDesignSkillUniqueQualificationReport>[0]["route"] = null
    if (localPi.status === "passed" && resourceProbe.status === "ok") {
      const qualificationRow = selectExperimentalDesignSkillUniqueQualificationRow(built.plan, built.lock)
      await executePlan([qualificationRow], built.runArgs, env)
      const rawRows = await readJsonl<RawAgentRunRow>(path.join(built.runArgs.outDir, "raw-runs.jsonl"))
      if (rawRows.length !== 1) {
        throw new Error(`Skill-unique qualification expected one raw row, got ${rawRows.length}`)
      }
      route = {
        row: projectRouteRow(rawRows[0]!, built.lock),
        outputs: await inspectOutputs(qualificationRow.workDir),
        harnessResidue: await inspectHarnessResidue(qualificationRow.workDir),
      }
    }
    const report = buildExperimentalDesignSkillUniqueQualificationReport({
      lock: built.lock,
      localPi,
      resourceProbe,
      route,
    })
    await writeFile(path.join(outDir, "qualification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
    return report
  }

  await readPassedQualification(path.join(outDir, "qualification.json"))
  await writePlan(built, outDir)
  await executePlan(built.plan, built.runArgs, env)
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
  const gate = evaluateExperimentalDesignSkillUniqueCalibrationGate(
    await readJsonl<ScoredAgentRunRow>(scoredPath),
    built.lock,
  )
  await writeFile(path.join(outDir, "gate-report.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8")
  return gate
}

export function parseExperimentalDesignSkillUniqueCalibrationRunArgs(
  argv: string[],
): ExperimentalDesignSkillUniqueCalibrationRunArgs {
  let rootDir = process.cwd()
  let lockPath: string | undefined
  let outDir: string | undefined
  let phase: ExperimentalDesignSkillUniqueCalibrationPhase | undefined
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
  runExperimentalDesignSkillUniqueCalibration(
    parseExperimentalDesignSkillUniqueCalibrationRunArgs(process.argv.slice(2)),
  ).then((result) => {
    const status = "status" in result
      ? result.status
      : "passed" in result
        ? (result.passed ? "passed" : "failed")
        : result.phase
    console.log(JSON.stringify({ status }, null, 2))
    if (("status" in result && result.status === "failed") || ("passed" in result && !result.passed)) {
      process.exitCode = 1
    }
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
