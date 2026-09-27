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
test("check-only compare reports a common policy override without writing either workspace", async () => {
  const f = await fixture(), io = capture()
  const oldWorkspace = path.join(f.root, "old-workspace.json")
  const oldBase = path.join(f.root, "old-base.json")
  await writeFile(oldBase, await readFile(path.join(f.root, "base.json"), "utf8"))
  await writeFile(oldWorkspace, JSON.stringify({ schemaVersion: "authorization-scenario-workspace/v1", base: "old-base.json", variants: [{ id: "owner", replacements: "changes.json" }] }))
  const current = JSON.parse(await readFile(path.join(f.root, "base.json"), "utf8"))
  current.policies.archive.text += " Supervisors may also archive."
  await writeFile(path.join(f.root, "base.json"), JSON.stringify(current))
  const code = await runAuthorizationComposeCli([`--workspace=${f.workspace}`, `--out=${f.out}`, "--check-only", `--compare-with=${oldWorkspace}`], io)
  expect(code).toBe(0)
  const report = JSON.parse(io.output[0]!)
  expect(report.status).toBe("valid")
  expect(report.commonChangedFields).toContain("policies")
  expect(report.variants[0].effectiveChangedFields).toContain("policies")
})
test("workspace tracks analysisContract inheritance, whole-field override and a current scenario summary", async () => {
  const f = await fixture(), io = capture()
  const basePath = path.join(f.root, "base.json")
  const base: any = JSON.parse(await readFile(basePath, "utf8"))
  const sidecar = { schemaVersion: "authorization-analysis-contract/v1", publicInstruction: "Assess the given entry.", scenarios: { archive: { boundary: "declared-entry", premises: [{ id: "caller", statement: "The given support caller reaches archiveRecord.", atEntry: "archive", provenance: "task-assumption" }], requestedBranches: [], requiredResponseDetails: [] } } }
  base.analysisContract = sidecar
  await writeFile(basePath, JSON.stringify(base))
  const oldBasePath = path.join(f.root, "old-base.json")
  await writeFile(oldBasePath, JSON.stringify(base))
  const oldWorkspace = path.join(f.root, "old-workspace.json")
  await writeFile(oldWorkspace, JSON.stringify({ schemaVersion: "authorization-scenario-workspace/v1", base: "old-base.json", variants: [{ id: "owner", replacements: "changes.json" }] }))
  base.analysisContract.scenarios.archive.premises[0].statement = "The changed support caller reaches archiveRecord."
  await writeFile(basePath, JSON.stringify(base))
  expect(await runAuthorizationComposeCli([`--workspace=${f.workspace}`, `--out=${f.out}`, "--check-only", `--compare-with=${oldWorkspace}`], io)).toBe(0)
  const report = JSON.parse(io.output[0]!)
  expect(report.commonChangedFields).toContain("analysisContract")
  expect(report.variants[0].effectiveChangedFields).toContain("analysisContract")
  expect(report.variants[0].inheritedChangedFields).toContain("analysisContract")
  const planIo = capture()
  expect(await runAuthorizationComposeCli([`--workspace=${f.workspace}`, `--out=${f.out}`, "--check-only"], planIo)).toBe(0)
  expect(JSON.parse(planIo.output[0]!).variants[0].provenance.scenarioSummary[0].boundary).toBe("declared-entry")
  await writeFile(path.join(f.root, "changes.json"), JSON.stringify([{ field: "analysisContract", value: sidecar, origin: "author override" }]))
  const overrideIo = capture()
  expect(await runAuthorizationComposeCli([`--workspace=${f.workspace}`, `--out=${f.out}`, "--check-only", `--compare-with=${oldWorkspace}`], overrideIo)).toBe(0)
  expect(JSON.parse(overrideIo.output[0]!).variants[0].overriddenChangedFields).toContain("analysisContract")
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
