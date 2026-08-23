import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { RunExecutionObservationSchema, type RunExecutionObservation } from "../../core/types.ts"
import type { RawAgentRunRow, ScoredAgentRunRow } from "./scoring.ts"
import { runResourceProbeFile } from "./resource-contract-run.ts"
import { executeGenericPlanRow } from "./real-agent-run.ts"
import { scoreRealAgentRuns } from "./score-real-agent-runs.ts"
import { sha256Bytes } from "./source-fixture.ts"
import { buildExecutionEnvelope } from "./static-development-v2-run.ts"
import {
  buildBidsSuccessorDevelopmentPlan,
  buildBidsSuccessorQualification,
  loadBidsSuccessorDevelopmentScorer,
  validateBidsSuccessorDevelopmentLock,
  type BidsSuccessorDevelopmentLock,
  type BidsSuccessorDevelopmentPlan,
} from "./bids-successor-development.ts"

type Phase = "plan" | "qualification"

function serializePlan(plan: BidsSuccessorDevelopmentPlan) {
  return {
    ...plan,
    runArgs: Object.fromEntries(Object.entries(plan.runArgs).map(([key, value]) => [
      key,
      value instanceof Set ? [...value] : value,
    ])),
  }
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name)
    if (entry.isDirectory()) files.push(...await listFiles(root, target))
    else if (entry.isFile()) files.push(path.relative(root, target).replaceAll("\\", "/"))
  }
  return files.sort((left, right) => left.localeCompare(right, "en"))
}

function observationPath(row: BidsSuccessorDevelopmentPlan["plan"][number]) {
  const argument = row.command.find((item) => item.startsWith("--execution-observation="))
  if (!argument) throw new Error(`BIDS successor observation path missing: ${row.caseId}`)
  return argument.slice("--execution-observation=".length)
}

