import type { AuthorizationInquiryProgram } from "../../task-dsl/authorization/inquiry-program.ts"
import { ControlSliceDeltaSchema, createControlSlice, mergeControlSlice, isGuidedInquiryStrategy, type ControlSlice, type InquiryStrategy } from "../../task-dsl/authorization/control-slice.ts"
import { evaluateControlPaths, checkControlConclusions, controlObjectDiagnostics, summarizeControlQuestions } from "../../task-dsl/authorization/control-conclusion.ts"
import type { InquiryDiagnostic } from "../../task-dsl/authorization/inquiry.ts"
import { AuthorizationInquiryResultSchema } from "../../task-dsl/authorization/inquiry-result.ts"
import type { InquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainScheduler } from "./inquiry-domain-scheduler.ts"
import { applyControlUpdates, LOCAL_CONTROL_GUIDE, LocalControlEnvelopeSchema, WorkSelectionSchema, type UpdateAcceptance, type UpdateRejection, type UpdateWithdrawal } from "./inquiry-control-updates.ts"
import { createInquiryWorklist, worklistModelView } from "./inquiry-worklist.ts"
import { expandLocalExtractions, localExplanationContext, LOCAL_EXTRACTION_GUIDE, type LocalExplanationTask, type LocalUpdateGroup } from "./inquiry-local-extraction.ts"
import { applySemanticBlocks, lowerIntoControlSlice, assembleSemanticResult, semanticResultSkeleton, SemanticUpdateEnvelopeSchema, SEMANTIC_EXECUTION_GUIDE } from "./inquiry-semantic.ts"
import type { BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"

export type DomainAblation = "scheduler-off" | "checks-off"
type RuntimeDomainCheck = Omit<ReturnType<typeof checkControlConclusions>, "ruleConsistency"> & { ruleConsistency: boolean | null }
interface RejectedDraft {
  group: LocalUpdateGroup; questionId: string; targetKey: string; submitted: unknown;
  localScope?: { itemId: string; evidenceIds: string[] };
  archive: { proposalIndex: number; group: LocalUpdateGroup; itemIndex: number; localExtractionIndex?: number }
}
const RESULT_BRANCH_GUIDE = "Final result.branches lists only paths feasible under the CURRENT explicit premises and preceding rejections, using each exact pathKey as its id. A path marked inapplicable is excluded from that array. Preserve any excluded alternatives or counterfactuals explicitly requested by the user in behavior.explanation with the relevant shown citations, clearly distinguishing them from the current run. Retain their cited source rules for later premise changes. If a premise is unspecified, retain all feasible alternatives in result.branches and name the missing fact."
export const DOMAIN_EXECUTION_GUIDE = [
  "domain-evidence-v1 runtime: propose local control deltas from ACTUALLY SHOWN original source, never from task expectations. Host binds citations, executes at most two uniquely located dependency reads per response, evaluates finite predicates and checks formal conclusion consistency. Extraction meaning stays unreviewed.",
  'Delta is {schemaVersion:"authorization-control-slice/v1",rules:[],dependencies:[],bindings:[],policyRules:[]}. Arrays may be omitted when unchanged. Local rules: {key,questionId,pathKey,kind:entry|binding|guard|reject|continue|effect,after:[predecessor keys],evidenceIds:[shown source IDs],claim,condition?,principal?,resource?,operation?,bindingKey?,bindingKind:principal|resource|permission|configuration|value,authorizedBy?:[guard keys],complete?:boolean}. Only binding nodes need bindingKey/bindingKind. Reject is terminating deny, effect is protected allow. after is explicit execution precedence, never array order. Each terminal represents one proposed path, complete only when all relevant entry/upstream/binding/control/effect dependencies have actually been examined. Related alternative outcomes use distinct pathKeys matching final branch IDs. condition is node reachability, NOT the proposition that a guard passes. Shared entry/binding nodes can precede multiple paths.',
  "A source binding's bindingKey declares its typed identity; principal/resource fields reference that bindingKey. For example bindingKind:principal,bindingKey:visitor declares visitor, and a downstream principal:visitor references it. On that binding node omit its own principal or repeat principal:visitor; principal:anotherName does not declare an alias. Use different typed identity keys for different objects even if labels/IDs match. authorizedBy asserts that a particular guard controls THIS effect on the same principal/resource; omit the assertion if no such linkage is established, and explain source-visible missing control rather than inventing a guard. Do not assume a checked input object also authorizes an output object.",
  'Predicates support only {op:eq|neq,left:{binding:name}|{literal:scalar},right:{binding:name}|{literal:scalar}}, {op:is-null,value:{binding:name}|{literal:scalar}}, {op:all|any,args:[predicates]}, {op:not,arg:predicate}; scalar is string/number/boolean/null. BOTH operands must be wrapped, for example {op:"eq",left:{binding:"flag"},right:{literal:false}}; bare right:false is invalid. Max depth12/nodes64. No target code, arbitrary operator or natural text is evaluated. Known bindings are only explicit USER premises: {questionId,key,value,origin:user,text:<exact span of current request/premise>}. This mapping is a model interpretation, not source truth. For an unspecified/unknown/not-given value OMIT the binding completely and refer to its key only in predicates; NEVER use value:null or value:false as an unknown placeholder. null is valid only when the current user explicitly supplies a null premise. Represent source outcomes with rules/conditions, do not invent user binding values from source.',
  "Dependencies: {key,questionId,pathKey,from:<accepted source rule key>,symbol:<name appearing in cited source>,kind:principal-binding|resource-binding|control|effect|exception,decisive:boolean,evidenceIds:[source reference IDs],reason,condition?,after?:[preceding control keys],parent?:dependency key,pathHint?:exact indexed path,candidateId?:shown candidate id}. Host uses a lexical location index, not a semantic call graph. Ambiguous candidates require an explicit pathHint/candidateId revision; missing/outside/dynamic facts stay local gaps. Place a dependency after a reject only if source order actually makes it unreachable. After an automatic read, incorporate the returned original evidence into a linked rule before calling a decisive dependency checked.",
  "Policy mappings are separate candidates: {key,questionId,pathKey,expected:allow|deny,origin:policy,text:<exact policy span>,location:<current independent location>,condition?}. Map only the supplied policy, do not derive it from implementation. Each live path needs a mapping for a determined policy assessment; incomplete mappings remain undetermined while behavior is deliverable. Formal policy mapping is still unreviewed.",
  "Same-key duplicate is idempotent. To correct a conflicting accepted proposal, supply revisionOf:<host-returned digest> and revisionReason; no silent overwrite. Keep gaps local; one irrelevant relationship does not invalidate other questions. Host feedback is formal computation on proposed rules, not a source-semantic or deployment proof. At most64 nodes/question and16 paths/question; overflow remains a named gap.",
  RESULT_BRANCH_GUIDE,
].join("\n")
export const GUIDED_EXECUTION_GUIDE = [LOCAL_CONTROL_GUIDE, LOCAL_EXTRACTION_GUIDE, ...DOMAIN_EXECUTION_GUIDE.split("\n").slice(2, 6).map(line => line.replace(/Known bindings are only explicit USER premises:.*?This mapping is a model interpretation, not source truth\./, "Only known premiseValues from exact current user spans enter evaluation; mapping meaning remains unreviewed.").replace(/\{key,questionId/g, "{op,targetKey,questionId")), RESULT_BRANCH_GUIDE, "For unspecified values, retain alternative feasible outcomes and name the missing fact. Local extraction and mapping meaning remain unreviewed."].join("\n")

/** One shared state machine used by structured inquiry and ordinary native tools. */
export function createInquiryDomainRuntime(options: { program: AuthorizationInquiryProgram; tools: InquiryTools; strategy?: InquiryStrategy; entryContext?: string; remainingActions?: () => number; ablation?: DomainAblation; suppliedUserText?: string[]; shownEvidenceIds?: () => string[]; initialDelta?: unknown; initialSemanticUnits?: BoundSemanticBlock[] }) {
  let slice: ControlSlice = createControlSlice(), check: RuntimeDomainCheck | undefined, closed = false
  const scheduler = createInquiryDomainScheduler({ ...options, evaluateConditions: options.ablation !== "checks-off" }), proposals: Array<{ delta: unknown; diagnostics: InquiryDiagnostic[]; revision: number; accepted?: UpdateAcceptance[]; rejected?: UpdateRejection[]; withdrawn?: UpdateWithdrawal[]; withdrawalRejected?: UpdateRejection[]; unresolved?: unknown[] }> = []
  let currentRejections: UpdateRejection[] = []
  const rejectedDrafts = new Map<string, RejectedDraft>()
  const draftIdentity = (p: Pick<UpdateRejection, "group" | "questionId" | "targetKey">) => JSON.stringify([p.group, p.questionId, p.targetKey])
  const worklist = isGuidedInquiryStrategy(options.strategy) ? createInquiryWorklist({ ...options, dependencyStates: () => scheduler.snapshot() }) : undefined
  let semanticUnits: BoundSemanticBlock[] = structuredClone(options.initialSemanticUnits ?? [])
  const semanticRecords: ReturnType<typeof applySemanticBlocks>["records"] = [], assemblies: Array<{ raw: unknown; revision: number; derived: unknown; diagnostics: InquiryDiagnostic[] }> = []
  let automaticActionsRemaining = 2
  let offeredTasks: LocalExplanationTask[] = []
  const localExtractions: ReturnType<typeof expandLocalExtractions>["records"] = []
  let lastPaths: ReturnType<typeof evaluateControlPaths>["paths"] = []
  let objectRevision = -1, objectDiagnostics: InquiryDiagnostic[] = []
  const issues = new Map<string, InquiryDiagnostic[]>(), computation = { merges: 0, pathEvaluations: 0, conclusionChecks: 0, predicateEvaluations: 0, objectFeedbackPasses: 0, durationMs: 0 }
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
    if (options.ablation !== "checks-off" && objectRevision !== slice.revision) {
      objectDiagnostics = calculate(() => controlObjectDiagnostics(slice)); objectRevision = slice.revision; computation.objectFeedbackPasses++
    }
    return { actions, evaluated }
  }
  const propose = async (delta: unknown) => {
    if (closed) throw new Error("session-closed: domain runtime cannot continue")
    if (options.strategy === "semantic-flow-v1" && delta && typeof delta === "object" && (delta as Record<string, unknown>).schemaVersion === "authorization-semantic-update/v1") {
      const envelope = SemanticUpdateEnvelopeSchema.safeParse(delta)
      if (!envelope.success) {
        const diagnostics = envelope.error.issues.map(i => ({ code: "semantic-update-schema", path: i.path.join("."), message: i.message, severity: "error" as const }))
        issues.set("$semantic-envelope", diagnostics); proposals.push({ delta: structuredClone(delta), diagnostics, revision: slice.revision }); return { diagnostics, actions: [], evaluated: { paths: lastPaths } }
      }
      issues.delete("$semantic-envelope"); check = undefined; issues.delete("$semantic-result")
      const pendingDrafts = semanticRecords.filter(r => !r.accepted && issues.has(`$semantic-draft.${r.draftId}`))
      const applied = applySemanticBlocks(semanticUnits, envelope.data.semanticBlocks, offeredTasks, pendingDrafts)
      semanticUnits = applied.units; semanticRecords.push(...applied.records)
      for (const record of applied.records) {
        if (record.accepted) {
          for (const old of pendingDrafts) if (old.questionId === record.questionId && old.handle === record.handle || old.draftId === record.repairedDraftId) issues.delete(`$semantic-draft.${old.draftId}`)
        } else issues.set(`$semantic-draft.${record.draftId}`, record.diagnostics)
      }
      let diagnostics = [...applied.diagnostics]
      if (applied.records.some(r => r.accepted)) {
        const changed = new Set(applied.records.filter(r => r.accepted).map(r => r.questionId))
        slice.policyRules = slice.policyRules.filter(p => !changed.has(p.questionId) || !p.key.startsWith("semantic-policy-"))
        const lowered = calculate(() => lowerIntoControlSlice(slice, semanticUnits, options.program, evidenceContext())); computation.merges++
        slice = lowered.state; diagnostics.push(...lowered.diagnostics)
        for (const key of issues.keys()) if (key.startsWith("$semantic-lower.")) issues.delete(key)
        for (const d of lowered.diagnostics) { const key = `$semantic-lower.${d.questionId ?? ""}`; issues.set(key, [...(issues.get(key) ?? []), d]) }
      }
      if (envelope.data.premiseValues.length || envelope.data.workSelections.length) {
        const local = await propose({ schemaVersion: "authorization-control-update/v1", premiseValues: envelope.data.premiseValues, workSelections: envelope.data.workSelections })
        diagnostics.push(...local.diagnostics)
      }
      proposals.push({ delta: structuredClone(delta), diagnostics, revision: slice.revision })
      const { actions, evaluated } = await sync(); return { diagnostics, actions, evaluated }
    }
    if (delta && typeof delta === "object" && (delta as Record<string, unknown>).schemaVersion === "authorization-control-update/v1") {
      worklist?.sync(slice, check)
      const envelope = LocalControlEnvelopeSchema.safeParse(delta)
      const expanded = expandLocalExtractions(envelope.success ? envelope.data.localExtractions : [], offeredTasks, worklist?.snapshot() ?? [])
      const localRecordOffset = localExtractions.length
      localExtractions.push(...expanded.records)
      const normalized = envelope.success ? { ...envelope.data, ...Object.fromEntries((Object.keys(expanded.groups) as LocalUpdateGroup[]).map(group => [group, [...envelope.data[group], ...expanded.groups[group]]])), localExtractions: [] } : delta
      const merged = calculate(() => applyControlUpdates(slice, normalized, options.program, evidenceContext(), expanded.rejected, currentRejections)); computation.merges++
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
      if (merged.envelopeValid) {
        for (const p of currentRejections) if (!p.localEnvelope) issues.delete(identity(p))
        currentRejections = merged.currentRejections.filter(p => !p.localEnvelope)
        const submitted = new Map<string, RejectedDraft>()
        const remember = (group: LocalUpdateGroup, raw: unknown, itemIndex: number, local?: typeof expanded.records[number], localExtractionIndex?: number) => {
          const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
          const item = { group, questionId: local?.questionId ?? String(value.questionId ?? ""), targetKey: String(value.targetKey ?? `invalid-${itemIndex}`), submitted: structuredClone(raw), archive: { proposalIndex: proposals.length, group, itemIndex, ...(localExtractionIndex !== undefined ? { localExtractionIndex } : {}) } }
          const task = local && offeredTasks.find(t => t.itemId === local.itemId)
          submitted.set(draftIdentity(item), { ...item, ...(task ? { localScope: { itemId: task.itemId, evidenceIds: [...new Set([...task.evidenceIds, ...task.callsiteEvidenceIds])] } } : {}) })
        }
        if (envelope.success) for (const group of Object.keys(expanded.groups) as LocalUpdateGroup[]) for (const [index, raw] of envelope.data[group].entries()) remember(group, raw, index)
        for (const [index, record] of expanded.records.entries()) if (record.questionId) {
          const raw = record.raw as Record<string, unknown>
          for (const group of Object.keys(expanded.groups) as LocalUpdateGroup[]) if (Array.isArray(raw[group])) for (const [itemIndex, value] of raw[group].entries()) remember(group, value, itemIndex, record, localRecordOffset + index)
        }
        const live = new Set(currentRejections.map(draftIdentity))
        for (const id of rejectedDrafts.keys()) if (!live.has(id)) rejectedDrafts.delete(id)
        for (const p of merged.rejected) { const id = draftIdentity(p), draft = submitted.get(id); if (live.has(id) && draft) rejectedDrafts.set(id, draft) }
        const targetIssues = new Map<string, InquiryDiagnostic[]>()
        for (const p of currentRejections) targetIssues.set(identity(p), [...(targetIssues.get(identity(p)) ?? []), ...p.diagnostics])
        for (const [key, diagnostics] of targetIssues) issues.set(key, diagnostics)
        for (const p of merged.rejected.filter(p => "localEnvelope" in p && p.localEnvelope)) issues.set(`$local-envelope.${p.questionId}`, p.diagnostics)
      } else issues.set("$schema", merged.rejected.flatMap(p => p.diagnostics))
      const withdrawalKey = (p: UpdateRejection | UpdateWithdrawal | UpdateAcceptance) => `$withdrawal.${p.group}.${p.questionId}.${p.targetKey}`
      for (const p of [...merged.withdrawn, ...merged.accepted]) issues.delete(withdrawalKey(p))
      for (const p of merged.withdrawalRejected) issues.set(withdrawalKey(p), p.diagnostics)
      const diagnostics = selectionDiagnostics.concat(merged.rejected.flatMap(p => p.diagnostics), merged.withdrawalRejected.flatMap(p => p.diagnostics), merged.unresolved.map(p => ({ code: p.code, path: `${p.group}.${p.questionId}.${p.targetKey}`, message: `Referenced item ${p.rejectedTarget} is missing or rejected; this work is not closed.`, severity: "error" as const })))
      proposals.push({ delta: structuredClone(delta), diagnostics, revision: slice.revision, accepted: merged.accepted, rejected: merged.rejected, withdrawn: merged.withdrawn, withdrawalRejected: merged.withdrawalRejected, unresolved: merged.unresolved })
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
  const assembleResult = (raw: unknown) => {
    if (options.strategy !== "semantic-flow-v1") return { result: raw, diagnostics: [] }
    const assembled = assembleSemanticResult(options.program, slice, scheduler.snapshot(), raw)
    if (assembled.policyRules.length && !assembled.diagnostics.some(d => d.code === "semantic-result-stale")) {
      const merged = mergeControlSlice(slice, { schemaVersion: slice.schemaVersion, policyRules: assembled.policyRules }, options.program, evidenceContext())
      slice = merged.state; assembled.diagnostics.push(...merged.diagnostics); check = undefined
    }
    issues.set("$semantic-result", assembled.diagnostics)
    assemblies.push({ raw: structuredClone(raw), revision: slice.revision, derived: structuredClone(assembled.result), diagnostics: structuredClone(assembled.diagnostics) })
    return assembled
  }
  const feedback = () => ({ revision: slice.revision,
    rules: slice.rules.map(({ key, questionId, pathKey, kind, after, condition, bindingKey, bindingKind, principal, resource, digest }) => ({ key, questionId, pathKey, kind, after, condition, bindingKey, bindingKind, principal, resource, digest })),
    bindings: slice.bindings, policyRules: slice.policyRules, dependencies: scheduler.snapshot(), paths: lastPaths,
    diagnostics: [...issues.values()].flat().concat(check?.diagnostics ?? objectDiagnostics), ...(worklist ? { worklist: worklist.snapshot(), automaticActionsRemaining } : {}), semanticSupport: "unreviewed", ...(options.ablation ? { mechanismDisabled: options.ablation } : {}) })
  let contextHistoryPosition = 0, locationContextPosition = 0, explanationContextPosition = 0, fairContextPosition = 0
  const modelContext = (limits: { maxSourceBytes?: number } = {}) => {
    if (closed) throw new Error("session-closed")
    worklist?.sync(slice, check)
    const diagnostics = feedback().diagnostics.filter(d => d.severity === "error")
    const targets = slice.rules.filter(r => diagnostics.some(d => (!d.questionId || d.questionId === r.questionId) && (d.path.includes(`${r.questionId}.${r.key}`) || d.path === r.key && (!!d.questionId || slice.rules.filter(candidate => candidate.key === d.path).length === 1))))
    const diagnosed = targets.flatMap(r => r.evidenceIds)
    const questionIds = options.program.questions.filter(q => targets.some(r => r.questionId === q.id) || diagnostics.some(d => d.questionId ? d.questionId === q.id : d.path === q.id || d.path.startsWith(`${q.id}.`) || d.path.includes(`.${q.id}.`))).map(q => q.id)
    const currentReads = options.tools.history.slice(contextHistoryPosition)
    const shown = new Set(evidenceContext().shownEvidenceIds)
    const recent = [...new Set([...currentReads.flatMap(h => h.result.evidence.map(e => e.id)), ...options.tools.evidence.filter(e => !shown.has(e.id)).map(e => e.id)])]
    contextHistoryPosition = options.tools.history.length
    const context = localExplanationContext(options.program, worklist?.snapshot() ?? [], options.tools.evidence, slice, diagnosed, recent, locationContextPosition++, { offset: explanationContextPosition, fairOffset: fairContextPosition++, questionIds, ...limits })
    explanationContextPosition += 2
    offeredTasks = context.tasks
    if (options.strategy === "semantic-flow-v1") return { ...context, instruction: SEMANTIC_EXECUTION_GUIDE, tasks: context.tasks.map(task => ({ ...task, existingTargets: [], semanticUnits: semanticUnits.filter(u => u.questionId === task.question.id) })) }
    return context
  }
  let rejectedFeedbackPosition = 0
  // Keep canonical/archive diagnostics intact; describe the public local operation in model feedback.
  const modelDiagnostic = (d: InquiryDiagnostic): InquiryDiagnostic => {
    if (!isGuidedInquiryStrategy(options.strategy) || d.code !== "control-conflict") return d
    const rejected = currentRejections.find(p => p.diagnostics.some(original => original.code === d.code && original.path === d.path && original.message === d.message))
    if (!rejected) return d
    const group = rejected.group === "sourceBindings" ? "rules" : rejected.group === "premiseValues" ? "bindings" : rejected.group
    const existing = slice[group].find(r => r.questionId === rejected.questionId && r.key === rejected.targetKey)
    if (!existing || group === "rules" && (rejected.group === "sourceBindings") !== ((existing as { kind?: string }).kind === "binding")) return d
    const replacement = { op: "replace", questionId: rejected.questionId, targetKey: rejected.targetKey }
    return { ...d, message: `A changed add for this accepted target was rejected. Submit a ${rejected.group} item ${JSON.stringify(replacement)} with the corrected source fields. The host supplies revisionOf and records replacement provenance; dependency relevance reason remains required. The accepted target has not been overwritten.` }
  }
  const modelFeedback = () => {
    if (options.strategy === "semantic-flow-v1") {
      const state = feedback(), diagnostics = state.diagnostics.filter((d, i, all) => all.findIndex(v => v.code === d.code && v.path === d.path && v.questionId === d.questionId && v.message === d.message) === i)
      const pending = [...new Map(semanticRecords.filter(r => !r.accepted && issues.has(`$semantic-draft.${r.draftId}`)).map(r => [r.draftId, r])).values()], rejectedBlocks: Array<Record<string, unknown>> = []
      for (const record of pending.slice(-4)) {
        let view: Record<string, unknown> = { ...record }
        if (Buffer.byteLength(JSON.stringify([...rejectedBlocks, view])) > 16384) { const { raw: _raw, ...metadata } = record; view = { ...metadata, rawOmitted: "feedback-byte-limit" } }
        if (Buffer.byteLength(JSON.stringify([...rejectedBlocks, view])) <= 16384) rejectedBlocks.push(view)
      }
      return { revision: slice.revision, semanticUnits: semanticUnits.map(({ questionId, handle, role, itemId, parameters, complete }) => ({ questionId, handle, role, itemId, parameters, complete })), sourceTerminals: slice.rules.filter(r => r.terminal === true).map(({ key, questionId, pathKey, kind, outcome, returnValue, gap, complete, sourceOrigin, evidenceIds }) => ({ key, questionId, pathId: pathKey, kind, terminal: true, outcome, returnValue, gap, complete, sourceOrigin, evidenceIds })), bindings: slice.bindings, dependencies: scheduler.snapshot(), resultSkeleton: semanticResultSkeleton(slice, scheduler.snapshot()), diagnostics: diagnostics.slice(0, 16), diagnosticCount: diagnostics.length, rejectedBlocks, rejectedBlockCount: pending.length, ...(state.worklist ? { worklist: worklistModelView(state.worklist) } : {}), semanticSupport: "unreviewed" }
    }
    const { worklist: fullWorklist, ...state } = feedback(), diagnostics = state.diagnostics.filter((d, i, all) => all.findIndex(v => v.code === d.code && v.path === d.path && v.message === d.message && v.questionId === d.questionId) === i)
    const rejections = [...new Map(currentRejections.map(p => [draftIdentity(p), p])).values()]
    const position = rejectedFeedbackPosition % Math.max(1, rejections.length)
    rejectedFeedbackPosition += 4
    const rejectedTargets: Array<Record<string, unknown>> = []
    for (const p of [...rejections.slice(position), ...rejections.slice(0, position)].slice(0, 4)) {
      const draft = rejectedDrafts.get(draftIdentity(p)), group = p.group === "sourceBindings" ? "rules" : p.group === "premiseValues" ? "bindings" : p.group
      const existing = slice[group].find(r => r.questionId === p.questionId && r.key === p.targetKey)
      const targetGroupConflict = !!existing && group === "rules" && (p.group === "sourceBindings") !== ((existing as { kind?: string }).kind === "binding")
      const acceptedTarget = !!existing && !targetGroupConflict
      const ownDiagnostics = currentRejections.filter(r => draftIdentity(r) === draftIdentity(p)).flatMap(r => r.diagnostics).map(modelDiagnostic)
      let view: Record<string, unknown> = { group: p.group, questionId: p.questionId, targetKey: p.targetKey, diagnostics: ownDiagnostics, acceptedTarget, targetGroupConflict, ...(!targetGroupConflict ? { correctionOp: acceptedTarget ? "replace" : "add" } : {}), withdrawalEligible: !existing, ...(draft ? { submitted: draft.submitted, localScope: draft.localScope, archive: draft.archive } : { submittedOmitted: "draft-not-retained" }) }
      const fits = (item: Record<string, unknown>) => Buffer.byteLength(JSON.stringify([...rejectedTargets, item])) <= 16384
      if (!fits(view)) { const { submitted: _submitted, ...metadata } = view; view = { ...metadata, submittedOmitted: "feedback-byte-limit" } }
      if (!fits(view)) view = { archive: draft?.archive, submittedOmitted: "feedback-byte-limit", identityAndDiagnosticsOmitted: true, diagnosticCount: ownDiagnostics.length }
      if (fits(view)) rejectedTargets.push(structuredClone(view))
    }
    return { ...state, ...(fullWorklist ? { worklist: worklistModelView(fullWorklist) } : {}), diagnostics: diagnostics.slice(0, 16).map(modelDiagnostic), diagnosticCount: diagnostics.length, rejectedTargets, rejectedTargetCount: rejections.length }
  }
  return { propose, sync, validate, assembleResult, feedback, modelContext, modelFeedback, beginStep: () => { if (closed) throw new Error("session-closed"); automaticActionsRemaining = 2 }, close: () => { closed = true },
    report: () => ({ slice: structuredClone(slice), proposals: structuredClone(proposals), currentRejections: structuredClone(currentRejections), localExtractions: structuredClone(localExtractions), ...(options.strategy === "semantic-flow-v1" ? { semantic: { units: structuredClone(semanticUnits), records: structuredClone(semanticRecords), assemblies: structuredClone(assemblies) } } : {}), dependencies: scheduler.snapshot(), schedulerActions: structuredClone([...scheduler.actions, ...(worklist?.actions ?? [])]), ...(worklist ? { worklist: { items: worklist.snapshot(), actions: structuredClone(worklist.actions) } } : {}), objectFeedback: { revision: objectRevision, diagnostics: structuredClone(objectDiagnostics) }, check, checkHistory: structuredClone(checkHistory), computation: { ...computation }, ablation: options.ablation, closed }) }
}
