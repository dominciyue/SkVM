/**
 * Evidence-backed index of operations that actually occurred during a source
 * run.  This module is deliberately observational: it never reads the host
 * filesystem, executes a command, or turns a mention in prose into an
 * operation.  It consumes the normalized AgentStep shape when available and
 * the tool-call projection carried by Evidence.conversationLog otherwise.
 */

import type { AgentStep, ToolCall } from "../core/types.ts"
import type { ConversationLogEntry, Evidence } from "./types.ts"

export type OperationKind = "read" | "write" | "execute" | "other"
export type OperationStatus = "observed" | "unknown"
export type OperationExecutionRelation = "existing-entry" | "written-entry" | "unknown"
export type OperationParameterOrigin = "observed-value" | "task-variable" | "source-fixed" | "unknown"
export type OperationParameterBinding = "argv" | "config-field" | "env" | "path" | "unknown"

export interface OperationParameter {
  name: string
  tokenIndex?: number
  token?: string
  value?: string
  origin: OperationParameterOrigin
  binding: OperationParameterBinding
  sourceLocator: string
}

export interface OperationRecord {
  id: string
  toolCallId: string | null
  toolName: string
  kind: OperationKind
  status: OperationStatus
  sourceLocator: string
  /** The executable/script path when an unambiguous command supplied one. */
  entry?: string
  /** Exact command tokens recovered from an unambiguous argv/command. */
  argv?: string[]
  /** Original command string, retained separately from argv. */
  rawCommand?: string
  /** Original path argument for read/write calls. */
  rawPath?: string
  cwd?: string
  cwdSource?: "invocation" | "evidence-trace"
  readFiles: string[]
  writeFiles: string[]
  exitCode?: number
  exitCodeSource?: "tool-call" | "tool-output"
  durationMs?: number
  durationSource?: "tool-call"
  executionRelation?: OperationExecutionRelation
  parameters: OperationParameter[]
  unknownReason?: string
}

export interface OperationContextSummary {
  observedOperationCount: number
  unknownOperationCount: number
  repeatedEntries: string[]
  writtenThenExecuted: string[]
  sourceEntriesNotCalled: string[]
}

export interface OperationContext {
  schemaVersion: "jit-optimize-operation-context/v1"
  evidenceIndex?: number
  taskId?: string
  operations: OperationRecord[]
  summary: OperationContextSummary
}

export interface OperationContextOptions {
  evidenceIndex?: number
  /** Known executable source paths from the skill resource index. */
  sourceEntries?: readonly string[]
}

export interface OperationContextInput {
  evidence?: Evidence
  steps?: readonly AgentStep[]
}

type JsonRecord = Record<string, unknown>

interface RawOperationCall {
  id: string | null
  name: string
  input: JsonRecord
  output?: string
  exitCode?: number
  durationMs?: number
  sourceLocator: string
  timestamp?: number
}

const INTERPRETERS = new Set([
  "python", "python3", "py", "node", "nodejs", "bun", "deno", "ruby", "perl",
  "pwsh", "powershell", "bash", "sh", "zsh", "cmd", "cmd.exe",
])
const SHELL_WRAPPERS = new Set(["sh", "bash", "zsh", "pwsh", "powershell", "cmd", "cmd.exe"])
const INPUT_FLAGS = new Set(["--input", "--in", "--source", "--src", "--file", "-i"])
const OUTPUT_FLAGS = new Set(["--output", "--out", "--dest", "--destination", "--result", "-o"])

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function normalizePath(value: string): string {
  const portable = value.trim().replaceAll("\\", "/")
  return portable.startsWith("./") ? portable.slice(2) : portable
}

function normalizeToolInput(value: unknown): JsonRecord {
  if (!isRecord(value)) return {}
  return value
}

function normalizedCall(value: unknown, sourceLocator: string, timestamp?: number): RawOperationCall | undefined {
  if (!isRecord(value)) return undefined
  const name = stringValue(value.name) ?? stringValue(value.toolName)
  if (!name) return undefined
  const id = stringValue(value.id) ?? stringValue(value.toolCallId) ?? null
  const input = normalizeToolInput(value.input ?? value.arguments ?? value.args)
  const exitCode = numberValue(value.exitCode)
  const durationMs = numberValue(value.durationMs)
  return {
    id,
    name,
    input,
    ...(stringValue(value.output) === undefined ? {} : { output: stringValue(value.output) }),
    ...(exitCode === undefined ? {} : { exitCode }),
    ...(durationMs === undefined ? {} : { durationMs }),
    sourceLocator,
    ...(timestamp === undefined ? {} : { timestamp }),
  }
}

