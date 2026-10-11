import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gzipSync } from "node:zlib"
import path from "node:path"
import { executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { loadRunSkill, buildRunSkillBundle } from "../../../../../src/run/index.ts"
import { redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"
import { assertAttemptClaim, admitDispatch, classifyAccountChannel } from "../authorization-interprocedural-property-v1/study.ts"
import { verifyTerminal, claimDispatchLock } from "../authorization-interprocedural-property-v1/runner.ts"
import { captureAttempt, settleAttempt } from "../authorization-task-binding-v1/runner.ts"
import { root, repo, runRoot, prepare, json, write, sha, identity, firstPositions } from "./study.ts"

/** BF scheduling only: the public inquiry owns execution, account, source and reuse. */
export async function run(id: string, revision?: string) {
  const plan = await prepare(id), mf = path.join(root, "manifest.json"), sf = path.join(root, "status.json"), manifest = await json(mf), state = await json(sf), position = manifest.positions.find((p: any) => p.id === id)
  assertAttemptClaim(position.attempts, revision)
  if (!revision && firstPositions.includes(id) && firstPositions.find(q => !manifest.positions.find((p: any) => p.id === q).attempts.length) !== id) throw new Error("Preserve the six registered first-attempt positions")
  if (execFileSync("git", ["status", "--porcelain", "--", "src"], { cwd: repo, encoding: "utf8" }).trim()) throw new Error("Commit verified production source before a real dispatch")
  const recovering = state.accountChannel.status === "terminal-routing-recovery-eligible"
  if (recovering && (!revision || id !== state.accountChannel.lastAttempt?.split("/")[0])) throw new Error("The one routing recovery is a named revision of the same position")
  if (recovering && state.accountChannel.recoveryAttempts >= 1) throw new Error("The one registered routing recovery is exhausted")
  const terminalEvidence = recovering ? await verifyTerminal(state.accountChannel) : null, admission = admitDispatch(state, { readyToDispatch: plan.readyToDispatch, terminalVerified: !recovering || terminalEvidence?.verified === true })
  const attemptId = `${id}/${revision ?? "original"}`, release = await claimDispatchLock(path.join(root, "dispatch.lock"), attemptId)
  try {
    const out = path.join(root, "attempts", attemptId), external = path.join(runRoot, "attempts", attemptId)
    await mkdir(path.dirname(out), { recursive: true }); await mkdir(out); await mkdir(external, { recursive: true })
    const boundaryFile = path.join(root, "account-boundary.json"), boundaryBytes = await readFile(path.resolve(root, "../authorization-interprocedural-property-v1/account-boundary.json"))
    try { await writeFile(boundaryFile, boundaryBytes, { flag: "wx" }) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "EEXIST" || sha(await readFile(boundaryFile)) !== sha(boundaryBytes)) throw e }
    let revisionContract: any
    if (revision) { revisionContract = await json(path.join(root, "verification", `revision-${id}-${revision}.json`)); if (!revisionContract.reason || !Array.isArray(revisionContract.comparableControls)) throw new Error("Record shared change, epoch and controls before a named revision"); if (state.attempts.filter((a: string) => !a.endsWith("/original")).length >= 3) throw new Error("BF named revision budget is exhausted") }
    const gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
    await write(path.join(out, "claim.json"), { identity, attemptId, positionId: id, ...plan, gitRevision, runnerSha256: sha(await readFile(import.meta.path)), terminalEvidence, ...admission, revisionContract, startedAt: new Date().toISOString(), targetExecutions: 0 }, true)
    await writeFile(path.join(out, "input-original.json"), await readFile(plan.inputFile), { flag: "wx" })
    position.attempts.push(attemptId); position.status = "running"; state.activeAttempts = [attemptId]; state.stage = plan.track === "B" ? "BF10" : id.startsWith("reuse-") ? "BF13" : "BF12"
    if (admission.recovery) state.accountChannel.recoveryAttempts++
    await write(mf, manifest); await write(sf, state)
    let progressWrites = Promise.resolve()
    const captured = await captureAttempt(onProgress => executeLocalInquiryRun({ inputFile: plan.inputFile, outDir: path.join(external, "public-inquiry"), model: plan.model, method: plan.method, strategy: plan.strategy, domainTools: plan.domainTools, skillFile: plan.skillFile, harness: "codex-account", accountBoundaryFile: boundaryFile, domainProgramFile: plan.domainProgramFile, previous: plan.previous, execution: { ...plan.limits, preparation: { timeoutMs: 180000, onProgress } } }), event => { progressWrites = progressWrites.then(() => appendFile(path.join(out, "preparation.jsonl"), JSON.stringify(event) + "\n")) })
    await progressWrites
    const publicReport = captured.value, sessionPath = publicReport?.sessionPath
    let native: any, account: any
    if (sessionPath) { const bytes = await readFile(path.join(sessionPath, "run.json")); native = JSON.parse(bytes.toString("utf8")); account = native.telemetry.account; await writeFile(path.join(out, "inquiry-run.json.gz"), gzipSync(bytes), { flag: "wx" }) }
    else await write(path.join(out, "public-report.json"), publicReport ?? { error: captured.error }, true)
    const settled = settleAttempt(account, captured.preparation, captured.error, publicReport), events = account?.events ?? [], start = events.find((e: any) => e.direction === "client" && e.method === "thread/start")?.params
    const bundle = redactCodexEvent(buildRunSkillBundle(await loadRunSkill(plan.skillFile), "inject")!.content) as string, sent = events.filter((e: any) => e.direction === "client").map((e: any) => JSON.stringify(e.params ?? e.result)), input = await json(plan.inputFile), domain = native?.domain
    const report = { identity, attemptId, positionId: id, track: plan.track, ...settled, ...admission, runtimeTree: plan.runtimeTree, gitRevision, sessionPath, inputSha256: plan.inputSha256, originalTaskSha256: plan.originalTaskSha256, originalQuestionIds: plan.originalQuestionIds, questionIds: plan.questionIds, method: plan.method, strategy: plan.strategy, limits: plan.limits, model: plan.model, effort: plan.effort, baselineAttemptId: plan.baselineAttemptId ?? null, baselineProvenance: plan.baselineProvenance ?? null, fixedProgramSha256: plan.fixedProgramSha256, domainProgram: native?.domainProgram, comparableControls: revisionContract?.comparableControls ?? null, actualModelInput: start ? { fullOriginalBundlePrefixMatches: start.baseInstructions.startsWith(bundle), loadedBundleSha256: sha(bundle), systemSha256: sha(start.baseInstructions), toolNames: start.dynamicTools.map((t: any) => t.name), originalQuestionsPresent: input.inquiry.questions.map((q: any) => ({ questionId: q.id, present: sent.some((s: string) => s.includes(JSON.stringify(redactCodexEvent(q.request)).slice(1, -1))) })), evaluatorProvidedToRuntime: false, developerProgramProvided: !!native?.domainProgram, accountWorkDir: sessionPath } : null, answerDelivery: account?.answerDelivery, finalPresent: !!account?.text?.trim(), answerSha256: sha(account?.text ?? ""), hostToolCalls: account ? account.tools.length + account.toolRejections.length : 0, toolBudget: native?.native?.toolBudget, taskPreparation: native?.taskPreparation, taskPreparationAttempts: native?.taskPreparationAttempts, sourceWorkMetrics: domain?.sourceWorkMetrics, propertyAnalysis: domain?.propertyAnalysis, executableContract: domain?.executableContract, sourceMaterialCount: domain?.sourceMaterials?.materials?.length ?? 0, materialUses: domain?.materialUses ?? [], sourceAccounting: native?.sourceAccounting, transmissionAccounting: account?.transmissionAccounting, sourceVerification: native?.sourceVerification, reuse: native?.reuse, preparation: captured.preparation, durationMs: captured.durationMs, accountDurationMs: account?.durationMs, usageDetails: account?.usageDetails, usageSource: account?.usageSource, actualUsd: null, providerRequests: account?.providerRequests ?? null, targetExecutions: 0, error: captured.error }
    await write(path.join(out, "report.json"), report, true); await writeFile(path.join(out, "answer-original.md"), account?.text ?? "", { flag: "wx" })
    position.status = report.status; state.activeAttempts = []; state.modelAttempts += report.inferenceDispatched === false ? 0 : 1; state.attempts.push(attemptId)
    if (report.status.endsWith("unknown")) state.unknownCompletions.push(attemptId)
    state.accountChannel = { ...state.accountChannel, ...(account ? classifyAccountChannel(account, state.accountChannel) : { status: report.inferenceDispatched === false ? state.accountChannel.status : "completion-unknown" }), lastAttempt: attemptId, terminalStatus: report.terminalStatus, lifecycle: sessionPath ? path.join(sessionPath, "raw/lifecycle.jsonl") : undefined }
    if (state.accountChannel.status.startsWith("paused-")) for (const p of manifest.positions) if (!p.attempts.length) p.status = "unrun-account-blocked"
    await write(mf, manifest); await write(sf, state)
    console.log(JSON.stringify({ attemptId, status: report.status, terminalStatus: report.terminalStatus, channel: state.accountChannel.status, finalPresent: report.finalPresent, hostToolCalls: report.hostToolCalls, materials: report.sourceMaterialCount, materialUses: report.materialUses.length, usage: report.accountUsage, reason: report.reason, error: report.error }))
    return report
  } finally { const current = await json(sf); if (!current.activeAttempts.length && !current.unknownCompletions.length) await release() }
}
