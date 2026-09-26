import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { planAuthorizationWorkspace } from "./plan.ts"

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
export const baseInput = () => ({
  schemaVersion: "authorization-assessment-authoring/v2", taskId: "synthetic-owner", request: "Can Alice archive her record?", repository: "https://example.test/records", sourceRef: "synthetic-v1", sourceRoot: "project", sources: ["src/records.ts"],
  policies: { archive: { text: "Authenticated owners or supervisors may archive records.", location: "author-policy#archive", revision: "v1", acceptance: "accepted" as const, reason: "Explicit synthetic task policy." } },
  principals: { actor: { role: "member", facts: ["Alice is authenticated."] } }, resources: { record: { type: "record", facts: ["Owned by Alice."] } },
  entries: { archive: { name: "archiveRecord", locations: [{ path: "src/records.ts", startLine: 1, endLine: 1 }] } },
  scenarios: { archive: { principal: "actor", resource: "record", policy: "archive", entries: ["archive"], relation: "owner", operation: "archive", expectation: "allow" } },
})
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "af-plan-")); roots.push(root)
  await mkdir(path.join(root, "base/project/src"), { recursive: true })
  await writeFile(path.join(root, "base/project/src/records.ts"), "export function archiveRecord() {}\r\n")
  await writeFile(path.join(root, "base/input.json"), JSON.stringify(baseInput(), null, 2).replaceAll("\n", "\r\n"))
  await writeFile(path.join(root, "changes.json"), "[]\r\n")
  await writeFile(path.join(root, "workspace.json"), JSON.stringify({ schemaVersion: "authorization-scenario-workspace/v1", base: "base/input.json", variants: [{ id: "owner", replacements: "changes.json" }] }))
  return { root, workspace: path.join(root, "workspace.json"), out: path.join(root, "generated") }
}
test("plan relocates the base coordinate, retains policy text and omissions, and writes nothing", async () => {
  const f = await fixture(); const before = await readdir(f.root)
  const sourceBefore = await readFile(path.join(f.root, "base/input.json"), "utf8")
  const result = await planAuthorizationWorkspace(f.workspace, f.out)
  expect(result.status).toBe("valid"); expect(result.diagnostics).toEqual([])
  expect(result.variants[0]!.input.sourceRoot).toBe("../base/project")
  expect(result.variants[0]!.input.policies).toEqual(baseInput().policies)
  expect(result.variants[0]!.input.principals.actor).not.toHaveProperty("capabilities")
  expect(result.variants[0]!.input).not.toHaveProperty("additionalQuestions")
  expect(result.variants[0]!.provenance.changedFields).toEqual([])
  expect(result.variants[0]!.provenance.sourceRoot.relativeToFile).toBe(path.join(f.root, "base/input.json"))
  expect(await readFile(path.join(f.root, "base/input.json"), "utf8")).toBe(sourceBefore)
  expect(await readdir(f.root)).toEqual(before)
})
test("replacement sourceRoot is workspace-relative, independent of invocation cwd", async () => {
  const f = await fixture()
  await writeFile(path.join(f.root, "changes.json"), JSON.stringify([{ field: "sourceRoot", value: "base/project", origin: "source selection" }, { field: "taskId", value: "explicit-task", origin: "author" }]))
  const first = await planAuthorizationWorkspace(f.workspace, f.out)
  const cwd = process.cwd()
  try { process.chdir(os.tmpdir()); expect(await planAuthorizationWorkspace(f.workspace, f.out)).toEqual(first) } finally { process.chdir(cwd) }
  expect(first.status).toBe("valid")
  expect(first.variants[0]!.input.sourceRoot).toBe("../base/project")
  expect(first.variants[0]!.input.taskId).toBe("explicit-task")
  expect(first.variants[0]!.provenance.fieldOrigins.sourceRoot).toBe("source selection")
  expect(first.variants[0]!.provenance.sourceRoot.relativeToFile).toBe(f.workspace)
})
test.each([
  [{ field: "unknown", value: 1, origin: "author" }, "unknown"],
  [[{ field: "taskId", value: "a", origin: "a" }, { field: "taskId", value: "b", origin: "b" }], "taskId"],
  [{ field: "sources", value: "wrong", origin: "author" }, "sources"],
  [{ field: "scenarios", value: { ...baseInput().scenarios, archive: { ...baseInput().scenarios.archive, principal: "missing" } }, origin: "author" }, "scenarios.archive.principal"],
  [{ field: "entries", value: { archive: { name: "archiveRecord", locations: [{ path: "src/records.ts", startLine: 1, endLine: 999 }] } }, origin: "author" }, "entries.archive.locations.0"],
])("plan diagnoses variant and exact field for %j", async (replacement, field) => {
  const f = await fixture()
  await writeFile(path.join(f.root, "changes.json"), JSON.stringify(Array.isArray(replacement) ? replacement : [replacement]))
  const result = await planAuthorizationWorkspace(f.workspace, f.out)
  expect(result.status).toBe("invalid")
  expect(result.diagnostics.some(d => d.variantId === "owner" && d.field === field)).toBe(true)
})
test("missing base and missing source have actionable file/variant diagnostics", async () => {
  const f = await fixture()
  await rm(path.join(f.root, "base/project/src/records.ts"))
  const missingSource = await planAuthorizationWorkspace(f.workspace, f.out)
  expect(missingSource.status).toBe("invalid")
  expect(missingSource.diagnostics[0]!.variantId).toBe("owner")
  await rm(path.join(f.root, "base/input.json"))
  const missingBase = await planAuthorizationWorkspace(f.workspace, f.out)
  expect(missingBase.status).toBe("invalid")
  expect(missingBase.diagnostics[0]!.field).toBe("base")
})
test("relocation cannot legitimize a sourceRoot junction outside the authored boundary", async () => {
  const f = await fixture()
  await rm(path.join(f.root, "base/project"), { recursive: true })
  await mkdir(path.join(f.root, "shared/src"), { recursive: true })
  await writeFile(path.join(f.root, "shared/src/records.ts"), "// source\n")
  await symlink(path.join(f.root, "shared"), path.join(f.root, "base/project"), process.platform === "win32" ? "junction" : "dir")
  const result = await planAuthorizationWorkspace(f.workspace, f.out)
  expect(result.status).toBe("invalid")
  expect(result.diagnostics.some(d => d.variantId === "owner" && d.field === "sourceRoot")).toBe(true)
})
