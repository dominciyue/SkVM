import { afterEach, describe, expect, it } from "bun:test"
import { cp, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { LLMProvider, LLMResponse } from "../../providers/types.ts"
import {
  AnalysisRequirementsSchema,
  compileAnalysisRequirements,
  type AnalysisRequirement,
} from "../../task-dsl/authorization/relations.ts"
import { renderAuthorizationTask } from "../../task-dsl/authorization/render.ts"
import {
  AuthorizationTaskV0Schema,
  type AuthorizationResultV0,
  type AuthorizationTaskV0,
} from "../../task-dsl/authorization/schema.ts"
import { compileAuthorizationTask } from "../../task-dsl/authorization/semantics.ts"
import {
  AuthorizationEvaluationRubricsV2Schema,
  createAuthorizationReviewTemplateV2,
  evaluateAuthorizationGenerationV2,
  type AuthorizationCaseEvaluationRubricV2,
} from "./evaluate.ts"
import { runAuthorizationTask } from "./host.ts"
import { buildAuthorizationSourceCatalog } from "./inputs.ts"
import { loadLocalAuthorizationInput, type LocalInputResult } from "./local-input.ts"
import { runLocalAuthorizationCli, type LocalAuthorizationCliDependencies } from "./local-run.ts"

const repositoryRoot = path.resolve(import.meta.dir, "../../..")
const researchRoot = path.join(repositoryRoot, "results", "skill-ir", "skill-dsl-research")
const caseRoot = path.join(researchRoot, "cases", "authorization")
const developmentRoot = path.join(researchRoot, "development")
const capabilityRoot = path.join(developmentRoot, "authorization-capability-v1")
const declarationRoot = path.join(developmentRoot, "authorization-v0", "declarations")
const exampleRoot = path.join(repositoryRoot, "examples", "authorization-assessment")

const cleanupRoots: string[] = []

afterEach(async () => {
  while (cleanupRoots.length > 0) {
    await rm(cleanupRoots.pop()!, { recursive: true, force: true })
  }
})

async function readJson(candidate: string): Promise<unknown> {
  return JSON.parse(await readFile(candidate, "utf8"))
}

interface CaseManifest {
  cases: Array<{ id: string; allowedInputFiles: string[] }>
}

interface RelationExample {
  task: unknown
  analysisRequirements: unknown
}

interface FastApiPublicTask {
  tasks: Array<{ caseId: string; request: string }>
}

interface OfflineCaseDefinition {
  caseId: string
  task: AuthorizationTaskV0
  analysisRequirements?: AnalysisRequirement[]
  sourceBase: string
  sources: string[]
}

async function materializeLocalInput(
  root: string,
  definition: OfflineCaseDefinition,
): Promise<string> {
  const directory = path.join(root, definition.caseId)
  const projectRoot = path.join(directory, "project")
  for (const source of definition.sources) {
    const destination = path.join(projectRoot, ...source.split("/"))
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(path.join(definition.sourceBase, ...source.split("/")), destination)
  }
  const inputPath = path.join(directory, "assessment.json")
  await mkdir(directory, { recursive: true })
  await writeFile(inputPath, `${JSON.stringify({
    schemaVersion: "authorization-assessment-input/v1",
    sourceIdentity: {
      repository: definition.task.repository,
      sourceRef: definition.task.sourceRef,
    },
    sourceRoot: "project",
    sources: definition.sources,
    task: definition.task,
    ...(definition.analysisRequirements
      ? { analysisRequirements: definition.analysisRequirements }
      : {}),
  }, null, 2)}\n`, "utf8")
  return inputPath
}

function splitFastApiTask(
  combined: AuthorizationTaskV0,
  publicTask: FastApiPublicTask,
  caseId: string,
): AuthorizationTaskV0 {
  const authoredObligationId = caseId === "fastapi-items-foreign-update"
    ? "deny-non-superuser-foreign-update"
    : "allow-superuser-foreign-read"
  const obligation = combined.obligations.find(candidate => candidate.id === authoredObligationId)
  const request = publicTask.tasks.find(candidate => candidate.caseId === caseId)?.request
  if (!obligation || !request) throw new Error(`FastAPI public task material is incomplete for ${caseId}.`)
  const entryIds = new Set(obligation.entryIds)
  return AuthorizationTaskV0Schema.parse({
    ...combined,
    taskId: caseId,
    request,
    principals: combined.principals.filter(candidate => candidate.id === obligation.principalId),
    entries: combined.entries.filter(candidate => entryIds.has(candidate.id)),
    obligations: [obligation],
  })
}

function splitRequirements(
  requirements: AnalysisRequirement[],
  authoredObligationId: string,
): AnalysisRequirement[] {
  const selected = requirements.filter(requirement => requirement.obligationIds.includes(authoredObligationId))
  const selectedIds = new Set(selected.map(requirement => requirement.id))
  return selected.map(requirement => ({
    ...requirement,
    obligationIds: [authoredObligationId],
    prerequisiteIds: requirement.prerequisiteIds.filter(id => selectedIds.has(id)),
  }))
}

async function loadCaseDefinitions(): Promise<{
  cases: OfflineCaseDefinition[]
  rubrics: AuthorizationCaseEvaluationRubricV2[]
  trustedHeader: RelationExample
}> {
  const manifest = await readJson(path.join(caseRoot, "manifest.json")) as CaseManifest
  const rubrics = AuthorizationEvaluationRubricsV2Schema.parse(
    await readJson(path.join(capabilityRoot, "evaluation-v2.json")),
  ).cases
  const trustedHeader = await readJson(
    path.join(capabilityRoot, "relation-examples", "trusted-header.json"),
  ) as RelationExample
  const fastApi = await readJson(
    path.join(capabilityRoot, "relation-examples", "fastapi-items.json"),
  ) as RelationExample
  const fastApiTask = AuthorizationTaskV0Schema.parse(fastApi.task)
  const fastApiRequirements = AnalysisRequirementsSchema.parse(fastApi.analysisRequirements)
  const fastApiPublicTask = await readJson(
    path.join(capabilityRoot, "second-project", "model-input", "task.json"),
  ) as FastApiPublicTask

  const originalCases = await Promise.all([
    "owui-process-file-write",
    "owui-process-text-controlled",
    "owui-trusted-header-deployment",
  ].map(async caseId => {
    const manifestCase = manifest.cases.find(candidate => candidate.id === caseId)
    if (!manifestCase) throw new Error(`Authorization manifest is missing ${caseId}.`)
    return {
      caseId,
      task: AuthorizationTaskV0Schema.parse(await readJson(path.join(declarationRoot, `${caseId}.json`))),
      ...(caseId === "owui-trusted-header-deployment"
        ? { analysisRequirements: AnalysisRequirementsSchema.parse(trustedHeader.analysisRequirements) }
        : {}),
      sourceBase: caseRoot,
      sources: manifestCase.allowedInputFiles,
    } satisfies OfflineCaseDefinition
  }))
  const fastApiSourceBase = path.join(capabilityRoot, "second-project", "model-input")
  const fastApiCases = [
    ["fastapi-items-foreign-update", "deny-non-superuser-foreign-update"],
    ["fastapi-items-superuser-read", "allow-superuser-foreign-read"],
  ] as const
  const splitFastApiCases: OfflineCaseDefinition[] = fastApiCases.map(([caseId, authoredObligationId]) => ({
    caseId,
    task: splitFastApiTask(fastApiTask, fastApiPublicTask, caseId),
    analysisRequirements: splitRequirements(fastApiRequirements, authoredObligationId),
    sourceBase: fastApiSourceBase,
    sources: ["task.json", "items.py"],
  }))
  return { cases: [...originalCases, ...splitFastApiCases], rubrics, trustedHeader }
}

function mockProvider(
  loaded: Extract<LocalInputResult, { status: "valid" }>,
  conclusionFor: (obligationId: string) => AuthorizationResultV0["results"][number]["conclusion"],
  calls: { value: number },
): LLMProvider {
  const compiled = compileAuthorizationTask(loaded.task)
  const catalogResult = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!catalogResult.success) throw new Error("Offline fixture source catalog must be valid.")
  const resultIndexByObligation = new Map<string, number>()
  const results = compiled.runnableObligations.map((obligation, index) => {
    resultIndexByObligation.set(obligation.id, index)
    const location = obligation.entry?.locations[0]
    const source = catalogResult.catalog.sources.find(candidate => candidate.relativePath === location?.path)
    if (!location || !source) throw new Error(`No explicit source location for ${obligation.id}.`)
    const line = Math.max(location.startLine, source.cropRange.startLine)
    const citation = { sourceId: source.sourceId, startLine: line, endLine: line }
    const fact = (statement: string) => [{ statement, citations: [citation] }]
    const conclusion = conclusionFor(obligation.id)
    return {
      obligationId: obligation.id,
      conclusion,
      explanation: `Offline mock disposes ${obligation.id} only to exercise the shared delivery path.`,
      facts: {
        entry: fact("The declared entry is present in the fixed source."),
        binding: fact("The declared principal binding is represented by the fixed source."),
        control: fact("The fixed source contains the control considered by this mock."),
        effect: fact("The fixed source contains the declared effect path."),
        condition: fact("The fixed source anchors the declared condition."),
      },
      decisiveMissingFacts: conclusion === "unknown"
        ? ["The actual deployment fact is absent from the fixed source."]
        : [],
      suggestedObservations: conclusion === "unknown"
        ? ["Inspect the authorized deployment configuration without contacting it from this run."]
        : [],
    }
  })
  const coverage = loaded.analysisPlan.entries.map(entry => {
    const resultIndex = resultIndexByObligation.get(entry.obligationId)
    if (resultIndex === undefined) throw new Error(`No mock result for ${entry.obligationId}.`)
    return {
      requirementId: entry.requirementId,
      obligationId: entry.obligationId,
      status: "addressed" as const,
      explanation: "The offline mock points at a source-backed fact to exercise coverage validation.",
      factPointers: [`/results/${resultIndex}/facts/control/0`],
    }
  })
  const wire = {
    schemaVersion: "source-authorization-assessment-wire/v2",
    results,
    scopeClaim: {
      kind: "declared-obligations-only",
      statement: "This offline mock covers only the declared obligations and makes no repository-wide claim.",
    },
    coverage,
  }
  const response: LLMResponse = {
    text: "",
    toolCalls: [{ id: "offline-capability-result", name: "submit_authorization_result", arguments: wire }],
    tokens: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0,
    durationMs: 1,
    stopReason: "tool_use",
  }
  return {
    name: "authorization-capability-offline-mock",
    async complete() {
      calls.value += 1
      return response
    },
    async completeWithToolResults() {
      throw new Error("The authorization result tool is an output container, not an executable tool.")
    },
  }
}

