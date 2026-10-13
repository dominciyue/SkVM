import { expect, test } from "bun:test"
import { summarizeStudy } from "./summarize.ts"

test("offline matching values and a dispatched unknown never become automatic success or zero-cost evidence", () => {
  const summary = summarizeStudy({ attempts: [{ position: "R0", attempt: "first", status: "unknown", inferenceDispatched: true, answerDelivery: "undelivered", usage: null, providerRequests: null, actualUsd: null, resourceSteps: 0, originalQuestions: 4, lifecycleInspection: { toolExecutions: 0 } }],
    matrix: { providerCalls: 0, variants: 1, historicalRawUnchanged: true, automaticMainChainEvidence: false, results: [{ track: "developer-assisted-binding-only", valuesMatch: true, finiteMachineMatch: false, semanticSupport: "not-certified" }], invariants: [] },
    moved: { providerCalls: 0, results: [{ freshPreviousEqual: true }] }, source: { providerCalls: 0, sourceChanged: true, resourceExecution: {}, S0: { status: "not-run" } }, sharelink: { providerCalls: 0, actualTargetWrites: 0, remainingDuties: ["meaning", "facts"] } })
  expect(summary.automaticMainChainComplete).toBe(false)
  expect(summary.researchGoalAchieved).toBe(false)
  expect(summary.accounting).toMatchObject({ dispatchedAttempts: 1, usage: null, providerRequests: null, actualUsd: null, observedToolUnits: 0 })
  expect(summary.positions.find(p => p.position === "F0")).toMatchObject({ status: "not-run", reason: "original-lifecycle-unresolved" })
  expect(summary.quality.originalQuestions).toHaveLength(4)
  expect(summary.quality.originalQuestions.every(q => q.status === "not-delivered")).toBe(true)
  expect(summary.offline.tracks).toEqual([{ track: "developer-assisted-binding-only", cases: 1, valuesMatch: 1, finiteMachineMatch: 0, automaticEvidence: false }])
  expect(summary.consumptionBenefit).toBe("not-evaluated")
})
