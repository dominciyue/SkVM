import { describe, expect, it } from "bun:test"
import { compileAuthorizationTask } from "./semantics.ts"
import type { AuthorizationTaskV0 } from "./schema.ts"

function makeTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "generic-record-access",
    request: "Check a member's write authorization for a related record.",
    repository: "https://example.test/acme/records",
    sourceRef: "source-r1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "accepted-write-policy",
      kind: "project-policy",
      text: "Only owners and explicit write grantees may update a record.",
      location: "POLICY.md#record-write",
      revision: "policy-r1",
      acceptance: {
        status: "accepted",
        actorRole: "repository-owner",
        reason: "The repository owner identifies this as the governing rule.",
      },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A member without administrative capability.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{
      id: "record",
      type: "record",
      description: "A record selected by an incoming identifier.",
    }],
    entries: [{
      id: "update-record",
      name: "updateRecord",
      locations: [{ path: "src/records.ts", startLine: 20, endLine: 60 }],
    }],
    obligations: [{
      id: "deny-unrelated-update",
      principalId: "member",
      resourceId: "record",
      relation: "unrelated-no-write-grant",
      operation: "update",
      expectation: "deny",
      conditions: [{ name: "authenticated", basis: "The route requires a signed-in user." }],
      policySourceId: "accepted-write-policy",
      entryIds: ["update-record"],
    }],
    scopeAssurance: "The bounded entry and shared authorization helper are supplied.",
    requiredAnalysis: ["Trace the strongest visible write control."],
    constraints: ["Do not infer deployment controls."],
  }
}

describe("compileAuthorizationTask", () => {
  it("expands a valid explicit obligation into one runnable entry task", () => {
    const compiled = compileAuthorizationTask(makeTask())

    expect(compiled.status).toBe("ready")
    expect(compiled.runnableObligations).toHaveLength(1)
    expect(compiled.blockedObligations).toHaveLength(0)
    expect(compiled.runnableObligations[0]?.id).toBe("deny-unrelated-update::update-record")
  })

  it("diagnoses dangling references and does not run the affected obligation", () => {
    const task = makeTask()
    task.obligations[0]!.principalId = "missing-principal"

    const compiled = compileAuthorizationTask(task)

    expect(compiled.runnableObligations).toHaveLength(0)
    expect(compiled.blockedObligations).toHaveLength(1)
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({
      code: "dangling-reference",
      path: "obligations.0.principalId",
    }))
  })

  it("diagnoses duplicate entity IDs instead of choosing one implicitly", () => {
    const task = makeTask()
    task.principals.push({ ...task.principals[0]! })

    const compiled = compileAuthorizationTask(task)

    expect(compiled.runnableObligations).toHaveLength(0)
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({
      code: "duplicate-id",
      path: "principals.1.id",
    }))
  })

  it("blocks only obligations whose policy remains conflicted", () => {
    const task = makeTask()
    task.policySources.push({
      id: "conflicted-policy",
      kind: "explicit-task-requirement",
      text: "A legacy statement appears to permit all members to update records.",
      location: "task.legacyRequirement",
      revision: "request-v1",
      acceptance: {
        status: "conflicted",
        actorRole: "task-author",
        reason: "The legacy statement conflicts with the repository policy.",
      },
    })
    task.obligations.push({
      ...task.obligations[0]!,
      id: "legacy-update-rule",
      policySourceId: "conflicted-policy",
    })

    const compiled = compileAuthorizationTask(task)

    expect(compiled.runnableObligations).toHaveLength(1)
    expect(compiled.blockedObligations).toHaveLength(1)
    expect(compiled.blockedObligations[0]).toEqual(expect.objectContaining({
      id: "legacy-update-rule::update-record",
      blockedBy: "policy-conflicted",
    }))
  })

  it("returns needs-input rather than vacuous completion for an empty obligation set", () => {
    const task = makeTask()
    task.obligations = []

    const compiled = compileAuthorizationTask(task)

    expect(compiled.status).toBe("needs-input")
    expect(compiled.runnableObligations).toEqual([])
    expect(compiled.blockedObligations).toEqual([])
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({ code: "empty-obligations" }))
  })

  it("deduplicates repeated entry references within one authored obligation", () => {
    const task = makeTask()
    task.obligations[0]!.entryIds = ["update-record", "update-record"]

    const compiled = compileAuthorizationTask(task)

    expect(compiled.runnableObligations.map(obligation => obligation.id)).toEqual([
      "deny-unrelated-update::update-record",
    ])
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({
      code: "duplicate-entry-reference",
      path: "obligations.0.entryIds.1",
      severity: "warning",
    }))
  })

  it("keeps expanded obligation IDs stable when entry arrays are reordered", () => {
    const task = makeTask()
    task.entries.push({
      id: "batch-update-records",
      name: "batchUpdateRecords",
      locations: [{ path: "src/batch.ts", startLine: 5, endLine: 25 }],
    })
    task.obligations[0]!.entryIds = ["update-record", "batch-update-records"]
    const before = compileAuthorizationTask(task)

    const reordered = structuredClone(task)
    reordered.entries.reverse()
    reordered.obligations[0]!.entryIds.reverse()
    const after = compileAuthorizationTask(reordered)

    expect(after.runnableObligations.map(item => item.id).sort()).toEqual(
      before.runnableObligations.map(item => item.id).sort(),
    )
  })

  it("adds only the explicit write-grantee obligation when that relation is declared", () => {
    const task = makeTask()
    const before = compileAuthorizationTask(task)
    task.obligations.push({
      ...task.obligations[0]!,
      id: "allow-explicit-grantee-update",
      relation: "non-owner-explicit-write-grant",
      expectation: "allow",
    })

    const after = compileAuthorizationTask(task)

    expect(before.runnableObligations.map(item => item.id)).toEqual([
      "deny-unrelated-update::update-record",
    ])
    expect(after.runnableObligations.map(item => item.id).sort()).toEqual([
      "allow-explicit-grantee-update::update-record",
      "deny-unrelated-update::update-record",
    ])
  })

  it("blocks obligations when the referenced principal lacks role information", () => {
    const task = makeTask()
    task.principals[0]!.role = ""

    const compiled = compileAuthorizationTask(task)

    expect(compiled.runnableObligations).toEqual([])
    expect(compiled.blockedObligations).toHaveLength(1)
    expect(compiled.diagnostics).toContainEqual(expect.objectContaining({
      code: "missing-principal-role",
      path: "principals.0.role",
    }))
  })

  it("records source and policy revisions as explicit dependencies", () => {
    const compiled = compileAuthorizationTask(makeTask())

    expect(compiled.dependencies).toEqual({
      repository: "https://example.test/acme/records",
      sourceRef: "source-r1",
      sourceMode: "fixed-context",
      policies: [{
        id: "accepted-write-policy",
        revision: "policy-r1",
        acceptanceStatus: "accepted",
      }],
    })
  })
})
