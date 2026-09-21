import { createHash } from "node:crypto"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { TokenUsage } from "../../core/types.ts"
import {
  AuthorizationEvaluationRubricsV2Schema,
  createAuthorizationReviewTemplateV2,
  evaluateAuthorizationGenerationV2,
  SemanticReviewStatusSchema,
  type AuthorizationCaseEvaluationRubricV2,
  type AuthorizationGenerationEvaluationV2,
  type AuthorizationSemanticReviewV1,
} from "./evaluate.ts"
import type { AuthorizationGenerationArtifact, AuthorizationTaskRun } from "./host.ts"
import { loadPortableSourceBundle, type SourceBundle } from "./inputs.ts"
import {
  AuthorizationValueExperimentConfigSchema,
  summarizeAuthorizationStudyUnit,
  summarizeAuthorizationValueStudy,
  type AuthorizationStudyUnitSummary,
  type AuthorizationValueExperimentConfig,
  type AuthorizationValueStudyUnit,
} from "./value-study.ts"

const NonEmptyString = z.string().trim().min(1)

const ReviewDecisionSchema = z.object({
  status: SemanticReviewStatusSchema,
  reason: NonEmptyString,
  answerLocation: NonEmptyString.nullable(),
}).strict()

const ReviewDecisionOverrideFields = {
  status: SemanticReviewStatusSchema.optional(),
  reason: NonEmptyString.optional(),
  answerLocation: NonEmptyString.nullable().optional(),
}

const ReviewDecisionOverrideSchema = z.object(ReviewDecisionOverrideFields).strict()
  .refine(value => Object.keys(value).length > 0, "A review override must change at least one field.")

const CaseReviewPolicySchema = z.object({
  caseId: NonEmptyString,
  criterionReviews: z.array(ReviewDecisionSchema.extend({ criterionId: NonEmptyString }).strict()).min(1),
  dispositionReview: ReviewDecisionSchema,
  scopeReview: ReviewDecisionSchema,
}).strict()

const UnitReviewBindingSchema = z.object({
  unitId: NonEmptyString,
  caseId: NonEmptyString,
  generation: z.enum(["initial", "repair"]),
  criterionReviewOverrides: z.array(z.object({
    criterionId: NonEmptyString,
    ...ReviewDecisionOverrideFields,
  }).strict().refine(value => Object.keys(value).length > 1, "A criterion override must change at least one field."))
    .optional()
    .default([]),
  dispositionReviewOverride: ReviewDecisionOverrideSchema.optional(),
  scopeReviewOverride: ReviewDecisionOverrideSchema.optional(),
}).strict()

export const AuthorizationValueStudyReviewPlanSchema = z.object({
  schemaVersion: z.literal("authorization-value-study-review-plan/v1"),
  configSha256: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedAt: NonEmptyString,
  reviewer: z.object({
    kind: z.literal("development-agent"),
    identity: NonEmptyString,
  }).strict(),
  independentVerification: z.object({
    status: z.enum(["completed", "not-performed"]),
    identities: z.array(NonEmptyString),
    note: NonEmptyString,
    disagreements: z.array(z.object({
      anonymousUnitId: NonEmptyString,
      topic: NonEmptyString,
      developmentStatus: SemanticReviewStatusSchema,
      independentStatus: SemanticReviewStatusSchema,
      resolution: NonEmptyString,
    }).strict()),
  }).strict(),
  cases: z.array(CaseReviewPolicySchema).min(1),
  units: z.array(UnitReviewBindingSchema).min(1),
}).strict()

export type AuthorizationValueStudyReviewPlan = z.infer<typeof AuthorizationValueStudyReviewPlanSchema>

interface LoadedConfig {
  config: AuthorizationValueExperimentConfig
  configPath: string
  configSha256: string
}

interface StoredStudyUnitResult {
  schemaVersion: "authorization-value-study-unit-result/v1"
  configSha256: string
  implementationRevision: string
  unit: AuthorizationValueStudyUnit
  report?: {
    schemaVersion?: string
    taskId?: string
    arm?: string
    studyArm?: string
    model?: string
    sessionPath?: string
  }
  sessionRelativePath: string
}

interface LoadedUnit {
  unit: AuthorizationValueStudyUnit
  unitRoot: string
  sessionRoot: string
  run: AuthorizationTaskRun
  sourceBundle: SourceBundle
}

export interface AuthorizationValueStudyGroupSummary {
  units: number
  completed: number
  firstResponseAccepted: number
  firstValid: number
  repairUsed: number
  labelCorrect: number
  semanticDecisionCorrect: number
  semanticDecisionIncorrect: number
  taskDecisionCorrect: number
  taskDecisionIncorrect: number
  fullSuccess: number
  partial: number
  incorrect: number
  needsReview: number
  transportValid: number
  deliveryComplete: number
  scopeAccepted: number
  necessarySupported: number
  necessaryMissing: number
  necessaryContradicted: number
  necessaryUnknown: number
  explanationComplete: number
  explanationPartial: number
  explanationContradicted: number
  explanationUnknown: number
  explanationNotApplicable: number
  explanationCriterionGaps: number
  optionalComplete: number
  optionalPartial: number
  optionalContradicted: number
  optionalUnknown: number
  optionalNotApplicable: number
  unknownConclusions: number
  coverageValid: number
  coverageInvalid: number
  coverageMissing: number
  coverageNotApplicable: number
  coverageDeclared: number
  coverageAddressed: number
  coverageUnknown: number
  coverageNotApplicableRequirements: number
  coverageMissingRequirements: number
  conditionValid: number
  conditionInvalid: number
  conditionMissing: number
  conditionNotApplicable: number
  conditionDeclared: number
  conditionBounded: number
  conditionIncomplete: number
  conditionMissingAnalyses: number
  conditionBranches: number
  citations: number
  retainedStructuralIssues: number
  providerCalls: number
  schemaToolCalls: number
  promptParseCalls: number
  domainRepairCalls: number
  unknownElapsedCalls: number
  knownElapsedMsSubtotal: number
  knownTokens: TokenUsage
  unknownUsageCalls: number
  knownActualUsdSubtotal: number
  totalActualUsd: number | null
  unknownCostCalls: number
}

