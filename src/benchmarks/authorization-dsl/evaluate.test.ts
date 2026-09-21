import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import type { AuthorizationTaskRun } from "./host.ts"
import type { SourceBundle } from "./inputs.ts"
import { validateAuthorizationResult } from "../../task-dsl/authorization/result.ts"
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import {
  AuthorizationEvaluationRubricsV0Schema,
  AuthorizationEvaluationRubricsV2Schema,
  evaluateAuthorizationGeneration,
  evaluateAuthorizationGenerationV2,
  hashAuthorizationRawOutput,
  summarizeAuthorizationPair,
  summarizeAuthorizationRun,
  type AuthorizationCaseEvaluationRubric,
  type AuthorizationCaseEvaluationRubricV2,
  type AuthorizationGenerationEvaluationV2,
  type AuthorizationSemanticReviewV1,
  type AuthorizationSemanticReviewV0,
  type SemanticReviewStatus,
} from "./evaluate.ts"

const sourceContent = [
  "entry receives a caller-selected collection",
  "validator rejects collections absent from the allowed set",
  "sink writes only after validator returns",
  "policy grants an existing collection only with write access",
  "request user is the assessed principal",
].join("\n")

const sourcePath = "inputs/example/source.ts"

function task(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "semantic-review-example",
    request: "Can a non-admin without a write grant reach the collection sink?",
    repository: "https://example.test/authorization",
    sourceRef: "example-r1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "write-policy",
      kind: "task-requirement",
      text: "Only principals with write access may write an existing collection.",
      location: "inputs/example/task.json#/policy",
      revision: "r1",
      acceptance: { status: "accepted", actorRole: "task-author", reason: "The task author owns the requirement." },
    }],
    principals: [{ id: "member", role: "non-admin member", description: "No write grant.", startingCapabilities: [] }],
    resources: [{ id: "collection", type: "collection", description: "An existing unrelated collection." }],
    entries: [{ id: "write-entry", name: "write", locations: [{ path: sourcePath, startLine: 1, endLine: 5 }] }],
    obligations: [{
      id: "deny-write",
      principalId: "member",
      resourceId: "collection",
      relation: "no-write-grant",
      operation: "write",
      expectation: "deny",
      conditions: [],
      policySourceId: "write-policy",
      entryIds: ["write-entry"],
    }],
    scopeAssurance: "The fixed crop contains the declared caller, control, policy, and sink.",
    requiredAnalysis: ["Trace the upstream control."],
    constraints: ["Use only the fixed crop."],
  }
}

function bundle(): SourceBundle {
  return {
    repository: "https://example.test/authorization",
    sourceRef: "example-r1",
    sourceMode: "fixed-context",
    isolation: "exact-allowlist",
    files: [{
      relativePath: sourcePath,
      content: sourceContent,
      sha256: createHash("sha256").update(sourceContent).digest("hex"),
      cropRange: { startLine: 1, endLine: 5 },
      originalLocations: ["src/example.ts:10-14"],
    }],
  }
}

function location(startLine: number, endLine = startLine) {
  return { path: sourcePath, startLine, endLine }
}

function rubric(expectedDisposition: AuthorizationResultV0["results"][number]["conclusion"] = "source_refuted"):
AuthorizationCaseEvaluationRubric {
  return {
    caseId: "semantic-review-example",
    taskId: "semantic-review-example",
    rubricVersion: "semantic-review-example/v1",
    obligationId: "deny-write::write-entry",
    expectedDisposition,
    dispositionRule: {
      oracleRule: "example-oracle#/disposition",
      sourceLocations: [location(2), location(3), location(4)],
    },
    scopeRule: {
      oracleRule: "example-protocol#/bounded-scope",
      sourceLocations: [location(1, 5)],
    },
    criticalFacts: [
      {
        id: "caller-entry",
        requirement: "The caller-selected collection reaches the declared entry.",
        oracleRule: "example-oracle#/criticalFacts/entry",
        sourceLocations: [location(1)],
      },
      {
        id: "upstream-control",
        requirement: "The validator rejects a name absent from the allowed set.",
        oracleRule: "example-oracle#/criticalFacts/control",
        sourceLocations: [location(2)],
      },
      {
        id: "write-policy",
        requirement: "An existing collection is allowed only with write access.",
        oracleRule: "example-oracle#/criticalFacts/policy",
        sourceLocations: [location(4)],
      },
    ],
  }
}

