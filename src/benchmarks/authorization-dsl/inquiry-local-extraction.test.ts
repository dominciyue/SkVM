import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"
import { expandLocalExtractions, localExplanationContext } from "./inquiry-local-extraction.ts"

async function fixture(questions = [{ id: "q", request: "Investigate entry. Owner is unspecified. Grants are not given.", entryHint: "entry", premises: [] }]) {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-extract-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry(owner: unknown) {\n  if (owner === null) return false;\n  return true;\n}\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions })
  const runtime: any = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync()
  return { sourceRoot, tools, program, runtime }
}
const entry = (extra = {}) => ({ op: "add", targetKey: "entry", pathKey: "p", kind: "entry", after: [], claim: "Tests the supplied owner before effects", ...extra })

test("a persistent multi-window error retains a repair slot without starving other ready questions", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-focused-fair-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() { return helper(); }\n")
  await writeFile(path.join(sourceRoot, "helper.ts"), "export function helper() { return false; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: ["a", "b", "c", "d", "e"].map(id => ({ id, request: "Inspect entry", entryHint: "entry", premises: [] })) })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync()
  const evidenceIds = [tools.evidence[0]!.id]
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [
    ...program.questions.map(q => entry({ questionId: q.id, evidenceIds })),
    entry({ questionId: "e", targetKey: "write", kind: "effect", after: ["entry"], principal: "unbound", evidenceIds }),
  ], dependencies: [{ op: "add", questionId: "e", targetKey: "helper", pathKey: "p", from: "entry", symbol: "helper", kind: "control", decisive: true, evidenceIds, reason: "Entry calls the decision helper" }] })
  const before = runtime.report().slice
  const contexts = Array.from({ length: 4 }, () => runtime.modelContext())
  expect(contexts.every(c => c.tasks.length === 2 && c.tasks[0]!.question.id === "e" && c.tasks[1]!.question.id !== "e")).toBe(true)
  expect([...new Set(contexts.map(c => c.tasks[1]!.question.id))].sort()).toEqual(["a", "b", "c", "d"])
  expect(runtime.report().slice).toEqual(before)
  expect(tools.toolCalls).toBe(2)
})

test("persistent decisive location work rotates across all questions without reading or selecting candidates", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-decisive-fair-"))
  for (const file of ["a.py", "b.py"]) await writeFile(path.join(sourceRoot, file), "def entry():\n    return False\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: ["a", "b", "c", "d", "e"].map(id => ({ id, request: "Inspect entry", entryHint: "entry", premises: [] })) })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync()
  const contexts = Array.from({ length: 3 }, () => runtime.modelContext())
  expect(contexts.every(c => c.locationTasks.length === 2 && c.tasks.length === 0)).toBe(true)
  expect([...new Set(contexts.flatMap(c => c.locationTasks.map(t => t.question.id)))].sort()).toEqual(["a", "b", "c", "d", "e"])
  expect(runtime.report().worklist!.items.every(w => !w.selected)).toBe(true)
  expect(tools.toolCalls).toBe(0)
})

test("an incompletely read broad entry exposes existing alternatives for explicit refinement", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-refine-entry-"))
  await writeFile(path.join(sourceRoot, "entry.py"), ["class Container:", "    def entry(self):", "        return False", "    def other(self):", "        return True", ...Array.from({ length: 400 }, (_, n) => `    value_${n} = ${n}`)].join("\n") + "\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry in Container", entryHint: "Container entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync()
  const initial = runtime.modelContext().locationTasks[0]!
  const broad = initial.candidates.find(c => c.name === "Container")!, narrow = initial.candidates.find(c => c.name === "entry")!
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", workSelections: [{ questionId: "q", itemId: initial.itemId, candidateId: broad.id }] })
  const context: any = runtime.modelContext(), refinement = context.locationTasks.find((t: any) => t.itemId === initial.itemId)
  expect(refinement).toMatchObject({ nextAction: { kind: "select-candidate" }, candidateRefinement: { selectedCandidateId: broad.id } })
  expect(refinement.candidates.map((c: any) => c.id)).toEqual(initial.candidates.map(c => c.id))
  expect(context.tasks).toEqual([])
  expect(runtime.report().worklist!.items.find(w => w.id === initial.itemId)!.selected!.id).toBe(broad.id)
  expect(runtime.report().slice.rules).toEqual([])
  const calls = tools.toolCalls
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", workSelections: [{ questionId: "q", itemId: initial.itemId, candidateId: narrow.id }] })
  expect(runtime.modelContext().tasks[0]!.itemId).toBe(initial.itemId)
  expect(tools.toolCalls).toBe(calls)
})