export interface AuthorizationValueStudyEvaluatedUnit {
  id: string
  caseId: string
  repository: string
  studyArm: "P" | "L" | "C"
  renderArm: "B"
  generation: "initial" | "repair"
  runStatus: AuthorizationTaskRun["status"]
  actualDisposition: AuthorizationGenerationEvaluationV2["actualDisposition"]
  expectedDisposition: AuthorizationGenerationEvaluationV2["expectedDisposition"]
  labelCorrect: boolean
  semanticDecisionCorrect: boolean | null
  taskDecisionCorrect: boolean | null
  qualityStatus: AuthorizationGenerationEvaluationV2["qualityStatus"]
  dimensions: AuthorizationGenerationEvaluationV2["dimensions"]
  scopeHonesty: AuthorizationGenerationEvaluationV2["scopeHonesty"]
  transportValid: boolean
  deliveryComplete: boolean
  reviewValidation: AuthorizationGenerationEvaluationV2["reviewValidation"]["status"]
  explanationCriterionGaps: number
  firstResponseAccepted: boolean
  firstValidCall: number | null
  repairUsed: boolean
  coverage: {
    status: "valid" | "invalid" | "missing" | "not-applicable"
    declared: number
    addressed: number
    unknown: number
    notApplicable: number
    missing: number
  }
  conditionAnalysis: {
    status: "valid" | "invalid" | "missing" | "not-applicable"
    declared: number
    bounded: number
    incomplete: number
    missing: number
    branches: number
  }
  citations: number
  retainedStructuralIssues: number
  operation: {
    providerCalls: number
    schemaToolCalls: number
    promptParseCalls: number
    domainRepairCalls: number
    unknownElapsedCalls: number
    knownElapsedMsSubtotal: number
    knownTokens: TokenUsage
    unknownUsageCalls: number
    knownActualUsdSubtotal: number
    totalActualUsd: number | null
    unknownCostCalls: number
  }
  evaluationPath: string
  reviewPath: string
}

export interface AuthorizationValueStudyCandidateScore {
  studyArm: "P" | "L" | "C"
  conclusionErrors: number
  necessaryGaps: number
  decisionsNotCorrect: number
  explanationGaps: number
  providerCalls: number
  knownTokensTotal: number
  authoringBurdenRank: 0 | 1 | 2
}

export interface AuthorizationValueStudySelection {
  selectedStudyArm: "L" | "C"
  basis:
    | "only-observed-candidate"
    | "higher-decision-or-necessary-quality"
    | "more-complete-condition-explanation"
    | "quality-tie-lower-runtime-cost"
    | "quality-tie-prefer-lower-runtime-and-authoring-burden"
  comparisonToPlain: "better" | "worse" | "no-observed-quality-difference"
  migrationUse: "bounded-comparison" | "diagnostic-only"
  scores: Record<"P" | "L" | "C", AuthorizationValueStudyCandidateScore>
}

export interface AuthorizationValueStudyEvaluationReport {
  schemaVersion: "authorization-value-study-evaluation/v1"
  status: "completed" | "incomplete" | "needs-review"
  modelCalls: 0
  targetExecutions: 0
  configSha256: string
  implementationRevision: string
  reviewerIdentities: string[]
  units: AuthorizationValueStudyEvaluatedUnit[]
  overall: AuthorizationValueStudyGroupSummary
  byProject: Record<string, AuthorizationValueStudyGroupSummary>
  byCase: Record<string, AuthorizationValueStudyGroupSummary>
  byArm: Record<"P" | "L" | "C", AuthorizationValueStudyGroupSummary>
  studySummary: ReturnType<typeof summarizeAuthorizationValueStudy>
  selection: AuthorizationValueStudySelection
  diagnostics: Array<{ code: string; message: string; unitId?: string }>
}

export interface AuthorizationValueStudyReviewMaterializationReport {
  schemaVersion: "authorization-value-study-review-materialization/v1"
  status: "completed"
  modelCalls: 0
  targetExecutions: 0
  configSha256: string
  reviewPlanSha256: string
  reviewer: AuthorizationValueStudyReviewPlan["reviewer"]
  reviewedAt: string
  independentVerification: AuthorizationValueStudyReviewPlan["independentVerification"]
  reviewCount: number
}

export interface AuthorizationValueStudyEvaluationReplayReport {
  schemaVersion: "authorization-value-study-evaluation-replay/v1"
  status: "reproduced" | "mismatch" | "missing-summary"
  modelCalls: 0
  targetExecutions: 0
  configSha256: string
  summaryMatches: boolean
  archivedSummarySha256: string | null
  replayedSummarySha256: string
}

class AuthorizationValueStudyEvaluationError extends Error {
  constructor(message: string, readonly exitCode = 2) {
    super(message)
    this.name = "AuthorizationValueStudyEvaluationError"
  }
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

function stableJson(value: unknown): string {
  const normalize = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(normalize)
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(Object.entries(candidate as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]))
    }
    return candidate
  }
  return JSON.stringify(normalize(value))
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

