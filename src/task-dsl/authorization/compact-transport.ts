import { z } from "zod"
import type { SourceBundle } from "../../benchmarks/authorization-dsl/inputs.ts"
import type { AuthorizationMethod } from "./method.ts"
import type { CompiledAuthorizationTask } from "./semantics.ts"
import type { AnalysisPlan } from "./relations.ts"
import { RelationCoverageSchema, validateRelationCoverage, type CoverageValidation, type RelationCoverage } from "./relation-result.ts"
import { ConditionAnalysisSchema, ConditionalOutcomeSchema, validateConditionAnalysisResult, type ConditionAnalysisPlan, type ConditionAnalysisValidation, type AuthorizationConditionAnalysisResultV1 } from "./conditions.ts"
import { AuthorizationWireCitationV1Schema, normalizeAuthorizationWireResult, type AuthorizationTransportDiagnostic, type AuthorizationWireNormalization } from "./transport.ts"

const Text = z.string().trim().min(1)
const Fact = z.object({ id: Text, kind: z.enum(["entry", "binding", "control", "effect", "condition"]), statement: Text, citations: z.array(AuthorizationWireCitationV1Schema).min(1) }).strict()
export const CompactCoverageSchema = RelationCoverageSchema.omit({ obligationId: true, factPointers: true }).extend({ factIds: z.array(Text) }).strict()
const Branch = ConditionalOutcomeSchema.omit({ obligationId: true, factPointers: true }).extend({ factIds: z.array(Text) }).strict()
export const CompactConditionSchema = ConditionAnalysisSchema.omit({ obligationId: true, branches: true }).extend({ branches: z.array(Branch).min(1) }).strict()
export const CompactItemSchema = z.object({ obligationId: Text, conclusion: z.enum(["source_supported_failure", "source_refuted", "unknown"]), explanation: Text, facts: z.array(Fact), decisiveMissingFacts: z.array(Text), suggestedObservations: z.array(Text) }).strict()
const Item = CompactItemSchema, Coverage = CompactCoverageSchema, Condition = CompactConditionSchema
const Plain = z.object({ results: z.array(Item) }).strict()
const Ledger = z.object({ results: z.array(Item.extend({ coverage: z.array(Coverage) }).strict()) }).strict()
const Conditions = z.object({ results: z.array(Item.extend({ coverage: z.array(Coverage), condition: Condition }).strict()) }).strict()
export type CompactAuthorizationResult = z.infer<typeof Plain> | z.infer<typeof Ledger> | z.infer<typeof Conditions>
export function compactAuthorizationSchema(method: AuthorizationMethod): z.ZodType<CompactAuthorizationResult> {
  return method === "plain" ? Plain : method === "ledger" ? Ledger : Conditions
}
export interface CompactAuthorizationNormalization extends Omit<AuthorizationWireNormalization, "normalizerVersion" | "wireResult"> {
  normalizerVersion: "authorization-wire-normalizer/v4"
  wireResult?: CompactAuthorizationResult
  coverage?: RelationCoverage[]
  coverageValidation?: CoverageValidation
  conditionAnalysis?: AuthorizationConditionAnalysisResultV1
  conditionValidation?: ConditionAnalysisValidation
}

