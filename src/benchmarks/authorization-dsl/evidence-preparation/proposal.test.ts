import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import type { LLMProvider } from "../../../providers/types.ts"
import { proposeAuthorizationDependencies, proposeBoundedAuthorizationDependencies } from "./proposal.ts"
import { discoverAuthorizationEvidence } from "./discovery.ts"
import type { AuthorizationEvidenceRequest } from "./schema.ts"

export async function proposalFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-proposal-test-"))
  await mkdir(path.join(root, "project", "src"), { recursive: true })
  await writeFile(path.join(root, "project", "src", "entry.ts"), "export function update() {\n  return authorize()\n}\n")
  await writeFile(path.join(root, "project", "src", "guard.ts"), "export function authorize() {\n  return true\n}\n")
  const authoring = {
    schemaVersion: "authorization-assessment-authoring/v2", taskId: "proposal", request: "Assess update.",
    repository: "https://example.test/project", sourceRef: "fixed-ref", sourceRoot: "project", sources: ["src/entry.ts"],
    policies: { owners: { text: "Only owners update.", location: "brief#/policy", revision: "v1", acceptance: "accepted", reason: "Task requirement" } },
    principals: { member: { role: "member" } }, resources: { record: { type: "record" } },
    entries: { update: { name: "update", locations: [{ path: "src/entry.ts", startLine: 1, endLine: 3 }] } },
    scenarios: { foreign: { principal: "member", resource: "record", policy: "owners", entries: ["update"], relation: "non-owner", operation: "update", expectation: "deny" } },
  }
  const inputFile = path.join(root, "input.json")
  await writeFile(inputFile, JSON.stringify(authoring))
  const request: AuthorizationEvidenceRequest = { schemaVersion: "authorization-evidence-request/v1", sourceRoot: "project",
    allowedFiles: ["src/entry.ts", "src/guard.ts"], entries: [{ entryKey: "update", path: "src/entry.ts", startLine: 1, endLine: 3 }],
    dependencies: [], limits: { maxFiles: 12, maxBytes: 65536, maxDepth: 3 } }
  return { root, inputFile, request, requestFile: path.join(root, "request.json") }
}

export const responseProvider = (text: string): LLMProvider => ({ name: "mock", complete: async () => ({
  text, toolCalls: [], tokens: { input: 123, output: 7, cacheRead: 0, cacheWrite: 0 }, costUsd: .001, durationMs: 1, stopReason: "end_turn",
}), completeWithToolResults: async () => { throw new Error("No executable continuation") } })

