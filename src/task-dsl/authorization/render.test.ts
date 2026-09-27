import { describe, expect, it } from "bun:test"
import { compileAuthorizationTask } from "./semantics.ts"
import { compileConditionAnalysisRequest } from "./conditions.ts"
import { compileAuthorizationAssessmentProgram } from "./assessment-program.ts"
import { assessmentConditionId } from "./assessment-contract.ts"
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

const explicitProgram = compileAuthorizationAssessmentProgram(task, { schemaVersion: "authorization-analysis-contract/v1", scenarios: [{ obligationId: "deny-cross-team-delete", boundary: "declared-entry", premises: [{ id: "caller", statement: "Caller is the stated analyst at entry.", atEntryId: "delete-report", provenance: "task-assumption" }], requestedBranches: [{ id: "signed-out", kind: "counterfactual", assumptions: [{ conditionId: assessmentConditionId("deny-cross-team-delete", "authenticated"), value: "false" }] }], requiredResponseDetails: ["State the response status when visible."] }] }).program

it("renders one shared public paragraph and a bounded explicit program for DSL and independent Markdown", () => {
  const compiled = compileAuthorizationTask(task)
  const common = "COMMON PUBLIC REQUIREMENTS: decide the stated entry and requested branch."
  const options = { wireVersion: "v6" as const, assessmentProgram: explicitProgram, publicRequirementsText: common }
  const dsl = renderAuthorizationTask(compiled, "B", undefined, undefined, options)
  const markdown = renderAuthorizationTask(compiled, "B", undefined, undefined, { ...options, researchInstructions: { instructions: "Independently authored task instructions.", instructionOrigin: "independent-author" as const, instructionPath: "author.md" } })
  for (const rendered of [dsl, markdown]) {
    expect(rendered.sections.publicAnalysis).toBe(common)
    expect(rendered.prompt.split(common)).toHaveLength(2)
    expect(rendered.prompt).toContain("Caller is the stated analyst at entry.")
    expect(rendered.prompt).toContain("counterfactual")
    expect(rendered.prompt).toContain("branchResults")
    expect(rendered.prompt.split("<SOURCE_CONTEXT_INSERTED_BY_HOST>")).toHaveLength(2)
  }
  expect(markdown.sections.declaration).toBe("Independently authored task instructions.")
  expect(() => renderAuthorizationTask(compiled, "B", undefined, undefined, { ...options, reasoningStrategy: "control-binding-v1" })).toThrow()
})

describe("renderAuthorizationTask", () => {
  it("adds the same bounded reasoning questions to DSL and independent Markdown only when selected", () => {
    const compiled = compileAuthorizationTask(task)
    const defaultPrompt = renderAuthorizationTask(compiled, "B", undefined, undefined, { wireVersion: "v4" })
    const explicitStandard = renderAuthorizationTask(compiled, "B", undefined, undefined, { wireVersion: "v4", reasoningStrategy: "standard" })
    expect(explicitStandard.prompt).toBe(defaultPrompt.prompt)
    expect(defaultPrompt.sections.reasoningPlan).toBeUndefined()

    const dsl = renderAuthorizationTask(compiled, "B", undefined, undefined, { wireVersion: "v4", reasoningStrategy: "control-binding-v1" })
    const markdown = renderAuthorizationTask(compiled, "B", undefined, undefined, {
      wireVersion: "v4",
      reasoningStrategy: "control-binding-v1",
      researchInstructions: { instructions: "Assess the declared update.", instructionOrigin: "independent-author", instructionPath: "author.md" },
    })
    expect(dsl.sections.reasoningPlan).toBe(markdown.sections.reasoningPlan)
    expect(dsl.sections.reasoningPlan).toContain("checked by each claimed control")
    expect(markdown.prompt).toContain("## Control binding questions")
    expect(markdown.prompt).not.toContain("Canonical declaration")
    expect(markdown.prompt.match(/<SOURCE_CONTEXT_INSERTED_BY_HOST>/g)).toHaveLength(1)
    expect(measureAuthorizationPromptCharacters(dsl, "source").reasoningPlan).toBe(dsl.sections.reasoningPlan?.length)
  })

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

  it("defines every conclusion label relative to the declared policy expectation for all arms", () => {
    const compiled = compileAuthorizationTask(task)

    for (const arm of ["N", "B", "D"] as const) {
      const resultContract = renderAuthorizationTask(compiled, arm).sections.outputContract

      expect(resultContract).toContain(
        "Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny",
      )
      expect(resultContract).toContain(
        "source_supported_failure: the fixed source supports that the declared policy expectation fails",
      )
      expect(resultContract).toContain(
        "source_refuted: the fixed source supports that the declared policy expectation is enforced",
      )
      expect(resultContract).toContain(
        "unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced",
      )
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

  it("shares one answer-free condition plan across arms and marks assumptions as hypotheses", () => {
    const compiled = compileAuthorizationTask(task)
    const analysisPlan = compileAnalysisRequirements(task, createDefaultAnalysisRequirements(task))
    const conditionPlan = compileConditionAnalysisRequest(task, {
      schemaVersion: "authorization-condition-analysis-request/v1",
      requests: [{
        obligationId: "deny-cross-team-delete",
        conditionBindings: [{ id: "is-authenticated", name: "authenticated" }],
        maxBranches: 3,
      }],
    })
    const renders = (["N", "B", "D"] as const).map(
      arm => renderAuthorizationTask(compiled, arm, analysisPlan, conditionPlan),
    )

    expect(conditionPlan.status).toBe("ready")
    expect(renders[0]!.sections.conditionAnalysis).toBe(renders[1]!.sections.conditionAnalysis)
    expect(renders[2]!.sections.conditionAnalysis).toBe(renders[1]!.sections.conditionAnalysis)
    expect(renders[0]!.sections.outputContract).toBe(renders[1]!.sections.outputContract)
    expect(renders[2]!.sections.outputContract).toBe(renders[1]!.sections.outputContract)
    for (const rendered of renders) {
      expect(rendered.prompt).toContain("is-authenticated")
      expect(rendered.prompt).toContain("Analysis assumptions are hypotheses")
      expect(rendered.prompt).toContain("unexaminedConditionIds")
      expect(rendered.sections.conditionAnalysis).not.toContain('"effect"')
      expect(rendered.conditionPlan).toEqual(conditionPlan)
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
