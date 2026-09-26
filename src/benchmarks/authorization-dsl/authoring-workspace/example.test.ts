import { afterEach, expect, test } from "bun:test"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { normalizeAuthorizationAuthoringInput } from "../authoring.ts"
import { checkLocalAuthorizationInput } from "../local-run.ts"
import { materializeAuthorizationWorkspace } from "./materialize.ts"
import { planAuthorizationWorkspace } from "./plan.ts"

const example = fileURLToPath(new URL("../../../../examples/authorization-assessment/scenario-workspace/", import.meta.url))
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

// Independently authored expected v2 declarations. No workspace/base/replacement bytes are used.
const common = {
  schemaVersion: "authorization-assessment-authoring/v2", repository: "https://example.test/scenario-workspace/records", sourceRef: "synthetic-workspace-v1", sourceRoot: "../project", sources: ["src/records.ts"],
  policies: { archive: { text: "Only an authenticated record owner or an authenticated supervisor may archive a record.", location: "base.json#/policies/archive", revision: "synthetic-policy-v1", acceptance: "accepted", reason: "The task author explicitly supplies this synthetic policy independently of the implementation." } },
  entries: { archive: { name: "archiveRecord", locations: [{ path: "src/records.ts", startLine: 6, endLine: 12 }] } },
}
const expected = [
  { ...common, taskId: "synthetic-workspace-owner", request: "May authenticated member alice archive record r-1, which she owns, without a supervisor role?",
    principals: { actor: { role: "member", facts: ["The principal id is alice.", "The principal is authenticated.", "The principal is not a supervisor."], capabilities: ["authenticated"] } },
    resources: { record: { type: "record", facts: ["Record r-1 exists and is owned by alice.", "The record has not been archived."] } },
    scenarios: { archive: { principal: "actor", resource: "record", policy: "archive", entries: ["archive"], relation: "same-owner-without-supervisor-role", operation: "archive", expectation: "allow" } } },
  { ...common, taskId: "synthetic-workspace-outsider", request: "May authenticated member alice archive record r-1 owned by bob when alice is not a supervisor?",
    principals: { actor: { role: "member", facts: ["The principal id is alice.", "The principal is authenticated.", "The principal is not a supervisor."], capabilities: ["authenticated"] } },
    resources: { record: { type: "record", facts: ["Record r-1 exists and is owned by bob.", "The record has not been archived."] } },
    scenarios: { archive: { principal: "actor", resource: "record", policy: "archive", entries: ["archive"], relation: "different-owner-without-supervisor-role", operation: "archive", expectation: "deny" } } },
  { ...common, taskId: "synthetic-workspace-role-override", request: "May authenticated supervisor alice archive record r-1 owned by bob?",
    principals: { actor: { role: "supervisor", facts: ["The principal id is alice.", "The principal is authenticated.", "The principal is a supervisor."], capabilities: ["authenticated", "supervisor"] } },
    resources: { record: { type: "record", facts: ["Record r-1 exists and is owned by bob.", "The record has not been archived."] } },
    scenarios: { archive: { principal: "actor", resource: "record", policy: "archive", entries: ["archive"], relation: "different-owner-with-supervisor-role", operation: "archive", expectation: "allow" } } },
]
test("three explicit example variants lower identically to independent expected v2 inputs", async () => {
  const plan = await planAuthorizationWorkspace(path.join(example, "workspace.json"), path.join(example, "generated"))
  expect(plan.status).toBe("valid")
  expect(plan.variants).toHaveLength(3)
  for (const [index, variant] of plan.variants.entries()) {
    const actual = normalizeAuthorizationAuthoringInput(variant.input), wanted = normalizeAuthorizationAuthoringInput(expected[index])
    expect(actual.status).toBe("ready"); expect(wanted.status).toBe("ready")
    if (actual.status === "ready" && wanted.status === "ready") expect(actual.normalizedInput).toEqual(wanted.normalizedInput)
    expect(variant.input).not.toHaveProperty("additionalQuestions")
  }
})
test.skipIf(process.platform !== "win32")("ordinary external copy generates/checks all three and a shared policy edit leaves old outputs intact", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "af-ordinary-")); roots.push(root)
  await cp(example, root, { recursive: true })
  const workspace = path.join(root, "workspace.json"), originalOut = path.join(root, "generated"), changedOut = path.join(root, "generated-policy-update")
  const original = await materializeAuthorizationWorkspace(workspace, originalOut)
  expect(original.status).toBe("created")
  const originalBytes = await Promise.all(original.variants.map(v => readFile(v.inputPath, "utf8")))
  for (const v of original.variants) expect((await checkLocalAuthorizationInput(v.inputPath)).status).toBe("valid")
  const base = JSON.parse(await readFile(path.join(root, "base.json"), "utf8"))
  const updatedPolicy = "Only an authenticated owner or supervisor may archive a record; an unauthenticated caller must be denied."
  base.policies.archive.text = updatedPolicy
  await writeFile(path.join(root, "base.json"), JSON.stringify(base, null, 2))
  const updated = await materializeAuthorizationWorkspace(workspace, changedOut)
  expect(updated.status).toBe("created")
  for (const v of updated.variants) {
    expect(v.input.policies.archive!.text).toBe(updatedPolicy)
    expect((await checkLocalAuthorizationInput(v.inputPath)).status).toBe("valid")
  }
  expect(await Promise.all(original.variants.map(v => readFile(v.inputPath, "utf8")))).toEqual(originalBytes)
})
