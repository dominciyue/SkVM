import { expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "./inquiry-tools.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { createControlSlice, mergeControlSlice } from "../../task-dsl/authorization/control-slice.ts"

async function sourceConfirmedWork(content: string, request: string) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "av-entry-"))
  await writeFile(path.join(sourceRoot, "app.py"), content)
  const tools = await createInquiryTools({ sourceRoot, repository: "anonymous", sourceRef: "r", allowedPaths: ["."], structure: true })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request, premises: [] }] })
  return { tools, work: api.createInquiryWorklist({ program, tools, structural: true, requireEntryBasis: true }) }
}

test("a singleton ordinary verb stays a selectable lead and never becomes the entry automatically", async () => {
  const { tools, work } = await sourceConfirmedWork("class AuditLogger:\n    def write(self, message):\n        return message\n", "Can the caller write the requested file?")
  await work.run(createControlSlice(), 2)
  const entry = work.snapshot().find((w: any) => w.kind === "entry")
  expect(entry.selected).toBeUndefined()
  expect(entry).toMatchObject({ code: "entry-basis-unconfirmed", nextAction: { kind: "select-candidate" } })
  expect(tools.toolCalls).toBe(0)
  expect(work.selectCandidate({ questionId: "q", itemId: entry.id, candidateId: entry.candidates[0].id }).status).toBe("accepted")
  await work.run(createControlSlice(), 2)
  expect(work.snapshot().find((w: any) => w.kind === "entry").selectedBy).toBe("explicit-selection")
})

test("the natural route task selects the real handler despite an unrelated write singleton", async () => {
  const { work } = await sourceConfirmedWork('from fastapi import APIRouter as Router\nrouter = Router()\n@router.post("/process/file")\ndef process_file(request):\n    return request\nclass AuditLogger:\n    def write(self, message):\n        return message\n', "Analyze /process/file: can a caller write another file?")
  await work.run(createControlSlice(), 1)
  expect(work.snapshot().find((w: any) => w.kind === "entry")).toMatchObject({ selected: { name: "process_file" }, selectedBy: "source-confirmed-candidate", state: "awaiting-interpretation" })
})

test("qualified symbols can confirm an entry but duplicate routes cannot", async () => {
  const content = 'from fastapi import APIRouter\nrouter = APIRouter()\n@router.post("/items")\ndef first(x):\n    return x\n@router.post("/items")\ndef second(x):\n    return x\n'
  const qualified = await sourceConfirmedWork(content, "Analyze app.first for the supplied caller")
  await qualified.work.run(createControlSlice(), 1)
  expect(qualified.work.snapshot().find((w: any) => w.kind === "entry").selected?.name).toBe("first")
  const ambiguous = await sourceConfirmedWork(content, "Analyze POST /items for the supplied caller")
  await ambiguous.work.run(createControlSlice(), 1)
  expect(ambiguous.work.snapshot().find((w: any) => w.kind === "entry")).toMatchObject({ code: "location-ambiguous" })
  expect(ambiguous.tools.toolCalls).toBe(0)
})

