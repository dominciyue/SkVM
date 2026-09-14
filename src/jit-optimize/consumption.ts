import type { AgentStep, ToolCall } from "../core/types.ts"

export type ConsumptionMatch = "structured-argv" | "shell-command"
export type ConsumptionExitStatus = "zero" | "non-zero" | "unknown"
export type ConsumptionOutputAssertion = "passed" | "failed" | "not-applicable" | "unknown"
export type ConsumptionTaskOutcome = "passed" | "failed" | "not-checked"

export interface SkillConsumptionInvocation {
  toolCallId: string
  entry: string
  match: ConsumptionMatch
  exitStatus: ConsumptionExitStatus
  outputAssertion: ConsumptionOutputAssertion
}

export interface SkillConsumptionAnalysis {
  skillRead: boolean
  helperInvoked: boolean
  helperSucceeded: boolean
  skillReadToolCallIds: string[]
  skillReadUnknownToolCallIds: string[]
  helperToolCallIds: string[]
  helperSuccessfulToolCallIds: string[]
  helperHelpToolCallIds: string[]
  helperFailedToolCallIds: string[]
  helperNotApplicableToolCallIds: string[]
  helperUnassertedToolCallIds: string[]
  helperUnknownToolCallIds: string[]
  entrypointDiscoveryToolCallIds: string[]
  programRewriteToolCallIds: string[]
  programExecutionToolCallIds: string[]
  helperExitStatus: {
    zero: string[]
    nonZero: string[]
    unknown: string[]
  }
  helperOutputAssertion: {
    passed: string[]
    failed: string[]
    notApplicable: string[]
    unknown: string[]
  }
  invocations: SkillConsumptionInvocation[]
  observations: {
    skillReadCount: number
    helperInvocationCount: number
    helperHelpCount: number
    entrypointDiscoveryCount: number
    programRewriteCount: number
    programExecutionCount: number
  }
  fallbackUsed: boolean
  declaredEntrypoints: string[]
  documentationOnly: boolean
  residualWorkRequired: boolean
  residualWorkCompleted: boolean
  residualCompletion: { required: boolean; completed: boolean }
  taskOutcome: ConsumptionTaskOutcome
  taskQuality: { status: ConsumptionTaskOutcome; passed: boolean }
  consumptionComplete: boolean
}

export interface AnalyzeSkillConsumptionOptions {
  skillPaths?: string[]
  executableEntries?: string[]
  documentationOnly?: boolean
  residualWorkRequired?: boolean
  /** Supplied only from an independent output/task check, never inferred from final prose. */
  residualWorkCompleted?: boolean
  /** Supplied by the task checker; helper success alone is not task success. */
  taskOutcome?: ConsumptionTaskOutcome
}

interface ParsedShell {
  tokens: string[]
  ambiguousReason?: string
}

interface ParsedInvocation {
  kind: ConsumptionMatch
  argv?: string[]
  tokens: string[]
  ambiguousReason?: string
}

const INTERPRETERS = new Set([
  "node", "nodejs", "bun", "deno", "python", "python3", "python.exe", "py",
  "sh", "bash", "zsh", "dash", "pwsh", "powershell", "powershell.exe",
])
const EVAL_FLAGS = new Set(["-c", "-e", "--eval", "--command", "-command", "-Command"])
const MODULE_FLAGS = new Set(["-m", "--module"])
const SHELL_WRAPPERS = new Set(["sh", "bash", "zsh", "dash", "cmd", "cmd.exe", "pwsh", "powershell", "powershell.exe"])
const READ_COMMANDS = new Set(["cat", "type", "get-content", "sed", "head", "tail", "less", "more"])
const BOOLEAN_FLAGS = new Set(["--help", "-h", "--verbose", "--quiet", "--strict", "--dry-run", "--force", "--json"])

