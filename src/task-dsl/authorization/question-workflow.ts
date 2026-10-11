import { z } from "zod"
import { InquiryText, type InquiryDiagnostic } from "./inquiry.ts"
import { compileSourceEdit, type SourceEditDraft } from "./source-edit.ts"
import type { SourceSkeleton, SourceAnchor } from "../../benchmarks/authorization-dsl/evidence-preparation/source-skeleton.ts"
import type { PropertySourceReference } from "./property-query.ts"
import { FINITE_PREDICATE_GUIDE } from "./control-evaluation.ts"

export const SourceCitationSchema = z.object({ path: InquiryText.optional(), startLine: z.number().int().positive(), endLine: z.number().int().positive().optional(), text: InquiryText.optional(), sha256: InquiryText.optional(), receiverClass: InquiryText.optional() }).strict()
const citation = SourceCitationSchema
const because = { because: InquiryText }
const object = z.object({ kind: z.literal("object"), expression: InquiryText, as: z.enum(["principal", "resource", "permission", "condition", "context"]), at: citation.optional(), sameAs: InquiryText.optional(), ...because }).strict()
const condition = z.object({ kind: z.literal("condition"), at: citation, test: z.record(z.unknown()), authorizes: z.object({ principal: InquiryText, resource: InquiryText, when: z.enum(["true", "false"]), permission: InquiryText.optional() }).strict().optional(), ...because }).strict()
const effect = z.object({ kind: z.literal("effect"), at: citation, principal: InquiryText.optional(), resource: InquiryText.optional(), ...because }).strict()
const statement = z.object({ kind: z.literal("statement"), at: citation, outcome: z.enum(["allow", "deny", "unknown"]).optional(), failure: z.enum(["authorization", "operation"]).optional(), ...because }).strict()
const dependency = z.object({ kind: z.literal("dependency"), at: citation, as: z.enum(["principal", "resource", "permission", "condition", "effect", "context"]).default("context"), principal: InquiryText.optional(), resource: InquiryText.optional(), ...because }).strict()
const residual = z.object({ kind: z.literal("residual"), at: citation, ...because }).strict()
export const QuestionDeclarationSchema = z.object({ schemaVersion: z.literal("authorization-question-declaration/v1"), source: citation,
  questionId: InquiryText.optional(),
  statements: z.array(z.discriminatedUnion("kind", [object, condition, effect, statement, dependency, residual])).max(128),
  properties: z.array(z.object({ property: InquiryText, effect: citation, guard: citation.optional() }).strict()).max(8).optional(),
  fallthrough: z.enum(["allow", "deny", "unknown"]).optional(),
}).strict()
export type QuestionDeclaration = z.infer<typeof QuestionDeclarationSchema>
export interface QuestionReference { ref: PropertySourceReference; kind: string; text: string; source: { path: string; startLine?: number; endLine?: number } }
type Citation = z.infer<typeof citation>
const matches = (at: Citation, source: { path: string; startLine?: number; endLine?: number }, text: string) => source.startLine !== undefined && source.endLine !== undefined && (!at.path || at.path === source.path) && source.startLine >= at.startLine && source.endLine <= (at.endLine ?? at.startLine) && (!at.text || text.includes(at.text) || at.text.includes(text))
interface QuestionCompilation { diagnostics: InquiryDiagnostic[]; edit?: { schemaVersion: "authorization-source-edit/v1"; kind: "edit"; transactionId: string; edits: Array<Record<string, unknown>> }; mechanicalEdits?: number }

/** Translate model meanings and source citations into existing source edits.
 * This selects only unique syntax; it supplies no authorization interpretation. */
