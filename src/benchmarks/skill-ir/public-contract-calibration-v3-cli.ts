import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { RunExecutionObservationSchema, type RunExecutionObservation } from "../../core/types.ts"
import { sha256Bytes } from "./source-fixture.ts"
import { executeGenericPlanRow } from "./real-agent-run.ts"
import { buildExecutionEnvelope } from "./static-development-v2-run.ts"
import {
  readAndValidatePublicContractCalibrationLock,
  type PublicContractCalibrationLockV3,
} from "./public-contract-calibration.ts"
import {
  buildPublicContractCalibrationV3GateReport,
  buildPublicContractCalibrationV3Plan,
  executePublicContractCalibrationV3Candidates,
} from "./public-contract-calibration-v3-run.ts"
import { loadPublicContractCalibrationScorer } from "./public-contract-calibration-run.ts"
import { scoreRealAgentRuns } from "./score-real-agent-runs.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"

type Phase = "plan" | "qualification" | "execute"

function parseArgs(argv: string[]) {
  const result: { rootDir: string; lock?: string; outDir?: string; phase?: Phase } = { rootDir: process.cwd() }
  for (const arg of argv) {
    if (arg.startsWith("--root-dir=")) result.rootDir = arg.slice("--root-dir=".length)
    else if (arg.startsWith("--lock=")) result.lock = arg.slice("--lock=".length)
    else if (arg.startsWith("--out-dir=")) result.outDir = arg.slice("--out-dir=".length)
    else if (arg.startsWith("--phase=")) {
      const phase = arg.slice("--phase=".length)
      if (phase !== "plan" && phase !== "qualification" && phase !== "execute") throw new Error("invalid phase")
      result.phase = phase
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!result.lock || !result.outDir || !result.phase) throw new Error("--lock, --out-dir, and --phase are required")
  return {
    rootDir: path.resolve(result.rootDir),
    lock: result.lock,
    outDir: path.resolve(result.rootDir, result.outDir),
    phase: result.phase,
  }
}

function assertOutputRoot(rootDir: string, outDir: string): void {
  const resultsRoot = path.resolve(rootDir, "results/skill-ir")
  const relative = path.relative(resultsRoot, outDir)
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Public-contract calibration v3 output must be a child of results/skill-ir")
  }
}

async function countFiles(root: string): Promise<number> {
  let count = 0
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(target)
      else if (entry.isFile()) count += 1
    }
  }
  await visit(root)
  return count
}

