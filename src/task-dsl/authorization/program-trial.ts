import { z } from "zod"
import { compileExecutableContract, type ExecutableContractCompilation } from "./executable-contract.ts"
import { createProgramDraft, type ProgramDraft } from "./resource-program-draft.ts"
import { ExternalAssumptionsSchema, ResourceInputsSchema } from "./resource-relations.ts"
import { resolveProgramInputBinding } from "./program-input-binding.ts"

const id = z.string().min(1).max(256)
export const ProgramTrialSchema = z.object({ expectedRevision: id, cases: z.array(z.object({ id, operationId: id.optional(), resourceInputs: ResourceInputsSchema, externalAssumptions: ExternalAssumptionsSchema.default([]) }).strict()).min(1).max(4) }).strict().refine(v => new Set(v.cases.map(c => c.id)).size === v.cases.length, "Trial case IDs must be unique")
type CompileOptions = Parameters<typeof compileExecutableContract>[1]
export type ProgramTrialOptions = { draft?: ProgramDraft; candidate?: ExecutableContractCompilation; candidateRevision?: string; compileOptions: CompileOptions; remainingUnits: number }

/** Read-only batch over the current compiler candidate, never a raw-code executor. */
export async function runProgramTrial(raw: unknown, options: ProgramTrialOptions) {
  const fail = (code: string, message: string) => ({ status: "rejected" as const, revision: options.draft?.revision, units: Math.min(1, Math.max(0, options.remainingUnits)), diagnostics: [{ code: `program-trial-${code}`, message }], cases: [] as any[], requestOperationCertified: false as const })
  const parsed = ProgramTrialSchema.safeParse(raw)
  if (!parsed.success) return fail("shape", parsed.error.message)
  const { draft, candidate, compileOptions } = options, request = parsed.data
  if (!draft) return fail("draft-missing", "Submit and compile a current draft before trial.")
  if (draft.revision !== request.expectedRevision || createProgramDraft(draft.raw).revision !== draft.revision) return fail("stale", "Inspect the exact current draft revision before trial.")
  if (!candidate || !("contract" in candidate) || !candidate.contract?.resourceWorkflow || options.candidateRevision !== draft.revision) return fail("candidate-missing", "Compile this draft against current source first; no arbitrary raw workflow is accepted.")
  const q = candidate.contract.scope.questionId, mappings = compileOptions.program.operationQuestions?.filter(o => o.questionId === q) ?? []
  const operationId = mappings.length === 1 ? mappings[0]!.operationId : candidate.contract.scope.operationId ?? `question:${q}`
  if (mappings.length > 1 || request.cases.some(c => c.operationId !== undefined && c.operationId !== operationId)) return fail("operation", "Cases must use the current contract's same unambiguous operation.")
  if (request.cases.length > options.remainingUnits) return fail("budget", "Each trial case costs one remaining exploration unit; the batch was not executed.")
  const sources = [candidate.contract.scope.root, ...candidate.contract.sourceDeclarations.map(d => d.source), ...candidate.contract.resourceWorkflow.steps.flatMap((s: any) => [s?.source, ...(s?.sources ?? [])])]
  const verification = await compileOptions.tools.verifyCurrentSources(sources.flatMap(at => typeof at?.path === "string" ? [at.path] : []))
  if (!verification.valid) return { ...fail(verification.code === "read-budget" ? "read-budget" : "source-changed", verification.message ?? verification.code ?? "Source verification failed"), sourceVerification: verification }
  const cases = []
  for (const item of request.cases) {
    const dataQuestion = candidate.contract.inputBinding?.questionId ?? q
    const inputResolution = resolveProgramInputBinding(draft.raw, compileOptions.program, { resourceInputs: { [dataQuestion]: item.resourceInputs }, externalAssumptions: { [dataQuestion]: item.externalAssumptions } })
    try {
      const compiled = await compileExecutableContract(draft.raw, { ...compileOptions, resourceInputs: inputResolution.resourceInputs, externalAssumptions: inputResolution.externalAssumptions, inputResolution })
      cases.push({ id: item.id, operationId, inputOrigin: "unreviewed-trial-facts", status: "resourceExecution" in compiled && compiled.resourceExecution ? "executed" : "unavailable", diagnostics: compiled.diagnostics, execution: "resourceExecution" in compiled ? compiled.resourceExecution : undefined, requestOperationCertified: false })
    } catch (error) {
      cases.push({ id: item.id, operationId, inputOrigin: "unreviewed-trial-facts", status: "unavailable", diagnostics: [{ code: "program-trial-case-failed", path: `cases.${item.id}`, severity: "error", message: String(error).slice(0, 2000) }], execution: undefined, requestOperationCertified: false })
    }
  }
  return { status: "completed" as const, revision: draft.revision, units: cases.length, sourceVerification: verification, diagnostics: [], cases, requestOperationCertified: false as const }
}
