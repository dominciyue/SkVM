import { createHash, randomUUID } from "node:crypto"
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { LLMProvider } from "../../providers/types.ts"
import {
  measureAuthorizationPromptCharacters,
  renderAuthorizationTask,
  type AuthorizationPromptCharacterBreakdown,
  type AuthorizationRenderArm,
} from "../../task-dsl/authorization/render.ts"
import type { AnalysisDiagnostic } from "../../task-dsl/authorization/relations.ts"
import type { AuthorizationResultV0 } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import {
  runAuthorizationTask,
  type AuthorizationTaskRun,
  type RunAuthorizationTaskOptions,
} from "./host.ts"
import { renderSourceBundle } from "./inputs.ts"
import {
  loadLocalAuthorizationInput,
  type LocalAnalysisProfile,
  type LocalInputResult,
} from "./local-input.ts"

export type LocalAuthorizationProviderFactory = (modelId: string) => Promise<LLMProvider> | LLMProvider
export type LocalAuthorizationRunnerEnv = Record<string, string | undefined>

export interface LocalAuthorizationCheckReport {
  schemaVersion: "authorization-local-check/v1"
  status: "valid" | "invalid"
  inputPath: string
  taskId?: string
  repository?: string
  sourceRef?: string
  sourceRoot?: string
  sourceFiles?: string[]
  arm?: AuthorizationRenderArm
  analysisProfile?: LocalAnalysisProfile
  requirementCount?: number
  ledgerEntryCount?: number
  preview?: string
  promptCharacters?: AuthorizationPromptCharacterBreakdown
  diagnostics: AnalysisDiagnostic[]
}

export type LocalAuthorizationSessionStatus =
  | AuthorizationTaskRun["status"]
  | "provider-unavailable"
  | "completion-unknown"
  | "initialized"

const NonEmptyString = z.string().trim().min(1)
const LocalAuthorizationSessionStatusSchema = z.enum([
  "completed",
  "completed-with-diagnostics",
  "needs-input",
  "input-invalid",
  "transport-failed",
  "timeout-unknown",
  "provider-unavailable",
  "completion-unknown",
  "initialized",
])
const AuthorizationTaskRunStatusSchema = z.enum([
  "completed",
  "completed-with-diagnostics",
  "needs-input",
  "input-invalid",
  "transport-failed",
  "timeout-unknown",
])
const PersistedLocalSessionSchema = z.object({
  schemaVersion: z.literal("authorization-local-session/v1"),
  sessionId: NonEmptyString,
  createdAt: NonEmptyString,
  inputPath: NonEmptyString.optional(),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  model: NonEmptyString.optional(),
  arm: z.enum(["N", "B", "D"]).optional(),
  analysisProfile: z.unknown().optional(),
  noAutomaticResend: z.literal(true).optional(),
}).passthrough()
const PersistedLocalSessionReportSchema = z.object({
  schemaVersion: z.literal("authorization-local-result/v1"),
  sessionId: NonEmptyString,
  sessionPath: NonEmptyString,
  createdAt: NonEmptyString,
  status: LocalAuthorizationSessionStatusSchema,
  inputPath: NonEmptyString.optional(),
  taskId: NonEmptyString.optional(),
  model: NonEmptyString.optional(),
  arm: z.enum(["N", "B", "D"]).optional(),
  finalKind: z.enum(["initial", "repair"]).optional(),
}).passthrough()
const PersistedLocalDispatchSchema = z.object({
  schemaVersion: z.literal("authorization-local-dispatch/v1"),
  sessionId: NonEmptyString,
  model: NonEmptyString,
  arm: z.enum(["N", "B", "D"]),
}).passthrough()
const PersistedAuthorizationRunSchema = z.object({
  status: AuthorizationTaskRunStatusSchema,
  arm: z.enum(["N", "B", "D"]),
  finalKind: z.enum(["initial", "repair"]).optional(),
  initial: z.unknown().optional(),
  repair: z.unknown().optional(),
}).passthrough()
const LocalSessionIndexEntrySchema = z.object({
  schemaVersion: z.literal("authorization-local-session-index-entry/v1"),
  sessionId: NonEmptyString,
  relativePath: NonEmptyString,
  status: z.union([LocalAuthorizationSessionStatusSchema, z.literal("running")]),
  createdAt: NonEmptyString,
  updatedAt: NonEmptyString.optional(),
}).strict()

