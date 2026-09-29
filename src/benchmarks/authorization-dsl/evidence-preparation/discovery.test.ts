import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { discoverAuthorizationEvidence, readDiscoveryWindows } from "./discovery.ts"
import type { AuthorizationEvidenceRequest } from "./schema.ts"

async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-discovery-"))
  await mkdir(path.join(root, "project"))
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(root, "project", name), content)
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-assessment-authoring/v2", taskId: "locate", request: "Assess update.", repository: "https://example.test/records", sourceRef: "r1", sourceRoot: "project", sources: ["entry.ts"], policies: { p: { text: "Owners only.", location: "brief", revision: "v1", acceptance: "accepted", reason: "Task" } }, principals: { member: { role: "member" } }, resources: { r: { type: "record" } }, entries: { update: { name: "update", locations: [{ path: "entry.ts", startLine: 1, endLine: 3 }] } }, scenarios: { s: { principal: "member", resource: "r", policy: "p", entries: ["update"], relation: "foreign", operation: "update", expectation: "deny" } } }))
  const request: AuthorizationEvidenceRequest = { schemaVersion: "authorization-evidence-request/v2", sourceRoot: "project", allowedFiles: Object.keys(files), entries: [{ entryKey: "update", path: "entry.ts", startLine: 1, endLine: 3 }], dependencies: [], limits: { maxFiles: 12, maxBytes: 65536, maxDepth: 3 } }
  return { root, inputFile, request }
}

