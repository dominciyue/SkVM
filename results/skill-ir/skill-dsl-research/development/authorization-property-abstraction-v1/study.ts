import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { gunzipSync, gzipSync } from "node:zlib"
import { inputPlan } from "../authorization-question-closure-v1/study.ts"
import { loadInquiryInput, checkAuthorizationInquiry, executeLocalInquiryRun, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { projectSourceMaterials } from "../../../../../src/benchmarks/authorization-dsl/source-material-projection.ts"
import { prepareConsumerInput } from "../authorization-property-execution-v1/consumer.ts"
import { prepareChangeInputs, resolveChangeRun } from "../authorization-property-execution-v1/changes.ts"
import { CodexAccountAdapter } from "../../../../../src/adapters/codex-account.ts"
import type { AccountSessionResult } from "../../../../../src/adapters/codex-account-session.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { executeRun, materializeNaturalRunTask } from "../../../../../src/run/index.ts"

export const identity = "authorization-property-abstraction-v1"
export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const runRoot = `D:/skill优化/project-maintenance/runs/${identity}`
export const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export interface Position { id: string; stage: string; kind: "quality" | "single" | "consumer" | "change"; task: "download" | "owui"; entrance: "native" | "inquiry"; arm?: string; repeat?: number; order: number; status: string; attempts: string[] }

export function positions(): Position[] {
  const rows: Omit<Position, "order" | "status" | "attempts">[] = [
    { id: "single-download", stage: "AZ9", kind: "single", task: "download", entrance: "inquiry" },
    { id: "consumer-download", stage: "AZ11", kind: "consumer", task: "download", entrance: "inquiry" },
    { id: "consumer-owui", stage: "AZ11", kind: "consumer", task: "owui", entrance: "inquiry" },
  ]
  for (const change of ["policy", "premise", "source"]) for (const arm of ["fresh", "previous"]) rows.push({ id: `change-download-${change}-${arm}`, stage: "AZ12", kind: "change", task: "download", entrance: "inquiry", arm })
  for (const repeat of [1, 2]) for (const [task, arms] of repeat === 1 ? [["download", ["N", "M", "D"]], ["owui", ["D", "M", "N"]]] as const : [["download", ["D", "N", "M"]], ["owui", ["M", "D", "N"]]] as const) {
    for (const arm of arms) rows.push({ id: `quality-${task}-${arm}-repeat-${repeat}`, stage: "AZ13", kind: "quality", task, entrance: "native", arm, repeat })
  }
  return rows.map((row, i) => ({ ...row, order: i + 1, status: "registered-not-run", attempts: [] }))
}

/** History is a read-only input. Only this identity owns output locations. */
export function assertOwnedPaths(studyRoot: string, externalRoot: string) {
  if (path.basename(path.resolve(studyRoot)) !== identity || path.basename(path.resolve(externalRoot)) !== identity || path.resolve(studyRoot) === path.resolve(externalRoot)) throw new Error("AZ output identity: refuse old or shared output directory")
}
export async function dryRun(id: string, studyRoot = root, externalRoot = runRoot) {
  assertOwnedPaths(studyRoot, externalRoot)
  const position = positions().find(p => p.id === id)
  if (!position) throw new Error("Use a registered AZ position")
  const original = inputPlan(position.task), plain = position.kind === "quality" && position.arm === "N"
  const authored = position.kind === "consumer" || position.arm === "D"
  const inputFile = position.kind === "single" ? path.join(studyRoot, "model/inputs/download-single.json") : position.kind === "change" ? path.join(studyRoot, "model/inputs/current", `download-${id.split("-").at(-2)}.json`) : authored ? path.join(studyRoot, "model/packages", position.task, "inquiry.json") : original.inputFile
  return { positionId: id, entrance: position.entrance, inputFile, originalInputFile: original.inputFile, skillFile: original.skillFile, authorAttempt: authored ? original.authorAttempt : undefined,
    domainTools: !plain, method: authored || position.kind === "change" ? "D1" as const : "M" as const, strategy: plain ? "legacy" as const : "operation-evidence-v6" as const,
    runRoot: externalRoot, outputs: [path.join(studyRoot, "attempts", id), path.join(externalRoot, "attempts", id)], runtimeInputFiles: [inputFile, original.skillFile, path.join(studyRoot, "account-boundary.json")],
    limits, model: "gpt-5.6-sol", effort: "high", targetExecutions: 0, evaluatorProvidedToRuntime: false }
}

export async function preparePositionInput(id: string, studyRoot = root) {
  const plan = await dryRun(id, studyRoot), original = await loadInquiryInput(plan.originalInputFile)
  if (positions().find(p => p.id === id)!.kind === "single") {
    const request = "Investigate the document Download operation: determine whether selecting another version changes the resource that is authorized. Ownership and object grants are unspecified. State precise remaining source or deployment limits."
    const { brief: _brief, mode: _mode, ...metadata } = original.value
    const value = { ...metadata, taskId: "az-development-download-single", sourceRoot: path.relative(path.dirname(plan.inputFile), original.context.sourceRoot).split(path.sep).join("/"), inquiry: { schemaVersion: "authorization-inquiry/v1", mode: "behavior", questions: [{ id: "download-selected-resource", request, premises: [{ text: "Ownership and object grants are unspecified.", origin: "user" }], properties: [{ id: "selected-resource", kind: "authorized-object-matches-effect", requirement: "whether selecting another version changes the resource that is authorized" }] }] } }
    await mkdir(path.dirname(plan.inputFile), { recursive: true })
    try { await write(plan.inputFile, value, true); await write(path.join(path.dirname(plan.inputFile), "download-single-provenance.json"), { developmentOnly: true, originalTask: original.value, originalInputSha256: original.inputSha256, splitReason: "One relationship explicitly asked by the original brief; no source-derived guard/effect answer supplied", originalFullTaskDenominatorRetained: true }, true) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || JSON.stringify(JSON.parse(await readFile(plan.inputFile, "utf8"))) !== JSON.stringify(value)) throw error }
  } else if (plan.authorAttempt) await prepareConsumerInput({ originalInputFile: plan.originalInputFile, authorAttempt: plan.authorAttempt, destination: path.dirname(plan.inputFile) })
  return plan
}

