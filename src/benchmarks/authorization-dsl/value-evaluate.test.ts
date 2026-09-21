import { afterEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { LLMProvider, LLMResponse } from "../../providers/types.ts"
import type { AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { createDefaultAnalysisRequirements } from "../../task-dsl/authorization/relations.ts"
import { executeAuthorizationValueStudyExperiment } from "./value-study.ts"
import {
  evaluateAuthorizationValueStudyRunDirectory,
  materializeAuthorizationValueStudyReviews,
  replayAuthorizationValueStudyEvaluation,
  selectAuthorizationValueStudyCandidate,
} from "./value-evaluate.ts"

const cleanupRoots: string[] = []

afterEach(async () => {
  while (cleanupRoots.length > 0) await rm(cleanupRoots.pop()!, { recursive: true, force: true })
})

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function fixtureTask(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "value-evaluation-case",
    request: "Determine whether a non-owner may update a record.",
    repository: "https://example.test/value-evaluation",
    sourceRef: "revision-1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "owner-policy",
      kind: "task-requirement",
      text: "Only an owner or administrator may update a record.",
      location: "task.json#/policySources/0",
      revision: "policy-1",
      acceptance: { status: "accepted", actorRole: "task-author", reason: "Bounded fixture policy." },
    }],
    principals: [{
      id: "member",
      role: "authenticated non-administrator",
      description: "A caller who does not own the record.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{ id: "record", type: "record", description: "A record owned by another principal." }],
    entries: [{ id: "update-record", name: "updateRecord", locations: [{ path: "src/record.ts", startLine: 1, endLine: 5 }] }],
    obligations: [{
      id: "deny-non-owner",
      principalId: "member",
      resourceId: "record",
      relation: "not-owner",
      operation: "update",
      expectation: "deny",
      conditions: [
        { name: "record-exists", basis: "The task fixes an existing record." },
        { name: "principal-is-not-admin", basis: "The task fixes a non-administrator." },
      ],
      policySourceId: "owner-policy",
      entryIds: ["update-record"],
    }],
    scopeAssurance: "Only the declared entry is covered.",
    requiredAnalysis: ["Trace the owner and administrator guard to persistence."],
    constraints: ["Do not execute the target."],
  }
}

function conditionRequest() {
  return {
    schemaVersion: "authorization-condition-analysis-request/v1" as const,
    requests: [{
      obligationId: "deny-non-owner",
      conditionBindings: [
        { id: "record-exists", name: "record-exists" },
        { id: "principal-not-admin", name: "principal-is-not-admin" },
      ],
      maxBranches: 2,
    }],
  }
}

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-value-evaluate-"))
  cleanupRoots.push(root)
  const task = fixtureTask()
  const source = [
    "export function updateRecord(request) {",
    "  const principal = request.user",
    "  if (request.record.ownerId !== principal.id && !principal.isAdmin) throw new Error('denied')",
    "  return persistUpdate(request.record)",
    "}",
  ].join("\n")
  await mkdir(path.join(root, "fixtures", "source", "src"), { recursive: true })
  await writeJson(path.join(root, "fixtures", "task.json"), task)
  await writeJson(path.join(root, "fixtures", "conditions.json"), conditionRequest())
  await writeFile(path.join(root, "fixtures", "source", "src", "record.ts"), source, "utf8")
  await writeFile(path.join(root, "fixtures", "source", "task.json"), "{\"scope\":\"declared update only\"}\n", "utf8")

  const units = [
    { id: "01-P", caseId: task.taskId, studyArm: "P", renderArm: "B" },
    { id: "02-L", caseId: task.taskId, studyArm: "L", renderArm: "B" },
    { id: "03-C", caseId: task.taskId, studyArm: "C", renderArm: "B" },
  ] as const
  const config = {
    schemaVersion: "authorization-value-study-experiment/v1",
    studyId: "value-evaluation-fixture",
    createdAt: "2026-09-22T00:00:00.000Z",
    implementationRevision: "fixture-revision",
    paths: { runRoot: "runs/value-study", evaluatorRubrics: "fixtures/evaluation-v2.json" },
    model: {
      modelId: "mock/value",
      routeMatch: "mock/value",
      cacheDir: "cache",
      temperature: 0,
      timeoutMs: 1000,
      unitTimeoutMs: 5000,
      maxTokens: 6000,
      maxProviderDispatches: 4,
      maxDomainRepairs: 1,
      autoProbe: false,
      contextLimitTokens: null,
      contextLimitStatus: "provider-not-reported",
    },
    design: { expectedCaseCount: 1, expectedUnitCount: 3, freshContextPerUnit: true, evaluateAfterAllGeneration: true },
    execution: { sourceMode: "fixed-context", targetExecution: "forbidden", modelExecutableTools: false, evaluatorVisibleDuringGeneration: false },
    cases: [{
      caseId: task.taskId,
      task: "fixtures/task.json",
      analysisRequirements: { kind: "default" },
      conditionAnalysisRequest: "fixtures/conditions.json",
      sourceRoot: "fixtures/source",
      sources: ["src/record.ts"],
      rotation: "P-L-C",
    }],
    units,
    stoppingRules: { retainAllInitialUnitsInDenominator: true, continueAfterTerminalUnitFailure: true, noPostHocRequirementChanges: true },
    revisionPolicy: { sharedContractOrImplementationDefectOnly: true, maxAdditionalUnits: 6, preserveInitialResults: true },
    resumePolicy: { terminalUnitsAreNotResent: true, dispatchedWithoutResultIsCompletionUnknown: true },
  }
  const configPath = path.join(root, "experiment.json")
  await writeJson(configPath, config)
  const configSha256 = createHash("sha256").update(await readFile(configPath, "utf8")).digest("hex")

  await writeJson(path.join(root, "fixtures", "evaluation-v2.json"), {
    schemaVersion: "authorization-evaluation-rubrics/v2",
    protocolVersion: "fixture/v2",
    provenance: {
      preparedBy: "fixture",
      preparedAt: "2026-09-22T00:00:00.000Z",
      publicInputs: ["fixtures/task.json", "fixtures/source/src/record.ts"],
      evaluatorOnlyInputs: ["fixtures/evaluation-v2.json"],
      historicalArtifactsModified: false,
      exposureStatus: "Fixture evaluator material.",
    },
    calibration: {
      publicRequirements: ["Trace the owner guard."],
      rules: ["A citation does not replace a causal claim."],
      cases: [{ id: "fixture", expectedQuality: "full-success", rationale: "Complete answer." }],
    },
    cases: [{
      caseId: task.taskId,
      taskId: task.taskId,
      rubricVersion: "value-evaluation-case/v2",
      obligationId: "deny-non-owner::update-record",
      expectedDisposition: "source_refuted",
      dispositionRule: { oracleRule: "fixture#/disposition", sourceLocations: [{ path: "src/record.ts", startLine: 1, endLine: 5 }] },
      scopeRule: { oracleRule: "fixture#/scope", sourceLocations: [{ path: "task.json", startLine: 1, endLine: 1 }] },
      criteria: [{
        id: "owner-admin-guard",
        layer: "necessary-semantics",
        requirement: "State that a non-owner non-administrator is denied before persistence.",
        decisionRelevance: "The guard decides the declared operation.",
        oracleRule: "fixture#/owner-admin-guard",
        sourceLocations: [{ path: "src/record.ts", startLine: 1, endLine: 5 }],
      }],
    }],
  })

  const requirements = createDefaultAnalysisRequirements(task)
  let providerCalls = 0
  const provider: LLMProvider = {
    name: "value-evaluation-mock",
    async complete(params) {
      providerCalls += 1
      const prompt = params.messages[0]?.content ?? ""
      const sourceId = prompt.match(/Source ID: ([^\n]+)/)?.[1]
      if (!sourceId) throw new Error("fixture prompt has no source ID")
      const cite = (statement: string, line: number) => [{ statement, citations: [{ sourceId, startLine: line, endLine: line }] }]
      const properties = params.tools?.[0]?.inputSchema as { properties?: Record<string, unknown> } | undefined
      const hasCoverage = properties?.properties?.coverage !== undefined
      const hasConditions = properties?.properties?.conditionAnalysis !== undefined
      const wire = {
        schemaVersion: hasConditions
          ? "source-authorization-assessment-wire/v3"
          : hasCoverage
            ? "source-authorization-assessment-wire/v2"
            : "source-authorization-assessment-wire/v1",
        results: [{
          obligationId: "deny-non-owner::update-record",
          conclusion: "source_refuted",
          explanation: "The caller is a non-owner non-administrator, so the conjunctive guard rejects the update before persistence.",
          facts: {
            entry: cite("The update entry receives the request.", 1),
            binding: cite("The request user is the principal.", 2),
            control: cite("The owner and administrator guard rejects this caller.", 3),
            effect: cite("Persistence follows the guard.", 4),
            condition: cite("The bounded function closes after the effect.", 5),
          },
          decisiveMissingFacts: [],
          suggestedObservations: [],
        }],
        scopeClaim: { kind: "declared-obligations-only", statement: "Only the declared update entry is assessed." },
        ...(hasCoverage ? {
          coverage: requirements.map(requirement => ({
            requirementId: requirement.id,
            obligationId: "deny-non-owner::update-record",
            status: "addressed",
            explanation: "The answer addresses the public question.",
            factPointers: ["/results/0/facts/control/0"],
          })),
        } : {}),
        ...(hasConditions ? {
          conditionAnalysis: {
            schemaVersion: "authorization-condition-analysis-result/v1",
            analyses: [{
              obligationId: "deny-non-owner::update-record",
              branches: [{
                id: "existing-non-admin-blocked",
                obligationId: "deny-non-owner::update-record",
                assumptions: [
                  { conditionId: "record-exists", value: "true" },
                  { conditionId: "principal-not-admin", value: "true" },
                ],
                effect: "blocked",
                explanation: "The owner and administrator guard blocks the update.",
                factPointers: ["/results/0/facts/control/0"],
                missingFacts: [],
              }],
              unexaminedConditionIds: [],
              completeness: "bounded",
              limitations: ["The authored request bounds the branch set."],
            }],
          },
        } : {}),
      }
      return {
        text: "",
        toolCalls: [{ id: `result-${providerCalls}`, name: "submit_authorization_result", arguments: wire }],
        tokens: { input: 10, output: 5, cacheRead: 2, cacheWrite: 0 },
        durationMs: 1,
        stopReason: "tool_use",
      } satisfies LLMResponse
    },
    async completeWithToolResults() {
      throw new Error("output schema tools must not execute")
    },
  }
  const generated = await executeAuthorizationValueStudyExperiment({
    repositoryRoot: root,
    configPath,
    providerFactory: async () => provider,
    env: {},
  })
  expect(generated.status).toBe("completed")
  expect(providerCalls).toBe(3)

  const reviewPlanPath = path.join(root, "review-plan.json")
  await writeJson(reviewPlanPath, {
    schemaVersion: "authorization-value-study-review-plan/v1",
    configSha256,
    reviewedAt: "2026-09-22T00:10:00.000Z",
    reviewer: { kind: "development-agent", identity: "fixture-value-reviewer" },
    independentVerification: {
      status: "completed",
      identities: ["fixture-anonymized-read-only-reviewer"],
      note: "The independent reader saw an anonymized representative answer and agreed on the decisive guard.",
      disagreements: [],
    },
    cases: [{
      caseId: task.taskId,
      criterionReviews: [{
        criterionId: "owner-admin-guard",
        status: "supported",
        reason: "The answer states that the conjunctive guard rejects the declared caller before persistence.",
        answerLocation: "/results/0/explanation",
      }],
      dispositionReview: {
        status: "supported",
        reason: "source_refuted correctly denotes enforcement of the declared deny expectation.",
        answerLocation: "/results/0/conclusion",
      },
      scopeReview: {
        status: "supported",
        reason: "The answer is limited to the declared entry.",
        answerLocation: "/scopeClaim",
      },
    }],
    units: units.map(unit => ({
      unitId: unit.id,
      caseId: unit.caseId,
      generation: "initial",
      ...(unit.studyArm === "C" ? {
        criterionReviewOverrides: [{
          criterionId: "owner-admin-guard",
          answerLocation: "/conditionAnalysis/analyses/0/branches/0/explanation",
          reason: "The bounded condition branch states that the guard blocks the update.",
        }],
      } : {}),
    })),
  })
  return { root, configPath, reviewPlanPath, runRoot: path.join(root, "runs", "value-study") }
}

