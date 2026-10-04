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
test("ordinary skill admission requires the registered native scope and full original skill contract", async () => {
  const native = await import("./native.ts").catch(() => ({} as any))
  const entry = { id: "native-a-original", task: "a", kind: "native", admission: "eligible", method: "D1", strategy: "semantic-flow-v1", sourceSkill: "original/SKILL.md", completeSkillAndReferencesRequired: true, originalBriefAndOtherDutiesPreserved: true, totalProviderBudget: 12, totalToolBudget: 24 }
  const registered = { rows: [entry], tasks: [{ id: "a", admission: "eligible" }] }
  expect(typeof native.selectNativeRow).toBe("function")
  expect(native.selectNativeRow(registered, entry.id)).toEqual(entry)
  expect(() => native.selectNativeRow({ ...registered, tasks: [{ id: "a", admission: "blocked-sealed-logical-task" }] }, entry.id)).toThrow("sealed")
  expect(() => native.selectNativeRow({ ...registered, rows: [{ ...entry, completeSkillAndReferencesRequired: false }] }, entry.id)).toThrow("original skill")
  expect(() => native.selectNativeRow(registered, "renamed")).toThrow("registered")
})
