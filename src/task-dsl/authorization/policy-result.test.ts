import { expect, test } from "bun:test"
import path from "node:path"
import { loadLocalAuthorizationInput } from "../../benchmarks/authorization-dsl/local-input.ts"
import { buildAuthorizationSourceCatalog } from "../../benchmarks/authorization-dsl/inputs.ts"
import { compileAuthorizationTask } from "./semantics.ts"
import { compactAuthorizationSchema, normalizeCompactAuthorizationResult } from "./compact-transport.ts"

async function api() {
  const module = await import("./policy-result.ts").catch(() => ({})) as any
  expect(typeof module.mapPolicyStatus).toBe("function")
  return module
}
async function fixture(expectation: "allow" | "deny" = "deny") {
  const loaded = await loadLocalAuthorizationInput(path.resolve(import.meta.dir, "../../../examples/authorization-assessment/assessment.json"))
  if (loaded.status !== "valid") throw Error("fixture")
  loaded.task.obligations[0]!.expectation = expectation
  const compiled = compileAuthorizationTask(loaded.task)
  const catalog = buildAuthorizationSourceCatalog(loaded.sourceBundle)
  if (!catalog.success) throw Error("catalog")
  const wire = { results: [{ obligationId: compiled.runnableObligations[0]!.id, policyStatus: "satisfied", explanation: "The declared policy is enforced.", facts: ["entry", "binding", "control", "effect", "condition"].map((kind, i) => ({ id: `f${i}`, kind, statement: "A supplied source fact.", citations: [{ sourceId: catalog.catalog.sources[0]!.sourceId, startLine: 11, endLine: 16 }] })), decisiveMissingFacts: [] as string[], suggestedObservations: [] as string[] }] }
  return { wire, args: { compiled, sourceBundle: loaded.sourceBundle, method: "plain" as const } }
}
test("v5 maps the three policy states without interpreting expectation or explanation", async () => {
  const m = await api()
  expect(m.mapPolicyStatus("satisfied")).toBe("source_refuted")
  expect(m.mapPolicyStatus("violated")).toBe("source_supported_failure")
  expect(m.mapPolicyStatus("undetermined")).toBe("unknown")
  for (const expectation of ["allow", "deny"] as const) {
    const { wire, args } = await fixture(expectation)
    wire.results[0]!.explanation = "Deliberately contradictory prose must never change the status."
    const result = m.normalizePolicyAuthorizationResult({ ...args, input: wire })
    expect(result.status).toBe("valid")
    expect(result.normalizerVersion).toBe("authorization-wire-normalizer/v5")
    expect(result.wireResult).toEqual(wire)
    expect(result.result.results[0].conclusion).toBe("source_refuted")
    const { policyStatus, ...rest } = wire.results[0]!
    expect(result.result).toEqual(normalizeCompactAuthorizationResult({ ...args, input: { results: [{ ...rest, conclusion: "source_refuted" }] } }).result)
  }
})
test("v5 strictly replaces conclusion and v4 retains its old contract", async () => {
  const m = await api(), { wire } = await fixture()
  expect(m.policyAuthorizationSchema("plain").safeParse(wire).success).toBe(true)
  expect(compactAuthorizationSchema("plain").safeParse(wire).success).toBe(false)
  for (const change of [(x: any) => { x.conclusion = "source_refuted" }, (x: any) => { delete x.policyStatus; x.conclusion = "source_refuted" }, (x: any) => { x.policyStatus = "allow" }]) {
    const copy = structuredClone(wire); change(copy.results[0])
    expect(m.policyAuthorizationSchema("plain").safeParse(copy).success).toBe(false)
  }
})
test("v5 keeps informative unknown, obligation and citation validation with no invalid canonical result", async () => {
  const m = await api(), { wire, args } = await fixture()
  for (const mutate of [(x: any) => { x.policyStatus = "undetermined" }, (x: any) => { x.obligationId = "foreign" }, (x: any) => { x.facts[0].citations[0].endLine = 99999 }, (x: any) => { x.facts[1].id = "f0" }]) {
    const copy = structuredClone(wire); mutate(copy.results[0])
    const result = m.normalizePolicyAuthorizationResult({ ...args, input: copy })
    expect(result.status).toBe("invalid")
    expect(result.result).toBeUndefined()
  }
  wire.results[0]!.policyStatus = "undetermined"
  wire.results[0]!.decisiveMissingFacts = ["An actual deployment setting is absent."]
  wire.results[0]!.suggestedObservations = ["Inspect that setting."]
  expect(m.normalizePolicyAuthorizationResult({ ...args, input: wire }).result.results[0].conclusion).toBe("unknown")
})
