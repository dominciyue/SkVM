import { createHash } from "node:crypto"

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex")
export function programDeliveryBasis(parts: { task: unknown; sources: unknown; inputs: unknown; program: unknown; sourceCurrent: boolean }) {
  const components = Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, digest(value)]))
  return { revision: digest(components), components, sourceCurrent: parts.sourceCurrent }
}
export type ProgramDeliveryBasis = ReturnType<typeof programDeliveryBasis>
export type ProgramDeliveryPhase = "task-answer" | "author-edit" | "final-answer"
export interface ProgramAnswerRecord { sequence: number; phase: ProgramDeliveryPhase; answer: unknown; basis: ProgramDeliveryBasis; delivered: boolean }

/** Phase and exact basis determine delivery. No text ranking or keyword tests. */
export function createProgramDelivery() {
  const records: ProgramAnswerRecord[] = []
  return {
    record(record: ProgramAnswerRecord) { records.push(structuredClone(record)) },
    snapshot(current: ProgramDeliveryBasis) {
      const taskAnswers = records.filter(r => r.phase !== "author-edit" && r.delivered)
      const selected = taskAnswers.at(-1), status = !selected ? "missing" : current.sourceCurrent && selected.basis.revision === current.revision ? "current" : "stale"
      return structuredClone({ schemaVersion: "authorization-program-delivery/v1", status, currentBasis: current, firstAnswer: taskAnswers[0], selected, answer: selected?.answer, rawLastAnswer: records.at(-1)?.answer, records, finalDelivered: status === "current", instruction: status === "stale" ? "The retained task answer uses an older basis; no current final answer was delivered. Preserve it with this stale marker, never substitute editing feedback." : status === "missing" ? "No task answer was delivered; raw turn text is diagnostic only." : "Task answer remains current for this recorded basis; semantic support stays unreviewed." })
    },
  }
}
export function decideFinalProgramDelivery(options: { delivery: ReturnType<ReturnType<typeof createProgramDelivery>["snapshot"]>; terminal: string; remainingMs: number; budget: any; finalPhaseUsed: boolean }) {
  const stop = (reason: string) => ({ runFinal: false, reason })
  if (options.delivery.status === "current") return stop("task-answer-current")
  if (options.finalPhaseUsed) return stop("final-phase-already-used")
  if (options.terminal !== "completed") return stop("known-completed-terminal-required")
  if (options.remainingMs <= 0 || !(options.budget?.totalRemaining > 0) || options.budget?.finalOnly || options.budget?.deliveryClosed || options.budget?.formatBudgetExhausted) return stop("final-delivery-budget-exhausted")
  return { runFinal: true, reason: "deliver-current-task-answer" }
}
export const FINAL_PROGRAM_ANSWER_INSTRUCTION = "Authoring is finished. Deliver a complete standalone answer to every original task question in the original skill format, based on the CURRENT program, input and source basis. Include actual remaining conditions, source gaps and unreviewed meanings. Do not merely describe edits or budget. No further source/program actions are requested. This final answer phase shares the original session budget."
