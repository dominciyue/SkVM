import { describe, expect, it } from "bun:test"
import {
  AnalysisRequirementSchema,
  compileAnalysisRequirements,
  type AnalysisRequirement,
} from "./relations.ts"
import type { AuthorizationTaskV0 } from "./schema.ts"

function makeTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "record-owner-role",
    request: "Assess update and read authorization for a foreign record.",
    repository: "https://example.test/acme/records",
    sourceRef: "records-r1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "record-policy",
      kind: "accepted-task-policy",
      text: "Owners may update records; administrators may read any record.",
      location: "task.policy",
      revision: "policy-r1",
      acceptance: {
        status: "accepted",
        actorRole: "task-author",
        reason: "The task author supplied the bounded policy.",
      },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A non-owner member.",
      startingCapabilities: ["authenticated"],
    }, {
      id: "administrator",
      role: "active administrator",
      description: "An administrator reading a foreign record.",
      startingCapabilities: ["authenticated", "administrator"],
    }],
    resources: [{
      id: "foreign-record",
      type: "record",
      description: "A record owned by another member.",
    }],
    entries: [{
      id: "update-record",
      name: "updateRecord",
      locations: [{ path: "src/records.ts", startLine: 30, endLine: 50 }],
    }, {
      id: "read-record",
      name: "readRecord",
      locations: [{ path: "src/records.ts", startLine: 10, endLine: 25 }],
    }],
    obligations: [{
      id: "deny-member-update",
      principalId: "member",
      resourceId: "foreign-record",
      relation: "non-owner",
      operation: "update",
      expectation: "deny",
      conditions: [],
      policySourceId: "record-policy",
      entryIds: ["update-record"],
    }, {
      id: "allow-admin-read",
      principalId: "administrator",
      resourceId: "foreign-record",
      relation: "administrator-non-owner",
      operation: "read",
      expectation: "allow",
      conditions: [],
      policySourceId: "record-policy",
      entryIds: ["read-record"],
    }],
    scopeAssurance: "The supplied entries contain the bounded decisions and effects.",
    requiredAnalysis: ["Trace caller, resource, decision, and effect."],
    constraints: ["Use only the supplied source."],
  }
}

function requirement(
  overrides: Partial<AnalysisRequirement> = {},
): AnalysisRequirement {
  return {
    id: "entry-control",
    kind: "entry-control",
    obligationIds: ["deny-member-update"],
    question: "Which visible condition gates this declared entry?",
    applicability: "required",
    prerequisiteIds: [],
    ...overrides,
  }
}

describe("AnalysisRequirementSchema", () => {
  it("is strict and rejects an empty when-present item instead of silently dropping it", () => {
    const emptyOptional = AnalysisRequirementSchema.safeParse({
      ...requirement({ applicability: "when-present" }),
      obligationIds: [],
    })
    const extraField = AnalysisRequirementSchema.safeParse({
      ...requirement(),
      expectedFinding: "deny",
    })

    expect(emptyOptional.success).toBe(false)
    expect(extraField.success).toBe(false)
  })
})