test("a bounded explanation uses a whole original covering window instead of its larger duplicate", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-window-fit-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), [...Array.from({ length: 40 }, () => "// 汉字 original padding"), "export function entry() {", "  return false;", "}", ...Array.from({ length: 40 }, () => "// more original padding")].join("\n") + "\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", entryHint: "entry", premises: [] }] })
  const runtime: any = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync()
  const original = structuredClone(tools.evidence[0]!)
  await tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 83 })
  const before = runtime.report().slice, context = runtime.modelContext({ maxSourceBytes: original.bytes })
  expect(context.sourceWindows).toEqual([(({ quote, ...window }) => window)(original)])
  expect(context.tasks[0].evidenceIds).toEqual([original.id])
  expect(context.evidenceCatalog.map((e: any) => e.id)).toEqual(tools.evidence.map(e => e.id))
  expect(context.sourceBudget).toMatchObject({ limitBytes: original.bytes, shownBytes: original.bytes, deferredWindowCount: 1 })
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry()] }] })
  expect(runtime.report().slice.rules[0].evidenceIds).toEqual([original.id])
  expect(before.rules).toEqual([])
  expect(tools.evidence[0]).toEqual(original)
  expect(tools.toolCalls).toBe(2)
})

test("zero remaining window budget withdraws local offers while retaining prior evidence references", async () => {
  const f = await fixture(), offered = f.runtime.modelContext().tasks[0]
  const context = f.runtime.modelContext({ maxSourceBytes: 0 })
  expect(context.tasks).toEqual([])
  expect(context.sourceWindows).toEqual([])
  expect(context.evidenceCatalog.map((e: any) => e.id)).toEqual(f.tools.evidence.map(e => e.id))
  expect(context.deferredTasks).toContainEqual(expect.objectContaining({ itemId: offered.itemId, questionId: "q", reason: "source-window-budget" }))
  const rejected = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: offered.itemId, rules: [entry()] }] })
  expect(rejected.diagnostics.some((d: any) => d.code === "local-work-not-offered")).toBe(true)
  expect(f.runtime.report().slice.rules).toEqual([])
  const accepted = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [entry({ questionId: "q", evidenceIds: [f.tools.evidence[0]!.id] })] })
  expect(accepted.accepted).toHaveLength(1)
  expect(f.tools.toolCalls).toBe(1)
})

test("inconsistent candidate or callsite coverage cannot authorize a local explanation", async () => {
  const f = await fixture(), items = f.runtime.report().worklist.items
  const original = structuredClone(items.find((i: any) => i.id === "q::entry")), slice = f.runtime.report().slice
  const selected = original.selected
  for (const changed of [{ ...selected, path: "other.ts" }, { ...selected, sha256: "different-source" }, { ...selected, endLine: selected.endLine + 1 }]) {
    const item = { ...original, selected: changed }
    const context = localExplanationContext(f.program, [item], f.tools.evidence, slice, [], [])
    expect(context.tasks).toEqual([])
    expect(context.evidenceCatalog.map(e => e.id)).toEqual(f.tools.evidence.map(e => e.id))
    expect(expandLocalExtractions([{ itemId: item.id, rules: [entry()] }], context.tasks, [item]).rejected[0]!.diagnostics[0]!.code).toBe("local-work-not-offered")
  }
  const parent = { ...original, id: "parent", state: "closed", selected: { ...selected, path: "other.ts" } }
  const helper = { ...original, origin: "source-reference", parentId: parent.id, callsiteEvidenceIds: [...original.evidenceIds] }
  const context = localExplanationContext(f.program, [parent, helper], f.tools.evidence, slice, [], [])
  expect(context.tasks).toEqual([])
  expect(f.runtime.report().worklist.items).toEqual(items)
  expect(f.tools.toolCalls).toBe(1)
})

