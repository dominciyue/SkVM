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
  evaluateAuthorizationGeneration,
  hashAuthorizationRawOutput,
  summarizeAuthorizationPair,
  summarizeAuthorizationRun,
  type AuthorizationCaseEvaluationRubric,
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
    const pair = summarizeAuthorizationPair("semantic-review-example", summary, {
      ...summary,
      arm: "D",
    })

    expect(summary.initialQuality).toBe("full-success")
    expect(summary.finalQuality).toBe("full-success")
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
