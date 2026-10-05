import { test, expect } from "bun:test"
import { selectChangeRow, qualifiesOriginalBase } from "./changes.ts"
const base = { id: "debug-anonymous-D-F", task: "anonymous", kind: "debug", method: "D1", strategy: "focused-closure-v1" }
const row = { id: "anonymous-policy-fresh", task: "anonymous", kind: "variation", baseRow: base.id, change: "policy", route: "fresh", method: "D1", strategy: "focused-closure-v1" }
const manifest = { tasks: [{ id: "anonymous", admission: "eligible" }], rows: [base, row] }
test("fresh changes do not require a full base, but task identity and strategy remain registered", () => {
  expect(selectChangeRow(manifest, row.id)).toEqual(row)
  expect(() => selectChangeRow({ ...manifest, tasks: [{ id: "anonymous", admission: "sealed" }] }, row.id)).toThrow()
  expect(() => selectChangeRow({ ...manifest, rows: [base, { ...row, strategy: "legacy" }] }, row.id)).toThrow()
})
test("previous eligibility requires exact source review and current known checked bounded original", () => {
  const retained = { report: { status: "completed", model: "model", method: "D1", strategy: "focused-closure-v1", validation: { valid: true, questionChecks: [{ evidenceCoverage: "bounded" }] } } }
  const review = { row: base.id, reportSha256: "sha", grade: "full", originalTaskSufficient: true }
  expect(qualifiesOriginalBase(base, retained, "sha", review, "model")).toBe(true)
  expect(qualifiesOriginalBase(base, retained, "sha", { ...review, grade: "partial" }, "model")).toBe(false)
  expect(qualifiesOriginalBase(base, retained, "changed", review, "model")).toBe(false)
  expect(qualifiesOriginalBase(base, { report: { ...retained.report, completionUnknown: true } }, "sha", review, "model")).toBe(false)
  expect(qualifiesOriginalBase(base, retained, "sha", review, "other-model")).toBe(false)
})
