import { describe, expect, it } from "bun:test"
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "./schema.ts"
import {
  compileConditionAnalysisRequest,
  validateConditionAnalysisResult,
  type AuthorizationConditionAnalysisRequestV1,
  type AuthorizationConditionAnalysisResultV1,
} from "./conditions.ts"

function makeTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "synthetic-condition-contract",
    request: "Assess two declared protected operations under explicit conditions.",
    repository: "https://example.test/synthetic/condition-contract",
    sourceRef: "condition-contract-v1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "policy",
      kind: "task-requirement",
      text: "Owners or privileged callers may modify records; the read entry is controlled by a feature gate.",
      location: "assessment.json#/task/policySources/0",
      revision: "policy-v1",
      acceptance: { status: "accepted", actorRole: "author", reason: "Synthetic accepted policy." },
    }],
    principals: [{
      id: "caller",
      role: "member",
      description: "The assessed caller.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{ id: "record", type: "record", description: "The protected record." }],
    entries: [
      { id: "modify", name: "modifyRecord", locations: [{ path: "src/record.ts", startLine: 1, endLine: 4 }] },
      { id: "read", name: "readRecord", locations: [{ path: "src/record.ts", startLine: 5, endLine: 8 }] },
    ],
    obligations: [
      {
        id: "modify-record",
        principalId: "caller",
        resourceId: "record",
        relation: "owner-or-privileged",
        operation: "modify",
        expectation: "conditional",
        conditions: [
          { name: "caller owns resource", basis: "The accepted policy names ownership." },
          { name: "caller has privileged role", basis: "The accepted policy names a role override." },
        ],
        policySourceId: "policy",
        entryIds: ["modify"],
      },
      {
        id: "read-record",
        principalId: "caller",
        resourceId: "record",
        relation: "authenticated-reader",
        operation: "read",
        expectation: "conditional",
        conditions: [
          { name: "feature gate enabled", basis: "The task declares a runtime gate without its value." },
        ],
        policySourceId: "policy",
        entryIds: ["read"],
      },
    ],
    scopeAssurance: "Only the two declared entries are assessed.",
    requiredAnalysis: ["Explain condition-sensitive reachability."],
    constraints: ["Do not execute the target."],
  }
}

function makeRequest(): AuthorizationConditionAnalysisRequestV1 {
  return {
    schemaVersion: "authorization-condition-analysis-request/v1",
    requests: [
      {
        obligationId: "modify-record",
        conditionBindings: [
          { id: "is-owner", name: "caller owns resource" },
          { id: "is-privileged", name: "caller has privileged role" },
        ],
        maxBranches: 3,
      },
      {
        obligationId: "read-record",
        conditionBindings: [{ id: "feature-enabled", name: "feature gate enabled" }],
        maxBranches: 2,
      },
    ],
  }
}

function makeCanonicalResult(): AuthorizationResultV0 {
  const facts = (line: number) => ({
    entry: [{ statement: "The declared entry is present.", citations: [{ path: "src/record.ts", startLine: line, endLine: line, quote: "entry" }] }],
    binding: [{ statement: "The caller and record are bound.", citations: [{ path: "src/record.ts", startLine: line, endLine: line, quote: "binding" }] }],
    control: [{ statement: "A visible condition controls the operation.", citations: [{ path: "src/record.ts", startLine: line, endLine: line, quote: "control" }] }],
    effect: [{ statement: "The protected effect follows the control.", citations: [{ path: "src/record.ts", startLine: line, endLine: line, quote: "effect" }] }],
    condition: [{ statement: "The branch reads the declared condition.", citations: [{ path: "src/record.ts", startLine: line, endLine: line, quote: "condition" }] }],
  })
  return {
    schemaVersion: "source-authorization-assessment-result/v0",
    taskId: "synthetic-condition-contract",
    repository: "https://example.test/synthetic/condition-contract",
    sourceRef: "condition-contract-v1",
    results: [
      {
        obligationId: "modify-record::modify",
        conclusion: "source_refuted",
        explanation: "The fixed source contains owner and privileged-role branches.",
        facts: facts(2),
        decisiveMissingFacts: [],
        suggestedObservations: [],
      },
      {
        obligationId: "read-record::read",
        conclusion: "unknown",
        explanation: "The fixed source shows the gate but not its deployed value.",
        facts: facts(6),
        decisiveMissingFacts: ["The deployed feature-gate value is absent."],
        suggestedObservations: ["Observe the deployed gate value."],
      },
    ],
    scopeClaim: { kind: "declared-obligations-only", statement: "Only declared entries are assessed." },
  }
}

