import { expect, test } from "bun:test"
import { executeResourceWorkflow } from "./resource-relations.ts"
import { projectProgramOutcome } from "./program-outcome.ts"
const api: any = await import("./program-outcome.ts").catch(() => ({}))
test("a skipped external branch is structural context rather than an unresolved executed fact", () => {
  const source = { path: "shared.go", startLine: 1, endLine: 8 }
  const workflow: any = { inputs: ["local", "record"], gaps: ["other request paths unreviewed"], steps: [
    { id: "remote", op: "external", name: "fetch", arguments: {}, when: { op: "eq", left: { binding: "local" }, right: { literal: false } }, source },
    { id: "done", op: "return", value: { choose: { test: { op: "truthy", language: "python", value: { binding: "local" } }, then: { ref: "record" }, else: { ref: "remote" } } }, source },
  ] }
  const execution = executeResourceWorkflow(workflow, { local: true, record: 83 })
  const view = projectProgramOutcome({ program: { resourceWorkflow: workflow }, resourceExecution: execution })
  expect(view.execution).toBe("computed")
  expect(view.executionGaps).toEqual([])
  expect(view.coverageGaps).toContain("other request paths unreviewed")
  expect(view.returnBasis?.fields.$return?.kinds).toContain("unexecuted-external-branch")
  expect(view.returnBasis?.fields.$return?.kinds).not.toContain("unresolved-external-fact")
  expect(view.returnBasis?.fields.$return?.dependencies[0]).toMatchObject({ id: "remote", outcome: "skipped" })
  const missing = projectProgramOutcome({ program: { resourceWorkflow: workflow }, resourceExecution: executeResourceWorkflow(workflow, { local: false, record: 83 }) })
  expect(missing.execution).toBe("conditional")
  expect(missing.returnBasis?.fields.$return?.kinds).toContain("unresolved-external-fact")
})
test("return basis separates literal claims, finite selection and external facts with unresolved control", () => {
  const source = { path: "anonymous.py", startLine: 1, endLine: 10 }
  const workflow: any = { inputs: ["rows"], steps: [
    { id: "selected", op: "select", from: "rows", where: { op: "eq", left: { literal: true }, right: { literal: true } }, source },
    { id: "remote", op: "external", name: "initialize", arguments: {}, source },
    { id: "complete", op: "guard", test: { op: "eq", left: { binding: "remote" }, right: { binding: "remote" } }, failure: "not-complete", source },
    { id: "done", op: "return", source, value: { record: { object: { field: { of: { ref: "selected" }, key: "id" } }, framework: { literal: "upstream admission succeeded" }, external: { ref: "remote" } } } },
  ] }
  const execution = executeResourceWorkflow(workflow, { rows: [{ id: 7 }] })
  const view = api.projectProgramOutcome({ program: { resourceWorkflow: workflow, scope: { upstream: ["upstream admission is outside this function"] } }, resourceExecution: execution })
  expect(view.returnBasis.fields.object.kinds).toContain("finite-computation")
  expect(view.returnBasis.fields.object.dependencies.map((d: any) => d.id)).toContain("selected")
  expect(view.returnBasis.fields.framework.kinds).toEqual(["authored-literal"])
  expect(view.returnBasis.fields.framework.semanticSupport).toBe("author-declared-unreviewed")
  expect(view.returnBasis.fields.external.dependencies[0]).toMatchObject({ id: "remote", op: "external", outcome: "unresolved" })
  expect(view.returnBasis.controlDependencies.map((d: any) => d.id)).toContain("complete")
  expect(view.returnBasis.requiredPremises.length).toBeGreaterThan(0)
  expect(view.coverageGaps).toContain("upstream admission is outside this function")
})
test("computed value and unreviewed coverage coexist without certification", () => {
  expect(typeof api.projectProgramOutcome).toBe("function")
  const value = api.projectProgramOutcome({ resourceExecution: { returned: { chosen: 4 }, termination: "return", conditions: [], gaps: ["unwritten other branch"], events: [{ id: "r", op: "return", outcome: "computed", gaps: [] }] }, program: { resourceWorkflow: { gaps: ["unwritten other branch"] } }, obligations: [{ id: "error", state: "unmapped" }] })
  expect(value).toMatchObject({ execution: "computed", value: { chosen: 4 }, semanticSupport: "unreviewed", requestOperationCertified: false })
  expect(value.coverageGaps.length).toBeGreaterThan(0)
})
test("a row binding outside selection remains unresolved instead of losing its basis", () => {
  const source = { path: "anon.py", startLine: 1 }, step = { id: "return", op: "return", source, value: { test: { op: "eq", left: { binding: "row.id" }, right: { literal: 7 } } } }
  const view = api.projectProgramOutcome({ program: { resourceWorkflow: { inputs: [], steps: [step] } }, resourceExecution: { events: [{ id: "return", op: "return", outcome: "unresolved" }] } })
  expect(view.returnBasis.fields.$return.kinds).toContain("unresolved-reference")
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
