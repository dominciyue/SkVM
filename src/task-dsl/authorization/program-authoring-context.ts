import type { ProgramMode } from "./executable-contract.ts"
import { projectProgramConsumption, type ProgramContext } from "./program-consumption-context.ts"
import type { ResourceProgramInputs } from "./resource-relations.ts"

type OriginalQuestion = { id: string; request?: string }
export const PROGRAM_AUTHORING_GOAL = "Continue authoring the source-supported resource relations requested by every original question. A current or computed partial program is not authoring completion. Inspect the current raw draft with authorization_program_details({view:'draft'}); use authorization_program_patch with its draftRevision, upsertSteps and an explicit complete stepOrder to insert steps before return. Repair mechanical gaps and read original source for missing meanings. Keep unsupported facts as named gaps. You may end with a partial program and a natural answer, explaining the remaining authoring work."

/** Presentation only. Output fields are computation, never semantic coverage. */
export function projectProgramAuthoring(report: any, questions: readonly OriginalQuestion[], remainingActions?: number, inputs: ResourceProgramInputs = {}) {
  const execution = report?.resourceExecution, scopeQuestion = report?.scope?.questionId
  const returned = execution?.returned
  const fields = returned && typeof returned === "object" && !Array.isArray(returned) ? Object.keys(returned) : []
  const raw = report?.currentDraft?.raw ?? report?.program, questionId = raw?.scope?.questionId ?? scopeQuestion
  const declaredNames: string[] = Array.isArray(raw?.resourceWorkflow?.inputs) ? raw.resourceWorkflow.inputs.filter((n: unknown) => typeof n === "string") : []
  const inputNames = typeof questionId === "string" ? Object.keys(inputs.resourceInputs?.[questionId] ?? {}) : []
  const suppliedScopes = [...new Set([...Object.keys(inputs.resourceInputs ?? {}), ...Object.keys(inputs.externalAssumptions ?? {})])].map(id => ({ questionId: id, inputNames: Object.keys(inputs.resourceInputs?.[id] ?? {}), externalAssumptionNames: [...new Set((inputs.externalAssumptions?.[id] ?? []).map(a => a.name))] }))
  return {
    goal: PROGRAM_AUTHORING_GOAL, completion: "unreviewed", activeRevision: report?.program ? report.revision : undefined,
    draftRevision: report?.currentDraft?.revision, candidateRevision: report?.candidate?.revision,
    candidateAdopted: report?.candidate?.adopted, candidatePreviewAvailable: !!report?.candidate?.resourceExecution,
    draftStepOrder: Array.isArray(report?.currentDraft?.raw?.resourceWorkflow?.steps) ? report.currentDraft.raw.resourceWorkflow.steps.map((s: any) => ({ id: s?.id, op: s?.op })) : undefined,
    computed: execution && { returned, termination: execution.termination, conditions: execution.conditions },
    gaps: execution?.gaps ?? [], diagnostics: report?.candidate?.diagnostics ?? report?.currentDraftDiagnostics ?? report?.diagnostics ?? [],
    inputBindings: { questionId, declaredNames, inputNames, missingDeclaredNames: declaredNames.filter(n => !inputNames.includes(n)), suppliedScopes, instruction: "Inputs and external assumptions are bound to exact original question IDs. Review the draft scope against the supplied scopes; facts from another question are not injected automatically. Missing names remain unknown. Read the original task for values and author only source-supported relations." },
    questions: questions.map(q => ({ questionId: q.id, request: q.request, computedFields: q.id === scopeQuestion ? fields : [], coverage: "unreviewed", remaining: q.id === scopeQuestion ? "Only the listed fields were computed; express the remaining requested source relations or retain named gaps." : "This resource program does not compute this original question; investigate and author relevant relations or retain the duty for natural explanation." })),
    remainingActions, tools: ["authorization_program", "authorization_program_patch", "authorization_program_details", "source_read", "source_symbol"],
  }
}

/** Shared mode-first context for native and structured provider entry points. */
export function projectProgramTaskContext(options: ResourceProgramInputs & { report?: any; draftReport?: any; questions: readonly OriginalQuestion[]; programMode?: ProgramMode; programContext?: ProgramContext; local?: any; evidence?: readonly any[]; remainingActions?: number }) {
  const mode = options.programMode ?? "consume", report = options.report ?? options.draftReport
  const local = options.local
  return {
    programMode: mode, currentStage: local?.focus?.stage ?? "source-investigation",
    executableContract: projectProgramConsumption(options.report, options.questions, options.programContext),
    ...(mode === "edit" ? { authoring: projectProgramAuthoring(report, options.questions, options.remainingActions, options) } : {}),
    sourceWindows: local?.sourceWindows ?? [],
    sourceIndex: (options.evidence ?? []).map(({ id, path, startLine, endLine, sha256 }) => ({ id, path, startLine, endLine, sha256 })),
    sourceCandidates: local?.pendingSourceWork ?? [],
    remainingDuties: options.questions.map(q => ({ questionId: q.id, request: q.request, semanticCoverage: "unreviewed" })),
  }
}