test("unchanged read explanation work rotates across all questions without repeating source actions", async () => {
  const f = await fixture(["a", "b", "c", "d", "e"].map(id => ({ id, request: "Investigate entry", entryHint: "entry", premises: [] })))
  const evidenceIds = [f.tools.evidence[0]!.id]
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: f.program.questions.map((q: any) => entry({ questionId: q.id, evidenceIds })) })
  const before = f.runtime.report().slice
  const contexts = [f.runtime.modelContext(), f.runtime.modelContext(), f.runtime.modelContext()]
  expect(contexts.every(c => c.tasks.length <= 2)).toBe(true)
  expect([...new Set(contexts.flatMap(c => c.tasks.map((t: any) => t.question.id)))].sort()).toEqual(["a", "b", "c", "d", "e"])
  expect(contexts.flatMap(c => c.sourceWindows).every(w => w.text === f.tools.evidence[0]!.text)).toBe(true)
  expect(f.runtime.report().slice).toEqual(before)
  expect(f.tools.toolCalls).toBe(1)
})

test("a third-question object diagnostic focuses its own shared-window explanation before final", async () => {
  const f = await fixture(["a", "b", "c"].map(id => ({ id, request: "Investigate entry", entryHint: "entry", premises: [] })))
  const evidenceIds = [f.tools.evidence[0]!.id]
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [
    ...f.program.questions.map((q: any) => entry({ questionId: q.id, evidenceIds })),
    entry({ questionId: "c", targetKey: "write", kind: "effect", after: ["entry"], principal: "visitor", evidenceIds }),
  ] })
  expect(f.runtime.modelFeedback().diagnostics).toContainEqual(expect.objectContaining({ code: "object-binding-missing", questionId: "c" }))
  const context = f.runtime.modelContext()
  expect(context.tasks[0].question.id).toBe("c")
  expect(context.tasks[0].evidenceIds).toEqual(evidenceIds)
  expect(f.runtime.report().check).toBeUndefined()
  expect(f.tools.toolCalls).toBe(1)
})

test("an explicit diagnostic question takes precedence when its rule key names another question", async () => {
  const f = await fixture(["a", "b"].map(id => ({ id, request: "Investigate entry", entryHint: "entry", premises: [] })))
  const evidenceIds = [f.tools.evidence[0]!.id]
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [
    ...f.program.questions.map((q: any) => entry({ questionId: q.id, evidenceIds })),
    entry({ questionId: "b", targetKey: "a", kind: "effect", after: ["entry"], principal: "visitor", evidenceIds }),
  ] })
  expect(f.runtime.modelFeedback().diagnostics).toContainEqual(expect.objectContaining({ path: "a", questionId: "b" }))
  expect(f.runtime.modelContext().tasks[0].question.id).toBe("b")
  expect(f.runtime.report().check).toBeUndefined()
})

test("an interpreted parent's lexical leads are offered for explicit read intent without automatically reading unrelated helpers", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-reference-focus-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() { logEvent(); return decision(); }\n")
  await writeFile(path.join(sourceRoot, "helpers.ts"), "export function logEvent() { return true; }\nexport function decision() { return false; }\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", entryHint: "entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync(); runtime.modelContext()
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry()] }] })
  const context = runtime.modelContext()
  const lead = context.locationTasks.find(t => t.duty.symbol === "decision")
  expect(lead).toMatchObject({ code: "reference-relevance-unconfirmed", nextAction: { kind: "select-candidate" }, callsiteEvidenceIds: [tools.evidence[0]!.id], semanticSupport: "unreviewed" })
  expect(context.tasks.map(t => t.itemId)).not.toContain(lead!.itemId)
  expect(tools.toolCalls).toBe(1)
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", workSelections: [{ questionId: "q", itemId: lead!.itemId, candidateId: lead!.candidates[0]!.id }] })
  expect(tools.toolCalls).toBe(2)
  expect(runtime.modelContext().tasks.some(t => t.itemId === lead!.itemId)).toBe(true)
  expect(runtime.report().worklist!.items.find(w => w.symbol === "logEvent")!.code).toBe("reference-relevance-unconfirmed")
  expect(runtime.report().slice.rules).toHaveLength(1)
})

