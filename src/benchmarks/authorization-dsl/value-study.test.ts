import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { LLMProvider, LLMResponse } from "../../providers/types.ts"
import type { AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { createDefaultAnalysisRequirements } from "../../task-dsl/authorization/relations.ts"
import {
  AuthorizationValueMigrationExperimentConfigSchema,
  AuthorizationValueStudyExperimentConfigSchema,
  buildAuthorizationStudyMethods,
  checkAuthorizationValueStudyExperiment,
  executeAuthorizationValueStudyExperiment,
  summarizeAuthorizationStudyUnit,
  validateAuthorizationValueStudyDesign,
} from "./value-study.ts"

const cleanupRoots: string[] = []

afterEach(async () => {
  while (cleanupRoots.length > 0) await rm(cleanupRoots.pop()!, { recursive: true, force: true })
})

function task(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "value-study-case",
    request: "Determine whether a member may update a record owned by another principal.",
    repository: "https://example.test/value-study",
    sourceRef: "value-r1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "owner-policy",
      kind: "task-requirement",
      text: "Only the owner or an administrator may update the record.",
      location: "task.json#/policySources/0",
      revision: "r1",
      acceptance: {
        status: "accepted",
        actorRole: "task-author",
        reason: "The author supplied the bounded policy.",
      },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A non-owner whose administrator status must be analyzed.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{ id: "record", type: "record", description: "A record owned by another principal." }],
    entries: [{ id: "update-record", name: "updateRecord", locations: [{ path: "src/record.ts", startLine: 1, endLine: 5 }] }],
    obligations: [{
      id: "deny-non-owner-update",
      principalId: "member",
      resourceId: "record",
      relation: "not-owner",
      operation: "update",
      expectation: "deny",
      conditions: [
        { name: "record-exists", basis: "The task fixes an existing record." },
        { name: "principal-is-not-admin", basis: "The assessed principal is not an administrator." },
      ],
      policySourceId: "owner-policy",
      entryIds: ["update-record"],
    }],
    scopeAssurance: "The fixed source covers the declared update entry only.",
    requiredAnalysis: ["Trace the ownership and administrator branches."],
    constraints: ["Use only the fixed source."],
  }
}

function conditionRequest() {
  return {
    schemaVersion: "authorization-condition-analysis-request/v1" as const,
    requests: [{
      obligationId: "deny-non-owner-update",
      conditionBindings: [
        { id: "record-exists", name: "record-exists" },
        { id: "principal-not-admin", name: "principal-is-not-admin" },
      ],
      maxBranches: 3,
    }],
  }
}

function successfulStudyProvider(counter: { calls: number }): LLMProvider {
  const requirements = createDefaultAnalysisRequirements(task())
  return {
    name: "value-study-mock",
    async complete(params) {
      counter.calls += 1
      const prompt = params.messages[0]?.content ?? ""
      const sourceId = prompt.match(/Source ID: ([^\n]+)/)?.[1]
      if (!sourceId) throw new Error("mock prompt has no source ID")
      const cite = (statement: string, line: number) => [{
        statement,
        citations: [{ sourceId, startLine: line, endLine: line }],
      }]
      const base = {
        results: [{
          obligationId: "deny-non-owner-update::update-record",
          conclusion: "source_refuted",
          explanation: "The owner mismatch is rejected before persistence; administrator and record conditions are explained from the fixed source.",
          facts: {
            entry: cite("The declared update entry receives the request.", 1),
            binding: cite("The request user is bound as principal.", 2),
            control: cite("An owner mismatch is rejected.", 3),
            effect: cite("Persistence follows the guard.", 4),
            condition: cite("The fixed function closes after the protected effect.", 5),
          },
          decisiveMissingFacts: [],
          suggestedObservations: [],
        }],
        scopeClaim: { kind: "declared-obligations-only", statement: "Only the declared update entry is assessed." },
      }
      const properties = params.tools?.[0]?.inputSchema as { properties?: Record<string, unknown> } | undefined
      const hasCoverage = properties?.properties?.coverage !== undefined
      const hasConditions = properties?.properties?.conditionAnalysis !== undefined
      const wire = {
        schemaVersion: hasConditions
          ? "source-authorization-assessment-wire/v3"
          : hasCoverage
            ? "source-authorization-assessment-wire/v2"
            : "source-authorization-assessment-wire/v1",
        ...base,
        ...(hasCoverage ? {
          coverage: requirements.map(requirement => ({
            requirementId: requirement.id,
            obligationId: "deny-non-owner-update::update-record",
            status: "addressed",
            explanation: "The cited control and explanation answer this public question.",
            factPointers: ["/results/0/facts/control/0"],
          })),
        } : {}),
        ...(hasConditions ? {
          conditionAnalysis: {
            schemaVersion: "authorization-condition-analysis-result/v1",
            analyses: [{
              obligationId: "deny-non-owner-update::update-record",
              branches: [{
                id: "existing-non-admin-blocked",
                obligationId: "deny-non-owner-update::update-record",
                assumptions: [
                  { conditionId: "record-exists", value: "true" },
                  { conditionId: "principal-not-admin", value: "true" },
                ],
                effect: "blocked",
                explanation: "The visible owner mismatch blocks this bounded branch.",
                factPointers: ["/results/0/facts/control/0"],
                missingFacts: [],
              }],
              unexaminedConditionIds: [],
              completeness: "bounded",
              limitations: ["The branch set is bounded by the authored request."],
            }],
          },
        } : {}),
      }
      return {
        text: "",
        toolCalls: [{ id: `result-${counter.calls}`, name: "submit_authorization_result", arguments: wire }],
        tokens: { input: 10, output: 5, cacheRead: 2, cacheWrite: 0 },
        durationMs: 1,
        stopReason: "tool_use",
      } satisfies LLMResponse
    },
    async completeWithToolResults() {
      throw new Error("output schema tools must not execute")
    },
  }
}

