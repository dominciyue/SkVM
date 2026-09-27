import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { prepareAuthorizationEvidence } from "../benchmarks/authorization-dsl/evidence-preparation/prepare.ts"
import { loadLocalAuthorizationInput } from "../benchmarks/authorization-dsl/local-input.ts"
import type { LocalAuthorizationCliDependencies } from "../benchmarks/authorization-dsl/local-run.ts"

function optionsFor(args: string[]) {
  const options: Record<string, string> = {}
  for (const arg of args) {
    const matched = /^--(input|request|out|check-only)=(.+)$/.exec(arg)
    if (!matched || options[matched[1]!] !== undefined) throw new Error(`Invalid or duplicate prepare option: ${arg}`)
    options[matched[1]!] = matched[2]!
  }
  for (const key of ["input", "request", "out"]) if (!options[key]) throw new Error(`prepare requires --${key}=<path>.`)
  if (options["check-only"] && options["check-only"] !== "true" && options["check-only"] !== "false") throw new Error("--check-only must be true or false.")
  return { inputFile: path.resolve(options.input!), requestFile: path.resolve(options.request!), outDir: path.resolve(options.out!), checkOnly: options["check-only"] === "true" }
}

/** Thin, provider-free publication of prepared ordinary input and exact source snapshots. */
export async function runAuthorizationPrepareCli(args: string[], dependencies: LocalAuthorizationCliDependencies): Promise<number> {
  let staging: string | undefined
  let parent: string | undefined
  let published = false
  try {
    const options = optionsFor(args)
    const request = JSON.parse(await readFile(options.requestFile, "utf8"))
    const prepared = await prepareAuthorizationEvidence({ inputFile: options.inputFile, outDir: options.outDir, request })
    if (prepared.report.status === "invalid" || !prepared.preparedInput) {
      dependencies.stdout(JSON.stringify({ ...prepared.report, outputPath: null }, null, 2))
      return 1
    }
    if (options.checkOnly) {
      dependencies.stdout(JSON.stringify({ ...prepared.report, outputPath: null }, null, 2))
      return 0
    }
    try { await lstat(options.outDir); throw new Error(`Output already exists: ${options.outDir}`) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    parent = await realpath(path.dirname(options.outDir))
    staging = await mkdtemp(path.join(parent, ".authorization-prepare-"))
    for (const snapshot of prepared.snapshots) {
      const target = path.join(staging, "source", ...snapshot.path.split("/"))
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, snapshot.content, { encoding: "utf8", flag: "wx" })
    }
    await writeFile(path.join(staging, "assessment.json"), `${JSON.stringify(prepared.preparedInput, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    await writeFile(path.join(staging, "report.json"), `${JSON.stringify(prepared.report, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    const checked = await loadLocalAuthorizationInput(path.join(staging, "assessment.json"))
    if (checked.status !== "valid") throw new Error(`Prepared input failed local validation: ${checked.diagnostics.map(item => `${item.code}: ${item.message}`).join("; ")}`)
    await rename(staging, options.outDir)
    published = true
    dependencies.stdout(JSON.stringify({ ...prepared.report, outputPath: options.outDir, inputPath: path.join(options.outDir, "assessment.json") }, null, 2))
    return 0
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error))
    return 1
  } finally {
    if (staging && parent && !published) {
      const relative = path.relative(parent, staging)
      if (relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
        try { await rm(staging, { recursive: true, force: false }) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") dependencies.stderr(`Could not clean prepare staging: ${String(error)}`) }
      }
    }
  }
}