test("source catalog references retain all original IDs and ranges with bounded repeated metadata", async () => {
  const f = await fixture()
  await f.tools.execute("source_search", { text: "return" })
  const context: ReturnType<ReturnType<typeof createInquiryDomainRuntime>["modelContext"]> = f.runtime.modelContext()
  const fullMetadata = f.tools.evidence.map(({ quote, text, ...metadata }) => metadata)
  expect(context.evidenceCatalog.map(e => [e.id, e.path, e.startLine, e.endLine])).toEqual(fullMetadata.map(e => [e.id, e.path, e.startLine, e.endLine]))
  expect(Buffer.byteLength(JSON.stringify(context.evidenceCatalog))).toBeLessThan(Buffer.byteLength(JSON.stringify(fullMetadata)) * 0.6)
  for (const window of context.sourceWindows) expect(window).toMatchObject({ sha256: f.tools.evidence.find(e => e.id === window.id)!.sha256, text: f.tools.evidence.find(e => e.id === window.id)!.text })
})

test("unchanged optional lexical leads rotate through the bounded context without consuming reads", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-reference-fair-"))
  await writeFile(path.join(sourceRoot, "entry.ts"), "export function entry() { first(); second(); return third(); }\n")
  await writeFile(path.join(sourceRoot, "helpers.ts"), ["first", "second", "third"].map(name => `export function ${name}() { return false; }`).join("\n") + "\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "q", request: "Inspect entry", entryHint: "entry", premises: [] }] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync(); runtime.modelContext()
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry()] }] })
  const contexts = [runtime.modelContext(), runtime.modelContext(), runtime.modelContext()]
  expect(contexts.every(c => c.locationTasks.length === 2)).toBe(true)
  expect([...new Set(contexts.flatMap(c => c.locationTasks.map(t => t.duty.symbol)))].sort()).toEqual(["first", "second", "third"])
  expect(tools.toolCalls).toBe(1)
  expect(runtime.report().slice.rules).toHaveLength(1)
})

test("bounded location tasks expose ambiguous entries and missing locations before any source interpretation", async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), "ar-locate-"))
  await writeFile(path.join(sourceRoot, "a.py"), "def entry():\n    return True\n")
  await writeFile(path.join(sourceRoot, "b.py"), "def entry():\n    return False\n")
  const tools = await createInquiryTools({ sourceRoot, repository: "neutral", sourceRef: "fixed", allowedPaths: ["."] })
  const program = compileAuthorizationInquiry({ schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [
    ...["a", "b"].map(id => ({ id, request: "Inspect entry", entryHint: "entry", premises: [] })),
    { id: "missing", request: "Inspect an unavailable endpoint", entryHint: "unindexed", premises: [] },
  ] })
  const runtime = createInquiryDomainRuntime({ program, tools, strategy: "guided-evidence-v2" })
  await runtime.sync()
  const context: any = runtime.modelContext()
  expect(context.tasks).toEqual([])
  expect(context.locationTasks.map((t: any) => t.question.id)).toEqual(["a", "b"])
  expect(context.locationTasks[0]).toMatchObject({ itemId: "a::entry", code: "location-ambiguous", nextAction: { kind: "select-candidate" }, semanticSupport: "unreviewed" })
  expect(context.locationTasks[0].candidates).toHaveLength(2)
  expect(context.sourceWindows).toEqual([])
  expect(tools.toolCalls).toBe(0)
  const candidateId = context.locationTasks[0].candidates[0].id
  const rejected = await runtime.propose({ schemaVersion: "authorization-control-update/v1", workSelections: [{ questionId: "b", itemId: "a::entry", candidateId }], localExtractions: [{ itemId: "a::entry", rules: [entry()] }] })
  expect(rejected.diagnostics.some(d => d.code === "work-question-mismatch")).toBe(true)
  expect(rejected.diagnostics.some(d => d.code === "local-work-not-offered")).toBe(true)
  expect(tools.toolCalls).toBe(0)
  expect(runtime.report().slice.rules).toEqual([])
  const selected = await runtime.propose({ schemaVersion: "authorization-control-update/v1", workSelections: [{ questionId: "a", itemId: "a::entry", candidateId }] })
  expect(selected.diagnostics).toEqual([])
  expect(tools.toolCalls).toBe(1)
  const next: any = runtime.modelContext()
  expect(next.tasks[0]).toMatchObject({ itemId: "a::entry", question: { id: "a" }, semanticSupport: "unreviewed" })
  expect(next.locationTasks.map((t: any) => t.question.id)).toEqual(["b", "missing"])
  expect(next.locationTasks[1]).toMatchObject({ code: "location-missing", nextAction: { kind: "locate" }, candidates: [] })
  expect(next.sourceWindows[0].text).toBe(tools.evidence[0]!.text)
  await runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "a::entry", rules: [entry()] }] })
  expect(runtime.report().slice.rules.map(r => r.questionId)).toEqual(["a"])
  expect(runtime.report().check).toBeUndefined()
  expect(runtime.report().worklist!.items.find(w => w.id === "a::entry")!.state).toBe("awaiting-verification")
})

