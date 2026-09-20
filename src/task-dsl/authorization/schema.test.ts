import { describe, expect, it } from "bun:test"
import { parseAuthorizationTask, type AuthorizationTaskV0 } from "./schema.ts"

function makeTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "generic-document-share",
    request: "Check whether a member may update an unrelated document.",
    repository: "https://example.test/acme/documents",
    sourceRef: "revision-17",
    sourceMode: "fixed-context",
    policySources: [{
      id: "policy-share-write",
      kind: "explicit-task-requirement",
      text: "A member may update only documents they own or were granted write access to.",
      location: "task.requirement",
      revision: "request-v1",
      acceptance: {
        status: "accepted",
        actorRole: "task-author",
        reason: "The task author supplied the normative rule.",
      },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A signed-in non-administrator.",
      startingCapabilities: [],
    }],
    resources: [{
      id: "document",
      type: "document",
      description: "A stored document selected by the request.",
    }],
    entries: [{
      id: "update-document",
      name: "PATCH /documents/:id",
      locations: [{ path: "src/documents.ts", startLine: 10, endLine: 35 }],
    }],
    obligations: [{
      id: "member-unrelated-update",
      principalId: "member",
      resourceId: "document",
      relation: "unrelated-no-write-grant",
      operation: "update",
      expectation: "deny",
      conditions: [],
      policySourceId: "policy-share-write",
      entryIds: ["update-document"],
    }],
    scopeAssurance: "The supplied source contains the bounded entry-to-effect path.",
    requiredAnalysis: ["Trace identity, resource binding, strongest control, and update effect."],
    constraints: ["Use only the supplied source."],
  }
}

describe("parseAuthorizationTask", () => {
  it("accepts a strict non-case-specific task and empty optional arrays", () => {
    const parsed = parseAuthorizationTask(makeTask())

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.task.taskId).toBe("generic-document-share")
      expect(parsed.task.principals[0]?.startingCapabilities).toEqual([])
      expect(parsed.task.obligations[0]?.conditions).toEqual([])
    }
  })

  it("reports a missing version at its field path", () => {
    const { schemaVersion: _removed, ...withoutVersion } = makeTask()
    const parsed = parseAuthorizationTask(withoutVersion)

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.diagnostics.some(diagnostic => diagnostic.path === "schemaVersion")).toBe(true)
    }
  })

  it("reports nested type errors with a useful path", () => {
    const invalid = structuredClone(makeTask()) as unknown as Record<string, unknown>
    const obligations = invalid.obligations as Array<Record<string, unknown>>
    obligations[0]!.conditions = "authenticated"

    const parsed = parseAuthorizationTask(invalid)

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.diagnostics.some(diagnostic => diagnostic.path === "obligations.0.conditions")).toBe(true)
    }
  })

  it("rejects unknown fields instead of silently carrying ad hoc semantics", () => {
    const invalid = { ...makeTask(), conditionsNote: "extra" }
    const parsed = parseAuthorizationTask(invalid)

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.diagnostics.some(diagnostic => diagnostic.code === "unrecognized_keys")).toBe(true)
    }
  })
})