describe("authorization capability offline panel", () => {
  it("passes five cross-project tasks through parser, ledger, source, host, coverage, and evaluator entry", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-capability-panel-"))
    cleanupRoots.push(root)
    const definitions = await loadCaseDefinitions()
    expect(definitions.cases.map(candidate => candidate.caseId)).toEqual(definitions.rubrics.map(rubric => rubric.caseId))

    for (const definition of definitions.cases) {
      const rubric = definitions.rubrics.find(candidate => candidate.caseId === definition.caseId)
      if (!rubric) throw new Error(`Evaluator rubric is missing ${definition.caseId}.`)
      const inputPath = await materializeLocalInput(root, definition)
      const loaded = await loadLocalAuthorizationInput(inputPath)
      expect(loaded.status).toBe("valid")
      if (loaded.status !== "valid") continue
      const calls = { value: 0 }
      const run = await runAuthorizationTask({
        task: loaded.task,
        sourceBundle: loaded.sourceBundle,
        analysisRequirements: loaded.analysisRequirements,
        provider: mockProvider(loaded, () => rubric.expectedDisposition, calls),
        arm: "D",
        options: {
          timeoutMs: 1_000,
          unitTimeoutMs: 5_000,
          maxTokens: 6_000,
          maxProviderDispatches: 4,
          maxDomainRepairs: 1,
        },
      })
      expect(run.status).toBe("completed")
      expect(calls.value).toBe(1)
      expect(run.analysisPlan?.status).toBe("ready")
      expect(run.initial?.normalization?.normalizerVersion).toBe("authorization-wire-normalizer/v2")
      expect(run.initial?.coverageValidation).toEqual(expect.objectContaining({
        status: "valid",
        declared: loaded.analysisPlan.entries.length,
      }))
      if (!run.initial) throw new Error(`Offline host did not deliver ${definition.caseId}.`)
      const review = createAuthorizationReviewTemplateV2(
        rubric,
        run.initial,
        "initial",
        "authorization-capability-offline-wiring",
      )
      const evaluated = evaluateAuthorizationGenerationV2({
        rubric,
        sourceBundle: loaded.sourceBundle,
        artifact: run.initial,
        generation: "initial",
        review,
      })
      expect(evaluated).toEqual(expect.objectContaining({
        evaluationVersion: "authorization-evaluation/v2",
        caseId: definition.caseId,
        labelCorrect: true,
        transportValid: true,
        deliveryComplete: true,
        qualityStatus: "needs-review",
      }))
      expect(evaluated.reviewValidation.status).toBe("valid")
    }
  })

  it("makes four synthetic structural changes visible without treating them as new project evidence", async () => {
    const { trustedHeader } = await loadCaseDefinitions()
    const task = AuthorizationTaskV0Schema.parse(trustedHeader.task)
    const requirements = AnalysisRequirementsSchema.parse(trustedHeader.analysisRequirements)
    const original = compileAnalysisRequirements(task, requirements)
    expect(original).toEqual(expect.objectContaining({ status: "ready", diagnostics: [] }))

    const requirementDeleted = compileAnalysisRequirements(
      task,
      requirements.filter(requirement => requirement.id !== "header.session-resource"),
    )
    expect(requirementDeleted.status).toBe("partial")
    expect(requirementDeleted.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining([
      "unknown-prerequisite",
      "prerequisite-unavailable",
    ]))
    expect(requirementDeleted.entries.some(entry => entry.requirementId === "header.session-resource")).toBe(false)

    const reversedControl = structuredClone(task)
    reversedControl.obligations[0]!.conditions[0] = {
      name: "password-auth-signin-entry-disabled",
      basis: "Synthetic reversal: the bounded task fixes the password-auth sign-in gate as disabled.",
    }
    const reversedPlan = compileAnalysisRequirements(reversedControl, requirements)
    expect(reversedPlan).toEqual(expect.objectContaining({ status: "ready", diagnostics: [] }))
    expect(reversedPlan.entries).toEqual(original.entries)
    const reversedRender = renderAuthorizationTask(
      compileAuthorizationTask(reversedControl),
      "D",
      reversedPlan,
    )
    expect(reversedRender.sections.declaration).toContain("password-auth-signin-entry-disabled")
    expect(reversedRender.sections.declaration).not.toContain("password-auth-signin-entry-enabled")

    const withoutProvisioning = compileAnalysisRequirements(
      task,
      requirements.filter(requirement => requirement.id !== "header.optional-provisioning"),
    )
    expect(withoutProvisioning).toEqual(expect.objectContaining({ status: "ready", diagnostics: [] }))
    expect(withoutProvisioning.entries).toHaveLength(original.entries.length - 1)
    expect(withoutProvisioning.entries.some(entry => entry.requirementId === "header.optional-provisioning")).toBe(false)

    const deploymentEntry = original.entries.find(
      entry => entry.requirementId === "header.deployment-assumptions",
    )
    expect(deploymentEntry).toEqual(expect.objectContaining({
      kind: "external-assumption",
      applicability: "required",
      status: "pending",
    }))
    expect(deploymentEntry?.question).toContain("actual configuration")
    expect(deploymentEntry && "answer" in deploymentEntry).toBe(false)
  })

  it("copies the ordinary example to a temporary directory and completes check, mock run, and offline inspect", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-ordinary-rehearsal-"))
    cleanupRoots.push(root)
    const ordinaryRoot = path.join(root, "ordinary-project")
    await cp(exampleRoot, ordinaryRoot, { recursive: true })
    const inputPath = path.join(ordinaryRoot, "assessment.json")
    const outRoot = path.join(ordinaryRoot, "output")
    const output: string[] = []
    const calls = { factory: 0, provider: 0 }
    const dependencies: LocalAuthorizationCliDependencies = {
      stdout: value => output.push(value),
      stderr: value => output.push(value),
      env: {},
      providerFactory: async () => {
        calls.factory += 1
        const loaded = await loadLocalAuthorizationInput(inputPath)
        if (loaded.status !== "valid") throw new Error("Copied ordinary example must load.")
        return mockProvider(loaded, () => "source_refuted", { get value() { return calls.provider }, set value(value) { calls.provider = value } })
      },
    }

    expect(await runLocalAuthorizationCli([
      "check",
      `--input=${inputPath}`,
      "--arm=D",
    ], dependencies)).toBe(0)
    expect(calls).toEqual({ factory: 0, provider: 0 })

    expect(await runLocalAuthorizationCli([
      "run",
      `--input=${inputPath}`,
      "--model=mock/offline",
      `--out=${outRoot}`,
      "--arm=D",
    ], dependencies)).toBe(0)
    expect(calls).toEqual({ factory: 1, provider: 1 })
    const runReport = JSON.parse(output.at(-1)!) as { sessionId: string; sessionPath: string; status: string }
    expect(runReport.status).toBe("completed")

    let inspectCreatedProvider = false
    expect(await runLocalAuthorizationCli(["inspect", `--out=${outRoot}`], {
      stdout: value => output.push(value),
      stderr: value => output.push(value),
      providerFactory: async () => {
        inspectCreatedProvider = true
        throw new Error("inspect must stay offline")
      },
    })).toBe(0)
    expect(inspectCreatedProvider).toBe(false)
    expect(JSON.parse(output.at(-1)!)).toEqual(expect.objectContaining({
      sessionId: runReport.sessionId,
      status: "completed",
    }))

    const retained = [
      await readFile(path.join(runReport.sessionPath, "input.json"), "utf8"),
      await readFile(path.join(runReport.sessionPath, "preview.md"), "utf8"),
      await readFile(path.join(runReport.sessionPath, "run.json"), "utf8"),
    ].join("\n").toLowerCase()
    expect(retained).not.toContain(path.join(repositoryRoot, "results", "skill-ir").toLowerCase())
    expect(retained).not.toContain("case manifest")
    expect(retained).not.toContain("oracle")
  })
})
