import { test, expect } from "bun:test"
import { rowState, infrastructureFailure, nextFailureStreak } from "./row-ledger.ts"
test("unknown reports are terminal while unsettled claims cannot close generation", () => {
  expect(rowState({ status: "completion-unknown" }, true)).toEqual({ status: "completion-unknown", terminal: true })
  expect(rowState(undefined, true)).toEqual({ status: "unsettled-claim", terminal: false })
  expect(rowState(undefined, false)).toEqual({ status: "pending", terminal: false })
})
test("two consecutive infrastructure failures pause dispatch, model diagnostics reset the streak", () => {
  expect(infrastructureFailure({ status: "transport-failed" })).toBe(true)
  expect(infrastructureFailure({ status: "completed-with-diagnostics" })).toBe(false)
  expect(nextFailureStreak(1, { status: "timeout-unknown" })).toBe(2)
  expect(nextFailureStreak(1, { status: "budget-exhausted" })).toBe(0)
})
