import { z } from "zod"
import { InquiryText, questionIdForDiagnostic, type InquiryDiagnostic } from "./inquiry.ts"
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
  missing: z.array(z.object({ kind: z.enum(["source-gap", "interpretation-gap", "premise-unknown", "policy-unspecified", "premise-unspecified", "deployment-unverified", "dependency-out-of-scope"]), detail: InquiryText, nextRead: InquiryText.optional() }).strict()),
  policyAssessment: z.object({ status: z.enum(["satisfied", "violated", "undetermined"]), explanation: InquiryText }).strict().optional(),
}).strict()
export const AuthorizationInquiryResultSchema = z.object({
  schemaVersion: z.literal("authorization-inquiry-result/v1"), questions: z.array(InquiryQuestionResultSchema),
  observations: z.array(AuthorizationObservationSchema), scope: InquiryText,
}).strict()
export type AuthorizationObservation = z.infer<typeof AuthorizationObservationSchema>
export type AuthorizationInquiryResult = z.infer<typeof AuthorizationInquiryResultSchema>
export interface InquiryEvidenceContext { questionIds: string[]; shownEvidenceIds: string[]; evidenceQuestions?: Record<string, string[]> }
const diag = (code: string, path: string, message: string, questionId?: string): InquiryDiagnostic => ({ code, path, message, severity: "error", ...(questionId ? { questionId } : {}) })

