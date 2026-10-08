import { expect, test } from "bun:test"
import path from "node:path"

const api = await import("./study.ts").catch(() => ({})) as any

test("BA owns twenty-two stable positions with two native pilots and separate consumption", () => {
  expect(typeof api.positions).toBe("function")
  const rows = api.positions()
  expect(rows).toHaveLength(22)
  expect(new Set(rows.map((p: any) => p.id)).size).toBe(22)
  expect(rows.filter((p: any) => p.kind === "pilot").map((p: any) => [p.id, p.entrance])).toEqual([["pilot-download", "native"], ["pilot-owui", "native"]])
  expect(rows.filter((p: any) => p.kind === "quality")).toHaveLength(12)
  expect(rows.filter((p: any) => p.kind === "consumer").map((p: any) => p.id)).toEqual(["consumer-download-inquiry", "consumer-owui-native"])
  expect(rows.filter((p: any) => p.kind === "change")).toHaveLength(6)
})

test("BA refuses every historical or shared write destination", () => {
  expect(typeof api.assertOwnedPaths).toBe("function")
  expect(() => api.assertOwnedPaths(import.meta.dir, api.runRoot)).not.toThrow()
  for (const name of ["authorization-property-abstraction-v1", "authorization-question-closure-v1"]) {
    expect(() => api.assertOwnedPaths(path.resolve(import.meta.dir, "..", name), api.runRoot)).toThrow("BA output identity")
  }
})

test("original regression extraction preserves the actual guard error and semantic predicate gap", async () => {
  expect(typeof api.extractOriginalRegression).toBe("function")
  const fixture = await api.extractOriginalRegression()
  const repair = fixture.entries.find((e: any) => e.attemptId === "single-download/format-contract-1")
  expect(repair.toolRejections[1].call.arguments.controlDelta.interpretation.annotations[0].role).toBe("guard")
  expect(repair.sourceInterpretations[0].raw.interpretation.annotations[0].role).toBe("condition")
  expect(repair.sourceInterpretations[0].diagnostics.some((d: any) => d.code === "source-interpretation-condition-required")).toBe(true)
  expect(fixture.originalScoresChanged).toBe(false)
  expect(fixture.newInference).toBe(0)
})
