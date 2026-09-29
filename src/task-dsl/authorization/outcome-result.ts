import { z } from "zod"
import { CompactItemSchema, CompactCoverageSchema, CompactConditionSchema, normalizeCompactAuthorizationResult, type CompactAuthorizationNormalization } from "./compact-transport.ts"
import { ConditionalOutcomeSchema, compileConditionAnalysisRequest, validateConditionAnalysisResult, type AuthorizationConditionAnalysisResultV1, type ConditionAnalysisValidation } from "./conditions.ts"
import { assessmentConditionId } from "./assessment-contract.ts"
import type { AuthorizationAssessmentProgram } from "./assessment-program.ts"
import { mapPolicyStatus } from "./policy-result.ts"
import type { AuthorizationMethod } from "./method.ts"
import type { AuthorizationTransportDiagnostic } from "./transport.ts"
import type { AuthorizationTaskContractMode } from "./task-contract.ts"

const Text = z.string().trim().min(1)
const Decision = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("observed"), observed: z.enum(["allow", "deny", "unknown"]) }).strict(),
  z.object({ kind: z.literal("conditional-policy"), policyStatus: z.enum(["satisfied", "violated", "undetermined"]) }).strict(),
])
const Branch = ConditionalOutcomeSchema.omit({ obligationId: true, factPointers: true }).extend({ factIds: z.array(Text) }).strict()
const Item = CompactItemSchema.omit({ conclusion: true }).extend({ decision: Decision, branchResults: z.array(Branch) }).strict()
const Plain = z.object({ results: z.array(Item) }).strict()
const Ledger = z.object({ results: z.array(Item.extend({ coverage: z.array(CompactCoverageSchema) }).strict()) }).strict()
const Conditions = z.object({ results: z.array(Item.extend({ coverage: z.array(CompactCoverageSchema), condition: CompactConditionSchema }).strict()) }).strict()
export type OutcomeAuthorizationResult = z.infer<typeof Plain> | z.infer<typeof Ledger> | z.infer<typeof Conditions>
export function outcomeAuthorizationSchema(method: AuthorizationMethod): z.ZodType<OutcomeAuthorizationResult> {
  return method === "plain" ? Plain : method === "ledger" ? Ledger : Conditions
}

export function conclusionFromObservedDecision(expectation: "allow" | "deny", observed: "allow" | "deny" | "unknown"): "source_refuted" | "source_supported_failure" | "unknown" {
  return observed === "unknown" ? "unknown" : expectation === observed ? "source_refuted" : "source_supported_failure"
}
export function summarizeObservedPolicy(expectation: "allow" | "deny", observed: "allow" | "deny" | "unknown") {
  const status = observed === "unknown" ? "undetermined" as const : observed === expectation ? "satisfied" as const : "violated" as const
  return { expectation, observed, status, text: `Declared policy expects ${expectation}; supplied source behavior is ${observed}; policy comparison is ${status}.` }
}

export interface OutcomeAuthorizationNormalization extends Omit<CompactAuthorizationNormalization, "normalizerVersion" | "wireResult"> {
  normalizerVersion: "authorization-wire-normalizer/v6"
  wireResult?: OutcomeAuthorizationResult
  observedDecisions?: Array<{ obligationId: string; expectation: "allow" | "deny"; observed: "allow" | "deny" | "unknown"; derivedConclusion: "source_refuted" | "source_supported_failure" | "unknown" }>
  policySummaries?: Array<{ obligationId: string; expectation: "allow" | "deny"; observed: "allow" | "deny" | "unknown"; status: "satisfied" | "violated" | "undetermined"; text: string; modelExplanation: string }>
  requestedBranchAnalysis?: AuthorizationConditionAnalysisResultV1
  requestedBranchValidation?: ConditionAnalysisValidation
}

