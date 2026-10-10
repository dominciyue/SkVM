import { z } from "zod"
import { createHash } from "node:crypto"
import { InquiryText, type InquiryDiagnostic } from "../../task-dsl/authorization/inquiry.ts"
import { SourceEditSchema, sourceEditFields, sourceEditModelView, type SourceEditDraft } from "../../task-dsl/authorization/source-edit.ts"
import { sourceAnnotationRoles } from "../../task-dsl/authorization/source-interpretation.ts"
import { zodToJsonSchema } from "../../providers/structured.ts"
import type { SourceSkeleton } from "./evidence-preparation/source-skeleton.ts"
import type { PropertyDemand } from "../../task-dsl/authorization/property-demand.ts"

export const CompletionEditProposalSchema = z.object({ transactionId: InquiryText, edits: z.array(z.object({ slot: InquiryText, value: z.unknown().refine(v => v !== undefined, "An explicit value is required; omission does not clear a field.") }).strict()).max(256) }).strict()
export const isCompletionEditProposal = (raw: unknown) => !!raw && typeof raw === "object" && "transactionId" in raw && !("schemaVersion" in raw)
export const COMPLETION_EDIT_GUIDE = 'semantic-completion-v1: one source form is task.sourceEdit. Submit its {transactionId,edits:[{slot:<current offered slot>,value:<listed shape>}]} inside authorization_observe.controlDelta, or at the structured step root. The host supplies all source/action/version/anchor/field routing. Do not add schemaVersion, kind, anchorId or field. Slots are valid only for this current transaction. Submit changed fields, retaining earlier ones. Role plus explanation at the same anchor permits partial adoption; missing decisive fields remain pending. Optional null deletes only that offered field; required role/explanation and root arrays cannot be null. Use an offered unresolved slot with a precise reason when the source meaning remains unknown. Source calls keep their actual invocation under every role. Conditions describe the actual true branch; guardBranch explicitly identifies authorization continuation for the referenced principal/resource. Typed refs locate syntax, not permission or object equality. Field values remain strict source interpretations and unreviewed; the form supplies no answers.'
export function completionEditModelView(skeleton: SourceSkeleton, options: { transactionId: string; questionIds: string[]; draft?: SourceEditDraft; demand?: PropertyDemand }) {
  const previous = sourceEditModelView(skeleton, options), draft = previous.retainedDraft
  const excluded = new Set(options.demand?.excluded.map(e => e.anchorId) ?? [])
  const ids = new Set([...new Set([...(options.demand?.frontier.map(r => r.anchorId) ?? []), ...skeleton.anchors.filter(a => !excluded.has(a.id) && (a.interpretationRequired || a.fieldWrite)).map(a => a.id)])].slice(0, 8).concat(skeleton.anchors.filter(a => a.kind === "parameter").map(a => a.id)))
  const slots: Array<{ slot: string; anchorId?: string; field: string; sourceStartLine: number; sourceEndLine: number; text: string; expectedShape: unknown; currentValue: unknown }> = []
  const offer = (field: string, anchorId?: string) => {
    const anchor = skeleton.anchors.find(a => a.id === anchorId), schema = field === "role" && anchor ? z.enum(sourceAnnotationRoles(anchor) as [string, ...string[]]) : sourceEditFields[field]!
    const slot = `slot-${createHash("sha256").update(JSON.stringify([options.transactionId, anchorId, field])).digest("hex").slice(0, 20)}`
    slots.push({ slot, anchorId, field, sourceStartLine: anchor?.selector.startLine ?? skeleton.source.startLine, sourceEndLine: anchor?.selector.endLine ?? skeleton.source.endLine, text: anchor?.text ?? "Current source root", expectedShape: zodToJsonSchema(schema), currentValue: anchorId ? field === "unresolved" ? draft.unresolved.find(u => u.anchorId === anchorId)?.reason : (draft.annotations.find(a => a.anchorId === anchorId) as any)?.[field] : (draft as any)[field] })
  }
  for (const anchor of skeleton.anchors.filter(a => ids.has(a.id))) {
    const fields = new Set(["role", "explanation", "unresolved"])
    if (["parameter", "assignment", "call"].includes(anchor.kind)) fields.add("aliasAnchorId")
    if (["condition", "call", "assignment"].includes(anchor.kind)) for (const field of ["condition", "principalAnchorId", "resourceAnchorId", "permission", "authorizedByAnchorIds"]) fields.add(field)
    if (anchor.kind === "condition") fields.add("guardBranch")
    if (anchor.kind === "call") fields.add("facets")
    if (anchor.kind === "return") fields.add("returnOutcome")
    if (anchor.kind === "raise") fields.add("failureKind")
    for (const field of Object.keys(draft.annotations.find(a => a.anchorId === anchor.id) ?? {})) if (field !== "anchorId") fields.add(field)
    for (const field of fields) offer(field, anchor.id)
  }
  offer("propertyBindings")
  if (options.demand?.required.some(r => r.field === "fallthroughOutcome") || draft.fallthroughOutcome) offer("fallthroughOutcome")
  return { schemaVersion: "authorization-completion-edit-view/v1" as const, transactionId: options.transactionId, template: { transactionId: options.transactionId, edits: [] }, slots, retainedDraft: draft, expression: previous.expression, instruction: COMPLETION_EDIT_GUIDE, semanticSupport: "unreviewed" as const }
}
export function expandCompletionEditProposal(view: ReturnType<typeof completionEditModelView>, raw: unknown) {
  const diagnostics: InquiryDiagnostic[] = [], fail = (code: string, path: string, message: string) => diagnostics.push({ code: `source-edit-${code}`, path, message, severity: "error" })
  const proposal = CompletionEditProposalSchema.safeParse(raw)
  if (!proposal.success) for (const issue of proposal.error.issues) fail("schema", issue.path.join("."), issue.message)
  if (!proposal.success) return { diagnostics }
  if (proposal.data.transactionId !== view.transactionId) fail("stale", "transactionId", "Use the current task.sourceEdit.transactionId; old offered slots cannot be rebound.")
  const edits = proposal.data.edits.flatMap((edit, index) => {
    const offered = view.slots.find(s => s.slot === edit.slot)
    if (!offered) { fail("slot-unoffered", `edits.${index}.slot`, "Use only a slot in the current task.sourceEdit.slots; request a new source form for another target."); return [] }
    const checked = sourceEditFields[offered.field]!.safeParse(edit.value)
    if (!checked.success) { fail("slot-value", `edits.${index}.value`, `Slot ${offered.slot} (${offered.field}) expects ${JSON.stringify(offered.expectedShape)}; ${checked.error.issues.map(i => i.message).join("; ")}`); return [] }
    return [{ ...(offered.anchorId ? { anchorId: offered.anchorId } : {}), field: offered.field, value: checked.data }]
  })
  if (diagnostics.length) return { diagnostics }
  return { diagnostics, raw: SourceEditSchema.parse({ schemaVersion: "authorization-source-edit/v1", kind: "edit", transactionId: view.transactionId, edits }) }
}
