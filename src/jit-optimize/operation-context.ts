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

/** A source/task declaration used only to explain parameter provenance. */
export interface OperationParameterRule {
  /** Flag name without leading dashes, positional name (arg0), config field, or env name. */
  name: string
  binding?: OperationParameterBinding
  origin: Exclude<OperationParameterOrigin, "unknown">
  /** When present, the rule applies only when the observed value matches one of these values. */
  values?: readonly string[]
  /** Convenience form for a single fixed value. */
  value?: string
  sourceLocator: string
  required?: boolean
  optional?: boolean
}

export interface OperationParameter {
  name: string
  tokenIndex?: number
  token?: string
  value?: string
  /** True for an observed value/flag and false for a declared-but-missing parameter. */
  present: boolean
  required?: boolean
  optional?: boolean
  origin: OperationParameterOrigin
  binding: OperationParameterBinding
  sourceLocator: string
  /** Locator of the source/task declaration that justified the origin. */
  originLocator?: string
  /** First character offset of an exact value match in the task prompt. */
  promptIndex?: number
  /** All exact value match offsets in the task prompt. */
  promptIndices?: number[]
  configPath?: string
  configField?: string
  /** Environment values are intentionally never copied into the context. */
  redacted?: boolean
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
  /** Optional task prompt override supplied by an adapter. */
  taskPrompt?: string
  /** Known executable source paths from the skill resource index. */
  sourceEntries?: readonly string[]
  /** Optional source text used only to recognize literal source-fixed values. */
  sourceText?: string
  /** Explicit source/task parameter declarations when the source exposes them. */
  sourceParameterRules?: readonly OperationParameterRule[]
  /** Extra task values/names supplied by an adapter; values are not treated as ranges. */
  taskVariableValues?: readonly string[]
  taskVariableNames?: readonly string[]
  /** Digest-bound config contents already present in the evidence; no host reads occur. */
  configFiles?: Readonly<Record<string, string | JsonRecord>>
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
const CONFIG_FLAGS = new Set(["--config", "--config-file", "--settings", "--options"])
const BOOLEAN_FLAGS = new Set([
  "--help", "-h", "--verbose", "--quiet", "--strict", "--dry-run", "--force",
  "--allow-fallback", "--no-color", "--json", "--debug",
])

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

function looksLikePath(value: string): boolean {
  if (value.length === 0 || /^https?:\/\//iu.test(value)) return false
  return value.includes("/") || value.includes("\\") || /\.[A-Za-z0-9]{1,8}$/u.test(value)
}

function normalizeToolInput(value: unknown): JsonRecord {
  if (!isRecord(value)) return {}
  return value
}

function compareParameterValues(left: string, right: string): boolean {
  const a = normalizePath(left)
  const b = normalizePath(right)
  return a === b || left === right
}

function stringifiedValue(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value)
  if (Array.isArray(value) || isRecord(value)) {
    try {
      return JSON.stringify(value)
    } catch {
      return undefined
    }
  }
  return undefined
}

function promptMatches(prompt: string, value: string | undefined): number[] {
  if (!value || value.length === 0 || prompt.length === 0) return []
  const candidates = [...new Set([value, normalizePath(value)])]
  const indexes = new Set<number>()
  for (const candidate of candidates) {
    let from = 0
    while (from < prompt.length) {
      const index = prompt.indexOf(candidate, from)
      if (index < 0) break
      indexes.add(index)
      from = index + Math.max(candidate.length, 1)
    }
  }
  return [...indexes].sort((left, right) => left - right)
}

function normalizeParameterName(name: string): string {
  return name.replace(/^--+/u, "")
}

function ruleNamesMatch(ruleName: string, parameterName: string): boolean {
  return normalizeParameterName(ruleName) === normalizeParameterName(parameterName)
}

function ruleValueMatches(rule: OperationParameterRule, value: string | undefined): boolean {
  const values = [
    ...(rule.values ?? []),
    ...(rule.value === undefined ? [] : [rule.value]),
  ]
  if (values.length === 0) return true
  if (value === undefined) return false
  return values.some((candidate) => compareParameterValues(candidate, value))
}

function lineLocator(text: string, offset: number, prefix: string): string {
  const line = text.slice(0, Math.max(offset, 0)).split(/\r?\n/u).length
  return `${prefix}:${line}`
}

/**
 * Infer only literal assignments from source text.  This is intentionally
 * conservative: dynamic expressions and example paths are not promoted to
 * source-fixed parameters.  Explicit rules remain the preferred interface.
 */
function inferSourceFixedRules(sourceText: string | undefined): OperationParameterRule[] {
  if (!sourceText) return []
  const rules: OperationParameterRule[] = []
  const seen = new Set<string>()
  const add = (name: string, value: string, offset: number): void => {
    const normalizedName = normalizeParameterName(name)
    if (!normalizedName || /^(?:input|in|source|src|file|output|out|dest|destination|result|config|settings)$/iu.test(normalizedName)) return
    const key = `${normalizedName}\0${value}`
    if (seen.has(key)) return
    seen.add(key)
    rules.push({
      name: normalizedName,
      binding: "argv",
      origin: "source-fixed",
      values: [value],
      sourceLocator: lineLocator(sourceText, offset, "source-text"),
    })
  }

  const assignment = /\b([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]+)"|'([^']+)'|(\d+(?:\.\d+)?|true|false))(?![A-Za-z0-9_-])/gu
  for (const match of sourceText.matchAll(assignment)) {
    const value = match[2] ?? match[3] ?? match[4]
    if (value !== undefined) add(match[1]!, value, match.index ?? 0)
  }

  const flagValue = /--([A-Za-z][A-Za-z0-9-]*)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s,;)}\]]+))/gu
  for (const match of sourceText.matchAll(flagValue)) {
    const value = match[2] ?? match[3] ?? match[4]
    if (value !== undefined) add(match[1]!, value, match.index ?? 0)
  }
  return rules
}

