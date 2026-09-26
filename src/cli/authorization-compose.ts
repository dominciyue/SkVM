import { planAuthorizationWorkspace } from "../benchmarks/authorization-dsl/authoring-workspace/plan.ts"
import { materializeAuthorizationWorkspace } from "../benchmarks/authorization-dsl/authoring-workspace/materialize.ts"
import { compareAuthorizationWorkspaces, snapshotAuthorizationWorkspace } from "../benchmarks/authorization-dsl/authoring-workspace/changes.ts"

export interface AuthorizationComposeCliIO {
  stdout: (value: string) => void
  stderr: (value: string) => void
}
const help = "authorization compose --workspace=<workspace.json> --out=<new-directory> [--check-only] [--compare-with=<old-workspace.json>]\nRead-only check and comparison need no provider. Publication currently supports Windows; the output parent must exist."

/** Standalone or routed from authorization compose. This module never initializes a provider. */
export async function runAuthorizationComposeCli(args: string[], io: AuthorizationComposeCliIO = { stdout: value => console.log(value), stderr: value => console.error(value) }): Promise<number> {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) { io.stdout(help); return 0 }
  let workspace: string | undefined, out: string | undefined, compareWith: string | undefined, checkOnly = false
  const seen = new Set<string>()
  try {
    for (const argument of args) {
      if (argument === "--check-only") {
        if (seen.has("check-only")) throw new Error("--check-only was provided more than once.")
        seen.add("check-only"); checkOnly = true; continue
      }
      const match = /^--(workspace|out|compare-with)=(.+)$/.exec(argument)
      if (!match || !match[2]!.trim()) throw new Error(`Invalid argument ${argument}. ${help}`)
      const key = match[1]!, value = match[2]!
      if (seen.has(key)) throw new Error(`--${key} was provided more than once.`)
      seen.add(key)
      if (key === "workspace") workspace = value
      else if (key === "compare-with") compareWith = value
      else out = value
    }
    if (!workspace || !out) throw new Error(`Both --workspace and --out are required. ${help}`)
    if (compareWith && !checkOnly) throw new Error("--compare-with requires --check-only.")
  } catch (error) { io.stderr(error instanceof Error ? error.message : String(error)); return 2 }
  try {
    const result = compareWith
      ? compareAuthorizationWorkspaces(
          snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(compareWith, `${out}.previous-preview`)),
          snapshotAuthorizationWorkspace(await planAuthorizationWorkspace(workspace, out)),
        )
      : await (checkOnly ? planAuthorizationWorkspace : materializeAuthorizationWorkspace)(workspace, out)
    io.stdout(JSON.stringify(result, null, 2))
    return result.status === "invalid" ? 1 : 0
  } catch (error) { io.stderr(error instanceof Error ? error.message : String(error)); return 1 }
}

if (import.meta.main) process.exitCode = await runAuthorizationComposeCli(process.argv.slice(2))
