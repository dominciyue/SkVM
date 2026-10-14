import { expect, test } from "bun:test"
import { executeResourceWorkflow } from "./resource-relations.ts"
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
test("anonymous guarded workflow preserves initialization before owner short circuit and stops invalid resources", () => {
  const source = { path: "anonymous.py", startLine: 1, endLine: 20 }, truth = (name: string) => ({ op: "truthy", language: "python", value: { binding: name } })
  const workflow: any = { inputs: ["owner", "parseable", "sameFamily", "chosen"], steps: [
    { id: "init", op: "external", name: "initialize", arguments: {}, source },
    { id: "initialized", op: "guard", test: truth("init"), failure: "initialization-failed", source },
    { id: "grant", op: "external", name: "allow", arguments: {}, when: { op: "not", arg: truth("owner") }, source },
    { id: "access", op: "guard", test: { op: "any", args: [truth("owner"), truth("grant")] }, failure: "denied", source },
    { id: "syntax", op: "guard", test: truth("parseable"), failure: "invalid-resource", source },
    { id: "relation", op: "guard", test: truth("sameFamily"), failure: "foreign-resource", source },
    { id: "file", op: "return", value: { ref: "chosen" }, source },
  ] }
  const facts = { owner: true, parseable: true, sameFamily: true, chosen: 23 }
  const assumptions = [{ name: "initialize", arguments: {}, value: true, reason: "Finite initialization assumption" }]
  const allowed = executeResourceWorkflow(workflow, facts, { externalAssumptions: assumptions })
  expect(allowed.returned).toBe(23)
  expect(allowed.events.find(e => e.id === "grant")?.outcome).toBe("skipped")
  expect(api.projectProgramOutcome({ resourceExecution: allowed }).execution).toBe("computed")
  const missing = executeResourceWorkflow(workflow, facts)
  expect(api.projectProgramOutcome({ resourceExecution: missing }).execution).toBe("conditional")
  expect(missing.conditions.length + missing.gaps.length).toBeGreaterThan(0)
  for (const [key, termination] of [["parseable", "invalid-resource"], ["sameFamily", "foreign-resource"]] as const) {
    const denied = executeResourceWorkflow(workflow, { ...facts, [key]: false }, { externalAssumptions: assumptions })
    expect(denied.termination).toBe(termination)
    expect(denied.returned).toBeUndefined()
    expect(denied.events.some(e => e.id === "file")).toBe(false)
  }
})
