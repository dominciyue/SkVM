import { describe, expect, it } from "bun:test"
import { compileAuthorizationTask } from "./semantics.ts"
import {
  measureAuthorizationPromptCharacters,
  renderAuthorizationTask,
} from "./render.ts"
import { compileAnalysisRequirements, createDefaultAnalysisRequirements } from "./relations.ts"
import type { AuthorizationTaskV0 } from "./schema.ts"

const task: AuthorizationTaskV0 = {
  schemaVersion: "source-authorization-assessment/v0",
  taskId: "generic-report-delete",
  request: "Determine whether an authenticated analyst may delete a report owned by another team.",
  repository: "https://example.test/acme/reports",
  sourceRef: "reports-r8",
  sourceMode: "fixed-context",
  policySources: [{
    id: "report-delete-policy",
    kind: "explicit-task-requirement",
    text: "Only a report owner or explicit delete grantee may delete the report.",
    location: "task.normativeRequirement",
    revision: "request-v3",
    acceptance: {
      status: "accepted",
      actorRole: "task-author",
      reason: "The task author controls this bounded requirement.",
    },
  }],
  principals: [{
    id: "analyst",
    role: "authenticated analyst",
    description: "A non-administrator analyst from another team.",
    startingCapabilities: ["authenticated", "read-own-reports"],
  }],
  resources: [{
    id: "report",
    type: "report",
    description: "An existing report selected by request ID.",
  }],
  entries: [{
    id: "delete-report",
    name: "DELETE /reports/:id",
    locations: [{ path: "src/reports/delete.ts", startLine: 12, endLine: 48 }],
  }],
  obligations: [{
    id: "deny-cross-team-delete",
    principalId: "analyst",
    resourceId: "report",
    relation: "other-team-no-delete-grant",
    operation: "delete",
    expectation: "deny",
    conditions: [{ name: "authenticated", basis: "The entry requires a signed-in principal." }],
    policySourceId: "report-delete-policy",
    entryIds: ["delete-report"],
  }],
  scopeAssurance: "The fixed input contains the declared entry-to-delete path but does not establish whole-repository discovery.",
  requiredAnalysis: [
    "Trace principal binding, report selection, strongest delete control, and delete effect.",
    "Bound completeness to declared entries because discovery is not tested.",
  ],
  constraints: ["Use only the fixed source context.", "Do not execute or modify the target."],
}

