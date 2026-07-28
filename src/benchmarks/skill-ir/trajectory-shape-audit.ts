import { readdir } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"
import { z } from "zod"

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const DURATION_TOLERANCE_MS = 1_000

const SystemSchema = z.enum(["no-skill", "original"])
const RuntimeOutcomeSchema = z.enum([
  "exit-zero",
  "bun-internal-assertion",
  "nonzero-exit",
])
const EvidenceRefSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(SHA256_PATTERN),
}).strict()
const ToolTypeCountsSchema = z.object({
  readFile: z.number().int().nonnegative(),
  writeFile: z.number().int().nonnegative(),
  executeCommand: z.number().int().nonnegative(),
  listDirectory: z.number().int().nonnegative(),
  webFetch: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
}).strict()
const StopReasonCountsSchema = z.object({
  toolUse: z.number().int().nonnegative(),
  endTurn: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
}).strict()
const DurationSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  total: z.number().nonnegative(),
  median: z.number().nonnegative(),
  maximum: z.number().nonnegative(),
}).strict()
const TrajectorySummarySchema = z.object({
  requestCount: z.number().int().positive(),
  responseCount: z.number().int().positive(),
  toolCallCount: z.number().int().nonnegative(),
  toolTypeCounts: ToolTypeCountsSchema,
  maxToolFanOut: z.number().int().nonnegative(),
  stopReasonCounts: StopReasonCountsSchema,
  providerDurationMs: DurationSummarySchema,
  finalizedEndTurn: z.literal(true),
}).strict()

const AuditRowSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  caseId: z.string().min(1),
  system: SystemSchema,
  runIndex: z.number().int().positive(),
  sessionKey: z.string().regex(/^\d{8}-\d{6}$/),
  sessionState: z.enum(["completed", "running-only"]),
  runtimeOutcome: RuntimeOutcomeSchema,
  rawDurationMs: z.number().nonnegative(),
  mappingDurationDeltaMs: z.number().nonnegative().nullable(),
  trajectoryAvailable: z.boolean(),
  unavailableReason: z.literal("session-not-finalized").nullable(),
  trajectory: TrajectorySummarySchema.nullable(),
}).strict()

export const TrajectoryShapeAuditReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-trajectory-shape-audit-report/v1"),
  auditId: z.literal("experimental-design-v2-trajectory-shape-audit-2026-07-29"),
  status: z.literal("passed"),
  methodEvidence: z.literal(false),
  counts: z.object({
    rows: z.number().int().positive(),
    exitZero: z.number().int().nonnegative(),
    infrastructureFailures: z.number().int().nonnegative(),
    trajectoryAvailable: z.number().int().nonnegative(),
    trajectoryUnavailable: z.number().int().nonnegative(),
  }).strict(),
  rows: z.array(AuditRowSchema).min(1),
  successfulEnvelope: z.object({
    observedRows: z.number().int().positive(),
    minimumResponseCount: z.number().int().positive(),
    maximumResponseCount: z.number().int().positive(),
    maximumToolCallCount: z.number().int().nonnegative(),
    maximumToolFanOut: z.number().int().nonnegative(),
    maximumProviderDurationMs: z.number().nonnegative(),
    maximumRawDurationMs: z.number().nonnegative(),
  }).strict(),
  replayReference: z.object({
    responsesPerRow: z.number().int().positive(),
    toolCallsPerRow: z.literal(11),
    maximumToolFanOut: z.literal(3),
    maximumRawDurationMs: z.number().nonnegative(),
  }).strict(),
  replayCoverage: z.object({
    responseCountCovered: z.boolean(),
    toolCallCountCovered: z.boolean(),
    toolFanOutCovered: z.boolean(),
    endToEndDurationCovered: z.boolean(),
    successfulEnvelopeCovered: z.boolean(),
  }).strict(),
  conclusion: z.enum([
    "deterministic-replay-covers-observed-success-envelope",
    "deterministic-replay-does-not-cover-observed-success-envelope",
  ]),
  evidence: z.array(EvidenceRefSchema).min(4),
  claimBoundary: z.object({
    infrastructureDiagnosticOnly: z.literal(true),
    crashTrajectoryObservable: z.literal(false),
    crashCausalityEstablished: z.literal(false),
    benchmarkEvidence: z.literal(false),
    skillOptimizationEvidence: z.literal(false),
    modelCapabilityEvidence: z.literal(false),
    tokenEvidence: z.literal(false),
    paidRerunAllowed: z.literal(false),
  }).strict(),
}).strict()

