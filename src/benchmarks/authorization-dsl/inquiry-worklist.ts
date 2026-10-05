import { createHash } from "node:crypto"
import type { AuthorizationInquiryProgram, InquiryRelation } from "../../task-dsl/authorization/inquiry-program.ts"
import { controlRuleReach } from "../../task-dsl/authorization/control-conclusion.ts"
import type { ControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import type { DiscoverySymbol } from "./evidence-preparation/discovery.ts"
import type { InquiryTools, InquiryToolOutput } from "./inquiry-tools.ts"
import type { ScheduledDependency } from "./inquiry-domain-scheduler.ts"
import { operationWork } from "./operation-work.ts"
import type { SourceFactDependency } from "../../task-dsl/authorization/operation-facts.ts"
import type { BoundSemanticBlock } from "../../task-dsl/authorization/semantic-flow.ts"
import { operationCallSources } from "./operation-links.ts"

export type WorkState = "unlocated" | "awaiting-read" | "awaiting-interpretation" | "awaiting-binding" | "awaiting-verification" | "closed" | "external-unknown" | "blocked"
export interface WorkItem {
  id: string; questionId: string; kind: InquiryRelation; question: string; entryHint?: string; symbol?: string;
  origin: "question-duty" | "source-reference" | "explicit-dependency" | "structure-relation"; parentId?: string; dependencyId?: string; receiverClass?: string; relationId?: string;
  state: WorkState; decisive: boolean; code?: string; reason: string; candidates: DiscoverySymbol[]; selected?: DiscoverySymbol;
  selectedBy?: "explicit-selection" | "explicit-discovery-selection" | "unique-index-candidate" | "accepted-entry-citation";
  callsiteEvidenceIds: string[]; evidenceIds: string[]; semanticSupport: "unreviewed";
  nextAction: { kind: "locate" | "select-candidate" | "read" | "interpret" | "bind" | "check" | "none"; itemId: string }
}
export interface WorklistAction {
  actionOrigin: "domain-worklist"; questionId: string; dependencyId: string; name: "source_read";
  arguments: { path: string; startLine: number; endLine: number }; reason: string; budgetConsumed: number; output: InquiryToolOutput
}
const stableId = (value: unknown) => "work-" + createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20)
const syntax = new Set(["if", "for", "while", "switch", "catch", "function", "func", "def", "class", "with", "match", "typeof", "sizeof", "return"])
const priority: Record<InquiryRelation, number> = { entry: 0, "principal-binding": 1, "resource-binding": 2, guard: 3, effect: 4, exception: 5 }

/** Keep every current duty addressable; focused location tasks carry full candidate metadata. */
export function worklistModelView(items: WorkItem[]) {
  return items.map(({ id, questionId, kind, origin, state, decisive, code, reason, symbol, parentId, dependencyId, receiverClass, nextAction, callsiteEvidenceIds, evidenceIds, candidates, selected, selectedBy, semanticSupport }) => ({
    id, questionId, kind, origin, state, decisive, code, reason, symbol, parentId, dependencyId, receiverClass,
    nextAction: structuredClone(nextAction), callsiteEvidenceIds: [...callsiteEvidenceIds], evidenceIds: [...evidenceIds], candidateCount: candidates.length,
    ...(selected ? { selected: { id: selected.id, path: selected.path, startLine: selected.startLine, endLine: selected.endLine }, selectedBy } : {}), semanticSupport,
  }))
}

