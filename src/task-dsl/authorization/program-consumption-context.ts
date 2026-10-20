import { createHash } from "node:crypto"
import { z } from "zod"
import { projectProgramOutcome } from "./program-outcome.ts"
import { projectProgramCallRelations } from "./program-obligations.ts"

export type ProgramContext = "full" | "compact" | "directed"
export const ProgramDetailsSchema = z.object({ format: z.enum(["overview", "raw"]).optional(), catalog: z.enum(["source-index", "source-candidates"]).optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(40), stepId: z.string().min(1).max(256).optional(), questionId: z.string().min(1).max(256).optional(), view: z.enum(["active", "draft"]).default("active"), expectedRevision: z.string().min(1).max(256).optional(), expectedBasis: z.string().min(1).max(256).optional(), trialCaseId: z.string().min(1).max(256).optional() }).strict()
const revision = (v: unknown) => createHash("sha256").update(JSON.stringify(v) ?? "null").digest("hex")
const basis = (r: any) => revision([r?.revision, r?.sourcesCurrent, r?.resourceExecution?.inputs, r?.resourceExecution?.conditions, r?.resourceExecution?.returned, r?.program])
const propertySummary = (evaluation: any) => evaluation && { revision: evaluation.revision, questions: evaluation.questions?.map((q: any) => ({ questionId: q.questionId, properties: q.properties?.map((p: any) => ({ id: p.id ?? p.propertyId, status: p.status, value: p.value, gaps: p.gaps })) })) }

/** Pure presentation of existing host results; no evaluation or source inference. */
export function projectProgramConsumption(report: any, questions: readonly { id: string; request?: string }[], mode: ProgramContext = "full") {
  if (!report || mode === "full") return report
  if (report.sourcesCurrent === false) report = { ...report, resourceExecution: undefined }
  const execution = report.resourceExecution, events: any[] = execution?.events ?? []
  const outcome = projectProgramOutcome(report)
  const candidateCount = (report.obligations ?? []).filter((o: any) => o.state !== "mapped-unreviewed").length
  if (mode === "directed") outcome.coverageGaps = [...outcome.coverageGaps.filter((g: any) => typeof g === "string"), ...(candidateCount ? [{ sourceCandidateCount: candidateCount, status: "unreviewed", details: "authorization_program_details({catalog:'source-candidates'})" }] : [])]
  return { schemaVersion: "authorization-program-context/v1", programId: report.program?.id, revision: report.revision, inputRevision: revision(execution?.inputs), draftRevision: report.currentDraft?.revision, status: report.status, programMode: report.programMode, origin: report.origin, scope: report.scope,
    ...(mode === "directed" ? { basis: basis(report), outcome, responsibility: "Use the current finite computation for the portion it actually covers. Review source meanings and all remaining original questions; do not redo the same calculation merely to restate it. Rules include untriggered branches and can be retrieved with authorization_program_details. Values and author coverage are unreviewed, not a request authorization certificate." } : {}),
    inputBinding: report.inputBinding, termination: execution?.termination, returned: execution?.returned, conditions: execution?.conditions, gaps: execution?.gaps ?? [],
    // Current values alone cannot explain a different input or an unexecuted branch.
    // Keep authored rules once, without copied input populations or candidate history.
    rules: (report.program?.resourceWorkflow?.steps ?? []).map((s: any) => s && typeof s === "object" ? Object.fromEntries(["id", "op", "when", "value", "from", "where", "order", "unique", "test", "failure", "principal", "resource", "permission", "name", "arguments", "source", "sources", "because"].filter(k => s[k] !== undefined).map(k => [k, s[k]])) : { invalidStep: s }),
    steps: events.map(e => ({ id: e.id, op: e.op, outcome: e.outcome, value: e.outputs?.value, known: e.outputs?.known, source: e.source, sources: e.sources, gaps: e.gaps, meaningOrigin: e.meaningOrigin, ...(e.op === "guard" ? { guard: { principal: e.inputs.principal, resource: e.inputs.resource, permission: e.inputs.permission, test: e.inputs.test } } : {}), ...(e.op === "external" ? { external: { name: e.inputs.name, arguments: e.inputs.arguments, assumption: e.inputs.assumption } } : {}) })),
    questions: questions.map(q => ({ questionId: q.id, request: q.request, resourceStepIds: q.id === report.scope?.questionId ? events.map(e => e.id) : [], responsibility: q.id === report.scope?.questionId ? "Authored finite summary; retain upstream and remaining gaps." : "Not computed by this resource workflow; original source investigation remains." })),
    diagnostics: report.diagnostics, ...(mode === "directed" ? {} : { propertyChecks: propertySummary(report.evaluation) }), candidate: report.candidate && { revision: report.candidate.revision, adopted: report.candidate.adopted, diagnostics: report.candidate.diagnostics, returned: report.candidate.resourceExecution?.returned, gaps: report.candidate.resourceExecution?.gaps },
    semanticSupport: "unreviewed", requestOperationCertified: false, details: "authorization_program_details({stepId?,questionId?,view:'active'|'draft'}); omit IDs for the complete current program/trace. Source tools remain available." }
}

