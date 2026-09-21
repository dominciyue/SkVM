import { createHash } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { z } from "zod"
import type { LLMProvider } from "../../providers/types.ts"
import { AnalysisRequirementsSchema, type AnalysisRequirement } from "../../task-dsl/authorization/relations.ts"
import { AuthorizationTaskV0Schema, type AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { loadLocalAuthorizationInput } from "./local-input.ts"
import {
  executeLocalAuthorizationRun,
  inspectLocalAuthorizationOutput,
  type LocalAuthorizationCheckReport,
  type LocalAuthorizationProviderFactory,
  type LocalAuthorizationRunnerEnv,
  type LocalAuthorizationSessionReport,
  type LocalAuthorizationSessionStatus,
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

const AnalysisRequirementsSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("default") }).strict(),
  z.object({ kind: z.literal("file"), path: RelativeRepositoryPath }).strict(),
])

const CapabilityCaseSchema = z.object({
  caseId: SafePathSegment,
  task: RelativeRepositoryPath,
  analysisRequirements: AnalysisRequirementsSourceSchema,
  sourceRoot: RelativeRepositoryPath,
  sources: z.array(RelativeRepositoryPath).min(1),
  includeNaturalSupplement: z.boolean(),
}).strict()

const MainUnitSchema = z.object({
  id: SafePathSegment,
  caseId: SafePathSegment,
  set: z.literal("main"),
  repeat: z.union([z.literal(1), z.literal(2)]),
  arm: z.enum(["B", "D"]),
}).strict()

const NaturalUnitSchema = z.object({
  id: SafePathSegment,
  caseId: SafePathSegment,
  set: z.literal("natural-supplement"),
  repeat: z.null(),
  arm: z.literal("N"),
}).strict()

export const AuthorizationCapabilityExperimentConfigSchema = z.object({
  schemaVersion: z.literal("authorization-capability-experiment/v1"),
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
    maxDomainRepairs: z.union([z.literal(0), z.literal(1)]),
    autoProbe: z.literal(false),
    contextLimitTokens: z.number().int().positive().nullable(),
    contextLimitStatus: z.enum(["provider-reported", "provider-not-reported"]),
  }).strict(),
  design: z.object({
    mainRepeats: z.literal(2),
    reverseSecondRepeat: z.literal(true),
    freshContextPerUnit: z.literal(true),
    evaluateAfterAllGeneration: z.literal(true),
    expectedCaseCount: z.number().int().positive(),
    expectedUnitCount: z.number().int().positive(),
  }).strict(),
  execution: z.object({
    sourceMode: z.literal("fixed-context"),
    targetExecution: z.literal("forbidden"),
    modelExecutableTools: z.literal(false),
    evaluatorVisibleDuringGeneration: z.literal(false),
  }).strict(),
  cases: z.array(CapabilityCaseSchema).min(1),
  units: z.array(z.discriminatedUnion("set", [MainUnitSchema, NaturalUnitSchema])).min(1),
  resumePolicy: z.object({
    terminalUnitsAreNotResent: z.literal(true),
    dispatchedWithoutResultIsCompletionUnknown: z.literal(true),
  }).strict(),
}).strict()

export type AuthorizationCapabilityExperimentConfig = z.infer<typeof AuthorizationCapabilityExperimentConfigSchema>
export type AuthorizationCapabilityExperimentUnit = AuthorizationCapabilityExperimentConfig["units"][number]

export interface AuthorizationCapabilityDiagnostic {
  code: string
  message: string
  path?: string
}

export interface AuthorizationCapabilityCheckReport {
  schemaVersion: "authorization-capability-check/v1"
  configSchemaVersion: "authorization-capability-experiment/v1"
  status: "valid" | "invalid"
  configSha256: string
  caseCount: number
  unitCount: number
  cases: Array<{
    caseId: string
    status: "valid" | "invalid"
    taskId?: string
    requirementCount?: number
    sourceCount?: number
    diagnostics: AuthorizationCapabilityDiagnostic[]
  }>
  diagnostics: AuthorizationCapabilityDiagnostic[]
}

export type AuthorizationCapabilityUnitStatus =
  | "completed"
  | "failed-terminal"
  | "completion-unknown"
  | "skipped-terminal"
  | "pending"

export interface AuthorizationCapabilityRunUnit {
  id: string
  caseId: string
  set: AuthorizationCapabilityExperimentUnit["set"]
  repeat: 1 | 2 | null
  arm: "N" | "B" | "D"
  status: AuthorizationCapabilityUnitStatus
  reportStatus?: LocalAuthorizationSessionStatus
  sessionId?: string
  sessionRelativePath?: string
}

