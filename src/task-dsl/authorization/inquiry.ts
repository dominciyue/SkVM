import { z } from "zod"

export const InquiryText = z.string().trim().min(1)
export const InquiryQuestionSchema = z.object({
  id: InquiryText, request: InquiryText, principal: InquiryText.optional(), resource: InquiryText.optional(),
  operation: InquiryText.optional(), entryHint: InquiryText.optional(),
  premises: z.array(z.object({ text: InquiryText, origin: z.literal("user") }).strict()),
}).strict()
export const InquiryPolicySchema = z.object({ text: InquiryText, origin: z.enum(["user", "external-policy"]), location: InquiryText }).strict()
export const AuthorizationInquirySchema = z.object({
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
export type AuthorizationInquiry = z.infer<typeof AuthorizationInquirySchema>
export type InquiryQuestion = z.infer<typeof InquiryQuestionSchema>
export interface InquiryDiagnostic { code: string; path: string; message: string; severity: "error" | "warning"; questionId?: string }
export function questionIdForDiagnostic(questionIds: string[], d: InquiryDiagnostic) {
  return d.questionId ?? questionIds.find(id => d.path === id || d.path.startsWith(`${id}.`) || ["rules", "bindings", "dependencies", "policyRules", "sourceBindings", "premiseValues", "workSelections"].some(g => d.path.startsWith(`${g}.${id}.`)))
}
