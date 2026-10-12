import { createHash } from "node:crypto"
import { z } from "zod"

export type ProgramContext = "full" | "compact"
export const ProgramDetailsSchema = z.object({ stepId: z.string().min(1).max(256).optional(), questionId: z.string().min(1).max(256).optional(), view: z.enum(["active", "draft"]).default("active"), expectedRevision: z.string().min(1).max(256).optional() }).strict()
const revision = (v: unknown) => createHash("sha256").update(JSON.stringify(v) ?? "null").digest("hex")
const propertySummary = (evaluation: any) => evaluation && { revision: evaluation.revision, questions: evaluation.questions?.map((q: any) => ({ questionId: q.questionId, properties: q.properties?.map((p: any) => ({ id: p.id ?? p.propertyId, status: p.status, value: p.value, gaps: p.gaps })) })) }

/** Pure presentation of existing host results; no evaluation or source inference. */
export function projectProgramConsumption(report: any, questions: readonly { id: string; request?: string }[], mode: ProgramContext = "full") {
  if (!report || mode === "full") return report
  const execution = report.resourceExecution, events: any[] = execution?.events ?? []
  return { schemaVersion: "authorization-program-context/v1", programId: report.program?.id, revision: report.revision, inputRevision: revision(execution?.inputs), draftRevision: report.currentDraft?.revision, status: report.status, programMode: report.programMode, origin: report.origin, scope: report.scope,
    inputBinding: report.inputBinding, termination: execution?.termination, returned: execution?.returned, conditions: execution?.conditions, gaps: execution?.gaps ?? [],
    // Current values alone cannot explain a different input or an unexecuted branch.
    // Keep authored rules once, without copied input populations or candidate history.
    rules: (report.program?.resourceWorkflow?.steps ?? []).map((s: any) => s && typeof s === "object" ? Object.fromEntries(["id", "op", "when", "value", "from", "where", "order", "unique", "test", "failure", "principal", "resource", "permission", "name", "arguments", "source", "sources", "because"].filter(k => s[k] !== undefined).map(k => [k, s[k]])) : { invalidStep: s }),
    steps: events.map(e => ({ id: e.id, op: e.op, outcome: e.outcome, value: e.outputs?.value, known: e.outputs?.known, source: e.source, sources: e.sources, gaps: e.gaps, meaningOrigin: e.meaningOrigin, ...(e.op === "guard" ? { guard: { principal: e.inputs.principal, resource: e.inputs.resource, permission: e.inputs.permission, test: e.inputs.test } } : {}), ...(e.op === "external" ? { external: { name: e.inputs.name, arguments: e.inputs.arguments, assumption: e.inputs.assumption } } : {}) })),
    questions: questions.map(q => ({ questionId: q.id, request: q.request, resourceStepIds: q.id === report.scope?.questionId ? events.map(e => e.id) : [], responsibility: q.id === report.scope?.questionId ? "Authored finite summary; retain upstream and remaining gaps." : "Not computed by this resource workflow; original source investigation remains." })),
    diagnostics: report.diagnostics, propertyChecks: propertySummary(report.evaluation), candidate: report.candidate && { revision: report.candidate.revision, adopted: report.candidate.adopted, diagnostics: report.candidate.diagnostics, returned: report.candidate.resourceExecution?.returned, gaps: report.candidate.resourceExecution?.gaps },
    semanticSupport: "unreviewed", requestOperationCertified: false, details: "authorization_program_details({stepId?,questionId?,view:'active'|'draft'}); omit IDs for the complete current program/trace. Source tools remain available." }
}

export function programConsumptionDetails(report: any, query: z.input<typeof ProgramDetailsSchema>) {
  const args = ProgramDetailsSchema.parse(query)
  if (!report) return { status: "no-active-program", steps: [], events: [] }
  const program = args.view === "draft" ? report.currentDraft?.raw : report.program
  const currentRevision = args.view === "draft" ? report.currentDraft?.revision : report.revision
  if (args.expectedRevision && args.expectedRevision !== currentRevision) return { status: "stale-program-reference", view: args.view, expectedRevision: args.expectedRevision, revision: currentRevision, instruction: "Inspect the current view revision before requesting its details or patching the draft.", steps: [], events: [] }
  const candidate = report.candidate
  const execution = args.view === "draft" ? candidate && currentRevision !== undefined && candidate.revision === currentRevision ? candidate.resourceExecution : undefined : report.resourceExecution
  const relevant = !args.questionId || program?.scope?.questionId === args.questionId
  const match = (s: any) => relevant && (!args.stepId || s?.id === args.stepId)
  const steps = (Array.isArray(program?.resourceWorkflow?.steps) ? program.resourceWorkflow.steps : []).filter(match), events = (execution?.events ?? []).filter(match)
  return { view: args.view, revision: currentRevision, activeRevision: report.revision, draftRevision: report.currentDraft?.revision, status: args.stepId && !steps.length ? "program-detail-not-found" : report.status, ...(args.stepId || args.questionId ? {} : { program, execution, currentDraft: report.currentDraft }), steps, events, diagnostics: args.view === "draft" ? report.candidate?.diagnostics ?? report.currentDraftDiagnostics : report.diagnostics, semanticSupport: "unreviewed" }
}

export function projectProgramToolOutput(output: any, questions: readonly { id: string; request?: string }[], mode: ProgramContext = "full") {
  if (mode === "full" || !output?.executableContract) return output
  const { currentDraft: _draft, candidate: _candidate, propertyChecks: _checks, ...rest } = output
  return { ...rest, executableContract: projectProgramConsumption(output.executableContract, questions, mode) }
}
