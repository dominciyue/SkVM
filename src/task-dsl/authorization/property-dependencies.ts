import { createHash } from "node:crypto"
import type { SourceAnchor, SourceFlow, SourceSkeleton } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { SourceInterpretation } from "./source-interpretation.ts"
import { bindPropertyQueries, type PropertyQuestion } from "./property-query.ts"
import type { PropertyCallSummary } from "./procedure-summary.ts"

export interface DependencyQuestion extends PropertyQuestion { operationId?: string; premises?: string[] }
export interface PropertyDependencies {
  schemaVersion: "authorization-question-dependencies/v1" | "authorization-property-dependencies/v2"; revision: string; question: DependencyQuestion;
  seeds: Array<{ anchorId: string; role: string; origin: "source-exit" | "source-interpretation" | "unknown-call" | "property-target"; selector: SourceAnchor["selector"] }>;
  edges: Array<{ from: string; to: string; kind: "data" | "field" | "call-argument" | "control" | "exception" }>;
  boundaries: Array<{ anchorId: string; code: "unknown-call-influence" | "source-dependency-unavailable"; selector: SourceAnchor["selector"]; candidateIds?: string[] }>;
  requiredAnchorIds: string[]; localExclusions: Array<{ anchorId: string; proofAnchorId: string; selector: SourceAnchor["selector"] }>;
  propertyQueries?: ReturnType<typeof bindPropertyQueries>;
  residuals?: Array<{ anchorId: string; questionId: string; propertyIds: string[]; code: string; selector: SourceAnchor["selector"] }>;
  summaryUses?: Array<{ anchorId: string; targetId: string; revision: string; propertyIds: string[] }>;
  callScopes?: Array<{ anchorId: string; sourceCallId: string; state: "required" | "summary" | "residual"; reason: string }>;
}
type State = { definitions: Map<string, Set<string>>; controls: Set<string>; unknown: Set<string> }
const copy = (s: State): State => ({ definitions: new Map([...s.definitions].map(([key, values]) => [key, new Set(values)])), controls: new Set(s.controls), unknown: new Set(s.unknown) })
const merge = (states: State[]): State => {
  const result: State = { definitions: new Map(), controls: new Set(), unknown: new Set() }
  for (const state of states) {
    for (const [name, ids] of state.definitions) for (const id of ids) { if (!result.definitions.has(name)) result.definitions.set(name, new Set()); result.definitions.get(name)!.add(id) }
    for (const id of state.controls) result.controls.add(id)
    for (const id of state.unknown) result.unknown.add(id)
  }
  return result
}

/** A finite, conservative source graph. Roles seed the proposed query but cannot
 * remove unknown effects. Edges are syntax provenance, never alias/type proofs. */
