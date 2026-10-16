import { createHash } from "node:crypto"
import type { SourceSkeleton } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { InquiryTools } from "../../benchmarks/authorization-dsl/inquiry-tools.ts"
import { partialEvaluate, finiteValue, scalar, type FiniteValue } from "./control-evaluation.ts"
import { ProgramCallRelationSchema } from "./program-coverage.ts"

/** References in executable expressions only; prose and source locations never
 * create a dependency. Paths preserve the distinction between activation and value. */
function references(value: any, path = ""): Array<{ name: string; path: string }> {
  if (!value || typeof value !== "object") return []
  if (Object.keys(value).length === 1 && typeof (value.ref ?? value.binding) === "string") return [{ name: value.ref ?? value.binding, path }]
  return Object.entries(value).flatMap(([key, child]) => key === "literal" ? [] : references(child, path ? `${path}.${key}` : key))
}
const executable = (s: any) => ({ when: s.when, value: s.value, test: s.test, arguments: s.arguments, where: s.where, principal: s.principal, resource: s.resource, ...(s.from ? { from: { ref: s.from } } : {}) })
const uses = (value: any, id: string) => references(value).some(r => r.name === id || r.name.startsWith(id + "."))

/** Review only calls already adopted by this draft or explicitly declared. No
 * function-name rules, source-inferred predicates or default authorization guard. */
