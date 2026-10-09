import { z } from "zod"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import { FiniteValueSchema } from "./control-slice.ts"
import { SourceAnnotationSchema, SourceInterpretationSchema, sourceAnnotationRoles, type SourceInterpretation } from "./source-interpretation.ts"
import { predicateDiagnostics, FINITE_PREDICATE_GUIDE, FINITE_PERMISSION_GUIDE } from "./control-evaluation.ts"
import type { SourceSkeleton } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { PropertyDemand } from "./property-demand.ts"
import { zodToJsonSchema } from "../../providers/structured.ts"

/** An input adapter only: all execution continues through SourceInterpretation. */
const annotationFields = Object.fromEntries(Object.entries(SourceAnnotationSchema.shape).filter(([key]) => key !== "anchorId").map(([key, schema]) => [key, schema instanceof z.ZodOptional ? schema.unwrap() : schema])) as Record<string, z.ZodTypeAny>
const fields = { ...annotationFields, unresolved: InquiryText, fallthroughOutcome: SourceInterpretationSchema.shape.fallthroughOutcome.unwrap(), propertyBindings: SourceInterpretationSchema.shape.propertyBindings.unwrap() }
const rootFields = new Set(["fallthroughOutcome", "propertyBindings"])
const changes = Object.entries(fields).map(([field, value]) => z.object({ field: z.literal(field), ...(rootFields.has(field) ? {} : { anchorId: InquiryText }), value }).strict())
export const SourceEditSchema = z.object({ schemaVersion: z.literal("authorization-source-edit/v1"), kind: z.literal("edit"), transactionId: InquiryText,
  edits: z.array(z.discriminatedUnion("field", changes as [typeof changes[number], typeof changes[number], ...typeof changes[number][]])).max(256),
  values: z.array(z.object({ key: InquiryText, value: FiniteValueSchema, text: InquiryText, questionId: InquiryText.optional() }).strict()).max(32).optional(),
  reason: InquiryText.optional(),
}).strict()
export interface SourceEditDraft {
  revision: string; annotations: Array<Partial<z.infer<typeof SourceAnnotationSchema>> & { anchorId: string }>;
  unresolved: SourceInterpretation["unresolved"]; fallthroughOutcome?: SourceInterpretation["fallthroughOutcome"]; propertyBindings?: SourceInterpretation["propertyBindings"];
}
const emptyDraft = (s: SourceSkeleton): SourceEditDraft => ({ revision: s.revision, annotations: [], unresolved: [] })

export function compileSourceEdit(skeleton: SourceSkeleton, raw: unknown, options: { transactionId: string; previous?: SourceEditDraft; questionId?: string; progressive?: boolean }): { diagnostics: InquiryDiagnostic[]; acceptedEdits: number; draft: SourceEditDraft; interpretation?: SourceInterpretation; values?: z.infer<typeof SourceEditSchema>["values"]; reason?: string } {
  const previous = options.previous?.revision === skeleton.revision ? options.previous : emptyDraft(skeleton), diagnostics: InquiryDiagnostic[] = []
  const fail = (code: string, path: string, message: string) => diagnostics.push({ code: `source-edit-${code}`, path, message, questionId: options.questionId, severity: "error" })
  const parsed = SourceEditSchema.safeParse(raw)
  if (!parsed.success) for (const issue of parsed.error.issues) fail("schema", issue.path.join("."), issue.message)
  else {
    if (parsed.data.transactionId !== options.transactionId) fail("stale", "transactionId", "Use the current sourceEdit.transactionId; task/source/focus identity is host-owned.")
    if (!skeleton.modelCovered) fail("unread", "transactionId", "The complete current original source must be shown before editing.")
    const seen = new Set<string>()
    for (const [i, edit] of parsed.data.edits.entries()) {
      const anchorId = "anchorId" in edit ? String(edit.anchorId) : undefined, key = JSON.stringify([anchorId, edit.field])
      if (seen.has(key)) fail("duplicate", `edits.${i}`, "Each changed source slot appears once per submission.")
      seen.add(key)
      if (anchorId && !skeleton.anchors.some(a => a.id === anchorId)) fail("anchor-unshown", `edits.${i}.anchorId`, "Use an anchor from this current shown source transaction.")
      const anchor = skeleton.anchors.find(a => a.id === anchorId)
      if (edit.field === "role" && anchor && !sourceAnnotationRoles(anchor).some(role => role === edit.value)) fail("role", `edits.${i}.value`, `Allowed structural roles for this ${anchor.kind}: ${sourceAnnotationRoles(anchor).join(", ")}. Choose its source meaning; the host does not coerce it.`)
      if (edit.field === "condition") for (const code of predicateDiagnostics(edit.value)) fail(code, `edits.${i}.value`, `${FINITE_PREDICATE_GUIDE} ${FINITE_PERMISSION_GUIDE}`)
    }
  }
  if (diagnostics.length || !parsed.success) return { diagnostics, acceptedEdits: 0, draft: structuredClone(previous) }
  const draft = structuredClone(previous), annotations = new Map(draft.annotations.map(a => [a.anchorId, a])), unresolved = new Map(draft.unresolved.map(u => [u.anchorId, u]))
  for (const edit of parsed.data.edits) {
    if (rootFields.has(edit.field)) { (draft as any)[edit.field] = structuredClone(edit.value); continue }
    const anchorId = String(edit.anchorId)
    if (edit.field === "unresolved") { unresolved.set(anchorId, { anchorId, reason: String(edit.value) }); annotations.delete(anchorId) }
    else { const annotation = annotations.get(anchorId) ?? { anchorId }; (annotation as any)[edit.field] = structuredClone(edit.value); annotations.set(anchorId, annotation); unresolved.delete(anchorId) }
  }
  draft.annotations = [...annotations.values()]; draft.unresolved = [...unresolved.values()]
  if (!options.progressive) for (const annotation of draft.annotations) for (const field of ["role", "explanation"] as const) if (!annotation[field]) fail("draft-incomplete", `${annotation.anchorId}.${field}`, `The local field is retained. Add ${field} for this same anchor, or submit a named unresolved slot. No source unit is adopted yet.`)
  const interpretation = diagnostics.length ? undefined : SourceInterpretationSchema.parse({ schemaVersion: "source-interpretation/v1", ...draft, ...(options.progressive ? { annotations: draft.annotations.filter(a => a.role && a.explanation) } : {}) })
  return { diagnostics, acceptedEdits: parsed.data.edits.length, draft, ...(interpretation ? { interpretation } : {}), values: parsed.data.values, reason: parsed.data.reason }
}

