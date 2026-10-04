import { expect, test } from "bun:test"
import { selectRow } from "./study.ts"
const task = { id: "paperless-share-create", inputFile: "model/inputs/paperless-share-create.json", admission: "eligible" }
const row = { id: "quality-paperless-share-create-D-F", task: task.id, kind: "quality", studyArm: "D-F", method: "D1", strategy: "focused-closure-v1", inputFile: task.inputFile, admission: "eligible" }
const manifest = { tasks: [task], rows: [row], arms: [{ studyArm: "D-F", method: "D1", strategy: "focused-closure-v1" }], modelInputAllowlist: [task.inputFile] }
test("AT selection binds one exact allowed original input and one shared runtime arm", () => {
  expect(selectRow(manifest, row.id).task).toEqual(task)
  expect(() => selectRow({ ...manifest, modelInputAllowlist: ["evaluator/obligations.json"] }, row.id)).toThrow("identity")
  expect(() => selectRow({ ...manifest, rows: [{ ...row, strategy: "legacy" }] }, row.id)).toThrow("identity")
  expect(() => selectRow(manifest, "quality-memos-share-D-F")).toThrow("registered")
})
