import { createHash, randomUUID } from "node:crypto"
import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { createExecutionDependencies, compareAuthorizationInput } from "./change-report.ts"
import type { LLMProvider } from "../../providers/types.ts"
import { resolveAuthorizationMethod, methodStudyArm, type AuthorizationMethod, type AuthorizationMethodSelection } from "../../task-dsl/authorization/method.ts"
import {
  measureAuthorizationPromptCharacters,
  renderAuthorizationTask,
  validMarkdownStudyInput,
  type MarkdownStudyInput,
  type AuthorizationPromptCharacterBreakdown,
  type AuthorizationRenderArm,
  type AuthorizationRenderOptions,
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
export type AuthorizationStudyArm = "P" | "L" | "C"

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
  studyArm?: AuthorizationStudyArm
  methodSelection?: AuthorizationMethodSelection
  wireVersion?: string
  analysisProfile?: LocalAnalysisProfile
  requirementCount?: number
  ledgerEntryCount?: number
  conditionRequestCount?: number
  conditionPlanEntryCount?: number
  preview?: string
  promptCharacters?: AuthorizationPromptCharacterBreakdown
  diagnostics: AnalysisDiagnostic[]
  diagnosticGroups?: Record<string, Array<AnalysisDiagnostic & { fix: string }>>
}

export type LocalAuthorizationSessionStatus =
  | AuthorizationTaskRun["status"]
  | "provider-unavailable"
  | "completion-unknown"
  | "initialized"

