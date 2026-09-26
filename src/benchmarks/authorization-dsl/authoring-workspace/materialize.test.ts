import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { watch, mkdirSync } from "node:fs"
import { materializeAuthorizationWorkspace } from "./materialize.ts"
import { loadLocalAuthorizationInput } from "../local-input.ts"

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "af-publish-")); roots.push(root)
  const base = JSON.parse(await readFile(new URL("../../../../examples/authorization-assessment/editor-support/authoring.json", import.meta.url), "utf8"))
  await mkdir(path.join(root, "project/src"), { recursive: true })
  await writeFile(path.join(root, "project/src/records.ts"), "// synthetic source only\r\n".repeat(12))
  await writeFile(path.join(root, "base.json"), JSON.stringify(base))
  await writeFile(path.join(root, "first.json"), "[]")
  await writeFile(path.join(root, "second.json"), JSON.stringify([{ field: "taskId", value: "second-task", origin: "author" }]))
  await writeFile(path.join(root, "workspace.json"), JSON.stringify({ schemaVersion: "authorization-scenario-workspace/v1", base: "base.json", variants: [{ id: "first", replacements: "first.json" }, { id: "second", replacements: "second.json" }] }))
  return { root, workspace: path.join(root, "workspace.json"), out: path.join(root, "generated") }
}
test("bad second variant leaves no output or staging directory", async () => {
  const f = await fixture()
  await writeFile(path.join(f.root, "second.json"), JSON.stringify([{ field: "sources", value: ["missing.ts"], origin: "author" }]))
  const before = await readdir(f.root)
  const result = await materializeAuthorizationWorkspace(f.workspace, f.out)
  expect(result.status).toBe("invalid")
  expect(result.diagnostics.some(d => d.variantId === "second")).toBe(true)
  expect(await readdir(f.root)).toEqual(before)
})
test("existing empty output directory is never replaced or removed", async () => {
  const f = await fixture(); await mkdir(f.out)
  const result = await materializeAuthorizationWorkspace(f.workspace, f.out)
  expect(result.status).toBe("invalid")
  expect(result.diagnostics.some(d => d.code === "workspace-output-exists")).toBe(true)
  expect(await readdir(f.out)).toEqual([])
})
test.skipIf(process.platform !== "win32")("successful publication contains complete ordinary inputs and provenance", async () => {
  const f = await fixture(); const baseBefore = await readFile(path.join(f.root, "base.json"), "utf8")
  const sourceBefore = await readFile(path.join(f.root, "project/src/records.ts"), "utf8")
  const result = await materializeAuthorizationWorkspace(f.workspace, f.out)
  expect(result.status).toBe("created")
  expect((await readdir(f.out)).sort()).toEqual(["first.json", "first.provenance.json", "second.json", "second.provenance.json"])
  for (const id of ["first", "second"]) {
    expect((await loadLocalAuthorizationInput(path.join(f.out, `${id}.json`))).status).toBe("valid")
    expect(JSON.parse(await readFile(path.join(f.out, `${id}.json`), "utf8")).sourceRoot).toBe("../project")
  }
  expect(await readFile(path.join(f.root, "base.json"), "utf8")).toBe(baseBefore)
  expect(await readFile(path.join(f.root, "project/src/records.ts"), "utf8")).toBe(sourceBefore)
  expect((await readdir(f.root)).filter(name => name.startsWith(".authorization-compose-"))).toEqual([])
})
test.skipIf(process.platform !== "win32")("concurrent creation publishes exactly one complete directory", async () => {
  const f = await fixture()
  const results = await Promise.all([materializeAuthorizationWorkspace(f.workspace, f.out), materializeAuthorizationWorkspace(f.workspace, f.out)])
  expect(results.map(result => result.status).sort()).toEqual(["created", "invalid"])
  expect(await readdir(f.out)).toHaveLength(4)
  expect((await readdir(f.root)).filter(name => name.startsWith(".authorization-compose-"))).toEqual([])
})
test.skipIf(process.platform !== "win32")("a competing empty directory created after planning is preserved", async () => {
  const f = await fixture()
  let competitorCreated = false
  const watcher = watch(f.root, (_event, filename) => {
    if (!competitorCreated && filename?.toString().startsWith(".authorization-compose-")) {
      mkdirSync(f.out); competitorCreated = true
    }
  })
  try {
    const result = await materializeAuthorizationWorkspace(f.workspace, f.out)
    expect(competitorCreated).toBe(true)
    expect(result.status).toBe("invalid")
    expect(result.diagnostics.some(d => d.code === "workspace-publication-failed")).toBe(true)
    expect(await readdir(f.out)).toEqual([])
    expect((await readdir(f.root)).filter(name => name.startsWith(".authorization-compose-"))).toEqual([])
  } finally { watcher.close() }
})
test.skipIf(process.platform === "win32")("unsupported platforms fail closed without writes", async () => {
  const f = await fixture(); const before = await readdir(f.root)
  const result = await materializeAuthorizationWorkspace(f.workspace, f.out)
  expect(result.diagnostics.some(d => d.code === "workspace-publication-unsupported")).toBe(true)
  expect(await readdir(f.root)).toEqual(before)
})