function callsFromConversation(log: readonly ConversationLogEntry[]): RawOperationCall[] {
  const calls: RawOperationCall[] = []
  for (let index = 0; index < log.length; index++) {
    const entry = log[index]!
    const base = stringValue(entry.sourceLocator) ?? `conversation:${index + 1}`
    const timestamp = Date.parse(entry.ts)
    const numericTimestamp = Number.isFinite(timestamp) ? timestamp : undefined
    const nested = Array.isArray(entry.toolCalls) ? entry.toolCalls : []
    for (let nestedIndex = 0; nestedIndex < nested.length; nestedIndex++) {
      const candidate = normalizeToolCallValue(nested[nestedIndex], `${base}#tool-call`)
      if (!candidate) continue
      calls.push({
        ...candidate,
        sourceLocator: withCallLocator(base, candidate.id, nestedIndex),
        ...(numericTimestamp === undefined ? {} : { timestamp: numericTimestamp }),
      })
    }
    if (entry.type === "tool") {
      const candidate = normalizedCall(entry, withCallLocator(base, stringValue(entry.id), 0), numericTimestamp)
      if (candidate) calls.push(candidate)
    }
  }
  return calls
}

function normalizeToolCallValue(value: unknown, sourceLocator: string): RawOperationCall | undefined {
  if (!isRecord(value)) return undefined
  const candidate = normalizedCall(value, sourceLocator)
  if (candidate) return candidate
  // Some older conversation records use `arguments` plus `toolCallId` and do
  // not expose `input`; normalizedCall already handles that shape, so this is
  // kept as a named helper to make the source dialect explicit.
  return undefined
}

function withCallLocator(base: string, id: string | null | undefined, index: number): string {
  const suffix = id ? `#tool-call/${id}` : `#tool-call/unknown-${index}`
  return base.includes("#tool-call/") ? base : `${base}${suffix}`
}

function callsFromSteps(steps: readonly AgentStep[]): RawOperationCall[] {
  const calls: RawOperationCall[] = []
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    const step = steps[stepIndex]!
    for (let callIndex = 0; callIndex < step.toolCalls.length; callIndex++) {
      const call = step.toolCalls[callIndex]!
      calls.push({
        id: call.id,
        name: call.name,
        input: call.input,
        ...(call.output === undefined ? {} : { output: call.output }),
        ...(call.exitCode === undefined ? {} : { exitCode: call.exitCode }),
        ...(call.durationMs === undefined ? {} : { durationMs: call.durationMs }),
        sourceLocator: `agent-step:${stepIndex}#tool-call/${call.id || `unknown-${callIndex}`}`,
        timestamp: step.timestamp,
      })
    }
  }
  return calls
}

function inputFor(input: Evidence | readonly AgentStep[] | OperationContextInput): {
  evidence?: Evidence
  steps: readonly AgentStep[]
  conversationCalls: RawOperationCall[]
} {
  if (Array.isArray(input)) return { steps: input, conversationCalls: [] }
  if (isRecord(input) && ("evidence" in input || "steps" in input)) {
    const wrapped = input as OperationContextInput
    const evidence = wrapped.evidence
    const extraSteps = wrapped.steps ?? ((evidence as (Evidence & { steps?: readonly AgentStep[] }) | undefined)?.steps ?? [])
    return {
      ...(evidence ? { evidence } : {}),
      steps: extraSteps,
      conversationCalls: evidence ? callsFromConversation(evidence.conversationLog) : [],
    }
  }
  const evidence = input as Evidence
  const extraSteps = (evidence as Evidence & { steps?: readonly AgentStep[] }).steps ?? []
  return { evidence, steps: extraSteps, conversationCalls: callsFromConversation(evidence.conversationLog) }
}

function callKey(call: RawOperationCall): string {
  return `${call.id ?? "missing"}\0${call.name}\0${JSON.stringify(call.input)}\0${call.output ?? ""}\0${call.exitCode ?? ""}`
}

function mergeCalls(conversationCalls: RawOperationCall[], stepCalls: RawOperationCall[]): RawOperationCall[] {
  const result: RawOperationCall[] = []
  const keys = new Set<string>()
  for (const call of [...conversationCalls, ...stepCalls]) {
    const key = callKey(call)
    if (keys.has(key)) continue
    keys.add(key)
    result.push(call)
  }
  return result
}

function kindFor(name: string): OperationKind {
  if (name === "read_file") return "read"
  if (name === "write_file") return "write"
  if (name === "execute_command") return "execute"
  return "other"
}

interface ParsedCommand {
  argv?: string[]
  ambiguousReason?: string
}