function checkEvidence(ids: string[], questionId: string, path: string, context: InquiryEvidenceContext): InquiryDiagnostic[] {
  return ids.flatMap(id => !context.shownEvidenceIds.includes(id) ? [diag("evidence-not-shown", path, `Evidence ${id} was not shown in this analysis.`, questionId)]
    : context.evidenceQuestions?.[id] && !context.evidenceQuestions[id]!.includes(questionId) ? [diag("evidence-question-mismatch", path, `Evidence ${id} was shown for another question.`, questionId)] : [])
}
export function validateInquiryObservations(input: unknown, context: InquiryEvidenceContext): InquiryDiagnostic[] {
  if (!Array.isArray(input)) return [diag("observation-schema", "observations", "Observations must be an array.")]
  return input.flatMap((raw, i) => {
    const parsed = AuthorizationObservationSchema.safeParse(raw), questionId = raw && typeof raw === "object" && typeof raw.questionId === "string" ? raw.questionId : undefined
    if (!parsed.success) return parsed.error.issues.map(issue => diag("observation-schema", `observations.${i}.${issue.path.join(".")}`, issue.message, questionId))
    const item = parsed.data
    return [
      ...(!context.questionIds.includes(item.questionId) ? [diag("unknown-question", `observations.${i}.questionId`, "Question is not declared.", item.questionId)] : []),
      ...(item.state === "observed" && !item.evidenceIds.length ? [diag("observed-without-evidence", `observations.${i}.evidenceIds`, "An observed claim needs actual shown evidence.", item.questionId)] : []),
      ...checkEvidence(item.evidenceIds, item.questionId, `observations.${i}.evidenceIds`, context),
    ]
  })
}
interface QuestionDomainCheck { questionId: string; ruleConsistent: boolean; evidenceCoverage: "bounded" | "unresolved"; diagnostics: InquiryDiagnostic[]; trace?: unknown }
interface DomainCheck { diagnostics: InquiryDiagnostic[]; questionChecks?: QuestionDomainCheck[] }
export function validateAuthorizationInquiryResult(plan: AuthorizationInquiryProgram, input: unknown, context: InquiryEvidenceContext, domainCheck?: DomainCheck) {
  const parsed = AuthorizationInquiryResultSchema.safeParse(input)
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {}, rawQuestions = Array.isArray(raw.questions) ? raw.questions : []
  const candidates = rawQuestions.flatMap(q => { const p = InquiryQuestionResultSchema.safeParse(q); return p.success ? [p.data] : [] })
  const result = parsed.success ? parsed.data : { schemaVersion: "authorization-inquiry-result/v1" as const, questions: candidates, observations: [], scope: "Partial candidate inspection only" }
  const schemaDiagnostics = parsed.success ? [] : parsed.error.issues.map(issue => {
    const item = issue.path[0] === "questions" ? rawQuestions[Number(issue.path[1])] : issue.path[0] === "observations" && Array.isArray(raw.observations) ? raw.observations[Number(issue.path[1])] : undefined
    return diag("inquiry-result-schema", issue.path.join("."), issue.message, item && typeof item === "object" && typeof item.questionId === "string" ? item.questionId : undefined)
  })
  const diagnostics = [...schemaDiagnostics, ...validateInquiryObservations(raw.observations, context), ...(domainCheck?.diagnostics ?? [])], seen = new Set<string>()
  for (const [i, item] of result.questions.entries()) {
    const field = `questions.${i}`, diagnosticStart = diagnostics.length
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
    for (let at = diagnosticStart; at < diagnostics.length; at++) diagnostics[at] = { ...diagnostics[at]!, questionId: item.questionId }
  }
  for (const q of plan.questions) if (!seen.has(q.id)) diagnostics.push(diag("question-not-answered", "questions", `Missing answer for ${q.id}.`, q.id))
  const ids = [...new Set([...plan.questions.map(q => q.id), ...rawQuestions.flatMap(q => q && typeof q === "object" && typeof q.questionId === "string" ? [q.questionId] : [])])]
  const questionChecks = ids.map(questionId => {
    const matching = candidates.filter(q => q.questionId === questionId), answer = matching.length === 1 ? matching[0] : undefined, control = domainCheck?.questionChecks?.find(q => q.questionId === questionId)
    const local = [...diagnostics, ...(control?.diagnostics ?? [])].filter(d => d.code !== "control-result-schema" && (!questionIdForDiagnostic(ids, d) || questionIdForDiagnostic(ids, d) === questionId)).filter((d, i, all) => all.findIndex(v => v.code === d.code && v.path === d.path && v.message === d.message && v.questionId === d.questionId) === i)
    const transportValid = !!answer && !local.some(d => ["inquiry-result-schema", "observation-schema"].includes(d.code)), referenceValid = transportValid && !local.some(d => ["evidence-not-shown", "evidence-question-mismatch", "answer-without-evidence", "branch-without-evidence", "observed-without-evidence", "policy-as-source", "source-invalidated"].includes(d.code))
    const ruleConsistent = control?.ruleConsistent ?? null
    const hasRawAnswer = rawQuestions.some(q => q && typeof q === "object" && q.questionId === questionId)
    const deliveryStatus = !hasRawAnswer ? "missing" as const : !transportValid || !referenceValid || ruleConsistent === false || local.some(d => d.severity === "error") ? "rejected" as const : ruleConsistent === true ? "checked" as const : "unverified" as const
    return { questionId, transportValid, referenceValid, ruleConsistent, evidenceCoverage: control?.evidenceCoverage ?? "unreviewed" as const, semanticReview: "unreviewed" as const, deliveryStatus, answer, diagnostics: local, ...(control?.trace ? { trace: control.trace } : {}) }
  })
  const valid = parsed.success && diagnostics.length === 0
  return { valid, result: valid ? parsed.data : undefined, diagnostics, semanticSupport: "unreviewed" as const, questionChecks, usableQuestions: questionChecks.filter(q => ["checked", "unverified"].includes(q.deliveryStatus)).flatMap(q => q.answer ? [q.answer] : []) }
}

/** Mechanical queue status is feedback, not a proof that source control is sound. */
export function inquiryObservationFeedback(plan: AuthorizationInquiryProgram, observations: AuthorizationObservation[]) {
  return plan.queue.map(item => ({ ...item, state: observations.some(o => o.questionId === item.questionId && o.kind === item.kind && o.state === "observed") ? "observed" : observations.some(o => o.questionId === item.questionId && o.kind === item.kind && o.state === "unresolved") ? "unresolved" : "pending" }))
}