export const SOURCE_EDIT_GUIDE = 'authorization-source-edit/v1: task.sourceEdit is the current host-managed semantic form. Native: authorization_observe({controlDelta:{schemaVersion:"authorization-source-edit/v1",kind:"edit",transactionId:<task.sourceEdit.transactionId>,edits:[{anchorId:<shown anchor>,field:<listed field>,value:<its listed type>}]}}). Structured inquiry uses the same edit at the step root. Submit only changed slots. The host fills focus/source revision and internal routing. For role and explanation edit the SAME anchor; a partial draft is retained but not adopted. A branch also needs a finite condition value, or field:"unresolved",value:<precise remaining meaning>. Root fields fallthroughOutcome/propertyBindings omit anchorId. No invented roles, free-text predicates or source answers are supplied by the host. Existing authorization-source-update/v1 annotations and the explicit low-level fallback remain compatible. values, if used, are exact USER premise mappings, never source slots. Current source, tasks and unknowns remain data; semantic support is unreviewed.'
const expressionExamples = [
  { op: "eq", left: { binding: "flag" }, right: { literal: true } },
  { op: "not", arg: { op: "is-null", value: { binding: "item" } } },
  { op: "all", args: [{ op: "truthy", language: "python", value: { binding: "flag" } }, { op: "member", value: { binding: "key" }, set: { literal: ["x", "y"] } }] },
]
export function sourceEditModelView(skeleton: SourceSkeleton, options: { transactionId: string; questionIds: string[]; draft?: SourceEditDraft; demand?: PropertyDemand }) {
  const draft = options.draft?.revision === skeleton.revision ? options.draft : emptyDraft(skeleton), slots: Array<Record<string, unknown>> = []
  const require = (anchorId: string, field: string, why: string) => {
    if (slots.some(s => s.anchorId === anchorId && s.field === field)) return
    const anchor = skeleton.anchors.find(a => a.id === anchorId), annotation = draft.annotations.find(a => a.anchorId === anchorId), unknown = draft.unresolved.find(u => u.anchorId === anchorId)
    const currentValue = rootFields.has(field) ? (draft as any)[field] : field === "unresolved" ? unknown?.reason : (annotation as any)?.[field]
    slots.push({ ...(rootFields.has(field) ? {} : { anchorId }), field, currentValue, questionIds: options.questionIds, why, source: { path: skeleton.source.path, startLine: anchor?.selector.startLine ?? skeleton.source.startLine, endLine: anchor?.selector.endLine ?? skeleton.source.endLine, text: anchor?.text ?? "Current source normal fallthrough" }, type: `sourceEdit.fields.${field}`, ...(field === "role" && anchor ? { allowedValues: sourceAnnotationRoles(anchor) } : {}), unknownAlternative: rootFields.has(field) ? undefined : { anchorId, field: "unresolved", value: "<name the precise remaining source meaning>" } })
  }
  const frontier = options.demand?.frontier ?? skeleton.anchors.filter(a => a.interpretationRequired).map(a => ({ anchorId: a.id, field: a.kind === "condition" ? "condition" : a.kind === "return" ? "returnOutcome" : a.kind === "raise" ? "failureKind" : "role", reason: "This source statement needs an explicit meaning for the current task." }))
  for (const r of frontier) {
    if (!rootFields.has(r.field) && !draft.unresolved.some(u => u.anchorId === r.anchorId)) for (const field of ["role", "explanation"]) if (!(draft.annotations.find(a => a.anchorId === r.anchorId) as any)?.[field]) require(r.anchorId, field, "Every interpreted anchor needs its typed role and source explanation.")
    require(r.anchorId, r.field, r.reason)
  }
  for (const a of draft.annotations) for (const field of ["role", "explanation"]) if (!(a as any)[field]) require(a.anchorId, field, "Complete this retained local draft before unit adoption.")
  return { schemaVersion: "authorization-source-edit-view/v1", transactionId: options.transactionId, template: { schemaVersion: "authorization-source-edit/v1", kind: "edit", transactionId: options.transactionId, edits: [] },
    fields: Object.fromEntries(Object.entries(fields).map(([field, schema]) => [field, zodToJsonSchema(schema)])), slots, retainedDraft: draft,
    expression: { guide: `${FINITE_PREDICATE_GUIDE}\n${FINITE_PERMISSION_GUIDE}`, examples: expressionExamples, meaning: "Anonymous syntax examples only; choose actual bindings/roles from shown source." },
    hostOwned: ["focus", "questionId", "source revision", "internal unit identity"], semanticSupport: "unreviewed" }
}
