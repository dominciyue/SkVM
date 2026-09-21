import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { LLMProvider, LLMResponse } from "../../providers/types.ts"
import type { AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { buildAuthorizationSourceCatalog } from "./inputs.ts"
import { loadLocalAuthorizationInput } from "./local-input.ts"
import {
  inspectLocalAuthorizationOutput,
  runLocalAuthorizationCli,
  type LocalAuthorizationCliDependencies,
} from "./local-run.ts"

const cleanupRoots: string[] = []

afterEach(async () => {
  while (cleanupRoots.length > 0) {
    await rm(cleanupRoots.pop()!, { recursive: true, force: true })
  }
})

function makeTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "free-form-task-91",
    request: "Assess the declared record update.",
    repository: "https://example.test/unrelated/local-project",
    sourceRef: "revision-free-form-91",
    sourceMode: "fixed-context",
    policySources: [{
      id: "policy",
      kind: "task-requirement",
      text: "Only owners may update records.",
      location: "assessment.json#/task/policySources/0",
      revision: "policy-91",
      acceptance: { status: "accepted", actorRole: "author", reason: "Bounded task requirement." },
    }],
    principals: [{ id: "member", role: "member", description: "A non-owner.", startingCapabilities: ["authenticated"] }],
    resources: [{ id: "record", type: "record", description: "A foreign record." }],
    entries: [{ id: "update", name: "updateRecord", locations: [{ path: "src/record.ts", startLine: 1, endLine: 5 }] }],
    obligations: [{
      id: "deny-update",
      principalId: "member",
      resourceId: "record",
      relation: "non-owner",
      operation: "update",
      expectation: "deny",
      conditions: [{ name: "authenticated", basis: "The task fixes an authenticated caller." }],
      policySourceId: "policy",
      entryIds: ["update"],
    }],
    scopeAssurance: "Only the explicit entry is assessed.",
    requiredAnalysis: ["Trace the strongest authorization control."],
    constraints: ["Do not execute the target."],
  }
}

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-local-run-"))
  cleanupRoots.push(root)
  const projectRoot = path.join(root, "project")
  await mkdir(path.join(projectRoot, "src"), { recursive: true })
  await writeFile(path.join(projectRoot, "src", "record.ts"), [
    "export async function updateRecord(request: Request) {",
    "  const principal = request.user",
    "  if (request.record.ownerId !== principal.id) throw new Error('denied')",
    "  return persistUpdate(request.record)",
    "}",
  ].join("\n"), "utf8")
  const task = makeTask()
  const inputPath = path.join(root, "assessment.json")
  await writeFile(inputPath, `${JSON.stringify({
    schemaVersion: "authorization-assessment-input/v1",
    sourceIdentity: { repository: task.repository, sourceRef: task.sourceRef },
    sourceRoot: "project",
    sources: ["src/record.ts"],
    task,
    analysisRequirements: [{
      id: "task.control",
      kind: "authorization-decision",
      obligationIds: ["deny-update"],
      question: "Which visible control decides the update?",
      applicability: "required",
      prerequisiteIds: [],
    }],
  }, null, 2)}\n`, "utf8")
  return { root, inputPath, outRoot: path.join(root, "output") }
}

