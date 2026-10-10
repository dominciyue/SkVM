import { mkdir, readFile, writeFile, unlink } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gzipSync } from "node:zlib"
import path from "node:path"
import { executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { buildRunSkillBundle } from "../../../../../src/run/index.ts"
import { redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"
import { assertAttemptClaim, admitDispatch, classifyAccountChannel } from "../authorization-interprocedural-property-v1/study.ts"
import { verifyTerminal } from "../authorization-interprocedural-property-v1/runner.ts"
import { captureAttempt, settleAttempt } from "../authorization-task-binding-v1/runner.ts"
import { root, repo, runRoot, prepare, json, write, sha, identity } from "./study.ts"
export async function run(id: string, revision?: string) {
  const mf = path.join(root, "manifest.json"), sf = path.join(root, "status.json"), manifest = await json(mf), state = await json(sf)
  const p = manifest.positions.find((p: any) => p.id === id); if (!p) throw new Error("Use a registered BD position")
  assertAttemptClaim(p.attempts, revision)
  if (execFileSync("git", ["diff", "HEAD", "--name-only", "--", "src"], { cwd: repo, encoding: "utf8" }).trim()) throw new Error("Commit verified production source before dispatch")
  const plan = await prepare(id), recovery = state.accountChannel?.status === "terminal-routing-recovery-eligible"
  if (recovery && !revision) throw new Error("Routing recovery requires a named revision of its original position")
  const terminalEvidence = recovery ? await verifyTerminal(state.accountChannel) : null
  const admission = admitDispatch(state, { readyToDispatch: true, terminalVerified: !recovery || terminalEvidence?.verified === true })
  const attemptId = `${id}/${revision ?? "original"}`, lock = path.join(root, "dispatch.lock")
  await write(lock, { attemptId, processId: process.pid }, true)
  try {
    const out = path.join(root, "attempts", attemptId), external = path.join(runRoot, "attempts", attemptId)
    await mkdir(path.dirname(out), { recursive: true }); await mkdir(out); await mkdir(external, { recursive: true })
    const boundaryFile = path.join(root, "account-boundary.json")
    try { await writeFile(boundaryFile, await readFile(path.resolve(root, "../authorization-interprocedural-property-v1/account-boundary.json")), { flag: "wx" }) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e }
    const gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
    await write(path.join(out, "claim.json"), { identity, attemptId, positionId: id, ...plan, gitRevision, terminalEvidence, ...admission, evaluatorProvidedToRuntime: false, startedAt: new Date().toISOString() }, true)
    await writeFile(path.join(out, "input-original.json"), await readFile(plan.inputFile), { flag: "wx" })
    p.attempts.push(attemptId); p.status = "running"; state.activeAttempts = [attemptId]; state.stage = id.startsWith("quality-") ? "BD11" : id === "extraction-download" ? "BD10" : "BD12"
    if (admission.recovery) state.accountChannel.recoveryAttempts++
    await write(mf, manifest); await write(sf, state)
    const captured = await captureAttempt(onProgress => executeLocalInquiryRun({ inputFile: plan.inputFile, outDir: path.join(external, "public-inquiry"), model: plan.model, method: plan.method, strategy: plan.strategy, domainTools: plan.domainTools, skillFile: plan.skillFile, harness: "codex-account", accountBoundaryFile: boundaryFile, previous: plan.previous, execution: { ...plan.limits, preparation: { timeoutMs: 180000, onProgress } } }))
    const publicReport = captured.value, sessionPath = publicReport?.sessionPath
    let native: any, account: any
    if (sessionPath) { const bytes = await readFile(path.join(sessionPath, "run.json")); native = JSON.parse(bytes.toString("utf8")); account = native.telemetry.account; await writeFile(path.join(out, "inquiry-run.json.gz"), gzipSync(bytes), { flag: "wx" }) }
    else await write(path.join(out, "public-report.json"), publicReport ?? { error: captured.error }, true)
    const settled = settleAttempt(account, captured.preparation, captured.error, publicReport), events = account?.events ?? [], start = events.find((e: any) => e.direction === "client" && e.method === "thread/start")?.params
    const bundle = redactCodexEvent(buildRunSkillBundle(await loadSkill(plan.skillFile), "inject")!.content) as string
    const modelInputs = events.filter((e: any) => e.direction === "client").map((e: any) => JSON.stringify(e.params ?? e.result))
    const input = await json(plan.inputFile), domain = native?.domain
    const report = { identity, attemptId, positionId: id, ...settled, ...admission, runtimeTree: plan.runtimeTree, gitRevision, sessionPath, inputSha256: plan.inputSha256, originalTaskSha256: plan.originalTaskSha256, originalQuestionIds: plan.originalQuestionIds, method: plan.method, strategy: plan.strategy, domainTools: plan.domainTools, limits: plan.limits, skillIdentity: plan.skillIdentity, model: plan.model, effort: plan.effort, actualModelInput: start ? { fullOriginalBundlePrefixMatches: start.baseInstructions.startsWith(bundle), loadedBundleSha256: sha(bundle), systemSha256: sha(start.baseInstructions), toolNames: start.dynamicTools.map((t: any) => t.name), originalQuestionsPresent: input.inquiry.questions.map((q: any) => ({ questionId: q.id, present: modelInputs.some((s: string) => s.includes(JSON.stringify(q.request).slice(1, -1))) })), evaluatorSentinelAbsent: modelInputs.every((s: string) => !s.includes("BD_EVALUATOR_ONLY")) } : null, answerDelivery: account?.answerDelivery, finalPresent: !!account?.text?.trim(), answerSha256: sha(account?.text ?? ""), hostToolCalls: account ? account.tools.length + account.toolRejections.length : 0, toolBudget: native?.native?.toolBudget, taskPreparation: native?.taskPreparation, taskPreparationAttempts: native?.taskPreparationAttempts, sourceWorkMetrics: domain?.sourceWorkMetrics, propertyAnalysis: domain?.propertyAnalysis, materialUses: domain?.materialUses ?? [], sourceAccounting: native?.sourceAccounting, sourceVerification: native?.sourceVerification, preparation: captured.preparation, durationMs: captured.durationMs, accountDurationMs: account?.durationMs, usageDetails: account?.usageDetails, usageSource: account?.usageSource, actualUsd: null, providerRequests: null, targetExecutions: 0, error: captured.error }
    await write(path.join(out, "report.json"), report, true); await writeFile(path.join(out, "answer-original.md"), account?.text ?? "", { flag: "wx" })
    p.status = report.status; state.activeAttempts = []; state.modelAttempts++
    if (report.status.endsWith("unknown")) state.unknownCompletions.push(attemptId)
    state.accountChannel = { ...state.accountChannel, ...(account ? classifyAccountChannel(account, state.accountChannel) : { status: report.inferenceDispatched === false ? state.accountChannel.status : "completion-unknown" }), lastAttempt: attemptId, terminalStatus: report.terminalStatus, lifecycle: sessionPath ? path.join(sessionPath, "raw/lifecycle.jsonl") : undefined }
    await write(mf, manifest); await write(sf, state)
    console.log(JSON.stringify({ attemptId, status: report.status, terminalStatus: report.terminalStatus, channel: state.accountChannel.status, finalPresent: report.finalPresent, hostToolCalls: report.hostToolCalls, propertyChecks: report.propertyAnalysis?.checks, usage: report.accountUsage, reason: report.reason, error: report.error }))
    return report
  } finally { const current = await json(sf); if (!current.activeAttempts.length && !current.unknownCompletions.length) await unlink(lock) }
}
