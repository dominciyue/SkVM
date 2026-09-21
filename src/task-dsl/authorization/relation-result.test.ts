import { describe, expect, it } from "bun:test"
import { validateRelationCoverage, type RelationCoverage } from "./relation-result.ts"
import { compileAnalysisRequirements, type AnalysisRequirement } from "./relations.ts"
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "./schema.ts"

function makeTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "coverage-record-update",
    request: "Assess whether a member can update a foreign record.",
    repository: "https://example.test/acme/records",
    sourceRef: "records-r1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "record-policy",
      kind: "task-policy",
      text: "Only owners may update a record.",
      location: "task.policy",
      revision: "policy-r1",
      acceptance: {
        status: "accepted",
        actorRole: "task-author",
        reason: "The author supplied the bounded policy.",
      },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A non-owner member.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{ id: "record", type: "record", description: "A foreign record." }],
    entries: [{
      id: "update-record",
      name: "updateRecord",
      locations: [{ path: "src/records.ts", startLine: 1, endLine: 5 }],
    }],
    obligations: [{
      id: "deny-foreign-update",
      principalId: "member",
      resourceId: "record",
      relation: "non-owner",
      operation: "update",
      expectation: "deny",
      conditions: [],
      policySourceId: "record-policy",
      entryIds: ["update-record"],
    }],
    scopeAssurance: "The fixed source contains the bounded path.",
    requiredAnalysis: ["Trace the strongest visible control."],
    constraints: ["Use only the fixed source."],
  }
}

function requirements(): AnalysisRequirement[] {
  return [{
    id: "control",
    kind: "authorization-decision",
    obligationIds: ["deny-foreign-update"],
    question: "Which source-visible control decides the update?",
    applicability: "required",
    prerequisiteIds: [],
  }, {
    id: "optional-external",
    kind: "external-assumption",
    obligationIds: ["deny-foreign-update"],
    question: "Does a decisive external fact remain?",
    applicability: "when-present",
    prerequisiteIds: [],
  }]
}

function result(): AuthorizationResultV0 {
  const citation = { path: "src/records.ts", startLine: 3, endLine: 3, quote: "canWrite" }
  return {
    schemaVersion: "source-authorization-assessment-result/v0",
    taskId: "coverage-record-update",
    repository: "https://example.test/acme/records",
    sourceRef: "records-r1",
    results: [{
      obligationId: "deny-foreign-update::update-record",
      conclusion: "source_refuted",
      explanation: "The visible control blocks the update.",
      facts: {
        entry: [{ statement: "The entry is visible.", citations: [citation] }],
        binding: [{ statement: "The caller is bound.", citations: [citation] }],
        control: [{ statement: "canWrite decides the update.", citations: [citation] }],
        effect: [{ statement: "Persistence follows the control.", citations: [citation] }],
        condition: [],
      },
      decisiveMissingFacts: [],
      suggestedObservations: [],
    }],
    scopeClaim: {
      kind: "declared-obligations-only",
      statement: "Only the declared obligation was assessed.",
    },
  }
}

function validCoverage(): RelationCoverage[] {
  return [{
    requirementId: "control",
    obligationId: "deny-foreign-update::update-record",
    status: "addressed",
    explanation: "The control fact answers the declared authorization question.",
    factPointers: ["/results/0/facts/control/0"],
  }, {
    requirementId: "optional-external",
    obligationId: "deny-foreign-update::update-record",
    status: "not-applicable",
    explanation: "The fixed source decides this bounded obligation without an external branch.",
    factPointers: ["/results/0/facts/control/0"],
  }]
}

function validate(coverage: unknown) {
  const plan = compileAnalysisRequirements(makeTask(), requirements())
  return validateRelationCoverage(plan, result(), coverage)
}

