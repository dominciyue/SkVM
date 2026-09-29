import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { normalizeAuthorizationAuthoringInput } from "./authoring.ts"
import { applyAuthorizationLocalEdit } from "./authoring-workspace/local-edit.ts"
import { loadLocalAuthorizationInput } from "./local-input.ts"
import { checkLocalAuthorizationInput } from "./local-run.ts"
import { createExecutionDependencies } from "./change-report.ts"
import type { AuthorizationAuthoringInputV2 } from "./authoring-v2.ts"

const base = (): AuthorizationAuthoringInputV2 => ({
  schemaVersion: "authorization-assessment-authoring/v2", taskId: "owner-premises", request: "Assess access under the declared owner premises.", repository: "https://example.test/generic-records", sourceRef: "fixed-owner-source", sourceRoot: "project", sources: ["records.ts"],
  policies: { access: { text: "Ownerless records are accessible; otherwise the owner or explicit object permission is required.", location: "task#/policy", revision: "v1", acceptance: "accepted", reason: "Task author's rule." } },
  principals: { caller: { role: "authenticated caller", facts: ["The caller lacks object permission."] } }, resources: { record: { type: "record" } },
  entries: { access: { name: "canAccess", locations: [{ path: "records.ts", startLine: 1, endLine: 4 }] } },
  scenarios: {
    asked: { principal: "caller", resource: "record", policy: "access", entries: ["access"], relation: "owner-state-unspecified", operation: "access", expectation: "conditional", conditions: { present: { basis: "Whether the owner exists." }, self: { basis: "Whether a present owner equals the caller." } } },
    unrelated: { principal: "caller", resource: "record", policy: "access", entries: ["access"], relation: "owner-state-unspecified", operation: "access", expectation: "conditional" },
  },
  analysisContract: { schemaVersion: "authorization-analysis-contract/v1", publicInstruction: "Use only the stated premises; unspecified does not mean absent or other-present. Answer only requested counterfactuals.", scenarios: {
    asked: { boundary: "declared-entry", premises: [{ id: "owner-state", statement: "Owner presence and identity are unspecified; the caller lacks object permission.", atEntry: "access", provenance: "task-assumption" }], requestedBranches: [
      { id: "absent", kind: "counterfactual", assumptions: [{ condition: "present", value: false }] },
      { id: "other-present", kind: "counterfactual", assumptions: [{ condition: "present", value: true }, { condition: "self", value: false }] },
      { id: "self-present", kind: "counterfactual", assumptions: [{ condition: "present", value: true }, { condition: "self", value: true }] },
    ], requiredResponseDetails: ["Separate the absent, other-present and self-owner source branches from the current unspecified premise."] },
    unrelated: { boundary: "declared-entry", premises: [], requestedBranches: [], requiredResponseDetails: [] },
  } },
})

test("existing conditions and premises represent unspecified, absent, other-present and self without inferred state", () => {
  const original = base(), normalized = normalizeAuthorizationAuthoringInput(original)
  expect(normalized.status).toBe("ready")
  if (normalized.status !== "ready") return
  expect(normalized.normalizedInput.task.resources[0]!.description).toBe("Author facts: not declared.")
  expect(normalized.normalizedInput.analysisContract!.scenarios.find(s => s.obligationId === "scenario:asked")!.premises[0]!.statement).toContain("unspecified")
  expect(normalized.normalizedInput.analysisContract!.scenarios.find(s => s.obligationId === "scenario:asked")!.requestedBranches).toHaveLength(3)
  for (const [relation, statement, expectation] of [
    ["other-present", "The record has an owner different from the caller; the caller lacks object permission.", "deny"],
    ["absent", "The record has no owner (null); the caller lacks object permission.", "allow"],
    ["self-present", "The record has a present owner equal to the caller; the caller lacks object permission.", "allow"],
  ] as const) {
    const edited = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Only owner premise changes.", operations: [
      { kind: "premise", scenarioKey: "asked", premiseId: "owner-state", statement }, { kind: "scenario", key: "asked", set: { relation, expectation } },
    ] })
    expect(edited.status).toBe("ready")
    expect(edited.affectedScenarios).toEqual(["asked"])
    expect(edited.value!.scenarios.unrelated).toEqual(original.scenarios.unrelated)
    expect(edited.value!.analysisContract!.scenarios.unrelated).toEqual(original.analysisContract!.scenarios.unrelated)
    expect(edited.value!.policies).toEqual(original.policies)
  }
  expect(original.scenarios.asked!.relation).toBe("owner-state-unspecified")
})

test("premise-only edits change ordinary preview/program/compare dependencies while source stays identical", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "authorization-owner-premise-"))
  try {
    await mkdir(path.join(root, "project"))
    await writeFile(path.join(root, "project", "records.ts"), "function canAccess(caller, record) {\n if (record.owner === null) return true\n return record.owner === caller.id || caller.objectPermission\n}\n")
    const original = base(), edit = applyAuthorizationLocalEdit(original, { schemaVersion: "authorization-local-edit/v1", reason: "Owner is now known.", operations: [{ kind: "premise", scenarioKey: "asked", premiseId: "owner-state", statement: "The owner exists and differs from the caller; the caller lacks object permission." }] })
    const snapshots: ReturnType<typeof createExecutionDependencies>[] = []
    for (const [name, value] of [["original", original], ["changed", edit.value!]] as const) {
      const file = path.join(root, `${name}.json`); await writeFile(file, JSON.stringify(value))
      const loaded = await loadLocalAuthorizationInput(file), checked = await checkLocalAuthorizationInput(file, "B", "plain", "v6", "standard", "explicit-v1")
      expect(loaded.status).toBe("valid"); expect(checked.status).toBe("valid")
      if (loaded.status !== "valid" || checked.status !== "valid") throw new Error("Fixture must be runnable")
      expect(checked.assessmentProgram!.entries).toHaveLength(2)
      expect(checked.assessmentProgram!.entries.find(e => e.authorObligationId === "scenario:unrelated")!.requestedBranches).toHaveLength(0)
      snapshots.push(createExecutionDependencies(loaded, checked))
    }
    expect(snapshots[0]!.sourceBundle).toEqual(snapshots[1]!.sourceBundle)
    expect(snapshots[0]!.task).toEqual(snapshots[1]!.task)
    expect(snapshots[0]!.assessmentContract).not.toEqual(snapshots[1]!.assessmentContract)
    expect(snapshots[0]!.assessmentProgram).not.toEqual(snapshots[1]!.assessmentProgram)
    expect(snapshots[0]!.promptSha256).not.toBe(snapshots[1]!.promptSha256)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("only explicit branches expand and contradictory structured assignments have concrete paths", () => {
  const v = base(); v.analysisContract!.scenarios.asked!.requestedBranches = []
  const normalized = normalizeAuthorizationAuthoringInput(v)
  expect(normalized.status).toBe("ready")
  if (normalized.status === "ready") expect(normalized.normalizedInput.analysisContract!.scenarios.every(s => s.requestedBranches.length === 0)).toBe(true)
  v.analysisContract!.scenarios.asked!.requestedBranches = [{ id: "conflict", kind: "counterfactual", assumptions: [{ condition: "present", value: true }, { condition: "present", value: false }] }]
  const conflict = normalizeAuthorizationAuthoringInput(v)
  expect(conflict.status).toBe("needs-input")
  expect(conflict.diagnostics).toContainEqual(expect.objectContaining({ code: "assessment-repeated-assignment", path: "analysisContract.scenarios.asked.requestedBranches.0.assumptions.1.condition" }))
})