test("a binding duty misfiled as a rule receives group guidance and remains rejected", async () => {
  const f = await fixture(); f.runtime.modelContext()
  const rejected = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry({ targetKey: "doc", kind: "resource-binding" })] }] })
  expect(rejected.diagnostics.find((d: any) => d.path.endsWith("doc.kind")).message).toContain("sourceBindings")
  expect(f.runtime.report().slice.rules).toEqual([])
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", sourceBindings: [{ op: "add", targetKey: "doc", pathKey: "p", after: [], claim: "Addressed original resource", bindingKey: "document", bindingKind: "resource" }] }] })
  expect(f.runtime.report().slice.rules[0]).toMatchObject({ kind: "binding", bindingKey: "document", bindingKind: "resource" })
})

test("current local explanation carries original windows and the host binds question and citations", async () => {
  const f = await fixture(), context = f.runtime.modelContext()
  expect(context.tasks).toHaveLength(1)
  expect(context.tasks[0]).toMatchObject({ itemId: "q::entry", question: { id: "q" }, evidenceIds: [f.tools.evidence[0]!.id] })
  expect(context.sourceWindows[0]!.text).toBe(f.tools.evidence[0]!.text)
  expect(context.evidenceCatalog[0]).not.toHaveProperty("text")
  const applied = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry()] }] })
  expect(applied.diagnostics).toEqual([])
  expect(f.runtime.report().slice.rules[0]).toMatchObject({ questionId: "q", evidenceIds: [f.tools.evidence[0]!.id], key: "entry" })
  expect(f.runtime.report().localExtractions[0]).toMatchObject({ itemId: "q::entry", semanticSupport: "unreviewed" })
})

test("a malformed local item cannot override host scope or erase a valid sibling", async () => {
  const f = await fixture(); f.runtime.modelContext()
  const applied = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry({ targetKey: "good" }), entry({ targetKey: "wrong", questionId: "other", evidenceIds: ["invented"] })] }] })
  expect(f.runtime.report().slice.rules.map((r: any) => r.key)).toEqual(["good"])
  expect(applied.diagnostics.some((d: any) => d.code === "local-extraction-schema")).toBe(true)
  expect(f.runtime.feedback().diagnostics.some((d: any) => d.path.includes("wrong"))).toBe(true)
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry({ targetKey: "wrong" })] }] })
  expect(f.runtime.feedback().diagnostics).toEqual([])
})

test("source null branches do not supply an unknown user value and malformed known null remains local", async () => {
  const f = await fixture(); f.runtime.modelContext()
  const applied = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry()], premiseValues: [{ op: "add", targetKey: "owner", status: "known", value: null, text: "Owner is unspecified." }, { op: "add", targetKey: "grants", status: "unspecified", text: "Grants are not given." }] }] })
  expect(f.runtime.report().slice.bindings).toEqual([])
  expect(f.runtime.report().slice.rules).toHaveLength(1)
  expect(applied.diagnostics.some((d: any) => d.code === "premise-value-unspecified")).toBe(true)
})

test("local interpretation only admits an offered current WorkItem and cannot target another question", async () => {
  const f = await fixture(); f.runtime.modelContext()
  const applied = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "other::entry", rules: [entry()] }] })
  expect(f.runtime.report().slice.rules).toEqual([])
  expect(applied.diagnostics.some((d: any) => d.code === "local-work-not-offered")).toBe(true)
})

