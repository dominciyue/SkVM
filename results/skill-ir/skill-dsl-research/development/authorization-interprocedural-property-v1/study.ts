import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { gunzipSync, gzipSync } from "node:zlib"
import path from "node:path"
import { limits, buildTaskFacts, prepareConsumerPackage, type Position } from "../authorization-semantic-submission-v1/study.ts"
import { inputPlan } from "../authorization-question-closure-v1/study.ts"
import { checkAuthorizationInquiry, loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { compileAuthorizationInquiry } from "../../../../../src/task-dsl/authorization/inquiry-program.ts"
import { loadSkill } from "../../../../../src/core/skill-loader.ts"
export { limits }
export const identity = "authorization-interprocedural-property-v1"
export const root = import.meta.dir
export const repo = path.resolve(root, "../../../../..")
export const runRoot = `D:/skill优化/project-maintenance/runs/${identity}`
export const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
export const write = (file: string, value: unknown, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", ...(exclusive ? { flag: "wx" } : {}) })
export function positions(): Position[] {
  const rows: Omit<Position, "order" | "status" | "attempts">[] = [
    { id: "pilot-download", stage: "BB9", kind: "pilot", task: "download", entrance: "native" },
    { id: "pilot-owui", stage: "BB10", kind: "pilot", task: "owui", entrance: "native" },
  ]
  for (const [task, arms] of [["download", ["N", "M", "D"]], ["owui", ["D", "M", "N"]]] as const)
    for (const arm of arms) rows.push({ id: `quality-${task}-${arm}`, stage: "BB11", kind: "quality", task, entrance: "native", arm })
  rows.push({ id: "consumer-download-inquiry", stage: "BB12", kind: "consumer", task: "download", entrance: "inquiry" }, { id: "consumer-owui-native", stage: "BB12", kind: "consumer", task: "owui", entrance: "native" })
  for (const change of ["policy", "premise", "source"]) for (const arm of ["fresh", "previous"]) rows.push({ id: `change-download-${change}-${arm}`, stage: "BB13", kind: "change", task: "download", entrance: "inquiry", arm })
  return rows.map((row, i) => ({ ...row, order: i + 1, status: "registered-not-run", attempts: [] }))
}
export function assertOwnedPaths(studyRoot: string, externalRoot: string) {
  if (path.basename(path.resolve(studyRoot)) !== identity || path.basename(path.resolve(externalRoot)) !== identity || path.resolve(studyRoot) === path.resolve(externalRoot)) throw new Error("BB output identity: refuse historical or shared output directory")
}
export async function extractOriginalRegression() {
  const historical = path.resolve(root, "../authorization-semantic-submission-v1"), entries = []
  for (const attemptId of ["pilot-download/transaction-priority-1", "pilot-owui/original"]) {
    const file = path.join(historical, "attempts", attemptId, "run-result.json.gz"), bytes = await readFile(file)
    const native = JSON.parse(gunzipSync(bytes).toString("utf8")).authorizationInquiry, domain = native.domain
    entries.push({ attemptId, originalFile: file, sha256: sha(bytes), jsonPath: "$.authorizationInquiry.domain", original: { materials: domain.sourceMaterials.materials.length, materialUses: domain.materialUses.length, checkHistory: domain.checkHistory.length, sourceWorkMetrics: domain.sourceWorkMetrics }, program: native.program, sourceDrafts: domain.focus.sourceDrafts, checkHistory: domain.checkHistory, sourceInterpretations: domain.focus.sourceInterpretations, units: domain.semantic.units, materials: domain.sourceMaterials, propertyAnalysis: domain.propertyAnalysis, replay: "pending" })
  }
  const replayFile = path.join(historical, "verification/owui-await-replay.json"), replayBytes = await readFile(replayFile)
  return { schemaVersion: "authorization-bb-original-regression/v1", identity, entries, inheritedReplay: { file: replayFile, sha256: sha(replayBytes), value: JSON.parse(replayBytes.toString("utf8")) }, modelCalls: 0, originalFilesChanged: false }
}
export function classifyAccountChannel(account: Record<string, any>, prior: Record<string, any>) {
  const counters = { consecutiveRoutingFailures: prior.consecutiveRoutingFailures ?? 0, cumulativeRoutingFailures: prior.cumulativeRoutingFailures ?? 0, recoveryAttempts: prior.recoveryAttempts ?? 0 }
  const reason = account.terminalError?.message ?? account.reason ?? ""
  if (account.quotaRefused) return { ...counters, status: "paused-quota", reason }
  if (/authenticat|unauthorized|login required/i.test(reason)) return { ...counters, status: "paused-auth", reason }
  if (["completion-unknown", "timeout-unknown"].includes(account.status)) return { ...counters, status: "completion-unknown", reason }
  if (["failed", "interrupted"].includes(account.terminalStatus) && /workspace routing discovery failed|connection (?:failed|closed)|transport.*failed/i.test(reason)) {
    counters.consecutiveRoutingFailures++; counters.cumulativeRoutingFailures++
    return { ...counters, status: counters.consecutiveRoutingFailures >= 2 || counters.cumulativeRoutingFailures >= 3 || counters.recoveryAttempts >= 3 ? "paused-recurring-routing" : "terminal-routing-recovery-eligible", reason }
  }
  if (account.status === "unavailable") return { ...counters, status: "paused-local-configuration", reason }
  if (account.status === "completed" && account.terminalStatus === "completed") counters.consecutiveRoutingFailures = 0
  return { ...counters, status: "available", reason: reason || account.status }
}
export function admitDispatch(state: Record<string, any>, readiness: { readyToDispatch: boolean; terminalVerified: boolean }) {
  if (state.activeAttempts.length || state.unknownCompletions.length) throw new Error("Inspect active/unknown completion before dispatch")
  if (!readiness.readyToDispatch) throw new Error("A checked input and production snapshot must be ready")
  const channel = state.accountChannel
  if (["inherited-terminal-reentry-eligible", "terminal-routing-recovery-eligible"].includes(channel.status)) {
    if (!readiness.terminalVerified) throw new Error("Reentry requires the verified prior terminal")
    return { recovery: true, parentAttempt: channel.lastAttempt ?? channel.parentAttempt, retryReason: channel.reason }
  }
  if (channel.status.startsWith("paused-") || channel.status === "completion-unknown") throw new Error(`Account channel blocked: ${channel.status}`)
  return { recovery: false, parentAttempt: null, retryReason: null }
}
export function assertAttemptClaim(attempts: string[], revision?: string) {
  if ((!revision && attempts.length) || (revision && (!/^[a-z0-9-]+$/.test(revision) || !attempts.length || attempts.some(a => a.endsWith(`/${revision}`))))) throw new Error("Preserve first attempts; repair requires a new named revision")
}
export async function dryRun(id: string) {
  const position = positions().find(p => p.id === id); if (!position) throw new Error("Use a registered BB position")
  const original = inputPlan(position.task), consumer = position.kind === "consumer", plain = position.arm === "N"
  const inputFile = consumer ? path.join(root, "model/packages", position.task, "inquiry.json") : path.join(root, "model/inputs", `${position.task}-${plain ? "natural" : "common"}.json`)
  return { positionId: id, entrance: position.entrance, inputFile, originalInputFile: original.inputFile, skillFile: original.skillFile, ...(consumer ? { authorAttempt: original.authorAttempt } : {}), domainTools: !plain, method: position.arm === "D" || consumer || position.kind === "change" ? "D1" as const : "M" as const, strategy: plain ? "legacy" as const : "operation-evidence-v7" as const, model: "gpt-5.6-sol", effort: "high", limits, evaluatorProvidedToRuntime: false }
}
async function writeSame(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  try { await write(file, value, true) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || JSON.stringify(JSON.parse(await readFile(file, "utf8"))) !== JSON.stringify(value)) throw error }
}
export async function preparePositionInput(id: string) {
  let plan: Awaited<ReturnType<typeof dryRun>> & { previous?: string; binding?: unknown } = await dryRun(id); const position = positions().find(p => p.id === id)!, original = await loadInquiryInput(plan.originalInputFile), facts = buildTaskFacts(original.value)
  if (position.kind === "change") {
    const { resolveChangeRun } = await import("../authorization-property-execution-v1/changes.ts")
    const changed = await resolveChangeRun(root, id, execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim())
    plan = { ...plan, ...changed }
    if (position.arm === "previous" && !changed.previous) throw new Error("Previous change blocked: no qualified current local baseline")
  } else {
    await writeSame(path.join(root, "model/task-facts", `${position.task}.json`), { ...facts, schemaVersion: "authorization-bb-task-facts/v1", originalInputFile: plan.originalInputFile, originalInputSha256: original.inputSha256 })
    if (plan.authorAttempt) await prepareConsumerPackage({ originalInputFile: plan.originalInputFile, authorAttempt: plan.authorAttempt, destination: path.dirname(plan.inputFile) })
    else {
      const { brief: _brief, mode: _mode, policy: _policy, ...metadata } = original.value
      const requirement = position.task === "download" ? "whether selecting another version changes the resource that is authorized" : "whether the object authorized for input and the object affected by output are the same"
      if (!original.value.brief!.includes(requirement)) throw new Error("Property requirement must be an exact original task span")
      const inquiry = { ...facts.inquiry, questions: [{ ...facts.inquiry.questions[0]!, request: original.value.brief!, properties: [{ id: "original-resource-relation", kind: "authorized-object-matches-effect", requirement }] }] }
      await writeSame(plan.inputFile, { ...metadata, sourceRoot: path.relative(path.dirname(plan.inputFile), original.context.sourceRoot).split(path.sep).join("/"), ...(position.arm === "N" ? { brief: original.value.brief, mode: original.value.mode ?? "behavior", ...(original.value.policy ? { policy: original.value.policy } : {}) } : { inquiry }) })
    }
  }
  const checked = await checkAuthorizationInquiry(plan.inputFile, plan.method, plan.strategy), skill = await loadSkill(plan.skillFile), skillIdentity = []
  for (const file of ["SKILL.md", ...skill.bundleFiles].sort()) { const bytes = await readFile(path.join(skill.skillDir, file)); skillIdentity.push({ file, bytes: bytes.length, sha256: sha(bytes) }) }
  const readiness = { readyToDispatch: checked.status === "valid", positionId: id, publicCheck: checked, skillIdentity, runtimeTree: execFileSync("git", ["rev-parse", "HEAD:src"], { cwd: repo, encoding: "utf8" }).trim(), limits, model: plan.model, effort: plan.effort, noPriorAdoptionRequired: true }
  await mkdir(path.join(root, "verification"), { recursive: true }); await write(path.join(root, "verification", `ready-${id}.json`), readiness)
  return { ...plan, readiness }
}
export async function verifyInputEquivalence() {
  const tasks = []
  for (const task of ["download", "owui"]) {
    const m = await preparePositionInput(`quality-${task}-M`), d = await preparePositionInput(`quality-${task}-D`), n = await preparePositionInput(`quality-${task}-N`), mi = await loadInquiryInput(m.inputFile), di = await loadInquiryInput(d.inputFile), ni = await loadInquiryInput(n.inputFile), original = await loadInquiryInput(m.originalInputFile)
    const program = compileAuthorizationInquiry(mi.value.inquiry!), identicalProgram = JSON.stringify(program) === JSON.stringify(compileAuthorizationInquiry(di.value.inquiry!)), sourceFiles = (p: typeof m) => p.readiness.publicCheck.status === "valid" ? p.readiness.publicCheck.sourceFiles : null, identicalSources = sourceFiles(m) !== null && [d, n].every(p => JSON.stringify(sourceFiles(p)) === JSON.stringify(sourceFiles(m))), identicalSkill = [d, n].every(p => JSON.stringify(p.readiness.skillIdentity) === JSON.stringify(m.readiness.skillIdentity))
    tasks.push({ task, programSha256: sha(JSON.stringify(program)), identicalProgram, identicalSources, identicalSkill, originalBriefPreserved: mi.value.inquiry!.questions[0]!.request === original.value.brief && ni.value.brief === original.value.brief, inputFiles: { m: m.inputFile, d: d.inputFile, n: n.inputFile }, limits, actualLoadedEvidence: "pending-real-thread-start" })
  }
  const result = { schemaVersion: "authorization-bb-input-equivalence/v1", status: tasks.every(t => t.identicalProgram && t.identicalSources && t.identicalSkill && t.originalBriefPreserved) ? "preflight-pass-actual-loading-pending" : "failed", tasks, modelCalls: 0 }
  await write(path.join(root, "input-equivalence.json"), result); return result
}
export async function bootstrap() {
  assertOwnedPaths(root, runRoot)
  const baRoot = path.resolve(root, "../authorization-semantic-submission-v1"), ba = JSON.parse(await readFile(path.join(baRoot, "status.json"), "utf8"))
  if (ba.activeAttempts.length || ba.unknownCompletions.length) throw new Error("Inspect inherited active/unknown lifecycle before takeover")
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(), startupWorkingTree = execFileSync("git", ["status", "--short", "--branch"], { cwd: repo, encoding: "utf8" })
  await mkdir(runRoot, { recursive: true }); await mkdir(path.join(root, "fixtures"), { recursive: true })
  await writeFile(path.join(root, "fixtures/ba-original.json.gz"), gzipSync(JSON.stringify(await extractOriginalRegression())), { flag: "wx" })
  await write(path.join(root, "manifest.json"), { schemaVersion: "authorization-bb-manifest/v1", identity, date: "2026-10-09", baseline: head, startupWorkingTree, developmentModel: "gpt-6.1-sol", developmentEffort: "max", experimentModel: "gpt-5.6-sol", experimentEffort: "high", strategy: "operation-evidence-v7", limits, positions: positions(), requirements: { engineering: "public interprocedural source call/object/path checks with counterexamples", realInterproceduralProperties: "Download and OWUI current adopted trace", completeOriginalTasks: "all original questions independently reviewed", packageConsumption: "two original-byte packages", changeReuse: "policy/premise/source fresh and previous", qualityAndCost: "same-epoch N/M/D with failures and unknown costs" }, outcomes: { engineering: "pending", realInterproceduralProperties: "not-measured", completeOriginalTasks: "not-measured", packageConsumption: "not-measured", changeReuse: "not-measured", qualityAndCost: "not-measured" }, researchGoalAchieved: false, thirdPartyApi: "paused-by-user", evaluatorIsolation: "Fixtures/reviews/history never enter runtime input." }, true)
  await write(path.join(root, "status.json"), { schemaVersion: "authorization-bb-status/v1", identity, status: "in-progress", currentStage: "BB0", stages: Array.from({ length: 17 }, (_, i) => ({ id: `BB${i}`, status: i === 0 ? "registered" : "pending" })), activeAttempts: [], unknownCompletions: [], accountChannel: { status: "inherited-terminal-reentry-eligible", inheritedIdentity: ba.identity, parentAttempt: `${ba.identity}/${ba.accountChannel.lastAttempt}`, terminalStatus: ba.accountChannel.terminalStatus, reason: ba.accountChannel.reason, lifecycle: ba.accountChannel.lifecycle, inheritedPausePreserved: true, consecutiveRoutingFailures: 0, cumulativeRoutingFailures: 0, recoveryAttempts: 0 }, finiteQueueComplete: false, researchGoalAchieved: false, targetExecutions: 0 }, true)
  await write(path.join(root, "tsconfig.json"), { extends: "../../../../../tsconfig.json", include: ["./*.ts"], exclude: ["attempts", "model", "node_modules"] }, true)
  await writeFile(path.join(root, "account-boundary.json"), await readFile(path.join(baRoot, "account-boundary.json")), { flag: "wx" })
}
if (import.meta.main) {
  if (process.argv[2] === "init") await bootstrap()
  else if (process.argv[2] === "help") console.log("init | status | dry-run/prepare/run <registered-position> [named-revision] | equivalence | replay | prepare-changes | review <attempt> | summarize")
  else if (process.argv[2] === "status") console.log(await readFile(path.join(root, "status.json"), "utf8"))
  else if (process.argv[2] === "dry-run") console.log(JSON.stringify(await dryRun(process.argv[3]!)))
  else if (process.argv[2] === "prepare") console.log(JSON.stringify(await preparePositionInput(process.argv[3]!)))
  else if (process.argv[2] === "equivalence") console.log(JSON.stringify(await verifyInputEquivalence()))
  else if (process.argv[2] === "run") await (await import("./runner.ts")).run(process.argv[3]!, process.argv[4])
  else if (process.argv[2] === "replay") console.log(JSON.stringify(await (await import("./replay.ts")).replay()))
  else if (process.argv[2] === "prepare-changes") console.log(JSON.stringify(await (await import("./runner.ts")).prepareChanges()))
  else if (process.argv[2] === "review") console.log(JSON.stringify(await (await import("./summarize.ts")).review(process.argv[3]!)))
  else if (process.argv[2] === "summarize") console.log(JSON.stringify(await (await import("./summarize.ts")).summarize()))
  else throw new Error("Supported: init | status | dry-run/prepare/run <position> [named-revision] | equivalence | replay | prepare-changes | review <attempt> | summarize")
}
