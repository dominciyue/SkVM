import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prepareAuthorizationEvidence } from "./prepare.ts"
import type { AuthorizationEvidenceRequest } from "./schema.ts"

async function fixture(source: string, extra?: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-prepare-"))
  const project = path.join(root, "project", "src")
  await mkdir(project, { recursive: true })
  await writeFile(path.join(project, "record.ts"), source, "utf8")
  for (const [name, content] of Object.entries(extra ?? {})) await writeFile(path.join(project, name), content, "utf8")
  const input = {
    schemaVersion: "authorization-assessment-authoring/v2", taskId: "stable-task", request: "Assess the stated entry.",
    repository: "https://example.test/records", sourceRef: "fixed-commit", sourceRoot: "project", sources: ["src/record.ts"],
    policies: { archive: { text: "Only owners may archive.", location: "brief#/policy", revision: "v1", acceptance: "accepted", reason: "Author supplied." } },
    principals: { member: { role: "member" } }, resources: { record: { type: "record" } },
    entries: { archive: { name: "archive", locations: [{ path: "src/record.ts", startLine: 2, endLine: 3 }] } },
    scenarios: { member: { principal: "member", resource: "record", policy: "archive", entries: ["archive"], relation: "other-owner", operation: "archive", expectation: "deny" } },
  }
  const inputFile = path.join(root, "assessment.json")
  await writeFile(inputFile, `${JSON.stringify(input)}\n`, "utf8")
  return { root, inputFile, outDir: path.join(root, "prepared") }
}

function request(overrides: Partial<AuthorizationEvidenceRequest> = {}): AuthorizationEvidenceRequest {
  return {
    schemaVersion: "authorization-evidence-request/v1", sourceRoot: "project",
    allowedFiles: ["src/record.ts", "src/helper.ts"],
    entries: [{ entryKey: "archive", path: "src/record.ts", startLine: 2, endLine: 3 }],
    dependencies: [], limits: { maxFiles: 12, maxBytes: 65_536, maxDepth: 2 }, ...overrides,
  }
}