export function projectProgramCallRelations(raw: any, execution?: any, trials: readonly any[] = []) {
  const steps: any[] = Array.isArray(raw?.resourceWorkflow?.steps) ? raw.resourceWorkflow.steps.filter((s: any) => s && typeof s === "object") : []
  const claims: any[] = (Array.isArray(raw?.authoringTarget?.coverage) ? raw.authoringTarget.coverage : []).filter((c: any) => c?.call && typeof c.call.stepId === "string")
  const ids = new Set([...steps.filter(s => s.op === "external").map(s => s.id), ...claims.map(c => c.call.stepId)])
  return [...ids].map(id => {
    const step = steps.find(s => s.id === id), index = steps.indexOf(step), declarations = claims.filter(c => c.call.stepId === id), claim = declarations.length === 1 ? declarations[0] : undefined, parsed = ProgramCallRelationSchema.safeParse(claim?.call), relation = parsed.success ? parsed.data : undefined
    const diagnostics: string[] = [], after = steps.slice(index + 1)
    const consumers = after.filter(s => uses(executable(s), id)), valueConsumers = consumers.filter(s => uses({ value: s.value, arguments: s.arguments, principal: s.principal, resource: s.resource }, id)).map(s => s.id)
    const descendants = new Set<string>([id]), dependencyPaths: Array<{ from: string; to: string; path: string }> = []
    for (const s of after) for (const ref of references(executable(s))) {
      const from = [...descendants].find(d => ref.name === d || ref.name.startsWith(d + "."))
      if (from) { descendants.add(s.id); dependencyPaths.push({ from, to: s.id, path: ref.path }) }
    }
    const controlConsumers = after.filter(s => (s.op === "guard" || s.when) && descendants.has(s.id)).map(s => s.id)
    const event = execution?.events?.find((e: any) => e.id === id)
    if (!step || step.op !== "external") diagnostics.push("call-step-missing-or-not-external")
    if (!relation) diagnostics.push(declarations.length > 1 ? "duplicate-call-relation" : "call-semantics-undeclared")
    if (!relation && !consumers.length) diagnostics.push("call-result-unused-completion-unreviewed")
    if (!step?.when && consumers.some(s => references(s.value).some(r => (r.name === id || r.name.startsWith(id + ".")) && /choose\.(then|else)/.test(r.path)))) diagnostics.push("selection-after-call-does-not-control-activation")
    const source = claim?.source, target = step?.source
    // Follow only this call's when and its referenced executable steps. A guard
    // observed elsewhere, source prose or a later value use cannot bind it.
    const activationPaths: Array<{ from: string; to: string; path: string }> = []
    const activationAncestors = new Set<string>()
    const visitActivation = (value: any, to: string, before: number) => {
      for (const ref of references(value)) {
        const dependency = steps.find(s => s.id === ref.name) ?? steps.filter(s => typeof s.id === "string" && ref.name.startsWith(s.id + ".")).sort((a, b) => b.id.length - a.id.length)[0]
        if (!dependency) continue
        const dependencyIndex = steps.indexOf(dependency)
        activationPaths.push({ from: dependency.id, to, path: ref.path })
        if (dependencyIndex >= before) { diagnostics.push("activation-dependency-order"); continue }
        if (activationAncestors.has(dependency.id)) continue
        activationAncestors.add(dependency.id)
        visitActivation(executable(dependency), dependency.id, dependencyIndex)
      }
    }
    if (relation?.activationDependencyIds?.length) visitActivation(step?.when, id, index)
    const activationDependencies = (relation?.activationDependencyIds ?? []).map(dependencyId => {
      const dependency = steps.find(s => s.id === dependencyId), dependencyIndex = steps.indexOf(dependency)
      const connected = activationAncestors.has(dependencyId)
      if (!dependency) diagnostics.push("activation-dependency-missing")
      else if (dependencyIndex >= index) diagnostics.push("activation-dependency-order")
      if (!connected) diagnostics.push("activation-dependency-unconnected")
      return { id: dependencyId, source: dependency?.source, present: !!dependency, beforeCall: !!dependency && dependencyIndex < index, connected }
    })
    if (relation) {
      if (!source || !target || source.path !== target.path || source.startLine < target.startLine || (source.endLine ?? source.startLine) > (target.endLine ?? target.startLine) || source.sha256 && target.sha256 && source.sha256 !== target.sha256 || !claim.stepIds?.includes(id)) diagnostics.push("call-relation-source-mismatch")
      if (relation.activation === "unreviewed") diagnostics.push("call-activation-unreviewed")
      else if ((relation.activation === "conditional") !== !!step?.when) diagnostics.push("call-activation-not-connected")
      if (relation.resultUse === "used" && !valueConsumers.length) diagnostics.push("declared-call-result-unused")
      if (relation.completion === "unreviewed") diagnostics.push("call-completion-unreviewed")
    }
    const guard = relation?.completionGuardId && steps.find(s => s.id === relation.completionGuardId), guardIndex = steps.indexOf(guard)
    const guardEvent = guard && execution?.events?.find((e: any) => e.id === guard.id)
    if (relation?.completion === "required") {
      if (!guard || guard.op !== "guard" || guardIndex <= index) diagnostics.push("completion-guard-missing-or-out-of-order")
      else {
        if (!descendants.has(guard.id)) diagnostics.push("completion-guard-not-dependent")
        if (!relation.successorStepIds?.length || relation.successorStepIds.some((next: string) => steps.findIndex(s => s.id === next) <= guardIndex)) diagnostics.push("completion-successor-missing-or-out-of-order")
        if (guardEvent?.outcome === "skipped" && event?.outcome !== "skipped") diagnostics.push("completion-guard-skipped-after-call")
        if (!relation.completionMeaning) diagnostics.push("completion-meaning-unreviewed")
        if (relation.completionMeaning === "normal-return" && guard.test?.op === "truthy" && uses(guard.test, id)) diagnostics.push("normal-completion-tested-as-truthiness")
        // Remove the call and its value descendants from actual bindings. A guard
        // still true then does not require this call on this observed path.
        if (execution && event && event.outcome !== "skipped") {
          const bindings: Record<string, FiniteValue> = {}
          for (const [key, value] of Object.entries({ ...execution.inputs, ...execution.values })) if (!descendants.has(key) && finiteValue(value)) {
            bindings[key] = value
            if (value && typeof value === "object" && !Array.isArray(value)) for (const [field, v] of Object.entries(value)) if (scalar(v)) bindings[`${key}.${field}`] = v
          }
          if (partialEvaluate(guard.test, bindings).truth === "true") diagnostics.push("completion-not-required-on-observed-path")
        }
      }
    }
    return { stepId: id, source: step?.source, declarationId: claim?.id, relation, activation: step?.when ?? "unconditional", activationDependencies, activationPaths, activationReview: relation?.activationDependencyIds?.length ? "structural-reference-review" : "dependencies-unreviewed", valueConsumers, controlConsumers, dependencyPaths,
      event: event && { outcome: event.outcome, value: event.outputs?.value, arguments: event.inputs?.arguments, gaps: event.gaps },
      completionGuard: guard && { id: guard.id, test: guard.test, outcome: guardEvent?.outcome },
      trials: trials.map(t => { const e = t.execution?.events?.find((e: any) => e.id === id); return { id: t.id, outcome: e?.outcome ?? "not-reached", gaps: e?.gaps ?? [] } }), diagnostics: [...new Set(diagnostics)], semanticSupport: "unreviewed" as const,
      instruction: "Review this call's exact source: activation (when), normal completion (a dependent guard after the call and before its successors), and returned value are different. A later choose cannot undo a call. False/None can return normally; truthy is only a declared finite completion marker or source Boolean test. Declare coverage.call with your source explanation, completion guard/successors or caught exception, then patch/trial; no source meaning is inferred here." }
  })
}

export type ProgramObligation = {
  id: string; source: { path: string; startLine: number; endLine: number; sha256: string }; text: string
  function?: { id: string; path: string; startLine: number; endLine: number; sha256: string }
  kind: "branch-exit" | "error-exit" | "return-exit" | "call-completion"
  origin: "source-structure"; stepIds: string[]; declarationIds: string[]
  state: "unmapped" | "mapped-unreviewed" | "external"; diagnostics: string[]
}
/** Syntax candidates, never inferred authorization conditions or required calls.
 * Only an exact current span maps a candidate; broad author claims remain separate. */
