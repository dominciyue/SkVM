import { expect, test } from "bun:test"
const api = await import("./pilot-reference.ts").catch(() => ({})) as any

test("a pilot reference requires the complete same-epoch dispatched input and deduplicates the same attempt", () => {
  const claim = { attemptId: "pilot-download/repair", entrance: "native", inputSha256: "input", originalTaskSha256: "original", runtimeTree: "epoch", model: "model", effort: "high", method: "M", strategy: "v7", limits: { tools: 64 }, sourceFiles: [{ path: "app.py", sha256: "source" }], skillIdentity: [{ file: "SKILL.md", sha256: "skill" }] }
  const report = { attemptId: claim.attemptId, status: "completed", terminalStatus: "completed", answerDelivery: "delivered", finalPresent: true, inputSha256: "input", runtimeTree: "epoch", method: claim.method, strategy: claim.strategy, actualModelInput: { fullOriginalBundlePrefixMatches: true, originalQuestionTextPresent: true } }
  expect(typeof api.assertPilotReference).toBe("function")
  expect(() => api.assertPilotReference(claim, report, claim)).not.toThrow()
  for (const changed of [{ runtimeTree: "old" }, { inputSha256: "other" }, { originalTaskSha256: "changed-task" }, { entrance: "inquiry" }, { method: "D1" }, { model: "different" }, { effort: "low" }, { limits: { tools: 65 } }, { sourceFiles: [] }, { skillIdentity: [] }]) expect(() => api.assertPilotReference(claim, report, { ...claim, ...changed })).toThrow("Pilot reference")
  expect(() => api.assertPilotReference(claim, { ...report, status: "completion-unknown" }, claim)).toThrow("Pilot reference")
  expect(() => api.assertPilotReference(claim, { ...report, attemptId: "foreign/original" }, claim)).toThrow("Pilot reference")
  expect(() => api.assertPilotReference(claim, { ...report, actualModelInput: null }, claim)).toThrow("Pilot reference")
  expect(() => api.assertPilotReference(claim, { ...report, method: "D1" }, claim)).toThrow("Pilot reference")
  expect(() => api.assertPilotReference(claim, { ...report, strategy: "v6" }, claim)).toThrow("Pilot reference")
})

test("a new-epoch M reference preserves its original observation and requires a named new pilot", () => {
  const first = { attemptId: "pilot-download/original" }, quality = { id: "quality-download-M", kind: "quality", arm: "M", task: "download", attempts: [first.attemptId], reference: first }
  const next = { attemptId: "pilot-download/source-order-marker-1" }
  expect(typeof api.recordPilotReference).toBe("function")
  const recorded = api.recordPilotReference(quality, next, "source-order-marker-1")
  expect(quality.attempts).toEqual([first.attemptId])
  expect(recorded.attempts).toEqual([first.attemptId, next.attemptId])
  expect(recorded.referenceHistory).toEqual([first, next])
  expect(recorded.reference).toEqual(next)
  expect(() => api.recordPilotReference(quality, next)).toThrow("named")
  expect(() => api.recordPilotReference(recorded, next, "source-order-marker-1")).toThrow("new pilot")
  expect(() => api.recordPilotReference(quality, { attemptId: "pilot-owui/source-order-marker-1" }, "source-order-marker-1")).toThrow("matching pilot")
  expect(() => api.recordPilotReference({ ...quality, arm: "D" }, next, "source-order-marker-1")).toThrow("M quality")
})
