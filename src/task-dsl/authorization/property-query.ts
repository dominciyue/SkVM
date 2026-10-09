import { z } from "zod"
import { createHash } from "node:crypto"
import type { SourceSkeleton } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { SourceInterpretation } from "./source-interpretation.ts"
const text = z.string().trim().min(1)
export const PropertyKindSchema = z.enum(["authorization-before-effect", "authorized-object-matches-effect", "effect-reachability", "operation-completion"])
export type PropertyKind = z.infer<typeof PropertyKindSchema>
export const PropertyRequirementSchema = z.object({ id: text, kind: PropertyKindSchema, requirement: text, requiredPermission: text.optional() }).strict()
/** Qualified syntax identity. Actual object and call-instance identities are host owned. */
export const PropertySourceReferenceSchema = z.object({ sourceId: text, sourceSha256: text, revision: text, anchorId: text, questionId: text, operationId: text, receiverClass: text.optional() }).strict()
export type PropertySourceReference = z.infer<typeof PropertySourceReferenceSchema>
export const PropertyBindingSchema = z.object({ propertyId: text, effectAnchorId: text.optional(), guardAnchorId: text.optional(), effectRef: PropertySourceReferenceSchema.optional(), guardRef: PropertySourceReferenceSchema.optional(),
  proposed: PropertyRequirementSchema.omit({ id: true }).optional() }).strict().refine(b => !!b.effectAnchorId !== !!b.effectRef && !(b.guardAnchorId && b.guardRef), "Select exactly one effect reference and at most one guard reference.")
export interface PropertyQuestion { id: string; request: string; properties?: z.infer<typeof PropertyRequirementSchema>[] }
export interface PropertySourceUnit { questionId: string; operationId: string; receiverClass?: string; handle?: string; skeleton: SourceSkeleton; interpretation?: SourceInterpretation }
export interface PropertyQueryContext { operationId: string; receiverClass?: string; sources: PropertySourceUnit[] }
export interface BoundPropertyQuery {
  id: string; questionId: string; kind: PropertyKind; requirement: string; state: "bound" | "unbound";
  source: SourceSkeleton["source"]; sourceRevision: string; effectAnchorId?: string; guardAnchorId?: string;
  principalAnchorId?: string; resourceAnchorId?: string; guardResourceAnchorId?: string;
  effectRef?: PropertySourceReference; guardRef?: PropertySourceReference; effectKind?: string; requiredPermission?: string; guardPermission?: string;
  bindingScope?: "interprocedural-property/v1";
  semanticReview: "unreviewed"; bindingValidation: "source-structure-only"; missing: string[];
}
export interface PropertyQueryDiagnostic { code: string; questionId: string; propertyId?: string; sourceId: string; message: string; nextAction: string }
/** A kind is a task requirement, never a source verdict. Bind only the current
 * shown anchors; model annotations remain unreviewed source interpretations. */
