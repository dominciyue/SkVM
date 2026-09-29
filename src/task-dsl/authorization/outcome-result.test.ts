import { expect, test } from "bun:test"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../benchmarks/authorization-dsl/local-input.ts"
import { buildAuthorizationSourceCatalog } from "../../benchmarks/authorization-dsl/inputs.ts"
import { compileAuthorizationTask } from "./semantics.ts"
import { assessmentConditionId } from "./assessment-contract.ts"
import { compileAuthorizationAssessmentProgram } from "./assessment-program.ts"
import { conclusionFromObservedDecision, normalizeOutcomeAuthorizationResult, outcomeAuthorizationSchema, summarizeObservedPolicy } from "./outcome-result.ts"

test("compares an observed effect with the authored expectation", () => {
  expect(conclusionFromObservedDecision("allow", "allow")).toBe("source_refuted")
  expect(conclusionFromObservedDecision("deny", "deny")).toBe("source_refuted")
  expect(conclusionFromObservedDecision("allow", "deny")).toBe("source_supported_failure")
  expect(conclusionFromObservedDecision("deny", "allow")).toBe("source_supported_failure")
  expect(conclusionFromObservedDecision("allow", "unknown")).toBe("unknown")
  expect(conclusionFromObservedDecision("deny", "unknown")).toBe("unknown")
})

test("current policy summary covers four known comparisons and an unknown without changing model evidence", () => {
  expect(summarizeObservedPolicy("allow", "allow").status).toBe("satisfied")
  expect(summarizeObservedPolicy("deny", "deny").status).toBe("satisfied")
  expect(summarizeObservedPolicy("allow", "deny").status).toBe("violated")
  expect(summarizeObservedPolicy("deny", "allow").status).toBe("violated")
  expect(summarizeObservedPolicy("deny", "unknown").status).toBe("undetermined")
})

async function fixture(expectation: "allow" | "deny" | "conditional" = "deny", withBranch = false) {
  const loaded = await loadLocalAuthorizationInput(path.resolve(import.meta.dir, "../../../examples/authorization-assessment/assessment.json"))
  if (loaded.status !== "valid") throw Error("fixture")
  loaded.task.obligations[0]!.expectation = expectation
  const compiled = compileAuthorizationTask(loaded.task)
  const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!catalog.success) throw Error("catalog")
  const obligationId = compiled.runnableObligations[0]!.id
  const authorObligationId = loaded.task.obligations[0]!.id
  const conditionId = assessmentConditionId(authorObligationId, "authenticated")
  const program = withBranch ? compileAuthorizationAssessmentProgram(loaded.task, {
    schemaVersion: "authorization-analysis-contract/v1",
    scenarios: [{ obligationId: authorObligationId, boundary: "declared-entry", premises: [], requestedBranches: [{ id: "auth-off", kind: "counterfactual", assumptions: [{ conditionId, value: "false" }] }], requiredResponseDetails: [] }],
  }).program : undefined
  const facts = ["entry", "binding", "control", "effect", "condition"].map((kind, i) => ({ id: `f${i}`, kind, statement: `Visible ${kind} fact.`, citations: [{ sourceId: catalog.catalog.sources[0]!.sourceId, startLine: 11 + i, endLine: 11 + i }] }))
  const wire = { results: [{ obligationId, decision: expectation === "conditional" ? { kind: "conditional-policy", policyStatus: "satisfied" } : { kind: "observed", observed: "deny" }, explanation: "The fixed source blocks the operation.", facts, decisiveMissingFacts: [] as string[], suggestedObservations: [] as string[], branchResults: withBranch ? [{ id: program!.entries[0]!.requestedBranches[0]!.id, assumptions: [{ conditionId, value: "false" }], effect: "blocked", explanation: "The branch is blocked.", factIds: ["f2"], missingFacts: [] as string[] }] : [] }] }
  const args = { compiled, sourceBundle: loaded.sourceBundle, method: "plain" as const, ...(program ? { program } : {}) }
  return { wire, args }
}

