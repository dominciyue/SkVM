import { expect, test } from "bun:test"
import { cp, mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import demo from "../../../../examples/authorization-assessment/evidence-editing/base.json" with { type: "json" }
import request from "../../../../examples/authorization-assessment/evidence-editing/request-partial.json" with { type: "json" }
import { prepareAuthorizationEvidence } from "./prepare.ts"
import { reusePreparedMaterial, transitionPreparedGaps } from "./material-reuse.ts"
import type { AuthorizationEvidenceReport } from "./schema.ts"

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-reuse-"))
  await cp(path.resolve("examples/authorization-assessment/evidence-editing/project"), path.join(root, "project"), { recursive: true })
  const base: any = { ...structuredClone(demo), sourceRoot: "project" }
  const inputFile = path.join(root, "base.json"), outDir = path.join(root, "prepared")
  await writeFile(inputFile, JSON.stringify(base))
  const prepared = await prepareAuthorizationEvidence({ inputFile, outDir, request: { ...request as any, sourceRoot: base.sourceRoot } })
  await mkdir(outDir)
  for (const snapshot of prepared.snapshots) { const target = path.join(outDir, "source", snapshot.path); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, snapshot.content) }
  await writeFile(path.join(outDir, "assessment.json"), JSON.stringify(prepared.preparedInput))
  return { root, base, inputFile, previousInputFile: path.join(outDir, "assessment.json"), report: prepared.report }
}

test("reuse retains exact report gaps and source bytes and refuses changed ref or missing legacy binding", async () => {
  const f = await fixture()
  try {
    const input = { inputFile: f.inputFile, previousInputFile: f.previousInputFile, outDir: path.join(f.root, "changed") }
    f.base.request = "Assess the same source under the stated new premise."
    await writeFile(f.inputFile, JSON.stringify(f.base))
    const value = await reusePreparedMaterial(input)
    expect(value.report.gaps).toEqual(f.report.gaps)
    expect(value.reuse.requiresAnalysis).toBe(true)
    expect(value.report.materialBinding?.request.dependencies).toEqual(f.report.materialBinding?.request.dependencies)
    const old: any = JSON.parse(await readFile(f.previousInputFile, "utf8"))
    delete old.evidencePreparation.materialBinding
    await writeFile(f.previousInputFile, JSON.stringify(old))
    expect((await reusePreparedMaterial(input)).report.gaps.at(-1)?.reason).toBe("source-binding-unavailable")
    old.evidencePreparation = f.report
    await writeFile(f.previousInputFile, JSON.stringify(old))
    f.base.sourceRef = "changed-ref"
    await writeFile(f.inputFile, JSON.stringify(f.base))
    expect((await reusePreparedMaterial(input)).report.status).toBe("invalid")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("a changed raw byte outside the retained crop invalidates reuse and preserves the pending record", async () => {
  const f = await fixture()
  try {
    const source = path.join(f.root, "project", "src", "record.ts")
    await writeFile(source, (await readFile(source, "utf8")) + "\n// changed raw source\n")
    const value = await reusePreparedMaterial({ inputFile: f.inputFile, previousInputFile: f.previousInputFile, outDir: path.join(f.root, "changed") })
    expect(value.report.status).toBe("invalid")
    expect(value.report.gaps.slice(0, -1)).toEqual(f.report.gaps)
    expect(value.report.gaps.at(-1)?.reason).toBe("source-bytes-changed")
    expect(value.preparedInput).toBeUndefined()
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

const report = (): AuthorizationEvidenceReport => ({ schemaVersion: "authorization-evidence-report/v2", status: "partial", sourceIdentity: { repository: "repo", sourceRef: "r1" }, sourceRoot: "project", included: [{ path: "entry.py", originalPath: "entry.py", startLine: 1, endLine: 3, origins: ["entry:update"], segments: [{ originalStartLine: 1, originalEndLine: 3, snapshotStartLine: 1, snapshotEndLine: 3, origins: ["entry:update"] }] }], gaps: [{ id: "helper", entryKey: "update", reason: "range-required", attemptedPath: "entry.py" }], closureClaim: "declared-dependencies-only" })

test("clearing a gap requires new included evidence; current evidence and explanation alone cannot resolve it", () => {
  const previous = report(), current = report()
  expect(() => transitionPreparedGaps({ previous, current, changes: [{ id: "helper", status: "resolved", reason: "Located", evidence: [{ path: "entry.py", startLine: 1, endLine: 3 }] }] })).toThrow("new evidence")
  current.included[0] = { ...current.included[0]!, endLine: 6, segments: [{ originalStartLine: 1, originalEndLine: 6, snapshotStartLine: 1, snapshotEndLine: 6, origins: ["author:helper"] }] } as any
  const value = transitionPreparedGaps({ previous, current, changes: [{ id: "helper", status: "resolved", reason: "New deterministic helper range", evidence: [{ path: "entry.py", startLine: 4, endLine: 6 }] }] })
  expect(value.gaps).toEqual([])
  expect(value.gapHistory?.[0]?.gap).toEqual(previous.gaps[0])
  expect(value.status).toBe("ready")
})

test("not-relevant needs an explicit scope or premise change plus reason and keeps gap history", () => {
  const previous = report(), current = report(), change = { id: "helper", status: "not-relevant" as const, reason: "The new handler-entry premise supplies this upstream identity fact.", taskChange: "/analysisContract/premise" }
  expect(() => transitionPreparedGaps({ previous, current, changes: [change], taskBefore: { analysisContract: { premise: "Old" } }, taskAfter: { analysisContract: { premise: "Old" } } })).toThrow("changed scope or premise")
  const value = transitionPreparedGaps({ previous, current, changes: [change], taskBefore: { analysisContract: { premise: "Old" } }, taskAfter: { analysisContract: { premise: "New" } } })
  expect(value.gaps).toEqual([])
  expect(value.gapHistory?.[0]?.status).toBe("not-relevant")
  expect(previous.gaps).toHaveLength(1)
})
