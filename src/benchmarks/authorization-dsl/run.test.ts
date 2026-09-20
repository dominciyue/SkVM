import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { LLMProvider, LLMResponse } from "../../providers/types.ts"
import type { AuthorizationResultV0, AuthorizationTaskV0 } from "../../task-dsl/authorization/schema.ts"
import {
  AuthorizationEvaluationRubricsV0Schema,
  createAuthorizationReviewTemplate,
  type AuthorizationSemanticReviewV0,
} from "./evaluate.ts"
import type { SourceBundle } from "./inputs.ts"
import {
  checkAuthorizationComparison,
  evaluateAuthorizationRunDirectory,
  executeAuthorizationComparison,
  loadAuthorizationComparisonConfig,
  runAuthorizationCli,
} from "./run.ts"

const repositoryRoot = path.resolve(import.meta.dir, "../../..")
const configPath = path.join(
  repositoryRoot,
  "results",
  "skill-ir",
  "skill-dsl-research",
  "development",
  "authorization-v0",
  "comparison-config.json",
)
const cleanupRoots: string[] = []

afterEach(async () => {
  while (cleanupRoots.length > 0) {
    await rm(cleanupRoots.pop()!, { recursive: true, force: true })
  }
})

function resultFor(
  task: AuthorizationTaskV0,
  sourceBundle: SourceBundle,
  obligationId: string,
  conclusion: AuthorizationResultV0["results"][number]["conclusion"],
): AuthorizationResultV0 {
  const firstFile = sourceBundle.files[0]!
  const quote = firstFile.content.split(/\r?\n/)[0]!
  const cite = (statement: string) => [{
    statement,
    citations: [{
      path: firstFile.relativePath,
      startLine: 1,
      endLine: 1,
      quote,
    }],
  }]
  return {
    schemaVersion: "source-authorization-assessment-result/v0",
    taskId: task.taskId,
    repository: task.repository,
    sourceRef: task.sourceRef,
    results: [{
      obligationId,
      conclusion,
      explanation: "Mock fixed-context output for the offline runner rehearsal.",
      facts: {
        entry: cite("Mock entry evidence."),
        binding: cite("Mock binding evidence."),
        control: cite("Mock control evidence."),
        effect: cite("Mock effect evidence."),
        condition: cite("Mock condition evidence."),
      },
      decisiveMissingFacts: conclusion === "unknown" ? ["Actual deployment facts are absent."] : [],
      suggestedObservations: conclusion === "unknown" ? ["Inspect the deployment configuration without contacting it in this study."] : [],
    }],
    scopeClaim: {
      kind: "declared-obligations-only",
      statement: "Only the declared fixed-context obligation is assessed; discovery is not tested.",
    },
  }
}