export function normalizeCompactAuthorizationResult(input: {
  compiled: CompiledAuthorizationTask; sourceBundle: SourceBundle; method: AuthorizationMethod
  analysisPlan?: AnalysisPlan; conditionPlan?: ConditionAnalysisPlan; input: unknown
}): CompactAuthorizationNormalization {
  const base = { normalizerVersion: "authorization-wire-normalizer/v4" as const, canonicalResultVersion: "source-authorization-assessment-result/v0" as const }
  const parsed = compactAuthorizationSchema(input.method).safeParse(input.input)
  const diagnostics: AuthorizationTransportDiagnostic[] = []
  const add = (code: string, message: string, path: string) => diagnostics.push({ code, message, path, severity: "error" })
  if (!parsed.success) return { ...base, status: "invalid", diagnostics: parsed.error.issues.map(issue => ({ code: "wire-schema-invalid", message: issue.message, path: issue.path.join(".") || "$", severity: "error" })) }
  const coverage: RelationCoverage[] = []
  const conditionAnalysis: AuthorizationConditionAnalysisResultV1 = { schemaVersion: "authorization-condition-analysis-result/v1", analyses: [] }
  const pathMap = new Map<string, string>()
  const results = parsed.data.results.map((item, resultIndex) => {
    const facts = { entry: [], binding: [], control: [], effect: [], condition: [] } as Record<z.infer<typeof Fact>["kind"], Array<{ statement: string; citations: z.infer<typeof AuthorizationWireCitationV1Schema>[] }>>
    const pointers = new Map<string, string>()
    const indexed = item.facts.map((fact, index) => ({ fact, index })).sort((a, b) => a.fact.id.localeCompare(b.fact.id))
    for (const { fact, index } of indexed) {
      const pointer = `/results/${resultIndex}/facts/${fact.kind}/${facts[fact.kind].length}`
      if (pointers.has(fact.id)) add("duplicate-fact-id", `Fact id ${fact.id} is repeated within this obligation.`, `results.${resultIndex}.facts.${index}.id`)
      pointers.set(fact.id, pointer)
      pathMap.set(`results.${resultIndex}.facts.${fact.kind}.${facts[fact.kind].length}`, `results.${resultIndex}.facts.${index}`)
      facts[fact.kind].push({ statement: fact.statement, citations: fact.citations })
    }
    const bind = (ids: string[], fieldPath: string) => ids.map((id, index) => {
      const pointer = pointers.get(id)
      if (!pointer) add("unknown-fact-id", `Fact id ${id} is not present in this obligation. Cross-obligation references are forbidden.`, `${fieldPath}.${index}`)
      return pointer ?? ""
    })
    if ("coverage" in item) item.coverage.forEach((entry, i) => {
      pathMap.set(`coverage.${coverage.length}`, `results.${resultIndex}.coverage.${i}`)
      const { factIds, ...rest } = entry
      coverage.push({ ...rest, obligationId: item.obligationId, factPointers: bind(factIds, `results.${resultIndex}.coverage.${i}.factIds`) })
    })
    if ("condition" in item) {
      pathMap.set(`analyses.${conditionAnalysis.analyses.length}`, `results.${resultIndex}.condition`)
      conditionAnalysis.analyses.push({ ...item.condition, obligationId: item.obligationId, branches: item.condition.branches.map(({ factIds, ...branch }, i) => ({ ...branch, obligationId: item.obligationId, factPointers: bind(factIds, `results.${resultIndex}.condition.branches.${i}.factIds`) })) })
    }
    return { obligationId: item.obligationId, conclusion: item.conclusion, explanation: item.explanation, facts, decisiveMissingFacts: item.decisiveMissingFacts, suggestedObservations: item.suggestedObservations }
  })
  if (diagnostics.length) return { ...base, status: "invalid", diagnostics, wireResult: parsed.data }
  const normalized = normalizeAuthorizationWireResult({ compiled: input.compiled, sourceBundle: input.sourceBundle, input: {
    schemaVersion: "source-authorization-assessment-wire/v1", results,
    scopeClaim: { kind: "declared-obligations-only", statement: "Only declared obligations and supplied fixed source are assessed; discovery is not tested." },
  } })
  const remap = (field: string) => {
    for (const [from, to] of pathMap) if (field === from || field.startsWith(`${from}.`)) return `${to}${field.slice(from.length)}`.replace(".factPointers", ".factIds")
    return field
  }
  diagnostics.push(...normalized.diagnostics.map(d => ({ ...d, path: remap(d.path) })))
  const coverageValidation = normalized.result && input.analysisPlan ? validateRelationCoverage(input.analysisPlan, normalized.result, coverage) : undefined
  const conditionValidation = normalized.result && input.conditionPlan ? validateConditionAnalysisResult(input.conditionPlan, normalized.result, conditionAnalysis) : undefined
  for (const d of [...(coverageValidation?.diagnostics ?? []), ...(conditionValidation?.diagnostics ?? [])]) add(d.code, d.message, remap(d.path ?? "$"))
  if (input.method !== "plain" && !input.analysisPlan) add("analysis-plan-not-ready", "Structured compact output requires an analysis plan.", "analysisPlan")
  if (input.method === "conditions" && !input.conditionPlan) add("condition-plan-not-ready", "Conditions compact output requires a condition plan.", "conditionPlan")
  return { ...normalized, ...base, status: diagnostics.length ? "invalid" : "valid", diagnostics, wireResult: parsed.data,
    ...(input.method !== "plain" ? { coverage, coverageValidation } : {}),
    ...(input.method === "conditions" ? { conditionAnalysis, conditionValidation } : {}),
  }
}
