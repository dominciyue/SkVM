import { expect, test } from "bun:test"
import path from "node:path"
const api = await import("./study.ts").catch(() => ({})) as any

test("BB registers sixteen pending positions without counting revisions as new samples", () => {
  expect(typeof api.positions).toBe("function")
  const rows = api.positions()
  expect(rows).toHaveLength(16)
  expect(new Set(rows.map((r: any) => r.id)).size).toBe(16)
  expect(rows.filter((r: any) => r.kind === "quality")).toHaveLength(6)
  expect(rows.filter((r: any) => r.kind === "change")).toHaveLength(6)
  expect(rows.every((r: any) => r.status === "registered-not-run" && r.attempts.length === 0)).toBe(true)
})
test("BB writes only its own identity", () => {
  expect(typeof api.assertOwnedPaths).toBe("function")
  expect(() => api.assertOwnedPaths(import.meta.dir, api.runRoot)).not.toThrow()
  expect(() => api.assertOwnedPaths(path.resolve(import.meta.dir, "../authorization-semantic-submission-v1"), api.runRoot)).toThrow("BB output identity")
})
test("BB extracts exact BA interpretations and original counts without rewriting history", async () => {
  expect(typeof api.extractOriginalRegression).toBe("function")
  const fixture = await api.extractOriginalRegression()
  expect(fixture.entries.map((r: any) => r.attemptId)).toEqual(["pilot-download/transaction-priority-1", "pilot-owui/original"])
  expect(fixture.entries.map((r: any) => r.original.materialUses)).toEqual([1, 0])
  expect(fixture.entries.map((r: any) => r.original.materials)).toEqual([7, 5])
  expect(fixture.modelCalls).toBe(0)
  expect(fixture.originalFilesChanged).toBe(false)
})