export function projectProgramObligations(skeletons: readonly SourceSkeleton[], raw: any): ProgramObligation[] {
  const kinds = { condition: "branch-exit", raise: "error-exit", return: "return-exit", call: "call-completion" } as const
  const steps = new Set((Array.isArray(raw?.resourceWorkflow?.steps) ? raw.resourceWorkflow.steps : []).map((s: any) => s?.id))
  const seen = new Set<string>(), result: ProgramObligation[] = []
  for (const skeleton of skeletons.filter(s => s.modelCovered)) for (const anchor of skeleton.anchors) {
    const kind = kinds[anchor.kind as keyof typeof kinds]; if (!kind) continue
    if (anchor.selector.startLine === undefined) continue
    const source = { path: skeleton.source.path, startLine: anchor.selector.startLine, endLine: anchor.selector.endLine ?? anchor.selector.startLine, sha256: skeleton.source.sha256 }
    const id = "obligation-" + createHash("sha256").update(JSON.stringify([source, anchor.id, kind])).digest("hex").slice(0, 24)
    if (seen.has(id)) continue; seen.add(id)
    const claims: any[] = (raw?.authoringTarget?.coverage ?? []).filter((c: any) => c.source?.path === source.path && c.source.startLine === source.startLine && (c.source.endLine ?? c.source.startLine) === source.endLine)
    const current = claims.filter(c => (!c.source.sha256 || c.source.sha256 === source.sha256) && c.stepIds?.every((id: string) => steps.has(id)))
    const mapped = current.filter(c => c.disposition === "implemented" && c.stepIds.length), external = current.filter(c => c.disposition === "external")
    result.push({ id, source, text: anchor.text, kind, origin: "source-structure", stepIds: [...new Set<string>(mapped.flatMap(c => c.stepIds))], declarationIds: current.map(c => c.id), state: mapped.length ? "mapped-unreviewed" : external.length ? "external" : "unmapped", diagnostics: [...(claims.length > 1 ? ["duplicate-author-mapping"] : []), ...(claims.some(c => c.source.sha256 && c.source.sha256 !== source.sha256) ? ["stale-author-reference"] : []), ...(claims.some(c => c.stepIds?.some((id: string) => !steps.has(id))) ? ["missing-author-step"] : [])] })
  }
  return result.map(o => ({ ...o, function: skeletons.find(s => s.source.path === o.source.path && s.source.startLine <= o.source.startLine && s.source.endLine >= o.source.endLine)?.source }))
}
/** Function containment is routing evidence only, never exact mapping or proof. */
export function projectProgramCandidateFrontier(catalog: readonly ProgramObligation[], raw: any, dependencies: readonly any[] = []) {
  const citations: any[] = []
  const visit = (v: any) => { if (!v || typeof v !== "object") return; if (typeof v.path === "string" && Number.isInteger(v.startLine)) citations.push(v); else for (const child of Object.values(v)) visit(child) }
  visit(raw?.scope); visit(raw?.resourceWorkflow); visit(raw?.sourceDeclarations); visit(dependencies)
  const pending = catalog.filter(o => o.state === "unmapped" || o.diagnostics.length)
  const related = pending.filter(o => { const f = o.function ?? o.source; return citations.some(c => c.path === f.path && (!c.sha256 || c.sha256 === f.sha256) && c.startLine <= f.endLine && (c.endLine ?? c.startLine) >= f.startLine) })
  const candidates = related
  const first = candidates[0], group = first?.function ?? first?.source
  const items = candidates.filter(o => { const f = o.function ?? o.source; return f.path === group?.path && f.startLine === group?.startLine && f.endLine === group?.endLine }).slice(0, 12)
  return { items, function: group, total: catalog.length, pending: pending.length, related: related.length, remainingRelated: Math.max(0, related.length - items.length), relation: related.length ? "program-citation-or-known-dependency" : "no-current-program-location", details: "authorization_program_details({catalog:'source-candidates'}) returns the complete catalog. For an empty draft, choose and read a function related to the original task, then cite it in a small program. Relatedness and exact mapping are unreviewed; do not invent required calls from syntax." }
}
/** Uses the existing cached parser, and only functions completely shown already. */
export async function collectProgramObligations(tools: InquiryTools, raw?: unknown) {
  if (tools.snapshotVerification?.valid === false) return []
  const skeletons: SourceSkeleton[] = []
  for (const s of tools.structure?.symbols ?? []) {
    if (s.kind !== "function" || !tools.evidence.some(e => e.path === s.path && e.sha256 === s.sha256 && e.startLine <= s.endLine && e.endLine >= s.startLine)) continue
    const skeleton = await tools.sourceSkeleton(s.id)
    if (skeleton?.modelCovered) skeletons.push(skeleton)
  }
  return projectProgramObligations(skeletons, raw)
}
