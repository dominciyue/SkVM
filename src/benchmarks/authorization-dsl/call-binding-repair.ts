import type { BoundSemanticBlock, SemanticBindingMismatch } from "../../task-dsl/authorization/semantic-flow.ts"
import type { SourceSkeleton } from "./evidence-preparation/source-skeleton.ts"

/** A source-qualified repair demand carries existing interpretations only. It
 * never chooses a role, changes an object identity, or manufactures permission. */
export function callBindingRepairDemands(mismatches: SemanticBindingMismatch[], units: BoundSemanticBlock[], skeletonFor: (sourceId: string, receiverClass?: string) => SourceSkeleton | undefined) {
  return mismatches.map(m => {
    const caller = units.find(u => u.questionId === m.questionId && u.handle === m.caller), callee = units.find(u => u.questionId === m.questionId && u.handle === m.callee)
    const current = (u?: BoundSemanticBlock) => {
      const s = u?.source && skeletonFor(u.source.id, u.receiverClass)
      return s?.modelCovered && u?.source?.sha256 === s.source.sha256 ? s : undefined
    }
    const from = current(caller), to = current(callee), call = from?.anchors.find(a => m.sourceCallId ? a.call?.sourceCallId === m.sourceCallId : m.call === `call-${a.id}`), parameter = to?.anchors.find(a => a.kind === "parameter" && a.name === m.parameter)
    const owner = (u: BoundSemanticBlock | undefined, s: SourceSkeleton | undefined, a: typeof call) => ({ handle: u?.handle ?? "unavailable", source: s?.source ?? u?.source ?? { id: "unavailable", path: "unavailable", sha256: "unavailable", startLine: 0, endLine: 0 }, revision: s?.revision, receiverClass: u?.receiverClass, anchorId: a?.id, text: a?.text, selector: a?.selector })
    return { ...m, state: from && to && call && parameter ? "source-bound" as const : "source-unavailable" as const,
      caller: owner(caller, from, call), callee: owner(callee, to, parameter),
      fields: [{ owner: "caller", anchorId: call?.id, field: "argument-object-provenance" }, { owner: "callee", anchorId: parameter?.id, field: "role" }],
      nextAction: "Read both current source spans. Repair only a source-supported object origin in the caller or an incorrectly interpreted parameter role in the helper. Revisit either retained handle; never promote value merely to match a type." }
  })
}
