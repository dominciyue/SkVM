import { expect, test } from "bun:test"
const api = await import("./study.ts").catch(() => ({} as any))
test("six registered quality positions use one complete task and common account budget", () => {
  expect(api.qualityIds).toEqual(["quality-n-1", "quality-h-1", "quality-d-1", "quality-d-2", "quality-h-2", "quality-n-2"])
  const configurations = api.qualityIds.map((id: string) => api.positionConfiguration(id))
  expect(configurations.map((c: any) => c.strategy)).toEqual(["legacy", "question-guided-v1", "question-checked-v1", "question-checked-v1", "question-guided-v1", "legacy"])
  expect(configurations.every((c: any) => JSON.stringify(c.limits) === JSON.stringify(api.limits))).toBe(true)
  expect(api.qualityReady({ status: "valid", sourceFiles: Array(95).fill({}) }, 22, ["a", "b", "c", "d"])).toBe(true)
})
test("quality fairness rejects old answers, missing questions, unequal budgets and hidden transformations", () => {
  const claim = { inputSha256: "original", originalQuestionIds: ["a", "b", "c", "d"], sourceFiles: [{ path: "app.py", sha256: "s" }], skillIdentity: [{ file: "SKILL.md", sha256: "skill" }], model: "gpt-5.6-sol", effort: "high", limits: { maxToolCalls: 64 }, evaluatorProvidedToRuntime: false, hiddenModelCalls: 0 }
  expect(api.fairnessIssues([claim, { ...claim }])).toEqual([])
  expect(api.fairnessIssues([undefined, undefined]).length).toBeGreaterThan(0)
  for (const change of [{ oldAnswer: "leak" }, { originalQuestionIds: ["a"] }, { limits: { maxToolCalls: 65 } }, { hiddenModelCalls: 1 }, { sourceMeanings: [{}] }]) expect(api.fairnessIssues([claim, { ...claim, ...change }]).length).toBeGreaterThan(0)
})
test("first recoverable D baseline does not require R2 or choose a later stronger result", () => {
  const reports = [{ attemptId: "quality-d-1/original", positionId: "quality-d-1" }, { attemptId: "quality-d-2/original", positionId: "quality-d-2" }]
  const eligibility = new Map(reports.map(r => [r.attemptId, { status: "reusable", info: { layers: { R0: { available: true }, R1: { available: r.positionId.endsWith("2") }, R2: { available: false } } } }]))
  expect(api.firstRecoverableBaseline(reports, eligibility).attemptId).toBe("quality-d-1/original")
})