function cite(statement: string, line: number) {
  return [{
    statement,
    citations: [{
      path: sourcePath,
      startLine: line,
      endLine: line,
      quote: sourceContent.split("\n")[line - 1]!,
    }],
  }]
}

function answer(
  conclusion: AuthorizationResultV0["results"][number]["conclusion"],
  explanation: string,
): AuthorizationResultV0 {
  return {
    schemaVersion: "source-authorization-assessment-result/v0",
    taskId: "semantic-review-example",
    repository: "https://example.test/authorization",
    sourceRef: "example-r1",
    results: [{
      obligationId: "deny-write::write-entry",
      conclusion,
      explanation,
      facts: {
        entry: cite("The caller supplies the selected collection.", 1),
        binding: cite("The request user is the assessed principal.", 5),
        control: cite("The validator denies a collection not in the allowed set.", 2),
        effect: cite("The sink follows the validator.", 3),
        condition: cite("The policy requires write access.", 4),
      },
      decisiveMissingFacts: conclusion === "unknown" ? [] : [],
      suggestedObservations: conclusion === "unknown" ? [] : [],
    }],
    scopeClaim: {
      kind: "declared-obligations-only",
      statement: "Only the declared fixed-context obligation is assessed; discovery is not tested.",
    },
  }
}

function artifact(result: AuthorizationResultV0, rawResponse = JSON.stringify(result)) {
  const compiled = compileAuthorizationTask(task())
  return {
    compiled,
    artifact: {
      result,
      rawResponse,
      providerAttemptIds: ["provider-attempt-1"],
      outputAttemptId: "provider-attempt-1",
      validation: validateAuthorizationResult(compiled, result, bundle()),
    },
  }
}

function assessment(
  status: SemanticReviewStatus,
  answerLocation: string | null,
  oracleRule: string,
  sourceLocations: ReturnType<typeof location>[],
) {
  return {
    status,
    reason: `${status} after tracing the fixed source and candidate claim.`,
    answerLocation,
    oracleRule,
    sourceLocations,
  }
}

function reviewFor(
  candidateRubric: AuthorizationCaseEvaluationRubric,
  rawResponse: string,
  overrides: {
    factStatuses?: Record<string, SemanticReviewStatus>
    dispositionStatus?: SemanticReviewStatus
    scopeStatus?: SemanticReviewStatus
  } = {},
): AuthorizationSemanticReviewV0 {
  return {
    schemaVersion: "authorization-semantic-review/v0",
    caseId: candidateRubric.caseId,
    taskId: candidateRubric.taskId,
    generation: "initial",
    attemptId: "provider-attempt-1",
    rawOutputSha256: hashAuthorizationRawOutput(rawResponse),
    rubricVersion: candidateRubric.rubricVersion,
    reviewer: { kind: "development-agent", identity: "codex-development-agent" },
    factReviews: candidateRubric.criticalFacts.map((fact, index) => {
      const status = overrides.factStatuses?.[fact.id] ?? "supported"
      return {
        factId: fact.id,
        ...assessment(
          status,
          status === "missing" ? null : `/results/0/facts/${index === 0 ? "entry" : index === 1 ? "control" : "condition"}/0`,
          fact.oracleRule,
          fact.sourceLocations,
        ),
      }
    }),
    dispositionReview: assessment(
      overrides.dispositionStatus ?? "supported",
      overrides.dispositionStatus === "missing" ? null : "/results/0/conclusion",
      candidateRubric.dispositionRule.oracleRule,
      candidateRubric.dispositionRule.sourceLocations,
    ),
    scopeReview: assessment(
      overrides.scopeStatus ?? "supported",
      "/scopeClaim",
      candidateRubric.scopeRule.oracleRule,
      candidateRubric.scopeRule.sourceLocations,
    ),
  }
}

