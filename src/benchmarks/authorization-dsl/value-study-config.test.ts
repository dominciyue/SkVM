import { afterEach, describe, expect, it } from "bun:test"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { CompletionParams, LLMProvider, LLMResponse } from "../../providers/types.ts"
import {
  AuthorizationValueStudyExperimentConfigSchema,
  executeAuthorizationValueStudyExperiment,
} from "./value-study.ts"

const repositoryRoot = path.resolve(import.meta.dir, "../../..")
const configRelativePath = "results/skill-ir/skill-dsl-research/development/authorization-transfer-value-v1/study/experiment-config-v1.json"
const cleanupRoots: string[] = []

afterEach(async () => {
  while (cleanupRoots.length > 0) await rm(cleanupRoots.pop()!, { recursive: true, force: true })
})

async function copyRepositoryFile(root: string, relativePath: string): Promise<void> {
  const destination = path.join(root, ...relativePath.split("/"))
  await mkdir(path.dirname(destination), { recursive: true })
  await copyFile(path.join(repositoryRoot, ...relativePath.split("/")), destination)
}

function schemaProperties(params: CompletionParams): Record<string, unknown> {
  const schema = params.tools?.[0]?.inputSchema as { properties?: Record<string, unknown> } | undefined
  return schema?.properties ?? {}
}

function parseCoveragePairs(prompt: string): Array<{ requirementId: string; obligationId: string }> {
  const block = prompt.split("Exact analysis coverage pairs (closed list):\n")[1]?.split("\nReturn one conditionAnalysis")[0]
    ?? prompt.split("Exact analysis coverage pairs (closed list):\n")[1]?.split("\nSupport the conclusion")[0]
    ?? ""
  return [...block.matchAll(/^- (.+?) @ (.+?) \((?:required|when-present)\)$/gm)].map(match => ({
    requirementId: match[1]!,
    obligationId: match[2]!,
  }))
}

function mockProvider(counter: { calls: number }): LLMProvider {
  return {
    name: "authorization-value-study-config-mock",
    async complete(params) {
      counter.calls += 1
      const prompt = params.messages[0]?.content ?? ""
      const sourceId = prompt.match(/Source ID: ([^\n]+)/)?.[1]
      const firstLine = Number(prompt.match(/Location note: crop lines (\d+)-/)?.[1] ?? "1")
      const obligationBlock = prompt.split("Exact runnable obligation IDs (closed list):\n")[1]
        ?.split("\nUse each exact expanded ID")[0] ?? ""
      const obligationIds = [...obligationBlock.matchAll(/^- (.+)$/gm)].map(match => match[1]!)
      if (!sourceId || obligationIds.length === 0) throw new Error("Frozen study prompt lacks its source or obligation identity.")
      const cite = (statement: string) => [{
        statement,
        citations: [{ sourceId, startLine: firstLine, endLine: firstLine }],
      }]
      const results = obligationIds.map(obligationId => ({
        obligationId,
        conclusion: "unknown",
        explanation: "The mechanical mock preserves the bounded question without making a semantic study claim.",
        facts: {
          entry: cite("The mock binds the declared entry to an allowed source line."),
          binding: cite("The mock binds the principal to an allowed source line."),
          control: cite("The mock records an allowed control citation without claiming semantic support."),
          effect: cite("The mock records an allowed effect citation without claiming semantic support."),
          condition: cite("The mock records an allowed condition citation without claiming semantic support."),
        },
        decisiveMissingFacts: ["Semantic truth is intentionally not supplied by this mechanical dry-run."],
        suggestedObservations: ["Use the frozen evaluator only after real generation has completed."],
      }))
      const properties = schemaProperties(params)
      const hasCoverage = properties.coverage !== undefined
      const hasConditions = properties.conditionAnalysis !== undefined
      const coverage = parseCoveragePairs(prompt).map(pair => ({
        ...pair,
        status: "unknown",
        explanation: "The mechanical mock does not decide this public analysis question.",
        factPointers: [],
      }))
      const conditionPlanText = prompt.split("## Condition analysis request\n")[1]?.split("\n\n## Result contract")[0]
      const conditionPlan = conditionPlanText
        ? JSON.parse(conditionPlanText) as { entries: Array<{ obligationId: string; conditions: Array<{ id: string }> }> }
        : undefined
      const conditionAnalysis = conditionPlan
        ? {
            schemaVersion: "authorization-condition-analysis-result/v1",
            analyses: conditionPlan.entries.map((entry, index) => ({
              obligationId: entry.obligationId,
              branches: [{
                id: `mechanical-unknown-${index + 1}`,
                obligationId: entry.obligationId,
                assumptions: entry.conditions.map(condition => ({ conditionId: condition.id, value: "unknown" })),
                effect: "unknown",
                explanation: "The mock exercises condition transport without making a source-semantic claim.",
                factPointers: [],
                missingFacts: ["A real model answer and semantic review are intentionally absent."],
              }],
              unexaminedConditionIds: [],
              completeness: "bounded",
              limitations: ["This is a transport-only dry-run, not a quality result."],
            })),
          }
        : undefined
      const wire = {
        schemaVersion: hasConditions
          ? "source-authorization-assessment-wire/v3"
          : hasCoverage
            ? "source-authorization-assessment-wire/v2"
            : "source-authorization-assessment-wire/v1",
        results,
        scopeClaim: {
          kind: "declared-obligations-only",
          statement: "The mechanical dry-run is bounded to the declared obligations and does not test discovery.",
        },
        ...(hasCoverage ? { coverage } : {}),
        ...(hasConditions ? { conditionAnalysis } : {}),
      }
      return {
        text: "",
        toolCalls: [{ id: `mock-result-${counter.calls}`, name: "submit_authorization_result", arguments: wire }],
        tokens: { input: 100, output: 50, cacheRead: 25, cacheWrite: 0 },
        durationMs: 1,
        stopReason: "tool_use",
      } satisfies LLMResponse
    },
    async completeWithToolResults() {
      throw new Error("The output schema tool must never execute.")
    },
  }
}