function portablePath(value: string): string {
  return value.replaceAll("\\", "/").trim().replace(/^['"]|['"]$/gu, "").replace(/^\.\//u, "")
}

function pathBasename(value: string): string {
  const normalizedValue = portablePath(value)
  return normalizedValue.slice(normalizedValue.lastIndexOf("/") + 1).toLowerCase()
}

function pathSegments(value: string): string[] {
  return portablePath(value).split("/").filter((segment) => segment.length > 0 && segment !== ".")
}

function packageRoots(skillPaths: readonly string[]): string[] {
  const roots = new Set<string>()
  for (const skillPath of skillPaths) {
    const segments = pathSegments(skillPath)
    if (segments.length > 1) roots.add(segments.slice(0, -1).join("/").toLowerCase())
  }
  return [...roots]
}

/** Canonicalize only known package-root prefixes; arbitrary directory prefixes are not stripped. */
function canonicalPath(value: string, roots: readonly string[]): string {
  let result = portablePath(value).replace(/\/+/gu, "/").replace(/^\/+/u, "")
  const lower = result.toLowerCase()
  const knownRoots = [...roots, "skill"].sort((left, right) => right.length - left.length)
  for (const root of knownRoots) {
    const prefix = `${root.toLowerCase()}/`
    if (lower.startsWith(prefix)) {
      result = result.slice(root.length + 1)
      break
    }
  }
  return result.toLowerCase()
}

function parseShell(command: string): ParsedShell {
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | undefined
  let escaping = false
  let ambiguousReason: string | undefined
  const push = () => {
    if (current.length > 0) tokens.push(current)
    current = ""
  }
  for (let index = 0; index < command.length; index += 1) {
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
      push()
      ambiguousReason ??= "ambiguous-shell-command"
      continue
    }
    if (/\s/u.test(character)) {
      push()
      continue
    }
    current += character
  }
  if (escaping || quote) ambiguousReason ??= "ambiguous-shell-command"
  push()
  if (tokens.length === 0) ambiguousReason ??= "missing-command"
  const first = tokens[0] ? pathBasename(tokens[0]) : ""
  if (SHELL_WRAPPERS.has(first) && tokens.some((token) => EVAL_FLAGS.has(token))) {
    ambiguousReason ??= "nested-shell-command"
  }
  return { tokens, ...(ambiguousReason ? { ambiguousReason } : {}) }
}

function arrayOfStrings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function parseInvocation(input: Record<string, unknown>): ParsedInvocation | undefined {
  const directArgv = arrayOfStrings(input.argv)
  if (directArgv) return { kind: "structured-argv", argv: directArgv, tokens: directArgv }
  const program = typeof input.program === "string" ? input.program : undefined
  const args = arrayOfStrings(input.args)
  if (program && args) {
    const argv = [program, ...args]
    return { kind: "structured-argv", argv, tokens: argv }
  }
  const commandObject = asRecord(input.command)
  if (commandObject) {
    const objectProgram = typeof commandObject.program === "string" ? commandObject.program : undefined
    const objectArgs = arrayOfStrings(commandObject.args)
    if (objectProgram && objectArgs) {
      const argv = [objectProgram, ...objectArgs]
      return { kind: "structured-argv", argv, tokens: argv }
    }
  }
  if (typeof input.command === "string") {
    const parsed = parseShell(input.command)
    return {
      kind: "shell-command",
      argv: parsed.tokens,
      tokens: parsed.tokens,
      ...(parsed.ambiguousReason ? { ambiguousReason: parsed.ambiguousReason } : {}),
    }
  }
  return undefined
}

function entryFromArgv(argv: readonly string[]): { entry?: string; ambiguousReason?: string } {
  if (argv.length === 0) return { ambiguousReason: "missing-command" }
  const executable = pathBasename(argv[0]!)
  if (SHELL_WRAPPERS.has(executable) && argv.some((token) => EVAL_FLAGS.has(token))) {
    return { ambiguousReason: "nested-shell-command" }
  }
  if (!INTERPRETERS.has(executable)) return argv[0]!.startsWith("-") ? { ambiguousReason: "missing-entry" } : { entry: argv[0] }
  let skipNext = false
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]!
    if (skipNext) {
      skipNext = false
      continue
    }
    if (EVAL_FLAGS.has(token)) return { ambiguousReason: "evaluated-command" }
    if (MODULE_FLAGS.has(token)) return { ambiguousReason: "module-command" }
    if (executable === "bun" && token === "run") continue
    if (token === "-I" || token === "--require" || token === "-r" || token === "--loader" || token === "--cwd") {
      skipNext = true
      continue
    }
    if (token.startsWith("-")) continue
    return { entry: token }
  }
  return { ambiguousReason: "missing-entry" }
}

function outputAssertion(output: string | undefined): ConsumptionOutputAssertion {
  if (!output || output.trim().length === 0) return "unknown"
  if (/(?:"status"\s*:\s*"(?:unsupported|not-applicable)"|\bnot[- ]applicable\b)/iu.test(output)) return "not-applicable"
  if (/(?:"ok"\s*:\s*false|"status"\s*:\s*"(?:failed|failure|error|rejected)"|\b(?:failed|failure|error|rejected)\b)/iu.test(output)) return "failed"
  if (/(?:"status"\s*:\s*"(?:passed|pass|success|approved)"|"ok"\s*:\s*true|(?:^|\n)result:\s*approved(?:\r?\n|$))/iu.test(output)) return "passed"
  return "unknown"
}

function exitStatus(call: ToolCall): ConsumptionExitStatus {
  if (call.exitCode === 0) return "zero"
  if (typeof call.exitCode === "number") return "non-zero"
  return "unknown"
}

