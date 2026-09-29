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

const selectionResponse = (dependencies: unknown[] = [], reads: unknown[] = []) => JSON.stringify({ schemaVersion: "authorization-dependency-selection/v3", dependencies, reads })
const shownSelector = (discovery: Awaited<ReturnType<typeof discoverAuthorizationEvidence>>, file: string, startLine: number, endLine: number) => ({ kind: "shown-range", windowId: discovery.windows.find(w => w.path === file && w.startLine <= startLine && w.endLine >= endLine)!.id, startLine, endLine })

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
      return responseProvider(calls === 1 ? selectionResponse([], [{ id: "body", selector: { kind: "indexed-symbol", symbolId: discovery.symbols.find(s => s.name === "unusedGuard")!.id } }]) : selectionResponse([{ id: "read-guard", from: "update", selector: shownSelector(discovery, "src/guard.ts", 151, 153), reason: "control" }])).complete(params)
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

test("bounded proposal leaves an indexed but unseen body as a named gap and retains usage", async () => {
  const f = await proposalFixture()
  try {
    await writeFile(path.join(f.root, "project", "src", "guard.ts"), `${"// filler\n".repeat(150)}function unusedGuard() { return true }\n`)
    f.request.schemaVersion = "authorization-evidence-request/v2"
    const discovery = await discoverAuthorizationEvidence(f)
    const result = await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider: responseProvider(selectionResponse([{ id: "unseen", from: "update", selector: { kind: "indexed-symbol", symbolId: discovery.symbols.find(s => s.name === "unusedGuard")!.id }, reason: "control" }])) })
    expect(result.dependencies).toHaveLength(0)
    expect(result.gaps).toContainEqual(expect.objectContaining({ id: "unseen", reason: "location-not-shown" }))
    expect(result.account.telemetry.providerCalls).toBe(1)
    expect(result.account.telemetry.knownTokens.input).toBe(123)
    expect(result.account.published).toBe(false)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("the second fresh call retains task, policy, verified support and bounded old source with charged resends", async () => {
  const f = await proposalFixture()
  try {
    f.request.schemaVersion = "authorization-evidence-request/v2"
    await writeFile(path.join(f.root, "project", "src/guard.ts"), "function hidden() {\n return item\n}\n")
    const discovery = await discoverAuthorizationEvidence(f)
    let calls = 0
    const prompts: string[] = []
    const provider = responseProvider(""); provider.complete = async params => {
      calls++; prompts.push(params.messages[0]!.content as string)
      return responseProvider(calls === 1
        ? selectionResponse([{ id: "entry-copy", from: "update", selector: shownSelector(discovery, "src/entry.ts", 1, 3), reason: "control", description: "return ... authorize; explanation is not a literal" }], [
          { id: "good", from: "entry-copy", selector: { kind: "indexed-symbol", symbolId: discovery.symbols.find(s => s.name === "hidden")!.id } },
          { id: "bad", from: "update", selector: { kind: "literal-search", path: "src/guard.ts", literal: "not an exact source literal" } },
        ])
        : selectionResponse([{ id: "new-guard", from: "entry-copy", selector: shownSelector(discovery, "src/guard.ts", 1, 3), reason: "control" }])).complete(params)
    }
    const result = await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider })
    expect(calls).toBe(2)
    expect(prompts[1]).toContain("Accepted policy sources")
    expect(prompts[1]).toContain("Only owners update.")
    expect(prompts[1]).toContain("1 | export function update")
    expect(prompts[1]).toContain("1 | function hidden")
    expect(prompts[1]).toContain("entry-copy")
    expect(result.dependencies).toHaveLength(2)
    expect(result.gaps).toContainEqual(expect.objectContaining({ id: "read:bad", reason: "read-not-found" }))
    expect(result.account.readOutcomes).toHaveLength(2)
    expect(result.account.sourceDisplay?.resentSourceBytes).toBeGreaterThan(0)
    expect(result.account.sourceDisplay?.totalBytes).toBe((result.account.sourceDisplay?.uniqueSourceBytes ?? 0) + (result.account.sourceDisplay?.resentSourceBytes ?? 0))
    expect(result.account.rounds![1]!.displayedBytes).toBeGreaterThan(discovery.windows.find(w => w.path === "src/guard.ts")!.bytes)
    expect(result.account.rounds!.every(r => r.promptBytes! >= r.displayedBytes && r.metadataBytes! === r.promptBytes! - r.displayedBytes)).toBe(true)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("no new source information stops after one call and a failed parent cannot admit its child", async () => {
  const f = await proposalFixture()
  try {
    f.request.schemaVersion = "authorization-evidence-request/v2"
    const discovery = await discoverAuthorizationEvidence(f)
    const selector = shownSelector(discovery, "src/entry.ts", 1, 3)
    let calls = 0
    const provider = responseProvider(""); provider.complete = async params => {
      calls++
      return responseProvider(selectionResponse([
        { id: "bad-parent", from: "update", selector: { ...selector, windowId: "unknown-window" }, reason: "control" },
        { id: "child", from: "bad-parent", selector, reason: "effect" },
        { id: "valid", from: "update", selector, reason: "effect" },
      ], [{ id: "already", selector }, { id: "missing", selector: { kind: "literal-search", path: "src/guard.ts", literal: "missing" } }])).complete(params)
    }
    const result = await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider })
    expect(calls).toBe(1)
    expect(result.dependencies.map(d => d.id)).toEqual(["valid"])
    expect(result.gaps).toContainEqual(expect.objectContaining({ id: "child", reason: "unresolved-parent" }))
    expect(result.account.diagnostics).toContain("no-new-source-information")
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("unsafe selector paths reject the job with the returned cost retained", async () => {
  const f = await proposalFixture()
  try {
    f.request.schemaVersion = "authorization-evidence-request/v2"
    const discovery = await discoverAuthorizationEvidence(f)
    let caught: any
    try { await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider: responseProvider(selectionResponse([], [{ selector: { kind: "literal-search", path: "../secret", literal: "x" } }])) }) } catch (error) { caught = error }
    expect(caught.message).toContain("allowlist")
    expect(caught.account.telemetry.totalActualUsd).toBe(.001)
    expect(caught.account.telemetry.providerCalls).toBe(1)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("cancellation after a response stops dispatch and counts only source sent to the provider", async () => {
  const f = await proposalFixture()
  try {
    f.request.schemaVersion = "authorization-evidence-request/v2"
    await writeFile(path.join(f.root, "project", "src/guard.ts"), "function hidden() { return true }\n")
    const discovery = await discoverAuthorizationEvidence(f), initialBytes = discovery.displayBytes
    const controller = new AbortController()
    let calls = 0, caught: any
    const provider = responseProvider(""); provider.complete = async params => {
      calls++; controller.abort()
      return responseProvider(selectionResponse([], [{ selector: { kind: "indexed-symbol", symbolId: discovery.symbols.find(s => s.name === "hidden")!.id } }])).complete(params)
    }
    try { await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider, signal: controller.signal }) } catch (error) { caught = error }
    expect(calls).toBe(1)
    expect(caught.account.status).toBe("cancelled")
    expect(caught.account.sourceDisplay.totalBytes).toBe(initialBytes)
    expect(caught.account.telemetry.totalActualUsd).toBe(.001)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

for (const text of [selectionResponse(), "invalid JSON"]) test(`cancellation while returning ${text === "invalid JSON" ? "invalid" : "final"} response retains usage without completion or repair`, async () => {
  const f = await proposalFixture()
  try {
    f.request.schemaVersion = "authorization-evidence-request/v2"
    const discovery = await discoverAuthorizationEvidence(f)
    const controller = new AbortController()
    let calls = 0, caught: any
    const provider = responseProvider(""); provider.complete = async params => {
      calls++; controller.abort()
      return responseProvider(text).complete(params)
    }
    try { await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider, signal: controller.signal }) } catch (error) { caught = error }
    expect(calls).toBe(1)
    expect(caught?.account.status).toBe("cancelled")
    expect(caught?.account.attempts[0].response.text).toBe(text)
    expect(caught?.account.telemetry.totalActualUsd).toBe(.001)
    expect(caught?.account.published).toBe(false)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("duplicate JSON reads are diagnosed before last-wins can discard an indexed body request", async () => {
  const f = await proposalFixture()
  try {
    f.request.schemaVersion = "authorization-evidence-request/v2"
    await writeFile(path.join(f.root, "project", "src/guard.ts"), "function hidden() { return true }\n")
    const discovery = await discoverAuthorizationEvidence(f)
    const reads = [{ id: "body", selector: { kind: "indexed-symbol", symbolId: discovery.symbols.find(s => s.name === "hidden")!.id } }]
    const duplicate = selectionResponse([], reads).replace(/}$/, ',"r\\u0065ads":[]}')
    let calls = 0
    const provider = responseProvider(""); provider.complete = async params => {
      calls++
      if (calls === 2) expect(params.messages[0]!.content).toContain("Duplicate JSON property: reads")
      return responseProvider(calls === 1 ? duplicate : calls === 2 ? selectionResponse([], reads) : selectionResponse([{ id: "guard", from: "update", selector: shownSelector(discovery, "src/guard.ts", 1, 1), reason: "control" }])).complete(params)
    }
    const result = await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider })
    expect(calls).toBe(3)
    expect(result.dependencies.map(d => d.id)).toEqual(["guard"])
    expect(result.account.rounds!.map(r => r.kind)).toEqual(["proposal", "format-repair", "supplement"])
    expect(result.account.attempts[0]!.response!.text).toBe(duplicate)
    expect(result.account.telemetry.knownTokens.input).toBe(369)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test("duplicate nested JSON properties stay rejected after the single format revision", async () => {
  const f = await proposalFixture()
  try {
    f.request.schemaVersion = "authorization-evidence-request/v2"
    const discovery = await discoverAuthorizationEvidence(f)
    const text = selectionResponse([{ id: "entry", from: "update", selector: shownSelector(discovery, "src/entry.ts", 1, 3), reason: "control" }]).replace('"startLine":1', '"startLine":1,"startLine":1')
    let caught: any
    try { await proposeBoundedAuthorizationDependencies({ ...f, discovery, model: "test/mock", provider: responseProvider(text) }) } catch (error) { caught = error }
    expect(caught?.message).toContain("Duplicate JSON property: startLine")
    expect(caught?.account.telemetry.providerCalls).toBe(2)
    expect(caught?.account.acceptedDependencies).toEqual([])
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
