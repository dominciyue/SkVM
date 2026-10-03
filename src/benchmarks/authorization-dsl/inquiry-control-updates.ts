import { z } from "zod"
import { InquiryText, type InquiryDiagnostic } from "../../task-dsl/authorization/inquiry.ts"
import { mergeControlSlice, type ControlSlice } from "../../task-dsl/authorization/control-slice.ts"
import type { AuthorizationInquiryProgram } from "../../task-dsl/authorization/inquiry-program.ts"
import type { InquiryEvidenceContext } from "../../task-dsl/authorization/inquiry-result.ts"

import { LocalUpdateItemSchemas as itemSchemas, LocalExtractionSchema, normalizeNewEntry } from "./inquiry-local-extraction.ts"
const { rules: rule, sourceBindings: sourceBinding, dependencies: dependency, premiseValues: premiseValue, policyRules: policyRule } = itemSchemas
type Group = keyof typeof itemSchemas
export const ControlWithdrawalSchema = z.object({ group: z.enum(["rules", "sourceBindings", "dependencies", "premiseValues", "policyRules"]), questionId: InquiryText, targetKey: rule.shape.targetKey, reason: InquiryText }).strict()
export const WorkSelectionSchema = z.object({ questionId: InquiryText, itemId: InquiryText, candidateId: InquiryText }).strict()
const metadata = { schemaVersion: z.literal("authorization-control-update/v1"), baseRevision: z.number().int().nonnegative().optional(), atomic: z.boolean().default(false) }
/** The full advertised contract; each item is checked by the host so one malformed item cannot erase unrelated valid work. */
export const LocalControlDeltaSchema = z.object({ ...metadata, rules: z.array(rule).max(1024).default([]), sourceBindings: z.array(sourceBinding).max(1024).default([]), dependencies: z.array(dependency).max(1024).default([]), premiseValues: z.array(premiseValue).max(1024).default([]), policyRules: z.array(policyRule).max(256).default([]), withdrawals: z.array(ControlWithdrawalSchema).max(64).default([]), workSelections: z.array(WorkSelectionSchema).max(64).default([]), localExtractions: z.array(LocalExtractionSchema).max(16).default([]) }).strict()
export const LocalControlEnvelopeSchema = z.object({ ...metadata, rules: z.array(z.unknown()).max(1024).default([]), sourceBindings: z.array(z.unknown()).max(1024).default([]), dependencies: z.array(z.unknown()).max(1024).default([]), premiseValues: z.array(z.unknown()).max(1024).default([]), policyRules: z.array(z.unknown()).max(256).default([]), withdrawals: z.array(z.unknown()).max(64).default([]), workSelections: z.array(z.unknown()).max(64).default([]), localExtractions: z.array(z.unknown()).max(16).default([]) }).strict()
export const LOCAL_CONTROL_GUIDE = [
  'guided-evidence-v2 local interface: controlDelta is {schemaVersion:"authorization-control-update/v1",rules:[],sourceBindings:[],dependencies:[],premiseValues:[],policyRules:[],atomic?:false,baseRevision?:current revision}. Submit just changed items, not the entire graph.',
  "Each item has op:add|replace, questionId, targetKey. Replace names the current same-question target; a model reason is optional for ordinary items, and the host records explicit replacement provenance and revisionOf. Dependency reason remains required to explain source relevance. baseRevision detects a stale view. atomic:true applies the whole group or none. Rejected items and their dependent gaps remain visible; correct only diagnosed items.",
  "To abandon a malformed UNACCEPTED draft, submit withdrawals:[{group:rules|sourceBindings|dependencies|premiseValues|policyRules,questionId,targetKey,reason}]. This retires only that exact draft's current rejection, preserving its original proposal and the withdrawal reason. It never deletes an accepted target, another group's error, source invalidation or missing predecessor/dependency gaps. Failed atomic updates apply no withdrawals. Renaming a draft alone does not withdraw it.",
  "rules are entry/guard/reject/continue/effect with pathKey,after,evidenceIds,claim and optional finite condition/principal/resource/operation/authorizedBy/complete. sourceBindings are source identities with pathKey,after,evidenceIds,claim,bindingKey,bindingKind; the host sets kind:binding. A source identity is never a user value.",
  "A new entry with omitted after declares a root (after:[]). Explicit entry predecessors stay unchanged. Replacements and all other rule kinds require after; a missing predecessor must never be guessed. Final observations may be omitted when there are no additional observations.",
  "premiseValues are explicit user facts: {op,questionId,targetKey,status:known,value,text:<exact original user span>} or {op,questionId,targetKey,status:unspecified,text}. Unspecified has NO value field; it does not mean null or false. Omit unspecified items if no update is needed. Policy mappings stay in policyRules, with expected,text,location and optional condition; the host sets origin:policy.",
  "For a shown ambiguous WorkItem submit workSelections:[{questionId,itemId,candidateId}] using its shown candidate ID. This is a lexical read choice, not an authorization fact or a closed-state declaration. Atomic applies to the control update groups; location choices are separate read intents.",
].join("\n")
const diagnostic = (code: string, at: string, message: string): InquiryDiagnostic => ({ code, path: at, message, severity: "error" })
type Identity = { group: Group; questionId: string; targetKey: string }
export interface UpdateAcceptance extends Identity { status: "changed" | "unchanged" | "kept-unknown" }
export interface UpdateRejection extends Identity { diagnostics: InquiryDiagnostic[]; localEnvelope?: true }
export interface UpdateWithdrawal extends Identity { reason: string; diagnostics: InquiryDiagnostic[] }
const sameTarget = (a: Identity, b: Identity) => a.group === b.group && a.questionId === b.questionId && a.targetKey === b.targetKey
function unresolvedLinks(state: ControlSlice, rejected: UpdateRejection[]) {
  const output: Array<{ group: "rules" | "dependencies"; questionId: string; targetKey: string; rejectedTarget: string; code: string }> = []
  const ruleMissing = (q: string, key: string) => !state.rules.some(r => r.questionId === q && r.key === key) || rejected.some(p => p.questionId === q && p.targetKey === key && ["rules", "sourceBindings"].includes(p.group))
  for (const r of state.rules) for (const key of r.after.filter(key => ruleMissing(r.questionId, key))) output.push({ group: "rules", questionId: r.questionId, targetKey: r.key, rejectedTarget: key, code: "control-predecessor-unresolved" })
  for (const d of state.dependencies) {
    const refs = [d.from, ...(d.after ?? [])].filter(key => ruleMissing(d.questionId, key))
    if (d.parent && (!state.dependencies.some(p => p.questionId === d.questionId && p.key === d.parent) || rejected.some(p => p.group === "dependencies" && p.questionId === d.questionId && p.targetKey === d.parent))) refs.push(d.parent)
    for (const key of new Set(refs)) output.push({ group: "dependencies", questionId: d.questionId, targetKey: d.key, rejectedTarget: key, code: "control-dependency-unresolved" })
  }
  return output
}
export function applyControlUpdates(previous: ControlSlice, input: unknown, program: AuthorizationInquiryProgram, context: InquiryEvidenceContext & { suppliedUserText?: string[] }, initialRejections: UpdateRejection[] = [], priorRejections: UpdateRejection[] = []) {
  const parsed = LocalControlEnvelopeSchema.safeParse(input), accepted: UpdateAcceptance[] = [], rejected: UpdateRejection[] = [...initialRejections], withdrawn: UpdateWithdrawal[] = [], withdrawalRejected: UpdateRejection[] = []
  let state = structuredClone(previous)
  if (!parsed.success) return { state, accepted, withdrawn, withdrawalRejected, currentRejections: [...priorRejections], envelopeValid: false, rejected: [{ group: "rules" as const, questionId: "", targetKey: "$", diagnostics: parsed.error.issues.map(i => diagnostic("control-update-schema", i.path.join("."), i.message)) }], unresolved: [] }
  for (const group of Object.keys(itemSchemas) as Group[]) for (const [index, raw] of parsed.data[group].entries()) {
    const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}, identity = { group, questionId: String(value.questionId ?? ""), targetKey: String(value.targetKey ?? `invalid-${index}`) }
    const at = `${group}.${identity.questionId}.${identity.targetKey}`, checked = itemSchemas[group].safeParse(group === "rules" ? normalizeNewEntry(raw) : raw), errors: InquiryDiagnostic[] = []
    if (!checked.success) { rejected.push({ ...identity, diagnostics: checked.error.issues.map(i => diagnostic("control-update-schema", `${at}.${i.path.join(".")}`, i.message)) }); continue }
    const item: any = checked.data, targetGroup = group === "sourceBindings" ? "rules" : group === "premiseValues" ? "bindings" : group
    const existing = state[targetGroup].find(v => v.questionId === item.questionId && v.key === item.targetKey)
    const sameGroup = !existing || targetGroup !== "rules" || (group === "sourceBindings") === ((existing as { kind?: string }).kind === "binding")
    const old = sameGroup ? existing : undefined
    if (!sameGroup) errors.push(diagnostic("control-target-group", at, "This same-named target belongs to another local group; use a distinct key or its actual group."))
    if (parsed.data.baseRevision !== undefined && parsed.data.baseRevision !== previous.revision) errors.push(diagnostic("stale-control-revision", at, `Expected revision ${parsed.data.baseRevision}; current revision is ${previous.revision}. Inspect current targets before replacing.`))
    if (item.op === "replace" && !old) errors.push(diagnostic("control-target-missing", at, "Replacement requires an existing target in this question and group."))
    const revisionReason = item.reason ?? "host:explicit-local-replacement"
    if (group === "premiseValues" && item.status === "unspecified") {
      const q = program.questions.find(q => q.id === item.questionId), supplied = context.suppliedUserText ?? (q ? [q.request, ...q.premises.map(p => p.text)] : [])
      if (!q || !context.questionIds.includes(item.questionId)) errors.push(diagnostic("unknown-question", at, "Question is not declared."))
      if (!supplied.some(t => t.includes(item.text))) errors.push(diagnostic("premise-not-supplied", at, "Unspecified values must also quote the original user task."))
      if (old && item.op !== "replace") errors.push(diagnostic("control-target-exists", at, "An existing known value needs an explicit replacement to become unspecified."))
      if (errors.length) { rejected.push({ ...identity, diagnostics: errors }); continue }
      if (old) { state.bindings = state.bindings.filter(v => v.id !== old.id); state.revision++; state.revisions.push({ id: old.id, previous: old, accepted: { status: "unspecified", text: item.text }, reason: revisionReason }) }
      accepted.push({ ...identity, status: "kept-unknown" }); continue
    }
    if (errors.length) { rejected.push({ ...identity, diagnostics: errors }); continue }
    const { op, targetKey, reason, status: _status, ...content } = item
    const normalized = { ...content, key: targetKey, ...(group === "dependencies" ? { reason } : {}), ...(group === "sourceBindings" ? { kind: "binding" } : {}), ...(group === "premiseValues" ? { origin: "user" } : {}), ...(group === "policyRules" ? { origin: "policy" } : {}), ...(op === "replace" ? { revisionOf: old!.digest, revisionReason } : {}) }
    const merged = mergeControlSlice(state, { schemaVersion: "authorization-control-slice/v1", [targetGroup]: [normalized] }, program, context)
    if (merged.diagnostics.length) { rejected.push({ ...identity, diagnostics: merged.diagnostics.map(d => ({ ...d, path: at + "." + d.path })) }); continue }
    const changed = merged.state.revision !== state.revision; state = merged.state
    accepted.push({ ...identity, status: changed ? "changed" : "unchanged" })
  }
  const reconcile = () => priorRejections.filter(p => !accepted.some(a => sameTarget(a, p)) && !rejected.some(r => sameTarget(r, p))).concat(rejected)
  let currentRejections = reconcile()
  for (const [index, raw] of parsed.data.withdrawals.entries()) {
    const parsedWithdrawal = ControlWithdrawalSchema.safeParse(raw)
    if (!parsedWithdrawal.success) {
      const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
      withdrawalRejected.push({ group: "rules", questionId: String(value.questionId ?? ""), targetKey: String(value.targetKey ?? `invalid-${index}`), diagnostics: parsedWithdrawal.error.issues.map(i => diagnostic("withdrawal-schema", `withdrawals.${index}.${i.path.join(".")}`, i.message)) }); continue
    }
    const item = parsedWithdrawal.data, at = `withdrawals.${item.group}.${item.questionId}.${item.targetKey}`, errors: InquiryDiagnostic[] = []
    const targetGroup = item.group === "sourceBindings" ? "rules" : item.group === "premiseValues" ? "bindings" : item.group
    if (!context.questionIds.includes(item.questionId) || !program.questions.some(q => q.id === item.questionId)) errors.push(diagnostic("unknown-question", at, "Withdrawal must name a current question."))
    if (parsed.data.baseRevision !== undefined && parsed.data.baseRevision !== previous.revision) errors.push(diagnostic("stale-control-revision", at, "Inspect current targets before withdrawing from a stale revision."))
    if ([previous, state].some(s => s[targetGroup].some(v => v.questionId === item.questionId && v.key === item.targetKey))) errors.push(diagnostic("withdrawal-target-accepted", at, "An accepted target cannot be withdrawn. Correct it with an explicit replacement."))
    const drafts = currentRejections.filter(p => sameTarget(p, item) && !p.localEnvelope)
    if (!drafts.length) errors.push(diagnostic("withdrawal-target-missing", at, "No current unaccepted draft rejection exists in this question and group."))
    if (errors.length) { withdrawalRejected.push({ ...item, diagnostics: errors }); continue }
    withdrawn.push({ ...item, diagnostics: drafts.flatMap(p => p.diagnostics) })
    currentRejections = currentRejections.filter(p => !drafts.includes(p))
  }
  let unresolved = unresolvedLinks(state, currentRejections), attemptUnresolved: typeof unresolved = []
  if (parsed.data.atomic && (rejected.length || withdrawalRejected.length || unresolved.length)) {
    const cause = diagnostic("atomic-control-rejected", "$", "One or more local items or predecessor links were rejected; the entire atomic update was rolled back.")
    rejected.push(...accepted.map(a => ({ group: a.group, questionId: a.questionId, targetKey: a.targetKey, diagnostics: [cause] }))); accepted.length = 0; withdrawn.length = 0; state = structuredClone(previous)
    currentRejections = reconcile()
    attemptUnresolved = unresolved; unresolved = unresolvedLinks(state, [])
  }
  return { state, accepted, rejected, withdrawn, withdrawalRejected, currentRejections, unresolved, attemptUnresolved, pendingSelections: parsed.data.workSelections, envelopeValid: true }
}