function evaluateCandidate(
  result: AuthorizationResultV0,
  candidateRubric: AuthorizationCaseEvaluationRubric,
  overrides?: Parameters<typeof reviewFor>[2],
) {
  const made = artifact(result)
  return evaluateAuthorizationGeneration({
    rubric: candidateRubric,
    sourceBundle: bundle(),
    artifact: made.artifact,
    generation: "initial",
    review: reviewFor(candidateRubric, made.artifact.rawResponse, overrides),
  })
}

function rubricV2(): AuthorizationCaseEvaluationRubricV2 {
  return {
    caseId: "semantic-review-example",
    taskId: "semantic-review-example",
    rubricVersion: "semantic-review-example/v2",
    obligationId: "deny-write::write-entry",
    expectedDisposition: "unknown",
    dispositionRule: {
      oracleRule: "example-oracle-v2#/disposition",
      sourceLocations: [location(1, 5)],
    },
    scopeRule: {
      oracleRule: "example-protocol-v2#/bounded-scope",
      sourceLocations: [location(1, 5)],
    },
    criteria: [
      {
        id: "entry-gate",
        layer: "necessary-semantics",
        requirement: "State the entry gate, accepting either positive or logically equivalent negative form.",
        decisionRelevance: "Without the gate, the conditional capability is misstated.",
        oracleRule: "example-oracle-v2#/criteria/entry-gate",
        sourceLocations: [location(1), location(2)],
      },
      {
        id: "identity-binding",
        layer: "necessary-semantics",
        requirement: "Explain how the caller-controlled value becomes the assessed identity.",
        decisionRelevance: "The binding is part of the causal path, not citation decoration.",
        oracleRule: "example-oracle-v2#/criteria/identity-binding",
        sourceLocations: [location(1), location(5)],
      },
      {
        id: "decisive-external-gap",
        layer: "necessary-semantics",
        requirement: "Name the absent external fact that makes the final disposition unknown.",
        decisionRelevance: "The missing fact can change the actual-deployment answer.",
        oracleRule: "example-oracle-v2#/criteria/decisive-external-gap",
        sourceLocations: [location(4), location(5)],
      },
      {
        id: "conditional-outcomes",
        layer: "explanation-completeness",
        requirement: "Spell out the safe and unsafe conditional outcomes.",
        decisionRelevance: "This improves explanation completeness but does not change a supported unknown label.",
        oracleRule: "example-oracle-v2#/criteria/conditional-outcomes",
        sourceLocations: [location(2, 5)],
      },
      {
        id: "optional-signup-detail",
        layer: "optional-detail",
        requirement: "Mention the optional provisioning branch when it helps explain the full path.",
        decisionRelevance: "Provisioning is not needed to justify the bounded disposition.",
        oracleRule: "example-oracle-v2#/criteria/optional-signup-detail",
        sourceLocations: [location(3)],
      },
    ],
  }
}

function reviewForV2(
  candidateRubric: AuthorizationCaseEvaluationRubricV2,
  rawResponse: string,
  overrides: {
    criterionStatuses?: Record<string, SemanticReviewStatus>
    dispositionStatus?: SemanticReviewStatus
  } = {},
): AuthorizationSemanticReviewV1 {
  return {
    schemaVersion: "authorization-semantic-review/v1",
    caseId: candidateRubric.caseId,
    taskId: candidateRubric.taskId,
    generation: "initial",
    attemptId: "provider-attempt-1",
    rawOutputSha256: hashAuthorizationRawOutput(rawResponse),
    rubricVersion: candidateRubric.rubricVersion,
    reviewer: { kind: "development-agent", identity: "codex-development-agent" },
    criterionReviews: candidateRubric.criteria.map((criterion) => {
      const status = overrides.criterionStatuses?.[criterion.id] ?? "supported"
      return {
        criterionId: criterion.id,
        ...assessment(
          status,
          status === "missing" ? null : "/results/0/explanation",
          criterion.oracleRule,
          criterion.sourceLocations,
        ),
      }
    }),
    dispositionReview: assessment(
      overrides.dispositionStatus ?? "supported",
      overrides.dispositionStatus === "missing" ? null : "/results/0/conclusion",
      candidateRubric.dispositionRule.oracleRule,
      candidateRubric.dispositionRule.sourceLocations,
    ),
    scopeReview: assessment(
      "supported",
      "/scopeClaim",
      candidateRubric.scopeRule.oracleRule,
      candidateRubric.scopeRule.sourceLocations,
    ),
  }
}