test("actual condition calls outrank peripheral calls and read progress never triggers a reread", async () => {
  const { tools, work } = await sourceConfirmedWork("def log():\n    return True\ndef decision(actor):\n    return False\ndef entry(actor):\n    log()\n    if decision(actor):\n        return True\n    return False\n# decision and entry in a comment are not additional calls\n", "Inspect app.entry for the supplied caller")
  await work.run(createControlSlice(), 2)
  expect(work.actions.map((a: any) => a.arguments.startLine)).toEqual([5, 3])
  const decision = work.snapshot().find((w: any) => w.selected?.name === "decision")
  expect(decision).toMatchObject({ decisive: true, progress: { found: true, read: true, interpreted: false, linked: false, checked: false }, nextAction: { kind: "interpret" } })
  const before = tools.toolCalls
  await work.run(createControlSlice(), 2)
  const after = tools.toolCalls
  await work.run(createControlSlice(), 2)
  expect(after).toBe(before + 1)
  expect(tools.toolCalls).toBe(after)
  expect(work.snapshot().filter((w: any) => w.origin === "structure-relation").map((w: any) => w.selected?.name).sort()).toEqual(["decision", "log"])
})
const api = await import("./inquiry-worklist.ts").catch(() => ({} as any))
async function fixture(sources: Record<string, string>, questions = [{ id: "q", request: "Investigate entry", entryHint: "entry", premises: [] }]) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-work-"))
  for (const [file, content] of Object.entries(sources)) { await mkdir(path.dirname(path.join(sourceRoot, file)), { recursive: true }); await writeFile(path.join(sourceRoot, file), content) }
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
  expect(f.tools.toolCalls).toBe(1)
  expect(f.work.snapshot().find((w: any) => w.symbol === "gate")).toMatchObject({ state: "awaiting-binding", code: "reference-relevance-unconfirmed" })
  const linked = mergeControlSlice(slice, { schemaVersion: "authorization-control-slice/v1", dependencies: [{ key: "gate", questionId: "q", pathKey: "p", from: "entry", symbol: "gate", kind: "control", decisive: true, evidenceIds: [ev], reason: "The entry delegates its current authorization decision" }] }, f.program, { questionIds: ["q"], shownEvidenceIds: [ev] }).state
  await f.work.run(linked, 2)
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

