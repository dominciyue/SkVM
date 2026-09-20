import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import type { CompletionParams, LLMProvider, LLMResponse } from "../../providers/types.ts"
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import type { SourceBundle } from "./inputs.ts"
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
      provider: sequenceProvider([toolResponse(makeAnswer() as unknown as Record<string, unknown>)], calls, continuationCalls),
      arm: "D",
      options: { timeoutMs: 1_000, maxTokens: 2_000, maxDomainRepairs: 1 },
    })

    expect(run.status).toBe("completed")
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
        path: { type: "string" },
        startLine: { type: "number" },
        endLine: { type: "number" },
        quote: { type: "string" },
      }))
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
        toolResponse(makeAnswer("repository-all-entries") as unknown as Record<string, unknown>),
        toolResponse(makeAnswer() as unknown as Record<string, unknown>),
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
  })

  it("stops after one repair even when actionable diagnostics remain", async () => {
    const calls: CompletionParams[] = []
    const continuationCalls = { value: 0 }
    const invalid = makeAnswer("repository-all-entries")
    const run = await runAuthorizationTask({
      task: makeTask(),
      sourceBundle: makeBundle(),
      provider: sequenceProvider([
        toolResponse(invalid as unknown as Record<string, unknown>),
        toolResponse(invalid as unknown as Record<string, unknown>),
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
        toolResponse(makeAnswer() as unknown as Record<string, unknown>, "execute_command"),
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
    expect(run.attempts[0]?.status).toBe("pending")
    expect(run.telemetry.totalActualUsd).toBeNull()
    expect(run.telemetry.unknownUsageCalls).toBe(1)
  })
})
