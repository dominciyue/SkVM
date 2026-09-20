import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import type { CompletionParams, LLMProvider, LLMResponse } from "../../providers/types.ts"
import { ProviderNetworkError } from "../../providers/errors.ts"
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { buildAuthorizationSourceCatalog, type SourceBundle } from "./inputs.ts"
import { runAuthorizationTask } from "./host.ts"

const sourceContent = [
  "export async function updateRecord(request: Request) {",
  "  const principal = request.user",
  "  if (!await canWrite(principal, request.recordId)) throw new Error('denied')",
  "  return persistUpdate(request.recordId, request.body)",
  "}",
].join("\n")

function makeTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "host-record-update",
    request: "Determine whether a member can update an unrelated record.",
    repository: "https://example.test/acme/records",
    sourceRef: "records-r1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "record-write-policy",
      kind: "project-policy",
      text: "Only owners or explicit write grantees may update a record.",
      location: "task.requirement",
      revision: "policy-r1",
      acceptance: {
        status: "accepted",
        actorRole: "task-author",
        reason: "The author owns the bounded requirement.",
      },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A member without a write grant.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{ id: "record", type: "record", description: "An unrelated record." }],
    entries: [{
      id: "update-record",
      name: "updateRecord",
      locations: [{ path: "inputs/sample/source.ts", startLine: 1, endLine: 5 }],
    }],
    obligations: [{
      id: "deny-unrelated-update",
      principalId: "member",
      resourceId: "record",
      relation: "unrelated-no-write-grant",
      operation: "update",
      expectation: "deny",
      conditions: [{ name: "authenticated", basis: "The request exposes a signed-in principal." }],
      policySourceId: "record-write-policy",
      entryIds: ["update-record"],
    }],
    scopeAssurance: "The fixed crop covers the declared path; discovery is not tested.",
    requiredAnalysis: ["Trace binding, strongest control, and effect."],
    constraints: ["Use only fixed source and do not execute the target."],
  }
}

function makeBundle(): SourceBundle {
  return {
    repository: "https://example.test/acme/records",
    sourceRef: "records-r1",
    sourceMode: "fixed-context",
    isolation: "exact-allowlist",
    files: [{
      relativePath: "inputs/sample/source.ts",
      content: sourceContent,
      sha256: createHash("sha256").update(sourceContent).digest("hex"),
      cropRange: { startLine: 1, endLine: 5 },
      originalLocations: ["src/records.ts:10-14"],
    }],
  }
}

function cite(statement: string, line: number, quote: string) {
  return [{
    statement,
    citations: [{ path: "inputs/sample/source.ts", startLine: line, endLine: line, quote }],
  }]
}

function makeAnswer(scopeKind: AuthorizationResultV0["scopeClaim"]["kind"] = "declared-obligations-only"): AuthorizationResultV0 {
  return {
    schemaVersion: "source-authorization-assessment-result/v0",
    taskId: "host-record-update",
    repository: "https://example.test/acme/records",
    sourceRef: "records-r1",
    results: [{
      obligationId: "deny-unrelated-update::update-record",
      conclusion: "source_refuted",
      explanation: "The visible canWrite control prevents the stated unauthorized update.",
      facts: {
        entry: cite("The entry starts here.", 1, "updateRecord"),
        binding: cite("The request user is the principal.", 2, "request.user"),
        control: cite("canWrite is the strongest visible control.", 3, "if (!await canWrite"),
        effect: cite("Persistence occurs after the control.", 4, "persistUpdate"),
        condition: cite("The principal is drawn from the authenticated request.", 2, "principal"),
      },
      decisiveMissingFacts: [],
      suggestedObservations: [],
    }],
    scopeClaim: {
      kind: scopeKind,
      statement: scopeKind === "declared-obligations-only"
        ? "The declared obligation is disposed; discovery is not tested."
        : "All authorization entries in the repository are complete.",
    },
  }
}

