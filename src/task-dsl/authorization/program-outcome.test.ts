import { expect, test } from "bun:test"
const api: any = await import("./program-outcome.ts").catch(() => ({}))
test("computed value and unreviewed coverage coexist without certification", () => {
  expect(typeof api.projectProgramOutcome).toBe("function")
  const value = api.projectProgramOutcome({ resourceExecution: { returned: { chosen: 4 }, termination: "return", conditions: [], gaps: ["unwritten other branch"], events: [{ id: "r", op: "return", outcome: "computed", gaps: [] }] }, program: { resourceWorkflow: { gaps: ["unwritten other branch"] } }, obligations: [{ id: "error", state: "unmapped" }] })
  expect(value).toMatchObject({ execution: "computed", value: { chosen: 4 }, semanticSupport: "unreviewed", requestOperationCertified: false })
  expect(value.coverageGaps.length).toBeGreaterThan(0)
})
test("missing actual external premise stays conditional and denial has no value", () => {
  expect(typeof api.projectProgramOutcome).toBe("function")
  expect(api.projectProgramOutcome({ resourceExecution: { returned: 4, termination: "return", conditions: ["external:init"], events: [{ id: "init", outcome: "conditional", gaps: ["external:init"] }] } }).execution).toBe("conditional")
  expect(api.projectProgramOutcome({ resourceExecution: { termination: "invalid-resource", events: [{ op: "guard", outcome: "rejected", gaps: [] }] } })).toMatchObject({ execution: "denied", value: undefined })
})
test("output meaning follows the authored expression and executed assumption rather than preferred field names", () => {
  const expression = { field: { of: { ref: "selected" }, key: "id" } }, source = { path: "anon.py", startLine: 9 }
  const view = api.projectProgramOutcome({ program: { resourceWorkflow: { steps: [{ id: "done", op: "return", value: { record: { arbitrary: expression } }, source }] } }, resourceExecution: { termination: "return", returned: { arbitrary: 9 }, events: [{ id: "init", op: "external", outcome: "computed", inputs: { assumption: { name: "initialize", value: true } }, gaps: [] }, { id: "done", op: "return", outcome: "computed", gaps: [] }] } })
  expect(view.outputFields[0]).toMatchObject({ key: "arbitrary", value: 9, expression, source, meaningOrigin: "author-expression-unreviewed" })
  expect(view.executedAssumptions).toEqual([{ stepId: "init", fact: { name: "initialize", value: true }, origin: "supplied-unreviewed" }])
})
