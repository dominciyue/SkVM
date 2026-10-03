import path from "node:path"
import { mkdir, writeFile, readFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { adaptTraceFile } from "../../../../../src/jit-optimize/trace-adapters.ts"

const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const capture = path.join(repo, ".skvm/log/runtime/bare-agent/xty--gpt-5.6-sol/natural-702d1a1a6869/20261003-220531-run-bar-0f87e0f2/optimization-session.json")
const output = path.join(root, "ordinary/author-workflows-materialization-repaired")
const skill = path.join(path.dirname(root), "authorization-domain-execution-v1/model/source-skills/github-security-review")
await mkdir(output, { recursive: true })
const adapted = await adaptTraceFile(capture), materialized = adapted.records[0]?.workDirSnapshot?.files.get("workflow-inventory.json")
const actual = await readFile(path.join(root, "ordinary/author-workflows-repaired/workdir/workflow-inventory.json"), "utf8")
const verification = { capturedSourceRun: capture, actualInventoryValid: !!JSON.parse(actual), optimizerInventoryValid: !!JSON.parse(materialized!), exactInventoryPreserved: materialized === actual, providerCalls: 0, sourceRerun: false }
if (!verification.exactInventoryPreserved) throw new Error("Original inventory was changed during adaptation")
const args = ["jit-optimize", `--skill=${skill}`, "--task-source=log", `--logs=${capture}`, "--optimizer-model=xty/gpt-5.6-sol", "--target-model=xty/gpt-5.6-sol", "--target-adapter=bare-agent", "--rounds=1", "--timeout-ms=900000", `--package-out=${path.join(output, "exported-package")}`]
await writeFile(path.join(output, "claim.json"), JSON.stringify({ at: new Date().toISOString(), revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), args, verification, originalArtifactsPreserved: true }, null, 2) + "\n", { flag: "wx" })
const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: repo, env: process.env, stdout: "pipe", stderr: "pipe" })
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
await writeFile(path.join(output, "stdout.txt"), stdout)
await writeFile(path.join(output, "stderr.txt"), stderr)
await writeFile(path.join(output, "process-result.json"), JSON.stringify({ at: new Date().toISOString(), exitCode, actualUSD: null, sourceRerun: false }, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ output, exitCode }))
