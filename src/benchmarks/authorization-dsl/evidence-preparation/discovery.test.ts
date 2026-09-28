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
    await expect(readDiscoveryWindows(result, [{ path: "helper.ts", startLine: 1, endLine: 1 }])).rejects.toThrow("budget")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