export interface AuthorizationCapabilityRunReport {
  schemaVersion: "authorization-capability-run-index/v1"
  status: "in-progress" | "completed" | "completed-with-failures" | "provider-unavailable" | "input-invalid"
  runRoot: string
  configSha256: string
  units: AuthorizationCapabilityRunUnit[]
  error?: { name: string; message: string }
}

export type AuthorizationCapabilityProviderFactory = (modelId: string) => Promise<LLMProvider> | LLMProvider

export interface AuthorizationCapabilityCliDependencies {
  stdout: (value: string) => void
  stderr: (value: string) => void
  repositoryRoot?: string
  providerFactory?: AuthorizationCapabilityProviderFactory
  env?: LocalAuthorizationRunnerEnv
}

interface LoadedExperimentConfig {
  config: AuthorizationCapabilityExperimentConfig
  configPath: string
  configSha256: string
}

interface MaterializedCase {
  caseId: string
  inputPath: string
  task: AuthorizationTaskV0
  analysisRequirements?: AnalysisRequirement[]
}

interface StoredUnitResult {
  schemaVersion: "authorization-capability-unit-result/v1"
  configSha256: string
  implementationRevision: string
  unit: AuthorizationCapabilityExperimentUnit
  report: LocalAuthorizationSessionReport
  sessionRelativePath: string
}

const LocalSessionStatusSchema = z.enum([
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

const StoredUnitResultSchema = z.object({
  schemaVersion: z.literal("authorization-capability-unit-result/v1"),
  configSha256: z.string().regex(/^[a-f0-9]{64}$/),
  implementationRevision: NonEmptyString,
  unit: z.discriminatedUnion("set", [MainUnitSchema, NaturalUnitSchema]),
  report: z.object({
    schemaVersion: z.literal("authorization-local-result/v1"),
    sessionId: NonEmptyString,
    sessionPath: NonEmptyString,
    createdAt: NonEmptyString,
    status: LocalSessionStatusSchema,
    inputPath: NonEmptyString.optional(),
    taskId: NonEmptyString.optional(),
    model: NonEmptyString.optional(),
    arm: z.enum(["N", "B", "D"]).optional(),
  }).passthrough(),
  sessionRelativePath: RelativeRepositoryPath,
}).strict()

const UnitClaimSchema = z.object({
  schemaVersion: z.literal("authorization-capability-unit-claim/v1"),
  configSha256: z.string().regex(/^[a-f0-9]{64}$/),
  implementationRevision: NonEmptyString,
  unit: z.discriminatedUnion("set", [MainUnitSchema, NaturalUnitSchema]),
  claimedAt: NonEmptyString,
  noResendWithoutTerminalIdentity: z.literal(true),
}).strict()

class AuthorizationCapabilityRunnerError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message)
    this.name = "AuthorizationCapabilityRunnerError"
  }
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function stableJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize)
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      )
    }
    return candidate
  }
  return JSON.stringify(normalize(value))
}

function errorArtifact(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  }
}

function diagnostic(code: string, message: string, diagnosticPath?: string): AuthorizationCapabilityDiagnostic {
  return { code, message, ...(diagnosticPath ? { path: diagnosticPath } : {}) }
}

function resolveRepositoryPath(repositoryRoot: string, relativePath: string): string {
  const root = path.resolve(repositoryRoot)
  const resolved = path.resolve(root, ...relativePath.split("/"))
  const relation = path.relative(root, resolved)
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new AuthorizationCapabilityRunnerError(`Configured path escapes the repository root: ${relativePath}`)
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
      throw new AuthorizationCapabilityRunnerError(`Existing materialized input differs from the frozen bytes: ${candidate}`)
    }
    return
  }
  await writeFile(candidate, expected, { flag: "wx" })
}

async function loadExperimentConfig(repositoryRoot: string, candidatePath: string): Promise<LoadedExperimentConfig> {
  const configPath = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(repositoryRoot, candidatePath)
  const bytes = await readFile(configPath, "utf8")
  const parsed = AuthorizationCapabilityExperimentConfigSchema.safeParse(JSON.parse(bytes))
  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => `${issue.path.join(".") || "$"}: ${issue.message}`).join("; ")
    throw new AuthorizationCapabilityRunnerError(`Invalid authorization capability config: ${details}`)
  }
  return { config: parsed.data, configPath, configSha256: sha256(bytes) }
}

