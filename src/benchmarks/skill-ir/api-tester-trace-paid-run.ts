import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { RunExecutionObservationSchema, type RunExecutionObservation } from "../../core/types"
import { ApiTesterTaskSetSchema } from "./api-tester-contract"
import {
  API_TESTER_DEVELOPMENT_TASKS_PATH,
  buildPublicAnswerFromTask,
  type ApiTesterPublicAnswer,
} from "./api-tester-trace-public-answer"
import {
  API_TESTER_TRACE_PAID_IDENTITY,
  ApiTesterTracePaidLockSchema,
  buildPaidTraceFromGeneratedPlan,
  buildTracePaidReport,
  executeTracePaidRows,
  type ApiTesterTracePaidLock,
  type ApiTesterTracePaidRow,
} from "./api-tester-trace-paid"
import { assertRequiredEnv, buildPlan, executeGenericPlanRow, type RealAgentRunArgs } from "./real-agent-run"
import type { RealAgentRunPlanEntry, SkillIRBenchmarkTask } from "./real-agent"
import { scoreRawRunRows, type RawAgentRunRow } from "./scoring"
import { sha256Bytes } from "./source-fixture"

export const API_TESTER_TRACE_PAID_LOCK_PATH = "benchmarks/skill-ir/pilots/api-tester/trace-public-answer-paid-development-001-lock.json"
export const API_TESTER_TRACE_PAID_OUTPUT_ROOT = "results/skill-ir/api-tester-trace-public-answer-paid-development-001"
const SOURCE_ENTRYPOINT = "src/index.ts"

type Phase = "preflight" | "execute"
type Args = { rootDir: string; lockPath: string; outDir: string; phase: Phase }
type PlannedRow = { rowIndex: number; taskId: string; repetition: number; smoke: boolean; plan: RealAgentRunPlanEntry }

const PreflightSchema = z.object({
  schemaVersion: z.literal("skill-ir-api-tester-trace-paid-preflight/v1"),
  experimentId: z.literal(API_TESTER_TRACE_PAID_IDENTITY),
  lockSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  status: z.literal("passed"),
  apiKey: z.object({ env: z.literal("SKVM_XTY_API_KEY"), ready: z.literal(true), valuePersisted: z.literal(false) }).strict(),
  identity: z.object({ newIdentity: z.literal(true), oldLockReused: z.literal(false) }).strict(),
  digests: z.object({ frozenInputs: z.literal("passed"), publicAnswers: z.literal("passed"), checker: z.literal("passed") }).strict(),
  budget: z.object({ expectedRows: z.literal(4), paidCalls: z.literal(4), modelCalls: z.literal(4), apiCalls: z.literal(4), retries: z.literal(0), reserve: z.literal(0), replacements: z.literal(0) }).strict(),
  stopLoss: z.literal("row 1 is the in-denominator smoke; on failure stop immediately and freeze the failed row without route changes, retries, reserve, replacement, or public-answer/checker/artifact edits"),
  rowOrder: z.tuple([
    z.object({ rowIndex: z.literal(1), taskId: z.literal("api-tester-openapi-users-dev-001"), repetition: z.literal(1), smoke: z.literal(true) }).strict(),
    z.object({ rowIndex: z.literal(2), taskId: z.literal("api-tester-openapi-users-dev-001"), repetition: z.literal(2), smoke: z.literal(false) }).strict(),
    z.object({ rowIndex: z.literal(3), taskId: z.literal("api-tester-openapi-inventory-dev-002"), repetition: z.literal(1), smoke: z.literal(false) }).strict(),
    z.object({ rowIndex: z.literal(4), taskId: z.literal("api-tester-openapi-inventory-dev-002"), repetition: z.literal(2), smoke: z.literal(false) }).strict(),
  ]),
}).strict()