test("two questions sharing a source window retain separate host extraction scope", async () => {
  const f = await fixture(["a", "b"].map(id => ({ id, request: "Investigate entry", entryHint: "entry", premises: [] })))
  const context = f.runtime.modelContext()
  expect(context.tasks.map((t: any) => t.question.id)).toEqual(["a", "b"])
  expect(context.sourceWindows).toHaveLength(1)
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: context.tasks.map((t: any) => ({ itemId: t.itemId, rules: [entry()] })) })
  expect(f.runtime.report().slice.rules.map((r: any) => r.questionId)).toEqual(["a", "b"])
})

test("an actual source change invalidates an offered extraction rather than accepting its old window", async () => {
  const f = await fixture(); f.runtime.modelContext()
  await writeFile(path.join(f.sourceRoot, "entry.ts"), "export function entry() { return false; }\n")
  await f.tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })
  const applied = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry()] }] })
  expect(f.runtime.report().slice.rules).toEqual([])
  expect(applied.diagnostics.some((d: any) => d.code === "local-source-invalidated")).toBe(true)
})

test("atomic local extraction rolls back valid siblings when another item fails its host-bound schema", async () => {
  const f = await fixture(); f.runtime.modelContext()
  const applied = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", atomic: true, localExtractions: [{ itemId: "q::entry", rules: [entry(), entry({ targetKey: "bad", questionId: "other" })] }] })
  expect(applied.accepted).toEqual([])
  expect(f.runtime.report().slice.rules).toEqual([])
  expect(applied.rejected.some((r: any) => r.targetKey === "entry" && r.diagnostics[0].code === "atomic-control-rejected")).toBe(true)
})

test("explicit user null and absent grants remain known values independently of source identity nodes", async () => {
  const f = await fixture([{ id: "q", request: "Investigate entry. Owner is null. Grants are absent.", entryHint: "entry", premises: [] }]); f.runtime.modelContext()
  const applied = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", sourceBindings: [{ op: "add", targetKey: "doc", pathKey: "p", after: [], claim: "Addressed resource", bindingKey: "document", bindingKind: "resource" }], premiseValues: [{ op: "add", targetKey: "owner", status: "known", value: null, text: "Owner is null." }, { op: "add", targetKey: "grants", status: "known", value: false, text: "Grants are absent." }] }] })
  expect(applied.diagnostics).toEqual([])
  expect(f.runtime.report().slice.bindings.map((b: any) => b.value)).toEqual([null, false])
  expect(f.runtime.report().slice.rules[0]).toMatchObject({ kind: "binding", bindingKind: "resource", bindingKey: "document" })
})

test("explicitly rerequested old evidence reenters the current windows even when its stable ID is reused", async () => {
  const f = await fixture([{ id: "q", request: "Inspect allowed original windows", entryHint: "unindexed", premises: [] }])
  for (const line of [1, 2, 3, 4]) await f.tools.execute("source_read", { path: "entry.ts", startLine: line, endLine: line })
  expect(f.runtime.modelContext().sourceWindows.map((e: any) => e.startLine)).toEqual([1, 2, 3, 4])
  await f.tools.execute("source_read", { path: "entry.ts", startLine: 1, endLine: 1 })
  expect(f.tools.evidence).toHaveLength(4)
  expect(f.runtime.modelContext().sourceWindows.some((e: any) => e.startLine === 1)).toBe(true)
})

test("an interpreted entry remains available for local completion until its graph is checked", async () => {
  const f = await fixture(); f.runtime.modelContext()
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry()] }] })
  const context = f.runtime.modelContext()
  expect(context.tasks.map((t: any) => t.itemId)).toContain("q::entry")
  expect(context.sourceWindows[0].text).toBe(f.tools.evidence[0]!.text)
  const completed = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry({ targetKey: "stop", kind: "reject", after: ["entry"], complete: true })] }] })
  expect(completed.diagnostics).toEqual([])
  const checked = await f.runtime.validate({ schemaVersion: "authorization-inquiry-result/v1", questions: [{ questionId: "q", behavior: { disposition: "deny", explanation: "Proposed complete rejection" }, evidenceIds: [f.tools.evidence[0]!.id], branches: [], missing: [] }], observations: [], scope: "local" })
  expect(checked.ruleConsistency).toBe(true)
  expect(f.runtime.modelContext().tasks.map((t: any) => t.itemId)).not.toContain("q::entry")
})