export interface LocalAuthorizationSessionReport {
  schemaVersion: "authorization-local-result/v1"
  sessionId: string
  sessionPath: string
  createdAt: string
  status: LocalAuthorizationSessionStatus
  inputPath?: string
  taskId?: string
  repository?: string
  sourceRef?: string
  model?: string
  arm?: AuthorizationRenderArm
  analysisProfile?: LocalAnalysisProfile
  finalKind?: "initial" | "repair"
  canonicalResult?: AuthorizationResultV0
  relationCoverage?: unknown[]
  coverageValidation?: unknown
  telemetry?: AuthorizationTaskRun["telemetry"]
  promptCharacters?: AuthorizationTaskRun["promptCharacters"]
  artifacts?: {
    session: string
    check: string
    input: string
    task: string
    sourceBundle: string
    analysisRequirements: string
    preview: string
    dispatch?: string
    events?: string
    run?: string
    result?: string
    summary?: string
  }
  error?: { name: string; message: string }
}

interface LocalSessionIndexEntry {
  schemaVersion: "authorization-local-session-index-entry/v1"
  sessionId: string
  relativePath: string
  status: LocalAuthorizationSessionStatus | "running"
  createdAt: string
  updatedAt: string
}

export interface LocalAuthorizationCliDependencies {
  stdout: (value: string) => void
  stderr: (value: string) => void
  providerFactory?: LocalAuthorizationProviderFactory
  env?: LocalAuthorizationRunnerEnv
}

class LocalAuthorizationRunnerError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message)
    this.name = "LocalAuthorizationRunnerError"
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relation = path.relative(root, candidate)
  return relation === "" || (!relation.startsWith(`..${path.sep}`) && relation !== ".." && !path.isAbsolute(relation))
}

async function pathKind(candidate: string): Promise<"file" | "directory" | "missing"> {
  try {
    const metadata = await stat(candidate)
    if (metadata.isFile()) return "file"
    if (metadata.isDirectory()) return "directory"
    return "missing"
  } catch {
    return "missing"
  }
}

async function writeExclusive(candidate: string, value: string): Promise<void> {
  await writeFile(candidate, value, { encoding: "utf8", flag: "wx" })
}

async function writeJsonExclusive(candidate: string, value: unknown): Promise<void> {
  await writeExclusive(candidate, `${JSON.stringify(value, null, 2)}\n`)
}

function errorArtifact(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  }
}

function checkReport(loaded: LocalInputResult, arm: AuthorizationRenderArm): LocalAuthorizationCheckReport {
  if (loaded.status === "invalid") {
    return {
      schemaVersion: "authorization-local-check/v1",
      status: "invalid",
      inputPath: loaded.inputPath,
      diagnostics: loaded.diagnostics,
    }
  }
  const compiled = compileAuthorizationTask(loaded.task)
  const sourceContext = renderSourceBundle(loaded.sourceBundle)
  const rendered = renderAuthorizationTask(compiled, arm, loaded.analysisPlan)
  const renderedPrompt = rendered.prompt.replace("<SOURCE_CONTEXT_INSERTED_BY_HOST>", sourceContext)
  const preview = [
    `<!-- analysis-profile: ${loaded.analysisProfile.id}; origin: ${loaded.analysisProfile.origin} -->`,
    renderedPrompt,
  ].join("\n\n")
  return {
    schemaVersion: "authorization-local-check/v1",
    status: "valid",
    inputPath: loaded.inputPath,
    taskId: loaded.task.taskId,
    repository: loaded.task.repository,
    sourceRef: loaded.task.sourceRef,
    sourceRoot: loaded.sourceRoot,
    sourceFiles: loaded.sourceBundle.files.map(file => file.relativePath),
    arm,
    analysisProfile: loaded.analysisProfile,
    requirementCount: loaded.analysisRequirements.length,
    ledgerEntryCount: loaded.analysisPlan.entries.length,
    preview,
    promptCharacters: measureAuthorizationPromptCharacters(rendered, sourceContext),
    diagnostics: [],
  }
}

export async function checkLocalAuthorizationInput(
  inputFile: string,
  arm: AuthorizationRenderArm = "B",
): Promise<LocalAuthorizationCheckReport> {
  return checkReport(await loadLocalAuthorizationInput(inputFile), arm)
}

function sessionIdFor(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:.]/g, "")
  return `${timestamp}-${randomUUID().replaceAll("-", "").slice(0, 8)}`
}

