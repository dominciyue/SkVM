import { z } from "zod"
import { CompactItemSchema, CompactCoverageSchema, CompactConditionSchema, normalizeCompactAuthorizationResult, type CompactAuthorizationNormalization } from "./compact-transport.ts"
import type { AuthorizationMethod } from "./method.ts"

export type AuthorizationWireVersion = "legacy" | "v4" | "v5"
export const POLICY_CONCLUSION = {
  satisfied: "source_refuted",
  violated: "source_supported_failure",
  undetermined: "unknown",
} as const
export type PolicyStatus = keyof typeof POLICY_CONCLUSION
export function mapPolicyStatus(status: PolicyStatus) { return POLICY_CONCLUSION[status] }
const Item = CompactItemSchema.omit({ conclusion: true }).extend({ policyStatus: z.enum(["satisfied", "violated", "undetermined"]) }).strict()
const Plain = z.object({ results: z.array(Item) }).strict()
const Ledger = z.object({ results: z.array(Item.extend({ coverage: z.array(CompactCoverageSchema) }).strict()) }).strict()
const Conditions = z.object({ results: z.array(Item.extend({ coverage: z.array(CompactCoverageSchema), condition: CompactConditionSchema }).strict()) }).strict()
export type PolicyAuthorizationResult = z.infer<typeof Plain> | z.infer<typeof Ledger> | z.infer<typeof Conditions>
export function policyAuthorizationSchema(method: AuthorizationMethod): z.ZodType<PolicyAuthorizationResult> {
  return method === "plain" ? Plain : method === "ledger" ? Ledger : Conditions
}
export interface PolicyAuthorizationNormalization extends Omit<CompactAuthorizationNormalization, "normalizerVersion" | "wireResult"> {
  normalizerVersion: "authorization-wire-normalizer/v5"
  wireResult?: PolicyAuthorizationResult
}
/** Mechanical label conversion only; source meaning remains model/evaluator-owned. */
export function normalizePolicyAuthorizationResult(input: Parameters<typeof normalizeCompactAuthorizationResult>[0]): PolicyAuthorizationNormalization {
  const base = { normalizerVersion: "authorization-wire-normalizer/v5" as const, canonicalResultVersion: "source-authorization-assessment-result/v0" as const }
  const parsed = policyAuthorizationSchema(input.method).safeParse(input.input)
  if (!parsed.success) return { ...base, status: "invalid", diagnostics: parsed.error.issues.map(issue => ({ code: "wire-schema-invalid", message: issue.message, path: issue.path.join(".") || "$", severity: "error" })) }
  const normalized = normalizeCompactAuthorizationResult({ ...input, input: { results: parsed.data.results.map(({ policyStatus, ...item }) => ({ ...item, conclusion: mapPolicyStatus(policyStatus) })) } })
  const { result, ...rest } = normalized
  return { ...rest, ...base, wireResult: parsed.data, ...(normalized.status === "valid" && result ? { result } : {}) }
}
