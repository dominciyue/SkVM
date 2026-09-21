import { createHash } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import { addTokenUsage, emptyTokenUsage } from "../../core/types.ts"
import type { LLMProvider } from "../../providers/types.ts"
import {
  AuthorizationConditionAnalysisRequestV1Schema,
  compileConditionAnalysisRequest,
  type AuthorizationConditionAnalysisRequestV1,
} from "../../task-dsl/authorization/conditions.ts"
import {
  AnalysisRequirementsSchema,
  compileAnalysisRequirements,
  createDefaultAnalysisRequirements,
  DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID,
  type AnalysisRequirement,
} from "../../task-dsl/authorization/relations.ts"
import { renderAuthorizationTask, type RenderedAuthorizationTask } from "../../task-dsl/authorization/render.ts"
import { AuthorizationTaskV0Schema, type AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import type { AuthorizationGenerationEvaluationV2 } from "./evaluate.ts"
import type { AuthorizationTaskRun } from "./host.ts"
import {
  checkLocalAuthorizationStudyInput,
  executeLocalAuthorizationRun,
  inspectLocalAuthorizationOutput,
  type AuthorizationStudyArm,
  type LocalAuthorizationProviderFactory,
  type LocalAuthorizationRunnerEnv,
  type LocalAuthorizationSessionReport,
} from "./local-run.ts"

const NonEmptyString = z.string().trim().min(1)
const RelativeRepositoryPath = NonEmptyString.refine(value => {
  if (value.includes("\\") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false
  return !value.split("/").some(segment => segment === "" || segment === "." || segment === "..")
}, "must be a portable repository-relative path")
const SafePathSegment = NonEmptyString.regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
  "must be one portable path-safe segment",
)
const StudyArmSchema = z.enum(["P", "L", "C"])
const StudyRotationSchema = z.enum(["P-L-C", "L-C-P", "C-P-L"])

const AnalysisRequirementsSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("default") }).strict(),
  z.object({ kind: z.literal("file"), path: RelativeRepositoryPath }).strict(),
])

const ValueStudyCaseSchema = z.object({
  caseId: SafePathSegment,
  task: RelativeRepositoryPath,
  analysisRequirements: AnalysisRequirementsSourceSchema,
  conditionAnalysisRequest: RelativeRepositoryPath,
  sourceRoot: RelativeRepositoryPath,
  sources: z.array(RelativeRepositoryPath).min(1),
  rotation: StudyRotationSchema,
}).strict()

const ValueStudyUnitSchema = z.object({
  id: SafePathSegment,
  caseId: SafePathSegment,
  studyArm: StudyArmSchema,
  renderArm: z.literal("B"),
}).strict()

export const AuthorizationValueStudyExperimentConfigSchema = z.object({
  schemaVersion: z.literal("authorization-value-study-experiment/v1"),
  studyId: NonEmptyString,
  createdAt: NonEmptyString,
  implementationRevision: NonEmptyString,
  paths: z.object({
    runRoot: RelativeRepositoryPath,
    evaluatorRubrics: RelativeRepositoryPath,
  }).strict(),
  model: z.object({
    modelId: NonEmptyString,
    routeMatch: NonEmptyString,
    cacheDir: RelativeRepositoryPath,
    temperature: z.literal(0),
    timeoutMs: z.number().int().positive(),
    unitTimeoutMs: z.number().int().positive(),
    maxTokens: z.number().int().positive(),
    maxProviderDispatches: z.number().int().positive().max(4),
    maxDomainRepairs: z.literal(1),
    autoProbe: z.literal(false),
    contextLimitTokens: z.number().int().positive().nullable(),
    contextLimitStatus: z.enum(["provider-reported", "provider-not-reported"]),
  }).strict(),
  design: z.object({
    expectedCaseCount: z.number().int().positive(),
    expectedUnitCount: z.number().int().positive(),
    freshContextPerUnit: z.literal(true),
    evaluateAfterAllGeneration: z.literal(true),
  }).strict(),
  execution: z.object({
    sourceMode: z.literal("fixed-context"),
    targetExecution: z.literal("forbidden"),
    modelExecutableTools: z.literal(false),
    evaluatorVisibleDuringGeneration: z.literal(false),
  }).strict(),
  cases: z.array(ValueStudyCaseSchema).min(1),
  units: z.array(ValueStudyUnitSchema).min(1),
  stoppingRules: z.object({
    retainAllInitialUnitsInDenominator: z.literal(true),
    continueAfterTerminalUnitFailure: z.literal(true),
    noPostHocRequirementChanges: z.literal(true),
  }).strict(),
  revisionPolicy: z.object({
    sharedContractOrImplementationDefectOnly: z.literal(true),
    maxAdditionalUnits: z.literal(6),
    preserveInitialResults: z.literal(true),
  }).strict(),
  resumePolicy: z.object({
    terminalUnitsAreNotResent: z.literal(true),
    dispatchedWithoutResultIsCompletionUnknown: z.literal(true),
  }).strict(),
}).strict()

export type AuthorizationValueStudyExperimentConfig = z.infer<typeof AuthorizationValueStudyExperimentConfigSchema>
export type AuthorizationValueStudyUnit = AuthorizationValueStudyExperimentConfig["units"][number]

export interface AuthorizationValueStudyDiagnostic {
  code: string
  message: string
  path?: string
}

export interface AuthorizationStudyMethod {
  studyArm: AuthorizationStudyArm
  renderArm: "B"
  wireVersion:
    | "source-authorization-assessment-wire/v1"
    | "source-authorization-assessment-wire/v2"
    | "source-authorization-assessment-wire/v3"
  rendered: RenderedAuthorizationTask
}

