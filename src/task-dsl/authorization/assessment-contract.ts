import { z } from "zod"

const Text = z.string().trim().min(1)
const Name = Text.refine(value => !["__proto__", "prototype", "constructor"].includes(value), "Use a safe declared name.")
const Value = z.enum(["true", "false", "unknown"])
const AuthorValue = z.union([z.boolean(), z.literal("unknown")])

export const AuthorAnalysisContractV1Schema = z.object({
  schemaVersion: z.literal("authorization-analysis-contract/v1"),
  publicInstruction: Text.optional(),
  scenarios: z.record(Name, z.object({
    boundary: z.enum(["declared-entry", "supplied-path", "deployment"]),
    premises: z.array(z.object({ id: Name, statement: Text, atEntry: Name, provenance: z.literal("task-assumption") }).strict()),
    requestedBranches: z.array(z.object({ id: Name, kind: z.literal("counterfactual"), assumptions: z.array(z.object({ condition: Name, value: AuthorValue }).strict()).min(1) }).strict()).max(12),
    requiredResponseDetails: z.array(Text),
  }).strict()).refine(value => Object.keys(value).length > 0, "Declare at least one scenario."),
}).strict()

export const AuthorizationAnalysisContractV1Schema = z.object({
  schemaVersion: z.literal("authorization-analysis-contract/v1"),
  publicInstruction: Text.optional(),
  scenarios: z.array(z.object({
    obligationId: Text,
    boundary: z.enum(["declared-entry", "supplied-path", "deployment"]),
    premises: z.array(z.object({ id: Name, statement: Text, atEntryId: Text, provenance: z.literal("task-assumption") }).strict()),
    requestedBranches: z.array(z.object({ id: Name, kind: z.literal("counterfactual"), assumptions: z.array(z.object({ conditionId: Text, value: Value }).strict()).min(1) }).strict()).max(12),
    requiredResponseDetails: z.array(Text),
  }).strict()).min(1),
}).strict()

export type AuthorAnalysisContractV1 = z.infer<typeof AuthorAnalysisContractV1Schema>
export type AuthorizationAnalysisContractV1 = z.infer<typeof AuthorizationAnalysisContractV1Schema>

export interface AssessmentContractDiagnostic { code: string; path: string; message: string; fix: string }
export interface AuthorScenarioBindings { obligationId: string; entries: Record<string, string>; conditions: Record<string, string> }

export function assessmentConditionId(obligationId: string, conditionName: string): string {
  return obligationId.startsWith("scenario:")
    ? `condition:${obligationId.slice("scenario:".length)}:${encodeURIComponent(conditionName)}`
    : `${obligationId}:condition:${encodeURIComponent(conditionName)}`
}

const diagnosticsFor = (path: string, message: string, code = "assessment-contract-invalid"): AssessmentContractDiagnostic => ({
  code, path, message, fix: "Use one declared scenario, entry, and condition name per bounded request; do not put expected effects in the contract.",
})
const sort = <T>(record: Record<string, T>) => Object.entries(record).sort(([a], [b]) => a.localeCompare(b))

