import { expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runAuthorizationCli } from "./authorization.ts"
import { loadLocalAuthorizationInput } from "../benchmarks/authorization-dsl/local-input.ts"

test("prepare checks without writing, then publishes a runnable ordinary input and report exactly once", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-prepare-cli-"))
  try {
    await mkdir(path.join(root, "project", "src"), { recursive: true })
    await writeFile(path.join(root, "project", "src", "record.ts"), "prefix\nexport function update() {\n  return guard()\n}\nsuffix\n", "utf8")
    const task = {
      schemaVersion: "source-authorization-assessment/v0", taskId: "prepare-cli", request: "Assess update.", repository: "https://example.test/project", sourceRef: "fixed-ref", sourceMode: "fixed-context",
      policySources: [{ id: "policy", kind: "task-requirement", text: "Only owners update.", location: "brief#/policy", revision: "v1", acceptance: { status: "accepted", actorRole: "author", reason: "Task requirement" } }],
      principals: [{ id: "member", role: "member", description: "Caller", startingCapabilities: [] }], resources: [{ id: "record", type: "record", description: "Target" }],
      entries: [{ id: "update", name: "update", locations: [{ path: "src/record.ts", startLine: 2, endLine: 4 }] }],
      obligations: [{ id: "scenario", principalId: "member", resourceId: "record", relation: "non-owner", operation: "update", expectation: "deny", conditions: [], policySourceId: "policy", entryIds: ["update"] }],
      scopeAssurance: "Declared entry only.", requiredAnalysis: ["Trace the control."], constraints: ["Do not execute target."],
    }
    const inputFile = path.join(root, "assessment.json")
    await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-assessment-input/v1", sourceIdentity: { repository: task.repository, sourceRef: task.sourceRef }, sourceRoot: "project", sources: ["src/record.ts"], task }), "utf8")
    const requestFile = path.join(root, "request.json")
    await writeFile(requestFile, JSON.stringify({ schemaVersion: "authorization-evidence-request/v1", sourceRoot: "project", allowedFiles: ["src/record.ts", "src/missing.ts"], entries: [{ entryKey: "update", path: "src/record.ts", startLine: 2, endLine: 4 }], dependencies: [{ id: "missing", from: "update", path: "src/missing.ts", startLine: 1, endLine: 1, reason: "control", basis: "author" }], limits: { maxFiles: 12, maxBytes: 46, maxDepth: 2 } }), "utf8")
    const out = path.join(root, "prepared")
    const stdout: string[] = [], stderr: string[] = []
    const deps = { stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value), providerFactory: () => { throw new Error("prepare must not create a provider") } }
    const args = [`--input=${inputFile}`, `--request=${requestFile}`, `--out=${out}`]
    expect(await runAuthorizationCli(["prepare", ...args, "--check-only=true"], deps)).toBe(0)
    await expect(stat(out)).rejects.toThrow()
    expect(await runAuthorizationCli(["prepare", ...args], deps)).toBe(0)
    const preparedInput = path.join(out, "assessment.json")
    expect((await loadLocalAuthorizationInput(preparedInput)).status).toBe("valid")
    expect(await readFile(path.join(out, "source", "src", "record.ts"), "utf8")).toBe("export function update() {\n  return guard()\n}\n")
    expect(await readFile(path.join(out, "report.json"), "utf8")).toContain("missing-file")
    expect(await runAuthorizationCli(["prepare", ...args], deps)).toBe(1)
    expect(stderr.at(-1)).toContain("exists")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("paid prepare archives invalid proposal usage and preflights output before dispatch", async () => {
  const demo = path.resolve("examples/authorization-assessment/evidence-editing")
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-failed-prepare-"))
  try {
    let calls = 0
    const stdout: string[] = [], stderr: string[] = []
    const deps = { stdout: (s: string) => stdout.push(s), stderr: (s: string) => stderr.push(s), providerFactory: () => ({
      name: "mock", complete: async () => { calls++; return { text: "bad JSON", toolCalls: [], tokens: { input: 123, output: 7, cacheRead: 0, cacheWrite: 0 }, costUsd: .001, durationMs: 1, stopReason: "end_turn" as const } },
      completeWithToolResults: async () => { throw new Error("unexpected") },
    }) }
    const args = [`--input=${path.join(demo, "base.json")}`, `--request=${path.join(demo, "request-ready.json")}`, "--proposal-model=test/mock"]
    expect(await runAuthorizationCli(["prepare", ...args, `--out=${path.join(root, "missing", "out")}`], deps)).toBe(1)
    expect(calls).toBe(0)
    const out = path.join(root, "failed")
    expect(await runAuthorizationCli(["prepare", ...args, `--out=${out}`], deps)).toBe(1)
    expect(calls).toBe(1)
    await expect(stat(out)).rejects.toThrow()
    const report = JSON.parse(stdout.at(-1)!)
    const account = JSON.parse(await readFile(path.join(report.attemptPath, "account.json"), "utf8"))
    expect(account.telemetry.knownTokens.input).toBe(123)
    expect(account.telemetry.knownTokens.output).toBe(7)
    expect(account.telemetry.totalActualUsd).toBe(.001)
    expect(account.published).toBe(false)
    expect(await readFile(path.join(report.attemptPath, "events.jsonl"), "utf8")).toContain('"kind":"response"')
    expect(await runAuthorizationCli(["prepare", ...args, `--out=${out}`], deps)).toBe(1)
    expect((await readdir(root)).filter(name => name.includes("attempts-")).length).toBe(2)
    await mkdir(path.join(root, "existing"))
    expect(await runAuthorizationCli(["prepare", ...args, `--out=${path.join(root, "existing")}`], deps)).toBe(1)
    expect(calls).toBe(2)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("prepare accepts one optional model dependency proposal through the same bounded validator", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-proposal-cli-"))
  try {
    await mkdir(path.join(root, "project", "src"), { recursive: true })
    await writeFile(path.join(root, "project", "src", "entry.ts"), "export function update() {\n  return authorize()\n}\n", "utf8")
    await writeFile(path.join(root, "project", "src", "guard.ts"), "export function authorize() {\n  return true\n}\n", "utf8")
    const task = {
      schemaVersion: "source-authorization-assessment/v0", taskId: "proposal-cli", request: "Assess update.", repository: "https://example.test/project", sourceRef: "fixed-ref", sourceMode: "fixed-context",
      policySources: [{ id: "policy", kind: "task-requirement", text: "Only owners update.", location: "brief#/policy", revision: "v1", acceptance: { status: "accepted", actorRole: "author", reason: "Task requirement" } }],
      principals: [{ id: "member", role: "member", description: "Caller", startingCapabilities: [] }], resources: [{ id: "record", type: "record", description: "Target" }],
      entries: [{ id: "update", name: "update", locations: [{ path: "src/entry.ts", startLine: 1, endLine: 3 }] }],
      obligations: [{ id: "scenario", principalId: "member", resourceId: "record", relation: "non-owner", operation: "update", expectation: "deny", conditions: [], policySourceId: "policy", entryIds: ["update"] }],
      scopeAssurance: "Declared entry only.", requiredAnalysis: ["Trace the control."], constraints: ["Do not execute target."],
    }
    const inputFile = path.join(root, "assessment.json")
    await writeFile(inputFile, JSON.stringify({ schemaVersion: "authorization-assessment-input/v1", sourceIdentity: { repository: task.repository, sourceRef: task.sourceRef }, sourceRoot: "project", sources: ["src/entry.ts"], task }), "utf8")
    const requestFile = path.join(root, "request.json")
    await writeFile(requestFile, JSON.stringify({ schemaVersion: "authorization-evidence-request/v1", sourceRoot: "project", allowedFiles: ["src/entry.ts", "src/guard.ts"], entries: [{ entryKey: "update", path: "src/entry.ts", startLine: 1, endLine: 3 }], dependencies: [], limits: { maxFiles: 2, maxBytes: 500, maxDepth: 2 } }), "utf8")
    let calls = 0
    const out = path.join(root, "prepared")
    const code = await runAuthorizationCli(["prepare", `--input=${inputFile}`, `--request=${requestFile}`, `--out=${out}`, "--proposal-model=test/mock"], {
      stdout: () => {}, stderr: () => {}, providerFactory: () => ({ name: "mock", complete: async () => {
        calls++
        return { text: JSON.stringify({ dependencies: [{ id: "guard", from: "update", path: "src/guard.ts", startLine: 1, endLine: 3, match: "function authorize", reason: "control" }] }), toolCalls: [], tokens: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "end_turn" }
      }, completeWithToolResults: async () => { throw new Error("unexpected second call") } }),
    })
    expect(code).toBe(0)
    expect(calls).toBe(1)
    const report = JSON.parse(await readFile(path.join(out, "report.json"), "utf8"))
    expect(report.status).toBe("ready")
    expect(report.included.some((item: { origins: string[] }) => item.origins.includes("model-proposal:guard"))).toBe(true)
    expect(await readFile(path.join(out, "proposal.json"), "utf8")).toContain('"model": "test/mock"')
    const escapedOut = path.join(root, "escaped")
    const escaped = await runAuthorizationCli(["prepare", `--input=${inputFile}`, `--request=${requestFile}`, `--out=${escapedOut}`, "--proposal-model=test/mock"], {
      stdout: () => {}, stderr: () => {}, providerFactory: () => ({ name: "mock", complete: async () => ({
        text: JSON.stringify({ dependencies: [{ id: "escape", from: "update", path: "../secret.ts", startLine: 1, endLine: 1, reason: "control" }] }),
        toolCalls: [], tokens: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "end_turn",
      }), completeWithToolResults: async () => { throw new Error("unexpected second call") } }),
    })
    expect(escaped).toBe(1)
    await expect(stat(escapedOut)).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("publication failure keeps the already returned response and cost outside output", async () => {
  const demo = path.resolve("examples/authorization-assessment/evidence-editing")
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-publish-failure-"))
  try {
    const out = path.join(root, "out"), stdout: string[] = []
    const code = await runAuthorizationCli(["prepare", `--input=${path.join(demo, "base.json")}`, `--request=${path.join(demo, "request-ready.json")}`, `--out=${out}`, "--proposal-model=test/mock"], {
      stdout: s => stdout.push(s), stderr: () => {}, providerFactory: () => ({ name: "mock", complete: async () => {
        await mkdir(out); await writeFile(path.join(out, "someone-else.txt"), "preserve")
        return { text: '{"dependencies":[]}', toolCalls: [], tokens: { input: 123, output: 7, cacheRead: 0, cacheWrite: 0 }, costUsd: .001, durationMs: 1, stopReason: "end_turn" }
      }, completeWithToolResults: async () => { throw new Error("unexpected") } }),
    })
    expect(code).toBe(1)
    const account = JSON.parse(await readFile(path.join(JSON.parse(stdout.at(-1)!).attemptPath, "account.json"), "utf8"))
    expect(account.telemetry.totalActualUsd).toBe(.001)
    expect(account.published).toBe(false)
    expect(await readFile(path.join(out, "someone-else.txt"), "utf8")).toBe("preserve")
    await expect(stat(path.join(out, "assessment.json"))).rejects.toThrow()
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("ordinary discover v2 starts with entry seeds, preserves scene count, and check-only calls no provider", async () => {
  const demo = path.resolve("examples/authorization-assessment/evidence-editing"), root = await mkdtemp(path.join(os.tmpdir(), "authorization-discover-cli-"))
  try {
    const request = JSON.parse(await readFile(path.join(demo, "request-ready.json"), "utf8"))
    request.schemaVersion = "authorization-evidence-request/v2"; request.dependencies = []
    const requestFile = path.join(root, "request.json"); await writeFile(requestFile, JSON.stringify(request))
    const out = path.join(root, "out"), stdout: string[] = [], stderr: string[] = []
    const deps = { stdout: (s: string) => stdout.push(s), stderr: (s: string) => stderr.push(s), providerFactory: () => { throw new Error("zero provider") } }
    const args = ["prepare", `--input=${path.join(demo, "base.json")}`, `--request=${requestFile}`, `--out=${out}`, "--discover=true"]
    expect(await runAuthorizationCli([...args, "--check-only=true"], deps)).toBe(0)
    await expect(stat(out)).rejects.toThrow()
    expect(await runAuthorizationCli(args, deps)).toBe(0)
    const loaded = await loadLocalAuthorizationInput(path.join(out, "assessment.json"))
    expect(loaded.status).toBe("valid")
    if (loaded.status !== "valid") return
    expect(loaded.task.entries).toHaveLength(1)
    expect(loaded.task.obligations).toHaveLength(2)
    expect(loaded.sourceBundle.files.some(file => file.relativePath === "src/guard.ts")).toBe(true)
    expect(JSON.parse(stdout.at(-1)!).scopePreview).toMatchObject({ analysisEntries: 1, declaredScenarios: 2, expandedObligations: 2 })
  } finally { await rm(root, { recursive: true, force: true }) }
})