function isReadTool(name: string): boolean {
  return /(?:^|[_-])read(?:$|[_-])|read_file|readfile|get[-_]?content|cat/u.test(name)
}

function isWriteTool(name: string): boolean {
  return /(?:^|[_-])(?:write|edit|patch|replace)(?:$|[_-])/u.test(name)
}

function isReadCommand(argv: readonly string[]): boolean {
  return argv.length > 0 && READ_COMMANDS.has(pathBasename(argv[0]!))
}

function inputPathValues(input: Record<string, unknown>): string[] {
  const values: string[] = []
  for (const key of ["path", "file", "filePath", "filename", "target", "source"]) {
    if (typeof input[key] === "string") values.push(input[key] as string)
  }
  for (const key of ["paths", "files"]) {
    const items = arrayOfStrings(input[key])
    if (items) values.push(...items)
  }
  return values
}

function commandPathValues(argv: readonly string[]): string[] {
  if (!isReadCommand(argv)) return []
  const values: string[] = []
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index]!
    if (token.startsWith("-")) {
      if (!BOOLEAN_FLAGS.has(token) && index + 1 < argv.length && !argv[index + 1]!.startsWith("-")) index += 1
      continue
    }
    if (pathBasename(argv[0]!) === "sed" && index === 1) continue
    values.push(token)
  }
  return values
}

function callPathValues(input: Record<string, unknown>, parsed: ParsedInvocation | undefined): string[] {
  return [...inputPathValues(input), ...(parsed?.argv ? commandPathValues(parsed.argv) : [])]
}

function matchesCanonical(value: string, entries: ReadonlySet<string>, roots: readonly string[]): string | undefined {
  const canonical = canonicalPath(value, roots)
  return entries.has(canonical) ? canonical : undefined
}

function helperMentionedInAmbiguousTokens(tokens: readonly string[], entries: ReadonlySet<string>, roots: readonly string[]): string | undefined {
  for (const token of tokens) {
    const match = matchesCanonical(token, entries, roots)
    if (match) return match
  }
  return undefined
}

function helpInvocation(tokens: readonly string[]): boolean {
  return tokens.some((token) => token === "--help" || token === "-h" || token.startsWith("--help="))
}