type CompactInput = Parameters<typeof normalizeCompactAuthorizationResult>[0]
const diagnostic = (code: string, message: string, path: string): AuthorizationTransportDiagnostic => ({ code, message, path, severity: "error" })
const branchKey = (assumptions: Array<{ conditionId: string; value: string }>) => JSON.stringify(assumptions.map(item => [item.conditionId, item.value]).sort(([a], [b]) => String(a).localeCompare(String(b))))

export function normalizeOutcomeAuthorizationResult(input: CompactInput & { program?: AuthorizationAssessmentProgram; taskContract?: AuthorizationTaskContractMode }): OutcomeAuthorizationNormalization {
  const base = { normalizerVersion: "authorization-wire-normalizer/v6" as const, canonicalResultVersion: "source-authorization-assessment-result/v0" as const }
  const parsed = outcomeAuthorizationSchema(input.method).safeParse(input.input)
  if (!parsed.success) return { ...base, status: "invalid", diagnostics: parsed.error.issues.map(issue => diagnostic("wire-schema-invalid", issue.message, issue.path.join(".") || "$")) }
  const wireResult = parsed.data
  const byId = new Map(input.compiled.runnableObligations.map(entry => [entry.id, entry]))
  const diagnostics: AuthorizationTransportDiagnostic[] = []
  const observedDecisions: NonNullable<OutcomeAuthorizationNormalization["observedDecisions"]> = []
  const policySummaries: NonNullable<OutcomeAuthorizationNormalization["policySummaries"]> = []
  const compactResults = wireResult.results.map((item, index) => {
    const { decision, branchResults: _branches, ...rest } = item
    const obligation = byId.get(item.obligationId)
    const expectation = obligation?.obligation.expectation
    if (expectation === "conditional" && decision.kind !== "conditional-policy") diagnostics.push(diagnostic("decision-kind-mismatch", "Conditional expectation requires conditional-policy decision.", `results.${index}.decision`))
    if ((expectation === "allow" || expectation === "deny") && decision.kind !== "observed") diagnostics.push(diagnostic("decision-kind-mismatch", "Unconditional expectation requires observed decision.", `results.${index}.decision`))
    const conclusion = decision.kind === "conditional-policy"
      ? mapPolicyStatus(decision.policyStatus)
      : expectation === "allow" || expectation === "deny"
        ? conclusionFromObservedDecision(expectation, decision.observed)
        : "unknown"
    if (decision.kind === "observed" && (expectation === "allow" || expectation === "deny")) {
      observedDecisions.push({ obligationId: item.obligationId, expectation, observed: decision.observed, derivedConclusion: conclusion })
      if (input.taskContract === "current-v1") {
        policySummaries.push({ obligationId: item.obligationId, ...summarizeObservedPolicy(expectation, decision.observed), modelExplanation: item.explanation })
        const labels = [...item.explanation.matchAll(/\b(?:source_supported_failure|source_refuted)\b/g)].map(match => match[0])
        if (labels.some(label => label !== conclusion)) diagnostics.push(diagnostic("policy-explanation-contradiction", `Model explanation names a conclusion opposite to the observed decision and declared ${expectation} expectation; preserve the explanation and correct the policy comparison.`, `results.${index}.explanation`))
      }
    }
    return { ...rest, conclusion }
  })
  const normalized = normalizeCompactAuthorizationResult({ ...input, input: { results: compactResults } })
  diagnostics.push(...normalized.diagnostics)
  let requestedBranchAnalysis: AuthorizationConditionAnalysisResultV1 | undefined
  let requestedBranchValidation: ConditionAnalysisValidation | undefined
  const requested = input.program?.entries.filter(entry => entry.requestedBranches.length > 0) ?? []
  const requestedById = new Map(requested.map(entry => [entry.obligationId, entry]))
  if (normalized.result) {
    const analyses: AuthorizationConditionAnalysisResultV1["analyses"] = []
    wireResult.results.forEach((item, index) => {
      const programEntry = requestedById.get(item.obligationId)
      if (!programEntry && item.branchResults.length) diagnostics.push(diagnostic("foreign-requested-branch", `No requested branches belong to ${item.obligationId}.`, `results.${index}.branchResults`))
      if (!programEntry) return
      const expected = new Map(programEntry.requestedBranches.map(branch => [branch.id, branch]))
      const seen = new Set<string>()
      const sortedFacts = [...item.facts].sort((a, b) => a.id.localeCompare(b.id))
      const counts = { entry: 0, binding: 0, control: 0, effect: 0, condition: 0 }
      const pointers = new Map<string, string>()
      for (const fact of sortedFacts) pointers.set(fact.id, `/results/${index}/facts/${fact.kind}/${counts[fact.kind]++}`)
      const branches = item.branchResults.map((branch, branchIndex) => {
        const path = `results.${index}.branchResults.${branchIndex}`
        const planned = expected.get(branch.id)
        if (!planned) diagnostics.push(diagnostic("foreign-requested-branch", `Branch ${branch.id} was not requested for ${item.obligationId}.`, `${path}.id`))
        if (seen.has(branch.id)) diagnostics.push(diagnostic("duplicate-requested-branch", `Branch ${branch.id} repeats.`, `${path}.id`))
        seen.add(branch.id)
        if (planned && branchKey(branch.assumptions) !== branchKey(planned.assumptions)) diagnostics.push(diagnostic("requested-branch-assumption-mismatch", `Branch ${branch.id} changes the declared counterfactual assumptions.`, `${path}.assumptions`))
        const factPointers = branch.factIds.map((id, factIndex) => {
          const pointer = pointers.get(id)
          if (!pointer) diagnostics.push(diagnostic("unknown-fact-id", `Fact id ${id} is not present in this obligation.`, `${path}.factIds.${factIndex}`))
          return pointer ?? ""
        })
        const { factIds: _ids, ...rest } = branch
        return { ...rest, obligationId: item.obligationId, factPointers }
      })
      for (const branch of programEntry.requestedBranches) if (!seen.has(branch.id)) diagnostics.push(diagnostic("missing-requested-branch", `Requested branch ${branch.id} is absent.`, `results.${index}.branchResults`))
      analyses.push({ obligationId: item.obligationId, branches, unexaminedConditionIds: [], completeness: "bounded", limitations: [] })
    })
    if (requested.length) {
      const requests = [...new Map(requested.map(entry => [entry.authorObligationId, entry])).entries()].map(([authorObligationId]) => {
        const authored = input.compiled.task.obligations.find(item => item.id === authorObligationId)!
        const conditions = authored.conditions.filter(condition => requested.some(entry => entry.authorObligationId === authorObligationId && entry.requestedBranches.some(branch => branch.assumptions.some(assumption => assumption.conditionId === assessmentConditionId(authorObligationId, condition.name)))))
        return { obligationId: authorObligationId, conditionBindings: conditions.map(condition => ({ id: assessmentConditionId(authorObligationId, condition.name), name: condition.name })), maxBranches: 12 }
      })
      const conditionPlan = compileConditionAnalysisRequest(input.compiled.task, { schemaVersion: "authorization-condition-analysis-request/v1", requests })
      requestedBranchAnalysis = { schemaVersion: "authorization-condition-analysis-result/v1", analyses }
      requestedBranchValidation = validateConditionAnalysisResult(conditionPlan, normalized.result, requestedBranchAnalysis)
      diagnostics.push(...requestedBranchValidation.diagnostics.map(item => diagnostic(item.code, item.message, item.path ?? "$")))
    }
  }
  const { result, wireResult: _compactWire, normalizerVersion: _version, ...rest } = normalized
  return { ...rest, ...base, status: diagnostics.length ? "invalid" : "valid", diagnostics, wireResult, observedDecisions,
    ...(input.taskContract === "current-v1" ? { policySummaries } : {}),
    ...(requestedBranchAnalysis ? { requestedBranchAnalysis } : {}),
    ...(requestedBranchValidation ? { requestedBranchValidation } : {}),
    ...(diagnostics.length === 0 && result ? { result } : {}),
  }
}