async function createSession(outRoot: string): Promise<{
  sessionId: string
  sessionPath: string
  relativePath: string
  createdAt: string
}> {
  const absoluteRoot = path.resolve(outRoot)
  const sessionsRoot = path.join(absoluteRoot, "sessions")
  await mkdir(sessionsRoot, { recursive: true })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const createdAt = new Date().toISOString()
    const sessionId = sessionIdFor(new Date(createdAt))
    const sessionPath = path.join(sessionsRoot, sessionId)
    try {
      await mkdir(sessionPath, { recursive: false })
      return {
        sessionId,
        sessionPath,
        relativePath: `sessions/${sessionId}`,
        createdAt,
      }
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : ""
      if (code !== "EEXIST") throw error
    }
  }
  throw new LocalAuthorizationRunnerError("Could not allocate a unique authorization session directory.")
}

async function appendIndex(outRoot: string, entry: LocalSessionIndexEntry): Promise<void> {
  await appendFile(path.join(path.resolve(outRoot), "sessions.jsonl"), `${JSON.stringify(entry)}\n`, "utf8")
}

function finalArtifact(run: AuthorizationTaskRun) {
  if (run.finalKind === "repair") return run.repair
  if (run.finalKind === "initial") return run.initial
  return undefined
}

function summaryText(input: {
  report: LocalAuthorizationSessionReport
  run?: AuthorizationTaskRun
}): string {
  const artifact = input.run ? finalArtifact(input.run) : undefined
  const lines = [
    "Authorization assessment",
    `Session: ${input.report.sessionId}`,
    `Status: ${input.report.status}`,
  ]
  if (input.report.taskId) lines.push(`Task: ${input.report.taskId}`)
  if (input.report.repository) lines.push(`Source: ${input.report.repository}@${input.report.sourceRef ?? "unknown"}`)
  if (input.report.analysisProfile) {
    lines.push(`Analysis profile: ${input.report.analysisProfile.id} (${input.report.analysisProfile.origin})`)
  }
  lines.push("", "Conclusions")
  if (!artifact) {
    lines.push("- No canonical conclusion was delivered.")
  } else {
    for (const result of artifact.result.results) {
      lines.push(`- ${result.obligationId}: ${result.conclusion} — ${result.explanation}`)
      const facts = Object.values(result.facts).flat()
      for (const fact of facts) {
        const citations = fact.citations
          .map(citation => `${citation.path}:${citation.startLine}-${citation.endLine}`)
          .join(", ")
        lines.push(`  Evidence: ${fact.statement} (${citations})`)
      }
      for (const missing of result.decisiveMissingFacts) lines.push(`  Unknown: ${missing}`)
    }
  }
  lines.push("", "Coverage")
  const coverage = artifact?.relationCoverage ?? []
  if (coverage.length === 0) {
    lines.push("- No relation coverage was delivered.")
  } else {
    for (const item of coverage) {
      lines.push(`- ${item.requirementId} × ${item.obligationId}: ${item.status} — ${item.explanation}`)
    }
  }
  if (input.report.error) lines.push("", `Error: ${input.report.error.name}: ${input.report.error.message}`)
  return `${lines.join("\n")}\n`
}

async function persistTerminalSession(input: {
  outRoot: string
  session: Awaited<ReturnType<typeof createSession>>
  report: LocalAuthorizationSessionReport
  run?: AuthorizationTaskRun
}): Promise<void> {
  const resultPath = path.join(input.session.sessionPath, "result.json")
  const summaryPath = path.join(input.session.sessionPath, "summary.txt")
  await writeJsonExclusive(resultPath, input.report)
  await writeExclusive(summaryPath, summaryText({ report: input.report, ...(input.run ? { run: input.run } : {}) }))
  await appendIndex(input.outRoot, {
    schemaVersion: "authorization-local-session-index-entry/v1",
    sessionId: input.session.sessionId,
    relativePath: input.session.relativePath,
    status: input.report.status,
    createdAt: input.session.createdAt,
    updatedAt: new Date().toISOString(),
  })
}

async function defaultProviderFactory(modelId: string): Promise<LLMProvider> {
  const { createProviderForModel } = await import("../../providers/registry.ts")
  return createProviderForModel(modelId)
}