interface ParameterProvenanceContext {
  taskPrompt: string
  rules: readonly OperationParameterRule[]
  sourceFixedRules: readonly OperationParameterRule[]
  taskVariableValues: readonly string[]
  taskVariableNames: ReadonlySet<string>
  configFiles: ReadonlyMap<string, string | JsonRecord>
}

function provenanceContext(
  evidence: Evidence | undefined,
  options: OperationContextOptions,
): ParameterProvenanceContext {
  const configFiles = new Map<string, string | JsonRecord>()
  for (const [filePath, content] of Object.entries(options.configFiles ?? {})) {
    configFiles.set(normalizePath(filePath), content)
  }
  for (const [filePath, content] of evidence?.workDirSnapshot?.files ?? []) {
    const normalized = normalizePath(filePath)
    if (!configFiles.has(normalized)) configFiles.set(normalized, content)
  }
  const taskPrompt = options.taskPrompt ?? evidence?.taskPrompt ?? ""
  const explicitRules = options.sourceParameterRules ?? []
  const inferredRules = inferSourceFixedRules(options.sourceText)
  const rules = [...explicitRules, ...inferredRules]
  return {
    taskPrompt,
    rules,
    sourceFixedRules: rules.filter((rule) => rule.origin === "source-fixed"),
    taskVariableValues: [...(options.taskVariableValues ?? [])],
    taskVariableNames: new Set((options.taskVariableNames ?? []).map(normalizeParameterName)),
    configFiles,
  }
}

function matchingRules(
  context: ParameterProvenanceContext,
  name: string,
  binding: OperationParameterBinding,
  value: string | undefined,
): OperationParameterRule[] {
  return context.rules.filter((rule) => {
    if (rule.binding !== undefined && rule.binding !== binding) return false
    if (!ruleNamesMatch(rule.name, name)) return false
    return ruleValueMatches(rule, value)
  })
}

function sensitiveParameterName(name: string): boolean {
  return /(?:password|passwd|secret|token|api[-_]?key|private[-_]?key|credential)/iu.test(name)
}

function parameterWithProvenance(input: {
  context: ParameterProvenanceContext
  name: string
  binding: OperationParameterBinding
  value?: string
  present: boolean
  sourceLocator: string
  tokenIndex?: number
  token?: string
  required?: boolean
  optional?: boolean
  configPath?: string
  configField?: string
  redacted?: boolean
}): OperationParameter {
  const {
    context,
    name,
    binding,
    value,
    present,
    sourceLocator,
    tokenIndex,
    token,
    configPath,
    configField,
  } = input
  const rules = matchingRules(context, name, binding, value)
  const sourceRule = rules.find((rule) => rule.origin === "source-fixed")
  const taskRule = rules.find((rule) => rule.origin === "task-variable")
  const promptIndices = value === undefined ? [] : promptMatches(context.taskPrompt, value)
  const taskValueMatch = value !== undefined && context.taskVariableValues.some((candidate) => compareParameterValues(candidate, value))
  const taskNameMatch = context.taskVariableNames.has(normalizeParameterName(name))

  let origin: OperationParameterOrigin = "unknown"
  let originLocator: string | undefined
  if (!present) {
    origin = "unknown"
    originLocator = rules[0]?.sourceLocator ?? sourceLocator
  } else if (sourceRule) {
    origin = "source-fixed"
    originLocator = sourceRule.sourceLocator
  } else if (taskRule || promptIndices.length > 0 || taskValueMatch || taskNameMatch) {
    origin = "task-variable"
    originLocator = taskRule?.sourceLocator ?? (promptIndices.length > 0 ? "task-prompt" : sourceLocator)
  } else if (value !== undefined && !input.redacted) {
    origin = "observed-value"
    originLocator = sourceLocator
  } else if (input.redacted) {
    origin = "unknown"
    originLocator = sourceLocator
  }

  const redacted = input.redacted || sensitiveParameterName(name)
  const result: OperationParameter = {
    name,
    ...(tokenIndex === undefined ? {} : { tokenIndex }),
    ...(token === undefined ? {} : { token }),
    ...(value === undefined || redacted ? {} : { value }),
    present,
    ...(input.required === undefined && rules[0]?.required === undefined
      ? {}
      : { required: input.required ?? rules[0]?.required }),
    ...(input.optional === undefined && rules[0]?.optional === undefined
      ? {}
      : { optional: input.optional ?? rules[0]?.optional }),
    origin,
    binding,
    sourceLocator,
    ...(originLocator ? { originLocator } : {}),
    ...(promptIndices.length > 0 ? { promptIndex: promptIndices[0], promptIndices } : {}),
    ...(configPath === undefined ? {} : { configPath }),
    ...(configField === undefined ? {} : { configField }),
    ...(redacted ? { redacted: true } : {}),
  }
  return result
}

