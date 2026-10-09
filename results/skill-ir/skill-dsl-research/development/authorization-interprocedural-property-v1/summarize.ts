import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { root, sha, write } from "./study.ts"
import type { Position } from "../authorization-semantic-submission-v1/study.ts"
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
export const isDelivered = (report: any) => report.status === "completed" && report.terminalStatus === "completed" && report.answerDelivery === "delivered" && report.finalPresent === true
export function assertReviewInput(bytes: Uint8Array, expected: string) { if (sha(bytes) !== expected) throw new Error("Archived review input hash differs from the dispatched claim") }
export function accounting(reports: any[]) {
  const attempts = [...new Map(reports.map(r => [r.attemptId, r])).values()], known = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, unknownUsageAttempts: string[] = []
  for (const r of attempts) {
    if (!r.accountUsage || r.accountUsage.available === false) unknownUsageAttempts.push(r.attemptId)
    else for (const key of Object.keys(known) as Array<keyof typeof known>) known[key] += r.accountUsage[key] ?? 0
  }
  return { attempts: attempts.length, known, inputIncludesCache: true, unknownUsageAttempts, durationMs: attempts.reduce((n, r) => n + (r.durationMs ?? 0), 0), unknownDurationAttempts: attempts.filter(r => r.durationMs == null).map(r => r.attemptId), actualUsd: null, providerRequests: null, developmentAndSubagentCost: null, humanMinutes: null, targetExecutions: 0 }
}
export function crossFunctionProperties(report: any) {
  return report.propertyAnalysis?.checks?.questions.flatMap((q: any) => q.properties.filter((p: any) => ["checked", "violated"].includes(p.status) && p.trace?.length && new Set(p.traceDetails?.map((r: any) => r.source?.id).filter(Boolean)).size > 1).map((p: any) => ({ questionId: q.questionId, ...p }))) ?? []
}
export const qualifiedConsumer = (report: any, runtimeTree: string) => !!report && isDelivered(report) && report.method === "D1" && !!report.sessionPath && report.runtimeTree === runtimeTree && crossFunctionProperties(report).length > 0
export function positionRows(positions: Position[], reports: any[]) {
  return positions.map(p => {
    const actual = (p.attempts.length ? p.attempts.map(id => reports.find(r => r.attemptId === id)) : reports.filter(r => r.positionId === p.id)).filter(Boolean)
    return { ...p, firstAttempt: actual[0]?.attemptId ?? null, revisions: actual.slice(1).map(r => r.attemptId), observedStatus: actual.at(-1)?.status ?? "not-run", finalPresent: actual.at(-1)?.finalPresent ?? false, crossFunctionProperties: actual.flatMap(crossFunctionProperties), unrunReason: actual.length ? null : p.status === "unrun-account-blocked" ? "BB official account channel paused under the registered recovery rule" : p.kind === "change" && p.arm === "previous" ? "Requires a qualified current same-method local consumer baseline" : "Registered position has not dispatched" }
  })
}
export function queueOutcome(positions: Position[], reports: any[]) {
  const pending: string[] = [], externalBlocked: string[] = [], previousBlocked: string[] = []
  for (const p of positions) {
    const last = reports.find(r => r.attemptId === p.attempts.at(-1))
    if (last && !last.status?.endsWith("unknown") && (last.terminalStatus === "completed" || ["failed", "interrupted"].includes(last.terminalStatus) || last.status === "needs-fresh-analysis")) continue
    if (!p.attempts.length && p.status === "blocked-no-qualified-baseline" && p.kind === "change" && p.arm === "previous") previousBlocked.push(p.id)
    else if (!p.attempts.length && p.status === "unrun-account-blocked") externalBlocked.push(p.id)
    else pending.push(p.id)
  }
  return { finiteQueueSettled: positions.length === 16 && !pending.length, finiteQueueComplete: positions.length === 16 && !pending.length && !externalBlocked.length, pending, externalBlocked, previousBlocked }
}
export function qualityComparison(positions: Position[], reports: any[], reviews: any[], claims: any[]) {
  const rows = positions.filter(p => p.kind === "quality").map(p => {
    const selectedAttempt = p.attempts.at(-1), report = reports.find(r => r.attemptId === selectedAttempt), claim = claims.find(c => c.attemptId === selectedAttempt), review = reviews.find(r => r.attemptId === selectedAttempt)
    return { positionId: p.id, task: p.task, arm: p.arm, firstAttempt: p.attempts[0] ?? null, revisions: p.attempts.slice(1), selectedAttempt: selectedAttempt ?? null, runtimeTree: claim?.runtimeTree ?? null, delivered: !!report && isDelivered(report), wholeOriginalTask: review?.wholeOriginalTask ?? "not-reviewed", sourceReviewed: review?.status === "source-reviewed", actualOriginalInput: report?.actualModelInput?.fullOriginalBundlePrefixMatches === true && report?.actualModelInput?.originalQuestionTextPresent === true, reportMatchesClaim: !!report && !!claim && report.runtimeTree === claim.runtimeTree, usage: report?.accountUsage ?? null }
  })
  const issues: string[] = []
  if (rows.length !== 6) issues.push("Six registered N/M/D positions required")
  if (rows.some(r => !r.delivered || !r.sourceReviewed || !r.actualOriginalInput || !r.reportMatchesClaim)) issues.push("Delivered, independently reviewed, original-input-matched attempts required for all positions")
  const selected = rows.map(r => claims.find(c => c.attemptId === r.selectedAttempt))
  for (const fields of [["runtimeTree", "model", "effort", "limits"], ["sourceFiles", "skillIdentity", "originalTaskSha256"]]) {
    for (const group of fields[0] === "runtimeTree" ? [selected] : ["download", "owui"].map(t => rows.filter(r => r.task === t).map(r => claims.find(c => c.attemptId === r.selectedAttempt)))) {
      for (const field of fields) if (!group.length || group.some(c => c?.[field] == null) || new Set(group.map(c => JSON.stringify(c?.[field]))).size !== 1) issues.push(`Comparable ${field} absent or different`)
    }
  }
  return { comparable: !issues.length, issues: [...new Set(issues)], rows, independentAttempts: new Set(rows.map(r => r.selectedAttempt).filter(Boolean)).size, interpretation: "Single development observation per task and arm; references are not additional samples, and no stable quality or net-cost effect is estimated" }
}
export async function review(attemptId: string) {
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(attemptId)) throw new Error("Use a registered attempt id")
  const directory = path.join(root, "attempts", attemptId), report = await json(path.join(directory, "report.json")), claim = await json(path.join(directory, "claim.json")), answer = await readFile(path.join(directory, "answer-original.md")), inputBytes = await readFile(claim.inputArchive ? path.join(directory, claim.inputArchive) : claim.inputFile)
  assertReviewInput(inputBytes, claim.inputSha256); const input = JSON.parse(inputBytes.toString("utf8"))
  if (sha(answer) !== report.answerSha256) throw new Error("Original answer hash changed")
  const output = path.join(directory, "source-review.json")
  try { const prior = await json(output); if (prior.answerSha256 !== report.answerSha256) throw new Error("Review identity changed"); return prior } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
  const result = { schemaVersion: "authorization-bb-source-review/v1", attemptId, answerSha256: report.answerSha256, inputSha256: claim.inputSha256, originalTaskSha256: claim.originalTaskSha256, status: isDelivered(report) ? "awaiting-independent-source-review" : "undelivered", wholeOriginalTask: isDelivered(report) ? "not-reviewed" : "undelivered", partialTextRetained: report.finalPresent && !isDelivered(report), crossFunctionProperty: "not-reviewed", originalRequest: input.brief ?? input.inquiry?.questions.map((q: any) => q.request), allowedPaths: input.allowedPaths, sourceFiles: claim.sourceFiles, findings: [], evaluatorProvidedToRuntime: false }
  await write(output, result, true); return result
}
export async function summarize() {
  const manifest = await json(path.join(root, "manifest.json")), state = await json(path.join(root, "status.json")), reports = [], reviews: any[] = [], claims = []
  for (const id of new Set<string>(manifest.positions.flatMap((p: Position) => p.attempts))) {
    const report = await json(path.join(root, "attempts", id, "report.json")); reports.push(report)
    claims.push(await json(path.join(root, "attempts", id, "claim.json")))
    const reviewed = await review(id); reviews.push(reviewed)
  }
  const rows = positionRows(manifest.positions, reports), use = accounting(reports), realProperties = reports.flatMap(r => crossFunctionProperties(r).map((p: any) => ({ attemptId: r.attemptId, ...p }))), queue = queueOutcome(manifest.positions, reports), comparison = qualityComparison(manifest.positions, reports, reviews, claims)
  const result = { schemaVersion: "authorization-bb-summary/v1", identity: manifest.identity, status: state.status, accountChannel: state.accountChannel, positions: rows, denominator: 16, positionsAttempted: rows.filter(p => p.firstAttempt).length, positionsUnrun: rows.filter(p => !p.firstAttempt).length, attempts: reports.length, naturalAnswers: reports.filter(isDelivered).length, partialUndeliveredTexts: reports.filter(r => r.finalPresent && !isDelivered(r)).length, qualityPanel: rows.filter(p => p.kind === "quality"), qualityComparison: comparison, realProperties, reviews, accounting: use, observations: reports.map(r => ({ attemptId: r.attemptId, runtimeTree: r.runtimeTree, method: r.method, strategy: r.strategy, status: r.status, delivered: isDelivered(r), actualModelInput: r.actualModelInput, hostToolCalls: r.hostToolCalls, sourceWorkMetrics: r.sourceWorkMetrics, materialUses: r.materialUses.length, propertyAnalysis: r.propertyAnalysis, toolBudget: r.toolBudget, sourceAccounting: r.sourceAccounting, terminalError: r.terminalError, usage: r.accountUsage, reviewFile: `attempts/${r.attemptId}/source-review.json` })), outcomes: { engineering: "public-chain-tested-real-use-separate", realInterproceduralProperties: realProperties.length ? "observed-pending-independent-source-review" : "not-demonstrated", completeOriginalTasks: reviews.filter(r => r.wholeOriginalTask === "full").length, packageConsumption: reports.filter(r => r.positionId.startsWith("consumer-") && r.actualModelInput?.fullOriginalBundlePrefixMatches && isDelivered(r)).length, changeReuse: { freshDelivered: reports.filter(r => r.positionId.startsWith("change-") && r.positionId.endsWith("-fresh") && isDelivered(r)).length, previousDelivered: reports.filter(r => r.positionId.startsWith("change-") && r.positionId.endsWith("-previous") && isDelivered(r)).length, previousBlocked: queue.previousBlocked, observedEffect: "No reuse benefit inferred from fresh runs or preserved history alone" }, qualityAndCost: comparison.comparable ? "development-comparison-only-net-effect-inconclusive" : "inconclusive-until-comparable-NMD-and-independent-reviews" }, ...queue, researchGoalAchieved: false, thirdPartyApi: "paused-by-user", nextCommand: state.accountChannel.status.startsWith("paused-") ? "External routing/quota/auth recovery evidence is required before any later dispatch; do not probe or automatically retry." : queue.finiteQueueComplete ? "No automatic dispatch remains in this finite queue; inspect summary and unmet outcomes before proposing further work." : "bun ./results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/study.ts status" }
  await mkdir(path.join(root, "verification"), { recursive: true }); await write(path.join(root, "summary.json"), result); await write(path.join(root, "accounting.json"), use)
  manifest.outcomes = result.outcomes; await write(path.join(root, "manifest.json"), manifest); return result
}
