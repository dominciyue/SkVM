import { readFile, writeFile, lstat, open, unlink } from "node:fs/promises"
import path from "node:path"
import syntheticAssessment from "../../examples/authorization-assessment/assessment.json" with { type: "json" }
import syntheticAuthoringV2 from "../../examples/authorization-assessment/authoring-v2.json" with { type: "json" }
import { normalizeAuthorizationAuthoringInput } from "../benchmarks/authorization-dsl/authoring.ts"
import { authoringEditorGuidance } from "../benchmarks/authorization-dsl/editor-support/schema.ts"
import { createAuthorizationAuthoringDraft } from "../benchmarks/authorization-dsl/authoring-assist.ts"
import { compileAuthorizationTaskAuthoring } from "../benchmarks/authorization-dsl/authoring-task.ts"
import { locateAuthorizationSource } from "../benchmarks/authorization-dsl/source-location.ts"
import {
  runLocalAuthorizationCli,
  type LocalAuthorizationCliDependencies,
} from "../benchmarks/authorization-dsl/local-run.ts"

export interface AuthorizationCliDependencies extends LocalAuthorizationCliDependencies {}

class AuthorizationCliError extends Error {
  constructor(message: string, readonly exitCode: 1 | 2) {
    super(message)
    this.name = "AuthorizationCliError"
  }
}

function parseOptions(args: string[], allowed: Set<string>): Record<string, string> {
  const options: Record<string, string> = {}
  for (const argument of args) {
    if (!argument.startsWith("--") || !argument.includes("=")) {
      throw new AuthorizationCliError(`Invalid argument ${argument}; expected --name=value.`, 2)
    }
    const separator = argument.indexOf("=")
    const name = argument.slice(2, separator)
    const value = argument.slice(separator + 1)
    if (!allowed.has(name)) throw new AuthorizationCliError(`Unknown option --${name}.`, 2)
    if (value.length === 0) throw new AuthorizationCliError(`Option --${name} requires a value.`, 2)
    if (options[name] !== undefined) {
      throw new AuthorizationCliError(`Option --${name} was provided more than once.`, 2)
    }
    options[name] = value
  }
  return options
}

function requireOption(options: Record<string, string>, name: string): string {
  const value = options[name]
  if (!value) throw new AuthorizationCliError(`init requires --${name}=<value>.`, 2)
  return value
}

async function writeNewJson(outputPath: string, value: unknown): Promise<void> {
  try {
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : ""
    if (code === "EEXIST") {
      throw new AuthorizationCliError(`Authorization output already exists and was not overwritten: ${outputPath}`, 1)
    }
    throw new AuthorizationCliError(`Could not create authorization output ${outputPath}: ${String(error)}`, 1)
  }
}