describe("validateRelationCoverage", () => {
  it("accepts complete coverage while keeping semantic support unreviewed", () => {
    const validation = validate(validCoverage())

    expect(validation).toEqual(expect.objectContaining({
      status: "valid",
      declared: 2,
      addressed: 1,
      unknown: 0,
      notApplicable: 1,
      missing: [],
      semanticSupport: "unreviewed",
      diagnostics: [],
    }))
  })

  it("diagnoses missing, duplicate, and foreign requirement coverage independently", () => {
    const duplicate = validCoverage()[0]!
    const validation = validate([
      duplicate,
      structuredClone(duplicate),
      {
        ...duplicate,
        requirementId: "invented-requirement",
      },
    ])

    expect(validation.status).toBe("invalid")
    expect(validation.diagnostics.map(diagnostic => diagnostic.code)).toEqual(expect.arrayContaining([
      "duplicate-relation-coverage",
      "foreign-requirement-coverage",
      "missing-relation-coverage",
    ]))
    expect(validation.missing).toEqual([{
      requirementId: "optional-external",
      obligationId: "deny-foreign-update::update-record",
    }])
  })

  it("rejects coverage for the wrong expanded obligation instead of matching by authored ID", () => {
    const coverage = validCoverage()
    coverage[0]!.obligationId = "deny-foreign-update"
    const validation = validate(coverage)

    expect(validation.status).toBe("invalid")
    expect(validation.diagnostics).toContainEqual(expect.objectContaining({
      code: "foreign-coverage-obligation",
      requirementId: "control",
      obligationId: "deny-foreign-update",
    }))
    expect(validation.missing).toContainEqual({
      requirementId: "control",
      obligationId: "deny-foreign-update::update-record",
    })
  })

  it("rejects dangling fact pointers and pointers into another obligation", () => {
    const dangling = validCoverage()
    dangling[0]!.factPointers = ["/results/0/facts/control/99"]
    const danglingValidation = validate(dangling)
    expect(danglingValidation.diagnostics).toContainEqual(expect.objectContaining({
      code: "dangling-fact-pointer",
    }))

    const otherResult = result()
    otherResult.results.push({
      ...structuredClone(otherResult.results[0]!),
      obligationId: "another-obligation::entry",
    })
    const plan = compileAnalysisRequirements(makeTask(), requirements())
    const wrongObligation = validCoverage()
    wrongObligation[0]!.factPointers = ["/results/1/facts/control/0"]
    const wrongValidation = validateRelationCoverage(plan, otherResult, wrongObligation)
    expect(wrongValidation.diagnostics).toContainEqual(expect.objectContaining({
      code: "fact-pointer-obligation-mismatch",
    }))
  })

  it("requires addressed and not-applicable claims to point to facts", () => {
    const addressed = validCoverage()
    addressed[0]!.factPointers = []
    expect(validate(addressed).diagnostics).toContainEqual(expect.objectContaining({
      code: "coverage-fact-pointer-required",
      requirementId: "control",
    }))

    const notApplicable = validCoverage()
    notApplicable[1]!.factPointers = []
    expect(validate(notApplicable).diagnostics).toContainEqual(expect.objectContaining({
      code: "coverage-fact-pointer-required",
      requirementId: "optional-external",
    }))
  })

  it("forbids not-applicable on required questions and requires a reason for unknown", () => {
    const requiredSkipped = validCoverage()
    requiredSkipped[0]!.status = "not-applicable"
    expect(validate(requiredSkipped).diagnostics).toContainEqual(expect.objectContaining({
      code: "required-coverage-not-applicable",
      requirementId: "control",
    }))

    const unknownWithoutReason = validCoverage() as unknown as Array<Record<string, unknown>>
    unknownWithoutReason[0]!.status = "unknown"
    unknownWithoutReason[0]!.explanation = " "
    expect(validate(unknownWithoutReason).diagnostics).toContainEqual(expect.objectContaining({
      code: "coverage-schema-invalid",
    }))
  })

  it("keeps diagnostic paths tied to original coverage positions and explains a partial plan", () => {
    const coverage = validCoverage() as unknown as Array<Record<string, unknown>>
    coverage.unshift({ requirementId: "broken" })
    coverage[1]!.status = "not-applicable"
    const positioned = validate(coverage)
    expect(positioned.diagnostics).toContainEqual(expect.objectContaining({
      code: "required-coverage-not-applicable",
      path: "coverage.1.status",
    }))

    const partialPlan = compileAnalysisRequirements(makeTask(), [
      requirements()[0]!,
      {
        ...requirements()[1]!,
        obligationIds: ["missing-obligation"],
      },
    ])
    const partialValidation = validateRelationCoverage(
      partialPlan,
      result(),
      [validCoverage()[0]!],
    )
    expect(partialValidation.status).toBe("invalid")
    expect(partialValidation.diagnostics).toContainEqual(expect.objectContaining({
      code: "analysis-plan-not-ready",
    }))
  })
})