export function buildPropertyDependencies(skeleton: SourceSkeleton, options: { question: DependencyQuestion; interpretation?: SourceInterpretation; reachableAnchorIds: string[]; propertyAbstraction?: boolean; callSummaries?: PropertyCallSummary[] }): PropertyDependencies {
  const reachable = new Set(options.reachableAnchorIds), anchors = new Map(skeleton.anchors.map(a => [a.id, a]))
  const edges = new Map<string, PropertyDependencies["edges"][number]>(), seeds: PropertyDependencies["seeds"] = [], boundaries: PropertyDependencies["boundaries"] = []
  const edge = (from: string, to: string, kind: PropertyDependencies["edges"][number]["kind"]) => { if (from !== to && anchors.has(from) && anchors.has(to)) edges.set(JSON.stringify([from, to, kind]), { from, to, kind }) }
  const seed = (a: SourceAnchor, role: string, origin: PropertyDependencies["seeds"][number]["origin"]) => { if (!seeds.some(s => s.anchorId === a.id && s.role === role)) seeds.push({ anchorId: a.id, role, origin, selector: a.selector }) }
  const draft = options.interpretation?.revision === skeleton.revision ? options.interpretation : undefined
  const propertyQueries = options.propertyAbstraction ? bindPropertyQueries(options.question, skeleton, draft) : undefined
  const selected = propertyQueries?.queries.filter(q => q.state === "bound") ?? [], narrow = !!selected.length && selected.length === propertyQueries?.queries.length && !selected.some(q => q.kind === "operation-completion") && !propertyQueries?.diagnostics.length
  const summaries = new Map((options.callSummaries ?? []).filter(s => s.callerRevision === skeleton.revision && s.summary.usable && s.targetId === s.summary.source.id && s.targetSha256 === s.summary.source.sha256 && skeleton.anchors.some(a => a.id === s.anchorId && a.call?.sourceCallId === s.sourceCallId && a.call.candidateIds.length === 1 && a.call.candidateIds[0] === s.targetId)).map(s => [s.anchorId, s]))
  const residuals: NonNullable<PropertyDependencies["residuals"]> = [], summaryUses: NonNullable<PropertyDependencies["summaryUses"]> = []
  const containsComplex = (flow: SourceFlow[]): boolean => flow.some(f => ["loop", "try", "with", "gap"].includes(f.kind) || [f.then, f.otherwise, f.body].some(p => containsComplex(p ?? [])))
  const targetPositions = selected.map(q => skeleton.flow.findIndex(f => f.anchorId === q.effectAnchorId)), horizon = narrow && !containsComplex(skeleton.flow) && targetPositions.every(p => p >= 0) ? Math.max(...targetPositions) : -1
  const afterHorizon = (a: SourceAnchor) => horizon >= 0 && skeleton.flow.findIndex(f => f.anchorId === a.id) > horizon
  if (narrow) for (const q of selected) for (const id of [q.effectAnchorId, q.guardAnchorId, q.principalAnchorId, q.resourceAnchorId, q.guardResourceAnchorId]) if (id && anchors.has(id)) seed(anchors.get(id)!, q.kind, "property-target")
  for (const annotation of draft?.annotations ?? []) {
    const anchor = anchors.get(annotation.anchorId)
    if (!anchor || !reachable.has(anchor.id) && anchor.kind !== "parameter" && anchor.kind !== "assignment") continue
    if (!narrow && annotation.role !== "context") seed(anchor, annotation.role, "source-interpretation")
    for (const ref of [annotation.principalAnchorId, annotation.resourceAnchorId, annotation.aliasAnchorId, ...(annotation.authorizedByAnchorIds ?? [])]) if (ref && anchors.has(ref)) edge(anchor.id, ref, "data")
  }
  const initial: State = { definitions: new Map(), controls: new Set(), unknown: new Set() }
  for (const a of skeleton.anchors) if (a.kind === "parameter") for (const name of a.dependencyFacts?.writes ?? []) initial.definitions.set(name, new Set([a.id]))
  for (const a of skeleton.anchors) if (reachable.has(a.id)) {
    if (!narrow && (a.kind === "return" || a.kind === "raise")) seed(a, a.kind, "source-exit")
    if (a.kind === "call") {
      if (options.propertyAbstraction && summaries.has(a.id)) { const s = summaries.get(a.id)!; summaryUses.push({ anchorId: a.id, targetId: s.targetId, revision: s.summary.revision, propertyIds: selected.map(q => q.id) }); continue }
      if (afterHorizon(a)) { residuals.push({ anchorId: a.id, questionId: options.question.id, propertyIds: selected.map(q => q.id), code: "outside-selected-property-horizon", selector: a.selector }); continue }
      seed(a, "possible-effect-or-failure", "unknown-call")
      boundaries.push({ anchorId: a.id, code: "unknown-call-influence", selector: a.selector, candidateIds: a.call?.candidateIds })
    } else if (!a.dependencyFacts) boundaries.push({ anchorId: a.id, code: "source-dependency-unavailable", selector: a.selector })
  }
  const consume = (a: SourceAnchor, state: State) => {
    for (const name of a.dependencyFacts?.reads ?? []) {
      for (const [defined, ids] of state.definitions) if (name === defined || name.startsWith(`${defined}.`) || defined.startsWith(`${name}.`)) for (const id of ids) edge(a.id, id, a.kind === "call" ? "call-argument" : name.includes(".") || defined.includes(".") ? "field" : "data")
    }
    // Nested return/assignment expressions refer to the actual call occurrence.
    for (const call of skeleton.anchors.filter(c => c.kind === "call" && c.id !== a.id && reachable.has(c.id) && c.selector.startLine! >= a.selector.startLine! && c.selector.endLine! <= a.selector.endLine! && a.text.includes(c.text))) edge(a.id, call.id, a.kind === "call" ? "call-argument" : "data")
    for (const id of state.controls) edge(a.id, id, "control")
    if (!a.dependencyFacts?.pureLocal) for (const id of state.unknown) edge(a.id, id, "data")
    if (a.kind === "call" && !summaries.has(a.id)) state.unknown.add(a.id)
    for (const name of a.dependencyFacts?.writes ?? []) {
      // Field writes may alias, so never kill another possible field definition.
      if (/^[A-Za-z_]\w*$/.test(name)) state.definitions.set(name, new Set([a.id]))
      else { if (!state.definitions.has(name)) state.definitions.set(name, new Set()); state.definitions.get(name)!.add(a.id) }
    }
  }
  const allIds = (flow: SourceFlow[]): string[] => flow.flatMap(f => [f.anchorId, ...[f.then, f.otherwise, f.body, f.enter, f.finally, ...(f.handlers ?? []).map(h => h.body)].flatMap(part => allIds(part ?? []))])
  const walk = (flow: SourceFlow[], input: State): { state: State; continues: boolean } => {
    let state = copy(input), continues = true
    for (const f of flow) {
      if (!continues || !reachable.has(f.anchorId)) continue
      const a = anchors.get(f.anchorId)!
      consume(a, state)
      if (f.kind === "branch") {
        const precedingControls = new Set(state.controls)
        const nested = copy(state); nested.controls.add(a.id)
        const yes = walk(f.then ?? [], nested), no = walk(f.otherwise ?? [], nested)
        const live = [yes, no].filter(r => r.continues); continues = live.length > 0
        state = merge((live.length ? live : [yes, no]).map(r => r.state))
        // A rejecting arm controls every subsequent effect on the continuing arm.
        if (yes.continues && no.continues) state.controls = precedingControls
      } else if (f.kind === "try") {
        const nested = copy(state); nested.controls.add(a.id)
        const body = walk(f.body ?? [], nested), normal = walk(f.otherwise ?? [], body.state)
        const handled = (f.handlers ?? []).map(h => walk(h.body, merge([nested, body.state])))
        for (const h of f.handlers ?? []) for (const id of allIds(h.body)) for (const before of allIds(f.body ?? [])) edge(id, before, "exception")
        const final = walk(f.finally ?? [], merge([normal.state, ...handled.map(h => h.state)]))
        for (const before of allIds(f.body ?? [])) for (const after of allIds(f.finally ?? [])) edge(before, after, "exception")
        state = final.state; continues = final.continues && (body.continues || handled.some(h => h.continues))
      } else if (f.kind === "loop") {
        let header = copy(state)
        // Monotone union gives a fixed point over the finite anchor universe.
        for (let iteration = 0; iteration <= skeleton.anchors.length; iteration++) {
          const nested = copy(header); nested.controls.add(a.id)
          const body = walk(f.body ?? [], nested), next = merge([header, body.state])
          const signature = (s: State) => JSON.stringify([...s.definitions].map(([name, ids]) => [name, [...ids].sort()]).sort())
          const stable = signature(header) === signature(next) && [...next.unknown].every(id => header.unknown.has(id))
          header = next; if (stable) break
        }
        state = walk(f.otherwise ?? [], header).state
      } else if (f.kind === "with" || f.kind === "short-circuit") {
        const nested = copy(state); nested.controls.add(a.id)
        state = merge([state, walk(f.body ?? [], walk(f.enter ?? [], nested).state).state])
      } else if (a.kind === "return" || a.kind === "raise" || f.kind === "break" || f.kind === "continue") continues = false
    }
    return { state, continues }
  }
  walk(skeleton.flow, initial)
  // Field role anchors have no executable step; connect their base input scope.
  for (const a of skeleton.anchors) if (!reachable.has(a.id) && seeds.some(s => s.anchorId === a.id)) consume(a, copy(initial))
  const required = new Set(seeds.map(s => s.anchorId))
  for (const id of required) for (const e of edges.values()) if (e.from === id) required.add(e.to)
  const localExclusions = skeleton.anchors.filter(a => reachable.has(a.id) && a.dependencyFacts?.pureLocal && !required.has(a.id)).map(a => ({ anchorId: a.id, proofAnchorId: a.id, selector: a.selector }))
  const callScopes = skeleton.anchors.flatMap(a => a.call?.sourceCallId ? [{ anchorId: a.id, sourceCallId: a.call.sourceCallId, state: required.has(a.id) ? "required" as const : summaryUses.some(s => s.anchorId === a.id) ? "summary" as const : residuals.some(r => r.anchorId === a.id) ? "residual" as const : "required" as const, reason: summaryUses.some(s => s.anchorId === a.id) ? "current-mechanical-source-summary" : residuals.find(r => r.anchorId === a.id)?.code ?? "current-source-dependency" }] : [])
  const body = { schemaVersion: options.propertyAbstraction ? "authorization-property-dependencies/v2" as const : "authorization-question-dependencies/v1" as const, question: structuredClone(options.question), seeds, edges: [...edges.values()], boundaries, requiredAnchorIds: [...required], localExclusions, ...(propertyQueries ? { propertyQueries, residuals, summaryUses, callScopes } : {}) }
  return { ...body, revision: createHash("sha256").update(JSON.stringify([skeleton.revision, body])).digest("hex") }
}