export type TrajectoryShapeAuditReport = z.infer<typeof TrajectoryShapeAuditReportSchema>

const RawRowSchema = z.object({
  caseId: z.string().min(1),
  system: SystemSchema,
  runIndex: z.number().int().positive(),
  exitCode: z.number().int(),
  durationMs: z.number().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
}).passthrough()
const PlanSchema = z.object({
  lock: z.object({
    matrix: z.object({ expectedRows: z.number().int().positive() }).passthrough(),
  }).passthrough(),
  plan: z.array(z.object({
    caseId: z.string().min(1),
    system: SystemSchema,
    runIndex: z.number().int().positive(),
  }).passthrough()),
}).passthrough()
const SessionRecordSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  logDir: z.string().min(1),
}).passthrough()
const ReplayReportSchema = z.object({
  schemaVersion: z.literal("skill-ir-source-process-replay-report/v1"),
  shape: z.object({ responsesPerRow: z.number().int().positive() }).passthrough(),
  rows: z.array(z.object({ durationMs: z.number().nonnegative() }).passthrough()).min(1),
}).passthrough()

type SessionRecord = z.infer<typeof SessionRecordSchema>
type SessionGroup = {
  id: string
  running: SessionRecord
  completed?: SessionRecord
}

export type TrajectoryShapeAuditOptions = {
  root: string
  rawPath: string
  planPath: string
  replayReportPath: string
  sessionsPath: string
  logRoot: string
  matrixStartSessionId: string
  additionalEvidencePaths?: string[]
}

function containedPath(root: string, path: string): string {
  const absoluteRoot = resolve(root)
  const candidate = resolve(path)
  const rel = relative(absoluteRoot, candidate)
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) {
    return candidate
  }
  throw new Error(`Trajectory audit path escapes root: ${path}`)
}

async function sha256File(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(await Bun.file(path).arrayBuffer())
  return hasher.digest("hex")
}

async function evidenceRef(root: string, path: string) {
  const absolute = containedPath(root, path)
  return {
    path: relative(resolve(root), absolute).replaceAll("\\", "/"),
    sha256: await sha256File(absolute),
  }
}

