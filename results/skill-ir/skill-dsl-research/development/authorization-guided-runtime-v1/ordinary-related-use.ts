import path from "node:path"
import { createHash } from "node:crypto"
import { readFile, writeFile, mkdir, mkdtemp, cp } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import { execFileSync } from "node:child_process"
import { isDeepStrictEqual } from "node:util"
import { checkAuthorizationInquiry, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { parseInquiryStrategy } from "../../../../../src/task-dsl/authorization/control-slice.ts"
import type { InquiryMethod } from "../../../../../src/benchmarks/authorization-dsl/inquiry-run.ts"

// A descriptive cross-project run through the public CLI; no answers or graph seeds are supplied.
const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const [task = "gitea-self-query", stage = "consume-authorization-gitea-self-query-atomic-transaction-v1", methodArg = "D1", strategyArg = "guided-evidence-v2", purpose = "AR16 different-project ordinary verification after atomic transaction isolation repair"] = process.argv.slice(2)
if (!["M", "D0", "D1"].includes(methodArg)) throw new Error("Invalid inquiry method")
const method = methodArg as InquiryMethod, strategy = parseInquiryStrategy(strategyArg), model = "xty/gpt-5.6-sol"
const inputFile = path.join(path.dirname(root), "authorization-domain-execution-v1/model/inputs", `${task}.json`)
const input = await readFile(inputFile), original = JSON.parse(input.toString())
const originalCheck = await checkAuthorizationInquiry(inputFile, method, strategy)
if (originalCheck.status !== "valid") throw new Error(JSON.stringify(originalCheck))
const output = path.join(root, "ordinary", stage)
await mkdir(output, { recursive: true })
const workBase = path.resolve(repo, "../project-maintenance/runs")
await mkdir(workBase, { recursive: true })
const portable = await mkdtemp(path.join(workBase, `portable-${stage}-`)), workDir = path.join(portable, "inputs")
await mkdir(workDir)
await writeFile(path.join(workDir, "inquiry.json"), input, { flag: "wx" })
await cp(path.resolve(path.dirname(inputFile), original.sourceRoot), path.resolve(workDir, original.sourceRoot), { recursive: true, force: false, errorOnExist: true })
const copiedCheck = await checkAuthorizationInquiry(path.join(workDir, "inquiry.json"), method, strategy)
if (copiedCheck.status !== "valid" || !isDeepStrictEqual(copiedCheck.sourceFiles, originalCheck.sourceFiles)) throw new Error("Portable source index differs from original")
const args = ["authorization", "inquiry", "run", "--input=./inquiry.json", "--out=./runs", `--model=${model}`, `--method=${method}`, `--strategy=${strategy}`]
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const claim = { at: new Date().toISOString(), stage, task, author: null, revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), workDir, model, method, strategy, args, inputSha256: sha(input), sourceInput: path.relative(root, inputFile).replaceAll("\\", "/"), inputBytesUnchanged: true, copiedSourceFiles: copiedCheck.sourceFiles, budgets: { perCallTimeoutMs: 300000, sessionTimeoutMs: 1200000, maxDispatches: 12, maxToolCalls: 24, maxDisplayBytes: 262144, maxTokens: 6000 }, runtimeEntry: "ordinary skvm authorization inquiry run", outsideRepository: true, purpose, mainQualityPanel: false, priorAnswersModelVisible: false, controlGraphSeeded: false, noAutomaticResend: true }
await writeFile(path.join(output, "claim.json"), JSON.stringify(claim, null, 2) + "\n", { flag: "wx" })
await writeFile(path.join(output, "consumed-inquiry.json"), input, { flag: "wx" })
await writeFile(path.join(output, "portable-precheck.json"), JSON.stringify({ status: copiedCheck.status, inputBytesUnchanged: true, sourceFilesMatchOriginal: true, sourceFiles: copiedCheck.sourceFiles, providerCalls: 0 }, null, 2) + "\n", { flag: "wx" })
// The orchestrator records active stages once; parallel natural consumers own only their stage folders.
const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: workDir, env: process.env, stdout: "pipe", stderr: "pipe" })
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
await writeFile(path.join(output, "stdout.txt.gz"), gzipSync(Buffer.from(stdout)), { flag: "wx" })
await writeFile(path.join(output, "stderr.txt"), stderr, { flag: "wx" })
const report = await inspectLocalInquiry(path.join(workDir, "runs"))
await cp(path.join(workDir, "runs"), path.join(output, "run-archive"), { recursive: true, force: false, errorOnExist: true })
const result = { at: new Date().toISOString(), stage, author: null, accountingKind: "ordinary-natural-inquiry-consumption", exitCode, workDir, sessionPath: report.sessionPath, status: report.status, validation: report.validation ?? null, providerCalls: report.telemetry?.providerCalls ?? null, respondedCalls: report.telemetry?.respondedCalls ?? null, knownTokens: report.telemetry?.knownTokens ?? null, actualUSD: report.telemetry?.totalActualUsd ?? null, targetExecutions: 0, semanticReview: "pending", sourceConfigBytesUnchanged: (await readFile(path.join(workDir, "inquiry.json"))).equals(input), noAutomaticResend: true }
await writeFile(path.join(output, "process-result.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ stage, exitCode, status: result.status, providerCalls: result.providerCalls, respondedCalls: result.respondedCalls, output, workDir }))
