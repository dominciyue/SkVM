import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import * as authors from "./authors.ts"
import { sha, plannedPositions } from "./study.ts"
import { ordinaryInvocation } from "./ordinary.ts"

const original = { schemaVersion: "authorization-inquiry-input/v1", taskId: "anonymous", repository: "fixture", sourceRef: "fixed", sourceRoot: "source", allowedPaths: ["."], brief: "May a visitor reserve an exhibit? Include endpoint controls, inherited paths and validation, policy comparison and missing facts.", mode: "conformance", policy: { text: "Only the exact exhibit reviewer may reserve it.", origin: "user", location: "public-policy" } }
const draft = { schemaVersion: "authorization-inquiry-input/v1", taskId: original.taskId, repository: original.repository, sourceRef: original.sourceRef, sourceRoot: "source", allowedPaths: original.allowedPaths, inquiry: { schemaVersion: "authorization-inquiry/v2", mode: "conformance", operations: [{ id: "reserve", request: "Inspect reserving an exhibit" }], questions: [{ id: "behavior", operationId: "reserve", intent: "behavior", request: original.brief, premises: [] }], policy: original.policy } }
test("author sees natural requirements and mechanical metadata, without host-written target questions or source meaning", () => {
  const metadata = (authors as any).authorMetadata(original), invocation = (authors as any).authorInvocation({ metadata, model: "fixture/model", skill: "original/SKILL.md", workDir: "work" })
  expect(metadata).not.toHaveProperty("inquiry")
  expect(metadata).not.toHaveProperty("questions")
  expect(metadata.request).toBe(original.brief)
  expect(invocation.prompt).toContain("Reporting responsibilities are not separate operations")
  expect(invocation.args).toContain("--max-steps=12")
  expect(invocation.args).toContain("--skill=original/SKILL.md")
})
test("author validation rejects a substituted policy, old declaration or changed copied-source identity", () => {
  const metadata = (authors as any).authorMetadata(original), files = [{ path: "entry.py", sha256: "fixed", bytes: 10 }], check = { status: "valid", input: draft, sourceFiles: files }
  const assess = (value: any) => (authors as any).authorIdentityDiagnostics(value, metadata, "work/inquiry.json", path.resolve("work/source"), files)
  expect(assess(check)).toEqual([])
  expect(assess({ ...check, input: { ...draft, inquiry: { ...draft.inquiry, policy: { ...original.policy, text: "Another policy" } } } }).map((d: any) => d.code)).toContain("author-independent-policy-mismatch")
  expect(assess({ ...check, input: { ...draft, inquiry: { ...draft.inquiry, schemaVersion: "authorization-inquiry/v1" } } }).map((d: any) => d.code)).toContain("author-operation-declaration-missing")
  expect(assess({ ...check, sourceFiles: [{ ...files[0], sha256: "changed" }] }).map((d: any) => d.code)).toContain("author-source-identity-mismatch")
})
test("consumer binds author variant, original input, complete skill and both exact output byte identities", () => {
  const position = plannedPositions().find(p => p.id === "author-paperless-share-create-original")!, expected = { row: position, originalInputSha256: "input", bundleSha256: "bundle", inputSha256: "draft", usageSha256: "usage" }, claim = { row: { ...position, method: "D1", strategy: "operation-evidence-v1" }, originalInputSha256: "input", completeSkillBundle: { bundleSha256: "bundle" } }, report = { status: "completed", sourceSkillUnmodified: true, sourceUnmodified: true, installedSkillVerified: true, authoredArtifacts: { inputSha256: "draft", usageSha256: "usage" } }
  const verify = (identity: any) => (authors as any).assertAuthorConsumerIdentity(claim, report, identity)
  expect(() => verify(expected)).not.toThrow()
  for (const key of ["originalInputSha256", "bundleSha256", "inputSha256", "usageSha256"]) expect(() => verify({ ...expected, [key]: "different" })).toThrow()
  expect(() => verify({ ...expected, row: { ...position, variant: "changed" } })).toThrow()
})
test("portable consumer keeps original draft and usage bytes with sourceRoot untouched, then uses complete skill ordinary run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "au-author-consume-")), source = path.join(root, "author/source"), output = path.join(root, "consumer")
  await mkdir(source, { recursive: true }); await writeFile(path.join(source, "entry.py"), "def reserve():\n    return False\n")
  const raw = Buffer.from(JSON.stringify({ ...draft, sourceRoot: "./source" }, null, 3) + "\n"), usage = Buffer.from("# Usage\nPreserve source scope and original skill duties.\n")
  const prepared = await (authors as any).prepareConsumerBytes({ input: raw, usage, context: { repository: original.repository, sourceRef: original.sourceRef, sourceRoot: source, allowedPaths: original.allowedPaths }, output })
  expect(await readFile(prepared.scopeFile)).toEqual(raw)
  expect(await readFile(path.join(output, "portable/USAGE.md"))).toEqual(usage)
  expect(prepared.sha256).toBe(sha(raw))
  const manifest = { testedModel: "fixture/model", budgets: { maxDispatches: 24, maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, maxTokens: 6000, sessionTimeoutMs: 1200000 } }
  const invocation = ordinaryInvocation({ row: { ...plannedPositions().find(p => p.id === "consume-paperless-share-create-original")!, method: "D1", strategy: "operation-evidence-v1", components: [] } as any, manifest, value: draft, naturalBrief: original.brief, skill: "original/SKILL.md", scopeFile: prepared.scopeFile, traceFile: "trace.json", workDir: "work" } as any)
  expect(invocation.prompt.startsWith(original.brief + "\n")).toBe(true)
  expect(invocation.args).toContain("--authorization-method=D1")
  expect(invocation.args).toContain("--skill=original/SKILL.md")
})
test("unreviewed or unfaithful authors cannot become qualified consumers, and zero-call refusal preserves unknowns", () => {
  const assess = (authors as any).authorConsumerAdmission, evaluation = { schemaVersion: "au-independent-author-evaluation/v1", sha256: "report-sha", authorCoverage: "faithful", targetExecutionAudit: { verified: true, targetExecutions: 0 } }
  expect(assess(evaluation, "report-sha").eligible).toBe(true)
  for (const invalid of [undefined, { ...evaluation, authorCoverage: "partial" }, { ...evaluation, sha256: "changed" }, { ...evaluation, targetExecutionAudit: { verified: false, targetExecutions: null } }]) {
    expect(assess(invalid, "report-sha").eligible).toBe(false)
    expect(assess(invalid, "report-sha").providerCalls).toBe(0)
  }
})

