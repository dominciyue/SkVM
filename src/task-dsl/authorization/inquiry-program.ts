import { AuthorizationInquirySchema, type AuthorizationInquiry, type InquiryQuestion, type InquiryDiagnostic } from "./inquiry.ts"
import { normalizeInquiryOperations, type InquiryOperation, type OperationQuestion } from "./operation-program.ts"

export const INQUIRY_RELATIONS = ["entry", "principal-binding", "resource-binding", "guard", "effect", "exception"] as const
export type InquiryRelation = typeof INQUIRY_RELATIONS[number]
export interface InquiryQueueItem { id: string; questionId: string; kind: InquiryRelation; question: string; state: "pending" }
export interface AuthorizationInquiryProgram {
  schemaVersion: "authorization-inquiry-program/v1"; status: "ready" | "needs-input";
  mode?: AuthorizationInquiry["mode"]; questions: InquiryQuestion[]; policy?: AuthorizationInquiry["policy"];
  queue: InquiryQueueItem[]; diagnostics: InquiryDiagnostic[];
  operations?: InquiryOperation[]; operationQuestions?: OperationQuestion[]; originalDeclaration?: AuthorizationInquiry
}
const questions: Record<InquiryRelation, string> = {
  entry: "Which entry and applicable upstream controls govern this requested path?",
  "principal-binding": "How is the caller identity bound on this path? Do not invent an unspecified identity.",
  "resource-binding": "Which resource does the request select and what resource does each control check?",
  guard: "Which applicable control decides this operation and under which conditions? Not finding a guard is not proof of absence.",
  effect: "Which object receives the protected effect? Does it match the control object? A decisive rejection may suffice without tracing unreachable effects.",
  exception: "Which relevant role, relation or condition exceptions change this answer? Separate source gaps from external facts.",
}
/** Expand analysis duties, never source behavior or normative expectations. */
export function compileAuthorizationInquiry(input: unknown): AuthorizationInquiryProgram {
  const parsed = AuthorizationInquirySchema.safeParse(input)
  if (!parsed.success) return { schemaVersion: "authorization-inquiry-program/v1", status: "needs-input", questions: [], queue: [],
    diagnostics: parsed.error.issues.map(issue => ({ code: issue.message.startsWith("policy-required:") ? "policy-required" : issue.message.startsWith("duplicate-question:") ? "duplicate-question" : "inquiry-schema", path: issue.path.join(".") || "$", message: issue.message, severity: "error" })) }
  const value = parsed.data
  const normalized = normalizeInquiryOperations(value)
  return { schemaVersion: "authorization-inquiry-program/v1", status: "ready", mode: value.mode,
    ...normalized, originalDeclaration: structuredClone(value), ...(value.policy ? { policy: structuredClone(value.policy) } : {}),
    queue: normalized.operations.flatMap(o => INQUIRY_RELATIONS.map(kind => ({ id: `${encodeURIComponent(o.sourceQuestionId)}::${kind}`, questionId: o.sourceQuestionId, kind, question: questions[kind], state: "pending" as const }))), diagnostics: [] }
}
