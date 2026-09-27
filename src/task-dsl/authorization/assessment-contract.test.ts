import { expect, test } from "bun:test"
import fixture from "../../../examples/authorization-assessment/authoring-v2.json"
import { normalizeAuthorizationAuthoringInput } from "../../benchmarks/authorization-dsl/authoring.ts"
import { lowerAuthorAnalysisContract } from "./assessment-contract.ts"

const bindings = {
  archive: {
    obligationId: "scenario:archive",
    entries: { submit: "entry:submit" },
    conditions: { "is ready": "condition:archive:is%20ready" },
  },
}

const contract = () => ({
  schemaVersion: "authorization-analysis-contract/v1",
  scenarios: {
    archive: {
      boundary: "declared-entry",
      premises: [{ id: "caller-at-entry", statement: "The caller is the stated member.", atEntry: "submit", provenance: "task-assumption" }],
      requestedBranches: [{ id: "ready-branch", kind: "counterfactual", assumptions: [{ condition: "is ready", value: true }] }],
      requiredResponseDetails: ["State the visible status code."],
    },
  },
})

test("absent optional contract preserves old v2 normalized bytes", () => {
  const baseline = normalizeAuthorizationAuthoringInput(fixture)
  expect(baseline.status).toBe("ready")
  if (baseline.status === "ready") expect(baseline.normalizedInput.analysisContract).toBeUndefined()
})

test("author names lower to canonical obligation, entry and condition IDs without answers", () => {
  const result = lowerAuthorAnalysisContract(contract(), bindings)
  expect(result.status).toBe("ready")
  if (result.status !== "ready") return
  expect(result.contract.scenarios[0]).toEqual({
    obligationId: "scenario:archive",
    boundary: "declared-entry",
    premises: [{ id: "caller-at-entry", statement: "The caller is the stated member.", atEntryId: "entry:submit", provenance: "task-assumption" }],
    requestedBranches: [{ id: "ready-branch", kind: "counterfactual", assumptions: [{ conditionId: "condition:archive:is%20ready", value: "true" }] }],
    requiredResponseDetails: ["State the visible status code."],
  })
  expect(JSON.stringify(result.contract)).not.toContain("effect")
})

test("author contract diagnoses unknown scenario, cross-entry premise and condition", () => {
  const cases: Array<[string, (value: any) => void]> = [
    ["analysisContract.scenarios.missing", value => { value.scenarios.missing = value.scenarios.archive; delete value.scenarios.archive }],
    ["analysisContract.scenarios.archive.premises.0.atEntry", value => { value.scenarios.archive.premises[0].atEntry = "other" }],
    ["analysisContract.scenarios.archive.requestedBranches.0.assumptions.0.condition", value => { value.scenarios.archive.requestedBranches[0].assumptions[0].condition = "other" }],
  ]
  for (const [path, mutate] of cases) {
    const value = contract(); mutate(value)
    const result = lowerAuthorAnalysisContract(value, bindings)
    expect(result.status).toBe("needs-input")
    if (result.status === "needs-input") expect(result.diagnostics[0]?.path).toBe(path)
  }
})

test("duplicate IDs and contradictory or duplicate branch assignments are rejected", () => {
  for (const mutate of [
    (value: any) => value.scenarios.archive.premises.push(value.scenarios.archive.premises[0]),
    (value: any) => value.scenarios.archive.requestedBranches.push(value.scenarios.archive.requestedBranches[0]),
    (value: any) => value.scenarios.archive.requestedBranches[0].assumptions.push({ condition: "is ready", value: false }),
    (value: any) => value.scenarios.archive.requestedBranches[0].assumptions.push({ condition: "is ready", value: true }),
  ]) {
    const value = contract(); mutate(value)
    expect(lowerAuthorAnalysisContract(value, bindings).status).toBe("needs-input")
  }
})