export async function executeLocalAuthorizationRun(input: {
  inputFile: string
  model: string
  outRoot: string
  arm?: AuthorizationRenderArm
  executionOptions?: RunAuthorizationTaskOptions
  providerFactory?: LocalAuthorizationProviderFactory
  env?: LocalAuthorizationRunnerEnv
}): Promise<LocalAuthorizationSessionReport | LocalAuthorizationCheckReport> {
  const arm = input.arm ?? "B"
  const loaded = await loadLocalAuthorizationInput(input.inputFile)
  const checked = checkReport(loaded, arm)
  if (loaded.status === "invalid") return checked

  const session = await createSession(input.outRoot)
  const inputBytes = await readFile(loaded.inputPath, "utf8")
  const baseArtifacts: NonNullable<LocalAuthorizationSessionReport["artifacts"]> = {
    session: "session.json",
    check: "check.json",
    input: "input.json",
    task: "task.json",
    sourceBundle: "source-bundle.json",
    analysisRequirements: "analysis-requirements.json",
    preview: "preview.md",
    events: "events.jsonl",
    result: "result.json",
    summary: "summary.txt",
  }
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.session), {
    schemaVersion: "authorization-local-session/v1",
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    inputPath: loaded.inputPath,
    inputSha256: sha256(inputBytes),
    model: input.model,
    arm,
    analysisProfile: loaded.analysisProfile,
    noAutomaticResend: true,
  })
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.check), checked)
  await writeExclusive(path.join(session.sessionPath, baseArtifacts.input), inputBytes)
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.task), loaded.task)
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.sourceBundle), loaded.sourceBundle)
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.analysisRequirements), {
    schemaVersion: "authorization-analysis-profile-snapshot/v1",
    profile: loaded.analysisProfile,
    requirements: loaded.analysisRequirements,
    plan: loaded.analysisPlan,
  })
  await writeExclusive(path.join(session.sessionPath, baseArtifacts.preview), `${checked.preview ?? ""}\n`)
  await writeExclusive(path.join(session.sessionPath, baseArtifacts.events!), "")
  await appendIndex(input.outRoot, {
    schemaVersion: "authorization-local-session-index-entry/v1",
    sessionId: session.sessionId,
    relativePath: session.relativePath,
    status: "running",
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
  })

  const baseReport = {
    schemaVersion: "authorization-local-result/v1" as const,
    sessionId: session.sessionId,
    sessionPath: session.sessionPath,
    createdAt: session.createdAt,
    inputPath: loaded.inputPath,
    taskId: loaded.task.taskId,
    repository: loaded.task.repository,
    sourceRef: loaded.task.sourceRef,
    model: input.model,
    arm,
    analysisProfile: loaded.analysisProfile,
    ...(checked.promptCharacters ? { promptCharacters: { initial: checked.promptCharacters } } : {}),
    artifacts: baseArtifacts,
  }

  const env = input.env ?? process.env
  env.SKVM_AUTO_PROBE = "0"
  const executionOptions: RunAuthorizationTaskOptions = input.executionOptions ?? {
    timeoutMs: 180_000,
    unitTimeoutMs: 600_000,
    maxTokens: 6_000,
    maxProviderDispatches: 4,
    maxDomainRepairs: 1,
  }
  let provider: LLMProvider
  try {
    provider = await (input.providerFactory ?? defaultProviderFactory)(input.model)
  } catch (error) {
    const report: LocalAuthorizationSessionReport = {
      ...baseReport,
      status: "provider-unavailable",
      error: errorArtifact(error),
    }
    await persistTerminalSession({ outRoot: input.outRoot, session, report })
    return report
  }

  const runArtifacts: NonNullable<LocalAuthorizationSessionReport["artifacts"]> = {
    ...baseArtifacts,
    dispatch: "dispatch.json",
    run: "run.json",
  }
  const runBaseReport = { ...baseReport, artifacts: runArtifacts }
  await writeJsonExclusive(path.join(session.sessionPath, runArtifacts.dispatch!), {
    schemaVersion: "authorization-local-dispatch/v1",
    sessionId: session.sessionId,
    model: input.model,
    arm,
    executionOptions,
    startedAt: new Date().toISOString(),
    completionUnknownUntilRunArtifact: true,
    noAutomaticResend: true,
  })
  try {
    const run = await runAuthorizationTask({
      task: loaded.task,
      sourceBundle: loaded.sourceBundle,
      analysisRequirements: loaded.analysisRequirements,
      provider,
      arm,
      options: executionOptions,
      onLifecycleEvent: event => appendFile(
        path.join(session.sessionPath, runArtifacts.events!),
        `${JSON.stringify(event)}\n`,
        "utf8",
      ),
    })
    await writeJsonExclusive(path.join(session.sessionPath, runArtifacts.run!), run)
    const artifact = finalArtifact(run)
    const report: LocalAuthorizationSessionReport = {
      ...runBaseReport,
      status: run.status,
      ...(run.finalKind ? { finalKind: run.finalKind } : {}),
      ...(artifact ? {
        canonicalResult: artifact.result,
        relationCoverage: artifact.relationCoverage ?? [],
        coverageValidation: artifact.coverageValidation,
      } : {}),
      telemetry: run.telemetry,
      promptCharacters: run.promptCharacters,
      ...(run.error ? { error: run.error } : {}),
    }
    await persistTerminalSession({ outRoot: input.outRoot, session, report, run })
    return report
  } catch (error) {
    const report: LocalAuthorizationSessionReport = {
      ...runBaseReport,
      status: "completion-unknown",
      error: errorArtifact(error),
    }
    await persistTerminalSession({ outRoot: input.outRoot, session, report })
    return report
  }
}

