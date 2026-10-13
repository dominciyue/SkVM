import { expect, test } from "bun:test"
import { measureAuthorTimeline, classifyTerminalReport, observedAccountCost } from "./measurement.ts"

test("timeline measures actual units and keeps an invalid proposal separate from old active execution", () => {
  const execution = { termination: "return", returned: { artifact: 23 }, conditions: ["permission remains unknown"], gaps: [], events: [{ id: "result" }] }
  const run = { status: "completed", answerDelivery: "delivered", native: { history: [
    { call: { name: "source_read", arguments: { path: "app.py", startLine: 1, endLine: 8 } }, output: { toolBudget: { totalUsed: 4 } } },
    { call: { name: "authorization_program" }, output: { toolBudget: { totalUsed: 9 }, currentDraft: { revision: "bad" }, currentDraftDiagnostics: [{ severity: "error", code: "shape" }], executableContract: { revision: "old", resourceExecution: execution } } },
    { call: { name: "authorization_program_patch" }, output: { toolBudget: { totalUsed: 11 }, currentDraft: { revision: "new" }, candidate: { revision: "new", adopted: true, diagnostics: [], resourceExecution: execution }, executableContract: { revision: "new", resourceExecution: execution } } },
  ] }, domain: { executableContract: { revision: "new", resourceExecution: execution } } }
  const measured = measureAuthorTimeline(run)
  expect(measured.firstProgramAttemptToolUnit).toBe(9)
  expect(measured.firstValidDraftToolUnit).toBe(11)
  expect(measured.firstExecutionToolUnit).toBe(11)
  expect(measured.timeline[1]!.execution).toBeUndefined()
  expect(measured.timeline[2]!.execution?.returned).toEqual({ artifact: 23 })
  expect(measured.machine.status).toBe("conditional")
  expect(measured.natural).toEqual({ delivery: "delivered", semanticReview: "pending" })
})

test("a restored draft first patched in this run is not reported as a program tool call", () => {
  const run = { status: "partial", answerDelivery: "delivered", native: { history: [{ call: { name: "authorization_program_patch" }, output: { toolBudget: { totalUsed: 2 }, currentDraft: { revision: "r" }, candidate: { revision: "r", adopted: true, diagnostics: [] } } }] }, domain: { programDraft: { restoredDraftRevision: "prior" } } }
  const measured = measureAuthorTimeline(run)
  expect(measured.firstProgramAttemptToolUnit).toBeNull()
  expect(measured.firstProposalToolUnit).toBe(2)
  expect(measured.restoredDraftRevision).toBe("prior")
  expect(measured.machine.status).toBe("not-computed")
})

test("known terminal error objects trigger channel policy while unknown completion remains unresolved", () => {
  expect(classifyTerminalReport({ status: "failed", telemetry: { account: { terminalError: { message: "Routing failure: unavailable destination" } } } })).toMatchObject({ routingFailure: true, quotaOrAuth: false, status: "failed" })
  expect(classifyTerminalReport({ status: "failed", telemetry: { account: { reason: "account-turn-failed", terminalError: { message: "Routing failure: unavailable destination" } } } })).toMatchObject({ reason: "account-turn-failed", routingFailure: true })
  expect(classifyTerminalReport({ status: "failed", telemetry: { account: { terminalError: { message: "authentication expired" } } } })).toMatchObject({ quotaOrAuth: true })
  expect(classifyTerminalReport({ status: "timeout-unknown" })).toMatchObject({ status: "unknown", routingFailure: false })
})

test("unexposed provider requests and prices remain null after an actual dispatched unknown attempt", () => {
  const cost = observedAccountCost({ telemetry: { account: { inferenceDispatched: true, usage: null, providerRequests: null, actualUsd: null } } })
  expect(cost).toEqual({ inferenceDispatched: true, usage: null, providerRequests: null, actualUsd: null })
  expect(observedAccountCost({ telemetry: { account: { usage: { input: 10, cacheRead: 4, output: 3, cacheWrite: 0 } } } }).usage).toEqual({ input: 10, cacheRead: 4, output: 3, cacheWrite: 0 })
})
