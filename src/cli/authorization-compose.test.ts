import { afterEach, expect, test } from "bun:test"
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { runAuthorizationComposeCli } from "./authorization-compose.ts"

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const capture = () => { const output: string[] = [], errors: string[] = []; return { output, errors, stdout: (value: string) => output.push(value), stderr: (value: string) => errors.push(value) } }
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "af-cli-")); roots.push(root)
  await cp(new URL("../../examples/authorization-assessment/editor-support/project", import.meta.url), path.join(root, "project"), { recursive: true })
  await cp(new URL("../../examples/authorization-assessment/editor-support/authoring.json", import.meta.url), path.join(root, "base.json"))
  await writeFile(path.join(root, "changes.json"), "[]")
  await writeFile(path.join(root, "workspace.json"), JSON.stringify({ schemaVersion: "authorization-scenario-workspace/v1", base: "base.json", variants: [{ id: "owner", replacements: "changes.json" }] }))
  return { root, workspace: path.join(root, "workspace.json"), out: path.join(root, "generated") }
}
test.each([[], ["--workspace=x"], ["--out=x"], ["--workspace=x", "--out=y", "--provider=x"], ["--workspace=x", "--out=y", "--check-only=true"], ["--workspace=x", "--workspace=y", "--out=z"], ["--workspace=x", "--out=y", "--check-only", "--check-only"]].map(args => ({ args })))
("invalid arguments return 2: %j", async ({ args }) => {
  const io = capture(); expect(await runAuthorizationComposeCli(args, io)).toBe(2); expect(io.errors.length).toBe(1)
})
test("check-only returns the complete plan without writes or provider setup", async () => {
  const f = await fixture(), io = capture(), before = await readdir(f.root)
  expect(await runAuthorizationComposeCli([`--workspace=${f.workspace}`, `--out=${f.out}`, "--check-only"], io)).toBe(0)
  expect(JSON.parse(io.output[0]!).status).toBe("valid")
  expect(JSON.parse(io.output[0]!).variants[0].provenance.changedFields).toEqual([])
  expect(await readdir(f.root)).toEqual(before)
  expect(io.errors).toEqual([])
})
test("CLI prints exact variant/field semantic diagnostics and returns 1", async () => {
  const f = await fixture(), io = capture()
  const base = JSON.parse(await readFile(path.join(f.root, "base.json"), "utf8"))
  base.scenarios.archive.principal = "missing"
  await writeFile(path.join(f.root, "base.json"), JSON.stringify(base))
  expect(await runAuthorizationComposeCli([`--workspace=${f.workspace}`, `--out=${f.out}`, "--check-only"], io)).toBe(1)
  expect(JSON.parse(io.output[0]!).diagnostics.some((d: any) => d.variantId === "owner" && d.field === "scenarios.archive.principal")).toBe(true)
})
test.skipIf(process.platform !== "win32")("CLI publishes ordinary v2 and refuses a second publication", async () => {
  const f = await fixture(), io = capture()
  expect(await runAuthorizationComposeCli([`--workspace=${f.workspace}`, `--out=${f.out}`], io)).toBe(0)
  expect(JSON.parse(io.output[0]!).status).toBe("created")
  expect(JSON.parse(await readFile(path.join(f.out, "owner.json"), "utf8")).schemaVersion).toBe("authorization-assessment-authoring/v2")
  expect(await runAuthorizationComposeCli([`--workspace=${f.workspace}`, `--out=${f.out}`], capture())).toBe(1)
})
test("standalone runtime import graph has no provider or execution host", async () => {
  const pending = [fileURLToPath(new URL("./authorization-compose.ts", import.meta.url))], visited = new Set<string>()
  const scanner = new Bun.Transpiler({ loader: "ts" })
  while (pending.length) {
    const file = pending.pop()!
    if (visited.has(file)) continue
    visited.add(file)
    for (const imported of scanner.scanImports(await readFile(file, "utf8"))) {
      if (imported.path.startsWith(".") && imported.path.endsWith(".ts")) pending.push(path.resolve(path.dirname(file), imported.path))
    }
  }
  expect([...visited].filter(file => /[\\/]providers[\\/]|[\\/]host\.ts$|[\\/]local-run\.ts$/.test(file))).toEqual([])
})
