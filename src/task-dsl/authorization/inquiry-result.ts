import { z } from "zod"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import { INQUIRY_RELATIONS, type AuthorizationInquiryProgram } from "./inquiry-program.ts"

export const AuthorizationObservationSchema = z.object({
  questionId: InquiryText, kind: z.enum(INQUIRY_RELATIONS), subject: InquiryText, object: InquiryText.optional(),
  claim: InquiryText, state: z.enum(["pending", "observed", "unresolved"]), evidenceIds: z.array(InquiryText),
}).strict()
const disposition = z.enum(["allow", "deny", "conditional", "unknown"])
export const InquiryQuestionResultSchema = z.object({
  questionId: InquiryText,
  behavior: z.object({ disposition, explanation: InquiryText }).strict(),
  branches: z.array(z.object({ id: InquiryText, condition: InquiryText, disposition, explanation: InquiryText, evidenceIds: z.array(InquiryText) }).strict()).max(16),
  evidenceIds: z.array(InquiryText),
  missing: z.array(z.object({ kind: z.enum(["source-gap", "premise-unspecified", "deployment-unverified", "dependency-out-of-scope"]), detail: InquiryText, nextRead: InquiryText.optional() }).strict()),
  policyAssessment: z.object({ status: z.enum(["satisfied", "violated", "undetermined"]), explanation: InquiryText }).strict().optional(),
}).strict()
export const AuthorizationInquiryResultSchema = z.object({
  schemaVersion: z.literal("authorization-inquiry-result/v1"), questions: z.array(InquiryQuestionResultSchema),
  observations: z.array(AuthorizationObservationSchema), scope: InquiryText,
}).strict()
export type AuthorizationObservation = z.infer<typeof AuthorizationObservationSchema>
export type AuthorizationInquiryResult = z.infer<typeof AuthorizationInquiryResultSchema>
export interface InquiryEvidenceContext { questionIds: string[]; shownEvidenceIds: string[]; evidenceQuestions?: Record<string, string[]> }
const diag = (code: string, path: string, message: string): InquiryDiagnostic => ({ code, path, message, severity: "error" })

function checkEvidence(ids: string[], questionId: string, path: string, context: InquiryEvidenceContext): InquiryDiagnostic[] {
  return ids.flatMap(id => !context.shownEvidenceIds.includes(id) ? [diag("evidence-not-shown", path, `Evidence ${id} was not shown in this analysis.`)]
    : context.evidenceQuestions?.[id] && !context.evidenceQuestions[id]!.includes(questionId) ? [diag("evidence-question-mismatch", path, `Evidence ${id} was shown for another question.`)] : [])
}
export function validateInquiryObservations(input: unknown, context: InquiryEvidenceContext): InquiryDiagnostic[] {
  const parsed = z.array(AuthorizationObservationSchema).safeParse(input)
  if (!parsed.success) return parsed.error.issues.map(issue => diag("observation-schema", issue.path.join("."), issue.message))
  return parsed.data.flatMap((item, i) => [
    ...(!context.questionIds.includes(item.questionId) ? [diag("unknown-question", `observations.${i}.questionId`, "Question is not declared.")] : []),
    ...(item.state === "observed" && !item.evidenceIds.length ? [diag("observed-without-evidence", `observations.${i}.evidenceIds`, "An observed claim needs actual shown evidence.")] : []),
    ...checkEvidence(item.evidenceIds, item.questionId, `observations.${i}.evidenceIds`, context),
  ])
}
export function validateAuthorizationInquiryResult(plan: AuthorizationInquiryProgram, input: unknown, context: InquiryEvidenceContext, domainCheck?: { diagnostics: InquiryDiagnostic[] }): {
  valid: boolean; result?: AuthorizationInquiryResult; diagnostics: InquiryDiagnostic[]; semanticSupport: "unreviewed"
} {
  const parsed = AuthorizationInquiryResultSchema.safeParse(input)
  if (!parsed.success) return { valid: false, diagnostics: parsed.error.issues.map(issue => diag("inquiry-result-schema", issue.path.join("."), issue.message)), semanticSupport: "unreviewed" }
  const result = parsed.data, diagnostics = [...validateInquiryObservations(result.observations, context), ...(domainCheck?.diagnostics ?? [])], seen = new Set<string>()
  for (const [i, item] of result.questions.entries()) {
    const field = `questions.${i}`
    if (!context.questionIds.includes(item.questionId)) diagnostics.push(diag("unknown-question", `${field}.questionId`, "Question is not declared."))
    if (seen.has(item.questionId)) diagnostics.push(diag("duplicate-question-result", `${field}.questionId`, "Question answered more than once."))
    seen.add(item.questionId)
    diagnostics.push(...checkEvidence(item.evidenceIds, item.questionId, `${field}.evidenceIds`, context))
    if (item.behavior.disposition === "unknown" && !item.missing.length) diagnostics.push(diag("unknown-without-gap", `${field}.missing`, "Unknown must name a decisive missing fact and its origin."))
    if (item.behavior.disposition !== "unknown" && !item.evidenceIds.length) diagnostics.push(diag("answer-without-evidence", `${field}.evidenceIds`, "A determinate or conditional answer requires source evidence."))
    if (plan.mode === "behavior" && item.policyAssessment) diagnostics.push(diag("behavior-policy-assessment", `${field}.policyAssessment`, "Behavior has no normative policy comparison."))
    if (plan.mode === "conformance" && !item.policyAssessment) diagnostics.push(diag("policy-assessment-missing", field, "Conformance must compare the independently supplied policy."))
    if (item.behavior.disposition === "conditional" && !item.branches.length) diagnostics.push(diag("conditional-without-branches", `${field}.branches`, "A conditional answer must state the relevant branches."))
    const conditions = new Set<string>(), branchIds = new Set<string>()
    for (const [j, branch] of item.branches.entries()) {
      const condition = branch.condition.trim().replace(/\s+/g, " ").toLowerCase()
      if (conditions.has(condition)) diagnostics.push(diag("duplicate-branch-condition", `${field}.branches.${j}`, "The same stated condition is repeated; inspect conflicting dispositions."))
      if (branchIds.has(branch.id)) diagnostics.push(diag("duplicate-branch-id", `${field}.branches.${j}.id`, "Branch id is repeated."))
      conditions.add(condition); branchIds.add(branch.id)
      diagnostics.push(...checkEvidence(branch.evidenceIds, item.questionId, `${field}.branches.${j}.evidenceIds`, context))
      if (branch.disposition !== "unknown" && !branch.evidenceIds.length) diagnostics.push(diag("branch-without-evidence", `${field}.branches.${j}`, "A claimed branch requires evidence."))
    }
  }
  for (const q of plan.questions) if (!seen.has(q.id)) diagnostics.push(diag("question-not-answered", "questions", `Missing answer for ${q.id}.`))
  return { valid: diagnostics.length === 0, result, diagnostics, semanticSupport: "unreviewed" }
}

/** Mechanical queue status is feedback, not a proof that source control is sound. */
export function inquiryObservationFeedback(plan: AuthorizationInquiryProgram, observations: AuthorizationObservation[]) {
  return plan.queue.map(item => ({ ...item, state: observations.some(o => o.questionId === item.questionId && o.kind === item.kind && o.state === "observed") ? "observed" : observations.some(o => o.questionId === item.questionId && o.kind === item.kind && o.state === "unresolved") ? "unresolved" : "pending" }))
}
