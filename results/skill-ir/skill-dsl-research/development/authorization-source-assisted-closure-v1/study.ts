import path from "node:path"
import { readFile, writeFile, mkdir, readdir, stat, copyFile, open, rename, unlink } from "node:fs/promises"
import { createHash, randomUUID } from "node:crypto"
import { execFileSync } from "node:child_process"
import { gzipSync, gunzipSync } from "node:zlib"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { ManifestSchema, AttemptReportSchema, ReviewAdmissionSchema, FileIdentitySchema, type Manifest, type Position, type SkillIdentity, type AttemptReport } from "./types.ts"
import { loadSkill, buildSkillBundle } from "../../../../../src/core/skill-loader.ts"
import { materializeNaturalRunTask, prepareRunWorkspace } from "../../../../../src/run/index.ts"
import { runAgentLoop } from "../../../../../src/core/agent-loop.ts"
import { TokenUsageSchema } from "../../../../../src/core/types.ts"
import { loadInquiryInput, executeLocalInquiryRun, inspectLocalInquiry, AuthorizationInquiryInputSchema } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools, modelSourceDisplay } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { createNativeInquiryRuntime } from "../../../../../src/benchmarks/authorization-dsl/inquiry-native.ts"
import { createTelemetryProvider, reconcileAuthorizationAttemptsFromEvents, summarizeAuthorizationAttempts, AuthorizationDispatchLimitError, hasUnknownAuthorizationCompletion, type AuthorizationProviderAttempt, type AuthorizationLifecycleEvent } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { createProviderForModel } from "../../../../../src/providers/registry.ts"
import type { LLMTool, LLMToolCall } from "../../../../../src/providers/types.ts"
import { invalidateConfigCache } from "../../../../../src/core/config.ts"
import { copySourceSnapshot } from "../authorization-semantic-lowering-v1/source-snapshot.ts"