describe("compileAnalysisRequirements", () => {
  it("diagnoses duplicate requirement IDs and does not choose one implicitly", () => {
    const plan = compileAnalysisRequirements(makeTask(), [
      requirement(),
      requirement({ question: "A conflicting duplicate question." }),
    ])

    expect(plan.status).toBe("blocked")
    expect(plan.entries).toEqual([])
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: "duplicate-requirement-id",
      requirementId: "entry-control",
    }))
  })

  it("diagnoses an unknown authored obligation without inventing a mapping", () => {
    const plan = compileAnalysisRequirements(makeTask(), [
      requirement({ obligationIds: ["missing-obligation"] }),
    ])

    expect(plan.status).toBe("blocked")
    expect(plan.entries).toEqual([])
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: "unknown-obligation",
      requirementId: "entry-control",
      obligationId: "missing-obligation",
    }))
  })

  it("diagnoses an unknown prerequisite and omits only the affected entries", () => {
    const plan = compileAnalysisRequirements(makeTask(), [
      requirement({ prerequisiteIds: ["missing-prerequisite"] }),
      requirement({
        id: "independent-read",
        kind: "resource-binding",
        obligationIds: ["allow-admin-read"],
        question: "Which record is selected for the read?",
      }),
    ])

    expect(plan.status).toBe("partial")
    expect(plan.entries.map(entry => entry.requirementId)).toEqual(["independent-read"])
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: "unknown-prerequisite",
      requirementId: "entry-control",
    }))
  })

  it("diagnoses dependency cycles while retaining an independent obligation", () => {
    const plan = compileAnalysisRequirements(makeTask(), [
      requirement({ id: "cycle-a", prerequisiteIds: ["cycle-b"] }),
      requirement({
        id: "cycle-b",
        kind: "identity-binding",
        prerequisiteIds: ["cycle-a"],
      }),
      requirement({
        id: "independent-read",
        kind: "authorization-decision",
        obligationIds: ["allow-admin-read"],
        question: "Which role branch decides the read?",
      }),
    ])

    expect(plan.status).toBe("partial")
    expect(plan.entries).toEqual([
      expect.objectContaining({
        requirementId: "independent-read",
        obligationId: "allow-admin-read::read-record",
      }),
    ])
    expect(plan.diagnostics.filter(diagnostic => diagnostic.code === "dependency-cycle"))
      .toHaveLength(2)
  })

  it("keeps a when-present question pending without pre-filling applicability truth", () => {
    const plan = compileAnalysisRequirements(makeTask(), [requirement({
      id: "optional-external",
      kind: "external-assumption",
      question: "Does a decisive source-external fact remain?",
      applicability: "when-present",
    })])

    expect(plan.status).toBe("ready")
    expect(plan.entries).toEqual([{
      requirementId: "optional-external",
      obligationId: "deny-member-update::update-record",
      kind: "external-assumption",
      question: "Does a decisive source-external fact remain?",
      applicability: "when-present",
      prerequisiteIds: [],
      status: "pending",
    }])
  })

  it("expands one declared mapping across only its authored obligations and entries", () => {
    const task = makeTask()
    task.entries.push({
      id: "bulk-update-records",
      name: "bulkUpdateRecords",
      locations: [{ path: "src/bulk.ts", startLine: 5, endLine: 20 }],
    })
    task.obligations[0]!.entryIds.push("bulk-update-records")

    const plan = compileAnalysisRequirements(task, [requirement({
      id: "shared-resource-binding",
      kind: "resource-binding",
      obligationIds: ["deny-member-update", "allow-admin-read"],
      question: "How is the selected record bound to the declared resource?",
    })])

    expect(plan.status).toBe("ready")
    expect(plan.entries.map(entry => entry.obligationId)).toEqual([
      "allow-admin-read::read-record",
      "deny-member-update::bulk-update-records",
      "deny-member-update::update-record",
    ])
  })

  it("is stable when task and requirement arrays are reordered", () => {
    const task = makeTask()
    const requirements = [
      requirement(),
      requirement({
        id: "identity",
        kind: "identity-binding",
        obligationIds: ["deny-member-update", "allow-admin-read"],
        question: "How is the caller identity bound?",
      }),
    ]
    const before = compileAnalysisRequirements(task, requirements)
    const reorderedTask = structuredClone(task)
    reorderedTask.entries.reverse()
    reorderedTask.obligations.reverse()
    const reorderedRequirements = structuredClone(requirements).reverse()
    reorderedRequirements[0]!.obligationIds.reverse()
    const after = compileAnalysisRequirements(reorderedTask, reorderedRequirements)

    expect(after).toEqual(before)
  })

  it("does not form a Cartesian product across two authored obligations", () => {
    const plan = compileAnalysisRequirements(makeTask(), [
      requirement({ id: "update-only" }),
      requirement({
        id: "read-only",
        kind: "effect-reachability",
        obligationIds: ["allow-admin-read"],
        question: "Can the administrator reach the read effect?",
      }),
    ])

    expect(plan.entries.map(entry => [entry.requirementId, entry.obligationId])).toEqual([
      ["read-only", "allow-admin-read::read-record"],
      ["update-only", "deny-member-update::update-record"],
    ])
  })

  it("keeps structurally distinct mappings separate when valid IDs contain NUL", () => {
    const task = makeTask()
    task.obligations[0]!.id = "z"
    task.obligations[1]!.id = "b\u0000z"
    task.obligations[1]!.entryIds = ["update-record"]
    const plan = compileAnalysisRequirements(task, [
      requirement({ id: "a\u0000b", obligationIds: ["z"] }),
      requirement({ id: "a", obligationIds: ["b\u0000z"] }),
    ])

    expect(plan.status).toBe("ready")
    expect(plan.entries).toHaveLength(2)
    expect(plan.entries.map(entry => [entry.requirementId, entry.obligationId])).toEqual([
      ["a", "b\u0000z::update-record"],
      ["a\u0000b", "z::update-record"],
    ])
  })

  it("requires each prerequisite to apply to the same expanded obligation", () => {
    const plan = compileAnalysisRequirements(makeTask(), [
      requirement({
        id: "read-identity",
        kind: "identity-binding",
        obligationIds: ["allow-admin-read"],
        question: "How is the administrator identity bound?",
      }),
      requirement({
        id: "update-decision",
        kind: "authorization-decision",
        prerequisiteIds: ["read-identity"],
        question: "Which control decides the member update?",
      }),
    ])

    expect(plan.status).toBe("partial")
    expect(plan.entries.map(entry => entry.requirementId)).toEqual(["read-identity"])
    expect(plan.diagnostics).toContainEqual(expect.objectContaining({
      code: "prerequisite-not-applicable",
      requirementId: "update-decision",
      obligationId: "deny-member-update::update-record",
    }))
  })

  it("emits only pending questions and structural state, never source or policy answers", () => {
    const plan = compileAnalysisRequirements(makeTask(), [requirement()])
    const serialized = JSON.stringify(plan.entries)

    expect(plan.entries[0]).toEqual({
      requirementId: "entry-control",
      obligationId: "deny-member-update::update-record",
      kind: "entry-control",
      question: "Which visible condition gates this declared entry?",
      applicability: "required",
      prerequisiteIds: [],
      status: "pending",
    })
    expect(serialized).not.toContain("\"conclusion\"")
    expect(serialized).not.toContain("\"expectedFinding\"")
    expect(serialized).not.toContain("\"sourceControl\"")
    expect(serialized).not.toContain("\"attackPath\"")
  })
})