test("keeps complete files when budget permits and deduplicates a repeated helper", async () => {
  const f = await fixture("one\ntwo\nthree\nfour\n", { "helper.ts": "guard\ncheck\n" })
  try {
    const result = await prepareAuthorizationEvidence({ inputFile: f.inputFile, outDir: f.outDir, request: request({
      dependencies: [
        { id: "guard", from: "archive", path: "src/helper.ts", startLine: 1, endLine: 2, reason: "control", basis: "author" },
        { id: "guard-again", from: "archive", path: "src/helper.ts", startLine: 1, endLine: 2, reason: "control", basis: "author" },
      ],
    }) })
    expect(result.report.status).toBe("ready")
    expect(result.report.closureClaim).toBe("declared-dependencies-only")
    expect(result.snapshots.map(item => item.path)).toEqual(["src/record.ts", "src/helper.ts"])
    expect(result.snapshots.map(item => item.content)).toEqual(["one\ntwo\nthree\nfour\n", "guard\ncheck\n"])
    expect(result.report.included.map(item => [item.startLine, item.endLine])).toEqual([[1, 4], [1, 2]])
    expect(result.preparedInput?.task.taskId).toBe("stable-task")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("crops only whole source lines with original coordinates and CRLF Unicode bytes", async () => {
  const content = `prefix\r\n入口😀\r\nreturn true\r\n${"padding\r\n".repeat(40)}`
  const f = await fixture(content)
  try {
    const result = await prepareAuthorizationEvidence({ inputFile: f.inputFile, outDir: f.outDir, request: request({
      allowedFiles: ["src/record.ts"], limits: { maxFiles: 12, maxBytes: 40, maxDepth: 2 },
    }) })
    expect(result.report.status).toBe("ready")
    expect(result.snapshots).toEqual([{ path: "src/record.ts", content: "入口😀\r\nreturn true\r\n" }])
    expect(result.report.included[0]).toMatchObject({ startLine: 2, endLine: 3, originalPath: "src/record.ts" })
    expect(result.preparedInput?.evidencePreparation?.included[0]?.startLine).toBe(2)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("a missing named dependency is partial with an explicit gap and a runnable entry snapshot", async () => {
  const f = await fixture("one\ntwo\nthree\n")
  try {
    const result = await prepareAuthorizationEvidence({ inputFile: f.inputFile, outDir: f.outDir, request: request({
      dependencies: [{ id: "missing-guard", from: "archive", path: "src/helper.ts", startLine: 1, endLine: 2, reason: "control", basis: "author" }],
    }) })
    expect(result.report.status).toBe("partial")
    expect(result.report.gaps).toContainEqual(expect.objectContaining({ id: "missing-guard", reason: "missing-file", attemptedPath: "src/helper.ts" }))
    expect(result.preparedInput?.sources).toEqual(["src/record.ts"])
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("rejects path escape before creating any runnable input", async () => {
  const f = await fixture("one\ntwo\nthree\n")
  try {
    const result = await prepareAuthorizationEvidence({ inputFile: f.inputFile, outDir: f.outDir, request: request({
      allowedFiles: ["src/record.ts", "../secret.txt"],
      dependencies: [{ id: "escape", from: "archive", path: "../secret.txt", startLine: 1, endLine: 1, reason: "other", basis: "author" }],
    }) })
    expect(result.report.status).toBe("invalid")
    expect(result.preparedInput).toBeUndefined()
    expect(result.snapshots).toEqual([])
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("a literal locator is only accepted with a unique hit inside an explicit range", async () => {
  const f = await fixture("one\ntwo\nthree\n", { "helper.ts": "first\ncheckAccess()\nlast\n" })
  try {
    const result = await prepareAuthorizationEvidence({ inputFile: f.inputFile, outDir: f.outDir, request: request({
      dependencies: [{ id: "located", from: "archive", path: "src/helper.ts", startLine: 2, endLine: 2, match: "checkAccess", reason: "control", basis: "locator" }],
    }) })
    expect(result.report.status).toBe("ready")
    const ambiguous = await prepareAuthorizationEvidence({ inputFile: f.inputFile, outDir: f.outDir, request: request({
      dependencies: [{ id: "located", from: "archive", path: "src/helper.ts", startLine: 1, endLine: 3, match: "s", reason: "control", basis: "locator" }],
    }) })
    expect(ambiguous.report.status).toBe("partial")
    expect(ambiguous.report.gaps[0]?.reason).toBe("ambiguous-location")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("a dependency keeps its whole file when the shared byte budget permits", async () => {
  const f = await fixture("one\ntwo\nthree\n", { "helper.ts": "prefix\nguard\nsuffix\n" })
  try {
    const result = await prepareAuthorizationEvidence({ inputFile: f.inputFile, outDir: f.outDir, request: request({
      dependencies: [{ id: "guard", from: "archive", path: "src/helper.ts", startLine: 2, endLine: 2, reason: "control", basis: "author" }],
    }) })
    expect(result.report.status).toBe("ready")
    expect(result.snapshots.find(item => item.path === "src/helper.ts")?.content).toBe("prefix\nguard\nsuffix\n")
    expect(result.report.included.find(item => item.path === "src/helper.ts")).toMatchObject({ startLine: 1, endLine: 3 })
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("merges overlapping ranges and keeps a budget-excluded dependency as a named gap", async () => {
  const f = await fixture("one\ntwo\nthree\nfour\nfive\nsix\n", { "helper.ts": "very large helper body\n" })
  try {
    const result = await prepareAuthorizationEvidence({ inputFile: f.inputFile, outDir: f.outDir, request: request({
      limits: { maxFiles: 12, maxBytes: 24, maxDepth: 2 },
      dependencies: [
        { id: "same-file", from: "archive", path: "src/record.ts", startLine: 3, endLine: 4, reason: "effect", basis: "author" },
        { id: "large-helper", from: "archive", path: "src/helper.ts", startLine: 1, endLine: 1, reason: "control", basis: "author" },
      ],
    }) })
    expect(result.report.status).toBe("partial")
    expect(result.report.included).toHaveLength(1)
    expect(result.report.included[0]).toMatchObject({ startLine: 2, endLine: 4 })
    expect(result.report.gaps).toContainEqual(expect.objectContaining({ id: "large-helper", reason: "byte-budget" }))
    expect(result.snapshots[0]?.content).toBe("two\nthree\nfour\n")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("records unresolved parent, cycle, depth and explicit-range gaps without inventing source", async () => {
  const f = await fixture("one\ntwo\nthree\n", { "helper.ts": "guard\n" })
  try {
    const result = await prepareAuthorizationEvidence({ inputFile: f.inputFile, outDir: f.outDir, request: request({
      dependencies: [
        { id: "cycle-a", from: "cycle-b", path: "src/helper.ts", startLine: 1, endLine: 1, reason: "control", basis: "author" },
        { id: "cycle-b", from: "cycle-a", path: "src/helper.ts", startLine: 1, endLine: 1, reason: "control", basis: "author" },
        { id: "dynamic", from: "archive", path: "src/helper.ts", reason: "control", basis: "author" },
        { id: "direct", from: "archive", path: "src/helper.ts", startLine: 1, endLine: 1, reason: "control", basis: "author" },
        { id: "too-deep", from: "direct", path: "src/helper.ts", startLine: 1, endLine: 1, reason: "effect", basis: "author" },
      ], limits: { maxFiles: 12, maxBytes: 65_536, maxDepth: 1 },
    }) })
    expect(result.report.status).toBe("partial")
    expect(result.report.gaps.map(gap => [gap.id, gap.reason])).toEqual([
      ["cycle-a", "unresolved-or-cyclic-parent"], ["cycle-b", "unresolved-or-cyclic-parent"],
      ["dynamic", "range-required"], ["too-deep", "depth-budget"],
    ])
    expect(result.snapshots.find(item => item.path === "src/helper.ts")?.content).toBe("guard\n")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