function jsonText(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n` }

function contained(rootDir: string, value: string): string {
  const root = path.resolve(rootDir)
  const target = path.resolve(root, value)
  const relative = path.relative(root, target)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`path escapes root: ${value}`)
  return target
}

async function digestFile(rootDir: string, reference: { path: string; sha256: string }): Promise<void> {
  const target = contained(rootDir, reference.path)
  const stat = await lstat(target)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`frozen input is not a regular file: ${reference.path}`)
  const actual = sha256Bytes(await readFile(target))
  if (actual !== reference.sha256) throw new Error(`frozen input digest drift: ${reference.path}`)
}

async function loadContext(args: Args, env: Record<string, string | undefined>) {
  const rootDir = path.resolve(args.rootDir)
  const lockPath = path.isAbsolute(args.lockPath) ? args.lockPath : contained(rootDir, args.lockPath)
  const outDir = path.isAbsolute(args.outDir) ? path.resolve(args.outDir) : contained(rootDir, args.outDir)
  if (outDir !== contained(rootDir, API_TESTER_TRACE_PAID_OUTPUT_ROOT)) throw new Error("paid output root drift")
  if (lockPath !== contained(rootDir, API_TESTER_TRACE_PAID_LOCK_PATH)) throw new Error("paid lock path drift")
  const lockBytes = await readFile(lockPath)
  const lock = ApiTesterTracePaidLockSchema.parse(JSON.parse(lockBytes.toString("utf8")))
  for (const reference of [lock.frozenInputs.tasks, lock.frozenInputs.source, lock.frozenInputs.checker, lock.frozenInputs.oracle, lock.frozenInputs.runner]) {
    await digestFile(rootDir, reference)
  }
  const taskSet = ApiTesterTaskSetSchema.parse(JSON.parse(await readFile(contained(rootDir, API_TESTER_DEVELOPMENT_TASKS_PATH), "utf8")))
  const answers = new Map<string, ApiTesterPublicAnswer>()
  for (const [index, taskId] of lock.matrix.taskIds.entries()) {
    const task = taskSet.tasks.find((entry) => entry.id === taskId)
    if (!task) throw new Error(`paid task is absent: ${taskId}`)
    const answer = buildPublicAnswerFromTask(task)
    const actual = sha256Bytes(Buffer.from(jsonText(answer), "utf8"))
    if (actual !== lock.frozenInputs.publicAnswers[index]!.sha256) throw new Error(`public answer digest drift: ${taskId}`)
    answers.set(taskId, answer)
  }
  if (!env[lock.runtime.apiKeyEnv]?.trim()) throw new Error(`required API key is not ready: ${lock.runtime.apiKeyEnv}`)
  return { rootDir, lockPath, lockBytes, lock, outDir, taskSet, answers }
}

function realAgentArgs(context: Awaited<ReturnType<typeof loadContext>>): RealAgentRunArgs {
  const lock = context.lock
  return {
    corpus: "pilot",
    model: lock.model.route,
    modelFamily: lock.model.family,
    adapter: lock.runtime.adapter,
    adapterVersion: lock.runtime.adapterVersion,
    repetitions: lock.matrix.repetitions,
    panelConfigId: lock.experimentId,
    outDir: path.join(context.outDir, "working"),
    limit: 4,
    execute: false,
    retries: 0,
    retryDelayMs: 0,
    outerWatchdogMs: lock.runtime.outerWatchdogMs,
    rootDir: context.rootDir,
    allowTasksAuthored: false,
    allowDevelopmentReplay: false,
    allowArtifactDevelopmentReplay: false,
    skills: new Set(["api-tester"]),
    systems: new Set(["original"]),
    contexts: new Set([lock.matrix.context]),
    agents: new Set(["skvm"]),
    environments: new Set([lock.matrix.environment]),
    tasks: new Set(lock.matrix.taskIds),
    requireEnv: new Set([lock.runtime.apiKeyEnv]),
  }
}

async function paidPlan(context: Awaited<ReturnType<typeof loadContext>>): Promise<PlannedRow[]> {
  const args = realAgentArgs(context)
  const base = await buildPlan(args)
  const original = base.filter((row) => row.system === "original")
  const expected = [
    ["api-tester-openapi-users-dev-001", 1],
    ["api-tester-openapi-users-dev-001", 2],
    ["api-tester-openapi-inventory-dev-002", 1],
    ["api-tester-openapi-inventory-dev-002", 2],
  ] as const
  if (original.length !== 4) throw new Error(`paid plan requires four original rows, got ${original.length}`)
  return expected.map(([taskId, repetition], index) => {
    const matches = original.filter((row) => row.caseId.endsWith(`:${taskId}`) && row.runIndex === repetition)
    if (matches.length !== 1) throw new Error(`paid plan row identity drift: ${taskId}/${repetition}`)
    const row = matches[0]!
    const observationPath = path.join(context.outDir, "working", `row-${index + 1}-execution-observation.json`)
    const command = [
      process.execPath,
      "run",
      contained(context.rootDir, SOURCE_ENTRYPOINT),
      "run",
      ...row.command.slice(4).filter((argument) => !argument.startsWith("--adapter-config=")
        && !argument.startsWith("--timeout-ms=") && !argument.startsWith("--max-steps=")
        && !argument.startsWith("--execution-observation=")),
      "--adapter-config=managed",
      `--timeout-ms=${context.lock.runtime.taskTimeoutMs}`,
      `--max-steps=${context.lock.runtime.maxSteps}`,
      `--execution-observation=${observationPath}`,
    ]
    return { rowIndex: index + 1, taskId, repetition, smoke: index === 0, plan: { ...row, command } }
  })
}

function fallbackObservation(raw: Pick<RawAgentRunRow, "exitCode" | "runStatus" | "durationMs">): RunExecutionObservation {
  return RunExecutionObservationSchema.parse({
    schemaVersion: "skvm-run-execution-observation/v1",
    process: { exitCode: raw.exitCode, termination: raw.runStatus === "timeout" ? "absolute-timeout" : raw.exitCode === 0 ? "natural" : "crash", durationMs: raw.durationMs },
    activity: { requestDispatched: false, providerResponses: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0 },
    terminal: { present: false },
    usage: { available: false, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    parser: { outcome: "empty", unknownTypes: ["missing-execution-observation"] },
  })
}

function classification(raw: RawAgentRunRow, observation: RunExecutionObservation, parityPass: boolean, qualityPass: boolean): ApiTesterTracePaidRow["executionClassification"] {
  if (raw.runStatus === "timeout" || observation.process.termination === "absolute-timeout" || observation.process.termination === "idle-timeout") return "timeout"
  if (raw.exitCode !== 0 || raw.runStatus !== "ok" || observation.process.termination !== "natural") return "runtime-failure"
  if (observation.parser.outcome !== "ok") return "parser-incompatible"
  if (!observation.usage.available) return "usage-missing"
  if (!parityPass) return "trace-invalid"
  if (!qualityPass) return "quality-failure"
  return "semantic-complete"
}

async function readObservation(planned: PlannedRow, raw: RawAgentRunRow): Promise<{ value: RunExecutionObservation; text: string }> {
  const argument = planned.plan.command.find((entry) => entry.startsWith("--execution-observation="))
  if (!argument) throw new Error("execution observation path missing")
  try {
    const value = RunExecutionObservationSchema.parse(JSON.parse(await readFile(argument.slice("--execution-observation=".length), "utf8")))
    return { value, text: jsonText(value) }
  } catch {
    const value = fallbackObservation(raw)
    return { value, text: jsonText(value) }
  }
}

async function executeOne(context: Awaited<ReturnType<typeof loadContext>>, planned: PlannedRow, statePath: string): Promise<ApiTesterTracePaidRow> {
  const state = JSON.parse(await readFile(statePath, "utf8")) as { attempted: number[] }
  if (state.attempted.includes(planned.rowIndex)) throw new Error(`row ${planned.rowIndex} was already dispatched`)
  state.attempted.push(planned.rowIndex)
  await writeFile(statePath, jsonText(state), "utf8")
  const raw = await executeGenericPlanRow(
    planned.plan,
    { outerWatchdogMs: context.lock.runtime.outerWatchdogMs, exposeOuterTimedOut: true },
    { ...process.env, SKVM_AUTO_PROBE: "0" },
  ) as RawAgentRunRow
  const observation = await readObservation(planned, raw)
  const evidenceDir = path.join(context.outDir, "evidence")
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(path.join(evidenceDir, `row-${planned.rowIndex}-execution-observation.json`), observation.text, "utf8")
  const answer = context.answers.get(planned.taskId)!
  let planValue: unknown
  let generatedPlanSha256: string | null = null
  try {
    const bytes = await readFile(path.join(planned.plan.workDir, "generated", "api-test-plan.json"))
    generatedPlanSha256 = sha256Bytes(bytes)
    planValue = JSON.parse(bytes.toString("utf8"))
  } catch {
    planValue = undefined
  }
  const traced = buildPaidTraceFromGeneratedPlan({ answer, repetition: planned.repetition, plan: planValue })
  let traceSha256: string | null = null
  if (traced.trace) {
    const traceText = jsonText(traced.trace)
    traceSha256 = sha256Bytes(Buffer.from(traceText, "utf8"))
    await writeFile(path.join(evidenceDir, `row-${planned.rowIndex}-trace.json`), traceText, "utf8")
  }
  const taskById = new Map<string, SkillIRBenchmarkTask>(context.taskSet.tasks.map((task) => [task.id, task]))
  const scored = (await scoreRawRunRows([raw], taskById))[0]!
  const kind = classification(raw, observation.value, traced.comparison.pass, scored.success)
  const issues = [...traced.comparison.issues, ...scored.failedCriteria]
  if (kind !== "semantic-complete" && issues.length === 0) issues.push(kind)
  const publicAnswerSha256 = context.lock.frozenInputs.publicAnswers.find((entry) => entry.taskId === planned.taskId)!.sha256
  return {
    rowIndex: planned.rowIndex,
    taskId: planned.taskId as ApiTesterTracePaidRow["taskId"],
    repetition: planned.repetition,
    smoke: planned.smoke,
    status: kind === "semantic-complete" ? "passed" : "failed",
    executionClassification: kind,
    parity: traced.comparison.parity,
    parityPass: traced.comparison.pass,
    issues,
    usage: observation.value.usage,
    activity: { requestDispatched: observation.value.activity.requestDispatched },
    durationMs: raw.durationMs,
    publicAnswerSha256,
    traceSha256,
    generatedPlanSha256,
    executionObservationSha256: sha256Bytes(Buffer.from(observation.text, "utf8")),
    humanMinutes: { authoringMinutes: 0, reviewMinutes: 0, status: "prospective-measured-no-human-intervention" },
  }
}

async function controllerFailureRow(
  context: Awaited<ReturnType<typeof loadContext>>,
  planned: PlannedRow,
  error: unknown,
): Promise<ApiTesterTracePaidRow> {
  const observation = fallbackObservation({ exitCode: 1, runStatus: "adapter-crashed", durationMs: 0 })
  const observationText = jsonText(observation)
  const evidenceDir = path.join(context.outDir, "evidence")
  await mkdir(evidenceDir, { recursive: true })
  await writeFile(path.join(evidenceDir, `row-${planned.rowIndex}-execution-observation.json`), observationText, "utf8")
  const errorDigest = sha256Bytes(Buffer.from(error instanceof Error ? error.message : String(error), "utf8"))
  return {
    rowIndex: planned.rowIndex,
    taskId: planned.taskId as ApiTesterTracePaidRow["taskId"],
    repetition: planned.repetition,
    smoke: planned.smoke,
    status: "failed",
    executionClassification: "runtime-failure",
    parity: "invalid",
    parityPass: false,
    issues: [`controller-failure-sha256:${errorDigest}`],
    usage: observation.usage,
    activity: { requestDispatched: false },
    durationMs: 0,
    publicAnswerSha256: context.lock.frozenInputs.publicAnswers.find((entry) => entry.taskId === planned.taskId)!.sha256,
    traceSha256: null,
    generatedPlanSha256: null,
    executionObservationSha256: sha256Bytes(Buffer.from(observationText, "utf8")),
    humanMinutes: { authoringMinutes: 0, reviewMinutes: 0, status: "prospective-measured-no-human-intervention" },
  }
}

async function preflight(args: Args, env: Record<string, string | undefined>) {
  const context = await loadContext(args, env)
  await mkdir(context.outDir, { recursive: true })
  const existing = await readdir(context.outDir)
  if (existing.length > 0) throw new Error("paid output directory must be empty before preflight")
  const plan = await paidPlan(context)
  await mkdir(path.join(context.outDir, "public-answers"), { recursive: true })
  for (const [taskId, answer] of context.answers) await writeFile(path.join(context.outDir, "public-answers", `${taskId}.json`), jsonText(answer), "utf8")
  const report = PreflightSchema.parse({
    schemaVersion: "skill-ir-api-tester-trace-paid-preflight/v1",
    experimentId: context.lock.experimentId,
    lockSha256: sha256Bytes(context.lockBytes),
    status: "passed",
    apiKey: { env: context.lock.runtime.apiKeyEnv, ready: true, valuePersisted: false },
    identity: { newIdentity: true, oldLockReused: false },
    digests: { frozenInputs: "passed", publicAnswers: "passed", checker: "passed" },
    budget: { expectedRows: 4, paidCalls: 4, modelCalls: 4, apiCalls: 4, retries: 0, reserve: 0, replacements: 0 },
    stopLoss: "row 1 is the in-denominator smoke; on failure stop immediately and freeze the failed row without route changes, retries, reserve, replacement, or public-answer/checker/artifact edits",
    rowOrder: plan.map(({ rowIndex, taskId, repetition, smoke }) => ({ rowIndex, taskId, repetition, smoke })),
  })
  await writeFile(path.join(context.outDir, "preflight.json"), jsonText(report), "utf8")
  return report
}

async function execute(args: Args, env: Record<string, string | undefined>) {
  const context = await loadContext(args, env)
  const preflightPath = path.join(context.outDir, "preflight.json")
  const preflightBytes = await readFile(preflightPath)
  const checked = PreflightSchema.parse(JSON.parse(preflightBytes.toString("utf8")))
  if (checked.lockSha256 !== sha256Bytes(context.lockBytes)) throw new Error("preflight lock digest drift")
  for (const forbidden of ["dispatch-state.json", "report.json"]) {
    try { await lstat(path.join(context.outDir, forbidden)); throw new Error(`paid execution already started: ${forbidden}`) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
  const runArgs = realAgentArgs(context)
  assertRequiredEnv(runArgs, env)
  const plan = await paidPlan(context)
  const statePath = path.join(context.outDir, "dispatch-state.json")
  await writeFile(statePath, jsonText({ schemaVersion: "skill-ir-api-tester-trace-paid-dispatch-state/v1", experimentId: context.lock.experimentId, lockSha256: checked.lockSha256, attempted: [] }), "utf8")
  const result = await executeTracePaidRows(plan, async (row) => {
    try {
      return await executeOne(context, row, statePath)
    } catch (error) {
      return controllerFailureRow(context, row, error)
    }
  })
  const report = buildTracePaidReport({
    experimentId: context.lock.experimentId,
    lockSha256: checked.lockSha256,
    rows: result.rows,
    stopReason: result.stopReason,
    measurement: { startedAt: context.lock.measurementStartedAt, completedAt: new Date().toISOString(), authoringMinutes: 0, reviewMinutes: 0 },
  })
  await writeFile(path.join(context.outDir, "report.json"), jsonText(report), "utf8")
  return report
}

export function parseArgs(argv: string[]): Args {
  let rootDir = process.cwd(), lockPath: string | undefined, outDir: string | undefined, phase: Phase | undefined
  for (const argument of argv) {
    if (argument.startsWith("--root-dir=")) rootDir = argument.slice("--root-dir=".length)
    else if (argument.startsWith("--lock=")) lockPath = argument.slice("--lock=".length)
    else if (argument.startsWith("--out-dir=")) outDir = argument.slice("--out-dir=".length)
    else if (argument === "--phase=preflight") phase = "preflight"
    else if (argument === "--phase=execute") phase = "execute"
    else throw new Error(`unknown argument: ${argument}`)
  }
  if (!lockPath || !outDir || !phase) throw new Error("--lock, --out-dir, and --phase are required")
  return { rootDir, lockPath, outDir, phase }
}

export async function runApiTesterTracePaid(args: Args, env: Record<string, string | undefined> = process.env) {
  return args.phase === "preflight" ? preflight(args, env) : execute(args, env)
}

if (import.meta.main) {
  runApiTesterTracePaid(parseArgs(process.argv.slice(2))).then((report) => {
    console.log(JSON.stringify({ status: report.status, experimentId: report.experimentId }, null, 2))
    if ("stopReason" in report && report.stopReason === "smoke-failed") process.exitCode = 1
  }).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1) })
}