export function admitDispatch(state: { activeAttempts: string[]; unknownCompletions: string[]; accountChannel?: { status: string } }) {
  if (state.activeAttempts.length || state.unknownCompletions.length) throw new Error("Inspect active/unknown completion before any further dispatch")
  if (["quota-refused", "unavailable"].includes(state.accountChannel?.status ?? "")) throw new Error("Specified experiment account channel is unavailable; do not poll, resend or switch")
}

export function accountChannelBlocker(account: Pick<AccountSessionResult, "status" | "quotaRefused" | "terminalError" | "reason">) {
  if (account.quotaRefused) return { status: "quota-refused", kind: "quota", reason: account.reason }
  if (account.status === "unavailable") return { status: "unavailable", kind: "account-unavailable", reason: account.reason }
  if (account.status === "failed" && account.terminalError?.message === "workspace routing discovery failed") return { status: "unavailable", kind: "official-workspace-routing", reason: account.terminalError.message }
  return undefined
}

export async function prepareChanges(registrationId = "current") {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")), baseline = manifest.positions.find((p: Position) => p.id === "consumer-download") as Position
  if (!baseline.attempts.length || baseline.status === "running") throw new Error("A current original consumer session is required")
  const baselineAttemptId = baseline.attempts.at(-1)!, report = JSON.parse(await readFile(path.join(root, "attempts", baselineAttemptId, "report.json"), "utf8"))
  const runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim()
  if (!report.sessionPath || report.runtimeTree !== runtimeTree) throw new Error("Changes require a current session from the same production tree")
  return prepareChangeInputs(root, report.sessionPath, { baselineAttemptId, runtimeTree }, registrationId)
}

