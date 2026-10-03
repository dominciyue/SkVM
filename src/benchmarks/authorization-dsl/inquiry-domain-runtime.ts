import type { AuthorizationInquiryProgram } from "../../task-dsl/authorization/inquiry-program.ts"
import { ControlSliceDeltaSchema, createControlSlice, mergeControlSlice, type ControlSlice, type InquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"
import { evaluateControlPaths, checkControlConclusions, summarizeControlQuestions } from "../../task-dsl/authorization/control-conclusion.ts"
import type { InquiryDiagnostic } from "../../task-dsl/authorization/inquiry.ts"
import { AuthorizationInquiryResultSchema } from "../../task-dsl/authorization/inquiry-result.ts"
import type { InquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainScheduler } from "./inquiry-domain-scheduler.ts"
import { applyControlUpdates, LOCAL_CONTROL_GUIDE, LocalControlEnvelopeSchema, WorkSelectionSchema, type UpdateAcceptance, type UpdateRejection } from "./inquiry-control-updates.ts"
import { createInquiryWorklist } from "./inquiry-worklist.ts"
import { expandLocalExtractions, localExplanationContext, LOCAL_EXTRACTION_GUIDE, type LocalExplanationTask, type LocalUpdateGroup } from "./inquiry-local-extraction.ts"

export type DomainAblation = "scheduler-off" | "checks-off"
type RuntimeDomainCheck = Omit<ReturnType<typeof checkControlConclusions>, "ruleConsistency"> & { ruleConsistency: boolean | null }
export const DOMAIN_EXECUTION_GUIDE = [
  "domain-evidence-v1 runtime: propose local control deltas from ACTUALLY SHOWN original source, never from task expectations. Host binds citations, executes at most two uniquely located dependency reads per response, evaluates finite predicates and checks formal conclusion consistency. Extraction meaning stays unreviewed.",
  'Delta is {schemaVersion:"authorization-control-slice/v1",rules:[],dependencies:[],bindings:[],policyRules:[]}. Arrays may be omitted when unchanged. Local rules: {key,questionId,pathKey,kind:entry|binding|guard|reject|continue|effect,after:[predecessor keys],evidenceIds:[shown source IDs],claim,condition?,principal?,resource?,operation?,bindingKey?,bindingKind:principal|resource|permission|configuration|value,authorizedBy?:[guard keys],complete?:boolean}. Only binding nodes need bindingKey/bindingKind. Reject is terminating deny, effect is protected allow. after is explicit execution precedence, never array order. Each terminal represents one proposed path, complete only when all relevant entry/upstream/binding/control/effect dependencies have actually been examined. Related alternative outcomes use distinct pathKeys matching final branch IDs. condition is node reachability, NOT the proposition that a guard passes. Shared entry/binding nodes can precede multiple paths.',
  "Use different typed identity keys for different objects even if labels/IDs match. authorizedBy asserts that a particular guard controls THIS effect on the same principal/resource; omit the assertion if no such linkage is established, and explain source-visible missing control rather than inventing a guard. Do not assume a checked input object also authorizes an output object.",
  'Predicates support only {op:eq|neq,left:{binding:name}|{literal:scalar},right:{binding:name}|{literal:scalar}}, {op:is-null,value:{binding:name}|{literal:scalar}}, {op:all|any,args:[predicates]}, {op:not,arg:predicate}; scalar is string/number/boolean/null. BOTH operands must be wrapped, for example {op:"eq",left:{binding:"flag"},right:{literal:false}}; bare right:false is invalid. Max depth12/nodes64. No target code, arbitrary operator or natural text is evaluated. Known bindings are only explicit USER premises: {questionId,key,value,origin:user,text:<exact span of current request/premise>}. This mapping is a model interpretation, not source truth. For an unspecified/unknown/not-given value OMIT the binding completely and refer to its key only in predicates; NEVER use value:null or value:false as an unknown placeholder. null is valid only when the current user explicitly supplies a null premise. Represent source outcomes with rules/conditions, do not invent user binding values from source.',
  "Dependencies: {key,questionId,pathKey,from:<accepted source rule key>,symbol:<name appearing in cited source>,kind:principal-binding|resource-binding|control|effect|exception,decisive:boolean,evidenceIds:[source reference IDs],reason,condition?,after?:[preceding control keys],parent?:dependency key,pathHint?:exact indexed path,candidateId?:shown candidate id}. Host uses a lexical location index, not a semantic call graph. Ambiguous candidates require an explicit pathHint/candidateId revision; missing/outside/dynamic facts stay local gaps. Place a dependency after a reject only if source order actually makes it unreachable. After an automatic read, incorporate the returned original evidence into a linked rule before calling a decisive dependency checked.",
  "Policy mappings are separate candidates: {key,questionId,pathKey,expected:allow|deny,origin:policy,text:<exact policy span>,location:<current independent location>,condition?}. Map only the supplied policy, do not derive it from implementation. Each live path needs a mapping for a determined policy assessment; incomplete mappings remain undetermined while behavior is deliverable. Formal policy mapping is still unreviewed.",
  "Same-key duplicate is idempotent. To correct a conflicting accepted proposal, supply revisionOf:<host-returned digest> and revisionReason; no silent overwrite. Keep gaps local; one irrelevant relationship does not invalidate other questions. Host feedback is formal computation on proposed rules, not a source-semantic or deployment proof. At most64 nodes/question and16 paths/question; overflow remains a named gap.",
].join("\n")
export const GUIDED_EXECUTION_GUIDE = [LOCAL_CONTROL_GUIDE, LOCAL_EXTRACTION_GUIDE, ...DOMAIN_EXECUTION_GUIDE.split("\n").slice(2, 6).map(line => line.replace(/Known bindings are only explicit USER premises:.*?This mapping is a model interpretation, not source truth\./, "Only known premiseValues from exact current user spans enter evaluation; mapping meaning remains unreviewed.").replace(/\{key,questionId/g, "{op,targetKey,questionId")), "For unspecified values, retain alternative feasible outcomes and name the missing fact. Local extraction and mapping meaning remain unreviewed."].join("\n")

/** One shared state machine used by structured inquiry and ordinary native tools. */
export function createInquiryDomainRuntime(options: { program: AuthorizationInquiryProgram; tools: InquiryTools; strategy?: InquiryStrategy; entryContext?: string; remainingActions?: () => number; ablation?: DomainAblation; suppliedUserText?: string[]; shownEvidenceIds?: () => string[]; initialDelta?: unknown }) {
  let slice: ControlSlice = createControlSlice(), check: RuntimeDomainCheck | undefined, closed = false
  const scheduler = createInquiryDomainScheduler({ ...options, evaluateConditions: options.ablation !== "checks-off" }), proposals: Array<{ delta: unknown; diagnostics: InquiryDiagnostic[]; revision: number; accepted?: UpdateAcceptance[]; rejected?: UpdateRejection[]; unresolved?: unknown[] }> = []
  const worklist = options.strategy === "guided-evidence-v2" ? createInquiryWorklist({ ...options, dependencyStates: () => scheduler.snapshot() }) : undefined
  let automaticActionsRemaining = 2
  let offeredTasks: LocalExplanationTask[] = []
  const localExtractions: ReturnType<typeof expandLocalExtractions>["records"] = []
  let lastPaths: ReturnType<typeof evaluateControlPaths>["paths"] = []
  const issues = new Map<string, InquiryDiagnostic[]>(), computation = { merges: 0, pathEvaluations: 0, conclusionChecks: 0, predicateEvaluations: 0, durationMs: 0 }
  const checkHistory: Array<{ revision: number; slice: ControlSlice; result: unknown; check: RuntimeDomainCheck }> = []
  const evidenceContext = () => ({ questionIds: options.program.questions.map(q => q.id), shownEvidenceIds: options.shownEvidenceIds?.() ?? options.tools.evidence.map(e => e.id), suppliedUserText: options.suppliedUserText })
  const calculate = <T>(fn: () => T): T => { const started = performance.now(); try { return fn() } finally { computation.durationMs += performance.now() - started } }
  if (options.initialDelta !== undefined) {
    const restored = calculate(() => mergeControlSlice(slice, options.initialDelta, options.program, evidenceContext())); computation.merges++
    if (restored.diagnostics.length) throw new Error(`reuse-control-invalid: ${JSON.stringify(restored.diagnostics)}`)
    slice = restored.state
  }
  const sync = async (execute = true) => {
    if (closed) throw new Error("session-closed: domain runtime cannot continue")
    await scheduler.run(slice, 0)
    const actions = worklist ? await worklist.run(slice, execute && options.ablation !== "scheduler-off" ? automaticActionsRemaining : 0) : await scheduler.run(slice, execute && options.ablation !== "scheduler-off" ? 2 : 0)
    if (worklist) { automaticActionsRemaining -= actions.length; await scheduler.run(slice, 0); worklist.sync(slice, check) }
    for (const h of options.tools.history) if (["source-changed", "source-root-changed", "symlink-escape"].includes(h.result.code ?? "")) issues.set("$source", [{ code: "source-invalidated", path: "$source", message: "Original source changed during this session; current extraction requires a fresh session.", severity: "error" }])
    const evaluated = options.ablation === "checks-off" ? { paths: [], diagnostics: [], calculationCount: 0 } : calculate(() => evaluateControlPaths(slice))
    lastPaths = evaluated.paths
    if (options.ablation !== "checks-off") { computation.pathEvaluations++; computation.predicateEvaluations += evaluated.calculationCount }
    return { actions, evaluated }
  }
  const propose = async (delta: unknown) => {
    if (closed) throw new Error("session-closed: domain runtime cannot continue")
    if (delta && typeof delta === "object" && (delta as Record<string, unknown>).schemaVersion === "authorization-control-update/v1") {
      worklist?.sync(slice, check)
      const envelope = LocalControlEnvelopeSchema.safeParse(delta)
      const expanded = expandLocalExtractions(envelope.success ? envelope.data.localExtractions : [], offeredTasks, worklist?.snapshot() ?? [])
      localExtractions.push(...expanded.records)
      const normalized = envelope.success ? { ...envelope.data, ...Object.fromEntries((Object.keys(expanded.groups) as LocalUpdateGroup[]).map(group => [group, [...envelope.data[group], ...expanded.groups[group]]])), localExtractions: [] } : delta
      const merged = calculate(() => applyControlUpdates(slice, normalized, options.program, evidenceContext(), expanded.rejected)); computation.merges++
      slice = merged.state; check = undefined
      const selectionDiagnostics: InquiryDiagnostic[] = []
      for (const raw of "pendingSelections" in merged ? merged.pendingSelections ?? [] : []) {
        const parsed = WorkSelectionSchema.safeParse(raw)
        if (!parsed.success) { const ds = parsed.error.issues.map(d => ({ code: "work-selection-schema", path: `workSelections.${d.path.join(".")}`, message: d.message, severity: "error" as const })); issues.set("$selection-schema", ds); selectionDiagnostics.push(...ds); continue }
        const owned = worklist?.snapshot().find(w => w.id === parsed.data.itemId), key = `workSelections.${owned?.questionId ?? parsed.data.questionId}.${parsed.data.itemId}`
        const selection = worklist?.selectCandidate(parsed.data) ?? { status: "rejected", code: "worklist-not-enabled" }
        if (selection.status === "accepted") { issues.delete(key); issues.delete("$selection-schema") }
        else { const ds = [{ code: selection.code!, path: key, message: "Choose a candidate shown for this same question and WorkItem; unrelated locations cannot be substituted.", severity: "error" as const }]; issues.set(owned ? key : "$selection-schema", ds); selectionDiagnostics.push(...ds) }
      }
      const identity = (p: UpdateAcceptance | UpdateRejection) => `${p.group === "sourceBindings" ? "rules" : p.group === "premiseValues" ? "bindings" : p.group}.${p.questionId}.${p.targetKey}`
      if (merged.envelopeValid) issues.delete("$schema")
      // A later accepted submission supersedes routing/container errors only in its own question.
      // Rejected semantic targets and source invalidation retain their existing independent lifetimes.
      for (const p of merged.accepted) { issues.delete(identity(p)); issues.delete(`$local-envelope.${p.questionId}`); issues.delete("$local-envelope.") }
      for (const p of merged.rejected) issues.set(merged.envelopeValid ? "localEnvelope" in p && p.localEnvelope ? `$local-envelope.${p.questionId}` : identity(p) : "$schema", p.diagnostics)
      const diagnostics = selectionDiagnostics.concat(merged.rejected.flatMap(p => p.diagnostics), merged.unresolved.map(p => ({ code: p.code, path: `${p.group}.${p.questionId}.${p.targetKey}`, message: `Referenced item ${p.rejectedTarget} is missing or rejected; this work is not closed.`, severity: "error" as const })))
      proposals.push({ delta: structuredClone(delta), diagnostics, revision: slice.revision, accepted: merged.accepted, rejected: merged.rejected, unresolved: merged.unresolved })
      const { actions, evaluated } = await sync()
      return { ...merged, diagnostics, actions, evaluated }
    }
    const parsed = ControlSliceDeltaSchema.safeParse(delta)
    const merged = calculate(() => mergeControlSlice(slice, delta, options.program, evidenceContext())); computation.merges++
    slice = merged.state; check = undefined
    if (parsed.success) {
      issues.delete("$schema")
      for (const group of ["rules", "dependencies", "bindings", "policyRules"] as const) for (const p of parsed.data[group]) issues.delete(`${group}.${p.questionId}.${p.key}`)
    } else issues.set("$schema", merged.diagnostics)
    for (const d of merged.diagnostics) if (parsed.success) {
      const group = (["rules", "dependencies", "bindings", "policyRules"] as const).find(g => d.path.startsWith(g + "."))
      const item = group && parsed.data[group].find(p => d.path === `${group}.${p.key}` || d.path.startsWith(`${group}.${p.key}.`))
      const key = item ? `${group}.${item.questionId}.${item.key}` : "$schema"
      issues.set(key, [...(issues.get(key) ?? []), d])
    }
    proposals.push({ delta: structuredClone(delta), diagnostics: merged.diagnostics, revision: slice.revision })
    const { actions, evaluated } = await sync()
    return { diagnostics: merged.diagnostics, actions, evaluated }
  }
  const validate = async (result: unknown) => {
    await sync(false)
    if (options.ablation === "checks-off") check = { structureValid: AuthorizationInquiryResultSchema.safeParse(result).success, sourceBound: slice.rules.length > 0 && slice.rules.every(r => r.sourceBound), semanticSupport: "unreviewed", ruleConsistency: null, taskResolution: "partial", paths: [], diagnostics: [...issues.values()].flat(), policyComparisons: [], calculationCount: 0, questionChecks: [] }
    else { check = calculate(() => checkControlConclusions(options.program, slice, result, scheduler.snapshot())); computation.conclusionChecks++; computation.predicateEvaluations += check.calculationCount; check = { ...check, diagnostics: [...issues.values()].flat().concat(check.diagnostics) } }
    if (options.ablation !== "checks-off" && [...issues.values()].flat().some(d => d.severity === "error")) check = { ...check, ruleConsistency: false, taskResolution: "partial" }
    if (options.ablation !== "checks-off") check.questionChecks = summarizeControlQuestions(options.program, slice, scheduler.snapshot(), check.paths, check.diagnostics)
    worklist?.sync(slice, check)
    checkHistory.push({ revision: slice.revision, slice: structuredClone(slice), result: structuredClone(result), check: structuredClone(check) })
    return check
  }
  const feedback = () => ({ revision: slice.revision,
    rules: slice.rules.map(({ key, questionId, pathKey, kind, after, condition, bindingKey, bindingKind, principal, resource, digest }) => ({ key, questionId, pathKey, kind, after, condition, bindingKey, bindingKind, principal, resource, digest })),
    bindings: slice.bindings, policyRules: slice.policyRules, dependencies: scheduler.snapshot(), paths: lastPaths,
    diagnostics: [...issues.values()].flat().concat(check?.diagnostics ?? []), ...(worklist ? { worklist: worklist.snapshot(), automaticActionsRemaining } : {}), semanticSupport: "unreviewed", ...(options.ablation ? { mechanismDisabled: options.ablation } : {}) })
  let contextHistoryPosition = 0
  const modelContext = () => {
    if (closed) throw new Error("session-closed")
    worklist?.sync(slice, check)
    const diagnosed = [...issues.values()].flat().flatMap(d => slice.rules.filter(r => d.path.includes(`${r.questionId}.${r.key}`)).flatMap(r => r.evidenceIds))
    const currentReads = options.tools.history.slice(contextHistoryPosition)
    const recent = (currentReads.length ? currentReads : options.tools.history.slice(-2)).flatMap(h => h.result.evidence.map(e => e.id))
    contextHistoryPosition = options.tools.history.length
    const context = localExplanationContext(options.program, worklist?.snapshot() ?? [], options.tools.evidence, slice, diagnosed, recent)
    offeredTasks = context.tasks
    return context
  }
  const modelFeedback = () => {
    const state = feedback(), diagnostics = state.diagnostics.filter((d, i, all) => all.findIndex(v => v.code === d.code && v.path === d.path && v.message === d.message && v.questionId === d.questionId) === i)
    return { ...state, diagnostics: diagnostics.slice(0, 16), diagnosticCount: diagnostics.length }
  }
  return { propose, sync, validate, feedback, modelContext, modelFeedback, beginStep: () => { if (closed) throw new Error("session-closed"); automaticActionsRemaining = 2 }, close: () => { closed = true },
    report: () => ({ slice: structuredClone(slice), proposals: structuredClone(proposals), localExtractions: structuredClone(localExtractions), dependencies: scheduler.snapshot(), schedulerActions: structuredClone([...scheduler.actions, ...(worklist?.actions ?? [])]), ...(worklist ? { worklist: { items: worklist.snapshot(), actions: structuredClone(worklist.actions) } } : {}), check, checkHistory: structuredClone(checkHistory), computation: { ...computation }, ablation: options.ablation, closed }) }
}