test("author delivery distinguishes root files, the inquiry JSON member and consumer checks from temporary author restrictions", () => {
  const invocation = authors.authorInvocation({ metadata: authors.authorMetadata(original), model: "fixture/model", skill: "original/SKILL.md", workDir: "work", repair: true })
  expect(invocation.prompt).toContain("work-directory root")
  expect(invocation.prompt).toContain("JSON member named inquiry")
  expect(invocation.prompt).toContain("consumer may use the published source-reading and deterministic authorization-check tools")
  expect(invocation.prompt).toContain("restrictions apply only to this authoring session")
  expect(invocation.prompt).toContain("prior-draft/inquiry.json")
})

async function retainedDraftFixture(options: { nested?: boolean; results?: boolean; changed?: boolean; ambiguous?: boolean; escaped?: boolean; unknown?: boolean } = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), "au-author-field-repair-")), previous = path.join(base, "previous"), oldWork = path.join(base, "old-work"), workDir = path.join(base, "repair"), raw = Buffer.from(JSON.stringify(draft, null, 3) + "\n"), usage = Buffer.from("# Usage\r\nOriginal model wording.\r\n")
  await mkdir(previous, { recursive: true }); await mkdir(path.join(oldWork, "inquiry"), { recursive: true }); await mkdir(workDir)
  const names = ["inquiry.json", "USAGE.md"], bytes = [raw, usage]
  const calls = names.map((name, i) => ({ id: `write-${i}`, name: "write_file", arguments: { path: options.escaped ? `../${name}` : `inquiry/${name}`, content: bytes[i]!.toString("utf8") } }))
  const results = options.results === false ? [] : calls.map(c => ({ toolCallId: c.id, content: `File written: ${c.arguments.path}` }))
  for (let i = 0; i < names.length; i++) await writeFile(path.join(oldWork, "inquiry", names[i]!), options.changed ? Buffer.from("changed") : bytes[i]!)
  if (options.ambiguous) { calls.push({ ...calls[0]!, id: "other-write", arguments: { ...calls[0]!.arguments, path: "other/inquiry.json" } }); results.push({ toolCallId: "other-write", content: "File written: other/inquiry.json" }) }
  const authoredArtifacts: Record<string, string> = {}
  if (!options.nested) for (let i = 0; i < names.length; i++) { await writeFile(path.join(previous, `authored-${names[i]}`), bytes[i]!); authoredArtifacts[i === 0 ? "inputSha256" : "usageSha256"] = sha(bytes[i]!) }
  await writeFile(path.join(previous, "report.json"), JSON.stringify({ report: { status: options.unknown ? "completion-unknown" : "completed-with-diagnostics", telemetry: { providerCalls: 1, respondedCalls: options.unknown ? 0 : 1 }, workDir: oldWork, rawToolCalls: calls, rawToolResults: results, authoredArtifacts } }))
  return { previous, workDir, raw, usage }
}

test("one field repair receives exact known original draft bytes without host root promotion", async () => {
  for (const nested of [false, true]) {
    const f = await retainedDraftFixture({ nested }), prepared = await (authors as any).prepareAuthorRepairDrafts(f)
    expect(await readFile(path.join(f.workDir, "prior-draft/inquiry.json"))).toEqual(f.raw)
    expect(await readFile(path.join(f.workDir, "prior-draft/USAGE.md"))).toEqual(f.usage)
    expect(await Bun.file(path.join(f.workDir, "inquiry.json")).exists()).toBe(false)
    expect(prepared.map((p: any) => p.sha256)).toEqual([sha(f.raw), sha(f.usage)])
    expect(prepared[0].originalPath).toBe(nested ? "inquiry/inquiry.json" : "inquiry.json")
  }
})

test("repair cannot synthesize a missing, changed, ambiguous, escaped or unknown original draft", async () => {
  for (const condition of [{ results: false }, { changed: true }, { ambiguous: true }, { escaped: true }, { unknown: true }]) {
    const f = await retainedDraftFixture({ nested: true, ...condition })
    await expect((authors as any).prepareAuthorRepairDrafts(f)).rejects.toThrow()
  }
})
