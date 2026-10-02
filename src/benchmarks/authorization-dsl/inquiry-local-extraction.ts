import { z } from "zod"
import { InquiryText, type InquiryDiagnostic } from "../../task-dsl/authorization/inquiry.ts"
import { ControlRuleSchema, ControlDependencySchema, UserBindingSchema, PolicyRuleSchema, type ControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import type { AuthorizationInquiryProgram } from "../../task-dsl/authorization/inquiry-program.ts"
import type { InquiryEvidence } from "./inquiry-tools.ts"
import type { WorkItem } from "./inquiry-worklist.ts"
import type { UpdateRejection } from "./inquiry-control-updates.ts"

const common = { op: z.enum(["add", "replace"]), questionId: InquiryText, targetKey: ControlRuleSchema.shape.key, reason: InquiryText.optional() }
const omit = { key: true, questionId: true, revisionOf: true, revisionReason: true } as const
const rule = ControlRuleSchema.omit(omit).extend({ ...common, kind: z.enum(["entry", "guard", "reject", "continue", "effect"]) })
const sourceBinding = ControlRuleSchema.omit({ ...omit, kind: true }).extend({ ...common, bindingKey: ControlRuleSchema.shape.key, bindingKind: z.enum(["principal", "resource", "permission", "configuration", "value"]) })
const dependency = ControlDependencySchema.omit(omit).extend({ ...common, reason: InquiryText })
const known = UserBindingSchema.omit({ ...omit, origin: true }).extend({ ...common, status: z.literal("known") })
const unspecified = z.object({ ...common, status: z.literal("unspecified"), text: InquiryText }).strict()
const policyRule = PolicyRuleSchema.omit({ ...omit, origin: true }).extend(common)
export const LocalUpdateItemSchemas = { rules: rule, sourceBindings: sourceBinding, dependencies: dependency, premiseValues: z.discriminatedUnion("status", [known, unspecified]), policyRules: policyRule }
export type LocalUpdateGroup = keyof typeof LocalUpdateItemSchemas
export const LocalExtractionItemSchemas = {
  rules: rule.omit({ questionId: true, evidenceIds: true }),
  sourceBindings: sourceBinding.omit({ questionId: true, evidenceIds: true }),
  dependencies: dependency.omit({ questionId: true, evidenceIds: true }),
  premiseValues: z.discriminatedUnion("status", [known.omit({ questionId: true }), unspecified.omit({ questionId: true })]),
  policyRules: policyRule.omit({ questionId: true }),
}
export const LocalExtractionSchema = z.object({ itemId: InquiryText, rules: z.array(LocalExtractionItemSchemas.rules).max(64).default([]), sourceBindings: z.array(LocalExtractionItemSchemas.sourceBindings).max(64).default([]), dependencies: z.array(LocalExtractionItemSchemas.dependencies).max(64).default([]), premiseValues: z.array(LocalExtractionItemSchemas.premiseValues).max(64).default([]), policyRules: z.array(LocalExtractionItemSchemas.policyRules).max(64).default([]) }).strict()
const extractionEnvelope = z.object({ itemId: InquiryText, rules: z.array(z.unknown()).max(64).default([]), sourceBindings: z.array(z.unknown()).max(64).default([]), dependencies: z.array(z.unknown()).max(64).default([]), premiseValues: z.array(z.unknown()).max(64).default([]), policyRules: z.array(z.unknown()).max(64).default([]) }).strict()
export const LOCAL_EXTRACTION_GUIDE = [
  "Current local explanation tasks are executable duties: interpret the offered WorkItem using its original sourceWindows and current question/premises. A read/citation alone does not settle its meaning.",
  "Submit controlDelta.localExtractions:[{itemId,rules?,sourceBindings?,dependencies?,premiseValues?,policyRules?}]. Use op:add|replace,targetKey and the semantic fields of the corresponding local group, but OMIT questionId and evidenceIds inside these items: the host binds them to this offered WorkItem and actual current windows. It also supplies binding kind, origins and replacement digest. Keep after/from/parent as explicit current target keys; they express your proposed execution relationship, never lexical equality.",
  "Explain source conditions with the finite typed predicate algebra. Preserve owner=null separately from owner unspecified, missing grants separately from known false, and role exceptions. Check that claim text and typed predicate describe the same source branch before submitting. Source code does not supply a user premise. If a related source cannot be read, declare the dependency and its concrete gap rather than guessing.",
  'Unknown premise entries are optional: normally omit them and keep the corresponding predicate binding unresolved. If submitting status:unspecified, text must be a verbatim span of the current question/premises, including its actual punctuation; do not paraphrase it. Prefer the default per-item update so an unrelated invalid span does not discard useful source interpretation. Request atomic:true only for a change that must succeed as one transaction.',
  'A condition means THIS NODE IS REACHED. For source "if (!allowed) return deny; performEffect()", propose a reject terminal with condition allowed==false and an effect terminal with condition allowed==true on distinct pathKeys. Both conditions use wrapped operands. The effect follows the entry/bindings and any successful control, never the terminating reject. A guard reached on a failing condition cannot authorize its succeeding effect. Include explicit principal/resource binding nodes among the control/effect predecessors; identifying the same object in prose is insufficient.',
  'An entry read does not close its called authorization helpers or upstream endpoint controls. Interpret the entry first, name decisive source dependencies, then interpret their actual windows and link the resulting conditions. Mark a terminal complete only after its relevant reachable controls and dependencies are examined. Policy pathKey must match the actual proposed behavior path, with expected outcome mapped from independent policy rather than source.',
  "Local explanation joins the next ordinary structured/native step. It does not create an extra provider request. You may still use ordinary changed control groups for already shown source outside an offered fragment. Invalid local items remain diagnosed while good siblings are retained, subject to the requested atomic update.",
].join("\n")

export interface LocalExplanationTask {
  itemId: string; question: AuthorizationInquiryProgram["questions"][number]; duty: Pick<WorkItem, "kind" | "question" | "symbol" | "parentId" | "reason">;
  evidenceIds: string[]; callsiteEvidenceIds: string[]; existingTargets: Array<{ key: string; kind: string; pathKey: string; after: string[] }>;
  relatedDuties: Array<{ id: string; kind: string; question: string }>; policy?: AuthorizationInquiryProgram["policy"]; semanticSupport: "unreviewed"
}
/** Mechanically select whole already-read windows; no semantic source compression or provider call. */
export function localExplanationContext(program: AuthorizationInquiryProgram, items: WorkItem[], evidence: InquiryEvidence[], slice: ControlSlice, diagnosticEvidenceIds: string[] = [], recentEvidenceIds = evidence.slice(-2).map(e => e.id)) {
  const tasks: LocalExplanationTask[] = [], seen = new Set<string>(), byQuestion = new Map<string, WorkItem[]>()
  for (const q of program.questions) byQuestion.set(q.id, items.filter(i => i.questionId === q.id && i.evidenceIds.length > 0 && (["awaiting-interpretation", "awaiting-binding"].includes(i.state) || i.state === "awaiting-verification" && i.evidenceIds.some(id => diagnosticEvidenceIds.includes(id))) && (i.origin !== "question-duty" || i.kind === "entry")))
  for (let offset = 0; tasks.length < 2 && offset < items.length; offset++) {
    let found = false
    for (const q of program.questions) {
      const item = byQuestion.get(q.id)?.[offset]
      if (!item || tasks.length >= 2) continue
      const sourceIds = item.evidenceIds.filter(id => evidence.some(e => e.id === id)), key = JSON.stringify([q.id, sourceIds])
      if (!sourceIds.length || seen.has(key)) continue
      seen.add(key); found = true
      tasks.push({ itemId: item.id, question: structuredClone(q), duty: { kind: item.kind, question: item.question, symbol: item.symbol, parentId: item.parentId, reason: item.reason }, evidenceIds: sourceIds, callsiteEvidenceIds: item.callsiteEvidenceIds.filter(id => evidence.some(e => e.id === id)), existingTargets: slice.rules.filter(r => r.questionId === q.id).map(({ key, kind, pathKey, after }) => ({ key, kind, pathKey, after })), relatedDuties: items.filter(i => i.questionId === q.id && i.origin === "question-duty").map(({ id, kind, question }) => ({ id, kind, question })), ...(program.policy ? { policy: structuredClone(program.policy) } : {}), semanticSupport: "unreviewed" })
    }
    if (!found && ![...byQuestion.values()].some(group => group.length > offset + 1)) break
  }
  const ids = new Set([...tasks.flatMap(t => [...t.evidenceIds, ...t.callsiteEvidenceIds]), ...diagnosticEvidenceIds, ...recentEvidenceIds])
  return { tasks, sourceWindows: structuredClone(evidence.filter(e => ids.has(e.id)).map(({ quote: _quote, ...e }) => e)), evidenceCatalog: evidence.map(({ quote: _quote, text: _text, ...e }) => e), instruction: LOCAL_EXTRACTION_GUIDE }
}

export function expandLocalExtractions(input: unknown[], offered: LocalExplanationTask[], items: WorkItem[]) {
  const groups: Record<LocalUpdateGroup, unknown[]> = { rules: [], sourceBindings: [], dependencies: [], premiseValues: [], policyRules: [] }, rejected: UpdateRejection[] = []
  const records: Array<{ itemId: string; questionId?: string; evidenceIds: string[]; raw: unknown; expanded: Record<string, unknown[]>; diagnostics: InquiryDiagnostic[]; semanticSupport: "unreviewed" }> = []
  for (const raw of input) {
    const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}, itemId = String(value.itemId ?? ""), task = offered.find(t => t.itemId === itemId), item = items.find(i => i.id === itemId)
    const expanded: Record<string, unknown[]> = {}, diagnostics: InquiryDiagnostic[] = [], parsed = extractionEnvelope.safeParse(raw)
    const fail = (group: LocalUpdateGroup, targetKey: string, code: string, message: string, suffix = "") => { const d: InquiryDiagnostic = { code, path: `${group}.${task?.question.id ?? item?.questionId ?? ""}.${targetKey}${suffix}`, message, severity: "error" }; diagnostics.push(d); rejected.push({ group, questionId: task?.question.id ?? item?.questionId ?? "", targetKey, diagnostics: [d] }) }
    if (!task) fail("rules", "$local", "local-work-not-offered", "Use an offered current WorkItem; the host cannot bind an invented or stale task.")
    else if (!item || item.code === "source-invalidated") fail("rules", "$local", "local-source-invalidated", "This original window changed or its WorkItem is absent; start a fresh source session.")
    else if (!parsed.success) for (const d of parsed.error.issues) fail("rules", "$local", "local-extraction-schema", d.message, `.${d.path.join(".")}`)
    else for (const group of Object.keys(LocalExtractionItemSchemas) as LocalUpdateGroup[]) for (const [index, candidate] of parsed.data[group].entries()) {
      const checked = LocalExtractionItemSchemas[group].safeParse(candidate), key = String(candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>).targetKey ?? `invalid-${index}` : `invalid-${index}`)
      if (!checked.success) { for (const d of checked.error.issues) fail(group, key, "local-extraction-schema", d.message, `.${d.path.join(".")}`); continue }
      const normalized = { ...checked.data, questionId: task.question.id, ...(["rules", "sourceBindings", "dependencies"].includes(group) ? { evidenceIds: [...new Set([...task.evidenceIds, ...task.callsiteEvidenceIds])] } : {}) }
      groups[group].push(normalized); (expanded[group] ??= []).push(normalized)
    }
    records.push({ itemId, questionId: task?.question.id, evidenceIds: task ? [...task.evidenceIds, ...task.callsiteEvidenceIds] : [], raw: structuredClone(raw), expanded, diagnostics, semanticSupport: "unreviewed" })
  }
  return { groups, rejected, records }
}