const NonEmptyString = z.string().trim().min(1)
const AuthorizationStudyArmSchema = z.enum(["P", "L", "C"])
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
  studyArm: AuthorizationStudyArmSchema.optional(),
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
  studyArm: AuthorizationStudyArmSchema.optional(),
  finalKind: z.enum(["initial", "repair"]).optional(),
}).passthrough()
const PersistedLocalDispatchSchema = z.object({
  schemaVersion: z.literal("authorization-local-dispatch/v1"),
  sessionId: NonEmptyString,
  model: NonEmptyString,
  arm: z.enum(["N", "B", "D"]),
  studyArm: AuthorizationStudyArmSchema.optional(),
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
  studyArm?: AuthorizationStudyArm
  methodSelection?: AuthorizationMethodSelection
  wireVersion?: string
  analysisProfile?: LocalAnalysisProfile
  finalKind?: "initial" | "repair"
  canonicalResult?: AuthorizationResultV0
  relationCoverage?: unknown[]
  coverageValidation?: unknown
  conditionAnalysis?: unknown
  conditionValidation?: unknown
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
    normalizedInput?: string
    fieldProvenance?: string
    executionDependencies?: string
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

type ValidLocalAuthorizationInput = Extract<LocalInputResult, { status: "valid" }>

function studyExecutionInputs(
  loaded: ValidLocalAuthorizationInput,
  studyArm?: AuthorizationStudyArm,
): {
  analysisRequirements?: ValidLocalAuthorizationInput["analysisRequirements"]
  conditionAnalysisRequest?: NonNullable<ValidLocalAuthorizationInput["conditionAnalysisRequest"]>
  analysisPlan?: ValidLocalAuthorizationInput["analysisPlan"]
  conditionPlan?: NonNullable<ValidLocalAuthorizationInput["conditionPlan"]>
  renderOptions?: AuthorizationRenderOptions
} {
  const publicAnalysisQuestions = [
    ...loaded.analysisRequirements.map(requirement => requirement.question),
    ...(loaded.conditionPlan?.entries ?? []).map(entry => `Compare bounded outcomes for ${entry.obligationId} using at most ${entry.maxBranches} branches. Consider ${entry.conditions.map(c => `${c.name} (${c.basis})`).join("; ")}. Explain reachable, blocked or unknown effects and decisive missing facts; assumptions are hypotheses, not observed deployment facts. State any unexamined conditions; this is not exhaustive path enumeration.`),
  ]
  if (studyArm === "P") {
    return {
      renderOptions: {
        declarationStyle: "natural",
        publicAnalysisQuestions,
      },
    }
  }
  if (studyArm === "L") {
    return {
      renderOptions: { publicAnalysisQuestions },
      analysisRequirements: loaded.analysisRequirements,
      analysisPlan: loaded.analysisPlan,
    }
  }
  return {
    renderOptions: { publicAnalysisQuestions },
    analysisRequirements: loaded.analysisRequirements,
    analysisPlan: loaded.analysisPlan,
    ...(loaded.conditionAnalysisRequest && loaded.conditionPlan
      ? {
          conditionAnalysisRequest: loaded.conditionAnalysisRequest,
          conditionPlan: loaded.conditionPlan,
        }
      : {}),
  }
}

function checkReport(
  loaded: LocalInputResult,
  arm: AuthorizationRenderArm,
  studyArm?: AuthorizationStudyArm,
  method?: AuthorizationMethod,
  wireVersion: "legacy" | "v4" = "legacy",
  researchInstructions?: MarkdownStudyInput,
): LocalAuthorizationCheckReport {
  if (loaded.status === "invalid") {
    return {
      schemaVersion: "authorization-local-check/v1",
      status: "invalid",
      inputPath: loaded.inputPath,
      diagnostics: loaded.diagnostics,
      diagnosticGroups: groupInputDiagnostics(loaded.diagnostics),
    }
  }
  if (studyArm && arm !== "B") {
    return {
      schemaVersion: "authorization-local-check/v1",
      status: "invalid",
      inputPath: loaded.inputPath,
      arm,
      studyArm,
      diagnostics: [localStudyDiagnostic(
        "study-render-arm-mismatch",
        `Study arm ${studyArm} must use historical render arm B.`,
        "arm",
      )],
    }
  }
  if (studyArm === "C" && (!loaded.conditionAnalysisRequest || !loaded.conditionPlan)) {
    return {
      schemaVersion: "authorization-local-check/v1",
      status: "invalid",
      inputPath: loaded.inputPath,
      arm,
      studyArm,
      diagnostics: [localStudyDiagnostic(
        "study-condition-request-missing",
        "Study arm C requires a ready condition analysis request.",
        "conditionAnalysisRequest",
      )],
    }
  }
  const resolved = resolveAuthorizationMethod({ method, studyArm, arm, hasConditionRequest: !!loaded.conditionAnalysisRequest })
  if (researchInstructions !== undefined && (!validMarkdownStudyInput(researchInstructions)
      || resolved.selection.effective !== "plain" || wireVersion !== "v4" || arm !== "B")) {
    return {schemaVersion:"authorization-local-check/v1",status:"invalid",inputPath:loaded.inputPath,
      diagnostics:[{code:"invalid-markdown-study-input",path:"researchInstructions",message:"Research instructions require independent-author, nonempty text/path and plain/v4/B."}]}
  }
  if (resolved.diagnostics.length) return {
    schemaVersion: "authorization-local-check/v1", status: "invalid", inputPath: loaded.inputPath,
    methodSelection: resolved.selection, diagnostics: resolved.diagnostics,
  }
  const compiled = compileAuthorizationTask(loaded.task)
  const sourceContext = renderSourceBundle(loaded.sourceBundle)
  const selected = studyExecutionInputs(loaded, resolved.studyArm)
  const rendered = renderAuthorizationTask(
    compiled,
    arm,
    selected.analysisPlan,
    selected.conditionPlan,
    { ...selected.renderOptions, wireVersion, researchInstructions },
  )
  const renderedPrompt = rendered.prompt.replace("<SOURCE_CONTEXT_INSERTED_BY_HOST>", sourceContext)
  const preview = [
    `<!-- analysis-profile: ${loaded.analysisProfile.id}; origin: ${loaded.analysisProfile.origin}; study-arm: ${studyArm ?? "none"}; condition-analysis: ${selected.conditionPlan ? "enabled" : "disabled"} -->`,
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
    ...(studyArm ? { studyArm } : {}),
    methodSelection: resolved.selection,
    wireVersion: `source-authorization-assessment-wire/v${wireVersion === "v4" ? 4 : resolved.studyArm === "P" ? 1 : resolved.studyArm === "L" ? 2 : 3}`,
    analysisProfile: loaded.analysisProfile,
    requirementCount: loaded.analysisRequirements.length,
    ledgerEntryCount: selected.analysisPlan?.entries.length ?? 0,
    ...(selected.conditionAnalysisRequest
      ? {
          conditionRequestCount: selected.conditionAnalysisRequest.requests.length,
          conditionPlanEntryCount: selected.conditionPlan?.entries.length ?? 0,
        }
      : {}),
    preview,
    promptCharacters: measureAuthorizationPromptCharacters(rendered, sourceContext),
    diagnostics: [],
  }
}

function localStudyDiagnostic(code: string, message: string, diagnosticPath?: string): AnalysisDiagnostic {
  return { code, message, ...(diagnosticPath ? { path: diagnosticPath } : {}) }
}

function groupInputDiagnostics(diagnostics: AnalysisDiagnostic[]) {
  const groups: Record<string, Array<AnalysisDiagnostic & { fix: string }>> = {}
  for (const d of diagnostics) {
    const field = d.path ?? "$"
    const group = /policy|policies/.test(field) ? "policy" : /source|entries|locations/.test(field) ? "source" : /scenario|obligation|principal|resource/.test(field) ? "scenario" : "task"
    const fix = "fix" in d && typeof d.fix === "string" ? d.fix : `Correct ${field}: ${d.message}`
    ;(groups[group] ??= []).push({ ...d, fix })
  }
  return groups
}

export async function checkLocalAuthorizationInput(
  inputFile: string,
  arm: AuthorizationRenderArm = "B",
  method?: AuthorizationMethod,
  wireVersion: "legacy" | "v4" = "legacy",
): Promise<LocalAuthorizationCheckReport> {
  return checkReport(await loadLocalAuthorizationInput(inputFile), arm, undefined, method, wireVersion)
}

export async function checkLocalAuthorizationStudyInput(
  inputFile: string,
  studyArm: AuthorizationStudyArm,
): Promise<LocalAuthorizationCheckReport> {
  return checkReport(await loadLocalAuthorizationInput(inputFile), "B", studyArm)
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
  if (input.report.methodSelection) lines.push(`Method: ${input.report.methodSelection.effective} (${input.report.methodSelection.selectionOrigin}); requested: ${input.report.methodSelection.requested ?? "omitted"}; condition request ignored: ${input.report.methodSelection.conditionRequestIgnored}`)
  if (input.report.wireVersion) lines.push(`Wire: ${input.report.wireVersion}`)
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
  lines.push("", "Condition analysis")
  const conditionAnalyses = artifact?.conditionAnalysis?.analyses ?? []
  if (conditionAnalyses.length === 0) {
    lines.push("- Not requested or not delivered.")
  } else {
    for (const analysis of conditionAnalyses) {
      lines.push(`- ${analysis.obligationId}: ${analysis.completeness}; ${analysis.branches.length} branch(es)`)
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
  researchInstructions?: MarkdownStudyInput
  inputFile: string
  model: string
  outRoot: string
  arm?: AuthorizationRenderArm
  studyArm?: AuthorizationStudyArm
  method?: AuthorizationMethod
  wireVersion?: "legacy" | "v4"
  executionOptions?: RunAuthorizationTaskOptions
  providerFactory?: LocalAuthorizationProviderFactory
  env?: LocalAuthorizationRunnerEnv
}): Promise<LocalAuthorizationSessionReport | LocalAuthorizationCheckReport> {
  const arm = input.arm ?? "B"
  const loaded = await loadLocalAuthorizationInput(input.inputFile)
  const checked = checkReport(loaded, arm, input.studyArm, input.method, input.wireVersion, input.researchInstructions)
  if (loaded.status === "invalid" || checked.status === "invalid") return checked
  const effectiveStudyArm = methodStudyArm[checked.methodSelection!.effective]
  const selected = studyExecutionInputs(loaded, effectiveStudyArm)
  const researchIdentity = input.researchInstructions ? {
    arm: "markdown", instructionOrigin: input.researchInstructions.instructionOrigin,
    instructionPath: input.researchInstructions.instructionPath, sha256: sha256(input.researchInstructions.instructions),
    characters: input.researchInstructions.instructions.length,
  } : undefined
  const selectionMetadata = { methodSelection: checked.methodSelection, wireVersion: checked.wireVersion,
    ...(researchIdentity ? {researchIdentity} : {}) }

  const session = await createSession(input.outRoot)
  const inputBytes = loaded.rawInput
  const baseArtifacts: NonNullable<LocalAuthorizationSessionReport["artifacts"]> = {
    session: "session.json",
    check: "check.json",
    input: "input.json",
    normalizedInput: "normalized-input.json",
    fieldProvenance: "field-provenance.json",
    executionDependencies: "execution-dependencies.json",
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
    ...selectionMetadata,
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    inputPath: loaded.inputPath,
    inputSha256: sha256(inputBytes),
    model: input.model,
    arm,
    ...(input.studyArm ? { studyArm: input.studyArm } : {}),
    analysisProfile: loaded.analysisProfile,
    noAutomaticResend: true,
  })
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.check), checked)
  await writeExclusive(path.join(session.sessionPath, baseArtifacts.input), inputBytes)
  if (input.researchInstructions) await writeJsonExclusive(path.join(session.sessionPath, "research-instructions.json"), {
    ...input.researchInstructions, ...researchIdentity,
  })
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.normalizedInput!), loaded.normalizedInput)
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.fieldProvenance!), loaded.provenance)
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.executionDependencies!), createExecutionDependencies(loaded, checked))
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.task), loaded.task)
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.sourceBundle), loaded.sourceBundle)
  await writeJsonExclusive(path.join(session.sessionPath, baseArtifacts.analysisRequirements), effectiveStudyArm === "P"
    ? {
        schemaVersion: "authorization-public-analysis-snapshot/v1",
        studyArm: "P",
        profile: loaded.analysisProfile,
        publicQuestions: loaded.analysisRequirements.map(requirement => requirement.question),
        ledgerGenerated: false,
      }
    : {
        schemaVersion: "authorization-analysis-profile-snapshot/v1",
        ...(input.studyArm ? { studyArm: input.studyArm } : {}),
        profile: loaded.analysisProfile,
        requirements: loaded.analysisRequirements,
        plan: loaded.analysisPlan,
        ...(selected.conditionAnalysisRequest
          ? {
              conditionAnalysisRequest: selected.conditionAnalysisRequest,
              conditionPlan: selected.conditionPlan,
            }
          : {}),
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
    ...selectionMetadata,
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
    ...(input.studyArm ? { studyArm: input.studyArm } : {}),
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
    ...selectionMetadata,
    sessionId: session.sessionId,
    model: input.model,
    arm,
    ...(input.studyArm ? { studyArm: input.studyArm } : {}),
    executionOptions,
    startedAt: new Date().toISOString(),
    completionUnknownUntilRunArtifact: true,
    noAutomaticResend: true,
  })
  try {
    const run = await runAuthorizationTask({
      task: loaded.task,
      sourceBundle: loaded.sourceBundle,
      ...(selected.analysisRequirements ? { analysisRequirements: selected.analysisRequirements } : {}),
      ...(selected.conditionAnalysisRequest ? { conditionAnalysisRequest: selected.conditionAnalysisRequest } : {}),
      provider,
      arm,
      wireVersion: input.wireVersion,
      renderOptions: { ...selected.renderOptions, researchInstructions: input.researchInstructions },
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
        ...(artifact.conditionAnalysis
          ? {
              conditionAnalysis: artifact.conditionAnalysis,
              conditionValidation: artifact.conditionValidation,
            }
          : {}),
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
    || (session.studyArm !== undefined && dispatch.studyArm !== session.studyArm)
    || !samePersistedValue(session.methodSelection, dispatch.methodSelection)
    || !samePersistedValue(session.wireVersion, dispatch.wireVersion)
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
    || (session.studyArm !== undefined && report.studyArm !== session.studyArm)
    || !samePersistedValue(session.methodSelection, report.methodSelection)
    || !samePersistedValue(session.wireVersion, report.wireVersion)
  ) {
    throw new LocalAuthorizationRunnerError(`Persisted session identity does not match directory ${sessionId}.`)
  }

  const checkPath = path.join(sessionPath, "check.json")
  if (await pathKind(checkPath) === "file") {
    const check = JSON.parse(await readFile(checkPath, "utf8")) as { inputPath?: string; taskId?: string; methodSelection?: unknown; wireVersion?: unknown }
    if (
      (check.inputPath !== undefined && path.resolve(report.inputPath ?? "") !== path.resolve(check.inputPath))
      || (check.taskId !== undefined && report.taskId !== check.taskId)
      || !samePersistedValue(check.methodSelection, report.methodSelection)
      || !samePersistedValue(check.wireVersion, report.wireVersion)
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
      || (report.wireVersion !== undefined && run.wireVersion !== report.wireVersion)
      || !samePersistedValue(artifact?.result, report.canonicalResult)
      || !samePersistedValue(artifact ? artifact.relationCoverage ?? [] : undefined, report.relationCoverage)
      || !samePersistedValue(artifact?.coverageValidation, report.coverageValidation)
      || !samePersistedValue(artifact?.conditionAnalysis, report.conditionAnalysis)
      || !samePersistedValue(artifact?.conditionValidation, report.conditionValidation)
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
    ...(session.studyArm ? { studyArm: session.studyArm } : {}),
    ...(session.methodSelection ? { methodSelection: session.methodSelection as AuthorizationMethodSelection } : {}),
    ...(typeof session.wireVersion === "string" ? { wireVersion: session.wireVersion } : {}),
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

function parseMethod(value: string | undefined): AuthorizationMethod | undefined {
  if (value === undefined || value === "plain" || value === "ledger" || value === "conditions") return value
  throw new LocalAuthorizationRunnerError("method must be plain, ledger, or conditions.")
}

function parseWire(value: string | undefined): "legacy" | "v4" {
  if (value === undefined || value === "legacy") return "legacy"
  if (value === "v4") return value
  throw new LocalAuthorizationRunnerError("wire must be legacy or v4; legacy selects v1/v2/v3 by method.")
}

function helpText(): string {
  return [
    "Authorization local assessment",
    "",
    "Commands:",
    "  check --input=<assessment.json> [--method=plain|ledger|conditions] [--wire=legacy|v4] [--arm=N|B|D]",
    "  run --input=<assessment.json> --model=<provider/model> --out=<output-root> [--method=plain|ledger|conditions] [--wire=legacy|v4] [--arm=N|B|D]",
    "  compare --previous=<session> --input=<assessment.json> [--method=plain|ledger|conditions] [--wire=legacy|v4]",
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
    if (command === "compare") {
      const options = parseOptions(argv.slice(1), new Set(["previous", "input", "method", "wire"]))
      const report = await compareAuthorizationInput(requireOption(options,"previous","compare"), requireOption(options,"input","compare"), {
        ...(options.method ? {method:parseMethod(options.method)} : {}), ...(options.wire ? {wireVersion:parseWire(options.wire)} : {}),
      })
      dependencies.stdout(JSON.stringify(report,null,2))
      return report.status === "input-invalid" ? 1 : 0
    }
    if (command === "check") {
      const options = parseOptions(argv.slice(1), new Set(["input", "arm", "method", "wire"]))
      const report = await checkLocalAuthorizationInput(
        requireOption(options, "input", "check"),
        parseArm(options.arm),
        parseMethod(options.method),
        parseWire(options.wire),
      )
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "valid" ? 0 : 1
    }
    if (command === "run") {
      const options = parseOptions(argv.slice(1), new Set(["input", "model", "out", "arm", "method", "wire"]))
      const report = await executeLocalAuthorizationRun({
        inputFile: requireOption(options, "input", "run"),
        model: requireOption(options, "model", "run"),
        outRoot: requireOption(options, "out", "run"),
        arm: parseArm(options.arm),
        method: parseMethod(options.method),
        wireVersion: parseWire(options.wire),
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
