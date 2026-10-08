import { z } from "zod"
import { PropertyRequirementSchema } from "./property-query.ts"

export const InquiryText = z.string().trim().min(1)
export const InquiryQuestionSchema = z.object({
  id: InquiryText, request: InquiryText, principal: InquiryText.optional(), resource: InquiryText.optional(),
  operation: InquiryText.optional(), entryHint: InquiryText.optional(),
  premises: z.array(z.object({ text: InquiryText, origin: z.literal("user") }).strict()),
  properties: z.array(PropertyRequirementSchema).min(1).max(8).refine(q => new Set(q.map(v => v.id)).size === q.length, "duplicate-property: property ids must be unique.").optional(),
}).strict()
export const InquiryPolicySchema = z.object({ text: InquiryText, origin: z.enum(["user", "external-policy"]), location: InquiryText }).strict()
export const AuthorizationInquiryV1Schema = z.object({
  schemaVersion: z.literal("authorization-inquiry/v1"), mode: z.enum(["behavior", "conformance"]),
  questions: z.array(InquiryQuestionSchema).min(1).max(16), policy: InquiryPolicySchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.mode === "conformance" && !value.policy) context.addIssue({ code: z.ZodIssueCode.custom, path: ["policy"], message: "policy-required: conformance needs an independently supplied normative policy." })
  if (value.mode === "behavior" && value.policy) context.addIssue({ code: z.ZodIssueCode.custom, path: ["policy"], message: "behavior-policy: use conformance for a policy comparison." })
  const seen = new Set<string>()
  value.questions.forEach((question, index) => {
    if (seen.has(question.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", index, "id"], message: "duplicate-question: question ids must be unique." })
    seen.add(question.id)
  })
})
export const ObligationIntentSchema = z.enum(["behavior", "policy-comparison", "scope"])
export const InquiryOperationSchema = z.object({ id: InquiryText, request: InquiryText, entryHint: InquiryText.optional() }).strict()
export const InquiryOperationQuestionSchema = InquiryQuestionSchema.extend({ operationId: InquiryText, intent: ObligationIntentSchema }).strict()
export const AuthorizationInquiryV2Schema = z.object({
  schemaVersion: z.literal("authorization-inquiry/v2"), mode: z.enum(["behavior", "conformance"]),
  operations: z.array(InquiryOperationSchema).min(1).max(16), questions: z.array(InquiryOperationQuestionSchema).min(1).max(16), policy: InquiryPolicySchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.mode === "conformance" && !value.policy) context.addIssue({ code: z.ZodIssueCode.custom, path: ["policy"], message: "policy-required: conformance needs an independently supplied normative policy." })
  if (value.mode === "behavior" && value.policy) context.addIssue({ code: z.ZodIssueCode.custom, path: ["policy"], message: "behavior-policy: use conformance for a policy comparison." })
  const operations = new Set<string>(), questions = new Set<string>()
  value.operations.forEach((o, i) => { if (operations.has(o.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["operations", i, "id"], message: "duplicate-operation: operation ids must be unique." }); operations.add(o.id) })
  value.questions.forEach((q, i) => {
    if (questions.has(q.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", i, "id"], message: "duplicate-question: question ids must be unique." })
    if (!operations.has(q.operationId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["questions", i, "operationId"], message: "operation-missing: question references an absent operation." })
    questions.add(q.id)
  })
  value.operations.forEach((o, i) => { if (!value.questions.some(q => q.operationId === o.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["operations", i], message: "operation-unused: each operation needs a question." }) })
})
export const AuthorizationInquirySchema = z.union([AuthorizationInquiryV1Schema, AuthorizationInquiryV2Schema])
/** Source-assisted analysis can report behavior while a requested policy comparison is unresolved. */
export const AuthorizationSourceInquirySchema = z.unknown().transform((input, context) => {
  const absentPolicy = input && typeof input === "object" && !Array.isArray(input) && (input as Record<string, unknown>).mode === "conformance" && (input as Record<string, unknown>).policy === undefined
  const parsed = AuthorizationInquirySchema.safeParse(absentPolicy ? { ...input, mode: "behavior" } : input)
  if (!parsed.success) { for (const issue of parsed.error.issues) context.addIssue(issue); return z.NEVER }
  return absentPolicy ? { ...parsed.data, mode: "conformance" as const } : parsed.data
})
export type AuthorizationInquiry = z.infer<typeof AuthorizationInquirySchema>
export type ObligationIntent = z.infer<typeof ObligationIntentSchema>
export type InquiryQuestion = z.infer<typeof InquiryQuestionSchema> & { operationId?: string; intent?: ObligationIntent }
export interface InquiryDiagnostic { code: string; path: string; message: string; severity: "error" | "warning"; questionId?: string }
export function questionIdForDiagnostic(questionIds: string[], d: InquiryDiagnostic) {
  return d.questionId ?? questionIds.find(id => d.path === id || d.path.startsWith(`${id}.`) || ["rules", "bindings", "dependencies", "policyRules", "sourceBindings", "premiseValues", "workSelections"].some(g => d.path.startsWith(`${g}.${id}.`)))
}