function parseCommand(command: string): ParsedCommand {
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | undefined
  let escaping = false
  let operatorOutsideQuote = false
  for (let index = 0; index < command.length; index++) {
    const character = command[index]!
    if (escaping) {
      current += character
      escaping = false
      continue
    }
    if (character === "\\" && quote !== "'") {
      const next = command[index + 1]
      if (next === undefined || next === '"' || next === "\\" || /\s/u.test(next)) {
        escaping = true
        continue
      }
      // Backslashes in Windows paths are ordinary path characters. Preserve
      // them here; the record normalizes only the derived path fields.
      current += character
      continue
    }
    if (quote) {
      if (character === quote) quote = undefined
      else current += character
      continue
    }
    if (character === "'" || character === '"') {
      quote = character
      continue
    }
    if (character === "|" || character === ";" || character === ">" || character === "<" || character === "&" || character === "\n" || character === "\r" || character === "`") {
      operatorOutsideQuote = true
      continue
    }
    if (/\s/u.test(character)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ""
      }
    } else {
      current += character
    }
  }
  if (escaping || quote) return { ambiguousReason: "ambiguous-shell-command" }
  if (operatorOutsideQuote) return { ambiguousReason: "ambiguous-shell-command" }
  if (current.length > 0) tokens.push(current)
  if (tokens.length === 0) return { ambiguousReason: "missing-command" }
  const executable = tokens[0]!.toLowerCase()
  if (SHELL_WRAPPERS.has(executable)) return { ambiguousReason: "nested-shell-command" }
  return { argv: tokens }
}

function explicitArgv(input: JsonRecord): string[] | undefined {
  if (!Array.isArray(input.argv) || !input.argv.every((item) => typeof item === "string")) return undefined
  return input.argv as string[]
}

function commandEntry(argv: readonly string[]): string | undefined {
  if (argv.length === 0) return undefined
  const first = argv[0]!.toLowerCase()
  if (!INTERPRETERS.has(first)) return normalizePath(argv[0]!)
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]!
    if (token === "-c" || token === "-Command" || token === "--command" || token === "-e") return undefined
    if (token === "-m" || token === "--module") return undefined
    if (token.startsWith("-")) continue
    return normalizePath(token)
  }
  return undefined
}

function commandFilesAndParameters(argv: readonly string[], sourceLocator: string): {
  readFiles: string[]
  writeFiles: string[]
  parameters: OperationParameter[]
} {
  const readFiles: string[] = []
  const writeFiles: string[] = []
  const parameters: OperationParameter[] = []
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]!
    if (!token.startsWith("-")) continue
    const equalIndex = token.indexOf("=")
    const flag = equalIndex === -1 ? token : token.slice(0, equalIndex)
    const inlineValue = equalIndex === -1 ? undefined : token.slice(equalIndex + 1)
    const nextValue = inlineValue ?? (argv[index + 1] && !argv[index + 1]!.startsWith("-") ? argv[index + 1] : undefined)
    const name = flag.replace(/^-+/, "") || flag
    parameters.push({
      name,
      tokenIndex: index,
      token,
      ...(nextValue === undefined ? {} : { value: nextValue }),
      origin: "unknown",
      binding: "argv",
      sourceLocator,
    })
    if (nextValue === undefined) continue
    const normalized = normalizePath(nextValue)
    if (INPUT_FLAGS.has(flag)) readFiles.push(normalized)
    if (OUTPUT_FLAGS.has(flag)) writeFiles.push(normalized)
    if (inlineValue === undefined) index++
  }
  return { readFiles: [...new Set(readFiles)], writeFiles: [...new Set(writeFiles)], parameters }
}

function parsedExitCode(call: RawOperationCall): { value?: number; source?: "tool-call" | "tool-output" } {
  if (call.exitCode !== undefined) return { value: call.exitCode, source: "tool-call" }
  const match = call.output?.match(/(?:^|\n)\s*exit code:\s*(-?\d+)/i)
  if (!match) return {}
  const value = Number(match[1])
  return Number.isInteger(value) ? { value, source: "tool-output" } : {}
}