function responseFor(result: AuthorizationResultV0): LLMResponse {
  return {
    text: "",
    toolCalls: [{ id: "mock-result", name: "submit_authorization_result", arguments: result as unknown as Record<string, unknown> }],
    tokens: { input: 100, output: 40, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.002,
    durationMs: 12,
    stopReason: "tool_use",
  }
}

async function markReviewSupported(file: string): Promise<void> {
  const review = JSON.parse(await readFile(file, "utf8")) as AuthorizationSemanticReviewV0
  for (const fact of review.factReviews) {
    fact.status = "supported"
    fact.reason = "The mock rehearsal explicitly treats this evaluator fact as supported."
    fact.answerLocation = "/results/0"
  }
  review.dispositionReview.status = "supported"
  review.dispositionReview.reason = "The mock disposition follows the injected rubric outcome."
  review.dispositionReview.answerLocation = "/results/0/conclusion"
  review.scopeReview.status = "supported"
  review.scopeReview.reason = "The mock answer explicitly limits scope to declared obligations."
  review.scopeReview.answerLocation = "/scopeClaim"
  await writeFile(file, `${JSON.stringify(review, null, 2)}\n`, "utf8")
}

describe("authorization comparison development runner", () => {
  it("loads the frozen comparison order and checks all previews without initializing a provider", async () => {
    const loaded = await loadAuthorizationComparisonConfig(repositoryRoot, configPath)
    expect(loaded.config.caseOrder).toEqual([
      "owui-process-file-write",
      "owui-process-text-controlled",
      "owui-trusted-header-deployment",
    ])
    expect(loaded.config.units.map(unit => unit.arm)).toEqual(["B", "D", "D", "B", "B", "D"])
    expect(loaded.config.model).toEqual(expect.objectContaining({
      modelId: "xty/gpt-5.6-sol",
      autoProbe: false,
      contextLimitStatus: "provider-not-reported",
    }))

    let providerCreated = false
    const checked = await checkAuthorizationComparison({
      repositoryRoot,
      configPath,
      writeArtifacts: false,
      onProviderCreation: () => { providerCreated = true },
    })

    expect(checked.status).toBe("valid")
    expect(checked.cases).toHaveLength(3)
    expect(checked.cases.flatMap(candidate => Object.keys(candidate.previews))).toHaveLength(6)
    expect(checked.cases.every(candidate => candidate.files.every(file => file.startsWith("inputs/")))).toBe(true)
    for (const candidate of checked.cases) {
      for (const entry of candidate.declaration.entries) {
        for (const location of entry.locations) {
          const file = candidate.sourceBundle.files.find(item => item.relativePath === location.path)
          expect(file).toBeDefined()
          expect(location.startLine).toBeGreaterThanOrEqual(file!.cropRange.startLine)
          expect(location.endLine).toBeLessThanOrEqual(file!.cropRange.endLine)
        }
      }
    }
    expect(checked.diagnostics).toEqual([])
    expect(providerCreated).toBe(false)
  })

  it("runs six mock units once, resumes without resending, and evaluates three pairs offline", async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "skvm-authorization-runner-"))
    cleanupRoots.push(temporaryRoot)
    const runDir = path.join(temporaryRoot, "mock-run")
    const checked = await checkAuthorizationComparison({ repositoryRoot, configPath, writeArtifacts: false })
    expect(checked.status).toBe("valid")

    const rubricsRaw = JSON.parse(await readFile(path.join(
      repositoryRoot,
      "results/skill-ir/skill-dsl-research/development/authorization-v0/evaluation/rubrics.json",
    ), "utf8"))
    const rubrics = AuthorizationEvaluationRubricsV0Schema.parse(rubricsRaw)
    const rubricByCase = new Map(rubrics.cases.map(rubric => [rubric.caseId, rubric]))
    const caseById = new Map(checked.cases.map(candidate => [candidate.caseId, candidate]))
    const loadedConfig = await loadAuthorizationComparisonConfig(repositoryRoot, configPath)
    const responses = loadedConfig.config.units.map(unit => {
      const candidate = caseById.get(unit.caseId)!
      const candidateRubric = rubricByCase.get(unit.caseId)!
      return responseFor(resultFor(
        candidate.declaration,
        candidate.sourceBundle,
        candidateRubric.obligationId,
        candidateRubric.expectedDisposition,
      ))
    })

    let providerFactoryCalls = 0
    let providerCalls = 0
    const env: Record<string, string | undefined> = {}
    const providerFactory = async (): Promise<LLMProvider> => {
      providerFactoryCalls += 1
      expect(env.SKVM_AUTO_PROBE).toBe("0")
      expect(env.SKVM_CACHE?.replace(/\\/g, "/")).toEndWith("/.skvm")
      let responseIndex = 0
      return {
        name: "offline-sequence-provider",
        async complete() {
          providerCalls += 1
          return responses[responseIndex++]!
        },
        async completeWithToolResults() {
          throw new Error("The runner must not execute tool results.")
        },
      }
    }

    const first = await executeAuthorizationComparison({
      repositoryRoot,
      configPath,
      runDir,
      attempt: { id: "mock-rehearsal", reason: "V7 offline injected-provider rehearsal" },
      providerFactory,
      env,
    })
    expect(first.status).toBe("completed")
    expect(first.units).toHaveLength(6)
    expect(first.units.every(unit => unit.status === "completed")).toBe(true)
    expect(providerFactoryCalls).toBe(1)
    expect(providerCalls).toBe(6)

    const second = await executeAuthorizationComparison({
      repositoryRoot,
      configPath,
      runDir,
      attempt: { id: "mock-rehearsal", reason: "resume check" },
      providerFactory,
      env,
    })
    expect(second.units.every(unit => unit.status === "skipped-terminal")).toBe(true)
    expect(providerFactoryCalls).toBe(1)
    expect(providerCalls).toBe(6)

    for (const unit of loadedConfig.config.units) {
      const unitDirectory = path.join(runDir, "units", unit.id)
      const serializedRun = JSON.parse(await readFile(path.join(unitDirectory, "run.json"), "utf8")) as {
        initial: Parameters<typeof createAuthorizationReviewTemplate>[1]
      }
      const candidateRubric = rubricByCase.get(unit.caseId)!
      const template = createAuthorizationReviewTemplate(
        candidateRubric,
        serializedRun.initial,
        "initial",
        "codex-mock-reviewer",
      )
      const reviewPath = path.join(unitDirectory, "review.initial.json")
      await writeFile(reviewPath, `${JSON.stringify(template, null, 2)}\n`, "utf8")
      await markReviewSupported(reviewPath)
    }

    let evaluateProviderCalled = false
    const evaluated = await evaluateAuthorizationRunDirectory({ repositoryRoot, configPath, runDir })
    expect(evaluated.status).toBe("completed")
    expect(evaluated.units).toHaveLength(6)
    expect(evaluated.pairs).toHaveLength(3)
    expect(evaluated.units.every(unit => unit.summary.finalQuality === "full-success")).toBe(true)

    const stdout: string[] = []
    const exitCode = await runAuthorizationCli([
      "evaluate",
      `--config=${configPath}`,
      `--run-dir=${runDir}`,
    ], {
      repositoryRoot,
      stdout: value => stdout.push(value),
      stderr: value => stdout.push(value),
      providerFactory: async () => {
        evaluateProviderCalled = true
        throw new Error("offline command must not initialize a provider")
      },
      env,
    })
    expect(exitCode).toBe(0)
    expect(evaluateProviderCalled).toBe(false)
    expect(stdout.join("\n")).toContain('"status": "completed"')
  })

  it("shows help and parameter diagnostics without touching provider configuration", async () => {
    let providerCreated = false
    const output: string[] = []
    const dependencies = {
      repositoryRoot,
      stdout: (value: string) => output.push(value),
      stderr: (value: string) => output.push(value),
      providerFactory: async () => {
        providerCreated = true
        throw new Error("not expected")
      },
      env: {} as Record<string, string | undefined>,
    }

    expect(await runAuthorizationCli(["--help"], dependencies)).toBe(0)
    expect(output.join("\n")).toContain("check")
    expect(providerCreated).toBe(false)

    output.length = 0
    expect(await runAuthorizationCli(["unknown-command"], dependencies)).toBe(2)
    expect(output.join("\n")).toContain("Unknown command")
    expect(providerCreated).toBe(false)
  })
})
