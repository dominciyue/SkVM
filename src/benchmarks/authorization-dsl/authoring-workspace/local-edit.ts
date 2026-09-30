import { z } from "zod"
import { AuthorizationAuthoringInputV2Schema, type AuthorizationAuthoringInputV2 } from "../authoring-v2.ts"
import { normalizeAuthorizationAuthoringInput } from "../authoring.ts"

const Text = z.string().trim().min(1)
const SetPolicy = z.object({ text: Text.optional(), location: Text.optional(), revision: Text.optional(), reason: Text.optional() }).strict()
  .refine(value => Object.keys(value).length > 0, "Set at least one policy property.")
const SetScenario = z.object({ relation: Text.optional(), expectation: z.enum(["allow", "deny", "conditional"]).optional(), operation: Text.optional() }).strict()
  .refine(value => Object.keys(value).length > 0, "Set at least one scenario property.")

export const AuthorizationLocalEditRequestSchema = z.object({
  schemaVersion: z.literal("authorization-local-edit/v1"),
  reason: Text,
  operations: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("policy"), key: Text, set: SetPolicy }).strict(),
    z.object({ kind: z.literal("scenario"), key: Text, set: SetScenario }).strict(),
    z.object({ kind: z.literal("premise"), scenarioKey: Text, premiseId: Text, statement: Text }).strict(),
    z.object({ kind: z.literal("request"), statement: Text }).strict(),
    z.object({ kind: z.literal("public-instruction"), statement: Text }).strict(),
    z.object({ kind: z.literal("response-detail"), scenarioKey: Text, index: z.number().int().nonnegative(), statement: Text }).strict(),
  ])).min(1),
}).strict()
export type AuthorizationLocalEditRequest = z.infer<typeof AuthorizationLocalEditRequestSchema>
export interface AuthorizationLocalEditDiagnostic { code: string; path: string; message: string }
export interface AuthorizationLocalEditResult {
  schemaVersion: "authorization-local-edit-result/v1"
  status: "ready" | "needs-input"
  value?: AuthorizationAuthoringInputV2
  draft?: AuthorizationAuthoringInputV2
  changedPaths: string[]
  suppliedPaths: string[]
  affectedScenarios: string[]
  affectedText: string[]
  reviewNotes: Array<{ scenarioKey: string; message: string }>
  diagnostics: AuthorizationLocalEditDiagnostic[]
}