export interface AuthorizationValueStudyCheckReport {
  schemaVersion: "authorization-value-study-check/v1"
  configSchemaVersion: "authorization-value-study-experiment/v1"
  status: "valid" | "invalid"
  configSha256: string
  caseCount: number
  unitCount: number
  cases: Array<{
    caseId: string
    status: "valid" | "invalid"
    taskId?: string
    sourceCount?: number
    requirementCount?: number
    conditionRequestCount?: number
    methods?: Array<{
      studyArm: AuthorizationStudyArm
      renderArm: "B"
      promptSha256: string
      ledgerVisible: boolean
      conditionAnalysisVisible: boolean
    }>
    diagnostics: AuthorizationValueStudyDiagnostic[]
  }>
  diagnostics: AuthorizationValueStudyDiagnostic[]
}

export type AuthorizationValueStudyUnitStatus =
  | "completed"
  | "failed-terminal"
  | "completion-unknown"
  | "skipped-terminal"
  | "pending"

export interface AuthorizationValueStudyRunUnit extends AuthorizationValueStudyUnit {
  status: AuthorizationValueStudyUnitStatus
  reportStatus?: LocalAuthorizationSessionReport["status"]
  sessionId?: string
  sessionRelativePath?: string
}

export interface AuthorizationValueStudyRunReport {
  schemaVersion: "authorization-value-study-run-index/v1"
  status: "in-progress" | "completed" | "completed-with-failures" | "provider-unavailable" | "input-invalid"
  runRoot: string
  configSha256: string
  units: AuthorizationValueStudyRunUnit[]
  error?: { name: string; message: string }
}

export type AuthorizationValueStudyProviderFactory = (modelId: string) => Promise<LLMProvider> | LLMProvider

interface LoadedStudyConfig {
  config: AuthorizationValueStudyExperimentConfig
  configPath: string
  configSha256: string
}

interface MaterializedStudyCase {
  caseId: string
  inputPath: string
  task: AuthorizationTaskV0
  analysisRequirements: AnalysisRequirement[]
  conditionAnalysisRequest: AuthorizationConditionAnalysisRequestV1
}

interface StoredStudyUnitResult {
  schemaVersion: "authorization-value-study-unit-result/v1"
  configSha256: string
  implementationRevision: string
  unit: AuthorizationValueStudyUnit
  report: LocalAuthorizationSessionReport
  sessionRelativePath: string
}

class AuthorizationValueStudyError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message)
    this.name = "AuthorizationValueStudyError"
  }
}

function diagnostic(code: string, message: string, diagnosticPath?: string): AuthorizationValueStudyDiagnostic {
  return { code, message, ...(diagnosticPath ? { path: diagnosticPath } : {}) }
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function errorArtifact(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  }
}

function resolveRepositoryPath(repositoryRoot: string, relativePath: string): string {
  const root = path.resolve(repositoryRoot)
  const resolved = path.resolve(root, ...relativePath.split("/"))
  const relation = path.relative(root, resolved)
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new AuthorizationValueStudyError(`Configured path escapes the repository root: ${relativePath}`)
  }
  return resolved
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relation = path.relative(root, candidate)
  return relation === "" || (!relation.startsWith(`..${path.sep}`) && relation !== ".." && !path.isAbsolute(relation))
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

async function readJson(candidate: string): Promise<unknown> {
  return JSON.parse(await readFile(candidate, "utf8"))
}

async function writeJson(candidate: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(candidate), { recursive: true })
  await writeFile(candidate, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function writeJsonExclusive(candidate: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(candidate), { recursive: true })
  await writeFile(candidate, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
}

async function writeOrVerify(candidate: string, bytes: Uint8Array | string): Promise<void> {
  await mkdir(path.dirname(candidate), { recursive: true })
  const expected = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes)
  if (await pathExists(candidate)) {
    const existing = await readFile(candidate)
    if (!existing.equals(expected)) {
      throw new AuthorizationValueStudyError(`Existing materialized input differs from the frozen bytes: ${candidate}`)
    }
    return
  }
  await writeFile(candidate, expected, { flag: "wx" })
}

function rotationArms(rotation: AuthorizationValueStudyExperimentConfig["cases"][number]["rotation"]): AuthorizationStudyArm[] {
  return rotation.split("-") as AuthorizationStudyArm[]
}

