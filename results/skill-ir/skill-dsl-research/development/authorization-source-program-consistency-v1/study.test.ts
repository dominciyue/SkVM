import { expect, test } from "bun:test"
import { admitAttempt, normalizeFields } from "./study.ts"
test("finite queue admits only ordered known closed purposes and counts paired repair attempts", () => {
  expect(() => admitAttempt([], "T-E", "first")).toThrow()
  expect(() => admitAttempt([], "T-R", "first")).not.toThrow()
  const closed = { position: "T-R", attempt: "first", status: "delivered", lifecycle: { localExecution: "closed" } }
  expect(() => admitAttempt([closed], "T-E", "first")).not.toThrow()
  for (const status of ["running", "unknown"]) expect(() => admitAttempt([{ ...closed, status }], "T-E", "first")).toThrow()
  expect(() => admitAttempt([{ ...closed, quotaOrAuth: true }], "T-E", "first")).toThrow()
  const repair = { position: "T-R", attempt: "repair-1", cause: "shared", evidence: "red-green", uniqueConfirmation: true }
  expect(() => admitAttempt([closed], "T-R", "repair-1", [repair])).not.toThrow()
  expect(() => admitAttempt([closed, ...[1,2,3].map(i => ({ ...closed, position: "other", attempt: `repair-${i}`, repairCause: "shared" }))], "T-R", "repair-1", [repair])).toThrow()
})
test("field mapping renames only actual returned fields without supplying expected values", () => {
  expect(normalizeFields({ file: 3 }, { fields: { file_document: "file", authorized_resource: "missing" } })).toEqual({ file_document: 3 })
  expect(normalizeFields(undefined, { fields: {} })).toBeUndefined()
})