function responseFor(sourceId: string): LLMResponse {
  const cite = (statement: string, line: number) => [{
    statement,
    citations: [{ sourceId, startLine: line, endLine: line }],
  }]
  const wire = {
    schemaVersion: "source-authorization-assessment-wire/v2",
    results: [{
      obligationId: "deny-update::update",
      conclusion: "source_refuted",
      explanation: "The ownership branch rejects a non-owner before persistence.",
      facts: {
        entry: cite("The update entry is declared.", 1),
        binding: cite("The request user binds the principal.", 2),
        control: cite("The owner comparison rejects a non-owner.", 3),
        effect: cite("Persistence follows the ownership branch.", 4),
        condition: cite("The request supplies the authenticated principal.", 2),
      },
      decisiveMissingFacts: [],
      suggestedObservations: [],
    }],
    scopeClaim: { kind: "declared-obligations-only", statement: "Only the declared update is assessed." },
    coverage: [{
      requirementId: "task.control",
      obligationId: "deny-update::update",
      status: "addressed",
      explanation: "The control fact addresses the declared question.",
      factPointers: ["/results/0/facts/control/0"],
    }],
  }
  return {
    text: "",
    toolCalls: [{ id: "local-result", name: "submit_authorization_result", arguments: wire }],
    tokens: { input: 100, output: 40, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.002,
    durationMs: 10,
    stopReason: "tool_use",
  }
}

async function providerFor(inputPath: string, calls: { factory: number; provider: number }): Promise<LLMProvider> {
  const loaded = await loadLocalAuthorizationInput(inputPath)
  if (loaded.status !== "valid") throw new Error("test fixture must load")
  const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!catalog.success) throw new Error("test fixture catalog must build")
  const response = responseFor(catalog.catalog.sources[0]!.sourceId)
  calls.factory += 1
  return {
    name: "local-offline-provider",
    async complete() {
      calls.provider += 1
      return response
    },
    async completeWithToolResults() {
      throw new Error("local runner must not execute tool results")
    },
  }
}

function dependencies(
  inputPath: string,
  calls: { factory: number; provider: number },
  output: string[],
): LocalAuthorizationCliDependencies {
  return {
    stdout: value => output.push(value),
    stderr: value => output.push(value),
    env: {},
    providerFactory: async () => providerFor(inputPath, calls),
  }
}