export function validateAuthorizationValueStudyDesign(
  config: AuthorizationValueStudyExperimentConfig,
): AuthorizationValueStudyDiagnostic[] {
  const diagnostics: AuthorizationValueStudyDiagnostic[] = []
  if (config.cases.length !== config.design.expectedCaseCount) {
    diagnostics.push(diagnostic(
      "case-count-mismatch",
      `Study declares ${config.design.expectedCaseCount} cases but contains ${config.cases.length}.`,
      "cases",
    ))
  }
  if (config.units.length !== config.design.expectedUnitCount) {
    diagnostics.push(diagnostic(
      "unit-count-mismatch",
      `Study declares ${config.design.expectedUnitCount} units but contains ${config.units.length}.`,
      "units",
    ))
  }
  const routeMatches = config.model.routeMatch.endsWith("*")
    ? config.model.modelId.startsWith(config.model.routeMatch.slice(0, -1))
    : config.model.modelId === config.model.routeMatch
  if (!routeMatches) {
    diagnostics.push(diagnostic(
      "model-route-mismatch",
      `Model ${config.model.modelId} does not match route ${config.model.routeMatch}.`,
      "model.routeMatch",
    ))
  }

  const caseCounts = new Map<string, number>()
  for (const candidate of config.cases) caseCounts.set(candidate.caseId, (caseCounts.get(candidate.caseId) ?? 0) + 1)
  for (const [caseId, count] of caseCounts) {
    if (count > 1) diagnostics.push(diagnostic("duplicate-case-id", `Case ${caseId} appears ${count} times.`, "cases"))
  }
  const unitCounts = new Map<string, number>()
  for (const unit of config.units) unitCounts.set(unit.id, (unitCounts.get(unit.id) ?? 0) + 1)
  for (const [unitId, count] of unitCounts) {
    if (count > 1) diagnostics.push(diagnostic("duplicate-unit-id", `Unit ${unitId} appears ${count} times.`, "units"))
  }

  const caseIds = new Set(config.cases.map(candidate => candidate.caseId))
  config.units.forEach((unit, index) => {
    if (!caseIds.has(unit.caseId)) {
      diagnostics.push(diagnostic("foreign-unit-case", `Unit ${unit.id} names unknown case ${unit.caseId}.`, `units.${index}.caseId`))
    }
    if (unit.renderArm !== "B") {
      diagnostics.push(diagnostic("study-render-arm-mismatch", `Unit ${unit.id} must use render arm B.`, `units.${index}.renderArm`))
    }
  })

  for (const candidate of config.cases) {
    const units = config.units.filter(unit => unit.caseId === candidate.caseId)
    const counts = new Map<AuthorizationStudyArm, number>([["P", 0], ["L", 0], ["C", 0]])
    for (const unit of units) counts.set(unit.studyArm, (counts.get(unit.studyArm) ?? 0) + 1)
    if (["P", "L", "C"].some(arm => counts.get(arm as AuthorizationStudyArm) !== 1)) {
      diagnostics.push(diagnostic(
        "study-arm-set-mismatch",
        `Case ${candidate.caseId} requires exactly one P, L, and C unit.`,
        "units",
      ))
    }
    const actualRotation = units.map(unit => unit.studyArm)
    const expectedRotation = rotationArms(candidate.rotation)
    if (JSON.stringify(actualRotation) !== JSON.stringify(expectedRotation)) {
      diagnostics.push(diagnostic(
        "study-rotation-mismatch",
        `Case ${candidate.caseId} must follow frozen rotation ${candidate.rotation}; found ${actualRotation.join("-") || "none"}.`,
        "units",
      ))
    }
  }
  return diagnostics
}

export function buildAuthorizationStudyMethods(input: {
  task: AuthorizationTaskV0
  analysisRequirements: AnalysisRequirement[]
  conditionAnalysisRequest: AuthorizationConditionAnalysisRequestV1
}): Record<AuthorizationStudyArm, AuthorizationStudyMethod> {
  const compiled = compileAuthorizationTask(input.task)
  const analysisPlan = compileAnalysisRequirements(input.task, input.analysisRequirements)
  const conditionPlan = compileConditionAnalysisRequest(input.task, input.conditionAnalysisRequest)
  if (compiled.status !== "ready") throw new AuthorizationValueStudyError("Study task must compile before rendering methods.")
  if (analysisPlan.status !== "ready") throw new AuthorizationValueStudyError("Study analysis requirements must compile to a ready plan.")
  if (conditionPlan.status !== "ready") throw new AuthorizationValueStudyError("Study condition request must compile to a ready plan.")
  const publicAnalysisQuestions = input.analysisRequirements.map(requirement => requirement.question)
  return {
    P: {
      studyArm: "P",
      renderArm: "B",
      wireVersion: "source-authorization-assessment-wire/v1",
      rendered: renderAuthorizationTask(compiled, "B", undefined, undefined, {
        declarationStyle: "natural",
        publicAnalysisQuestions,
      }),
    },
    L: {
      studyArm: "L",
      renderArm: "B",
      wireVersion: "source-authorization-assessment-wire/v2",
      rendered: renderAuthorizationTask(compiled, "B", analysisPlan),
    },
    C: {
      studyArm: "C",
      renderArm: "B",
      wireVersion: "source-authorization-assessment-wire/v3",
      rendered: renderAuthorizationTask(compiled, "B", analysisPlan, conditionPlan),
    },
  }
}

async function loadStudyConfig(repositoryRoot: string, candidatePath: string): Promise<LoadedStudyConfig> {
  const configPath = path.isAbsolute(candidatePath) ? path.resolve(candidatePath) : path.resolve(repositoryRoot, candidatePath)
  const bytes = await readFile(configPath, "utf8")
  const parsed = AuthorizationValueStudyExperimentConfigSchema.safeParse(JSON.parse(bytes))
  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => `${issue.path.join(".") || "$"}: ${issue.message}`).join("; ")
    throw new AuthorizationValueStudyError(`Invalid authorization value-study config: ${details}`)
  }
  return { config: parsed.data, configPath, configSha256: sha256(bytes) }
}