function validSessionId(value: string): boolean {
  return /^\d{8}T\d{9}Z-[a-f0-9]{8}$/i.test(value)
}

function parsePersistedArtifact<T>(
  schema: z.ZodType<T>,
  raw: string,
  label: string,
): T {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new LocalAuthorizationRunnerError(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new LocalAuthorizationRunnerError(
      `${label} is invalid: ${parsed.error.issues.map(issue => `${issue.path.join(".") || "$"}: ${issue.message}`).join("; ")}`,
    )
  }
  return parsed.data
}

function samePersistedValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

async function readSessionDescriptor(sessionPath: string, sessionId: string) {
  const descriptor = parsePersistedArtifact(
    PersistedLocalSessionSchema,
    await readFile(path.join(sessionPath, "session.json"), "utf8"),
    `Session descriptor for ${sessionId}`,
  )
  if (descriptor.sessionId !== sessionId) {
    throw new LocalAuthorizationRunnerError(`Persisted session identity does not match directory ${sessionId}.`)
  }
  return descriptor
}

async function validateDispatchIdentity(
  sessionPath: string,
  sessionId: string,
  session: z.infer<typeof PersistedLocalSessionSchema>,
) {
  const dispatch = parsePersistedArtifact(
    PersistedLocalDispatchSchema,
    await readFile(path.join(sessionPath, "dispatch.json"), "utf8"),
    `Dispatch artifact for ${sessionId}`,
  )
  if (
    dispatch.sessionId !== sessionId
    || (session.model !== undefined && dispatch.model !== session.model)
    || (session.arm !== undefined && dispatch.arm !== session.arm)
  ) {
    throw new LocalAuthorizationRunnerError(`Dispatch artifact identity does not match session ${sessionId}.`)
  }
  return dispatch
}