function makeValidResult(): AuthorizationConditionAnalysisResultV1 {
  return {
    schemaVersion: "authorization-condition-analysis-result/v1",
    analyses: [
      {
        obligationId: "modify-record::modify",
        branches: [
          {
            id: "owner-reachable",
            obligationId: "modify-record::modify",
            assumptions: [{ conditionId: "is-owner", value: "true" }],
            effect: "reachable",
            explanation: "Under the owner assumption the protected modification is reachable.",
            factPointers: ["/results/0/facts/control/0"],
            missingFacts: [],
          },
          {
            id: "non-owner-non-privileged-blocked",
            obligationId: "modify-record::modify",
            assumptions: [
              { conditionId: "is-owner", value: "false" },
              { conditionId: "is-privileged", value: "false" },
            ],
            effect: "blocked",
            explanation: "Without ownership or the role override the modification is blocked.",
            factPointers: ["/results/0/facts/control/0"],
            missingFacts: [],
          },
        ],
        unexaminedConditionIds: [],
        completeness: "bounded",
        limitations: ["The bounded analysis does not enumerate every equivalent Boolean combination."],
      },
      {
        obligationId: "read-record::read",
        branches: [{
          id: "runtime-gate-unknown",
          obligationId: "read-record::read",
          assumptions: [{ conditionId: "feature-enabled", value: "unknown" }],
          effect: "unknown",
          explanation: "The source-visible gate exists but its deployed value is unavailable.",
          factPointers: [],
          missingFacts: ["The deployed feature-gate value is absent."],
        }],
        unexaminedConditionIds: [],
        completeness: "bounded",
        limitations: ["Deployment state is outside the fixed source context."],
      },
    ],
  }
}

describe("compileConditionAnalysisRequest", () => {
  it("maps explicit condition IDs to authored names and expanded obligations without pre-filling effects", () => {
    const plan = compileConditionAnalysisRequest(makeTask(), makeRequest())

    expect(plan.status).toBe("ready")
    expect(plan.diagnostics).toEqual([])
    expect(plan.entries.map(entry => entry.obligationId)).toEqual([
      "modify-record::modify",
      "read-record::read",
    ])
    expect(plan.entries[0]).toEqual(expect.objectContaining({
      authorObligationId: "modify-record",
      maxBranches: 3,
      conditions: [
        { id: "is-owner", name: "caller owns resource", basis: "The accepted policy names ownership." },
        { id: "is-privileged", name: "caller has privileged role", basis: "The accepted policy names a role override." },
      ],
    }))
    expect(JSON.stringify(plan)).not.toContain('"effect"')
  })

  it("diagnoses duplicate authored condition names instead of binding by array position", () => {
    const task = makeTask()
    task.obligations[0]!.conditions.push({
      name: "caller owns resource",
      basis: "A second ambiguous basis must not be selected implicitly.",
    })

    const plan = compileConditionAnalysisRequest(task, {
      ...makeRequest(),
      requests: [makeRequest().requests[0]!],
    })

    expect(plan.status).toBe("blocked")
    expect(plan.entries).toEqual([])
    expect(plan.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate-condition-name", conditionId: "is-owner" }),
    ]))
  })

  it("does not require a fabricated branch when condition analysis is not requested", () => {
    const task = makeTask()
    task.obligations.forEach(obligation => { obligation.conditions = [] })

    expect(compileConditionAnalysisRequest(task, undefined)).toEqual({
      status: "not-requested",
      entries: [],
      diagnostics: [],
    })
  })
})

