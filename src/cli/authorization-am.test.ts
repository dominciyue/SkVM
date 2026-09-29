import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationCli } from "./authorization.ts"
import { applyAuthorizationLocalEdit } from "../benchmarks/authorization-dsl/authoring-workspace/local-edit.ts"

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-am-"))
  await mkdir(path.join(root, "project"))
  const source = "def update():\n    return guard()\n\ndef guard():\n    if denied:\n        raise PermissionError()\n    return write()\n"
  await writeFile(path.join(root, "project", "entry.py"), source)
  const base = { schemaVersion: "authorization-assessment-authoring/v2", taskId: "am-test", request: "Assess update.", repository: "https://example.test/project", sourceRef: "r1", sourceRoot: "project", sources: ["entry.py"],
    policies: { p: { text: "Owners only.", location: "brief", revision: "v1", acceptance: "accepted", reason: "Current declared policy." } }, principals: { u: { role: "member" } }, resources: { r: { type: "record" } },
    entries: { update: { name: "update", locations: [{ path: "entry.py", startLine: 1, endLine: 2 }] } }, scenarios: { s: { principal: "u", resource: "r", policy: "p", entries: ["update"], relation: "foreign", operation: "update", expectation: "deny" } },
    analysisContract: { schemaVersion: "authorization-analysis-contract/v1", publicInstruction: "Compare with the original policy.", scenarios: { s: { boundary: "declared-entry", premises: [], requestedBranches: [], requiredResponseDetails: ["Explain original policy comparison."] } } } }
  const input = path.join(root, "input.json"), requestFile = path.join(root, "request.json")
  await writeFile(input, JSON.stringify(base))
  const request = { schemaVersion: "authorization-evidence-request/v2", sourceRoot: "project", allowedFiles: ["entry.py"], entries: [{ entryKey: "update", path: "entry.py", startLine: 1, endLine: 2 }], dependencies: [
    { id: "head", from: "update", path: "entry.py", startLine: 4, endLine: 4, reason: "control", basis: "author" },
    { id: "tail", from: "update", path: "entry.py", startLine: 7, endLine: 7, reason: "effect", basis: "author" },
    { id: "external", from: "update", path: "entry.py", reason: "identity", basis: "author", unresolvedReason: "external-middleware" },
  ], limits: { maxFiles: 12, maxBytes: 65536, maxDepth: 3 } }
  await writeFile(requestFile, JSON.stringify(request))
  const stdout: string[] = [], stderr: string[] = []
  const deps = { stdout: (s: string) => stdout.push(s), stderr: (s: string) => stderr.push(s), providerFactory: () => { throw new Error("No provider in this test") } }
  return { root, input, requestFile, base, request, source, stdout, stderr, deps }
}

