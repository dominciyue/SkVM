import { expect, test } from "bun:test"
import { applyAuthorizationLocalEdit } from "./local-edit.ts"
import type { AuthorizationAuthoringInputV2 } from "../authoring-v2.ts"

function base(): AuthorizationAuthoringInputV2 {
  return {
    schemaVersion: "authorization-assessment-authoring/v2", taskId: "fixed-task", request: "Assess both updates.", repository: "https://example.test/project", sourceRef: "fixed-ref", sourceRoot: "project", sources: ["src/record.ts"],
    policies: { update: { text: "Only owners update.", location: "brief#/policy", revision: "v1", acceptance: "accepted", reason: "Authored." } },
    principals: { member: { role: "member" } }, resources: { record: { type: "record" } },
    entries: { update: { name: "update", locations: [{ path: "src/record.ts", startLine: 1, endLine: 2 }] } },
    scenarios: {
      owner: { principal: "member", resource: "record", policy: "update", entries: ["update"], relation: "owner", operation: "update", expectation: "allow" },
      outsider: { principal: "member", resource: "record", policy: "update", entries: ["update"], relation: "non-owner", operation: "update", expectation: "deny" },
    },
    analysisContract: { schemaVersion: "authorization-analysis-contract/v1", publicInstruction: "Assess the declared conditions.", scenarios: {
      owner: { boundary: "declared-entry", premises: [{ id: "identity", statement: "The member is known.", atEntry: "update", provenance: "task-assumption" }], requestedBranches: [], requiredResponseDetails: [] },
      outsider: { boundary: "declared-entry", premises: [], requestedBranches: [], requiredResponseDetails: [] },
    } },
  }
}

test("request edit changes the effective question only and marks every scenario for review", () => {
  const original = base(), before = structuredClone(original)
  const result = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Revised question", operations: [
    { kind: "request", statement: "Can a member update their own record?" },
  ] })
  expect(result.status).toBe("ready")
  expect(result.value?.request).toBe("Can a member update their own record?")
  expect(result.value?.policies).toEqual(original.policies)
  expect(result.value?.analysisContract).toEqual(original.analysisContract)
  expect(result.changedPaths).toEqual(["request"])
  expect(result.affectedScenarios).toEqual(["outsider", "owner"])
  expect(original).toEqual(before)
  const duplicate = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Duplicate", operations: [
    { kind: "request", statement: "First question" }, { kind: "request", statement: "Second question" },
  ] })
  expect(duplicate.diagnostics.some(item => item.code === "duplicate-local-edit")).toBe(true)
})

test("policy text needs expectation acknowledgment for every referencing scenario", () => {
  const original = base()
  const missing = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Policy changed", operations: [
    { kind: "policy", key: "update", set: { text: "Only assigned owners update.", revision: "v2" } },
    { kind: "scenario", key: "owner", set: { expectation: "allow" } },
  ] })
  expect(missing.status).toBe("needs-input")
  expect(missing.diagnostics).toContainEqual(expect.objectContaining({ code: "policy-expectation-review-required", path: "scenarios.outsider.expectation" }))
  expect(missing.affectedScenarios).toEqual(["outsider", "owner"])
  expect(original.policies.update?.text).toBe("Only owners update.")
  const ready = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Policy changed", operations: [
    { kind: "policy", key: "update", set: { text: "Only assigned owners update.", revision: "v2" } },
    { kind: "scenario", key: "owner", set: { expectation: "allow" } },
    { kind: "scenario", key: "outsider", set: { expectation: "deny" } },
  ] })
  expect(ready.status).toBe("ready")
  expect(ready.value?.taskId).toBe(original.taskId)
  expect(ready.value?.scenarios).toEqual(original.scenarios)
  expect(ready.value?.policies.update?.text).toBe("Only assigned owners update.")
  expect(ready.changedPaths).toEqual(["policies.update.revision", "policies.update.text"])
  expect(ready.suppliedPaths).toContain("scenarios.outsider.expectation")
})

test("edits one premise and relation without changing unrelated declarations", () => {
  const original = base()
  const result = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Changed caller", operations: [
    { kind: "scenario", key: "owner", set: { relation: "delegated owner" } },
    { kind: "premise", scenarioKey: "owner", premiseId: "identity", statement: "The member has a delegation." },
  ] })
  expect(result.status).toBe("ready")
  expect(result.changedPaths).toEqual(["analysisContract.scenarios.owner.premises.identity.statement", "scenarios.owner.relation"])
  expect(result.value?.scenarios.outsider).toEqual(original.scenarios.outsider)
  expect(result.value?.analysisContract?.scenarios.outsider).toEqual(original.analysisContract?.scenarios.outsider)
  expect(result.reviewNotes).toContainEqual(expect.objectContaining({ scenarioKey: "owner" }))
})

test("rejects duplicate assignments, unknown keys and forbidden fields without mutation", () => {
  const original = base()
  const duplicate = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Duplicate", operations: [
    { kind: "scenario", key: "owner", set: { expectation: "allow" } },
    { kind: "scenario", key: "owner", set: { expectation: "deny" } },
  ] })
  expect(duplicate.status).toBe("needs-input")
  expect(duplicate.diagnostics).toContainEqual(expect.objectContaining({ code: "duplicate-local-edit" }))
  const unknown = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Unknown", operations: [{ kind: "policy", key: "missing", set: { text: "X" } }] })
  expect(unknown.status).toBe("needs-input")
  expect(unknown.diagnostics).toContainEqual(expect.objectContaining({ code: "unknown-local-edit-target" }))
  const forbidden = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Forbidden", operations: [{ kind: "scenario", key: "owner", set: { resource: "different" } }] })
  expect(forbidden.status).toBe("needs-input")
  expect(forbidden.diagnostics).toContainEqual(expect.objectContaining({ code: "local-edit-schema-invalid" }))
  expect(original.scenarios.owner?.expectation).toBe("allow")
})