function configPathFromInput(input: JsonRecord, argv: readonly string[]): string | undefined {
  const explicit = stringValue(input.configPath)
  if (explicit) return normalizePath(explicit)
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]!
    if (!CONFIG_FLAGS.has(token.split("=", 1)[0]!)) continue
    const inline = token.includes("=") ? token.slice(token.indexOf("=") + 1) : argv[index + 1]
    if (inline) return normalizePath(inline)
  }
  return undefined
}

function flattenConfigFields(value: unknown, prefix = ""): Array<{ name: string; value: string }> {
  if (!isRecord(value)) return []
  const fields: Array<{ name: string; value: string }> = []
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key
    if (isRecord(child) && !Array.isArray(child)) fields.push(...flattenConfigFields(child, name))
    else {
      const serialized = stringifiedValue(child)
      if (serialized !== undefined) fields.push({ name, value: serialized })
    }
  }
  return fields
}

function configFieldsFromInput(
  input: JsonRecord,
  configPath: string | undefined,
  context: ParameterProvenanceContext,
): Array<{ name: string; value: string; configPath?: string }> {
  const direct = input.configFields ?? input.config
  if (isRecord(direct)) {
    return flattenConfigFields(direct).map((field) => ({ ...field, ...(configPath ? { configPath } : {}) }))
  }
  if (!configPath) return []
  const content = context.configFiles.get(configPath)
  if (isRecord(content)) return flattenConfigFields(content).map((field) => ({ ...field, configPath }))
  if (typeof content !== "string") return []
  try {
    const parsed: unknown = JSON.parse(content)
    return flattenConfigFields(parsed).map((field) => ({ ...field, configPath }))
  } catch {
    return []
  }
}

function environmentNames(input: JsonRecord, argv: readonly string[]): string[] {
  const names = new Set<string>()
  if (isRecord(input.env)) {
    for (const name of Object.keys(input.env)) names.add(name)
  }
  for (const token of argv) {
    const dollar = token.match(/^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/u)
    const percent = token.match(/^%([A-Za-z_][A-Za-z0-9_]*)%$/u)
    const name = dollar?.[1] ?? percent?.[1]
    if (name) names.add(name)
  }
  return [...names].sort((left, right) => left.localeCompare(right, "en"))
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
  if (isRecord(input) && ("evidence" in input || ("steps" in input && !("taskId" in input) && !("conversationLog" in input)))) {
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

function commandEntryIndex(argv: readonly string[]): number | undefined {
  if (argv.length === 0) return undefined
  const first = argv[0]!.toLowerCase()
  if (!INTERPRETERS.has(first)) return 0
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index]!
    if (token === "-m" || token === "--module" || token === "-c" || token === "-Command" || token === "--command" || token === "-e") return undefined
    if (token.startsWith("-")) continue
    return index
  }
  return undefined
}