export const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const au = path.resolve(root, "../authorization-operation-evidence-v1")
export const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
const json = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8"))
const save = async (file: string, value: unknown, exclusive = true) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) }) }
const gitRevision = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
export function modelInputPath(studyRoot: string, file: string) {
  if (!/^model\/inputs\/[a-z0-9-]+\.json$/.test(file)) throw new Error("Use an exact registered model input; evaluator paths are forbidden")
  return path.resolve(studyRoot, file)
}
export function selectPosition(manifest: Pick<Manifest, "positions">, id: string): Position {
  const matches = manifest.positions.filter(p => p.id === id)
  if (matches.length !== 1) throw new Error("Use one complete unique position ID from manifest.json")
  return matches[0]!
}
export function positionTemplates(): Position[] {
  const positions: Position[] = []
  const add = (p: Position) => positions.push(p)
  for (const task of ["paperless-download", "owui-ingestion"] as const) add({ id: `debug-${task}-D1`, kind: "debug", task, inputId: `${task}-original`, variant: "original", arm: "D-S", method: "D1", strategy: "operation-evidence-v2", providerLimit: 24, dependsOn: [] })
  for (const kind of ["native", "author", "consumer"] as const) for (const task of ["paperless-download", "gitea-create-issue"] as const) for (const variant of ["original", "changed"] as const) add({ id: `${kind}-${task}-${variant}`, kind, task, inputId: `${task}-${variant}`, variant, arm: kind === "author" ? "author" : kind === "consumer" ? "consumer" : "D-S", method: "D1", strategy: "operation-evidence-v2", providerLimit: kind === "author" ? 12 : 24, dependsOn: kind === "consumer" ? [`author-${task}-${variant}`] : [], ...(kind === "consumer" ? { authorPosition: `author-${task}-${variant}` } : {}) })
  for (const variant of ["policy", "premise", "source"] as const) for (const arm of ["fresh", "materials-previous"] as const) add({ id: `variation-paperless-download-${variant}-${arm}`, kind: "variation", task: "paperless-download", inputId: `paperless-download-${variant}`, variant, arm, method: "D1", strategy: "operation-evidence-v2", providerLimit: 24, dependsOn: ["debug-paperless-download-D1"], ...(arm === "materials-previous" ? { previousPosition: "debug-paperless-download-D1" } : {}) })
  for (const task of ["paperless-download", "owui-ingestion"] as const) for (const arm of ["N", "M-S", "D-S"] as const) add({ id: `quality-${task}-${arm}`, kind: "quality", task, inputId: `${task}-original`, variant: "original", arm, method: arm === "D-S" ? "D1" : "M", strategy: arm === "N" ? "legacy" : "operation-evidence-v2", providerLimit: 24, dependsOn: [`debug-${task}-D1`] })
  return positions
}
export async function reserveAttempt(studyRoot: string, positionId: string, revision?: { label: string; parent: string }) {
  if (!/^[A-Za-z0-9-]+$/.test(positionId) || revision && (!/^[a-z0-9-]+$/.test(revision.label) || !/^(?:first|revision-[a-z0-9-]+)$/.test(revision.parent))) throw new Error("Invalid attempt identity")
  const attemptId = revision ? `revision-${revision.label}` : "first", parentRoot = path.join(studyRoot, "positions", positionId)
  if (revision && !(await stat(path.join(parentRoot, revision.parent, "claim.json")).catch(() => undefined))) throw new Error("Revision requires an existing explicit parent attempt")
  await mkdir(parentRoot, { recursive: true }); const directory = path.join(parentRoot, attemptId)
  await mkdir(directory) // Never replace an initial failure or revision.
  await save(path.join(directory, "claim.json"), { positionId, attemptId, revision: revision?.label ?? null, parent: revision?.parent ?? null, startedAt: new Date().toISOString() })
  return { directory, attemptId }
}
export async function skillIdentity(file: string): Promise<SkillIdentity> {
  const skill = await loadSkill(file), files = []
  for (const relative of ["SKILL.md", ...skill.bundleFiles].sort()) { const raw = await readFile(path.join(skill.skillDir, relative)); files.push({ path: relative, sha256: sha(raw), bytes: raw.length }) }
  return { file: path.relative(root, file).replaceAll("\\", "/"), files, bundleSha256: sha(JSON.stringify(files)), bytes: files.reduce((n, f) => n + f.bytes, 0) }
}
export async function init() {
  const baselineRevision = gitRevision(), inputs: Manifest["inputs"] = [], skills = {} as Manifest["skills"]
  const policyVariants: Manifest["policyVariants"] = {
    "paperless-download": { text: "Downloading any version or representation requires object-view authorization for the exact document whose file is returned; permission on a related root document alone is insufficient.", origin: "external-policy", location: "independent-development-policy:download-exact-object/av-v1" },
    "gitea-create-issue": { text: "Any authenticated repository reader may create an issue when the issues unit is enabled. Issue-unit write permission is not required by this policy.", origin: "user", location: "experimental-user-brief:gitea-issue-policy/as-reader-v2" },
  }
  for (const task of ["paperless-download", "owui-ingestion", "gitea-create-issue"] as const) {
    const parentFile = path.join(au, "model", "inputs", `${task}.json`), parentRaw = await readFile(parentFile), loaded = await loadInquiryInput(parentFile)
    const source = await createInquiryTools({ ...loaded.context, maxReadBytes: 33554432, maxFiles: 512 })
    for (const variant of (task === "owui-ingestion" ? ["original"] : ["original", "changed"]) as Array<"original" | "changed">) {
      const id = `${task}-${variant}`, file = `model/inputs/${id}.json`, inputPath = modelInputPath(root, file)
      const value = { ...loaded.value, sourceRoot: path.relative(path.dirname(inputPath), loaded.context.sourceRoot).replaceAll("\\", "/"), ...(variant === "changed" ? { mode: "conformance" as const, policy: policyVariants[task] } : {}) }
      const parsed = AuthorizationInquiryInputSchema.parse(value); await save(inputPath, parsed)
      inputs.push({ id, task, file, sha256: sha(await readFile(inputPath)), parentFile: path.relative(root, parentFile).replaceAll("\\", "/"), parentSha256: sha(parentRaw), changes: variant === "original" ? ["sourceRoot mechanical relocation"] : ["sourceRoot mechanical relocation", "independent registered policy replacement; original brief unchanged"], ready: true, sourceFiles: source.files })
    }
    const skillFile = path.resolve(root, `../authorization-domain-execution-v1/model/source-skills/${task === "gitea-create-issue" ? "github-security-review" : "cloudflare-security-audit"}/SKILL.md`)
    skills[task] = await skillIdentity(skillFile)
  }
  const parent = inputs.find(i => i.id === "paperless-download-original")!
  for (const variant of ["policy", "premise", "source"] as const) inputs.push({ ...parent, id: `paperless-download-${variant}`, file: `model/inputs/paperless-download-${variant}.json`, sha256: null, ready: false, changes: ["AV14 pending: complete current declaration and explicit registered change"], sourceFiles: [] })
  const manifest = ManifestSchema.parse({ schemaVersion: "authorization-av-manifest/v1", development: "adaptive-exposed", baselineRevision, testedModel: "xty/gpt-5.6-sol", cachePath: path.join(repo, ".skvm"), recoveryPolicy: "authorization-readonly-recovery/v1", budgets: { maxDispatches: 24, authorDispatches: 12, maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, maxFiles: 512, maxTokens: 6000, perCallTimeoutMs: 300000, sessionTimeoutMs: 7500000 }, inputs, skills, positions: positionTemplates(), policyVariants, protectedHistorical: ["AU Share request16", "AU Gitea consumer request22", "AU/AT/AS original archives, seals, judgments", "held-out 0/6", "Q1 unproved"], targetExecutions: 0, evaluatorIsolation: "evaluations are never model inputs" })
  await save(path.join(root, "manifest.json"), manifest)
  return { status: "initialized", positions: manifest.positions.length, readyInputs: inputs.filter(i => i.ready).length, pendingInputs: inputs.filter(i => !i.ready).length, providerCalls: 0, targetExecutions: 0 }
}
const readManifest = async () => ManifestSchema.parse(await json(path.join(root, "manifest.json")))
export function configureStudyRuntime(manifest: Pick<Manifest, "cachePath">) { process.env.SKVM_AUTO_PROBE = "0"; process.env.SKVM_CACHE = manifest.cachePath; invalidateConfigCache() }
export async function archiveInquiryResult(directory: string, report: unknown) {
  const recorded = z.object({ status: z.string(), sessionPath: z.string().optional(), providerCalls: z.number().optional(), providerDispatches: z.number().optional(), error: z.string().optional() }).passthrough().parse(report)
  if (recorded.status === "provider-unavailable" && recorded.providerDispatches !== 0) throw new Error("Unavailable-provider report must prove zero dispatches")
  if (recorded.sessionPath && recorded.status !== "provider-unavailable") {
    const file = path.join(recorded.sessionPath, "run.json"), raw = RawRunSchema.parse(await json(file)), final = z.object({ final: z.unknown().optional() }).passthrough().parse(await json(file)).final
    await gzipFile(file, path.join(directory, "raw", "inquiry-run.json.gz"))
    return { status: recorded.status, providerCalls: raw.attempts.length, raw: { kind: "inquiry" as const, file: "raw/inquiry-run.json.gz" }, final: JSON.stringify(final ?? null), ...(recorded.error ? { error: recorded.error } : {}) }
  }
  await save(path.join(directory, "raw", "inquiry-not-dispatched.json"), { attempts: [], events: [], report })
  return { status: recorded.status, providerCalls: 0, raw: { kind: "inquiry" as const, file: "raw/inquiry-not-dispatched.json" }, final: "", error: recorded.error ?? "No inquiry session; no automatic fresh fallback" }
}
export async function loadAdmittedAuthor(studyRoot: string, manifest: Manifest, position: Position, value: unknown) {
  const admission = ReviewAdmissionSchema.parse(value)
  if (admission.status !== "accepted" || admission.authorPosition !== position.authorPosition) throw new Error("Consumer requires independent faithful-task/raw-byte author admission")
  const origin = path.join(studyRoot, "positions", admission.authorPosition, admission.authorAttempt)
  const inquiry = await readFile(path.join(origin, "authored-inquiry.json")), usage = await readFile(path.join(origin, "authored-USAGE.md"))
  if (sha(inquiry) !== admission.inquirySha256 || sha(usage) !== admission.usageSha256) throw new Error("Admitted original author bytes changed")
  const author = selectPosition(manifest, admission.authorPosition), input = manifest.inputs.find(i => i.id === author.inputId)
  const report = AttemptReportSchema.parse(await json(path.join(origin, "report.json")))
  if (position.kind !== "consumer" || author.kind !== "author" || author.task !== position.task || author.variant !== position.variant || report.positionId !== author.id || report.attemptId !== admission.authorAttempt || report.inputSha256 !== input?.sha256 || report.model !== manifest.testedModel || report.raw.kind !== "author" || report.status !== "authored-awaiting-review") throw new Error("Admission does not bind the registered author task, attempt, input and actual report")
  const structural = z.object({ status: z.literal("structurally-valid-awaiting-independent-admission"), artifacts: z.object({ "inquiry.json": z.object({ sha256: z.string(), bytes: z.number() }), "USAGE.md": z.object({ sha256: z.string(), bytes: z.number() }) }) }).passthrough().parse(await json(path.join(origin, "author-validation.json")))
  if (structural.artifacts["inquiry.json"].sha256 !== admission.inquirySha256 || structural.artifacts["USAGE.md"].sha256 !== admission.usageSha256 || structural.artifacts["inquiry.json"].bytes !== inquiry.length || structural.artifacts["USAGE.md"].bytes !== usage.length) throw new Error("Admitted bytes differ from the original structural author record")
  return { inquiry, usage, inputFile: path.join(origin, "authored-inquiry.json") }
}
export async function check() {
  const manifest = await readManifest(), diagnostics: string[] = [], pending: string[] = []
  for (const input of manifest.inputs) {
    if (!input.ready) { pending.push(input.id); continue }
    const file = modelInputPath(root, input.file), raw = await readFile(file), loaded = await loadInquiryInput(file)
    if (sha(raw) !== input.sha256) diagnostics.push(`${input.id}: registered input changed`)
    if (sha(await readFile(path.resolve(root, input.parentFile))) !== input.parentSha256) diagnostics.push(`${input.id}: original parent changed`)
    const source = await createInquiryTools({ ...loaded.context, maxReadBytes: manifest.budgets.maxReadBytes, maxFiles: manifest.budgets.maxFiles })
    if (!isDeepStrictEqual(source.files, input.sourceFiles)) diagnostics.push(`${input.id}: indexed source differs`)
    if (input.changes.every(c => !c.startsWith("AV14"))) {
      const original = await loadInquiryInput(path.resolve(root, input.parentFile))
      if (loaded.value.brief !== original.value.brief || loaded.value.repository !== original.value.repository || loaded.value.sourceRef !== original.value.sourceRef || !isDeepStrictEqual(loaded.value.allowedPaths, original.value.allowedPaths)) diagnostics.push(`${input.id}: original task/source scope changed`)
    }
  }
  for (const task of ["paperless-download", "owui-ingestion", "gitea-create-issue"] as const) if (!isDeepStrictEqual(await skillIdentity(path.resolve(root, manifest.skills[task].file)), manifest.skills[task])) diagnostics.push(`${task}: full skill bundle changed`)
  const result = { schemaVersion: "authorization-av-check/v1", status: diagnostics.length ? "invalid" : "ready-with-registered-pending-inputs", positions: manifest.positions.length, pendingInputs: pending, diagnostics, recoveryPolicy: manifest.recoveryPolicy, budgets: manifest.budgets, providerCalls: 0, targetExecutions: 0 }
  return result
}

