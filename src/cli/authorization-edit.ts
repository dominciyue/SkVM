import { lstat, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { applyAuthorizationLocalEdit } from "../benchmarks/authorization-dsl/authoring-workspace/local-edit.ts"
import { composeAuthorizationAuthoring } from "../benchmarks/authorization-dsl/authoring-compose.ts"
import { loadLocalAuthorizationInput } from "../benchmarks/authorization-dsl/local-input.ts"
import type { LocalAuthorizationCliDependencies } from "../benchmarks/authorization-dsl/local-run.ts"

function optionsFor(args: string[]) {
  const options: Record<string, string> = {}
  for (const arg of args) {
    const matched = /^--(input|edit|out|check-only)=(.+)$/.exec(arg)
    if (!matched || options[matched[1]!] !== undefined) throw new Error(`Invalid or duplicate edit option: ${arg}`)
    options[matched[1]!] = matched[2]!
  }
  for (const key of ["input", "edit", "out"]) if (!options[key]) throw new Error(`edit requires --${key}=<path>.`)
  if (options["check-only"] && options["check-only"] !== "true" && options["check-only"] !== "false") throw new Error("--check-only must be true or false.")
  return { inputFile: path.resolve(options.input!), editFile: path.resolve(options.edit!), outDir: path.resolve(options.out!), checkOnly: options["check-only"] === "true" }
}

/** Publish a local patch as an ordinary authoring/v2 input at a new coordinate. */
export async function runAuthorizationEditCli(args: string[], dependencies: LocalAuthorizationCliDependencies): Promise<number> {
  let staging: string | undefined, parent: string | undefined, published = false
  try {
    const options = optionsFor(args)
    const baseBytes = await readFile(options.inputFile, "utf8")
    const base = JSON.parse(baseBytes)
    const edit = JSON.parse(await readFile(options.editFile, "utf8"))
    const checkedBase = await loadLocalAuthorizationInput(options.inputFile)
    if (checkedBase.status !== "valid") {
      dependencies.stdout(JSON.stringify({ status: "needs-input", diagnostics: checkedBase.diagnostics, outputPath: null }, null, 2))
      return 1
    }
    const result = applyAuthorizationLocalEdit(base, edit)
    const { value, draft, ...summary } = result
    const effectiveSourceRoot = path.resolve(path.dirname(options.inputFile), base.sourceRoot)
    const relativeSourceRoot = path.relative(options.outDir, effectiveSourceRoot).split(path.sep).join("/") || "."
    if (path.isAbsolute(relativeSourceRoot) || path.win32.isAbsolute(relativeSourceRoot)) throw new Error("Edited output and source root must be on one filesystem volume.")
    let authored = value
    if (authored) {
      const fields = [...new Set(result.changedPaths.map(field => field.split(".")[0]!))]
      const composed = composeAuthorizationAuthoring(base, fields.map(field => ({ field, value: authored![field as keyof typeof authored], origin: edit.reason })))
      authored = composed.input
    }
    if (options.checkOnly) {
      dependencies.stdout(JSON.stringify({ ...summary, outputPath: null, sourceRootRelocation: relativeSourceRoot }, null, 2))
      return result.status === "ready" ? 0 : 1
    }
    try { await lstat(options.outDir); throw new Error(`Output already exists: ${options.outDir}`) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    parent = await realpath(path.dirname(options.outDir))
    staging = await mkdtemp(path.join(parent, ".authorization-edit-"))
    const report = { ...summary, baseFile: options.inputFile, baseSha256: createHash("sha256").update(baseBytes).digest("hex"),
      editFile: options.editFile, sourceRootRelocation: relativeSourceRoot }
    await writeFile(path.join(staging, "edit-report.json"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    if (authored) {
      await writeFile(path.join(staging, "assessment.json"), `${JSON.stringify({ ...authored, sourceRoot: relativeSourceRoot }, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
      // The staging and published directories are siblings, so both resolve the same source boundary.
      const checked = await loadLocalAuthorizationInput(path.join(staging, "assessment.json"))
      if (checked.status !== "valid") throw new Error(`Edited input failed local validation: ${checked.diagnostics.map(item => `${item.code}: ${item.message}`).join("; ")}`)
    } else if (draft) {
      await writeFile(path.join(staging, "draft.json"), `${JSON.stringify({ ...draft, sourceRoot: relativeSourceRoot }, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    }
    await rename(staging, options.outDir)
    published = true
    dependencies.stdout(JSON.stringify({ ...report, outputPath: options.outDir, ...(authored ? { inputPath: path.join(options.outDir, "assessment.json") } : {}) }, null, 2))
    return authored ? 0 : 1
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error))
    return 1
  } finally {
    if (staging && parent && !published) {
      const relative = path.relative(parent, staging)
      if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
        try { await rm(staging, { recursive: true, force: false }) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") dependencies.stderr(`Could not clean edit staging: ${String(error)}`) }
      }
    }
  }
}
