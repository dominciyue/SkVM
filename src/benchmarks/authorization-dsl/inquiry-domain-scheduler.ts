import { controlBindings, type ControlSlice, type BoundControlDependency } from "../../task-dsl/authorization/control-slice.ts"
import { controlRuleReach, type DependencyCheckState } from "../../task-dsl/authorization/control-conclusion.ts"
import { partialEvaluate } from "../../task-dsl/authorization/control-evaluation.ts"
import type { DiscoverySymbol } from "./evidence-preparation/discovery.ts"
import type { InquiryTools, InquiryToolOutput } from "./inquiry-tools.ts"
import { selectSourceCandidates, type SourceSelector } from "./evidence-preparation/source-selector.ts"

export type DependencyState = "pending" | "located" | "read" | "proposed" | "checked" | "inapplicable" | "external-unknown" | "blocked"
export interface ScheduledDependency extends DependencyCheckState {
  id: string; digest: string; state: DependencyState; code?: string; reason: string; candidates: DiscoverySymbol[]; evidenceIds: string[]; semanticSupport: "unreviewed"; locatorNormalization?: { from: string; to: string }; sourceSelector?: SourceSelector
}
export interface SchedulerAction {
  actionOrigin: "domain-scheduler"; questionId: string; dependencyId: string; name: "source_read"; arguments: { path: string; startLine: number; endLine: number };
  reason: string; budgetConsumed: number; output: InquiryToolOutput
}
/** Every actual read goes through the same source executor and its monotone budget. */
export function createInquiryDomainScheduler(options: { tools: InquiryTools; remainingActions?: () => number; evaluateConditions?: boolean }) {
  const entries = new Map<string, ScheduledDependency>(), actions: SchedulerAction[] = [], invalidFiles = new Set<string>()
  const priority = { "principal-binding": 0, "resource-binding": 1, control: 2, effect: 3, exception: 4 }
  const coveredThrough = (candidate: DiscoverySymbol) => {
    let through = candidate.startLine - 1
    for (const e of options.tools.evidence.filter(e => e.path === candidate.path && e.sha256 === candidate.sha256).sort((a, b) => a.startLine - b.startLine)) {
      if (e.startLine <= through + 1 && e.endLine >= through + 1) through = e.endLine
    }
    return through
  }
  const update = (slice: ControlSlice, d: BoundControlDependency): ScheduledDependency => {
    let entry = entries.get(d.id)
    if (!entry || entry.digest !== d.digest) {
      entry = { id: d.id, digest: d.digest, key: d.key, questionId: d.questionId, pathKey: d.pathKey, decisive: d.decisive, symbol: d.symbol, state: "proposed", reason: d.reason, candidates: [], evidenceIds: [], semanticSupport: "unreviewed" }
      entries.set(d.id, entry)
    }
    const stop = (state: DependencyState, code: string, reason: string) => { Object.assign(entry!, { state, code, reason }); return entry! }
    const from = slice.rules.find(r => r.questionId === d.questionId && r.key === d.from)
    if (!from) return stop("blocked", "dependency-parent-missing", "Dependency has no accepted local source node.")
    const enabled = options.evaluateConditions !== false, reach = controlRuleReach(slice, from, enabled), condition = enabled ? partialEvaluate(d.condition ?? { op: "all", args: [] }, controlBindings(slice, d.questionId)) : undefined
    if (enabled && (reach.predicate.truth === "false" || condition?.truth === "false" || reach.stoppedBy.length || (d.after ?? []).some(k => {
      const node = slice.rules.find(r => r.questionId === d.questionId && r.key === k && r.kind === "reject")
      return node && controlRuleReach(slice, node).predicate.truth === "true"
    }))) return stop("inapplicable", "dependency-unreachable", "Explicit current premise or preceding terminating rejection excludes this dependency.")
    if (reach.gaps.length) return stop("blocked", "dependency-control-gap", reach.gaps.join(", "))
    const chain = new Set([d.key]); let parent = d.parent
    while (parent) {
      if (chain.has(parent)) return stop("blocked", "dependency-cycle", "Local dependency chain is cyclic.")
      chain.add(parent); const previous = slice.dependencies.find(p => p.questionId === d.questionId && p.key === parent)
      if (!previous) return stop("blocked", "dependency-parent-missing", "Dependency chain names an absent parent.")
      parent = previous.parent
    }
    // Lexical occurrence is merely a location hint. Source-bound semantic meaning stays unreviewed.
    const escaped = d.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (!d.evidenceIds.some(id => options.tools.evidence.some(e => e.id === id && new RegExp(`(?:^|[^A-Za-z0-9_])${escaped}(?:$|[^A-Za-z0-9_])`).test(e.quote)))) return stop("blocked", "dependency-callsite-missing", "Named dependency is not present in its shown source reference.")
    const all = options.tools.locateSymbols(d.symbol)
    const selected = selectSourceCandidates({ path: d.pathHint ?? ".", candidateId: d.candidateId }, { candidates: all, paths: options.tools.files.map(f => f.path) })
    entry.sourceSelector = selected.selector
    entry.candidates = selected.candidates
    if (selected.status === "unresolved") return stop(selected.code === "source-selector-out-of-scope" ? "external-unknown" : "blocked", selected.code === "source-selector-out-of-scope" ? "dependency-out-of-scope" : selected.code === "source-selector-range-mismatch" ? "dependency-locator-range-mismatch" : selected.code, selected.message)
    if (d.pathHint && selected.selector.path !== d.pathHint) entry.locatorNormalization = { from: d.pathHint, to: selected.selector.path }
    if (!entry.candidates.length) return stop("blocked", "dependency-not-located", "No allowed lexical candidate was located; this is not proof of absent authorization.")
    if (entry.candidates.length !== 1) return stop("located", "dependency-ambiguous", "Select a shown candidate using pathHint/candidateId in an explicit revision; host cannot infer the correct helper.")
    const candidate = entry.candidates[0]!
    if (invalidFiles.has(candidate.path)) return stop("blocked", "source-changed", "This file changed during the session; prior extraction cannot be promoted.")
    entry.evidenceIds = options.tools.evidence.filter(e => e.path === candidate.path && e.sha256 === candidate.sha256 && e.startLine <= candidate.endLine && e.endLine >= candidate.startLine).map(e => e.id)
    if (coveredThrough(candidate) >= candidate.endLine && candidate.boundary !== "uncertain") {
      const incorporated = slice.rules.some(r => r.questionId === d.questionId && r.key !== d.from && r.evidenceIds.some(id => entry!.evidenceIds.includes(id)) && controlRuleReach(slice, r, enabled).ancestors.some(n => n.key === d.from))
      return incorporated ? stop("checked", "dependency-incorporated", "Read source is incorporated in an explicitly linked proposed rule; semantic support remains unreviewed.") : stop("read", "dependency-source-read", "Original candidate range is actually shown. Its semantic role still needs model analysis.")
    }
    return stop("located", candidate.boundary === "uncertain" ? "dependency-boundary-uncertain" : "dependency-read-pending", "Live binding/control/effect dependency is uniquely located and still needs original source.")
  }
  const run = async (slice: ControlSlice, maxActions = 2) => {
    const currentIds = new Set(slice.dependencies.map(d => d.id))
    for (const key of entries.keys()) if (!currentIds.has(key)) entries.delete(key)
    const start = actions.length, ordered = [...slice.dependencies].sort((a, b) => priority[a.kind] - priority[b.kind] || Number(b.decisive) - Number(a.decisive) || a.id.localeCompare(b.id))
    for (const dep of ordered) update(slice, dep)
    let progressed = true
    while (actions.length - start < Math.min(2, Math.max(0, maxActions)) && progressed) {
      progressed = false
      for (const dep of ordered) {
        const entry = update(slice, dep)
        if (entry.state !== "located" || entry.candidates.length !== 1 || entry.code === "dependency-boundary-uncertain") continue
        const remaining = Math.min(options.tools.maxToolCalls - options.tools.toolCalls, options.remainingActions?.() ?? Number.MAX_SAFE_INTEGER)
        if (remaining <= 0) { entry.state = "blocked"; entry.code = "tool-budget"; entry.reason = "Shared exploration/source budget is exhausted; no read was dispatched."; continue }
        const candidate = entry.candidates[0]!, startLine = Math.max(candidate.startLine, coveredThrough(candidate) + 1)
        const args = { path: candidate.path, startLine, endLine: Math.min(candidate.endLine, startLine + 159) }
        const reason = `Live ${dep.kind} dependency ${dep.key}: ${dep.reason}; location is unique in allowed source, read coverage is incomplete.`
        const origin = { actionOrigin: "domain-scheduler" as const, questionId: dep.questionId, dependencyId: dep.id, reason }
        const before = options.tools.toolCalls, output = await options.tools.execute("source_read", args, origin)
        actions.push({ ...origin, name: "source_read", arguments: args, budgetConsumed: options.tools.toolCalls - before, output }); progressed = true
        if (output.status === "error") {
          entry.state = "blocked"; entry.code = output.code ?? "source-read-failed"; entry.reason = output.message ?? "Read failed"
          if (["source-changed", "source-root-changed", "symlink-escape"].includes(entry.code)) invalidFiles.add(candidate.path)
          // Failed reads consume budget once and remain local gaps, never spin on the same failure.
          return actions.slice(start)
        }
        update(slice, dep)
        break
      }
    }
    return actions.slice(start)
  }
  return { run, actions, snapshot: () => structuredClone([...entries.values()]) }
}
