import { expect, test } from "bun:test"
import { identity, positions } from "./study.ts"

test("BC registers eleven Download duties and no new OWUI dispatch", () => {
  const rows = positions()
  expect(identity).toBe("authorization-task-binding-v1")
  expect(rows).toHaveLength(11)
  expect(new Set(rows.map(p => p.id)).size).toBe(11)
  expect(rows.map(p => p.id)).toEqual([
    "native-download", "quality-n-1", "quality-d-1", "quality-d-2", "quality-n-2",
    "policy-fresh", "policy-previous", "premise-fresh", "premise-previous", "source-fresh", "source-previous",
  ])
  expect(rows.every(p => p.status === "registered-not-run" && p.attempts.length === 0)).toBe(true)
})