export function lowerAuthorAnalysisContract(
  input: unknown,
  bindings: Record<string, AuthorScenarioBindings>,
): { status: "ready"; contract: AuthorizationAnalysisContractV1; diagnostics: [] } | { status: "needs-input"; diagnostics: AssessmentContractDiagnostic[] } {
  const parsed = AuthorAnalysisContractV1Schema.safeParse(input)
  if (!parsed.success) return { status: "needs-input", diagnostics: parsed.error.issues.map(issue => diagnosticsFor(`analysisContract.${issue.path.join(".")}`, issue.message)) }
  const diagnostics: AssessmentContractDiagnostic[] = []
  const scenarios: AuthorizationAnalysisContractV1["scenarios"] = []
  for (const [name, scenario] of sort(parsed.data.scenarios)) {
    const prefix = `analysisContract.scenarios.${name}`
    const binding = Object.hasOwn(bindings, name) ? bindings[name] : undefined
    if (!binding) {
      diagnostics.push(diagnosticsFor(prefix, `Scenario ${name} is not declared.`, "assessment-unknown-scenario"))
      continue
    }
    const premiseIds = new Set<string>()
    const premises: AuthorizationAnalysisContractV1["scenarios"][number]["premises"] = []
    scenario.premises.forEach((premise, index) => {
      if (premiseIds.has(premise.id)) diagnostics.push(diagnosticsFor(`${prefix}.premises.${index}.id`, `Premise id ${premise.id} repeats.`, "assessment-duplicate-premise"))
      premiseIds.add(premise.id)
      const atEntryId = Object.hasOwn(binding.entries, premise.atEntry) ? binding.entries[premise.atEntry] : undefined
      if (!atEntryId) diagnostics.push(diagnosticsFor(`${prefix}.premises.${index}.atEntry`, `Entry ${premise.atEntry} does not belong to scenario ${name}.`, "assessment-entry-mismatch"))
      else premises.push({ id: premise.id, statement: premise.statement, atEntryId, provenance: premise.provenance })
    })
    const branchIds = new Set<string>()
    const branchKeys = new Set<string>()
    const requestedBranches: AuthorizationAnalysisContractV1["scenarios"][number]["requestedBranches"] = []
    scenario.requestedBranches.forEach((branch, index) => {
      if (branchIds.has(branch.id)) diagnostics.push(diagnosticsFor(`${prefix}.requestedBranches.${index}.id`, `Branch id ${branch.id} repeats.`, "assessment-duplicate-branch-id"))
      branchIds.add(branch.id)
      const assigned = new Map<string, string>()
      const assumptions: AuthorizationAnalysisContractV1["scenarios"][number]["requestedBranches"][number]["assumptions"] = []
      branch.assumptions.forEach((assumption, position) => {
        const conditionId = Object.hasOwn(binding.conditions, assumption.condition) ? binding.conditions[assumption.condition] : undefined
        const assumptionPath = `${prefix}.requestedBranches.${index}.assumptions.${position}.condition`
        if (!conditionId) diagnostics.push(diagnosticsFor(assumptionPath, `Condition ${assumption.condition} does not belong to scenario ${name}.`, "assessment-condition-mismatch"))
        const value = String(assumption.value) as z.infer<typeof Value>
        if (assigned.has(assumption.condition)) diagnostics.push(diagnosticsFor(assumptionPath, `Condition ${assumption.condition} is assigned ${assigned.get(assumption.condition)} and ${value} in one branch.`, "assessment-repeated-assignment"))
        assigned.set(assumption.condition, value)
        if (conditionId) assumptions.push({ conditionId, value })
      })
      const key = JSON.stringify([...assigned.entries()].sort(([a], [b]) => a.localeCompare(b)))
      if (branchKeys.has(key)) diagnostics.push(diagnosticsFor(`${prefix}.requestedBranches.${index}`, `Branch ${branch.id} repeats an already requested assumption combination.`, "assessment-duplicate-branch"))
      branchKeys.add(key)
      requestedBranches.push({ id: branch.id, kind: branch.kind, assumptions: assumptions.sort((a, b) => a.conditionId.localeCompare(b.conditionId)) })
    })
    scenarios.push({ obligationId: binding.obligationId, boundary: scenario.boundary, premises: premises.sort((a, b) => a.id.localeCompare(b.id)), requestedBranches: requestedBranches.sort((a, b) => a.id.localeCompare(b.id)), requiredResponseDetails: scenario.requiredResponseDetails })
  }
  if (diagnostics.length) return { status: "needs-input", diagnostics: diagnostics.sort((a, b) => a.path.localeCompare(b.path)) }
  return { status: "ready", contract: AuthorizationAnalysisContractV1Schema.parse({ schemaVersion: "authorization-analysis-contract/v1", ...(parsed.data.publicInstruction ? { publicInstruction: parsed.data.publicInstruction } : {}), scenarios }), diagnostics: [] }
}
