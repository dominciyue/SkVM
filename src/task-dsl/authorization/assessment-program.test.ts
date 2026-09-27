import { expect, test } from "bun:test"
import { AuthorizationTaskV0Schema } from "./schema.ts"
import { compileAuthorizationAssessmentProgram } from "./assessment-program.ts"

const task = AuthorizationTaskV0Schema.parse({
  schemaVersion: "source-authorization-assessment/v0", taskId: "synthetic", request: "Assess two entries.", repository: "https://example.test/repo", sourceRef: "fixed", sourceMode: "fixed-context",
  policySources: [{ id: "policy", kind: "task-requirement", text: "Members may read.", location: "task", revision: "v1", acceptance: { status: "accepted", actorRole: "author", reason: "Given." } }],
  principals: [{ id: "caller", role: "member", description: "Given caller.", startingCapabilities: [] }],
  resources: [{ id: "record", type: "record", description: "Given record." }],
  entries: [{ id: "first", name: "first", locations: [{ path: "a.ts", startLine: 1, endLine: 2 }] }, { id: "second", name: "second", locations: [{ path: "a.ts", startLine: 3, endLine: 4 }] }],
  obligations: [{ id: "read", principalId: "caller", resourceId: "record", relation: "self", operation: "read", expectation: "allow", conditions: [{ name: "enabled", basis: "Task names gate." }], policySourceId: "policy", entryIds: ["first", "second"] }],
  scopeAssurance: "Only declared entries.", requiredAnalysis: ["Trace control."], constraints: ["No execution."],
})

test("program expands locally to each entry without copying one entry premise to the other", () => {
  const result = compileAuthorizationAssessmentProgram(task, { schemaVersion: "authorization-analysis-contract/v1", scenarios: [{ obligationId: "read", boundary: "declared-entry", premises: [{ id: "caller", statement: "Caller bound at first.", atEntryId: "first", provenance: "task-assumption" }], requestedBranches: [{ id: "off", kind: "counterfactual", assumptions: [{ conditionId: "read:condition:enabled", value: "false" }] }], requiredResponseDetails: [] }] })
  expect(result.status).toBe("ready")
  if (result.status !== "ready") return
  expect(result.program.entries).toHaveLength(2)
  expect(result.program.entries.find(entry => entry.entryId === "first")?.premises).toHaveLength(1)
  expect(result.program.entries.find(entry => entry.entryId === "second")?.premises).toHaveLength(0)
  expect(result.program.entries.every(entry => !JSON.stringify(entry.requestedBranches).includes("effect"))).toBe(true)
  expect(result.program.entries.map(entry => entry.obligationId)).toEqual(["read::first", "read::second"])
})

test("unknown or blocked obligation never becomes a runnable program entry", () => {
  const result = compileAuthorizationAssessmentProgram(task, { schemaVersion: "authorization-analysis-contract/v1", scenarios: [{ obligationId: "missing", boundary: "deployment", premises: [], requestedBranches: [], requiredResponseDetails: [] }] })
  expect(result.status).toBe("needs-input")
  expect(result.program.entries).toHaveLength(0)
  expect(result.diagnostics[0]?.path).toContain("obligationId")
})

test("empty premise and branch lists are valid for an explicit bounded task", () => {
  const result = compileAuthorizationAssessmentProgram(task, { schemaVersion: "authorization-analysis-contract/v1", scenarios: [{ obligationId: "read", boundary: "supplied-path", premises: [], requestedBranches: [], requiredResponseDetails: [] }] })
  expect(result.status).toBe("ready")
})

test("normalized input cannot bypass duplicate branch and premise checks", () => {
  const scenario = { obligationId: "read", boundary: "declared-entry", premises: [{ id: "caller", statement: "Caller at first.", atEntryId: "first", provenance: "task-assumption" }], requestedBranches: [{ id: "off", kind: "counterfactual", assumptions: [{ conditionId: "read:condition:enabled", value: "false" }] }], requiredResponseDetails: [] }
  for (const mutate of [
    (value: any) => value.premises.push(value.premises[0]),
    (value: any) => value.requestedBranches.push(value.requestedBranches[0]),
    (value: any) => value.requestedBranches.push({ id: "same-combination", kind: "counterfactual", assumptions: [...value.requestedBranches[0].assumptions] }),
    (value: any) => value.requestedBranches[0].assumptions.push({ conditionId: "read:condition:enabled", value: "true" }),
  ]) {
    const value: any = structuredClone(scenario); mutate(value)
    expect(compileAuthorizationAssessmentProgram(task, { schemaVersion: "authorization-analysis-contract/v1", scenarios: [value] }).status).toBe("needs-input")
  }
})
