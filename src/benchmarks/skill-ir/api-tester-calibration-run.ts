import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import {
  evaluateApiTesterCalibrationGate,
  readAndValidateApiTesterCalibrationLock,
  type ApiTesterCalibrationGateReport,
  type ApiTesterCalibrationLock,
} from "./api-tester-calibration.ts"
import { assertRequiredEnv, buildPlan, executePlan, type RealAgentRunArgs } from "./real-agent-run.ts"
import type { RealAgentRunPlanEntry } from "./real-agent.ts"
import { runResourceProbeFile } from "./resource-contract-run.ts"
import { runCommandWithTimeout } from "./route-probe.ts"
import { scoreRealAgentRuns } from "./score-real-agent-runs.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"

export type ApiTesterCalibrationPhase = "plan" | "qualification" | "execute"
export type ApiTesterCalibrationRunArgs = {
  rootDir: string
  lockPath: string
  outDir: string
  phase: ApiTesterCalibrationPhase
}
export type ApiTesterCalibrationPlan = {
  schemaVersion: "skill-ir-api-tester-calibration-plan/v1"
  calibrationId: string
  methodEvidence: false
  phase: ApiTesterCalibrationPhase
  lock: ApiTesterCalibrationLock
  runArgs: RealAgentRunArgs
  plan: RealAgentRunPlanEntry[]
}

const OutputPathSchema = z.enum([
  "api-test-generator.mjs",
  "generated/api-test-plan.json",
  "api-test-report.json",
])
const OutputQualificationSchema = z.object({
  declared: z.literal(3),
  present: z.number().int().min(0).max(3),
  missing: z.array(OutputPathSchema),
}).strict()
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

export const ApiTesterQualificationReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-qualification/v1"),
  calibrationId: z.literal("api-tester-pi-direct-cli-short-path-development-v1"),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  localPi: LocalPiSchema,
  resourceProbe: z.object({
    status: z.enum(["ok", "failed", "unavailable"]),
    requiredModules: z.array(z.string()),
  }).strict(),
  route: RouteSchema.nullable(),
}).strict()
export type ApiTesterQualificationReport = z.infer<typeof ApiTesterQualificationReportSchema>

