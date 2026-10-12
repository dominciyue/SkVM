import { z } from "zod"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import type { ResourceProgramInputs } from "./resource-relations.ts"

export const ProgramInputBindingSchema = z.object({ questionId: InquiryText }).strict()
type BindingProgram = { questions: readonly { id: string }[]; operationQuestions?: readonly { questionId: string; operationId: string }[] }

/** Select only explicit scenario data. Never merge question premises, policy or
 * property inputs, infer operations from names, or choose an available dataset. */
export function resolveProgramInputBinding(raw: any, program: BindingProgram, inputs: ResourceProgramInputs = {}) {
  const scopeQuestionId: string | undefined = raw?.scope?.questionId
  const explicit = raw != null && Object.hasOwn(raw, "inputBinding")
  const parsed = explicit ? ProgramInputBindingSchema.safeParse(raw.inputBinding) : undefined
  const inputQuestionId = parsed?.success ? parsed.data.questionId : scopeQuestionId
  const origin = explicit ? "explicit" as const : "scope-default" as const
  const diagnostics: InquiryDiagnostic[] = []
  const fail = (code: string, message: string, severity: InquiryDiagnostic["severity"] = "error") => diagnostics.push({ code: `program-input-${code}`, path: explicit ? "inputBinding.questionId" : "scope.questionId", questionId: scopeQuestionId, message, severity })
  if (parsed && !parsed.success) fail("shape", parsed.error.message)
  else if (!scopeQuestionId || !program.questions.some(q => q.id === scopeQuestionId) || !program.questions.some(q => q.id === inputQuestionId)) fail("question-missing", "Both semantic scope and input binding must reference current original question IDs.")
  else if (explicit) {
    const scopeOperations = program.operationQuestions?.filter(q => q.questionId === scopeQuestionId) ?? []
    const inputOperations = program.operationQuestions?.filter(q => q.questionId === inputQuestionId) ?? []
    if (!scopeOperations.length || !inputOperations.length) fail("operation-missing", "Explicit input binding needs both questions' current operationQuestions mapping.")
    else if (scopeOperations.length !== 1 || inputOperations.length !== 1) fail("operation-ambiguous", "Each bound question must have one unambiguous current operation mapping.")
    else if (scopeOperations[0]!.operationId !== inputOperations[0]!.operationId || raw.scope.operationId && raw.scope.operationId !== scopeOperations[0]!.operationId) fail("operation-mismatch", "Input binding cannot cross an operation or contradict the semantic scope operation.")
  }
  const hasInputs = !!inputQuestionId && Object.hasOwn(inputs.resourceInputs ?? {}, inputQuestionId)
  const hasExternal = !!inputQuestionId && Object.hasOwn(inputs.externalAssumptions ?? {}, inputQuestionId)
  const datasetPresent = hasInputs || hasExternal
  if (!diagnostics.length && !datasetPresent) fail("dataset-missing", `No scenario dataset exists for ${inputQuestionId}; missing values remain unknown. Select an explicit same-operation dataset when supplied.`, explicit ? "error" : "warning")
  const valid = !diagnostics.some(d => d.severity === "error")
  return { scopeQuestionId, inputQuestionId, origin, datasetPresent, diagnostics,
    resourceInputs: valid && hasInputs ? structuredClone(inputs.resourceInputs![inputQuestionId!]!) : {},
    externalAssumptions: valid && hasExternal ? structuredClone(inputs.externalAssumptions![inputQuestionId!]!) : [] }
}
export type ProgramInputResolution = ReturnType<typeof resolveProgramInputBinding>
export function programInputBindingSummary(resolution: ProgramInputResolution) {
  const { resourceInputs: _inputs, externalAssumptions: _external, ...summary } = resolution
  return summary
}
