import { createHash } from "node:crypto"
import { z } from "zod"
import type { TokenUsage } from "../../core/types.ts"
import type { AuthorizationResultV0 } from "../../task-dsl/authorization/schema.ts"
import type { AuthorizationGenerationArtifact, AuthorizationTaskRun } from "./host.ts"
import type { SourceBundle } from "./inputs.ts"

const NonEmptyString = z.string().trim().min(1)

const EvaluationSourceLocationSchema = z.object({
  path: NonEmptyString,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
}).strict().superRefine((location, context) => {
  if (location.endLine < location.startLine) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "endLine must be greater than or equal to startLine",
      path: ["endLine"],
    })
  }
})

const EvaluationRuleSchema = z.object({
  oracleRule: NonEmptyString,
  sourceLocations: z.array(EvaluationSourceLocationSchema).min(1),
}).strict()

const AuthorizationCriticalFactSchema = EvaluationRuleSchema.extend({
  id: NonEmptyString,
  requirement: NonEmptyString,
}).strict()

export const AuthorizationCaseEvaluationRubricSchema = z.object({
  caseId: NonEmptyString,
  taskId: NonEmptyString,
  rubricVersion: NonEmptyString,
  obligationId: NonEmptyString,
  expectedDisposition: z.enum(["source_supported_failure", "source_refuted", "unknown"]),
  dispositionRule: EvaluationRuleSchema,
  scopeRule: EvaluationRuleSchema,
  criticalFacts: z.array(AuthorizationCriticalFactSchema).min(1),
}).strict()

export const AuthorizationEvaluationRubricsV0Schema = z.object({
  schemaVersion: z.literal("authorization-evaluation-rubrics/v0"),
  protocolVersion: NonEmptyString,
  cases: z.array(AuthorizationCaseEvaluationRubricSchema).min(1),
}).strict()

export type AuthorizationCaseEvaluationRubric = z.infer<typeof AuthorizationCaseEvaluationRubricSchema>
export type AuthorizationEvaluationSourceLocation = z.infer<typeof EvaluationSourceLocationSchema>

export const AuthorizationEvaluationCriterionLayerSchema = z.enum([
  "necessary-semantics",
  "explanation-completeness",
  "optional-detail",
])
export type AuthorizationEvaluationCriterionLayer = z.infer<typeof AuthorizationEvaluationCriterionLayerSchema>

const AuthorizationEvaluationCriterionV2Schema = EvaluationRuleSchema.extend({
  id: NonEmptyString,
  layer: AuthorizationEvaluationCriterionLayerSchema,
  requirement: NonEmptyString,
  decisionRelevance: NonEmptyString,
}).strict()

