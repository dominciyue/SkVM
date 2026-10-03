import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, writeFile, cp, readdir } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gzipSync } from "node:zlib"
import { isDeepStrictEqual } from "node:util"
import { loadInquiryInput, AuthorizationInquiryInputSchema, checkAuthorizationInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { zodToJsonSchema } from "../../../../../src/providers/structured.ts"

const root = import.meta.dir, repo = path.resolve(root, "../../../../.."), historical = path.join(path.dirname(root), "authorization-domain-execution-v1")
const action = process.argv[2], task = action === "github-memos" ? "memos-remove" : action === "cloudflare-download" ? "paperless-download" : undefined
if (!task) throw new Error("Use github-memos|cloudflare-download; sealed Paperless Notes is not an author task")
const stage = `author-authorization-${action}`, output = path.join(root, "ordinary", stage), model = "xty/gpt-5.6-sol"
await mkdir(output, { recursive: true })
const workDir = await mkdtemp(path.join(os.tmpdir(), `${stage}-`)), source = path.join(workDir, "source")
const loaded = await loadInquiryInput(path.join(historical, `model/inputs/${task}.json`)), tools = await createInquiryTools(loaded.context)
const originalSkill = path.join(historical, `model/source-skills/${action === "github-memos" ? "github-security-review" : "cloudflare-security-audit"}/SKILL.md`)
const metadata = { taskId: loaded.value.taskId, repository: loaded.value.repository, sourceRef: loaded.value.sourceRef, allowedPaths: loaded.value.allowedPaths, request: loaded.value.brief, mode: loaded.value.mode, ...(loaded.value.policy ? { policy: loaded.value.policy } : {}) }
const prompt = `Natural request: ${metadata.request}\nMode: ${metadata.mode}${metadata.policy ? `\nIndependent policy: ${metadata.policy.text}\nPolicy origin/location: ${metadata.policy.origin} / ${metadata.policy.location}` : ""}\n` + "Use the complete supplied original security skill to author a reusable, source-visible authorization inquiry configuration for this request and its identity/scope in task.json. Write inquiry.json using the published format.schema.json with a complete inquiry declaration: derive questions, actors, resources, operations and explicit premises from that natural request. Keep the supplied independent mode/policy and all requested distinctions. The copied original source is in ./source; use that relative sourceRoot and the supplied allowedPaths/repository/sourceRef. Do not precompute an answer, authorization control graph, policy findings or known source-derived values in the configuration. Give USAGE.md with ordinary skvm authorization inquiry check/run/edit/compare commands, current guided strategy, and honest remaining duties/limits; commands should work after this directory is copied elsewhere, without absolute development paths. This is a bounded configuration-authoring task: use relevant guidance, preserve the original skill's broader audit/report/patch responsibilities for requests in those scopes, and do not turn this into a full audit. Inspect source only as needed to express the task. Do not execute target code, apply patches, access the network, install anything or invoke another model/analysis run. Preserve source files. The configuration must contain the task rather than a link to experimental logs or fixtures."
const args = ["run", `--prompt=${prompt}`, `--skill=${originalSkill}`, `--model=${model}`, "--adapter=bare-agent", `--workdir=${workDir}`, "--max-steps=12", "--timeout-ms=1200000"]
await writeFile(path.join(output, "claim.json"), JSON.stringify({ at: new Date().toISOString(), revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), stage, task, model, args, originalSkill, workDir, prompt, sourceSkillUnmodified: true, noCompleteTargetDeclarationSupplied: true, sourceModelAuthorsConfiguration: true, outsideRepository: true, mainQualityPanel: "paused", noAutomaticResend: true }, null, 2) + "\n", { flag: "wx" })
for (const file of tools.files) {
  const destination = path.join(source, file.path); await mkdir(path.dirname(destination), { recursive: true })
  await cp(path.join(loaded.context.sourceRoot, file.path), destination, { errorOnExist: true, force: false })
}
await writeFile(path.join(workDir, "task.json"), JSON.stringify(metadata, null, 2) + "\n", { flag: "wx" })
await writeFile(path.join(workDir, "format.schema.json"), JSON.stringify(zodToJsonSchema(AuthorizationInquiryInputSchema), null, 2) + "\n", { flag: "wx" })
await writeFile(path.join(output, "source-inputs.json"), JSON.stringify({ metadata, copiedSourceFiles: tools.files, formatFromPublicSchema: true }, null, 2) + "\n", { flag: "wx" })
const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: repo, env: process.env, stdout: "pipe", stderr: "pipe" })
const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
await writeFile(path.join(output, "stdout.txt"), stdout, { flag: "wx" }); await writeFile(path.join(output, "stderr.txt"), stderr, { flag: "wx" })
const inputFile = path.join(workDir, "inquiry.json")
const validation = await checkAuthorizationInquiry(inputFile, "D1", "guided-evidence-v2")
const additionalDiagnostics: Array<{ code: string; message: string }> = []
if (validation.status === "valid") {
  if (!validation.input.inquiry) additionalDiagnostics.push({ code: "author-complete-declaration-missing", message: "Requested complete inquiry is absent." })
  if (path.resolve(path.dirname(inputFile), validation.input.sourceRoot) !== source || !isDeepStrictEqual([...validation.input.allowedPaths].sort(), [...metadata.allowedPaths].sort()) || validation.input.repository !== metadata.repository || validation.input.sourceRef !== metadata.sourceRef) additionalDiagnostics.push({ code: "author-source-scope-mismatch", message: "Preserve the supplied original source root, identity and allowed scope." })
  if (validation.input.inquiry && (validation.input.inquiry.mode !== metadata.mode || !isDeepStrictEqual(validation.input.inquiry.policy, metadata.policy))) additionalDiagnostics.push({ code: "author-independent-policy-mismatch", message: "Preserve the supplied independent mode and policy exactly." })
}
for (const name of ["inquiry.json", "USAGE.md"]) {
  const raw = await readFile(path.join(workDir, name)).catch(() => undefined)
  if (raw) await writeFile(path.join(output, `authored-${name}`), raw, { flag: "wx" })
  else additionalDiagnostics.push({ code: "author-delivery-missing", message: `Requested ${name} was not delivered.` })
}
const taskKey = `natural-${createHash("sha256").update(prompt).digest("hex").slice(0, 12)}`, captureRoot = path.join(repo, ".skvm/log/runtime/bare-agent/xty--gpt-5.6-sol", taskKey)
const captures = await readdir(captureRoot).catch(() => []), messages: any[] = []
for (const directory of captures) {
  const raw = await readFile(path.join(captureRoot, directory, "conversation.jsonl")).catch(() => undefined)
  if (!raw) continue
  const events = raw.toString("utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  messages.push(...events); await mkdir(path.join(output, "source-capture"), { recursive: true })
  await writeFile(path.join(output, "source-capture", `${directory}.conversation.jsonl.gz`), gzipSync(raw), { flag: "wx" })
}
const responses = messages.filter(m => m.type === "response"), requestCount = messages.filter(m => m.type === "request").length
const tokens = Object.fromEntries(["input", "output", "cacheRead", "cacheWrite"].map(k => [k, responses.reduce((n, m) => { const value = (m.tokens ?? m.usage ?? {})[k]; return n + (typeof value === "number" ? value : 0) }, 0)]))
const result = { at: new Date().toISOString(), stage, exitCode, status: "process-ended-inspection-required", authoredInput: inputFile, workDir, validation, additionalDiagnostics, providerCalls: captures.length ? requestCount : null, respondedCalls: captures.length ? responses.length : null, knownTokens: tokens, actualUSD: null, transportAttempts: "unknown", targetExecutions: 0, sourceCaptureDirectories: captures, noAutomaticResend: true, semanticReview: "pending" }
await writeFile(path.join(output, "process-result.json"), JSON.stringify(result, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify({ stage, exitCode, validation: validation.status, additionalDiagnostics, providerCalls: result.providerCalls, output, workDir }))