export function compileQuestionDeclaration(skeleton: SourceSkeleton, raw: unknown, options: { transactionId: string; questionId: string; references: QuestionReference[]; properties?: Array<{ id: string; requirement: string }>; previous?: SourceEditDraft }): QuestionCompilation {
  const diagnostics: InquiryDiagnostic[] = [], parsed = QuestionDeclarationSchema.safeParse(raw)
  const fail = (code: string, path: string, message: string, candidates?: unknown) => diagnostics.push({ code: `question-${code}`, path, questionId: options.questionId, message: `${message}${candidates ? ` Candidates: ${JSON.stringify(candidates)}` : ""}`, severity: "error" })
  if (!parsed.success) { for (const issue of parsed.error.issues) fail("declaration-shape", issue.path.join("."), issue.message); return { diagnostics } }
  const declaration = parsed.data
  if (declaration.questionId && declaration.questionId !== options.questionId) fail("identity", "questionId", "This source owner belongs to another original question.")
  if (declaration.source.path && declaration.source.path !== skeleton.source.path || declaration.source.startLine !== skeleton.source.startLine || (declaration.source.endLine ?? declaration.source.startLine) !== skeleton.source.endLine) fail("source-owner", "source", "Declare the currently offered complete source passage; the host owns its routing.")
  if (declaration.source.sha256 && declaration.source.sha256 !== skeleton.source.sha256) fail("source-stale", "source", "This source version has changed; read and interpret the current original.")
  if (!skeleton.modelCovered) fail("source-unread", "source", "Read the complete current source passage before declaring its meaning.")
  const edits: Array<Record<string, unknown>> = [], annotations = new Map<string, Record<string, unknown>>()
  const flowAnchors = new Set<string>()
  const collectFlow = (value: unknown): void => { if (!value || typeof value !== "object") return; if ("anchorId" in value && typeof value.anchorId === "string") flowAnchors.add(value.anchorId); for (const child of Object.values(value)) collectFlow(child) }
  collectFlow(skeleton.flow)
  const resolve = (at: Citation, kinds?: string[], executableEffect = false) => {
    let candidates = skeleton.anchors.filter(a => (!kinds || kinds.includes(a.kind)) && (!executableEffect || a.kind === "call" || flowAnchors.has(a.id)) && matches(at, a.selector, a.text))
    if (at.text && candidates.some(a => a.text === at.text)) candidates = candidates.filter(a => a.text === at.text)
    if (at.sha256 && at.sha256 !== skeleton.source.sha256) { fail("source-stale", "statements.at", "The cited source version is stale."); return undefined }
    if (candidates.length !== 1) { fail(candidates.length ? "source-ambiguous" : "source-unmatched", "statements.at", "Choose one actual statement by its original lines/text.", candidates.map(a => ({ kind: a.kind, text: a.text, startLine: a.selector.startLine, endLine: a.selector.endLine }))); return undefined }
    return candidates[0]
  }
  const resolveObject = (expression: string, at?: Citation) => {
    const candidates = skeleton.anchors.filter(a => ["parameter", "assignment", "call"].includes(a.kind) && (a.name === expression || a.call?.expression === expression) && (!at || matches(at, a.selector, a.text)))
    if (candidates.length !== 1) { fail("object-unresolved", expression, "The stated object has no unique current source origin; name its actual formal, assignment or call and source location.", candidates.map(a => ({ name: a.name, text: a.text, startLine: a.selector.startLine }))); return undefined }
    return candidates[0]!.id
  }
  const put = (anchor: SourceAnchor, value: Record<string, unknown>) => {
    if (annotations.has(anchor.id)) fail("statement-duplicate", "statements", "Give each source statement one combined meaning; a call keeps its actual invocation under every meaning.")
    annotations.set(anchor.id, value)
  }
  for (const meaning of declaration.statements) {
    if (meaning.kind === "object") {
      const id = resolveObject(meaning.expression, meaning.at), anchor = skeleton.anchors.find(a => a.id === id)
      if (anchor) put(anchor, { role: meaning.as, explanation: meaning.because, ...(meaning.sameAs ? { aliasAnchorId: resolveObject(meaning.sameAs) } : {}) })
      continue
    }
    const kinds = meaning.kind === "condition" ? ["condition"] : meaning.kind === "dependency" ? ["call"] : meaning.kind === "effect" ? ["assignment", "call"] : undefined
    const anchor = resolve(meaning.at, kinds, meaning.kind === "effect"); if (!anchor) continue
    if (meaning.kind === "residual") { edits.push({ anchorId: anchor.id, field: "unresolved", value: meaning.because }); continue }
    const value: Record<string, unknown> = { role: meaning.kind === "condition" ? "condition" : meaning.kind === "effect" ? "effect" : meaning.kind === "dependency" ? meaning.as : "context", explanation: meaning.because }
    if (meaning.kind === "condition") {
      value.condition = meaning.test
      if (meaning.authorizes) Object.assign(value, { guardBranch: meaning.authorizes.when, principalAnchorId: resolveObject(meaning.authorizes.principal), resourceAnchorId: resolveObject(meaning.authorizes.resource), ...(meaning.authorizes.permission ? { permission: meaning.authorizes.permission } : {}) })
    }
    if (meaning.kind === "effect" || meaning.kind === "dependency") for (const field of ["principal", "resource"] as const) if (meaning[field]) value[`${field}AnchorId`] = resolveObject(meaning[field]!)
    if (meaning.kind === "statement") {
      if (meaning.outcome) { if (anchor.kind !== "return") fail("outcome-source", "statements", "A returned outcome must cite the actual return statement."); else value.returnOutcome = meaning.outcome }
      if (meaning.failure) { if (anchor.kind !== "raise") fail("failure-source", "statements", "An exceptional outcome must cite the actual raise statement."); else value.failureKind = meaning.failure }
    }
    put(anchor, value)
  }
  for (const [anchorId, fields] of annotations) for (const [field, value] of Object.entries(fields)) if (value !== undefined) edits.push({ anchorId, field, value })
  if (declaration.fallthrough) edits.push({ field: "fallthroughOutcome", value: declaration.fallthrough })
  if (declaration.properties) {
    const findReference = (at: Citation) => {
      let candidates = options.references.filter(r => r.ref.questionId === options.questionId && matches(at, r.source, r.text) && (!at.receiverClass || at.receiverClass === r.ref.receiverClass) && (!at.sha256 || at.sha256 === r.ref.sourceSha256))
      if (at.text && candidates.some(r => r.text === at.text)) candidates = candidates.filter(r => r.text === at.text)
      if (candidates.length !== 1) { fail("property-source-unresolved", "properties", "The property needs one current source occurrence in this question; source identity is not object equivalence.", candidates.map(r => ({ ...r.source, text: r.text, receiverClass: r.ref.receiverClass }))); return undefined }
      return candidates[0]!.ref
    }
    const bindings = declaration.properties.map(p => {
      const candidates = options.properties?.filter(q => q.id === p.property || q.requirement === p.property) ?? []
      if (options.properties && candidates.length !== 1) fail("property-unresolved", p.property, "Select this original question's declared property requirement.")
      return { propertyId: candidates[0]?.id ?? p.property, effectRef: findReference(p.effect), ...(p.guard ? { guardRef: findReference(p.guard) } : {}) }
    })
    edits.push({ field: "propertyBindings", value: bindings })
  }
  if (diagnostics.length) return { diagnostics }
  const edit = { schemaVersion: "authorization-source-edit/v1" as const, kind: "edit" as const, transactionId: options.transactionId, edits }
  const compiled = compileSourceEdit(skeleton, edit, { ...options, progressive: true })
  return { diagnostics: compiled.diagnostics, ...(compiled.diagnostics.length ? {} : { edit }), mechanicalEdits: edits.length }
}