function designDiagnostics(config: AuthorizationCapabilityExperimentConfig): AuthorizationCapabilityDiagnostic[] {
  const diagnostics: AuthorizationCapabilityDiagnostic[] = []
  if (config.cases.length !== config.design.expectedCaseCount) {
    diagnostics.push(diagnostic(
      "case-count-mismatch",
      `Experiment declares ${config.design.expectedCaseCount} cases but config contains ${config.cases.length}.`,
      "cases",
    ))
  }
  if (config.units.length !== config.design.expectedUnitCount) {
    diagnostics.push(diagnostic(
      "unit-count-mismatch",
      `Experiment declares ${config.design.expectedUnitCount} units but config contains ${config.units.length}.`,
      "units",
    ))
  }
  const routeMatches = config.model.routeMatch.endsWith("*")
    ? config.model.modelId.startsWith(config.model.routeMatch.slice(0, -1))
    : config.model.modelId === config.model.routeMatch
  if (!routeMatches) {
    diagnostics.push(diagnostic(
      "model-route-mismatch",
      `Model ${config.model.modelId} does not match recorded route ${config.model.routeMatch}.`,
      "model.routeMatch",
    ))
  }
  const caseCounts = new Map<string, number>()
  config.cases.forEach(candidate => caseCounts.set(candidate.caseId, (caseCounts.get(candidate.caseId) ?? 0) + 1))
  for (const [caseId, count] of caseCounts) {
    if (count > 1) diagnostics.push(diagnostic("duplicate-case-id", `Case ID ${caseId} appears ${count} times.`, "cases"))
  }
  const unitCounts = new Map<string, number>()
  config.units.forEach(unit => unitCounts.set(unit.id, (unitCounts.get(unit.id) ?? 0) + 1))
  for (const [unitId, count] of unitCounts) {
    if (count > 1) diagnostics.push(diagnostic("duplicate-unit-id", `Unit ID ${unitId} appears ${count} times.`, "units"))
  }

  const caseIds = new Set(config.cases.map(candidate => candidate.caseId))
  config.units.forEach((unit, index) => {
    if (!caseIds.has(unit.caseId)) {
      diagnostics.push(diagnostic("foreign-unit-case", `Unit ${unit.id} names unknown case ${unit.caseId}.`, `units.${index}.caseId`))
    }
  })

  for (const candidate of config.cases) {
    const indexed = config.units
      .map((unit, index) => ({ unit, index }))
      .filter(item => item.unit.caseId === candidate.caseId)
    const main = indexed.filter(item => item.unit.set === "main") as Array<{
      unit: Extract<AuthorizationCapabilityExperimentUnit, { set: "main" }>
      index: number
    }>
    const expected = [
      { repeat: 1, arm: "B" as const },
      { repeat: 1, arm: "D" as const },
      { repeat: 2, arm: "B" as const },
      { repeat: 2, arm: "D" as const },
    ]
    expected.forEach(({ repeat, arm }) => {
      const count = main.filter(item => item.unit.repeat === repeat && item.unit.arm === arm).length
      if (count !== 1) {
        diagnostics.push(diagnostic(
          "main-unit-mismatch",
          `Case ${candidate.caseId} requires exactly one repeat-${repeat} ${arm} unit; found ${count}.`,
          "units",
        ))
      }
    })
    const repeatOneB = main.find(item => item.unit.repeat === 1 && item.unit.arm === "B")
    const repeatOneD = main.find(item => item.unit.repeat === 1 && item.unit.arm === "D")
    if (repeatOneB && repeatOneD && repeatOneB.index > repeatOneD.index) {
      diagnostics.push(diagnostic("first-repeat-order", `Case ${candidate.caseId} repeat 1 must run B before D.`, "units"))
    }
    const repeatTwoB = main.find(item => item.unit.repeat === 2 && item.unit.arm === "B")
    const repeatTwoD = main.find(item => item.unit.repeat === 2 && item.unit.arm === "D")
    if (repeatTwoB && repeatTwoD && repeatTwoD.index > repeatTwoB.index) {
      diagnostics.push(diagnostic("second-repeat-order", `Case ${candidate.caseId} repeat 2 must run D before B.`, "units"))
    }
    const repeatOneIndexes = main.filter(item => item.unit.repeat === 1).map(item => item.index)
    const repeatTwoIndexes = main.filter(item => item.unit.repeat === 2).map(item => item.index)
    if (
      repeatOneIndexes.length > 0
      && repeatTwoIndexes.length > 0
      && Math.max(...repeatOneIndexes) > Math.min(...repeatTwoIndexes)
    ) {
      diagnostics.push(diagnostic(
        "repeat-boundary-order",
        `Case ${candidate.caseId} repeat 2 must start after both repeat-1 units.`,
        "units",
      ))
    }
    const supplements = indexed.filter(item => item.unit.set === "natural-supplement")
    const expectedSupplements = candidate.includeNaturalSupplement ? 1 : 0
    if (supplements.length !== expectedSupplements) {
      diagnostics.push(diagnostic(
        "natural-supplement-mismatch",
        `Case ${candidate.caseId} expects ${expectedSupplements} natural supplement unit; found ${supplements.length}.`,
        "units",
      ))
    }
  }
  return diagnostics
}

