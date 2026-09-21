import { afterEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { validateAuthorizationResult } from "../../task-dsl/authorization/result.ts"
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import type { AuthorizationTaskRun } from "./host.ts"
import type { SourceBundle } from "./inputs.ts"
import { summarizeAuthorizationAttempts, type AuthorizationProviderAttempt } from "./telemetry.ts"
import {
  evaluateAuthorizationCapabilityRunDirectory,
  materializeAuthorizationCapabilityReviews,
  replayAuthorizationCapabilityEvaluation,
} from "./capability-evaluate.ts"

const cleanupRoots: string[] = []

afterEach(async () => {
  while (cleanupRoots.length > 0) {
    await rm(cleanupRoots.pop()!, { recursive: true, force: true })
  }
})

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-capability-evaluate-"))
  cleanupRoots.push(root)
  const runRoot = path.join(root, "runs", "panel")
  const unitId = "01-r1-B"
  const sessionRelativePath = `units/${unitId}/sessions/session-1`
  const sessionPath = path.join(runRoot, ...sessionRelativePath.split("/"))
  const source = [
    "export function update(record, user) {",
    "  if (record.ownerId !== user.id) throw new Error('denied')",
    "  return persist(record)",
    "}",
  ].join("\n")
  await mkdir(path.join(root, "source"), { recursive: true })
  await writeFile(path.join(root, "source", "task.json"), "{\"scope\":\"declared update only\"}\n", "utf8")
  const sourceBundle: SourceBundle = {
    repository: "https://example.test/project",
    sourceRef: "revision-1",
    sourceMode: "fixed-context",
    isolation: "exact-allowlist",
    files: [{
      relativePath: "src/record.ts",
      content: source,
      sha256: createHash("sha256").update(source).digest("hex"),
      cropRange: { startLine: 1, endLine: 4 },
      originalLocations: ["src/record.ts:1-4"],
    }],
  }
  const task: AuthorizationTaskV0 = {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "owner-update",
    request: "Determine whether a non-owner can update the record.",
    repository: sourceBundle.repository,
    sourceRef: sourceBundle.sourceRef,
    sourceMode: "fixed-context",
    policySources: [{
      id: "owner-policy",
      kind: "task-requirement",
      text: "Only the owner may update the record.",
      location: "task.json#/policySources/0",
      revision: "policy-1",
      acceptance: { status: "accepted", actorRole: "task-author", reason: "Bounded fixture policy." },
    }],
    principals: [{
      id: "member",
      role: "member",
      description: "Authenticated non-owner.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{ id: "record", type: "record", description: "A foreign record." }],
    entries: [{
      id: "update-record",
      name: "update",
      locations: [{ path: "src/record.ts", startLine: 1, endLine: 4 }],
    }],
    obligations: [{
      id: "deny-non-owner",
      principalId: "member",
      resourceId: "record",
      relation: "not-owner",
      operation: "update",
      expectation: "deny",
      conditions: [{ name: "authenticated", basis: "The caller is authenticated." }],
      policySourceId: "owner-policy",
      entryIds: ["update-record"],
    }],
    scopeAssurance: "Only the declared entry is covered.",
    requiredAnalysis: ["Trace the owner guard to persistence."],
    constraints: ["Do not execute the target."],
  }
  const citation = {
    path: "src/record.ts",
    startLine: 2,
    endLine: 3,
    quote: "  if (record.ownerId !== user.id) throw new Error('denied')\n  return persist(record)",
  }
  const result: AuthorizationResultV0 = {
    schemaVersion: "source-authorization-assessment-result/v0",
    taskId: task.taskId,
    repository: task.repository,
    sourceRef: task.sourceRef,
    results: [{
      obligationId: "deny-non-owner::update-record",
      conclusion: "source_refuted",
      explanation: "The owner mismatch is denied before persistence, so the declared deny expectation is enforced.",
      facts: {
        entry: [{ statement: "The update entry is visible.", citations: [citation] }],
        binding: [{ statement: "The caller and record are bound.", citations: [citation] }],
        control: [{ statement: "The owner mismatch is denied.", citations: [citation] }],
        effect: [{ statement: "Persistence follows the guard.", citations: [citation] }],
        condition: [{ statement: "The caller is a non-owner.", citations: [citation] }],
      },
      decisiveMissingFacts: [],
      suggestedObservations: [],
    }],
    scopeClaim: { kind: "declared-obligations-only", statement: "Only the declared update is assessed." },
  }
  const rawResponse = JSON.stringify(result)
  const attempt: AuthorizationProviderAttempt = {
    id: "provider-attempt-1",
    phase: "initial",
    transport: "schema-tool",
    status: "response",
    startedAt: "2026-09-21T00:00:00.000Z",
    endedAt: "2026-09-21T00:00:00.010Z",
    request: {
      messageCount: 1,
      messageCharacters: 100,
      toolNames: ["submit_authorization_result"],
      maxTokens: 6000,
      temperature: 0,
      executableTools: false,
    },
    response: {
      text: "",
      toolCalls: [],
      tokens: { input: 100, output: 50, cacheRead: 10, cacheWrite: 0 },
      costUsd: null,
      durationMs: 10,
      stopReason: "tool_use",
    },
    usage: { input: 100, output: 50, cacheRead: 10, cacheWrite: 0 },
    costUsd: null,
    transportAttempts: "unknown",
  }
  const artifact = {
    result,
    rawResponse,
    providerAttemptIds: [attempt.id],
    outputAttemptId: attempt.id,
    validation: validateAuthorizationResult(compileAuthorizationTask(task), result, sourceBundle),
    relationCoverage: [{
      requirementId: "owner.authorization-decision",
      obligationId: "deny-non-owner::update-record",
      status: "addressed" as const,
      explanation: "The owner guard decides the operation.",
      factPointers: ["/results/0/facts/control/0"],
    }],
    coverageValidation: {
      status: "valid" as const,
      declared: 1,
      addressed: 1,
      unknown: 0,
      notApplicable: 0,
      missing: [],
      diagnostics: [],
      semanticSupport: "unreviewed" as const,
      coverage: [{
        requirementId: "owner.authorization-decision",
        obligationId: "deny-non-owner::update-record",
        status: "addressed" as const,
        explanation: "The owner guard decides the operation.",
        factPointers: ["/results/0/facts/control/0"],
      }],
    },
  }
  const run: AuthorizationTaskRun = {
    status: "completed",
    arm: "B",
    compiled: compileAuthorizationTask(task),
    renderedPrompt: "fixture",
    initial: artifact,
    finalKind: "initial",
    attempts: [attempt],
    telemetry: summarizeAuthorizationAttempts([attempt]),
  }

  const config = {
    schemaVersion: "authorization-capability-experiment/v1",
    studyId: "evaluation-fixture",
    createdAt: "2026-09-21T00:00:00.000Z",
    implementationRevision: "fixture-revision",
    paths: { runRoot: "runs/panel", evaluatorRubrics: "rubrics.json" },
    model: {
      modelId: "mock/model",
      routeMatch: "mock/model",
      cacheDir: "cache",
      temperature: 0,
      timeoutMs: 180000,
      unitTimeoutMs: 600000,
      maxTokens: 6000,
      maxProviderDispatches: 4,
      maxDomainRepairs: 1,
      autoProbe: false,
      contextLimitTokens: null,
      contextLimitStatus: "provider-not-reported",
    },
    design: {
      mainRepeats: 2,
      reverseSecondRepeat: true,
      freshContextPerUnit: true,
      evaluateAfterAllGeneration: true,
      expectedCaseCount: 1,
      expectedUnitCount: 1,
    },
    execution: {
      sourceMode: "fixed-context",
      targetExecution: "forbidden",
      modelExecutableTools: false,
      evaluatorVisibleDuringGeneration: false,
    },
    cases: [{
      caseId: task.taskId,
      task: "task.json",
      analysisRequirements: { kind: "default" },
      sourceRoot: "source",
      sources: ["src/record.ts"],
      includeNaturalSupplement: false,
    }],
    units: [{ id: unitId, caseId: task.taskId, set: "main", repeat: 1, arm: "B" }],
    resumePolicy: { terminalUnitsAreNotResent: true, dispatchedWithoutResultIsCompletionUnknown: true },
  }
  const configPath = path.join(root, "experiment.json")
  await writeJson(configPath, config)
  const configSha256 = createHash("sha256").update(await readFile(configPath, "utf8")).digest("hex")
  await writeJson(path.join(root, "rubrics.json"), {
    schemaVersion: "authorization-evaluation-rubrics/v2",
    protocolVersion: "fixture/v2",
    provenance: {
      preparedBy: "fixture",
      preparedAt: "2026-09-21T00:00:00.000Z",
      publicInputs: ["task.json"],
      evaluatorOnlyInputs: ["rubrics.json"],
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
      rubricVersion: "owner-update/v2",
      obligationId: "deny-non-owner::update-record",
      expectedDisposition: "source_refuted",
      dispositionRule: { oracleRule: "fixture#/disposition", sourceLocations: [{ path: "src/record.ts", startLine: 1, endLine: 4 }] },
      scopeRule: { oracleRule: "fixture#/scope", sourceLocations: [{ path: "task.json", startLine: 1, endLine: 1 }] },
      criteria: [{
        id: "owner-guard",
        layer: "necessary-semantics",
        requirement: "State that the owner mismatch is denied before persistence.",
        decisionRelevance: "The guard decides the declared operation.",
        oracleRule: "fixture#/owner-guard",
        sourceLocations: [{ path: "src/record.ts", startLine: 1, endLine: 4 }],
      }],
    }],
  })
  await writeJson(path.join(sessionPath, "run.json"), run)
  await writeJson(path.join(sessionPath, "source-bundle.json"), sourceBundle)
  await writeJson(path.join(runRoot, "units", unitId, "unit-result.json"), {
    schemaVersion: "authorization-capability-unit-result/v1",
    configSha256,
    implementationRevision: "fixture-revision",
    unit: config.units[0],
    report: { schemaVersion: "authorization-local-result/v1", sessionId: "session-1", sessionPath, status: "completed" },
    sessionRelativePath,
  })
  const reviewPlanPath = path.join(root, "review-plan.json")
  await writeJson(reviewPlanPath, {
    schemaVersion: "authorization-capability-review-plan/v1",
    configSha256,
    reviewedAt: "2026-09-21T00:10:00.000Z",
    reviewer: { kind: "development-agent", identity: "fixture-reviewer" },
    independentVerification: {
      status: "completed",
      identities: ["fixture-independent-reader"],
      note: "A separate read-only pass checked the decisive relation.",
    },
    cases: [{
      caseId: task.taskId,
      criterionReviews: [{
        criterionId: "owner-guard",
        status: "supported",
        reason: "The answer states that the mismatch is denied before persistence.",
        answerLocation: "/results/0/explanation",
      }],
      dispositionReview: {
        status: "supported",
        reason: "The answer uses source_refuted for a source-enforced deny expectation.",
        answerLocation: "/results/0/conclusion",
      },
      scopeReview: {
        status: "supported",
        reason: "The answer limits itself to the declared update.",
        answerLocation: "/scopeClaim",
      },
    }],
    units: [{ unitId, caseId: task.taskId }],
  })
  return { root, runRoot, configPath, reviewPlanPath, unitId }
}

describe("authorization capability evaluation", () => {
  it("binds v2 reviews, reports first-response/coverage/operations, and replays without model calls", async () => {
    const fixture = await makeFixture()
    const materialized = await materializeAuthorizationCapabilityReviews({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      runDir: fixture.runRoot,
      reviewPlanPath: fixture.reviewPlanPath,
    })
    expect(materialized).toEqual(expect.objectContaining({ status: "completed", reviewCount: 1 }))
    const review = JSON.parse(await readFile(
      path.join(fixture.runRoot, "units", fixture.unitId, "review.initial.json"),
      "utf8",
    ))
    expect(review).toEqual(expect.objectContaining({
      schemaVersion: "authorization-semantic-review/v1",
      reviewer: { kind: "development-agent", identity: "fixture-reviewer" },
      attemptId: "provider-attempt-1",
    }))

    const evaluated = await evaluateAuthorizationCapabilityRunDirectory({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      runDir: fixture.runRoot,
    })
    expect(evaluated).toEqual(expect.objectContaining({
      schemaVersion: "authorization-capability-evaluation/v1",
      status: "completed",
      modelCalls: 0,
      targetExecutions: 0,
    }))
    expect(evaluated.overall).toEqual(expect.objectContaining({
      units: 1,
      firstResponseAccepted: 1,
      firstValid: 1,
      fullSuccess: 1,
      providerCalls: 1,
      promptParseCalls: 0,
      coverageValid: 1,
      coverageDeclared: 1,
      coverageAddressed: 1,
    }))
    expect(evaluated.byArm.B).toEqual(expect.objectContaining({ fullSuccess: 1 }))
    expect(evaluated.units[0]).toEqual(expect.objectContaining({
      id: fixture.unitId,
      qualityStatus: "full-success",
      firstResponseAccepted: true,
      firstValidCall: 1,
      reviewValidation: "valid",
    }))

    const replay = await replayAuthorizationCapabilityEvaluation({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      runDir: fixture.runRoot,
    })
    expect(replay).toEqual(expect.objectContaining({
      schemaVersion: "authorization-capability-evaluation-replay/v1",
      status: "reproduced",
      modelCalls: 0,
      targetExecutions: 0,
      summaryMatches: true,
    }))
  })
})
