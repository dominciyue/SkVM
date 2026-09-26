import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { runAuthorizationCli } from "../../../cli/authorization.ts"
import { AuthorizationAuthoringInputV2Schema } from "../authoring-v2.ts"
import { normalizeAuthorizationAuthoringInput } from "../authoring.ts"
import { loadAuthoringEditorSchema, checkEditorStructure } from "./schema.ts"
import { createStructuralFixtures, createRuntimeOnlyFixtures, findStructuralDrift, runtimeOnlyChecks, verifyEditorSupport } from "./verify.ts"

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const exampleRoot = path.join(repoRoot, "examples/authorization-assessment/editor-support")
const resultsRoot = path.join(repoRoot, "results/skill-ir/authorization-editor-support-20260926")

test("the draft-07 editor schema is available as a local asset", () => {
  const schemaPath = fileURLToPath(new URL("../../../../schemas/authorization/authoring-v2.schema.json", import.meta.url))
  expect(existsSync(schemaPath)).toBe(true)
})

test("load returns a draft-07 schema copy without exposing mutable validator state", () => {
  const schema = loadAuthoringEditorSchema()
  expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
  schema.additionalProperties = true
  expect(loadAuthoringEditorSchema().additionalProperties).toBe(false)
})

test("finite structural fixtures agree with the real v2 parser", () => {
  for (const fixture of createStructuralFixtures()) {
    const before = JSON.stringify(fixture.value)
    const editor = checkEditorStructure(fixture.value)
    expect(editor.valid).toBe(fixture.valid)
    expect(AuthorizationAuthoringInputV2Schema.safeParse(fixture.value).success).toBe(fixture.valid)
    expect(editor.diagnostics.length === 0).toBe(fixture.valid)
    expect(JSON.stringify(fixture.value)).toBe(before)
  }
})

test("diagnostics identify missing and unknown fields including escaped dictionary names", () => {
  const value: any = createStructuralFixtures()[0]!.value
  value.scenarios["slash/~name"] = { ...value.scenarios.archive, unexpected: true }
  delete value.taskId
  const result = checkEditorStructure(value)
  expect(result.valid).toBe(false)
  expect(result.diagnostics.some(d => d.path === "/taskId")).toBe(true)
  expect(result.diagnostics.some(d => d.path === "/scenarios/slash~1~0name/unexpected")).toBe(true)
  expect(result.diagnostics.every(d => d.message.length > 0)).toBe(true)
})

test("field coverage follows nested runtime objects, required keys and structure", () => {
  expect(findStructuralDrift(loadAuthoringEditorSchema())).toEqual([])
  const changed: any = loadAuthoringEditorSchema()
  delete changed.definitions.principal.properties.role
  expect(findStructuralDrift(changed).some(d => d.path.includes("principals.*"))).toBe(true)
  const changedRequired: any = loadAuthoringEditorSchema()
  changedRequired.required = changedRequired.required.filter((name: string) => name !== "taskId")
  expect(findStructuralDrift(changedRequired).some(d => d.message.includes("required"))).toBe(true)
  const changedBound: any = loadAuthoringEditorSchema()
  changedBound.definitions.analyzeConditions.properties.maxBranches.maximum = 13
  expect(findStructuralDrift(changedBound).some(d => d.path.endsWith("maxBranches"))).toBe(true)
  const newerRuntime = AuthorizationAuthoringInputV2Schema.extend({ newPublicField: AuthorizationAuthoringInputV2Schema.shape.taskId.optional() })
  expect(findStructuralDrift(loadAuthoringEditorSchema(), newerRuntime).some(d => d.message.includes("newPublicField"))).toBe(true)
})

test("explicit runtime-only cases remain editor-valid but fail the authoritative runtime", () => {
  for (const fixture of createRuntimeOnlyFixtures()) {
    expect(checkEditorStructure(fixture.value).valid).toBe(true)
    const normalized = normalizeAuthorizationAuthoringInput(fixture.value)
    expect(normalized.status).toBe("needs-input")
    expect(normalized.diagnostics.length).toBeGreaterThan(0)
    expect(runtimeOnlyChecks.some(item => item.id === fixture.check)).toBe(true)
  }
})

test("verification reports parity and rejects schema drift", () => {
  const report = verifyEditorSupport()
  expect(report.valid).toBe(true)
  expect(report.diagnostics).toEqual([])
  expect(report.structuralCases).toBeGreaterThan(35)
  expect(report.runtimeOnlyCases).toBeGreaterThan(5)
  const permissive: any = loadAuthoringEditorSchema()
  permissive.additionalProperties = true
  expect(verifyEditorSupport(permissive).valid).toBe(false)
})