/** Apply a bounded patch to a v2 declaration; this never reads source or guesses policy semantics. */
export function applyAuthorizationLocalEdit(base: unknown, request: unknown): AuthorizationLocalEditResult {
  const result: AuthorizationLocalEditResult = { schemaVersion: "authorization-local-edit-result/v1", status: "needs-input",
    changedPaths: [], suppliedPaths: [], affectedScenarios: [], affectedText: [], reviewNotes: [], diagnostics: [] }
  const parsedBase = AuthorizationAuthoringInputV2Schema.safeParse(base)
  const parsedRequest = AuthorizationLocalEditRequestSchema.safeParse(request)
  if (!parsedBase.success) result.diagnostics.push(...parsedBase.error.issues.map(issue => ({ code: "local-edit-base-invalid", path: issue.path.join(".") || "$", message: issue.message })))
  if (!parsedRequest.success) result.diagnostics.push(...parsedRequest.error.issues.map(issue => ({ code: "local-edit-schema-invalid", path: issue.path.join(".") || "$", message: issue.message })))
  if (!parsedBase.success || !parsedRequest.success) return result
  const original = parsedBase.data
  const value = structuredClone(original)
  const supplied = new Set<string>()
  const values = new Map<string, { before: unknown; after: unknown }>()
  const affected = new Set<string>()
  const editedPolicies = new Set<string>()
  const diagnostic = (code: string, path: string, message: string) => result.diagnostics.push({ code, path, message })
  const claim = (field: string): boolean => {
    if (supplied.has(field)) { diagnostic("duplicate-local-edit", field, `Property ${field} was assigned more than once.`); return false }
    supplied.add(field)
    return true
  }
  for (const operation of parsedRequest.data.operations) {
    if (operation.kind === "policy") {
      if (!Object.hasOwn(value.policies, operation.key)) { diagnostic("unknown-local-edit-target", `policies.${operation.key}`, "Policy key is not declared."); continue }
      editedPolicies.add(operation.key)
      for (const [field, next] of Object.entries(operation.set)) {
        const name = `policies.${operation.key}.${field}`
        if (claim(name)) {
          const target = value.policies[operation.key] as unknown as Record<string, unknown>
          values.set(name, { before: target[field], after: next })
          target[field] = next
        }
      }
    } else if (operation.kind === "scenario") {
      if (!Object.hasOwn(value.scenarios, operation.key)) { diagnostic("unknown-local-edit-target", `scenarios.${operation.key}`, "Scenario key is not declared."); continue }
      affected.add(operation.key)
      for (const [field, next] of Object.entries(operation.set)) {
        const name = `scenarios.${operation.key}.${field}`
        if (claim(name)) {
          const target = value.scenarios[operation.key] as unknown as Record<string, unknown>
          values.set(name, { before: target[field], after: next })
          target[field] = next
        }
      }
      if (Object.hasOwn(operation.set, "relation")) result.reviewNotes.push({ scenarioKey: operation.key,
        message: "Review this scenario's premises and public instruction against the changed relation; source semantics are not inferred." })
    } else if (operation.kind === "premise") {
      const scenario = value.analysisContract?.scenarios[operation.scenarioKey]
      const premise = scenario?.premises.find(item => item.id === operation.premiseId)
      if (!premise) { diagnostic("unknown-local-edit-target", `analysisContract.scenarios.${operation.scenarioKey}.premises.${operation.premiseId}`, "Premise id is not declared for this scenario."); continue }
      affected.add(operation.scenarioKey)
      const name = `analysisContract.scenarios.${operation.scenarioKey}.premises.${operation.premiseId}.statement`
      if (claim(name)) {
        values.set(name, { before: premise.statement, after: operation.statement })
        premise.statement = operation.statement
      }
    } else if (operation.kind === "request") {
      for (const key of Object.keys(value.scenarios)) affected.add(key)
      if (claim("request")) { values.set("request", { before: value.request, after: operation.statement }); value.request = operation.statement }
    } else if (operation.kind === "public-instruction") {
      const contract = value.analysisContract, name = "analysisContract.publicInstruction"
      if (contract?.publicInstruction === undefined) { diagnostic("unknown-local-edit-target", name, "Public instruction is not declared."); continue }
      for (const key of Object.keys(value.scenarios)) affected.add(key)
      if (claim(name)) { values.set(name, { before: contract.publicInstruction, after: operation.statement }); contract.publicInstruction = operation.statement }
    } else {
      const details = value.analysisContract?.scenarios[operation.scenarioKey]?.requiredResponseDetails
      const name = `analysisContract.scenarios.${operation.scenarioKey}.requiredResponseDetails.${operation.index}`
      if (!details || operation.index >= details.length) { diagnostic("unknown-local-edit-target", name, "Response detail index is not declared."); continue }
      affected.add(operation.scenarioKey)
      if (claim(name)) { values.set(name, { before: details[operation.index], after: operation.statement }); details[operation.index] = operation.statement }
    }
  }
  for (const [scenarioKey, scenario] of Object.entries(value.scenarios)) {
    if (!editedPolicies.has(scenario.policy)) continue
    affected.add(scenarioKey)
    if (!supplied.has(`scenarios.${scenarioKey}.expectation`)) diagnostic("policy-expectation-review-required", `scenarios.${scenarioKey}.expectation`,
      `Policy ${scenario.policy} changed; explicitly supply this scenario's expectation, including if it stays the same.`)
  }
  result.suppliedPaths = [...supplied].sort()
  result.affectedScenarios = [...affected].sort()
  result.affectedText = [...new Set(result.affectedScenarios.flatMap(key => [
    `policies.${value.scenarios[key]!.policy}.reason`,
    ...(value.analysisContract?.publicInstruction !== undefined ? ["analysisContract.publicInstruction"] : []),
    ...(value.analysisContract?.scenarios[key]?.requiredResponseDetails.map((_text, i) => `analysisContract.scenarios.${key}.requiredResponseDetails.${i}`) ?? []),
  ]))].sort()
  for (const scenarioKey of result.affectedScenarios) result.reviewNotes.push({ scenarioKey, message: "Review affectedText against the current declared policy and premises; unassigned free text is preserved, and semantic consistency is not inferred." })
  result.changedPaths = result.suppliedPaths.filter(field => {
    const pair = values.get(field)!
    return JSON.stringify(pair.before) !== JSON.stringify(pair.after)
  })
  result.draft = value
  if (result.diagnostics.length) return result
  const lowered = normalizeAuthorizationAuthoringInput(value)
  if (lowered.status !== "ready") {
    result.diagnostics.push(...lowered.diagnostics.map(item => ({ code: item.code, path: item.path, message: item.message })))
    return result
  }
  result.status = "ready"
  result.value = value
  return result
}