function commandFilesAndParameters(
  argv: readonly string[],
  sourceLocator: string,
  context: ParameterProvenanceContext,
  input: JsonRecord,
): {
  readFiles: string[]
  writeFiles: string[]
  parameters: OperationParameter[]
} {
  const readFiles: string[] = []
  const writeFiles: string[] = []
  const parameters: OperationParameter[] = []
  const consumed = new Set<number>()
  const entryIndex = commandEntryIndex(argv)
  const start = entryIndex === undefined ? 1 : entryIndex + 1
  const positionalIndexes: number[] = []
  for (let index = start; index < argv.length; index++) {
    const token = argv[index]!
    if (!token.startsWith("-")) {
      positionalIndexes.push(index)
      continue
    }
    const equalIndex = token.indexOf("=")
    const flag = equalIndex === -1 ? token : token.slice(0, equalIndex)
    const inlineValue = equalIndex === -1 ? undefined : token.slice(equalIndex + 1)
    const nextCandidate = argv[index + 1]
    const nextValue = inlineValue ?? (nextCandidate && !nextCandidate.startsWith("-") && !BOOLEAN_FLAGS.has(flag) ? nextCandidate : undefined)
    const name = flag.replace(/^-+/, "") || flag
    parameters.push(parameterWithProvenance({
      context,
      name,
      tokenIndex: index,
      token,
      ...(nextValue === undefined ? {} : { value: nextValue }),
      binding: "argv",
      sourceLocator,
      present: true,
    }))
    if (nextValue === undefined) continue
    consumed.add(index + 1)
    const normalized = normalizePath(nextValue)
    if (INPUT_FLAGS.has(flag)) readFiles.push(normalized)
    if (OUTPUT_FLAGS.has(flag)) writeFiles.push(normalized)
    if (CONFIG_FLAGS.has(flag)) readFiles.push(normalized)
  }

  let positionalOrdinal = 0
  for (const index of positionalIndexes) {
    if (consumed.has(index)) continue
    const value = argv[index]!
    const parameter = parameterWithProvenance({
      context,
      name: `arg${positionalOrdinal}`,
      tokenIndex: index,
      token: value,
      value,
      binding: "argv",
      sourceLocator,
      present: true,
    })
    parameters.push(parameter)
    positionalOrdinal++
    // A path-like positional value is an observed input candidate.  Do not
    // claim output semantics without an explicit --out/--output binding.
    if (looksLikePath(value)) readFiles.push(normalizePath(value))
  }

  const configPath = configPathFromInput(input, argv)
  for (const field of configFieldsFromInput(input, configPath, context)) {
    parameters.push(parameterWithProvenance({
      context,
      name: field.name,
      value: field.value,
      binding: "config-field",
      sourceLocator,
      present: true,
      configPath: field.configPath,
      configField: field.name,
      redacted: sensitiveParameterName(field.name),
    }))
  }

  for (const name of environmentNames(input, argv)) {
    parameters.push(parameterWithProvenance({
      context,
      name,
      binding: "env",
      sourceLocator,
      present: true,
      redacted: true,
    }))
  }

  const presentNames = new Set(parameters.map((parameter) => `${parameter.binding}\0${normalizeParameterName(parameter.name)}`))
  for (const rule of context.rules) {
    if (!rule.optional && !rule.required) continue
    const key = `${rule.binding ?? "argv"}\0${normalizeParameterName(rule.name)}`
    if (presentNames.has(key)) continue
    parameters.push(parameterWithProvenance({
      context,
      name: normalizeParameterName(rule.name),
      binding: rule.binding ?? "argv",
      sourceLocator: rule.sourceLocator,
      present: false,
      required: rule.required,
      optional: rule.optional,
      ...(rule.binding === "config-field" ? { configField: rule.name } : {}),
    }))
  }

  parameters.sort((left, right) => (left.tokenIndex ?? Number.MAX_SAFE_INTEGER) - (right.tokenIndex ?? Number.MAX_SAFE_INTEGER)
    || left.name.localeCompare(right.name, "en"))
  return { readFiles: [...new Set(readFiles)], writeFiles: [...new Set(writeFiles)], parameters }
}

function parsedExitCode(call: RawOperationCall): { value?: number; source?: "tool-call" | "tool-output" } {
  if (call.exitCode !== undefined) return { value: call.exitCode, source: "tool-call" }
  const match = call.output?.match(/(?:^|\n)\s*exit code:\s*(-?\d+)/i)
  if (!match) return {}
  const value = Number(match[1])
  return Number.isInteger(value) ? { value, source: "tool-output" } : {}
}

function buildRecord(
  call: RawOperationCall,
  evidenceCwd: string | undefined,
  ordinal: number,
  context: ParameterProvenanceContext,
): OperationRecord {
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
    base.parameters = [parameterWithProvenance({
      context,
      name: "path",
      value: rawPath,
      binding: "path",
      sourceLocator: call.sourceLocator,
      present: true,
      redacted: sensitiveParameterName(rawPath),
    })]
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
  const files = commandFilesAndParameters(argv, call.sourceLocator, context, call.input)
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
  const provenance = provenanceContext(normalized.evidence, options)
  const operations = calls.map((call, index) => buildRecord(call, evidenceCwd, index, provenance))
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