/** Actual ordinary entrances only. Historical study runners are never called. */
export async function run(id: string, revision?: string) {
  assertOwnedPaths(root, runRoot)
  const manifestFile = path.join(root, "manifest.json"), statusFile = path.join(root, "status.json"), manifest = JSON.parse(await readFile(manifestFile, "utf8")), state = JSON.parse(await readFile(statusFile, "utf8"))
  const position = manifest.positions.find((p: Position) => p.id === id) as Position | undefined
  if (!position) throw new Error("Use a registered AZ position")
  admitDispatch(state)
  if (!revision && position.attempts.length || revision && (!/^[a-z0-9-]+$/.test(revision) || !position.attempts.length)) throw new Error("Preserve first attempts; a repair needs a new named identity")
  if (execFileSync("git", ["diff", "HEAD", "--name-only", "--", "src"], { cwd: repo, encoding: "utf8" }).trim()) throw new Error("Commit the verified production snapshot before running")
  const plan = await preparePositionInput(id), gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim()
  let inputFile = plan.inputFile, previous: string | undefined, binding: Record<string, unknown> = {}
  if (position.kind === "change") { const changed = await resolveChangeRun(root, id, runtimeTree, "current"); inputFile = changed.inputFile; previous = changed.previous; binding = changed.binding }
  const loaded = await loadInquiryInput(inputFile), checked = await checkAuthorizationInquiry(inputFile, plan.method, plan.strategy)
  if (checked.status !== "valid") throw new Error(JSON.stringify(checked.diagnostics))
  const original = await loadInquiryInput(plan.originalInputFile), skill = await loadSkill(plan.skillFile), skillIdentity = []
  for (const file of ["SKILL.md", ...skill.bundleFiles].sort()) { const bytes = await readFile(path.join(skill.skillDir, file)); skillIdentity.push({ file, sha256: sha(bytes), bytes: bytes.length }) }
  const attemptId = `${id}/${revision ?? "original"}`, out = path.join(root, "attempts", attemptId), external = path.join(runRoot, "attempts", attemptId)
  await mkdir(path.dirname(out), { recursive: true }); await mkdir(out)
  await write(path.join(out, "claim.json"), { attemptId, positionId: id, entrance: position.entrance, gitRevision, runtimeTree, runnerSha256: sha(await readFile(import.meta.path)), inputFile, inputSha256: loaded.inputSha256, originalTaskSha256: original.inputSha256, skillIdentity, sourceFiles: checked.sourceFiles, model: "gpt-5.6-sol", effort: "high", strategy: plan.strategy, method: plan.method, limits, ...binding, startedAt: new Date().toISOString(), targetExecutions: 0, evaluatorProvidedToRuntime: false }, true)
  position.attempts.push(attemptId); position.status = "running"; state.activeAttempts = [attemptId]; state.currentStage = position.stage
  await write(manifestFile, manifest); await write(statusFile, state)
  let account: AccountSessionResult | undefined, sessionPath: string | undefined, status = "completion-unknown", details: Record<string, unknown> = {}
  try {
    if (position.entrance === "native") {
      const task = await materializeNaturalRunTask({ prompt: original.value.brief ?? JSON.stringify(original.value.inquiry), taskPath: path.join(out, "task.json") })
      const result = await executeRun({ task, skill, adapter: new CodexAccountAdapter(), workDir: path.join(external, "workspace"), keepWorkDir: true, skillMode: "inject", adapterConfig: { model: "gpt-5.6-sol", timeoutMs: limits.sessionTimeoutMs, maxSteps: limits.maxToolCalls, providerOptions: { authorizationScope: inputFile, authorizationDomainTools: plan.domainTools, authorizationStrategy: plan.strategy, ...(plan.domainTools ? { authorizationMethod: plan.method } : {}), authorizationAccountBoundary: path.join(root, "account-boundary.json"), authorizationTraceDir: path.join(external, "raw"), authorizationMaxToolCalls: limits.maxToolCalls, authorizationMaxDisplayBytes: limits.maxDisplayBytes, authorizationMaxReadBytes: limits.maxReadBytes, authorizationSessionTimeoutMs: limits.sessionTimeoutMs } } })
      await writeFile(path.join(out, "run-result.json.gz"), gzipSync(JSON.stringify(result.runResult)), { flag: "wx" })
      const native = result.runResult.authorizationInquiry as any; account = native.account; status = account!.status
      details = { resultPresent: !!native.result, sourceVerification: native.sourceVerification, sourceWorkMetrics: native.domain?.sourceWorkMetrics, materialUses: native.domain?.materialUses, currentCheck: native.domain?.check, propertyAnalysis: native.domain?.propertyAnalysis, sourceAccounting: native.sourceAccounting }
    } else {
      const report = await executeLocalInquiryRun({ inputFile, outDir: path.join(external, "public-inquiry"), skillFile: plan.skillFile, model: "gpt-5.6-sol", method: plan.method, strategy: plan.strategy, previous, harness: "codex-account", accountBoundaryFile: path.join(root, "account-boundary.json"), execution: limits })
      status = report.status; await write(path.join(out, "public-report.json"), report, true)
      if ("sessionPath" in report && typeof report.sessionPath === "string") {
        sessionPath = report.sessionPath; await inspectLocalInquiry(sessionPath)
        const saved = JSON.parse(await readFile(path.join(sessionPath, "run.json"), "utf8")); account = saved.telemetry.account
        details = { resultPresent: !!saved.result, sourceVerification: saved.sourceVerification, sourceWorkMetrics: saved.native?.domain?.sourceWorkMetrics, materialUses: saved.domain?.materialUses, currentCheck: saved.domain?.check, propertyAnalysis: saved.domain?.propertyAnalysis, sourceAccounting: saved.sourceAccounting, reuse: saved.reuse }
      } else details = { publicResult: report }
    }
  } catch (error) { details = { ...details, error: String(error) } }
  await writeFile(path.join(out, "answer-original.md"), account?.text ?? "", { flag: "wx" })
  await write(path.join(out, "report.json"), { attemptId, positionId: id, entrance: position.entrance, status, ...binding, ...details, gitRevision, runtimeTree, sessionPath, inputSha256: loaded.inputSha256, accountStatus: account?.status, terminalStatus: account?.terminalStatus, answerDelivery: account?.answerDelivery, quotaRefused: account?.quotaRefused, terminalError: account?.terminalError, finalPresent: !!account?.text.trim(), answerSha256: sha(account?.text ?? ""), accountUsage: account?.usage ?? null, usageDetails: account?.usageDetails, usageSource: account?.usageSource, inferenceDispatched: account?.inferenceDispatched ?? null, hostToolCalls: account ? account.tools.length + (account.toolRejections?.length ?? 0) : 0, durationMs: account?.durationMs ?? null, reason: account?.reason, providerRequests: null, actualUsd: null, targetExecutions: 0, semanticQuality: account?.text.trim() ? "awaiting-independent-review" : "undelivered" }, true)
  position.status = status; state.activeAttempts = []
  if (status.endsWith("unknown")) state.unknownCompletions.push(attemptId)
  const blocker = account && accountChannelBlocker(account)
  if (blocker) {
    state.status = "in-progress-external-blocker"; state.accountChannel = { ...blocker, attemptId, terminalStatus: account?.terminalStatus, recoveryEvidence: null }
    for (const p of manifest.positions) if (!p.attempts.length) p.status = "unrun-account-blocked"
  }
  await write(manifestFile, manifest); await write(statusFile, state)
  console.log(JSON.stringify({ attemptId, status, terminalStatus: account?.terminalStatus, quotaRefused: account?.quotaRefused, finalPresent: !!account?.text.trim(), hostToolCalls: account?.tools.length, usage: account?.usage ?? null, reason: account?.reason }))
}

