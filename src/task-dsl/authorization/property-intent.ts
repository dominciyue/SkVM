import { z } from "zod"
import { createHash } from "node:crypto"
import type { AuthorizationInquiry } from "./inquiry.ts"
import { PropertyRequirementSchema } from "./property-query.ts"

const text = z.string().trim().min(1)
const property = PropertyRequirementSchema.omit({ id: true })
export const PropertyIntentProposalSchema = z.object({
  schemaVersion: z.literal("authorization-property-intent/v1"),
  questions: z.array(z.discriminatedUnion("state", [
    z.object({ questionId: text, state: z.literal("proposed"), properties: z.array(property).min(1).max(8) }).strict(),
    z.object({ questionId: text, state: z.literal("residual"), reason: text }).strict(),
    z.object({ questionId: text, state: z.literal("needs-clarification"), reason: text }).strict(),
  ])).min(1).max(16),
}).strict()
export interface PropertyIntentDiagnostic { code: string; questionId?: string; message: string }
export class TaskPropertyIntentError extends Error {
  constructor(readonly diagnostics: PropertyIntentDiagnostic[]) { super(`task-property-preparation: ${JSON.stringify(diagnostics)}`) }
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")
export function pendingTaskProperties(inquiry: AuthorizationInquiry) { return inquiry.questions.filter(q => !q.properties?.length) }

/** Admit task meanings without examining source or producing a verdict. The full
 * original question remains a reporting duty even when one narrow property exists. */
export function prepareTaskProperties(original: AuthorizationInquiry, rawProposal?: unknown) {
  const pending = pendingTaskProperties(original), diagnostics: PropertyIntentDiagnostic[] = []
  const parsed = rawProposal === undefined ? undefined : PropertyIntentProposalSchema.safeParse(rawProposal)
  if (parsed && !parsed.success) throw new TaskPropertyIntentError(parsed.error.issues.map(i => ({ code: "property-intent-shape", message: `${i.path.join(".")}: ${i.message}` })))
  const proposal = parsed?.success ? parsed.data : undefined
  if (pending.length && !proposal) throw new TaskPropertyIntentError([{ code: "property-intent-required", message: "Submit a task-only proposal for every question lacking properties, or explicitly retain it as residual/needs-clarification." }])
  if (proposal) {
    for (const q of proposal.questions) {
      if (!pending.some(p => p.id === q.questionId)) diagnostics.push({ code: "property-question-unexpected", questionId: q.questionId, message: "Only current undeclared questions may receive a proposal." })
      if (proposal.questions.filter(p => p.questionId === q.questionId).length !== 1) diagnostics.push({ code: "property-question-duplicate", questionId: q.questionId, message: "Each current undeclared question must occur once." })
      const current = pending.find(p => p.id === q.questionId)
      if (current && q.state === "proposed") for (const p of q.properties) {
        if (!current.request.includes(p.requirement) || p.requiredPermission && !p.requirement.includes(p.requiredPermission)) diagnostics.push({ code: "requirement-not-current-task-span", questionId: q.questionId, message: "Requirement and permission must be exact spans of this question, never an answer or another question." })
        if (q.properties.filter(other => digest(other) === digest(p)).length !== 1) diagnostics.push({ code: "property-intent-duplicate", questionId: q.questionId, message: "Repeated identical obligations are not distinct properties." })
      }
    }
    for (const q of pending) if (!proposal.questions.some(p => p.questionId === q.id)) diagnostics.push({ code: "property-question-missing", questionId: q.id, message: "Retain every original question, including residual duties." })
  }
  if (diagnostics.length) throw new TaskPropertyIntentError(diagnostics)
  const inquiry = structuredClone(original)
  const questions = inquiry.questions.map(q => {
    const proposed = proposal?.questions.find(p => p.questionId === q.id)
    const properties = q.properties ?? (proposed?.state === "proposed" ? proposed.properties.map(p => ({ id: `task-property-${digest([q.id, p]).slice(0, 20)}`, ...p })) : [])
    let state: "prepared" | "declared" | "residual" | "needs-clarification" = q.properties?.length ? "declared" : proposed?.state === "proposed" ? "prepared" : proposed!.state
    let reason = proposed && "reason" in proposed ? proposed.reason : undefined
    if (original.mode === "conformance" && !original.policy && (!("intent" in q) || q.intent === "policy-comparison")) {
      state = "needs-clarification"; reason = "Independent user policy is missing; source behavior cannot supply it."
      diagnostics.push({ code: "policy-required", questionId: q.id, message: reason })
    }
    if (!q.properties && properties.length) q.properties = properties
    return { questionId: q.id, state, properties: structuredClone(properties), residualRequest: q.request,
      origin: original.questions.find(p => p.id === q.id)?.properties?.length ? "original-declaration" : "model-task-proposal",
      ...(reason ? { reason } : {}) }
  })
  return { schemaVersion: "authorization-task-properties/v1" as const, originalInquirySha256: digest(original), revision: digest([original, proposal]), proposal, questions, diagnostics, inquiry }
}
export type TaskPropertyPreparation = ReturnType<typeof prepareTaskProperties>
export function renderTaskPropertyPreparation(inquiry: AuthorizationInquiry) {
  return [
    "Prepare narrow task properties before source interpretation. Current tasks and explicitly supplied facts are the only inputs. Do not infer code behavior, an answer, a verdict, permission grants, effect/guard anchors or policy.",
    "Return authorization-property-intent/v1 with questions for EACH undeclared question exactly once: {questionId,state:proposed,properties:[{kind,requirement,requiredPermission?}]} or {questionId,state:residual|needs-clarification,reason}. Do not supply property IDs; the host derives them.",
    "Kinds: authorization-before-effect, authorized-object-matches-effect, effect-reachability, operation-completion. Choose only a meaning supported by the current question. requirement must copy an exact nonempty span of that same question.request; requiredPermission, if present, must copy an exact span of requirement. A kind does not assert that the source meets it.",
    "Scope/evidence-limit questions may remain residual. A narrow property never discharges other branches or reporting duties of the original question. Missing policy stays missing. No source evidence or evaluator interpretation is available in this stage.",
    `Current original inquiry: ${JSON.stringify(inquiry)}\nUndeclared question IDs: ${JSON.stringify(pendingTaskProperties(inquiry).map(q => q.id))}`,
  ].join("\n\n")
}
