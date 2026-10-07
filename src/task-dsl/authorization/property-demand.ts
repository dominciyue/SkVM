import type { SourceSkeleton, SourceFlow, SourceAnchor } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { SourceInterpretation } from "./source-interpretation.ts"
import { partialEvaluate, predicateDiagnostics } from "./control-evaluation.ts"
import { buildPropertyDependencies, type DependencyQuestion, type PropertyDependencies } from "./property-dependencies.ts"

export interface PropertyRequirement {
  anchorId: string; field: "role" | "condition" | "returnOutcome" | "failureKind" | "guardBranch" | "fallthroughOutcome";
  expectedRole?: "principal" | "resource" | "permission";
  status: "missing" | "provided" | "unresolved" | "invalid";
  reason: string; selector: SourceAnchor["selector"];
}
export interface PropertyExclusion {
  anchorId: string; reason: "after-source-exit" | "source-literal-branch" | "source-short-circuit" | "source-empty-loop" | "source-local-unused";
  proofAnchorId: string; selector: SourceAnchor["selector"];
}
export interface PropertyDemand {
  schemaVersion: "authorization-property-demand/v1"; semanticSupport: "unreviewed";
  questionId: string; affectedQuestionIds: string[]; source: SourceSkeleton["source"]; revision: string;
  required: PropertyRequirement[]; frontier: PropertyRequirement[]; excluded: PropertyExclusion[];
  deferred: Array<{ anchorId: string; selector: SourceAnchor["selector"]; reason: "source-structure-only" }>;
  reachableAnchorIds: string[]; sourceGaps: SourceSkeleton["gaps"];
  dependencies?: PropertyDependencies;
  requiredAnnotationCount: number; pendingAnnotationCount: number;
  coverage: { sourceRead: boolean; domainInterpreted: boolean; propertyCovered: boolean; wholeAnswerSufficient: false };
  nextWork: { kind: "read" | "interpret" | "inspect-gap" | "check"; anchorId?: string; field?: string; affectedQuestionIds: string[] };
}

/** The current fields needed for local interpretation. The complete graph stays
 * in the host report; this projection does not change source/control demand. */
export function propertyDemandModelView(demand: PropertyDemand) {
  const { dependencies, required, deferred, ...current } = demand
  if (!dependencies) return demand
  return { ...current, requiredFieldCount: required.length, deferredAnchorCount: deferred.length,
    providedFieldCount: required.filter(r => r.status === "provided").length, unresolvedFieldCount: required.filter(r => r.status === "unresolved").length,
    dependencySummary: { schemaVersion: dependencies.schemaVersion, revision: dependencies.revision, seedCount: dependencies.seeds.length, edgeCount: dependencies.edges.length, boundaryCount: dependencies.boundaries.length, requiredAnchorCount: dependencies.requiredAnchorIds.length },
    fullStateLocation: "The host report retains required/deferred fields and the complete dependency graph. Current frontier/exclusions/coverage are explicit. source_structure and source_read expose the complete original syntax/facts; graph counts are not source meaning or completeness." }
}

/** Source-invariant reachability only. A model role/predicate never proves a
 * source statement irrelevant, and no task/policy value enters a source cut. */