describe("authorization value-study evaluation", () => {
  it("binds final reviews, treats P coverage as not applicable, selects the simpler tied candidate, and replays offline", async () => {
    const fixture = await makeFixture()
    const materialized = await materializeAuthorizationValueStudyReviews({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      runDir: fixture.runRoot,
      reviewPlanPath: fixture.reviewPlanPath,
    })
    expect(materialized).toEqual(expect.objectContaining({
      schemaVersion: "authorization-value-study-review-materialization/v1",
      status: "completed",
      reviewCount: 3,
      modelCalls: 0,
      targetExecutions: 0,
    }))

    const evaluated = await evaluateAuthorizationValueStudyRunDirectory({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      runDir: fixture.runRoot,
    })
    expect(evaluated).toEqual(expect.objectContaining({
      schemaVersion: "authorization-value-study-evaluation/v1",
      status: "completed",
      modelCalls: 0,
      targetExecutions: 0,
    }))
    expect(evaluated.byArm.P).toEqual(expect.objectContaining({ fullSuccess: 1, coverageNotApplicable: 1 }))
    expect(evaluated.byArm.L).toEqual(expect.objectContaining({ fullSuccess: 1, coverageValid: 1 }))
    expect(evaluated.byArm.C).toEqual(expect.objectContaining({ fullSuccess: 1, coverageValid: 1, conditionValid: 1 }))
    expect(evaluated.selection).toEqual(expect.objectContaining({
      selectedStudyArm: "L",
      basis: "quality-tie-prefer-lower-runtime-and-authoring-burden",
      comparisonToPlain: "no-observed-quality-difference",
    }))
    const conditionGainSelection = selectAuthorizationValueStudyCandidate({
      P: { ...evaluated.byArm.P, explanationCriterionGaps: 1 },
      L: { ...evaluated.byArm.L, explanationCriterionGaps: 1 },
      C: { ...evaluated.byArm.C, explanationCriterionGaps: 0 },
    })
    expect(conditionGainSelection).toEqual(expect.objectContaining({
      selectedStudyArm: "C",
      basis: "more-complete-condition-explanation",
    }))
    expect(evaluated.units.find(unit => unit.studyArm === "P")?.coverage.status).toBe("not-applicable")
    expect(evaluated.units.find(unit => unit.studyArm === "C")?.conditionAnalysis.status).toBe("valid")

    const replayed = await replayAuthorizationValueStudyEvaluation({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      runDir: fixture.runRoot,
    })
    expect(replayed).toEqual(expect.objectContaining({
      schemaVersion: "authorization-value-study-evaluation-replay/v1",
      status: "reproduced",
      summaryMatches: true,
      modelCalls: 0,
      targetExecutions: 0,
    }))
  })
})