async function materializeStudyCases(input: {
  repositoryRoot: string
  destinationRoot: string
  config: AuthorizationValueStudyExperimentConfig
}): Promise<{ cases: MaterializedStudyCase[]; diagnostics: AuthorizationValueStudyDiagnostic[] }> {
  const cases: MaterializedStudyCase[] = []
  const diagnostics: AuthorizationValueStudyDiagnostic[] = []
  for (const [caseIndex, candidate] of input.config.cases.entries()) {
    try {
      const parsedTask = AuthorizationTaskV0Schema.safeParse(
        await readJson(resolveRepositoryPath(input.repositoryRoot, candidate.task)),
      )
      if (!parsedTask.success) {
        diagnostics.push(...parsedTask.error.issues.map(issue => diagnostic(
          "task-schema-invalid",
          issue.message,
          `cases.${caseIndex}.task.${issue.path.join(".")}`,
        )))
        continue
      }
      if (parsedTask.data.taskId !== candidate.caseId) {
        diagnostics.push(diagnostic(
          "case-task-mismatch",
          `Configured case ${candidate.caseId} loads task ${parsedTask.data.taskId}.`,
          `cases.${caseIndex}.task`,
        ))
        continue
      }
      let resolvedRequirements: AnalysisRequirement[] = candidate.analysisRequirements.kind === "default"
        ? createDefaultAnalysisRequirements(parsedTask.data)
        : []
      if (candidate.analysisRequirements.kind === "file") {
        const parsed = AnalysisRequirementsSchema.safeParse(
          await readJson(resolveRepositoryPath(input.repositoryRoot, candidate.analysisRequirements.path)),
        )
        if (!parsed.success) {
          diagnostics.push(...parsed.error.issues.map(issue => diagnostic(
            "analysis-requirements-invalid",
            issue.message,
            `cases.${caseIndex}.analysisRequirements.${issue.path.join(".")}`,
          )))
          continue
        }
        resolvedRequirements = parsed.data
      }
      const parsedConditionRequest = AuthorizationConditionAnalysisRequestV1Schema.safeParse(
        await readJson(resolveRepositoryPath(input.repositoryRoot, candidate.conditionAnalysisRequest)),
      )
      if (!parsedConditionRequest.success) {
        diagnostics.push(...parsedConditionRequest.error.issues.map(issue => diagnostic(
          "condition-request-invalid",
          issue.message,
          `cases.${caseIndex}.conditionAnalysisRequest.${issue.path.join(".")}`,
        )))
        continue
      }

      const caseDestination = path.join(input.destinationRoot, candidate.caseId)
      const projectDestination = path.join(caseDestination, "project")
      const configuredSourceRoot = resolveRepositoryPath(input.repositoryRoot, candidate.sourceRoot)
      const canonicalSourceRoot = await realpath(configuredSourceRoot)
      for (const source of candidate.sources) {
        const sourcePath = await realpath(path.resolve(configuredSourceRoot, ...source.split("/")))
        if (!isWithinRoot(canonicalSourceRoot, sourcePath)) {
          throw new AuthorizationValueStudyError(`Case source resolves outside its root: ${source}`)
        }
        await writeOrVerify(path.join(projectDestination, ...source.split("/")), await readFile(sourcePath))
      }
      const assessment = {
        schemaVersion: "authorization-assessment-input/v1",
        sourceIdentity: { repository: parsedTask.data.repository, sourceRef: parsedTask.data.sourceRef },
        sourceRoot: "project",
        sources: candidate.sources,
        task: parsedTask.data,
        ...(candidate.analysisRequirements.kind === "default"
          ? {
              analysisProfile: {
                id: DEFAULT_AUTHORIZATION_ANALYSIS_PROFILE_ID,
                origin: "derived",
              },
            }
          : {}),
        analysisRequirements: resolvedRequirements,
        conditionAnalysisRequest: parsedConditionRequest.data,
      }
      const inputPath = path.join(caseDestination, "assessment.json")
      await writeOrVerify(inputPath, `${JSON.stringify(assessment, null, 2)}\n`)
      cases.push({
        caseId: candidate.caseId,
        inputPath,
        task: parsedTask.data,
        analysisRequirements: resolvedRequirements,
        conditionAnalysisRequest: parsedConditionRequest.data,
      })
    } catch (error) {
      diagnostics.push(diagnostic(
        "case-materialization-failed",
        `${candidate.caseId}: ${error instanceof Error ? error.message : String(error)}`,
        `cases.${caseIndex}`,
      ))
    }
  }
  return { cases, diagnostics }
}

async function inspectStudyConfig(input: {
  repositoryRoot: string
  loaded: LoadedStudyConfig
  destinationRoot: string
}): Promise<AuthorizationValueStudyCheckReport> {
  const diagnostics = validateAuthorizationValueStudyDesign(input.loaded.config)
  const evaluatorPath = resolveRepositoryPath(input.repositoryRoot, input.loaded.config.paths.evaluatorRubrics)
  if (!await pathExists(evaluatorPath)) {
    diagnostics.push(diagnostic(
      "evaluator-rubrics-missing",
      `Evaluator rubric path does not exist: ${input.loaded.config.paths.evaluatorRubrics}`,
      "paths.evaluatorRubrics",
    ))
  }
  const materialized = await materializeStudyCases({
    repositoryRoot: input.repositoryRoot,
    destinationRoot: input.destinationRoot,
    config: input.loaded.config,
  })
  diagnostics.push(...materialized.diagnostics)
  const byCase = new Map(materialized.cases.map(candidate => [candidate.caseId, candidate]))
  const cases = [] as AuthorizationValueStudyCheckReport["cases"]
  for (const [caseIndex, configured] of input.loaded.config.cases.entries()) {
    const ready = byCase.get(configured.caseId)
    const caseDiagnostics = diagnostics.filter(item => item.path?.startsWith(`cases.${caseIndex}`)
      || item.message.includes(configured.caseId))
    if (!ready) {
      cases.push({ caseId: configured.caseId, status: "invalid", diagnostics: caseDiagnostics })
      continue
    }
    const methods = buildAuthorizationStudyMethods(ready)
    const methodChecks = [] as NonNullable<AuthorizationValueStudyCheckReport["cases"][number]["methods"]>
    for (const studyArm of ["P", "L", "C"] as const) {
      const checked = await checkLocalAuthorizationStudyInput(ready.inputPath, studyArm)
      if (checked.status !== "valid" || !checked.preview) {
        const mapped = checked.diagnostics.map(item => diagnostic(item.code, item.message, item.path))
        caseDiagnostics.push(...mapped)
        diagnostics.push(...mapped)
        continue
      }
      if (checked.preview.includes(input.loaded.config.paths.evaluatorRubrics)
        || checked.preview.includes(evaluatorPath)) {
        const leaked = diagnostic(
          "evaluator-path-visible",
          `Evaluator-only path entered the ${studyArm} prompt for ${configured.caseId}.`,
          `cases.${caseIndex}`,
        )
        caseDiagnostics.push(leaked)
        diagnostics.push(leaked)
      }
      methodChecks.push({
        studyArm,
        renderArm: "B",
        promptSha256: sha256(checked.preview),
        ledgerVisible: methods[studyArm].rendered.sections.analysisLedger !== undefined,
        conditionAnalysisVisible: methods[studyArm].rendered.sections.conditionAnalysis !== undefined,
      })
    }
    cases.push({
      caseId: configured.caseId,
      status: caseDiagnostics.length === 0 && methodChecks.length === 3 ? "valid" : "invalid",
      taskId: ready.task.taskId,
      sourceCount: configured.sources.length,
      requirementCount: ready.analysisRequirements.length,
      conditionRequestCount: ready.conditionAnalysisRequest.requests.length,
      methods: methodChecks,
      diagnostics: caseDiagnostics,
    })
  }
  return {
    schemaVersion: "authorization-value-study-check/v1",
    configSchemaVersion: input.loaded.config.schemaVersion,
    status: diagnostics.length === 0 && cases.every(candidate => candidate.status === "valid") ? "valid" : "invalid",
    configSha256: input.loaded.configSha256,
    caseCount: materialized.cases.length,
    unitCount: input.loaded.config.units.length,
    cases,
    diagnostics,
  }
}

