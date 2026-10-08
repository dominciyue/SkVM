import { expect, test } from "bun:test"
import path from "node:path"

const api = await import("./study.ts").catch(() => ({})) as any

test("BA owns twenty-two stable positions with two native pilots and separate consumption", () => {
  expect(typeof api.positions).toBe("function")
  const rows = api.positions()
  expect(rows).toHaveLength(22)
  expect(new Set(rows.map((p: any) => p.id)).size).toBe(22)
  expect(rows.filter((p: any) => p.kind === "pilot").map((p: any) => [p.id, p.entrance])).toEqual([["pilot-download", "native"], ["pilot-owui", "native"]])
  expect(rows.filter((p: any) => p.kind === "quality")).toHaveLength(12)
  expect(rows.filter((p: any) => p.kind === "consumer").map((p: any) => p.id)).toEqual(["consumer-download-inquiry", "consumer-owui-native"])
  expect(rows.filter((p: any) => p.kind === "change")).toHaveLength(6)
})

test("BA refuses every historical or shared write destination", () => {
  expect(typeof api.assertOwnedPaths).toBe("function")
  expect(() => api.assertOwnedPaths(import.meta.dir, api.runRoot)).not.toThrow()
  for (const name of ["authorization-property-abstraction-v1", "authorization-question-closure-v1"]) {
    expect(() => api.assertOwnedPaths(path.resolve(import.meta.dir, "..", name), api.runRoot)).toThrow("BA output identity")
  }
})

test("original regression extraction preserves the actual guard error and semantic predicate gap", async () => {
  expect(typeof api.extractOriginalRegression).toBe("function")
  const fixture = await api.extractOriginalRegression()
  const repair = fixture.entries.find((e: any) => e.attemptId === "single-download/format-contract-1")
  expect(repair.toolRejections[1].call.arguments.controlDelta.interpretation.annotations[0].role).toBe("guard")
  expect(repair.sourceInterpretations[0].raw.interpretation.annotations[0].role).toBe("condition")
  expect(repair.sourceInterpretations[0].diagnostics.some((d: any) => d.code === "source-interpretation-condition-required")).toBe(true)
  expect(fixture.originalScoresChanged).toBe(false)
  expect(fixture.newInference).toBe(0)
})

test("known routing failure permits one ready real recovery, while quota, auth and unknown remain closed", () => {
  expect(typeof api.classifyAccountChannel).toBe("function")
  const failed = { status: "failed", terminalStatus: "failed", quotaRefused: false, terminalError: { message: "workspace routing discovery failed" } }
  expect(api.classifyAccountChannel(failed, 0).status).toBe("terminal-routing-recovery-eligible")
  expect(api.classifyAccountChannel(failed, 1).status).toBe("paused-recurring-routing")
  expect(api.classifyAccountChannel({ ...failed, quotaRefused: true }, 0).status).toBe("paused-quota")
  expect(api.classifyAccountChannel({ status: "unavailable", reason: "authentication failed" }, 0).status).toBe("paused-auth")
  expect(api.classifyAccountChannel({ status: "completion-unknown" }, 0).status).toBe("completion-unknown")
  const state = { activeAttempts: [], unknownCompletions: [], accountChannel: { status: "terminal-routing-recovery-eligible", recoveriesUsed: 0, terminalStatus: "failed" } }
  expect(() => api.admitDispatch(state, { readyToDispatch: true, terminalVerified: true })).not.toThrow()
  expect(() => api.admitDispatch(state, { readyToDispatch: false, terminalVerified: true })).toThrow("ready")
  expect(() => api.admitDispatch({ ...state, unknownCompletions: ["unsettled"] }, { readyToDispatch: true, terminalVerified: true })).toThrow("unknown")
  expect(() => api.admitDispatch({ ...state, accountChannel: { ...state.accountChannel, recoveriesUsed: 1 } }, { readyToDispatch: true, terminalVerified: true })).toThrow("recovery")
})

test("quality M and D compile the same original facts and keep author packages separate", async () => {
  expect(typeof api.buildTaskFacts).toBe("function")
  const original = { taskId: "task", repository: "anonymous", sourceRef: "r", sourceRoot: "source", allowedPaths: ["app.py"], brief: "Inspect entry. Explain both resource versions. State missing facts.", mode: "behavior" }
  const facts = api.buildTaskFacts(original)
  expect(facts.originalBrief).toBe(original.brief)
  expect(facts.inquiry.questions[0].request).toBe(original.brief)
  expect(facts.requirements.map((r: any) => r.text).join(" ")).toBe(original.brief)
  const m = await api.dryRun("quality-download-M-repeat-1"), d = await api.dryRun("quality-download-D-repeat-1"), n = await api.dryRun("quality-download-N-repeat-1")
  expect(m.inputFile).toBe(d.inputFile)
  expect(m.authorAttempt).toBeUndefined(); expect(d.authorAttempt).toBeUndefined()
  expect(m.strategy).toBe(d.strategy); expect(m.method).toBe("M"); expect(d.method).toBe("D1")
  expect(n.domainTools).toBe(false)
  expect((await api.dryRun("consumer-download-inquiry")).authorAttempt).toBeDefined()
})
