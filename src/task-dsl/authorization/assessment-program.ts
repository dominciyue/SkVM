import type { AuthorizationTaskV0 } from "./schema.ts"
import { compileAuthorizationTask } from "./semantics.ts"
import { AuthorizationAnalysisContractV1Schema, assessmentConditionId, type AuthorizationAnalysisContractV1 } from "./assessment-contract.ts"

export interface AuthorizationAssessmentProgram {
  schemaVersion: "authorization-assessment-program/v1"
  entries: Array<{
    obligationId: string
    authorObligationId: string
    entryId: string
    boundary: "declared-entry" | "supplied-path" | "deployment"
    premises: Array<{ id: string; statement: string; atEntryId: string; provenance: "task-assumption" }>
    requestedBranches: Array<{ id: string; authorBranchId: string; assumptions: Array<{ conditionId: string; value: "true" | "false" | "unknown" }> }>
    requiredResponseDetails: string[]
  }>
}

export interface AssessmentProgramDiagnostic { code: string; path: string; message: string }

export function compileAuthorizationAssessmentProgram(task: AuthorizationTaskV0, input: unknown): {
  status: "ready" | "needs-input"
  program: AuthorizationAssessmentProgram
  contract?: AuthorizationAnalysisContractV1
  diagnostics: AssessmentProgramDiagnostic[]
} {
  const program: AuthorizationAssessmentProgram = { schemaVersion: "authorization-assessment-program/v1", entries: [] }
  const parsed = AuthorizationAnalysisContractV1Schema.safeParse(input)
  if (!parsed.success) return { status: "needs-input", program, diagnostics: parsed.error.issues.map(issue => ({ code: "assessment-contract-schema-invalid", path: `analysisContract.${issue.path.join(".")}`, message: issue.message })) }
  const contract = parsed.data
  const compiled = compileAuthorizationTask(task)
  const diagnostics: AssessmentProgramDiagnostic[] = []
  const seen = new Set<string>()
  contract.scenarios.forEach((scenario, index) => {
    const prefix = `analysisContract.scenarios.${index}`
    if (seen.has(scenario.obligationId)) diagnostics.push({ code: "assessment-duplicate-obligation", path: `${prefix}.obligationId`, message: `Obligation ${scenario.obligationId} appears twice.` })
    seen.add(scenario.obligationId)
    const expanded = compiled.runnableObligations.filter(entry => entry.authorObligationId === scenario.obligationId)
    if (!expanded.length) {
      diagnostics.push({ code: "assessment-obligation-not-runnable", path: `${prefix}.obligationId`, message: `Obligation ${scenario.obligationId} has no runnable declared entry.` })
      return
    }
    const authored = expanded[0]!.obligation
    const conditionIds = new Set(authored.conditions.map(condition => assessmentConditionId(scenario.obligationId, condition.name)))
    const entryIds = new Set(expanded.map(entry => entry.entryId))
    const premiseIds = new Set<string>()
    scenario.premises.forEach((premise, premiseIndex) => {
      if (premiseIds.has(premise.id)) diagnostics.push({ code: "assessment-duplicate-premise", path: `${prefix}.premises.${premiseIndex}.id`, message: `Premise id ${premise.id} repeats.` })
      premiseIds.add(premise.id)
      if (!entryIds.has(premise.atEntryId)) diagnostics.push({ code: "assessment-entry-mismatch", path: `${prefix}.premises.${premiseIndex}.atEntryId`, message: `Entry ${premise.atEntryId} does not belong to ${scenario.obligationId}.` })
    })
    const branchIds = new Set<string>()
    const branchCombinations = new Set<string>()
    scenario.requestedBranches.forEach((branch, branchIndex) => {
      if (branchIds.has(branch.id)) diagnostics.push({ code: "assessment-duplicate-branch-id", path: `${prefix}.requestedBranches.${branchIndex}.id`, message: `Branch id ${branch.id} repeats.` })
      branchIds.add(branch.id)
      const assignments = new Map<string, string>()
      branch.assumptions.forEach((assumption, assumptionIndex) => {
        const assumptionPath = `${prefix}.requestedBranches.${branchIndex}.assumptions.${assumptionIndex}.conditionId`
        if (!conditionIds.has(assumption.conditionId)) diagnostics.push({ code: "assessment-condition-mismatch", path: assumptionPath, message: `Condition ${assumption.conditionId} does not belong to ${scenario.obligationId}.` })
        if (assignments.has(assumption.conditionId)) diagnostics.push({ code: "assessment-repeated-assignment", path: assumptionPath, message: `Condition ${assumption.conditionId} is assigned more than once.` })
        assignments.set(assumption.conditionId, assumption.value)
      })
      const combination = JSON.stringify([...assignments.entries()].sort(([a], [b]) => a.localeCompare(b)))
      if (branchCombinations.has(combination)) diagnostics.push({ code: "assessment-duplicate-branch", path: `${prefix}.requestedBranches.${branchIndex}`, message: `Branch ${branch.id} repeats an already requested assumption combination.` })
      branchCombinations.add(combination)
    })
    for (const entry of expanded) program.entries.push({
      obligationId: entry.id,
      authorObligationId: scenario.obligationId,
      entryId: entry.entryId,
      boundary: scenario.boundary,
      premises: scenario.premises.filter(premise => premise.atEntryId === entry.entryId),
      requestedBranches: scenario.requestedBranches.map(branch => ({ id: `${entry.id}::branch:${encodeURIComponent(branch.id)}`, authorBranchId: branch.id, assumptions: branch.assumptions })),
      requiredResponseDetails: scenario.requiredResponseDetails,
    })
  })
  if (diagnostics.length) program.entries = []
  program.entries.sort((a, b) => a.obligationId.localeCompare(b.obligationId))
  return { status: diagnostics.length ? "needs-input" : "ready", program, contract, diagnostics }
}
