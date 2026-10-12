import { expect, test } from "bun:test"
const api = await import("./resource-relations.ts").catch(() => ({} as any))
const source = { path: "app.py", startLine: 1, endLine: 8, sha256: "current" }
const ref = (name: string) => ({ ref: name })
const field = (name: string, key: string) => ({ field: { of: ref(name), key } })
const eq = (a: string, b: string) => ({ op: "eq", left: { binding: a }, right: { binding: b } })
const program = () => ({ inputs: ["request", "records", "actor"], steps: [
  { id: "requested", op: "select", from: "records", where: eq("row.id", "request.id"), source, because: "Actual request lookup" },
  { id: "found", op: "guard", test: { op: "not", arg: { op: "is-null", value: { binding: "requested" } } }, failure: "not-found", source, because: "Missing request stops" },
  { id: "root_lookup", op: "select", from: "records", where: eq("row.id", "requested.parent"), source, because: "Actual relation lookup" },
  { id: "root", op: "value", value: { coalesce: [ref("root_lookup"), ref("requested")] }, source, because: "Null root lookup falls back" },
  { id: "check", op: "guard", test: eq("actor.id", "root.owner"), principal: ref("actor"), resource: ref("root"), permission: "read", failure: "forbidden", source, because: "Actual owner relation" },
  { id: "returned", op: "return", value: field("requested", "id"), source, because: "Return requested resource after root guard" }
] })
test("unknown control activation keeps subsequent events conditional while invalid returns preserve siblings", () => {
  const raw = { inputs: [], steps: [
    { id: "gate", op: "guard", when: { op: "truthy", language: "python", value: { binding: "missing" } }, test: { op: "eq", left: { literal: 1 }, right: { literal: 2 } }, failure: "denied", source, because: "Unknown activation may reject" },
    { id: "result", op: "return", value: { field: { of: { literal: {} }, key: "x", default: { literal: false } } }, source, because: "Explicit false default" }
  ] }
  const run = api.executeResourceWorkflow(raw, {})
  expect(run.returned).toBe(false)
  expect(run.events.at(-1).outcome).toBe("conditional")
  const stale = api.executeResourceWorkflow({ inputs: [], steps: [raw.steps[1], { id: "sibling", op: "value", value: { literal: 0 }, source, because: "Independent sibling" }] }, {}, { invalidSteps: { result: ["stale"] } })
  expect(stale.values.sibling).toBe(0)
  expect(stale.termination).toBeUndefined()
})
test("skips are recorded and unsupported integer syntax remains unknown", () => {
  const raw = { inputs: [], steps: [
    { id: "skipped", op: "value", value: { ref: "missing" }, when: { op: "eq", left: { literal: 1 }, right: { literal: 2 } }, source, because: "Inactive branch" },
    { id: "integer", op: "value", value: { integer: { literal: "1_000" } }, source, because: "Python form outside bounded decimal support" },
    { id: "guard", op: "guard", test: { op: "eq", left: { literal: 1 }, right: { literal: 1 } }, principal: ref("absent"), failure: "denied", source, because: "Unknown guard identity" }
  ] }
  const run = api.executeResourceWorkflow(raw, {})
  expect(run.events[0].outcome).toBe("skipped")
  expect(run.events).toHaveLength(3)
  expect(run.values.integer).toBeUndefined()
  expect(run.gaps).toContain("integer-unsupported-syntax")
  expect(run.gaps).toContain("absent")
})
test("source-bound resource relations compute selection, fallback, guard object and return with actual events", () => {
  expect(typeof api.executeResourceWorkflow).toBe("function")
  const run = api.executeResourceWorkflow(program(), { request: { id: 2 }, records: [{ id: 2, parent: 1, owner: 7 }, { id: 1, parent: null, owner: 7 }], actor: { id: 7 } })
  expect(run.returned).toBe(2)
  expect(run.values.root.id).toBe(1)
  expect(run.events.find((e: any) => e.id === "check").inputs.resource.id).toBe(1)
  expect(run.events.every((e: any, i: number) => e.sequence === i + 1 && e.executor === "host")).toBe(true)
  const fallback = api.executeResourceWorkflow(program(), { request: { id: 2 }, records: [{ id: 2, parent: 1, owner: 7 }], actor: { id: 7 } })
  expect(fallback.values.root.id).toBe(2)
  expect(fallback.returned).toBe(2)
})
test("rejection stops return, absent facts remain conditional and independent values still compute", () => {
  const input = { request: { id: 2 }, records: [{ id: 2, parent: 1, owner: 7 }], actor: { id: 9 } }
  const denied = api.executeResourceWorkflow(program(), input)
  expect(denied.termination).toBe("forbidden")
  expect(denied.returned).toBeUndefined()
  expect(denied.events.some((e: any) => e.op === "return")).toBe(false)
  const unknown = api.executeResourceWorkflow(program(), { ...input, actor: {} })
  expect(unknown.status).toBe("conditional")
  expect(unknown.returned).toBe(2)
  expect(unknown.gaps).toContain("actor.id")
  expect(unknown.events.at(-1).outcome).toBe("conditional")
  const missing = api.executeResourceWorkflow(program(), { request: { id: 2 }, actor: { id: 7 } })
  expect(missing.values.root).toBeUndefined()
  expect(missing.gaps).toContain("records")
})
test("selectors keep independent arguments, null and empty version semantics and source changes local", () => {
  const raw: any = program(); raw.steps = [
    { id: "present", op: "value", value: { test: { op: "not", arg: { op: "is-null", value: { binding: "request.version" } } } }, source, because: "Presence test" },
    { id: "truthy", op: "value", value: { test: { op: "truthy", language: "python", value: { binding: "request.version" } } }, source, because: "Own selector uses truthiness" },
    { id: "first", op: "select", from: "records", where: { op: "eq", left: { binding: "row.deleted" }, right: { literal: true } }, source, because: "Own true argument" },
    { id: "second", op: "select", from: "records", where: { op: "eq", left: { binding: "row.deleted" }, right: { literal: false } }, source: { ...source, path: "helper.py" }, because: "Own false argument" }
  ]
  for (const [version, present, truthy] of [[null, false, false], ["", true, false], ["2", true, true]]) {
    const run = api.executeResourceWorkflow(raw, { request: { version }, records: [{ id: 1, deleted: true }, { id: 2, deleted: false }] })
    expect(run.values.present).toBe(present); expect(run.values.truthy).toBe(truthy)
    expect(run.values.first.id).toBe(1); expect(run.values.second.id).toBe(2)
  }
  const stale = api.executeResourceWorkflow(raw, { request: { version: "" }, records: [{ id: 1, deleted: true }, { id: 2, deleted: false }] }, { invalidSteps: { second: ["source-stale:helper.py"] } })
  expect(stale.values.first.id).toBe(1); expect(stale.values.second).toBeUndefined()
  expect(stale.gaps).toContain("source-stale:helper.py")
})
test("external assumptions match the current argument objects and cannot become computed permission evidence", () => {
  const raw: any = program(); raw.steps = [{ id: "grant", op: "external", name: "grant-system", arguments: { user: { literal: 7 }, object: { literal: 2 } }, source, because: "External grants not in source" }]
  const run = api.executeResourceWorkflow(raw, {}, { externalAssumptions: [{ name: "grant-system", arguments: { user: 7, object: 2 }, value: false, reason: "Explicit development scenario assumption" }] })
  expect(run.values.grant).toBe(false)
  expect(run.events[0].meaningOrigin).toBe("external-assumption")
  raw.steps[0].arguments.object.literal = 3
  expect(api.executeResourceWorkflow(raw, {}, { externalAssumptions: [{ name: "grant-system", arguments: { user: 7, object: 2 }, value: true, reason: "Other resource" }] }).values.grant).toBeUndefined()
})
test("numeric ordering supports explicit nulls last including negative values", () => {
  const raw = { inputs: ["rows"], steps: [{ id: "newest", op: "select", from: "rows", where: { op: "eq", left: { literal: true }, right: { literal: true } }, unique: false, order: [{ field: "version", direction: "desc", nulls: "last" }, { field: "id", direction: "desc" }], source, because: "Source order_by with nulls_last" }] }
  const run = api.executeResourceWorkflow(raw, { rows: [{ id: 5, version: null }, { id: 2, version: -1 }, { id: 3, version: -1 }] })
  expect(run.values.newest.id).toBe(3)
})
