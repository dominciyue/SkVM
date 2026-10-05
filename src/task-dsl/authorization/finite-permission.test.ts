import { expect, test } from "bun:test"
import { partialEvaluate } from "./control-evaluation.ts"
import { createControlSlice, mergeControlSlice, controlBindings } from "./control-slice.ts"
import { compileAuthorizationInquiry } from "./inquiry-program.ts"
const lit = (value: unknown) => ({ literal: value }), binding = (name: string) => ({ binding: name })
const lookup = (name: string, key: string) => ({ lookup: { map: binding(name), key: lit(key) } })
test("finite permission lookup distinguishes absent keys, explicit null and unknown maps", () => {
  const p = { op: "is-null", value: lookup("grants", "document") }
  expect(partialEvaluate(p, { grants: { document: null } } as any).truth).toBe("true")
  expect(partialEvaluate(p, { grants: {} } as any).diagnostics).toContain("value-key-missing")
  expect(partialEvaluate(p, {})).toMatchObject({ truth: "unknown", residual: p, missingBindings: ["grants"] })
  expect(partialEvaluate({ op: "has-key", map: binding("grants"), key: lit("document") }, { grants: {} } as any).truth).toBe("false")
})
test("set membership and explicit permission order have no invented role hierarchy", () => {
  expect(partialEvaluate({ op: "member", value: lit("view"), set: binding("grants") }, { grants: ["view", "change"] } as any).truth).toBe("true")
  const p = { op: "gte", left: lookup("units", "issues"), right: lit("write"), order: ["none", "read", "write", "admin"] }
  expect(partialEvaluate(p, { units: { issues: "read" } } as any).truth).toBe("false")
  expect(partialEvaluate(p, { units: { issues: "write" } } as any).truth).toBe("true")
  expect(partialEvaluate({ ...p, order: ["admin", "write", "read", "none"] }, { units: { issues: "read" } } as any).truth).toBe("true")
  expect(partialEvaluate({ ...p, order: undefined }, { units: { issues: "read" } } as any).diagnostics.length).toBeGreaterThan(0)
})
test("type errors are distinct from residual unknowns and ordered comparisons never coerce", () => {
  expect(partialEvaluate({ op: "gte", left: lit(3), right: lit(2) }, {}).truth).toBe("true")
  expect(partialEvaluate({ op: "gte", left: lit("3"), right: lit(2) }, {}).diagnostics).toContain("predicate-type-error")
  expect(partialEvaluate({ op: "member", value: lit("view"), set: lit("view") }, {}).diagnostics).toContain("predicate-type-error")
  expect(partialEvaluate({ op: "eq", left: lookup("units", "issues"), right: lit("write") }, {}).missingBindings).toEqual(["units"])
})
test("short circuit avoids evaluating later typed errors and irrelevant missing values", () => {
  const error = { op: "member", value: lit("view"), set: lit(false) }
  const r = partialEvaluate({ op: "any", args: [{ op: "eq", left: lit(1), right: lit(1) }, error] }, {})
  expect(r.truth).toBe("true")
  expect(r.diagnostics).toEqual([])
  expect(r.trace.map(t => t.op)).toEqual(["eq", "any"])
})
test("finite user collections retain exact premise provenance through the shared control store", () => {
  const text = "User grants are view and change; issue unit mode is read."
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: text, premises: [] }] })
  const merged = mergeControlSlice(createControlSlice(), { schemaVersion: "authorization-control-slice/v1", bindings: [{ questionId: "q", key: "grants", value: ["view", "change"], origin: "user", text }, { questionId: "q", key: "units", value: { issues: "read" }, origin: "user", text }] }, program, { questionIds: ["q"], shownEvidenceIds: [] })
  expect(merged.diagnostics).toEqual([])
  expect(partialEvaluate({ op: "member", value: lit("view"), set: binding("grants") }, controlBindings(merged.state, "q")).truth).toBe("true")
  const bad = mergeControlSlice(merged.state, { schemaVersion: "authorization-control-slice/v1", bindings: [{ questionId: "q", key: "other", value: ["admin"], origin: "user", text: "source says admin" }] }, program, { questionIds: ["q"], shownEvidenceIds: [] })
  expect(bad.diagnostics.some(d => d.code === "premise-not-supplied")).toBe(true)
})