test("entry seed finds a helper after line 120 and nested dependencies without researcher coordinates", async () => {
  const f = await fixture({ "entry.ts": "function update() {\n return authorize()\n}\n", "helper.ts": `${"// padding\n".repeat(150)}function authorize() {\n return binding()\n}\nfunction binding() {\n return true\n}\n` })
  try {
    const discovery = await discoverAuthorizationEvidence(f)
    expect(discovery.request.dependencies.some(d => d.path === "helper.ts" && d.startLine === 151)).toBe(true)
    expect(discovery.request.dependencies.some(d => d.path === "helper.ts" && d.startLine === 154)).toBe(true)
    expect(discovery.windows.some(w => w.path === "helper.ts" && w.startLine === 151)).toBe(true)
    expect(discovery.readBytes).toBeLessThanOrEqual(1048576)
    expect(discovery.displayBytes).toBeLessThanOrEqual(65536)
    expect(discovery.request.entries).toEqual(f.request.entries)
    const extra = await readDiscoveryWindows(discovery, [{ path: "helper.ts", match: "function binding", contextLines: 1 }])
    expect(extra.windows[0]?.startLine).toBe(153)
    await expect(readDiscoveryWindows(discovery, [{ path: "../secret", startLine: 1, endLine: 1 }])).rejects.toThrow("allowlist")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("duplicate symbols, cycles, dynamic dispatch and read exhaustion remain explicit", async () => {
  const f = await fixture({ "entry.ts": "function update() {\n return ambiguous() + loop() + handlers[key]()\n}\n", "a.ts": "function ambiguous() { return true }\nfunction loop() { return loop() }\n", "b.ts": "function ambiguous() { return false }\n" })
  try {
    const discovery = await discoverAuthorizationEvidence(f)
    expect(discovery.diagnostics.some(d => d.reason === "ambiguous-symbol" && d.symbol === "ambiguous")).toBe(true)
    expect(discovery.diagnostics.some(d => d.reason === "dynamic-dispatch")).toBe(true)
    expect(discovery.diagnostics.some(d => d.reason === "cycle")).toBe(true)
    const exhausted = await discoverAuthorizationEvidence({ ...f, maxReadBytes: 60 })
    expect(exhausted.readBytes).toBeLessThanOrEqual(60)
    expect(exhausted.diagnostics.some(d => d.reason === "read-budget")).toBe(true)
    await expect(discoverAuthorizationEvidence({ ...f, request: { ...f.request, allowedFiles: ["entry.ts", "../bad"] } })).rejects.toThrow()
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("definition names do not create support and generated IDs cannot shadow authored support", async () => {
  const f = await fixture({ "entry.ts": "function update() {\n return authorize()\n}\n", "helper.ts": "function authorize() { return true }\n" })
  try {
    f.request.dependencies.push({ id: "located-2", from: "update", path: "helper.ts", startLine: 1, endLine: 1, reason: "control", basis: "author" })
    const result = await discoverAuthorizationEvidence(f)
    expect(result.request.dependencies.filter(d => d.path === "entry.ts")).toHaveLength(0)
    const ids = result.request.dependencies.map(d => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    await expect(readDiscoveryWindows(result, [{ path: "helper.ts", startLine: 1, endLine: 1 }])).resolves.toBeDefined()
    result.maxDisplayBytes = result.displayBytes
    const repeated = await readDiscoveryWindows(result, [{ path: "helper.ts", startLine: 1, endLine: 1 }])
    expect(repeated.bytes).toBe(0)
    expect(repeated.outcomes[0]).toMatchObject({ status: "resolved", newlyShown: false })
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("safe supplementary failures are individual outcomes and do not discard later valid reads", async () => {
  const f = await fixture({ "entry.ts": "function update() {\n return true\n}\n", "helper.ts": "first\nreturn item\nlast\nreturn item\n" })
  f.request.allowedFiles.push("missing.ts")
  try {
    const d = await discoverAuthorizationEvidence(f)
    const result = await readDiscoveryWindows(d, [
      { id: "first", path: "helper.ts", startLine: 1, endLine: 1 },
      { id: "missing", path: "missing.ts", startLine: 1, endLine: 1 },
      { id: "last", path: "helper.ts", startLine: 3, endLine: 3 },
      { id: "ambiguous", path: "helper.ts", match: "return item" },
      { id: "scope", path: "helper.ts", match: "return item", startLine: 4, endLine: 4 },
    ])
    expect(result.windows.map(w => w.startLine)).toEqual([1, 3, 4])
    expect(result.outcomes.map(o => [o.requestId, o.status])).toEqual([["first", "resolved"], ["missing", "unresolved"], ["last", "resolved"], ["ambiguous", "unresolved"], ["scope", "resolved"]])
    expect(result.outcomes[1]).toMatchObject({ code: "file-unavailable" })
    expect(result.outcomes[3]).toMatchObject({ code: "ambiguous", candidates: [{ path: "helper.ts", startLine: 2, endLine: 2 }, { path: "helper.ts", startLine: 4, endLine: 4 }] })
    expect(d.readOutcomes).toHaveLength(5)
    const before = d.displayBytes
    await expect(readDiscoveryWindows(d, [{ path: "helper.ts", startLine: 1, endLine: 1 }, { path: "../secret", startLine: 1, endLine: 1 }])).rejects.toThrow("allowlist")
    expect(d.displayBytes).toBe(before)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("display exhaustion retains affordable windows with named budget outcomes", async () => {
  const f = await fixture({ "entry.ts": "function update() {\n return true\n}\n", "helper.ts": "small\n" + "large".repeat(100) + "\nend\n" })
  try {
    const d = await discoverAuthorizationEvidence(f)
    d.maxDisplayBytes = d.displayBytes + 40
    const result = await readDiscoveryWindows(d, [{ id: "ok", path: "helper.ts", startLine: 1, endLine: 1 }, { id: "too-large", path: "helper.ts", startLine: 2, endLine: 2 }, { id: "after", path: "helper.ts", startLine: 3, endLine: 3 }])
    expect(result.windows.map(w => w.startLine)).toEqual([1, 3])
    expect(result.outcomes[1]).toMatchObject({ requestId: "too-large", status: "unresolved", code: "display-budget" })
    expect(d.displayBytes).toBeLessThanOrEqual(d.maxDisplayBytes)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("host context rejects public discovery snapshot tampering", async () => {
  const f = await fixture({ "entry.ts": "function update() {\n return true\n}\n" })
  try {
    const d = await discoverAuthorizationEvidence(f)
    d.windows[0]!.endLine = 900
    await expect(readDiscoveryWindows(d, [{ path: "entry.ts", startLine: 1, endLine: 1 }])).rejects.toThrow("integrity")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