test("AM callable packing retains the helper middle through ordinary prepare without adding entries", async () => {
  const f = await fixture()
  try {
    const out = path.join(f.root, "packed")
    expect(await runAuthorizationCli(["prepare", `--input=${f.input}`, `--request=${f.requestFile}`, `--out=${out}`, "--context=callable-v1"], f.deps)).toBe(0)
    expect(await readFile(path.join(out, "source", "entry.py"), "utf8")).toContain("raise PermissionError()")
    const report = JSON.parse(await readFile(path.join(out, "report.json"), "utf8"))
    expect(report.controlContext.expansions.some((e: any) => e.origin === "host-context")).toBe(true)
    expect(JSON.parse(await readFile(path.join(out, "assessment.json"), "utf8")).task.entries).toHaveLength(1)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("AM init generates known metadata and entry seed, leaves missing domain fields explicit, and preflights every output", async () => {
  const f = await fixture()
  try {
    const context = path.join(f.root, "context.json"), out = path.join(f.root, "draft.json")
    await writeFile(context, JSON.stringify({ schemaVersion: "authorization-authoring-context/v1", taskId: f.base.taskId, repository: f.base.repository, sourceRef: f.base.sourceRef, sourceRoot: "project", allowedFiles: ["entry.py"], entries: f.request.entries }))
    expect(await runAuthorizationCli(["init", `--context=${context}`, `--out=${out}`], f.deps)).toBe(0)
    const draft = JSON.parse(await readFile(out, "utf8"))
    expect(draft.policies).toEqual({})
    expect(draft.entries.update.locations).toEqual(f.base.entries.update.locations)
    expect(JSON.parse(f.stdout.at(-1)!).draftStatus).toBe("needs-input")
    expect(JSON.parse(await readFile(path.join(f.root, "draft.entry-seed.json"), "utf8")).entries).toEqual(f.request.entries)
    const other = path.join(f.root, "other.json")
    await writeFile(path.join(f.root, "other.authoring-guide.md"), "existing")
    expect(await runAuthorizationCli(["init", `--context=${context}`, `--out=${other}`], f.deps)).toBe(1)
    await expect(stat(other)).rejects.toThrow()
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("AM policy and linked expectations can update reason, instruction and one response detail in one edit", () => {
  const original: any = { schemaVersion: "authorization-assessment-authoring/v2", taskId: "edit", request: "Assess", repository: "repo", sourceRef: "r", sourceRoot: ".", sources: ["a.py"], policies: { p: { text: "Owner only", location: "brief", revision: "r", acceptance: "accepted", reason: "Original policy" } }, principals: { u: { role: "member" } }, resources: { r: { type: "record" } }, entries: { e: { name: "e", locations: [{ path: "a.py", startLine: 1, endLine: 1 }] } }, scenarios: { s: { principal: "u", resource: "r", policy: "p", entries: ["e"], relation: "foreign", operation: "update", expectation: "deny" } }, analysisContract: { schemaVersion: "authorization-analysis-contract/v1", publicInstruction: "Original policy", scenarios: { s: { boundary: "declared-entry", premises: [], requestedBranches: [], requiredResponseDetails: ["Original comparison"] } } } }
  const result = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Changed policy", operations: [
    { kind: "policy", key: "p", set: { text: "Members may update", reason: "Current policy" } }, { kind: "scenario", key: "s", set: { expectation: "allow" } },
    { kind: "public-instruction", statement: "Compare with the current declared policy." }, { kind: "response-detail", scenarioKey: "s", index: 0, statement: "Current policy comparison" },
  ] })
  expect(result.status).toBe("ready")
  expect(result.value?.analysisContract?.publicInstruction).toContain("current declared policy")
  expect(result.value?.sourceRef).toBe(original.sourceRef)
  expect(original.analysisContract.publicInstruction).toBe("Original policy")
})

test("AM reuse keeps pending gaps and source bytes after a pure premise or policy change", async () => {
  const f = await fixture()
  try {
    const before = path.join(f.root, "before"), after = path.join(f.root, "after")
    expect(await runAuthorizationCli(["prepare", `--input=${f.input}`, `--request=${f.requestFile}`, `--out=${before}`], f.deps)).toBe(0)
    f.base.analysisContract.publicInstruction = "Compare with the current declared policy."
    await writeFile(f.input, JSON.stringify(f.base))
    expect(await runAuthorizationCli(["prepare", `--input=${f.input}`, `--reuse=${path.join(before, "assessment.json")}`, `--out=${after}`], f.deps)).toBe(0)
    const a = JSON.parse(await readFile(path.join(before, "report.json"), "utf8")), b = JSON.parse(await readFile(path.join(after, "report.json"), "utf8"))
    expect(b.gaps).toEqual(a.gaps)
    expect(b.status).toBe("partial")
    expect(await readFile(path.join(after, "source", "entry.py"))).toEqual(await readFile(path.join(before, "source", "entry.py")))
    expect(JSON.parse(f.stdout.at(-1)!).reuse.requiresAnalysis).toBe(true)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