function evaluateCandidateV2(
  explanation: string,
  overrides?: Parameters<typeof reviewForV2>[2],
) {
  const candidateRubric = rubricV2()
  const result = answer("unknown", explanation)
  result.results[0]!.decisiveMissingFacts = ["The external deployment fact is absent from the fixed source."]
  result.results[0]!.suggestedObservations = ["Observe the external deployment fact through an authorized channel."]
  const made = artifact(result)
  return evaluateAuthorizationGenerationV2({
    rubric: candidateRubric,
    sourceBundle: bundle(),
    artifact: made.artifact,
    generation: "initial",
    review: reviewForV2(candidateRubric, made.artifact.rawResponse, overrides),
  })
}

describe("authorization semantic evaluation", () => {
  it("scores six hand-written semantic shapes from explicit reviews rather than keywords", () => {
    const decidable = rubric("source_refuted")
    const deployment = rubric("unknown")
    const candidates = [
      {
        name: "correct paraphrase",
        evaluation: evaluateCandidate(
          answer("source_refuted", "The shared validator rejects the name before the sink because write access is absent."),
          decidable,
        ),
        expected: true,
      },
      {
        name: "correct keywords with causal inversion",
        evaluation: evaluateCandidate(
          answer("source_refuted", "The validator and write policy prove the denied user reaches the sink."),
          decidable,
          { dispositionStatus: "contradicted" },
        ),
        expected: false,
      },
      {
        name: "missing upstream control",
        evaluation: evaluateCandidate(
          answer("source_supported_failure", "The sink has no inline authorization check."),
          decidable,
          { factStatuses: { "upstream-control": "missing" }, dispositionStatus: "contradicted" },
        ),
        expected: false,
      },
      {
        name: "missing entry gate",
        evaluation: evaluateCandidate(
          answer("unknown", "Deployment facts are absent, but the source path is conditional."),
          deployment,
          { factStatuses: { "caller-entry": "missing" } },
        ),
        expected: false,
      },
      {
        name: "bare unknown",
        evaluation: evaluateCandidate(
          answer("unknown", "Unknown."),
          deployment,
          {
            factStatuses: { "caller-entry": "missing", "upstream-control": "missing", "write-policy": "missing" },
            dispositionStatus: "missing",
          },
        ),
        expected: false,
      },
      {
        name: "all unknown on source-decidable input",
        evaluation: evaluateCandidate(
          answer("unknown", "Unknown for every declared source question."),
          decidable,
          {
            factStatuses: { "caller-entry": "missing", "upstream-control": "missing", "write-policy": "missing" },
            dispositionStatus: "missing",
          },
        ),
        expected: false,
      },
    ]

    expect(candidates.map(candidate => [candidate.name, candidate.evaluation.taskDecisionCorrect]))
      .toEqual(candidates.map(candidate => [candidate.name, candidate.expected]))
    expect(candidates[1]?.evaluation.errorClasses).toContain("evidenceDecoration")
    expect(candidates[2]?.evaluation.errorClasses).toEqual(expect.arrayContaining([
      "falsePositive",
      "evidenceDecoration",
    ]))
    expect(candidates[5]?.evaluation.errorClasses).toContain("excessiveAbstention")
  })

  it("turns a supported critical fact into needs-review when the bound review changes to uncertain", () => {
    const candidateRubric = rubric()
    const result = answer("source_refuted", "The upstream validator prevents the write.")
    const supported = evaluateCandidate(result, candidateRubric)
    const uncertain = evaluateCandidate(result, candidateRubric, {
      factStatuses: { "upstream-control": "uncertain" },
    })

    expect(supported.taskDecisionCorrect).toBe(true)
    expect(uncertain.taskDecisionCorrect).toBeNull()
    expect(uncertain.qualityStatus).toBe("needs-review")
  })

  it("keeps a supported semantic decision separate from broken citation delivery", () => {
    const candidateRubric = rubric()
    const result = answer("source_refuted", "The upstream validator prevents the write.")
    result.results[0]!.facts.control[0]!.citations[0]!.quote = "text absent from the cited line"

    const evaluated = evaluateCandidate(result, candidateRubric)

    expect(evaluated.semanticDecisionCorrect).toBe(true)
    expect(evaluated.evidenceSemanticSupport).toBe("supported")
    expect(evaluated.transportValid).toBe(false)
    expect(evaluated.deliveryComplete).toBe(false)
  })

  it("keeps legal citation transport separate from a contradicted claim", () => {
    const evaluated = evaluateCandidate(
      answer("source_refuted", "The validator allows the ungranted write to reach the sink."),
      rubric(),
      {
        factStatuses: { "upstream-control": "contradicted" },
        dispositionStatus: "contradicted",
      },
    )

    expect(evaluated.semanticDecisionCorrect).toBe(false)
    expect(evaluated.evidenceSemanticSupport).toBe("contradicted")
    expect(evaluated.transportValid).toBe(true)
    expect(evaluated.deliveryComplete).toBe(true)
  })

  it("separates an exaggerated scope and a missing decisive condition from transport", () => {
    const exaggerated = answer("source_refuted", "The upstream validator prevents the write.")
    exaggerated.scopeClaim = {
      kind: "repository-all-entries",
      statement: "Every repository entry is complete.",
    }
    const scopeEvaluation = evaluateCandidate(exaggerated, rubric(), { scopeStatus: "contradicted" })
    expect(scopeEvaluation.semanticDecisionCorrect).toBe(true)
    expect(scopeEvaluation.evidenceSemanticSupport).toBe("supported")
    expect(scopeEvaluation.transportValid).toBe(true)
    expect(scopeEvaluation.deliveryComplete).toBe(false)
    expect(scopeEvaluation.scopeHonesty).toBe("rejected")

    const missingCondition = evaluateCandidate(
      answer("source_refuted", "The validator prevents the sink, but the policy condition is not explained."),
      rubric(),
      { factStatuses: { "write-policy": "missing" } },
    )
    expect(missingCondition.semanticDecisionCorrect).toBe(true)
    expect(missingCondition.evidenceSemanticSupport).toBe("missing")
    expect(missingCondition.transportValid).toBe(true)
    expect(missingCondition.deliveryComplete).toBe(true)
  })

  it("accepts four review-supported equivalent expressions of the authorization condition", () => {
    const equivalentExplanations = [
      "Write access is required before the existing collection can be saved.",
      "Without write access, the validator rejects the selected collection before persistence.",
      "The allowed-set control excludes this ungranted member from the write effect.",
      "The guard prevents persistence when canWrite is false for the bound principal and collection.",
    ]

    expect(equivalentExplanations.map(explanation => {
      const evaluated = evaluateCandidate(answer("source_refuted", explanation), rubric())
      return [evaluated.semanticDecisionCorrect, evaluated.evidenceSemanticSupport]
    })).toEqual(equivalentExplanations.map(() => [true, "supported"]))
  })

  it("rejects incomplete or stale review bindings without inventing a semantic verdict", () => {
    const candidateRubric = rubric()
    const made = artifact(answer("source_refuted", "The validator prevents the sink."))
    const review = reviewFor(candidateRubric, made.artifact.rawResponse)
    review.rawOutputSha256 = "0".repeat(64)
    review.factReviews.push({ ...review.factReviews[0]! })
    review.factReviews[1]!.answerLocation = "/results/0/facts/control/99"

    const evaluated = evaluateAuthorizationGeneration({
      rubric: candidateRubric,
      sourceBundle: bundle(),
      artifact: made.artifact,
      generation: "initial",
      review,
    })

    expect(evaluated.reviewValidation.status).toBe("invalid")
    expect(evaluated.reviewValidation.diagnostics.map(diagnostic => diagnostic.code)).toEqual(expect.arrayContaining([
      "review-output-hash-mismatch",
      "duplicate-fact-review",
      "review-answer-location-invalid",
    ]))
    expect(evaluated.taskDecisionCorrect).toBeNull()
    expect(evaluated.semanticDecisionCorrect).toBeNull()
    expect(evaluated.evidenceSemanticSupport).toBe("unknown")
  })

  it("reports initial/final quality and operation totals without converting unknown cost into zero", () => {
    const candidateRubric = rubric()
    const made = artifact(answer("source_refuted", "The validator prevents the sink."))
    const generation = evaluateAuthorizationGeneration({
      rubric: candidateRubric,
      sourceBundle: bundle(),
      artifact: made.artifact,
      generation: "initial",
      review: reviewFor(candidateRubric, made.artifact.rawResponse),
    })
    const run: AuthorizationTaskRun = {
      status: "completed",
      arm: "B",
      compiled: made.compiled,
      renderedPrompt: "fixed prompt",
      initial: made.artifact,
      finalKind: "initial",
      attempts: [
        {
          id: "provider-attempt-1",
          phase: "initial",
          transport: "schema-tool",
          status: "response",
          startedAt: "2026-09-20T00:00:00.000Z",
          endedAt: "2026-09-20T00:00:00.010Z",
          request: { messageCount: 1, messageCharacters: 10, toolNames: ["submit_authorization_result"], executableTools: false },
          response: {
            text: "",
            toolCalls: [],
            tokens: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0 },
            costUsd: 0.01,
            durationMs: 10,
            stopReason: "end_turn",
          },
          usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0 },
          costUsd: 0.01,
          transportAttempts: "unknown",
        },
        {
          id: "provider-attempt-2",
          phase: "initial",
          transport: "prompt-parse",
          status: "response",
          startedAt: "2026-09-20T00:00:00.010Z",
          endedAt: "2026-09-20T00:00:00.025Z",
          request: { messageCount: 1, messageCharacters: 20, toolNames: [], executableTools: false },
          response: {
            text: made.artifact.rawResponse,
            toolCalls: [],
            tokens: { input: 20, output: 5, cacheRead: 3, cacheWrite: 0 },
            costUsd: null,
            durationMs: 15,
            stopReason: "end_turn",
          },
          usage: { input: 20, output: 5, cacheRead: 3, cacheWrite: 0 },
          costUsd: null,
          transportAttempts: "unknown",
        },
      ],
      telemetry: {
        providerCalls: 2,
        respondedCalls: 2,
        unknownUsageCalls: 0,
        unknownCostCalls: 1,
        knownTokens: { input: 30, output: 7, cacheRead: 3, cacheWrite: 0 },
        tokensStatus: "complete",
        knownActualUsdSubtotal: 0.01,
        totalActualUsd: null,
        actualUsdStatus: "partial-unknown",
        transportAttempts: "unknown",
      },
    }

    const summary = summarizeAuthorizationRun(run, { initial: generation })
    const naturalSummary = summarizeAuthorizationRun({ ...run, arm: "N" }, { initial: generation })
    const pair = summarizeAuthorizationPair("semantic-review-example", summary, {
      ...summary,
      arm: "D",
    })

    expect(summary.initialQuality).toBe("full-success")
    expect(summary.finalQuality).toBe("full-success")
    expect(summary).toEqual(expect.objectContaining({
      initialSemanticDecisionCorrect: true,
      finalSemanticDecisionCorrect: true,
      initialEvidenceSemanticSupport: "supported",
      finalEvidenceSemanticSupport: "supported",
      initialTransportValid: true,
      finalTransportValid: true,
      initialDeliveryComplete: true,
      finalDeliveryComplete: true,
    }))
    expect(summary.operation).toEqual(expect.objectContaining({
      providerAttempts: 2,
      schemaToolAttempts: 1,
      promptParseAttempts: 1,
      knownElapsedMsSubtotal: 25,
      totalElapsedMs: 25,
      knownActualUsdSubtotal: 0.01,
      totalActualUsd: null,
    }))
    expect(pair.arms.B.operation.totalActualUsd).toBeNull()
    expect(pair.arms.D.operation.providerAttempts).toBe(2)
    expect(naturalSummary.arm).toBe("N")
    expect(() => summarizeAuthorizationPair("semantic-review-example", naturalSummary, {
      ...summary,
      arm: "D",
    })).toThrow("requires B baseline")
  })

  it("parses the three evaluator-only real-case rubrics including the revised trusted-header facts", async () => {
    const file = path.resolve(
      import.meta.dir,
      "../../../results/skill-ir/skill-dsl-research/development/authorization-v0/evaluation/rubrics.json",
    )
    const parsed = AuthorizationEvaluationRubricsV0Schema.parse(JSON.parse(await readFile(file, "utf8")))

    expect(parsed.cases.map(candidate => candidate.caseId)).toEqual([
      "owui-process-file-write",
      "owui-process-text-controlled",
      "owui-trusted-header-deployment",
    ])
    expect(parsed.cases[2]?.expectedDisposition).toBe("unknown")
    expect(parsed.cases[2]?.criticalFacts).toHaveLength(6)
    expect(parsed.cases[2]?.criticalFacts.map(fact => fact.id)).toEqual(expect.arrayContaining([
      "password-auth-entry-gate",
      "authentication-and-session-condition",
      "deployment-facts-absent",
    ]))
  })
})