describe("frozen authorization value-study config", () => {
  it("runs all 15 rotated units mechanically without evaluator exposure or target execution", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skvm-authorization-value-config-"))
    cleanupRoots.push(root)
    const configBytes = await readFile(path.join(repositoryRoot, ...configRelativePath.split("/")), "utf8")
    const config = AuthorizationValueStudyExperimentConfigSchema.parse(JSON.parse(configBytes))
    await mkdir(path.dirname(path.join(root, ...configRelativePath.split("/"))), { recursive: true })
    await writeFile(path.join(root, ...configRelativePath.split("/")), configBytes, "utf8")

    const files = new Set<string>()
    for (const candidate of config.cases) {
      files.add(candidate.task)
      files.add(candidate.conditionAnalysisRequest)
      if (candidate.analysisRequirements.kind === "file") files.add(candidate.analysisRequirements.path)
      for (const source of candidate.sources) files.add(`${candidate.sourceRoot}/${source}`)
    }
    for (const relativePath of files) await copyRepositoryFile(root, relativePath)
    const evaluatorPath = path.join(root, ...config.paths.evaluatorRubrics.split("/"))
    await mkdir(path.dirname(evaluatorPath), { recursive: true })
    await writeFile(evaluatorPath, "{}\n", "utf8")

    const counter = { calls: 0 }
    const provider = mockProvider(counter)
    const report = await executeAuthorizationValueStudyExperiment({
      repositoryRoot: root,
      configPath: configRelativePath,
      providerFactory: async () => provider,
      env: {},
    })

    expect(report.status).toBe("completed")
    expect(report.units).toHaveLength(15)
    expect(counter.calls).toBe(15)
    expect(report.units.map(unit => unit.studyArm)).toEqual([
      "P", "L", "C",
      "L", "C", "P",
      "C", "P", "L",
      "P", "L", "C",
      "L", "C", "P",
    ])
    expect(report.units.every(unit => unit.renderArm === "B" && unit.status === "completed")).toBe(true)

    const runRoot = path.join(root, ...config.paths.runRoot.split("/"))
    for (const unit of report.units) {
      const stored = JSON.parse(await readFile(path.join(runRoot, "units", unit.id, "unit-result.json"), "utf8"))
      const preview = await readFile(path.join(stored.report.sessionPath, "preview.md"), "utf8")
      expect(preview).not.toContain(config.paths.evaluatorRubrics)
      if (unit.studyArm === "P") {
        expect(preview).toContain("## Public analysis questions")
        expect(preview).not.toContain("## Analysis requirement ledger")
      } else {
        expect(preview).toContain("## Analysis requirement ledger")
      }
      expect(preview.includes("## Condition analysis request")).toBe(unit.studyArm === "C")
    }
  })
})
