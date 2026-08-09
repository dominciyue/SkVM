import { lstat, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { z } from "zod"
import {
  evaluatePublicContractCalibrationGate,
  readAndValidatePublicContractCalibrationLock,
  type PublicContractCalibrationGateReport,
  type AnyPublicContractCalibrationLock,
} from "./public-contract-calibration.ts"
import { assertRequiredEnv, buildPlan, executePlan, type RealAgentRunArgs } from "./real-agent-run.ts"
import type { RealAgentRunPlanEntry } from "./real-agent.ts"
import { scoreRealAgentRuns } from "./score-real-agent-runs.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"

export type PublicContractCalibrationPhase = "plan" | "qualification" | "execute"
export type PublicContractCalibrationRunArgs = {
  rootDir: string
  lockPath: string
  outDir: string
  phase: PublicContractCalibrationPhase
}
export type PublicContractCalibrationPlan = {
  schemaVersion: "skill-ir-public-contract-calibration-plan/v1"
  calibrationId: string
  methodEvidence: false
  phase: PublicContractCalibrationPhase
  lock: AnyPublicContractCalibrationLock
  runArgs: RealAgentRunArgs
  plan: RealAgentRunPlanEntry[]
}

const QualificationSchema = z.object({
  schemaVersion: z.literal("skill-ir-public-contract-calibration-qualification/v1"),
  calibrationId: z.string().min(1),
  skillId: z.string().min(1),
  methodEvidence: z.literal(false),
  status: z.enum(["passed", "failed"]),
  route: z.object({
    caseId: z.string().min(1),
    exitCode: z.number().int(),
    runStatus: z.string().min(1),
    durationMs: z.number().nonnegative(),
    attempts: z.number().int().positive(),
  }).strict(),
  scorer: z.object({
    loaded: z.literal(true),
    scoredRows: z.literal(1),
    deterministic: z.boolean(),
    semanticSuccess: z.boolean(),
    evaluatorScore: z.number().min(0).max(1).optional(),
  }).strict(),
  harnessResidue: z.array(z.enum(["AGENTS.md", ".pi-skills"])),
}).strict()
export type PublicContractCalibrationQualification = z.infer<typeof QualificationSchema>

function runArgs(
  lock: AnyPublicContractCalibrationLock,
  rootDir: string,
  outDir: string,
  phase: PublicContractCalibrationPhase,
): RealAgentRunArgs {
  const runRoot = phase === "qualification" ? path.join(outDir, "qualification", "run") : path.join(outDir, "run")
  return {
    corpus: lock.corpus,
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.adapter.id,
    adapterVersion: lock.adapter.version,
    repetitions: lock.matrix.repetitions,
    panelConfigId: lock.calibrationId,
    outDir: runRoot,
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

function projectSourceRunner(
  plan: RealAgentRunPlanEntry[],
  lock: AnyPublicContractCalibrationLock,
  rootDir: string,
): RealAgentRunPlanEntry[] {
  return plan.map((row) => ({
    ...row,
    command: [
      process.execPath,
      "run",
      path.resolve(rootDir, "src/index.ts"),
      "run",
      ...row.command.slice(4).filter((arg) =>
        !arg.startsWith("--adapter-config=")
        && !arg.startsWith("--timeout-ms=")
        && !arg.startsWith("--max-steps=")),
      `--adapter-config=${lock.runtime.adapterConfig}`,
      `--timeout-ms=${lock.runtime.taskTimeoutMs}`,
      `--max-steps=${lock.runtime.maxSteps}`,
    ],
  }))
}

function assertOutputRoot(rootDir: string, outDir: string): void {
  const resultsRoot = path.resolve(rootDir, "results/skill-ir")
  const relative = path.relative(resultsRoot, outDir)
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Public-contract calibration output must be a child of results/skill-ir")
  }
}

function assertPlan(plan: RealAgentRunPlanEntry[], lock: AnyPublicContractCalibrationLock, rootDir: string): void {
  if (plan.length !== lock.matrix.expectedRows) throw new Error("Public-contract calibration row mismatch")
  const pairs = new Map<string, Set<string>>()
  for (const row of plan) {
    const taskId = row.caseId.split(":").at(-1)
    if (!taskId || !lock.matrix.taskIds.includes(taskId)
      || row.model !== lock.model.route || row.modelFamily !== lock.model.family
      || row.adapter !== lock.adapter.id || row.adapterVersion !== lock.adapter.version
      || row.panelConfigId !== lock.calibrationId
      || row.command[0] !== process.execPath || row.command[1] !== "run"
      || row.command[2] !== path.resolve(rootDir, "src/index.ts") || row.command[3] !== "run"
      || !row.command.includes(`--adapter-config=${lock.runtime.adapterConfig}`)
      || !row.command.includes(`--timeout-ms=${lock.runtime.taskTimeoutMs}`)
      || !row.command.includes(`--max-steps=${lock.runtime.maxSteps}`)) {
      throw new Error("Public-contract calibration plan identity drift")
    }
    const key = `${row.caseId}:${row.runIndex}`
    const systems = pairs.get(key) ?? new Set<string>()
    systems.add(row.system)
    pairs.set(key, systems)
  }
  if (pairs.size !== lock.matrix.expectedPairs || [...pairs.values()].some((systems) => systems.size !== 2)) {
    throw new Error("Public-contract calibration incomplete pairs")
  }
}

export async function buildPublicContractCalibrationPlan(
  input: PublicContractCalibrationRunArgs,
): Promise<PublicContractCalibrationPlan> {
  const rootDir = path.resolve(input.rootDir)
  const lockPath = path.isAbsolute(input.lockPath) ? input.lockPath : path.resolve(rootDir, input.lockPath)
  const outDir = path.isAbsolute(input.outDir) ? path.resolve(input.outDir) : path.resolve(rootDir, input.outDir)
  assertOutputRoot(rootDir, outDir)
  const lock = await readAndValidatePublicContractCalibrationLock({ rootDir, lockPath })
  const args = runArgs(lock, rootDir, outDir, input.phase)
  const plan = projectSourceRunner(await buildPlan(args), lock, rootDir)
  assertPlan(plan, lock, rootDir)
  return {
    schemaVersion: "skill-ir-public-contract-calibration-plan/v1",
    calibrationId: lock.calibrationId,
    methodEvidence: false,
    phase: input.phase,
    lock,
    runArgs: args,
    plan,
  }
}

export function selectPublicContractQualificationRow(
  plan: RealAgentRunPlanEntry[],
  lock: AnyPublicContractCalibrationLock,
): RealAgentRunPlanEntry {
  const matches = plan.filter((row) => row.system === lock.qualification.system
    && row.runIndex === lock.qualification.runIndex
    && row.caseId.endsWith(`:${lock.qualification.taskId}`))
  if (matches.length !== 1) throw new Error(`Public-contract qualification requires one row, got ${matches.length}`)
  return matches[0]!
}

export async function loadPublicContractCalibrationScorer(rootDir: string, scorerPath: string): Promise<void> {
  const root = path.resolve(rootDir)
  const absolute = path.resolve(root, ...scorerPath.split("/"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Public-contract calibration scorer escapes repository root")
  }
  const url = pathToFileURL(absolute)
  url.searchParams.set("public-contract-calibration", "1")
  await import(url.href)
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

async function harnessResidue(workDir: string): Promise<Array<"AGENTS.md" | ".pi-skills">> {
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

export function buildPublicContractQualificationReport(input: {
  lock: AnyPublicContractCalibrationLock
  raw: RawAgentRunRow
  scored: ScoredAgentRunRow
  harnessResidue: Array<"AGENTS.md" | ".pi-skills">
}): PublicContractCalibrationQualification {
  return QualificationSchema.parse({
    schemaVersion: "skill-ir-public-contract-calibration-qualification/v1",
    calibrationId: input.lock.calibrationId,
    skillId: input.lock.skillId,
    methodEvidence: false,
    status: input.raw.exitCode === 0 && (input.raw.runStatus ?? "ok") === "ok"
      && input.scored.failureType !== "infrastructure"
      && input.scored.successSource === "deterministic-evaluator"
      && input.harnessResidue.length === 0 ? "passed" : "failed",
    route: {
      caseId: input.raw.caseId,
      exitCode: input.raw.exitCode,
      runStatus: input.raw.runStatus ?? "ok",
      durationMs: input.raw.durationMs,
      attempts: input.raw.attempts ?? 1,
    },
    scorer: {
      loaded: true,
      scoredRows: 1,
      deterministic: input.scored.successSource === "deterministic-evaluator",
      semanticSuccess: input.scored.success,
      ...(input.scored.evaluatorScore !== undefined ? { evaluatorScore: input.scored.evaluatorScore } : {}),
    },
    harnessResidue: input.harnessResidue,
  })
}

async function writePlan(built: PublicContractCalibrationPlan, outDir: string): Promise<void> {
  const target = built.phase === "qualification" ? path.join(outDir, "qualification") : outDir
  await mkdir(target, { recursive: true })
  await writeFile(path.join(target, "plan.json"), `${JSON.stringify(built, null, 2)}\n`, "utf8")
}

export async function runPublicContractCalibration(
  input: PublicContractCalibrationRunArgs,
  env: Record<string, string | undefined> = process.env,
): Promise<PublicContractCalibrationPlan | PublicContractCalibrationQualification | PublicContractCalibrationGateReport> {
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.isAbsolute(input.outDir) ? path.resolve(input.outDir) : path.resolve(rootDir, input.outDir)
  const built = await buildPublicContractCalibrationPlan({ ...input, rootDir, outDir })
  await writePlan(built, outDir)
  if (input.phase === "plan") return built

  const childEnv = { ...env, SKVM_AUTO_PROBE: "0" }
  assertRequiredEnv(built.runArgs, childEnv)
  await loadPublicContractCalibrationScorer(rootDir, built.lock.frozenInputs.scorer.path)
  if (input.phase === "qualification") {
    const selected = selectPublicContractQualificationRow(built.plan, built.lock)
    await executePlan([selected], built.runArgs, childEnv)
    const rawPath = path.join(built.runArgs.outDir, "raw-runs.jsonl")
    const rawRows = await readJsonl<RawAgentRunRow>(rawPath)
    if (rawRows.length !== 1) throw new Error(`Public-contract qualification expected one row, got ${rawRows.length}`)
    const scoredPath = path.join(outDir, "qualification", "scored-runs.jsonl")
    await scoreRealAgentRuns({
      raw: rawPath,
      tasks: built.lock.frozenInputs.tasks.path,
      corpus: built.lock.corpus,
      rootDir,
      out: scoredPath,
      allowTasksAuthored: true,
      normalizePreIrRuntime: false,
    })
    const scoredRows = await readJsonl<ScoredAgentRunRow>(scoredPath)
    if (scoredRows.length !== 1) throw new Error("Public-contract qualification scorer row mismatch")
    const raw = rawRows[0]!
    const scored = scoredRows[0]!
    const residue = await harnessResidue(selected.workDir)
    const report = buildPublicContractQualificationReport({
      lock: built.lock,
      raw,
      scored,
      harnessResidue: residue,
    })
    await writeFile(path.join(outDir, "qualification.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
    return report
  }

  const qualification = QualificationSchema.parse(JSON.parse(await readFile(
    path.join(outDir, "qualification.json"), "utf8",
  )))
  if (qualification.status !== "passed" || qualification.calibrationId !== built.lock.calibrationId
    || qualification.skillId !== built.lock.skillId) {
    throw new Error("Public-contract calibration qualification did not pass or identity drifted")
  }
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
  const gate = evaluatePublicContractCalibrationGate(await readJsonl<ScoredAgentRunRow>(scoredPath), built.lock)
  await writeFile(path.join(outDir, "gate-report.json"), `${JSON.stringify(gate, null, 2)}\n`, "utf8")
  return gate
}

export function parsePublicContractCalibrationRunArgs(argv: string[]): PublicContractCalibrationRunArgs {
  let rootDir = process.cwd()
  let lockPath: string | undefined
  let outDir: string | undefined
  let phase: PublicContractCalibrationPhase | undefined
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) rootDir = arg.slice(11)
    else if (arg.startsWith("--lock=")) lockPath = arg.slice(7)
    else if (arg.startsWith("--out-dir=")) outDir = arg.slice(10)
    else if (arg.startsWith("--phase=")) {
      const value = arg.slice(8)
      if (value !== "plan" && value !== "qualification" && value !== "execute") {
        throw new Error("--phase must be plan, qualification, or execute")
      }
      phase = value
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!lockPath || !outDir || !phase) throw new Error("--lock, --out-dir, and --phase are required")
  return { rootDir, lockPath, outDir, phase }
}

if (import.meta.main) {
  runPublicContractCalibration(parsePublicContractCalibrationRunArgs(process.argv.slice(2))).then((result) => {
    console.log(JSON.stringify(result, null, 2))
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