describe("renderAuthorizationTask", () => {
  it("keeps one fact object for N, B, and D while changing visible organization", () => {
    const compiled = compileAuthorizationTask(task)
    const natural = renderAuthorizationTask(compiled, "N")
    const baseline = renderAuthorizationTask(compiled, "B")
    const domain = renderAuthorizationTask(compiled, "D")

    expect(natural.facts).toEqual(baseline.facts)
    expect(domain.facts).toEqual(baseline.facts)
    expect(natural.prompt).not.toBe(baseline.prompt)
    expect(natural.prompt).not.toBe(domain.prompt)
    expect(domain.prompt).not.toBe(baseline.prompt)
    expect(natural.arm).toBe("N")
    expect(baseline.arm).toBe("B")
    expect(domain.arm).toBe("D")
  })

  it("renders N explicitly instead of falling through the old B-or-D branch", () => {
    const natural = renderAuthorizationTask(compileAuthorizationTask(task), "N")

    expect(natural.sections.instructions).toContain("Natural authorization task (N)")
    expect(natural.sections.instructions).not.toContain("Authorization domain method (D)")
    expect(natural.sections.instructions).not.toContain("Method execution state")
    expect(natural.sections.declaration).toContain(task.request)
    expect(natural.sections.declaration).not.toBe(JSON.stringify(natural.facts, null, 2))
  })

  it("puts every comparison-critical fact into both model-visible prompts", () => {
    const compiled = compileAuthorizationTask(task)
    const renders = [
      renderAuthorizationTask(compiled, "N"),
      renderAuthorizationTask(compiled, "B"),
      renderAuthorizationTask(compiled, "D"),
    ]
    const requiredFragments = [
      task.taskId,
      task.request,
      task.repository,
      task.sourceRef,
      task.policySources[0]!.text,
      task.policySources[0]!.acceptance.reason,
      task.principals[0]!.role,
      task.principals[0]!.description,
      task.principals[0]!.startingCapabilities[1]!,
      task.resources[0]!.description,
      task.entries[0]!.name,
      task.entries[0]!.locations[0]!.path,
      task.obligations[0]!.relation,
      task.obligations[0]!.operation,
      task.obligations[0]!.expectation,
      task.obligations[0]!.conditions[0]!.name,
      task.obligations[0]!.conditions[0]!.basis,
      task.scopeAssurance,
      task.requiredAnalysis[1]!,
      task.constraints[1]!,
      "source_supported_failure",
      "source_refuted",
      "unknown",
    ]

    for (const rendered of renders) {
      for (const fragment of requiredFragments) {
        expect(rendered.prompt).toContain(fragment)
      }
    }
  })

  it("makes the exact expanded output IDs an arm-neutral closed contract", () => {
    const compiled = compileAuthorizationTask(task)
    const expectedId = "deny-cross-team-delete::delete-report"

    for (const arm of ["N", "B", "D"] as const) {
      const rendered = renderAuthorizationTask(compiled, arm)
      const resultContract = rendered.prompt.split("## Result contract\n")[1]!
        .split("\n## Fixed source context")[0]!

      expect(resultContract).toContain("Exact runnable obligation IDs (closed list):")
      expect(resultContract).toContain(`- ${expectedId}`)
      expect(resultContract).toContain("Use each exact expanded ID verbatim as obligationId")
      expect(resultContract).toContain("Do not substitute the authored obligation ID")
    }
  })

  it("renders source attachment once rather than duplicating it per obligation", () => {
    const expandedTask = structuredClone(task)
    expandedTask.obligations.push({
      ...expandedTask.obligations[0]!,
      id: "allow-delete-grantee",
      relation: "other-team-explicit-delete-grant",
      expectation: "allow",
    })

    const rendered = renderAuthorizationTask(compileAuthorizationTask(expandedTask), "D")

    expect(rendered.prompt.match(/<SOURCE_CONTEXT_INSERTED_BY_HOST>/g)).toHaveLength(1)
  })

  it("shares one canonical declaration and output contract while isolating the method instructions", () => {
    const compiled = compileAuthorizationTask(task)
    const natural = renderAuthorizationTask(compiled, "N")
    const baseline = renderAuthorizationTask(compiled, "B")
    const domain = renderAuthorizationTask(compiled, "D")

    expect(domain.sections.declaration).toBe(baseline.sections.declaration)
    expect(natural.sections.declaration).not.toBe(baseline.sections.declaration)
    expect(natural.sections.outputContract).toBe(baseline.sections.outputContract)
    expect(domain.sections.outputContract).toBe(baseline.sections.outputContract)
    expect(natural.sections.sourceMarker).toBe(baseline.sections.sourceMarker)
    expect(domain.sections.sourceMarker).toBe(baseline.sections.sourceMarker)
    expect(natural.sections.instructions).not.toBe(baseline.sections.instructions)
    expect(domain.sections.instructions).not.toBe(baseline.sections.instructions)
    expect(domain.sections.declaration).toBe(JSON.stringify(baseline.facts, null, 2))
    expect(domain.sections.instructions).not.toContain(task.policySources[0]!.text)
    expect(domain.sections.instructions).not.toContain(task.obligations[0]!.relation)
  })

  it("keeps the public analysis questions and coverage contract identical across N, B, and D", () => {
    const compiled = compileAuthorizationTask(task)
    const plan = compileAnalysisRequirements(task, createDefaultAnalysisRequirements(task))
    const natural = renderAuthorizationTask(compiled, "N", plan)
    const baseline = renderAuthorizationTask(compiled, "B", plan)
    const domain = renderAuthorizationTask(compiled, "D", plan)

    expect(plan.status).toBe("ready")
    expect(natural.sections.analysisLedger).toBe(baseline.sections.analysisLedger)
    expect(domain.sections.analysisLedger).toBe(baseline.sections.analysisLedger)
    expect(natural.sections.outputContract).toBe(baseline.sections.outputContract)
    expect(domain.sections.outputContract).toBe(baseline.sections.outputContract)
    for (const requirement of plan.requirements) {
      expect(natural.prompt).toContain(requirement.question)
      expect(baseline.prompt).toContain(requirement.question)
      expect(domain.prompt).toContain(requirement.question)
    }
  })

  it("reports character sections without treating characters as measured tokens", () => {
    const rendered = renderAuthorizationTask(compileAuthorizationTask(task), "D")
    const source = "Source ID: src-0123456789abcdef\n12 | visible source"
    const measured = measureAuthorizationPromptCharacters(rendered, source)

    expect(measured).toEqual({
      instructions: rendered.sections.instructions.length,
      declaration: rendered.sections.declaration.length,
      source: source.length,
      outputContract: rendered.sections.outputContract.length,
      total: rendered.prompt.replace(rendered.sections.sourceMarker, source).length,
      tokenMeasurement: "provider-reported-only",
    })
  })
})
