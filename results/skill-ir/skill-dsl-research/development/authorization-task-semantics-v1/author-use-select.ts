import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { AuthorizationAuthoringInputV2Schema } from "../../../../../src/benchmarks/authorization-dsl/authoring-v2.ts"
import { loadLocalAuthorizationInputValue } from "../../../../../src/benchmarks/authorization-dsl/local-input.ts"
import { materializeAuthorizationWorkspace } from "../../../../../src/benchmarks/authorization-dsl/authoring-workspace/materialize.ts"

const root = import.meta.dir
const phase = process.argv[2]
if (!["original", "changed", "compose"].includes(phase ?? "")) throw Error("Usage: bun author-use-select.ts original|changed|compose")
const only = process.argv.find(argument => argument.startsWith("--only="))?.slice("--only=".length)
const attemptNumber = Number(process.argv.find(argument => argument.startsWith("--attempt="))?.slice("--attempt=".length) ?? "1")
if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw Error("--attempt must be a positive integer")
const briefs = JSON.parse(await readFile(path.join(root, "author-neutral-briefs.json"), "utf8"))
const attemptsDir = path.join(root, "author-attempts", "use")
const result: Array<Record<string, unknown>> = []
const jsonText = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

for (const brief of briefs.packages) {
  const packageRoot = path.join(root, "author-packages", brief.id)
  if (phase === "compose") {
    const original = JSON.parse(await readFile(path.join(packageRoot, "dsl", "original.json"), "utf8"))
    const changed = JSON.parse(await readFile(path.join(packageRoot, "dsl", "changed.json"), "utf8"))
    const fields = Object.keys(changed).filter(field => JSON.stringify(changed[field]) !== JSON.stringify(original[field]))
    const replacements = fields.map(field => ({ field, value: changed[field], origin: `independent structured author changed delivery: ${brief.changeRequest}` }))
    await writeFile(path.join(packageRoot, "original-replacements.json"), "[]\n", { flag: "wx" })
    await writeFile(path.join(packageRoot, "changed-replacements.json"), jsonText(replacements), { flag: "wx" })
    const workspace = { schemaVersion: "authorization-scenario-workspace/v1", base: "dsl/original.json", variants: [{ id: "original", replacements: "original-replacements.json" }, { id: "changed", replacements: "changed-replacements.json" }] }
    const workspaceFile = path.join(packageRoot, "workspace.json")
    await writeFile(workspaceFile, jsonText(workspace), { flag: "wx" })
    const composed = await materializeAuthorizationWorkspace(workspaceFile, path.join(packageRoot, "generated"))
    const row = { packageId: brief.id, phase, status: composed.status, changedFields: fields, diagnostics: composed.diagnostics, variants: composed.variants.map(item => ({ id: item.id, inputPath: item.inputPath })) }
    await writeFile(path.join(packageRoot, "composition.json"), jsonText(row), { flag: "wx" })
    result.push(row)
    continue
  }
  for (const representation of ["markdown", "dsl"] as const) {
    const id = `${brief.id}-${representation}-${phase}`
    if (only && only !== id) continue
    const deliveryDir = path.join(packageRoot, representation)
    await mkdir(deliveryDir, { recursive: true })
    const attempt = JSON.parse(await readFile(path.join(attemptsDir, `${id}${attemptNumber === 1 ? "" : `-attempt${attemptNumber}`}.json`), "utf8"))
    const raw = typeof attempt.response?.text === "string" ? attempt.response.text.trim() : ""
    const file = path.join(deliveryDir, `${phase}.${representation === "markdown" ? "md" : "json"}`)
    const attemptCheck = path.join(deliveryDir, `${phase}-check-attempt${attemptNumber}.json`)
    const saveCheck = async (row: Record<string, unknown>) => {
      await writeFile(attemptCheck, jsonText(row), { flag: "wx" })
      if (row.status === "valid") await writeFile(path.join(deliveryDir, `${phase}-check.json`), jsonText(row), { flag: "wx" })
    }
    if (attempt.status === "transport-failed") {
      const row = { id, attemptNumber, status: "transport-failed", diagnostics: [{ code: "provider-network", message: attempt.message }] }
      await saveCheck(row)
      result.push(row)
      continue
    }
    if (representation === "markdown") {
      const row = { id, attemptNumber, status: raw && !raw.startsWith("```") ? "valid" : "invalid", characters: raw.length }
      await saveCheck(row)
      if (row.status === "valid") await writeFile(file, `${raw}\n`, { flag: "wx" })
      result.push(row)
      continue
    }
    const candidate = raw.startsWith("```json") && raw.endsWith("```") ? raw.slice(7, -3).trim() : raw
    let value: unknown
    try { value = JSON.parse(candidate) }
    catch (error) {
      const row = { id, attemptNumber, status: "invalid", diagnostics: [{ code: "json-parse", message: error instanceof Error ? error.message : String(error) }] }
      await saveCheck(row)
      result.push(row)
      continue
    }
    const schema = AuthorizationAuthoringInputV2Schema.safeParse(value)
    const checked = schema.success ? await loadLocalAuthorizationInputValue(value, file) : undefined
    const diagnostics = schema.success ? checked!.status === "invalid" ? checked!.diagnostics : [] : schema.error.issues.map(issue => ({ code: "schema-invalid", path: issue.path.join("."), message: issue.message }))
    const row = { id, attemptNumber, status: schema.success && checked!.status === "valid" ? "valid" : "invalid", diagnostics }
    await saveCheck(row)
    if (row.status === "valid") await writeFile(file, `${candidate}\n`, { flag: "wx" })
    result.push(row)
  }
}
console.log(JSON.stringify(result))
