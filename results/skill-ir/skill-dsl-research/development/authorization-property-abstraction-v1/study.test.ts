import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, mkdir, readFile } from "node:fs/promises"
import os from "node:os"
import { positions, assertOwnedPaths, dryRun, attributeFailure, admitDispatch } from "./study.ts"

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
test("known channel refusal and active or unknown runs prevent another experiment", () => {
  const state = { activeAttempts: [], unknownCompletions: [], accountChannel: { status: "availability-unconfirmed-for-experiment" } }
  expect(() => admitDispatch(state)).not.toThrow()
  for (const status of ["quota-refused", "unavailable"]) expect(() => admitDispatch({ ...state, accountChannel: { status } })).toThrow("unavailable")
  expect(() => admitDispatch({ ...state, unknownCompletions: ["first"] })).toThrow("Inspect")
  expect(() => admitDispatch({ ...state, activeAttempts: ["first"] })).toThrow("Inspect")
})

test("single-property preparation retains the original task and binds no source-derived answer", async () => {
  const api = await import("./study.ts") as any
  const directory = path.join(await mkdtemp(path.join(os.tmpdir(), "az-prepare-")), "authorization-property-abstraction-v1")
  await mkdir(directory)
  const prepared = await api.preparePositionInput("single-download", directory)
  const input = JSON.parse(await readFile(prepared.inputFile, "utf8"))
  expect(input.inquiry.questions).toHaveLength(1)
  expect(input.inquiry.questions[0].properties[0].kind).toBe("authorized-object-matches-effect")
  expect(JSON.stringify(input)).not.toMatch(/guardAnchorId|effectAnchorId|source-interpretation|verdict/)
  const provenance = JSON.parse(await readFile(path.join(directory, "model/inputs/download-single-provenance.json"), "utf8"))
  expect(provenance.originalTask.brief).toContain("Investigate the document Download operation")
  expect(prepared.entrance).toBe("inquiry")
  expect((await dryRun("quality-download-D-repeat-1")).entrance).toBe("native")
})
