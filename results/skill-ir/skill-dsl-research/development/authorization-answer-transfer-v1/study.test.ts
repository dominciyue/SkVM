import { expect, test } from "bun:test"
import { admitAttempt, positions, chooseLastRaw, assertRulesPacket, countObservedUsage, consumerDisposition, recordRunError } from "./study.ts"

test("BR admits exactly nine ordered purposes, never inherited BP/BQ positions", () => {
  expect(positions).toEqual(["D-R", "D-E", "A-M", "M0-N", "M0-R", "M0-E", "M1-E", "M1-R", "M1-N"])
  for (const id of ["Q0-R0-0", "S-R1", "T-A0", "T-E", "A0"]) expect(() => admitAttempt([], id, "first")).toThrow()
  expect(() => admitAttempt([], "M0-N", "first")).toThrow()
  expect(() => admitAttempt([], "D-R", "first")).not.toThrow()
})
const closed = (position: string, attempt = "first") => ({ position, attempt, status: "completed", lifecycle: { localExecution: "closed" } })
test("BR retains unknown, active and quota refusals; duplicate requests cannot dispatch", () => {
  for (const e of [{ ...closed("D-R"), status: "unknown" }, { ...closed("D-R"), status: "running" }, { ...closed("D-R"), quotaOrAuth: true }]) expect(() => admitAttempt([e], "D-E", "first")).toThrow()
  expect(() => admitAttempt([closed("D-R")], "D-R", "first")).toThrow()
})
test("four named confirmations are the hard limit, not the inherited six", () => {
  const repairs = [{ position: "D-R", attempt: "fix", cause: "wire", evidence: "red-green.json", uniqueConfirmation: true }]
  expect(() => admitAttempt([closed("D-R")], "D-R", "fix", repairs)).not.toThrow()
  const used = Array.from({ length: 4 }, (_, i) => ({ ...closed("D-R", `fix-${i}`), repairCause: `cause-${i}` }))
  expect(() => admitAttempt([closed("D-R"), ...used], "D-R", "fix", repairs)).toThrow("confirmation-limit")
  expect(() => admitAttempt([closed("D-R")], "D-R", "fix", [])).toThrow()
})
test("selection preserves the last submitted draft even when invalid and worse than active", () => {
  const last = { id: "last", resourceWorkflow: { steps: [{ malformed: true }] } }
  expect(chooseLastRaw({ programDraft: { currentDraft: { raw: last } }, executableContract: { adoptedDraft: { raw: { id: "better" } } } })).toBe(last)
  expect(chooseLastRaw({ executableContract: { adoptedDraft: { raw: { id: "better" } } } })).toBeUndefined()
})
test("rules structure forbids execution metadata but permits user fields with those names", () => {
  expect(() => assertRulesPacket({ ruleDocument: { markdown: 'raw contains "outcome"' }, task: { request: "outcome" }, sourceContext: { developmentScenarioInputs: { outcome: 3 } } })).not.toThrow()
  for (const packet of [{ executableContract: { outcome: {} } }, { toolResult: { execution: {} }, currentContext: {} }, { authoring: { trials: [{}] } }]) expect(() => assertRulesPacket(packet)).toThrow()
})
test("usage counts each observed turn once, cache is included in input", () => {
  const turn = { lifecycle: { threadId: "t", turnId: "u" }, usage: { input: 100, output: 5, cacheRead: 80 } }
  expect(countObservedUsage([turn, turn])).toEqual({ turns: 1, input: 100, output: 5, cacheRead: 80, unknownTurns: 0 })
})
test("unavailable fixed raw closes only its consumer position without dispatch or blocking the next baseline", () => {
  for (const check of [undefined, { status: "invalid", diagnostics: [{ code: "bad-raw" }] }]) {
    const disposition = consumerDisposition(check)
    expect(disposition?.inferenceDispatched).toBe(false)
    expect(() => admitAttempt([{ position: "M1-R", attempt: "first", ...disposition }], "M1-N", "first")).not.toThrow()
  }
  expect(consumerDisposition({ status: "valid" })).toBeUndefined()
})
test("archive extraction errors retain known provider terminal status; unresolved calls stay unknown", () => {
  const known = closed("A-M")
  recordRunError(known, new Error("archive error"))
  expect(known.status).toBe("completed")
  const pending = { status: "running" }
  recordRunError(pending, new Error("transport error"))
  expect(pending.status).toBe("unknown")
})