const AttemptHeaderSchema = z.object({ id: z.string(), phase: z.enum(["initial", "domain-repair"]), transport: z.enum(["schema-tool", "prompt-parse"]), status: z.enum(["pending", "response", "error", "protocol-error", "timeout"]), startedAt: z.string(), request: z.object({ messageCount: z.number(), messageCharacters: z.number(), toolNames: z.array(z.string()), executableTools: z.boolean() }).passthrough(), usage: TokenUsageSchema.nullable(), costUsd: z.number().nullable(), transportAttempts: z.literal("unknown") }).passthrough()
const AttemptSchema = z.custom<AuthorizationProviderAttempt>(v => AttemptHeaderSchema.safeParse(v).success)
const EventSchema = z.custom<AuthorizationLifecycleEvent>(v => z.object({ sequence: z.number(), kind: z.string(), at: z.string(), attempt: AttemptSchema.optional() }).passthrough().safeParse(v).success)
const RawRunSchema = z.object({ attempts: z.array(AttemptSchema), events: z.array(EventSchema).optional().default([]) }).passthrough()
export function replayAccounting(attempts: AuthorizationProviderAttempt[], events: AuthorizationLifecycleEvent[]) {
  const reconciled = reconcileAuthorizationAttemptsFromEvents(attempts, events)
  return { summary: summarizeAuthorizationAttempts(reconciled), recoveries: reconciled.filter(a => a.recovery).length, lateSettlements: reconciled.filter(a => a.lateSettlement).length, acceptedResponses: reconciled.filter(a => a.localConsumer === "accepted").length, originalUnknownAttempts: reconciled.filter(a => a.status === "timeout" || a.status === "pending").length, attempts: reconciled }
}
async function gzipFile(file: string, destination: string) { await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, gzipSync(await readFile(file)), { flag: "wx" }) }
async function rawRecord(attempt: string, report: AttemptReport) {
  const file = path.join(attempt, report.raw.file)
  return RawRunSchema.parse(file.endsWith(".gz") ? JSON.parse(gunzipSync(await readFile(file)).toString("utf8")) : await json(file))
}
export async function replay() {
  const rows = [], base = path.join(root, "positions")
  for (const position of await readdir(base).catch(() => [])) for (const name of await readdir(path.join(base, position))) {
    const attempt = path.join(base, position, name), file = path.join(attempt, "report.json")
    if (!(await stat(file).catch(() => undefined))) { rows.push({ positionId: position, attemptId: name, status: "initialized-or-unsettled", providerCalls: null }); continue }
    const report = AttemptReportSchema.parse(await json(file)), raw = await rawRecord(attempt, report), accounting = replayAccounting(raw.attempts, raw.events)
    rows.push({ positionId: position, attemptId: name, status: report.status, final: report.final, ...accounting, originalReportProviderCalls: report.providerCalls })
  }
  return { schemaVersion: "authorization-av-replay/v1", rows, providerCalls: rows.reduce((n, r) => n + ("summary" in r && r.summary ? r.summary.providerCalls : 0), 0), unknownUnsettledPositions: rows.filter(r => r.status === "initialized-or-unsettled").length, providerCallsDuringReplay: 0, targetExecutionsDuringReplay: 0, cacheReadBasis: "each actual attempt usage once; never add prompt cacheRead to input again", humanMinutes: null }
}
export async function currentStatus(change: Record<string, unknown>, studyRoot = root) {
  const file = path.join(studyRoot, "status.json"), lockFile = path.join(studyRoot, ".status-write.lock"), temporary = path.join(studyRoot, `.status-${process.pid}-${randomUUID()}.tmp`), deadline = Date.now() + 30000
  let lock: Awaited<ReturnType<typeof open>> | undefined
  while (!lock) {
    try { lock = await open(lockFile, "wx") }
    catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause
      if (Date.now() >= deadline) throw new Error(`Status writer lock did not release: ${lockFile}; inspect its owner before removing it`)
      await Bun.sleep(10)
    }
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), lastKnownRequest: change.lastKnownRequest ?? null }) + "\n", "utf8")
    const current = z.record(z.unknown()).parse(await json(file))
    const next = { ...current, ...change }
    if (typeof current.providerCalls === "number" && typeof change.providerCalls === "number") next.providerCalls = Math.max(current.providerCalls, change.providerCalls)
    await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
    await rename(temporary, file)
  } finally {
    try { await unlink(temporary) } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause }
    finally { await lock.close(); await unlink(lockFile) }
  }
}
async function latestAttempt(position: string) {
  const base = path.join(root, "positions", position), names = await readdir(base).catch(() => [])
  const reports = await Promise.all(names.map(async name => { const file = path.join(base, name, "report.json"); return await stat(file).catch(() => undefined) ? { directory: path.join(base, name), report: AttemptReportSchema.parse(await json(file)) } : undefined }))
  return reports.filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => b.report.startedAt.localeCompare(a.report.startedAt))[0]
}
export function nativeInvocation(position: Position, manifest: Manifest, options: { prompt: string; scopeFile: string; skillFile: string; workDir: string; traceFile: string }) {
  const b = manifest.budgets, args = ["run", `--prompt=${options.prompt}`, `--skill=${options.skillFile}`, `--model=${manifest.testedModel}`, "--adapter=bare-agent", `--workdir=${options.workDir}`, `--execution-observation=${path.join(options.workDir, "execution-observation.json")}`, `--max-steps=${position.providerLimit}`, `--timeout-ms=${b.sessionTimeoutMs}`, `--authorization-scope=${options.scopeFile}`, `--authorization-trace=${options.traceFile}`, `--authorization-max-provider-calls=${position.providerLimit}`, `--authorization-max-tool-calls=${b.maxToolCalls}`, `--authorization-max-display-bytes=${b.maxDisplayBytes}`, `--authorization-max-read-bytes=${b.maxReadBytes}`, `--authorization-max-output-tokens=${b.maxTokens}`, `--authorization-request-timeout-ms=${b.perCallTimeoutMs}`, `--authorization-session-timeout-ms=${b.sessionTimeoutMs}`, "--authorization-readonly-recovery"]
  if (position.arm !== "N") args.push("--authorization-domain-tools", "--authorization-strategy=operation-evidence-v2", `--authorization-method=${position.method}`)
  return args
}

