import { expect, test } from "bun:test"
import { mkdtemp, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createInquiryTools } from "./inquiry-tools.ts"
import { createInquiryDomainRuntime } from "./inquiry-domain-runtime.ts"
import { compileAuthorizationInquiry } from "../../task-dsl/authorization/inquiry-program.ts"

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
