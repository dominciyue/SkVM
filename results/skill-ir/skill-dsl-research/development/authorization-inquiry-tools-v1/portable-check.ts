import path from "node:path"
import os from "node:os"
import { mkdtemp, cp, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { runAuthorizationCli } from "../../../../../src/cli/authorization.ts"

const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const sha = (text: string) => createHash("sha256").update(text).digest("hex")
const recordFile = path.join(root, "portable-check.json")
if (process.argv[2] === "replay") {
  const record = JSON.parse(await readFile(recordFile, "utf8"))
  if (!record.passed || record.providerCalls !== 0 || record.currentCompare !== "current" || record.changedCompare !== "needs-review") throw new Error("Portable verification record invalid")
  if (sha(await readFile(path.join(repo, "examples/authorization-assessment/reusable-skill/inquiry.json"), "utf8")) !== record.exampleInputSha256) throw new Error("Portable example identity changed")
  console.log("Portable record replayed; zero provider calls")
} else if (process.argv[2] === "check") {
  const portableRoot = await mkdtemp(path.join(os.tmpdir(), "skvm-authorization-ao-")), example = path.join(portableRoot, "example")
  await cp(path.join(repo, "examples/authorization-assessment/reusable-skill"), example, { recursive: true, force: false, errorOnExist: true })
  const outputs: any[] = []; let providerCalls = 0
  const command = async (args: string[]) => {
    let report: any, error: string | undefined
    const code = await runAuthorizationCli(["inquiry", ...args], { stdout: text => { report = JSON.parse(text) }, stderr: text => { error = text }, providerFactory: () => { providerCalls++; throw new Error("Portable verification cannot initialize a provider") } })
    if (code !== 0) throw new Error(`Portable ordinary command failed: ${JSON.stringify({ args, error, report })}`)
    outputs.push({ command: args[0], status: report.status, providerCalls: report.providerCalls ?? 0 }); return report
  }
  await command(["check", `--input=${path.join(example, "inquiry.json")}`, "--method=D1"])
  await command(["edit", `--input=${path.join(example, "inquiry.json")}`, `--edit=${path.join(example, "inquiry-edit.json")}`, `--out=${path.join(example, "changed-inquiry.json")}`])
  await command(["check", `--input=${path.join(example, "changed-inquiry.json")}`, "--method=M"])
  const previous = path.join(root, "runs/quality-paperless-download-M"), realInput = JSON.parse(await readFile(path.join(root, "inputs/paperless-download.json"), "utf8"))
  await cp(path.join(root, "public-source/paperless"), path.join(portableRoot, "source"), { recursive: true, force: false, errorOnExist: true })
  realInput.sourceRoot = "source"; const inputFile = path.join(portableRoot, "input.json")
  await writeFile(inputFile, JSON.stringify(realInput), { encoding: "utf8", flag: "wx" })
  const inspected = await command(["inspect", `--out=${previous}`])
  const current = await command(["compare", `--input=${inputFile}`, `--previous=${previous}`])
  const editFile = path.join(portableRoot, "edit.json"), changedFile = path.join(portableRoot, "changed.json")
  await writeFile(editFile, JSON.stringify({ schemaVersion: "authorization-inquiry-edit/v1", reason: "Explicit current request changes", operations: [{ kind: "request", statement: realInput.brief + " Also explain the original-file selection branch explicitly." }] }), { encoding: "utf8", flag: "wx" })
  await command(["edit", `--input=${inputFile}`, `--edit=${editFile}`, `--out=${changedFile}`])
  const changed = await command(["compare", `--input=${changedFile}`, `--previous=${previous}`])
  if (providerCalls !== 0 || current.status !== "current" || changed.status !== "needs-review" || changed.answerReused !== false) throw new Error("Portable applicability verification failed")
  await writeFile(recordFile, JSON.stringify({ schemaVersion: "authorization-ao-portable-check/v1", passed: true, checkedAt: new Date().toISOString(), portableRoot, exampleInputSha256: sha(await readFile(path.join(example, "inquiry.json"), "utf8")), runtime: "existing checkout/Bun dependencies", originalSession: path.relative(root, inspected.sessionPath), currentCompare: current.status, changedCompare: changed.status, providerCalls, targetExecutions: 0, commands: outputs, sourceCopy: "byte-identical original Paperless source, relative root relocated" }, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
  console.log("One outside-checkout ordinary copy passed check/edit/inspect/compare; zero provider calls")
} else throw new Error("Use check once, then replay")