test("an explicitly declared operation supplies an entry location lead without duplicate entryHint", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return false; }\n" }, [{ id: "q", request: "Can the current caller remove a member?", operation: "entry", premises: [] }] as any)
  await f.work.run(createControlSlice(), 2)
  expect(f.work.snapshot().find((w: any) => w.kind === "entry")).toMatchObject({ state: "awaiting-interpretation", semanticSupport: "unreviewed" })
  expect(f.tools.evidence[0]?.text).toContain("return false")
})
test("a paraphrased operation retains the original user task's lexical entry lead", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return false; }\n" }, [{ id: "q", request: "Can the caller remove a member?", operation: "remove member", premises: [] }] as any)
  const work = api.createInquiryWorklist({ program: f.program, tools: f.tools, entryContext: "Check entry against the supplied independent policy." })
  await work.run(createControlSlice(), 2)
  expect(work.snapshot().find((w: any) => w.kind === "entry")).toMatchObject({ state: "awaiting-interpretation", semanticSupport: "unreviewed" })
  expect(f.tools.evidence[0]?.text).toContain("return false")
})
test("an unindexed prose entry hint falls back to the declared operation without inventing semantics", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return false; }\n" }, [{ id: "q", request: "Can the caller remove a member?", operation: "entry", entryHint: "Removal endpoint and object invariant", premises: [] }] as any)
  await f.work.run(createControlSlice(), 2)
  expect(f.work.snapshot().find((w: any) => w.kind === "entry")).toMatchObject({ state: "awaiting-interpretation", selected: { name: "entry" }, semanticSupport: "unreviewed" })
  expect(f.tools.toolCalls).toBe(1)
})
test("an unindexed hint and paraphrased operation retain the original task's lexical location", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return false; }\n" }, [{ id: "q", request: "Can the caller remove a member?", operation: "remove member", entryHint: "Removal endpoint", premises: [] }] as any)
  const work = api.createInquiryWorklist({ program: f.program, tools: f.tools, entryContext: "Check entry under the supplied premises." })
  await work.run(createControlSlice(), 2)
  expect(work.snapshot().find((w: any) => w.kind === "entry")).toMatchObject({ state: "awaiting-interpretation", selected: { name: "entry" } })
})
test("a unique fallback operation cannot override genuine ambiguity in the supplied hint", async () => {
  const f = await fixture({ "a.ts": "export function entry() { return true; }\n", "b.ts": "export function entry() { return false; }\n", "unique.ts": "export function unique() { return true; }\n" }, [{ id: "q", request: "Investigate removal", operation: "unique", entryHint: "entry", premises: [] }] as any)
  await f.work.run(createControlSlice(), 2)
  expect(f.work.snapshot().find((w: any) => w.kind === "entry")).toMatchObject({ state: "unlocated", code: "location-ambiguous", selected: undefined })
  expect(f.tools.toolCalls).toBe(0)
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
test("a shown lexical discovery can correct a misleading entry hint without borrowing unseen locations", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return decoy(); }\nexport function decoy() { return true; }\n", "actual.ts": "export function actual() { return false; }\n" }), empty = createControlSlice()
  await f.work.run(empty, 2)
  const item = f.work.snapshot().find((w: any) => w.origin === "question-duty" && w.kind === "entry")
  const candidate = f.tools.locateSymbols("actual")[0]!
  expect(f.work.selectCandidate({ questionId: "q", itemId: item.id, candidateId: candidate.id }).code).toBe("work-candidate-missing")
  const discovery = await f.tools.execute("source_symbol", { name: "actual", path: "actual.ts" })
  expect(discovery.candidates[0]!.id).toBe(candidate.id)
  expect(f.work.selectCandidate({ questionId: "other", itemId: item.id, candidateId: candidate.id }).code).toBe("work-question-mismatch")
  expect(f.work.selectCandidate({ questionId: "q", itemId: item.id, candidateId: candidate.id }).status).toBe("accepted")
  await f.work.run(empty, 2)
  const corrected = f.work.snapshot().find((w: any) => w.id === item.id)
  expect(corrected).toMatchObject({ selected: { path: "actual.ts" }, selectedBy: "explicit-discovery-selection", state: "awaiting-interpretation", semanticSupport: "unreviewed" })
  expect(f.work.snapshot().some((w: any) => w.symbol === "decoy")).toBe(false)
  expect(f.tools.evidence.some(e => e.path === "entry.ts")).toBe(true)
  expect(corrected.evidenceIds.every((id: string) => f.tools.evidence.find(e => e.id === id)?.path === "actual.ts")).toBe(true)
  expect(f.tools.toolCalls).toBe(3)
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

for (const selector of [undefined, ".", "nested"]) test(`changed source discovered with selector ${selector ?? "omitted"} blocks a previously shown location`, async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return true; }\n", "nested/actual.ts": "export function actual() { return false; }\n" }), empty = createControlSlice()
  await f.work.run(empty, 2)
  const root = f.work.snapshot().find((w: any) => w.kind === "entry")
  const args = { name: "actual", ...(selector === undefined ? {} : { path: selector }) }
  const shown = await f.tools.execute("source_symbol", args), candidate = shown.candidates[0]!
  expect(f.work.selectCandidate({ questionId: "q", itemId: root.id, candidateId: candidate.id }).status).toBe("accepted")
  await f.work.run(empty, 2)
  const evidence = structuredClone(f.tools.evidence)
  await writeFile(path.join(f.sourceRoot, "nested/actual.ts"), "export function actual() { return true; }\n")
  expect(await f.tools.execute("source_symbol", args)).toMatchObject({ status: "error", code: "source-changed" })
  await f.work.run(empty, 2)
  expect(f.work.snapshot().find((w: any) => w.id === root.id)).toMatchObject({ state: "blocked", code: "source-invalidated" })
  expect(f.tools.evidence).toEqual(evidence)
  expect(f.tools.toolCalls).toBe(4)
})

test("a recursive lexical reference becomes a named local gap and never creates repeated reads", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return follow(); }\n", "helper.ts": "export function follow() { return entry(); }\n" }), empty = createControlSlice()
  await f.work.run(empty, 2)
  const ev = f.tools.evidence[0]!.id
  const slice = mergeControlSlice(empty, { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], evidenceIds: [ev], claim: "Calls follow" }] }, f.program, { questionIds: ["q"], shownEvidenceIds: [ev] }).state
  const follow = f.work.snapshot().find((w: any) => w.symbol === "follow")
  f.work.selectCandidate({ questionId: "q", itemId: follow.id, candidateId: follow.candidates[0].id })
  await f.work.run(slice, 2)
  await f.work.run(slice, 2)
  expect(f.work.snapshot().some((w: any) => w.state === "blocked" && w.code === "reference-cycle")).toBe(true)
  expect(f.tools.toolCalls).toBe(2)
})