export function analyzeSkillConsumption(
  steps: AgentStep[],
  options: AnalyzeSkillConsumptionOptions = {},
): SkillConsumptionAnalysis {
  const rawSkillPaths = options.skillPaths ?? ["skill/SKILL.md"]
  const roots = packageRoots(rawSkillPaths)
  const declaredEntrypoints = [...(options.executableEntries ?? [])]
  const normalizedSkillPaths = new Set(rawSkillPaths.map((item) => canonicalPath(item, roots)))
  const normalizedEntrypoints = new Set(declaredEntrypoints.map((item) => canonicalPath(item, roots)))
  const skillReadToolCallIds: string[] = []
  const skillReadUnknownToolCallIds: string[] = []
  const helperToolCallIds: string[] = []
  const helperSuccessfulToolCallIds: string[] = []
  const helperHelpToolCallIds: string[] = []
  const helperFailedToolCallIds: string[] = []
  const helperNotApplicableToolCallIds: string[] = []
  const helperUnassertedToolCallIds: string[] = []
  const helperUnknownToolCallIds: string[] = []
  const entrypointDiscoveryToolCallIds: string[] = []
  const programRewriteToolCallIds: string[] = []
  const programExecutionToolCallIds: string[] = []
  const helperExitStatus = { zero: [] as string[], nonZero: [] as string[], unknown: [] as string[] }
  const helperOutputAssertion = { passed: [] as string[], failed: [] as string[], notApplicable: [] as string[], unknown: [] as string[] }
  const invocations: SkillConsumptionInvocation[] = []

  for (const step of steps) {
    for (const call of step.toolCalls) {
      const input = asRecord(call.input) ?? {}
      const name = call.name.toLowerCase()
      const parsed = parseInvocation(input)
      const pathValues = callPathValues(input, parsed)
      const readIntent = isReadTool(name) || Boolean(parsed?.argv && isReadCommand(parsed.argv))
      const writeIntent = isWriteTool(name)
      const matchedSkillPath = pathValues.some((value) => normalizedSkillPaths.has(canonicalPath(value, roots)))
      if (readIntent && matchedSkillPath) {
        if (call.exitCode === undefined) skillReadUnknownToolCallIds.push(call.id)
        else if (call.exitCode === 0) skillReadToolCallIds.push(call.id)
      }

      if (declaredEntrypoints.length > 0) {
        if (readIntent && pathValues.some((value) => matchesCanonical(value, normalizedEntrypoints, roots))) {
          entrypointDiscoveryToolCallIds.push(call.id)
        }
        if (writeIntent && pathValues.some((value) => matchesCanonical(value, normalizedEntrypoints, roots))) {
          programRewriteToolCallIds.push(call.id)
        }
      }

      if (!parsed || declaredEntrypoints.length === 0) continue
      const candidate = parsed.ambiguousReason
        ? { ambiguousReason: parsed.ambiguousReason }
        : parsed.argv
          ? entryFromArgv(parsed.argv)
          : { ambiguousReason: "missing-command" }
      const entry = candidate.entry ? matchesCanonical(candidate.entry, normalizedEntrypoints, roots) : undefined
      if (!entry) {
        const ambiguousEntry = (parsed.ambiguousReason || candidate.ambiguousReason)
          ? helperMentionedInAmbiguousTokens(parsed.tokens, normalizedEntrypoints, roots)
          : undefined
        if (ambiguousEntry) helperUnknownToolCallIds.push(call.id)
        continue
      }
      const match = parsed.kind
      const status = exitStatus(call)
      const assertion = outputAssertion(call.output)
      invocations.push({ toolCallId: call.id, entry, match, exitStatus: status, outputAssertion: assertion })
      helperToolCallIds.push(call.id)
      programExecutionToolCallIds.push(call.id)
      if (status === "zero") helperExitStatus.zero.push(call.id)
      else if (status === "non-zero") helperExitStatus.nonZero.push(call.id)
      else helperExitStatus.unknown.push(call.id)
      if (assertion === "passed") helperOutputAssertion.passed.push(call.id)
      else if (assertion === "failed") helperOutputAssertion.failed.push(call.id)
      else if (assertion === "not-applicable") helperOutputAssertion.notApplicable.push(call.id)
      else helperOutputAssertion.unknown.push(call.id)
      const isHelp = helpInvocation(parsed.tokens)
      if (isHelp) helperHelpToolCallIds.push(call.id)
      if (assertion === "not-applicable") {
        helperNotApplicableToolCallIds.push(call.id)
      } else if (status === "zero" && assertion === "passed") {
        helperSuccessfulToolCallIds.push(call.id)
      } else if (!isHelp && status === "zero" && assertion === "unknown") {
        helperUnassertedToolCallIds.push(call.id)
      } else if (status === "unknown") {
        helperUnknownToolCallIds.push(call.id)
        if (assertion === "failed") helperFailedToolCallIds.push(call.id)
      } else if (status === "non-zero" || assertion === "failed") {
        helperFailedToolCallIds.push(call.id)
      }
    }
  }

  const helperSucceeded = helperSuccessfulToolCallIds.length > 0
  const documentationOnly = options.documentationOnly ?? false
  const residualWorkRequired = options.residualWorkRequired ?? false
  const residualWorkCompleted = options.residualWorkCompleted ?? false
  const taskOutcome = options.taskOutcome ?? "not-checked"
  const fallbackUsed = helperNotApplicableToolCallIds.length > 0 && taskOutcome === "passed"
  const helperRequirementMet = documentationOnly || declaredEntrypoints.length === 0 || helperSucceeded || fallbackUsed
  // An attempted read with an unknown exit is retained as evidence, but it
  // cannot by itself prove that the package was actually loaded.
  const consumptionComplete = skillReadToolCallIds.length > 0
    && helperRequirementMet
    && (!residualWorkRequired || residualWorkCompleted)
    && taskOutcome === "passed"
  return {
    skillRead: skillReadToolCallIds.length > 0 || skillReadUnknownToolCallIds.length > 0,
    helperInvoked: helperToolCallIds.length > 0,
    helperSucceeded,
    skillReadToolCallIds,
    skillReadUnknownToolCallIds,
    helperToolCallIds,
    helperSuccessfulToolCallIds,
    helperHelpToolCallIds,
    helperFailedToolCallIds,
    helperNotApplicableToolCallIds,
    helperUnassertedToolCallIds,
    helperUnknownToolCallIds,
    entrypointDiscoveryToolCallIds,
    programRewriteToolCallIds,
    programExecutionToolCallIds,
    helperExitStatus,
    helperOutputAssertion,
    invocations,
    observations: {
      skillReadCount: skillReadToolCallIds.length + skillReadUnknownToolCallIds.length,
      helperInvocationCount: helperToolCallIds.length,
      helperHelpCount: helperHelpToolCallIds.length,
      entrypointDiscoveryCount: entrypointDiscoveryToolCallIds.length,
      programRewriteCount: programRewriteToolCallIds.length,
      programExecutionCount: programExecutionToolCallIds.length,
    },
    fallbackUsed,
    declaredEntrypoints,
    documentationOnly,
    residualWorkRequired,
    residualWorkCompleted,
    residualCompletion: { required: residualWorkRequired, completed: residualWorkCompleted },
    taskOutcome,
    taskQuality: { status: taskOutcome, passed: taskOutcome === "passed" },
    consumptionComplete,
  }
}
