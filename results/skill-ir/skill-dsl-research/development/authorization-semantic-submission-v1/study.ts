import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile, stat } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gunzipSync, gzipSync } from "node:zlib"
import path from "node:path"
import { inputPlan } from "../authorization-question-closure-v1/study.ts"
import { loadInquiryInput, checkAuthorizationInquiry, executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { normalizeNaturalOperation } from "../../../../../src/task-dsl/authorization/operation-program.ts"
import { compileAuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry-program.ts"
import { CodexAccountAdapter } from "../../../../../src/adapters/codex-account.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { executeRun, materializeNaturalRunTask, buildRunSkillBundle } from "../../../../../src/run/index.ts"
import { redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"
import { prepareConsumerInput } from "../authorization-property-execution-v1/consumer.ts"
import { copySourceSnapshot } from "../authorization-semantic-lowering-v1/source-snapshot.ts"

export const identity = "authorization-semantic-submission-v1"
export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const runRoot = `D:/skill优化/project-maintenance/runs/${identity}`
export const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
export const limits = { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }
export interface Position { id: string; stage: string; kind: "pilot" | "quality" | "consumer" | "change"; task: "download" | "owui"; entrance: "native" | "inquiry"; arm?: string; repeat?: number; order: number; status: string; attempts: string[] }

export function positions(): Position[] {
  const rows: Omit<Position, "order" | "status" | "attempts">[] = [
    { id: "pilot-download", stage: "BA9", kind: "pilot", task: "download", entrance: "native" },
    { id: "pilot-owui", stage: "BA9", kind: "pilot", task: "owui", entrance: "native" },
  ]
  for (const repeat of [1, 2]) for (const [task, arms] of repeat === 1 ? [["download", ["N", "M", "D"]], ["owui", ["D", "M", "N"]]] as const : [["download", ["D", "N", "M"]], ["owui", ["M", "D", "N"]]] as const) {
    for (const arm of arms) rows.push({ id: `quality-${task}-${arm}-repeat-${repeat}`, stage: repeat === 1 ? "BA11" : "BA12", kind: "quality", task, entrance: "native", arm, repeat })
  }
  rows.push({ id: "consumer-download-inquiry", stage: "BA13", kind: "consumer", task: "download", entrance: "inquiry" }, { id: "consumer-owui-native", stage: "BA13", kind: "consumer", task: "owui", entrance: "native" })
  for (const change of ["policy", "premise", "source"]) for (const arm of ["fresh", "previous"]) rows.push({ id: `change-download-${change}-${arm}`, stage: "BA14", kind: "change", task: "download", entrance: "inquiry", arm })
  return rows.map((row, i) => ({ ...row, order: i + 1, status: "registered-not-run", attempts: [] }))
}

export function assertOwnedPaths(studyRoot: string, externalRoot: string) {
  if (path.basename(path.resolve(studyRoot)) !== identity || path.basename(path.resolve(externalRoot)) !== identity || path.resolve(studyRoot) === path.resolve(externalRoot)) throw new Error("BA output identity: refuse old or shared output directory")
}

export function classifyAccountChannel(account: Record<string, any>, recoveriesUsed: number) {
  if (account.quotaRefused) return { status: "paused-quota", reason: account.terminalError?.message ?? account.reason }
  if (/authenticat|unauthorized|login required/i.test(account.reason ?? account.terminalError?.message ?? "")) return { status: "paused-auth", reason: account.reason }
  if (["completion-unknown", "timeout-unknown"].includes(account.status)) return { status: "completion-unknown", reason: account.reason }
  const reason = account.terminalError?.message ?? account.reason ?? ""
  if (["failed", "interrupted"].includes(account.terminalStatus) && /workspace routing discovery failed|connection (?:failed|closed)|transport.*failed/i.test(reason)) return { status: recoveriesUsed < 1 ? "terminal-routing-recovery-eligible" : "paused-recurring-routing", reason }
  if (account.status === "unavailable") return { status: "paused-local-configuration", reason }
  return { status: "available", reason: account.status }
}
export function admitDispatch(state: Record<string, any>, readiness: { readyToDispatch: boolean; terminalVerified: boolean }) {
  if (state.activeAttempts.length || state.unknownCompletions.length) throw new Error("Inspect active/unknown completion before dispatch")
  if (!readiness.readyToDispatch) throw new Error("A checked input and registered runtime snapshot must be ready")
  const channel = state.accountChannel
  if (channel.status === "terminal-routing-recovery-eligible") {
    if (channel.recoveriesUsed >= 1 || !readiness.terminalVerified) throw new Error("One recovery requires verified original terminal closure")
    return { parentAttempt: channel.parentAttempt, retryReason: channel.reason, recovery: true }
  }
  if (channel.status.startsWith("paused-") || channel.status === "completion-unknown") throw new Error(`Account channel blocked: ${channel.status}; inspect new external evidence before resuming`)
  return { recovery: false }
}

/** Task facts contain only exact user text and mechanical identities, never source answers. */
export function buildTaskFacts(original: Record<string, any>) {
  if (!original.brief?.trim()) throw new Error("Common quality facts require the complete original brief")
  const inquiry = normalizeNaturalOperation(original.brief, original.mode ?? "behavior", original.policy, { allowMissingPolicy: true })
  const requirements = [...original.brief.matchAll(/[^.!?]+[.!?]?/g)].map((m: RegExpMatchArray, i) => ({ id: `requirement-${i + 1}`, text: m[0].trim(), originalStart: m.index! + m[0].indexOf(m[0].trim()), originalEnd: m.index! + m[0].trimEnd().length, questionId: inquiry.questions[0]!.id }))
  return { schemaVersion: "authorization-ba-task-facts/v1", originalBrief: original.brief, repository: original.repository, sourceRef: original.sourceRef, allowedPaths: original.allowedPaths, mode: inquiry.mode, policy: inquiry.policy ?? null, requirements, inquiry, originalQuestionsPreserved: true, sourceDerivedAnswers: false }
}
export async function dryRun(id: string) {
  const position = positions().find(p => p.id === id); if (!position) throw new Error("Use a registered BA position")
  const original = inputPlan(position.task), consumer = position.kind === "consumer", plain = position.arm === "N"
  const inputFile = consumer ? path.join(root, "model/packages", position.task, "inquiry.json") : path.join(root, "model/inputs", `${position.task}-${position.kind === "pilot" ? "pilot" : plain ? "natural" : "common"}.json`)
  return { positionId: id, entrance: position.entrance, inputFile, originalInputFile: original.inputFile, skillFile: original.skillFile, ...(consumer ? { authorAttempt: original.authorAttempt } : {}), domainTools: !plain, method: position.arm === "D" || consumer ? "D1" as const : "M" as const, strategy: plain ? "legacy" as const : "operation-evidence-v6" as const, model: "gpt-5.6-sol", effort: "high", limits, evaluatorProvidedToRuntime: false }
}
export async function prepareConsumerPackage(options: Parameters<typeof prepareConsumerInput>[0]) {
  const exists = (file: string) => stat(file).then(() => true, error => { if (error.code === "ENOENT") return false; throw error })
  const destination = path.resolve(options.destination), source = path.join(destination, "source")
  if (await exists(path.join(destination, "inquiry.json")) && !await exists(source)) {
    for (const [local, original] of [["inquiry.json", "authored-inquiry.json"], ["USAGE.md", "authored-USAGE.md"]]) {
      if (!(await readFile(path.join(destination, local!))).equals(await readFile(path.join(options.authorAttempt, original!)))) throw new Error("Existing consumer package identity mismatch")
    }
    const original = await loadInquiryInput(options.originalInputFile)
    await copySourceSnapshot({ ...original.context, maxReadBytes: limits.maxReadBytes }, source)
  }
  return prepareConsumerInput(options)
}
async function writeSame(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  try { await write(file, value, true) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || JSON.stringify(JSON.parse(await readFile(file, "utf8"))) !== JSON.stringify(value)) throw error }
}
export async function preparePositionInput(id: string) {
  const plan = await dryRun(id), position = positions().find(p => p.id === id)!, original = await loadInquiryInput(plan.originalInputFile), facts = buildTaskFacts(original.value)
  await writeSame(path.join(root, "model/task-facts", `${position.task}.json`), { ...facts, originalInputFile: plan.originalInputFile, originalInputSha256: original.inputSha256 })
  if (plan.authorAttempt) await prepareConsumerPackage({ originalInputFile: plan.originalInputFile, authorAttempt: plan.authorAttempt, destination: path.dirname(plan.inputFile) })
  else {
    const { brief: _brief, mode: _mode, policy: _policy, ...metadata } = original.value
    const input = { ...metadata, sourceRoot: path.relative(path.dirname(plan.inputFile), original.context.sourceRoot).split(path.sep).join("/"), ...(position.arm === "N" ? { brief: original.value.brief, mode: original.value.mode ?? "behavior", ...(original.value.policy ? { policy: original.value.policy } : {}) } : { inquiry: facts.inquiry }) }
    if (position.kind === "pilot") {
      const requirement = position.task === "download" ? "whether selecting another version changes the resource that is authorized" : "whether the object authorized for input and the object affected by output are the same"
      if (!original.value.brief!.includes(requirement)) throw new Error("Pilot property must be an exact span of the original task")
      ;(input as any).inquiry = { ...facts.inquiry, questions: [{ ...facts.inquiry.questions[0], request: original.value.brief!, properties: [{ id: "original-resource-relation", kind: "authorized-object-matches-effect", requirement }] }] }
    }
    await writeSame(plan.inputFile, input)
  }
  const checked = await checkAuthorizationInquiry(plan.inputFile, plan.method, plan.strategy)
  const skill = await loadSkill(plan.skillFile), skillIdentity = []
  for (const file of ["SKILL.md", ...skill.bundleFiles].sort()) { const bytes = await readFile(path.join(skill.skillDir, file)); skillIdentity.push({ file, bytes: bytes.length, sha256: sha(bytes) }) }
  const readiness = { readyToDispatch: checked.status === "valid", positionId: id, publicCheck: checked, skillIdentity, runtimeTree: execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim(), limits, model: plan.model, effort: plan.effort, noPriorAdoptionRequired: true }
  await mkdir(path.join(root, "verification"), { recursive: true }); await write(path.join(root, "verification", `ready-${id}.json`), readiness)
  return { ...plan, readiness }
}

export async function verifyInputEquivalence() {
  const tasks = []
  for (const task of ["download", "owui"]) {
    const m = await preparePositionInput(`quality-${task}-M-repeat-1`), d = await preparePositionInput(`quality-${task}-D-repeat-1`), n = await preparePositionInput(`quality-${task}-N-repeat-1`)
    const mi = await loadInquiryInput(m.inputFile), di = await loadInquiryInput(d.inputFile), ni = await loadInquiryInput(n.inputFile), original = await loadInquiryInput(m.originalInputFile)
    const program = compileAuthorizationInquiry(mi.value.inquiry!), programSha256 = sha(JSON.stringify(program)), identicalProgram = JSON.stringify(program) === JSON.stringify(compileAuthorizationInquiry(di.value.inquiry!)), identicalSources = [d, n].every(p => p.readiness.publicCheck.status === "valid" && m.readiness.publicCheck.status === "valid" && JSON.stringify(p.readiness.publicCheck.sourceFiles) === JSON.stringify(m.readiness.publicCheck.sourceFiles)), identicalSkill = [d, n].every(p => JSON.stringify(p.readiness.skillIdentity) === JSON.stringify(m.readiness.skillIdentity))
    tasks.push({ task, originalInputSha256: original.inputSha256, mInputSha256: mi.inputSha256, dInputSha256: di.inputSha256, nInputSha256: ni.inputSha256, programSha256, identicalProgram, identicalSources, identicalSkill, originalBriefPreserved: mi.value.inquiry!.questions[0]!.request === original.value.brief && ni.value.brief === original.value.brief, questionIds: program.questions.map(q => q.id), oldAuthorPackageUsed: false, limits, actualLoadedEvidence: "pending-real-account-claim/report" })
  }
  const result = { schemaVersion: "authorization-ba-input-equivalence/v1", status: tasks.every(t => t.identicalProgram && t.identicalSources && t.identicalSkill && t.originalBriefPreserved) ? "preflight-pass-actual-loading-pending" : "failed", tasks, modelCalls: 0 }
  await write(path.join(root, "input-equivalence.json"), result); return result
}

export async function run(id: string, revision?: string) {
  assertOwnedPaths(root, runRoot)
  const manifestFile = path.join(root, "manifest.json"), statusFile = path.join(root, "status.json"), manifest = JSON.parse(await readFile(manifestFile, "utf8")), state = JSON.parse(await readFile(statusFile, "utf8")), position = manifest.positions.find((p: Position) => p.id === id) as Position
  if (!position) throw new Error("Use a registered BA position")
  if (position.kind === "change") throw new Error("Changes require a current qualified same-version baseline and explicit change registration")
  if (!revision && position.attempts.length || revision && (!/^[a-z0-9-]+$/.test(revision) || !position.attempts.length)) throw new Error("Preserve first attempts; repair needs a new named identity")
  if (execFileSync("git", ["diff", "HEAD", "--name-only", "--", "src"], { cwd: repo, encoding: "utf8" }).trim()) throw new Error("Commit the verified production snapshot before dispatch")
  const plan = await preparePositionInput(id)
  if (plan.readiness.publicCheck.status !== "valid") throw new Error("Public input check is not ready")
  let terminalVerified = state.accountChannel.status !== "terminal-routing-recovery-eligible", terminalEvidence: unknown
  if (!terminalVerified) {
    const bytes = await readFile(state.accountChannel.lifecycle), events = bytes.toString("utf8").trim().split("\n").map(line => JSON.parse(line)), terminal = events.filter(e => e.direction === "server" && e.method === "turn/completed").at(-1)
    terminalVerified = terminal?.params?.turn?.status === state.accountChannel.terminalStatus && ["failed", "interrupted"].includes(state.accountChannel.terminalStatus)
    terminalEvidence = { lifecycle: state.accountChannel.lifecycle, sha256: sha(bytes), terminalStatus: terminal?.params?.turn?.status, originalActiveAttempts: state.accountChannel.originalActiveAttempts, originalUnknownCompletions: state.accountChannel.originalUnknownCompletions, closure: "Retained account result returned after runCodexAccountSession finally closed its own transport" }
  }
  const admission = admitDispatch(state, { readyToDispatch: plan.readiness.readyToDispatch, terminalVerified }), attemptId = `${id}/${revision ?? "original"}`, out = path.join(root, "attempts", attemptId), external = path.join(runRoot, "attempts", attemptId), loaded = await loadInquiryInput(plan.inputFile), original = await loadInquiryInput(plan.originalInputFile), skill = await loadSkill(plan.skillFile)
  await mkdir(path.dirname(out), { recursive: true }); await mkdir(out); await mkdir(external, { recursive: true })
  const gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), runtimeTree = plan.readiness.runtimeTree
  await write(path.join(out, "claim.json"), { attemptId, positionId: id, entrance: position.entrance, gitRevision, runtimeTree, runnerSha256: sha(await readFile(import.meta.path)), inputFile: plan.inputFile, inputSha256: loaded.inputSha256, originalTaskSha256: original.inputSha256, skillIdentity: plan.readiness.skillIdentity, sourceFiles: plan.readiness.publicCheck.sourceFiles, model: plan.model, effort: plan.effort, strategy: plan.strategy, method: plan.method, limits, ...admission, terminalEvidence, parentAttempt: admission.recovery ? admission.parentAttempt : revision ? position.attempts.at(-1) : null, startedAt: new Date().toISOString(), evaluatorProvidedToRuntime: false, targetExecutions: 0 }, true)
  position.attempts.push(attemptId); position.status = "running"; state.activeAttempts = [attemptId]; state.currentStage = position.stage
  if (admission.recovery) state.accountChannel.recoveriesUsed++
  await write(manifestFile, manifest); await write(statusFile, state)
  let account: any, native: any, sessionPath: string | undefined, status = "completion-unknown", error: string | undefined
  try {
    if (position.entrance === "native") {
      const task = await materializeNaturalRunTask({ prompt: original.value.brief!, taskPath: path.join(out, "task.json") })
      const executed = await executeRun({ task, skill, adapter: new CodexAccountAdapter(), workDir: path.join(external, "workspace"), keepWorkDir: true, skillMode: "inject", adapterConfig: { model: plan.model, maxSteps: limits.maxToolCalls, timeoutMs: limits.sessionTimeoutMs, providerOptions: { authorizationScope: plan.inputFile, authorizationDomainTools: plan.domainTools, authorizationStrategy: plan.strategy, ...(plan.domainTools ? { authorizationMethod: plan.method } : {}), authorizationAccountBoundary: path.join(root, "account-boundary.json"), authorizationTraceDir: path.join(external, "raw"), authorizationMaxToolCalls: limits.maxToolCalls, authorizationMaxDisplayBytes: limits.maxDisplayBytes, authorizationMaxReadBytes: limits.maxReadBytes, authorizationSessionTimeoutMs: limits.sessionTimeoutMs } } })
      await writeFile(path.join(out, "run-result.json.gz"), gzipSync(JSON.stringify(executed.runResult)), { flag: "wx" }); native = executed.runResult.authorizationInquiry; account = native.account
    } else {
      const report = await executeLocalInquiryRun({ inputFile: plan.inputFile, outDir: path.join(external, "public-inquiry"), skillFile: plan.skillFile, model: plan.model, method: plan.method, strategy: plan.strategy, harness: "codex-account", accountBoundaryFile: path.join(root, "account-boundary.json"), execution: limits })
      await write(path.join(out, "public-report.json"), report, true)
      if ("sessionPath" in report && typeof report.sessionPath === "string") { sessionPath = report.sessionPath; native = JSON.parse(await readFile(path.join(sessionPath, "run.json"), "utf8")); account = native.telemetry.account }
    }
    status = account?.status ?? "completion-unknown"
  } catch (cause) { error = String(cause) }
  const actualStart = account?.events?.find((e: any) => e.direction === "client" && e.method === "thread/start")?.params, expectedBundle = redactCodexEvent(buildRunSkillBundle(skill, "inject")!.content) as string
  const actualModelInput = actualStart ? { systemSha256: sha(actualStart.baseInstructions), systemBytes: Buffer.byteLength(actualStart.baseInstructions), fullOriginalBundlePrefixMatches: actualStart.baseInstructions.startsWith(expectedBundle), loadedBundleSha256: sha(expectedBundle), loadedBundleBytes: Buffer.byteLength(expectedBundle), toolsSha256: sha(JSON.stringify(actualStart.dynamicTools)), toolNames: actualStart.dynamicTools.map((t: any) => t.name), originalQuestionTextPresent: actualStart.baseInstructions.includes(redactCodexEvent(original.value.brief!) as string), evidence: "Retained client thread/start baseInstructions and dynamicTools; archive redaction applied equally to expected bundle" } : null
  const report = { attemptId, positionId: id, status, ...admission, gitRevision, runtimeTree, sessionPath, inputSha256: loaded.inputSha256, actualModelInput, accountStatus: account?.status, terminalStatus: account?.terminalStatus, answerDelivery: account?.answerDelivery, quotaRefused: account?.quotaRefused, terminalError: account?.terminalError, finalPresent: !!account?.text?.trim(), answerSha256: sha(account?.text ?? ""), accountUsage: account?.usage ?? null, usageDetails: account?.usageDetails, usageSource: account?.usageSource, instructionSources: account?.capability?.instructionSources ?? null, inferenceDispatched: account?.inferenceDispatched ?? null, hostToolCalls: account ? account.tools.length + account.toolRejections.length : 0, sourceWorkMetrics: native?.domain?.sourceWorkMetrics, materialUses: native?.domain?.materialUses ?? [], propertyAnalysis: native?.domain?.propertyAnalysis, currentCheck: native?.domain?.check, sourceAccounting: native?.sourceAccounting, toolBudget: native?.toolBudget, sourceVerification: native?.sourceVerification, resultPresent: !!native?.result, durationMs: account?.durationMs ?? null, reason: account?.reason, error, actualUsd: null, providerRequests: null, targetExecutions: 0, semanticQuality: account?.text?.trim() ? "awaiting-independent-review" : "undelivered" }
  await write(path.join(out, "report.json"), report, true); await writeFile(path.join(out, "answer-original.md"), account?.text ?? "", { flag: "wx" })
  position.status = status; state.activeAttempts = []
  if (status.endsWith("unknown")) state.unknownCompletions.push(attemptId)
  const channel = account ? classifyAccountChannel(account, state.accountChannel.recoveriesUsed) : { status: "completion-unknown", reason: error }
  state.accountChannel = { ...state.accountChannel, ...channel, lastAttempt: attemptId, terminalStatus: account?.terminalStatus, lifecycle: path.join(external, "raw/lifecycle.jsonl"), recoveryEvidence: admission.recovery ? { attemptId, terminalEvidence } : state.accountChannel.recoveryEvidence }
  if (channel.status.startsWith("paused-")) { state.status = "in-progress-external-blocker"; for (const p of manifest.positions) if (!p.attempts.length) p.status = "unrun-account-blocked" }
  await write(manifestFile, manifest); await write(statusFile, state)
  console.log(JSON.stringify({ attemptId, status, channel: channel.status, terminalStatus: account?.terminalStatus, finalPresent: report.finalPresent, hostToolCalls: report.hostToolCalls, sourceWorkMetrics: report.sourceWorkMetrics, usage: report.accountUsage, reason: account?.reason }))
  return report
}

/** Preserve original arguments, including invalid meanings. This fixture is never a model input. */
export async function extractOriginalRegression() {
  const historical = path.resolve(root, "../authorization-property-abstraction-v1"), entries = []
  for (const attemptId of ["single-download/original", "single-download/format-contract-1", "quality-download-M-repeat-1/original", "quality-download-D-repeat-1/original"]) {
    const directory = path.join(historical, "attempts", attemptId), native = attemptId.startsWith("quality-")
    const file = path.join(directory, native ? "run-result.json.gz" : "public-report.json"), bytes = await readFile(file)
    const saved = JSON.parse((native ? gunzipSync(bytes) : bytes).toString("utf8")), value = native ? saved.authorizationInquiry : saved, account = native ? value.account : value.telemetry.account
    const observation = JSON.parse(await readFile(path.join(directory, "runtime-observation.json"), "utf8"))
    entries.push({ attemptId, originalFile: file, originalSha256: sha(bytes), jsonPath: native ? "$.authorizationInquiry" : "$", terminal: { status: account.status, terminalStatus: account.terminalStatus, quotaRefused: account.quotaRefused, terminalError: account.terminalError ?? null, usage: account.usage ?? null },
      toolRejections: account.toolRejections, sourceInterpretations: value.domain?.focus?.sourceInterpretations ?? [], checkHistory: value.domain?.checkHistory ?? [], toolBudget: value.toolBudget ?? observation.toolBudget ?? null, runtimeObservation: observation })
  }
  return { schemaVersion: "authorization-ba-original-regression/v1", identity, entries, newInference: 0, originalScoresChanged: false, currentReplay: null, hypotheses: ["Selected-protocol diagnostics and displayed field/value slots may cause avoidable format friction; valid condition prose still lacks a computable predicate."] }
}

export async function bootstrap() {
  assertOwnedPaths(root, runRoot)
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), startupWorkingTree = execFileSync("git", ["status", "--short", "--branch"], { cwd: repo, encoding: "utf8" })
  const azRoot = path.resolve(root, "../authorization-property-abstraction-v1"), az = JSON.parse(await readFile(path.join(azRoot, "status.json"), "utf8"))
  if (az.activeAttempts.length || az.unknownCompletions.length) throw new Error("Inspect original active or unknown completion before takeover")
  await mkdir(runRoot, { recursive: true }); await mkdir(path.join(root, "fixtures"), { recursive: true })
  await write(path.join(root, "fixtures/az-original.json"), await extractOriginalRegression(), true)
  await write(path.join(root, "manifest.json"), { schemaVersion: "authorization-ba-manifest/v1", identity, date: "2026-10-09", baseline: head, startupWorkingTree, startupCleanBeforeBAFiles: true, developmentModel: "gpt-6.1-sol", developmentEffort: "max", experimentModel: "gpt-5.6-sol", experimentEffort: "high", strategy: "operation-evidence-v6", interactionMode: "authorization-source-edit/v1", budgetMode: "session-format-and-reserved-checks/v1", limits, positions: positions(), requirements: { engineering: "typed host-managed edits, exact diagnostics, bounded checks, public adoption, same-input comparison, recovery", qualityPositions: 12, pilots: 2, consumers: 2, changes: 6, originalQuestions: "all" }, outcomes: { engineering: "in-progress", realUse: "not-measured", quality: "not-measured", reuse: "not-measured" }, researchGoalAchieved: false, targetExecutions: 0, thirdPartyApi: "paused-by-user", evaluatorIsolation: "Fixtures/reviews/history/oracles never enter runtime input." }, true)
  await write(path.join(root, "status.json"), { schemaVersion: "authorization-ba-status/v1", identity, status: "in-progress", currentStage: "BA0", stages: Array.from({ length: 19 }, (_, i) => ({ id: `BA${i}`, status: i === 0 ? "registered" : "pending" })), activeAttempts: [], unknownCompletions: [], accountChannel: { status: "terminal-routing-recovery-eligible", parentAttempt: `authorization-property-abstraction-v1/${az.accountChannel.attemptId}`, terminalStatus: az.accountChannel.terminalStatus, reason: az.accountChannel.reason, lifecycle: az.accountChannel.lifecycle, recoveriesUsed: 0, originalActiveAttempts: az.activeAttempts, originalUnknownCompletions: az.unknownCompletions }, finiteQueueComplete: false, researchGoalAchieved: false, targetExecutions: 0 }, true)
  await write(path.join(root, "failure-analysis.json"), { schemaVersion: "authorization-ba-failures/v1", originalFixture: "fixtures/az-original.json", facts: "Three AZ domain attempts exhausted format correction with zero accepted source/material use/check history. D was terminal failed/routing, not quota.", currentReplay: null, hypotheses: [], originalFilesReadOnly: true }, true)
  await write(path.join(root, "tsconfig.json"), { extends: "../../../../../tsconfig.json", include: ["./*.ts"], exclude: ["attempts", "model", "node_modules"] }, true)
  await writeFile(path.join(root, "account-boundary.json"), await readFile(path.join(azRoot, "account-boundary.json")), { flag: "wx" })
}

if (import.meta.main) {
  if (process.argv[2] === "init") await bootstrap()
  else if (process.argv[2] === "dry-run") console.log(JSON.stringify(await dryRun(process.argv[3]!), null, 2))
  else if (process.argv[2] === "prepare") console.log(JSON.stringify(await preparePositionInput(process.argv[3]!)))
  else if (process.argv[2] === "equivalence") console.log(JSON.stringify(await verifyInputEquivalence()))
  else if (process.argv[2] === "run") await run(process.argv[3]!, process.argv[4])
  else throw new Error("Supported: init | dry-run/prepare/run <registered-position> [named-revision]")
}
