import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "./inquiry-tools.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createControlSlice, mergeControlSlice } from "../../task-dsl/authorization/control-slice.ts"
const api = await import("./inquiry-worklist.ts").catch(() => ({} as any))
async function fixture(sources: Record<string, string>, questions = [{ id: "q", request: "Investigate entry", entryHint: "entry", premises: [] }]) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-work-"))
  for (const [file, content] of Object.entries(sources)) await writeFile(path.join(sourceRoot, file), content)
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."], maxToolCalls: 12 })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions })
  expect(typeof api.createInquiryWorklist).toBe("function")
  return { sourceRoot, tools, program, work: api.createInquiryWorklist({ program, tools }) }
}
test("a zero-graph worklist reads a unique original entry and schedules explicit interpretation rather than semantic closure", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return gate(); }\n", "helper.ts": "export function gate() { return false; }\n" }), empty = createControlSlice()
  expect(f.work.snapshot()).toHaveLength(6)
  await f.work.run(empty, 2)
  const root = f.work.snapshot().find((w: any) => w.kind === "entry" && w.origin === "question-duty")
  expect(root).toMatchObject({ state: "awaiting-interpretation", nextAction: { kind: "interpret" }, semanticSupport: "unreviewed" })
  expect(f.tools.evidence[0]!.quote).toContain("return gate()")
  const helper = f.work.snapshot().find((w: any) => w.symbol === "gate")
  expect(helper).toMatchObject({ state: "awaiting-binding", origin: "source-reference" })
  expect(f.tools.toolCalls).toBe(1)
  await f.work.run(empty, 2)
  expect(f.tools.toolCalls).toBe(1)
  const ev = f.tools.evidence[0]!.id, slice = mergeControlSlice(empty, { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], evidenceIds: [ev], claim: "Calls gate" }] }, f.program, { questionIds: ["q"], shownEvidenceIds: [ev] }).state
  await f.work.run(slice, 2)
  expect(f.tools.toolCalls).toBe(2)
  expect(f.tools.evidence.some(e => e.quote.includes("return false"))).toBe(true)
  expect(f.work.snapshot().find((w: any) => w.symbol === "gate").state).toBe("awaiting-interpretation")
})
test("question fairness gives a second entry a turn before reading more of a long first entry", async () => {
  const f = await fixture({ "long.ts": "export function alpha() {\n" + "  // original line\n".repeat(340) + "  return true;\n}\n", "short.ts": "export function beta() { return false; }\n" }, ["alpha", "beta"].map(id => ({ id, request: `Investigate ${id}`, entryHint: id, premises: [] })))
  await f.work.run(createControlSlice(), 2)
  expect(f.work.actions.map((a: any) => a.questionId)).toEqual(["alpha", "beta"])
  expect(f.work.snapshot().find((w: any) => w.questionId === "alpha" && w.kind === "entry").state).toBe("awaiting-read")
  expect(f.work.snapshot().find((w: any) => w.questionId === "beta" && w.kind === "entry").state).toBe("awaiting-interpretation")
})
test("ambiguous entries stay local and explicit candidate selection cannot borrow another question", async () => {
  const f = await fixture({ "a.ts": "export function entry() { return true; }\n", "b.ts": "export function entry() { return false; }\n", "other.ts": "export function other() { return true; }\n" }, [{ id: "q", request: "Investigate entry", entryHint: "entry", premises: [] }, { id: "other", request: "Investigate other", entryHint: "other", premises: [] }])
  await f.work.run(createControlSlice(), 2)
  const item = f.work.snapshot().find((w: any) => w.questionId === "q" && w.kind === "entry")
  expect(item).toMatchObject({ state: "unlocated", code: "location-ambiguous", nextAction: { kind: "select-candidate" } })
  expect(f.work.actions.map((a: any) => a.questionId)).toEqual(["other"])
  expect(f.work.selectCandidate({ questionId: "other", itemId: item.id, candidateId: item.candidates[0].id }).code).toBe("work-question-mismatch")
  expect(f.work.selectCandidate({ questionId: "q", itemId: item.id, candidateId: "outside" }).code).toBe("work-candidate-missing")
  expect(f.work.selectCandidate({ questionId: "q", itemId: item.id, candidateId: item.candidates[0].id }).status).toBe("accepted")
  await f.work.run(createControlSlice(), 2)
  expect(f.tools.toolCalls).toBe(2)
})
test("source changes invalidate its work items without repeated failed reads", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return true; }\n" })
  await writeFile(path.join(f.sourceRoot, "entry.ts"), "export function entry() { return false; }\n")
  await f.work.run(createControlSlice(), 2)
  const item = f.work.snapshot().find((w: any) => w.kind === "entry")
  expect(item).toMatchObject({ state: "blocked", code: "source-invalidated" })
  await f.work.run(createControlSlice(), 2)
  expect(f.tools.toolCalls).toBe(1)
  expect(f.work.snapshot().filter((w: any) => w.selected?.path === "entry.ts").every((w: any) => w.state === "blocked")).toBe(true)
})

test("a recursive lexical reference becomes a named local gap and never creates repeated reads", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return follow(); }\n", "helper.ts": "export function follow() { return entry(); }\n" }), empty = createControlSlice()
  await f.work.run(empty, 2)
  const ev = f.tools.evidence[0]!.id
  const slice = mergeControlSlice(empty, { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], evidenceIds: [ev], claim: "Calls follow" }] }, f.program, { questionIds: ["q"], shownEvidenceIds: [ev] }).state
  await f.work.run(slice, 2)
  await f.work.run(slice, 2)
  expect(f.work.snapshot().some((w: any) => w.state === "blocked" && w.code === "reference-cycle")).toBe(true)
  expect(f.tools.toolCalls).toBe(2)
})

test("one recursive candidate cannot block a distinct ambiguous definition before selection", async () => {
  const f = await fixture({ "a.ts": "export function entry() { return entry(); }\n", "b.ts": "export function entry() { return false; }\n" }), empty = createControlSlice()
  const root = f.work.snapshot().find((w: any) => w.kind === "entry")
  f.work.selectCandidate({ questionId: "q", itemId: root.id, candidateId: root.candidates.find((c: any) => c.path === "a.ts").id })
  await f.work.run(empty, 2)
  const ev = f.tools.evidence[0]!.id, slice = mergeControlSlice(empty, { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], evidenceIds: [ev], claim: "Calls a same-named candidate" }] }, f.program, { questionIds: ["q"], shownEvidenceIds: [ev] }).state
  await f.work.run(slice, 2)
  const child = f.work.snapshot().find((w: any) => w.origin === "source-reference")
  expect(child).toMatchObject({ state: "unlocated", nextAction: { kind: "select-candidate" } })
  f.work.selectCandidate({ questionId: "q", itemId: child.id, candidateId: child.candidates.find((c: any) => c.path === "b.ts").id })
  await f.work.run(slice, 2)
  expect(f.tools.evidence.some(e => e.path === "b.ts")).toBe(true)
})