async function readObservation(
  observationPath: string,
  raw: RawAgentRunRow & { outerTimedOut?: boolean },
): Promise<RunExecutionObservation> {
  try {
    return RunExecutionObservationSchema.parse(JSON.parse(await readFile(observationPath, "utf8")))
  } catch {
    return {
      schemaVersion: "skvm-run-execution-observation/v1",
      process: {
        exitCode: raw.exitCode,
        termination: raw.outerTimedOut ? "absolute-timeout" : raw.exitCode === 0 ? "natural" : "crash",
        durationMs: raw.durationMs,
      },
      activity: {
        requestDispatched: false, providerResponses: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0,
      },
      terminal: { present: false },
      usage: { available: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      parser: {
        outcome: raw.exitCode === 0 ? "incompatible" : "empty",
        unknownTypes: raw.exitCode === 0 ? ["missing-sidecar"] : [],
      },
    }
  }
}

async function executeRow(
  row: Parameters<typeof executeGenericPlanRow>[0],
  lock: PublicContractCalibrationLockV3,
  env: Record<string, string | undefined>,
) {
  const observationArg = row.command.find((arg) => arg.startsWith("--execution-observation="))
  if (!observationArg) throw new Error(`Public-contract calibration v3 observation path missing: ${row.caseId}`)
  const observationPath = observationArg.slice("--execution-observation=".length)
  await rm(observationPath, { force: true })
  const raw = await executeGenericPlanRow(row, {
    outerWatchdogMs: lock.runtime.outerWatchdogMs,
    exposeOuterTimedOut: true,
  }, env) as RawAgentRunRow & { outerTimedOut?: boolean }
  const taskId = row.caseId.split(":").at(-1)
  if (!taskId) throw new Error(`Public-contract calibration v3 task identity missing: ${row.caseId}`)
  return {
    raw,
    envelope: buildExecutionEnvelope({
      experimentId: lock.calibrationId,
      taskId,
      system: row.system,
      candidateBlock: row.runIndex,
      attemptId: `${taskId}:block-${row.runIndex}:${row.system}`,
      observation: await readObservation(observationPath, raw),
      outputFileCount: await countFiles(row.workDir),
      outerWatchdog: raw.outerTimedOut,
    }),
  }
}

function selectedSemanticRows(input: {
  rawRows: RawAgentRunRow[]
  envelopes: ReturnType<typeof buildExecutionEnvelope>[]
  selectedBlocks: Array<{ taskId: string; candidateBlock: number }>
}): RawAgentRunRow[] {
  const selected = new Set(input.selectedBlocks.map((block) => `${block.taskId}\0${block.candidateBlock}`))
  const semantic = new Set(input.envelopes.filter((item) => item.classification === "semantic-complete")
    .map((item) => item.attemptId))
  return input.rawRows.filter((row) => {
    const taskId = row.caseId.split(":").at(-1) ?? ""
    return selected.has(`${taskId}\0${row.runIndex}`) && semantic.has(`${taskId}:block-${row.runIndex}:${row.system}`)
  })
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  assertOutputRoot(args.rootDir, args.outDir)
  const lockPath = path.isAbsolute(args.lock) ? args.lock : path.resolve(args.rootDir, args.lock)
  const lockSha256 = sha256Bytes(await readFile(lockPath))
  const parsed = await readAndValidatePublicContractCalibrationLock({ rootDir: args.rootDir, lockPath })
  if (parsed.schemaVersion !== "skill-ir-public-contract-calibration-lock/v3") {
    throw new Error("Public-contract calibration resilient CLI requires a v3 lock")
  }
  const lock = parsed
  const runRoot = args.phase === "qualification"
    ? path.join(args.outDir, "qualification", "run")
    : path.join(args.outDir, "run")
  const plan = await buildPublicContractCalibrationV3Plan({ rootDir: args.rootDir, outDir: runRoot, lock })
  const planRoot = args.phase === "qualification" ? path.join(args.outDir, "qualification") : args.outDir
  await mkdir(planRoot, { recursive: true })
  await writeFile(path.join(planRoot, "plan.json"), `${JSON.stringify({
    ...plan,
    runArgs: Object.fromEntries(Object.entries(plan.runArgs).map(([key, value]) => [key, value instanceof Set ? [...value] : value])),
  }, null, 2)}\n`, "utf8")
  if (args.phase === "plan") return { phase: args.phase, rows: plan.plan.length }
  if (!process.env[lock.runtime.apiKeyEnv]?.trim()) throw new Error(`Missing ${lock.runtime.apiKeyEnv}`)
  await loadPublicContractCalibrationScorer(args.rootDir, lock.frozenInputs.scorer.path)
  const env = { ...process.env, SKVM_AUTO_PROBE: "0" }

  if (args.phase === "qualification") {
    const row = plan.plan.find((candidate) => candidate.system === lock.qualification.system
      && candidate.runIndex === lock.qualification.candidateBlock
      && candidate.caseId.endsWith(`:${lock.qualification.taskId}`))
    if (!row) throw new Error("Public-contract calibration v3 qualification row missing")
    const executed = await executeRow(row, lock, env)
    const rawPath = path.join(args.outDir, "qualification", "raw-runs.jsonl")
    await writeFile(rawPath, `${JSON.stringify(executed.raw)}\n`, "utf8")
    const scoredPath = path.join(args.outDir, "qualification", "scored-runs.jsonl")
    await scoreRealAgentRuns({
      raw: rawPath, tasks: lock.frozenInputs.tasks.path, corpus: lock.corpus,
      rootDir: args.rootDir, out: scoredPath, allowTasksAuthored: true,
    })
    const scored = (await readJsonl<ScoredAgentRunRow>(scoredPath))[0]
    const qualification = {
      schemaVersion: "skill-ir-public-contract-calibration-qualification/v3",
      calibrationId: lock.calibrationId,
      lockSha256,
      status: executed.envelope.classification === "semantic-complete"
        && scored?.successSource === "deterministic-evaluator" ? "passed" : "failed",
      classification: executed.envelope.classification,
      deterministicScorer: scored?.successSource === "deterministic-evaluator",
      semanticSuccess: scored?.success === true,
      durationMs: executed.envelope.process.durationMs,
    }
    await writeFile(path.join(args.outDir, "qualification.json"), `${JSON.stringify(qualification, null, 2)}\n`, "utf8")
    if (qualification.status !== "passed") throw new Error(`Public-contract calibration v3 qualification failed: ${qualification.classification}`)
    return { phase: args.phase, qualification }
  }

  const qualification = JSON.parse(await readFile(path.join(args.outDir, "qualification.json"), "utf8")) as {
    calibrationId?: string; lockSha256?: string; status?: string; classification?: string;
  }
  if (qualification.calibrationId !== lock.calibrationId || qualification.lockSha256 !== lockSha256
    || qualification.status !== "passed" || qualification.classification !== "semantic-complete") {
    throw new Error("Public-contract calibration v3 qualification identity mismatch")
  }
  const execution = await executePublicContractCalibrationV3Candidates({
    plan: plan.plan,
    lock,
    executeRow: (row) => executeRow(row, lock, env),
  })
  await mkdir(plan.runArgs.outDir, { recursive: true })
  const rawPath = path.join(plan.runArgs.outDir, "raw-runs.jsonl")
  const envelopePath = path.join(plan.runArgs.outDir, "execution-envelopes.jsonl")
  await writeFile(rawPath, `${execution.rawRows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
  await writeFile(envelopePath, `${execution.envelopes.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
  const selectedRaw = selectedSemanticRows({
    rawRows: execution.rawRows,
    envelopes: execution.envelopes,
    selectedBlocks: execution.selection.selectedBlocks,
  })
  const selectedRawPath = path.join(plan.runArgs.outDir, "selected-raw-runs.jsonl")
  await writeFile(selectedRawPath, `${selectedRaw.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8")
  const scoredPath = path.join(plan.runArgs.outDir, "selected-scored-runs.jsonl")
  await scoreRealAgentRuns({
    raw: selectedRawPath, tasks: lock.frozenInputs.tasks.path, corpus: lock.corpus,
    rootDir: args.rootDir, out: scoredPath, allowTasksAuthored: true,
  })
  const gate = buildPublicContractCalibrationV3GateReport({
    lock,
    envelopes: execution.envelopes,
    scoredRows: await readJsonl<ScoredAgentRunRow>(scoredPath),
  })
  const gatePath = path.join(args.outDir, "gate-report.json")
  await writeFile(gatePath, `${JSON.stringify(gate, null, 2)}\n`, "utf8")
  return { phase: args.phase, selection: execution.selection, rawPath, envelopePath, scoredPath, gatePath, passed: gate.passed }
}

if (import.meta.main) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
