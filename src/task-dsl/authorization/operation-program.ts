import { AuthorizationInquiryV2Schema, type AuthorizationInquiry, type InquiryQuestion, type ObligationIntent } from "./inquiry.ts"

export const NativeInquiryMethods = ["M", "D1"] as const
export function parseNativeInquiryMethod(value: unknown): typeof NativeInquiryMethods[number] | undefined {
  if (value === undefined) return undefined
  if (value === "M" || value === "D1") return value
  throw new Error("authorization-method must be M or D1")
}

export interface InquiryOperation { id: string; request: string; entryHint?: string; sourceQuestionId: string; explicit: boolean }
export interface OperationQuestion { questionId: string; operationId: string; intent: ObligationIntent }
/** The ordinary natural frontend preserves one full task, without source hints or model answers. */
export function normalizeNaturalOperation(brief: string, mode: "behavior" | "conformance", policy?: AuthorizationInquiry["policy"], options: { allowMissingPolicy?: boolean } = {}) {
  const value = AuthorizationInquiryV2Schema.parse({ schemaVersion: "authorization-inquiry/v2", mode: options.allowMissingPolicy && mode === "conformance" && !policy ? "behavior" : mode, operations: [{ id: "operation-1", request: brief }], questions: [{ id: "q1", operationId: "operation-1", intent: "behavior", request: brief, premises: [] }], ...(policy ? { policy: structuredClone(policy) } : {}) })
  return { ...value, mode }
}
/** v1 never guesses grouping. v2 declares shared work, not a verified source identity. */
export function normalizeInquiryOperations(input: AuthorizationInquiry) {
  const operations: InquiryOperation[] = input.schemaVersion === "authorization-inquiry/v2"
    ? input.operations.map(o => ({ ...o, sourceQuestionId: (input.questions.find(q => q.operationId === o.id && q.intent === "behavior") ?? input.questions.find(q => q.operationId === o.id))!.id, explicit: true }))
    : input.questions.map(q => ({ id: `question:${q.id}`, request: q.operation ?? q.request, ...(q.entryHint !== undefined ? { entryHint: q.entryHint } : {}), sourceQuestionId: q.id, explicit: false }))
  const operationQuestions: OperationQuestion[] = input.questions.map(q => ({ questionId: q.id, operationId: "operationId" in q ? q.operationId : `question:${q.id}`, intent: "intent" in q ? q.intent : "behavior" }))
  const questions: InquiryQuestion[] = input.questions.map(q => {
    const relation = operationQuestions.find(r => r.questionId === q.id)!, operation = operations.find(o => o.id === relation.operationId)!
    const entryHint = operation.entryHint ?? q.entryHint
    return { ...structuredClone(q), ...(operation.explicit ? { ...(entryHint !== undefined ? { entryHint } : {}), operation: q.operation ?? operation.request } : {}) }
  })
  return { operations, operationQuestions, questions }
}