/** Source candidates are lexical work, never an inferred call graph or authorization fact. */
export function createInquiryWorklist(options: { program: AuthorizationInquiryProgram; tools: InquiryTools; entryContext?: string; remainingActions?: () => number; dependencyStates?: () => ScheduledDependency[]; structural?: boolean; semanticUnits?: () => BoundSemanticBlock[] }) {
  const items = new Map<string, WorkItem>(), choices = new Map<string, { candidate: DiscoverySymbol; origin: "explicit-selection" | "explicit-discovery-selection" }>(), invalidFiles = new Set<string>(), failedReads = new Map<string, string>()
  const actions: WorklistAction[] = [], questionIds = options.program.questions.map(q => q.id)
  const relations = new Map<string, { id: string; questionId: string; sourceId: string; candidateId?: string; reason: string; state: string; gap?: string }>(), frameworkDependencies = new Map<string, SourceFactDependency>()
  let lastQuestion = -1
  const make = (id: string, questionId: string, kind: InquiryRelation, origin: WorkItem["origin"], question: string, extra: Partial<WorkItem> = {}): WorkItem => ({ id, questionId, kind, origin, question, state: "unlocated", decisive: false, reason: "Locate original source or an explicit question relation.", candidates: [], callsiteEvidenceIds: [], evidenceIds: [], semanticSupport: "unreviewed", nextAction: { kind: "locate", itemId: id }, ...extra })
  for (const duty of options.program.queue) {
    const q = options.program.questions.find(q => q.id === duty.questionId)!
    let candidates = duty.kind === "entry" ? options.tools.symbolHints(q.entryHint ?? "") : []
    if (duty.kind === "entry" && !candidates.length) candidates = options.tools.symbolHints([q.operation, q.request].filter(Boolean).join(" "))
    if (duty.kind === "entry" && !candidates.length && options.entryContext) candidates = options.tools.symbolHints(options.entryContext)
    items.set(duty.id, make(duty.id, duty.questionId, duty.kind, "question-duty", duty.question, { entryHint: q.entryHint, ...(duty.kind === "entry" ? { candidates: candidates.slice(0, 16), decisive: true } : {}) }))
  }
  const rootFor = (questionId: string) => {
    const operation = options.program.operations?.find(o => options.program.operationQuestions?.some(q => q.questionId === questionId && q.operationId === o.id))
    return [...items.values()].find(i => i.questionId === (operation?.sourceQuestionId ?? questionId) && i.origin === "question-duty" && i.kind === "entry")!
  }
  const coveredThrough = (c: DiscoverySymbol) => {
    let through = c.startLine - 1
    for (const e of options.tools.evidence.filter(e => e.path === c.path && e.sha256 === c.sha256).sort((a, b) => a.startLine - b.startLine)) if (e.startLine <= through + 1 && e.endLine >= through + 1) through = e.endLine
    return through
  }
  const evidenceFor = (c: DiscoverySymbol) => options.tools.evidence.filter(e => e.path === c.path && e.sha256 === c.sha256 && e.startLine <= c.endLine && e.endLine >= c.startLine)
  const transition = (item: WorkItem, state: WorkState, action: WorkItem["nextAction"]["kind"], reason: string, code?: string) => Object.assign(item, { state, nextAction: { kind: action, itemId: item.id }, reason, code })
  const represented = (item: WorkItem, slice: ControlSlice) => {
    const accepted = options.semanticUnits?.()
    const units = accepted && (options.structural || accepted.some(u => u.source)) ? accepted.filter(u => u.questionId === item.questionId && u.source?.id === item.selected?.id && u.receiverClass === item.receiverClass) : undefined
    return slice.rules.filter(r => r.questionId === item.questionId && (units ? units.some(u => u.handle === r.sourceOrigin?.handle) : r.evidenceIds.some(id => item.evidenceIds.includes(id))))
  }
  const declaredEntryLocation = (item: WorkItem, slice: ControlSlice) => {
    if (item.origin !== "question-duty" || item.kind !== "entry") return undefined
    const ids = new Set(slice.rules.filter(r => r.questionId === item.questionId && r.kind === "entry" && r.sourceBound).flatMap(r => r.evidenceIds))
    const windows = options.tools.evidence.filter(e => ids.has(e.id))
    const candidates = item.candidates.filter(c => windows.some(e => e.path === c.path && e.sha256 === c.sha256 && e.startLine <= c.startLine && e.endLine >= c.startLine))
    return candidates.length === 1 ? candidates[0] : undefined
  }
  const discoverReferences = (parent: WorkItem) => {
    if (!parent.selected) return
    if (options.structural && options.tools.structure) {
      const index = options.tools.structure, interpreted = options.semanticUnits ? options.semanticUnits().filter(u => u.questionId === parent.questionId && u.source).map(u => ({ id: u.source!.id, receiverClass: u.receiverClass })) : [...items.values()].filter(i => represented(i, currentSlice).length).flatMap(i => i.selected?.id ?? [])
      const work = operationWork(index, parent.selected.id, [...items.values()].filter(i => i.selected && coveredThrough(i.selected) >= i.selected.endLine).map(i => i.selected!.id), interpreted, parent.receiverClass)
      for (const d of work.frameworkDependencies) frameworkDependencies.set(d.key, d)
      for (const gap of work.gaps) relations.set(`${parent.questionId}:${gap.id}`, { id: gap.id, questionId: parent.questionId, sourceId: parent.selected.id, reason: `Inspect ${gap.expression} at ${gap.path}:${gap.startLine}`, state: gap.resolution, gap: gap.gap })
      for (const a of work.actions) {
        const candidate = options.tools.symbolById(a.candidateId); if (!candidate) continue
        // One body per operation/receiver context; retain multiple relation records.
        const id = stableId([parent.questionId, "structure", candidate.id, a.receiverClass])
        relations.set(`${parent.questionId}:${a.relationId}:${candidate.id}`, { id: a.relationId, questionId: parent.questionId, sourceId: parent.selected.id, candidateId: candidate.id, reason: a.reason, state: a.kind })
        if (candidate.id === parent.selected.id || [...items.values()].some(i => i.questionId === parent.questionId && i.selected?.id === candidate.id && i.receiverClass === a.receiverClass)) continue
        if ([...items.values()].filter(i => i.questionId === parent.questionId && i.origin === "structure-relation").length >= 48) { parent.code = "work-structure-limit"; break }
        if (!items.has(id)) items.set(id, make(id, parent.questionId, a.obligation, "structure-relation", a.reason, { symbol: candidate.name, parentId: parent.id, candidates: [candidate], selected: candidate, relationId: a.relationId, receiverClass: a.receiverClass, callsiteEvidenceIds: [...parent.evidenceIds], reason: a.reason }))
      }
      return
    }
    const names = new Set<string>(); let skippedDeclaration = false
    for (const e of evidenceFor(parent.selected)) for (const [offset, line] of e.quote.split(/\r?\n/).entries()) {
      const lineNumber = e.startLine + offset
      if (lineNumber < parent.selected.startLine || lineNumber > parent.selected.endLine) continue
      for (const match of line.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
        const name = match[1]!
        if (name === parent.selected.name && !skippedDeclaration && lineNumber === parent.selected.startLine) { skippedDeclaration = true; continue }
        if (!syntax.has(name)) names.add(name)
      }
    }
    for (const name of names) {
      const candidates = options.tools.locateSymbols(name)
      if (!candidates.length) continue
      const id = stableId([parent.questionId, parent.selected.id, name])
      if (items.has(id)) continue
      if ([...items.values()].filter(i => i.questionId === parent.questionId && i.origin === "source-reference").length >= 32) { parent.code = "work-reference-limit"; break }
      items.set(id, make(id, parent.questionId, "guard", "source-reference", `Interpret the lexical reference ${name} in relation to this current question; its role is not established.`, { symbol: name, parentId: parent.id, candidates: candidates.slice(0, 16), callsiteEvidenceIds: [...parent.evidenceIds] }))
    }
  }
  let currentSlice: ControlSlice
  const sync = (slice: ControlSlice, check?: { ruleConsistency: boolean | null; taskResolution: string }): WorkItem[] => {
    currentSlice = slice
    for (const h of options.tools.history) if (["source-changed", "source-root-changed", "symlink-escape"].includes(h.result.code ?? "")) {
      const selector = (h.arguments as Record<string, unknown>).path
      // A symbol/search selector may name a directory or omit its path entirely.
      const paths = options.tools.files.filter(f => h.result.code === "source-root-changed" || selector === undefined || selector === "." || f.path === selector || typeof selector === "string" && f.path.startsWith(`${selector}/`)).map(f => f.path)
      for (const p of paths) invalidFiles.add(p)
    }
    const dependencies = (options.dependencyStates?.() ?? []).filter(d => !options.structural || (options.program.operations?.find(o => options.program.operationQuestions?.some(q => q.questionId === d.questionId && q.operationId === o.id))?.sourceQuestionId ?? d.questionId) === d.questionId)
    const activeDependencies = new Set(dependencies.map(d => d.id))
    const retired = new Set([...items.values()].filter(item => item.origin === "explicit-dependency" && item.dependencyId && !activeDependencies.has(item.dependencyId)).map(item => item.id))
    // Lexical leads belong to their current parent; archived reads and proposals retain their own history.
    for (const id of retired) for (const item of items.values()) if (item.parentId === id) retired.add(item.id)
    for (const id of retired) { items.delete(id); choices.delete(id); failedReads.delete(id) }
    for (const d of dependencies) {
      const id = stableId(["dependency", d.id]), kind = slice.dependencies.find(p => p.id === d.id)?.kind
      const relation: InquiryRelation = kind === "principal-binding" || kind === "resource-binding" || kind === "effect" || kind === "exception" ? kind : "guard"
      const item = items.get(id) ?? make(id, d.questionId, relation, "explicit-dependency", d.reason, { dependencyId: d.id, symbol: d.symbol, decisive: d.decisive })
      item.candidates = d.candidates; item.evidenceIds = d.evidenceIds; item.reason = d.reason
      if (options.structural && d.candidates.length === 1) {
        const dependency = slice.dependencies.find(p => p.id === d.id), origin = slice.rules.find(r => r.questionId === d.questionId && r.key === dependency?.from)?.sourceOrigin
        const caller = options.semanticUnits?.().find(u => u.questionId === d.questionId && u.handle === origin?.handle)
        const step = caller?.blocks.find(b => b.name === origin?.block)?.steps.find(s => s.name === origin?.step)
        const sources = caller && step?.kind === "call" && options.tools.structure ? operationCallSources(options.tools.structure, caller, step).filter(a => a.candidateId === d.candidates[0]!.id) : []
        // Resolve this occurrence from its actual caller, before discovery order can
        // create an unrelated or receiver-free copy of the same inherited body.
        const contexts = [...new Set(sources.map(a => a.receiverClass))]
        item.receiverClass = contexts.length === 1 ? contexts[0] : undefined
      }
      if (d.state === "inapplicable") transition(item, "closed", "none", d.reason, d.code)
      else if (d.state === "external-unknown" || d.state === "blocked") transition(item, d.state, "none", d.reason, d.code)
      else transition(item, "unlocated", "locate", d.reason, d.code)
      items.set(id, item)
    }
    for (const item of [...items.values()]) {
      if (item.origin === "explicit-dependency" && ["closed", "external-unknown", "blocked"].includes(item.state)) continue
      const root = rootFor(item.questionId)
      if (item.origin === "question-duty" && item.kind !== "entry") {
        item.selected = root.selected; item.selectedBy = root.selectedBy; item.evidenceIds = [...root.evidenceIds]
        if (root.selected && invalidFiles.has(root.selected.path)) { transition(item, "blocked", "none", "Entry source changed; this related duty cannot be promoted.", "source-invalidated"); continue }
        transition(item, check?.ruleConsistency && check.taskResolution === "bounded" ? "closed" : represented(item, slice).length ? "awaiting-verification" : root.state === "awaiting-interpretation" ? "awaiting-interpretation" : "awaiting-binding", check?.ruleConsistency && check.taskResolution === "bounded" ? "none" : represented(item, slice).length ? "check" : "interpret", "Question duty follows actual entry evidence; optional roles are not invented. A closed duty is only coverage of proposed bounded paths.")
        continue
      }
      const choice = choices.get(item.id), candidate = choice?.candidate ?? (item.candidates.length === 1 ? item.candidates[0] : declaredEntryLocation(item, slice))
      item.selected = candidate
      item.selectedBy = candidate ? choice?.origin ?? (item.candidates.length === 1 ? "unique-index-candidate" : "accepted-entry-citation") : undefined
      if (candidate && invalidFiles.has(candidate.path)) { transition(item, "blocked", "none", "Original source changed; start a fresh session before promoting extraction.", "source-invalidated"); continue }
      if (failedReads.has(item.id)) { transition(item, "blocked", "none", "The prior actual read failed; preserve the gap without spinning.", failedReads.get(item.id)); continue }
      if (!candidate) { transition(item, "unlocated", item.candidates.length > 1 ? "select-candidate" : "locate", "Choose an original indexed candidate; no semantic location is inferred.", item.candidates.length > 1 ? "location-ambiguous" : "location-missing"); continue }
      let ancestor = item.parentId ? items.get(item.parentId) : undefined, cyclic = false
      while (ancestor) { if (candidate.id === ancestor.selected?.id && (!options.structural || item.receiverClass === ancestor.receiverClass)) cyclic = true; ancestor = ancestor.parentId ? items.get(ancestor.parentId) : undefined }
      if (cyclic) { transition(item, "blocked", "none", "The selected reference returns to an ancestor candidate; no automatic recursive read.", "reference-cycle"); continue }
      item.evidenceIds = evidenceFor(candidate).map(e => e.id)
      const parentRules = item.parentId ? represented(items.get(item.parentId)!, slice) : []
      if (item.parentId && !parentRules.length && item.origin !== "structure-relation") { transition(item, "awaiting-binding", "bind", "Interpret and link the parent source window before reading this lexical candidate.", "parent-interpretation-pending"); continue }
      const declared = item.origin === "source-reference" ? slice.dependencies.filter(d => d.questionId === item.questionId && d.symbol === item.symbol && parentRules.some(r => r.key === d.from)).map(d => dependencies.find(s => s.id === d.id)) : []
      if (item.origin === "source-reference" && !declared.length && !choices.has(item.id)) { item.evidenceIds = []; transition(item, "awaiting-binding", "bind", "This lexical name is only a lead. Link a relevant source dependency or explicitly choose its candidate before reading it.", "reference-relevance-unconfirmed"); continue }
      if (declared.length && declared.every(d => d?.state === "inapplicable")) { transition(item, "closed", "none", "All explicitly linked occurrences are unreachable under the current proposed controls; a later correction can reopen this candidate.", "dependency-unreachable"); continue }
      if (candidate.boundary === "uncertain") { transition(item, "blocked", "interpret", "The indexed declaration boundary is uncertain. Request an explicit original range and explain its coverage before promotion.", "source-boundary-uncertain"); continue }
      if (coveredThrough(candidate) < candidate.endLine) { transition(item, "awaiting-read", "read", "A unique allowed candidate still has original lines not shown.", "source-range-unread"); continue }
      const proposed = represented(item, slice)
      if (!proposed.length) transition(item, "awaiting-interpretation", "interpret", "Original source is shown. Explain its role and conditions in a local update; citation is not interpretation.", "source-needs-interpretation")
      else if (item.parentId && item.origin !== "structure-relation" && !proposed.some(r => controlRuleReach(slice, r).ancestors.some(a => parentRules.some(p => p.id === a.id)))) transition(item, "awaiting-binding", "bind", "Accepted interpretation still needs an explicit link to the parent source rule.", "source-link-missing")
      else transition(item, check?.ruleConsistency && check.taskResolution === "bounded" ? "closed" : "awaiting-verification", check?.ruleConsistency && check.taskResolution === "bounded" ? "none" : "check", "Source is represented by a linked proposal; meaning remains unreviewed.")
      discoverReferences(item)
    }
    return snapshot()
  }
  const snapshot = () => structuredClone([...items.values()])
  const selectCandidate = (selection: { questionId: string; itemId: string; candidateId: string }) => {
    const item = items.get(selection.itemId)
    if (!item) return { status: "rejected", code: "work-item-missing" }
    if (item.questionId !== selection.questionId) return { status: "rejected", code: "work-question-mismatch" }
    const local = item.candidates.find(c => c.id === selection.candidateId)
    const discovered = options.tools.history.filter(h => h.name === "source_symbol" && ["ok", "ambiguous"].includes(h.result.status)).flatMap(h => h.result.candidates).find(c => c.id === selection.candidateId)
    const candidate = local ?? discovered
    if (!candidate) return { status: "rejected", code: "work-candidate-missing" }
    if (item.selected && item.selected.id !== candidate.id) {
      const retired = new Set([item.id])
      for (const id of retired) for (const child of items.values()) if (child.parentId === id) retired.add(child.id)
      for (const id of retired) if (id !== item.id) { items.delete(id); choices.delete(id); failedReads.delete(id) }
    }
    const origin = local ? "explicit-selection" as const : "explicit-discovery-selection" as const
    choices.set(item.id, { candidate: structuredClone(candidate), origin }); failedReads.delete(item.id)
    return { status: "accepted", itemId: item.id, candidateId: selection.candidateId, origin }
  }
  const run = async (slice: ControlSlice, maxActions = 2) => {
    const start = actions.length, limit = Math.min(2, Math.max(0, maxActions))
    while (actions.length - start < limit) {
      sync(slice)
      let next: WorkItem | undefined
      for (let offset = 1; offset <= questionIds.length; offset++) {
        const index = (lastQuestion + offset) % questionIds.length
        next = [...items.values()].filter(i => i.questionId === questionIds[index] && i.state === "awaiting-read" && i.selected?.boundary !== "uncertain").sort((a, b) => Number(b.decisive) - Number(a.decisive) || priority[a.kind] - priority[b.kind] || a.id.localeCompare(b.id))[0]
        if (next) { lastQuestion = index; break }
      }
      if (!next) break
      if (Math.min(options.tools.maxToolCalls - options.tools.toolCalls, options.remainingActions?.() ?? Infinity) <= 0) { transition(next, "blocked", "none", "Shared exploration budget is exhausted; no hidden read was dispatched.", "tool-budget"); break }
      const c = next.selected!, startLine = Math.max(c.startLine, coveredThrough(c) + 1), args = { path: c.path, startLine, endLine: Math.min(c.endLine, startLine + 159) }
      const origin = { actionOrigin: "domain-worklist" as const, questionId: next.questionId, dependencyId: next.id, reason: next.reason }, before = options.tools.toolCalls
      const output = await options.tools.execute("source_read", args, origin)
      actions.push({ ...origin, name: "source_read", arguments: args, budgetConsumed: options.tools.toolCalls - before, output })
      if (output.status === "error") failedReads.set(next.id, output.code ?? "source-read-failed")
      sync(slice)
    }
    return actions.slice(start)
  }
  return { sync, run, snapshot, selectCandidate, actions, report: () => ({ relations: structuredClone([...relations.values()]), frameworkDependencies: structuredClone([...frameworkDependencies.values()]) }) }
}
