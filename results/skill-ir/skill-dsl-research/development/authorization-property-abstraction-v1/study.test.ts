import { expect, test } from "bun:test"
import path from "node:path"
import { positions, assertOwnedPaths, dryRun, attributeFailure } from "./study.ts"

test("AZ retains twelve common native quality positions and the separate development/consumer/change denominators", () => {
  const rows = positions()
  expect(rows.filter(r => r.kind === "quality")).toHaveLength(12)
  expect(rows.filter(r => r.kind === "single")).toHaveLength(1)
  expect(rows.filter(r => r.kind === "consumer")).toHaveLength(2)
  expect(rows.filter(r => r.kind === "change")).toHaveLength(6)
  expect(new Set(rows.map(r => r.id)).size).toBe(21)
  expect(rows.filter(r => r.kind === "quality").every(r => r.entrance === "native")).toBe(true)
  expect(rows.filter(r => r.kind === "quality").map(r => `${r.task}/${r.arm}/${r.repeat}`)).toEqual([
    "download/N/1", "download/M/1", "download/D/1", "owui/D/1", "owui/M/1", "owui/N/1",
    "download/D/2", "download/N/2", "download/M/2", "owui/M/2", "owui/D/2", "owui/N/2",
  ])
})

test("AZ dry-run fences every write to the new identity and keeps evaluator/history out of runtime inputs", async () => {
  const row = await dryRun("quality-download-N-repeat-1")
  expect(row.entrance).toBe("native")
  expect(row.domainTools).toBe(false)
  expect(row.outputs.every(p => p.includes("authorization-property-abstraction-v1"))).toBe(true)
  expect(row.runtimeInputFiles.every(p => !/reviews|repair-events|answer-original|verification/.test(p))).toBe(true)
  for (const old of ["authorization-question-closure-v1", "authorization-property-execution-v1"]) {
    expect(() => assertOwnedPaths(path.resolve(import.meta.dir, "..", old), row.runRoot)).toThrow("AZ output identity")
  }
  expect(() => assertOwnedPaths(import.meta.dir, path.resolve(row.runRoot, "../escape"))).toThrow("AZ output identity")
})

test("offline attribution keeps original facts separate from replay and hypotheses", () => {
  const attributed = attributeFailure({ status: "failed", terminalError: { message: "workspace routing discovery failed" }, sourceWorkMetrics: { acceptedSourceUnits: 0 }, actualUsd: null })
  expect(attributed.labels).toContain("channel")
  expect(attributed.originalFacts.status).toBe("failed")
  expect(attributed.currentReplay).toBeNull()
  expect(attributed.hypotheses).toEqual([])
  expect(attributed.changesOriginalScore).toBe(false)
})