function makeWireAnswer(
  scopeKind: AuthorizationResultV0["scopeClaim"]["kind"] = "declared-obligations-only",
): Record<string, unknown> {
  const answer = makeAnswer(scopeKind)
  const built = buildAuthorizationSourceCatalog(makeBundle())
  if (!built.success) throw new Error("host fixture source bundle must be valid")
  const sourceId = built.catalog.sources[0]!.sourceId
  return {
    schemaVersion: "source-authorization-assessment-wire/v1",
    results: answer.results.map(result => ({
      obligationId: result.obligationId,
      conclusion: result.conclusion,
      explanation: result.explanation,
      facts: Object.fromEntries(Object.entries(result.facts).map(([group, facts]) => [
        group,
        facts.map(fact => ({
          statement: fact.statement,
          citations: fact.citations.map(citation => ({
            sourceId,
            startLine: citation.startLine,
            endLine: citation.endLine,
          })),
        })),
      ])),
      decisiveMissingFacts: result.decisiveMissingFacts,
      suggestedObservations: result.suggestedObservations,
    })),
    scopeClaim: answer.scopeClaim,
  }
}

function toolResponse(argumentsValue: Record<string, unknown>, name = "submit_authorization_result"): LLMResponse {
  return {
    text: "",
    toolCalls: [{ id: "tool-1", name, arguments: argumentsValue }],
    tokens: { input: 100, output: 40, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.05,
    durationMs: 20,
    stopReason: "tool_use",
  }
}

function sequenceProvider(
  outputs: Array<LLMResponse | Error | "pending">,
  calls: CompletionParams[],
  continuationCalls: { value: number },
): LLMProvider {
  let index = 0
  return {
    name: "sequence-provider",
    async complete(params) {
      calls.push(params)
      const output = outputs[index++]
      if (output === "pending") return new Promise<LLMResponse>(() => {})
      if (output instanceof Error) throw output
      if (!output) throw new Error("No configured response")
      return output
    },
    async completeWithToolResults() {
      continuationCalls.value += 1
      throw new Error("must not execute tools")
    },
  }
}

describe("runAuthorizationTask", () => {
  it("uses only the non-executed result schema tool", async () => {
    const calls: CompletionParams[] = []
    const continuationCalls = { value: 0 }
    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider: sequenceProvider([toolResponse(makeWireAnswer())], calls, continuationCalls),
      arm: "D",
      options: { timeoutMs: 1_000, maxTokens: 2_000, maxDomainRepairs: 1 },
    })

    expect(run.status).toBe("completed")
    expect(run.initial?.result).toEqual(expect.objectContaining({
      taskId: "host-record-update",
      repository: "https://example.test/acme/records",
      sourceRef: "records-r1",
    }))
    expect(run.initial?.result.results[0]?.facts.control[0]?.citations[0]?.quote)
      .toBe("  if (!await canWrite(principal, request.recordId)) throw new Error('denied')")
    expect(run.initial?.normalization?.normalizerVersion).toBe("authorization-wire-normalizer/v1")
    expect(calls).toHaveLength(1)
    expect(calls[0]?.tools?.map(tool => tool.name)).toEqual(["submit_authorization_result"])
    expect(calls[0]?.toolChoice).toEqual({ name: "submit_authorization_result" })
    const resultToolSchema = calls[0]?.tools?.[0]?.inputSchema as {
      properties?: {
        results?: {
          items?: {
            properties?: {
              facts?: {
                properties?: {
                  entry?: {
                    items?: {
                      properties?: {
                        citations?: { items?: { properties?: Record<string, unknown> } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(resultToolSchema.properties?.results?.items?.properties?.facts
      ?.properties?.entry?.items?.properties?.citations?.items?.properties)
      .toEqual(expect.objectContaining({
        sourceId: { type: "string" },
        startLine: { type: "number" },
        endLine: { type: "number" },
      }))
    expect(resultToolSchema.properties).not.toHaveProperty("taskId")
    expect(resultToolSchema.properties).not.toHaveProperty("repository")
    expect(resultToolSchema.properties).not.toHaveProperty("sourceRef")
    expect(resultToolSchema.properties?.results?.items?.properties?.facts
      ?.properties?.entry?.items?.properties?.citations?.items?.properties)
      .not.toHaveProperty("path")
    expect(resultToolSchema.properties?.results?.items?.properties?.facts
      ?.properties?.entry?.items?.properties?.citations?.items?.properties)
      .not.toHaveProperty("quote")
    expect(continuationCalls.value).toBe(0)
    expect(run.attempts[0]?.request.executableTools).toBe(false)
  })

  it("preserves initial diagnostics and performs at most one oracle-free domain repair", async () => {
    const calls: CompletionParams[] = []
    const continuationCalls = { value: 0 }
    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider: sequenceProvider([
        toolResponse(makeWireAnswer("repository-all-entries")),
        toolResponse(makeWireAnswer()),
      ], calls, continuationCalls),
      arm: "B",
      options: { timeoutMs: 1_000, maxTokens: 2_000, maxDomainRepairs: 1 },
    })

    expect(run.status).toBe("completed")
    expect(run.initial?.validation.completeness.status).toBe("rejected")
    expect(run.repair?.validation.completeness.status).toBe("accepted")
    expect(run.finalKind).toBe("repair")
    expect(run.attempts.map(attempt => attempt.phase)).toEqual(["initial", "domain-repair"])
    expect(calls[1]?.messages[0]?.content).toContain("unsupported-completeness")
    expect(calls[1]?.messages[0]?.content.toLowerCase()).not.toContain("oracle")
    expect(calls[1]?.messages[0]?.content.match(/## Current wire answer/g)).toHaveLength(1)
    expect(calls[1]?.messages[0]?.content.match(/## Deterministic host diagnostics/g)).toHaveLength(1)
    expect(calls[1]?.messages[0]?.content.match(/===== BEGIN ALLOWED INPUT:/g)).toHaveLength(1)
    expect(run.promptCharacters?.initial.source).toBeGreaterThan(sourceContent.length)
    expect(run.promptCharacters?.repair).toEqual(expect.objectContaining({
      total: calls[1]?.messages[0]?.content.length,
      tokenMeasurement: "provider-reported-only",
    }))
  })

  it("uses the same narrow wire contract for schema-tool fallback parsing", async () => {
    const calls: CompletionParams[] = []
    const wireAnswer = makeWireAnswer()
    const noToolResponse = {
      ...toolResponse(wireAnswer),
      toolCalls: [],
    }
    const promptResponse = {
      ...toolResponse(wireAnswer),
      text: JSON.stringify(wireAnswer),
      toolCalls: [],
    }
    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider: sequenceProvider([noToolResponse, promptResponse], calls, { value: 0 }),
      arm: "D",
      options: { timeoutMs: 1_000, maxTokens: 2_000, maxDomainRepairs: 1 },
    })

    expect(run.status).toBe("completed")
    expect(run.attempts.map(attempt => attempt.transport)).toEqual(["schema-tool", "prompt-parse"])
    const fallbackSchema = calls[1]?.messages[0]?.content.split(
      "You MUST respond with a valid JSON object conforming to this schema:",
    )[1] ?? ""
    expect(fallbackSchema).toContain('"sourceId"')
    expect(fallbackSchema).not.toContain('"quote"')
    expect(fallbackSchema).not.toContain('"repository"')
  })

  it("stops after one repair even when actionable diagnostics remain", async () => {
    const calls: CompletionParams[] = []
    const continuationCalls = { value: 0 }
    const invalid = makeWireAnswer("repository-all-entries")
    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider: sequenceProvider([
        toolResponse(invalid),
        toolResponse(invalid),
      ], calls, continuationCalls),
      arm: "D",
      options: { timeoutMs: 1_000, maxTokens: 2_000, maxDomainRepairs: 1 },
    })

    expect(run.status).toBe("completed-with-diagnostics")
    expect(calls).toHaveLength(2)
    expect(run.repair?.validation.diagnostics).toContainEqual(expect.objectContaining({
      code: "unsupported-completeness",
    }))
  })

  it("treats an unknown returned tool name as a protocol failure", async () => {
    const calls: CompletionParams[] = []
    const continuationCalls = { value: 0 }
    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider: sequenceProvider([
        toolResponse(makeWireAnswer(), "execute_command"),
      ], calls, continuationCalls),
      arm: "B",
      options: { timeoutMs: 1_000, maxTokens: 2_000, maxDomainRepairs: 1 },
    })

    expect(run.status).toBe("transport-failed")
    expect(run.attempts).toHaveLength(1)
    expect(run.attempts[0]?.status).toBe("protocol-error")
    expect(continuationCalls.value).toBe(0)
  })

  it("returns timeout-unknown without retrying a request whose completion is unknown", async () => {
    const calls: CompletionParams[] = []
    const continuationCalls = { value: 0 }
    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider: sequenceProvider(["pending"], calls, continuationCalls),
      arm: "B",
      options: { timeoutMs: 10, maxTokens: 2_000, maxDomainRepairs: 1 },
    })

    expect(run.status).toBe("timeout-unknown")
    expect(calls).toHaveLength(1)
    expect(run.attempts[0]?.status).toBe("timeout")
    expect(run.telemetry.totalActualUsd).toBeNull()
    expect(run.telemetry.unknownUsageCalls).toBe(1)
    expect(run.events?.map(event => event.kind)).toEqual(["dispatch", "timeout", "closed"])
  })

  it("does not start a late prompt fallback after the unit has timed out", async () => {
    let providerCalls = 0
    const provider: LLMProvider = {
      name: "late-invalid-schema-provider",
      async complete() {
        providerCalls += 1
        if (providerCalls === 1) {
          await new Promise(resolve => setTimeout(resolve, 25))
          return {
            ...toolResponse(makeWireAnswer()),
            toolCalls: [],
          }
        }
        return {
          ...toolResponse(makeWireAnswer()),
          text: JSON.stringify(makeWireAnswer()),
          toolCalls: [],
        }
      },
      async completeWithToolResults() {
        throw new Error("must not execute tools")
      },
    }

    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider,
      arm: "B",
      options: { timeoutMs: 5, maxTokens: 2_000, maxDomainRepairs: 1 },
    })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(run.status).toBe("timeout-unknown")
    expect(providerCalls).toBe(1)
    expect(run.events?.map(event => event.kind)).toEqual([
      "dispatch",
      "timeout",
      "closed",
      "late-response",
    ])
  })

  it("records a valid late response without adopting it as the experimental answer", async () => {
    let providerCalls = 0
    const persistedEvents: string[] = []
    const provider: LLMProvider = {
      name: "late-valid-provider",
      async complete() {
        providerCalls += 1
        await new Promise(resolve => setTimeout(resolve, 25))
        return toolResponse(makeWireAnswer())
      },
      async completeWithToolResults() {
        throw new Error("must not execute tools")
      },
    }

    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider,
      arm: "D",
      options: { timeoutMs: 5, maxTokens: 2_000, maxDomainRepairs: 1 },
      onLifecycleEvent: event => {
        persistedEvents.push(event.kind)
      },
    })
    await new Promise(resolve => setTimeout(resolve, 35))

    expect(run.status).toBe("timeout-unknown")
    expect(run.initial).toBeUndefined()
    expect(run.initialTransport).toBeUndefined()
    expect(providerCalls).toBe(1)
    expect(run.attempts[0]?.lateSettlement).toEqual(expect.objectContaining({ kind: "response" }))
    expect(persistedEvents).toEqual(["dispatch", "timeout", "closed", "late-response"])
  })

  it("preserves the initial result when the single repair call times out", async () => {
    const calls: CompletionParams[] = []
    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider: sequenceProvider([
        toolResponse(makeWireAnswer("repository-all-entries")),
        "pending",
      ], calls, { value: 0 }),
      arm: "B",
      options: { timeoutMs: 5, maxTokens: 2_000, maxDomainRepairs: 1 },
    })

    expect(run.status).toBe("timeout-unknown")
    expect(run.initial?.validation.completeness.status).toBe("rejected")
    expect(run.initialTransport?.normalization.result).toBeDefined()
    expect(run.repair).toBeUndefined()
    expect(run.finalKind).toBe("initial")
    expect(run.error?.name).toBe("AuthorizationCallTimeoutError")
    expect(run.attempts.map(attempt => [attempt.phase, attempt.status])).toEqual([
      ["initial", "response"],
      ["domain-repair", "timeout"],
    ])
  })

  it("records a provider rejection without starting prompt fallback", async () => {
    const calls: CompletionParams[] = []
    const failure = new ProviderNetworkError("network unavailable", "rejecting-provider")
    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider: sequenceProvider([failure], calls, { value: 0 }),
      arm: "B",
      options: { timeoutMs: 1_000, maxTokens: 2_000, maxDomainRepairs: 1 },
    })

    expect(run.status).toBe("transport-failed")
    expect(calls).toHaveLength(1)
    expect(run.attempts[0]?.status).toBe("error")
    expect(run.events?.map(event => event.kind)).toEqual(["dispatch", "error", "closed"])
  })
})
