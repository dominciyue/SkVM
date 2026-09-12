import path from "node:path"
import { stat } from "node:fs/promises"
import { DurableRuntimeTraceEventSchema } from "../core/durable-runtime-trace.ts"
import type {
  ConversationLogEntry,
  EvidenceCriterion,
  TraceDiagnostic,
  TraceEvidenceSource,
  TraceRepresentation,
} from "./types.ts"

export interface AdaptedTraceRecord {
  taskId: string
  taskPrompt?: string
  conversationLog: ConversationLogEntry[]
  criteria?: EvidenceCriterion[]
  workDirPath?: string
  source: TraceEvidenceSource
}

export interface AdaptedTraceFile {
  format: string
  representation?: TraceRepresentation
  inputSha256: string
  records: AdaptedTraceRecord[]
  diagnostics: TraceDiagnostic[]
}

type JsonObject = Record<string, unknown>
type ParsedLine = { line: number; value?: JsonObject; error?: string }

const SIMPLE_REPORT_KEYS = new Set(["task", "outcome", "issues", "skill_feedback"])
const NATIVE_TYPES = new Set(["request", "response", "tool"])

function objectValue(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function integerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}

function stripMarkdownFences(value: string): string {
  const match = value.match(/^```(?:json|jsonl)?\s*\n([\s\S]*?)\n```\s*$/i)
  return match ? match[1]!.trim() : value
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    try {
      return JSON.parse(value.replace(/,(\s*[}\]])/g, "$1"))
    } catch {
      return undefined
    }
  }
}

function digest(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex")
}

function diagnostic(
  code: string,
  message: string,
  locator: string,
  severity: "warning" | "error" = "warning",
): TraceDiagnostic {
  return { code, severity, message, locator }
}

function parseLines(raw: string): ParsedLine[] {
  return raw.split("\n").map((line, index) => ({ line, index })).filter(({ line }) => line.trim().length > 0).map(({ line, index }) => {
    const parsed = parseJson(line.trim())
    const value = objectValue(parsed)
    return value
      ? { line: index + 1, value }
      : { line: index + 1, error: "row is not a JSON object" }
  })
}

function isRawRun(value: JsonObject): boolean {
  return typeof value.caseId === "string"
    && typeof value.system === "string"
    && typeof value.stdout === "string"
    && typeof value.successSource === "string"
}

function isDurableTrace(value: JsonObject): boolean {
  return value.schemaVersion === "skill-ir-durable-runtime-trace-event/v1"
    && typeof value.event === "string"
}

function isNativeConversation(value: JsonObject): boolean {
  return typeof value.type === "string" && NATIVE_TYPES.has(value.type)
}

function isSimpleReport(value: JsonObject): boolean {
  const keys = Object.keys(value)
  if (keys.length === 0 || keys.some((key) => !SIMPLE_REPORT_KEYS.has(key))) return false
  if (typeof value.task !== "string") return false
  if (value.outcome !== undefined && typeof value.outcome !== "string") return false
  if (value.skill_feedback !== undefined && typeof value.skill_feedback !== "string") return false
  if (value.issues !== undefined
    && typeof value.issues !== "string"
    && !(Array.isArray(value.issues) && value.issues.every((item) => typeof item === "string"))) {
    return false
  }
  return true
}