describe("authorization P/L/C value study", () => {
  it("keeps public facts and questions equal while applying three real interventions on render arm B", () => {
    const candidate = task()
    const requirements = createDefaultAnalysisRequirements(candidate)
    const methods = buildAuthorizationStudyMethods({
      task: candidate,
      analysisRequirements: requirements,
      conditionAnalysisRequest: conditionRequest(),
    })

    expect(Object.values(methods).map(method => method.renderArm)).toEqual(["B", "B", "B"])
    expect(methods.P.rendered.facts).toEqual(methods.L.rendered.facts)
    expect(methods.C.rendered.facts).toEqual(methods.L.rendered.facts)
    for (const requirement of requirements) {
      expect(methods.P.rendered.prompt).toContain(requirement.question)
      expect(methods.L.rendered.prompt).toContain(requirement.question)
      expect(methods.C.rendered.prompt).toContain(requirement.question)
    }

    expect(methods.P.wireVersion).toBe("source-authorization-assessment-wire/v1")
    expect(methods.P.rendered.sections.declaration).not.toBe(JSON.stringify(methods.P.rendered.facts, null, 2))
    expect(methods.P.rendered.sections.publicAnalysis).toBeDefined()
    expect(methods.P.rendered.sections.analysisLedger).toBeUndefined()
    expect(methods.P.rendered.sections.conditionAnalysis).toBeUndefined()

    expect(methods.L.wireVersion).toBe("source-authorization-assessment-wire/v2")
    expect(methods.L.rendered.sections.analysisLedger).toBeDefined()
    expect(methods.L.rendered.sections.conditionAnalysis).toBeUndefined()

    expect(methods.C.wireVersion).toBe("source-authorization-assessment-wire/v3")
    expect(methods.C.rendered.sections.analysisLedger).toBe(methods.L.rendered.sections.analysisLedger)
    expect(methods.C.rendered.sections.conditionAnalysis).toBeDefined()
    expect(methods.C.rendered.sections.conditionAnalysis).not.toContain('"effect"')
  })

  it("does not expose evaluator or oracle paths in any model prompt", () => {
    const methods = buildAuthorizationStudyMethods({
      task: task(),
      analysisRequirements: createDefaultAnalysisRequirements(task()),
      conditionAnalysisRequest: conditionRequest(),
    })

    for (const method of Object.values(methods)) {
      expect(method.rendered.prompt.toLowerCase()).not.toContain("oracle")
      expect(method.rendered.prompt).not.toContain("evaluation-v2.json")
      expect(method.rendered.prompt).not.toContain("evaluatorRubrics")
    }
  })

  it("requires one P/L/C unit per case in its frozen rotation and keeps study arm separate", () => {
    const config = AuthorizationValueStudyExperimentConfigSchema.parse({
      schemaVersion: "authorization-value-study-experiment/v1",
      studyId: "value-study-test",
      createdAt: "2026-09-22T00:00:00.000Z",
      implementationRevision: "test-revision",
      paths: { runRoot: "runs/value-study", evaluatorRubrics: "fixtures/evaluation-v2.json" },
      model: {
        modelId: "mock/value",
        routeMatch: "mock/value",
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
        expectedCaseCount: 1,
        expectedUnitCount: 3,
        freshContextPerUnit: true,
        evaluateAfterAllGeneration: true,
      },
      execution: {
        sourceMode: "fixed-context",
        targetExecution: "forbidden",
        modelExecutableTools: false,
        evaluatorVisibleDuringGeneration: false,
      },
      cases: [{
        caseId: "value-study-case",
        task: "fixtures/task.json",
        analysisRequirements: { kind: "default" },
        conditionAnalysisRequest: "fixtures/conditions.json",
        sourceRoot: "fixtures/source",
        sources: ["src/record.ts"],
        rotation: "P-L-C",
      }],
      units: [
        { id: "01-P", caseId: "value-study-case", studyArm: "P", renderArm: "B" },
        { id: "02-L", caseId: "value-study-case", studyArm: "L", renderArm: "B" },
        { id: "03-C", caseId: "value-study-case", studyArm: "C", renderArm: "B" },
      ],
      stoppingRules: {
        retainAllInitialUnitsInDenominator: true,
        continueAfterTerminalUnitFailure: true,
        noPostHocRequirementChanges: true,
      },
      revisionPolicy: {
        sharedContractOrImplementationDefectOnly: true,
        maxAdditionalUnits: 6,
        preserveInitialResults: true,
      },
      resumePolicy: {
        terminalUnitsAreNotResent: true,
        dispatchedWithoutResultIsCompletionUnknown: true,
      },
    })

    expect(validateAuthorizationValueStudyDesign(config)).toEqual([])
    const renamed = structuredClone(config)
    renamed.units[0]!.studyArm = "L"
    expect(validateAuthorizationValueStudyDesign(renamed)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "study-arm-set-mismatch" }),
      expect.objectContaining({ code: "study-rotation-mismatch" }),
    ]))
  })

  it("accepts normalized-input P/C repetitions only in the frozen reversed second order", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-value-migration-"))
    cleanupRoots.push(root)
    await mkdir(path.join(root, "fixtures", "source", "src"), { recursive: true })
    await writeFile(path.join(root, "fixtures", "source", "src", "record.ts"), [
      "export function updateRecord(request: Request) {",
      "  const principal = request.user",
      "  if (request.record.ownerId !== principal.id) throw new Error('denied')",
      "  return persistUpdate(request.record)",
      "}",
    ].join("\n"), "utf8")
    await writeFile(path.join(root, "fixtures", "assessment.json"), `${JSON.stringify({
      schemaVersion: "authorization-assessment-input/v1",
      sourceIdentity: { repository: task().repository, sourceRef: task().sourceRef },
      sourceRoot: "source",
      sources: ["src/record.ts"],
      task: task(),
      analysisProfile: { id: "authorization-core-v1", origin: "derived" },
      analysisRequirements: createDefaultAnalysisRequirements(task()),
      conditionAnalysisRequest: conditionRequest(),
    }, null, 2)}\n`, "utf8")
    await writeFile(path.join(root, "fixtures", "evaluation-v2.json"), "{}\n", "utf8")

    const config = AuthorizationValueMigrationExperimentConfigSchema.parse({
      schemaVersion: "authorization-value-study-experiment/v2",
      studyId: "value-migration-test",
      createdAt: "2026-09-22T00:00:00.000Z",
      implementationRevision: "test-revision",
      paths: { runRoot: "runs/value-migration", evaluatorRubrics: "fixtures/evaluation-v2.json" },
      model: {
        modelId: "mock/value",
        routeMatch: "mock/value",
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
        expectedCaseCount: 1,
        expectedUnitCount: 4,
        freshContextPerUnit: true,
        evaluateAfterAllGeneration: true,
        comparisonArms: ["P", "C"],
        repetitionsPerArm: 2,
        reverseSecondRepetition: true,
        analysisProfileId: "authorization-core-v1",
      },
      execution: {
        sourceMode: "fixed-context",
        targetExecution: "forbidden",
        modelExecutableTools: false,
        evaluatorVisibleDuringGeneration: false,
      },
      cases: [{
        caseId: "value-study-case",
        input: "fixtures/assessment.json",
        sourceRoot: "fixtures/source",
        sources: ["src/record.ts"],
        unitOrder: ["P", "C", "C", "P"],
      }],
      units: [
        { id: "01-r1-P", caseId: "value-study-case", repetition: 1, studyArm: "P", renderArm: "B" },
        { id: "02-r1-C", caseId: "value-study-case", repetition: 1, studyArm: "C", renderArm: "B" },
        { id: "03-r2-C", caseId: "value-study-case", repetition: 2, studyArm: "C", renderArm: "B" },
        { id: "04-r2-P", caseId: "value-study-case", repetition: 2, studyArm: "P", renderArm: "B" },
      ],
      stoppingRules: {
        retainAllInitialUnitsInDenominator: true,
        continueAfterTerminalUnitFailure: true,
        noPostHocRequirementChanges: true,
      },
      revisionPolicy: {
        sharedContractOrImplementationDefectOnly: true,
        maxAdditionalUnits: 6,
        preserveInitialResults: true,
      },
      resumePolicy: {
        terminalUnitsAreNotResent: true,
        dispatchedWithoutResultIsCompletionUnknown: true,
      },
    })

    expect(validateAuthorizationValueStudyDesign(config)).toEqual([])
    const configPath = path.join(root, "migration.json")
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
    const checked = await checkAuthorizationValueStudyExperiment({
      repositoryRoot: root,
      configPath,
    })
    expect(checked.status).toBe("valid")
    expect(checked.cases[0]?.methods?.map(method => method.studyArm)).toEqual(["P", "C"])

    const counter = { calls: 0 }
    const run = await executeAuthorizationValueStudyExperiment({
      repositoryRoot: root,
      configPath,
      providerFactory: async () => successfulStudyProvider(counter),
      env: {},
    })
    expect(run.status).toBe("completed")
    expect(counter.calls).toBe(4)
    expect(run.units.map(unit => [unit.studyArm, unit.status])).toEqual([
      ["P", "completed"],
      ["C", "completed"],
      ["C", "completed"],
      ["P", "completed"],
    ])
    expect(new Set(run.units.map(unit => unit.sessionId)).size).toBe(4)
    expect(await readFile(path.join(root, "runs", "value-migration", "public-inputs", "value-study-case", "project", "src", "record.ts"), "utf8"))
      .toContain("persistUpdate")

    const wrongOrder = structuredClone(config)
    wrongOrder.units[2]!.studyArm = "P"
    expect(validateAuthorizationValueStudyDesign(wrongOrder)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "migration-arm-count-mismatch" }),
      expect.objectContaining({ code: "migration-unit-order-mismatch" }),
    ]))
  })

  it("lets semantic review credit P text and never lets a C field replace missing semantics", () => {
    const baseEvaluation = {
      evaluationVersion: "authorization-evaluation/v2" as const,
      qualityStatus: "full-success" as const,
      dimensions: {
        necessarySemantics: "supported" as const,
        explanationCompleteness: "complete" as const,
        optionalDetails: "not-applicable" as const,
      },
      taskDecisionCorrect: true,
      semanticDecisionCorrect: true,
      transportValid: true,
      deliveryComplete: true,
      deterministicDiagnostics: [],
    }
    const run = {
      status: "completed" as const,
      finalKind: "initial" as const,
      attempts: [{
        id: "attempt-1",
        phase: "initial" as const,
        transport: "schema-tool" as const,
        status: "response" as const,
        startedAt: "2026-09-22T00:00:00.000Z",
        endedAt: "2026-09-22T00:00:00.010Z",
        request: { messageCount: 1, messageCharacters: 10, toolNames: [], executableTools: false as const },
        response: {
          text: "",
          toolCalls: [],
          tokens: { input: 10, output: 5, cacheRead: 3, cacheWrite: 0 },
          costUsd: null,
          durationMs: 10,
          stopReason: "stop" as const,
        },
        usage: { input: 10, output: 5, cacheRead: 3, cacheWrite: 0 },
        costUsd: null,
        transportAttempts: "unknown" as const,
      }],
      telemetry: {
        providerCalls: 1,
        respondedCalls: 1,
        unknownUsageCalls: 0,
        unknownCostCalls: 1,
        knownTokens: { input: 10, output: 5, cacheRead: 3, cacheWrite: 0 },
        tokensStatus: "complete" as const,
        knownActualUsdSubtotal: 0,
        totalActualUsd: null,
        actualUsdStatus: "unknown" as const,
        transportAttempts: "unknown" as const,
      },
    }

    const plain = summarizeAuthorizationStudyUnit({
      unitId: "plain",
      caseId: "value-study-case",
      studyArm: "P",
      run: run as never,
      initialEvaluation: baseEvaluation as never,
    })
    expect(plain.finalQuality).toBe("full-success")
    expect(plain.usage.knownTokens).toEqual({ input: 10, output: 5, cacheRead: 3, cacheWrite: 0 })
    expect(plain.usage.totalActualUsd).toBeNull()

    const condition = summarizeAuthorizationStudyUnit({
      unitId: "condition",
      caseId: "value-study-case",
      studyArm: "C",
      run: {
        ...run,
        initial: {
          conditionAnalysis: { schemaVersion: "authorization-condition-analysis-result/v1", analyses: [{ branches: [] }] },
          conditionValidation: {
            status: "invalid",
            diagnostics: [{ code: "condition-result-schema-invalid", message: "branches must contain at least one item", path: "analyses.0.branches" }],
          },
        },
      } as never,
      initialEvaluation: {
        ...baseEvaluation,
        qualityStatus: "partial",
        dimensions: { ...baseEvaluation.dimensions, explanationCompleteness: "partial" },
      } as never,
    })
    expect(condition.finalQuality).toBe("partial")
    expect(condition.structuralIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "condition-result-schema-invalid" }),
    ]))
  })

  it("completes and resumes a three-method mock dry-run without mixing study and render arms", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-value-study-"))
    cleanupRoots.push(root)
    await mkdir(path.join(root, "fixtures", "source", "src"), { recursive: true })
    await writeFile(path.join(root, "fixtures", "task.json"), `${JSON.stringify(task(), null, 2)}\n`, "utf8")
    await writeFile(path.join(root, "fixtures", "conditions.json"), `${JSON.stringify(conditionRequest(), null, 2)}\n`, "utf8")
    await writeFile(path.join(root, "fixtures", "evaluation-v2.json"), "{}\n", "utf8")
    await writeFile(path.join(root, "fixtures", "source", "src", "record.ts"), [
      "export function updateRecord(request: Request) {",
      "  const principal = request.user",
      "  if (request.record.ownerId !== principal.id) throw new Error('denied')",
      "  return persistUpdate(request.record)",
      "}",
    ].join("\n"), "utf8")
    const config = {
      schemaVersion: "authorization-value-study-experiment/v1",
      studyId: "value-study-mock",
      createdAt: "2026-09-22T00:00:00.000Z",
      implementationRevision: "test-revision",
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
        caseId: "value-study-case",
        task: "fixtures/task.json",
        analysisRequirements: { kind: "default" },
        conditionAnalysisRequest: "fixtures/conditions.json",
        sourceRoot: "fixtures/source",
        sources: ["src/record.ts"],
        rotation: "P-L-C",
      }],
      units: [
        { id: "01-P", caseId: "value-study-case", studyArm: "P", renderArm: "B" },
        { id: "02-L", caseId: "value-study-case", studyArm: "L", renderArm: "B" },
        { id: "03-C", caseId: "value-study-case", studyArm: "C", renderArm: "B" },
      ],
      stoppingRules: { retainAllInitialUnitsInDenominator: true, continueAfterTerminalUnitFailure: true, noPostHocRequirementChanges: true },
      revisionPolicy: { sharedContractOrImplementationDefectOnly: true, maxAdditionalUnits: 6, preserveInitialResults: true },
      resumePolicy: { terminalUnitsAreNotResent: true, dispatchedWithoutResultIsCompletionUnknown: true },
    }
    const configPath = path.join(root, "experiment.json")
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")

    const requirements = createDefaultAnalysisRequirements(task())
    let calls = 0
    const provider: LLMProvider = {
      name: "value-study-mock",
      async complete(params) {
        calls += 1
        const prompt = params.messages[0]?.content ?? ""
        const sourceId = prompt.match(/Source ID: ([^\n]+)/)?.[1]
        if (!sourceId) throw new Error("mock prompt has no source ID")
        const cite = (statement: string, line: number) => [{
          statement,
          citations: [{ sourceId, startLine: line, endLine: line }],
        }]
        const base = {
          results: [{
            obligationId: "deny-non-owner-update::update-record",
            conclusion: "source_refuted",
            explanation: "The owner mismatch is rejected before persistence; administrator and record conditions are explained from the fixed source.",
            facts: {
              entry: cite("The declared update entry receives the request.", 1),
              binding: cite("The request user is bound as principal.", 2),
              control: cite("An owner mismatch is rejected.", 3),
              effect: cite("Persistence follows the guard.", 4),
              condition: cite("The fixed function closes after the protected effect.", 5),
            },
            decisiveMissingFacts: [],
            suggestedObservations: [],
          }],
          scopeClaim: { kind: "declared-obligations-only", statement: "Only the declared update entry is assessed." },
        }
        const properties = params.tools?.[0]?.inputSchema as { properties?: Record<string, unknown> } | undefined
        const hasCoverage = properties?.properties?.coverage !== undefined
        const hasConditions = properties?.properties?.conditionAnalysis !== undefined
        const wire = {
          schemaVersion: hasConditions
            ? "source-authorization-assessment-wire/v3"
            : hasCoverage
              ? "source-authorization-assessment-wire/v2"
              : "source-authorization-assessment-wire/v1",
          ...base,
          ...(hasCoverage ? {
            coverage: requirements.map(requirement => ({
              requirementId: requirement.id,
              obligationId: "deny-non-owner-update::update-record",
              status: "addressed",
              explanation: "The cited control and explanation answer this public question.",
              factPointers: ["/results/0/facts/control/0"],
            })),
          } : {}),
          ...(hasConditions ? {
            conditionAnalysis: {
              schemaVersion: "authorization-condition-analysis-result/v1",
              analyses: [{
                obligationId: "deny-non-owner-update::update-record",
                branches: [
                  {
                    id: "existing-non-admin-blocked",
                    obligationId: "deny-non-owner-update::update-record",
                    assumptions: [
                      { conditionId: "record-exists", value: "true" },
                      { conditionId: "principal-not-admin", value: "true" },
                    ],
                    effect: "blocked",
                    explanation: "The visible owner mismatch blocks this bounded branch.",
                    factPointers: ["/results/0/facts/control/0"],
                    missingFacts: [],
                  },
                ],
                unexaminedConditionIds: [],
                completeness: "bounded",
                limitations: ["The branch set is bounded by the authored request."],
              }],
            },
          } : {}),
        }
        return {
          text: "",
          toolCalls: [{ id: `result-${calls}`, name: "submit_authorization_result", arguments: wire }],
          tokens: { input: 10, output: 5, cacheRead: 2, cacheWrite: 0 },
          durationMs: 1,
          stopReason: "tool_use",
        } satisfies LLMResponse
      },
      async completeWithToolResults() {
        throw new Error("output schema tools must not execute")
      },
    }

    const run = await executeAuthorizationValueStudyExperiment({
      repositoryRoot: root,
      configPath,
      providerFactory: async () => provider,
      env: {},
    })
    expect(run.status).toBe("completed")
    expect(run.units.map(unit => [unit.studyArm, unit.renderArm, unit.status])).toEqual([
      ["P", "B", "completed"],
      ["L", "B", "completed"],
      ["C", "B", "completed"],
    ])
    expect(calls).toBe(3)

    const runRoot = path.join(root, "runs", "value-study")
    const plainResult = JSON.parse(await readFile(path.join(runRoot, "units", "01-P", "unit-result.json"), "utf8"))
    const ledgerResult = JSON.parse(await readFile(path.join(runRoot, "units", "02-L", "unit-result.json"), "utf8"))
    const conditionResult = JSON.parse(await readFile(path.join(runRoot, "units", "03-C", "unit-result.json"), "utf8"))
    expect(plainResult.report.relationCoverage).toEqual([])
    expect(plainResult.report.conditionAnalysis).toBeUndefined()
    expect(ledgerResult.report.relationCoverage).toHaveLength(requirements.length)
    expect(ledgerResult.report.conditionAnalysis).toBeUndefined()
    expect(conditionResult.report.conditionAnalysis.analyses[0].branches).toHaveLength(1)

    const resumed = await executeAuthorizationValueStudyExperiment({
      repositoryRoot: root,
      configPath,
      providerFactory: async () => { throw new Error("terminal units must not create a provider") },
    })
    expect(resumed.status).toBe("completed")
    expect(resumed.units.every(unit => unit.status === "skipped-terminal")).toBe(true)
  })
})