async function initializeAuthorizationInput(
  args: string[],
  dependencies: AuthorizationCliDependencies,
): Promise<number> {
  const options = parseOptions(args, new Set(["out", "from", "format", "context", "task", "field-origin"]))
  if (options.format && options.format !== "authoring-v2") throw new AuthorizationCliError("format must be authoring-v2 or omitted.", 2)
  if (options.format && options.from) throw new AuthorizationCliError("Use --format for a template or --from for normalization, not both.", 2)
  if (options.task && !options.context) throw new AuthorizationCliError("--task requires --context for explicit source and entry scope.", 2)
  if (options["field-origin"] && (!options.task || !["user-explicit", "model-authored"].includes(options["field-origin"]))) throw new AuthorizationCliError("--field-origin requires --task and must be user-explicit or model-authored.", 2)
  const outputPath = path.resolve(requireOption(options, "out"))
  if (options.context) {
    if (options.from || options.format) throw new AuthorizationCliError("--context generates a domain draft; use it without --from or --format.", 2)
    const contextPath = path.resolve(options.context), context = JSON.parse(await readFile(contextPath, "utf8"))
    if (typeof context.sourceRoot !== "string" || path.isAbsolute(context.sourceRoot) || path.win32.isAbsolute(context.sourceRoot)) throw new AuthorizationCliError("Context sourceRoot must be relative to its file.", 1)
    const root = path.resolve(path.dirname(contextPath), context.sourceRoot)
    const sourceRoot = path.relative(path.dirname(outputPath), root).split(path.sep).join("/") || "."
    if (path.isAbsolute(sourceRoot) || path.win32.isAbsolute(sourceRoot)) throw new AuthorizationCliError("Context and draft must share a filesystem volume.", 1)
    const result = options.task
      ? compileAuthorizationTaskAuthoring({ ...context, sourceRoot }, JSON.parse(await readFile(path.resolve(options.task), "utf8")), { fieldOrigin: options["field-origin"] as "user-explicit" | "model-authored" | undefined })
      : createAuthorizationAuthoringDraft({ ...context, sourceRoot })
    if (result.status === "needs-input" && options.task) {
      dependencies.stdout(JSON.stringify({ status: result.status, diagnostics: result.diagnostics, outputPath: null }, null, 2))
      return 1
    }
    const taskResult = result.status === "ready" ? result : undefined
    const draftResult: ReturnType<typeof createAuthorizationAuthoringDraft> | undefined = !options.task
      ? result as ReturnType<typeof createAuthorizationAuthoringDraft>
      : undefined
    if (!taskResult && !draftResult) throw new AuthorizationCliError("Task compilation did not produce a usable result.", 1)
    const stem = outputPath.replace(/\.json$/i, "")
    const entrySeedPath = `${stem}.entry-seed.json`, guidePath = `${stem}.authoring-guide.md`, provenancePath = `${stem}.field-provenance.json`
    const outputs = taskResult
      ? [{ path: outputPath, content: `${JSON.stringify(taskResult.authoring, null, 2)}\n` }, { path: entrySeedPath, content: `${JSON.stringify(taskResult.entrySeed, null, 2)}\n` }, { path: provenancePath, content: `${JSON.stringify(taskResult.provenance, null, 2)}\n` }]
      : [{ path: outputPath, content: `${JSON.stringify(draftResult!.draft, null, 2)}\n` }, { path: entrySeedPath, content: `${JSON.stringify(draftResult!.entrySeed, null, 2)}\n` }, { path: guidePath, content: draftResult!.guide }]
    // Check the complete file group before claiming any path; wx also protects concurrent creation.
    for (const file of outputs) {
      try { await lstat(file.path); throw new AuthorizationCliError(`Authorization output already exists: ${file.path}`, 1) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
    }
    const claimed: Array<{ path: string; handle: Awaited<ReturnType<typeof open>> }> = []
    try {
      for (const file of outputs) claimed.push({ path: file.path, handle: await open(file.path, "wx") })
      for (const [i, file] of outputs.entries()) await claimed[i]!.handle.writeFile(file.content, "utf8")
    } catch (error) {
      for (const file of claimed) { await file.handle.close(); await unlink(file.path) }
      throw error
    }
    for (const file of claimed) await file.handle.close()
    dependencies.stdout(JSON.stringify({ schemaVersion: "authorization-cli-init/v1", status: "created", mode: taskResult ? "task-authoring" : "context-draft", draftStatus: result.status, outputPath, entrySeedPath,
      ...(taskResult ? { provenancePath, provenance: taskResult.provenance } : { guidePath, knownFields: draftResult!.knownFields }),
      synthetic: false, sourceRefVerification: "authored", diagnostics: result.diagnostics, authoringSupport: authoringEditorGuidance() }, null, 2))
    return 0
  }
  let value: unknown = structuredClone(options.format ? syntheticAuthoringV2 : syntheticAssessment)
  let mode: "synthetic-template" | "normalized-authoring" = "synthetic-template"
  let provenance: unknown

  if (options.from) {
    const authoringPath = path.resolve(options.from)
    if (path.dirname(authoringPath) !== path.dirname(outputPath)) {
      throw new AuthorizationCliError(
        "--from and --out must be in the same directory so relative sourceRoot semantics remain unchanged.",
        2,
      )
    }
    let authoring: unknown
    try {
      authoring = JSON.parse(await readFile(authoringPath, "utf8"))
    } catch (error) {
      throw new AuthorizationCliError(`Could not read authoring input ${authoringPath}: ${String(error)}`, 1)
    }
    const normalized = normalizeAuthorizationAuthoringInput(authoring)
    if (normalized.status !== "ready") {
      dependencies.stdout(JSON.stringify(normalized, null, 2))
      return 1
    }
    value = normalized.normalizedInput
    provenance = normalized.provenance
    mode = "normalized-authoring"
  }

  await writeNewJson(outputPath, value)
  dependencies.stdout(JSON.stringify({
    schemaVersion: "authorization-cli-init/v1",
    status: "created",
    mode,
    outputPath,
    synthetic: mode === "synthetic-template",
    sourceRefVerification: "authored",
    ...(provenance ? { provenance } : {}),
    ...(options.format === "authoring-v2" ? { authoringSupport: authoringEditorGuidance() } : {}),
  }, null, 2))
  return 0
}

export function authorizationCliHelp(): string {
  return [
    "skvm authorization — bounded source-visible authorization assessment",
    "",
    "Commands:",
    "  locate --root=<project> --file=<relative-path> --match=<literal-text> [--limit=20]",
    "  init --out=<assessment.json> [--from=<authoring.json> | --format=authoring-v2 | --context=<context.json> [--task=<task-authoring.json> [--field-origin=user-explicit|model-authored]]]",
    "  compose --workspace=<workspace.json> --out=<new-directory> [--check-only]",
    "  prepare --input=<assessment.json> (--request=<request.json> | --reuse=<previous-assessment.json>) --out=<new-directory> [--context=callable-v1] [--check-only=true] [--discover=true] [--proposal-model=<provider/model>] [--proposal-timeout-ms=300000]",
    "  edit --input=<authoring-v2.json> --edit=<patch.json> --out=<new-directory> [--check-only=true]",
    "  check --input=<assessment.json> [--method=plain|ledger|conditions] [--arm=N|B|D] [--wire=legacy|v4|v5|v6] [--assessment=legacy|explicit-v1] [--task-contract=current-v1] [--reasoning=standard|control-binding-v1]",
    "  run --input=<assessment.json> --model=<provider/model> --out=<output-root> [--method=plain|ledger|conditions] [--arm=N|B|D] [--wire=legacy|v4|v5|v6] [--assessment=legacy|explicit-v1] [--task-contract=current-v1] [--reasoning=standard|control-binding-v1]",
    "  inspect --out=<output-root-or-session>",
    "  compare --previous=<session> --input=<assessment.json> [--method=plain|ledger|conditions] [--wire=legacy|v4|v5|v6] [--assessment=legacy|explicit-v1] [--task-contract=current-v1] [--reasoning=standard|control-binding-v1]",
    "",
    "init never overwrites an existing file. With --from, keep authoring and output beside each other so sourceRoot stays bounded.",
    "compose previews or creates a new scenario directory from one common authoring base and explicit replacements; no provider is initialized.",
    "prepare request/v2 retains separate original source segments. --discover=true locates support inside the allowlist; optional proposal allows two position rounds and one format revision, all durably accounted. check-only never calls a provider.",
    "run and an explicitly requested prepare proposal initialize a provider. A condition request in the input opts into wire/v3; otherwise the existing ledger path is used.",
    "Explicit method uses B and conflicts with arm N/D. conditions needs a condition request; plain/ledger leave it unexecuted.",
    "An analysisContract selects explicit-v1 and wire/v6 by default; --assessment=legacy preserves the same public requirements without the program. Explicit-v1 requires v6. Older inputs retain their historical defaults.",
    "check/run accept --wire=legacy|v4|v5|v6. legacy selects v1/v2/v3 by method; v4 is compact, v5 adds policyStatus, and v6 reports observed behavior for host comparison.",
    "--reasoning=control-binding-v1 adds bounded source-grounded control/target, path, exception and decisive-fact questions; standard is the default.",
    "locate reads only the explicit file; --match is literal. Lines refer to the current provided file; multiple matches require author selection.",
  ].join("\n")
}

export async function runAuthorizationCli(
  argv: string[],
  dependencies: AuthorizationCliDependencies,
): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    dependencies.stdout(authorizationCliHelp())
    return 0
  }
  try {
    if (argv[0] === "locate") {
      const options = parseOptions(argv.slice(1), new Set(["root", "file", "match", "limit"]))
      for (const name of ["root", "file", "match"]) {
        if (!options[name]) throw new AuthorizationCliError(`locate requires --${name}=<value>.`, 2)
      }
      const report = await locateAuthorizationSource({root: options.root!, file: options.file!, match: options.match!, ...(options.limit ? {limit: Number(options.limit)} : {})})
      dependencies.stdout(JSON.stringify(report, null, 2))
      return report.status === "invalid" ? 1 : 0
    }
    if (argv[0] === "init") return await initializeAuthorizationInput(argv.slice(1), dependencies)
    if (argv[0] === "compose") {
      const { runAuthorizationComposeCli } = await import("./authorization-compose.ts")
      return runAuthorizationComposeCli(argv.slice(1), dependencies)
    }
    if (argv[0] === "prepare") {
      const { runAuthorizationPrepareCli } = await import("./authorization-prepare.ts")
      return runAuthorizationPrepareCli(argv.slice(1), dependencies)
    }
    if (argv[0] === "edit") {
      const { runAuthorizationEditCli } = await import("./authorization-edit.ts")
      return runAuthorizationEditCli(argv.slice(1), dependencies)
    }
    return await runLocalAuthorizationCli(argv, dependencies)
  } catch (error) {
    dependencies.stderr(error instanceof Error ? error.message : String(error))
    return error instanceof AuthorizationCliError ? error.exitCode : 1
  }
}

if (import.meta.main) {
  const exitCode = await runAuthorizationCli(process.argv.slice(2), {
    stdout: value => console.log(value),
    stderr: value => console.error(value),
    env: process.env,
  })
  process.exitCode = exitCode
}