async function runAuthor(position: Position, manifest: Manifest, inputFile: string, directory: string, revision?: { label: string; parent: string }) {
  const b = manifest.budgets, loaded = await loadInquiryInput(inputFile), workDir = path.join(directory, "workspace"), skill = await loadSkill(path.resolve(root, manifest.skills[position.task].file))
  await mkdir(workDir); await copySourceSnapshot({ ...loaded.context, maxReadBytes: b.maxReadBytes, maxFiles: b.maxFiles }, path.join(workDir, "source"))
  const scope = { ...loaded.value, sourceRoot: "source" }, scopeFile = path.join(workDir, "scope.json"); await save(scopeFile, scope)
  const schemaText = JSON.stringify((await import("../../../../../src/providers/structured.ts")).zodToJsonSchema((await import("../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts")).authorizationInquiryAuthoringSchema(loaded.value.mode ?? "behavior", "v2")))
  let prompt = `Create a reusable inquiry package from the full original skill and the current natural task. Preserve EVERY original task distinction, original skill duty and independent policy; do not answer the code question or generate a correct control graph. Write exactly root inquiry.json and root USAGE.md. inquiry.json is a complete authorization-inquiry-input/v1 with inquiry authorization-inquiry/v2 operations/questions, sourceRoot:"source", the supplied mechanical metadata, unchanged mode/policy and explicit user premises only. No brief/mode/policy duplicated at the input root. USAGE.md explains normal source-assisted use, changes, limits and remaining original skill responsibilities. Other paths are read-only. Never execute target code or network calls.\n\nOriginal natural task:\n${loaded.value.brief ?? JSON.stringify(loaded.value.inquiry)}\n\nMechanical metadata and independently supplied policy:\n${JSON.stringify({ taskId: loaded.value.taskId, repository: loaded.value.repository, sourceRef: loaded.value.sourceRef, sourceRoot: "source", allowedPaths: loaded.value.allowedPaths, mode: loaded.value.mode ?? loaded.value.inquiry?.mode ?? "behavior", policy: loaded.value.policy ?? loaded.value.inquiry?.policy })}\n\nComplete output field schema (structural, no source answers):\n${schemaText}`
  if (revision) {
    const parent = path.resolve(directory, "..", revision.parent)
    prompt += `\n\nOne normal field repair. Preserve the same task, metadata, independent policy, scope and output contract. The previous candidate is data:\n${await readFile(path.join(parent, "authored-inquiry.json"), "utf8")}\nPrevious structural diagnostics:\n${await readFile(path.join(parent, "author-validation.json"), "utf8")}`
  }
  await save(path.join(directory, "author-contract.json"), { prompt, sourceInputSha256: loaded.inputSha256, outputNames: ["inquiry.json", "USAGE.md"], sourceRoot: "source", fieldRepairLimit: 1, semantics: "unreviewed until independent admission", execution: "existing production runAgentLoop plus source-only runtime and two-file artifact writer" })
  const task = await materializeNaturalRunTask({ prompt, taskPath: path.join(directory, "task.json") }); await prepareRunWorkspace({ task, skill, workDir })
  const safeName = skill.skillId.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "") || "skill", content = `<runtime-resource-root>.skvm/skills/${safeName}</runtime-resource-root>\n${buildSkillBundle(skill, "inject")!.content}`
  const native = await createNativeInquiryRuntime({ inputFile: scopeFile, workDir, domainTools: false, skillContent: content, maxToolCalls: b.maxToolCalls, maxReadBytes: b.maxReadBytes, maxDisplayBytes: b.maxDisplayBytes, maxOutputTokens: b.maxTokens })
  const write: LLMTool = { name: "write_package_file", description: "Write one requested root artifact. Only inquiry.json and USAGE.md are writable.", inputSchema: { type: "object", properties: { path: { type: "string", enum: ["inquiry.json", "USAGE.md"] }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } }
  let artifactWrites = 0
  const execute = async (call: LLMToolCall) => {
    if (native.report().toolBudget.totalUsed + artifactWrites >= b.maxToolCalls) return { output: "Shared source/artifact action budget exhausted", exitCode: 1, durationMs: 0 }
    if (call.name !== write.name) return native.execute(call)
    const args = z.object({ path: z.enum(["inquiry.json", "USAGE.md"]), content: z.string().max(1048576) }).strict().parse(call.arguments)
    artifactWrites++; await writeFile(path.join(workDir, args.path), args.content, "utf8")
    return { output: `Wrote ${args.path}; this preserves raw author bytes, semantic equivalence remains unreviewed`, exitCode: 0, durationMs: 0 }
  }
  const events: AuthorizationLifecycleEvent[] = [], requests: unknown[] = [], displayed = new Set<string>(); let modelSourceBytes = 0
  const telemetry = createTelemetryProvider(createProviderForModel(manifest.testedModel), { maxDispatches: position.providerLimit, perCallTimeoutMs: b.perCallTimeoutMs, unitTimeoutMs: b.sessionTimeoutMs, executableToolNames: [...native.definitions.map(t => t.name), write.name], isolateLateResponses: true, beforeDispatch: async (params, toolResults) => {
    const display = modelSourceDisplay(native.report().evidence, params.messages.map(m => m.content).join("\n") + (toolResults?.map(r => r.content).join("\n") ?? ""), displayed)
    if (modelSourceBytes + display.bytes > b.maxDisplayBytes) throw new AuthorizationDispatchLimitError(b.maxDisplayBytes, "author-source-display")
    modelSourceBytes += display.bytes; for (const id of display.evidenceIds) displayed.add(id)
    const { signal: _signal, ...recorded } = params; requests.push(structuredClone(recorded)); await save(path.join(directory, "raw", `request-${requests.length}.json`), recorded)
  }, onEvent: async event => { events.push(event); await currentStatus({ lastKnownRequest: { positionId: position.id, attemptId: path.basename(directory), sequence: event.sequence, kind: event.kind, providerAttemptId: event.attemptId } }) } })
  let loop: Awaited<ReturnType<typeof runAgentLoop>> | undefined, error: string | undefined
  try { loop = await runAgentLoop({ provider: telemetry.provider, model: manifest.testedModel, system: `Use this complete original skill as guidance. The CURRENT author task determines the output artifact.\n<skill>\n${content}\n</skill>`, tools: [...native.definitions, write], executeTool: execute, maxIterations: position.providerLimit, timeoutMs: b.sessionTimeoutMs, maxTokens: b.maxTokens, parallelToolExecution: false, isolateLateResponses: true }, [{ role: "user", content: prompt }]) }
  catch (cause) { error = String(cause) }
  finally { await telemetry.close("author-stage-ended-no-automatic-recovery-of-writes"); await native.close() }
  const artifacts: Record<string, { sha256: string; bytes: number }> = {}
  for (const name of ["inquiry.json", "USAGE.md"]) if (await stat(path.join(workDir, name)).catch(() => undefined)) { const bytes = await readFile(path.join(workDir, name)); await writeFile(path.join(directory, `authored-${name}`), bytes, { flag: "wx" }); artifacts[name] = { sha256: sha(bytes), bytes: bytes.length } }
  let valid = false, diagnostics: string[] = []
  try {
    const value = AuthorizationInquiryInputSchema.parse(await json(path.join(directory, "authored-inquiry.json")))
    if (value.sourceRoot !== "source" || value.taskId !== loaded.value.taskId || value.repository !== loaded.value.repository || value.sourceRef !== loaded.value.sourceRef || !isDeepStrictEqual(value.allowedPaths, loaded.value.allowedPaths) || value.inquiry?.schemaVersion !== "authorization-inquiry/v2" || value.inquiry.mode !== (loaded.value.mode ?? "behavior") || !isDeepStrictEqual(value.inquiry.policy, loaded.value.policy) || !artifacts["USAGE.md"]) throw new Error("Authored complete metadata/mode/policy/sourceRoot/USAGE contract mismatch")
    valid = true
  } catch (cause) { diagnostics.push(String(cause)) }
  const rawFile = "raw/author-run.json"; await save(path.join(directory, rawFile), { attempts: telemetry.attempts, events, requests, loop, error, native: native.report(), artifactWrites, modelSourceBytes, artifacts, valid, diagnostics })
  await save(path.join(directory, "author-validation.json"), { status: valid ? "structurally-valid-awaiting-independent-admission" : "invalid", artifacts, diagnostics, semanticEquivalence: "unreviewed", providerCalls: telemetry.attempts.length })
  return { status: valid ? "authored-awaiting-review" : "author-invalid", providerCalls: telemetry.attempts.length, raw: { kind: "author" as const, file: rawFile }, final: loop?.text ?? "", ...(error ? { error } : {}) }
}

