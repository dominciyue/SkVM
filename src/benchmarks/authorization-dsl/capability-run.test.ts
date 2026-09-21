import { afterEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { LLMProvider, LLMResponse } from "../../providers/types.ts"
import type { AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import { buildAuthorizationSourceCatalog } from "./inputs.ts"
import { loadLocalAuthorizationInput } from "./local-input.ts"
import {
  checkAuthorizationCapabilityExperiment,
  executeAuthorizationCapabilityExperiment,
  runAuthorizationCapabilityExperimentCli,
} from "./capability-run.ts"

const cleanupRoots: string[] = []

afterEach(async () => {
  while (cleanupRoots.length > 0) {
    await rm(cleanupRoots.pop()!, { recursive: true, force: true })
  }
})

function task(): AuthorizationTaskV0 {
  return {
    schemaVersion: "source-authorization-assessment/v0",
    taskId: "capability-runner-case",
    request: "Determine whether a non-owner may update the declared record.",
    repository: "https://example.test/capability-runner",
    sourceRef: "runner-r1",
    sourceMode: "fixed-context",
    policySources: [{
      id: "owner-policy",
      kind: "task-requirement",
      text: "Only the owner may update the record.",
      location: "fixtures/task.json#/policySources/0",
      revision: "policy-r1",
      acceptance: { status: "accepted", actorRole: "task-author", reason: "Bounded test policy." },
    }],
    principals: [{
      id: "member",
      role: "authenticated member",
      description: "A member who does not own the record.",
      startingCapabilities: ["authenticated"],
    }],
    resources: [{ id: "record", type: "record", description: "A record owned by another principal." }],
    entries: [{
      id: "update-record",
      name: "updateRecord",
      locations: [{ path: "src/record.ts", startLine: 1, endLine: 5 }],
    }],
    obligations: [{
      id: "deny-non-owner-update",
      principalId: "member",
      resourceId: "record",
      relation: "not-owner",
      operation: "update",
      expectation: "deny",
      conditions: [{ name: "authenticated", basis: "The caller is authenticated." }],
      policySourceId: "owner-policy",
      entryIds: ["update-record"],
    }],
    scopeAssurance: "The fixed source covers only the declared update entry.",
    requiredAnalysis: ["Trace the ownership guard to the update effect."],
    constraints: ["Do not execute the target."],
  }
}

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-capability-runner-"))
  cleanupRoots.push(root)
  await mkdir(path.join(root, "fixtures", "source", "src"), { recursive: true })
  await writeFile(path.join(root, "fixtures", "task.json"), `${JSON.stringify(task(), null, 2)}\n`, "utf8")
  await writeFile(path.join(root, "fixtures", "requirements.json"), `${JSON.stringify([{
    id: "runner.authorization-decision",
    kind: "authorization-decision",
    obligationIds: ["deny-non-owner-update"],
    question: "Which ownership branch decides this update?",
    applicability: "required",
    prerequisiteIds: [],
  }], null, 2)}\n`, "utf8")
  const source = [
    "export async function updateRecord(request: Request) {",
    "  const principal = request.user",
    "  if (request.record.ownerId !== principal.id) throw new Error('denied')",
    "  return persistUpdate(request.record)",
    "}",
  ].join("\n")
  await writeFile(path.join(root, "fixtures", "source", "src", "record.ts"), source, "utf8")
  await writeFile(path.join(root, "fixtures", "rubrics.json"), "{}\n", "utf8")
  const config = {
    schemaVersion: "authorization-capability-experiment/v1",
    studyId: "capability-runner-test",
    createdAt: "2026-09-21T00:00:00.000Z",
    implementationRevision: "test-revision",
    paths: {
      runRoot: "runs/capability-runner-test",
      evaluatorRubrics: "fixtures/rubrics.json",
    },
    model: {
      modelId: "mock/capability",
      routeMatch: "mock/capability",
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
    design: {
      mainRepeats: 2,
      reverseSecondRepeat: true,
      freshContextPerUnit: true,
      evaluateAfterAllGeneration: true,
      expectedCaseCount: 1,
      expectedUnitCount: 5,
    },
    execution: {
      sourceMode: "fixed-context",
      targetExecution: "forbidden",
      modelExecutableTools: false,
      evaluatorVisibleDuringGeneration: false,
    },
    cases: [{
      caseId: "capability-runner-case",
      task: "fixtures/task.json",
      analysisRequirements: { kind: "file", path: "fixtures/requirements.json" },
      sourceRoot: "fixtures/source",
      sources: ["src/record.ts"],
      includeNaturalSupplement: true,
    }],
    units: [
      { id: "01-r1-B", caseId: "capability-runner-case", set: "main", repeat: 1, arm: "B" },
      { id: "02-r1-D", caseId: "capability-runner-case", set: "main", repeat: 1, arm: "D" },
      { id: "03-r2-D", caseId: "capability-runner-case", set: "main", repeat: 2, arm: "D" },
      { id: "04-r2-B", caseId: "capability-runner-case", set: "main", repeat: 2, arm: "B" },
      { id: "05-N", caseId: "capability-runner-case", set: "natural-supplement", repeat: null, arm: "N" },
    ],
    resumePolicy: {
      terminalUnitsAreNotResent: true,
      dispatchedWithoutResultIsCompletionUnknown: true,
    },
  }
  const configPath = path.join(root, "experiment.json")
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
  return { root, configPath, source }
}

async function providerForMaterializedInput(
  inputPath: string,
  calls: { factory: number; complete: number },
): Promise<LLMProvider> {
  const loaded = await loadLocalAuthorizationInput(inputPath)
  if (loaded.status !== "valid") throw new Error("Materialized experiment input must be valid.")
  const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!catalog.success) throw new Error("Materialized source catalog must be valid.")
  const sourceId = catalog.catalog.sources[0]!.sourceId
  const cite = (statement: string, line: number) => [{
    statement,
    citations: [{ sourceId, startLine: line, endLine: line }],
  }]
  const wire = {
    schemaVersion: "source-authorization-assessment-wire/v2",
    results: [{
      obligationId: "deny-non-owner-update::update-record",
      conclusion: "source_refuted",
      explanation: "The owner mismatch is rejected before persistence.",
      facts: {
        entry: cite("The update entry is declared.", 1),
        binding: cite("The caller is bound to request.user.", 2),
        control: cite("The owner mismatch is rejected.", 3),
        effect: cite("Persistence follows the guard.", 4),
        condition: cite("The request supplies the caller.", 2),
      },
      decisiveMissingFacts: [],
      suggestedObservations: [],
    }],
    scopeClaim: { kind: "declared-obligations-only", statement: "Only the declared update is assessed." },
    coverage: [{
      requirementId: "runner.authorization-decision",
      obligationId: "deny-non-owner-update::update-record",
      status: "addressed",
      explanation: "The ownership control fact answers the declared question.",
      factPointers: ["/results/0/facts/control/0"],
    }],
  }
  const response: LLMResponse = {
    text: "",
    toolCalls: [{ id: "runner-result", name: "submit_authorization_result", arguments: wire }],
    tokens: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0,
    durationMs: 1,
    stopReason: "tool_use",
  }
  calls.factory += 1
  return {
    name: "capability-runner-mock",
    async complete() {
      calls.complete += 1
      return response
    },
    async completeWithToolResults() {
      throw new Error("The result tool must not execute.")
    },
  }
}

describe("authorization capability experiment runner", () => {
  it("checks, executes ordered fresh-context units, and resumes without resending", async () => {
    const fixture = await makeFixture()
    const checked = await checkAuthorizationCapabilityExperiment({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
    })
    expect(checked).toEqual(expect.objectContaining({
      status: "valid",
      caseCount: 1,
      unitCount: 5,
      diagnostics: [],
    }))

    const calls = { factory: 0, complete: 0 }
    const inputPath = path.join(
      fixture.root,
      "runs",
      "capability-runner-test",
      "public-inputs",
      "capability-runner-case",
      "assessment.json",
    )
    const run = await executeAuthorizationCapabilityExperiment({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      env: {},
      providerFactory: async () => providerForMaterializedInput(inputPath, calls),
    })
    expect(run.status).toBe("completed")
    expect(run.units.map(unit => [unit.id, unit.status])).toEqual([
      ["01-r1-B", "completed"],
      ["02-r1-D", "completed"],
      ["03-r2-D", "completed"],
      ["04-r2-B", "completed"],
      ["05-N", "completed"],
    ])
    expect(calls).toEqual({ factory: 1, complete: 5 })

    const runRoot = path.join(fixture.root, "runs", "capability-runner-test")
    const metadata = JSON.parse(await readFile(path.join(runRoot, "run-metadata.json"), "utf8"))
    expect(metadata).toEqual(expect.objectContaining({
      configSha256: createHash("sha256").update(await readFile(fixture.configPath, "utf8")).digest("hex"),
      implementationRevision: "test-revision",
      recordedBeforeProviderCreation: true,
      unitOrder: ["01-r1-B", "02-r1-D", "03-r2-D", "04-r2-B", "05-N"],
    }))
    const firstResultPath = path.join(runRoot, "units", "01-r1-B", "unit-result.json")
    const firstResultBytes = await readFile(firstResultPath, "utf8")
    const firstResult = JSON.parse(firstResultBytes) as { report: { sessionPath: string } }
    const dispatch = JSON.parse(await readFile(path.join(firstResult.report.sessionPath, "dispatch.json"), "utf8"))
    expect(dispatch.executionOptions).toEqual({
      timeoutMs: 1000,
      unitTimeoutMs: 5000,
      maxTokens: 6000,
      maxProviderDispatches: 4,
      maxDomainRepairs: 1,
    })
    const materialized = await readFile(inputPath, "utf8")
    expect(materialized).not.toContain(fixture.root)
    expect(materialized).not.toContain("rubrics")
    expect(materialized).not.toContain("oracle")

    const tampered = JSON.parse(firstResultBytes)
    tampered.configSha256 = "0".repeat(64)
    await writeFile(firstResultPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8")
    let tamperProviderCreated = false
    await expect(executeAuthorizationCapabilityExperiment({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      providerFactory: async () => {
        tamperProviderCreated = true
        throw new Error("tampered recovery must fail before provider creation")
      },
    })).rejects.toThrow("Stored result identity")
    expect(tamperProviderCreated).toBe(false)
    await writeFile(firstResultPath, firstResultBytes, "utf8")

    const localResultPath = path.join(firstResult.report.sessionPath, "result.json")
    const localResultBytes = await readFile(localResultPath, "utf8")
    const tamperedLocalResult = JSON.parse(localResultBytes)
    tamperedLocalResult.sessionId = "20260921T000000000Z-deadbeef"
    await writeFile(localResultPath, `${JSON.stringify(tamperedLocalResult, null, 2)}\n`, "utf8")
    let artifactTamperProviderCreated = false
    await expect(executeAuthorizationCapabilityExperiment({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      providerFactory: async () => {
        artifactTamperProviderCreated = true
        throw new Error("tampered local artifacts must fail before provider creation")
      },
    })).rejects.toThrow("session identity")
    expect(artifactTamperProviderCreated).toBe(false)
    await writeFile(localResultPath, localResultBytes, "utf8")

    const resumed = await executeAuthorizationCapabilityExperiment({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      providerFactory: async () => {
        throw new Error("A terminal experiment must resume without provider creation.")
      },
    })
    expect(resumed.status).toBe("completed")
    expect(resumed.units.every(unit => unit.status === "skipped-terminal")).toBe(true)
    expect(calls).toEqual({ factory: 1, complete: 5 })
  })

  it("keeps help and check provider-free", async () => {
    const fixture = await makeFixture()
    const output: string[] = []
    let providerCreated = false
    expect(await runAuthorizationCapabilityExperimentCli(["--help"], {
      stdout: value => output.push(value),
      stderr: value => output.push(value),
      repositoryRoot: fixture.root,
      providerFactory: async () => {
        providerCreated = true
        throw new Error("help/check must not initialize a provider")
      },
    })).toBe(0)
    expect(await runAuthorizationCapabilityExperimentCli([
      "check",
      `--config=${fixture.configPath}`,
    ], {
      stdout: value => output.push(value),
      stderr: value => output.push(value),
      repositoryRoot: fixture.root,
      providerFactory: async () => {
        providerCreated = true
        throw new Error("help/check must not initialize a provider")
      },
    })).toBe(0)
    expect(providerCreated).toBe(false)
    expect(output.join("\n")).toContain("authorization-capability-experiment/v1")
  })

  it("does not resend a unit that already has a matching pre-dispatch claim", async () => {
    const fixture = await makeFixture()
    const configBytes = await readFile(fixture.configPath, "utf8")
    const config = JSON.parse(configBytes)
    const runRoot = path.join(fixture.root, "runs", "capability-runner-test")
    const claimedUnit = config.units[0]
    const claimedRoot = path.join(runRoot, "units", claimedUnit.id)
    await mkdir(claimedRoot, { recursive: true })
    await writeFile(path.join(claimedRoot, "dispatch-claim.json"), `${JSON.stringify({
      schemaVersion: "authorization-capability-unit-claim/v1",
      configSha256: createHash("sha256").update(configBytes).digest("hex"),
      implementationRevision: config.implementationRevision,
      unit: claimedUnit,
      claimedAt: "2026-09-21T00:00:00.000Z",
      noResendWithoutTerminalIdentity: true,
    }, null, 2)}\n`, "utf8")
    const calls = { factory: 0, complete: 0 }
    const inputPath = path.join(
      runRoot,
      "public-inputs",
      "capability-runner-case",
      "assessment.json",
    )
    const run = await executeAuthorizationCapabilityExperiment({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      providerFactory: async () => providerForMaterializedInput(inputPath, calls),
      env: {},
    })

    expect(run.status).toBe("completed-with-failures")
    expect(run.units[0]).toEqual(expect.objectContaining({
      id: claimedUnit.id,
      status: "completion-unknown",
    }))
    expect(calls).toEqual({ factory: 1, complete: 4 })
    expect(await readFile(path.join(claimedRoot, "dispatch-claim.json"), "utf8")).toContain(claimedUnit.id)
  })

  it("safely retries an initialized session that has no dispatch artifact", async () => {
    const fixture = await makeFixture()
    const configBytes = await readFile(fixture.configPath, "utf8")
    const config = JSON.parse(configBytes)
    const runRoot = path.join(fixture.root, "runs", "capability-runner-test")
    const initializedUnit = config.units[0]
    const initializedRoot = path.join(runRoot, "units", initializedUnit.id)
    const sessionId = "20260921T000000000Z-deadbeef"
    const sessionPath = path.join(initializedRoot, "sessions", sessionId)
    const inputPath = path.join(
      runRoot,
      "public-inputs",
      "capability-runner-case",
      "assessment.json",
    )
    await mkdir(sessionPath, { recursive: true })
    await writeFile(path.join(initializedRoot, "dispatch-claim.json"), `${JSON.stringify({
      schemaVersion: "authorization-capability-unit-claim/v1",
      configSha256: createHash("sha256").update(configBytes).digest("hex"),
      implementationRevision: config.implementationRevision,
      unit: initializedUnit,
      claimedAt: "2026-09-21T00:00:00.000Z",
      noResendWithoutTerminalIdentity: true,
    }, null, 2)}\n`, "utf8")
    await writeFile(path.join(sessionPath, "session.json"), `${JSON.stringify({
      schemaVersion: "authorization-local-session/v1",
      sessionId,
      createdAt: "2026-09-21T00:00:00.000Z",
      inputPath,
      inputSha256: "0".repeat(64),
      model: config.model.modelId,
      arm: initializedUnit.arm,
      analysisProfile: { id: "test", origin: "task-supplied" },
      noAutomaticResend: true,
    }, null, 2)}\n`, "utf8")
    await writeFile(path.join(sessionPath, "check.json"), `${JSON.stringify({
      schemaVersion: "authorization-local-check/v1",
      status: "valid",
      inputPath,
      taskId: initializedUnit.caseId,
      diagnostics: [],
    }, null, 2)}\n`, "utf8")
    await writeFile(path.join(initializedRoot, "sessions.jsonl"), `${JSON.stringify({
      schemaVersion: "authorization-local-session-index-entry/v1",
      sessionId,
      relativePath: `sessions/${sessionId}`,
      status: "running",
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:00:00.000Z",
    })}\n`, "utf8")

    const calls = { factory: 0, complete: 0 }
    const run = await executeAuthorizationCapabilityExperiment({
      repositoryRoot: fixture.root,
      configPath: fixture.configPath,
      providerFactory: async () => providerForMaterializedInput(inputPath, calls),
      env: {},
    })
    expect(run.status).toBe("completed")
    expect(calls).toEqual({ factory: 1, complete: 5 })
    const retried = JSON.parse(await readFile(
      path.join(initializedRoot, "unit-result.json"),
      "utf8",
    )) as { report: { sessionId: string } }
    expect(retried.report.sessionId).not.toBe(sessionId)
  })

  it("rejects a wrong declared denominator and path-unsafe experiment IDs", async () => {
    const wrongCount = await makeFixture()
    const countConfig = JSON.parse(await readFile(wrongCount.configPath, "utf8"))
    countConfig.design.expectedCaseCount = 2
    await writeFile(wrongCount.configPath, `${JSON.stringify(countConfig, null, 2)}\n`, "utf8")
    const checked = await checkAuthorizationCapabilityExperiment({
      repositoryRoot: wrongCount.root,
      configPath: wrongCount.configPath,
    })
    expect(checked.status).toBe("invalid")
    expect(checked.diagnostics).toContainEqual(expect.objectContaining({ code: "case-count-mismatch" }))

    const unsafe = await makeFixture()
    const unsafeConfig = JSON.parse(await readFile(unsafe.configPath, "utf8"))
    unsafeConfig.cases[0].caseId = "../escape"
    await writeFile(unsafe.configPath, `${JSON.stringify(unsafeConfig, null, 2)}\n`, "utf8")
    await expect(checkAuthorizationCapabilityExperiment({
      repositoryRoot: unsafe.root,
      configPath: unsafe.configPath,
    })).rejects.toThrow("path-safe segment")
  })
})
