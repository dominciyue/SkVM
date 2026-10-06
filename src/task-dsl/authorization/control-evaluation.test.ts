import { expect, test } from "bun:test"
const api = await import("./control-evaluation.ts").catch(() => ({} as any))
const eq = (name: string, value: unknown) => ({ op: "eq", left: { binding: name }, right: { literal: value } })
const t = eq("t", true), f = eq("f", true), u = eq("u", true)
test("finite evaluator implements the complete three-valued all/any/not truth tables", () => {
  expect(typeof api.partialEvaluate).toBe("function")
  const values = [{ p: t, v: "true" }, { p: f, v: "false" }, { p: u, v: "unknown" }]
  for (const a of values) {
    expect(api.partialEvaluate({ op: "not", arg: a.p }, { t: true, f: false }).truth).toBe(a.v === "true" ? "false" : a.v === "false" ? "true" : "unknown")
    for (const b of values) {
      expect(api.partialEvaluate({ op: "all", args: [a.p, b.p] }, { t: true, f: false }).truth).toBe(a.v === "false" || b.v === "false" ? "false" : a.v === "unknown" || b.v === "unknown" ? "unknown" : "true")
      expect(api.partialEvaluate({ op: "any", args: [a.p, b.p] }, { t: true, f: false }).truth).toBe(a.v === "true" || b.v === "true" ? "true" : a.v === "unknown" || b.v === "unknown" ? "unknown" : "false")
    }
  }
  expect(api.partialEvaluate({ op: "all", args: [] }, {}).truth).toBe("true")
  expect(api.partialEvaluate({ op: "any", args: [] }, {}).truth).toBe("false")
})
test("explicit null excludes non-null owner while missing, scalar types and residuals remain precise", () => {
  const p = { op: "not", arg: { op: "is-null", value: { binding: "owner" } } }
  expect(api.partialEvaluate(p, { owner: null })).toMatchObject({ truth: "false", residual: null, missingBindings: [] })
  expect(api.partialEvaluate(p, {})).toMatchObject({ truth: "unknown", residual: p, missingBindings: ["owner"] })
  expect(api.partialEvaluate(eq("owner", null), { owner: null }).truth).toBe("true")
  expect(api.partialEvaluate(eq("owner", null), {}).truth).toBe("unknown")
  expect(api.partialEvaluate(eq("n", "1"), { n: 1 }).truth).toBe("false")
  expect(api.partialEvaluate({ ...eq("n", "1"), op: "neq" }, { n: 1 }).truth).toBe("true")
  const reduced = api.partialEvaluate({ op: "all", args: [t, u] }, { t: true })
  expect(reduced.residual).toEqual(u)
  expect(reduced.trace.length).toBeGreaterThan(0)
})
test("short circuits drop irrelevant unknowns, unsupported or over-limit expressions stay unknown", () => {
  expect(api.partialEvaluate({ op: "any", args: [t, u] }, { t: true }).missingBindings).toEqual([])
  expect(api.partialEvaluate({ op: "all", args: [f, u] }, { f: false }).residual).toBeNull()
  let deep: any = t
  for (let n = 0; n < 20; n++) deep = { op: "not", arg: deep }
  for (const p of [deep, { op: "eval", code: "process.exit()" }, { op: "eq", left: { literal: {} }, right: { literal: null } }]) {
    const r = api.partialEvaluate(p, {})
    expect(r.truth).toBe("unknown")
    expect(r.diagnostics.length).toBeGreaterThan(0)
  }
})

test("condition equivalence handles only bounded associative commutative idempotent boolean groups", () => {
  expect(typeof api.equivalentPredicateConditions).toBe("function")
  const left = { op: "all", args: [t, { op: "all", args: [u, t] }] }, right = { op: "all", args: [u, t] }, raw = JSON.stringify(left)
  expect(api.equivalentPredicateConditions(left, right)).toBe(true)
  expect(api.equivalentPredicateConditions({ op: "any", args: [u, u] }, u)).toBe(true)
  expect(api.equivalentPredicateConditions(left, { op: "any", args: [u, t] })).toBe(false)
  expect(api.equivalentPredicateConditions(eq("t", true), eq("t", "true"))).toBe(false)
  expect(JSON.stringify(left)).toBe(raw)
  for (const a of [true, false, undefined]) for (const b of [true, false, undefined]) {
    const bindings = { ...(a === undefined ? {} : { t: a }), ...(b === undefined ? {} : { u: b }) }
    expect(api.partialEvaluate(left, bindings).truth).toBe(api.partialEvaluate(right, bindings).truth)
  }
})
test("condition equivalence does not certify invalid cyclic or over-limit expressions", () => {
  expect(typeof api.equivalentPredicateConditions).toBe("function")
  const cyclic: any = { op: "not" }; cyclic.arg = cyclic
  const wide = { op: "all", args: Array.from({ length: 65 }, () => u) }
  for (const value of [null, cyclic, wide, { op: "custom", code: "true" }]) expect(api.equivalentPredicateConditions(value, value)).toBe(false)
})

test("source truth tests retain Python finite truth and reject non-boolean Go operands", () => {
  const truth = (value: unknown, language = "python") => api.partialEvaluate({ op: "truthy", language, value: { literal: value } }, {})
  for (const value of [0, false, "", null, [], {}]) expect(truth(value).truth).toBe("false")
  for (const value of [1, "x", [0], { a: false }]) expect(truth(value).truth).toBe("true")
  expect(truth(false, "go").truth).toBe("false")
  expect(truth(0, "go")).toMatchObject({ truth: "unknown", diagnostics: ["predicate-type-error"] })
  expect(api.partialEvaluate({ op: "truthy", language: "python", value: { binding: "unspecified" } }, {}).missingBindings).toEqual(["unspecified"])
})