export function programConsumptionDetails(report: any, query: z.input<typeof ProgramDetailsSchema>, catalogs?: { sourceIndex?: readonly any[]; sourceCandidates?: readonly any[]; programContext?: ProgramContext }) {
  const args = ProgramDetailsSchema.parse(query)
  if (args.catalog) {
    const currentRevision = args.view === "draft" ? report?.currentDraft?.revision : report?.revision
    if (args.expectedRevision && args.expectedRevision !== currentRevision || args.expectedBasis && args.expectedBasis !== basis(report)) return { status: "stale-program-reference", revision: currentRevision, items: [] }
    const all = args.catalog === "source-index" ? catalogs?.sourceIndex : catalogs?.sourceCandidates
    if (!all) return { status: "catalog-unavailable", items: [] }
    return { status: "catalog", catalog: args.catalog, revision: currentRevision, sourcesCurrent: report?.sourcesCurrent, items: all.slice(args.offset, args.offset + args.limit), total: all.length, remaining: Math.max(0, all.length - args.offset - args.limit), nextOffset: args.offset + args.limit < all.length ? args.offset + args.limit : undefined, semanticSupport: "unreviewed" }
  }
  if (!report) return { status: "no-active-program", steps: [], events: [] }
  if (args.expectedBasis && (args.expectedBasis !== basis(report) || report.sourcesCurrent === false)) return { status: "stale-program-reference", basis: basis(report), steps: [], events: [] }
  if (args.trialCaseId) {
    const revision = report.currentDraft?.revision
    if (report.sourcesCurrent === false) return { status: "trial-source-invalidated", revision, steps: [], events: [] }
    if (args.view !== "draft" || !args.expectedRevision) return { status: "trial-revision-required", revision, steps: [], events: [] }
    if (args.expectedRevision !== revision) return { status: "stale-program-reference", revision, steps: [], events: [] }
    const batch = [...(report.trials ?? [])].reverse().find((t: any) => t.revision === revision && t.cases.some((c: any) => c.id === args.trialCaseId))
    const item = batch?.cases.find((c: any) => c.id === args.trialCaseId)
    if (!item) return { status: "trial-detail-not-found", revision, steps: [], events: [] }
    const relevant = !args.questionId || report.currentDraft.raw?.scope?.questionId === args.questionId
    const match = (s: any) => relevant && (!args.stepId || s.id === args.stepId)
    return { status: "trial", revision, trialCaseId: item.id, execution: item.execution, outcome: item.outcome, callRelations: item.callRelations?.filter((r: any) => relevant && (!args.stepId || r.stepId === args.stepId)), obligations: item.obligations, diagnostics: item.diagnostics, steps: (report.currentDraft.raw?.resourceWorkflow?.steps ?? []).filter(match), events: (item.execution?.events ?? []).filter(match), inputOrigin: "unreviewed-trial-facts", semanticSupport: "unreviewed", requestOperationCertified: false }
  }
  const program = args.view === "draft" ? report.currentDraft?.raw : report.program
  const currentRevision = args.view === "draft" ? report.currentDraft?.revision : report.revision
  if (args.expectedRevision && args.expectedRevision !== currentRevision) return { status: "stale-program-reference", view: args.view, expectedRevision: args.expectedRevision, revision: currentRevision, instruction: "Inspect the current view revision before requesting its details or patching the draft.", steps: [], events: [] }
  const candidate = report.candidate
  const execution = report.sourcesCurrent === false ? undefined : args.view === "draft" ? candidate && currentRevision !== undefined && candidate.revision === currentRevision ? candidate.resourceExecution : undefined : report.resourceExecution
  const relevant = !args.questionId || program?.scope?.questionId === args.questionId
  const match = (s: any) => relevant && (!args.stepId || s?.id === args.stepId)
  const steps = (Array.isArray(program?.resourceWorkflow?.steps) ? program.resourceWorkflow.steps : []).filter(match), events = (execution?.events ?? []).filter(match)
  const callRelations = args.view === "draft" ? projectProgramCallRelations(program, execution, (report.trials ?? []).filter((t: any) => t.revision === currentRevision).flatMap((t: any) => t.cases ?? []), catalogs?.sourceCandidates ?? report.obligations).filter(r => relevant && (!args.stepId || r.stepId === args.stepId)) : undefined
  const format = args.format ?? (catalogs?.programContext === "directed" && args.view === "active" && !args.stepId ? "overview" : "raw")
  if (format === "overview" && args.view === "active") {
    const context = projectProgramConsumption({ ...report, resourceExecution: execution }, [], "directed")
    return { view: args.view, format, revision: currentRevision, basis: basis(report), status: !relevant || args.stepId && !steps.length ? "program-detail-not-found" : report.sourcesCurrent === false ? "source-invalidated" : report.status,
      outcome: relevant ? context.outcome : undefined, scope: program?.scope, steps, events: context.steps.filter(match), diagnostics: report.diagnostics,
      rawDetails: { view: "active", format: "raw", expectedRevision: currentRevision, expectedBasis: basis(report), ...(args.questionId ? { questionId: args.questionId } : {}), ...(args.stepId ? { stepId: args.stepId } : {}) },
      instruction: "Current rules and compact actual events. Raw selection candidates, input populations and exact execution objects are available with rawDetails (or format:'raw',stepId). This view is self-contained and uses no hidden history.", semanticSupport: "unreviewed" }
  }
  return { view: args.view, revision: currentRevision, activeRevision: report.revision, draftRevision: report.currentDraft?.revision, status: !relevant || args.stepId && !steps.length ? "program-detail-not-found" : report.sourcesCurrent === false ? "source-invalidated" : report.status, ...(args.stepId || args.questionId ? {} : { program, execution, currentDraft: report.currentDraft }), steps, events, ...(callRelations ? { callRelations } : {}), diagnostics: args.view === "draft" ? report.candidate?.diagnostics ?? report.currentDraftDiagnostics : report.diagnostics, semanticSupport: "unreviewed" }
}