test("the private editor association targets authoring.json and resolves from the example workspace", async () => {
  const settings = JSON.parse(await readFile(path.join(exampleRoot, ".vscode/settings.json"), "utf8"))
  const association = settings["json.schemas"][0]
  expect(association.fileMatch).toEqual(["/authoring.json"])
  expect(path.resolve(exampleRoot, association.url)).toBe(path.join(repoRoot, "schemas/authorization/authoring-v2.schema.json"))
  expect(JSON.parse(await readFile(path.resolve(exampleRoot, association.url), "utf8"))).toEqual(loadAuthoringEditorSchema())
  const declaration = JSON.parse(await readFile(path.join(exampleRoot, "authoring.json"), "utf8"))
  expect(declaration.$schema).toBeUndefined()
})

test("a copied ordinary directory checks source locations without providers or rewriting inputs", async () => {
  // Keep all test writes inside AC's owned results root, including temporary copies.
  await mkdir(resultsRoot, { recursive: true })
  const root = await mkdtemp(path.join(resultsRoot, "check-temp-"))
  try {
    await cp(exampleRoot, root, { recursive: true })
    await mkdir(path.join(root, "schemas"), { recursive: true })
    await cp(path.join(repoRoot, "schemas/authorization/authoring-v2.schema.json"), path.join(root, "schemas/authoring-v2.schema.json"))
    const settings = { "json.schemas": [{ fileMatch: ["/authoring.json"], url: "./schemas/authoring-v2.schema.json" }] }
    await writeFile(path.join(root, ".vscode/settings.json"), JSON.stringify(settings))
    expect(existsSync(path.resolve(root, settings["json.schemas"][0]!.url))).toBe(true)
    const input = path.join(root, "authoring.json")
    const source = path.join(root, "project/src/records.ts")
    const originalInput = await readFile(input, "utf8")
    const originalSource = await readFile(source, "utf8")
    let providerFactories = 0
    const output: string[] = []
    const deps = { stdout: (s: string) => output.push(s), stderr: (s: string) => output.push(s), providerFactory: () => { providerFactories++; throw new Error("Editor support must never initialize a provider") } }
    expect(await runAuthorizationCli(["check", `--input=${input}`], deps)).toBe(0)
    const report = JSON.parse(output.at(-1)!)
    expect(report.status).toBe("valid")
    expect(report.diagnostics).toEqual([])
    expect(report.sourceRoot).toBe(path.join(root, "project"))
    expect(await runAuthorizationCli(["locate", `--root=${root}/project`, "--file=src/records.ts", "--match=export function archiveRecord"], deps)).toBe(0)
    const located = JSON.parse(output.at(-1)!)
    expect(located.lineNumberBasis).toBe("current-provided-file")
    expect(located.status).toBe("unique")
    expect(located.matches[0].line).toBe(JSON.parse(originalInput).entries.archive.locations[0].startLine)
    expect(await readFile(input, "utf8")).toBe(originalInput)
    expect(await readFile(source, "utf8")).toBe(originalSource)
    for (const [field, mutate] of [
      ["sourceRoot", (v: any) => { v.sourceRoot = "../outside" }],
      ["sources", (v: any) => { v.sources = ["src/missing.ts"] }],
      ["entries.archive.locations.0", (v: any) => { v.entries.archive.locations[0].endLine = 999 }],
    ] as const) {
      const value = JSON.parse(originalInput)
      mutate(value)
      expect(checkEditorStructure(value).valid).toBe(true)
      await writeFile(input, JSON.stringify(value))
      expect(await runAuthorizationCli(["check", `--input=${input}`], deps)).toBe(1)
      const invalid = JSON.parse(output.at(-1)!)
      expect(invalid.status).toBe("invalid")
      expect(invalid.diagnostics.length).toBeGreaterThan(0)
      if (field !== "sources") expect(invalid.diagnostics.some((d: any) => d.path === field)).toBe(true)
    }
    expect(providerFactories).toBe(0)
    expect(await readFile(path.join(exampleRoot, "authoring.json"), "utf8")).toBe(originalInput)
    expect(await readFile(path.join(exampleRoot, "project/src/records.ts"), "utf8")).toBe(originalSource)
  } finally {
    // root is created by mkdtemp under our literal owned results directory.
    if (path.dirname(root) !== resultsRoot) throw new Error("Refusing cleanup outside AC results")
    await rm(root, { recursive: true, force: true })
  }
})
