import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { planAuthorizationWorkspace } from "./plan.ts"
import { compareAuthorizationWorkspaces, snapshotAuthorizationWorkspace } from "./changes.ts"

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ah-workspace-changes-"))
  roots.push(root)
  await mkdir(path.join(root, "project", "src"), { recursive: true })
  await writeFile(path.join(root, "project", "src", "records.ts"), "export function archiveRecord() {}\n")
  const base = {
    schemaVersion: "authorization-assessment-authoring/v2", taskId: "synthetic-owner", request: "Can this member archive a record?",
    repository: "https://example.test/records", sourceRef: "synthetic-v1", sourceRoot: "project", sources: ["src/records.ts"],
    policies: { archive: { text: "Only owners may archive.", location: "author-policy", revision: "v1", acceptance: "accepted", reason: "Synthetic task rule." } },
    principals: { actor: { role: "member", facts: ["Authenticated."] } }, resources: { record: { type: "record", facts: ["Selected record."] } },
    entries: { archive: { name: "archiveRecord", locations: [{ path: "src/records.ts", startLine: 1, endLine: 1 }] } },
    scenarios: { archive: { principal: "actor", resource: "record", policy: "archive", entries: ["archive"], relation: "owner", operation: "archive", expectation: "allow" } },
  }
  async function writeVersion(name: string, policyText: string, ids: string[]) {
    const dir = path.join(root, name)
    await mkdir(dir)
    const versionBase = structuredClone(base)
    versionBase.sourceRoot = "../project"
    versionBase.policies.archive.text = policyText
    await writeFile(path.join(dir, "base.json"), JSON.stringify(versionBase))
    const variants = []
    for (const id of ids) {
      const replacements = id === "override" ? [{ field: "policies", value: base.policies, origin: "explicit variant policy" }] : []
      await writeFile(path.join(dir, `${id}.json`), JSON.stringify(replacements))
      variants.push({ id, replacements: `${id}.json` })
    }
    const workspace = path.join(dir, "workspace.json")
    await writeFile(workspace, JSON.stringify({ schemaVersion: "authorization-scenario-workspace/v1", base: "base.json", variants }))
    return { workspace, out: path.join(dir, "generated") }
  }
  return { root, base, writeVersion }
}

test("common policy change reaches inherited variants and flags an explicit override without pretending it changed", async () => {
  const f = await fixture()
  const beforeFiles = await f.writeVersion("before", "Only owners may archive.", ["owner", "second", "override", "removed"])
  const afterFiles = await f.writeVersion("after", "Owners or supervisors may archive.", ["owner", "second", "override", "added"])
  const before = snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(beforeFiles.workspace, beforeFiles.out))
  const after = snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(afterFiles.workspace, afterFiles.out))
  const report = compareAuthorizationWorkspaces(before, after)
  expect(report.status).toBe("valid")
  expect(report.commonChangedFields).toContain("policies")
  for (const id of ["owner", "second"]) {
    const variant = report.variants.find(item => item.id === id)!
    expect(variant.effectiveChangedFields).toContain("policies")
    expect(variant.inheritedChangedFields).toContain("policies")
    expect(variant.reviewReasons).toContain("effective-input-changed")
  }
  const overridden = report.variants.find(item => item.id === "override")!
  expect(overridden.effectiveChangedFields).not.toContain("policies")
  expect(overridden.overriddenChangedFields).toContain("policies")
  expect(overridden.reviewReasons).toContain("common-change-overridden")
  expect(report.variants.find(item => item.id === "added")?.membership).toBe("added")
  expect(report.variants.find(item => item.id === "removed")?.membership).toBe("removed")
})

test("same value whole-field replacement is still explicit, and path relocation with equal source bytes is not an effective source change", async () => {
  const f = await fixture()
  const beforeFiles = await f.writeVersion("before", "Only owners may archive.", ["owner", "override"])
  const afterFiles = await f.writeVersion("after", "Only owners may archive.", ["owner", "override"])
  const before = snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(beforeFiles.workspace, beforeFiles.out))
  const after = snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(afterFiles.workspace, afterFiles.out))
  const report = compareAuthorizationWorkspaces(before, after)
  expect(report.status).toBe("valid")
  expect(report.commonChangedFields).toEqual([])
  expect(report.variants.every(item => item.effectiveChangedFields.length === 0)).toBe(true)
  expect(after.plan.variants.find(item => item.id === "override")?.provenance.changedFields).toContain("policies")
  expect(await readFile(beforeFiles.workspace, "utf8")).toBe(await readFile(afterFiles.workspace, "utf8"))
})

test("an invalid plan cannot produce usable change judgments", async () => {
  const f = await fixture()
  const beforeFiles = await f.writeVersion("before", "Only owners may archive.", ["owner"])
  const afterFiles = await f.writeVersion("after", "Only owners may archive.", ["owner"])
  const before = snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(beforeFiles.workspace, beforeFiles.out))
  const bad = JSON.parse(await readFile(path.join(f.root, "after", "base.json"), "utf8"))
  bad.scenarios.archive.principal = "missing"
  await writeFile(path.join(f.root, "after", "base.json"), JSON.stringify(bad))
  const after = snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(afterFiles.workspace, afterFiles.out))
  const report = compareAuthorizationWorkspaces(before, after)
  expect(report.status).toBe("invalid")
  expect(report.variants).toEqual([])
  expect(report.diagnostics.join(" ")).toContain("principal")
})

test("source byte changes require review even when declaration paths stay the same", async () => {
  const f = await fixture()
  const files = await f.writeVersion("same", "Only owners may archive.", ["owner"])
  const before = snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(files.workspace, files.out))
  await writeFile(path.join(f.root, "project", "src", "records.ts"), "export function archiveRecord() { return true }\n")
  const after = snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(files.workspace, files.out))
  const report = compareAuthorizationWorkspaces(before, after)
  expect(report.status).toBe("valid")
  expect(report.commonChangedFields).toEqual([])
  expect(report.variants[0]?.effectiveChangedFields).toContain("sourceContent")
  expect(report.variants[0]?.reviewReasons).toContain("effective-input-changed")
})
