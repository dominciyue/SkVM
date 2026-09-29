import { expect, test } from "bun:test"
import { compileAuthorizationTaskAuthoring, projectCurrentTask, applyTaskChange } from "./authoring-task.ts"
import { normalizeAuthorizationAuthoringInput } from "./authoring.ts"

const context = {
  schemaVersion: "authorization-authoring-context/v1", taskId: "rename-record", request: "Assess record editing at the named handler.",
  repository: "https://example.test/records", sourceRef: "abc123", sourceRoot: ".", allowedFiles: ["src/access.ts"],
  entries: [{ entryKey: "edit-record", path: "src/access.ts", startLine: 1, endLine: 10 }],
}
const task = {
  schemaVersion: "authorization-task-authoring/v1", request: "Assess the current edit policy.",
  policy: { text: "Only an owner may edit a record.", location: "task requirement", revision: "current", acceptance: "accepted", reason: "Author supplied." },
  cases: [{ name: "foreign-edit", entry: "edit-record", principal: { role: "member" }, resource: { type: "record" }, relation: "not-owner", operation: "edit", expectation: "deny", boundary: "declared-entry",
    premises: [{ name: "ownership", statement: "The caller is not the owner." }],
    conditions: { "record-owner-present": { basis: "Whether the record has an owner." } },
    branches: [{ name: "owner-absent", assumptions: { "record-owner-present": false } }, { name: "owner-present", assumptions: { "record-owner-present": true } }],
    responseDetails: ["Explain both requested branches."],
  }],
} as const

test("current task compiles case-local entry and condition references through existing v2", () => {
  const result = compileAuthorizationTaskAuthoring(context, task)
  expect(result.status).toBe("ready")
  if (result.status !== "ready") return
  expect(result.authoring.analysisContract?.scenarios["foreign-edit"]?.premises[0]?.atEntry).toBe("edit-record")
  expect(result.authoring.analysisContract?.scenarios["foreign-edit"]?.requestedBranches.map(branch => branch.assumptions[0]?.condition)).toEqual(["record-owner-present", "record-owner-present"])
  expect(result.authoring.analysisContract?.scenarios["foreign-edit"]?.requestedBranches).toHaveLength(2)
  expect(normalizeAuthorizationAuthoringInput(result.authoring).status).toBe("ready")
  expect(result.provenance.hostDerived).toContain("premise entry references")
  expect(result.provenance.fieldSources["/analysisContract/scenarios/foreign-edit/premises/0/statement"]).toBe("user-explicit")
  expect(result.provenance.fieldSources["/analysisContract/scenarios/foreign-edit/premises/0/atEntry"]).toBe("host-derived")
  const modeled = compileAuthorizationTaskAuthoring(context, task, { fieldOrigin: "model-authored" })
  expect(modeled.status).toBe("ready")
  if (modeled.status === "ready") expect(modeled.provenance.fieldSources["/policies/current/text"]).toBe("model-authored")
})

test("legal renamed condition preserves semantics without a hidden fixed key", () => {
  const renamed = structuredClone(task) as any
  renamed.cases[0].conditions = { "has-owner": { basis: "Whether the record has an owner." } }
  renamed.cases[0].branches = [{ name: "owner-absent", assumptions: { "has-owner": false } }, { name: "owner-present", assumptions: { "has-owner": true } }]
  expect(compileAuthorizationTaskAuthoring(context, renamed).status).toBe("ready")
})

test("rejects duplicate cases, foreign entry and cross-case condition with field paths", () => {
  const repeated = structuredClone(task) as any
  repeated.cases.push(structuredClone(repeated.cases[0]))
  expect(compileAuthorizationTaskAuthoring(context, repeated).diagnostics.some(d => d.path === "cases.1.name")).toBe(true)
  const badEntry = structuredClone(task) as any
  badEntry.cases[0].entry = "other-entry"
  expect(compileAuthorizationTaskAuthoring(context, badEntry).diagnostics.some(d => d.path === "cases.0.entry")).toBe(true)
  const badCondition = structuredClone(task) as any
  badCondition.cases[0].branches[0].assumptions = { "other-case-condition": false }
  expect(compileAuthorizationTaskAuthoring(context, badCondition).diagnostics.some(d => d.path === "cases.0.branches.0.assumptions.other-case-condition")).toBe(true)
})

test("missing policy and unrequested branches remain explicit", () => {
  const missing = structuredClone(task) as any
  delete missing.policy
  expect(compileAuthorizationTaskAuthoring(context, missing).status).toBe("needs-input")
  const oneBranch = structuredClone(task) as any
  oneBranch.cases[0].branches = [{ name: "unknown-owner", assumptions: { "record-owner-present": "unknown" } }]
  const result = compileAuthorizationTaskAuthoring(context, oneBranch)
  expect(result.status).toBe("ready")
  if (result.status === "ready") expect(result.authoring.analysisContract?.scenarios["foreign-edit"]?.requestedBranches).toHaveLength(1)
})

test("current snapshot rejects future fields and named change preserves the original", () => {
  const original = projectCurrentTask(task)
  expect(original.status).toBe("ready")
  if (original.status !== "ready") return
  const changed = applyTaskChange(original.current, { schemaVersion: "authorization-task-change/v1", reason: "Policy revision supplied by author.",
    policy: { text: "A member may edit any record.", location: "new task requirement", revision: "next", acceptance: "accepted", reason: "Explicit new policy." },
    cases: [{ name: "foreign-edit", expectation: "allow" }],
  })
  expect(changed.status).toBe("ready")
  if (changed.status !== "ready") return
  expect(changed.current.policy.text).toBe("A member may edit any record.")
  expect(original.current.policy.text).toBe("Only an owner may edit a record.")
  expect(changed.current.cases[0]?.name).toBe(original.current.cases[0]?.name)
  expect(JSON.stringify(original.current)).not.toContain("A member may edit any record.")
  expect(projectCurrentTask({ ...task, changedPolicy: "A member may edit any record." }).status).toBe("needs-input")
})
