import { expect, test } from "bun:test"
import { admitPurpose, positionOptions, verifyPairBinding, observedUsageSummary, summarizeMatrix } from "./study.ts"
import { readFileSync } from "node:fs"

test("published matrix summary preserves evaluated semantic counts rather than literal shape", () => {
  const matrix = JSON.parse(readFileSync(new URL("./evaluation/selected/variation-matrix.json", import.meta.url), "utf8"))
  expect(summarizeMatrix(matrix)).toMatchObject({ variants: 14, exactShapeFiniteMatches: 0, semanticValueMatches: 7, semanticFiniteMatches: 5 })
})

test("report retains unknown usage and treats cache as included input", () => {
  expect(observedUsageSummary([{ position: "A0", attempt: "first", inferenceDispatched: true, usage: { input: 100, output: 10, cacheRead: 80 } }, { position: "C0", attempt: "first", inferenceDispatched: true }])).toEqual({ knownUsage: { input: 100, output: 10, cacheRead: 80 }, usageUnknownAttempts: ["C0/first"], cacheIncludedInInput: true, actualUsd: null, providerRequests: null })
})
test("observed partial usage remains an unknown final cost after interruption", () => {
  expect(observedUsageSummary([{ position: "C2", attempt: "first", status: "unknown", inferenceDispatched: true, usage: { input: 100, output: 10, cacheRead: 80 }, reconciliation: { terminalStatus: "interrupted", finalUsageUnknown: true } }]).usageUnknownAttempts).toEqual(["C2/first"])
})

test("a quarantined historical unknown is local to its old attempt", () => {
  const observation = { terminal: "unknown", localExecution: "closed", reconciliation: "unavailable", channel: "available", nextPurpose: "independent-task", independentAuthorized: true } as const
  expect(admitPurpose([], observation).allowNewTurn).toBe(true)
  expect(admitPurpose([{ status: "running" }], observation).allowNewTurn).toBe(false)
  expect(admitPurpose([{ quotaOrAuth: true }], observation).action).toBe("pause-channel")
  expect(admitPurpose([{ transportFailure: true }, { transportFailure: true }], observation).action).toBe("pause-channel")
})
test("paired consumption compares actual facts source skill budget and code while allowing separate purpose", () => {
  const entry = { model: "gpt-5.6-sol", effort: "high", inputSha256: "facts", limits: { maxToolCalls: 64 }, codeEpoch: { commit: "a", sourceTree: "code", sourceDiffSha256: "clean" }, binding: { source: "source", skill: "skill", accountBoundary: "boundary" } }
  expect(() => verifyPairBinding(entry, { ...entry, position: "B0" })).not.toThrow()
  for (const key of ["model", "effort", "inputSha256", "limits", "binding"]) expect(() => verifyPairBinding(entry, { ...entry, [key]: "changed" })).toThrow("pair-binding-mismatch")
  expect(() => verifyPairBinding(entry, { ...entry, codeEpoch: { ...entry.codeEpoch, sourceTree: "new-code" } })).toThrow("pair-binding-mismatch")
})
test("fresh author has no prior or reference program and pair order uses matching facts", () => {
  expect(positionOptions("A0")).toEqual({ author: true, baseline: false, variant: "root-default" })
  expect(positionOptions("C0").variant).toBe(positionOptions("B0").variant)
  expect(positionOptions("C1").variant).toBe(positionOptions("B1").variant)
  expect(positionOptions("C2").variant).toBe("denied")
  expect(() => positionOptions("R0")).toThrow()
})
