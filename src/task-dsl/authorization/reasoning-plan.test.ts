import { describe, expect, it } from "bun:test"
import { compileAuthorizationTask } from "./semantics.ts"
import {
  compileAuthorizationReasoningPlan,
  renderAuthorizationReasoningPlan,
} from "./reasoning-plan.ts"
import type { AuthorizationTaskV0 } from "./schema.ts"

function task(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "record-write",
    request: "Can a member update the selected report?",
    repository: "https://example.test/records",
    sourceRef: "r1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "policy",
      kind: "explicit-task-requirement",
      text: "Only a report owner or write grantee may update a report.",
      location: "task.requirement",
      revision: "r1",
      acceptance: { status: "accepted", actorRole: "task-author", reason: "Normative task rule." },
    }],
    principals: [{ id: "member", role: "member", description: "Authenticated member.", startingCapabilities: [] }],
    resources: [
      { id: "report", type: "report", description: "Selected report." },
      { id: "attachment", type: "attachment", description: "A separate source attachment." },
    ],
    entries: [
      { id: "update", name: "update", locations: [{ path: "src/update.ts", startLine: 1, endLine: 10 }] },
      { id: "bulk", name: "bulk", locations: [{ path: "src/bulk.ts", startLine: 1, endLine: 10 }] },
    ],
    obligations: [
      { id: "report-write", principalId: "member", resourceId: "report", relation: "not-owner", operation: "update", expectation: "deny", conditions: [], policySourceId: "policy", entryIds: ["update", "bulk"] },
      { id: "attachment-read", principalId: "member", resourceId: "attachment", relation: "owner", operation: "read", expectation: "allow", conditions: [{ name: "authenticated", basis: "Signed-in user." }], policySourceId: "policy", entryIds: ["update"] },
    ],
    scopeAssurance: "Only declared entries are assessed.",
    requiredAnalysis: ["Trace the visible gate and effect."],
    constraints: ["Use only fixed source."],
  }
}

describe("authorization reasoning plan", () => {
  it("adds no prompt text for standard and binds focused questions only to runnable obligations", () => {
    const input = task()
    input.policySources.push({
      ...input.policySources[0]!,
      id: "unresolved",
      acceptance: { status: "unresolved", actorRole: "task-author", reason: "Policy not accepted." },
    })
    input.obligations.push({ ...input.obligations[0]!, id: "blocked", policySourceId: "unresolved" })
    const compiled = compileAuthorizationTask(input)

    const standard = compileAuthorizationReasoningPlan(compiled, "standard")
    expect(standard.entries).toEqual([])
    expect(renderAuthorizationReasoningPlan(standard)).toBe("")

    const focused = compileAuthorizationReasoningPlan(compiled, "control-binding-v1")
    expect(focused.entries.map(entry => entry.obligationId)).toEqual(
      compiled.runnableObligations.map(entry => entry.id).sort(),
    )
    expect(focused.entries).toHaveLength(3)
    for (const entry of focused.entries) {
      const original = compiled.runnableObligations.find(item => item.id === entry.obligationId)!
      expect(entry.principalId).toBe(original.obligation.principalId)
      expect(entry.resourceId).toBe(original.obligation.resourceId)
      expect(entry.entryId).toBe(original.entryId)
      expect(entry.questions.map(question => question.focus)).toEqual([
        "checked-object-versus-effect-target",
        "control-applicability-and-bypass",
        "role-and-relation-exceptions",
        "decisive-external-facts",
      ])
    }
    expect(JSON.stringify(focused)).not.toContain('"observedDecision"')
    expect(JSON.stringify(focused)).not.toContain('"sourceSupported"')
    expect(renderAuthorizationReasoningPlan(focused)).toContain("report")
  })

  it("keeps each target separate, handles no conditions, and is stable under author array reordering", () => {
    const input = task()
    const first = compileAuthorizationReasoningPlan(compileAuthorizationTask(input), "control-binding-v1")
    const reordered = structuredClone(input)
    reordered.obligations.reverse()
    reordered.entries.reverse()
    reordered.resources.reverse()
    const second = compileAuthorizationReasoningPlan(compileAuthorizationTask(reordered), "control-binding-v1")

    expect(second).toEqual(first)
    const reportEntries = first.entries.filter(entry => entry.resourceId === "report")
    const attachmentEntries = first.entries.filter(entry => entry.resourceId === "attachment")
    expect(reportEntries).toHaveLength(2)
    expect(attachmentEntries).toHaveLength(1)
    expect(reportEntries.every(entry => JSON.stringify(entry.questions).includes("report"))).toBe(true)
    expect(reportEntries.every(entry => !JSON.stringify(entry.questions).includes("attachment"))).toBe(true)
    expect(first.entries.find(entry => entry.obligationId === "report-write::update")?.questions[2]?.question)
      .toContain("no declared conditions")
  })
})