async function materializeCases(input: {
  repositoryRoot: string
  destinationRoot: string
  config: AuthorizationCapabilityExperimentConfig
}): Promise<{ cases: MaterializedCase[]; diagnostics: AuthorizationCapabilityDiagnostic[] }> {
  const cases: MaterializedCase[] = []
  const diagnostics: AuthorizationCapabilityDiagnostic[] = []
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

      let analysisRequirements: AnalysisRequirement[] | undefined
      if (candidate.analysisRequirements.kind === "file") {
        const parsedRequirements = AnalysisRequirementsSchema.safeParse(
          await readJson(resolveRepositoryPath(input.repositoryRoot, candidate.analysisRequirements.path)),
        )
        if (!parsedRequirements.success) {
          diagnostics.push(...parsedRequirements.error.issues.map(issue => diagnostic(
            "analysis-requirements-invalid",
            issue.message,
            `cases.${caseIndex}.analysisRequirements.${issue.path.join(".")}`,
          )))
          continue
        }
        analysisRequirements = parsedRequirements.data
      }

      const caseDestination = path.join(input.destinationRoot, candidate.caseId)
      const projectDestination = path.join(caseDestination, "project")
      const configuredSourceRoot = resolveRepositoryPath(input.repositoryRoot, candidate.sourceRoot)
      const canonicalSourceRoot = await realpath(configuredSourceRoot)
      for (const source of candidate.sources) {
        const sourcePath = await realpath(path.resolve(configuredSourceRoot, ...source.split("/")))
        if (!isWithinRoot(canonicalSourceRoot, sourcePath)) {
          throw new AuthorizationCapabilityRunnerError(`Case source resolves outside its root: ${source}`)
        }
        await writeOrVerify(
          path.join(projectDestination, ...source.split("/")),
          await readFile(sourcePath),
        )
      }
      const assessment = {
        schemaVersion: "authorization-assessment-input/v1",
        sourceIdentity: {
          repository: parsedTask.data.repository,
          sourceRef: parsedTask.data.sourceRef,
        },
        sourceRoot: "project",
        sources: candidate.sources,
        task: parsedTask.data,
        ...(analysisRequirements ? { analysisRequirements } : {}),
      }
      const inputPath = path.join(caseDestination, "assessment.json")
      await writeOrVerify(inputPath, `${JSON.stringify(assessment, null, 2)}\n`)
      const loaded = await loadLocalAuthorizationInput(inputPath)
      if (loaded.status !== "valid") {
        diagnostics.push(...loaded.diagnostics.map(item => diagnostic(
          item.code,
          `${candidate.caseId}: ${item.message}`,
          item.path,
        )))
        continue
      }
      cases.push({
        caseId: candidate.caseId,
        inputPath,
        task: parsedTask.data,
        ...(analysisRequirements ? { analysisRequirements } : {}),
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

async function inspectConfig(input: {
  repositoryRoot: string
  loaded: LoadedExperimentConfig
  destinationRoot: string
}): Promise<AuthorizationCapabilityCheckReport> {
  const diagnostics = designDiagnostics(input.loaded.config)
  if (!await pathExists(resolveRepositoryPath(input.repositoryRoot, input.loaded.config.paths.evaluatorRubrics))) {
    diagnostics.push(diagnostic(
      "evaluator-rubrics-missing",
      `Evaluator rubric path does not exist: ${input.loaded.config.paths.evaluatorRubrics}`,
      "paths.evaluatorRubrics",
    ))
  }
  const materialized = await materializeCases({
    repositoryRoot: input.repositoryRoot,
    destinationRoot: input.destinationRoot,
    config: input.loaded.config,
  })
  diagnostics.push(...materialized.diagnostics)
  const byCase = new Map(materialized.cases.map(candidate => [candidate.caseId, candidate]))
  const cases = input.loaded.config.cases.map(candidate => {
    const ready = byCase.get(candidate.caseId)
    const caseDiagnostics = diagnostics.filter(item => item.path?.startsWith("cases.")
      && item.message.includes(candidate.caseId))
    return {
      caseId: candidate.caseId,
      status: ready ? "valid" as const : "invalid" as const,
      ...(ready ? {
        taskId: ready.task.taskId,
        requirementCount: ready.analysisRequirements?.length,
        sourceCount: candidate.sources.length,
      } : {}),
      diagnostics: caseDiagnostics,
    }
  })
  return {
    schemaVersion: "authorization-capability-check/v1",
    configSchemaVersion: input.loaded.config.schemaVersion,
    status: diagnostics.length === 0 && materialized.cases.length === input.loaded.config.cases.length
      ? "valid"
      : "invalid",
    configSha256: input.loaded.configSha256,
    caseCount: materialized.cases.length,
    unitCount: input.loaded.config.units.length,
    cases,
    diagnostics,
  }
}

export async function checkAuthorizationCapabilityExperiment(input: {
  repositoryRoot: string
  configPath: string
}): Promise<AuthorizationCapabilityCheckReport> {
  const loaded = await loadExperimentConfig(input.repositoryRoot, input.configPath)
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-authorization-capability-check-"))
  try {
    return await inspectConfig({ repositoryRoot: input.repositoryRoot, loaded, destinationRoot: temporaryRoot })
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function defaultProviderFactory(modelId: string): Promise<LLMProvider> {
  const { createProviderForModel } = await import("../../providers/registry.ts")
  return createProviderForModel(modelId)
}

function unitResultPath(runRoot: string, unitId: string): string {
  return path.join(unitRoot(runRoot, unitId), "unit-result.json")
}

function unitRoot(runRoot: string, unitId: string): string {
  const unitsRoot = path.join(path.resolve(runRoot), "units")
  const resolved = path.resolve(unitsRoot, unitId)
  if (!isWithinRoot(unitsRoot, resolved)) {
    throw new AuthorizationCapabilityRunnerError(`Unit ID escapes the run root: ${unitId}`)
  }
  return resolved
}

function sameUnit(left: AuthorizationCapabilityExperimentUnit, right: AuthorizationCapabilityExperimentUnit): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function validateStoredUnitResult(input: {
  value: unknown
  runRoot: string
  unit: AuthorizationCapabilityExperimentUnit
  configSha256: string
  implementationRevision: string
  modelId: string
  inputPath: string
}): StoredUnitResult {
  const parsed = StoredUnitResultSchema.safeParse(input.value)
  if (!parsed.success) {
    throw new AuthorizationCapabilityRunnerError(
      `Stored result for ${input.unit.id} is invalid: ${parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    )
  }
  const stored = parsed.data as unknown as StoredUnitResult
  const expectedUnitRoot = unitRoot(input.runRoot, input.unit.id)
  const canonicalSessionPath = path.resolve(stored.report.sessionPath)
  const expectedRelativePath = path.relative(input.runRoot, canonicalSessionPath).replace(/\\/g, "/")
  if (
    stored.configSha256 !== input.configSha256
    || stored.implementationRevision !== input.implementationRevision
    || !sameUnit(stored.unit, input.unit)
    || stored.report.taskId !== input.unit.caseId
    || stored.report.arm !== input.unit.arm
    || stored.report.model !== input.modelId
    || path.resolve(stored.report.inputPath ?? "") !== path.resolve(input.inputPath)
    || !isWithinRoot(expectedUnitRoot, canonicalSessionPath)
    || path.basename(canonicalSessionPath) !== stored.report.sessionId
    || stored.sessionRelativePath !== expectedRelativePath
  ) {
    throw new AuthorizationCapabilityRunnerError(`Stored result identity does not match unit ${input.unit.id}.`)
  }
  return stored
}

async function validateStoredSessionArtifacts(
  runRoot: string,
  unit: AuthorizationCapabilityExperimentUnit,
  stored: StoredUnitResult,
): Promise<void> {
  const inspected = await inspectLocalAuthorizationOutput(unitRoot(runRoot, unit.id))
  if (sha256(stableJson(inspected)) !== sha256(stableJson(stored.report))) {
    throw new AuthorizationCapabilityRunnerError(`Stored result does not match session artifacts for unit ${unit.id}.`)
  }
}

function validateUnitClaim(input: {
  value: unknown
  unit: AuthorizationCapabilityExperimentUnit
  configSha256: string
  implementationRevision: string
}): void {
  const parsed = UnitClaimSchema.safeParse(input.value)
  if (!parsed.success
    || parsed.data.configSha256 !== input.configSha256
    || parsed.data.implementationRevision !== input.implementationRevision
    || !sameUnit(parsed.data.unit, input.unit)) {
    throw new AuthorizationCapabilityRunnerError(`Existing dispatch claim does not match unit ${input.unit.id}.`)
  }
}

function unitStatusFromReport(
  runRoot: string,
  unit: AuthorizationCapabilityExperimentUnit,
  report: LocalAuthorizationSessionReport,
  status: AuthorizationCapabilityUnitStatus,
): AuthorizationCapabilityRunUnit {
  return {
    ...unit,
    status,
    reportStatus: report.status,
    sessionId: report.sessionId,
    sessionRelativePath: path.relative(runRoot, report.sessionPath).replace(/\\/g, "/"),
  }
}

async function writeStoredUnitResult(
  runRoot: string,
  unit: AuthorizationCapabilityExperimentUnit,
  report: LocalAuthorizationSessionReport,
  configSha256: string,
  implementationRevision: string,
): Promise<StoredUnitResult> {
  const stored: StoredUnitResult = {
    schemaVersion: "authorization-capability-unit-result/v1",
    configSha256,
    implementationRevision,
    unit,
    report,
    sessionRelativePath: path.relative(runRoot, report.sessionPath).replace(/\\/g, "/"),
  }
  try {
    await writeJsonExclusive(unitResultPath(runRoot, unit.id), stored)
    return stored
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : ""
    if (code !== "EEXIST") throw error
    const storedResult = validateStoredUnitResult({
      value: await readJson(unitResultPath(runRoot, unit.id)),
      runRoot,
      unit,
      configSha256,
      implementationRevision,
      modelId: report.model ?? "",
      inputPath: report.inputPath ?? "",
    })
    await validateStoredSessionArtifacts(runRoot, unit, storedResult)
    return storedResult
  }
}

function runStatusFromUnits(
  units: AuthorizationCapabilityRunUnit[],
  expectedUnitCount: number,
): AuthorizationCapabilityRunReport["status"] {
  if (units.length !== expectedUnitCount) return "in-progress"
  return units.every(unit => unit.reportStatus === "completed") ? "completed" : "completed-with-failures"
}

async function writeRunIndex(
  runRoot: string,
  configSha256: string,
  units: AuthorizationCapabilityRunUnit[],
  expectedUnitCount = units.length,
): Promise<AuthorizationCapabilityRunReport> {
  const report: AuthorizationCapabilityRunReport = {
    schemaVersion: "authorization-capability-run-index/v1",
    status: runStatusFromUnits(units, expectedUnitCount),
    runRoot,
    configSha256,
    units,
  }
  await writeJson(path.join(runRoot, "index.json"), report)
  return report
}

export async function executeAuthorizationCapabilityExperiment(input: {
  repositoryRoot: string
  configPath: string
  providerFactory?: AuthorizationCapabilityProviderFactory
  env?: LocalAuthorizationRunnerEnv
}): Promise<AuthorizationCapabilityRunReport> {
  const loaded = await loadExperimentConfig(input.repositoryRoot, input.configPath)
  const runRoot = resolveRepositoryPath(input.repositoryRoot, loaded.config.paths.runRoot)
  const checked = await checkAuthorizationCapabilityExperiment({
    repositoryRoot: input.repositoryRoot,
    configPath: input.configPath,
  })
  if (checked.status !== "valid") {
    return {
      schemaVersion: "authorization-capability-run-index/v1",
      status: "input-invalid",
      runRoot,
      configSha256: loaded.configSha256,
      units: [],
    }
  }

  await mkdir(runRoot, { recursive: true })
  const materialized = await materializeCases({
    repositoryRoot: input.repositoryRoot,
    destinationRoot: path.join(runRoot, "public-inputs"),
    config: loaded.config,
  })
  if (materialized.diagnostics.length > 0 || materialized.cases.length !== loaded.config.cases.length) {
    return {
      schemaVersion: "authorization-capability-run-index/v1",
      status: "input-invalid",
      runRoot,
      configSha256: loaded.configSha256,
      units: [],
    }
  }

  const metadataPath = path.join(runRoot, "run-metadata.json")
  if (await pathExists(metadataPath)) {
    const metadata = await readJson(metadataPath) as { configSha256?: string; implementationRevision?: string }
    if (
      metadata.configSha256 !== loaded.configSha256
      || metadata.implementationRevision !== loaded.config.implementationRevision
    ) {
      throw new AuthorizationCapabilityRunnerError("Existing run metadata belongs to a different config or implementation revision.")
    }
  } else {
    await writeJsonExclusive(metadataPath, {
      schemaVersion: "authorization-capability-run-metadata/v1",
      studyId: loaded.config.studyId,
      configPath: path.relative(input.repositoryRoot, loaded.configPath).replace(/\\/g, "/"),
      configSha256: loaded.configSha256,
      implementationRevision: loaded.config.implementationRevision,
      model: loaded.config.model,
      design: loaded.config.design,
      execution: loaded.config.execution,
      evaluator: {
        rubrics: loaded.config.paths.evaluatorRubrics,
        exposure: "after-all-generation",
      },
      unitOrder: loaded.config.units.map(unit => unit.id),
      recordedBeforeProviderCreation: true,
      createdAt: new Date().toISOString(),
    })
  }

  const inputByCase = new Map(materialized.cases.map(candidate => [candidate.caseId, candidate.inputPath]))
  const existingUnits: AuthorizationCapabilityRunUnit[] = []
  const pendingUnits: AuthorizationCapabilityExperimentUnit[] = []
  const initializedClaims = new Set<string>()
  for (const unit of loaded.config.units) {
    const inputPath = inputByCase.get(unit.caseId)
    if (!inputPath) throw new AuthorizationCapabilityRunnerError(`No materialized input for ${unit.caseId}.`)
    const resultPath = unitResultPath(runRoot, unit.id)
    if (await pathExists(resultPath)) {
      const stored = validateStoredUnitResult({
        value: await readJson(resultPath),
        runRoot,
        unit,
        configSha256: loaded.configSha256,
        implementationRevision: loaded.config.implementationRevision,
        modelId: loaded.config.model.modelId,
        inputPath,
      })
      await validateStoredSessionArtifacts(runRoot, unit, stored)
      existingUnits.push(unitStatusFromReport(runRoot, unit, stored.report, "skipped-terminal"))
      continue
    }
    const outputRoot = unitRoot(runRoot, unit.id)
    const claimPath = path.join(outputRoot, "dispatch-claim.json")
    if (await pathExists(path.join(outputRoot, "sessions.jsonl"))) {
      let report = await inspectLocalAuthorizationOutput(outputRoot)
      if (!report.taskId && await pathExists(path.join(report.sessionPath, "check.json"))) {
        const check = await readJson(path.join(report.sessionPath, "check.json")) as { taskId?: string }
        report = { ...report, ...(check.taskId ? { taskId: check.taskId } : {}) }
      }
      const provisional: StoredUnitResult = {
        schemaVersion: "authorization-capability-unit-result/v1",
        configSha256: loaded.configSha256,
        implementationRevision: loaded.config.implementationRevision,
        unit,
        report,
        sessionRelativePath: path.relative(runRoot, report.sessionPath).replace(/\\/g, "/"),
      }
      validateStoredUnitResult({
        value: provisional,
        runRoot,
        unit,
        configSha256: loaded.configSha256,
        implementationRevision: loaded.config.implementationRevision,
        modelId: loaded.config.model.modelId,
        inputPath,
      })
      if (report.status === "initialized") {
        if (!await pathExists(claimPath)) {
          throw new AuthorizationCapabilityRunnerError(`Initialized unit ${unit.id} has no matching dispatch claim.`)
        }
        validateUnitClaim({
          value: await readJson(claimPath),
          unit,
          configSha256: loaded.configSha256,
          implementationRevision: loaded.config.implementationRevision,
        })
        initializedClaims.add(unit.id)
        pendingUnits.push(unit)
        continue
      }
      await writeStoredUnitResult(
        runRoot,
        unit,
        report,
        loaded.configSha256,
        loaded.config.implementationRevision,
      )
      existingUnits.push(unitStatusFromReport(
        runRoot,
        unit,
        report,
        report.status === "completion-unknown" ? "completion-unknown" : "skipped-terminal",
      ))
      continue
    }
    if (await pathExists(claimPath)) {
      validateUnitClaim({
        value: await readJson(claimPath),
        unit,
        configSha256: loaded.configSha256,
        implementationRevision: loaded.config.implementationRevision,
      })
      existingUnits.push({ ...unit, status: "completion-unknown" })
      continue
    }
    pendingUnits.push(unit)
  }
  if (pendingUnits.length === 0) {
    const ordered = loaded.config.units.map(unit => existingUnits.find(item => item.id === unit.id)!)
    return writeRunIndex(runRoot, loaded.configSha256, ordered)
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
    const units = loaded.config.units.map(unit => existingUnits.find(item => item.id === unit.id) ?? ({
      ...unit,
      status: "pending" as const,
    }))
    const report: AuthorizationCapabilityRunReport = {
      schemaVersion: "authorization-capability-run-index/v1",
      status: "provider-unavailable",
      runRoot,
      configSha256: loaded.configSha256,
      units,
      error: serialized,
    }
    await writeJson(path.join(runRoot, "index.json"), report)
    return report
  }

  const completedUnits = [...existingUnits]
  const reuseProvider: LocalAuthorizationProviderFactory = async () => provider
  for (const unit of pendingUnits) {
    const outputRoot = unitRoot(runRoot, unit.id)
    await mkdir(outputRoot, { recursive: true })
    const unitBytes = `${JSON.stringify({
      schemaVersion: "authorization-capability-unit/v1",
      ...unit,
      configSha256: loaded.configSha256,
      implementationRevision: loaded.config.implementationRevision,
      model: loaded.config.model,
      freshContext: true,
      evaluatorVisible: false,
    }, null, 2)}\n`
    await writeOrVerify(path.join(outputRoot, "unit.json"), unitBytes)
    const inputPath = inputByCase.get(unit.caseId)
    if (!inputPath) throw new AuthorizationCapabilityRunnerError(`No materialized input for ${unit.caseId}.`)
    if (!initializedClaims.has(unit.id)) {
      await writeJsonExclusive(path.join(outputRoot, "dispatch-claim.json"), {
        schemaVersion: "authorization-capability-unit-claim/v1",
        configSha256: loaded.configSha256,
        implementationRevision: loaded.config.implementationRevision,
        unit,
        claimedAt: new Date().toISOString(),
        noResendWithoutTerminalIdentity: true,
      })
    }
    const execution = await executeLocalAuthorizationRun({
      inputFile: inputPath,
      model: loaded.config.model.modelId,
      outRoot: outputRoot,
      arm: unit.arm,
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
      throw new AuthorizationCapabilityRunnerError(`Prevalidated input became invalid for unit ${unit.id}.`)
    }
    await writeStoredUnitResult(
      runRoot,
      unit,
      execution,
      loaded.configSha256,
      loaded.config.implementationRevision,
    )
    completedUnits.push(unitStatusFromReport(
      runRoot,
      unit,
      execution,
      execution.status === "completed"
        ? "completed"
        : (execution.status === "completion-unknown" || execution.status === "timeout-unknown"
          ? "completion-unknown"
          : "failed-terminal"),
    ))
    const orderedProgress = loaded.config.units
      .map(candidate => completedUnits.find(item => item.id === candidate.id))
      .filter((item): item is AuthorizationCapabilityRunUnit => item !== undefined)
    await writeRunIndex(runRoot, loaded.configSha256, orderedProgress, loaded.config.units.length)
  }
  const ordered = loaded.config.units.map(unit => completedUnits.find(item => item.id === unit.id)!)
  return writeRunIndex(runRoot, loaded.configSha256, ordered)
}

function parseOptions(args: string[], allowed: Set<string>): Record<string, string> {
  const options: Record<string, string> = {}
  for (const argument of args) {
    if (!argument.startsWith("--") || !argument.includes("=")) {
      throw new AuthorizationCapabilityRunnerError(`Invalid argument ${argument}; expected --name=value.`)
    }
    const separator = argument.indexOf("=")
    const name = argument.slice(2, separator)
    const value = argument.slice(separator + 1)
    if (!allowed.has(name)) throw new AuthorizationCapabilityRunnerError(`Unknown option --${name}.`)
    if (value.length === 0) throw new AuthorizationCapabilityRunnerError(`Option --${name} requires a value.`)
    if (options[name] !== undefined) throw new AuthorizationCapabilityRunnerError(`Option --${name} was provided more than once.`)
    options[name] = value
  }
  return options
}

function requireOption(options: Record<string, string>, name: string, command: string): string {
  const value = options[name]
  if (!value) throw new AuthorizationCapabilityRunnerError(`${command} requires --${name}=<value>.`)
  return value
}

function helpText(): string {
  return [
    "Authorization capability experiment (authorization-capability-experiment/v1)",
    "",
    "Commands:",
    "  check --config=<experiment.json>",
    "  run --config=<experiment.json>",
    "",
    "Only run initializes a provider. Terminal or completion-unknown units are never resent.",
  ].join("\n")
}

export async function runAuthorizationCapabilityExperimentCli(
  argv: string[],
  dependencies: AuthorizationCapabilityCliDependencies,
): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    dependencies.stdout(helpText())
    return 0
  }
  const repositoryRoot = dependencies.repositoryRoot ?? path.resolve(import.meta.dir, "../../..")
  const command = argv[0]!
  try {
    const options = parseOptions(argv.slice(1), new Set(["config"]))
    const configPath = requireOption(options, "config", command)
    if (command === "check") {
      const report = await checkAuthorizationCapabilityExperiment({ repositoryRoot, configPath })
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "valid" ? 0 : 1
    }
    if (command === "run") {
      const report = await executeAuthorizationCapabilityExperiment({
        repositoryRoot,
        configPath,
        ...(dependencies.providerFactory ? { providerFactory: dependencies.providerFactory } : {}),
        ...(dependencies.env ? { env: dependencies.env } : {}),
      })
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "completed" ? 0 : 1
    }
    throw new AuthorizationCapabilityRunnerError(`Unknown command ${command}; use check or run.`)
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error))
    return error instanceof AuthorizationCapabilityRunnerError ? error.exitCode : 1
  }
}

if (import.meta.main) {
  const exitCode = await runAuthorizationCapabilityExperimentCli(process.argv.slice(2), {
    stdout: value => console.log(value),
    stderr: value => console.error(value),
    env: process.env,
  })
  process.exitCode = exitCode
}