export async function checkAuthorizationValueStudyExperiment(input: {
  repositoryRoot: string
  configPath: string
}): Promise<AuthorizationValueStudyCheckReport> {
  const loaded = await loadStudyConfig(input.repositoryRoot, input.configPath)
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-authorization-value-study-check-"))
  try {
    return await inspectStudyConfig({ repositoryRoot: input.repositoryRoot, loaded, destinationRoot: temporaryRoot })
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

function unitRoot(runRoot: string, unitId: string): string {
  const unitsRoot = path.join(path.resolve(runRoot), "units")
  const resolved = path.resolve(unitsRoot, unitId)
  if (!isWithinRoot(unitsRoot, resolved)) throw new AuthorizationValueStudyError(`Unit ID escapes run root: ${unitId}`)
  return resolved
}

function unitResultPath(runRoot: string, unitId: string): string {
  return path.join(unitRoot(runRoot, unitId), "unit-result.json")
}

function validateStoredStudyUnit(input: {
  value: unknown
  runRoot: string
  unit: AuthorizationValueStudyUnit
  configSha256: string
  implementationRevision: string
  modelId: string
  inputPath: string
}): StoredStudyUnitResult {
  const value = input.value as Partial<StoredStudyUnitResult>
  const report = value.report
  if (!report
    || value.schemaVersion !== "authorization-value-study-unit-result/v1"
    || value.configSha256 !== input.configSha256
    || value.implementationRevision !== input.implementationRevision
    || JSON.stringify(value.unit) !== JSON.stringify(input.unit)
    || report.taskId !== input.unit.caseId
    || report.studyArm !== input.unit.studyArm
    || report.arm !== input.unit.renderArm
    || report.model !== input.modelId
    || path.resolve(report.inputPath ?? "") !== path.resolve(input.inputPath)
    || !isWithinRoot(unitRoot(input.runRoot, input.unit.id), path.resolve(report.sessionPath))) {
    throw new AuthorizationValueStudyError(`Stored result identity does not match study unit ${input.unit.id}.`)
  }
  return value as StoredStudyUnitResult
}

function unitStatusFromReport(
  runRoot: string,
  unit: AuthorizationValueStudyUnit,
  report: LocalAuthorizationSessionReport,
  status: AuthorizationValueStudyUnitStatus,
): AuthorizationValueStudyRunUnit {
  return {
    ...unit,
    status,
    reportStatus: report.status,
    sessionId: report.sessionId,
    sessionRelativePath: path.relative(runRoot, report.sessionPath).replace(/\\/g, "/"),
  }
}

async function storeStudyUnitResult(input: {
  runRoot: string
  unit: AuthorizationValueStudyUnit
  report: LocalAuthorizationSessionReport
  configSha256: string
  implementationRevision: string
}): Promise<void> {
  const stored: StoredStudyUnitResult = {
    schemaVersion: "authorization-value-study-unit-result/v1",
    configSha256: input.configSha256,
    implementationRevision: input.implementationRevision,
    unit: input.unit,
    report: input.report,
    sessionRelativePath: path.relative(input.runRoot, input.report.sessionPath).replace(/\\/g, "/"),
  }
  await writeJsonExclusive(unitResultPath(input.runRoot, input.unit.id), stored)
}

async function writeRunIndex(
  runRoot: string,
  configSha256: string,
  units: AuthorizationValueStudyRunUnit[],
  expectedCount: number,
): Promise<AuthorizationValueStudyRunReport> {
  const status: AuthorizationValueStudyRunReport["status"] = units.length !== expectedCount
    ? "in-progress"
    : units.every(unit => unit.reportStatus === "completed") ? "completed" : "completed-with-failures"
  const report: AuthorizationValueStudyRunReport = {
    schemaVersion: "authorization-value-study-run-index/v1",
    status,
    runRoot,
    configSha256,
    units,
  }
  await writeJson(path.join(runRoot, "index.json"), report)
  return report
}

async function defaultProviderFactory(modelId: string): Promise<LLMProvider> {
  const { createProviderForModel } = await import("../../providers/registry.ts")
  return createProviderForModel(modelId)
}

export async function executeAuthorizationValueStudyExperiment(input: {
  repositoryRoot: string
  configPath: string
  providerFactory?: AuthorizationValueStudyProviderFactory
  env?: LocalAuthorizationRunnerEnv
}): Promise<AuthorizationValueStudyRunReport> {
  const loaded = await loadStudyConfig(input.repositoryRoot, input.configPath)
  const runRoot = resolveRepositoryPath(input.repositoryRoot, loaded.config.paths.runRoot)
  const checked = await checkAuthorizationValueStudyExperiment(input)
  if (checked.status !== "valid") {
    return {
      schemaVersion: "authorization-value-study-run-index/v1",
      status: "input-invalid",
      runRoot,
      configSha256: loaded.configSha256,
      units: [],
    }
  }

  await mkdir(runRoot, { recursive: true })
  const materialized = await materializeStudyCases({
    repositoryRoot: input.repositoryRoot,
    destinationRoot: path.join(runRoot, "public-inputs"),
    config: loaded.config,
  })
  if (materialized.diagnostics.length > 0 || materialized.cases.length !== loaded.config.cases.length) {
    return {
      schemaVersion: "authorization-value-study-run-index/v1",
      status: "input-invalid",
      runRoot,
      configSha256: loaded.configSha256,
      units: [],
    }
  }

  const metadataPath = path.join(runRoot, "run-metadata.json")
  if (await pathExists(metadataPath)) {
    const metadata = await readJson(metadataPath) as { configSha256?: string; implementationRevision?: string }
    if (metadata.configSha256 !== loaded.configSha256
      || metadata.implementationRevision !== loaded.config.implementationRevision) {
      throw new AuthorizationValueStudyError("Existing run metadata belongs to a different config or implementation revision.")
    }
  } else {
    await writeJsonExclusive(metadataPath, {
      schemaVersion: "authorization-value-study-run-metadata/v1",
      studyId: loaded.config.studyId,
      configPath: path.relative(input.repositoryRoot, loaded.configPath).replace(/\\/g, "/"),
      configSha256: loaded.configSha256,
      implementationRevision: loaded.config.implementationRevision,
      model: loaded.config.model,
      design: loaded.config.design,
      execution: loaded.config.execution,
      stoppingRules: loaded.config.stoppingRules,
      revisionPolicy: loaded.config.revisionPolicy,
      evaluator: { rubrics: loaded.config.paths.evaluatorRubrics, exposure: "after-all-generation" },
      unitOrder: loaded.config.units.map(unit => unit.id),
      recordedBeforeProviderCreation: true,
      createdAt: new Date().toISOString(),
    })
  }

  const inputByCase = new Map(materialized.cases.map(candidate => [candidate.caseId, candidate.inputPath]))
  const completed: AuthorizationValueStudyRunUnit[] = []
  const pending: AuthorizationValueStudyUnit[] = []
  for (const unit of loaded.config.units) {
    const inputPath = inputByCase.get(unit.caseId)
    if (!inputPath) throw new AuthorizationValueStudyError(`No materialized input for ${unit.caseId}.`)
    const resultPath = unitResultPath(runRoot, unit.id)
    if (await pathExists(resultPath)) {
      const stored = validateStoredStudyUnit({
        value: await readJson(resultPath),
        runRoot,
        unit,
        configSha256: loaded.configSha256,
        implementationRevision: loaded.config.implementationRevision,
        modelId: loaded.config.model.modelId,
        inputPath,
      })
      completed.push(unitStatusFromReport(runRoot, unit, stored.report, "skipped-terminal"))
      continue
    }
    const outputRoot = unitRoot(runRoot, unit.id)
    const claimPath = path.join(outputRoot, "dispatch-claim.json")
    if (await pathExists(path.join(outputRoot, "sessions.jsonl"))) {
      const report = await inspectLocalAuthorizationOutput(outputRoot)
      if (report.status === "initialized") {
        pending.push(unit)
        continue
      }
      await storeStudyUnitResult({
        runRoot,
        unit,
        report,
        configSha256: loaded.configSha256,
        implementationRevision: loaded.config.implementationRevision,
      })
      completed.push(unitStatusFromReport(
        runRoot,
        unit,
        report,
        report.status === "completion-unknown" || report.status === "timeout-unknown"
          ? "completion-unknown"
          : "skipped-terminal",
      ))
      continue
    }
    if (await pathExists(claimPath)) {
      completed.push({ ...unit, status: "completion-unknown" })
      continue
    }
    pending.push(unit)
  }
  if (pending.length === 0) {
    const ordered = loaded.config.units.map(unit => completed.find(candidate => candidate.id === unit.id)!)
    return writeRunIndex(runRoot, loaded.configSha256, ordered, loaded.config.units.length)
  }

  const env = input.env ?? process.env
  env.SKVM_AUTO_PROBE = "0"
  env.SKVM_CACHE = resolveRepositoryPath(input.repositoryRoot, loaded.config.model.cacheDir)
  let provider: LLMProvider
  try {
    provider = await (input.providerFactory ?? defaultProviderFactory)(loaded.config.model.modelId)
  } catch (error) {
    const serialized = errorArtifact(error)
    await writeJson(path.join(runRoot, "provider-unavailable.json"), serialized)
    const units = loaded.config.units.map(unit => completed.find(candidate => candidate.id === unit.id) ?? ({
      ...unit,
      status: "pending" as const,
    }))
    const report: AuthorizationValueStudyRunReport = {
      schemaVersion: "authorization-value-study-run-index/v1",
      status: "provider-unavailable",
      runRoot,
      configSha256: loaded.configSha256,
      units,
      error: serialized,
    }
    await writeJson(path.join(runRoot, "index.json"), report)
    return report
  }

  const reuseProvider: LocalAuthorizationProviderFactory = async () => provider
  for (const unit of pending) {
    const outputRoot = unitRoot(runRoot, unit.id)
    await mkdir(outputRoot, { recursive: true })
    const claimPath = path.join(outputRoot, "dispatch-claim.json")
    if (!await pathExists(claimPath)) {
      await writeJsonExclusive(claimPath, {
        schemaVersion: "authorization-value-study-unit-claim/v1",
        configSha256: loaded.configSha256,
        implementationRevision: loaded.config.implementationRevision,
        unit,
        claimedAt: new Date().toISOString(),
        noResendWithoutTerminalIdentity: true,
      })
    }
    const inputPath = inputByCase.get(unit.caseId)!
    const execution = await executeLocalAuthorizationRun({
      inputFile: inputPath,
      model: loaded.config.model.modelId,
      outRoot: outputRoot,
      arm: unit.renderArm,
      studyArm: unit.studyArm,
      executionOptions: {
        timeoutMs: loaded.config.model.timeoutMs,
        unitTimeoutMs: loaded.config.model.unitTimeoutMs,
        maxTokens: loaded.config.model.maxTokens,
        maxProviderDispatches: loaded.config.model.maxProviderDispatches,
        maxDomainRepairs: loaded.config.model.maxDomainRepairs,
      },
      providerFactory: reuseProvider,
      env,
    })
    if (execution.schemaVersion !== "authorization-local-result/v1") {
      throw new AuthorizationValueStudyError(`Prevalidated study input became invalid for unit ${unit.id}.`)
    }
    await storeStudyUnitResult({
      runRoot,
      unit,
      report: execution,
      configSha256: loaded.configSha256,
      implementationRevision: loaded.config.implementationRevision,
    })
    completed.push(unitStatusFromReport(
      runRoot,
      unit,
      execution,
      execution.status === "completed"
        ? "completed"
        : execution.status === "completion-unknown" || execution.status === "timeout-unknown"
          ? "completion-unknown"
          : "failed-terminal",
    ))
    const orderedProgress = loaded.config.units
      .map(candidate => completed.find(item => item.id === candidate.id))
      .filter((item): item is AuthorizationValueStudyRunUnit => item !== undefined)
    await writeRunIndex(runRoot, loaded.configSha256, orderedProgress, loaded.config.units.length)
  }
  const ordered = loaded.config.units.map(unit => completed.find(candidate => candidate.id === unit.id)!)
  return writeRunIndex(runRoot, loaded.configSha256, ordered, loaded.config.units.length)
}

function generationDiagnostics(run: AuthorizationTaskRun): AuthorizationValueStudyDiagnostic[] {
  const diagnostics: AuthorizationValueStudyDiagnostic[] = []
  for (const [generation, artifact] of [["initial", run.initial], ["repair", run.repair]] as const) {
    if (!artifact) continue
    const candidates = [
      ...(artifact.normalization?.diagnostics ?? []),
      ...(artifact.validation?.diagnostics ?? []),
      ...(artifact.coverageValidation?.diagnostics ?? []),
      ...(artifact.conditionValidation?.diagnostics ?? []),
    ]
    for (const item of candidates) {
      diagnostics.push(diagnostic(item.code, `${generation}: ${item.message}`, item.path))
    }
  }
  return diagnostics
}

function attemptSummary(attempt: AuthorizationTaskRun["attempts"][number] | undefined) {
  if (!attempt) return null
  return {
    attemptId: attempt.id,
    phase: attempt.phase,
    transport: attempt.transport,
    status: attempt.status,
    tokens: attempt.usage,
    durationMs: attempt.response?.durationMs ?? null,
    actualUsd: attempt.costUsd,
  }
}

export interface AuthorizationStudyUnitSummary {
  schemaVersion: "authorization-value-study-unit-summary/v1"
  unitId: string
  caseId: string
  studyArm: AuthorizationStudyArm
  renderArm: "B"
  runStatus: AuthorizationTaskRun["status"]
  finalKind: AuthorizationTaskRun["finalKind"] | null
  finalQuality: AuthorizationGenerationEvaluationV2["qualityStatus"] | "not-evaluated"
  quality: {
    initial: AuthorizationGenerationEvaluationV2["qualityStatus"] | "not-evaluated"
    repair: AuthorizationGenerationEvaluationV2["qualityStatus"] | "not-evaluated"
    dimensions: AuthorizationGenerationEvaluationV2["dimensions"] | null
  }
  structuralIssues: AuthorizationValueStudyDiagnostic[]
  stages: {
    firstResponse: ReturnType<typeof attemptSummary>
    afterFallback: ReturnType<typeof attemptSummary>
    afterRepair: ReturnType<typeof attemptSummary>
  }
  usage: AuthorizationTaskRun["telemetry"] & { knownDurationMs: number }
}

export function summarizeAuthorizationStudyUnit(input: {
  unitId: string
  caseId: string
  studyArm: AuthorizationStudyArm
  run: AuthorizationTaskRun
  initialEvaluation?: AuthorizationGenerationEvaluationV2
  repairEvaluation?: AuthorizationGenerationEvaluationV2
}): AuthorizationStudyUnitSummary {
  const initialAttempts = input.run.attempts.filter(attempt => attempt.phase === "initial")
  const repairAttempts = input.run.attempts.filter(attempt => attempt.phase === "domain-repair")
  const finalEvaluation = input.run.finalKind === "repair"
    ? input.repairEvaluation
    : input.initialEvaluation
  return {
    schemaVersion: "authorization-value-study-unit-summary/v1",
    unitId: input.unitId,
    caseId: input.caseId,
    studyArm: input.studyArm,
    renderArm: "B",
    runStatus: input.run.status,
    finalKind: input.run.finalKind ?? null,
    finalQuality: finalEvaluation?.qualityStatus ?? "not-evaluated",
    quality: {
      initial: input.initialEvaluation?.qualityStatus ?? "not-evaluated",
      repair: input.repairEvaluation?.qualityStatus ?? "not-evaluated",
      dimensions: finalEvaluation?.dimensions ?? null,
    },
    structuralIssues: generationDiagnostics(input.run),
    stages: {
      firstResponse: attemptSummary(initialAttempts[0]),
      afterFallback: attemptSummary(initialAttempts.find(attempt => attempt.transport === "prompt-parse")),
      afterRepair: attemptSummary(repairAttempts.at(-1)),
    },
    usage: {
      ...input.run.telemetry,
      knownDurationMs: input.run.attempts.reduce((total, attempt) => total + (attempt.response?.durationMs ?? 0), 0),
    },
  }
}

export function summarizeAuthorizationValueStudy(units: AuthorizationStudyUnitSummary[]) {
  const summarizeArm = (studyArm: AuthorizationStudyArm) => {
    const selected = units.filter(unit => unit.studyArm === studyArm)
    const knownTokens = selected.reduce(
      (total, unit) => addTokenUsage(total, unit.usage.knownTokens),
      emptyTokenUsage(),
    )
    const unknownCostCalls = selected.reduce((total, unit) => total + unit.usage.unknownCostCalls, 0)
    return {
      studyArm,
      unitCount: selected.length,
      quality: {
        fullSuccess: selected.filter(unit => unit.finalQuality === "full-success").length,
        partial: selected.filter(unit => unit.finalQuality === "partial").length,
        incorrect: selected.filter(unit => unit.finalQuality === "incorrect").length,
        needsReview: selected.filter(unit => unit.finalQuality === "needs-review").length,
        notEvaluated: selected.filter(unit => unit.finalQuality === "not-evaluated").length,
      },
      structuralIssueCount: selected.reduce((total, unit) => total + unit.structuralIssues.length, 0),
      providerCalls: selected.reduce((total, unit) => total + unit.usage.providerCalls, 0),
      knownTokens,
      knownDurationMs: selected.reduce((total, unit) => total + unit.usage.knownDurationMs, 0),
      knownActualUsdSubtotal: selected.reduce((total, unit) => total + unit.usage.knownActualUsdSubtotal, 0),
      totalActualUsd: unknownCostCalls === 0
        ? selected.reduce((total, unit) => total + (unit.usage.totalActualUsd ?? 0), 0)
        : null,
      actualUsdStatus: unknownCostCalls === 0 ? "complete" as const : "unknown-or-partial" as const,
    }
  }
  return {
    schemaVersion: "authorization-value-study-summary/v1" as const,
    unitCount: units.length,
    byArm: (["P", "L", "C"] as const).map(summarizeArm),
  }
}

function parseOptions(args: string[]): Record<string, string> {
  const options: Record<string, string> = {}
  for (const argument of args) {
    if (!argument.startsWith("--") || !argument.includes("=")) {
      throw new AuthorizationValueStudyError(`Invalid argument ${argument}; expected --name=value.`)
    }
    const separator = argument.indexOf("=")
    const name = argument.slice(2, separator)
    const value = argument.slice(separator + 1)
    if (name !== "config") throw new AuthorizationValueStudyError(`Unknown option --${name}.`)
    if (!value) throw new AuthorizationValueStudyError("Option --config requires a value.")
    if (options[name] !== undefined) throw new AuthorizationValueStudyError("Option --config was provided more than once.")
    options[name] = value
  }
  return options
}

function helpText(): string {
  return [
    "Authorization P/L/C value study (authorization-value-study-experiment/v1)",
    "",
    "Commands:",
    "  check --config=<experiment.json>",
    "  run --config=<experiment.json>",
    "",
    "P, L, and C all use historical render arm B. Only run initializes a provider.",
  ].join("\n")
}

export async function runAuthorizationValueStudyCli(
  argv: string[],
  dependencies: {
    stdout: (value: string) => void
    stderr: (value: string) => void
    repositoryRoot?: string
    providerFactory?: AuthorizationValueStudyProviderFactory
    env?: LocalAuthorizationRunnerEnv
  },
): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    dependencies.stdout(helpText())
    return 0
  }
  const repositoryRoot = dependencies.repositoryRoot ?? path.resolve(import.meta.dir, "../../..")
  try {
    const command = argv[0]!
    const configPath = parseOptions(argv.slice(1)).config
    if (!configPath) throw new AuthorizationValueStudyError(`${command} requires --config=<experiment.json>.`)
    if (command === "check") {
      const report = await checkAuthorizationValueStudyExperiment({ repositoryRoot, configPath })
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "valid" ? 0 : 1
    }
    if (command === "run") {
      const report = await executeAuthorizationValueStudyExperiment({
        repositoryRoot,
        configPath,
        ...(dependencies.providerFactory ? { providerFactory: dependencies.providerFactory } : {}),
        ...(dependencies.env ? { env: dependencies.env } : {}),
      })
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "completed" ? 0 : 1
    }
    throw new AuthorizationValueStudyError(`Unknown command ${command}; use check or run.`)
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error))
    return error instanceof AuthorizationValueStudyError ? error.exitCode : 1
  }
}

if (import.meta.main) {
  const exitCode = await runAuthorizationValueStudyCli(process.argv.slice(2), {
    stdout: value => console.log(value),
    stderr: value => console.error(value),
    env: process.env,
  })
  process.exitCode = exitCode
}
