import { cp, copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"
import os from "node:os"
import { bbRoot, repo, root, sha, write } from "./study.ts"
import { executeLocalInquiryRun, loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"

/** Exercise ordinary CLI/session contracts without requesting any inference.
 * The intentionally unavailable mock provider supplies no task/source meaning. */
export async function verifyPublicCommands() {
  const originalFile = path.join(bbRoot, "model/packages/download/inquiry.json"), bytes = await readFile(originalFile), loaded = await loadInquiryInput(originalFile)
  const directory = await mkdtemp(path.join(os.tmpdir(), "bc-public-commands-")), inputFile = path.join(directory, "inquiry.json"), changedFile = path.join(directory, "changed.json")
  await copyFile(originalFile, inputFile); await cp(loaded.context.sourceRoot, path.join(directory, "source"), { recursive: true })
  const commands: Array<{ arguments: string[]; exitCode: number; status?: string; providerCalls?: number }> = []
  const cli = (args: string[]) => {
    const execution = spawnSync(process.execPath, ["src/index.ts", "authorization", "inquiry", ...args], { cwd: repo, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 30000 })
    if (execution.error || execution.status === null) throw new Error(`Public ${args[0]} command did not terminate: ${execution.error?.message}`)
    const value = JSON.parse(execution.stdout)
    if (execution.status !== 0 && !(args[0] === "inspect" && execution.status === 1 && value.status === "provider-unavailable" && value.providerDispatches === 0)) throw new Error(`Unexpected public ${args[0]} exit ${execution.status}: ${value.status}`)
    commands.push({ arguments: args, exitCode: execution.status, status: value.status, providerCalls: value.providerCalls }); return value
  }
  const checked = cli(["check", `--input=${inputFile}`, "--method=D1", "--strategy=task-binding-v1"])
  const report: any = await executeLocalInquiryRun({ inputFile, outDir: path.join(directory, "runs"), method: "D1", strategy: "task-binding-v1", model: "offline-contract", providerFactory: () => { throw new Error("Explicit zero-inference public-contract fixture") } })
  const inspected = cli(["inspect", `--out=${report.sessionPath}`]), editFile = path.join(directory, "premise-edit.json")
  const question = loaded.value.inquiry!.questions[1]!
  await writeFile(editFile, JSON.stringify({ schemaVersion: "authorization-inquiry-edit/v1", reason: "Explicit offline premise edit", operations: [{ kind: "premises", questionId: question.id, premises: [{ text: "The authenticated caller owns the requested document.", origin: "user" }] }] }), "utf8")
  cli(["edit", `--input=${inputFile}`, `--edit=${editFile}`, `--out=${changedFile}`])
  const comparison = cli(["compare", `--input=${changedFile}`, `--previous=${report.sessionPath}`, "--strategy=task-binding-v1"]), changed = await loadInquiryInput(changedFile)
  return { schemaVersion: "authorization-bc-public-command-check/v1", modelCalls: 0, scope: "CLI/session/byte contracts only; no successful model preparation, source meaning or reuse is claimed", directory, originalInputSha256: sha(bytes), originalBytesUnchanged: sha(await readFile(originalFile)) === sha(bytes) && sha(await readFile(inputFile)) === sha(bytes), checkStatus: checked.status, inspectStatus: inspected.status, originalQuestionCount: loaded.value.inquiry!.questions.length, changedQuestionCount: changed.value.inquiry!.questions.length, commands, comparison: { premiseOnly: comparison.premiseOnly, sourceChanged: comparison.sourceChanged, answerReused: comparison.answerReused, providerCalls: comparison.providerCalls, reuseEligibility: comparison.reuseEligibility } }
}
if (import.meta.main) { const result = await verifyPublicCommands(); await write(path.join(root, "verification/public-command-contract.json"), result, true); console.log(JSON.stringify(result)) }
