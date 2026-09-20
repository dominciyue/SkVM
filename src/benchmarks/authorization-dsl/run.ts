import { createHash } from "node:crypto"
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { LLMProvider } from "../../providers/types.ts"
import { parseAuthorizationTask, type AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { renderAuthorizationTask } from "../../task-dsl/authorization/render.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import {
  AuthorizationEvaluationRubricsV0Schema,
  createAuthorizationReviewTemplate,
  evaluateAuthorizationGeneration,
  summarizeAuthorizationPair,
  summarizeAuthorizationRun,
  type AuthorizationCaseEvaluationRubric,
  type AuthorizationPairSummary,
  type AuthorizationRunEvaluationSummary,
} from "./evaluate.ts"
import { runAuthorizationTask, type AuthorizationTaskRun } from "./host.ts"
import { loadExactSourceBundle, renderSourceBundle, type SourceBundle } from "./inputs.ts"

const NonEmptyString = z.string().trim().min(1)
const RelativeRepositoryPath = NonEmptyString.refine(value => {
  if (value.includes("\\") || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false
  return !value.split("/").some(segment => segment === "" || segment === "." || segment === "..")
}, "must be a portable repository-relative path")

const AuthorizationComparisonConfigSchema = z.object({
  schemaVersion: z.literal("authorization-comparison-config/v0"),
  studyId: NonEmptyString,
  createdAt: NonEmptyString,
  implementationRevision: NonEmptyString,
  paths: z.object({
    caseRoot: RelativeRepositoryPath,
    manifest: RelativeRepositoryPath,
    declarations: RelativeRepositoryPath,
    rubrics: RelativeRepositoryPath,
    developmentRoot: RelativeRepositoryPath,
    runRoot: RelativeRepositoryPath,
  }).strict(),
  model: z.object({
    modelId: NonEmptyString,
    routeMatch: NonEmptyString,
    cacheDir: RelativeRepositoryPath,
    temperature: z.literal(0),
    timeoutMs: z.number().int().positive(),
    maxTokens: z.number().int().positive(),
    contextLimitTokens: z.number().int().positive().nullable(),
    contextLimitStatus: z.enum(["provider-reported", "provider-not-reported"]),
    maxDomainRepairs: z.union([z.literal(0), z.literal(1)]),
    autoProbe: z.literal(false),
  }).strict(),
  source: z.object({
    repository: NonEmptyString,
    sourceRef: NonEmptyString,
    manifestSchemaVersion: NonEmptyString,
    sourceMode: z.literal("fixed-context"),
    targetExecution: z.literal("forbidden"),
    testedInternet: z.literal("disabled"),
  }).strict(),
  rubricProtocolVersion: NonEmptyString,
  caseOrder: z.array(NonEmptyString).min(1),
  units: z.array(z.object({
    id: NonEmptyString,
    caseId: NonEmptyString,
    arm: z.enum(["B", "D"]),
  }).strict()).min(1),
  armDifference: z.object({
    shared: NonEmptyString,
    B: NonEmptyString,
    D: NonEmptyString,
    diagnostics: NonEmptyString,
  }).strict(),
  resumePolicy: z.object({
    defaultAttemptId: NonEmptyString,
    terminalUnitsAreNotResent: z.literal(true),
    dispatchedWithoutResultIsCompletionUnknown: z.literal(true),
    retryRequiresNewAttemptAndReason: z.literal(true),
  }).strict(),
}).strict()

export type AuthorizationComparisonConfig = z.infer<typeof AuthorizationComparisonConfigSchema>

const ManifestSchema = z.object({
  schemaVersion: NonEmptyString,
  repository: z.object({
    url: NonEmptyString,
    sourceRef: NonEmptyString,
  }),
  cases: z.array(z.object({
    id: NonEmptyString,
    allowedInputFiles: z.array(NonEmptyString).min(1),
    originalPaths: z.array(NonEmptyString).default([]),
  })),
})

export interface AuthorizationRunnerDiagnostic {
  code: string
  message: string
  path?: string
}

export interface LoadedAuthorizationComparisonConfig {
  config: AuthorizationComparisonConfig
  configPath: string
  configSha256: string
}

export interface AuthorizationCheckedCase {
  caseId: string
  declaration: AuthorizationTaskV0
  sourceBundle: SourceBundle
  files: string[]
  previews: { B: string; D: string }
  diagnostics: AuthorizationRunnerDiagnostic[]
}

export interface AuthorizationCheckReport {
  schemaVersion: "authorization-comparison-check/v0"
  status: "valid" | "invalid"
  configSha256: string
  model: AuthorizationComparisonConfig["model"]
  cases: AuthorizationCheckedCase[]
  diagnostics: AuthorizationRunnerDiagnostic[]
}

export type AuthorizationRunnerEnv = Record<string, string | undefined>
export type AuthorizationProviderFactory = (modelId: string) => Promise<LLMProvider> | LLMProvider

class AuthorizationRunnerError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message)
    this.name = "AuthorizationRunnerError"
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function resolveRepositoryPath(repositoryRoot: string, relativePath: string): string {
  const resolvedRoot = path.resolve(repositoryRoot)
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"))
  const relation = path.relative(resolvedRoot, resolved)
  if (relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new AuthorizationRunnerError(`Configured path escapes the repository root: ${relativePath}`)
  }
  return resolved
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

export async function loadAuthorizationComparisonConfig(
  repositoryRoot: string,
  candidatePath: string,
): Promise<LoadedAuthorizationComparisonConfig> {
  const configPath = path.isAbsolute(candidatePath) ? candidatePath : path.resolve(repositoryRoot, candidatePath)
  const bytes = await readFile(configPath, "utf8")
  const parsed = AuthorizationComparisonConfigSchema.safeParse(JSON.parse(bytes))
  if (!parsed.success) {
    const details = parsed.error.issues.map(issue => `${issue.path.join(".") || "$"}: ${issue.message}`).join("; ")
    throw new AuthorizationRunnerError(`Invalid authorization comparison config: ${details}`)
  }
  return { config: parsed.data, configPath, configSha256: sha256(bytes) }
}

function originalLocationsByFile(
  allowedInputFiles: string[],
  originalPaths: string[],
): Record<string, string[]> {
  const sourceFiles = allowedInputFiles.filter(file => !file.endsWith("/task.json"))
  return Object.fromEntries(sourceFiles.map((file, index) => [
    file,
    originalPaths[index] === undefined ? [] : [originalPaths[index]!],
  ]))
}

function ruleLocations(rubric: AuthorizationCaseEvaluationRubric) {
  return [
    ...rubric.dispositionRule.sourceLocations,
    ...rubric.scopeRule.sourceLocations,
    ...rubric.criticalFacts.flatMap(fact => fact.sourceLocations),
  ]
}

function validateRubricAgainstBundle(
  rubric: AuthorizationCaseEvaluationRubric,
  task: AuthorizationTaskV0,
  sourceBundle: SourceBundle,
): AuthorizationRunnerDiagnostic[] {
  const diagnostics: AuthorizationRunnerDiagnostic[] = []
  if (rubric.caseId !== task.taskId || rubric.taskId !== task.taskId) {
    diagnostics.push({
      code: "rubric-task-mismatch",
      message: `Rubric case/task does not match declaration ${task.taskId}.`,
    })
  }
  const compiled = compileAuthorizationTask(task)
  if (![...compiled.runnableObligations, ...compiled.blockedObligations]
    .some(obligation => obligation.id === rubric.obligationId)) {
    diagnostics.push({
      code: "rubric-obligation-missing",
      message: `Rubric obligation is not compiled from the declaration: ${rubric.obligationId}.`,
    })
  }
  const factIds = new Set<string>()
  for (const fact of rubric.criticalFacts) {
    if (factIds.has(fact.id)) {
      diagnostics.push({ code: "duplicate-rubric-fact", message: `Rubric repeats critical fact ${fact.id}.` })
    }
    factIds.add(fact.id)
  }
  for (const location of ruleLocations(rubric)) {
    const file = sourceBundle.files.find(candidate => candidate.relativePath === location.path)
    if (!file || location.startLine < file.cropRange.startLine || location.endLine > file.cropRange.endLine) {
      diagnostics.push({
        code: "rubric-source-location-invalid",
        message: `Rubric source location is outside the exact bundle: ${location.path}:${location.startLine}-${location.endLine}.`,
      })
    }
  }
  return diagnostics
}

function validateDeclarationLocations(
  task: AuthorizationTaskV0,
  sourceBundle: SourceBundle,
): AuthorizationRunnerDiagnostic[] {
  const diagnostics: AuthorizationRunnerDiagnostic[] = []
  task.entries.forEach((entry, entryIndex) => {
    entry.locations.forEach((location, locationIndex) => {
      const file = sourceBundle.files.find(candidate => candidate.relativePath === location.path)
      if (!file
        || location.startLine < file.cropRange.startLine
        || location.endLine > file.cropRange.endLine) {
        diagnostics.push({
          code: "declaration-source-location-invalid",
          message: `Declaration location is outside the exact bundle: ${location.path}:${location.startLine}-${location.endLine}.`,
          path: `entries.${entryIndex}.locations.${locationIndex}`,
        })
      }
    })
  })
  return diagnostics
}

export async function checkAuthorizationComparison(input: {
  repositoryRoot: string
  configPath: string
  writeArtifacts: boolean
  onProviderCreation?: () => void
}): Promise<AuthorizationCheckReport> {
  const loaded = await loadAuthorizationComparisonConfig(input.repositoryRoot, input.configPath)
  const { config } = loaded
  const diagnostics: AuthorizationRunnerDiagnostic[] = []
  const manifestPath = resolveRepositoryPath(input.repositoryRoot, config.paths.manifest)
  const manifestParsed = ManifestSchema.safeParse(await readJson(manifestPath))
  if (!manifestParsed.success) {
    throw new AuthorizationRunnerError(`Invalid authorization case manifest: ${manifestParsed.error.message}`)
  }
  const manifest = manifestParsed.data
  if (manifest.schemaVersion !== config.source.manifestSchemaVersion) {
    diagnostics.push({
      code: "manifest-version-mismatch",
      message: `Manifest version ${manifest.schemaVersion} does not match ${config.source.manifestSchemaVersion}.`,
    })
  }
  if (manifest.repository.url !== config.source.repository || manifest.repository.sourceRef !== config.source.sourceRef) {
    diagnostics.push({
      code: "source-identity-mismatch",
      message: "Comparison config and case manifest repository/ref differ.",
    })
  }

  const rubricsParsed = AuthorizationEvaluationRubricsV0Schema.safeParse(
    await readJson(resolveRepositoryPath(input.repositoryRoot, config.paths.rubrics)),
  )
  if (!rubricsParsed.success) {
    throw new AuthorizationRunnerError(`Invalid authorization evaluation rubrics: ${rubricsParsed.error.message}`)
  }
  if (rubricsParsed.data.protocolVersion !== config.rubricProtocolVersion) {
    diagnostics.push({ code: "rubric-protocol-mismatch", message: "Rubric protocol version differs from comparison config." })
  }
  const manifestCases = new Map(manifest.cases.map(candidate => [candidate.id, candidate]))
  const rubricCases = new Map(rubricsParsed.data.cases.map(candidate => [candidate.caseId, candidate]))
  const cases: AuthorizationCheckedCase[] = []
  const caseRoot = resolveRepositoryPath(input.repositoryRoot, config.paths.caseRoot)
  const declarationsRoot = resolveRepositoryPath(input.repositoryRoot, config.paths.declarations)

  for (const caseId of config.caseOrder) {
    const caseDiagnostics: AuthorizationRunnerDiagnostic[] = []
    const manifestCase = manifestCases.get(caseId)
    const rubric = rubricCases.get(caseId)
    if (!manifestCase) {
      diagnostics.push({ code: "case-missing-from-manifest", message: `Case ${caseId} is absent from the manifest.` })
      continue
    }
    if (!rubric) {
      diagnostics.push({ code: "case-missing-rubric", message: `Case ${caseId} is absent from evaluator rubrics.` })
      continue
    }
    const parsedTask = parseAuthorizationTask(await readJson(path.join(declarationsRoot, `${caseId}.json`)))
    if (!parsedTask.success) {
      diagnostics.push(...parsedTask.diagnostics.map(item => ({
        code: "declaration-invalid",
        message: `${caseId}: ${item.message}`,
        path: item.path,
      })))
      continue
    }
    const loadedBundle = await loadExactSourceBundle({
      caseRoot,
      repository: manifest.repository.url,
      sourceRef: manifest.repository.sourceRef,
      allowedInputFiles: manifestCase.allowedInputFiles,
      originalLocationsByFile: originalLocationsByFile(manifestCase.allowedInputFiles, manifestCase.originalPaths),
    })
    if (!loadedBundle.success) {
      diagnostics.push(...loadedBundle.diagnostics.map(item => ({ code: item.code, message: item.message, path: item.path })))
      continue
    }
    const compiled = compileAuthorizationTask(parsedTask.task)
    caseDiagnostics.push(...compiled.diagnostics.map(item => ({ code: item.code, message: item.message, path: item.path })))
    caseDiagnostics.push(...validateDeclarationLocations(parsedTask.task, loadedBundle.bundle))
    caseDiagnostics.push(...validateRubricAgainstBundle(rubric, parsedTask.task, loadedBundle.bundle))
    const sourceContext = renderSourceBundle(loadedBundle.bundle)
    const previews = {
      B: renderAuthorizationTask(compiled, "B").prompt.replace("<SOURCE_CONTEXT_INSERTED_BY_HOST>", sourceContext),
      D: renderAuthorizationTask(compiled, "D").prompt.replace("<SOURCE_CONTEXT_INSERTED_BY_HOST>", sourceContext),
    }
    cases.push({
      caseId,
      declaration: parsedTask.task,
      sourceBundle: loadedBundle.bundle,
      files: loadedBundle.bundle.files.map(file => file.relativePath),
      previews,
      diagnostics: caseDiagnostics,
    })
    diagnostics.push(...caseDiagnostics.map(item => ({ ...item, path: item.path ?? caseId })))
  }

  const expectedUnits = config.caseOrder.flatMap(caseId => ["B", "D"].map(arm => `${caseId}:${arm}`))
  const actualUnits = config.units.map(unit => `${unit.caseId}:${unit.arm}`)
  for (const expected of expectedUnits) {
    if (actualUnits.filter(actual => actual === expected).length !== 1) {
      diagnostics.push({ code: "comparison-unit-mismatch", message: `Expected exactly one comparison unit ${expected}.` })
    }
  }
  if (config.units.some(unit => !config.caseOrder.includes(unit.caseId))) {
    diagnostics.push({ code: "foreign-comparison-unit", message: "Comparison units contain a case outside caseOrder." })
  }

  const report: AuthorizationCheckReport = {
    schemaVersion: "authorization-comparison-check/v0",
    status: diagnostics.length === 0 && cases.length === config.caseOrder.length ? "valid" : "invalid",
    configSha256: loaded.configSha256,
    model: config.model,
    cases,
    diagnostics,
  }
  if (input.writeArtifacts) {
    const developmentRoot = resolveRepositoryPath(input.repositoryRoot, config.paths.developmentRoot)
    const previewsRoot = path.join(developmentRoot, "previews")
    for (const candidate of cases) {
      await mkdir(previewsRoot, { recursive: true })
      await writeFile(path.join(previewsRoot, `${candidate.caseId}-B.md`), `${candidate.previews.B}\n`, "utf8")
      await writeFile(path.join(previewsRoot, `${candidate.caseId}-D.md`), `${candidate.previews.D}\n`, "utf8")
    }
    await writeJson(path.join(developmentRoot, "check.json"), {
      ...report,
      cases: report.cases.map(candidate => ({
        caseId: candidate.caseId,
        declaration: candidate.declaration,
        files: candidate.files,
        previewFiles: {
          B: `previews/${candidate.caseId}-B.md`,
          D: `previews/${candidate.caseId}-D.md`,
        },
        previewSha256: { B: sha256(candidate.previews.B), D: sha256(candidate.previews.D) },
        diagnostics: candidate.diagnostics,
      })),
    })
  }
  return report
}

export interface AuthorizationComparisonUnitStatus {
  id: string
  caseId: string
  arm: "B" | "D"
  status: "completed" | "failed-terminal" | "skipped-terminal" | "completion-unknown" | "pending"
  runStatus?: AuthorizationTaskRun["status"]
}

export interface AuthorizationComparisonRunReport {
  schemaVersion: "authorization-comparison-run-index/v0"
  status: "completed" | "completed-with-failures" | "provider-unavailable" | "input-invalid"
  runDir: string
  attempt: { id: string; reason: string }
  units: AuthorizationComparisonUnitStatus[]
  error?: { name: string; message: string }
}

async function defaultProviderFactory(modelId: string): Promise<LLMProvider> {
  const { createProviderForModel } = await import("../../providers/registry.ts")
  return createProviderForModel(modelId)
}

export async function executeAuthorizationComparison(input: {
  repositoryRoot: string
  configPath: string
  runDir: string
  attempt: { id: string; reason: string }
  providerFactory?: AuthorizationProviderFactory
  env?: AuthorizationRunnerEnv
}): Promise<AuthorizationComparisonRunReport> {
  const checked = await checkAuthorizationComparison({
    repositoryRoot: input.repositoryRoot,
    configPath: input.configPath,
    writeArtifacts: false,
  })
  const loaded = await loadAuthorizationComparisonConfig(input.repositoryRoot, input.configPath)
  const baseReport = {
    schemaVersion: "authorization-comparison-run-index/v0" as const,
    runDir: path.resolve(input.runDir),
    attempt: input.attempt,
  }
  if (checked.status !== "valid") {
    return { ...baseReport, status: "input-invalid", units: [] }
  }

  const units: AuthorizationComparisonUnitStatus[] = []
  const pendingUnits: AuthorizationComparisonConfig["units"] = []
  for (const unit of loaded.config.units) {
    const unitDirectory = path.join(baseReport.runDir, "units", unit.id)
    if (await pathExists(path.join(unitDirectory, "run.json"))) {
      units.push({ ...unit, status: "skipped-terminal" })
    } else if (await pathExists(path.join(unitDirectory, "dispatch.json"))) {
      units.push({ ...unit, status: "completion-unknown" })
    } else {
      pendingUnits.push(unit)
    }
  }
  if (pendingUnits.length === 0) {
    const status = units.every(unit => unit.status === "skipped-terminal") ? "completed" : "completed-with-failures"
    return { ...baseReport, status, units }
  }

  await mkdir(baseReport.runDir, { recursive: true })
  if (!await pathExists(path.join(baseReport.runDir, "run-metadata.json"))) {
    await writeJson(path.join(baseReport.runDir, "run-metadata.json"), {
      schemaVersion: "authorization-comparison-run-metadata/v0",
      studyId: loaded.config.studyId,
      configPath: path.relative(input.repositoryRoot, loaded.configPath).replace(/\\/g, "/"),
      configSha256: loaded.configSha256,
      implementationRevision: loaded.config.implementationRevision,
      attempt: input.attempt,
      model: loaded.config.model,
      source: loaded.config.source,
      rubricProtocolVersion: loaded.config.rubricProtocolVersion,
      unitOrder: loaded.config.units.map(unit => unit.id),
      recordedBeforeProviderCreation: true,
      createdAt: new Date().toISOString(),
    })
  }

  const env = input.env ?? process.env
  env.SKVM_AUTO_PROBE = "0"
  env.SKVM_CACHE = resolveRepositoryPath(input.repositoryRoot, loaded.config.model.cacheDir)
  let provider: LLMProvider
  try {
    provider = await (input.providerFactory ?? defaultProviderFactory)(loaded.config.model.modelId)
  } catch (error) {
    const serialized = {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    }
    await writeJson(path.join(baseReport.runDir, "provider-unavailable.json"), serialized)
    return {
      ...baseReport,
      status: "provider-unavailable",
      units: [...units, ...pendingUnits.map(unit => ({ ...unit, status: "pending" as const }))],
      error: serialized,
    }
  }

  const caseById = new Map(checked.cases.map(candidate => [candidate.caseId, candidate]))
  for (const unit of pendingUnits) {
    const candidate = caseById.get(unit.caseId)!
    const unitDirectory = path.join(baseReport.runDir, "units", unit.id)
    await mkdir(unitDirectory, { recursive: true })
    await writeJson(path.join(unitDirectory, "unit.json"), {
      schemaVersion: "authorization-comparison-unit/v0",
      ...unit,
      attempt: input.attempt,
      model: loaded.config.model,
      source: loaded.config.source,
      configSha256: loaded.configSha256,
    })
    await writeJson(path.join(unitDirectory, "declaration.json"), candidate.declaration)
    await writeJson(path.join(unitDirectory, "source-bundle.json"), candidate.sourceBundle)
    await writeFile(path.join(unitDirectory, "prompt.md"), `${candidate.previews[unit.arm]}\n`, "utf8")
    await writeJson(path.join(unitDirectory, "dispatch.json"), {
      schemaVersion: "authorization-comparison-dispatch/v0",
      status: "dispatched-completion-unknown-until-run-json",
      unitId: unit.id,
      startedAt: new Date().toISOString(),
      noAutomaticResend: true,
    })
    const run = await runAuthorizationTask({
      task: candidate.declaration,
      sourceBundle: candidate.sourceBundle,
      provider,
      arm: unit.arm,
      options: {
        timeoutMs: loaded.config.model.timeoutMs,
        maxTokens: loaded.config.model.maxTokens,
        maxDomainRepairs: loaded.config.model.maxDomainRepairs,
      },
    })
    await writeJson(path.join(unitDirectory, "run.json"), run)
    const completed = run.status === "completed" || run.status === "completed-with-diagnostics"
    units.push({ ...unit, status: completed ? "completed" : "failed-terminal", runStatus: run.status })
  }
  units.sort((left, right) => loaded.config.units.findIndex(unit => unit.id === left.id)
    - loaded.config.units.findIndex(unit => unit.id === right.id))
  const report: AuthorizationComparisonRunReport = {
    ...baseReport,
    status: units.every(unit => unit.status === "completed" || unit.status === "skipped-terminal")
      ? "completed"
      : "completed-with-failures",
    units,
  }
  await writeJson(path.join(baseReport.runDir, "index.json"), report)
  return report
}

export interface AuthorizationEvaluatedUnit {
  id: string
  caseId: string
  arm: "B" | "D"
  summary: AuthorizationRunEvaluationSummary
}

export interface AuthorizationOfflineEvaluationReport {
  schemaVersion: "authorization-offline-evaluation/v0"
  status: "completed" | "needs-review" | "incomplete"
  units: AuthorizationEvaluatedUnit[]
  pairs: AuthorizationPairSummary[]
  diagnostics: AuthorizationRunnerDiagnostic[]
}

export async function evaluateAuthorizationRunDirectory(input: {
  repositoryRoot: string
  configPath: string
  runDir: string
}): Promise<AuthorizationOfflineEvaluationReport> {
  const loaded = await loadAuthorizationComparisonConfig(input.repositoryRoot, input.configPath)
  const checked = await checkAuthorizationComparison({
    repositoryRoot: input.repositoryRoot,
    configPath: input.configPath,
    writeArtifacts: false,
  })
  const rubrics = AuthorizationEvaluationRubricsV0Schema.parse(
    await readJson(resolveRepositoryPath(input.repositoryRoot, loaded.config.paths.rubrics)),
  )
  const rubricByCase = new Map(rubrics.cases.map(rubric => [rubric.caseId, rubric]))
  const units: AuthorizationEvaluatedUnit[] = []
  const diagnostics: AuthorizationRunnerDiagnostic[] = []

  for (const unit of loaded.config.units) {
    const unitDirectory = path.join(path.resolve(input.runDir), "units", unit.id)
    const runPath = path.join(unitDirectory, "run.json")
    if (!await pathExists(runPath)) {
      diagnostics.push({ code: "run-artifact-missing", message: `No terminal run artifact for ${unit.id}.` })
      continue
    }
    const run = await readJson(runPath) as AuthorizationTaskRun
    const sourceBundle = await readJson(path.join(unitDirectory, "source-bundle.json")) as SourceBundle
    const rubric = rubricByCase.get(unit.caseId)
    if (!rubric) {
      diagnostics.push({ code: "rubric-missing", message: `No rubric for ${unit.caseId}.` })
      continue
    }
    let initialEvaluation
    if (run.initial) {
      const reviewPath = path.join(unitDirectory, "review.initial.json")
      if (!await pathExists(reviewPath)) {
        const template = createAuthorizationReviewTemplate(rubric, run.initial, "initial", "development-agent-unassigned")
        await writeJson(path.join(unitDirectory, "review.initial.template.json"), template)
        diagnostics.push({ code: "semantic-review-missing", message: `Initial review is missing for ${unit.id}.` })
      } else {
        initialEvaluation = evaluateAuthorizationGeneration({
          rubric,
          sourceBundle,
          artifact: run.initial,
          generation: "initial",
          review: await readJson(reviewPath),
        })
        await writeJson(path.join(unitDirectory, "evaluation.initial.json"), initialEvaluation)
      }
    }
    let repairEvaluation
    if (run.repair) {
      const reviewPath = path.join(unitDirectory, "review.repair.json")
      if (!await pathExists(reviewPath)) {
        const template = createAuthorizationReviewTemplate(rubric, run.repair, "repair", "development-agent-unassigned")
        await writeJson(path.join(unitDirectory, "review.repair.template.json"), template)
        diagnostics.push({ code: "semantic-review-missing", message: `Repair review is missing for ${unit.id}.` })
      } else {
        repairEvaluation = evaluateAuthorizationGeneration({
          rubric,
          sourceBundle,
          artifact: run.repair,
          generation: "repair",
          review: await readJson(reviewPath),
        })
        await writeJson(path.join(unitDirectory, "evaluation.repair.json"), repairEvaluation)
      }
    }
    if (!initialEvaluation && !repairEvaluation) continue
    const summary = summarizeAuthorizationRun(run, {
      ...(initialEvaluation ? { initial: initialEvaluation } : {}),
      ...(repairEvaluation ? { repair: repairEvaluation } : {}),
    })
    await writeJson(path.join(unitDirectory, "summary.json"), summary)
    units.push({ ...unit, summary })
  }

  const pairs: AuthorizationPairSummary[] = []
  for (const caseId of loaded.config.caseOrder) {
    const baseline = units.find(unit => unit.caseId === caseId && unit.arm === "B")
    const domain = units.find(unit => unit.caseId === caseId && unit.arm === "D")
    if (baseline && domain) pairs.push(summarizeAuthorizationPair(caseId, baseline.summary, domain.summary))
  }
  const status: AuthorizationOfflineEvaluationReport["status"] = diagnostics.some(item => item.code === "semantic-review-missing")
    ? "needs-review"
    : (units.length === loaded.config.units.length && pairs.length === loaded.config.caseOrder.length
      ? "completed"
      : "incomplete")
  const report: AuthorizationOfflineEvaluationReport = {
    schemaVersion: "authorization-offline-evaluation/v0",
    status,
    units,
    pairs,
    diagnostics,
  }
  await writeJson(path.join(path.resolve(input.runDir), "evaluation-summary.json"), report)
  if (checked.status !== "valid") {
    report.status = "incomplete"
    report.diagnostics.push({ code: "current-input-check-invalid", message: "Current declarations or inputs no longer pass check." })
  }
  return report
}

async function readDevelopmentStatus(repositoryRoot: string, configPath: string): Promise<unknown> {
  const loaded = await loadAuthorizationComparisonConfig(repositoryRoot, configPath)
  const developmentRoot = resolveRepositoryPath(repositoryRoot, loaded.config.paths.developmentRoot)
  const status = await readJson(path.join(developmentRoot, "status.json"))
  const runsRoot = resolveRepositoryPath(repositoryRoot, loaded.config.paths.runRoot)
  const attempts = await pathExists(runsRoot)
    ? (await readdir(runsRoot, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
    : []
  return { status, runAttempts: attempts }
}

function helpText(): string {
  return [
    "Authorization DSL development runner",
    "",
    "Commands:",
    "  check [--config=<path>]",
    "  run [--config=<path>] [--attempt=<id>] [--retry-reason=<text>] [--run-dir=<path>]",
    "  evaluate --run-dir=<path> [--config=<path>]",
    "  status [--config=<path>]",
    "",
    "Only run initializes the configured provider. check, evaluate, status, and --help are offline.",
  ].join("\n")
}

function parseCliOptions(args: string[], allowed: Set<string>): Record<string, string> {
  const options: Record<string, string> = {}
  for (const argument of args) {
    if (!argument.startsWith("--") || !argument.includes("=")) {
      throw new AuthorizationRunnerError(`Invalid argument ${argument}; expected --name=value.`)
    }
    const separator = argument.indexOf("=")
    const name = argument.slice(2, separator)
    const value = argument.slice(separator + 1)
    if (!allowed.has(name)) throw new AuthorizationRunnerError(`Unknown option --${name}.`)
    if (value.length === 0) throw new AuthorizationRunnerError(`Option --${name} requires a value.`)
    if (options[name] !== undefined) throw new AuthorizationRunnerError(`Option --${name} was provided more than once.`)
    options[name] = value
  }
  return options
}

export interface AuthorizationCliDependencies {
  repositoryRoot: string
  stdout: (value: string) => void
  stderr: (value: string) => void
  providerFactory?: AuthorizationProviderFactory
  env?: AuthorizationRunnerEnv
}

export async function runAuthorizationCli(
  argv: string[],
  dependencies: AuthorizationCliDependencies,
): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    dependencies.stdout(helpText())
    return 0
  }
  const command = argv[0]!
  const defaultConfig = path.join(
    dependencies.repositoryRoot,
    "results/skill-ir/skill-dsl-research/development/authorization-v0/comparison-config.json",
  )
  try {
    if (command === "check") {
      const options = parseCliOptions(argv.slice(1), new Set(["config"]))
      const report = await checkAuthorizationComparison({
        repositoryRoot: dependencies.repositoryRoot,
        configPath: options.config ?? defaultConfig,
        writeArtifacts: true,
      })
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "valid" ? 0 : 1
    }
    if (command === "run") {
      const options = parseCliOptions(argv.slice(1), new Set(["config", "attempt", "retry-reason", "run-dir"]))
      const configPath = options.config ?? defaultConfig
      const loaded = await loadAuthorizationComparisonConfig(dependencies.repositoryRoot, configPath)
      const attemptId = options.attempt ?? loaded.config.resumePolicy.defaultAttemptId
      if (attemptId !== loaded.config.resumePolicy.defaultAttemptId && !options["retry-reason"]) {
        throw new AuthorizationRunnerError("A non-initial attempt requires --retry-reason=<text>.")
      }
      const runDir = options["run-dir"] ?? path.join(
        resolveRepositoryPath(dependencies.repositoryRoot, loaded.config.paths.runRoot),
        attemptId,
      )
      const report = await executeAuthorizationComparison({
        repositoryRoot: dependencies.repositoryRoot,
        configPath,
        runDir,
        attempt: {
          id: attemptId,
          reason: options["retry-reason"] ?? "Predeclared initial comparison",
        },
        ...(dependencies.providerFactory ? { providerFactory: dependencies.providerFactory } : {}),
        ...(dependencies.env ? { env: dependencies.env } : {}),
      })
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "completed" ? 0 : 1
    }
    if (command === "evaluate") {
      const options = parseCliOptions(argv.slice(1), new Set(["config", "run-dir"]))
      if (!options["run-dir"]) throw new AuthorizationRunnerError("evaluate requires --run-dir=<path>.")
      const report = await evaluateAuthorizationRunDirectory({
        repositoryRoot: dependencies.repositoryRoot,
        configPath: options.config ?? defaultConfig,
        runDir: options["run-dir"],
      })
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "completed" ? 0 : 1
    }
    if (command === "status") {
      const options = parseCliOptions(argv.slice(1), new Set(["config"]))
      dependencies.stdout(JSON.stringify(await readDevelopmentStatus(
        dependencies.repositoryRoot,
        options.config ?? defaultConfig,
      ), null, 2))
      return 0
    }
    throw new AuthorizationRunnerError(`Unknown command ${command}. Use --help for check, run, evaluate, and status.`)
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error))
    return error instanceof AuthorizationRunnerError ? error.exitCode : 1
  }
}

if (import.meta.main) {
  const repositoryRoot = path.resolve(import.meta.dir, "../../..")
  const exitCode = await runAuthorizationCli(process.argv.slice(2), {
    repositoryRoot,
    stdout: value => console.log(value),
    stderr: value => console.error(value),
    env: process.env,
  })
  process.exitCode = exitCode
}