test("unconfirmed logging and storage references consume no reads or recursive work", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { logEvent(); return decision(); }\n", "logging.ts": "export function logEvent() { return unrelated(); }\nexport function unrelated() { return true; }\n", "helper.ts": "export function decision() { return false; }\n" })
  const empty = createControlSlice(); await f.work.run(empty, 2)
  const ev = f.tools.evidence[0]!.id
  const slice = mergeControlSlice(empty, { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], evidenceIds: [ev], claim: "Calls decision" }], dependencies: [{ key: "decision", questionId: "q", pathKey: "p", from: "entry", symbol: "decision", kind: "control", decisive: true, evidenceIds: [ev], reason: "Determine the requested outcome" }] }, f.program, { questionIds: ["q"], shownEvidenceIds: [ev] }).state
  await f.work.run(slice, 2)
  expect(f.tools.evidence.map(e => e.path)).toEqual(["entry.ts", "helper.ts"])
  expect(f.work.snapshot().find((w: any) => w.symbol === "logEvent")).toMatchObject({ state: "awaiting-binding", code: "reference-relevance-unconfirmed" })
  expect(f.work.snapshot().some((w: any) => w.symbol === "unrelated")).toBe(false)
  await f.work.run(slice, 2)
  expect(f.tools.toolCalls).toBe(2)
})

test("reference discovery stays inside the selected definition despite an overlapping wider read", async () => {
  const f = await fixture({ "entry.ts": "export function entry() {\n  return gate();\n}\nexport function neighbor() { return misleading(); }\n", "helper.ts": "export function gate() { return false; }\nexport function misleading() { return true; }\n" })
  await f.tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 4 })
  f.work.sync(createControlSlice())
  expect(f.work.snapshot().filter((w: any) => w.origin === "source-reference").map((w: any) => w.symbol)).toEqual(["gate"])
})

test("the same original definition reached through a dependency does not duplicate lexical duties", async () => {
  const f = await fixture({ "entry.ts": "export function entry() { return gate(); }\n", "helper.ts": "export function gate() { return false; }\n" })
  await f.work.run(createControlSlice(), 2)
  const root = f.work.snapshot().find((w: any) => w.kind === "entry")
  const work = api.createInquiryWorklist({ program: f.program, tools: f.tools, dependencyStates: () => [{ id: "dep", questionId: "q", symbol: "entry", reason: "The same original definition", state: "read", decisive: true, candidates: [root.selected], evidenceIds: root.evidenceIds }] })
  work.sync(createControlSlice())
  work.sync(createControlSlice())
  expect(work.snapshot().filter((w: any) => w.origin === "source-reference" && w.symbol === "gate")).toHaveLength(1)
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

test("a manually read accepted entry anchors its own ambiguous queue without inventing helper relevance", async () => {
  const f = await fixture({ "a.ts": "export function entry() { return gate(); }\n", "b.ts": "export function entry() { return false; }\n", "helper.ts": "export function gate() { return true; }\n" })
  const read = await f.tools.execute("source_read", { path: "a.ts", startLine: 1, endLine: 1 }), ev = read.evidence[0]!.id
  const slice = mergeControlSlice(createControlSlice(), { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], evidenceIds: [ev], claim: "The model declares this entry" }] }, f.program, { questionIds: ["q"], shownEvidenceIds: [ev] }).state
  await f.work.run(slice, 2)
  f.work.sync(slice)
  const root = f.work.snapshot().find((w: any) => w.kind === "entry" && w.origin === "question-duty")
  expect(root).toMatchObject({ state: "awaiting-verification", selected: { path: "a.ts" }, evidenceIds: [ev], semanticSupport: "unreviewed" })
  expect(f.work.snapshot().find((w: any) => w.symbol === "gate")).toMatchObject({ state: "awaiting-binding", code: "reference-relevance-unconfirmed" })
  expect(f.tools.toolCalls).toBe(1)
})

