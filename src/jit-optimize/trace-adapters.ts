import path from "node:path"
import { readdir, stat } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import { DurableRuntimeTraceEventSchema } from "../core/durable-runtime-trace.ts"
import { piEventsToRunRecord, type PiEvent, type PiUserMessage } from "../core/pi-runtime.ts"
import { RunResultSchema, RunStatusSchema } from "../core/types.ts"
import {
  CapturedSourceEvaluationSchema,
  ObservedWorkdirSnapshotSchema,
  OptimizationSessionManifestSchema,
} from "../run/optimization-session.ts"
import { readPreRunInputSnapshot } from "../run/pre-run-input-snapshot.ts"
import { buildEvidenceCriteria } from "./evidence-criteria.ts"
import type {
  ConversationLogEntry,
  EvidenceCriterion,
  EvidenceInputResources,
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
  workDirSnapshot?: { files: Map<string, string> }
  inputResources?: EvidenceInputResources
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

function digest(value: string | Uint8Array): string {
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

function isTraceGuidedConsumptionReport(value: JsonObject): boolean {
  return value.schemaVersion === "skill-ir-trace-guided-agent-consumption/v1"
    && typeof value.identity === "string"
    && typeof value.condition === "string"
    && objectValue(value.source) !== undefined
    && objectValue(value.runtime) !== undefined
    && objectValue(value.targetAgent) !== undefined
    && objectValue(value.verification) !== undefined
    && objectValue(value.trace) !== undefined
}

function isGeneralSkillDevelopmentReport(value: JsonObject): boolean {
  return value.schemaVersion === "skill-ir-general-skill-development/v1"
    && typeof value.status === "string"
    && typeof value.prompt === "string"
    && objectValue(value.package) !== undefined
    && objectValue(value.runtime) !== undefined
    && objectValue(value.verification) !== undefined
}

function isOptimizationSessionReport(value: JsonObject): boolean {
  return value.schemaVersion === "skvm-run-optimization-session/v1"
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

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "[REDACTED]")
    .replace(/\b(api[_-]?key|access[_-]?token|token|password|secret)\s*([:=])\s*([^\s,;]+)/gi, "$1$2[REDACTED]")
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactString(value)
  if (Array.isArray(value)) return value.map(redactValue)
  const object = objectValue(value)
  if (!object) return value
  return Object.fromEntries(Object.entries(object).map(([key, item]) => [key, redactValue(item)]))
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

async function skillSnapshotDigest(skillDir: string): Promise<string> {
  const files: string[] = []
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) files.push(path.relative(skillDir, absolute).split(path.sep).join("/"))
    }
  }
  await visit(skillDir)
  const parts: string[] = []
  for (const relative of files.sort()) {
    parts.push(`${relative}\0${digest(await Bun.file(path.join(skillDir, ...relative.split("/"))).bytes())}`)
  }
  return digest(parts.join("\n"))
}

