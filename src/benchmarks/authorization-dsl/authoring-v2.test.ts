import { expect, test } from "bun:test"
import fixture from "../../../examples/authorization-assessment/authoring-v2.json"
import { normalizeAuthorizationAuthoringInput } from "./authoring.ts"

function reordered(value: any): any {
  if (Array.isArray(value)) return value.map(reordered)
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).reverse().map(k => [k, reordered(value[k])]))
  return value
}

test("v2 lowers a complete author declaration without internal IDs, deterministically and without mutation", () => {
  const original = structuredClone(fixture)
  const result = normalizeAuthorizationAuthoringInput(fixture)
  expect(result.status).toBe("ready")
  expect(normalizeAuthorizationAuthoringInput(reordered(fixture))).toEqual(result)
  expect(fixture).toEqual(original)
  if (result.status !== "ready") return
  expect(result.normalizedInput.task.obligations[0]?.expectation).toBe("deny")
  expect(result.normalizedInput.task.policySources[0]?.acceptance.actorRole).toBe("task-author")
  expect(result.analysisRequirements).toHaveLength(6)
})

test("v2 diagnoses author paths without guessing policy or expectations or cascading absent parents", () => {
  for (const [field, mutate] of [
    ["scenarios.archive.expectation", (v:any) => delete v.scenarios.archive.expectation],
    ["policies", (v:any) => delete v.policies],
    ["scenarios.archive.policy", (v:any) => v.scenarios.archive.policy = "missing"],
    ["scenarios.archive.entries.0", (v:any) => v.scenarios.archive.entries = ["missing"]],
    ["scenarios.archive.analyzeConditions.names.0", (v:any) => v.scenarios.archive.analyzeConditions = {names:["missing"]}],
    ["principals.support", (v:any) => v.principals.support.isAdmin = true],
  ] as Array<[string, (v:any)=>void]>) {
    const value = structuredClone(fixture); mutate(value)
    const result = normalizeAuthorizationAuthoringInput(value)
    expect(result.status).toBe("needs-input")
    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]?.path).toBe(field)
    expect(result.diagnostics[0]?.fix.length).toBeGreaterThan(0)
  }
  expect(normalizeAuthorizationAuthoringInput({...fixture,schemaVersion:"unknown"}).diagnostics).toHaveLength(1)
})

test("v2 shares entities across scenarios and derives explicit condition bindings with collision-free names", () => {
  const value:any = structuredClone(fixture)
  value.scenarios["archive:copy"] = {...value.scenarios.archive, conditions:{"is:ready":{basis:"Author asks this branch"}}, analyzeConditions:{names:["is:ready"],maxBranches:2}}
  value.scenarios["archive%3Acopy"] = {...value.scenarios.archive}
  const result = normalizeAuthorizationAuthoringInput(value)
  expect(result.status).toBe("ready")
  if(result.status !== "ready") return
  const task = result.normalizedInput.task
  expect(new Set(task.obligations.map(x=>x.id)).size).toBe(3)
  expect(new Set(task.obligations.map(x=>x.policySourceId)).size).toBe(1)
  expect(result.normalizedInput.conditionAnalysisRequest?.requests[0]?.conditionBindings[0]?.name).toBe("is:ready")
  for(const key of ["__proto__", "constructor", " x", "x ", ""]) {
    const bad:any = structuredClone(fixture)
    bad.principals = JSON.parse(JSON.stringify({[key]:{role:"member"}}))
    expect(normalizeAuthorizationAuthoringInput(bad).status).toBe("needs-input")
  }
})

test("v2 reports ill-formed Unicode names rather than throwing during ID encoding", () => {
  const value:any=structuredClone(fixture)
  value.scenarios["\ud800"]={...value.scenarios.archive}
  expect(normalizeAuthorizationAuthoringInput(value).status).toBe("needs-input")
})