async function writeJsonOrVerify(candidate: string, value: unknown): Promise<void> {
  if (await pathExists(candidate)) {
    if (stableJson(await readJson(candidate)) !== stableJson(value)) {
      throw new AuthorizationValueStudyEvaluationError(`Existing review differs from the hash-bound materialization: ${candidate}`)
    }
    return
  }
  await mkdir(path.dirname(candidate), { recursive: true })
  await writeFile(candidate, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relation = path.relative(root, candidate)
  return relation === "" || (!relation.startsWith(`..${path.sep}`) && relation !== ".." && !path.isAbsolute(relation))
}

function resolveRepositoryPath(repositoryRoot: string, candidate: string): string {
  const resolved = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(repositoryRoot, candidate)
  if (!isWithinRoot(path.resolve(repositoryRoot), resolved)) {
    throw new AuthorizationValueStudyEvaluationError(`Configured evaluation path escapes the repository root: ${candidate}`)
  }
  return resolved
}

async function loadConfig(repositoryRoot: string, configPath: string): Promise<LoadedConfig> {
  const resolved = resolveRepositoryPath(repositoryRoot, configPath)
  const bytes = await readFile(resolved, "utf8")
  const parsed = AuthorizationValueExperimentConfigSchema.safeParse(JSON.parse(bytes))
  if (!parsed.success) {
    throw new AuthorizationValueStudyEvaluationError(
      `Invalid authorization value-study config: ${parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    )
  }
  return { config: parsed.data, configPath: resolved, configSha256: sha256(bytes) }
}

function unitRoot(runRoot: string, unitId: string): string {
  const unitsRoot = path.join(runRoot, "units")
  const resolved = path.resolve(unitsRoot, unitId)
  if (!isWithinRoot(unitsRoot, resolved)) {
    throw new AuthorizationValueStudyEvaluationError(`Unit ID escapes the evaluation run root: ${unitId}`)
  }
  return resolved
}

async function loadUnit(runRoot: string, unit: AuthorizationValueStudyUnit, loaded: LoadedConfig): Promise<LoadedUnit> {
  const root = unitRoot(runRoot, unit.id)
  const stored = await readJson(path.join(root, "unit-result.json")) as StoredStudyUnitResult
  if (stored.schemaVersion !== "authorization-value-study-unit-result/v1"
    || stored.configSha256 !== loaded.configSha256
    || stored.implementationRevision !== loaded.config.implementationRevision
    || stableJson(stored.unit) !== stableJson(unit)) {
    throw new AuthorizationValueStudyEvaluationError(`Unit result identity mismatch for ${unit.id}.`)
  }
  if (stored.report?.taskId !== unit.caseId
    || stored.report?.arm !== unit.renderArm
    || stored.report?.studyArm !== unit.studyArm
    || stored.report?.model !== loaded.config.model.modelId) {
    throw new AuthorizationValueStudyEvaluationError(`Stored report identity mismatch for ${unit.id}.`)
  }
  const sessionRoot = path.resolve(runRoot, ...stored.sessionRelativePath.split("/"))
  if (!isWithinRoot(root, sessionRoot)) {
    throw new AuthorizationValueStudyEvaluationError(`Session path escapes unit ${unit.id}.`)
  }
  const run = await readJson(path.join(sessionRoot, "run.json")) as AuthorizationTaskRun
  const sourceBundle = await readJson(path.join(sessionRoot, "source-bundle.json")) as SourceBundle
  if (run.arm !== "B" || run.compiled.task.taskId !== unit.caseId) {
    throw new AuthorizationValueStudyEvaluationError(`Session artifacts do not match unit ${unit.id}.`)
  }
  return { unit, unitRoot: root, sessionRoot, run, sourceBundle }
}

function duplicates(values: string[]): string[] {
  const counts = new Map<string, number>()
  values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts].filter(([, count]) => count > 1).map(([value]) => value)
}

function validateReviewPlan(input: {
  plan: AuthorizationValueStudyReviewPlan
  loaded: LoadedConfig
  rubrics: AuthorizationCaseEvaluationRubricV2[]
}): void {
  if (input.plan.configSha256 !== input.loaded.configSha256) {
    throw new AuthorizationValueStudyEvaluationError("Review plan config digest does not match the evaluated experiment.")
  }
  const duplicateCases = duplicates(input.plan.cases.map(candidate => candidate.caseId))
  const duplicateUnits = duplicates(input.plan.units.map(candidate => candidate.unitId))
  if (duplicateCases.length > 0 || duplicateUnits.length > 0) {
    throw new AuthorizationValueStudyEvaluationError(
      `Review plan contains duplicate identities: ${[...duplicateCases, ...duplicateUnits].join(", ")}`,
    )
  }
  const policyByCase = new Map(input.plan.cases.map(candidate => [candidate.caseId, candidate]))
  const rubricByCase = new Map(input.rubrics.map(candidate => [candidate.caseId, candidate]))
  const bindingByUnit = new Map(input.plan.units.map(candidate => [candidate.unitId, candidate]))
  for (const candidate of input.loaded.config.cases) {
    const rubric = rubricByCase.get(candidate.caseId)
    const policy = policyByCase.get(candidate.caseId)
    if (!rubric || !policy) {
      throw new AuthorizationValueStudyEvaluationError(`Review plan or v2 rubric is missing case ${candidate.caseId}.`)
    }
    const expectedCriteria = rubric.criteria.map(criterion => criterion.id).sort()
    const actualCriteria = policy.criterionReviews.map(criterion => criterion.criterionId).sort()
    if (stableJson(expectedCriteria) !== stableJson(actualCriteria) || duplicates(actualCriteria).length > 0) {
      throw new AuthorizationValueStudyEvaluationError(`Review policy criteria do not exactly match rubric ${candidate.caseId}.`)
    }
  }
  for (const unit of input.loaded.config.units) {
    const binding = bindingByUnit.get(unit.id)
    if (!binding || binding.caseId !== unit.caseId) {
      throw new AuthorizationValueStudyEvaluationError(`Review plan is missing an exact binding for unit ${unit.id}.`)
    }
    const rubric = rubricByCase.get(unit.caseId)!
    const expected = new Set(rubric.criteria.map(criterion => criterion.id))
    if (duplicates(binding.criterionReviewOverrides.map(item => item.criterionId)).length > 0
      || binding.criterionReviewOverrides.some(item => !expected.has(item.criterionId))) {
      throw new AuthorizationValueStudyEvaluationError(`Review overrides are invalid for unit ${unit.id}.`)
    }
  }
  if (input.plan.units.length !== input.loaded.config.units.length
    || input.plan.cases.length !== input.loaded.config.cases.length) {
    throw new AuthorizationValueStudyEvaluationError("Review plan must bind exactly the configured cases and units.")
  }
}

function mergeDecision(
  base: z.infer<typeof ReviewDecisionSchema>,
  override?: z.infer<typeof ReviewDecisionOverrideSchema>,
): z.infer<typeof ReviewDecisionSchema> {
  return { ...base, ...(override ?? {}) }
}

function buildReview(input: {
  plan: AuthorizationValueStudyReviewPlan
  policy: z.infer<typeof CaseReviewPolicySchema>
  binding: z.infer<typeof UnitReviewBindingSchema>
  rubric: AuthorizationCaseEvaluationRubricV2
  artifact: AuthorizationGenerationArtifact
}): AuthorizationSemanticReviewV1 {
  const template = createAuthorizationReviewTemplateV2(
    input.rubric,
    input.artifact,
    input.binding.generation,
    input.plan.reviewer.identity,
  )
  const policyByCriterion = new Map(input.policy.criterionReviews.map(item => [item.criterionId, item]))
  const overrideByCriterion = new Map(input.binding.criterionReviewOverrides.map(item => [item.criterionId, item]))
  template.criterionReviews = template.criterionReviews.map(criterion => ({
    ...criterion,
    ...mergeDecision(policyByCriterion.get(criterion.criterionId)!, overrideByCriterion.get(criterion.criterionId)),
  }))
  template.dispositionReview = {
    ...template.dispositionReview,
    ...mergeDecision(input.policy.dispositionReview, input.binding.dispositionReviewOverride),
  }
  template.scopeReview = {
    ...template.scopeReview,
    ...mergeDecision(input.policy.scopeReview, input.binding.scopeReviewOverride),
  }
  return template
}

function rubricSourcePaths(rubric: AuthorizationCaseEvaluationRubricV2): string[] {
  return [...new Set([
    ...rubric.dispositionRule.sourceLocations.map(location => location.path),
    ...rubric.scopeRule.sourceLocations.map(location => location.path),
    ...rubric.criteria.flatMap(criterion => criterion.sourceLocations.map(location => location.path)),
  ])].sort()
}

async function loadReviewSourceBundle(input: {
  repositoryRoot: string
  config: AuthorizationValueExperimentConfig
  unit: LoadedUnit
  rubric: AuthorizationCaseEvaluationRubricV2
}): Promise<SourceBundle | undefined> {
  const modelPaths = new Set(input.unit.sourceBundle.files.map(file => file.relativePath))
  const missingPaths = rubricSourcePaths(input.rubric).filter(candidate => !modelPaths.has(candidate))
  if (missingPaths.length === 0) return undefined
  const configuredCase = input.config.cases.find(candidate => candidate.caseId === input.unit.unit.caseId)
  if (!configuredCase) throw new AuthorizationValueStudyEvaluationError(`No configured source root exists for ${input.unit.unit.caseId}.`)
  const loaded = await loadPortableSourceBundle({
    sourceRoot: resolveRepositoryPath(input.repositoryRoot, configuredCase.sourceRoot),
    repository: input.unit.sourceBundle.repository,
    sourceRef: input.unit.sourceBundle.sourceRef,
    sourceFiles: missingPaths,
  })
  if (!loaded.success) {
    throw new AuthorizationValueStudyEvaluationError(
      `Evaluator source locations cannot be loaded for ${input.unit.unit.caseId}: ${loaded.diagnostics.map(item => `${item.code}: ${item.message}`).join("; ")}`,
    )
  }
  return loaded.bundle
}

export async function materializeAuthorizationValueStudyReviews(input: {
  repositoryRoot: string
  configPath: string
  runDir?: string
  reviewPlanPath: string
}): Promise<AuthorizationValueStudyReviewMaterializationReport> {
  const loaded = await loadConfig(input.repositoryRoot, input.configPath)
  const runRoot = input.runDir
    ? resolveRepositoryPath(input.repositoryRoot, input.runDir)
    : resolveRepositoryPath(input.repositoryRoot, loaded.config.paths.runRoot)
  const rubrics = AuthorizationEvaluationRubricsV2Schema.parse(
    await readJson(resolveRepositoryPath(input.repositoryRoot, loaded.config.paths.evaluatorRubrics)),
  )
  const reviewPlanPath = resolveRepositoryPath(input.repositoryRoot, input.reviewPlanPath)
  const reviewPlanBytes = await readFile(reviewPlanPath, "utf8")
  const plan = AuthorizationValueStudyReviewPlanSchema.parse(JSON.parse(reviewPlanBytes))
  validateReviewPlan({ plan, loaded, rubrics: rubrics.cases })
  const rubricByCase = new Map(rubrics.cases.map(candidate => [candidate.caseId, candidate]))
  const policyByCase = new Map(plan.cases.map(candidate => [candidate.caseId, candidate]))
  const bindingByUnit = new Map(plan.units.map(candidate => [candidate.unitId, candidate]))

  for (const unit of loaded.config.units) {
    const loadedUnit = await loadUnit(runRoot, unit, loaded)
    const binding = bindingByUnit.get(unit.id)!
    if (binding.generation !== loadedUnit.run.finalKind) {
      throw new AuthorizationValueStudyEvaluationError(
        `Review binding for ${unit.id} selects ${binding.generation}, but the retained final generation is ${loadedUnit.run.finalKind ?? "missing"}.`,
      )
    }
    const artifact = loadedUnit.run[binding.generation]
    if (!artifact) throw new AuthorizationValueStudyEvaluationError(`Unit ${unit.id} has no ${binding.generation} artifact to review.`)
    const rubric = rubricByCase.get(unit.caseId)!
    const review = buildReview({
      plan,
      policy: policyByCase.get(unit.caseId)!,
      binding,
      rubric,
      artifact,
    })
    const reviewSourceBundle = await loadReviewSourceBundle({
      repositoryRoot: input.repositoryRoot,
      config: loaded.config,
      unit: loadedUnit,
      rubric,
    })
    const checked = evaluateAuthorizationGenerationV2({
      rubric,
      sourceBundle: loadedUnit.sourceBundle,
      artifact,
      generation: binding.generation,
      review,
      ...(reviewSourceBundle ? { reviewSourceBundle } : {}),
    })
    if (checked.reviewValidation.status !== "valid") {
      throw new AuthorizationValueStudyEvaluationError(
        `Review plan produced an invalid hash/source/answer binding for ${unit.id}: ${checked.reviewValidation.diagnostics.map(item => item.code).join(", ")}`,
      )
    }
    await writeJsonOrVerify(path.join(loadedUnit.unitRoot, `review.${binding.generation}.json`), review)
  }

  const report: AuthorizationValueStudyReviewMaterializationReport = {
    schemaVersion: "authorization-value-study-review-materialization/v1",
    status: "completed",
    modelCalls: 0,
    targetExecutions: 0,
    configSha256: loaded.configSha256,
    reviewPlanSha256: sha256(reviewPlanBytes),
    reviewer: plan.reviewer,
    reviewedAt: plan.reviewedAt,
    independentVerification: plan.independentVerification,
    reviewCount: loaded.config.units.length,
  }
  await writeJsonOrVerify(path.join(runRoot, "value-review-materialization.json"), report)
  return report
}

function emptyTokens(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
}

function emptyGroup(): AuthorizationValueStudyGroupSummary {
  return {
    units: 0,
    completed: 0,
    firstResponseAccepted: 0,
    firstValid: 0,
    repairUsed: 0,
    labelCorrect: 0,
    semanticDecisionCorrect: 0,
    semanticDecisionIncorrect: 0,
    taskDecisionCorrect: 0,
    taskDecisionIncorrect: 0,
    fullSuccess: 0,
    partial: 0,
    incorrect: 0,
    needsReview: 0,
    transportValid: 0,
    deliveryComplete: 0,
    scopeAccepted: 0,
    necessarySupported: 0,
    necessaryMissing: 0,
    necessaryContradicted: 0,
    necessaryUnknown: 0,
    explanationComplete: 0,
    explanationPartial: 0,
    explanationContradicted: 0,
    explanationUnknown: 0,
    explanationNotApplicable: 0,
    explanationCriterionGaps: 0,
    optionalComplete: 0,
    optionalPartial: 0,
    optionalContradicted: 0,
    optionalUnknown: 0,
    optionalNotApplicable: 0,
    unknownConclusions: 0,
    coverageValid: 0,
    coverageInvalid: 0,
    coverageMissing: 0,
    coverageNotApplicable: 0,
    coverageDeclared: 0,
    coverageAddressed: 0,
    coverageUnknown: 0,
    coverageNotApplicableRequirements: 0,
    coverageMissingRequirements: 0,
    conditionValid: 0,
    conditionInvalid: 0,
    conditionMissing: 0,
    conditionNotApplicable: 0,
    conditionDeclared: 0,
    conditionBounded: 0,
    conditionIncomplete: 0,
    conditionMissingAnalyses: 0,
    conditionBranches: 0,
    citations: 0,
    retainedStructuralIssues: 0,
    providerCalls: 0,
    schemaToolCalls: 0,
    promptParseCalls: 0,
    domainRepairCalls: 0,
    unknownElapsedCalls: 0,
    knownElapsedMsSubtotal: 0,
    knownTokens: emptyTokens(),
    unknownUsageCalls: 0,
    knownActualUsdSubtotal: 0,
    totalActualUsd: 0,
    unknownCostCalls: 0,
  }
}

function incrementDimensions(group: AuthorizationValueStudyGroupSummary, unit: AuthorizationValueStudyEvaluatedUnit): void {
  const necessaryKey = unit.dimensions.necessarySemantics === "supported"
    ? "necessarySupported"
    : unit.dimensions.necessarySemantics === "missing"
      ? "necessaryMissing"
      : unit.dimensions.necessarySemantics === "contradicted"
        ? "necessaryContradicted"
        : "necessaryUnknown"
  group[necessaryKey] += 1
  const explanationKey = unit.dimensions.explanationCompleteness === "complete"
    ? "explanationComplete"
    : unit.dimensions.explanationCompleteness === "partial"
      ? "explanationPartial"
      : unit.dimensions.explanationCompleteness === "contradicted"
        ? "explanationContradicted"
        : unit.dimensions.explanationCompleteness === "unknown"
          ? "explanationUnknown"
          : "explanationNotApplicable"
  group[explanationKey] += 1
  const optionalKey = unit.dimensions.optionalDetails === "complete"
    ? "optionalComplete"
    : unit.dimensions.optionalDetails === "partial"
      ? "optionalPartial"
      : unit.dimensions.optionalDetails === "contradicted"
        ? "optionalContradicted"
        : unit.dimensions.optionalDetails === "unknown"
          ? "optionalUnknown"
          : "optionalNotApplicable"
  group[optionalKey] += 1
}

function addUnit(group: AuthorizationValueStudyGroupSummary, unit: AuthorizationValueStudyEvaluatedUnit): void {
  group.units += 1
  if (unit.runStatus === "completed") group.completed += 1
  if (unit.firstResponseAccepted) group.firstResponseAccepted += 1
  if (unit.firstValidCall !== null) group.firstValid += 1
  if (unit.repairUsed) group.repairUsed += 1
  if (unit.labelCorrect) group.labelCorrect += 1
  if (unit.semanticDecisionCorrect === true) group.semanticDecisionCorrect += 1
  if (unit.semanticDecisionCorrect === false) group.semanticDecisionIncorrect += 1
  if (unit.taskDecisionCorrect === true) group.taskDecisionCorrect += 1
  if (unit.taskDecisionCorrect === false) group.taskDecisionIncorrect += 1
  if (unit.qualityStatus === "full-success") group.fullSuccess += 1
  if (unit.qualityStatus === "partial") group.partial += 1
  if (unit.qualityStatus === "incorrect") group.incorrect += 1
  if (unit.qualityStatus === "needs-review") group.needsReview += 1
  if (unit.transportValid) group.transportValid += 1
  if (unit.deliveryComplete) group.deliveryComplete += 1
  if (unit.scopeHonesty === "accepted") group.scopeAccepted += 1
  if (unit.actualDisposition === "unknown") group.unknownConclusions += 1
  incrementDimensions(group, unit)
  group.explanationCriterionGaps += unit.explanationCriterionGaps
  if (unit.coverage.status === "valid") group.coverageValid += 1
  if (unit.coverage.status === "invalid") group.coverageInvalid += 1
  if (unit.coverage.status === "missing") group.coverageMissing += 1
  if (unit.coverage.status === "not-applicable") group.coverageNotApplicable += 1
  group.coverageDeclared += unit.coverage.declared
  group.coverageAddressed += unit.coverage.addressed
  group.coverageUnknown += unit.coverage.unknown
  group.coverageNotApplicableRequirements += unit.coverage.notApplicable
  group.coverageMissingRequirements += unit.coverage.missing
  if (unit.conditionAnalysis.status === "valid") group.conditionValid += 1
  if (unit.conditionAnalysis.status === "invalid") group.conditionInvalid += 1
  if (unit.conditionAnalysis.status === "missing") group.conditionMissing += 1
  if (unit.conditionAnalysis.status === "not-applicable") group.conditionNotApplicable += 1
  group.conditionDeclared += unit.conditionAnalysis.declared
  group.conditionBounded += unit.conditionAnalysis.bounded
  group.conditionIncomplete += unit.conditionAnalysis.incomplete
  group.conditionMissingAnalyses += unit.conditionAnalysis.missing
  group.conditionBranches += unit.conditionAnalysis.branches
  group.citations += unit.citations
  group.retainedStructuralIssues += unit.retainedStructuralIssues
  group.providerCalls += unit.operation.providerCalls
  group.schemaToolCalls += unit.operation.schemaToolCalls
  group.promptParseCalls += unit.operation.promptParseCalls
  group.domainRepairCalls += unit.operation.domainRepairCalls
  group.unknownElapsedCalls += unit.operation.unknownElapsedCalls
  group.knownElapsedMsSubtotal += unit.operation.knownElapsedMsSubtotal
  group.knownTokens.input += unit.operation.knownTokens.input
  group.knownTokens.output += unit.operation.knownTokens.output
  group.knownTokens.cacheRead += unit.operation.knownTokens.cacheRead
  group.knownTokens.cacheWrite += unit.operation.knownTokens.cacheWrite
  group.unknownUsageCalls += unit.operation.unknownUsageCalls
  group.knownActualUsdSubtotal += unit.operation.knownActualUsdSubtotal
  group.unknownCostCalls += unit.operation.unknownCostCalls
  group.totalActualUsd = group.unknownCostCalls === 0 ? group.knownActualUsdSubtotal : null
}

function summarizeGroup(units: AuthorizationValueStudyEvaluatedUnit[]): AuthorizationValueStudyGroupSummary {
  const summary = emptyGroup()
  units.forEach(unit => addUnit(summary, unit))
  return summary
}

function countCitations(artifact: AuthorizationGenerationArtifact): number {
  return artifact.result.results.reduce((total, result) => total + Object.values(result.facts)
    .flat()
    .reduce((sum, fact) => sum + fact.citations.length, 0), 0)
}

function operationFor(run: AuthorizationTaskRun) {
  const responses = run.attempts.filter(attempt => attempt.response !== undefined)
  return {
    providerCalls: run.attempts.length,
    schemaToolCalls: run.attempts.filter(attempt => attempt.transport === "schema-tool").length,
    promptParseCalls: run.attempts.filter(attempt => attempt.transport === "prompt-parse").length,
    domainRepairCalls: run.attempts.filter(attempt => attempt.phase === "domain-repair").length,
    unknownElapsedCalls: run.attempts.length - responses.length,
    knownElapsedMsSubtotal: responses.reduce((sum, attempt) => sum + attempt.response!.durationMs, 0),
    knownTokens: { ...run.telemetry.knownTokens },
    unknownUsageCalls: run.telemetry.unknownUsageCalls,
    knownActualUsdSubtotal: run.telemetry.knownActualUsdSubtotal,
    totalActualUsd: run.telemetry.totalActualUsd,
    unknownCostCalls: run.telemetry.unknownCostCalls,
  }
}

function summarizeCoverage(
  studyArm: AuthorizationValueStudyUnit["studyArm"],
  artifact: AuthorizationGenerationArtifact,
): AuthorizationValueStudyEvaluatedUnit["coverage"] {
  const coverage = artifact.coverageValidation
  if (!coverage) {
    return {
      status: studyArm === "P" ? "not-applicable" : "missing",
      declared: 0,
      addressed: 0,
      unknown: 0,
      notApplicable: 0,
      missing: 0,
    }
  }
  return {
    status: coverage.status,
    declared: coverage.declared,
    addressed: coverage.addressed,
    unknown: coverage.unknown,
    notApplicable: coverage.notApplicable,
    missing: coverage.missing.length,
  }
}

function summarizeConditionAnalysis(
  studyArm: AuthorizationValueStudyUnit["studyArm"],
  artifact: AuthorizationGenerationArtifact,
): AuthorizationValueStudyEvaluatedUnit["conditionAnalysis"] {
  if (studyArm !== "C") {
    return { status: "not-applicable", declared: 0, bounded: 0, incomplete: 0, missing: 0, branches: 0 }
  }
  const validation = artifact.conditionValidation
  if (!validation) return { status: "missing", declared: 0, bounded: 0, incomplete: 0, missing: 0, branches: 0 }
  return {
    status: validation.status,
    declared: validation.declared,
    bounded: validation.bounded,
    incomplete: validation.incomplete,
    missing: validation.missing.length,
    branches: artifact.conditionAnalysis?.analyses.reduce((total, analysis) => total + analysis.branches.length, 0) ?? 0,
  }
}

function scoreCandidate(
  studyArm: "P" | "L" | "C",
  group: AuthorizationValueStudyGroupSummary,
): AuthorizationValueStudyCandidateScore {
  return {
    studyArm,
    conclusionErrors: group.units - group.labelCorrect,
    necessaryGaps: group.units - group.necessarySupported,
    decisionsNotCorrect: group.units - group.semanticDecisionCorrect,
    explanationGaps: group.explanationCriterionGaps,
    providerCalls: group.providerCalls,
    knownTokensTotal: group.knownTokens.input + group.knownTokens.output + group.knownTokens.cacheRead + group.knownTokens.cacheWrite,
    authoringBurdenRank: studyArm === "P" ? 0 : studyArm === "L" ? 1 : 2,
  }
}

function compareTuple(left: number[], right: number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index]! - right[index]!
    if (difference !== 0) return difference
  }
  return 0
}

function primaryQuality(score: AuthorizationValueStudyCandidateScore): number[] {
  return [score.conclusionErrors, score.necessaryGaps, score.decisionsNotCorrect]
}

function completeQuality(score: AuthorizationValueStudyCandidateScore): number[] {
  return [...primaryQuality(score), score.explanationGaps]
}

export function selectAuthorizationValueStudyCandidate(
  byArm: Record<"P" | "L" | "C", AuthorizationValueStudyGroupSummary>,
): AuthorizationValueStudySelection {
  const scores = {
    P: scoreCandidate("P", byArm.P),
    L: scoreCandidate("L", byArm.L),
    C: scoreCandidate("C", byArm.C),
  }
  const hasLedgerCandidate = byArm.L.units > 0
  const hasConditionCandidate = byArm.C.units > 0
  if (!hasLedgerCandidate && !hasConditionCandidate) {
    throw new Error("Value-study candidate selection requires at least one observed L or C unit.")
  }
  const primaryComparison = compareTuple(primaryQuality(scores.L), primaryQuality(scores.C))
  const explanationComparison = scores.L.explanationGaps - scores.C.explanationGaps
  const runtimeComparison = compareTuple(
    [scores.L.providerCalls, scores.L.knownTokensTotal],
    [scores.C.providerCalls, scores.C.knownTokensTotal],
  )
  let selectedStudyArm: "L" | "C"
  let basis: AuthorizationValueStudySelection["basis"]
  if (hasLedgerCandidate !== hasConditionCandidate) {
    selectedStudyArm = hasLedgerCandidate ? "L" : "C"
    basis = "only-observed-candidate"
  } else if (primaryComparison !== 0) {
    selectedStudyArm = primaryComparison < 0 ? "L" : "C"
    basis = "higher-decision-or-necessary-quality"
  } else if (explanationComparison !== 0) {
    selectedStudyArm = explanationComparison < 0 ? "L" : "C"
    basis = "more-complete-condition-explanation"
  } else if (runtimeComparison !== 0) {
    selectedStudyArm = runtimeComparison < 0 ? "L" : "C"
    basis = "quality-tie-lower-runtime-cost"
  } else {
    selectedStudyArm = "L"
    basis = "quality-tie-prefer-lower-runtime-and-authoring-burden"
  }
  const comparison = compareTuple(completeQuality(scores[selectedStudyArm]), completeQuality(scores.P))
  const comparisonToPlain = comparison < 0
    ? "better" as const
    : comparison > 0
      ? "worse" as const
      : "no-observed-quality-difference" as const
  return {
    selectedStudyArm,
    basis,
    comparisonToPlain,
    migrationUse: comparisonToPlain === "worse" ? "diagnostic-only" : "bounded-comparison",
    scores,
  }
}

async function computeEvaluation(input: {
  repositoryRoot: string
  configPath: string
  runDir?: string
  writeArtifacts: boolean
}): Promise<AuthorizationValueStudyEvaluationReport> {
  const loaded = await loadConfig(input.repositoryRoot, input.configPath)
  const runRoot = input.runDir
    ? resolveRepositoryPath(input.repositoryRoot, input.runDir)
    : resolveRepositoryPath(input.repositoryRoot, loaded.config.paths.runRoot)
  const rubrics = AuthorizationEvaluationRubricsV2Schema.parse(
    await readJson(resolveRepositoryPath(input.repositoryRoot, loaded.config.paths.evaluatorRubrics)),
  )
  const rubricByCase = new Map(rubrics.cases.map(candidate => [candidate.caseId, candidate]))
  const units: AuthorizationValueStudyEvaluatedUnit[] = []
  const studyUnits: AuthorizationStudyUnitSummary[] = []
  const diagnostics: AuthorizationValueStudyEvaluationReport["diagnostics"] = []
  const reviewerIdentities = new Set<string>()

  for (const unit of loaded.config.units) {
    try {
      const loadedUnit = await loadUnit(runRoot, unit, loaded)
      const generation = loadedUnit.run.finalKind
      if (!generation) throw new AuthorizationValueStudyEvaluationError(`Unit ${unit.id} has no final generation.`)
      const artifact = loadedUnit.run[generation]
      if (!artifact) throw new AuthorizationValueStudyEvaluationError(`Unit ${unit.id} has no ${generation} artifact.`)
      const rubric = rubricByCase.get(unit.caseId)
      if (!rubric) throw new AuthorizationValueStudyEvaluationError(`No v2 rubric exists for ${unit.caseId}.`)
      const reviewPath = path.join(loadedUnit.unitRoot, `review.${generation}.json`)
      if (!await pathExists(reviewPath)) {
        diagnostics.push({ code: "semantic-review-missing", message: `No ${generation} review exists for ${unit.id}.`, unitId: unit.id })
        continue
      }
      const review = await readJson(reviewPath) as AuthorizationSemanticReviewV1
      reviewerIdentities.add(review.reviewer.identity)
      const reviewSourceBundle = await loadReviewSourceBundle({
        repositoryRoot: input.repositoryRoot,
        config: loaded.config,
        unit: loadedUnit,
        rubric,
      })
      const evaluation = evaluateAuthorizationGenerationV2({
        rubric,
        sourceBundle: loadedUnit.sourceBundle,
        artifact,
        generation,
        review,
        ...(reviewSourceBundle ? { reviewSourceBundle } : {}),
      })
      if (input.writeArtifacts) await writeJson(path.join(loadedUnit.unitRoot, `evaluation.${generation}.json`), evaluation)
      if (evaluation.reviewValidation.status !== "valid") {
        diagnostics.push({
          code: "semantic-review-invalid",
          message: evaluation.reviewValidation.diagnostics.map(item => item.code).join(", "),
          unitId: unit.id,
        })
      }
      const outputAttemptIndex = loadedUnit.run.attempts.findIndex(attempt => attempt.id === artifact.outputAttemptId)
      const studySummary = summarizeAuthorizationStudyUnit({
        unitId: unit.id,
        caseId: unit.caseId,
        studyArm: unit.studyArm,
        run: loadedUnit.run,
        ...(generation === "initial" ? { initialEvaluation: evaluation } : { repairEvaluation: evaluation }),
      })
      studyUnits.push(studySummary)
      units.push({
        id: unit.id,
        caseId: unit.caseId,
        repository: artifact.result.repository,
        studyArm: unit.studyArm,
        renderArm: unit.renderArm,
        generation,
        runStatus: loadedUnit.run.status,
        actualDisposition: evaluation.actualDisposition,
        expectedDisposition: evaluation.expectedDisposition,
        labelCorrect: evaluation.labelCorrect,
        semanticDecisionCorrect: evaluation.semanticDecisionCorrect,
        taskDecisionCorrect: evaluation.taskDecisionCorrect,
        qualityStatus: evaluation.qualityStatus,
        dimensions: evaluation.dimensions,
        scopeHonesty: evaluation.scopeHonesty,
        transportValid: evaluation.transportValid,
        deliveryComplete: evaluation.deliveryComplete,
        reviewValidation: evaluation.reviewValidation.status,
        explanationCriterionGaps: evaluation.criteria.filter(criterion =>
          criterion.layer === "explanation-completeness" && criterion.status !== "supported").length,
        firstResponseAccepted: outputAttemptIndex === 0,
        firstValidCall: outputAttemptIndex < 0 ? null : outputAttemptIndex + 1,
        repairUsed: generation === "repair",
        coverage: summarizeCoverage(unit.studyArm, artifact),
        conditionAnalysis: summarizeConditionAnalysis(unit.studyArm, artifact),
        citations: countCitations(artifact),
        retainedStructuralIssues: studySummary.structuralIssues.length,
        operation: operationFor(loadedUnit.run),
        evaluationPath: path.relative(runRoot, path.join(loadedUnit.unitRoot, `evaluation.${generation}.json`)).replace(/\\/g, "/"),
        reviewPath: path.relative(runRoot, reviewPath).replace(/\\/g, "/"),
      })
    } catch (error) {
      diagnostics.push({
        code: "unit-evaluation-failed",
        message: error instanceof Error ? error.message : String(error),
        unitId: unit.id,
      })
    }
  }

  const byProject = Object.fromEntries([...new Set(units.map(unit => unit.repository))]
    .sort()
    .map(repository => [repository, summarizeGroup(units.filter(unit => unit.repository === repository))]))
  const byCase = Object.fromEntries(loaded.config.cases.map(candidate => [
    candidate.caseId,
    summarizeGroup(units.filter(unit => unit.caseId === candidate.caseId)),
  ]))
  const byArm: AuthorizationValueStudyEvaluationReport["byArm"] = {
    P: summarizeGroup(units.filter(unit => unit.studyArm === "P")),
    L: summarizeGroup(units.filter(unit => unit.studyArm === "L")),
    C: summarizeGroup(units.filter(unit => unit.studyArm === "C")),
  }
  const invalidReview = diagnostics.some(item => item.code === "semantic-review-missing" || item.code === "semantic-review-invalid")
  return {
    schemaVersion: "authorization-value-study-evaluation/v1",
    status: invalidReview ? "needs-review" : units.length === loaded.config.units.length ? "completed" : "incomplete",
    modelCalls: 0,
    targetExecutions: 0,
    configSha256: loaded.configSha256,
    implementationRevision: loaded.config.implementationRevision,
    reviewerIdentities: [...reviewerIdentities].sort(),
    units,
    overall: summarizeGroup(units),
    byProject,
    byCase,
    byArm,
    studySummary: summarizeAuthorizationValueStudy(studyUnits),
    selection: selectAuthorizationValueStudyCandidate(byArm),
    diagnostics,
  }
}

export async function evaluateAuthorizationValueStudyRunDirectory(input: {
  repositoryRoot: string
  configPath: string
  runDir?: string
}): Promise<AuthorizationValueStudyEvaluationReport> {
  const loaded = await loadConfig(input.repositoryRoot, input.configPath)
  const runRoot = input.runDir
    ? resolveRepositoryPath(input.repositoryRoot, input.runDir)
    : resolveRepositoryPath(input.repositoryRoot, loaded.config.paths.runRoot)
  const report = await computeEvaluation({ ...input, writeArtifacts: true })
  await writeJson(path.join(runRoot, "value-evaluation-summary-v1.json"), report)
  return report
}

export async function replayAuthorizationValueStudyEvaluation(input: {
  repositoryRoot: string
  configPath: string
  runDir?: string
  outputPath?: string
}): Promise<AuthorizationValueStudyEvaluationReplayReport> {
  const loaded = await loadConfig(input.repositoryRoot, input.configPath)
  const runRoot = input.runDir
    ? resolveRepositoryPath(input.repositoryRoot, input.runDir)
    : resolveRepositoryPath(input.repositoryRoot, loaded.config.paths.runRoot)
  const replayed = await computeEvaluation({ ...input, writeArtifacts: false })
  const replayedStable = stableJson(replayed)
  const summaryPath = path.join(runRoot, "value-evaluation-summary-v1.json")
  const archived = await pathExists(summaryPath) ? await readJson(summaryPath) : undefined
  const summaryMatches = archived !== undefined && stableJson(archived) === replayedStable
  const report: AuthorizationValueStudyEvaluationReplayReport = {
    schemaVersion: "authorization-value-study-evaluation-replay/v1",
    status: archived === undefined ? "missing-summary" : summaryMatches ? "reproduced" : "mismatch",
    modelCalls: 0,
    targetExecutions: 0,
    configSha256: loaded.configSha256,
    summaryMatches,
    archivedSummarySha256: archived === undefined ? null : sha256(stableJson(archived)),
    replayedSummarySha256: sha256(replayedStable),
  }
  if (input.outputPath) await writeJson(resolveRepositoryPath(input.repositoryRoot, input.outputPath), report)
  return report
}

function parseOptions(args: string[], allowed: Set<string>): Record<string, string> {
  const options: Record<string, string> = {}
  for (const argument of args) {
    if (!argument.startsWith("--") || !argument.includes("=")) {
      throw new AuthorizationValueStudyEvaluationError(`Invalid argument ${argument}; expected --name=value.`)
    }
    const separator = argument.indexOf("=")
    const name = argument.slice(2, separator)
    const value = argument.slice(separator + 1)
    if (!allowed.has(name)) throw new AuthorizationValueStudyEvaluationError(`Unknown option --${name}.`)
    if (!value) throw new AuthorizationValueStudyEvaluationError(`Option --${name} requires a value.`)
    if (options[name] !== undefined) throw new AuthorizationValueStudyEvaluationError(`Option --${name} was provided twice.`)
    options[name] = value
  }
  return options
}

function required(options: Record<string, string>, name: string, command: string): string {
  const value = options[name]
  if (!value) throw new AuthorizationValueStudyEvaluationError(`${command} requires --${name}=<path>.`)
  return value
}

function helpText(): string {
  return [
    "Authorization P/L/C value-study offline evaluator",
    "",
    "Commands:",
    "  review --config=<experiment.json> --plan=<review-plan.json> [--run-dir=<path>]",
    "  evaluate --config=<experiment.json> [--run-dir=<path>]",
    "  replay --config=<experiment.json> [--run-dir=<path>] [--output=<path>]",
    "",
    "All commands are offline and initialize no provider. Reviews must name the retained final generation explicitly.",
  ].join("\n")
}

export async function runAuthorizationValueStudyEvaluationCli(
  argv: string[],
  dependencies: { stdout: (value: string) => void; stderr: (value: string) => void; repositoryRoot?: string },
): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    dependencies.stdout(helpText())
    return 0
  }
  const command = argv[0]!
  const repositoryRoot = dependencies.repositoryRoot ?? path.resolve(import.meta.dir, "../../..")
  try {
    const options = parseOptions(argv.slice(1), new Set(["config", "plan", "run-dir", "output"]))
    const common = {
      repositoryRoot,
      configPath: required(options, "config", command),
      ...(options["run-dir"] ? { runDir: options["run-dir"] } : {}),
    }
    if (command === "review") {
      const report = await materializeAuthorizationValueStudyReviews({
        ...common,
        reviewPlanPath: required(options, "plan", command),
      })
      dependencies.stdout(JSON.stringify(report, null, 2))
      return 0
    }
    if (command === "evaluate") {
      const report = await evaluateAuthorizationValueStudyRunDirectory(common)
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "completed" ? 0 : 1
    }
    if (command === "replay") {
      const report = await replayAuthorizationValueStudyEvaluation({
        ...common,
        ...(options.output ? { outputPath: options.output } : {}),
      })
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "reproduced" ? 0 : 1
    }
    throw new AuthorizationValueStudyEvaluationError(`Unknown command ${command}; use review, evaluate, or replay.`)
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error))
    return error instanceof AuthorizationValueStudyEvaluationError ? error.exitCode : 1
  }
}

if (import.meta.main) {
  const exitCode = await runAuthorizationValueStudyEvaluationCli(process.argv.slice(2), {
    stdout: value => console.log(value),
    stderr: value => console.error(value),
  })
  process.exitCode = exitCode
}
