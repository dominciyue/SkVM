import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const questions = ["requested-document-and-returned-file", "authorization-and-selection-order", "alternate-version-authorized-resource", "missing-facts-and-conditional-conclusions"]
const positions = ["R0", "F0", "F1", "C0", "C1", "C2", "B0", "B1", "S0"]
type Evidence = { attempts: any[]; matrix: any; moved: any; source: any; sharelink: any }
const sumKnown = (values: any[]) => values.some(v => typeof v !== "number") ? null : values.reduce((total, value) => total + value, 0)

/** Evaluation only: summarize observations without upgrading offline evidence. */
export function summarizeStudy({ attempts, matrix, moved, source, sharelink }: Evidence) {
  const unresolved = attempts.some(a => ["running", "unknown", "timeout-unknown", "completion-unknown"].includes(a.status))
  const dispatched = attempts.filter(a => a.inferenceDispatched), allUsage = dispatched.every(a => a.usage != null)
  const delivered = attempts.filter(a => a.answerDelivery === "delivered")
  const tracks = [...new Set<string>(matrix.results.map((r: any) => r.track))].map(track => {
    const rows = matrix.results.filter((r: any) => r.track === track)
    return { track, cases: rows.length, valuesMatch: rows.filter((r: any) => r.valuesMatch).length, finiteMachineMatch: rows.filter((r: any) => r.finiteMachineMatch).length, automaticEvidence: false }
  })
  return {
    identity: "authorization-authoring-loop-v1", status: "completed-with-unmet-criteria", externalDispatch: unresolved ? "paused-unresolved-original-lifecycle" : "no-automatic-dispatch",
    automaticMainChainComplete: false, researchGoalAchieved: false, consumptionBenefit: "not-evaluated",
    positions: positions.map(position => {
      const actual = attempts.filter(a => a.position === position)
      return actual.length ? { position, status: actual.at(-1)!.status, attempts: actual.map(a => ({ attempt: a.attempt, status: a.status, reason: a.reason, terminalStatus: a.terminalStatus, answerDelivery: a.answerDelivery, session: a.session, codeEpoch: a.codeEpoch, resourceSteps: a.resourceSteps })) } : { position, status: "not-run", reason: unresolved ? "original-lifecycle-unresolved" : "no-current-completed-automatic-chain" }
    }),
    quality: { deliveredAnswers: delivered.length, wholeTaskQuality: null, originalQuestions: questions.map(questionId => ({ questionId, status: delivered.length ? "pending-independent-source-review" : "not-delivered", machineComputed: false })), sourceMeanings: "BI raw and binding-only diagnostic leave owner-aware helper, independent empty/explicit versions, ordering and root fallback incomplete; no BJ author adoption was observed" },
    accounting: { dispatchedAttempts: dispatched.length, usage: !allUsage ? null : Object.fromEntries(["input", "output", "cacheRead", "cacheWrite"].map(key => [key, sumKnown(dispatched.map(a => a.usage[key]))])), cacheConvention: "input includes cache; cacheRead/cacheWrite are components and are not added again", providerRequests: sumKnown(dispatched.map(a => a.providerRequests)), actualUsd: sumKnown(dispatched.map(a => a.actualUsd)), observedToolUnits: sumKnown(dispatched.map(a => a.toolUnits ?? a.lifecycleInspection?.toolExecutions)), observedAccountDurationMs: sumKnown(dispatched.map(a => a.durationMs)), hiddenRequests: null, developerAndScoutTokens: null, humanMinutes: null, serverFinalDurationMs: unresolved ? null : sumKnown(dispatched.map(a => a.durationMs)) },
    offline: { providerCalls: matrix.providerCalls, checks: matrix.results.length, variants: matrix.variants, tracks, invariants: matrix.invariants, automaticMainChainEvidence: false, cases: matrix.results.map((r: any) => ({ variant: r.variant, track: r.track, input: r.input, program: r.program, expectedKind: r.expected?.kind, returned: r.actual?.returned, termination: r.actual?.termination, conditions: r.actual?.conditions, firstBlocker: r.firstBlocker, valuesMatch: r.valuesMatch, finiteMachineMatch: r.finiteMachineMatch, semanticSupport: r.semanticSupport })) },
    practical: { moved: { scope: moved.scope, providerCalls: moved.providerCalls, copiedSession: moved.copiedSession, variants: moved.results.length, currentRecomputeEqual: moved.results.every((r: any) => r.freshPreviousEqual), results: moved.results }, sourceChange: { scope: source.scope, providerCalls: source.providerCalls, mutation: source.mutation, sourceChanged: source.sourceChanged, oldReturnWithdrawn: source.resourceExecution?.returned === undefined, programSourceBasis: source.programSourceBasis, S0: source.S0 }, shareLink: { scope: sharelink.scope, providerCalls: sharelink.providerCalls, actualTargetWrites: sharelink.actualTargetWrites, phases: sharelink.phases, termination: sharelink.deniedExecution?.termination, returned: sharelink.deniedExecution?.returned, remainingDuties: sharelink.remainingDuties, originalProgramUnchanged: sharelink.originalProgramUnchanged, originalPolicyPreserved: sharelink.originalPolicyPreserved } },
    remaining: [
      { responsibility: "original R0 lifecycle", state: "completion-unknown", next: "Only inspect the exact original thread/turn when new terminal evidence becomes available; do not resend or create a replacement identity" },
      { responsibility: "fresh author and source meanings", state: "not-confirmed", next: "After the original lifecycle is resolved, use the current shared interface for a named actual confirmation, then the authorized F0/F1 inputs; do not import developer semantics" },
      { responsibility: "frozen automatic consumption and comparison", state: "not-run", next: "Requires an actual selected R0/F0 raw revision before C0/B0/B1/C1; preserve four questions and current conditions" },
      { responsibility: "source-change author repair", state: "S0-not-run", next: "Deterministic invalidation is verified; an actual eligible automatic consumer session is still absent" },
    ],
  }
}

export async function writeStudySummary() {
  const load = async (suffix: string) => JSON.parse(await readFile(path.join(import.meta.dir, suffix), "utf8"))
  const [attempts, matrix, moved, source, sharelink] = await Promise.all([load("attempts.json"), load("evaluation/variation-matrix.json"), load("verification/move-result.json"), load("verification/source-change-result.json"), load("verification/sharelink-result.json")])
  const summary = summarizeStudy({ attempts, matrix, moved, source, sharelink })
  await writeFile(path.join(import.meta.dir, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8")
  return summary
}
if (import.meta.main) console.log(JSON.stringify(await writeStudySummary()))