test("v6 uses observed decision for unconditional expectation and preserves its evidence", async () => {
  const { wire, args } = await fixture()
  const result = normalizeOutcomeAuthorizationResult({ ...args, input: wire })
  expect(result.status).toBe("valid")
  expect(result.result?.results[0]?.conclusion).toBe("source_refuted")
  expect(result.observedDecisions?.[0]?.observed).toBe("deny")
  wire.results[0]!.decision = { kind: "observed", observed: "allow" }
  expect(normalizeOutcomeAuthorizationResult({ ...args, input: wire }).result?.results[0]?.conclusion).toBe("source_supported_failure")
})

test("current contract records an explicit opposite model label while compatibility retains historical behavior", async () => {
  const { wire, args } = await fixture()
  wire.results[0]!.explanation = "source_supported_failure: the control blocks the operation."
  expect(normalizeOutcomeAuthorizationResult({ ...args, input: wire }).status).toBe("valid")
  const current = normalizeOutcomeAuthorizationResult({ ...args, input: wire, taskContract: "current-v1" })
  expect(current.status).toBe("invalid")
  expect(current.diagnostics.map(d => d.code)).toContain("policy-explanation-contradiction")
  expect(current.wireResult?.results[0]?.explanation).toContain("source_supported_failure")
  expect(current.policySummaries?.[0]?.status).toBe("satisfied")
})

test("v6 strict decision union rejects old conclusion and wrong kind for authored expectation", async () => {
  const { wire, args } = await fixture()
  expect(outcomeAuthorizationSchema("plain").safeParse(wire).success).toBe(true)
  const forged: any = structuredClone(wire); forged.results[0].conclusion = "source_refuted"
  expect(outcomeAuthorizationSchema("plain").safeParse(forged).success).toBe(false)
  const wrong: any = structuredClone(wire); wrong.results[0].decision = { kind: "conditional-policy", policyStatus: "satisfied" }
  const normalized = normalizeOutcomeAuthorizationResult({ ...args, input: wrong })
  expect(normalized.status).toBe("invalid")
  expect(normalized.result).toBeUndefined()
})

test("conditional expectation keeps policyStatus mapping separate", async () => {
  const { wire, args } = await fixture("conditional")
  const result = normalizeOutcomeAuthorizationResult({ ...args, input: wire })
  expect(result.status).toBe("valid")
  expect(result.result?.results[0]?.conclusion).toBe("source_refuted")
  const wrong: any = structuredClone(wire); wrong.results[0].decision = { kind: "observed", observed: "deny" }
  expect(normalizeOutcomeAuthorizationResult({ ...args, input: wrong }).status).toBe("invalid")
})

test("requested branches require exact IDs, assumptions and source-backed effects", async () => {
  const { wire, args } = await fixture("deny", true)
  const valid = normalizeOutcomeAuthorizationResult({ ...args, input: wire })
  expect(valid.status).toBe("valid")
  expect(valid.requestedBranchValidation?.status).toBe("valid")
  for (const mutate of [
    (item: any) => { item.branchResults = [] },
    (item: any) => { item.branchResults[0].id = "other" },
    (item: any) => { item.branchResults[0].assumptions[0].value = "true" },
    (item: any) => { item.branchResults[0].factIds = ["absent"] },
    (item: any) => { item.branchResults[0].effect = "unknown"; item.branchResults[0].factIds = []; item.branchResults[0].missingFacts = [] },
  ]) {
    const input: any = structuredClone(wire); mutate(input.results[0])
    const result = normalizeOutcomeAuthorizationResult({ ...args, input })
    expect(result.status).toBe("invalid")
    expect(result.result).toBeUndefined()
  }
})

test("bad citations and uninformative current unknown cannot leak a canonical success", async () => {
  const { wire, args } = await fixture()
  const invalid: any = structuredClone(wire); invalid.results[0].facts[0].citations[0].endLine = 9999
  expect(normalizeOutcomeAuthorizationResult({ ...args, input: invalid }).result).toBeUndefined()
  const unknown: any = structuredClone(wire); unknown.results[0].decision.observed = "unknown"
  expect(normalizeOutcomeAuthorizationResult({ ...args, input: unknown }).result).toBeUndefined()
})
