import { expect, test } from "bun:test"
const api = await import("./program-consumption-context.ts").catch(() => ({} as any))
test("compact preserves the authored branch rule even when a scenario skips it", () => {
  const rule = { id: "include_hidden", op: "value", value: { test: { op: "not", arg: { op: "is-null", value: { binding: "request.selection" } } } }, when: { op: "truthy", language: "python", value: { binding: "enabled" } }, source: { path: "a.py", startLine: 1 }, because: "Actual source condition" }
  const report = { program: { id: "p", resourceWorkflow: { inputs: ["request"], steps: [rule] } }, resourceExecution: { events: [{ id: rule.id, op: rule.op, outcome: "skipped", outputs: { value: null }, gaps: [] }] } }
  const compact = api.projectProgramConsumption(report, [], "compact")
  expect(compact.rules[0].value).toEqual(rule.value)
  expect(compact.rules[0].when).toEqual(rule.when)
  expect(compact.rules[0].source).toEqual(rule.source)
  expect(api.projectProgramConsumption(report, [], "full")).toBe(report)
})
test("compact consumption preserves current results and gaps while details recover exact events", () => {
  expect(typeof api.projectProgramConsumption).toBe("function")
  const event = { id: "selected", op: "select", outcome: "computed", source: { path: "a.py", startLine: 1, sha256: "current" }, inputs: { candidates: Array(64).fill({ id: 1, large: "x".repeat(300) }) }, outputs: { known: true, value: { id: 1 } }, gaps: [], meaningOrigin: "authored-program" }
  const report = { revision: "p1", program: { id: "p", resourceWorkflow: { inputs: ["rows"], steps: [{ id: "selected", op: "select" }] } }, scope: { questionId: "q", upstream: ["authentication unknown"] }, status: "current", currentDraft: { revision: "d1", raw: { hidden: "x".repeat(1000) } }, drafts: [{ raw: { old: "x".repeat(1000) } }], resourceExecution: { inputs: { rows: event.inputs.candidates }, values: { selected: { id: 1 } }, events: [event], returned: { id: 1 }, conditions: [], gaps: ["storage unknown"], semanticSupport: "unreviewed" } }
  const questions = [{ id: "q", request: "Select" }, { id: "other", request: "Original other duty" }]
  const full = api.projectProgramConsumption(report, questions, "full"), compact = api.projectProgramConsumption(report, questions, "compact")
  expect(full).toEqual(report)
  expect(compact.returned).toEqual(report.resourceExecution.returned)
  expect(compact.gaps).toContain("storage unknown")
  expect(compact.questions[1].resourceStepIds).toEqual([])
  expect(compact.semanticSupport).toBe("unreviewed")
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length / 4)
  expect(api.programConsumptionDetails(report, { stepId: "selected" }).events).toEqual([event])
  expect(api.programConsumptionDetails(report, { questionId: "other" }).events).toEqual([])
  const changed = structuredClone(report); changed.resourceExecution.inputs.rows = []; changed.resourceExecution.returned.id = 2
  expect(api.projectProgramConsumption(changed, questions, "compact").inputRevision).not.toBe(compact.inputRevision)
  const stale = api.projectProgramConsumption({ ...report, status: "invalidated", resourceExecution: undefined }, questions, "compact")
  expect(stale.returned).toBeUndefined()
  expect(stale.status).toBe("invalidated")
})