export function questionDeclarationView(skeleton: SourceSkeleton, options: { question?: { id: string; request: string; properties?: unknown }; previous?: SourceEditDraft; references?: QuestionReference[] }) {
  return { currentQuestion: options.question, currentSource: { path: skeleton.source.path, startLine: skeleton.source.startLine, endLine: skeleton.source.endLine, sha256: skeleton.source.sha256 },
    sourceStatements: skeleton.anchors.map(a => ({ kind: a.kind, name: a.name, text: a.text.length <= 512 ? a.text : undefined, startLine: a.selector.startLine, endLine: a.selector.endLine, textOmitted: a.text.length > 512 ? "Read the original cited range." : undefined })),
    retainedMeanings: (options.previous?.annotations ?? []).map(a => { const anchor = skeleton.anchors.find(v => v.id === a.anchorId); return { source: anchor && { text: anchor.text, startLine: anchor.selector.startLine, endLine: anchor.selector.endLine }, meaning: a.explanation, role: a.role } }),
    relatedPropertySources: options.references?.map(r => ({ path: r.source.path, startLine: r.source.startLine, endLine: r.source.endLine, kind: r.kind, text: r.text, receiverClass: r.ref.receiverClass })),
    instruction: "Explain source-supported objects, conditions, effects, statement outcomes, dependencies and residuals with authorization_declare. Use source lines/text and object expressions; the host supplies identities and call mapping. You need not repeat retained meanings or fill a whole function's slot table. Omitted relevant meanings remain unresolved. Conditions describe the actual TRUE test; authorizes.when names the continuation that authorizes the named objects. A call keeps its actual invocation even when declared as an effect or context. Property citations select occurrences, never prove object equality. Natural delivery stays available with explicit machine gaps.", predicateGuide: FINITE_PREDICATE_GUIDE, semanticSupport: "unreviewed" }
}