async function validateTerminalSession(input: {
  sessionPath: string
  sessionId: string
  session: z.infer<typeof PersistedLocalSessionSchema>
  report: z.infer<typeof PersistedLocalSessionReportSchema>
}): Promise<LocalAuthorizationSessionReport> {
  const { sessionPath, sessionId, session, report } = input
  if (
    report.sessionId !== sessionId
    || path.resolve(report.sessionPath) !== path.resolve(sessionPath)
    || report.createdAt !== session.createdAt
    || (session.inputPath !== undefined && path.resolve(report.inputPath ?? "") !== path.resolve(session.inputPath))
    || (session.model !== undefined && report.model !== session.model)
    || (session.arm !== undefined && report.arm !== session.arm)
  ) {
    throw new LocalAuthorizationRunnerError(`Persisted session identity does not match directory ${sessionId}.`)
  }

  const checkPath = path.join(sessionPath, "check.json")
  if (await pathKind(checkPath) === "file") {
    const check = JSON.parse(await readFile(checkPath, "utf8")) as { inputPath?: string; taskId?: string }
    if (
      (check.inputPath !== undefined && path.resolve(report.inputPath ?? "") !== path.resolve(check.inputPath))
      || (check.taskId !== undefined && report.taskId !== check.taskId)
    ) {
      throw new LocalAuthorizationRunnerError(`Persisted session identity does not match check artifact for ${sessionId}.`)
    }
  }

  const dispatchPath = path.join(sessionPath, "dispatch.json")
  const runPath = path.join(sessionPath, "run.json")
  if (AuthorizationTaskRunStatusSchema.safeParse(report.status).success) {
    if (await pathKind(dispatchPath) !== "file" || await pathKind(runPath) !== "file") {
      throw new LocalAuthorizationRunnerError(`Terminal run artifact set is incomplete for ${sessionId}.`)
    }
    await validateDispatchIdentity(sessionPath, sessionId, session)
    const run = parsePersistedArtifact(
      PersistedAuthorizationRunSchema,
      await readFile(runPath, "utf8"),
      `Run artifact for ${sessionId}`,
    )
    const runRecord = run as unknown as AuthorizationTaskRun
    const artifact = finalArtifact(runRecord)
    if (
      run.status !== report.status
      || run.arm !== report.arm
      || run.finalKind !== report.finalKind
      || !samePersistedValue(artifact?.result, report.canonicalResult)
      || !samePersistedValue(artifact?.relationCoverage, report.relationCoverage)
      || !samePersistedValue(artifact?.coverageValidation, report.coverageValidation)
    ) {
      throw new LocalAuthorizationRunnerError(`Persisted result does not match run artifact for ${sessionId}.`)
    }
  } else if (report.status === "provider-unavailable") {
    if (await pathKind(dispatchPath) === "file" || await pathKind(runPath) === "file") {
      throw new LocalAuthorizationRunnerError(`Provider-unavailable session ${sessionId} contains a dispatch or run artifact.`)
    }
  } else if (report.status === "completion-unknown") {
    if (await pathKind(dispatchPath) !== "file") {
      throw new LocalAuthorizationRunnerError(`Completion-unknown session ${sessionId} has no dispatch artifact.`)
    }
    await validateDispatchIdentity(sessionPath, sessionId, session)
  } else {
    throw new LocalAuthorizationRunnerError(`Initialized status must not be persisted as a terminal result for ${sessionId}.`)
  }
  return report as LocalAuthorizationSessionReport
}

async function inspectSession(sessionPath: string, sessionId: string): Promise<LocalAuthorizationSessionReport> {
  const session = await readSessionDescriptor(sessionPath, sessionId)
  const resultPath = path.join(sessionPath, "result.json")
  if (await pathKind(resultPath) === "file") {
    const report = parsePersistedArtifact(
      PersistedLocalSessionReportSchema,
      await readFile(resultPath, "utf8"),
      `Result artifact for ${sessionId}`,
    )
    return validateTerminalSession({ sessionPath, sessionId, session, report })
  }
  const dispatched = await pathKind(path.join(sessionPath, "dispatch.json")) === "file"
  if (dispatched) await validateDispatchIdentity(sessionPath, sessionId, session)
  return {
    schemaVersion: "authorization-local-result/v1",
    sessionId,
    sessionPath,
    createdAt: session.createdAt ?? "unknown",
    status: dispatched ? "completion-unknown" : "initialized",
    ...(session.inputPath ? { inputPath: session.inputPath } : {}),
    ...(session.model ? { model: session.model } : {}),
    ...(session.arm ? { arm: session.arm } : {}),
    ...(session.analysisProfile ? { analysisProfile: session.analysisProfile as LocalAnalysisProfile } : {}),
  }
}

export async function inspectLocalAuthorizationOutput(out: string): Promise<LocalAuthorizationSessionReport> {
  const absolute = path.resolve(out)
  if (await pathKind(path.join(absolute, "session.json")) === "file") {
    const sessionId = path.basename(absolute)
    if (!validSessionId(sessionId)) throw new LocalAuthorizationRunnerError(`Invalid session directory name: ${sessionId}`)
    return inspectSession(absolute, sessionId)
  }

  const indexPath = path.join(absolute, "sessions.jsonl")
  if (await pathKind(indexPath) !== "file") {
    throw new LocalAuthorizationRunnerError(`No authorization session index found beneath ${absolute}.`)
  }
  const entries = (await readFile(indexPath, "utf8"))
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .map((line, index) => parsePersistedArtifact(
      LocalSessionIndexEntrySchema,
      line,
      `Session index entry ${index + 1}`,
    ) as LocalSessionIndexEntry)
  const latestById = new Map<string, LocalSessionIndexEntry>()
  for (const entry of entries) latestById.set(entry.sessionId, entry)
  const latest = [...latestById.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.sessionId.localeCompare(left.sessionId))[0]
  if (!latest || !validSessionId(latest.sessionId)) {
    throw new LocalAuthorizationRunnerError("Authorization session index has no valid session.")
  }
  const sessionsRoot = path.join(absolute, "sessions")
  const sessionPath = path.resolve(sessionsRoot, latest.sessionId)
  const indexedPath = path.resolve(absolute, ...latest.relativePath.replaceAll("\\", "/").split("/"))
  if (
    !isWithinRoot(sessionsRoot, sessionPath)
    || indexedPath !== sessionPath
    || await pathKind(sessionPath) !== "directory"
  ) {
    throw new LocalAuthorizationRunnerError(`Indexed session is missing or escapes the output root: ${latest.sessionId}`)
  }
  return inspectSession(sessionPath, latest.sessionId)
}

