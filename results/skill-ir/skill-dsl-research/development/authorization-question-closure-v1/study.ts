import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { gzipSync } from "node:zlib"
import { CodexAccountAdapter } from "../../../../../src/adapters/codex-account.ts"
import type { AccountSessionResult } from "../../../../../src/adapters/codex-account-session.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
import { executeRun, materializeNaturalRunTask } from "../../../../../src/run/index.ts"
import { loadInquiryInput, checkAuthorizationInquiry, executeLocalInquiryRun, inspectLocalInquiry } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { prepareConsumerInput } from "../authorization-property-execution-v1/consumer.ts"
import { prepareChangeInputs, resolveChangeRun } from "../authorization-property-execution-v1/changes.ts"

export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
const ax = path.resolve(root, "../authorization-property-execution-v1")
const av = path.resolve(root, "../authorization-source-assisted-closure-v1")
export const runRoot = "D:/skill优化/project-maintenance/runs/authorization-question-closure-v1"
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
type Position = { id: string; stage: string; kind: string; task: string; order: number; status: string; attempts: string[]; arm?: string; repeat?: number }
export function positions(): Position[] {
  const rows: Omit<Position, "order" | "status" | "attempts">[] = [
    { id: "native-download", stage: "AY13", kind: "native", task: "download" },
    { id: "native-owui", stage: "AY14", kind: "native", task: "owui" },
    { id: "consumer-download", stage: "AY15", kind: "consumer", task: "download" },
    { id: "consumer-owui", stage: "AY15", kind: "consumer", task: "owui" },
  ]
  for (const change of ["policy", "premise", "source"]) for (const arm of ["fresh", "previous"]) rows.push({ id: `change-download-${change}-${arm}`, stage: "AY16", kind: "change", task: "download", arm })
  for (const repeat of [1, 2]) for (const [task, arms] of repeat === 1 ? [["download", ["N", "M-S", "D-S"]], ["owui", ["D-S", "N", "M-S"]]] as const : [["download", ["D-S", "M-S", "N"]], ["owui", ["M-S", "N", "D-S"]]] as const) {
    for (const arm of arms) rows.push({ id: `quality-${task}-${arm}-repeat-${repeat}`, stage: "AY17", kind: "quality", task, arm, repeat })
  }
  return rows.map((row, i) => ({ ...row, order: i + 1, status: "registered-unrun", attempts: [] }))
}
export function inputPlan(task: string) {
  if (!["download", "owui"].includes(task)) throw new Error("Unregistered task")
  return { inputFile: path.join(av, "model/inputs", task === "download" ? "paperless-download-original.json" : "owui-ingestion-original.json"),
    authorAttempt: path.join(ax, "attempts", `author-${task}/original`),
    skillFile: path.resolve(root, "../authorization-domain-execution-v1/model/source-skills", task === "download" ? "cloudflare-security-audit/SKILL.md" : "github-security-review/SKILL.md") }
}
export async function bootstrap() {
  await mkdir(root, { recursive: true }); await mkdir(runRoot, { recursive: true })
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()
  const sources = []
  for (const task of ["download", "owui"]) {
    const p = inputPlan(task), input = await readFile(p.inputFile), authored = await readFile(path.join(p.authorAttempt, "authored-inquiry.json"))
    sources.push({ task, ...p, inputSha256: sha(input), skillSha256: sha(await readFile(p.skillFile)), authoredInputSha256: sha(authored), questionIds: JSON.parse(authored.toString("utf8")).inquiry.questions.map((q: any) => q.id) })
  }
  const old = JSON.parse(await readFile(path.join(ax, "manifest.json"), "utf8"))
  const inheritedPending = old.positions.filter((p: any) => p.status === "planned").map((p: any) => ({ axPositionId: p.id, ayPositionId: p.kind === "consumer" ? `consumer-${p.task}` : p.kind === "quality" ? `${p.id}-repeat-1` : p.id, oldAttempts: p.attempts, oldStatus: p.status, oldDenominatorUnchanged: true }))
  await write(path.join(root, "manifest.json"), { schemaVersion: "authorization-ay-manifest/v1", date: "2026-10-07", identity: "authorization-question-closure-v1", baseline: head, developmentModel: "gpt-6.1-sol", developmentEffort: "max", experimentModel: "gpt-5.6-sol", experimentEffort: "high", runtime: "codex-account", strategy: "operation-evidence-v5", materialSemantics: "question-control/v1", limits: { maxToolCalls: 64, maxDisplayBytes: 786432, maxReadBytes: 33554432, sessionTimeoutMs: 2700000 }, positions: positions(), logicalPositions: 22, inheritedPending, sources,
    primaryComparison: "whole-method source quality N/D; representation contribution M/D separate", acceptance: { sourceFullCurrentCheckedBothTasks: true, bothOriginalByteConsumers: true, threeChangesBothArms: true, qualitySecondRepeatConfirmation: true, sameQualityTokenReductionThreshold: 0.15, reuseAtLeastTwoFullPairsAndThirdNoRegression: true }, evaluatorIsolation: "Only original task/skill, declared independent policy and allowlisted sources enter runtime. Evaluator, historical answers, reviews and repair ledgers excluded by controlled readonly account and registered source callbacks.", fairnessReview: "pending-before-quality", thirdPartyApi: "paused-by-user", targetExecutions: 0 }, true)
  await write(path.join(root, "status.json"), { schemaVersion: "authorization-ay-status/v1", date: "2026-10-07", status: "in-progress", currentStage: "AY2", stages: Array.from({ length: 24 }, (_, i) => ({ id: `AY${i}`, status: i === 0 ? "completed" : i === 2 ? "implemented-focused-tests-passing" : "pending" })), activeAttempts: [], unknownCompletions: [], finiteQueueComplete: false, researchGoalAchieved: false, targetExecutions: 0 }, true)
  await writeFile(path.join(root, "repair-events.jsonl"), JSON.stringify({ date: "2026-10-07", stage: "AY2", symptom: "known failed terminal classified completion-unknown", rootCause: "all non-completed terminal statuses mapped to unknown; closed attempt also accepted late outcome/usage mutation", files: ["src/adapters/codex-account-session.ts", "src/adapters/codex-account-session.test.ts"], red: "17 tests: 14 pass, 3 expected failures", green: "account session/adapter: 34 pass, 230 assertions", realRevision: "pending-first-native-v5" }) + "\n", { flag: "wx" })
  await write(path.join(root, "tsconfig.json"), { extends: "../../../../../tsconfig.json", include: ["./*.ts"], exclude: ["node_modules", "attempts", "model"] }, true)
  await writeFile(path.join(root, "account-boundary.json"), await readFile(path.join(ax, "account-boundary.json")), { flag: "wx" })
  await adjudicateAxFailure()
  console.log(JSON.stringify({ registered: 22, inheritedPending: inheritedPending.length, sources, sameTaskProcessInspection: "no active study/CLI child; desktop app server remains" }))
}
export async function adjudicateAxFailure() {
  const attempt = path.join(ax, "attempts/inquiry-download-original/explicit-source-revisit"), reportBytes = await readFile(path.join(attempt, "report.json")), report = JSON.parse(reportBytes.toString("utf8"))
  const eventsFile = path.join(report.sessionPath, "raw/lifecycle.jsonl"), bytes = await readFile(eventsFile)
  const events = bytes.toString("utf8").trim().split(/\r?\n/).map(line => JSON.parse(line))
  const terminal = events.find(e => e.method === "turn/completed" && e.params?.turn?.status === "failed")
  if (!terminal) throw new Error("No exact retained failed terminal")
  await write(path.join(root, "ax-terminal-adjudication.json"), { schemaVersion: "authorization-ay-terminal-adjudication/v1", attemptId: "inquiry-download-original/explicit-source-revisit", originalReport: path.join(attempt, "report.json"), originalReportSha256: sha(reportBytes), originalStatus: report.status, eventsFile, eventsSha256: sha(bytes), terminal, adjudicatedStatus: "failed", answerDelivery: "undelivered", localExecutionClosed: true, noActiveSameStudyProcess: true, originalBytesChanged: false, visibleUsage: report.accountUsage, missingHiddenUsage: null, quotaRefused: true, automaticResend: false, nextAttemptRequiresNewIdentity: true, newInference: 0 }, true)
}
export async function recordStage(id: string, status: string) {
  const file = path.join(root, "status.json"), current = JSON.parse(await readFile(file, "utf8"))
  const row = current.stages.find((s: any) => s.id === id); if (!row) throw new Error("Unknown stage")
  row.status = status; current.currentStage = id; await write(file, current)
}
export async function run(id: string, revision?: string, changeRegistrationId?: string) {
  const manifestFile = path.join(root, "manifest.json"), statusFile = path.join(root, "status.json")
  const manifest = JSON.parse(await readFile(manifestFile, "utf8")), state = JSON.parse(await readFile(statusFile, "utf8"))
  const position = manifest.positions.find((p: Position) => p.id === id) as Position | undefined
  if (!position) throw new Error("Use a registered position")
  if (changeRegistrationId && position.kind !== "change") throw new Error("Change registration is only valid for a change position")
  if (state.activeAttempts.length || state.unknownCompletions.length) throw new Error("Inspect the existing active/unknown attempt before a new dispatch")
  if (state.accountChannel?.status === "quota-refused" && !state.accountChannel.recoveryEvidence) throw new Error("Known quota refusal; no new account dispatch without recovery evidence")
  if (!revision && position.attempts.length || revision && (!/^[a-z0-9-]+$/.test(revision) || !position.attempts.length)) throw new Error("Preserve the first attempt; repairs require a new named identity")
  const original = inputPlan(position.task), plain = position.kind === "quality" && position.arm === "N"
  const method = position.kind === "consumer" || position.kind === "change" || position.arm === "D-S" ? "D1" as const : "M" as const
  const strategy = plain ? "legacy" as const : "operation-evidence-v5" as const
  let inputFile = original.inputFile, previous: string | undefined, binding: Record<string, unknown> = {}
  if (position.kind === "change") {
    const runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim()
    const changed = await resolveChangeRun(root, id, runtimeTree, changeRegistrationId)
    inputFile = changed.inputFile; previous = changed.previous; binding = changed.binding
  }
  if (position.kind === "consumer" || position.arm === "D-S") {
    const prepared = await prepareConsumerInput({ originalInputFile: original.inputFile, authorAttempt: original.authorAttempt, destination: path.join(root, "model/packages", position.task) })
    inputFile = prepared.inputFile; binding = { originalBytesConsumed: true, authoredInputSha256: prepared.authoredInputSha256, authorAttempt: original.authorAttempt, semanticRepair: false }
  }
  const loaded = await loadInquiryInput(inputFile), checked = await checkAuthorizationInquiry(inputFile, method, strategy)
  if (checked.status !== "valid") throw new Error(JSON.stringify(checked.diagnostics))
  const attemptId = `${id}/${revision ?? "original"}`, out = path.join(root, "attempts", attemptId), limits = manifest.limits
  await mkdir(path.dirname(out), { recursive: true }); await mkdir(out)
  const gitRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim()
  const skill = await loadSkill(original.skillFile), skillIdentity = []
  for (const file of ["SKILL.md", ...skill.bundleFiles].sort()) { const bytes = await readFile(path.join(skill.skillDir, file)); skillIdentity.push({ file, sha256: sha(bytes), bytes: bytes.length }) }
  await writeFile(path.join(out, "input-original.json"), loaded.original, { flag: "wx" }); await writeFile(path.join(out, "skill-original.md"), await readFile(original.skillFile), { flag: "wx" })
  await write(path.join(out, "claim.json"), { attemptId, positionId: id, kind: revision ? "revision" : "first", parent: revision ? position.attempts.at(-1) : null, gitRevision, runtimeTree, inputFile, inputSha256: loaded.inputSha256, skillIdentity, ...binding, sourceFiles: checked.sourceFiles, model: manifest.experimentModel, effort: "high", harness: "codex-account", strategy, method: plain ? undefined : method, limits, startedAt: new Date().toISOString(), targetExecutions: 0, evaluatorProvidedToModel: false }, true)
  position.attempts.push(attemptId); position.status = "running"; state.activeAttempts = [attemptId]; state.currentStage = position.stage
  await write(manifestFile, manifest); await write(statusFile, state)
  let account: AccountSessionResult | undefined, sessionPath: string | undefined, details: Record<string, unknown> = {}, status: string
  try {
    if (position.kind === "consumer" || position.kind === "change" || position.kind === "quality" && !plain) {
      const report = await executeLocalInquiryRun({ inputFile, outDir: path.join(runRoot, "attempts", attemptId, "public-inquiry"), skillFile: original.skillFile, model: manifest.experimentModel, method, strategy, previous, harness: "codex-account", accountBoundaryFile: path.join(root, "account-boundary.json"), execution: limits })
      status = report.status; await write(path.join(out, "public-report.json"), report, true)
      if ("sessionPath" in report && typeof report.sessionPath === "string") {
        sessionPath = report.sessionPath; await inspectLocalInquiry(sessionPath)
        const saved = JSON.parse(await readFile(path.join(sessionPath, "run.json"), "utf8")); account = saved.telemetry.account
        details = { resultPresent: !!saved.result, sourceVerification: saved.sourceVerification, sourceWorkMetrics: saved.native?.domain?.sourceWorkMetrics, reuse: saved.reuse }
      }
    } else {
      const task = await materializeNaturalRunTask({ prompt: loaded.value.brief ?? JSON.stringify(loaded.value.inquiry), taskPath: path.join(out, "task.json") })
      const result = await executeRun({ task, skill, adapter: new CodexAccountAdapter(), workDir: path.join(out, "workspace"), keepWorkDir: true, skillMode: "inject", adapterConfig: { model: manifest.experimentModel, timeoutMs: limits.sessionTimeoutMs, maxSteps: limits.maxToolCalls, providerOptions: { authorizationScope: inputFile, authorizationDomainTools: !plain, authorizationStrategy: strategy, ...(!plain ? { authorizationMethod: method } : {}), authorizationAccountBoundary: path.join(root, "account-boundary.json"), authorizationTraceDir: path.join(out, "raw"), authorizationMaxToolCalls: limits.maxToolCalls, authorizationMaxDisplayBytes: limits.maxDisplayBytes, authorizationMaxReadBytes: limits.maxReadBytes, authorizationSessionTimeoutMs: limits.sessionTimeoutMs } } })
      await writeFile(path.join(out, "run-result.json.gz"), gzipSync(JSON.stringify(result.runResult)), { flag: "wx" })
      const native = result.runResult.authorizationInquiry as any; account = native.account; status = account!.status
      details = { resultPresent: !!native.result, sourceVerification: native.sourceVerification, sourceWorkMetrics: native.domain?.sourceWorkMetrics, currentCheck: native.domain?.check }
    }
    await writeFile(path.join(out, "answer-original.md"), account?.text ?? "", { flag: "wx" })
    await write(path.join(out, "report.json"), { attemptId, positionId: id, status, ...binding, ...details, gitRevision, runtimeTree, sessionPath, inputSha256: loaded.inputSha256, sourceFiles: checked.sourceFiles, accountStatus: account?.status, terminalStatus: account?.terminalStatus, answerDelivery: account?.answerDelivery, usageVisibility: account?.usageVisibility, quotaRefused: account?.quotaRefused, terminalError: account?.terminalError, finalPresent: !!account?.text.trim(), answerSha256: sha(account?.text ?? ""), accountUsage: account?.usage ?? null, usageDetails: account?.usageDetails, inferenceDispatched: account?.inferenceDispatched ?? false, hostToolCalls: account ? account.tools.length + (account.toolRejections?.length ?? 0) : 0, durationMs: account?.durationMs, reason: account?.reason, providerRequests: null, actualUsd: null, targetExecutions: 0, semanticQuality: "awaiting-independent-review" }, true)
  } catch (error) {
    status = account?.status ?? "completion-unknown"; await write(path.join(out, "report.json"), { attemptId, positionId: id, status, error: String(error), providerRequests: null, actualUsd: null, targetExecutions: 0 }, true)
  }
  position.status = status; state.activeAttempts = []
  if (status.endsWith("unknown")) state.unknownCompletions.push(attemptId)
  if (account?.quotaRefused) { state.status = "in-progress-external-blocker"; state.accountChannel = { status: "quota-refused", attemptId, terminalStatus: account.terminalStatus, recoveryEvidence: null }; for (const p of manifest.positions) if (p.status === "registered-unrun") p.status = "unrun-account-blocked" }
  await write(manifestFile, manifest); await write(statusFile, state)
  console.log(JSON.stringify({ attemptId, status, terminalStatus: account?.terminalStatus, answerDelivery: account?.answerDelivery, usageVisibility: account?.usageVisibility, quotaRefused: account?.quotaRefused, hostToolCalls: account?.tools.length, finalPresent: !!account?.text.trim(), usage: account?.usage ?? null, reason: account?.reason }))
}
export async function prepareChanges(registrationId: string, studyRoot = root) {
  if (!registrationId || !/^[a-z0-9-]+$/.test(registrationId)) throw new Error("Use an explicit named current change registration")
  const manifest = JSON.parse(await readFile(path.join(studyRoot, "manifest.json"), "utf8"))
  const position = manifest.positions.find((p: Position) => p.id === "consumer-download") as Position
  const baselineAttemptId = position.attempts.at(-1)
  if (!baselineAttemptId || position.status === "running") throw new Error("Run the current original public Download consumer before preparing changes")
  const report = JSON.parse(await readFile(path.join(studyRoot, "attempts", baselineAttemptId, "report.json"), "utf8"))
  if (!report.sessionPath || !report.runtimeTree) throw new Error("Current public Download consumer has no reusable session identity")
  const runtimeTree = execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim()
  if (report.runtimeTree !== runtimeTree) throw new Error("Changed-input preparation requires the same current production tree")
  return prepareChangeInputs(studyRoot, report.sessionPath, { baselineAttemptId, runtimeTree: report.runtimeTree }, registrationId)
}
if (import.meta.main) {
  if (process.argv[2] === "bootstrap") await bootstrap()
  else if (process.argv[2] === "prepare-changes") console.log(JSON.stringify(await prepareChanges(process.argv[3]!)))
  else if (process.argv[2] === "run") await run(process.argv[3]!, process.argv[4] === "-" ? undefined : process.argv[4], process.argv[5])
  else throw new Error("Supported: bootstrap, prepare-changes <named-registration>, run <position-id> [named-revision|-] [change-registration]")
}
