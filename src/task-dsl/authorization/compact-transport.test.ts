import { expect, it } from "bun:test"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../benchmarks/authorization-dsl/local-input.ts"
import { buildAuthorizationSourceCatalog } from "../../benchmarks/authorization-dsl/inputs.ts"
import { runAuthorizationTask } from "../../benchmarks/authorization-dsl/host.ts"
import { compileAuthorizationTask } from "./semantics.ts"
import { compileConditionAnalysisRequest } from "./conditions.ts"
import { compileAnalysisRequirements } from "./relations.ts"
import { normalizeCompactAuthorizationResult, compactAuthorizationSchema } from "./compact-transport.ts"

async function fixture() {
  const loaded = await loadLocalAuthorizationInput(path.resolve(import.meta.dir, "../../../examples/authorization-assessment/assessment.json"))
  if (loaded.status !== "valid") throw new Error("Fixture invalid")
  const compiled = compileAuthorizationTask(loaded.task)
  const built = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!built.success) throw new Error("Catalog invalid")
  const obligationId = compiled.runnableObligations[0]!.id
  const requirements = loaded.analysisRequirements.slice(0, 1)
  const analysisPlan = compileAnalysisRequirements(loaded.task, requirements)
  const request = { schemaVersion: "authorization-condition-analysis-request/v1" as const, requests: [{ obligationId: loaded.task.obligations[0]!.id, conditionBindings: [{ id: "authenticated", name: "authenticated" }], maxBranches: 2 }] }
  const conditionPlan = compileConditionAnalysisRequest(loaded.task, request)
  const wire = { results: [{ obligationId, conclusion: "source_refuted", explanation: "The control denies the unauthorized archive.",
    facts: ["entry", "binding", "control", "effect", "condition"].map((kind, i) => ({ id: `f${i}`, kind, statement: `Visible ${kind} fact.`, citations: [{ sourceId: built.catalog.sources[0]!.sourceId, startLine: 11 + i, endLine: 11 + i }] })),
    decisiveMissingFacts: [], suggestedObservations: [],
    coverage: [{ requirementId: requirements[0]!.id, status: "addressed", explanation: "Answered by the fact.", factIds: ["f2"] }],
    condition: { branches: [{ id: "b1", assumptions: [{ conditionId: "authenticated", value: "true" }], effect: "blocked", explanation: "Control blocks.", factIds: ["f2"], missingFacts: [] }], unexaminedConditionIds: [], completeness: "bounded", limitations: [] },
  }] }
  const normalize = (value: unknown) => normalizeCompactAuthorizationResult({ compiled, sourceBundle: loaded.sourceBundle, method: "conditions", analysisPlan, conditionPlan, input: value })
  return { loaded, compiled, request, requirements, wire, normalize }
}

it("binds compact facts by scoped ID independent of order and fills only mechanical metadata", async () => {
  const { wire, normalize } = await fixture()
  const first = normalize(wire)
  expect(first.status).toBe("valid")
  expect(first.result?.results[0]?.facts.control[0]?.statement).toBe("Visible control fact.")
  expect(first.coverage?.[0]?.factPointers).toEqual(["/results/0/facts/control/0"])
  wire.results[0]!.facts.reverse()
  expect(normalize(wire).result).toEqual(first.result)
  expect(first.conditionValidation?.semanticSupport).toBe("unreviewed")
  expect(compactAuthorizationSchema("plain").safeParse({ results: wire.results.map(({ coverage, condition, ...item }) => item) }).success).toBe(true)
  expect(compactAuthorizationSchema("plain").safeParse(wire).success).toBe(false)
})

it("rejects duplicate, missing and foreign fact IDs, bad sources/ranges, unknown gaps and omitted/conflicting conditions", async () => {
  const { wire, normalize } = await fixture()
  const mutations = [
    (x: any) => { x.results[0].facts[1].id = "f0" },
    (x: any) => { delete x.results[0].facts[0].id },
    (x: any) => { x.results[0].coverage[0].factIds = ["foreign-obligation/f2"] },
    (x: any) => { x.results[0].facts[0].citations[0].sourceId = "foreign" },
    (x: any) => { x.results[0].facts[0].citations[0].endLine = 99999 },
    (x: any) => { x.results[0].conclusion = "unknown" },
    (x: any) => { x.results[0].condition.branches[0].assumptions = [{ conditionId: "foreign", value: "true" }] },
    (x: any) => { x.results[0].condition.branches[0].assumptions.push({ conditionId: "authenticated", value: "false" }) },
  ]
  for (const mutate of mutations) {
    const input = structuredClone(wire); mutate(input)
    const result = normalize(input)
    expect(result.status).toBe("invalid")
    expect(result.diagnostics.length).toBeGreaterThan(0)
  }
})

it("sends the method-specific compact schema through the actual provider extraction path", async () => {
  const { loaded, request, requirements, wire } = await fixture()
  let captured: any
  const run = await runAuthorizationTask({ task: loaded.task, sourceBundle: loaded.sourceBundle, analysisRequirements: requirements, conditionAnalysisRequest: request, arm: "B", wireVersion: "v4", options: { timeoutMs: 1000, maxTokens: 6000, maxDomainRepairs: 1 }, provider: {
    name: "compact-capture", async complete(params) { captured = params; return { text: "", toolCalls: [{ id: "answer", name: "submit_authorization_result", arguments: wire }], tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, durationMs: 1, stopReason: "tool_use" } }, async completeWithToolResults() { throw new Error("No executor") },
  } })
  expect(Object.keys(captured.tools[0].inputSchema.properties)).toEqual(["results"])
  expect(captured.tools[0].inputSchema.properties.results.items.properties.facts.type).toBe("array")
  expect(run.status).toBe("completed")
  expect(run.firstResponse?.schemaValid).toBe(true)
  expect(run.firstResponse?.deliveryComplete).toBe(true)
  expect(run.renderedPrompt).not.toContain("using /results/<index>")
})