async function adaptOptimizationSession(
  sourcePath: string,
  inputSha256: string,
  report: JsonObject,
): Promise<AdaptedTraceFile> {
  const format = "skvm-run-optimization-session/v1"
  const representation = "conversation-trace" as const
  const diagnostics: TraceDiagnostic[] = []
  let manifest
  try {
    manifest = OptimizationSessionManifestSchema.parse(report)
  } catch (error) {
    return {
      format,
      representation,
      inputSha256,
      records: [],
      diagnostics: [diagnostic("invalid-session-manifest", `Session manifest is invalid: ${error}`, "json", "error")],
    }
  }
  const sessionDir = path.dirname(sourcePath)
  if (path.resolve(manifest.artifacts.manifest.path) !== sourcePath) {
    diagnostics.push(diagnostic("session-manifest-binding-mismatch", "Manifest self path does not match the supplied file", "json:artifacts.manifest.path", "error"))
  }
  const directArtifacts: Array<[string, { path: string; sha256?: string; bytes?: number }]> = [
    ["taskSnapshot", manifest.artifacts.taskSnapshot],
    ["conversationTrace", manifest.artifacts.conversationTrace],
    ["durableTrace", manifest.artifacts.durableTrace],
    ["runResult", manifest.artifacts.runResult],
    ["initialWorkdirManifest", manifest.artifacts.initialWorkdirManifest],
  ] as const
  if (manifest.artifacts.observedWorkdirSnapshot) {
    directArtifacts.push(["observedWorkdirSnapshot", manifest.artifacts.observedWorkdirSnapshot])
  }
  if (manifest.artifacts.preRunInputSnapshot) {
    directArtifacts.push(["preRunInputSnapshot", manifest.artifacts.preRunInputSnapshot])
  }
  if (manifest.artifacts.sourceEvaluation) {
    directArtifacts.push(["sourceEvaluation", manifest.artifacts.sourceEvaluation])
  }
  for (const [name, reference] of directArtifacts) {
    const artifactPath = path.resolve(reference.path)
    if (!isWithin(sessionDir, artifactPath)) {
      diagnostics.push(diagnostic("session-artifact-outside-root", `${name} is outside the session directory`, `json:artifacts.${name}.path`, "error"))
      continue
    }
    if (!reference.sha256 || !await exists(artifactPath)) {
      diagnostics.push(diagnostic("session-artifact-incomplete", `${name} is missing or has no completed digest`, `json:artifacts.${name}`, "error"))
      continue
    }
    const bytes = await Bun.file(artifactPath).bytes()
    if (digest(bytes) !== reference.sha256 || (reference.bytes !== undefined && bytes.byteLength !== reference.bytes)) {
      diagnostics.push(diagnostic("session-artifact-digest-mismatch", `${name} does not match its completed digest/size`, `json:artifacts.${name}`, "error"))
    }
  }
  const skillPath = path.resolve(manifest.artifacts.skillSnapshot.path)
  if (!isWithin(sessionDir, skillPath) || !await exists(skillPath)) {
    diagnostics.push(diagnostic("session-artifact-incomplete", "skillSnapshot is missing or outside the session directory", "json:artifacts.skillSnapshot", "error"))
  } else {
    const actualSkillDigest = await skillSnapshotDigest(path.dirname(skillPath))
    if (actualSkillDigest !== manifest.artifacts.skillSnapshot.sha256 || actualSkillDigest !== manifest.binding.skillSha256) {
      diagnostics.push(diagnostic("session-artifact-digest-mismatch", "skillSnapshot closure does not match its binding", "json:artifacts.skillSnapshot", "error"))
    }
  }
  if (manifest.sourceRun.status !== "completed" || manifest.sourceRun.runStatus !== "ok" || manifest.capture.status !== "complete" || manifest.handoff.status !== "ready") {
    diagnostics.push(diagnostic("session-handoff-not-ready", "Only a completed ok source run with complete capture can become optimizer evidence", "json:handoff", "error"))
  }
  if (manifest.artifacts.preRunInputSnapshot && manifest.capture.sourceInputs?.status !== "complete") {
    diagnostics.push(diagnostic(
      "session-handoff-not-ready",
      "A declared pre-run input snapshot requires a complete sourceInputs capture before it can become optimizer evidence",
      "json:capture.sourceInputs",
      "error",
    ))
  }
  let inputResources: EvidenceInputResources | undefined
  if (manifest.artifacts.preRunInputSnapshot) {
    try {
      const reference = manifest.artifacts.preRunInputSnapshot
      if (!reference.sha256 || reference.bytes === undefined) {
        throw new Error("pre-run input snapshot has no completed digest/size")
      }
      await readPreRunInputSnapshot({
        path: reference.path,
        sha256: reference.sha256,
        bytes: reference.bytes,
      })
      inputResources = {
        preRun: {
          source: "pre-run-input-snapshot",
          reference: {
            path: reference.path,
            sha256: reference.sha256,
            bytes: reference.bytes,
          },
        },
      }
    } catch (error) {
      diagnostics.push(diagnostic(
        "session-pre-run-input-invalid",
        `Pre-run input snapshot is invalid: ${error instanceof Error ? error.message : String(error)}`,
        "json:artifacts.preRunInputSnapshot",
        "error",
      ))
    }
  }
  if (diagnostics.some((item) => item.severity === "error")) {
    return { format, representation, inputSha256, records: [], diagnostics }
  }

  const task = objectValue(JSON.parse(await Bun.file(manifest.artifacts.taskSnapshot.path).text()))
  const taskPrompt = stringValue(task?.prompt)
  if (!taskPrompt || digest(taskPrompt) !== manifest.binding.promptSha256) {
    diagnostics.push(diagnostic("session-prompt-binding-mismatch", "Task prompt is missing or does not match the session binding", "json:binding.promptSha256", "error"))
    return { format, representation, inputSha256, records: [], diagnostics }
  }
  const runResult = RunResultSchema.parse(JSON.parse(await Bun.file(manifest.artifacts.runResult.path).text()))
  const rawConversation = parseLines(await Bun.file(manifest.artifacts.conversationTrace.path).text())
    .flatMap((row) => row.value && isNativeConversation(row.value) ? [row.value as ConversationLogEntry] : [])
  const stepConversation: ConversationLogEntry[] = runResult.steps.map((step) => ({
    type: step.role === "assistant" ? "response" : "tool",
    ts: Number.isFinite(step.timestamp) ? new Date(step.timestamp).toISOString() : "unknown",
    ...(step.text === undefined ? {} : { text: step.text }),
    ...(step.toolCalls.length === 0 ? {} : { toolCalls: step.toolCalls }),
    sourceLocator: "run-result:steps",
  }))
  const conversationLog = redactValue([
    { type: "request", ts: manifest.startedAt, text: taskPrompt, sourceLocator: "task-snapshot:prompt" },
    ...rawConversation,
    ...stepConversation,
    { type: "response", ts: manifest.updatedAt, text: runResult.text, sourceLocator: "run-result:text" },
  ]) as ConversationLogEntry[]
  const unknownFields: string[] = []
  let criteria: EvidenceCriterion[] | undefined
  if (manifest.artifacts.sourceEvaluation) {
    try {
      const evaluation = CapturedSourceEvaluationSchema.parse(JSON.parse(
        await Bun.file(manifest.artifacts.sourceEvaluation.path).text(),
      ))
      const flattened = buildEvidenceCriteria(evaluation.results)
      criteria = flattened.length > 0 ? flattened : undefined
      unknownFields.push(...evaluation.skipped.map((entry) => `evaluation.skipped:${entry.criterionId}`))
      unknownFields.push(...evaluation.errors.map((entry) => `evaluation.error:${entry.criterionId}`))
    } catch (error) {
      diagnostics.push(diagnostic("session-source-evaluation-invalid", `Source evaluation is invalid: ${error}`, "json:artifacts.sourceEvaluation", "error"))
      return { format, representation, inputSha256, records: [], diagnostics }
    }
  } else {
    unknownFields.push("criteria")
  }
  let workDirSnapshot: { files: Map<string, string> } | undefined
  if (manifest.artifacts.observedWorkdirSnapshot) {
    try {
      const observed = ObservedWorkdirSnapshotSchema.parse(JSON.parse(
        await Bun.file(manifest.artifacts.observedWorkdirSnapshot.path).text(),
      ))
      workDirSnapshot = {
        files: new Map(observed.files.flatMap((file) => {
          if (file.content === undefined) return []
          const bytes = new TextEncoder().encode(file.content)
          if (bytes.byteLength !== file.bytes || digest(bytes) !== file.sha256) {
            throw new Error(`observed output ${file.path} does not match its digest/size`)
          }
          return [[file.path, redactString(file.content)] as const]
        })),
      }
      unknownFields.push(...observed.contentOmissions.map((entry) => `observedOutputs.content:${entry.path}`))
    } catch (error) {
      diagnostics.push(diagnostic("session-observed-output-invalid", `Observed output snapshot is invalid: ${error}`, "json:artifacts.observedWorkdirSnapshot", "error"))
      return { format, representation, inputSha256, records: [], diagnostics }
    }
  } else {
    unknownFields.push("observedOutputs")
  }
  if (!inputResources) unknownFields.push("inputResources.preRun")
  const usage = runResult.usageAvailable === false ? undefined : {
    inputTokens: runResult.tokens.input,
    outputTokens: runResult.tokens.output,
    cacheReadTokens: runResult.tokens.cacheRead,
    cacheWriteTokens: runResult.tokens.cacheWrite,
    source: "run-result",
  }
  if (!usage) unknownFields.push("usage")
  unknownFields.push("usage.costUsd")
  const source = makeSource({
    format,
    representation,
    sourcePath,
    inputSha256,
    recordLocator: `run:${manifest.runId}`,
    taskIdSource: "source",
    diagnostics,
    values: {
      sourceAgent: manifest.binding.adapter,
      adapter: manifest.binding.adapter,
      model: manifest.binding.model,
      system: "source-run",
      taskPath: manifest.artifacts.taskSnapshot.path,
      skillPath: manifest.artifacts.skillSnapshot.path,
      workDirPath: manifest.binding.workDir,
      runStatus: runResult.runStatus,
      durationMs: runResult.durationMs,
      usage,
      unknownFields,
    },
  })
  return {
    format,
    representation,
    inputSha256,
    records: [{
      taskId: manifest.binding.taskId,
      taskPrompt: redactString(taskPrompt),
      conversationLog,
      ...(criteria ? { criteria } : {}),
      ...(workDirSnapshot ? { workDirSnapshot } : {}),
      ...(inputResources ? { inputResources } : {}),
      source,
    }],
    diagnostics,
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

function userText(message: PiUserMessage): string | undefined {
  if (typeof message.content === "string") return message.content
  const text = message.content.filter((item) => item.type === "text").map((item) => item.text).join("")
  return text || undefined
}

async function adaptTraceGuidedConsumptionReport(
  sourcePath: string,
  inputSha256: string,
  report: JsonObject,
): Promise<AdaptedTraceFile> {
  const format = "skill-ir-trace-guided-agent-consumption/v1"
  const representation = "conversation-trace" as const
  const diagnostics: TraceDiagnostic[] = []
  const trace = objectValue(report.trace)!
  const tracePath = resolveLocator(sourcePath, trace.path)
  if (!tracePath || !await exists(tracePath)) {
    diagnostics.push(diagnostic("trace-file-unavailable", "Consumption report raw trace is missing or unreadable", "json:trace", "error"))
    return { format, representation, inputSha256, records: [], diagnostics }
  }
  const rawTrace = await Bun.file(tracePath).text()
  const expectedTraceSha256 = stringValue(trace.sha256)
  if (expectedTraceSha256 && digest(rawTrace) !== expectedTraceSha256) {
    diagnostics.push(diagnostic("trace-digest-mismatch", "Consumption report raw trace digest does not match", "json:trace.sha256", "error"))
    return { format, representation, inputSha256, records: [], diagnostics }
  }
  let events: PiEvent[]
  try {
    const value = JSON.parse(rawTrace)
    if (!Array.isArray(value)) throw new Error("raw trace is not an event array")
    events = value as PiEvent[]
  } catch (error) {
    diagnostics.push(diagnostic("trace-parse-failed", error instanceof Error ? error.message : String(error), "json:trace", "error"))
    return { format, representation, inputSha256, records: [], diagnostics }
  }
  const runtime = objectValue(report.runtime)!
  const targetAgent = objectValue(report.targetAgent)!
  const sourceValue = objectValue(report.source)!
  const verification = objectValue(report.verification)!
  const parsedRunStatus = RunStatusSchema.safeParse(targetAgent.runStatus)
  if (!parsedRunStatus.success) {
    diagnostics.push(diagnostic("run-status-invalid", "Consumption report has an unsupported target-agent run status", "json:targetAgent.runStatus", "error"))
  }
  const runDir = resolveLocator(sourcePath, runtime.runDir)
  const workDirPath = runDir ? path.join(runDir, "work") : undefined
  const skillDir = resolveLocator(sourcePath, sourceValue.skillDir)
  const runRecord = piEventsToRunRecord(events).finish({
    workDir: workDirPath ?? path.dirname(sourcePath),
    durationMs: finiteNumber(targetAgent.durationMs) ?? 0,
    runStatus: parsedRunStatus.success ? parsedRunStatus.data : "parse-failed",
  })
  const taskPrompt = events
    .filter((event): event is Extract<PiEvent, { type: "message_end" }> => event.type === "message_end")
    .map((event) => event.message)
    .filter((message): message is PiUserMessage => message.role === "user")
    .map(userText)
    .find((text) => text !== undefined)
  const conversationLog: ConversationLogEntry[] = []
  if (taskPrompt) conversationLog.push({ type: "request", ts: "unknown", text: taskPrompt, sourceLocator: "raw-trace:user" })
  for (const step of runRecord.steps) {
    if (step.text) {
      conversationLog.push({
        type: "response",
        ts: Number.isFinite(step.timestamp) ? new Date(step.timestamp).toISOString() : "unknown",
        text: step.text,
        sourceLocator: "raw-trace:assistant",
      })
    }
    for (const call of step.toolCalls) {
      conversationLog.push({
        type: "tool",
        ts: Number.isFinite(step.timestamp) ? new Date(step.timestamp).toISOString() : "unknown",
        name: call.name,
        input: call.input,
        output: call.output,
        exitCode: call.exitCode,
        sourceLocator: `raw-trace:tool-call:${call.id}`,
      })
    }
  }
  const qualityPassed = typeof verification.qualityPassed === "boolean"
    ? verification.qualityPassed
    : undefined
  const criteria = qualityPassed === undefined ? undefined : [{
    id: "independent-api-checker",
    name: "independent-api-checker",
    method: "custom" as const,
    description: "Bound v2 public-contract checker result from the consumption report",
    weight: 1,
    score: qualityPassed ? 1 : 0,
    passed: qualityPassed,
    ...(!qualityPassed ? { details: JSON.stringify(verification.checkerReport ?? null) } : {}),
  }]
  const tokens = objectValue(targetAgent.tokens)
  const usageAvailable = targetAgent.usageAvailable === true && tokens !== undefined
  const usage = usageAvailable ? {
    inputTokens: finiteNumber(tokens.input),
    outputTokens: finiteNumber(tokens.output),
    cacheReadTokens: finiteNumber(tokens.cacheRead),
    cacheWriteTokens: finiteNumber(tokens.cacheWrite),
    source: "consumption-report-target-agent",
  } : undefined
  const unknownFields: string[] = []
  if (!taskPrompt) unknownFields.push("taskPrompt")
  if (!usage) unknownFields.push("usage")
  if (typeof targetAgent.actualCostUsd !== "number") unknownFields.push("usage.costUsd")
  const source = makeSource({
    format,
    representation,
    sourcePath,
    inputSha256,
    recordLocator: "json+raw-trace",
    taskIdSource: "source",
    diagnostics,
    values: {
      sourceAgent: stringValue(runtime.driver),
      adapter: stringValue(runtime.driver),
      model: stringValue(runtime.model),
      system: stringValue(report.condition),
      skillPath: skillDir ? path.join(skillDir, "SKILL.md") : undefined,
      workDirPath,
      runStatus: stringValue(targetAgent.runStatus),
      durationMs: finiteNumber(targetAgent.durationMs),
      usage,
      unknownFields,
    },
  })
  return {
    format,
    representation,
    inputSha256,
    records: [{
      taskId: stringValue(report.condition) ?? stringValue(report.identity)!,
      taskPrompt,
      conversationLog,
      criteria,
      workDirPath,
      source,
    }],
    diagnostics,
  }
}

async function adaptGeneralSkillDevelopmentReport(
  sourcePath: string,
  inputSha256: string,
  report: JsonObject,
): Promise<AdaptedTraceFile> {
  const format = "skill-ir-general-skill-development/v1"
  const representation = "conversation-trace" as const
  const diagnostics: TraceDiagnostic[] = []
  const runtime = objectValue(report.runtime)!
  const packageValue = objectValue(report.package)!
  const verification = objectValue(report.verification)!
  const trace = objectValue(runtime.agentEvents)
  const tracePath = resolveLocator(sourcePath, trace?.path)
  if (!trace || trace.format !== "gzip" || !tracePath || !await exists(tracePath)) {
    diagnostics.push(diagnostic(
      "trace-file-unavailable",
      "General-skill report bound gzip event archive is missing or unreadable",
      "json:runtime.agentEvents",
      "error",
    ))
    return { format, representation, inputSha256, records: [], diagnostics }
  }

  const compressed = await Bun.file(tracePath).bytes()
  if (finiteNumber(trace.bytes) !== undefined && trace.bytes !== compressed.byteLength) {
    diagnostics.push(diagnostic("trace-size-mismatch", "Compressed event archive size does not match", "json:runtime.agentEvents.bytes", "error"))
  }
  if (stringValue(trace.sha256) && digest(compressed) !== trace.sha256) {
    diagnostics.push(diagnostic("trace-digest-mismatch", "Compressed event archive digest does not match", "json:runtime.agentEvents.sha256", "error"))
  }
  if (diagnostics.some((item) => item.severity === "error")) {
    return { format, representation, inputSha256, records: [], diagnostics }
  }

  let raw: Uint8Array
  try {
    raw = new Uint8Array(gunzipSync(compressed))
  } catch (error) {
    diagnostics.push(diagnostic(
      "trace-decompression-failed",
      error instanceof Error ? error.message : String(error),
      "json:runtime.agentEvents",
      "error",
    ))
    return { format, representation, inputSha256, records: [], diagnostics }
  }
  if (finiteNumber(trace.rawBytes) !== undefined && trace.rawBytes !== raw.byteLength) {
    diagnostics.push(diagnostic("trace-raw-size-mismatch", "Raw event archive size does not match", "json:runtime.agentEvents.rawBytes", "error"))
  }
  if (stringValue(trace.rawSha256) && digest(raw) !== trace.rawSha256) {
    diagnostics.push(diagnostic("trace-raw-digest-mismatch", "Raw event archive digest does not match", "json:runtime.agentEvents.rawSha256", "error"))
  }
  if (diagnostics.some((item) => item.severity === "error")) {
    return { format, representation, inputSha256, records: [], diagnostics }
  }

  let events: PiEvent[]
  try {
    const value = JSON.parse(new TextDecoder().decode(raw))
    if (!Array.isArray(value)) throw new Error("raw trace is not an event array")
    events = value as PiEvent[]
  } catch (error) {
    diagnostics.push(diagnostic(
      "trace-parse-failed",
      error instanceof Error ? error.message : String(error),
      "json:runtime.agentEvents",
      "error",
    ))
    return { format, representation, inputSha256, records: [], diagnostics }
  }

  const exitCode = integerValue(runtime.exitCode)
  const runStatus = runtime.timedOut === true ? "timeout" : exitCode === 0 ? "ok" : "adapter-crashed"
  const workDirPath = resolveLocator(sourcePath, runtime.workDir)
  const runRecord = piEventsToRunRecord(events).finish({
    workDir: workDirPath ?? path.dirname(sourcePath),
    durationMs: finiteNumber(runtime.durationMs) ?? 0,
    runStatus,
  })
  const taskPrompt = stringValue(report.prompt)
  const conversationLog: ConversationLogEntry[] = []
  if (taskPrompt) conversationLog.push({ type: "request", ts: "unknown", text: taskPrompt, sourceLocator: "json:prompt" })
  for (const step of runRecord.steps) {
    if (step.text) {
      conversationLog.push({
        type: "response",
        ts: Number.isFinite(step.timestamp) ? new Date(step.timestamp).toISOString() : "unknown",
        text: step.text,
        sourceLocator: "gzip-pi-events:assistant",
      })
    }
    for (const call of step.toolCalls) {
      conversationLog.push({
        type: "tool",
        ts: Number.isFinite(step.timestamp) ? new Date(step.timestamp).toISOString() : "unknown",
        name: call.name,
        input: call.input,
        output: call.output,
        exitCode: call.exitCode,
        sourceLocator: `gzip-pi-events:tool-call:${call.id}`,
      })
    }
  }

  const taskPassed = typeof verification.taskPassed === "boolean" ? verification.taskPassed : undefined
  const criteria = taskPassed === undefined ? undefined : [{
    id: "general-skill-task-checker",
    name: "general-skill-task-checker",
    method: "custom" as const,
    description: "Bound expected-file, package-preservation and protected-resource result from the general-skill development report",
    weight: 1,
    score: taskPassed ? 1 : 0,
    passed: taskPassed,
    ...(!taskPassed ? { details: JSON.stringify(verification) } : {}),
  }]
  const tokens = objectValue(runtime.tokens)
  const usage = tokens ? {
    inputTokens: finiteNumber(tokens.input),
    outputTokens: finiteNumber(tokens.output),
    cacheReadTokens: finiteNumber(tokens.cacheRead),
    cacheWriteTokens: finiteNumber(tokens.cacheWrite),
    ...(finiteNumber(runtime.actualCostUsd) === undefined ? {} : { costUsd: finiteNumber(runtime.actualCostUsd) }),
    source: "general-skill-development-runtime",
  } : undefined
  const unknownFields: string[] = []
  if (!usage) unknownFields.push("usage")
  if (finiteNumber(runtime.actualCostUsd) === undefined) unknownFields.push("usage.costUsd")
  const skillDir = resolveLocator(sourcePath, packageValue.path)
  const source = makeSource({
    format,
    representation,
    sourcePath,
    inputSha256,
    recordLocator: "json+gzip-pi-events",
    taskIdSource: "source",
    diagnostics,
    values: {
      sourceAgent: stringValue(runtime.driver),
      adapter: stringValue(runtime.driver),
      model: stringValue(runtime.model),
      system: stringValue(packageValue.kind),
      skillPath: skillDir ? path.join(skillDir, "SKILL.md") : undefined,
      workDirPath,
      runStatus,
      durationMs: finiteNumber(runtime.durationMs),
      usage,
      unknownFields,
    },
  })
  return {
    format,
    representation,
    inputSha256,
    records: [{
      taskId: stringValue(packageValue.manifestIdentity) ?? path.basename(path.dirname(sourcePath)),
      taskPrompt,
      conversationLog,
      criteria,
      workDirPath,
      source,
    }],
    diagnostics,
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
  if (whole && isOptimizationSessionReport(whole)) {
    return adaptOptimizationSession(sourcePath, inputSha256, whole)
  }
  if (whole && isTraceGuidedConsumptionReport(whole)) {
    return adaptTraceGuidedConsumptionReport(sourcePath, inputSha256, whole)
  }
  if (whole && isGeneralSkillDevelopmentReport(whole)) {
    return adaptGeneralSkillDevelopmentReport(sourcePath, inputSha256, whole)
  }
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