describe("validateConditionAnalysisResult", () => {
  it("accepts bounded branches and a contentful external unknown", () => {
    const plan = compileConditionAnalysisRequest(makeTask(), makeRequest())
    const validation = validateConditionAnalysisResult(plan, makeCanonicalResult(), makeValidResult())

    expect(validation).toEqual(expect.objectContaining({
      status: "valid",
      declared: 2,
      bounded: 2,
      incomplete: 0,
      semanticSupport: "unreviewed",
      diagnostics: [],
    }))
  })

  it("diagnoses true and false assignments to the same condition in one branch", () => {
    const plan = compileConditionAnalysisRequest(makeTask(), makeRequest())
    const result = makeValidResult()
    result.analyses[0]!.branches[0]!.assumptions.push({ conditionId: "is-owner", value: "false" })

    const validation = validateConditionAnalysisResult(plan, makeCanonicalResult(), result)

    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "conflicting-condition-assignment", conditionId: "is-owner" }),
    ]))
  })

  it("diagnoses a condition ID that belongs to another obligation", () => {
    const plan = compileConditionAnalysisRequest(makeTask(), makeRequest())
    const result = makeValidResult()
    result.analyses[0]!.branches[0]!.assumptions = [{ conditionId: "feature-enabled", value: "true" }]

    const validation = validateConditionAnalysisResult(plan, makeCanonicalResult(), result)

    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "condition-obligation-mismatch",
        conditionId: "feature-enabled",
        obligationId: "modify-record::modify",
      }),
    ]))
  })

  it("diagnoses an unknown condition ID", () => {
    const plan = compileConditionAnalysisRequest(makeTask(), makeRequest())
    const result = makeValidResult()
    result.analyses[0]!.branches[0]!.assumptions = [{ conditionId: "not-declared", value: "true" }]

    const validation = validateConditionAnalysisResult(plan, makeCanonicalResult(), result)

    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unknown-condition-id", conditionId: "not-declared" }),
    ]))
  })

  it("rejects duplicate branches with the same normalized assumptions", () => {
    const plan = compileConditionAnalysisRequest(makeTask(), makeRequest())
    const result = makeValidResult()
    result.analyses[0]!.branches.push({
      ...result.analyses[0]!.branches[0]!,
      id: "owner-reachable-again",
    })

    const validation = validateConditionAnalysisResult(plan, makeCanonicalResult(), result)

    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate-condition-branch", branchId: "owner-reachable-again" }),
    ]))
  })

  it("accepts a decisive known effect despite an irrelevant unknown assumption", () => {
    const plan = compileConditionAnalysisRequest(makeTask(), makeRequest())
    const result = makeValidResult()
    result.analyses[0]!.branches[0]!.assumptions.push({ conditionId: "is-privileged", value: "unknown" })
    result.analyses[0]!.branches[0]!.explanation = "Ownership alone permits modification regardless of the unknown privileged role."
    const validation = validateConditionAnalysisResult(plan, makeCanonicalResult(), result)
    expect(validation.status).toBe("valid")
    expect(validation.semanticSupport).toBe("unreviewed")
  })

  it("requires a decisive missing fact for an unknown effect", () => {
    const plan = compileConditionAnalysisRequest(makeTask(), makeRequest())
    const result = makeValidResult()
    result.analyses[1]!.branches[0]!.missingFacts = []

    const validation = validateConditionAnalysisResult(plan, makeCanonicalResult(), result)

    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unknown-condition-missing-fact", branchId: "runtime-gate-unknown" }),
    ]))
  })

  it("enforces the authored branch bound without requiring an exponential truth table", () => {
    const request = makeRequest()
    request.requests[0]!.maxBranches = 2
    const plan = compileConditionAnalysisRequest(makeTask(), request)
    const result = makeValidResult()
    result.analyses[0]!.branches.push({
      id: "privileged-reachable",
      obligationId: "modify-record::modify",
      assumptions: [{ conditionId: "is-privileged", value: "true" }],
      effect: "reachable",
      explanation: "The role override makes the effect reachable.",
      factPointers: ["/results/0/facts/control/0"],
      missingFacts: [],
    })

    const validation = validateConditionAnalysisResult(plan, makeCanonicalResult(), result)

    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "condition-branch-limit-exceeded", obligationId: "modify-record::modify" }),
    ]))
  })

  it("accepts explicit unexamined conditions as incomplete instead of inventing branches", () => {
    const plan = compileConditionAnalysisRequest(makeTask(), makeRequest())
    const result = makeValidResult()
    result.analyses[0] = {
      obligationId: "modify-record::modify",
      branches: [result.analyses[0]!.branches[0]!],
      unexaminedConditionIds: ["is-privileged"],
      completeness: "incomplete",
      limitations: ["The branch budget retained ownership and left the role override unexamined."],
    }

    const validation = validateConditionAnalysisResult(plan, makeCanonicalResult(), result)

    expect(validation).toEqual(expect.objectContaining({
      status: "valid",
      bounded: 1,
      incomplete: 1,
      diagnostics: [],
    }))
  })
})