const TOOL_OUTPUT_REFERENCE_GUIDE = "Each executableContract toolOutputReference is the EXACT value at the named top-level field of this SAME tool output. Substitute that full value; sha256 and bytes verify its JSON. This removes duplicate transmission only; full program, draft, trial, source and execution information remain present."
export function projectProgramToolOutput(output: any, questions: readonly { id: string; request?: string }[], mode: ProgramContext = "full") {
  if (!output?.executableContract) return output
  if (mode === "full") {
    if (Object.hasOwn(output, "toolOutputReferenceGuide") || Object.values(output.executableContract).some(v => v && typeof v === "object" && Object.hasOwn(v, "toolOutputReference"))) return output
    const contract = { ...output.executableContract }; let changed = false
    for (const [key, value] of Object.entries(contract)) {
      // Both occurrences are in this response. Equality is byte exact and the
      // top-level occurrence remains intact; no previous-turn state is needed.
      const json = JSON.stringify(value)
      if (key !== "executableContract" && Object.hasOwn(output, key) && json !== undefined && Buffer.byteLength(json) >= 512 && json === JSON.stringify(output[key])) {
        contract[key] = { toolOutputReference: { field: key, sha256: revision(value), bytes: Buffer.byteLength(json) } }; changed = true
      }
    }
    return changed ? { ...output, executableContract: contract, toolOutputReferenceGuide: TOOL_OUTPUT_REFERENCE_GUIDE } : output
  }
  const { currentDraft: _draft, candidate: _candidate, propertyChecks: _checks, ...rest } = output
  return { ...rest, executableContract: projectProgramConsumption(output.executableContract, questions, mode) }
}

/** Deterministic wire reconstruction; uses only values present in the packet. */
export function resolveProgramToolOutput(output: any) {
  if (output?.toolOutputReferenceGuide !== TOOL_OUTPUT_REFERENCE_GUIDE || !output.executableContract) return output
  const { toolOutputReferenceGuide: _guide, ...rest } = output, contract = { ...output.executableContract }
  for (const [key, value] of Object.entries(contract)) {
    const ref = value && typeof value === "object" && Object.keys(value).length === 1 && (value as any).toolOutputReference
    if (!ref) continue
    if (ref.field !== key || !Object.hasOwn(output, key)) throw new Error("tool-output-reference-missing")
    const original = output[key], json = JSON.stringify(original)
    if (json === undefined || revision(original) !== ref.sha256 || Buffer.byteLength(json) !== ref.bytes) throw new Error("tool-output-reference-digest")
    contract[key] = original
  }
  return { ...rest, executableContract: contract }
}
