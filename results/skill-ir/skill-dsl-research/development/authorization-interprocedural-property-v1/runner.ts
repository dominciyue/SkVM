import { mkdir, readFile, writeFile, unlink } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gzipSync } from "node:zlib"
import path from "node:path"
import { CodexAccountAdapter } from "../../../../../src/adapters/codex-account.ts"
import { redactCodexEvent } from "../../../../../src/adapters/codex-account-session.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { loadInquiryInput, executeLocalInquiryRun } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { executeRun, materializeNaturalRunTask, buildRunSkillBundle } from "../../../../../src/run/index.ts"
import { changedInputs, prepareChangeInputs } from "../authorization-property-execution-v1/changes.ts"
import { root, repo, runRoot, sha, write, limits, assertOwnedPaths, assertAttemptClaim, admitDispatch, classifyAccountChannel, preparePositionInput } from "./study.ts"
import type { Position } from "../authorization-semantic-submission-v1/study.ts"
import { qualifiedConsumer } from "./summarize.ts"

const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
export async function verifyTerminal(channel: Record<string, any>) {
  const bytes = await readFile(channel.lifecycle), events = bytes.toString("utf8").trim().split(/\r?\n/).map(line => JSON.parse(line))
  const terminal = events.filter(e => e.direction === "server" && e.method === "turn/completed").at(-1)
  const verified = terminal?.params?.turn?.status === channel.terminalStatus && ["failed", "interrupted"].includes(channel.terminalStatus)
  return { verified, lifecycle: channel.lifecycle, sha256: sha(bytes), terminalStatus: terminal?.params?.turn?.status, closure: "Terminal retained after the account session finally closed its owned transport" }
}
export async function run(id: string, revision?: string) {
  const release = await claimDispatchLock(path.join(root, "dispatch.lock"), `${id}/${revision ?? "original"}`)
  try { return await runClaimed(id, revision) }
  finally { const state = await json(path.join(root, "status.json")); if (!state.activeAttempts.length && !state.unknownCompletions.length) await release() }
}
export async function claimDispatchLock(file: string, attemptId: string) {
  try { await write(file, { attemptId, processId: process.pid, createdAt: new Date().toISOString() }, true) }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error("BB dispatch lock already exists; inspect its active/unknown lifecycle before another paid dispatch"); throw e }
  return () => unlink(file)
}
async function runClaimed(id: string, revision?: string) {
  assertOwnedPaths(root, runRoot)
  const manifestFile = path.join(root, "manifest.json"), statusFile = path.join(root, "status.json"), manifest = await json(manifestFile), state = await json(statusFile), position = manifest.positions.find((p: Position) => p.id === id) as Position | undefined
  if (!position) throw new Error("Use a registered BB position")
  assertAttemptClaim(position.attempts, revision)
  if (execFileSync("git", ["diff", "HEAD", "--name-only", "--", "src"], { cwd: repo, encoding: "utf8" }).trim()) throw new Error("Commit verified production source before dispatch")
  const plan = await preparePositionInput(id), recovering = ["inherited-terminal-reentry-eligible", "terminal-routing-recovery-eligible"].includes(state.accountChannel.status)
  if (plan.readiness.publicCheck.status !== "valid") throw new Error("Current public input is invalid")
  const terminalEvidence = recovering ? await verifyTerminal(state.accountChannel) : null
  const admission = admitDispatch(state, { readyToDispatch: plan.readiness.readyToDispatch, terminalVerified: !recovering || terminalEvidence?.verified === true })
  const attemptId = `${id}/${revision ?? "original"}`, out = path.join(root, "attempts", attemptId), external = path.join(runRoot, "attempts", attemptId), loaded = await loadInquiryInput(plan.inputFile), original = await loadInquiryInput(plan.originalInputFile), skill = await loadSkill(plan.skillFile)
  await mkdir(path.dirname(out), { recursive: true }); await mkdir(out); await mkdir(external, { recursive: true })
  const gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), runtimeTree = plan.readiness.runtimeTree
  await writeFile(path.join(out, "input-original.json"), await readFile(plan.inputFile), { flag: "wx" })
  await write(path.join(out, "claim.json"), { attemptId, positionId: id, entrance: position.entrance, gitRevision, runtimeTree, runnerSha256: sha(await readFile(import.meta.path)), inputFile: plan.inputFile, inputArchive: "input-original.json", inputSha256: loaded.inputSha256, originalTaskSha256: original.inputSha256, skillIdentity: plan.readiness.skillIdentity, sourceFiles: plan.readiness.publicCheck.sourceFiles, model: plan.model, effort: plan.effort, strategy: plan.strategy, method: plan.method, limits, ...admission, terminalEvidence, previous: plan.previous ?? null, changeBinding: plan.binding ?? null, parentAttempt: admission.recovery ? admission.parentAttempt : revision ? position.attempts.at(-1) : null, startedAt: new Date().toISOString(), evaluatorProvidedToRuntime: false, targetExecutions: 0 }, true)
  position.attempts.push(attemptId); position.status = "running"; state.activeAttempts = [attemptId]; state.currentStage = position.stage
  if (admission.recovery) state.accountChannel.recoveryAttempts++
  await write(manifestFile, manifest); await write(statusFile, state)
  let account: any, native: any, sessionPath: string | undefined, publicReport: any, status = "completion-unknown", error: string | undefined
  try {
    if (position.entrance === "native") {
      const task = await materializeNaturalRunTask({ prompt: original.value.brief!, taskPath: path.join(out, "task.json") })
      const executed = await executeRun({ task, skill, adapter: new CodexAccountAdapter(), workDir: path.join(external, "workspace"), keepWorkDir: true, skillMode: "inject", adapterConfig: { model: plan.model, maxSteps: limits.maxToolCalls, timeoutMs: limits.sessionTimeoutMs, providerOptions: { authorizationScope: plan.inputFile, authorizationDomainTools: plan.domainTools, authorizationStrategy: plan.strategy, ...(plan.domainTools ? { authorizationMethod: plan.method } : {}), authorizationAccountBoundary: path.join(root, "account-boundary.json"), authorizationTraceDir: path.join(external, "raw"), authorizationMaxToolCalls: limits.maxToolCalls, authorizationMaxDisplayBytes: limits.maxDisplayBytes, authorizationMaxReadBytes: limits.maxReadBytes, authorizationSessionTimeoutMs: limits.sessionTimeoutMs } } })
      await writeFile(path.join(out, "run-result.json.gz"), gzipSync(JSON.stringify(executed.runResult)), { flag: "wx" }); native = executed.runResult.authorizationInquiry; account = native.account
    } else {
      publicReport = await executeLocalInquiryRun({ inputFile: plan.inputFile, outDir: path.join(external, "public-inquiry"), skillFile: plan.skillFile, model: plan.model, method: plan.method, strategy: plan.strategy, harness: "codex-account", accountBoundaryFile: path.join(root, "account-boundary.json"), execution: limits, previous: plan.previous })
      if (typeof publicReport.sessionPath === "string") {
        sessionPath = publicReport.sessionPath; const bytes = await readFile(path.join(sessionPath!, "run.json")); native = JSON.parse(bytes.toString("utf8")); account = native.telemetry.account
        await writeFile(path.join(out, "inquiry-run.json.gz"), gzipSync(bytes), { flag: "wx" })
      } else await write(path.join(out, "public-report.json"), publicReport, true)
    }
    status = account?.status ?? publicReport?.status ?? "completion-unknown"
  } catch (cause) { error = String(cause) }
  const actualStart = account?.events?.find((e: any) => e.direction === "client" && e.method === "thread/start")?.params, expectedBundle = redactCodexEvent(buildRunSkillBundle(skill, "inject")!.content) as string
  const actualModelInput = actualStart ? { systemSha256: sha(actualStart.baseInstructions), systemBytes: Buffer.byteLength(actualStart.baseInstructions), fullOriginalBundlePrefixMatches: actualStart.baseInstructions.startsWith(expectedBundle), loadedBundleSha256: sha(expectedBundle), loadedBundleBytes: Buffer.byteLength(expectedBundle), toolNames: actualStart.dynamicTools.map((t: any) => t.name), originalQuestionTextPresent: actualStart.baseInstructions.includes(redactCodexEvent(original.value.brief!) as string), evidence: "Actual retained client thread/start, redacted identically to expected complete original bundle" } : null
  const report = { attemptId, positionId: id, status, ...admission, gitRevision, runtimeTree, sessionPath, inputSha256: loaded.inputSha256, method: plan.method, strategy: plan.strategy, actualModelInput, accountStatus: account?.status, terminalStatus: account?.terminalStatus, answerDelivery: account?.answerDelivery, quotaRefused: account?.quotaRefused, terminalError: account?.terminalError, finalPresent: !!account?.text?.trim(), answerSha256: sha(account?.text ?? ""), accountUsage: account?.usage ?? null, usageDetails: account?.usageDetails, usageSource: account?.usageSource, instructionSources: account?.capability?.instructionSources ?? null, inferenceDispatched: account?.inferenceDispatched ?? null, hostToolCalls: account ? account.tools.length + account.toolRejections.length : 0, sourceWorkMetrics: native?.domain?.sourceWorkMetrics, materialUses: native?.domain?.materialUses ?? [], propertyAnalysis: native?.domain?.propertyAnalysis, currentCheck: native?.domain?.check, sourceAccounting: native?.sourceAccounting, toolBudget: native?.toolBudget ?? native?.native?.toolBudget, sourceVerification: native?.sourceVerification, resultPresent: !!native?.result, durationMs: account?.durationMs ?? null, reason: account?.reason, error, actualUsd: null, providerRequests: null, targetExecutions: 0, semanticQuality: account?.text?.trim() ? "awaiting-independent-review" : "undelivered" }
  await write(path.join(out, "report.json"), report, true); await writeFile(path.join(out, "answer-original.md"), account?.text ?? "", { flag: "wx" })
  position.status = status; state.activeAttempts = []
  if (status.endsWith("unknown")) state.unknownCompletions.push(attemptId)
  const channel = account ? classifyAccountChannel(account, state.accountChannel) : status === "needs-fresh-analysis" ? { status: state.accountChannel.status, reason: "Public previous-material admission rejected without dispatch" } : { status: "completion-unknown", reason: error }
  state.accountChannel = { ...state.accountChannel, ...channel, lastAttempt: attemptId, terminalStatus: account?.terminalStatus, lifecycle: path.join(sessionPath ?? external, "raw/lifecycle.jsonl"), recoveryEvidence: admission.recovery ? { attemptId, terminalEvidence } : state.accountChannel.recoveryEvidence }
  if (channel.status.startsWith("paused-")) { state.status = "in-progress-external-blocker"; for (const p of manifest.positions) if (!p.attempts.length) p.status = "unrun-account-blocked" }
  await write(manifestFile, manifest); await write(statusFile, state)
  console.log(JSON.stringify({ attemptId, status, channel: channel.status, terminalStatus: account?.terminalStatus, finalPresent: report.finalPresent, hostToolCalls: report.hostToolCalls, sourceWorkMetrics: report.sourceWorkMetrics, usage: report.accountUsage, reason: report.reason, error }))
  return report
}
export async function prepareChanges() {
  const locations = path.join(root, "model/change-registration.json")
  try { return await json(locations) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
  const runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim(), manifest = await json(path.join(root, "manifest.json")), consumer = manifest.positions.find((p: Position) => p.id === "consumer-download-inquiry") as Position
  const attemptId = consumer.attempts.at(-1), prior = attemptId && await json(path.join(root, "attempts", attemptId, "report.json"))
  const qualified = qualifiedConsumer(prior, runtimeTree)
  if (qualified) return prepareChangeInputs(root, prior.sessionPath, { baselineAttemptId: attemptId!, runtimeTree })
  const baseline = await preparePositionInput("pilot-download"), base = await loadInquiryInput(baseline.inputFile), registered = path.resolve(root, "../authorization-source-assisted-closure-v1/model/inputs"), files = ["paperless-download-policy.json", "paperless-download-premise.json", "paperless-download-source.json"].map(f => path.join(registered, f)), policy = await loadInquiryInput(files[0]!), premise = await loadInquiryInput(files[1]!), source = await loadInquiryInput(files[2]!)
  const premises = [...new Set(premise.value.inquiry!.questions.flatMap(q => q.premises).map(p => p.text).filter(t => t.startsWith("The authenticated caller owns the requested document.")))]; if (!policy.value.inquiry?.policy || premises.length !== 1) throw new Error("Independent change facts absent or ambiguous")
  const directory = path.join(root, "model/inputs"), generated = changedInputs({ ...base.value, sourceRoot: path.relative(directory, base.context.sourceRoot).split(path.sep).join("/") }, { policy: policy.value.inquiry.policy, premiseText: premises[0]!, sourceRoot: path.relative(directory, source.context.sourceRoot).split(path.sep).join("/") }), inputSha256ByChange: Record<string, string> = {}
  for (const [name, value] of Object.entries(generated)) { const file = path.join(directory, `download-${name}.json`); await write(file, value, true); inputSha256ByChange[name] = sha(await readFile(file)) }
  const registration = { schemaVersion: "authorization-ax-changes/v1", registrationId: "original", runtimeTree, baselineAttemptId: null, previousSessionPath: null, baselineInputFile: baseline.inputFile, baselineInputSha256: base.inputSha256, inputSha256ByChange, qualityBasis: "fresh-only-no-qualified-current-baseline", previousBlocked: "No current closed same-method consumer with a checked/violated cross-function property", registeredInputs: files, importedFields: ["independent inquiry.policy", "ownership premise text", "resolved changed sourceRoot"], olderDeclarationsImported: false, oldAnswersImported: false }
  await write(locations, registration, true); return registration
}
