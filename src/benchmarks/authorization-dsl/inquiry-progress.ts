import { createHash } from "node:crypto"
import { canonicalControl } from "../../task-dsl/authorization/control-slice.ts"
/** Advice inside the existing budget. No new dispatch, gate or automatic retry. */
export function createInquiryProgress() {
  let previous = "", repetitions = 0
  return { record(event: { unit: string; input: unknown; state: unknown; diagnostics: unknown }) {
    const diagnostics = Array.isArray(event.diagnostics) ? [...new Set(event.diagnostics.map(d => canonicalControl(d && typeof d === "object" ? { code: d.code ?? d.keyword, path: d.path, questionId: d.questionId, expected: d.expected } : d)))].sort() : event.diagnostics
    const fingerprint = createHash("sha256").update(canonicalControl({ unit: event.unit, state: event.state, diagnostics })).digest("hex")
    repetitions = fingerprint === previous ? repetitions + 1 : 1; previous = fingerprint
    const action = repetitions === 2 ? "repair-once" : repetitions > 2 ? "continue-independent-or-deliver" : "continue"
    return { action, repetitions, fingerprint, instruction: action === "repair-once" ? "The same named gap has no retained source progress. Correct only the diagnosed local field once; preserve accepted source and every original duty." : action === "continue-independent-or-deliver" ? "This local gap still has no retained source progress. Keep its named gap, continue independent source duties or deliver the bounded final within the existing budget." : "Continue from current state; preserve checks and final delivery within the existing budget." }
  } }
}
export function inquiryProgressState(report: any) {
  const drafts = report?.focus?.sourceDrafts ?? []
  const providedValues = (demand: any, requirement: any) => drafts.filter((d: any) => d.interpretation.revision === demand.revision)
    .map((d: any) => [d.handle, structuredClone(requirement.field === "fallthroughOutcome" ? d.interpretation.fallthroughOutcome : d.interpretation.annotations.find((a: any) => a.anchorId === requirement.anchorId)?.[requirement.field])])
    .sort((a: any, b: any) => a[0].localeCompare(b[0]))
  // Reuse the demand's accepted field status; invalid proposals and prose are not progress.
  return { revision: report?.slice?.revision, materials: report?.sourceMaterials?.materials.map((m: any) => [m.id, m.current]), work: report?.worklist?.items?.map((w: any) => [w.id, w.state, w.selected?.id]), focus: report?.focus?.current?.id,
    sourceProgress: report?.propertyAnalysis?.demands.map((d: any) => [d.questionId, d.source.id, d.revision, d.dependencies?.revision, d.required.filter((r: any) => r.status === "provided" || r.status === "unresolved").map((r: any) => [r.anchorId, r.field, r.status, ...(r.status === "provided" ? [providedValues(d, r)] : [])])]) }
}
