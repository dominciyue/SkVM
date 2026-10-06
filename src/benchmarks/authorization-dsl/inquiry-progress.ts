import { createHash } from "node:crypto"
import { canonicalControl } from "../../task-dsl/authorization/control-slice.ts"
/** Advice inside the existing budget. No new dispatch, gate or automatic retry. */
export function createInquiryProgress() {
  let previous = "", repetitions = 0
  return { record(event: { unit: string; input: unknown; state: unknown; diagnostics: unknown }) {
    const fingerprint = createHash("sha256").update(canonicalControl(event)).digest("hex")
    repetitions = fingerprint === previous ? repetitions + 1 : 1; previous = fingerprint
    const action = repetitions === 2 ? "repair-once" : repetitions > 2 ? "continue-independent-or-deliver" : "continue"
    return { action, repetitions, fingerprint, instruction: action === "repair-once" ? "The same proposal has not changed current state. Correct only the diagnosed local field once; preserve accepted source and every original duty." : action === "continue-independent-or-deliver" ? "This local proposal is still unchanged. Keep its named gap, continue independent source duties or deliver the bounded final within the existing budget." : "Continue from current state; preserve checks and final delivery within the existing budget." }
  } }
}
export function inquiryProgressState(report: any) {
  return { revision: report?.slice?.revision, materials: report?.sourceMaterials?.materials.map((m: any) => [m.id, m.current]), work: report?.worklist?.items?.map((w: any) => [w.id, w.state, w.selected?.id]), focus: report?.focus?.current?.id }
}
