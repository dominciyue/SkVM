import { expect, test } from "bun:test"
import demo from "../../../../examples/authorization-assessment/evidence-editing/base.json" with { type: "json" }
import { applyAuthorizationLocalEdit } from "./local-edit.ts"

function base(): any {
  const v: any = structuredClone(demo), keys = Object.keys(v.scenarios)
  v.analysisContract = { schemaVersion: "authorization-analysis-contract/v1", publicInstruction: "Original policy instruction", scenarios: Object.fromEntries(keys.map(key => [key, { boundary: "declared-entry", premises: [], requestedBranches: [], requiredResponseDetails: ["Original response", "Keep this"] }])) }
  return v
}

test("text edits preserve unassigned text and supply affected field paths without requiring approval", () => {
  const original = base(), key = Object.keys(original.scenarios)[0]!
  const result = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Wording follows the current policy", operations: [{ kind: "response-detail", scenarioKey: key, index: 0, statement: "Explain current policy." }] })
  expect(result.status).toBe("ready")
  expect(result.value?.analysisContract?.scenarios[key]?.requiredResponseDetails).toEqual(["Explain current policy.", "Keep this"])
  expect(result.affectedText).toContain("analysisContract.publicInstruction")
  expect(original.analysisContract.scenarios[key].requiredResponseDetails[0]).toBe("Original response")
})

test("text edits reject out-of-range indices, absent instructions, unknown fields and conflicts", () => {
  const v = base(), key = Object.keys(v.scenarios)[0]!
  for (const operations of [
    [{ kind: "response-detail", scenarioKey: key, index: 2, statement: "New" }],
    [{ kind: "public-instruction", statement: "One" }, { kind: "public-instruction", statement: "Two" }],
    [{ kind: "public-instruction", statement: "One", path: "sourceRoot" }],
  ]) expect(applyAuthorizationLocalEdit(v, { schemaVersion: "authorization-local-edit/v1", reason: "Update", operations }).status).toBe("needs-input")
  delete v.analysisContract.publicInstruction
  expect(applyAuthorizationLocalEdit(v, { schemaVersion: "authorization-local-edit/v1", reason: "Update", operations: [{ kind: "public-instruction", statement: "New" }] }).status).toBe("needs-input")
})