function runArgs(lock: ApiTesterCalibrationLock, rootDir: string, outDir: string, phase: ApiTesterCalibrationPhase): RealAgentRunArgs {
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

function managedPlan(plan: RealAgentRunPlanEntry[], lock: ApiTesterCalibrationLock, rootDir: string) {
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

function assertPlan(plan: RealAgentRunPlanEntry[], lock: ApiTesterCalibrationLock, rootDir: string): void {
  if (plan.length !== lock.matrix.expectedRows) throw new Error("API tester calibration row mismatch")
  const pairs = new Map<string, Set<string>>()
  for (const row of plan) {
    const taskId = row.caseId.split(":").at(-1)
    if (!lock.matrix.taskIds.includes(taskId as typeof lock.matrix.taskIds[number])
      || row.model !== lock.model.route || row.adapter !== lock.harness.adapter
      || row.panelConfigId !== lock.calibrationId || row.command[0] !== process.execPath
      || row.command[2] !== path.resolve(rootDir, lock.harness.execution.sourceEntrypoint.path)
      || !row.command.includes("--adapter-config=managed")
      || !row.command.includes(`--timeout-ms=${lock.runtime.taskTimeoutMs}`)
      || !row.command.includes(`--max-steps=${lock.runtime.maxSteps}`)) {
      throw new Error("API tester calibration plan identity drift")
    }
    const key = `${row.caseId}:${row.runIndex}`
    const systems = pairs.get(key) ?? new Set<string>()
    systems.add(row.system)
    pairs.set(key, systems)
  }
  if (pairs.size !== lock.matrix.expectedPairs || [...pairs.values()].some((entry) => entry.size !== 2)) {
    throw new Error("API tester calibration incomplete pairs")
  }
}

export function assertApiTesterWorkDirBudget(
  plan: Array<Pick<RealAgentRunPlanEntry, "workDir">>, maximumWorkDirLength: number,
): void {
  const over = plan.find((row) => path.resolve(row.workDir).length > maximumWorkDirLength)
  if (over) throw new Error(`API tester calibration workdir length exceeds ${maximumWorkDirLength}`)
}

export async function buildApiTesterCalibrationPlan(input: ApiTesterCalibrationRunArgs): Promise<ApiTesterCalibrationPlan> {
  const rootDir = path.resolve(input.rootDir)
  const lockPath = path.isAbsolute(input.lockPath) ? input.lockPath : path.resolve(rootDir, input.lockPath)
  const lock = await readAndValidateApiTesterCalibrationLock({ rootDir, lockPath })
  const baseOutDir = path.resolve(rootDir, lock.harness.execution.outputRoot)
  const expected = input.phase === "qualification" ? path.join(baseOutDir, "qualification-work") : baseOutDir
  const outDir = path.isAbsolute(input.outDir) ? path.resolve(input.outDir) : path.resolve(rootDir, input.outDir)
  if (outDir !== path.resolve(expected)) throw new Error("API tester calibration output root drift")
  const args = runArgs(lock, rootDir, outDir, input.phase)
  const plan = managedPlan(await buildPlan(args), lock, rootDir)
  assertPlan(plan, lock, rootDir)
  assertApiTesterWorkDirBudget(plan, lock.harness.execution.maximumWorkDirLength)
  return {
    schemaVersion: "skill-ir-api-tester-calibration-plan/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    phase: input.phase,
    lock,
    runArgs: args,
    plan,
  }
}

export function selectApiTesterQualificationRow(plan: RealAgentRunPlanEntry[], lock: ApiTesterCalibrationLock) {
  const matches = plan.filter((row) => row.system === lock.qualification.system
    && row.runIndex === lock.qualification.runIndex && row.caseId.endsWith(`:${lock.qualification.taskId}`))
  if (matches.length !== 1) throw new Error(`API tester qualification requires one row, got ${matches.length}`)
  return matches[0]!
}

export function buildApiTesterPiVersionCommand(lock: ApiTesterCalibrationLock, rootDir: string): string[] {
  const node = Bun.which(lock.harness.execution.nodeCommand)
  if (!node) throw new Error("API tester Node executable unavailable")
  return [node, path.resolve(rootDir, lock.harness.execution.piCli.path), "--version"]
}

export function buildApiTesterQualificationReport(input: {
  lock: ApiTesterCalibrationLock
  localPi: z.input<typeof LocalPiSchema>
  resourceProbe: unknown
  route: z.input<typeof RouteSchema> | null
}): ApiTesterQualificationReport {
  const localPi = LocalPiSchema.parse(input.localPi)
  const resource = ResourceProbeSchema.parse(input.resourceProbe)
  const resourceProbe = { status: resource.status, requiredModules: resource.requiredModules }
  const route = input.route === null ? null : RouteSchema.parse(input.route)
  const passed = localPi.status === "passed" && resourceProbe.status === "ok" && route !== null
    && route.row.caseId.endsWith(`:${input.lock.qualification.taskId}`)
    && route.row.exitCode === 0 && route.row.runStatus === "ok"
    && route.outputs.present === route.outputs.declared && route.outputs.missing.length === 0
    && route.harnessResidue.length === 0
  return ApiTesterQualificationReportSchema.parse({
    schemaVersion: "skill-ir-api-tester-qualification/v1",
    calibrationId: input.lock.calibrationId,
    methodEvidence: false,
    status: passed ? "passed" : "failed",
    localPi,
    resourceProbe,
    route,
  })
}

async function inspectOutputs(workDir: string): Promise<z.infer<typeof OutputQualificationSchema>> {
  const declared = ["api-test-generator.mjs", "generated/api-test-plan.json", "api-test-report.json"] as const
  const missing: Array<typeof declared[number]> = []
  for (const relativePath of declared) {
    try {
      const stat = await lstat(path.join(workDir, ...relativePath.split("/")))
      if (!stat.isFile() || stat.isSymbolicLink()) missing.push(relativePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      missing.push(relativePath)
    }
  }
  return { declared: 3, present: declared.length - missing.length, missing }
}

async function residue(workDir: string): Promise<Array<"AGENTS.md" | ".pi-skills">> {
  const found: Array<"AGENTS.md" | ".pi-skills"> = []
  for (const name of ["AGENTS.md", ".pi-skills"] as const) {
    try { await lstat(path.join(workDir, name)); found.push(name) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
  }
  return found
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

async function writePlan(built: ApiTesterCalibrationPlan, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, "plan.json"), `${JSON.stringify(built, null, 2)}\n`, "utf8")
}

export async function runApiTesterCalibration(
  input: ApiTesterCalibrationRunArgs,
  env: Record<string, string | undefined> = process.env,
): Promise<ApiTesterCalibrationPlan | ApiTesterQualificationReport | ApiTesterCalibrationGateReport> {
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.isAbsolute(input.outDir) ? path.resolve(input.outDir) : path.resolve(rootDir, input.outDir)
  await mkdir(outDir, { recursive: true })
  if (input.phase === "plan") {
    const built = await buildApiTesterCalibrationPlan({ ...input, rootDir, outDir })
    await writePlan(built, outDir)
    return built
  }
  const planOutDir = input.phase === "qualification" ? path.join(outDir, "qualification-work") : outDir
  const built = await buildApiTesterCalibrationPlan({ ...input, rootDir, outDir: planOutDir })
  const childEnv = { ...env, SKVM_AUTO_PROBE: "0" }
  assertRequiredEnv(built.runArgs, childEnv)
  if (input.phase === "qualification") {
    await writePlan(built, planOutDir)
    const version = await runCommandWithTimeout(buildApiTesterPiVersionCommand(built.lock, rootDir), 30_000, childEnv)
    const observedVersion = version.stdout.trim() || version.stderr.trim()
    const localPi = {
      status: version.exitCode === 0 && !version.timedOut && observedVersion === built.lock.harness.adapterVersion
        ? "passed" as const : "failed" as const,
      observedVersion,
      ...(version.exitCode !== undefined ? { exitCode: version.exitCode } : {}),
      timedOut: version.timedOut,
    }
    const probeOut = path.relative(rootDir, path.join(outDir, "resource-probe.json")).split(path.sep).join("/")
    if (!probeOut || probeOut.startsWith("../")) throw new Error("API tester output must remain inside repository")
    const resourceProbe = await runResourceProbeFile({
      rootDir, contract: built.lock.frozenInputs.resourceContract.path, out: probeOut,
    }, childEnv)
    let route: z.input<typeof RouteSchema> | null = null
    if (localPi.status === "passed" && resourceProbe.status === "ok") {
      const selected = selectApiTesterQualificationRow(built.plan, built.lock)
      await executePlan([selected], built.runArgs, childEnv)
      const rows = await readJsonl<RawAgentRunRow>(path.join(built.runArgs.outDir, "raw-runs.jsonl"))
      if (rows.length !== 1) throw new Error(`API tester qualification expected one row, got ${rows.length}`)
      route = {
        row: { caseId: rows[0]!.caseId, exitCode: rows[0]!.exitCode, runStatus: rows[0]!.runStatus ?? "ok", durationMs: rows[0]!.durationMs },
        outputs: await inspectOutputs(selected.workDir),
        harnessResidue: await residue(selected.workDir),
      }
    }
    const report = buildApiTesterQualificationReport({ lock: built.lock, localPi, resourceProbe, route })
    await writeFile(path.join(outDir, "qualification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
    return report
  }
  const qualification = ApiTesterQualificationReportSchema.parse(JSON.parse(await readFile(path.join(outDir, "qualification.json"), "utf8")))
  if (qualification.status !== "passed") throw new Error("API tester qualification did not pass")
  await writePlan(built, outDir)
  await executePlan(built.plan, built.runArgs, childEnv)
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
  const gate = evaluateApiTesterCalibrationGate(await readJsonl<ScoredAgentRunRow>(scoredPath), built.lock)
  await writeFile(path.join(outDir, "gate-report.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8")
  return gate
}

export function parseApiTesterCalibrationRunArgs(argv: string[]): ApiTesterCalibrationRunArgs {
  let rootDir = process.cwd(), lockPath: string | undefined, outDir: string | undefined
  let phase: ApiTesterCalibrationPhase | undefined
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
  runApiTesterCalibration(parseApiTesterCalibrationRunArgs(process.argv.slice(2))).then((result) => {
    const status = "status" in result ? result.status : "passed" in result ? (result.passed ? "passed" : "failed") : result.phase
    console.log(JSON.stringify({ status }, null, 2))
    if (status === "failed") process.exitCode = 1
  }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1) })
}
