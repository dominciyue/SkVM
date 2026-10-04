import { expect, test } from "bun:test"
import { selectNativeRow } from "./native.ts"
test("AT native positions preserve original skill, registered source and shared budgets", () => {
  const task = { id: "paperless-share-create", admission: "eligible", inputFile: "model/inputs/paperless-share-create.json" }
  const row = { id: "native-one", task: task.id, kind: "native", sourceSkill: "original/SKILL.md", method: "D1", strategy: "focused-closure-v1", admission: "eligible", completeSkillAndReferencesRequired: true, originalBriefAndOtherDutiesPreserved: true, totalProviderBudget: 24, totalToolBudget: 48 }
  const manifest = { tasks: [task], rows: [row], budgets: { maxDispatches: 24, maxToolCalls: 48 }, modelInputAllowlist: [task.inputFile] }
  expect(selectNativeRow(manifest, row.id).task).toEqual(task)
  expect(() => selectNativeRow({ ...manifest, rows: [{ ...row, completeSkillAndReferencesRequired: false }] }, row.id)).toThrow("skill")
  expect(() => selectNativeRow({ ...manifest, rows: [{ ...row, totalProviderBudget: 12 }] }, row.id)).toThrow("budget")
})