function parseOptions(args: string[], allowed: Set<string>): Record<string, string> {
  const options: Record<string, string> = {}
  for (const argument of args) {
    if (!argument.startsWith("--") || !argument.includes("=")) {
      throw new LocalAuthorizationRunnerError(`Invalid argument ${argument}; expected --name=value.`)
    }
    const separator = argument.indexOf("=")
    const name = argument.slice(2, separator)
    const value = argument.slice(separator + 1)
    if (!allowed.has(name)) throw new LocalAuthorizationRunnerError(`Unknown option --${name}.`)
    if (value.length === 0) throw new LocalAuthorizationRunnerError(`Option --${name} requires a value.`)
    if (options[name] !== undefined) throw new LocalAuthorizationRunnerError(`Option --${name} was provided more than once.`)
    options[name] = value
  }
  return options
}

function requireOption(options: Record<string, string>, name: string, command: string): string {
  const value = options[name]
  if (!value) throw new LocalAuthorizationRunnerError(`${command} requires --${name}=<value>.`)
  return value
}

function parseArm(value: string | undefined): AuthorizationRenderArm {
  const arm = value ?? "B"
  if (arm === "N" || arm === "B" || arm === "D") return arm
  throw new LocalAuthorizationRunnerError("arm must be one of N, B, or D.")
}

function helpText(): string {
  return [
    "Authorization local assessment",
    "",
    "Commands:",
    "  check --input=<assessment.json> [--arm=N|B|D]  (default: B)",
    "  run --input=<assessment.json> --model=<provider/model> --out=<output-root> [--arm=N|B|D]  (default: B)",
    "  inspect --out=<output-root-or-session>",
    "",
    "Only run initializes a provider. Every run creates a new immutable session; inspect never resends it.",
  ].join("\n")
}

export async function runLocalAuthorizationCli(
  argv: string[],
  dependencies: LocalAuthorizationCliDependencies,
): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    dependencies.stdout(helpText())
    return 0
  }
  const command = argv[0]!
  try {
    if (command === "check") {
      const options = parseOptions(argv.slice(1), new Set(["input", "arm"]))
      const report = await checkLocalAuthorizationInput(
        requireOption(options, "input", "check"),
        parseArm(options.arm),
      )
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "valid" ? 0 : 1
    }
    if (command === "run") {
      const options = parseOptions(argv.slice(1), new Set(["input", "model", "out", "arm"]))
      const report = await executeLocalAuthorizationRun({
        inputFile: requireOption(options, "input", "run"),
        model: requireOption(options, "model", "run"),
        outRoot: requireOption(options, "out", "run"),
        arm: parseArm(options.arm),
        ...(dependencies.providerFactory ? { providerFactory: dependencies.providerFactory } : {}),
        ...(dependencies.env ? { env: dependencies.env } : {}),
      })
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "completed" ? 0 : 1
    }
    if (command === "inspect") {
      const options = parseOptions(argv.slice(1), new Set(["out"]))
      const report = await inspectLocalAuthorizationOutput(requireOption(options, "out", "inspect"))
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "completed" ? 0 : 1
    }
    throw new LocalAuthorizationRunnerError(`Unknown command ${command}. Use --help for check, run, and inspect.`)
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error))
    return error instanceof LocalAuthorizationRunnerError ? error.exitCode : 1
  }
}

if (import.meta.main) {
  const exitCode = await runLocalAuthorizationCli(process.argv.slice(2), {
    stdout: value => console.log(value),
    stderr: value => console.error(value),
    env: process.env,
  })
  process.exitCode = exitCode
}
