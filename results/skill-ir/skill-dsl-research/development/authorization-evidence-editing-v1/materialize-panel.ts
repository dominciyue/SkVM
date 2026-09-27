import { existsSync } from "node:fs"
import path from "node:path"
import { runAuthorizationCli } from "../../../../../src/cli/authorization.ts"

const root = import.meta.dir
const ids = ["owui-file", "fastapi-superuser-read", "memos-create-share", "memos-get-shared", "memos-member-leave", "paperless-download", "paperless-note-post", "paperless-share-create"]
const output: Array<{ id: string; baseline: string; full: string; prepared: string }> = []

async function cli(args: string[]) {
  const stdout: string[] = [], stderr: string[] = []
  const code = await runAuthorizationCli(args, { stdout: value => stdout.push(value), stderr: value => stderr.push(value),
    providerFactory: () => { throw new Error("panel materialization must not initialize a provider") } })
  if (code !== 0) throw new Error(`${args[0]} ${args.find(arg => arg.startsWith("--input=")) ?? ""}: ${stderr.join("; ") || stdout.join("; ")}`)
  return stdout.at(-1) ?? ""
}

for (const id of ids) {
  const caseRoot = path.join(root, "inputs", id)
  const baseline = path.join(caseRoot, "baseline", "authoring.json")
  const full = path.join(caseRoot, "full", "authoring.json")
  const prepared = path.join(caseRoot, "prepared-final", "assessment.json")
  await cli(["check", `--input=${baseline}`, "--method=plain", "--wire=v6", "--assessment=explicit-v1", "--reasoning=standard"])
  await cli(["check", `--input=${full}`, "--method=plain", "--wire=v6", "--assessment=explicit-v1", "--reasoning=standard"])
  if (!existsSync(path.dirname(prepared))) await cli(["prepare", `--input=${full}`, `--request=${path.join(caseRoot, "request.json")}`, `--out=${path.dirname(prepared)}`])
  await cli(["check", `--input=${prepared}`, "--method=plain", "--wire=v6", "--assessment=explicit-v1", "--reasoning=standard"])
  output.push({ id, baseline, full, prepared })
}
process.stdout.write(`${output.length} cases checked at baseline, full fixed source and ordinary prepared input; zero provider calls.\n`)