export async function run(id: string, revision?: { label: string; parent: string }) {
  const manifest = await readManifest(), position = selectPosition(manifest, id)
  configureStudyRuntime(manifest)
  let inputFile: string, authored: { inquiry: Uint8Array; usage: Uint8Array } | undefined
  const registration = manifest.inputs.find(i => i.id === position.inputId)
  if (position.kind === "consumer") {
    const accepted = await loadAdmittedAuthor(root, manifest, position, await json(path.join(root, "evaluations", `${position.authorPosition}-admission.json`)))
    authored = accepted; inputFile = accepted.inputFile
  } else {
    if (!registration?.ready || !registration.sha256) throw new Error("Registered input is pending; prepare AV14 from the actual baseline before dispatch")
    inputFile = modelInputPath(root, registration.file)
    if (sha(await readFile(inputFile)) !== registration.sha256) throw new Error("Selected registered input changed")
  }
  if (!isDeepStrictEqual(await skillIdentity(path.resolve(root, manifest.skills[position.task].file)), manifest.skills[position.task])) throw new Error("Selected complete skill bundle changed")
  if (position.kind === "author" && revision) {
    const names = await readdir(path.join(root, "positions", id)).catch(() => [])
    if (names.some(n => n.startsWith("revision-"))) throw new Error("One normal author field repair is already registered")
    const parent = path.join(root, "positions", id, revision.parent), previousReport = AttemptReportSchema.parse(await json(path.join(parent, "report.json"))), raw = await rawRecord(parent, previousReport)
    if (hasUnknownAuthorizationCompletion(raw)) throw new Error("Author write stage with unknown completion cannot be resent automatically")
  }
  let previous: string | undefined
  if (position.previousPosition) { const prior = await latestAttempt(position.previousPosition); if (!prior || prior.report.raw.kind !== "inquiry") throw new Error("Materials arm requires an actual recorded inquiry baseline; no automatic fresh fallback"); const inspection = await inspectLocalInquiry(path.join(prior.directory, "raw", "inquiry")); previous = inspection.sessionPath }
  const loaded = await loadInquiryInput(inputFile), originalInput = await loadInquiryInput(modelInputPath(root, manifest.inputs.find(i => i.id === `${position.task}-original`)!.file))
  const { directory, attemptId } = await reserveAttempt(root, id, revision), startedAt = new Date().toISOString(), implementationRevision = gitRevision()
  await save(path.join(directory, "registration.json"), { position, budgets: manifest.budgets, recoveryPolicy: manifest.recoveryPolicy, implementationRevision, inputSha256: loaded.inputSha256, sourceInput: path.relative(root, inputFile).replaceAll("\\", "/"), previous: previous ?? null })
  await currentStatus({ phase: position.kind === "debug" ? position.task === "paperless-download" ? "AV10" : "AV11" : position.kind === "native" ? "AV12" : position.kind === "author" || position.kind === "consumer" ? "AV13" : position.kind === "variation" ? "AV14" : "AV15", realUse: "in-progress", nextUndispatchedAction: `inspect ${id}/${attemptId} after this dispatch`, lastKnownRequest: { positionId: id, attemptId, state: "registered-before-dispatch" } })
  let result: { status: string; providerCalls: number | null; raw: AttemptReport["raw"]; final: string; error?: string }
  if (position.kind === "debug" || position.kind === "variation") {
    const b = manifest.budgets, report = await executeLocalInquiryRun({ inputFile, outDir: path.join(directory, "raw", "inquiry"), model: manifest.testedModel, method: position.method, strategy: position.strategy, ...(previous ? { previous } : {}), execution: { maxDispatches: position.providerLimit, maxToolCalls: b.maxToolCalls, maxDisplayBytes: b.maxDisplayBytes, maxReadBytes: b.maxReadBytes, maxFiles: b.maxFiles, maxTokens: b.maxTokens, perCallTimeoutMs: b.perCallTimeoutMs, sessionTimeoutMs: b.sessionTimeoutMs, onEvent: async event => { await currentStatus({ lastKnownRequest: { positionId: id, attemptId, sequence: event.sequence, kind: event.kind, providerAttemptId: event.attemptId } }) } } })
    result = await archiveInquiryResult(directory, report)
  } else if (position.kind === "author") result = await runAuthor(position, manifest, inputFile, directory, revision)
  else {
    const workDir = path.join(directory, "workspace"); await mkdir(workDir)
    let scope = loaded.value
    if (authored) {
      const authoredValue = AuthorizationInquiryInputSchema.parse(JSON.parse(Buffer.from(authored.inquiry).toString("utf8")))
      if (authoredValue.sourceRoot !== "source") throw new Error("Original author sourceRoot must be the registered portable root; main does not sanitize author fields")
      await copySourceSnapshot({ ...originalInput.context, maxReadBytes: manifest.budgets.maxReadBytes, maxFiles: manifest.budgets.maxFiles }, path.join(workDir, "source"))
      await writeFile(path.join(workDir, "inquiry.json"), authored.inquiry, { flag: "wx" }); await writeFile(path.join(workDir, "USAGE.md"), authored.usage, { flag: "wx" }); scope = authoredValue
    } else scope = { ...loaded.value, sourceRoot: path.relative(workDir, loaded.context.sourceRoot).replaceAll("\\", "/") }
    const scopeFile = path.join(workDir, authored ? "inquiry.json" : "scope.json"); if (!authored) await save(scopeFile, scope)
    const policy = scope.inquiry?.policy ?? scope.policy
    const prompt = `${originalInput.value.brief ?? JSON.stringify(originalInput.value.inquiry)}\n${policy ? `Independent CURRENT policy: ${policy.text}\n` : ""}Use the complete original security skill for this bounded source-visible question. Preserve every requested distinction, original reporting format, citations, confidence, source self-verification and remaining skill duties/limits. Explain source behavior and independent policy separately. Keep unspecified user facts separate from available unexamined source. No target execution. Conclude naturally from the evidence actually examined.${authored ? " The admitted inquiry.json and USAGE.md are the original author bytes; follow their current task declaration and retain all original duties." : ""}`
    const traceFile = path.join(workDir, "native-trace.json"), args = nativeInvocation(position, manifest, { prompt, scopeFile, skillFile: path.resolve(root, manifest.skills[position.task].file), workDir, traceFile })
    await save(path.join(directory, "invocation.json"), { args, promptSha256: sha(prompt), noTargetExecution: true, originalInputSha256: originalInput.inputSha256, ...(authored ? { inquirySha256: sha(authored.inquiry), usageSha256: sha(authored.usage), originalBytesConsumed: true } : {}) })
    const child = Bun.spawn([process.execPath, path.join(repo, "src/index.ts"), ...args], { cwd: repo, env: process.env, stdout: "pipe", stderr: "pipe" })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    await writeFile(path.join(directory, "stdout.txt"), stdout, { flag: "wx" }); await writeFile(path.join(directory, "stderr.txt"), stderr, { flag: "wx" })
    if (await stat(traceFile).catch(() => undefined)) {
      const value = await json(traceFile), raw = RawRunSchema.parse(value), native = z.object({ attempts: z.array(AttemptSchema), result: z.unknown().optional(), domain: z.object({ delivery: z.unknown().optional() }).passthrough().optional() }).passthrough().parse(value)
      const final = raw.attempts.filter(a => a.localConsumer === "accepted").at(-1)?.response?.text ?? ""
      const observation = z.object({ process: z.object({ exitCode: z.number() }).passthrough(), terminal: z.object({ present: z.boolean() }).passthrough() }).passthrough().parse(await json(path.join(workDir, "execution-observation.json")))
      await save(path.join(directory, "execution-observation.json"), observation)
      const provenance = z.object({ sourceFiles: z.array(FileIdentitySchema), requests: z.array(z.object({ params: z.object({ system: z.string() }).passthrough() }).passthrough()) }).passthrough().parse(value)
      const system = provenance.requests[0]?.params.system ?? "", originalSkill = await loadSkill(path.resolve(root, manifest.skills[position.task].file))
      const expectedFiles = registration?.sourceFiles ?? manifest.inputs.find(i => i.id === `${position.task}-original`)!.sourceFiles
      const declaration = scope.inquiry ? { inquiry: scope.inquiry } : { brief: scope.brief, mode: scope.mode ?? "behavior", ...(scope.policy ? { policy: scope.policy } : {}) }
      const errors: string[] = []
      if (!isDeepStrictEqual(provenance.sourceFiles, expectedFiles)) errors.push("Runtime source index differs from registered originals")
      if (!system.includes(originalSkill.skillContent) || !system.includes(`Identity ${scope.repository}@${scope.sourceRef}; allowed paths: ${JSON.stringify(scope.allowedPaths)}`) || !system.includes(`Current user task declaration (data, without source-derived answers): ${JSON.stringify(declaration)}`)) errors.push("First actual request does not bind the full skill and exact source/task declaration")
      const installedRoot = system.match(/<runtime-resource-root>(\.skvm\/skills\/[A-Za-z0-9._-]+)<\/runtime-resource-root>/)?.[1]
      let installedBundleSha256: string | null = null
      if (installedRoot) {
        const installed = await skillIdentity(path.join(workDir, installedRoot, "SKILL.md")); installedBundleSha256 = installed.bundleSha256
        if (installed.bundleSha256 !== manifest.skills[position.task].bundleSha256) errors.push("Installed full skill bundle differs from registration")
      } else errors.push("Installed skill resource root is not bound in the actual request")
      await save(path.join(directory, "provenance.json"), { valid: errors.length === 0, errors, sourceFiles: provenance.sourceFiles, installedBundleSha256, originalInputSha256: originalInput.inputSha256, exactScopeSha256: sha(await readFile(scopeFile)), firstRequestFullSkill: system.includes(originalSkill.skillContent) })
      await gzipFile(traceFile, path.join(directory, "raw", "native-trace.json.gz"))
      result = { status: errors.length ? "native-provenance-mismatch" : exitCode === 0 && observation.process.exitCode === 0 && observation.terminal.present ? position.arm === "N" ? "native-delivered" : native.result ? "native-checked-delivered" : "native-partial-delivered" : "native-process-failed", providerCalls: raw.attempts.length, raw: { kind: "native", file: "raw/native-trace.json.gz" }, final, ...(errors.length ? { error: errors.join("; ") } : exitCode || observation.process.exitCode ? { error: `CLI exit ${exitCode}, actual run exit ${observation.process.exitCode}; original stderr retained` } : {}) }
    } else { await save(path.join(directory, "raw", "native-not-dispatched.json"), { attempts: [], events: [], exitCode }); result = { status: "native-trace-unavailable", providerCalls: null, raw: { kind: "native", file: "raw/native-not-dispatched.json" }, final: "", error: "No retained native trace; calls cannot be inferred from process output" } }
  }
  const report = AttemptReportSchema.parse({ schemaVersion: "authorization-av-attempt/v1", positionId: id, attemptId, revision: revision?.label ?? null, parent: revision?.parent ?? null, startedAt, implementationRevision, model: manifest.testedModel, inputSha256: loaded.inputSha256, sourceFiles: registration?.sourceFiles ?? manifest.inputs.find(i => i.id === `${position.task}-original`)!.sourceFiles, skillBundleSha256: position.kind === "debug" || position.kind === "variation" ? null : manifest.skills[position.task].bundleSha256, targetExecutions: 0, ...result })
  await save(path.join(directory, "report.json"), report); await writeFile(path.join(directory, "final.txt"), report.final, { flag: "wx" })
  const accounting = await replay()
  await currentStatus({ providerCalls: accounting.providerCalls, nextUndispatchedAction: `Review actual ${id}/${attemptId}; continue the finite AV taskbook`, lastKnownRequest: { positionId: id, attemptId, state: "attempt-archived", raw: report.raw } })
  return report
}
if (import.meta.main) {
  const command = process.argv[2]
  const output = command === "init" ? await init() : command === "check" ? await check() : command === "replay" ? await replay() : command === "run" ? await run(process.argv[3] ?? "", process.argv[4] ? { label: z.string().regex(/^--revision=[a-z0-9-]+$/).parse(process.argv[4]).slice(11), parent: z.string().regex(/^--parent=(?:first|revision-[a-z0-9-]+)$/).parse(process.argv[5]).slice(9) } : undefined) : (() => { throw new Error("Use study.ts init|check|run <exact-position-id> [--revision=<name> --parent=<attempt>] |replay") })()
  console.log(JSON.stringify(output, null, 2))
}