async function readObservation(
  target: string,
  raw: RawAgentRunRow & { outerTimedOut?: boolean },
): Promise<RunExecutionObservation> {
  try {
    return RunExecutionObservationSchema.parse(JSON.parse(await readFile(target, "utf8")))
  } catch {
    return RunExecutionObservationSchema.parse({
      schemaVersion: "skvm-run-execution-observation/v1",
      process: {
        exitCode: raw.exitCode,
        termination: raw.outerTimedOut ? "absolute-timeout" : raw.exitCode === 0 ? "natural" : "crash",
        durationMs: raw.durationMs,
      },
      activity: {
        requestDispatched: false,
        providerResponses: 0,
        assistantMessages: 0,
        toolCalls: 0,
        toolResults: 0,
      },
      terminal: { present: false },
      usage: { available: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      parser: { outcome: raw.exitCode === 0 ? "incompatible" : "empty", unknownTypes: [] },
    })
  }
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

export async function runBidsSuccessorQualification(input: {
  rootDir: string
  lockPath: string
  outDir: string
  lock: BidsSuccessorDevelopmentLock
  plan: BidsSuccessorDevelopmentPlan
  env?: Record<string, string | undefined>
}) {
  const rootDir = path.resolve(input.rootDir)
  const outDir = path.resolve(input.outDir)
  await mkdir(outDir, { recursive: true })
  const resourcePath = path.join(outDir, "resource-probe.json")
  const resource = await runResourceProbeFile({
    rootDir,
    contract: input.lock.frozenInputs.resourceContract.path,
    out: path.relative(rootDir, resourcePath).replaceAll("\\", "/"),
  }, input.env ?? process.env)
  const key = (input.env ?? process.env)[input.lock.runtime.apiKeyEnv]
  if (!key?.trim()) throw new Error(`Missing ${input.lock.runtime.apiKeyEnv}`)
  await loadBidsSuccessorDevelopmentScorer(rootDir, input.lock, input.lock.frozenInputs.scorer.path)
  const rows = input.plan.plan.filter((row) =>
    row.system === input.lock.qualification.system
    && row.runIndex === input.lock.qualification.candidateBlock
    && row.caseId.endsWith(`:${input.lock.qualification.taskId}`))
  if (rows.length !== 1) throw new Error(`BIDS successor qualification requires one row, got ${rows.length}`)
  const row = rows[0]!
  const target = observationPath(row)
  await rm(target, { force: true })
  const raw = await executeGenericPlanRow(row, {
    outerWatchdogMs: input.lock.runtime.outerWatchdogMs,
    exposeOuterTimedOut: true,
  }, { ...(input.env ?? process.env), SKVM_AUTO_PROBE: "0" }) as RawAgentRunRow & { outerTimedOut?: boolean }
  const files = await listFiles(row.workDir)
  const taskId = row.caseId.split(":").at(-1)!
  const envelope = buildExecutionEnvelope({
    experimentId: input.lock.experimentId,
    taskId,
    system: row.system,
    candidateBlock: row.runIndex,
    attemptId: `${taskId}:qualification:${row.system}`,
    observation: await readObservation(target, raw),
    outputFileCount: files.length,
    outerWatchdog: raw.outerTimedOut,
  })
  const rawPath = path.join(outDir, "raw-runs.jsonl")
  await writeFile(rawPath, `${JSON.stringify(raw)}\n`, "utf8")
  const scoredPath = path.join(outDir, "scored-runs.jsonl")
  await scoreRealAgentRuns({
    raw: rawPath,
    tasks: input.lock.frozenInputs.tasks.path,
    rootDir,
    out: scoredPath,
  })
  const scored = (await readJsonl<ScoredAgentRunRow>(scoredPath))[0]
  const expectedFiles = [
    ...input.lock.publicContract.protectedInputs,
    ...input.lock.publicContract.exactOutputs,
  ].sort((left, right) => left.localeCompare(right, "en"))
  const qualification = buildBidsSuccessorQualification({
    experimentId: input.lock.experimentId,
    lockSha256: sha256Bytes(await readFile(input.lockPath)),
    resource: {
      status: resource.status === "ok" ? "ok" : "failed",
      reportPath: path.relative(rootDir, resourcePath).replaceAll("\\", "/"),
      reportSha256: sha256Bytes(await readFile(resourcePath)),
    },
    envelope,
    scorer: {
      rowProduced: scored !== undefined,
      deterministicEvaluator: scored?.successSource === "deterministic-evaluator",
      semanticSuccess: scored?.success ?? null,
    },
    exactOutputsPresent: JSON.stringify(files) === JSON.stringify(expectedFiles),
  })
  await writeFile(path.join(path.dirname(outDir), "qualification.json"),
    `${JSON.stringify(qualification, null, 2)}\n`, "utf8")
  return qualification
}

function parseArgs(argv: string[]) {
  let phase: Phase | undefined
  let lockPath = "benchmarks/skill-ir/pilots/bids/successor-v2/development-lock.json"
  let outDir = "results/skill-ir/bids-successor-development-v1"
  for (const argument of argv) {
    if (argument.startsWith("--phase=")) {
      const value = argument.slice("--phase=".length)
      if (value !== "plan" && value !== "qualification") throw new Error("invalid BIDS successor phase")
      phase = value
    } else if (argument.startsWith("--lock=")) lockPath = argument.slice("--lock=".length)
    else if (argument.startsWith("--out-dir=")) outDir = argument.slice("--out-dir=".length)
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (!phase) throw new Error("--phase is required")
  return { phase, lockPath, outDir }
}

function assertOutputRoot(rootDir: string, outDir: string): void {
  const resultsRoot = path.resolve(rootDir, "results/skill-ir")
  const relative = path.relative(resultsRoot, outDir)
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("BIDS successor output must be a child of results/skill-ir")
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const rootDir = path.resolve(process.cwd())
  const outDir = path.resolve(rootDir, args.outDir)
  assertOutputRoot(rootDir, outDir)
  const lockPath = path.resolve(rootDir, args.lockPath)
  const lock = await validateBidsSuccessorDevelopmentLock(
    JSON.parse(await readFile(lockPath, "utf8")), rootDir,
  )
  const planRoot = args.phase === "qualification" ? path.join(outDir, "qualification") : outDir
  const plan = await buildBidsSuccessorDevelopmentPlan({
    rootDir,
    lock,
    outDir: path.relative(rootDir, path.join(planRoot, "run")).replaceAll("\\", "/"),
  })
  await mkdir(planRoot, { recursive: true })
  await writeFile(path.join(planRoot, "plan.json"), `${JSON.stringify(serializePlan(plan), null, 2)}\n`, "utf8")
  if (args.phase === "plan") return { phase: args.phase, rows: plan.plan.length }
  const qualification = await runBidsSuccessorQualification({
    rootDir,
    lockPath,
    outDir: path.join(outDir, "qualification"),
    lock,
    plan,
  })
  if (qualification.status !== "passed") {
    throw new Error(`BIDS successor qualification failed: ${JSON.stringify(qualification.checks)}`)
  }
  return { phase: args.phase, qualification }
}

if (import.meta.main) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