export const AuthorizationCaseEvaluationRubricV2Schema = z.object({
  caseId: NonEmptyString,
  taskId: NonEmptyString,
  rubricVersion: NonEmptyString,
  obligationId: NonEmptyString,
  expectedDisposition: z.enum(["source_supported_failure", "source_refuted", "unknown"]),
  dispositionRule: EvaluationRuleSchema,
  scopeRule: EvaluationRuleSchema,
  criteria: z.array(AuthorizationEvaluationCriterionV2Schema).min(1),
}).strict().superRefine((rubric, context) => {
  const seen = new Set<string>()
  rubric.criteria.forEach((criterion, index) => {
    if (seen.has(criterion.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate evaluation criterion ID: ${criterion.id}`,
        path: ["criteria", index, "id"],
      })
    }
    seen.add(criterion.id)
  })
  if (!rubric.criteria.some(criterion => criterion.layer === "necessary-semantics")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A v2 rubric requires at least one necessary-semantics criterion.",
      path: ["criteria"],
    })
  }
})

export const AuthorizationEvaluationRubricsV2Schema = z.object({
  schemaVersion: z.literal("authorization-evaluation-rubrics/v2"),
  protocolVersion: NonEmptyString,
  provenance: z.object({
    preparedBy: NonEmptyString,
    preparedAt: NonEmptyString,
    publicInputs: z.array(NonEmptyString).min(1),
    evaluatorOnlyInputs: z.array(NonEmptyString).min(1),
    historicalArtifactsModified: z.literal(false),
    exposureStatus: NonEmptyString,
  }).strict(),
  calibration: z.object({
    publicRequirements: z.array(NonEmptyString).min(1),
    rules: z.array(NonEmptyString).min(1),
    cases: z.array(z.object({
      id: NonEmptyString,
      expectedQuality: z.enum(["full-success", "partial", "incorrect", "needs-review"]),
      rationale: NonEmptyString,
    }).strict()).min(1),
  }).strict(),
  cases: z.array(AuthorizationCaseEvaluationRubricV2Schema).min(1),
}).strict()

export type AuthorizationCaseEvaluationRubricV2 = z.infer<typeof AuthorizationCaseEvaluationRubricV2Schema>

export const SemanticReviewStatusSchema = z.enum(["supported", "contradicted", "missing", "uncertain"])
export type SemanticReviewStatus = z.infer<typeof SemanticReviewStatusSchema>

const SemanticAssessmentSchema = z.object({
  status: SemanticReviewStatusSchema,
  reason: NonEmptyString,
  answerLocation: NonEmptyString.nullable(),
  sourceLocations: z.array(EvaluationSourceLocationSchema).min(1),
  oracleRule: NonEmptyString,
}).strict()

const FactReviewSchema = SemanticAssessmentSchema.extend({
  factId: NonEmptyString,
}).strict()

export const AuthorizationSemanticReviewV0Schema = z.object({
  schemaVersion: z.literal("authorization-semantic-review/v0"),
  caseId: NonEmptyString,
  taskId: NonEmptyString,
  generation: z.enum(["initial", "repair"]),
  attemptId: NonEmptyString,
  rawOutputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rubricVersion: NonEmptyString,
  reviewer: z.object({
    kind: z.literal("development-agent"),
    identity: NonEmptyString,
  }).strict(),
  factReviews: z.array(FactReviewSchema),
  dispositionReview: SemanticAssessmentSchema,
  scopeReview: SemanticAssessmentSchema,
}).strict()

export type AuthorizationSemanticReviewV0 = z.infer<typeof AuthorizationSemanticReviewV0Schema>

const CriterionReviewV1Schema = SemanticAssessmentSchema.extend({
  criterionId: NonEmptyString,
}).strict()

export const AuthorizationSemanticReviewV1Schema = z.object({
  schemaVersion: z.literal("authorization-semantic-review/v1"),
  caseId: NonEmptyString,
  taskId: NonEmptyString,
  generation: z.enum(["initial", "repair"]),
  attemptId: NonEmptyString,
  rawOutputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  rubricVersion: NonEmptyString,
  reviewer: z.object({
    kind: z.literal("development-agent"),
    identity: NonEmptyString,
  }).strict(),
  criterionReviews: z.array(CriterionReviewV1Schema),
  dispositionReview: SemanticAssessmentSchema,
  scopeReview: SemanticAssessmentSchema,
}).strict()

export type AuthorizationSemanticReviewV1 = z.infer<typeof AuthorizationSemanticReviewV1Schema>

export interface AuthorizationEvaluationDiagnostic {
  code: string
  message: string
  path: string
}

export interface AuthorizationReviewValidation {
  status: "valid" | "invalid"
  diagnostics: AuthorizationEvaluationDiagnostic[]
  review?: AuthorizationSemanticReviewV0
}

export interface AuthorizationReviewValidationV2 {
  status: "valid" | "invalid"
  diagnostics: AuthorizationEvaluationDiagnostic[]
  review?: AuthorizationSemanticReviewV1
}

export type AuthorizationErrorClass =
  | "falsePositive"
  | "falseNegative"
  | "unsupportedDeploymentInference"
  | "unsupportedCompleteness"
  | "evidenceDecoration"
  | "excessiveAbstention"

export interface AuthorizationCriticalFactEvaluation {
  id: string
  requirement: string
  status: SemanticReviewStatus | "unreviewed"
  reason?: string
  answerLocation?: string | null
  sourceLocations: AuthorizationEvaluationSourceLocation[]
  oracleRule: string
}

export interface AuthorizationGenerationEvaluation {
  evaluationVersion: "authorization-evaluation/v1"
  legacyDecisionVersion: "authorization-evaluation/v0"
  caseId: string
  taskId: string
  generation: "initial" | "repair"
  attemptId: string
  rawOutputSha256: string
  expectedDisposition: AuthorizationCaseEvaluationRubric["expectedDisposition"]
  actualDisposition: AuthorizationResultV0["results"][number]["conclusion"] | null
  labelCorrect: boolean
  reviewValidation: AuthorizationReviewValidation
  criticalFacts: AuthorizationCriticalFactEvaluation[]
  scopeHonesty: "accepted" | "rejected" | "needs-review"
  semanticDecisionCorrect: boolean | null
  evidenceSemanticSupport: "supported" | "contradicted" | "missing" | "unknown"
  transportValid: boolean
  deliveryComplete: boolean
  taskDecisionCorrect: boolean | null
  qualityStatus: "full-success" | "partial" | "incorrect" | "needs-review"
  errorClasses: AuthorizationErrorClass[]
  deterministicDiagnostics: string[]
}

export interface AuthorizationCriterionEvaluationV2 {
  id: string
  layer: AuthorizationEvaluationCriterionLayer
  requirement: string
  decisionRelevance: string
  status: SemanticReviewStatus | "unreviewed"
  reason?: string
  answerLocation?: string | null
  sourceLocations: AuthorizationEvaluationSourceLocation[]
  oracleRule: string
}

export interface AuthorizationGenerationEvaluationV2 {
  evaluationVersion: "authorization-evaluation/v2"
  caseId: string
  taskId: string
  generation: "initial" | "repair"
  attemptId: string
  rawOutputSha256: string
  expectedDisposition: AuthorizationCaseEvaluationRubricV2["expectedDisposition"]
  actualDisposition: AuthorizationResultV0["results"][number]["conclusion"] | null
  labelCorrect: boolean
  reviewValidation: AuthorizationReviewValidationV2
  criteria: AuthorizationCriterionEvaluationV2[]
  dimensions: {
    necessarySemantics: "supported" | "missing" | "contradicted" | "unknown"
    explanationCompleteness: "complete" | "partial" | "contradicted" | "unknown" | "not-applicable"
    optionalDetails: "complete" | "partial" | "contradicted" | "unknown" | "not-applicable"
  }
  scopeHonesty: "accepted" | "rejected" | "needs-review"
  semanticDecisionCorrect: boolean | null
  evidenceSemanticSupport: "supported" | "contradicted" | "missing" | "unknown"
  transportValid: boolean
  deliveryComplete: boolean
  taskDecisionCorrect: boolean | null
  qualityStatus: "full-success" | "partial" | "incorrect" | "needs-review"
  errorClasses: AuthorizationErrorClass[]
  deterministicDiagnostics: string[]
}

function diagnostic(code: string, message: string, path: string): AuthorizationEvaluationDiagnostic {
  return { code, message, path }
}

export function hashAuthorizationRawOutput(rawOutput: string): string {
  return createHash("sha256").update(rawOutput, "utf8").digest("hex")
}

export function createAuthorizationReviewTemplate(
  rubric: AuthorizationCaseEvaluationRubric,
  artifact: AuthorizationGenerationArtifact,
  generation: "initial" | "repair",
  reviewerIdentity: string,
): AuthorizationSemanticReviewV0 {
  const pendingReason = "Development-agent semantic review is required against the bound answer, fixed source, and evaluator rubric."
  const assessment = (rule: z.infer<typeof EvaluationRuleSchema>) => ({
    status: "uncertain" as const,
    reason: pendingReason,
    answerLocation: null,
    sourceLocations: rule.sourceLocations.map(location => ({ ...location })),
    oracleRule: rule.oracleRule,
  })
  return {
    schemaVersion: "authorization-semantic-review/v0",
    caseId: rubric.caseId,
    taskId: rubric.taskId,
    generation,
    attemptId: artifact.outputAttemptId,
    rawOutputSha256: hashAuthorizationRawOutput(artifact.rawResponse),
    rubricVersion: rubric.rubricVersion,
    reviewer: { kind: "development-agent", identity: reviewerIdentity },
    factReviews: rubric.criticalFacts.map(fact => ({
      factId: fact.id,
      ...assessment(fact),
    })),
    dispositionReview: assessment(rubric.dispositionRule),
    scopeReview: assessment(rubric.scopeRule),
  }
}

export function createAuthorizationReviewTemplateV2(
  rubric: AuthorizationCaseEvaluationRubricV2,
  artifact: AuthorizationGenerationArtifact,
  generation: "initial" | "repair",
  reviewerIdentity: string,
): AuthorizationSemanticReviewV1 {
  const pendingReason = "Development-agent semantic review is required against the bound answer, fixed source, and evaluator-only v2 rubric."
  const assessment = (rule: z.infer<typeof EvaluationRuleSchema>) => ({
    status: "uncertain" as const,
    reason: pendingReason,
    answerLocation: null,
    sourceLocations: rule.sourceLocations.map(location => ({ ...location })),
    oracleRule: rule.oracleRule,
  })
  return {
    schemaVersion: "authorization-semantic-review/v1",
    caseId: rubric.caseId,
    taskId: rubric.taskId,
    generation,
    attemptId: artifact.outputAttemptId,
    rawOutputSha256: hashAuthorizationRawOutput(artifact.rawResponse),
    rubricVersion: rubric.rubricVersion,
    reviewer: { kind: "development-agent", identity: reviewerIdentity },
    criterionReviews: rubric.criteria.map(criterion => ({
      criterionId: criterion.id,
      ...assessment(criterion),
    })),
    dispositionReview: assessment(rubric.dispositionRule),
    scopeReview: assessment(rubric.scopeRule),
  }
}

function sourceLocationKey(location: AuthorizationEvaluationSourceLocation): string {
  return `${location.path}:${location.startLine}-${location.endLine}`
}

function sameSourceLocations(
  left: AuthorizationEvaluationSourceLocation[],
  right: AuthorizationEvaluationSourceLocation[],
): boolean {
  const leftKeys = left.map(sourceLocationKey).sort()
  const rightKeys = right.map(sourceLocationKey).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index])
}

function sourceLocationExists(location: AuthorizationEvaluationSourceLocation, sourceBundles: SourceBundle[]): boolean {
  return sourceBundles.some(sourceBundle => {
    const file = sourceBundle.files.find(candidate => candidate.relativePath === location.path)
    return Boolean(file
      && location.startLine >= file.cropRange.startLine
      && location.endLine <= file.cropRange.endLine
      && location.endLine >= location.startLine)
  })
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~")
}

function jsonPointerResolves(value: unknown, pointer: string): boolean {
  if (pointer === "") return true
  if (!pointer.startsWith("/")) return false
  let current: unknown = value
  for (const encodedSegment of pointer.slice(1).split("/")) {
    const segment = decodeJsonPointerSegment(encodedSegment)
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return false
      const index = Number(segment)
      if (index < 0 || index >= current.length) return false
      current = current[index]
      continue
    }
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return false
    }
    current = (current as Record<string, unknown>)[segment]
  }
  return true
}

function semanticAnswerDocument(artifact: AuthorizationGenerationArtifact): Record<string, unknown> {
  return {
    ...artifact.result,
    ...(artifact.relationCoverage ? { coverage: artifact.relationCoverage } : {}),
    ...(artifact.conditionAnalysis ? { conditionAnalysis: artifact.conditionAnalysis } : {}),
  }
}

function validateAssessment(
  assessment: z.infer<typeof SemanticAssessmentSchema>,
  expectedRule: z.infer<typeof EvaluationRuleSchema>,
  answer: unknown,
  sourceBundle: SourceBundle,
  reviewSourceBundle: SourceBundle | undefined,
  path: string,
  diagnostics: AuthorizationEvaluationDiagnostic[],
): void {
  if (assessment.oracleRule !== expectedRule.oracleRule) {
    diagnostics.push(diagnostic(
      "review-oracle-rule-mismatch",
      `Review oracle rule ${assessment.oracleRule} does not match ${expectedRule.oracleRule}.`,
      `${path}.oracleRule`,
    ))
  }
  if (!sameSourceLocations(assessment.sourceLocations, expectedRule.sourceLocations)) {
    diagnostics.push(diagnostic(
      "review-source-binding-mismatch",
      "Review source locations do not exactly match the evaluator rubric for this judgment.",
      `${path}.sourceLocations`,
    ))
  }
  assessment.sourceLocations.forEach((location, index) => {
    if (!sourceLocationExists(location, reviewSourceBundle ? [sourceBundle, reviewSourceBundle] : [sourceBundle])) {
      diagnostics.push(diagnostic(
        "review-source-location-invalid",
        `Review source location is outside the exact source bundle: ${sourceLocationKey(location)}.`,
        `${path}.sourceLocations.${index}`,
      ))
    }
  })

  if (assessment.status === "missing") {
    if (assessment.answerLocation !== null) {
      diagnostics.push(diagnostic(
        "review-missing-answer-location",
        "A missing fact must use a null answer location rather than point at unrelated answer text.",
        `${path}.answerLocation`,
      ))
    }
    return
  }
  if (assessment.answerLocation === null) {
    if (assessment.status !== "uncertain") {
      diagnostics.push(diagnostic(
        "review-answer-location-required",
        `${assessment.status} review requires an answer JSON pointer.`,
        `${path}.answerLocation`,
      ))
    }
    return
  }
  if (!jsonPointerResolves(answer, assessment.answerLocation)) {
    diagnostics.push(diagnostic(
      "review-answer-location-invalid",
      `Answer JSON pointer does not resolve: ${assessment.answerLocation}.`,
      `${path}.answerLocation`,
    ))
  }
}

function validateSemanticReview(input: {
  rubric: AuthorizationCaseEvaluationRubric
  sourceBundle: SourceBundle
  artifact: AuthorizationGenerationArtifact
  generation: "initial" | "repair"
  review: unknown
  reviewSourceBundle?: SourceBundle
}): AuthorizationReviewValidation {
  const parsed = AuthorizationSemanticReviewV0Schema.safeParse(input.review)
  if (!parsed.success) {
    return {
      status: "invalid",
      diagnostics: parsed.error.issues.map(issue => diagnostic(
        "review-schema-invalid",
        issue.message,
        issue.path.join("."),
      )),
    }
  }

  const review = parsed.data
  const diagnostics: AuthorizationEvaluationDiagnostic[] = []
  const answer = semanticAnswerDocument(input.artifact)
  if (review.caseId !== input.rubric.caseId) {
    diagnostics.push(diagnostic("review-case-mismatch", "Review case does not match the rubric.", "caseId"))
  }
  if (review.taskId !== input.rubric.taskId) {
    diagnostics.push(diagnostic("review-task-mismatch", "Review task does not match the rubric.", "taskId"))
  }
  if (review.generation !== input.generation) {
    diagnostics.push(diagnostic("review-generation-mismatch", "Review generation does not match the evaluated artifact.", "generation"))
  }
  if (review.attemptId !== input.artifact.outputAttemptId) {
    diagnostics.push(diagnostic(
      "review-attempt-mismatch",
      "Review must bind the provider attempt that supplied this structured output.",
      "attemptId",
    ))
  }
  if (review.rawOutputSha256 !== hashAuthorizationRawOutput(input.artifact.rawResponse)) {
    diagnostics.push(diagnostic(
      "review-output-hash-mismatch",
      "Review raw-output digest does not match the retained generation artifact.",
      "rawOutputSha256",
    ))
  }
  if (review.rubricVersion !== input.rubric.rubricVersion) {
    diagnostics.push(diagnostic("review-rubric-mismatch", "Review rubric version does not match.", "rubricVersion"))
  }

  const expectedFacts = new Map(input.rubric.criticalFacts.map(fact => [fact.id, fact]))
  const reviewCounts = new Map<string, number>()
  review.factReviews.forEach((factReview, index) => {
    reviewCounts.set(factReview.factId, (reviewCounts.get(factReview.factId) ?? 0) + 1)
    const expected = expectedFacts.get(factReview.factId)
    if (!expected) {
      diagnostics.push(diagnostic(
        "foreign-fact-review",
        `Review contains a fact absent from the rubric: ${factReview.factId}.`,
        `factReviews.${index}.factId`,
      ))
      return
    }
    validateAssessment(
      factReview,
      expected,
      answer,
      input.sourceBundle,
      input.reviewSourceBundle,
      `factReviews.${index}`,
      diagnostics,
    )
  })
  for (const [factId] of expectedFacts) {
    const count = reviewCounts.get(factId) ?? 0
    if (count === 0) {
      diagnostics.push(diagnostic("missing-fact-review", `Review is missing rubric fact ${factId}.`, "factReviews"))
    } else if (count > 1) {
      diagnostics.push(diagnostic("duplicate-fact-review", `Review repeats rubric fact ${factId}.`, "factReviews"))
    }
  }

  validateAssessment(
    review.dispositionReview,
    input.rubric.dispositionRule,
    answer,
    input.sourceBundle,
    input.reviewSourceBundle,
    "dispositionReview",
    diagnostics,
  )
  validateAssessment(
    review.scopeReview,
    input.rubric.scopeRule,
    answer,
    input.sourceBundle,
    input.reviewSourceBundle,
    "scopeReview",
    diagnostics,
  )

  return {
    status: diagnostics.length === 0 ? "valid" : "invalid",
    diagnostics,
    review,
  }
}

function validateSemanticReviewV2(input: {
  rubric: AuthorizationCaseEvaluationRubricV2
  sourceBundle: SourceBundle
  artifact: AuthorizationGenerationArtifact
  generation: "initial" | "repair"
  review: unknown
  reviewSourceBundle?: SourceBundle
}): AuthorizationReviewValidationV2 {
  const parsed = AuthorizationSemanticReviewV1Schema.safeParse(input.review)
  if (!parsed.success) {
    return {
      status: "invalid",
      diagnostics: parsed.error.issues.map(issue => diagnostic(
        "review-schema-invalid",
        issue.message,
        issue.path.join("."),
      )),
    }
  }

  const review = parsed.data
  const diagnostics: AuthorizationEvaluationDiagnostic[] = []
  const answer = semanticAnswerDocument(input.artifact)
  if (review.caseId !== input.rubric.caseId) {
    diagnostics.push(diagnostic("review-case-mismatch", "Review case does not match the rubric.", "caseId"))
  }
  if (review.taskId !== input.rubric.taskId) {
    diagnostics.push(diagnostic("review-task-mismatch", "Review task does not match the rubric.", "taskId"))
  }
  if (review.generation !== input.generation) {
    diagnostics.push(diagnostic("review-generation-mismatch", "Review generation does not match the evaluated artifact.", "generation"))
  }
  if (review.attemptId !== input.artifact.outputAttemptId) {
    diagnostics.push(diagnostic(
      "review-attempt-mismatch",
      "Review must bind the provider attempt that supplied this structured output.",
      "attemptId",
    ))
  }
  if (review.rawOutputSha256 !== hashAuthorizationRawOutput(input.artifact.rawResponse)) {
    diagnostics.push(diagnostic(
      "review-output-hash-mismatch",
      "Review raw-output digest does not match the retained generation artifact.",
      "rawOutputSha256",
    ))
  }
  if (review.rubricVersion !== input.rubric.rubricVersion) {
    diagnostics.push(diagnostic("review-rubric-mismatch", "Review rubric version does not match.", "rubricVersion"))
  }

  const expectedCriteria = new Map(input.rubric.criteria.map(criterion => [criterion.id, criterion]))
  const reviewCounts = new Map<string, number>()
  review.criterionReviews.forEach((criterionReview, index) => {
    reviewCounts.set(criterionReview.criterionId, (reviewCounts.get(criterionReview.criterionId) ?? 0) + 1)
    const expected = expectedCriteria.get(criterionReview.criterionId)
    if (!expected) {
      diagnostics.push(diagnostic(
        "foreign-criterion-review",
        `Review contains a criterion absent from the rubric: ${criterionReview.criterionId}.`,
        `criterionReviews.${index}.criterionId`,
      ))
      return
    }
    validateAssessment(
      criterionReview,
      expected,
      answer,
      input.sourceBundle,
      input.reviewSourceBundle,
      `criterionReviews.${index}`,
      diagnostics,
    )
  })
  for (const [criterionId] of expectedCriteria) {
    const count = reviewCounts.get(criterionId) ?? 0
    if (count === 0) {
      diagnostics.push(diagnostic("missing-criterion-review", `Review is missing rubric criterion ${criterionId}.`, "criterionReviews"))
    } else if (count > 1) {
      diagnostics.push(diagnostic("duplicate-criterion-review", `Review repeats rubric criterion ${criterionId}.`, "criterionReviews"))
    }
  }

  validateAssessment(
    review.dispositionReview,
    input.rubric.dispositionRule,
    answer,
    input.sourceBundle,
    input.reviewSourceBundle,
    "dispositionReview",
    diagnostics,
  )
  validateAssessment(
    review.scopeReview,
    input.rubric.scopeRule,
    answer,
    input.sourceBundle,
    input.reviewSourceBundle,
    "scopeReview",
    diagnostics,
  )

  return {
    status: diagnostics.length === 0 ? "valid" : "invalid",
    diagnostics,
    review,
  }
}

function reviewStatusIsFailure(status: SemanticReviewStatus | "unreviewed"): boolean {
  return status === "missing" || status === "contradicted"
}

function reviewStatusIsUncertain(status: SemanticReviewStatus | "unreviewed"): boolean {
  return status === "uncertain" || status === "unreviewed"
}

const TRANSPORT_DIAGNOSTIC_CODES = new Set([
  "task-id-mismatch",
  "repository-mismatch",
  "source-ref-mismatch",
  "missing-obligation-result",
  "duplicate-obligation-result",
  "foreign-obligation-result",
  "citation-file-not-allowed",
  "citation-out-of-range",
  "citation-text-mismatch",
])

function aggregateEvidenceSemanticSupport(
  reviewValidation: AuthorizationReviewValidation,
  criticalFacts: AuthorizationCriticalFactEvaluation[],
): AuthorizationGenerationEvaluation["evidenceSemanticSupport"] {
  if (reviewValidation.status !== "valid") return "unknown"
  const statuses = criticalFacts.map(fact => fact.status)
  if (statuses.some(status => status === "contradicted")) return "contradicted"
  if (statuses.some(status => status === "missing")) return "missing"
  if (statuses.some(reviewStatusIsUncertain)) return "unknown"
  return "supported"
}

export function evaluateAuthorizationGeneration(input: {
  rubric: AuthorizationCaseEvaluationRubric
  sourceBundle: SourceBundle
  artifact: AuthorizationGenerationArtifact
  generation: "initial" | "repair"
  review: unknown
  reviewSourceBundle?: SourceBundle
}): AuthorizationGenerationEvaluation {
  const reviewValidation = validateSemanticReview(input)
  const review = reviewValidation.review
  const obligationResults = input.artifact.result.results.filter(result => result.obligationId === input.rubric.obligationId)
  const obligationResult = obligationResults.length === 1 ? obligationResults[0] : undefined
  const actualDisposition = obligationResult?.conclusion ?? null
  const labelCorrect = actualDisposition === input.rubric.expectedDisposition
  const reviewsByFact = new Map(review?.factReviews.map(fact => [fact.factId, fact]) ?? [])
  const criticalFacts: AuthorizationCriticalFactEvaluation[] = input.rubric.criticalFacts.map(fact => {
    const factReview = reviewsByFact.get(fact.id)
    return {
      id: fact.id,
      requirement: fact.requirement,
      status: factReview?.status ?? "unreviewed",
      ...(factReview ? { reason: factReview.reason, answerLocation: factReview.answerLocation } : {}),
      sourceLocations: fact.sourceLocations,
      oracleRule: fact.oracleRule,
    }
  })
  const evidencePresence = input.artifact.validation.evidencePresence
    .find(evidence => evidence.obligationId === input.rubric.obligationId)?.status
  const deterministicDiagnostics = input.artifact.validation.diagnostics.map(item => item.code)
  const mechanicalFailure = input.artifact.validation.structure.status !== "valid"
    || obligationResults.length !== 1
    || evidencePresence !== "present"
    || input.artifact.validation.completeness.status !== "accepted"
    || deterministicDiagnostics.length > 0

  const scopeReviewStatus = review?.scopeReview.status ?? "unreviewed"
  const scopeHonesty: AuthorizationGenerationEvaluation["scopeHonesty"] = reviewValidation.status === "invalid"
    || reviewStatusIsUncertain(scopeReviewStatus)
    ? "needs-review"
    : (input.artifact.validation.completeness.status === "accepted" && scopeReviewStatus === "supported"
      ? "accepted"
      : "rejected")

  const semanticStatuses: Array<SemanticReviewStatus | "unreviewed"> = [
    ...criticalFacts.map(fact => fact.status),
    review?.dispositionReview.status ?? "unreviewed",
    scopeReviewStatus,
  ]
  const definiteFailure = !labelCorrect
    || mechanicalFailure
    || semanticStatuses.some(reviewStatusIsFailure)
    || scopeHonesty === "rejected"
  const uncertain = reviewValidation.status === "invalid"
    || semanticStatuses.some(reviewStatusIsUncertain)
    || scopeHonesty === "needs-review"
  const taskDecisionCorrect = definiteFailure ? false : (uncertain ? null : true)
  const qualityStatus: AuthorizationGenerationEvaluation["qualityStatus"] = taskDecisionCorrect === true
    ? "full-success"
    : (taskDecisionCorrect === null ? "needs-review" : (labelCorrect ? "partial" : "incorrect"))

  const errorClasses = new Set<AuthorizationErrorClass>()
  if (input.rubric.expectedDisposition === "source_refuted" && actualDisposition === "source_supported_failure") {
    errorClasses.add("falsePositive")
  }
  if (input.rubric.expectedDisposition === "source_supported_failure" && actualDisposition === "source_refuted") {
    errorClasses.add("falseNegative")
  }
  if (input.rubric.expectedDisposition === "unknown" && actualDisposition !== null && actualDisposition !== "unknown") {
    errorClasses.add("unsupportedDeploymentInference")
  }
  if (input.rubric.expectedDisposition !== "unknown" && actualDisposition === "unknown") {
    errorClasses.add("excessiveAbstention")
  }
  if (input.artifact.validation.completeness.status === "rejected"
    || deterministicDiagnostics.includes("unsupported-completeness")) {
    errorClasses.add("unsupportedCompleteness")
  }
  if (evidencePresence === "present" && semanticStatuses
    .slice(0, criticalFacts.length + 1)
    .some(status => status !== "supported")) {
    errorClasses.add("evidenceDecoration")
  }

  const dispositionStatus = review?.dispositionReview.status ?? "unreviewed"
  const semanticDecisionCorrect: boolean | null = reviewValidation.status !== "valid"
    || actualDisposition === null
    || obligationResults.length !== 1
    || reviewStatusIsUncertain(dispositionStatus)
    ? null
    : (!labelCorrect || reviewStatusIsFailure(dispositionStatus) ? false : true)
  const evidenceSemanticSupport = aggregateEvidenceSemanticSupport(reviewValidation, criticalFacts)
  const normalizationValid = input.artifact.normalization === undefined
    || input.artifact.normalization.status === "valid"
  const transportValid = normalizationValid
    && input.artifact.validation.structure.status === "valid"
    && obligationResults.length === 1
    && evidencePresence === "present"
    && !deterministicDiagnostics.some(code => TRANSPORT_DIAGNOSTIC_CODES.has(code))
  const deliveryComplete = transportValid
    && input.artifact.validation.declared.status === "all-disposed"
    && input.artifact.validation.completeness.status === "accepted"

  return {
    evaluationVersion: "authorization-evaluation/v1",
    legacyDecisionVersion: "authorization-evaluation/v0",
    caseId: input.rubric.caseId,
    taskId: input.rubric.taskId,
    generation: input.generation,
    attemptId: input.artifact.outputAttemptId,
    rawOutputSha256: hashAuthorizationRawOutput(input.artifact.rawResponse),
    expectedDisposition: input.rubric.expectedDisposition,
    actualDisposition,
    labelCorrect,
    reviewValidation,
    criticalFacts,
    scopeHonesty,
    semanticDecisionCorrect,
    evidenceSemanticSupport,
    transportValid,
    deliveryComplete,
    taskDecisionCorrect,
    qualityStatus,
    errorClasses: [...errorClasses],
    deterministicDiagnostics,
  }
}

function aggregateNecessarySemantics(
  reviewValidation: AuthorizationReviewValidationV2,
  criteria: AuthorizationCriterionEvaluationV2[],
): AuthorizationGenerationEvaluationV2["dimensions"]["necessarySemantics"] {
  if (reviewValidation.status !== "valid") return "unknown"
  const statuses = criteria
    .filter(criterion => criterion.layer === "necessary-semantics")
    .map(criterion => criterion.status)
  if (statuses.some(status => status === "contradicted")) return "contradicted"
  if (statuses.some(reviewStatusIsUncertain)) return "unknown"
  if (statuses.some(status => status === "missing")) return "missing"
  return "supported"
}

function aggregateCompletenessLayer(
  reviewValidation: AuthorizationReviewValidationV2,
  criteria: AuthorizationCriterionEvaluationV2[],
  layer: "explanation-completeness" | "optional-detail",
): "complete" | "partial" | "contradicted" | "unknown" | "not-applicable" {
  const statuses = criteria.filter(criterion => criterion.layer === layer).map(criterion => criterion.status)
  if (statuses.length === 0) return "not-applicable"
  if (reviewValidation.status !== "valid") return "unknown"
  if (statuses.some(status => status === "contradicted")) return "contradicted"
  if (statuses.some(reviewStatusIsUncertain)) return "unknown"
  if (statuses.some(status => status === "missing")) return "partial"
  return "complete"
}

export function evaluateAuthorizationGenerationV2(input: {
  rubric: AuthorizationCaseEvaluationRubricV2
  sourceBundle: SourceBundle
  artifact: AuthorizationGenerationArtifact
  generation: "initial" | "repair"
  review: unknown
  reviewSourceBundle?: SourceBundle
}): AuthorizationGenerationEvaluationV2 {
  const reviewValidation = validateSemanticReviewV2(input)
  const review = reviewValidation.review
  const obligationResults = input.artifact.result.results.filter(result => result.obligationId === input.rubric.obligationId)
  const obligationResult = obligationResults.length === 1 ? obligationResults[0] : undefined
  const actualDisposition = obligationResult?.conclusion ?? null
  const labelCorrect = actualDisposition === input.rubric.expectedDisposition
  const reviewsByCriterion = new Map(review?.criterionReviews.map(criterion => [criterion.criterionId, criterion]) ?? [])
  const criteria: AuthorizationCriterionEvaluationV2[] = input.rubric.criteria.map(criterion => {
    const criterionReview = reviewsByCriterion.get(criterion.id)
    return {
      id: criterion.id,
      layer: criterion.layer,
      requirement: criterion.requirement,
      decisionRelevance: criterion.decisionRelevance,
      status: criterionReview?.status ?? "unreviewed",
      ...(criterionReview ? { reason: criterionReview.reason, answerLocation: criterionReview.answerLocation } : {}),
      sourceLocations: criterion.sourceLocations,
      oracleRule: criterion.oracleRule,
    }
  })
  const dimensions: AuthorizationGenerationEvaluationV2["dimensions"] = {
    necessarySemantics: aggregateNecessarySemantics(reviewValidation, criteria),
    explanationCompleteness: aggregateCompletenessLayer(reviewValidation, criteria, "explanation-completeness"),
    optionalDetails: aggregateCompletenessLayer(reviewValidation, criteria, "optional-detail"),
  }

  const evidencePresence = input.artifact.validation.evidencePresence
    .find(evidence => evidence.obligationId === input.rubric.obligationId)?.status
  const deterministicDiagnostics = input.artifact.validation.diagnostics.map(item => item.code)
  const mechanicalFailure = input.artifact.validation.structure.status !== "valid"
    || obligationResults.length !== 1
    || evidencePresence !== "present"
    || input.artifact.validation.completeness.status !== "accepted"
    || deterministicDiagnostics.length > 0

  const scopeReviewStatus = review?.scopeReview.status ?? "unreviewed"
  const scopeHonesty: AuthorizationGenerationEvaluationV2["scopeHonesty"] = reviewValidation.status === "invalid"
    || reviewStatusIsUncertain(scopeReviewStatus)
    ? "needs-review"
    : (input.artifact.validation.completeness.status === "accepted" && scopeReviewStatus === "supported"
      ? "accepted"
      : "rejected")

  const dispositionStatus = review?.dispositionReview.status ?? "unreviewed"
  const semanticDecisionCorrect: boolean | null = reviewValidation.status !== "valid"
    || actualDisposition === null
    || obligationResults.length !== 1
    || reviewStatusIsUncertain(dispositionStatus)
    ? null
    : (!labelCorrect || dispositionStatus === "contradicted" ? false : true)
  const taskDecisionCorrect: boolean | null = semanticDecisionCorrect === false
    || dimensions.necessarySemantics === "contradicted"
    ? false
    : (semanticDecisionCorrect === null
      || dimensions.necessarySemantics === "unknown"
      || scopeHonesty === "needs-review"
      ? null
      : true)

  const explanationIncomplete = dimensions.explanationCompleteness !== "complete"
    && dimensions.explanationCompleteness !== "not-applicable"
  const optionalDetailError = dimensions.optionalDetails === "contradicted"
    || dimensions.optionalDetails === "unknown"
  const qualityStatus: AuthorizationGenerationEvaluationV2["qualityStatus"] = taskDecisionCorrect === false
    ? "incorrect"
    : (taskDecisionCorrect === null
      ? "needs-review"
      : (mechanicalFailure
        || dimensions.necessarySemantics === "missing"
        || explanationIncomplete
        || optionalDetailError
        || scopeHonesty === "rejected"
        ? "partial"
        : "full-success"))

  const errorClasses = new Set<AuthorizationErrorClass>()
  if (input.rubric.expectedDisposition === "source_refuted" && actualDisposition === "source_supported_failure") {
    errorClasses.add("falsePositive")
  }
  if (input.rubric.expectedDisposition === "source_supported_failure" && actualDisposition === "source_refuted") {
    errorClasses.add("falseNegative")
  }
  if (input.rubric.expectedDisposition === "unknown" && actualDisposition !== null && actualDisposition !== "unknown") {
    errorClasses.add("unsupportedDeploymentInference")
  }
  if (input.rubric.expectedDisposition !== "unknown" && actualDisposition === "unknown") {
    errorClasses.add("excessiveAbstention")
  }
  if (input.artifact.validation.completeness.status === "rejected"
    || deterministicDiagnostics.includes("unsupported-completeness")) {
    errorClasses.add("unsupportedCompleteness")
  }
  if (evidencePresence === "present"
    && (dimensions.necessarySemantics !== "supported" || dispositionStatus !== "supported")) {
    errorClasses.add("evidenceDecoration")
  }

  const evidenceSemanticSupport: AuthorizationGenerationEvaluationV2["evidenceSemanticSupport"] = dimensions.necessarySemantics === "supported"
    ? "supported"
    : (dimensions.necessarySemantics === "contradicted"
      ? "contradicted"
      : (dimensions.necessarySemantics === "missing" ? "missing" : "unknown"))
  const normalizationValid = input.artifact.normalization === undefined
    || input.artifact.normalization.status === "valid"
  const transportValid = normalizationValid
    && input.artifact.validation.structure.status === "valid"
    && obligationResults.length === 1
    && evidencePresence === "present"
    && !deterministicDiagnostics.some(code => TRANSPORT_DIAGNOSTIC_CODES.has(code))
  const deliveryComplete = transportValid
    && input.artifact.validation.declared.status === "all-disposed"
    && input.artifact.validation.completeness.status === "accepted"

  return {
    evaluationVersion: "authorization-evaluation/v2",
    caseId: input.rubric.caseId,
    taskId: input.rubric.taskId,
    generation: input.generation,
    attemptId: input.artifact.outputAttemptId,
    rawOutputSha256: hashAuthorizationRawOutput(input.artifact.rawResponse),
    expectedDisposition: input.rubric.expectedDisposition,
    actualDisposition,
    labelCorrect,
    reviewValidation,
    criteria,
    dimensions,
    scopeHonesty,
    semanticDecisionCorrect,
    evidenceSemanticSupport,
    transportValid,
    deliveryComplete,
    taskDecisionCorrect,
    qualityStatus,
    errorClasses: [...errorClasses],
    deterministicDiagnostics,
  }
}

export const AuthorizationResponseDetailCalibrationSchema = z.object({
  criterionIds: z.array(NonEmptyString),
  requiredCriterionIds: z.array(NonEmptyString),
  basis: NonEmptyString,
}).strict()

/** Explicit pre-generation calibration; never infers requirements from status-code keywords. */
export function evaluateAuthorizationGenerationV3(input: Parameters<typeof evaluateAuthorizationGenerationV2>[0] & {
  responseDetails: z.infer<typeof AuthorizationResponseDetailCalibrationSchema>
}) {
  const calibration = AuthorizationResponseDetailCalibrationSchema.parse(input.responseDetails)
  const ids = new Set(calibration.criterionIds)
  const required = new Set(calibration.requiredCriterionIds)
  if ([...ids].some(id => !input.rubric.criteria.some(c => c.id === id)) || [...required].some(id => !ids.has(id))) {
    throw new Error("Response detail calibration must name existing criteria; required IDs must be response details.")
  }
  const rubric = { ...input.rubric, criteria: input.rubric.criteria.map(c => ids.has(c.id) ? { ...c, layer: required.has(c.id) ? "explanation-completeness" as const : "optional-detail" as const } : c) }
  const evaluated = evaluateAuthorizationGenerationV2({ ...input, rubric })
  const responseCriteria = evaluated.criteria.filter(c => ids.has(c.id)).map(c => ({ ...c, layer: "optional-detail" as const }))
  return {
    ...evaluated, evaluationVersion: "authorization-evaluation/v3" as const,
    dimensions: { ...evaluated.dimensions,
      optionalDetails: aggregateCompletenessLayer(evaluated.reviewValidation, evaluated.criteria.filter(c => !ids.has(c.id)), "optional-detail"),
      responseDetails: aggregateCompletenessLayer(evaluated.reviewValidation, responseCriteria, "optional-detail"),
    },
    responseDetailCalibration: calibration,
  }
}

export interface AuthorizationRunOperationSummary {
  providerAttempts: number
  schemaToolAttempts: number
  promptParseAttempts: number
  domainRepairAttempts: number
  unknownElapsedCalls: number
  knownElapsedMsSubtotal: number
  totalElapsedMs: number | null
  knownTokens: TokenUsage
  tokensStatus: AuthorizationTaskRun["telemetry"]["tokensStatus"]
  unknownUsageCalls: number
  knownActualUsdSubtotal: number
  totalActualUsd: number | null
  actualUsdStatus: AuthorizationTaskRun["telemetry"]["actualUsdStatus"]
  unknownCostCalls: number
  transportAttempts: "unknown"
}

export interface AuthorizationRunEvaluationSummary {
  caseId: string
  arm: AuthorizationTaskRun["arm"]
  runStatus: AuthorizationTaskRun["status"]
  repairUsed: boolean
  initialQuality: AuthorizationGenerationEvaluation["qualityStatus"] | null
  repairQuality: AuthorizationGenerationEvaluation["qualityStatus"] | null
  finalQuality: AuthorizationGenerationEvaluation["qualityStatus"] | null
  initialTaskDecisionCorrect: boolean | null
  finalTaskDecisionCorrect: boolean | null
  initialSemanticDecisionCorrect: boolean | null
  finalSemanticDecisionCorrect: boolean | null
  initialEvidenceSemanticSupport: AuthorizationGenerationEvaluation["evidenceSemanticSupport"] | null
  finalEvidenceSemanticSupport: AuthorizationGenerationEvaluation["evidenceSemanticSupport"] | null
  initialTransportValid: boolean | null
  finalTransportValid: boolean | null
  initialDeliveryComplete: boolean | null
  finalDeliveryComplete: boolean | null
  diagnostics: {
    initial: string[]
    repair: string[]
  }
  errorClasses: AuthorizationErrorClass[]
  operation: AuthorizationRunOperationSummary
}

export function summarizeAuthorizationRun(
  run: AuthorizationTaskRun,
  evaluations: {
    initial?: AuthorizationGenerationEvaluation
    repair?: AuthorizationGenerationEvaluation
  },
): AuthorizationRunEvaluationSummary {
  const finalEvaluation = run.finalKind === "repair" ? evaluations.repair : evaluations.initial
  const responses = run.attempts.filter(attempt => attempt.response !== undefined)
  const knownElapsedMsSubtotal = responses.reduce((sum, attempt) => sum + attempt.response!.durationMs, 0)
  const unknownElapsedCalls = run.attempts.length - responses.length
  const errorClasses = new Set<AuthorizationErrorClass>([
    ...(evaluations.initial?.errorClasses ?? []),
    ...(evaluations.repair?.errorClasses ?? []),
  ])
  return {
    caseId: evaluations.initial?.caseId ?? evaluations.repair?.caseId ?? run.compiled.task.taskId,
    arm: run.arm,
    runStatus: run.status,
    repairUsed: run.repair !== undefined,
    initialQuality: evaluations.initial?.qualityStatus ?? null,
    repairQuality: evaluations.repair?.qualityStatus ?? null,
    finalQuality: finalEvaluation?.qualityStatus ?? null,
    initialTaskDecisionCorrect: evaluations.initial?.taskDecisionCorrect ?? null,
    finalTaskDecisionCorrect: finalEvaluation?.taskDecisionCorrect ?? null,
    initialSemanticDecisionCorrect: evaluations.initial?.semanticDecisionCorrect ?? null,
    finalSemanticDecisionCorrect: finalEvaluation?.semanticDecisionCorrect ?? null,
    initialEvidenceSemanticSupport: evaluations.initial?.evidenceSemanticSupport ?? null,
    finalEvidenceSemanticSupport: finalEvaluation?.evidenceSemanticSupport ?? null,
    initialTransportValid: evaluations.initial?.transportValid ?? null,
    finalTransportValid: finalEvaluation?.transportValid ?? null,
    initialDeliveryComplete: evaluations.initial?.deliveryComplete ?? null,
    finalDeliveryComplete: finalEvaluation?.deliveryComplete ?? null,
    diagnostics: {
      initial: run.initial?.validation.diagnostics.map(item => item.code) ?? [],
      repair: run.repair?.validation.diagnostics.map(item => item.code) ?? [],
    },
    errorClasses: [...errorClasses],
    operation: {
      providerAttempts: run.attempts.length,
      schemaToolAttempts: run.attempts.filter(attempt => attempt.transport === "schema-tool").length,
      promptParseAttempts: run.attempts.filter(attempt => attempt.transport === "prompt-parse").length,
      domainRepairAttempts: run.attempts.filter(attempt => attempt.phase === "domain-repair").length,
      unknownElapsedCalls,
      knownElapsedMsSubtotal,
      totalElapsedMs: unknownElapsedCalls === 0 ? knownElapsedMsSubtotal : null,
      knownTokens: { ...run.telemetry.knownTokens },
      tokensStatus: run.telemetry.tokensStatus,
      unknownUsageCalls: run.telemetry.unknownUsageCalls,
      knownActualUsdSubtotal: run.telemetry.knownActualUsdSubtotal,
      totalActualUsd: run.telemetry.totalActualUsd,
      actualUsdStatus: run.telemetry.actualUsdStatus,
      unknownCostCalls: run.telemetry.unknownCostCalls,
      transportAttempts: "unknown",
    },
  }
}

export interface AuthorizationPairSummary {
  caseId: string
  arms: {
    B: AuthorizationRunEvaluationSummary
    D: AuthorizationRunEvaluationSummary
  }
  differences: {
    providerAttempts: number
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    knownElapsedMsSubtotal: number
    knownActualUsdSubtotal: number
    totalActualUsd: number | null
  }
}

export function summarizeAuthorizationPair(
  caseId: string,
  baseline: AuthorizationRunEvaluationSummary,
  domain: AuthorizationRunEvaluationSummary,
): AuthorizationPairSummary {
  if (baseline.arm !== "B" || domain.arm !== "D") {
    throw new Error("Authorization pair summary requires B baseline followed by D domain arm.")
  }
  if (baseline.caseId !== caseId || domain.caseId !== caseId) {
    throw new Error("Authorization pair summary case IDs must match the requested case.")
  }
  return {
    caseId,
    arms: { B: baseline, D: domain },
    differences: {
      providerAttempts: domain.operation.providerAttempts - baseline.operation.providerAttempts,
      inputTokens: domain.operation.knownTokens.input - baseline.operation.knownTokens.input,
      outputTokens: domain.operation.knownTokens.output - baseline.operation.knownTokens.output,
      cacheReadTokens: domain.operation.knownTokens.cacheRead - baseline.operation.knownTokens.cacheRead,
      cacheWriteTokens: domain.operation.knownTokens.cacheWrite - baseline.operation.knownTokens.cacheWrite,
      knownElapsedMsSubtotal: domain.operation.knownElapsedMsSubtotal - baseline.operation.knownElapsedMsSubtotal,
      knownActualUsdSubtotal: domain.operation.knownActualUsdSubtotal - baseline.operation.knownActualUsdSubtotal,
      totalActualUsd: baseline.operation.totalActualUsd === null || domain.operation.totalActualUsd === null
        ? null
        : domain.operation.totalActualUsd - baseline.operation.totalActualUsd,
    },
  }
}
