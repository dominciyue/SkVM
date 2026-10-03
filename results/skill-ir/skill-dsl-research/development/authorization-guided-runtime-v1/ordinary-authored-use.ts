import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"
import { readFile, writeFile, mkdir, mkdtemp, cp, stat } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import { inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"

const root = import.meta.dir, repo = path.resolve(root, "../../../../.."), action = process.argv[2]
const author = action === "github-memos" ? "author-authorization-github-memos-repaired" : action === "cloudflare-download" ? "author-authorization-cloudflare-download" : undefined
if (!author) throw new Error("Use github-memos|cloudflare-download; Notes is sealed")
const authorDir = path.join(root, "ordinary", author), authored = JSON.parse(await readFile(path.join(authorDir, "process-result.json"), "utf8"))
if (authored.validation.status !== "valid" || authored.additionalDiagnostics.length) throw new Error("Author delivery is not ready for consumption")
const sourceInput = JSON.parse(await readFile(path.join(authorDir, "source-inputs.json"), "utf8"))
if (!isDeepStrictEqual(authored.validation.sourceFiles, sourceInput.copiedSourceFiles)) throw new Error("Author changed the copied original source bytes")
const stage = `consume-authorization-${action}`, output = path.join(root, "ordinary", stage), model = "xty/gpt-5.6-sol"
await mkdir(output, { recursive: true })
const workDir = await mkdtemp(path.join(os.tmpdir(), `portable-${stage}-`)), input = await readFile(path.join(authorDir, "authored-inquiry.json")), usage = await readFile(path.join(authorDir, "authored-USAGE.md"))
await writeFile(path.join(workDir, "inquiry.json"), input, { flag: "wx" }); await writeFile(path.join(workDir, "USAGE.md"), usage, { flag: "wx" })
for (const file of ["task.json", "format.schema.json", "cli-usage.txt"]) await cp(path.join(authored.workDir, file), path.join(workDir, file), { force: false, errorOnExist: true })
await cp(path.join(authored.workDir, "source"), path.join(workDir, "source"), { recursive: true, force: false, errorOnExist: true })
const skills = path.join(authored.workDir, ".skvm/skills")
if (await stat(skills).catch(() => undefined)) await cp(skills, path.join(workDir, ".skvm/skills"), { recursive: true, force: false, errorOnExist: true })
const args = ["authorization", "inquiry", "run", "--input=./inquiry.json", "--out=./runs", `--model=${model}`, "--method=D1", "--strategy=guided-evidence-v2"]
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
await writeFile(path.join(output, "claim.json"), JSON.stringify({ at: new Date().toISOString(), stage, author, revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), workDir, model, args, inputSha256: sha(input), authoredInputSha256: sha(input), usageSha256: sha(usage), sourceBytesMatchAuthorOriginalIndex: true, modelConfigBytesEdited: false, sourceSkillUnmodified: true, runtimeEntry: "ordinary skvm authorization inquiry run", outsideRepository: true, mainQualityPanel: false, noAutomaticResend: true }, null, 2) + "\n", { flag: "wx" })
await writeFile(path.join(output, "consumed-inquiry.json"), input, { flag: "wx" }); await writeFile(path.join(output, "consumed-USAGE.md"), usage, { flag: "wx" })
const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: workDir, env: process.env, stdout: "pipe", stderr: "pipe" })
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
await writeFile(path.join(output, "stdout.txt.gz"), gzipSync(Buffer.from(stdout)), { flag: "wx" }); await writeFile(path.join(output, "stderr.txt"), stderr, { flag: "wx" })
let report: any
try { report = await inspectLocalInquiry(path.join(workDir, "runs")) }
catch (error) { report = { status: "inspection-unavailable", error: String(error), providerCalls: null }; await writeFile(path.join(output, "inspection-error.txt"), String(error), { flag: "wx" }) }
if (await stat(path.join(workDir, "runs")).catch(() => undefined)) await cp(path.join(workDir, "runs"), path.join(output, "run-archive"), { recursive: true, force: false, errorOnExist: true })
const result = { at: new Date().toISOString(), stage, author, exitCode, workDir, sessionPath: report.sessionPath ?? null, status: report.status, validation: report.validation ?? null, reuse: report.reuse ?? null, providerCalls: report.telemetry?.providerCalls ?? report.providerCalls ?? null, respondedCalls: report.telemetry?.respondedCalls ?? null, knownTokens: report.telemetry?.knownTokens ?? null, actualUSD: report.telemetry?.totalActualUsd ?? null, targetExecutions: 0, semanticReview: "pending", sourceConfigBytesUnchanged: (await readFile(path.join(workDir, "inquiry.json"))).equals(input), noAutomaticResend: true }
await writeFile(path.join(output, "process-result.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ stage, exitCode, status: result.status, providerCalls: result.providerCalls, output, workDir }))
