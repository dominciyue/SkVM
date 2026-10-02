import { expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
const api = await import("./study.ts").catch(() => ({} as any))
const row = (id: string) => ({ id, task: "memos-remove", method: "D1", strategy: "guided-evidence-v2", components: ["wire", "checker"] })
const options = (extra = {}) => ({ revision: "test-revision", model: "mock", budgets: { maxDispatches: 12 }, concurrency: 2, ...extra })
const temp = () => mkdtemp(path.join(os.tmpdir(), "authorization-ar-driver-"))
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
test("a shared defect pauses affected dispatch while retaining the other in-flight answer", async () => {
  expect(typeof api.developRows).toBe("function")
  const root = await temp(), started: string[] = []
  let release!: () => void
  const ready = new Promise<void>(resolve => { release = resolve })
  const result = await api.developRows(root, [row("first"), row("in-flight"), row("remaining")], options({
    execute: async (r: any) => { started.push(r.id); if (r.id === "first") await ready; else release(); return { status: "completed", final: r.id } },
    evaluate: async (r: any) => r.id === "first" ? { failure: { category: "schema/wire", rootCause: "conflicting aliases", components: ["wire"] } } : {},
  }))
  expect(started.sort()).toEqual(["first", "in-flight"])
  expect(result.rows.find((r: any) => r.id === "remaining").status).toBe("not-run-after-defect")
  expect((await json(path.join(root, "runs/in-flight/attempt-1/report.json"))).report.final).toBe("in-flight")
  const failures = (await readFile(path.join(root, "failures.jsonl"), "utf8")).trim().split("\n").map(s => JSON.parse(s))
  expect(failures[0]).toMatchObject({ runId: "first", repairId: null, outcome: "unresolved", originalArtifact: "runs/first/attempt-1/report.json" })
})
test("repair attempts never overwrite the first answer and accumulate calls with unknown cost", async () => {
  expect(typeof api.developRows).toBe("function")
  const root = await temp(), first = [row("logical")]
  const run = (text: string, calls: number) => options({ concurrency: 1, execute: async () => ({ status: "completed", final: text, telemetry: { providerCalls: calls, totalActualUsd: null } }), evaluate: async () => ({}) })
  await api.developRows(root, first, run("original", 2))
  await api.developRows(root, first, { ...run("corrected", 3), repairId: "repair-wire", repairOf: "logical/attempt-1" })
  const replay = await api.replay(root)
  expect(replay.rows[0]).toMatchObject({ firstAttempt: "runs/logical/attempt-1/report.json", repairAttempts: ["runs/logical/attempt-2/report.json"], providerCalls: 5, totalActualUsd: null })
  expect((await json(path.join(root, "runs/logical/attempt-1/report.json"))).report.final).toBe("original")
  expect(replay.providerCallsDuringReplay).toBe(0)
  const next = await api.developRows(root, first, run("never", 9))
  expect(next.rows[0].status).toBe("already-retained")
})
test("a valid justified unknown is a boundary, not a mandatory repair", async () => {
  expect(typeof api.developRows).toBe("function")
  expect(api.mechanicalReview({ status: "completed", validation: { valid: true }, final: { questions: [{ behavior: { disposition: "unknown" }, missing: [{ kind: "deployment-unverified", detail: "live role assignment unavailable" }] }] } })).toEqual({})
  const root = await temp(), result = await api.developRows(root, [row("boundary"), row("next")], options({ concurrency: 1, execute: async () => ({ status: "completed", validation: { valid: true } }), evaluate: async (_r: any, report: any) => api.mechanicalReview(report) }))
  expect(result.rows.every((r: any) => r.status === "completed")).toBe(true)
})
test("a repair identity only reopens its own retained attempt and cannot bypass another shared defect", async () => {
  const root = await temp(), execute = async () => ({ status: "completed", telemetry: { providerCalls: 1 } })
  await api.developRows(root, [row("first"), row("other")], options({ execute, evaluate: async () => ({ failure: { category: "schema/wire", rootCause: "separate retained defect", components: ["wire"] } }) }))
  const started: string[] = []
  const result = await api.developRows(root, [row("first")], options({ repairId: "repair-first", repairOf: "first/attempt-1", execute: async (r: any) => { started.push(r.id); return execute() }, evaluate: async () => ({}) }))
  expect(started).toEqual([])
  expect(result.rows[0]).toMatchObject({ status: "not-run-after-defect", failureId: "other-attempt-1" })
})
test("repair references must name an existing same-row completed claim before dispatch", async () => {
  const root = await temp(), started: string[] = []
  const run = options({ concurrency: 1, execute: async (r: any) => { started.push(r.id); return { status: "completed" } }, evaluate: async () => ({}) })
  await api.developRows(root, [row("first")], run)
  for (const [id, repairOf] of [["other", "first/attempt-1"], ["first", "first/attempt-99"], ["first", "../first/attempt-1"]] as const) {
    await expect(api.developRows(root, [row(id)], { ...run, repairId: "repair-test", repairOf })).rejects.toThrow(/original attempt/)
  }
  expect(started).toEqual(["first"])
})
test("a response of unknown completion is retained without another paid repair dispatch", async () => {
  const root = await temp(), run = options({ execute: async () => ({ status: "completion-unknown", providerDispatches: 1 }), evaluate: async () => ({}) })
  await api.developRows(root, [row("unknown")], run)
  await expect(api.developRows(root, [row("unknown")], { ...run, repairId: "repair-test", repairOf: "unknown/attempt-1" })).rejects.toThrow(/unknown completion/)
})