export function attributeFailure(report: Record<string, any>) {
  const labels: string[] = [], diagnostics = report.currentCheck?.diagnostics ?? report.check?.diagnostics ?? []
  if (report.quotaRefused || /routing discovery|usage limit/i.test(JSON.stringify(report.terminalError ?? report.error ?? ""))) labels.push("channel")
  if (report.status === "unavailable") labels.push("host-protocol")
  if (diagnostics.some((d: any) => /role-required|callee-uninterpreted|argument-unbound/.test(d.code))) labels.push("semantic-interpretation")
  if (diagnostics.some((d: any) => /dependency-open|relationship-unresolved/.test(d.code))) labels.push("source-location-or-link")
  if (report.currentCheck?.taskResolution === "partial" || report.resultPresent === false) labels.push("check-or-delivery")
  return { labels: [...new Set(labels)], originalFacts: { status: report.status, terminalError: report.terminalError ?? null, resultPresent: report.resultPresent ?? null, sourceWorkMetrics: report.sourceWorkMetrics ?? null, recordedDiagnosticCodes: diagnostics.map((d: any) => d.code), accountUsage: report.accountUsage ?? null }, currentReplay: null, hypotheses: [], changesOriginalScore: false }
}

export async function bootstrap() {
  assertOwnedPaths(root, runRoot)
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  const workingTree = execFileSync("git", ["status", "--short", "--branch"], { cwd: repo, encoding: "utf8" })
  const ayRoot = path.resolve(root, "../authorization-question-closure-v1"), ay = JSON.parse(await readFile(path.join(ayRoot, "manifest.json"), "utf8"))
  const sources = []
  for (const task of ["download", "owui"]) {
    const plan = inputPlan(task), inputBytes = await readFile(plan.inputFile), authorBytes = await readFile(path.join(plan.authorAttempt, "authored-inquiry.json"))
    sources.push({ task, ...plan, inputSha256: sha(inputBytes), skillSha256: sha(await readFile(plan.skillFile)), authoredInputSha256: sha(authorBytes), questionIds: JSON.parse(authorBytes.toString("utf8")).inquiry.questions.map((q: any) => q.id) })
  }
  const attributions = []
  for (const position of ay.positions) for (const attemptId of position.attempts) {
    const reportFile = path.join(ayRoot, "attempts", attemptId, "report.json"), bytes = await readFile(reportFile)
    attributions.push({ attemptId, reportFile, reportSha256: sha(bytes), ...attributeFailure(JSON.parse(bytes.toString("utf8"))) })
  }
  await mkdir(runRoot, { recursive: true })
  await write(path.join(root, "manifest.json"), { schemaVersion: "authorization-az-manifest/v1", identity, date: "2026-10-09", baseline: head, startupWorkingTree: workingTree, developmentModel: "gpt-6.1-sol", developmentEffort: "max", experimentModel: "gpt-5.6-sol", experimentEffort: "high", strategy: "operation-evidence-v6", limits, positions: positions(), sources,
    nativeAliases: { "native-download": "quality-download-D-repeat-1", "native-owui": "quality-owui-D-repeat-1" }, requirements: { engineering: "property-scoped demand, bounded summaries, diagnostics, recovery, both entrances and invalidation", qualityPositions: 12, originalTaskQuestions: "all", consumers: 2, changes: 6, singleProperty: 1 }, outcomes: { engineering: "not-measured", realUse: "not-measured", quality: "not-measured", reuse: "not-measured" }, researchGoalAchieved: false, targetExecutions: 0, evaluatorIsolation: "Original tasks, skills, independent policy and allowed sources only; reviews, history, oracle and repair ledgers excluded", thirdPartyApi: "paused-by-user" }, true)
  await write(path.join(root, "status.json"), { schemaVersion: "authorization-az-status/v1", identity, status: "in-progress", currentStage: "AZ0", stages: Array.from({ length: 19 }, (_, i) => ({ id: `AZ${i}`, status: i === 0 ? "registered" : "pending" })), activeAttempts: [], unknownCompletions: [], finiteQueueComplete: false, researchGoalAchieved: false, accountChannel: { status: "availability-unconfirmed-for-experiment", historicalRefusal: "2026-10-08; old recovery hint 2026-10-14 16:47", latestMetadata: { source: "Codex app get_usage_limits (zero inference)", ordinaryUsageAllowed: true, usedPercent: 5, channelAvailabilityEstablished: false }, localStudyProcessesAtStartup: 0 }, targetExecutions: 0 }, true)
  await write(path.join(root, "failure-attribution.json"), { schemaVersion: "authorization-az-attribution/v1", originalAttempts: attributions.length, entries: attributions, method: "Recorded terminal/check diagnostics only; source verdicts remain the independent original reviews. Current replay is added separately after shared fixes.", newInference: 0 }, true)
  await write(path.join(root, "tsconfig.json"), { extends: "../../../../../tsconfig.json", include: ["./*.ts"], exclude: ["attempts", "model", "node_modules"] }, true)
  await writeFile(path.join(root, "account-boundary.json"), await readFile(path.join(ayRoot, "account-boundary.json")), { flag: "wx" })
}

