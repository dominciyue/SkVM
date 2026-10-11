import path from "node:path"
import { identity, json, write, qualityIds, fairnessIssues } from "./study.ts"
export const isDelivered = (r: any) => r?.status === "completed" && r.finalPresent === true
export function studyAccounting(reports: any[]) {
  const unique = [...new Map<string, any>(reports.map(r => [r.attemptId, r])).values()], known = unique.filter(r => r.status === "completed" && r.terminalStatus === "completed" && r.accountUsage != null), unknown = unique.filter(r => !known.includes(r))
  const sum = (field: string) => known.reduce((n, r) => n + (r.accountUsage[field] ?? 0), 0)
  return { attempts: unique.length, known: { input: sum("input"), output: sum("output"), cachedInput: sum("cachedInput"), nonCachedInput: known.reduce((n, r) => n + Math.max(0, (r.accountUsage.input ?? 0) - (r.accountUsage.cachedInput ?? 0)), 0), reasoningOutput: sum("reasoningOutput"), durationMs: unique.reduce((n, r) => n + (r.durationMs ?? 0), 0) }, unknown: { attempts: unknown.map(r => r.attemptId), lastVisibleUsage: unknown.map(r => ({ attemptId: r.attemptId, usage: r.accountUsage ?? null })), providerRequests: null, developmentAndScoutCost: null, humanMinutes: null }, actualUsd: null, tools: { totalUsedKnown: unique.reduce((n, r) => n + (r.toolBudget?.totalUsed ?? r.hostToolCalls ?? 0), 0), hostCallsKnown: unique.reduce((n, r) => n + (r.hostToolCalls ?? 0), 0), automaticUnitsKnown: unique.reduce((n, r) => n + Math.max(0, (r.toolBudget?.totalUsed ?? r.hostToolCalls ?? 0) - (r.hostToolCalls ?? 0)), 0), formatRejectionsKnown: unique.reduce((n, r) => n + (r.toolBudget?.formatRejectCount ?? 0), 0) }, interpretation: "Unique attempts counted once. Input already includes cache; output already includes reasoning. Unknown final usage stays separate. Group views must not be added." }
}
const reviewed = (report: any, review: any) => !!report && review?.status === "source-reviewed" && review.attemptId === report.attemptId && review.answerSha256 === report.answerSha256 && review.inputSha256 === report.inputSha256 && review.runtimeTree === report.runtimeTree
export function qualityRows(positions: any[], reports: any[], reviews: any[], claims: any[], selection: "first" | "latest") {
  return qualityIds.map(id => {
    const p = positions.find(p => p.id === id), selectedAttempt = selection === "first" ? p?.attempts[0] : p?.attempts.at(-1), report = reports.find(r => r.attemptId === selectedAttempt), claim = claims.find(c => c.attemptId === selectedAttempt), review = reviews.find(r => r.attemptId === selectedAttempt), sourceReviewed = reviewed(report, review)
    return { id, selectedAttempt: selectedAttempt ?? null, firstAttempt: p?.attempts[0] ?? null, revisions: p?.attempts.slice(1) ?? [], runtimeTree: report?.runtimeTree ?? null, status: report?.status ?? p?.status ?? "pending", delivered: isDelivered(report), sourceReviewed, originalInputPresent: report?.actualModelInput?.fullOriginalBundlePrefixMatches === true && report?.actualModelInput?.originalQuestionsPresent?.length === 4 && report.actualModelInput.originalQuestionsPresent.every((q: any) => q.present), wholeOriginalTask: isDelivered(report) ? sourceReviewed ? review.wholeOriginalTask : "not-reviewed" : "undelivered", questions: (claim?.originalQuestionIds ?? report?.originalQuestionIds ?? []).map((questionId: string) => ({ questionId, quality: !isDelivered(report) ? "undelivered" : sourceReviewed ? review.questions?.find((q: any) => q.questionId === questionId)?.quality ?? "not-reviewed" : "not-reviewed" })), usage: report?.accountUsage ?? null, tools: report?.toolBudget?.totalUsed ?? report?.hostToolCalls ?? null, durationMs: report?.durationMs ?? null }
  })
}
function panel(positions: any[], reports: any[], reviews: any[], claims: any[], selection: "first" | "latest") {
  const rows = qualityRows(positions, reports, reviews, claims, selection)
  const pairs = [["quality-n-1", "quality-h-1"], ["quality-h-1", "quality-d-1"], ["quality-n-2", "quality-h-2"], ["quality-h-2", "quality-d-2"]].map(ids => {
    const selected = ids.map(id => rows.find(r => r.id === id)!), basis = selected.map(r => claims.find(c => c.attemptId === r.selectedAttempt)), issues = fairnessIssues(basis)
    if (!basis[0]?.runtimeTree || basis.some(c => c?.runtimeTree !== basis[0]?.runtimeTree)) issues.push("Different or absent production epoch")
    if (selected.some(r => !r.originalInputPresent)) issues.push("Actual original input unverified")
    const differences = selected[0]!.questions.map((q: any) => ({ questionId: q.questionId, base: q.quality, added: selected[1]!.questions.find((v: any) => v.questionId === q.questionId)?.quality ?? "unrun" }))
    const improved = differences.some((q: any) => q.added === "full" && q.base !== "full"), worsened = differences.some((q: any) => q.base === "full" && q.added !== "full")
    const conclusion = issues.length || selected.some(r => !r.sourceReviewed) ? "inconclusive" : improved && worsened ? "tradeoff" : worsened ? "negative" : improved ? "support" : "no-observed-difference"
    const delta = (a: any, b: any) => typeof a === "number" && typeof b === "number" ? b - a : null
    return { ids, selectedAttempts: selected.map(r => r.selectedAttempt), sameConditions: !issues.length, issues, questionDifferences: differences, costsAddedMinusBase: { input: delta(selected[0]!.usage?.input, selected[1]!.usage?.input), output: delta(selected[0]!.usage?.output, selected[1]!.usage?.output), tools: delta(selected[0]!.tools, selected[1]!.tools), durationMs: delta(selected[0]!.durationMs, selected[1]!.durationMs) }, conclusion }
  })
  return { denominator: 6, originalQuestionsPerAttempt: 4, questionCellsAreCorrelated: true, selection, delivered: rows.filter(r => r.delivered).length, endToEndFull: rows.filter(r => r.wholeOriginalTask === "full").length, qualityRequiresChecked: false, rows, pairs }
}
export async function summarizeStudy(root: string) {
  const manifest = await json(path.join(root, "manifest.json")), state = await json(path.join(root, "status.json")), reports: any[] = [], claims: any[] = [], reviews: any[] = []
  for (const attemptId of new Set<string>((manifest.positions ?? []).flatMap((p: any) => p.attempts))) {
    const dir = path.join(root, "attempts", attemptId); reports.push(await json(path.join(dir, "report.json"))); claims.push(await json(path.join(dir, "claim.json")))
    try { reviews.push(await json(path.join(dir, "source-review.json"))) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
  }
  const result = { schemaVersion: "authorization-be-summary/v1", identity, status: state.status, rows: manifest.positions ?? [], qualityFirst: panel(manifest.positions ?? [], reports, reviews, claims, "first"), qualityLatest: panel(manifest.positions ?? [], reports, reviews, claims, "latest"), revisions: reports.filter(r => !r.attemptId.endsWith("/original")).map(r => ({ attemptId: r.attemptId, runtimeTree: r.runtimeTree, comparableControls: r.comparableControls ?? null })), accounting: studyAccounting(reports), changes: reports.filter(r => !r.positionId.startsWith("quality-")).map(r => ({ attemptId: r.attemptId, delivered: isDelivered(r), reuse: r.reuse, properties: r.propertyAnalysis?.checks, review: reviews.find(v => v.attemptId === r.attemptId) ?? null })), outcomes: state.outcomes, finiteQueueComplete: state.finiteQueueComplete, researchGoalAchieved: state.researchGoalAchieved, targetExecutions: 0 }
  await write(path.join(root, "summary.json"), result); await write(path.join(root, "accounting.json"), result.accounting); return result
}
