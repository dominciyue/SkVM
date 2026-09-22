import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import syntheticAssessment from "../../examples/authorization-assessment/assessment.json" with { type: "json" }
import { normalizeAuthorizationAuthoringInput } from "../benchmarks/authorization-dsl/authoring.ts"
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
  const options = parseOptions(args, new Set(["out", "from"]))
  const outputPath = path.resolve(requireOption(options, "out"))
  let value: unknown = structuredClone(syntheticAssessment)
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
  }, null, 2))
  return 0
}

export function authorizationCliHelp(): string {
  return [
    "skvm authorization — bounded source-visible authorization assessment",
    "",
    "Commands:",
    "  init --out=<assessment.json> [--from=<authoring.json>]",
    "  check --input=<assessment.json> [--method=plain|ledger|conditions] [--arm=N|B|D]",
    "  run --input=<assessment.json> --model=<provider/model> --out=<output-root> [--method=plain|ledger|conditions] [--arm=N|B|D]",
    "  inspect --out=<output-root-or-session>",
    "",
    "init never overwrites an existing file. With --from, keep authoring and output beside each other so sourceRoot stays bounded.",
    "Only run initializes a provider. A condition request in the input opts into wire/v3; otherwise the existing ledger path is used.",
    "Explicit method uses B and conflicts with arm N/D. conditions needs a condition request; plain/ledger leave it unexecuted.",
    "check/run accept --wire=legacy|v4. legacy selects v1/v2/v3 by method; v4 is compact and currently opt-in.",
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
    if (argv[0] === "init") return await initializeAuthorizationInput(argv.slice(1), dependencies)
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