function parseJsonLines<T>(text: string, schema: z.ZodType<T>, label: string): T[] {
  return text.trim().split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return schema.parse(JSON.parse(line))
    } catch (error) {
      throw new Error(`Invalid ${label} line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function selectSessionGroups(records: SessionRecord[], startId: string, count: number): SessionGroup[] {
  const start = records.findIndex((record) => record.id === startId && record.status === "running")
  if (start < 0) throw new Error("Matrix start session was not found")
  const groups = new Map<string, SessionGroup>()
  for (const record of records.slice(start)) {
    const current = groups.get(record.id)
    if (!current) {
      if (groups.size === count) break
      if (record.status !== "running") {
        throw new Error(`Session ${record.id} completed without a running record`)
      }
      groups.set(record.id, { id: record.id, running: record })
      continue
    }
    if (record.startedAt !== current.running.startedAt || record.logDir !== current.running.logDir) {
      throw new Error(`Session identity drift: ${record.id}`)
    }
    if (record.status !== "completed" || current.completed) {
      throw new Error(`Duplicate session state: ${record.id}`)
    }
    current.completed = record
  }
  const selected = [...groups.values()]
  if (selected.length !== count) throw new Error("Matrix session count differs from raw rows")
  return selected
}

function sessionKey(id: string): string {
  const match = /^(\d{8}-\d{6})-run-/.exec(id)
  if (!match) throw new Error(`Invalid matrix session id: ${id}`)
  return match[1]!
}

function runtimeOutcome(exitCode: number, stderr: string): z.infer<typeof RuntimeOutcomeSchema> {
  if (exitCode === 0) return "exit-zero"
  const normalized = stderr.toLowerCase()
  return normalized.includes("panic(main thread): internal assertion failure")
    || normalized.includes("bun has crashed")
    ? "bun-internal-assertion"
    : "nonzero-exit"
}

function toolType(name: unknown): keyof z.infer<typeof ToolTypeCountsSchema> {
  switch (name) {
    case "read_file": return "readFile"
    case "write_file": return "writeFile"
    case "execute_command": return "executeCommand"
    case "list_directory": return "listDirectory"
    case "web_fetch": return "webFetch"
    default: return "other"
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function projectConversation(text: string): z.infer<typeof TrajectorySummarySchema> {
  const events = parseJsonLines(text, z.record(z.string(), z.unknown()), "conversation")
  if (events.length === 0 || events.length % 2 !== 0) {
    throw new Error("Completed session conversation is not request/response paired")
  }
  const durations: number[] = []
  const toolTypeCounts: z.infer<typeof ToolTypeCountsSchema> = {
    readFile: 0,
    writeFile: 0,
    executeCommand: 0,
    listDirectory: 0,
    webFetch: 0,
    other: 0,
  }
  const stopReasonCounts: z.infer<typeof StopReasonCountsSchema> = {
    toolUse: 0,
    endTurn: 0,
    other: 0,
  }
  let toolCallCount = 0
  let maxToolFanOut = 0
  for (let index = 0; index < events.length; index += 2) {
    const request = events[index]!
    const response = events[index + 1]!
    if (request.type !== "request" || response.type !== "response") {
      throw new Error("Completed session conversation is not request/response paired")
    }
    if (typeof response.durationMs !== "number" || !Number.isFinite(response.durationMs)
      || response.durationMs < 0) {
      throw new Error("Completed session response has invalid duration")
    }
    durations.push(response.durationMs)
    const calls = Array.isArray(response.toolCalls) ? response.toolCalls : []
    maxToolFanOut = Math.max(maxToolFanOut, calls.length)
    toolCallCount += calls.length
    for (const call of calls) {
      const item = object(call)
      toolTypeCounts[toolType(item?.name)]++
    }
    if (response.stopReason === "tool_use") stopReasonCounts.toolUse++
    else if (response.stopReason === "end_turn") stopReasonCounts.endTurn++
    else stopReasonCounts.other++
  }
  const final = events.at(-1)!
  const finalCalls = Array.isArray(final.toolCalls) ? final.toolCalls : []
  if (final.stopReason !== "end_turn" || finalCalls.length !== 0) {
    throw new Error("Completed session conversation does not finalize with end_turn")
  }
  return TrajectorySummarySchema.parse({
    requestCount: events.length / 2,
    responseCount: events.length / 2,
    toolCallCount,
    toolTypeCounts,
    maxToolFanOut,
    stopReasonCounts,
    providerDurationMs: {
      count: durations.length,
      total: durations.reduce((sum, value) => sum + value, 0),
      median: median(durations),
      maximum: Math.max(...durations),
    },
    finalizedEndTurn: true,
  })
}

async function conversationPathForCompletedSession(logRoot: string, group: SessionGroup): Promise<string> {
  const expectedKey = sessionKey(group.id)
  const keySeconds = (key: string) => Date.UTC(
    Number(key.slice(0, 4)),
    Number(key.slice(4, 6)) - 1,
    Number(key.slice(6, 8)),
    Number(key.slice(9, 11)),
    Number(key.slice(11, 13)),
    Number(key.slice(13, 15)),
  ) / 1_000
  const candidates = (await readdir(logRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{8}-\d{6}-run$/.test(entry.name))
    .filter((entry) => Math.abs(keySeconds(entry.name.slice(0, 15)) - keySeconds(expectedKey)) <= 2)
  const matches: string[] = []
  for (const candidate of candidates) {
    const directory = resolve(logRoot, candidate.name)
    const names = (await readdir(directory)).filter((name) => /^conv-.*\.jsonl$/.test(name))
    if (names.length === 1) matches.push(resolve(directory, names[0]!))
  }
  if (matches.length !== 1) {
    throw new Error(`Expected one completed session conversation: ${expectedKey}`)
  }
  return matches[0]!
}

export async function buildTrajectoryShapeAudit(
  options: TrajectoryShapeAuditOptions,
): Promise<TrajectoryShapeAuditReport> {
  const root = resolve(options.root)
  const rawPath = containedPath(root, options.rawPath)
  const planPath = containedPath(root, options.planPath)
  const replayReportPath = containedPath(root, options.replayReportPath)
  const sessionsPath = containedPath(root, options.sessionsPath)
  const logRoot = containedPath(root, options.logRoot)
  const rawRows = parseJsonLines(await Bun.file(rawPath).text(), RawRowSchema, "raw run")
  const plan = PlanSchema.parse(JSON.parse(await Bun.file(planPath).text()))
  const replay = ReplayReportSchema.parse(JSON.parse(await Bun.file(replayReportPath).text()))
  const sessionRecords = parseJsonLines(
    await Bun.file(sessionsPath).text(),
    SessionRecordSchema,
    "session",
  )

  if (rawRows.length !== plan.lock.matrix.expectedRows || rawRows.length !== plan.plan.length) {
    throw new Error("Raw, plan, and expected row counts differ")
  }
  const matrixSessions = selectSessionGroups(
    sessionRecords,
    options.matrixStartSessionId,
    rawRows.length,
  )

  const evidencePaths = [rawPath, planPath, replayReportPath, sessionsPath]
  const rows: z.infer<typeof AuditRowSchema>[] = []
  for (let index = 0; index < rawRows.length; index++) {
    const raw = rawRows[index]!
    const planned = plan.plan[index]!
    const session = matrixSessions[index]!
    if (raw.caseId !== planned.caseId || raw.system !== planned.system
      || raw.runIndex !== planned.runIndex) {
      throw new Error(`Raw/plan row mismatch at index ${index}`)
    }
    const taskId = raw.caseId.split(":").at(-1)!
    const normalizedLogDir = session.running.logDir.replaceAll("\\", "/")
    if (!normalizedLogDir.includes(`${taskId}-clean`)) {
      throw new Error(`Session task mismatch at index ${index}`)
    }
    const startedAt = Date.parse(session.running.startedAt)
    const observedEnd = session.completed
      ? Date.parse(session.completed.completedAt!)
      : matrixSessions[index + 1]
        ? Date.parse(matrixSessions[index + 1]!.running.startedAt)
        : undefined
    const mappingDurationDeltaMs = observedEnd === undefined
      ? null
      : Math.abs((observedEnd - startedAt) - raw.durationMs)
    if (mappingDurationDeltaMs !== null && mappingDurationDeltaMs > DURATION_TOLERANCE_MS) {
      throw new Error(`Session/raw duration mismatch at index ${index}`)
    }
    if (raw.exitCode === 0 && !session.completed) {
      throw new Error(`Exit-zero row lacks completed session at index ${index}`)
    }
    if (raw.exitCode !== 0 && session.completed) {
      throw new Error(`Nonzero row unexpectedly has completed session at index ${index}`)
    }

    let trajectory: z.infer<typeof TrajectorySummarySchema> | null = null
    if (session.completed) {
      const conversationPath = await conversationPathForCompletedSession(logRoot, session)
      evidencePaths.push(conversationPath)
      trajectory = projectConversation(await Bun.file(conversationPath).text())
    }
    rows.push(AuditRowSchema.parse({
      rowIndex: index,
      caseId: raw.caseId,
      system: raw.system,
      runIndex: raw.runIndex,
      sessionKey: sessionKey(session.id),
      sessionState: session.completed ? "completed" : "running-only",
      runtimeOutcome: runtimeOutcome(raw.exitCode, raw.stderr),
      rawDurationMs: raw.durationMs,
      mappingDurationDeltaMs,
      trajectoryAvailable: trajectory !== null,
      unavailableReason: trajectory ? null : "session-not-finalized",
      trajectory,
    }))
  }

  const successful = rows.filter((row): row is typeof row & { trajectory: NonNullable<typeof row.trajectory> } =>
    row.runtimeOutcome === "exit-zero" && row.trajectory !== null)
  if (successful.length === 0) throw new Error("No completed successful trajectory is available")
  const envelope = {
    observedRows: successful.length,
    minimumResponseCount: Math.min(...successful.map((row) => row.trajectory.responseCount)),
    maximumResponseCount: Math.max(...successful.map((row) => row.trajectory.responseCount)),
    maximumToolCallCount: Math.max(...successful.map((row) => row.trajectory.toolCallCount)),
    maximumToolFanOut: Math.max(...successful.map((row) => row.trajectory.maxToolFanOut)),
    maximumProviderDurationMs: Math.max(...successful.map((row) => row.trajectory.providerDurationMs.maximum)),
    maximumRawDurationMs: Math.max(...successful.map((row) => row.rawDurationMs)),
  }
  const replayReference = {
    responsesPerRow: replay.shape.responsesPerRow,
    toolCallsPerRow: 11 as const,
    maximumToolFanOut: 3 as const,
    maximumRawDurationMs: Math.max(...replay.rows.map((row) => row.durationMs)),
  }
  const responseCountCovered = replayReference.responsesPerRow >= envelope.maximumResponseCount
  const toolCallCountCovered = replayReference.toolCallsPerRow >= envelope.maximumToolCallCount
  const toolFanOutCovered = replayReference.maximumToolFanOut >= envelope.maximumToolFanOut
  const endToEndDurationCovered = replayReference.maximumRawDurationMs >= envelope.maximumRawDurationMs
  const successfulEnvelopeCovered = responseCountCovered && toolCallCountCovered
    && toolFanOutCovered && endToEndDurationCovered
  const additionalEvidence = (options.additionalEvidencePaths ?? []).map((path) => containedPath(root, path))
  const evidence = await Promise.all([...new Set([...evidencePaths, ...additionalEvidence])]
    .map((path) => evidenceRef(root, path)))
  evidence.sort((left, right) => left.path.localeCompare(right.path))

  return TrajectoryShapeAuditReportSchema.parse({
    schemaVersion: "skill-ir-trajectory-shape-audit-report/v1",
    auditId: "experimental-design-v2-trajectory-shape-audit-2026-07-29",
    status: "passed",
    methodEvidence: false,
    counts: {
      rows: rows.length,
      exitZero: rows.filter((row) => row.runtimeOutcome === "exit-zero").length,
      infrastructureFailures: rows.filter((row) => row.runtimeOutcome !== "exit-zero").length,
      trajectoryAvailable: rows.filter((row) => row.trajectoryAvailable).length,
      trajectoryUnavailable: rows.filter((row) => !row.trajectoryAvailable).length,
    },
    rows,
    successfulEnvelope: envelope,
    replayReference,
    replayCoverage: {
      responseCountCovered,
      toolCallCountCovered,
      toolFanOutCovered,
      endToEndDurationCovered,
      successfulEnvelopeCovered,
    },
    conclusion: successfulEnvelopeCovered
      ? "deterministic-replay-covers-observed-success-envelope"
      : "deterministic-replay-does-not-cover-observed-success-envelope",
    evidence,
    claimBoundary: {
      infrastructureDiagnosticOnly: true,
      crashTrajectoryObservable: false,
      crashCausalityEstablished: false,
      benchmarkEvidence: false,
      skillOptimizationEvidence: false,
      modelCapabilityEvidence: false,
      tokenEvidence: false,
      paidRerunAllowed: false,
    },
  })
}

export async function verifyTrajectoryShapeAuditReport(root: string, value: unknown): Promise<void> {
  const report = TrajectoryShapeAuditReportSchema.parse(value)
  for (const ref of report.evidence) {
    const path = containedPath(root, resolve(root, ref.path))
    if (await sha256File(path) !== ref.sha256) {
      throw new Error(`Trajectory audit digest mismatch: ${ref.path}`)
    }
  }
}