export function bindPropertyQueries(question: PropertyQuestion, skeleton: SourceSkeleton, interpretation?: SourceInterpretation, context?: PropertyQueryContext) {
  if (context) return bindInterproceduralQueries(question, skeleton, interpretation, context)
  const draft = skeleton.modelCovered && interpretation?.revision === skeleton.revision ? interpretation : undefined
  const bindings = draft?.propertyBindings ?? [], declarations = question.properties ?? bindings.flatMap(b => b.proposed ? [{ id: b.propertyId, ...b.proposed }] : [])
  const diagnostics: PropertyQueryDiagnostic[] = [], anchors = new Map(skeleton.anchors.map(a => [a.id, a])), annotations = new Map(draft?.annotations.map(a => [a.anchorId, a]) ?? [])
  const fail = (code: string, message: string, propertyId?: string) => diagnostics.push({ code, questionId: question.id, sourceId: skeleton.source.id, propertyId, message, nextAction: "Declare the current task property and bind its exact effect/guard/object anchors in the current shown source; retain unknowns." })
  if (!declarations.length) fail("property-query-undeclared", "No current task property is declared; no narrow query or verdict is inferred.")
  for (const b of bindings) if (!declarations.some(q => q.id === b.propertyId) || bindings.filter(v => v.propertyId === b.propertyId).length !== 1) fail("property-binding-identity", "Binding must name exactly one current declared property.", b.propertyId)
  const queries: BoundPropertyQuery[] = declarations.map(q => {
    const binding = bindings.filter(b => b.propertyId === q.id), b = binding.length === 1 ? binding[0] : undefined, effect = b?.effectAnchorId && annotations.get(b.effectAnchorId), guard = b?.guardAnchorId && annotations.get(b.guardAnchorId)
    const missing: string[] = []
    if (declarations.filter(v => v.id === q.id).length !== 1) missing.push("duplicate-property")
    if (!question.request.includes(q.requirement)) missing.push("requirement-not-current-task-span")
    if (!draft || !b?.effectAnchorId || !anchors.has(b.effectAnchorId) || !effect || effect.role !== "effect") missing.push("effect-unbound")
    if (q.kind === "authorization-before-effect" || q.kind === "authorized-object-matches-effect") {
      if (!b?.guardAnchorId || !anchors.has(b.guardAnchorId) || !guard || !guard.guardBranch || anchors.get(b.guardAnchorId)?.kind !== "condition") missing.push("guard-unbound")
      if (!effect || !effect.principalAnchorId || annotations.get(effect.principalAnchorId)?.role !== "principal" || !guard || guard.principalAnchorId !== effect.principalAnchorId) missing.push("principal-unbound")
      if (!effect || !effect.resourceAnchorId || annotations.get(effect.resourceAnchorId)?.role !== "resource" || !guard || !guard.resourceAnchorId || annotations.get(guard.resourceAnchorId)?.role !== "resource") missing.push("resource-unbound")
    }
    if (missing.length) fail("property-query-unbound", missing.join(", "), q.id)
    return { ...q, questionId: question.id, source: structuredClone(skeleton.source), sourceRevision: skeleton.revision, state: missing.length ? "unbound" : "bound",
      ...(b ? { effectAnchorId: b.effectAnchorId, guardAnchorId: b.guardAnchorId } : {}), principalAnchorId: effect && effect.principalAnchorId || undefined, resourceAnchorId: effect && effect.resourceAnchorId || undefined, guardResourceAnchorId: guard && guard.resourceAnchorId || undefined, semanticReview: "unreviewed", bindingValidation: "source-structure-only", missing } as BoundPropertyQuery
  })
  return { schemaVersion: "authorization-property-query/v1" as const, questionId: question.id, queries, diagnostics,
    revision: createHash("sha256").update(JSON.stringify([question, skeleton.revision, queries])).digest("hex") }
}
export function propertySourceReference(owner: PropertySourceUnit, anchorId: string): PropertySourceReference {
  return { sourceId: owner.skeleton.sourceId, sourceSha256: owner.skeleton.source.sha256, revision: owner.skeleton.revision, anchorId, questionId: owner.questionId, operationId: owner.operationId, ...(owner.receiverClass ? { receiverClass: owner.receiverClass } : {}) }
}
function bindInterproceduralQueries(question: PropertyQuestion, skeleton: SourceSkeleton, interpretation: SourceInterpretation | undefined, context: PropertyQueryContext) {
  const draft = skeleton.modelCovered && interpretation?.revision === skeleton.revision ? interpretation : undefined
  const bindings = draft?.propertyBindings ?? [], declarations = question.properties ?? bindings.flatMap(b => b.proposed ? [{ id: b.propertyId, ...b.proposed }] : [])
  const own: PropertySourceUnit = { questionId: question.id, operationId: context.operationId, receiverClass: context.receiverClass, skeleton, interpretation: draft }
  const sources = context.sources.filter(s => !(s.questionId === question.id && s.skeleton.sourceId === skeleton.sourceId && s.receiverClass === context.receiverClass)).concat(own)
  const diagnostics: PropertyQueryDiagnostic[] = []
  const fail = (code: string, message: string, propertyId?: string) => diagnostics.push({ code, questionId: question.id, propertyId, sourceId: skeleton.sourceId, message, nextAction: "Choose a current offered propertyReferences candidate, interpret its actual source roles, and retain missing paths; resolving a reference does not prove object equality." })
  if (!declarations.length) fail("property-query-undeclared", "No current task property is declared.")
  for (const b of bindings) if (!declarations.some(q => q.id === b.propertyId) || bindings.filter(v => v.propertyId === b.propertyId).length !== 1) fail("property-binding-identity", "Binding must name exactly one current declared property.", b.propertyId)
  const queries: BoundPropertyQuery[] = declarations.map(q => {
    const candidates = bindings.filter(b => b.propertyId === q.id), b = candidates.length === 1 ? candidates[0] : undefined, missing: string[] = []
    const resolve = (ref: PropertySourceReference | undefined, slot: "effect" | "guard") => {
      if (!ref) { if (slot === "effect") missing.push("effect-unbound"); return undefined }
      if (ref.questionId !== question.id) missing.push(`${slot}-ref-question-mismatch`)
      if (ref.operationId !== context.operationId) missing.push(`${slot}-ref-operation-mismatch`)
      const owners = sources.filter(s => s.questionId === question.id && s.operationId === context.operationId && s.skeleton.sourceId === ref.sourceId && s.receiverClass === ref.receiverClass)
      if (owners.length !== 1) { missing.push(`${slot}-ref-${owners.length ? "ambiguous" : "unregistered"}`); return undefined }
      const owner = owners[0]!, syntax = owner.skeleton, annotations = owner.interpretation?.revision === syntax.revision ? owner.interpretation.annotations : []
      if (!syntax.modelCovered) missing.push(`${slot}-ref-unread`)
      if (ref.revision !== syntax.revision || ref.sourceSha256 !== syntax.source.sha256) missing.push(`${slot}-ref-stale`)
      const anchors = syntax.anchors.filter(a => a.id === ref.anchorId), roles = annotations.filter(a => a.anchorId === ref.anchorId)
      if (anchors.length !== 1) missing.push(`${slot}-ref-${anchors.length ? "ambiguous" : "anchor-unavailable"}`)
      if (roles.length !== 1) missing.push(`${slot}-role-unbound`)
      return { owner, anchor: anchors[0], annotation: roles[0], annotations }
    }
    const effectRef = b?.effectRef ?? (b?.effectAnchorId ? propertySourceReference(own, b.effectAnchorId) : undefined), guardRef = b?.guardRef ?? (b?.guardAnchorId ? propertySourceReference(own, b.guardAnchorId) : undefined)
    const effect = resolve(effectRef, "effect"), guard = resolve(guardRef, "guard")
    if (declarations.filter(v => v.id === q.id).length !== 1) missing.push("duplicate-property")
    if (!question.request.includes(q.requirement) || q.requiredPermission && !q.requirement.includes(q.requiredPermission)) missing.push("requirement-not-current-task-span")
    if (effect?.annotation?.role !== "effect") missing.push("effect-unbound")
    if (guardRef && (guard?.anchor?.kind !== "condition" || !guard.annotation?.guardBranch || !guard.annotation.condition)) missing.push("guard-unbound")
    if (["authorization-before-effect", "authorized-object-matches-effect"].includes(q.kind)) {
      for (const [label, role] of [["principalAnchorId", "principal"], ["resourceAnchorId", "resource"]] as const) {
        if (!effect?.annotations.some(a => a.anchorId === effect.annotation?.[label] && a.role === role)) missing.push(`${role}-unbound`)
        if (guardRef && !guard?.annotations.some(a => a.anchorId === guard.annotation?.[label] && a.role === role)) missing.push(`guard-${role}-unbound`)
      }
    }
    if (missing.length) fail("property-query-unbound", [...new Set(missing)].join(", "), q.id)
    return { ...q, questionId: question.id, source: structuredClone(skeleton.source), sourceRevision: skeleton.revision, state: missing.length ? "unbound" : "bound", effectAnchorId: effectRef?.anchorId, guardAnchorId: guardRef?.anchorId, effectRef, guardRef, effectKind: effect?.anchor?.kind, principalAnchorId: effect?.annotation?.principalAnchorId, resourceAnchorId: effect?.annotation?.resourceAnchorId, guardResourceAnchorId: guard?.annotation?.resourceAnchorId, guardPermission: guard?.annotation?.permission, bindingScope: "interprocedural-property/v1", semanticReview: "unreviewed", bindingValidation: "source-structure-only", missing: [...new Set(missing)] }
  })
  return { schemaVersion: "authorization-property-query/v1" as const, questionId: question.id, queries, diagnostics, revision: createHash("sha256").update(JSON.stringify([question, skeleton.revision, queries])).digest("hex") }
}
export function validatePropertyQuestionMapping(originalQuestionIds: string[], results: Array<{ questionId: string; properties: unknown[] }>) {
  return [...results.flatMap(r => !originalQuestionIds.includes(r.questionId) ? [{ code: "property-question-unknown", questionId: r.questionId }] : results.filter(v => v.questionId === r.questionId).length !== 1 ? [{ code: "property-question-duplicate", questionId: r.questionId }] : []),
    ...originalQuestionIds.filter(id => !results.some(r => r.questionId === id)).map(questionId => ({ code: "property-question-missing", questionId }))]
}