export function buildPropertyDemand(skeleton: SourceSkeleton, options: { questionId: string; role: "entry" | "helper"; interpretation?: SourceInterpretation; affectedQuestionIds?: string[]; maxFrontierAnchors?: number; question?: DependencyQuestion }): PropertyDemand {
  const anchors = new Map(skeleton.anchors.map(a => [a.id, a])), reachable = new Set<string>(), excluded = new Map<string, PropertyExclusion>()
  const draft = options.interpretation?.revision === skeleton.revision ? options.interpretation : undefined
  const annotations = new Map((draft?.annotations ?? []).map(a => [a.anchorId, a])), unresolved = new Set((draft?.unresolved ?? []).map(a => a.anchorId))
  const parts = (f: SourceFlow) => [f.then, f.otherwise, f.body, f.enter, f.finally, ...(f.handlers ?? []).map(h => h.body)]
  const exclude = (flow: SourceFlow[], reason: PropertyExclusion["reason"], proofAnchorId: string) => {
    for (const f of flow) {
      const a = anchors.get(f.anchorId)
      if (a && !reachable.has(a.id)) excluded.set(a.id, { anchorId: a.id, reason, proofAnchorId, selector: a.selector })
      for (const part of parts(f)) exclude(part ?? [], reason, proofAnchorId)
    }
  }
  const literalTruth = (f: SourceFlow): boolean | undefined => {
    if (!Object.hasOwn(f, "leftLiteral")) return undefined
    const evaluated = partialEvaluate({ op: "truthy", language: f.language, value: { literal: f.leftLiteral } }, {})
    return !evaluated.diagnostics.length && evaluated.truth !== "unknown" ? evaluated.truth === "true" : undefined
  }
  const walk = (flow: SourceFlow[]): boolean => {
    let continues = true, exitAnchor = ""
    for (const f of flow) {
      if (!continues) { exclude([f], "after-source-exit", exitAnchor); continue }
      reachable.add(f.anchorId); excluded.delete(f.anchorId)
      const a = anchors.get(f.anchorId)
      if (f.kind === "branch") {
        const literal = a?.literalKnown && typeof a.literalValue === "boolean" ? a.literalValue : undefined
        if (literal !== undefined) {
          exclude(literal ? f.otherwise ?? [] : f.then ?? [], "source-literal-branch", f.anchorId)
          continues = walk(literal ? f.then ?? [] : f.otherwise ?? [])
        } else { const yes = walk(f.then ?? []), no = walk(f.otherwise ?? []); continues = yes || no }
      } else if (f.kind === "short-circuit") {
        const left = literalTruth(f), execute = left === undefined ? undefined : f.operator === "and" ? left : !left
        if (execute === false) exclude(f.body ?? [], "source-short-circuit", f.anchorId)
        else { const bodyContinues = walk(f.body ?? []); if (execute === true) continues = bodyContinues }
      } else if (f.kind === "loop") {
        if (Array.isArray(f.iterableValue) && f.iterableValue.length === 0) { exclude(f.body ?? [], "source-empty-loop", f.anchorId); continues = walk(f.otherwise ?? []) }
        else { walk(f.body ?? []); walk(f.otherwise ?? []) }
      } else if (f.kind === "try") {
        walk(f.body ?? []); walk(f.otherwise ?? [])
        for (const h of f.handlers ?? []) walk(h.body)
        // Only an unconditional finally exit proves this region cannot resume.
        // Attempted-body exits alone do not erase its handlers or cleanup.
        if (f.finally?.length) continues = walk(f.finally)
      } else if (f.kind === "with") { walk(f.enter ?? []); walk(f.body ?? []) }
      else if (f.kind === "break" || f.kind === "continue" || a?.kind === "return" || a?.kind === "raise") continues = false
      if (!continues) exitAnchor = f.anchorId
    }
    return continues
  }
  const hasNormalEnd = walk(skeleton.flow), required = new Map<string, PropertyRequirement>()
  const dependencies = skeleton.propertySemantics === "question-control/v1" ? buildPropertyDependencies(skeleton, { question: options.question ?? { id: options.questionId, request: "Interpret the current source-bound authorization question; request seed is unavailable." }, interpretation: draft, reachableAnchorIds: [...reachable] }) : undefined
  for (const e of dependencies?.localExclusions ?? []) { excluded.set(e.anchorId, { ...e, reason: "source-local-unused" }); reachable.delete(e.anchorId) }
  const require = (anchorId: string, field: PropertyRequirement["field"], reason: string, expectedRole?: PropertyRequirement["expectedRole"]) => {
    const anchor = anchors.get(anchorId), annotation = annotations.get(anchorId)
    let provided = field === "fallthroughOutcome" ? !!draft?.fallthroughOutcome : !!annotation?.[field as keyof typeof annotation]
    if (expectedRole) provided = annotation?.role === expectedRole
    const invalid = field === "condition" && !!annotation?.condition && predicateDiagnostics(annotation.condition).length > 0 || !!expectedRole && !!annotation && annotation.role !== expectedRole
    const status = unresolved.has(anchorId) ? "unresolved" : invalid ? "invalid" : provided ? "provided" : "missing"
    required.set(JSON.stringify([anchorId, field, expectedRole]), { anchorId, field, ...(expectedRole ? { expectedRole } : {}), status, reason, selector: anchor?.selector ?? { path: skeleton.source.path, candidateId: skeleton.source.id, startLine: skeleton.source.startLine, endLine: skeleton.source.endLine } })
  }
  for (const a of skeleton.anchors) if (reachable.has(a.id)) {
    if (a.kind === "call") require(a.id, "role", "This possible source call may change objects, return a value, authorize, perform an effect or raise; its name proves none of these.")
    else if (a.kind === "condition" && !(a.literalKnown && typeof a.literalValue === "boolean")) require(a.id, "condition", "The source branch controls a possible requested behavior; interpret its actual predicate.")
    else if (a.kind === "return" && options.role === "entry") require(a.id, "returnOutcome", "An entry return needs its permission meaning; its scalar value never implies allow or deny.")
    else if (a.kind === "raise") require(a.id, "failureKind", "Distinguish authorization rejection from operation failure without erasing the exception.")
  }
  for (const a of draft?.annotations ?? []) if (reachable.has(a.anchorId)) {
    for (const [ref, role] of [[a.principalAnchorId, "principal"], [a.resourceAnchorId, "resource"]] as const) if (ref) require(ref, "role", `Exact typed object referenced by ${a.anchorId}; equal spelling is not an alias.`, role)
    if (a.aliasAnchorId && ["principal", "resource", "permission"].includes(a.role)) require(a.aliasAnchorId, "role", `Explicit same-type alias referenced by ${a.anchorId}.`, a.role as PropertyRequirement["expectedRole"])
    for (const ref of a.authorizedByAnchorIds ?? []) require(ref, "guardBranch", `Explicit authorization control referenced by ${a.anchorId}.`)
  }
  if (hasNormalEnd && options.role === "entry") require(skeleton.source.id, "fallthroughOutcome", "Interpret the source entry's normal fallthrough outcome at the interpretation root.")
  const list = [...required.values()], pending = list.filter(r => r.status === "missing" || r.status === "invalid")
  if (dependencies) {
    const decisive = new Set(dependencies.seeds.filter(s => s.origin === "source-interpretation" && ["effect", "principal", "resource", "permission"].includes(s.role)).map(s => s.anchorId))
    for (const id of decisive) for (const e of dependencies.edges) if (e.from === id) decisive.add(e.to)
    pending.sort((a, b) => Number(decisive.has(b.anchorId)) - Number(decisive.has(a.anchorId)) || Number(anchors.get(b.anchorId)?.kind === "condition") - Number(anchors.get(a.anchorId)?.kind === "condition"))
  }
  const frontierIds = [...new Set(pending.map(r => r.anchorId))].slice(0, options.maxFrontierAnchors ?? 8)
  const frontier = pending.filter(r => frontierIds.includes(r.anchorId)), sourceGaps = skeleton.gaps.filter(g => ![...excluded.values()].some(e => e.selector.path === g.selector.path && e.selector.startLine! <= g.selector.startLine! && e.selector.endLine! >= g.selector.endLine!))
  const domainInterpreted = skeleton.modelCovered && !pending.length, propertyCovered = domainInterpreted && !sourceGaps.length && !list.some(r => r.status === "unresolved")
  const affectedQuestionIds = [...new Set(options.affectedQuestionIds ?? [options.questionId])], nextWork: PropertyDemand["nextWork"] = !skeleton.modelCovered ? { kind: "read", affectedQuestionIds } : frontier[0] ? { kind: "interpret", anchorId: frontier[0].anchorId, field: frontier[0].field, affectedQuestionIds } : sourceGaps.length || list.some(r => r.status === "unresolved") ? { kind: "inspect-gap", affectedQuestionIds } : { kind: "check", affectedQuestionIds }
  return { schemaVersion: "authorization-property-demand/v1", semanticSupport: "unreviewed", questionId: options.questionId, affectedQuestionIds, source: skeleton.source, revision: skeleton.revision, required: list, frontier, excluded: [...excluded.values()], deferred: skeleton.anchors.filter(a => !reachable.has(a.id) && !excluded.has(a.id) && !list.some(r => r.anchorId === a.id)).map(a => ({ anchorId: a.id, selector: a.selector, reason: "source-structure-only" })), reachableAnchorIds: [...reachable], sourceGaps, ...(dependencies ? { dependencies } : {}), requiredAnnotationCount: new Set(list.map(r => r.anchorId)).size, pendingAnnotationCount: new Set(pending.map(r => r.anchorId)).size, coverage: { sourceRead: skeleton.modelCovered, domainInterpreted, propertyCovered, wholeAnswerSufficient: false }, nextWork }
}