test("an accepted same-question correction clears a prior local envelope failure but not item errors or another question", async () => {
  const f = await fixture(["a", "b", "c"].map(id => ({ id, request: "Investigate entry", entryHint: "entry", premises: [] })))
  expect(f.runtime.modelContext().tasks.map((t: any) => t.itemId)).not.toContain("c::entry")
  const failed = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "c::entry", rules: [entry()] }] })
  expect(failed.diagnostics.some((d: any) => d.code === "local-work-not-offered")).toBe(true)
  const evidenceIds = [f.tools.evidence[0]!.id]
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [entry({ questionId: "a", evidenceIds }), entry({ questionId: "c", targetKey: "bad", evidenceIds: ["invented"] })] })
  expect(f.runtime.feedback().diagnostics.some((d: any) => d.code === "local-work-not-offered")).toBe(true)
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [entry({ questionId: "c", evidenceIds })] })
  expect(f.runtime.feedback().diagnostics.some((d: any) => d.code === "local-work-not-offered")).toBe(false)
  expect(f.runtime.feedback().diagnostics.some((d: any) => d.code === "evidence-not-shown")).toBe(true)
  expect(f.runtime.report().localExtractions[0].diagnostics[0].code).toBe("local-work-not-offered")
})

test("new source interpretation precedes revisiting already interpreted questions", async () => {
  const f = await fixture(["a", "b", "c"].map(id => ({ id, request: "Investigate entry", entryHint: "entry", premises: [] })))
  const tasks = f.runtime.modelContext().tasks
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: tasks.map((t: any) => ({ itemId: t.itemId, rules: [entry()] })) })
  expect(f.runtime.modelContext().tasks[0].itemId).toBe("c::entry")
})