describe("authorization semantic evaluation v2", () => {
  it("separates necessary semantics, explanation completeness, and optional detail", () => {
    const cases = [
      {
        id: "equivalent-negative-condition",
        evaluation: evaluateCandidateV2(
          "When the entry gate is not satisfied, the protected effect is unreachable; deployment facts still decide the actual outcome.",
        ),
        expectedQuality: "full-success",
      },
      {
        id: "omitted-signup",
        evaluation: evaluateCandidateV2(
          "The gate and identity binding are explicit, and the absent deployment fact keeps the answer unknown.",
          { criterionStatuses: { "optional-signup-detail": "missing" } },
        ),
        expectedQuality: "full-success",
      },
      {
        id: "correct-unknown",
        evaluation: evaluateCandidateV2(
          "The source proves a conditional path but lacks the external fact that selects the safe or unsafe outcome.",
        ),
        expectedQuality: "full-success",
      },
      {
        id: "code-quote-without-causal-claim",
        evaluation: evaluateCandidateV2(
          "The answer reproduces the entry code but never states how the value becomes the assessed identity.",
          { criterionStatuses: { "identity-binding": "missing" } },
        ),
        expectedQuality: "partial",
      },
      {
        id: "wrong-causality",
        evaluation: evaluateCandidateV2(
          "The entry gate causes the untrusted caller to reach the protected effect unconditionally.",
          {
            criterionStatuses: { "entry-gate": "contradicted" },
            dispositionStatus: "contradicted",
          },
        ),
        expectedQuality: "incorrect",
      },
      {
        id: "missing-decisive-control",
        evaluation: evaluateCandidateV2(
          "The source has a conditional path, but the answer omits the external fact that decides the deployment outcome.",
          { criterionStatuses: { "decisive-external-gap": "missing" } },
        ),
        expectedQuality: "partial",
      },
    ]

    expect(cases.map(candidate => [candidate.id, candidate.evaluation.qualityStatus]))
      .toEqual(cases.map(candidate => [candidate.id, candidate.expectedQuality]))
    expect(cases[0]?.evaluation.dimensions.necessarySemantics).toBe("supported")
    expect(cases[1]?.evaluation.dimensions.optionalDetails).toBe("partial")
    expect(cases[1]?.evaluation.semanticDecisionCorrect).toBe(true)
    expect(cases[1]?.evaluation.taskDecisionCorrect).toBe(true)
    expect(cases[3]?.evaluation.transportValid).toBe(true)
    expect(cases[3]?.evaluation.dimensions.necessarySemantics).toBe("missing")
    expect(cases[3]?.evaluation.taskDecisionCorrect).toBe(true)
    expect(cases[4]?.evaluation.taskDecisionCorrect).toBe(false)
    expect(cases[5]?.evaluation.dimensions.necessarySemantics).toBe("missing")
  })

  it("parses the calibrated evaluator-only v2 rubric", async () => {
    const file = path.resolve(
      import.meta.dir,
      "../../../results/skill-ir/skill-dsl-research/development/authorization-capability-v1/evaluation-v2.json",
    )
    const parsed = AuthorizationEvaluationRubricsV2Schema.parse(JSON.parse(await readFile(file, "utf8")))
    const trustedHeader = parsed.cases.find(candidate => candidate.caseId === "owui-trusted-header-deployment")
    const fastapiUpdate = parsed.cases.find(candidate => candidate.caseId === "fastapi-items-foreign-update")
    const fastapiRead = parsed.cases.find(candidate => candidate.caseId === "fastapi-items-superuser-read")

    expect(parsed.cases).toHaveLength(5)
    expect(trustedHeader?.criteria.map(criterion => [criterion.id, criterion.layer])).toEqual(expect.arrayContaining([
      ["password-auth-entry-gate", "necessary-semantics"],
      ["password-auth-403-detail", "explanation-completeness"],
      ["optional-signup-path", "optional-detail"],
    ]))
    expect(fastapiUpdate).toEqual(expect.objectContaining({
      expectedDisposition: "source_refuted",
      obligationId: "deny-non-superuser-foreign-update::put-item-by-id",
    }))
    expect(fastapiUpdate?.criteria.map(criterion => criterion.id)).toEqual(expect.arrayContaining([
      "foreign-item-binding",
      "non-superuser-foreign-update-decision",
      "update-effect-after-guard",
    ]))
    expect(fastapiRead).toEqual(expect.objectContaining({
      expectedDisposition: "source_refuted",
      obligationId: "allow-superuser-foreign-read::get-item-by-id",
    }))
    expect(fastapiRead?.criteria.map(criterion => criterion.id)).toEqual(expect.arrayContaining([
      "superuser-role-binding",
      "superuser-override-decision",
      "read-effect-after-guard",
    ]))
  })

  it("reassesses the archived trusted-header B/D answers without changing their generation identity", async () => {
    const capabilityRoot = path.resolve(
      import.meta.dir,
      "../../../results/skill-ir/skill-dsl-research/development/authorization-capability-v1",
    )
    const transportRoot = path.resolve(
      import.meta.dir,
      "../../../results/skill-ir/skill-dsl-research/development/authorization-transport-v1/runs/initial-wire-v1/units",
    )
    const rubrics = AuthorizationEvaluationRubricsV2Schema.parse(JSON.parse(
      await readFile(path.join(capabilityRoot, "evaluation-v2.json"), "utf8"),
    ))
    const rubric = rubrics.cases.find(candidate => candidate.caseId === "owui-trusted-header-deployment")!
    const reassessment = JSON.parse(
      await readFile(path.join(capabilityRoot, "trusted-header-w-reassessment-v2.json"), "utf8"),
    ) as {
      identity: { historicalArtifactsModified: boolean; generationReused: boolean; newProviderCalls: number }
      reviews: Record<"B" | "D", unknown>
      expectedSummary: Record<"B" | "D",
      AuthorizationGenerationEvaluationV2["dimensions"]
      & Pick<AuthorizationGenerationEvaluationV2, "semanticDecisionCorrect" | "taskDecisionCorrect" | "qualityStatus">>
    }

    expect(reassessment.identity).toEqual(expect.objectContaining({
      historicalArtifactsModified: false,
      generationReused: true,
      newProviderCalls: 0,
    }))

    for (const [arm, unit] of [
      ["B", "05-owui-trusted-header-deployment-B"],
      ["D", "06-owui-trusted-header-deployment-D"],
    ] as const) {
      const unitRoot = path.join(transportRoot, unit)
      const run = JSON.parse(await readFile(path.join(unitRoot, "run.json"), "utf8")) as AuthorizationTaskRun
      const sourceBundle = JSON.parse(await readFile(path.join(unitRoot, "source-bundle.json"), "utf8")) as SourceBundle
      expect(run.initial).toBeDefined()
      const evaluated = evaluateAuthorizationGenerationV2({
        rubric,
        sourceBundle,
        artifact: run.initial!,
        generation: "initial",
        review: reassessment.reviews[arm],
      })
      expect({
        ...evaluated.dimensions,
        semanticDecisionCorrect: evaluated.semanticDecisionCorrect,
        taskDecisionCorrect: evaluated.taskDecisionCorrect,
        qualityStatus: evaluated.qualityStatus,
      }).toEqual(reassessment.expectedSummary[arm])
    }
  })
})
