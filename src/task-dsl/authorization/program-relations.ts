import { isDeepStrictEqual } from "node:util"
import { ProgramRelationSchema } from "./program-coverage.ts"
import { projectProgramCallRelations } from "./program-obligations.ts"

/** Compare declared relationships with existing finite events. No source predicate
 * inference, alias inference, target calls or database-commit inference occurs. */
export function projectProgramRelations(raw: any, execution?: any, diagnostics: readonly any[] = []) {
  const coverage: any[] = Array.isArray(raw?.authoringTarget?.coverage) ? raw.authoringTarget.coverage : []
  const events: any[] = execution?.events ?? [], steps: any[] = raw?.resourceWorkflow?.steps ?? []
  const event = (id: string) => events.find(e => e.id === id)
  const active = (e: any) => e && e.outcome !== "skipped"
  const certain = (e: any) => e?.outcome === "computed" && e.outputs?.known === true
  const calls = projectProgramCallRelations(raw, execution)
  return coverage.flatMap((claim, index) => {
    if (!claim?.relation) return []
    const parsed = ProgramRelationSchema.safeParse(claim.relation)
    const unknown: string[] = [], different: string[] = []
    if (!parsed.success) unknown.push("relation-shape-invalid")
    if (!execution) unknown.push("execution-unavailable")
    if (!claim.source?.sha256 || diagnostics.some(d => d.code === "contract-coverage-reference" && d.path === `authoringTarget.coverage.${index}`)) unknown.push("relation-source-unverified")
    if (claim.disposition !== "implemented") unknown.push("relation-not-implemented")
    const relation = parsed.success ? parsed.data : undefined
    const ids: string[] = Array.isArray(claim.stepIds) ? claim.stepIds : []
    if (new Set(ids).size !== ids.length) unknown.push("relation-step-identity-ambiguous")
    const observed = events.filter(e => ids.includes(e.id) && active(e))
    const firstStop = events.find(e => e.op === "guard" && e.outcome === "rejected")?.id
    if (observed.some(e => e.outcome === "unresolved" || e.outcome === "conditional")) unknown.push("relation-event-unresolved")
    if (relation?.kind === "guard-effect") {
      const { entryStepId, guardStepId, effectStepId } = relation
      if ([entryStepId, guardStepId, effectStepId].some(id => !ids.includes(id))) unknown.push("relation-step-not-declared")
      const entry = event(entryStepId), guard = event(guardStepId), effect = event(effectStepId)
      if (!entry || !certain(entry)) unknown.push("entry-evidence-missing")
      else if (entry.outputs.value === false) different.push("entry-inactive")
      else if (entry.outputs.value !== true) unknown.push("entry-activation-not-boolean")
      if (!guard || guard.op !== "guard") unknown.push("guard-evidence-missing")
      else if (guard.outcome === "skipped" || guard.outcome === "rejected") different.push("guard-not-satisfied")
      else if (!certain(guard) || guard.outputs.value !== true) unknown.push("guard-activation-unknown")
      if (!effect || effect.op !== "external" || !active(effect)) unknown.push("effect-call-not-observed")
      else {
        if (entry && guard && !(events.indexOf(entry) < events.indexOf(guard) && events.indexOf(guard) < events.indexOf(effect))) different.push("entry-guard-effect-order")
        for (const [identity, argument] of [["principal", relation.principalArgument], ["resource", relation.resourceArgument]]) {
          const actual = effect.inputs?.arguments?.[argument!], checked = guard?.inputs?.[identity!]
          if (checked === undefined || checked === null || !actual?.known || actual.value === null) unknown.push(`guard-effect-${identity}-unknown`)
          else if (!isDeepStrictEqual(checked, actual.value)) different.push(`guard-effect-${identity}-mismatch`)
        }
      }
    }
    if (relation?.kind === "ordered-prefix") {
      if (!ids.length || !observed.length) unknown.push("order-evidence-missing")
      const last = Math.max(-1, ...observed.map(e => ids.indexOf(e.id)))
      const expected = ids.slice(0, last + 1).filter(id => event(id)?.outcome !== "skipped")
      for (const id of expected) if (!observed.some(e => e.id === id)) different.push(`required-prefix-event-missing:${id}`)
      if (observed.some((e, i) => i > 0 && ids.indexOf(observed[i - 1].id) >= ids.indexOf(e.id))) different.push("event-order-mismatch")
      if ((!firstStop || !ids.includes(firstStop)) && last < ids.length - 1) unknown.push("order-tail-not-observed")
      if (ids.some(id => !steps.some(s => s.id === id))) unknown.push("order-step-missing")
    }
    const effects = (relation?.kind === "ordered-prefix" ? relation.effectStepIds : relation?.kind === "guard-effect" ? [relation.effectStepId] : []).map(stepId => {
      const e = event(stepId), call = calls.find(c => c.stepId === stepId)
      const external = steps.find(s => s.id === stepId)?.op === "external"
      if (!external) unknown.push(`effect-call-evidence-unavailable:${stepId}`)
      const completed = call?.relation?.completion === "required" && call.completionGuard?.outcome === "computed" && !call.diagnostics.length
      return { stepId, request: !external || !execution || !e && !firstStop ? "unknown" : active(e) && e.op === "external" ? "observed" : "not-observed",
        completion: completed ? call.relation?.completionMeaning === "normal-return" ? "declared-normal-return" : "declared-finite-marker" : "unknown",
        durableCommit: "unknown", targetExecution: false, origin: "finite-program", assumption: e?.inputs?.assumption }
    })
    return [{ id: claim.id, kind: relation?.kind ?? "invalid", source: claim.source, stepIds: ids,
      status: different.length ? "different" : unknown.length ? "unknown" : "consistent",
      diagnostics: [...different, ...unknown], observedOrder: observed.map(e => e.id), firstStop, effects,
      semanticSupport: "author-declared-unreviewed", requestOperationCertified: false,
      instruction: "Consistency is only with the declared finite relationships. Independently review source activation, object meaning and call order. Missing call evidence is unknown; an earlier effect request survives a later error. No target operation or durable commit is certified." }]
  })
}
