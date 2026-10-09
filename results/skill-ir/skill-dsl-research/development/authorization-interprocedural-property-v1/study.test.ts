import { expect, test } from "bun:test"
import path from "node:path"
const api = await import("./study.ts").catch(() => ({})) as any

test("BB registers sixteen pending positions without counting revisions as new samples", () => {
  expect(typeof api.positions).toBe("function")
  const rows = api.positions()
  expect(rows).toHaveLength(16)
  expect(new Set(rows.map((r: any) => r.id)).size).toBe(16)
  expect(rows.filter((r: any) => r.kind === "quality")).toHaveLength(6)
  expect(rows.filter((r: any) => r.kind === "change")).toHaveLength(6)
  expect(rows.every((r: any) => r.status === "registered-not-run" && r.attempts.length === 0)).toBe(true)
})
test("BB writes only its own identity", () => {
  expect(typeof api.assertOwnedPaths).toBe("function")
  expect(() => api.assertOwnedPaths(import.meta.dir, api.runRoot)).not.toThrow()
  expect(() => api.assertOwnedPaths(path.resolve(import.meta.dir, "../authorization-semantic-submission-v1"), api.runRoot)).toThrow("BB output identity")
})
test("BB extracts exact BA interpretations and original counts without rewriting history", async () => {
  expect(typeof api.extractOriginalRegression).toBe("function")
  const fixture = await api.extractOriginalRegression()
  expect(fixture.entries.map((r: any) => r.attemptId)).toEqual(["pilot-download/transaction-priority-1", "pilot-owui/original"])
  expect(fixture.entries.map((r: any) => r.original.materialUses)).toEqual([1, 0])
  expect(fixture.entries.map((r: any) => r.original.materials)).toEqual([7, 5])
  expect(fixture.modelCalls).toBe(0)
  expect(fixture.originalFilesChanged).toBe(false)
  expect(fixture.entries.every((r: any) => r.program && r.sourceDrafts.length && Array.isArray(r.checkHistory))).toBe(true)
})

const counters = { status: "available", consecutiveRoutingFailures: 0, cumulativeRoutingFailures: 0, recoveryAttempts: 0 }
const routing = { status: "failed", terminalStatus: "failed", terminalError: { message: "workspace routing discovery failed" } }
test("BB real success resets only consecutive routing failures", () => {
  const failed = api.classifyAccountChannel(routing, { ...counters, consecutiveRoutingFailures: 1, cumulativeRoutingFailures: 1 })
  expect(failed.status).toBe("paused-recurring-routing")
  const success = api.classifyAccountChannel({ status: "completed", terminalStatus: "completed" }, failed)
  expect(success.consecutiveRoutingFailures).toBe(0)
  expect(success.cumulativeRoutingFailures).toBe(2)
  expect(api.classifyAccountChannel(routing, success).status).toBe("paused-recurring-routing")
})
test("BB two consecutive routing terminals pause; one is recoverable", () => {
  const first = api.classifyAccountChannel(routing, counters)
  expect(first.status).toBe("terminal-routing-recovery-eligible")
  expect(api.classifyAccountChannel(routing, first).status).toBe("paused-recurring-routing")
})
test("BB the third registered recovery that still routes to failure pauses", () => {
  expect(api.classifyAccountChannel(routing, { ...counters, recoveryAttempts: 3 }).status).toBe("paused-recurring-routing")
})
test("BB quota, authentication and unknown completion do not admit retry", () => {
  for (const account of [{ status: "failed", quotaRefused: true }, { status: "failed", reason: "authentication required" }, { status: "completion-unknown" }]) {
    const channel = api.classifyAccountChannel(account, counters)
    expect(() => api.admitDispatch({ activeAttempts: [], unknownCompletions: [], accountChannel: channel }, { readyToDispatch: true, terminalVerified: true })).toThrow()
  }
})
test("BB inherited and current routing reentry need a ready task and verified terminal", () => {
  const state = { activeAttempts: [], unknownCompletions: [], accountChannel: { ...counters, status: "inherited-terminal-reentry-eligible", parentAttempt: "BA/last" } }
  expect(() => api.admitDispatch(state, { readyToDispatch: true, terminalVerified: false })).toThrow("terminal")
  expect(() => api.admitDispatch(state, { readyToDispatch: false, terminalVerified: true })).toThrow("ready")
  expect(api.admitDispatch(state, { readyToDispatch: true, terminalVerified: true }).recovery).toBe(true)
  expect(() => api.admitDispatch({ ...state, activeAttempts: ["BB/current"] }, { readyToDispatch: true, terminalVerified: true })).toThrow("active/unknown")
})
test("BB claims preserve first attempt and use a new named revision", () => {
  expect(() => api.assertAttemptClaim([], undefined)).not.toThrow()
  expect(() => api.assertAttemptClaim(["pilot/original"], undefined)).toThrow()
  expect(() => api.assertAttemptClaim([], "repair-1")).toThrow()
  expect(() => api.assertAttemptClaim(["pilot/original", "pilot/repair-1"], "repair-1")).toThrow()
  expect(() => api.assertAttemptClaim(["pilot/original"], "repair-1")).not.toThrow()
})
test("BB pilot and M/D use the same complete task facts; N remains natural", async () => {
  for (const task of ["download", "owui"]) {
    const pilot = await api.dryRun(`pilot-${task}`), m = await api.dryRun(`quality-${task}-M`), d = await api.dryRun(`quality-${task}-D`), n = await api.dryRun(`quality-${task}-N`)
    expect(pilot.inputFile).toBe(m.inputFile)
    expect(m.inputFile).toBe(d.inputFile)
    expect(m.strategy).toBe("operation-evidence-v7")
    expect(n.domainTools).toBe(false)
    expect(n.strategy).toBe("legacy")
  }
})
