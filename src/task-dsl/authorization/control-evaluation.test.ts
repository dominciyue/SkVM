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