test("local schema feedback names the mechanical repair without inventing a dependency operation", async () => {
  const f = await fixture(); f.runtime.modelContext()
  const dependency = { targetKey: "helper", pathKey: "p", from: "entry", symbol: "entry", kind: "control", decisive: true, reason: "Inspect the called control" }
  const result = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry()], dependencies: [dependency, { ...dependency, targetKey: "cited", op: "add", evidenceIds: ["invented"] }] }] })
  expect(result.diagnostics.find((d: any) => d.path.endsWith("helper.op")).message).toContain("add for a new target")
  expect(result.diagnostics.find((d: any) => d.path.includes("cited")).message).toContain("host binds")
  expect(f.runtime.report().slice.dependencies).toEqual([])
  expect(f.runtime.report().slice.rules).toHaveLength(1)
})
test("rejected target feedback retains the exact local draft and host scope until same-key correction", async () => {
  const f = await fixture(); f.runtime.modelContext()
  const { pathKey, ...badEntry } = entry()
  const badBinding = { op: "add", targetKey: "doc", pathKey: "p", claim: "The addressed resource", bindingKey: "document", bindingKind: "resource" }
  const delta = { schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [badEntry], sourceBindings: [badBinding] }] }
  await f.runtime.propose(delta)
  const original = f.runtime.report().proposals[0].delta
  const feedback = f.runtime.modelFeedback()
  expect(feedback.rejectedTargetCount).toBe(2)
  expect(feedback.rejectedTargets).toContainEqual(expect.objectContaining({ group: "rules", questionId: "q", targetKey: "entry", submitted: badEntry, acceptedTarget: false, correctionOp: "add", withdrawalEligible: true, localScope: { itemId: "q::entry", evidenceIds: [f.tools.evidence[0]!.id] } }))
  expect(feedback.rejectedTargets).toContainEqual(expect.objectContaining({ group: "sourceBindings", questionId: "q", targetKey: "doc", submitted: badBinding, diagnostics: [expect.objectContaining({ path: "sourceBindings.q.doc.after" })] }))
  expect(feedback.rejectedTargets[0].submitted).not.toHaveProperty("pathKey")
  feedback.rejectedTargets[0].submitted.claim = "Changed external view"
  expect(f.runtime.report().proposals[0].delta).toEqual(original)
  expect(f.runtime.report().slice.rules).toEqual([])
  f.runtime.modelContext()
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [entry()], sourceBindings: [{ ...badBinding, after: ["entry"] }] }] })
  expect(f.runtime.modelFeedback().rejectedTargets).toEqual([])
  expect(f.runtime.report().slice.rules.map((r: any) => r.key)).toEqual(["entry", "doc"])
  expect(f.runtime.report().proposals[0].delta).toEqual(original)
})
test("bounded rejected target feedback rotates question and group identities without erasing failures", async () => {
  const f = await fixture(["q", "other"].map(id => ({ id, request: "Investigate entry", entryHint: "entry", premises: [] })))
  const evidenceIds = [f.tools.evidence[0]!.id]
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [entry({ questionId: "q", evidenceIds })] })
  const invalid = Array.from({ length: 6 }, (_, i) => entry({ questionId: i < 3 ? "q" : "other", targetKey: `bad-${i % 3}`, evidenceIds: ["unshown"] }))
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", rules: [...invalid, entry({ questionId: "q", op: "replace", evidenceIds: ["unshown"] })], sourceBindings: [{ op: "add", questionId: "q", targetKey: "entry", pathKey: "p", after: [], evidenceIds, claim: "Wrong group", bindingKey: "doc", bindingKind: "resource" }] })
  const before = f.runtime.report()
  const views = [f.runtime.modelFeedback(), f.runtime.modelFeedback()]
  expect(views.every(v => v.rejectedTargets.length <= 4 && v.rejectedTargetCount === 8)).toBe(true)
  const targets = views.flatMap(v => v.rejectedTargets)
  expect(new Set(targets.map(t => `${t.group}.${t.questionId}.${t.targetKey}`)).size).toBe(8)
  expect(targets.find(t => t.group === "rules" && t.targetKey === "entry")).toMatchObject({ acceptedTarget: true, correctionOp: "replace", withdrawalEligible: false })
  expect(targets.find(t => t.group === "sourceBindings")).toMatchObject({ acceptedTarget: false, targetGroupConflict: true, withdrawalEligible: false })
  expect(f.runtime.report().slice).toEqual(before.slice)
  expect(f.runtime.report().currentRejections).toEqual(before.currentRejections)
  expect(f.tools.toolCalls).toBe(1)
})
test("oversized rejected submissions keep an archive pointer instead of truncating semantic content", async () => {
  const f = await fixture(); f.runtime.modelContext()
  const { pathKey, ...badEntry } = entry({ claim: "汉".repeat(9000) })
  await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [badEntry] }] })
  const feedback = f.runtime.modelFeedback()
  expect(Buffer.byteLength(JSON.stringify(feedback.rejectedTargets))).toBeLessThanOrEqual(16384)
  expect(feedback.rejectedTargets[0]).toMatchObject({ group: "rules", questionId: "q", targetKey: "entry", submittedOmitted: "feedback-byte-limit", archive: { proposalIndex: 0, localExtractionIndex: 0, group: "rules", itemIndex: 0 } })
  expect(feedback.rejectedTargets[0]).not.toHaveProperty("submitted")
  expect(f.runtime.report().localExtractions[0].raw).toMatchObject({ rules: [badEntry] })
  expect(f.runtime.report().slice.rules).toEqual([])
})
test("missing path and predecessor feedback explains required semantics without supplying values", async () => {
  const f = await fixture(); f.runtime.modelContext()
  const { pathKey, ...badEntry } = entry()
  const result = await f.runtime.propose({ schemaVersion: "authorization-control-update/v1", localExtractions: [{ itemId: "q::entry", rules: [badEntry], sourceBindings: [{ op: "add", targetKey: "doc", pathKey: "p", claim: "Resource", bindingKey: "doc", bindingKind: "resource" }] }] })
  expect(result.diagnostics.find((d: any) => d.path.endsWith("pathKey")).message).toContain("proposed behavior path")
  expect(result.diagnostics.find((d: any) => d.path.endsWith("doc.after")).message).toContain("explicit predecessor")
  expect(f.runtime.report().slice.rules).toEqual([])
})