for (const [kind, text] of [
  ["invalid JSON", "not json"], ["schema rejection", '{"dependencies":"bad"}'],
  ["position rejection", JSON.stringify({ dependencies: [{ id: "guard", from: "update", path: "src/guard.ts", startLine: 900, endLine: 902, reason: "control" }] })],
  ["path rejection", JSON.stringify({ dependencies: [{ id: "escape", from: "update", path: "../secret", startLine: 1, endLine: 1, reason: "control" }] })],
] as const) test(`proposal retains returned usage before ${kind}`, async () => {
  const f = await proposalFixture()
  try {
    let caught: any
    try { await proposeAuthorizationDependencies({ ...f, model: "test/mock", provider: responseProvider(text) }) } catch (error) { caught = error }
    expect(caught).toBeDefined()
    expect(caught.account?.telemetry.knownTokens).toEqual({ input: 123, output: 7, cacheRead: 0, cacheWrite: 0 })
    expect(caught.account?.telemetry.totalActualUsd).toBe(.001)
    expect(caught.account?.attempts[0]?.response.text).toBe(text)
    expect(caught.account?.published).toBe(false)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("proposal records timeout as unknown and does not resend", async () => {
  const f = await proposalFixture()
  try {
    let calls = 0, caught: any
    const provider = responseProvider("")
    provider.complete = async () => { calls++; return new Promise(() => {}) }
    try { await proposeAuthorizationDependencies({ ...f, model: "test/mock", provider, timeoutMs: 5 }) } catch (error) { caught = error }
    expect(calls).toBe(1)
    expect(caught.account?.attempts[0]?.status).toBe("timeout")
    expect(caught.account?.telemetry.unknownUsageCalls).toBe(1)
    expect(caught.account?.telemetry.totalActualUsd).toBeNull()
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("cancellation before dispatch records zero calls", async () => {
  const f = await proposalFixture()
  try {
    const controller = new AbortController(); controller.abort()
    let calls = 0, caught: any
    const provider = responseProvider(""); provider.complete = async () => { calls++; throw new Error("must not dispatch") }
    try { await proposeAuthorizationDependencies({ ...f, model: "test/mock", provider, signal: controller.signal }) } catch (error) { caught = error }
    expect(calls).toBe(0)
    expect(caught.account?.status).toBe("cancelled")
    expect(caught.account?.telemetry.providerCalls).toBe(0)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("bounded proposal reads a hidden literal window then accepts only displayed coordinates", async () => {
  const f = await proposalFixture()
  try {
    await writeFile(path.join(f.root, "project", "src", "guard.ts"), `${"// filler\n".repeat(150)}function unusedGuard() {\n return true\n}\n`)
    f.request.schemaVersion = "authorization-evidence-request/v2"
    const discovery = await discoverAuthorizationEvidence(f)
    let calls = 0
    const provider = responseProvider(""); provider.complete = async params => {
      calls++
      if (calls === 1) expect(params.messages[0]?.content).not.toContain("151 | function unusedGuard")
      else expect(params.messages[0]?.content).toContain("151 | function unusedGuard")
      return responseProvider(JSON.stringify(calls === 1 ? { dependencies: [], reads: [{ path: "src/guard.ts", match: "function unusedGuard", contextLines: 2 }] } : { dependencies: [{ id: "read-guard", from: "update", path: "src/guard.ts", startLine: 151, endLine: 153, reason: "control" }] })).complete(params)
    }
    const result = await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider })
    expect(calls).toBe(2)
    expect(result.dependencies[0]?.startLine).toBe(151)
    expect(result.account.telemetry.providerCalls).toBe(2)
    expect(result.account.telemetry.knownTokens.input).toBe(246)
    expect(result.account.telemetry.totalActualUsd).toBe(.002)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("bounded JSON repair is diagnostics-only, bounded once, and all failed responses remain accounted", async () => {
  const f = await proposalFixture()
  try {
    f.request.schemaVersion = "authorization-evidence-request/v2"
    const discovery = await discoverAuthorizationEvidence(f)
    let calls = 0
    const provider = responseProvider(""); provider.complete = async params => {
      calls++
      if (calls === 2) { expect(params.messages[0]?.content).toContain("Diagnostics-only"); expect(params.messages[0]?.content).not.toContain("1 | export function") }
      return responseProvider("bad json").complete(params)
    }
    let caught: any
    try { await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider }) } catch (error) { caught = error }
    expect(calls).toBe(2)
    expect(caught.account.telemetry.knownTokens.input).toBe(246)
    expect(caught.account.rounds).toHaveLength(2)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("legacy proposal display counts Unicode UTF-8 bytes rather than characters", async () => {
  const f = await proposalFixture()
  try {
    await writeFile(path.join(f.root, "project", "src", "entry.ts"), `function update() {\n// ${"汉".repeat(150)}\n}\n`)
    f.request.allowedFiles = ["src/entry.ts"]
    f.request.limits.maxBytes = 300
    const provider = responseProvider('{"dependencies":[]}')
    const complete = provider.complete
    provider.complete = async params => {
      expect(params.messages[0]!.content).not.toContain("汉".repeat(150))
      return complete(params)
    }
    await proposeAuthorizationDependencies({ ...f, model: "test/mock", provider })
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("bounded proposal rejects an indexed but unseen body and retains its usage", async () => {
  const f = await proposalFixture()
  try {
    await writeFile(path.join(f.root, "project", "src", "guard.ts"), `${"// filler\n".repeat(150)}function unusedGuard() { return true }\n`)
    f.request.schemaVersion = "authorization-evidence-request/v2"
    const discovery = await discoverAuthorizationEvidence(f)
    let caught: any
    try { await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider: responseProvider(JSON.stringify({ dependencies: [{ id: "unseen", from: "update", path: "src/guard.ts", startLine: 151, endLine: 151, reason: "control" }] })) }) } catch (error) { caught = error }
    expect(caught.message).toContain("not shown")
    expect(caught.account.telemetry.providerCalls).toBe(1)
    expect(caught.account.telemetry.knownTokens.input).toBe(123)
    expect(caught.account.published).toBe(false)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
