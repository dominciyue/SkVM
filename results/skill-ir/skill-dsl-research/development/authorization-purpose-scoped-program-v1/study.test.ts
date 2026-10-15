import { test, expect } from "bun:test"
import { executeResourceWorkflow } from "../../../../../src/task-dsl/authorization/resource-relations.ts"
const api: any = await import("./behavior-assessment.ts").catch(() => ({}))
const source = { path: "anonymous.py", startLine: 1, endLine: 20 }
const truth = (name: string) => ({ op: "truthy", language: "python", value: { binding: name } })
const workflow: any = { inputs: ["owner", "syntax", "family", "chosen"], steps: [
  { id: "init", op: "external", name: "init", arguments: {}, source },
  { id: "initialized", op: "guard", test: truth("init"), failure: "init-failed", source },
  { id: "check", op: "external", name: "check", arguments: {}, when: { op: "not", arg: truth("owner") }, source },
  { id: "access", op: "guard", test: { op: "any", args: [truth("owner"), truth("check")] }, failure: "denied", source },
  { id: "parse", op: "guard", test: truth("syntax"), failure: "invalid", source },
  { id: "relation", op: "guard", test: truth("family"), failure: "foreign", source },
  { id: "file", op: "return", value: { ref: "chosen" }, source },
] }
const facts = { owner: true, syntax: true, family: true, chosen: 23 }
const assumptions = (grant = true) => [{ name: "init", arguments: {}, value: true, reason: "finite fact" }, { name: "check", arguments: {}, value: grant, reason: "finite fact" }]
test("strict trace rejects a correct value with unconditional extra check or absent initialization", () => {
  expect(typeof api.assessBehaviorTrace).toBe("function")
  const expected = { calls: [{ name: "init", arguments: {} }], termination: "return", returned: 23, conditional: false }
  const good = executeResourceWorkflow(workflow, facts, { externalAssumptions: assumptions() })
  expect(api.assessBehaviorTrace(good, expected).pass).toBe(true)
  expect(api.assessBehaviorTrace({ ...good, gaps: ["author coverage remains unreviewed"] }, expected).pass).toBe(true)
  const bad = structuredClone(workflow); delete bad.steps[2].when
  expect(api.assessBehaviorTrace(executeResourceWorkflow(bad, facts, { externalAssumptions: assumptions() }), expected).pass).toBe(false)
  const missing = structuredClone(workflow); missing.steps.splice(0, 2)
  expect(api.assessBehaviorTrace(executeResourceWorkflow(missing, facts, { externalAssumptions: assumptions() }), expected).pass).toBe(false)
})
test("strict trace checks ordered exact calls, missing facts and rejection without later actions", () => {
  expect(typeof api.assessBehaviorTrace).toBe("function")
  const calls = [{ name: "init", arguments: {} }, { name: "check", arguments: {} }]
  const run = (f: any, grant = true) => executeResourceWorkflow(workflow, f, { externalAssumptions: assumptions(grant) })
  expect(api.assessBehaviorTrace(run({ ...facts, owner: false }), { calls, termination: "return", returned: 23, conditional: false }).pass).toBe(true)
  expect(api.assessBehaviorTrace(run({ ...facts, owner: false }, false), { calls, rejected: true, conditional: false }).pass).toBe(true)
  for (const key of ["syntax", "family"]) expect(api.assessBehaviorTrace(run({ ...facts, [key]: false }), { calls: [calls[0]], rejected: true, conditional: false }).pass).toBe(true)
  const denied = run({ ...facts, syntax: false })
  const fabricated = { ...denied, events: [...denied.events, { op: "return", outcome: "computed", inputs: {}, outputs: { value: 23 } }] }
  expect(api.assessBehaviorTrace(fabricated, { calls: [calls[0]], rejected: true }).pass).toBe(false)
  expect(api.assessBehaviorTrace(executeResourceWorkflow(workflow, facts), { calls: [calls[0]], termination: "return", returned: 23, conditional: true }).pass).toBe(true)
  expect(api.assessBehaviorTrace(run({ ...facts, owner: false }), { calls: calls.toReversed(), termination: "return" }).pass).toBe(false)
  expect(api.assessBehaviorTrace(run({ ...facts, owner: false }), { calls: [{ name: "init", arguments: { wrong: 1 } }, calls[1]] }).pass).toBe(false)
})
test("an unresolved required initializer needs an actual control condition, not an unused gap", () => {
  const missing = executeResourceWorkflow(workflow, facts)
  const expected = { calls: [{ name: "init", arguments: {} }], conditional: true, requiredConditionCalls: ["init"] }
  expect(api.assessBehaviorTrace(missing, expected).pass).toBe(true)
  const unused = { ...missing, conditions: [] }
  expect(api.assessBehaviorTrace(unused, expected).pass).toBe(false)
  const rejected = executeResourceWorkflow(workflow, { ...facts, syntax: false }, { externalAssumptions: assumptions() })
  for (const op of ["select", "value", "external", "return"]) expect(api.assessBehaviorTrace({ ...rejected, events: [...rejected.events, { id: "late", op, outcome: "computed", inputs: {} }] }, { calls: expected.calls, rejected: true }).pass).toBe(false)
})
test("source-derived call expectations distinguish owner null-owner and exact root permission", () => {
  expect(typeof api.downloadTraceExpectation).toBe("function")
  const base = { actor: { id: 7 }, request: { pk: 23, version: null }, documents: [{ id: 23, root_document_id: null, owner_id: 7 }] }
  const init = { name: "ObjectPermissionChecker.construct", arguments: { user: 7 } }
  expect(api.downloadTraceExpectation(base, []).calls).toEqual([init])
  const f = structuredClone(base); f.documents[0]!.owner_id = null as any
  expect(api.downloadTraceExpectation(f, []).calls).toEqual([init])
  f.documents[0]!.owner_id = 8
  expect(api.downloadTraceExpectation(f, []).calls).toEqual([init, { name: "ObjectPermissionChecker.has_perm", arguments: { user: 7, resource: 23, permission: "view_document" } }])
  expect(api.downloadTraceExpectation(f, []).requiredConditionCalls).toContain(init.name)
  expect(api.downloadTraceExpectation({ ...f, actor: null }, []).calls).toEqual([])
})
test("anonymous null-owner and exact non-owner calls execute through short circuit guards", () => {
  const copy = structuredClone(workflow)
  const shortcut = { op: "any", args: [{ op: "is-null", value: { binding: "owner" } }, { op: "eq", left: { binding: "owner" }, right: { literal: 7 } }] }
  copy.steps[2].when = { op: "not", arg: shortcut }
  copy.steps[2].arguments = { user: { literal: 7 }, resource: { literal: 23 }, permission: { literal: "read" } }
  copy.steps[3].test = { op: "any", args: [shortcut, truth("check")] }
  const exact = { name: "check", arguments: { user: 7, resource: 23, permission: "read" } }
  const given = [{ name: "init", arguments: {}, value: true, reason: "finite completion" }, { ...exact, value: true, reason: "finite grant" }]
  for (const owner of [7, null]) {
    const executed = executeResourceWorkflow(copy, { ...facts, owner }, { externalAssumptions: given })
    expect(api.assessBehaviorTrace(executed, { calls: [{ name: "init", arguments: {} }], returned: 23, conditional: false }).pass).toBe(true)
  }
  const executed = executeResourceWorkflow(copy, { ...facts, owner: 8 }, { externalAssumptions: given })
  expect(api.assessBehaviorTrace(executed, { calls: [{ name: "init", arguments: {} }, exact], returned: 23, conditional: false }).pass).toBe(true)
  expect(api.assessBehaviorTrace(executed, { calls: [{ name: "init", arguments: {} }, { ...exact, arguments: { ...exact.arguments, resource: 99 } }] }).pass).toBe(false)
})
test("anonymous selection keeps nulls last, tie ordering and root fallback; wrong programs fail", () => {
  const select: any = { inputs: ["rows", "root"], steps: [
    { id: "latest", op: "select", from: "rows", where: { op: "eq", left: { binding: "row.parent" }, right: { binding: "root.id" } }, unique: false, order: [{ field: "version", direction: "desc", nulls: "last" }, { field: "id", direction: "desc" }], source },
    { id: "result", op: "return", value: { choose: { test: { op: "is-null", value: { binding: "latest" } }, then: { ref: "root" }, else: { ref: "latest" } } }, source },
  ] }
  const rows = [{ id: 99, parent: 23, version: null }, { id: 24, parent: 23, version: 1 }, { id: 25, parent: 23, version: 1 }], root = { id: 23 }
  expect(api.assessBehaviorTrace(executeResourceWorkflow(select, { rows, root }), { calls: [], returned: rows[2], conditional: false }).pass).toBe(true)
  expect(api.assessBehaviorTrace(executeResourceWorkflow(select, { rows: [], root }), { calls: [], returned: root, conditional: false }).pass).toBe(true)
  const bad = structuredClone(select); bad.steps[0].order[0].nulls = "first"
  expect(api.assessBehaviorTrace(executeResourceWorkflow(bad, { rows, root }), { calls: [], returned: rows[2] }).pass).toBe(false)
})
