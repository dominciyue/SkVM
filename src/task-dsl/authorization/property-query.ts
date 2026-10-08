import { z } from "zod"
import { createHash } from "node:crypto"
import type { SourceSkeleton } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { SourceInterpretation } from "./source-interpretation.ts"
const text = z.string().trim().min(1)
export const PropertyKindSchema = z.enum(["authorization-before-effect", "authorized-object-matches-effect", "effect-reachability", "operation-completion"])
export type PropertyKind = z.infer<typeof PropertyKindSchema>
export const PropertyRequirementSchema = z.object({ id: text, kind: PropertyKindSchema, requirement: text }).strict()
export const PropertyBindingSchema = z.object({ propertyId: text, effectAnchorId: text, guardAnchorId: text.optional(),
  proposed: PropertyRequirementSchema.omit({ id: true }).optional() }).strict()
export interface PropertyQuestion { id: string; request: string; properties?: z.infer<typeof PropertyRequirementSchema>[] }
export interface BoundPropertyQuery {
  id: string; questionId: string; kind: PropertyKind; requirement: string; state: "bound" | "unbound";
  source: SourceSkeleton["source"]; sourceRevision: string; effectAnchorId?: string; guardAnchorId?: string;
  principalAnchorId?: string; resourceAnchorId?: string; guardResourceAnchorId?: string;
  semanticReview: "unreviewed"; bindingValidation: "source-structure-only"; missing: string[];
}
export interface PropertyQueryDiagnostic { code: string; questionId: string; propertyId?: string; sourceId: string; message: string; nextAction: string }
/** A kind is a task requirement, never a source verdict. Bind only the current
 * shown anchors; model annotations remain unreviewed source interpretations. */
export function bindPropertyQueries(question: PropertyQuestion, skeleton: SourceSkeleton, interpretation?: SourceInterpretation) {
  const draft = skeleton.modelCovered && interpretation?.revision === skeleton.revision ? interpretation : undefined
  const bindings = draft?.propertyBindings ?? [], declarations = question.properties ?? bindings.flatMap(b => b.proposed ? [{ id: b.propertyId, ...b.proposed }] : [])
  const diagnostics: PropertyQueryDiagnostic[] = [], anchors = new Map(skeleton.anchors.map(a => [a.id, a])), annotations = new Map(draft?.annotations.map(a => [a.anchorId, a]) ?? [])
  const fail = (code: string, message: string, propertyId?: string) => diagnostics.push({ code, questionId: question.id, sourceId: skeleton.source.id, propertyId, message, nextAction: "Declare the current task property and bind its exact effect/guard/object anchors in the current shown source; retain unknowns." })
  if (!declarations.length) fail("property-query-undeclared", "No current task property is declared; no narrow query or verdict is inferred.")
  for (const b of bindings) if (!declarations.some(q => q.id === b.propertyId) || bindings.filter(v => v.propertyId === b.propertyId).length !== 1) fail("property-binding-identity", "Binding must name exactly one current declared property.", b.propertyId)
  const queries: BoundPropertyQuery[] = declarations.map(q => {
    const binding = bindings.filter(b => b.propertyId === q.id), b = binding.length === 1 ? binding[0] : undefined, effect = b && annotations.get(b.effectAnchorId), guard = b?.guardAnchorId && annotations.get(b.guardAnchorId)
    const missing: string[] = []
    if (declarations.filter(v => v.id === q.id).length !== 1) missing.push("duplicate-property")
    if (!question.request.includes(q.requirement)) missing.push("requirement-not-current-task-span")
    if (!draft || !b || !anchors.has(b.effectAnchorId) || effect?.role !== "effect") missing.push("effect-unbound")
    if (q.kind === "authorization-before-effect" || q.kind === "authorized-object-matches-effect") {
      if (!b?.guardAnchorId || !anchors.has(b.guardAnchorId) || !guard || !guard.guardBranch || anchors.get(b.guardAnchorId)?.kind !== "condition") missing.push("guard-unbound")
      if (!effect?.principalAnchorId || annotations.get(effect.principalAnchorId)?.role !== "principal" || !guard || guard.principalAnchorId !== effect.principalAnchorId) missing.push("principal-unbound")
      if (!effect?.resourceAnchorId || annotations.get(effect.resourceAnchorId)?.role !== "resource" || !guard || !guard.resourceAnchorId || annotations.get(guard.resourceAnchorId)?.role !== "resource") missing.push("resource-unbound")
    }
    if (missing.length) fail("property-query-unbound", missing.join(", "), q.id)
    return { ...q, questionId: question.id, source: structuredClone(skeleton.source), sourceRevision: skeleton.revision, state: missing.length ? "unbound" : "bound",
      ...(b ? { effectAnchorId: b.effectAnchorId, guardAnchorId: b.guardAnchorId } : {}), principalAnchorId: effect?.principalAnchorId, resourceAnchorId: effect?.resourceAnchorId, guardResourceAnchorId: guard && guard.resourceAnchorId || undefined, semanticReview: "unreviewed", bindingValidation: "source-structure-only", missing } as BoundPropertyQuery
  })
  return { schemaVersion: "authorization-property-query/v1" as const, questionId: question.id, queries, diagnostics,
    revision: createHash("sha256").update(JSON.stringify([question, skeleton.revision, queries])).digest("hex") }
}
export function validatePropertyQuestionMapping(originalQuestionIds: string[], results: Array<{ questionId: string; properties: unknown[] }>) {
  return [...results.flatMap(r => !originalQuestionIds.includes(r.questionId) ? [{ code: "property-question-unknown", questionId: r.questionId }] : results.filter(v => v.questionId === r.questionId).length !== 1 ? [{ code: "property-question-duplicate", questionId: r.questionId }] : []),
    ...originalQuestionIds.filter(id => !results.some(r => r.questionId === id)).map(questionId => ({ code: "property-question-missing", questionId }))]
}
