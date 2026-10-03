import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { plannedRows } from "./study.ts"
import type { Assessment } from "./evaluate.ts"
const api = await import("./evaluate.ts").catch(() => ({} as any))
const rows = ["M", "D1"].map(method => ({ id: `quality-case-${method}`, task: "case", method, strategy: method === "M" ? "legacy" : "guided-evidence-v2", components: ["wire"], kind: "quality" }))
const save = async (base: string, relative: string, value: unknown) => { await mkdir(path.dirname(path.join(base, relative)), { recursive: true }); await writeFile(path.join(base, relative), JSON.stringify(value, null, 2) + "\n") }
const digest = async (base: string, relative: string) => createHash("sha256").update(await readFile(path.join(base, relative))).digest("hex")
async function fixture(selected = rows) { const base = await mkdtemp(path.join(os.tmpdir(), "ar-semantic-evaluation-")); await save(base, "manifest.json", { rows: selected }); return base }
async function attempt(base: string, method: string, number = 1, extra: any = {}) {
  const row = rows.find(r => r.method === method)!, dir = `runs/${row.id}/attempt-${number}`
  const identity = { row, attempt: number, revision: "same-revision", model: "mock", budgets: { maxDispatches: 12 }, repairId: number > 1 ? "repair-test" : null, repairOf: number > 1 ? `${row.id}/attempt-1` : null, ...extra.identity }
  const report = { status: "completed", inputSha256: "a".repeat(64), sourceFiles: [{ path: "entry.ts", sha256: "b".repeat(64), bytes: 24 }], validation: { valid: true }, telemetry: { providerCalls: 2, totalActualUsd: null }, ...extra.report }
  await save(base, `${dir}/claim.json`, identity); await save(base, `${dir}/report.json`, { identity, report })
  return { rowId: row.id, attempt: number, report: { path: `${dir}/report.json`, sha256: await digest(base, `${dir}/report.json`) } }
}
function assessment(rating: Assessment["final"]["rating"] = "full"): Assessment {
  const answer = { rating, decisiveError: rating === "incorrect", overUnknown: false, falseComplete: false, evidence: ["source/entry.ts:1-4; raw answer"] }
  return { initial: answer, final: answer, extraction: { initial: "supported", final: "supported", incorrectRules: [], wrongPremiseMappings: [], amplifiedError: false, evidence: ["source/entry.ts:1-4"] }, mechanism: { decisiveHelperHits: [], irrelevantOrInvalidReads: [], correctExcludedBranches: [], wrongExcludedBranches: [], justifiedResiduals: ["deployment identity is not supplied"], avoidableResiduals: [], checkerDetections: [], checkerFalseRejections: [], checkerMisses: [], evidence: ["source/entry.ts:1-4"] }, causes: [], notes: "Bounded source behavior reviewed; external state remains conditional." }
}
async function review(base: string, binding: any, result = assessment(), id = "independent") {
  const relative = `evaluations/semantic-reviews/${id}.json`
  await save(base, relative, { schemaVersion: "authorization-ar-semantic-review/v1", id, binding, reviewer: { kind: "independent", mainContextExposed: true, representationMayRevealMethod: true }, assessment: result })
  return { path: relative, sha256: await digest(base, relative) }
}
test("completed/valid stays semantically unreviewed and unknown cost stays unknown", async () => {
  expect(typeof api.evaluateStudy).toBe("function")
  const base = await fixture(); await attempt(base, "M")
  const result = await api.evaluateStudy(base)
  expect(result.primarySummary).toMatchObject({ denominator: 2, attempted: 1, notRun: 1, reviewedFirst: 0, firstFull: 0 })
  expect(result.primaryRows[0].attempts[0]).toMatchObject({ status: "completed", hostValidation: true, semanticStatus: "unreviewed", assessment: null })
  expect(result.accounting.rows[0]).toMatchObject({ providerCalls: 2, totalActualUsd: null })
  expect(result.providerCallsDuringEvaluation).toBe(0)
})
test("an incorrect first answer and a full repair remain separate in the planned denominator", async () => {
  const base = await fixture(), first = await attempt(base, "M"), repaired = await attempt(base, "M", 2, { report: { telemetry: { providerCalls: 3, totalActualUsd: null } } })
  await review(base, first, assessment("incorrect"), "first"); await review(base, repaired, assessment("full"), "repair")
  const result = await api.evaluateStudy(base), row = result.primaryRows[0]
  expect(row.firstAttempt).toBe(1); expect(row.repairAttempts).toEqual([2])
  expect(row.attempts.map((a: any) => a.assessment.final.rating)).toEqual(["incorrect", "full"])
  expect(result.primarySummary).toMatchObject({ denominator: 2, firstFull: 0, firstDecisiveErrors: 1, repairAttempts: 1, repairedFinalFull: 1 })
  expect(result.accounting.rows[0]).toMatchObject({ providerCalls: 5, totalActualUsd: null })
})
test("a raw full answer can coexist with a failed host check and retained partial extraction", async () => {
  const base = await fixture(), binding = await attempt(base, "M", 1, { report: { status: "completed-with-diagnostics", validation: { valid: false } } })
  const resultReview = assessment(); resultReview.extraction.final = "partial"; resultReview.mechanism.checkerFalseRejections = ["check-1: source-supported equivalent predicate rejected"]
  await review(base, binding, resultReview)
  const result = await api.evaluateStudy(base), current = result.primaryRows[0].attempts[0]
  expect(current).toMatchObject({ hostValidation: false, semanticStatus: "reviewed", assessment: { final: { rating: "full" }, extraction: { final: "partial" } } })
  expect(current.assessment.mechanism.checkerFalseRejections).toHaveLength(1)
})
test("changed report bytes and duplicate attempt reviews cannot inherit old semantic credit", async () => {
  const base = await fixture(), binding = await attempt(base, "M")
  await review(base, binding)
  const file = path.join(base, binding.report.path), old = await readFile(file, "utf8")
  await writeFile(file, old + " \n")
  await expect(api.evaluateStudy(base)).rejects.toThrow(/Changed semantic review report/)
  await writeFile(file, old); await review(base, binding, assessment("partial"), "duplicate")
  await expect(api.evaluateStudy(base)).rejects.toThrow(/Duplicate semantic review/)
})
test("developer adjudication retains its independent original and cannot target another attempt", async () => {
  const base = await fixture(), first = await attempt(base, "M"), repaired = await attempt(base, "M", 2)
  const original = await review(base, first, assessment("partial"))
  const record = { schemaVersion: "authorization-ar-semantic-adjudication/v1", id: "source-correction", binding: first, independentReview: original, assessment: assessment("full"), rationale: "The retained source contradicts the original avoidable-gap finding.", evidence: ["source/entry.ts:1-4"] }
  await save(base, "evaluations/semantic-adjudications/correction.json", record)
  const result = await api.evaluateStudy(base), current = result.primaryRows[0].attempts[0]
  expect(current.independentReview.assessment.final.rating).toBe("partial")
  expect(current.developerAdjudication.assessment.final.rating).toBe("full")
  expect(current.assessment.final.rating).toBe("full")
  await save(base, "evaluations/semantic-adjudications/correction.json", { ...record, binding: repaired })
  await expect(api.evaluateStudy(base)).rejects.toThrow(/Adjudication binding/)
})
test("pairing requires the same retained input, source, revision, model and budget", async () => {
  const base = await fixture(), left = await attempt(base, "M")
  await review(base, left, assessment("partial"), "M")
  for (const changed of [{ identity: { revision: "different-revision" } }, { identity: { model: "different-model" } }, { identity: { budgets: { maxDispatches: 13 } } }, { report: { inputSha256: "c".repeat(64) } }, { report: { sourceFiles: [{ path: "entry.ts", sha256: "c".repeat(64), bytes: 24 }] } }]) {
    const right = await attempt(base, "D1", 1, changed); await review(base, right, assessment("full"), "D1")
    const different = await api.evaluateStudy(base)
    expect(different.pairedFirstAttempts).toEqual([]); expect(different.unpairedTasks[0].reason).toBe("comparison-identity-mismatch")
  }
  const same = await attempt(base, "D1"); await review(base, same, assessment("full"), "D1")
  const equal = await api.evaluateStudy(base)
  expect(equal.pairedFirstAttempts[0]).toMatchObject({ task: "case", M: { final: "partial" }, D1: { final: "full" } })
  expect(equal.qualityBenefit).toBe("not-established")
})
test("all sixteen planned rows remain visible when generation is paused or not started", async () => {
  const base = await fixture(plannedRows() as any), result = await api.evaluateStudy(base)
  expect(result.primarySummary).toMatchObject({ denominator: 16, attempted: 0, notRun: 16, reviewedFirst: 0 })
  expect(result.primaryRows).toHaveLength(16); expect(result.primaryRows.every((r: any) => r.status === "not-run")).toBe(true)
  expect(result.descriptiveRows).toEqual([])
})