function buildRecord(call: RawOperationCall, evidenceCwd: string | undefined, ordinal: number): OperationRecord {
  const kind = kindFor(call.name)
  const base: OperationRecord = {
    id: `operation-${ordinal}`,
    toolCallId: call.id,
    toolName: call.name,
    kind,
    status: "observed",
    sourceLocator: call.sourceLocator,
    readFiles: [],
    writeFiles: [],
    parameters: [],
  }
  const exit = parsedExitCode(call)
  if (exit.value !== undefined) {
    base.exitCode = exit.value
    base.exitCodeSource = exit.source
  }
  if (call.durationMs !== undefined) {
    base.durationMs = call.durationMs
    base.durationSource = "tool-call"
  }

  if (kind === "read" || kind === "write") {
    const rawPath = stringValue(call.input.path)
    if (!rawPath) {
      base.status = "unknown"
      base.unknownReason = "missing-file-path"
      return base
    }
    base.rawPath = rawPath
    const normalized = normalizePath(rawPath)
    if (kind === "read") base.readFiles = [normalized]
    else base.writeFiles = [normalized]
    return base
  }

  if (kind !== "execute") return base
  const rawCommand = stringValue(call.input.command)
  const argv = explicitArgv(call.input) ?? (rawCommand ? parseCommand(rawCommand).argv : undefined)
  const parseFailure = rawCommand && !argv ? parseCommand(rawCommand).ambiguousReason : undefined
  if (!argv) {
    base.status = "unknown"
    base.unknownReason = parseFailure ?? "missing-command-argv"
    if (rawCommand !== undefined) base.rawCommand = rawCommand
    if (typeof call.input.cwd === "string") {
      base.cwd = call.input.cwd
      base.cwdSource = "invocation"
    } else if (evidenceCwd) {
      base.cwd = evidenceCwd
      base.cwdSource = "evidence-trace"
    }
    return base
  }
  base.argv = [...argv]
  if (rawCommand !== undefined) base.rawCommand = rawCommand
  const cwd = stringValue(call.input.cwd)
  if (cwd !== undefined) {
    base.cwd = cwd
    base.cwdSource = "invocation"
  } else if (evidenceCwd) {
    base.cwd = evidenceCwd
    base.cwdSource = "evidence-trace"
  }
  base.entry = commandEntry(argv)
  const files = commandFilesAndParameters(argv, call.sourceLocator)
  base.readFiles = files.readFiles
  base.writeFiles = files.writeFiles
  base.parameters = files.parameters
  if (!base.entry && base.argv.length > 0) {
    base.status = "unknown"
    base.unknownReason = "command-entry-unresolved"
  }
  return base
}

function assignRelations(records: OperationRecord[], sourceEntries: readonly string[]): {
  repeated: string[]
  writtenThenExecuted: string[]
  executed: Set<string>
} {
  const written = new Set<string>()
  const executed = new Set<string>()
  const entryCounts = new Map<string, number>()
  for (const record of records) {
    for (const file of record.writeFiles) written.add(file)
    if (record.kind !== "execute" || !record.entry) continue
    const entry = normalizePath(record.entry)
    record.entry = entry
    record.executionRelation = written.has(entry)
      ? "written-entry"
      : sourceEntries.some((candidate) => normalizePath(candidate) === entry)
        ? "existing-entry"
        : "unknown"
    executed.add(entry)
    entryCounts.set(entry, (entryCounts.get(entry) ?? 0) + 1)
  }
  const repeated = [...entryCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([entry]) => entry)
    .sort((left, right) => left.localeCompare(right, "en"))
  const writtenThenExecuted = [...written].filter((entry) => executed.has(entry)).sort((left, right) => left.localeCompare(right, "en"))
  return { repeated, writtenThenExecuted, executed }
}

/** Build an operation index from Evidence, AgentStep[], or a wrapped pair. */
export function buildOperationContext(
  input: Evidence | readonly AgentStep[] | OperationContextInput,
  options: OperationContextOptions = {},
): OperationContext {
  const normalized = inputFor(input)
  const calls = mergeCalls(normalized.conversationCalls, callsFromSteps(normalized.steps))
  const evidenceCwd = normalized.evidence?.trace?.workDirPath
  const operations = calls.map((call, index) => buildRecord(call, evidenceCwd, index))
  const internal = assignRelations(operations, options.sourceEntries ?? [])
  const sourceEntries = [...new Set((options.sourceEntries ?? []).map(normalizePath))].sort((left, right) => left.localeCompare(right, "en"))
  const executed = internal?.executed ?? new Set<string>()
  return {
    schemaVersion: "jit-optimize-operation-context/v1",
    ...(options.evidenceIndex === undefined ? {} : { evidenceIndex: options.evidenceIndex }),
    ...(normalized.evidence?.taskId ? { taskId: normalized.evidence.taskId } : {}),
    operations,
    summary: {
      observedOperationCount: operations.filter((operation) => operation.status === "observed").length,
      unknownOperationCount: operations.filter((operation) => operation.status === "unknown").length,
      repeatedEntries: internal?.repeated ?? [],
      writtenThenExecuted: internal?.writtenThenExecuted ?? [],
      sourceEntriesNotCalled: sourceEntries.filter((entry) => !executed.has(entry)),
    },
  }
}

/** Alias used by callers that want to emphasize extraction over rendering. */
export const extractOperationRecords = buildOperationContext

/** Build one context per Evidence while preserving the caller's flat index. */
export function buildOperationContexts(
  evidences: readonly Evidence[],
  options: Omit<OperationContextOptions, "evidenceIndex"> = {},
): OperationContext[] {
  return evidences.map((evidence, index) => buildOperationContext(evidence, { ...options, evidenceIndex: index }))
}

// Keep the imported type in the emitted declaration surface for consumers that
// use the normalized ToolCall contract as their own adapter boundary.
export type { ToolCall }