/** Reproject retained model interpretations; never generate, revise or score an answer. */
export async function replayMaterials(output = path.join(root, "verification/material-adoption-v35.json")) {
  if (path.dirname(path.resolve(output)) !== path.join(root, "verification")) throw new Error("AZ replay output must belong to this identity")
  const entries = []
  for (const task of ["download", "owui"]) {
    const original = path.resolve(root, `../authorization-question-closure-v1/attempts/native-${task}/full-flow-v35-cli-0-162`)
    const bytes = await readFile(path.join(original, "run-result.json.gz")), native = JSON.parse(gunzipSync(bytes).toString("utf8")).authorizationInquiry
    const input = await loadInquiryInput(inputPlan(task).inputFile)
    const tools = await createInquiryTools({ ...input.context, structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true, maxReadBytes: limits.maxReadBytes })
    const projected = projectSourceMaterials(native.program, native.domain.semantic.units, native.domain.sourceMaterials, tools.structure!, { questionDirected: true, semanticVersion: "question-control/v1" })
    entries.push({ task, originalArchive: path.join(original, "run-result.json.gz"), originalArchiveSha256: sha(bytes), originalCheck: native.domain.check, originalStages: { ...native.domain.sourceWorkMetrics, materialsSaved: native.domain.sourceMaterials.materials.length, uses: native.domain.materialUses.length }, currentProjection: { stages: projected.stages, diagnostics: projected.diagnostics, uses: projected.uses }, firstRecordedBlocker: native.domain.check?.diagnostics[0] ?? null, firstProjectionBlocker: projected.diagnostics[0] ?? null, originalResultUnchanged: true, newModelCalls: 0, semanticReview: "not-performed-by-replay" })
  }
  await mkdir(path.dirname(output), { recursive: true })
  await write(output, { schemaVersion: "authorization-az-material-replay/v1", newModelCalls: 0, entries })
  console.log(JSON.stringify(entries.map(e => ({ task: e.task, original: e.originalStages, current: e.currentProjection.stages, blocker: e.firstProjectionBlocker?.code }))))
}

if (import.meta.main) {
  if (process.argv[2] === "init") await bootstrap()
  else if (process.argv[2] === "dry-run") console.log(JSON.stringify(await dryRun(process.argv[3]!), null, 2))
  else if (process.argv[2] === "replay-materials") await replayMaterials()
  else if (process.argv[2] === "prepare") console.log(JSON.stringify(await preparePositionInput(process.argv[3]!)))
  else if (process.argv[2] === "prepare-changes") console.log(JSON.stringify(await prepareChanges(process.argv[3])))
  else if (process.argv[2] === "run") await run(process.argv[3]!, process.argv[4])
  else throw new Error("Supported: init | dry-run/prepare/run <registered-position> [named-revision] | prepare-changes [registration] | replay-materials")
}