describe("local authorization runner", () => {
  it("checks arbitrary input without creating a provider and rejects bad input before provider creation", async () => {
    const fixture = await makeFixture()
    const calls = { factory: 0, provider: 0 }
    const output: string[] = []
    const deps = dependencies(fixture.inputPath, calls, output)

    expect(await runLocalAuthorizationCli(["check", `--input=${fixture.inputPath}`], deps)).toBe(0)
    expect(calls).toEqual({ factory: 0, provider: 0 })
    expect(output.join("\n")).toContain('"taskId": "free-form-task-91"')
    expect(output.join("\n")).not.toContain("manifest")
    expect(output.join("\n")).not.toContain("oracle")

    const invalidPath = path.join(fixture.root, "invalid.json")
    await writeFile(invalidPath, "{}\n", "utf8")
    output.length = 0
    expect(await runLocalAuthorizationCli([
      "run",
      `--input=${invalidPath}`,
      "--model=mock/model",
      `--out=${fixture.outRoot}`,
    ], deps)).toBe(1)
    expect(calls).toEqual({ factory: 0, provider: 0 })
    expect(output.join("\n")).toContain("invalid")
  })

  it("creates immutable sessions, writes JSON/JSONL/text artifacts, and inspects without a provider", async () => {
    const fixture = await makeFixture()
    const calls = { factory: 0, provider: 0 }
    const output: string[] = []
    const deps = dependencies(fixture.inputPath, calls, output)
    const runArgs = [
      "run",
      `--input=${fixture.inputPath}`,
      "--model=mock/model",
      `--out=${fixture.outRoot}`,
    ]

    expect(await runLocalAuthorizationCli(runArgs, deps)).toBe(0)
    expect(calls).toEqual({ factory: 1, provider: 1 })
    const firstReport = JSON.parse(output.at(-1)!) as { sessionId: string; sessionPath: string; status: string }
    expect(firstReport.status).toBe("completed")
    expect(firstReport.sessionPath.startsWith(path.resolve(fixture.outRoot))).toBe(true)
    const firstResultBytes = await readFile(path.join(firstReport.sessionPath, "result.json"), "utf8")
    expect(await readFile(path.join(firstReport.sessionPath, "events.jsonl"), "utf8")).toContain('"kind":"dispatch"')
    expect(await readFile(path.join(firstReport.sessionPath, "summary.txt"), "utf8")).toContain("source_refuted")
    expect(await readFile(path.join(fixture.outRoot, "sessions.jsonl"), "utf8")).toContain(firstReport.sessionId)

    let inspectProviderCreated = false
    output.length = 0
    expect(await runLocalAuthorizationCli(["inspect", `--out=${fixture.outRoot}`], {
      ...deps,
      providerFactory: async () => {
        inspectProviderCreated = true
        throw new Error("inspect must be offline")
      },
    })).toBe(0)
    expect(inspectProviderCreated).toBe(false)
    const inspected = JSON.parse(output.at(-1)!) as { sessionId: string; status: string }
    expect(inspected).toEqual(expect.objectContaining({ sessionId: firstReport.sessionId, status: "completed" }))

    output.length = 0
    expect(await runLocalAuthorizationCli(runArgs, deps)).toBe(0)
    expect(calls).toEqual({ factory: 2, provider: 2 })
    const secondReport = JSON.parse(output.at(-1)!) as { sessionId: string; sessionPath: string }
    expect(secondReport.sessionId).not.toBe(firstReport.sessionId)
    expect(await readFile(path.join(firstReport.sessionPath, "result.json"), "utf8")).toBe(firstResultBytes)
    expect(await readFile(path.join(secondReport.sessionPath, "result.json"), "utf8")).not.toBe("")
  })

  it("reports an interrupted dispatched session as completion-unknown without resending", async () => {
    const fixture = await makeFixture()
    const sessionId = "20260921T000000000Z-deadbeef"
    const sessionPath = path.join(fixture.outRoot, "sessions", sessionId)
    await mkdir(sessionPath, { recursive: true })
    await writeFile(path.join(sessionPath, "session.json"), `${JSON.stringify({
      schemaVersion: "authorization-local-session/v1",
      sessionId,
      createdAt: "2026-09-21T00:00:00.000Z",
    })}\n`, "utf8")
    await writeFile(path.join(sessionPath, "dispatch.json"), "{}\n", "utf8")
    await writeFile(path.join(fixture.outRoot, "sessions.jsonl"), `${JSON.stringify({
      schemaVersion: "authorization-local-session-index-entry/v1",
      sessionId,
      relativePath: `sessions/${sessionId}`,
      status: "running",
      createdAt: "2026-09-21T00:00:00.000Z",
    })}\n`, "utf8")

    const inspected = await inspectLocalAuthorizationOutput(fixture.outRoot)
    expect(inspected).toEqual(expect.objectContaining({ sessionId, status: "completion-unknown" }))
  })

  it("keeps provider-unavailable artifacts truthful and does not claim a dispatch", async () => {
    const fixture = await makeFixture()
    const output: string[] = []
    const exitCode = await runLocalAuthorizationCli([
      "run",
      `--input=${fixture.inputPath}`,
      "--model=missing/model",
      `--out=${fixture.outRoot}`,
    ], {
      stdout: value => output.push(value),
      stderr: value => output.push(value),
      providerFactory: async () => { throw new Error("provider configuration unavailable") },
    })

    expect(exitCode).toBe(1)
    const report = JSON.parse(output.at(-1)!) as {
      status: string
      sessionPath: string
      artifacts: Record<string, string>
    }
    expect(report.status).toBe("provider-unavailable")
    expect(report.artifacts.dispatch).toBeUndefined()
    expect(report.artifacts.events).toBe("events.jsonl")
    expect(report.artifacts.run).toBeUndefined()
    expect(await readFile(path.join(report.sessionPath, "events.jsonl"), "utf8")).toBe("")
    expect(await readFile(path.join(report.sessionPath, "result.json"), "utf8")).toContain("provider-unavailable")
    expect(await readFile(path.join(report.sessionPath, "summary.txt"), "utf8")).toContain("provider configuration unavailable")
  })
})