function resolveLocator(sourcePath: string, locator: unknown): string | undefined {
  if (typeof locator !== "string" || locator.trim().length === 0) return undefined
  return path.isAbsolute(locator) ? path.normalize(locator) : path.resolve(path.dirname(sourcePath), locator)
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function readTaskPrompt(taskPath: string): Promise<string | undefined> {
  try {
    const parsed = objectValue(JSON.parse(await Bun.file(taskPath).text()))
    return stringValue(parsed?.prompt)
  } catch {
    return undefined
  }
}

function extractFinalOutput(stdout: string): string | undefined {
  const marker = "final output:"
  const index = stdout.toLowerCase().lastIndexOf(marker)
  const result = index === -1 ? stdout.trim() : stdout.slice(index + marker.length).trim()
  return result.length > 0 ? result : undefined
}

function extractUsage(stdout: string): TraceEvidenceSource["usage"] {
  const matches = [...stdout.matchAll(/tokens:\s*in=([\d,]+)\s+out=([\d,]+)/gi)]
  const match = matches.at(-1)
  if (!match) return undefined
  const inputTokens = Number.parseInt(match[1]!.replace(/,/g, ""), 10)
  const outputTokens = Number.parseInt(match[2]!.replace(/,/g, ""), 10)
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return undefined
  return { inputTokens, outputTokens, source: "stdout-marker" }
}

function sourceAgent(caseId: string, row: JsonObject): string | undefined {
  const explicit = stringValue(row.agent)
  if (explicit) return explicit
  const parts = caseId.split(":")
  return parts.length >= 2 && parts[1] ? parts[1] : undefined
}

function makeSource(opts: {
  format: string
  representation: TraceRepresentation
  sourcePath: string
  inputSha256: string
  recordLocator: string
  taskIdSource: "source" | "file-basename"
  diagnostics?: TraceDiagnostic[]
  values?: Partial<TraceEvidenceSource>
}): TraceEvidenceSource {
  return {
    format: opts.format,
    representation: opts.representation,
    sourcePath: opts.sourcePath,
    inputSha256: opts.inputSha256,
    recordLocator: opts.recordLocator,
    taskIdSource: opts.taskIdSource,
    unknownFields: [],
    diagnostics: opts.diagnostics ?? [],
    ...opts.values,
  }
}

async function adaptRawRuns(
  sourcePath: string,
  inputSha256: string,
  rows: ParsedLine[],
): Promise<AdaptedTraceFile> {
  const format = "skill-ir-raw-run-jsonl/v1"
  const representation = "run-summary" as const
  const diagnostics: TraceDiagnostic[] = []
  const records: AdaptedTraceRecord[] = []

  for (const row of rows) {
    const locator = `line:${row.line}`
    if (!row.value) {
      diagnostics.push(diagnostic("malformed-row", row.error ?? "malformed JSON row", locator, "error"))
      continue
    }
    if (!isRawRun(row.value)) {
      diagnostics.push(diagnostic("invalid-run-row", "JSON row does not satisfy the Skill IR raw-run summary shape", locator, "error"))
      continue
    }

    const value = row.value
    const caseId = value.caseId as string
    const rowDiagnostics: TraceDiagnostic[] = []
    const unknownFields = ["conversation.turns", "conversation.timestamps"]
    const taskPath = resolveLocator(sourcePath, value.taskPath)
    const skillPath = resolveLocator(sourcePath, value.skillPath)
    const workDirPath = resolveLocator(sourcePath, value.workDir)
    let taskPrompt: string | undefined

    if (taskPath && await exists(taskPath)) {
      taskPrompt = await readTaskPrompt(taskPath)
      if (!taskPrompt) {
        rowDiagnostics.push(diagnostic("task-prompt-missing", "Referenced task file has no string prompt", locator))
        unknownFields.push("taskPrompt")
      }
    } else {
      rowDiagnostics.push(diagnostic("task-file-unavailable", "Referenced task file is missing or unreadable", locator))
      unknownFields.push("taskPrompt")
    }

    if (skillPath && !await exists(skillPath)) {
      rowDiagnostics.push(diagnostic("skill-file-unavailable", "Referenced skill file is missing or unreadable", locator))
    }
    if (workDirPath && !await exists(workDirPath)) {
      rowDiagnostics.push(diagnostic("workdir-unavailable", "Referenced work directory is missing or unreadable", locator))
    }

    const stdout = value.stdout as string
    const finalOutput = extractFinalOutput(stdout)
    const usage = extractUsage(stdout)
    if (!finalOutput) {
      rowDiagnostics.push(diagnostic("result-missing", "Run summary contains no visible final result", locator))
      unknownFields.push("result.content")
    }
    if (!usage) {
      rowDiagnostics.push(diagnostic("usage-missing", "Run summary contains no parseable token usage", locator))
      unknownFields.push("usage")
    } else if (usage.costUsd === undefined) {
      unknownFields.push("usage.costUsd")
    }

    const conversationLog: ConversationLogEntry[] = []
    if (taskPrompt) {
      conversationLog.push({ type: "request", ts: "unknown", text: taskPrompt, sourceLocator: `${locator}:taskPath` })
    }
    if (finalOutput) {
      conversationLog.push({ type: "response", ts: "unknown", text: finalOutput, sourceLocator: `${locator}:stdout` })
    }

    diagnostics.push(...rowDiagnostics)
    const source = makeSource({
      format,
      representation,
      sourcePath,
      inputSha256,
      recordLocator: locator,
      taskIdSource: "source",
      diagnostics: rowDiagnostics,
      values: {
        sourceAgent: sourceAgent(caseId, value),
        adapter: stringValue(value.adapter),
        adapterVersion: stringValue(value.adapterVersion),
        model: stringValue(value.model),
        system: stringValue(value.system),
        taskPath,
        skillPath,
        workDirPath,
        runIndex: integerValue(value.runIndex),
        runStatus: stringValue(value.runStatus),
        durationMs: finiteNumber(value.durationMs),
        usage,
        unknownFields,
      },
    })
    records.push({ taskId: caseId, taskPrompt, conversationLog, workDirPath, source })
  }

  return { format, representation, inputSha256, records, diagnostics }
}

function adaptDurableTrace(
  sourcePath: string,
  inputSha256: string,
  rows: ParsedLine[],
): AdaptedTraceFile {
  const format = "skill-ir-durable-runtime-trace-event/v1"
  const representation = "runtime-event-trace" as const
  const diagnostics: TraceDiagnostic[] = []
  const conversationLog: ConversationLogEntry[] = []

  for (const row of rows) {
    const locator = `line:${row.line}`
    if (!row.value) {
      diagnostics.push(diagnostic("malformed-row", row.error ?? "malformed JSON row", locator, "error"))
      continue
    }
    if (!isDurableTrace(row.value)) {
      diagnostics.push(diagnostic("invalid-event-row", "JSON row is not a durable runtime trace event", locator, "error"))
      continue
    }
    const parsed = DurableRuntimeTraceEventSchema.safeParse(row.value)
    if (!parsed.success) {
      diagnostics.push(diagnostic("unknown-event", `Unrecognized durable runtime event ${String(row.value.event)}`, locator))
    }
    const event = row.value.event as string
    const type: ConversationLogEntry["type"] = event === "provider-request-start"
      ? "request"
      : event === "provider-response-received" || event === "finalize"
        ? "response"
        : "tool"
    conversationLog.push({ type, ts: "unknown", ...row.value, sourceLocator: locator })
  }

  diagnostics.push(
    diagnostic("task-prompt-missing", "Runtime event trace contains no task prompt", "file"),
    diagnostic("result-missing", "Runtime event trace records result timing/status but not result content", "file"),
    diagnostic("usage-missing", "Runtime event trace contains no token or cost usage", "file"),
  )
  const recordDiagnostics = [...diagnostics]
  const source = makeSource({
    format,
    representation,
    sourcePath,
    inputSha256,
    recordLocator: rows.length > 0 ? `lines:${rows[0]!.line}-${rows.at(-1)!.line}` : "file",
    taskIdSource: "file-basename",
    diagnostics: recordDiagnostics,
    values: { unknownFields: ["taskPrompt", "result.content", "usage"] },
  })
  return {
    format,
    representation,
    inputSha256,
    records: [{
      taskId: path.basename(sourcePath).replace(/\.(jsonl?|log|txt)$/i, ""),
      conversationLog,
      source,
    }],
    diagnostics,
  }
}

function adaptNativeConversation(
  sourcePath: string,
  inputSha256: string,
  rows: ParsedLine[],
): AdaptedTraceFile {
  const format = "skvm-conversation-jsonl/v1"
  const representation = "conversation-trace" as const
  const diagnostics: TraceDiagnostic[] = []
  const conversationLog: ConversationLogEntry[] = []

  for (const row of rows) {
    const locator = `line:${row.line}`
    if (!row.value) {
      diagnostics.push(diagnostic("malformed-row", row.error ?? "malformed JSON row", locator, "error"))
      continue
    }
    if (!isNativeConversation(row.value)) {
      diagnostics.push(diagnostic("unknown-event", `Unknown conversation entry type ${String(row.value.type)}`, locator))
      continue
    }
    conversationLog.push(row.value as ConversationLogEntry)
  }
  const firstLine = rows[0]?.line ?? 1
  const lastLine = rows.at(-1)?.line ?? firstLine
  const taskPrompt = conversationLog.find((entry) => entry.type === "request" && typeof entry.text === "string")?.text as string | undefined
  const unknownFields: string[] = ["usage"]
  if (!taskPrompt) unknownFields.push("taskPrompt")
  const source = makeSource({
    format,
    representation,
    sourcePath,
    inputSha256,
    recordLocator: `lines:${firstLine}-${lastLine}`,
    taskIdSource: "file-basename",
    diagnostics,
    values: { unknownFields },
  })
  return {
    format,
    representation,
    inputSha256,
    records: [{
      taskId: path.basename(sourcePath).replace(/\.(jsonl?|log|txt)$/i, ""),
      taskPrompt,
      conversationLog,
      source,
    }],
    diagnostics,
  }
}

function adaptSimpleReport(
  sourcePath: string,
  inputSha256: string,
  report: JsonObject,
): AdaptedTraceFile {
  const format = "simple-report/v1"
  const representation = "simple-report" as const
  const taskPrompt = report.task as string
  const conversationLog: ConversationLogEntry[] = [
    { type: "request", ts: "unknown", text: taskPrompt, sourceLocator: "json:task" },
  ]
  const feedback: string[] = []
  if (typeof report.outcome === "string") feedback.push(`Outcome: ${report.outcome}`)
  const issues = Array.isArray(report.issues)
    ? report.issues as string[]
    : typeof report.issues === "string" ? [report.issues] : []
  if (issues.length > 0) feedback.push(`Issues:\n${issues.map((item) => `- ${item}`).join("\n")}`)
  if (typeof report.skill_feedback === "string") feedback.push(`Skill feedback:\n${report.skill_feedback}`)
  if (feedback.length > 0) {
    conversationLog.push({ type: "response", ts: "unknown", text: feedback.join("\n\n"), sourceLocator: "json" })
  }

  const outcome = typeof report.outcome === "string" ? report.outcome.toLowerCase() : undefined
  let criteria: EvidenceCriterion[] | undefined
  if (outcome === "fail" || outcome === "partial") {
    const details = [
      ...issues.map((item) => `- ${item}`),
      typeof report.skill_feedback === "string" ? `Feedback: ${report.skill_feedback}` : "",
    ].filter(Boolean).join("\n")
    criteria = [{
      id: "agent-reported",
      name: "agent-reported",
      method: "custom",
      weight: 1,
      score: outcome === "partial" ? 0.5 : 0,
      passed: false,
      details: details || `outcome=${outcome}`,
    }]
  }
  const source = makeSource({
    format,
    representation,
    sourcePath,
    inputSha256,
    recordLocator: "json",
    taskIdSource: "file-basename",
    values: { unknownFields: ["conversation.turns", "conversation.timestamps", "usage"] },
  })
  return {
    format,
    representation,
    inputSha256,
    records: [{
      taskId: path.basename(sourcePath).replace(/\.(jsonl?|log|txt)$/i, ""),
      taskPrompt,
      conversationLog,
      criteria,
      source,
    }],
    diagnostics: [],
  }
}

/** Identify and adapt one external trace file without guessing absent facts. */
export async function adaptTraceFile(filePath: string): Promise<AdaptedTraceFile> {
  const sourcePath = path.resolve(filePath)
  const original = await Bun.file(sourcePath).text()
  const raw = stripMarkdownFences(stripBom(original).trim())
  const inputSha256 = digest(original)
  const rows = parseLines(raw)
  const values = rows.flatMap((row) => row.value ? [row.value] : [])

  if (values.some(isRawRun)) return adaptRawRuns(sourcePath, inputSha256, rows)
  if (values.some(isDurableTrace)) return adaptDurableTrace(sourcePath, inputSha256, rows)
  if (values.some(isNativeConversation)) return adaptNativeConversation(sourcePath, inputSha256, rows)

  const whole = objectValue(parseJson(raw))
  if (whole && isSimpleReport(whole)) return adaptSimpleReport(sourcePath, inputSha256, whole)

  return {
    format: "unrecognized",
    inputSha256,
    records: [],
    diagnostics: [diagnostic(
      "unrecognized-format",
      "Input does not match a supported trace or the narrow simple-report contract",
      "file",
      "error",
    )],
  }
}
