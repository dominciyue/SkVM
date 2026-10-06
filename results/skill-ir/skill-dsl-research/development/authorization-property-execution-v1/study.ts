import { createHash, randomBytes } from "node:crypto"
import { readFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { execFileSync } from "node:child_process"
import { runCodexAccountSession, type AccountSessionResult } from "../../../../../src/adapters/codex-account-session.ts"
import { CodexAccountAdapter, type runCodexAccountInquiry } from "../../../../../src/adapters/codex-account.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { executeRun, materializeNaturalRunTask } from "../../../../../src/run/index.ts"
import { loadInquiryInput, checkAuthorizationInquiry, executeLocalInquiryRun, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { executeAccountAuthor } from "./author.ts"
import { prepareChangeInputs } from "./changes.ts"
import { prepareConsumerInput } from "./consumer.ts"

const root = import.meta.dir
type Position = { id: string; stage: string; kind: string; task?: string; order: number; status: string; attempts: string[] }
type Manifest = { schemaVersion: string; positions: Position[]; limits: { smokeTimeoutMs: number; sessionTimeoutMs: number; maxToolCalls: number; maxReadBytes: number; maxDisplayBytes: number }; [key: string]: unknown }
async function write(file: string, value: unknown) { await Bun.write(file, JSON.stringify(value, null, 2) + "\n") }
const sha = (raw: string | Uint8Array) => createHash("sha256").update(raw).digest("hex")
const repo = path.resolve(root, "../../../../..")
export function runtimePlan(p: Pick<Position, "id" | "kind" | "task">) {
  if (!["download", "owui"].includes(p.task ?? "") || !/^[a-zA-Z0-9-]+$/.test(p.id)) throw new Error("Use a registered original position")
  const plain = p.kind === "author" || p.kind === "quality" && p.id.endsWith("-N"), method = plain ? undefined : p.id.endsWith("-D-S") ? "D1" as const : "M" as const
  return { domainTools: !plain, strategy: plain ? "legacy" as const : "operation-evidence-v4" as const, method,
    inputName: p.task === "download" ? "paperless-download-original.json" : "owui-ingestion-original.json",
    skillName: p.task === "download" ? "cloudflare-security-audit" : "github-security-review" }
}
async function state(change: Record<string, unknown>) {
  const file = path.join(root, "status.json"), prior = await Bun.file(file).json()
  await write(file, { ...prior, ...change })
}
/** Thin orchestration: all source, semantics, account controls and checking stay in production APIs. */
export async function run(id: string, revision?: string) {
  const manifest = await Bun.file(path.join(root, "manifest.json")).json() as Manifest, p = manifest.positions.find(p => p.id === id)
  if (!p || p.kind === "smoke" || !["native", "inquiry", "quality", "change", "author", "consumer"].includes(p.kind)) throw new Error("Use one registered position")
  if ((await Bun.file(path.join(root, "status.json")).json()).activeAttempts.length) throw new Error("The current study account attempt must close before another dispatch")
  if (revision && (!/^[a-z0-9-]+$/.test(revision) || !p.attempts.length)) throw new Error("Named revision requires its retained original")
  if (p.kind === "author" && revision && (p.attempts.length !== 1 || revision !== "field-repair")) throw new Error("An author permits exactly one named field-repair revision")
  if (!revision && p.attempts.length) throw new Error("Original attempt already exists")
  for (const previous of p.attempts) {
    const recorded = await Bun.file(path.join(root, "attempts", previous, "report.json")).json().catch(() => undefined)
    if (!recorded || ["timeout-unknown", "completion-unknown"].includes(recorded.status)) throw new Error("Inspect unknown original; do not resend")
  }
  const plan = runtimePlan(p), originalInputFile = path.resolve(root, "../authorization-source-assisted-closure-v1/model/inputs", plan.inputName)
  const gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim()
  let inputFile = originalInputFile, previous: string | undefined, binding: Record<string, unknown> = {}
  if (p.kind === "change") {
    const match = /^change-download-(policy|premise|source)-(fresh|previous)$/.exec(id)
    if (!match) throw new Error("Unregistered change shape")
    const registration = await Bun.file(path.join(root, "model", "change-registration.json")).json()
    if (registration.runtimeTree !== runtimeTree) throw new Error("Changed-input comparison requires the same baseline production tree")
    inputFile = path.join(root, "model", "inputs", `download-${match[1]}.json`)
    previous = match[2] === "previous" ? registration.previousSessionPath : undefined
    binding = { change: match[1], changeArm: match[2], baselineAttemptId: registration.baselineAttemptId, qualityBasis: registration.qualityBasis }
  } else if (p.kind === "consumer") {
    const authorId = manifest.positions.find(row => row.id === `author-${p.task}`)?.attempts.at(-1)
    if (!authorId) throw new Error("No current author original to consume")
    const authorAttempt = path.join(root, "attempts", authorId), report = await Bun.file(path.join(authorAttempt, "report.json")).json()
    if (report.status !== "authored-awaiting-review") throw new Error("The current author must have a known completed, structurally valid delivery")
    const prepared = await prepareConsumerInput({ originalInputFile, authorAttempt, destination: path.join(root, "model", "packages", authorId.replaceAll("/", "--")) })
    inputFile = prepared.inputFile; binding = { authorAttemptId: authorId, authoredInputSha256: prepared.authoredInputSha256, originalBytesConsumed: true, semanticRepair: false }
  }
  const skillFile = path.resolve(root, "../authorization-domain-execution-v1/model/source-skills", plan.skillName, "SKILL.md")
  const loaded = await loadInquiryInput(inputFile), checked = await checkAuthorizationInquiry(inputFile, plan.method ?? "M", plan.strategy)
  if (checked.status !== "valid") throw new Error(JSON.stringify(checked))
  const attemptId = `${id}/${revision ?? "original"}`, out = path.join(root, "attempts", attemptId), b = manifest.limits
  await mkdir(path.dirname(out), { recursive: true }); await mkdir(out)
  const skill = await loadSkill(skillFile), skillIdentity = []
  for (const file of ["SKILL.md", ...skill.bundleFiles].sort()) { const raw = await readFile(path.join(skill.skillDir, file)); skillIdentity.push({ file, sha256: sha(raw), bytes: raw.length }) }
  await writeFile(path.join(out, "input-original.json"), loaded.original, { flag: "wx" })
  await writeFile(path.join(out, "skill-original.md"), await readFile(skillFile), { flag: "wx" })
  await write(path.join(out, "claim.json"), { attemptId, positionId: id, kind: revision ? "revision" : "first", parent: revision ? p.attempts.at(-1) : null, gitRevision, runtimeTree, ...binding,
    inputFile, inputSha256: loaded.inputSha256, skillFile, skillIdentity, sourceFiles: checked.sourceFiles, model: "gpt-5.6-sol", effort: "high", harness: "codex-account", ...plan, limits: b, startedAt: new Date().toISOString(), targetExecutions: 0, evaluatorProvidedToModel: false })
  p.attempts.push(attemptId); p.status = "running"; await write(path.join(root, "manifest.json"), manifest)
  await state({ currentStage: p.stage, activeAttempts: [attemptId] })
  let status: string, account: AccountSessionResult | undefined, sessionPath: string | undefined, details: Record<string, unknown> = {}
  try {
    if (p.kind === "author") {
      const authored = await executeAccountAuthor({ inputFile, skillFile, out, accountBoundaryFile: path.join(root, "account-boundary.json"), limits: b, ...(revision ? { repairFrom: path.join(root, "attempts", p.attempts.at(-2)!) } : {}) })
      account = authored.account; status = authored.status; details = { authorValidation: authored.validation.status, artifacts: authored.artifacts, artifactWrites: authored.artifactWrites, answerRole: "package-author" }
    } else if (["inquiry", "change", "consumer"].includes(p.kind)) {
      const report = await executeLocalInquiryRun({ inputFile, outDir: path.join(out, "public-inquiry"), skillFile, model: "gpt-5.6-sol", method: plan.method, strategy: plan.strategy,
        previous, harness: "codex-account", accountBoundaryFile: path.join(root, "account-boundary.json"), execution: { maxToolCalls: b.maxToolCalls, maxDisplayBytes: b.maxDisplayBytes, maxReadBytes: b.maxReadBytes, sessionTimeoutMs: b.sessionTimeoutMs } })
      status = report.status
      if ("sessionPath" in report && typeof report.sessionPath === "string") {
        sessionPath = report.sessionPath; await inspectLocalInquiry(sessionPath)
        const record = await Bun.file(path.join(sessionPath, "run.json")).json()
        account = record.telemetry.account; status = account!.status
        details = { reuse: record.reuse, sourceWorkMetrics: record.native?.domain?.sourceWorkMetrics, resultPresent: !!record.result, sourceVerification: record.sourceVerification }
        await write(path.join(out, "public-report.json"), { status, sessionPath, inputSha256: loaded.inputSha256, ...details })
      } else { details = { noInferenceReport: report }; await write(path.join(out, "public-report.json"), report) }
    } else {
      const workDir = path.join(out, "workspace"), task = await materializeNaturalRunTask({ prompt: loaded.value.brief ?? JSON.stringify(loaded.value.inquiry), taskPath: path.join(out, "task.json") })
      const result = await executeRun({ task, skill, adapter: new CodexAccountAdapter(), workDir, keepWorkDir: true, skillMode: "inject", adapterConfig: { model: "gpt-5.6-sol", timeoutMs: b.sessionTimeoutMs, maxSteps: b.maxToolCalls,
        providerOptions: { authorizationScope: inputFile, authorizationDomainTools: plan.domainTools, authorizationStrategy: plan.strategy, ...(plan.domainTools ? { authorizationMethod: plan.method } : {}), authorizationAccountBoundary: path.join(root, "account-boundary.json"), authorizationTraceDir: path.join(out, "raw"), authorizationMaxToolCalls: b.maxToolCalls, authorizationMaxDisplayBytes: b.maxDisplayBytes, authorizationMaxReadBytes: b.maxReadBytes, authorizationSessionTimeoutMs: b.sessionTimeoutMs } } })
      await writeFile(path.join(out, "run-result.json.gz"), gzipSync(JSON.stringify(result.runResult)), { flag: "wx" })
      const native = result.runResult.authorizationInquiry as Awaited<ReturnType<typeof runCodexAccountInquiry>>["native"] & { account: AccountSessionResult }
      account = native.account; status = account.status
      details = { sourceWorkMetrics: native.domain?.sourceWorkMetrics, resultPresent: !!native.result, sourceVerification: native.sourceVerification }
    }
    await writeFile(path.join(out, "answer-original.md"), account?.text ?? "", { flag: "wx" })
    await write(path.join(out, "report.json"), { attemptId, positionId: id, status, accountStatus: account?.status, gitRevision, runtimeTree, ...binding, ...details, inputSha256: loaded.inputSha256, sourceFiles: checked.sourceFiles, sessionPath,
      finalPresent: !!account?.text.trim(), answerSha256: sha(account?.text ?? ""), accountUsage: account?.usage ?? null, usageDetails: account?.usageDetails, inferenceDispatched: account?.inferenceDispatched ?? false, capability: account?.capability, hostToolCalls: account ? account.tools.length + (account.toolRejections?.length ?? 0) : 0, rejectedArgumentCalls: account?.toolRejections?.length ?? 0, durationMs: account?.durationMs, reason: account?.reason, providerRequests: null, actualUsd: null, targetExecutions: 0, semanticQuality: "awaiting-independent-review" })
  } catch (cause) {
    status = "completion-unknown"
    await write(path.join(out, "report.json"), { attemptId, positionId: id, status, error: String(cause), providerRequests: null, actualUsd: null, targetExecutions: 0 })
  }
  p.status = status; await write(path.join(root, "manifest.json"), manifest)
  await state({ activeAttempts: [], ...(status.endsWith("unknown") ? { unknownCompletions: [attemptId] } : {}) })
  console.log(JSON.stringify({ attemptId, status, hostToolCalls: account ? account.tools.length + (account.toolRejections?.length ?? 0) : undefined, finalPresent: !!account?.text.trim(), usage: account?.usage, reason: account?.reason }))
}
export async function prepareChanges() {
  const manifest = await Bun.file(path.join(root, "manifest.json")).json() as Manifest, baselineAttemptId = manifest.positions.find(p => p.id === "inquiry-download-original")?.attempts.at(-1)
  if (!baselineAttemptId) throw new Error("Run the current original public Download inquiry before preparing changes")
  const baseline = await Bun.file(path.join(root, "attempts", baselineAttemptId, "report.json")).json()
  if (!baseline.sessionPath || !baseline.runtimeTree) throw new Error("Missing current public baseline identity")
  console.log(JSON.stringify(await prepareChangeInputs(root, baseline.sessionPath, { baselineAttemptId, runtimeTree: baseline.runtimeTree })))
}
export async function smoke(revision?: "bounded-code-mode") {
  const manifest = await Bun.file(path.join(root, "manifest.json")).json() as Manifest
  const position = manifest.positions.find(p => p.id === "account-anonymous-tool-smoke")!
  if ((!revision && position.attempts.length) || (revision && (position.attempts.length !== 1 || position.attempts[0] !== "account-anonymous-tool-smoke/original"))) throw new Error("Only the original and one named smoke revision are permitted.")
  const id = "account-anonymous-tool-smoke/" + (revision ?? "original"), out = path.join(root, "attempts", id)
  await mkdir(out, { recursive: true })
  const rulePath = "C:/Users/14182/.codex/AGENTS.md"
  // The main developer read this generic, user-supplied policy before admission.
  const sha256 = createHash("sha256").update(await readFile(rulePath)).digest("hex")
  const key = randomBytes(12).toString("hex"), answer = "lookup-" + randomBytes(24).toString("hex")
  const lookup = new Map([[key, answer]]), calls: unknown[] = []
  await write(path.join(root, "account-boundary.json"), { schemaVersion: "codex-account-boundary/v1", instructionSources: [{ path: rulePath, sha256 }], review: "Main AI verified current user-supplied generic agent/tool policy only; no task answers, evaluator or development logs. Identical across experiment arms." })
  await write(path.join(out, "claim.json"), { id, kind: revision ? "revision" : "first", ...(revision ? { parent: position.attempts[0], change: "Enable bounded official Code Mode host, restore typed dynamic specs and verify shared callback/config boundaries." } : {}), model: "gpt-5.6-sol", effort: "high", startedAt: new Date().toISOString(), expectedAnswerLocation: "host-only lookup table", timeoutMs: manifest.limits.smokeTimeoutMs, targetExecutions: 0 })
  position.status = "running"; position.attempts.push(id)
  await write(path.join(root, "manifest.json"), manifest)
  const result = await runCodexAccountSession({ model: "gpt-5.6-sol", effort: "high", cwd: root,
    instructionSources: [{ path: rulePath, sha256 }], timeoutMs: manifest.limits.smokeTimeoutMs,
    system: "This is a bounded anonymous lookup. Use the supplied dynamic tool to retrieve the value. Do not use native execution, files, network or agents. Return the retrieved value verbatim as the final answer.",
    prompt: "Call anonymous_lookup with key " + key + ". The answer exists only in the host lookup table.",
    tools: [{ name: "anonymous_lookup", description: "Retrieve one value from the host's anonymous table.", inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"], additionalProperties: false } }],
    execute: async call => { calls.push(call); const args = call.arguments as { key?: unknown }; return { output: JSON.stringify({ value: typeof args.key === "string" ? lookup.get(args.key) ?? null : null }), exitCode: 0, durationMs: 0 } } })
  await write(path.join(out, "account.json"), result)
  const consumed = result.status === "completed" && calls.length > 0 && result.text.trim() === answer
  await write(path.join(out, "evaluation.json"), { status: result.status, hostToolCalls: calls.length, toolConsumed: consumed,
    key, answer, finalExact: result.text.trim() === answer, targetExecutions: 0, actualUsd: null, providerRequests: null })
  position.status = consumed ? "completed" : "failed"
  await write(path.join(root, "manifest.json"), manifest)
  console.log(JSON.stringify({ status: result.status, reason: result.reason, hostToolCalls: calls.length, finalExact: result.text.trim() === answer, usage: result.usage, capability: result.capability?.status }))
}
if (import.meta.main) {
  const command = process.argv[2]
  if (command === "smoke") await smoke()
  else if (command === "smoke-bounded-code-mode") await smoke("bounded-code-mode")
  else if (command === "run") await run(process.argv[3]!, process.argv[4])
  else if (command === "prepare-changes") await prepareChanges()
  else throw new Error("Supported current study commands: smoke, run <exact-position-id> [named-revision], prepare-changes")
}
