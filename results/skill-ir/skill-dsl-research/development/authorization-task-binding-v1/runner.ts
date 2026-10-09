import { mkdir, readFile, writeFile, appendFile, unlink } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gzipSync } from "node:zlib"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { CodexAccountAdapter } from "../../../../../src/adapters/codex-account.ts"
import { redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { executeLocalInquiryRun, loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { executeRun, materializeNaturalRunTask, buildRunSkillBundle } from "../../../../../src/run/index.ts"
import type { PreparationProgress } from "../../../../../src/benchmarks/authorization-dsl/evidence-preparation/preparation.ts"
import { assertAttemptClaim, admitDispatch, classifyAccountChannel } from "../authorization-interprocedural-property-v1/study.ts"
import { verifyTerminal } from "../authorization-interprocedural-property-v1/runner.ts"
import { root, bbRoot, repo, runRoot, sha, write, limits } from "./study.ts"
import { preparePositionInput } from "./execution-plan.ts"
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
export async function captureAttempt(execute: (onProgress: (event: PreparationProgress) => void) => Promise<any>, onProgress?: (event: PreparationProgress) => void) {
  const preparation: PreparationProgress[] = [], started = Date.now(); let value: any, error: string | undefined
  try { value = await execute(event => { preparation.push(event); onProgress?.(event) }) } catch (cause) { error = String(cause) }
  return { value, error, preparation, durationMs: Date.now() - started }
}
export function settleAttempt(account: any, preparation: PreparationProgress[], error?: string, publicReport?: any) {
  if (!account && publicReport?.providerCalls === 0 && ["needs-fresh-analysis", "invalid"].includes(publicReport.status)) return { status: publicReport.status === "needs-fresh-analysis" ? "blocked-previous" : "preparation-failed", terminalStatus: "not-dispatched", inferenceDispatched: false, accountUsage: null, reason: JSON.stringify(publicReport.reuseEligibility ?? publicReport.diagnostics) }
  const failed = preparation.at(-1), beforeRuntime = !account && failed && ["failed", "cancelled"].includes(failed.state)
  if (beforeRuntime) return { status: failed.state === "cancelled" ? "preparation-cancelled" : "preparation-failed", terminalStatus: "not-dispatched", inferenceDispatched: false, accountUsage: null, reason: error ?? failed.error }
  return { status: account?.status ?? "completion-unknown", terminalStatus: account?.terminalStatus ?? "unknown", inferenceDispatched: account?.inferenceDispatched ?? null, accountUsage: account?.usage ?? null, reason: account?.reason ?? error }
}
export async function claimDispatchLock(file: string, attemptId: string) {
  try { await write(file, { attemptId, processId: process.pid, createdAt: new Date().toISOString() }, true) } catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("BC dispatch lock already exists; retain and inspect active/unknown completion"); throw error }
  return () => unlink(file)
}
export async function recordPreflightFailure(directory: string, attemptId: string, error: unknown, durationMs: number) {
  await mkdir(directory, { recursive: true }); const file = path.join(directory, `${randomUUID()}.json`)
  await write(file, { attemptId, phase: "input-readiness", status: "preparation-failed", terminalStatus: "not-dispatched", inferenceDispatched: false, attemptClaimed: false, durationMs, reason: String(error), createdAt: new Date().toISOString() }, true)
  return file
}
export async function run(id: string, revision?: string) {
  const release = await claimDispatchLock(path.join(root, "dispatch.lock"), `${id}/${revision ?? "original"}`)
  try { return await runClaimed(id, revision) } finally { const state = await json(path.join(root, "status.json")); if (!state.activeAttempts.length && !state.unknownCompletions.length) await release() }
}
async function runClaimed(id: string, revision?: string) {
  const manifestFile = path.join(root, "manifest.json"), statusFile = path.join(root, "status.json"), manifest = await json(manifestFile), state = await json(statusFile), position = manifest.positions.find((p: any) => p.id === id)
  if (!position) throw new Error("Use a registered BC position")
  assertAttemptClaim(position.attempts, revision)
  if (execFileSync("git", ["diff", "HEAD", "--name-only", "--", "src"], { cwd: repo, encoding: "utf8" }).trim()) throw new Error("Commit verified production source before dispatch")
  let plan: Awaited<ReturnType<typeof preparePositionInput>>; const readinessStarted = Date.now()
  try { plan = await preparePositionInput(id) } catch (error) { await recordPreflightFailure(path.join(root, "verification/preflight-failures"), `${id}/${revision ?? "original"}`, error, Date.now() - readinessStarted); if (/Previous change blocked/.test(String(error))) { position.status = "blocked-no-qualified-baseline"; position.unrunReason = String(error); await write(manifestFile, manifest) }; throw error }
  const recovering = state.accountChannel.status === "terminal-routing-recovery-eligible", terminalEvidence = recovering ? await verifyTerminal(state.accountChannel) : null, admission = admitDispatch(state, { readyToDispatch: plan.readiness.readyToDispatch, terminalVerified: !recovering || terminalEvidence?.verified === true })
  const attemptId = `${id}/${revision ?? "original"}`, out = path.join(root, "attempts", attemptId), external = path.join(runRoot, "attempts", attemptId), loaded = await loadInquiryInput(plan.inputFile), skill = await loadSkill(plan.skillFile)
  await mkdir(path.dirname(out), { recursive: true }); await mkdir(out); await mkdir(external, { recursive: true })
  const gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), runtimeTree = plan.readiness.runtimeTree
  await writeFile(path.join(out, "input-original.json"), await readFile(plan.inputFile), { flag: "wx" })
  const boundaryFile = path.join(root, "account-boundary.json"); try { await writeFile(boundaryFile, await readFile(path.join(bbRoot, "account-boundary.json")), { flag: "wx" }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error }
  await write(path.join(out, "claim.json"), { attemptId, positionId: id, entrance: plan.entrance, gitRevision, runtimeTree, runnerSha256: sha(await readFile(import.meta.path)), inputFile: plan.inputFile, inputArchive: "input-original.json", inputSha256: loaded.inputSha256, originalTaskSha256: sha(await readFile(plan.originalInputFile)), originalQuestionIds: loaded.value.inquiry!.questions.map(q => q.id), skillIdentity: plan.readiness.skillIdentity, sourceFiles: plan.readiness.publicCheck.status === "valid" ? plan.readiness.publicCheck.sourceFiles : [], model: plan.model, effort: plan.effort, strategy: plan.strategy, method: plan.method, limits, ...admission, terminalEvidence, baselineAttemptId: plan.baselineAttemptId ?? null, previous: plan.previous ?? null, parentAttempt: admission.recovery ? admission.parentAttempt : revision ? position.attempts.at(-1) : null, readinessDurationMs: plan.readiness.durationMs, startedAt: new Date().toISOString(), evaluatorProvidedToRuntime: false, targetExecutions: 0 }, true)
  position.attempts.push(attemptId); position.status = "running"; state.activeAttempts = [attemptId]; state.currentStage = position.stage
  if (admission.recovery) state.accountChannel.recoveryAttempts++
  await write(manifestFile, manifest); await write(statusFile, state)
  let progressWrites = Promise.resolve(), account: any, native: any, sessionPath: string | undefined, publicReport: any
  const captured = await captureAttempt(async onProgress => {
    const preparation = { timeoutMs: 180000, onProgress }
    if (plan.entrance === "native") {
      const task = await materializeNaturalRunTask({ prompt: JSON.stringify(loaded.value.inquiry), taskPath: path.join(out, "task.json") })
      const executed = await executeRun({ task, skill, adapter: new CodexAccountAdapter(), workDir: path.join(external, "workspace"), keepWorkDir: true, skillMode: "inject", adapterConfig: { model: plan.model, maxSteps: limits.maxToolCalls, timeoutMs: limits.sessionTimeoutMs, providerOptions: { authorizationScope: plan.inputFile, authorizationDomainTools: plan.domainTools, authorizationStrategy: plan.strategy, ...(plan.domainTools ? { authorizationMethod: plan.method } : {}), authorizationAccountBoundary: boundaryFile, authorizationTraceDir: path.join(external, "raw"), authorizationMaxToolCalls: limits.maxToolCalls, authorizationMaxDisplayBytes: limits.maxDisplayBytes, authorizationMaxReadBytes: limits.maxReadBytes, authorizationSessionTimeoutMs: limits.sessionTimeoutMs, authorizationPreparation: preparation } } })
      native = executed.runResult.authorizationInquiry; account = native?.account; await writeFile(path.join(out, "run-result.json.gz"), gzipSync(JSON.stringify(executed.runResult)), { flag: "wx" })
    } else {
      publicReport = await executeLocalInquiryRun({ inputFile: plan.inputFile, outDir: path.join(external, "public-inquiry"), skillFile: plan.skillFile, model: plan.model, method: plan.method, strategy: plan.strategy, harness: "codex-account", accountBoundaryFile: boundaryFile, execution: { ...limits, preparation }, previous: plan.previous })
      if (typeof publicReport.sessionPath === "string") { sessionPath = publicReport.sessionPath; const bytes = await readFile(path.join(sessionPath!, "run.json")); native = JSON.parse(bytes.toString("utf8")); account = native.telemetry.account; await writeFile(path.join(out, "inquiry-run.json.gz"), gzipSync(bytes), { flag: "wx" }) }
      else await write(path.join(out, "public-report.json"), publicReport, true)
    }
    return publicReport
  }, event => { progressWrites = progressWrites.then(() => appendFile(path.join(out, "preparation.jsonl"), JSON.stringify(event) + "\n")) })
  await progressWrites
  const actualStart = account?.events?.find((e: any) => e.direction === "client" && e.method === "thread/start")?.params, expectedBundle = redactCodexEvent(buildRunSkillBundle(skill, "inject")!.content) as string
  const strings = (value: any): string[] => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : []
  const modelInputs = (account?.events ?? []).filter((e: any) => e.direction === "client" && ["thread/start", "turn/start"].includes(e.method)).flatMap((e: any) => strings(e.params))
  const actualModelInput = actualStart ? { systemSha256: sha(actualStart.baseInstructions), systemBytes: Buffer.byteLength(actualStart.baseInstructions), fullOriginalBundlePrefixMatches: actualStart.baseInstructions.startsWith(expectedBundle), loadedBundleSha256: sha(expectedBundle), toolNames: actualStart.dynamicTools.map((t: any) => t.name), originalQuestionsPresent: loaded.value.inquiry!.questions.map(q => { const text = redactCodexEvent(q.request) as string; return { questionId: q.id, present: modelInputs.some((s: string) => s.includes(text) || s.includes(JSON.stringify(text).slice(1, -1))) } }), evaluatorProvidedToRuntime: false } : null
  const settled = settleAttempt(account, captured.preparation, captured.error, publicReport), domain = native?.domain, preparationMs = captured.preparation.at(-1)?.elapsedMs ?? 0
  const report = { attemptId, positionId: id, ...settled, ...admission, entrance: plan.entrance, gitRevision, runtimeTree, sessionPath, inputSha256: loaded.inputSha256, method: plan.method, strategy: plan.strategy, actualModelInput, accountStatus: account?.status, answerDelivery: account?.answerDelivery, quotaRefused: account?.quotaRefused, terminalError: account?.terminalError, finalPresent: !!account?.text?.trim(), answerSha256: sha(account?.text ?? ""), usageDetails: account?.usageDetails, usageSource: account?.usageSource, lastRetainedUsage: settled.status.endsWith("unknown") ? account?.usage : null, hostToolCalls: account ? account.tools.length + account.toolRejections.length : 0, taskPreparation: native?.taskPreparation ?? native?.native?.taskPreparation, taskPreparationAttempts: native?.taskPreparationAttempts ?? native?.native?.taskPreparationAttempts ?? [], taskPreparationFailed: native?.taskPreparationFailed ?? native?.native?.taskPreparationFailed, preparation: { durationMs: preparationMs, terminal: captured.preparation.at(-1) ?? null, progressArchive: "preparation.jsonl" }, sourceWorkMetrics: domain?.sourceWorkMetrics, materialUses: domain?.materialUses ?? [], propertyAnalysis: domain?.propertyAnalysis, currentCheck: domain?.check, sourceAccounting: native?.sourceAccounting, toolBudget: native?.toolBudget ?? native?.native?.toolBudget, sourceVerification: native?.sourceVerification, durationMs: captured.durationMs + plan.readiness.durationMs, accountDurationMs: account?.durationMs ?? null, error: captured.error, actualUsd: null, providerRequests: null, targetExecutions: 0, semanticQuality: account?.text?.trim() ? "awaiting-independent-review" : "undelivered" }
  await write(path.join(out, "report.json"), report, true); await writeFile(path.join(out, "answer-original.md"), account?.text ?? "", { flag: "wx" })
  position.status = report.status; state.activeAttempts = []
  if (report.status.endsWith("unknown")) state.unknownCompletions.push(attemptId)
  const channel = account ? classifyAccountChannel(account, state.accountChannel) : report.inferenceDispatched === false ? { status: state.accountChannel.status, reason: report.reason } : { status: "completion-unknown", reason: report.reason }
  state.accountChannel = { ...state.accountChannel, ...channel, lastAttempt: attemptId, terminalStatus: report.terminalStatus, lifecycle: path.join(sessionPath ?? external, "raw/lifecycle.jsonl") }
  if (channel.status.startsWith("paused-")) { state.status = "in-progress-external-blocker"; for (const p of manifest.positions) if (!p.attempts.length) p.status = "unrun-account-blocked" }
  await write(manifestFile, manifest); await write(statusFile, state)
  console.log(JSON.stringify({ attemptId, status: report.status, channel: channel.status, terminalStatus: report.terminalStatus, finalPresent: report.finalPresent, hostToolCalls: report.hostToolCalls, preparationMs, sourceWorkMetrics: report.sourceWorkMetrics, usage: report.accountUsage, reason: report.reason, error: report.error })); return report
}
