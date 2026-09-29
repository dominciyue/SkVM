import { expect, test } from "bun:test"
import { applyAuthorizationDraftRepair, draftRepairPaths } from "./authoring-draft-repair.ts"
import { normalizeAuthorizationAuthoringInput } from "./authoring.ts"

const base = () => ({ schemaVersion: "authorization-assessment-authoring/v2", taskId: "records", request: "Assess editing.", repository: "repo", sourceRef: "r1", sourceRoot: ".", sources: ["access.ts"],
  policies: { rule: { text: "Owner only.", location: "task", revision: "current", acceptance: "accepted", reason: "Author supplied." } },
  principals: { caller: { role: "member" } }, resources: { record: { type: "record" } },
  entries: { edit: { name: "edit", locations: [{ path: "access.ts", startLine: 1, endLine: 1 }] } },
  scenarios: { foreign: { principal: "caller", resource: "record", policy: "rule", entries: ["edit"], relation: "not-owner", operation: "edit", expectation: "deny", conditions: { "owner-known": { basis: "Owner is known." } } } },
  analysisContract: { schemaVersion: "authorization-analysis-contract/v1", scenarios: { foreign: { boundary: "declared-entry", premises: [{ id: "p", statement: "Not owner.", atEntry: true, provenance: "task-assumption" }], requestedBranches: [{ id: "b", kind: "counterfactual", assumptions: [{ condition: "owner description", value: false }] }], requiredResponseDetails: [] } } },
})

test("draft repair changes only diagnosed reference leaves and reaches ordinary ready", () => {
  const candidate = base()
  const diagnostics = [{ path: "analysisContract.scenarios.foreign.premises.0.atEntry", code: "author-v2-structure" },
    { path: "analysisContract.scenarios.foreign.requestedBranches.0.assumptions.0.condition", code: "assessment-condition-mismatch" }]
  const allowed = draftRepairPaths(candidate, diagnostics)
  expect(allowed).toEqual(["/analysisContract/scenarios/foreign/premises/0/atEntry", "/analysisContract/scenarios/foreign/requestedBranches/0/assumptions/0/condition"])
  const result = applyAuthorizationDraftRepair(candidate, allowed, { schemaVersion: "authorization-author-draft-repair/v1", reason: "Fix diagnosed references.", operations: [
    { path: allowed[0], value: "edit" }, { path: allowed[1], value: "owner-known" },
  ] })
  expect(result.status).toBe("ready")
  expect(candidate.analysisContract.scenarios.foreign.premises[0]!.atEntry).toBe(true)
  if (result.status === "ready") expect(normalizeAuthorizationAuthoringInput(result.value).status).toBe("ready")
})

test("draft repair refuses attached policy, expectation, unknown and repeated paths", () => {
  const candidate = base(), diagnostics = [{ path: "analysisContract.scenarios.foreign.premises.0.atEntry", code: "author-v2-structure" }]
  const allowed = draftRepairPaths(candidate, diagnostics)
  const request = { schemaVersion: "authorization-author-draft-repair/v1", reason: "Try attached change.", operations: [
    { path: allowed[0], value: "edit" }, { path: "/policies/rule/text", value: "Anyone may edit." }, { path: "/scenarios/foreign/expectation", value: "allow" },
  ] }
  const result = applyAuthorizationDraftRepair(candidate, allowed, request)
  expect(result.status).toBe("needs-input")
  expect(result.diagnostics.map(d => d.code)).toContain("draft-repair-path-not-allowed")
  const repeated = applyAuthorizationDraftRepair(candidate, allowed, { ...request, operations: [{ path: allowed[0], value: "edit" }, { path: allowed[0], value: "edit" }] })
  expect(repeated.diagnostics.map(d => d.code)).toContain("duplicate-draft-repair")
  const prototype = applyAuthorizationDraftRepair(candidate, allowed, { ...request, operations: [{ path: "/__proto__/x", value: "bad" }] })
  expect(prototype.status).toBe("needs-input")
  expect(candidate.policies.rule.text).toBe("Owner only.")
})
