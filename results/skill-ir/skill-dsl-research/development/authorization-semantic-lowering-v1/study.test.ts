import { expect, test } from "bun:test"
const api = await import("./study.ts").catch(() => ({} as any))
const row = { id: "quality-a-D-S", task: "a", kind: "quality", studyArm: "D-S", method: "D1", strategy: "semantic-flow-v1", admission: "eligible", components: ["wire"] }
const manifest = { rows: [row], tasks: [{ id: "a", admission: "eligible" }], arms: [{ studyArm: "D-S", method: "D1", strategy: "semantic-flow-v1" }] }
test("AS admission preserves logical seals despite row names and refuses arm/core asymmetry", () => {
  expect(typeof api.selectQualityRow).toBe("function")
  expect(api.selectQualityRow(manifest, row.id)).toEqual(row)
  expect(() => api.selectQualityRow({ ...manifest, tasks: [{ id: "a", admission: "blocked-sealed-logical-task" }] }, row.id)).toThrow("sealed")
  expect(() => api.selectQualityRow({ ...manifest, rows: [{ ...row, method: "M" }] }, row.id)).toThrow("arm")
  expect(() => api.selectQualityRow(manifest, "renamed-a-D-S")).toThrow("registered")
})