test("entry evidence cannot select another question or a non-entry proposal", async () => {
  const f = await fixture({ "a.ts": "export function entry() { return true; }\n", "b.ts": "export function entry() { return false; }\n" }, ["q1", "q2"].map(id => ({ id, request: "Investigate entry", entryHint: "entry", premises: [] })))
  const read = await f.tools.execute("source_read", { path: "a.ts", startLine: 1, endLine: 1 }), ev = read.evidence[0]!.id
  const slice = mergeControlSlice(createControlSlice(), { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q1", pathKey: "p", kind: "entry", after: [], evidenceIds: [ev], claim: "Entry in q1" }, { key: "guard", questionId: "q2", pathKey: "p", kind: "guard", after: [], evidenceIds: [ev], claim: "Guard in q2 is not its declared entry" }] }, f.program, { questionIds: ["q1", "q2"], shownEvidenceIds: [ev] }).state
  f.work.sync(slice)
  expect(f.work.snapshot().find((w: any) => w.questionId === "q1" && w.kind === "entry")).toMatchObject({ state: "awaiting-verification", selected: { path: "a.ts" } })
  expect(f.work.snapshot().find((w: any) => w.questionId === "q2" && w.kind === "entry")).toMatchObject({ state: "unlocated", code: "location-ambiguous" })
})

test("multiple accepted entry locations remain ambiguous and explicit selection retains priority", async () => {
  const f = await fixture({ "a.ts": "export function entry() { return true; }\n", "b.ts": "export function entry() { return false; }\n" })
  const a = (await f.tools.execute("source_read", { path: "a.ts", startLine: 1, endLine: 1 })).evidence[0]!, b = (await f.tools.execute("source_read", { path: "b.ts", startLine: 1, endLine: 1 })).evidence[0]!
  const slice = mergeControlSlice(createControlSlice(), { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], evidenceIds: [a.id, b.id], claim: "Two proposed entry locations" }] }, f.program, { questionIds: ["q"], shownEvidenceIds: [a.id, b.id] }).state
  f.work.sync(slice)
  const root = f.work.snapshot().find((w: any) => w.kind === "entry")
  expect(root).toMatchObject({ state: "unlocated", code: "location-ambiguous" })
  f.work.selectCandidate({ questionId: "q", itemId: root.id, candidateId: root.candidates.find((c: any) => c.path === "b.ts").id })
  const onlyA = { ...slice, rules: slice.rules.map(r => ({ ...r, evidenceIds: [a.id] })) }
  f.work.sync(onlyA)
  expect(f.work.snapshot().find((w: any) => w.kind === "entry")).toMatchObject({ state: "awaiting-interpretation", selected: { path: "b.ts" } })
})

test("accepted entry association is recomputed and source invalidation remains blocking", async () => {
  const f = await fixture({ "a.ts": "export function entry() { return true; }\n", "b.ts": "export function entry() { return false; }\n" })
  const a = (await f.tools.execute("source_read", { path: "a.ts", startLine: 1, endLine: 1 })).evidence[0]!, b = (await f.tools.execute("source_read", { path: "b.ts", startLine: 1, endLine: 1 })).evidence[0]!
  const slice = mergeControlSlice(createControlSlice(), { schemaVersion: "authorization-control-slice/v1", rules: [{ key: "entry", questionId: "q", pathKey: "p", kind: "entry", after: [], evidenceIds: [a.id], claim: "First location" }] }, f.program, { questionIds: ["q"], shownEvidenceIds: [a.id, b.id] }).state
  f.work.sync(slice)
  expect(f.work.snapshot().find((w: any) => w.kind === "entry").selected.path).toBe("a.ts")
  const corrected = { ...slice, rules: slice.rules.map(r => ({ ...r, evidenceIds: [b.id] })) }
  f.work.sync(corrected)
  expect(f.work.snapshot().find((w: any) => w.kind === "entry").selected.path).toBe("b.ts")
  await writeFile(path.join(f.sourceRoot, "b.ts"), "export function entry() { return true; }\n")
  await f.tools.execute("source_read", { path: "b.ts", startLine: 1, endLine: 1 })
  f.work.sync(corrected)
  expect(f.work.snapshot().find((w: any) => w.kind === "entry")).toMatchObject({ state: "blocked", code: "source-invalidated" })
})
