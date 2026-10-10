import { createHash } from "node:crypto"
import { canonicalControl } from "../../task-dsl/authorization/control-slice.ts"
import type { PropertyDemand, PropertyRequirement } from "../../task-dsl/authorization/property-demand.ts"
import type { SourceEditDraft } from "../../task-dsl/authorization/source-edit.ts"

export interface SemanticCompletionOwner {
  questionId: string; operationId: string; handle: string; sourceId: string; sourceRevision: string;
  receiverClass?: string; callInstanceId?: string; dependencyRevision: string;
  demand: PropertyDemand; draft?: SourceEditDraft;
  callBindings?: Array<{ anchorId: string; callInstanceId: string; parameter: string; reason: string; basis: unknown }>;
}
export interface SemanticCompletionItem {
  key: string; questionId: string; operationId: string; handle: string; sourceId: string; sourceRevision: string;
  receiverClass?: string; callInstanceId?: string; anchorId: string;
  field: PropertyRequirement["field"] | "propertyBindings" | "call-binding";
  state: "pending" | "offered" | "resolved" | "residual" | "stale";
  reason: string; unchangedAttempts: number; fieldBasis: string; dependencyRevision: string;
}
/** Prose revisions are not retained semantic progress. */
export function completionMeaning(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(completionMeaning)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !["explanation", "claim", "reason"].includes(key)).map(([key, part]) => [key, completionMeaning(part)]))
  return value
}
const hash = (value: unknown) => createHash("sha256").update(canonicalControl(value)).digest("hex")
/** Pure reconciliation from current demands and source-qualified owners only. */
export function reconcileSemanticCompletion(previous: SemanticCompletionItem[], owners: SemanticCompletionOwner[]): SemanticCompletionItem[] {
  const old = new Map(previous.map(i => [i.key, i])), current: SemanticCompletionItem[] = []
  for (const owner of owners) {
    const requirements: Array<Pick<PropertyRequirement, "anchorId" | "status" | "reason" | "expectedRole"> & { field: SemanticCompletionItem["field"]; callInstanceId?: string; parameter?: string; basis?: unknown }> = [...owner.demand.required,
      ...(owner.callBindings ?? []).map(binding => ({ ...binding, field: "call-binding" as const, status: "invalid" as const }))]
    const queries = owner.demand.dependencies?.propertyQueries?.queries ?? []
    const queryOwners = owners.filter(o => o.questionId === owner.questionId && o.operationId === owner.operationId).flatMap(o => o.demand.dependencies?.propertyQueries?.queries ?? [])
    if (queries.length) requirements.push({ anchorId: owner.sourceId, field: "propertyBindings", status: queries.every(q => queryOwners.filter(other => other.id === q.id && other.state === "bound").length === 1) ? "provided" : "missing", reason: "Bind this original question's declared properties once across current source owners; another question's binding or duplicate bindings are not substitutes." })
    for (const requirement of requirements) {
      const { anchorId, field, status } = requirement
      const callInstanceId = requirement.callInstanceId ?? owner.callInstanceId
      const key = `completion-${hash([owner.questionId, owner.operationId, owner.sourceId, owner.sourceRevision, owner.handle, owner.receiverClass, callInstanceId, anchorId, field, requirement.expectedRole, requirement.parameter]).slice(0, 24)}`
      const value = field === "call-binding" ? requirement.basis : field === "propertyBindings" ? owner.draft?.propertyBindings : field === "fallthroughOutcome" ? owner.draft?.fallthroughOutcome : owner.draft?.annotations.find(a => a.anchorId === anchorId)?.[field as keyof SourceEditDraft["annotations"][number]]
      const fieldBasis = hash([status, completionMeaning(value)]), prior = old.get(key)
      const unchanged = prior?.fieldBasis === fieldBasis && prior.dependencyRevision === owner.dependencyRevision && prior.state !== "stale"
      const state = status === "provided" ? "resolved" : status === "unresolved" ? "residual" : unchanged && prior?.state === "residual" ? "residual" : unchanged && prior?.state === "offered" ? "offered" : "pending"
      current.push({ key, questionId: owner.questionId, operationId: owner.operationId, handle: owner.handle, sourceId: owner.sourceId, sourceRevision: owner.sourceRevision, receiverClass: owner.receiverClass, callInstanceId, anchorId, field, state,
        reason: status === "unresolved" ? owner.draft?.unresolved.find(u => u.anchorId === anchorId)?.reason ?? requirement.reason : state === "residual" ? prior!.reason : requirement.reason,
        unchangedAttempts: unchanged ? prior!.unchangedAttempts : 0, fieldBasis, dependencyRevision: owner.dependencyRevision })
    }
  }
  const live = new Set(current.map(i => i.key))
  return [...current, ...previous.filter(i => !live.has(i.key)).map(i => {
    const ownerCurrent = owners.some(o => o.questionId === i.questionId && o.handle === i.handle && o.sourceId === i.sourceId && o.sourceRevision === i.sourceRevision && o.receiverClass === i.receiverClass)
    return { ...i, state: i.field === "call-binding" && ownerCurrent ? "resolved" as const : "stale" as const, reason: i.field === "call-binding" && ownerCurrent ? "The current actual/formal binding diagnostic no longer contains this conflict." : "The source revision, owner or current property demand changed; this old responsibility is historical." }
  })]
}
/** Exactly one model feedback advances counters; rendering/reconciliation does not. */
export function recordSemanticCompletionFeedback(previous: SemanticCompletionItem[], offeredKeys: string[], owners: SemanticCompletionOwner[]): SemanticCompletionItem[] {
  const offered = new Set(offeredKeys), old = new Map(previous.map(i => [i.key, i]))
  return reconcileSemanticCompletion(previous, owners).map(item => {
    if (!offered.has(item.key) || item.state === "resolved" || item.state === "stale" || item.state === "residual") return item
    const prior = old.get(item.key), unchanged = prior?.fieldBasis === item.fieldBasis && prior.dependencyRevision === item.dependencyRevision
    const unchangedAttempts = unchanged ? prior.unchangedAttempts + 1 : 0
    return { ...item, unchangedAttempts, state: unchangedAttempts >= 2 ? "residual" : "pending", ...(unchangedAttempts >= 2 ? { reason: `semantic-completion-no-progress: ${item.field} at ${item.anchorId} has two feedbacks without retained semantic progress. ${item.reason}` } : {}) }
  })
}
