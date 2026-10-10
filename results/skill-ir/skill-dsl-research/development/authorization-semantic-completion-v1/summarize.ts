import { readFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { attemptFunnel } from "../authorization-interprocedural-property-v1/summarize.ts"
import { accounting, crossFunctionProperties, isDelivered } from "../authorization-task-binding-v1/summarize.ts"
import { identity, json, write } from "./study.ts"

const qualityIds = ["quality-n-1", "quality-d-1", "quality-d-2", "quality-n-2"]
const counts = (items: any[], field: string) => items.reduce<Record<string, number>>((out, item) => { const key = String(item[field]); out[key] = (out[key] ?? 0) + 1; return out }, {})
const sourceIdentity = (files: any[] = []) => files.map(f => [f.path, f.sha256]).sort((a, b) => a[0].localeCompare(b[0]))
const reviewed = (report: any, review: any) => !!report && review?.status === "source-reviewed" && review.attemptId === report.attemptId && review.inputSha256 === report.inputSha256 && review.answerSha256 === report.answerSha256 && review.runtimeTree === report.runtimeTree
const originalInputPresent = (r: any) => r?.actualModelInput?.fullOriginalBundlePrefixMatches === true && r.originalQuestionIds?.length === 4 && r.originalQuestionIds.every((id: string) => r.actualModelInput.originalQuestionsPresent?.some((q: any) => q.questionId === id && q.present === true))

export function studyAccounting(reports: any[]) {
  const base = accounting(reports), unique = [...new Map<string, any>(reports.map(r => [r.attemptId, r])).values()]
  const total = (r: any) => r.toolBudget?.totalUsed ?? r.hostToolCalls
  return { ...base, tools: {
    totalUsedKnown: unique.reduce((sum, r) => sum + (total(r) ?? 0), 0),
    hostCallsKnown: unique.reduce((sum, r) => sum + (r.hostToolCalls ?? 0), 0),
    automaticUnitsKnown: unique.reduce((sum, r) => sum + (total(r) != null && r.hostToolCalls != null ? Math.max(0, total(r) - r.hostToolCalls) : 0), 0),
    formatRejectionsKnown: unique.reduce((sum, r) => sum + (r.toolBudget?.formatRejectCount ?? 0), 0),
    unknownTotalAttempts: unique.filter(r => total(r) == null).map(r => r.attemptId),
    interpretation: "Shared total budget includes native automatic source reads; host dispatches and retained field repairs are separate counts"
  } }
}

export function qualityPanel(positions: any[], reports: any[], reviews: any[], claims: any[]) {
  const rows = qualityIds.map(id => {
    const p = positions.find(p => p.id === id), selectedAttempt = p?.attempts.at(-1) ?? null
    const report = reports.find(r => r.attemptId === selectedAttempt), claim = claims.find(c => c.attemptId === selectedAttempt), review = reviews.find(r => r.attemptId === selectedAttempt)
    const sourceReviewed = reviewed(report, review), delivered = !!report && isDelivered(report)
    return { id, firstAttempt: p?.attempts[0] ?? null, revisions: p?.attempts.slice(1) ?? [], selectedAttempt, runtimeTree: report?.runtimeTree ?? null, status: report?.status ?? p?.status ?? "pending", delivered, sourceReviewed, originalInputPresent: originalInputPresent(report), reportMatchesClaim: !!claim && !!report && ["runtimeTree", "inputSha256", "originalTaskSha256"].every(f => claim[f] === report[f]), wholeOriginalTask: delivered && sourceReviewed ? review.wholeOriginalTask : delivered ? "not-reviewed" : "undelivered", questions: (claim?.originalQuestionIds ?? report?.originalQuestionIds ?? []).map((questionId: string) => ({ questionId, quality: !delivered ? "undelivered" : sourceReviewed ? review.questions?.find((q: any) => q.questionId === questionId)?.quality ?? "not-reviewed" : "not-reviewed" })), usage: report?.accountUsage ?? null, hostToolCalls: report?.hostToolCalls ?? null, toolCalls: report?.toolBudget?.totalUsed ?? report?.hostToolCalls ?? null, durationMs: report?.durationMs ?? null }
  })
  const pairs = [["quality-n-1", "quality-d-1"], ["quality-n-2", "quality-d-2"]].map(ids => {
    const selected = ids.map(id => rows.find(r => r.id === id)!), basis = selected.map(r => claims.find(c => c.attemptId === r.selectedAttempt)), issues: string[] = []
    for (const field of ["runtimeTree", "model", "effort", "limits", "skillIdentity", "inputSha256", "originalTaskSha256", "originalQuestionIds"]) if (basis.some(c => c?.[field] == null) || !isDeepStrictEqual(basis[0]?.[field], basis[1]?.[field])) issues.push(`Different or absent ${field}`)
    if (basis.some(c => !c?.sourceFiles) || !isDeepStrictEqual(sourceIdentity(basis[0]?.sourceFiles), sourceIdentity(basis[1]?.sourceFiles))) issues.push("Different or absent source scope")
    if (selected.some(r => !r.originalInputPresent || !r.reportMatchesClaim)) issues.push("Original input or report identity not verified")
    const n = selected[0]!, d = selected[1]!, delta = (a: any, b: any) => typeof a === "number" && typeof b === "number" ? b - a : null
    const fullQuestions = (r: typeof n) => r.questions.filter((q: any) => q.quality === "full").length
    const qualityDelta = fullQuestions(d) - fullQuestions(n), costs = { input: delta(n.usage?.input, d.usage?.input), output: delta(n.usage?.output, d.usage?.output), tools: delta(n.toolCalls, d.toolCalls), durationMs: delta(n.durationMs, d.durationMs) }
    const questionDifferences = n.questions.map((q: any) => ({ questionId: q.questionId, n: q.quality, d: d.questions.find((v: any) => v.questionId === q.questionId)?.quality ?? "unrun" }))
    const improved = questionDifferences.some((q: any) => q.d === "full" && q.n !== "full"), worsened = questionDifferences.some((q: any) => q.n === "full" && q.d !== "full")
    const reviewComplete = selected.every(r => !r.delivered || r.sourceReviewed)
    const conclusion = issues.length || !reviewComplete ? "inconclusive" : improved && worsened ? "tradeoff" : qualityDelta < 0 || n.delivered && !d.delivered ? "negative" : qualityDelta > 0 ? Object.values(costs).some(v => v != null && v > 0) ? "tradeoff" : "support" : "no-observed-difference"
    return { ids, selectedAttempts: selected.map(r => r.selectedAttempt), sameConditions: !issues.length, issues, delivered: selected.map(r => r.delivered), wholeOriginalTask: selected.map(r => r.wholeOriginalTask), questionDifferences, fullQuestionDeltaDMinusN: qualityDelta, costsDMinusN: costs, conclusion, interpretation: "Current two development observations only; machine failure remains in the denominator and costs are separate dimensions" }
  })
  const questionIds = [...new Set<string>(claims.filter(c => c.attemptId?.startsWith("quality-")).flatMap(c => c.originalQuestionIds ?? []))]
  return { denominator: 4, independentAttempts: new Set(reports.filter(r => qualityIds.includes(r.positionId)).map(r => r.attemptId)).size, delivered: rows.filter(r => r.delivered).length, endToEndFull: rows.filter(r => r.wholeOriginalTask === "full").length, wholeTaskDistribution: counts(rows, "wholeOriginalTask"), questions: questionIds.map(questionId => ({ questionId, counts: counts(rows.map(r => ({ quality: r.questions.find((q: any) => q.questionId === questionId)?.quality ?? "unrun" })), "quality") })), rows, pairs, qualityRequiresChecked: false }
}

export function attemptRelationships(report: any, raw: any, review: any) {
  const domain = raw?.domain ?? raw?.native?.domain, focus = domain?.focus, history = raw?.native?.history ?? raw?.history ?? []
  const focusById = new Map<string, any>((focus?.history ?? []).map((h: any) => [h.focus.id, h.focus]))
  const sourceEvents = focus?.sourceInterpretations ?? [], usedEvents = new Set<number>()
  const sourceSubmissions = history.flatMap((h: any, historyIndex: number) => {
    const edit = h.call?.arguments?.controlDelta
    if (h.call?.name !== "authorization_observe" || !edit?.transactionId || !Array.isArray(edit.edits)) return []
    const eventIndex = sourceEvents.findIndex((u: any, i: number) => !usedEvents.has(i) && u.event === "edited" && isDeepStrictEqual(u.raw, edit)), event = sourceEvents[eventIndex], owner = focusById.get(event?.focusId)
    if (event) usedEvents.add(eventIndex)
    const following = event ? sourceEvents[eventIndex + 1] : null, lowering = following?.focusId === event?.focusId && ["lowered", "rejected"].includes(following?.event) ? following : null
    return [{ historyIndex, callId: h.call.id, transactionId: edit.transactionId, sourceInterpretationEventIndex: event ? eventIndex : null, questionId: owner?.questionId ?? null, handle: owner?.handle ?? null, source: owner?.source ?? null, edits: edit.edits, executed: h.executed, editAccepted: !!event, loweringEvent: lowering?.event ?? null, loweringDiagnostics: lowering?.diagnostics ?? [], semanticSupport: h.output?.semanticSupport ?? null, diagnostics: [...(h.output?.diagnostics ?? []), ...(h.output?.controlDiagnostics ?? [])].map((d: any) => ({ code: d.code, path: d.path, message: d.message })), attribution: "Question and outcome joined through this exact retained edit and following lowering event; retained field edits, adopted units and semantic completeness are separate observations" }]
  })
  const units = domain?.semantic?.units ?? [], completion = focus?.semanticCompletion ?? [], questionIds: string[] = report.originalQuestionIds ?? []
  const questions = questionIds.map((questionId: string) => {
    const prepared = report.taskPreparation?.questions?.find((q: any) => q.questionId === questionId), check = report.propertyAnalysis?.checks?.questions?.find((q: any) => q.questionId === questionId)
    const currentUnits = units.filter((u: any) => u.questionId === questionId), properties = check?.properties ?? []
    return { questionId, originalRetained: report.actualModelInput?.originalQuestionsPresent?.find((q: any) => q.questionId === questionId)?.present ?? null, prepared: prepared ? { state: prepared.state, origin: prepared.origin, properties: prepared.properties } : null, sourceUnits: currentUnits.map((u: any) => ({ handle: u.handle, source: u.source, complete: u.complete, role: u.role, interpretation: focus?.sourceDrafts?.find((draft: any) => draft.handle === u.handle)?.interpretation ?? null })), completionStates: counts(completion.filter((i: any) => i.questionId === questionId), "state"), currentCompletion: completion.filter((i: any) => i.questionId === questionId), propertyStatuses: properties.map((p: any) => p.status), properties, noCurrentCheck: !check, finalDelivered: isDelivered(report), independentReview: review?.questions?.find((q: any) => q.questionId === questionId) ?? null }
  })
  const base = attemptFunnel(report, raw, review ?? {})
  return { ...base, questions, sourceSubmissions, focusTransitions: focus?.history ?? [], automaticComputation: domain?.computation ?? null, sourceCitationsReviewed: review?.questions?.map((q: any) => ({ questionId: q.questionId, sourceSupported: q.sourceSupported ?? null, sourceAnchors: q.sourceAnchors ?? [] })) ?? null, final: { delivery: isDelivered(report), domainDelivery: domain?.delivery ?? null, wholeOriginalTask: reviewed(report, review) ? review.wholeOriginalTask : "not-reviewed" }, inference: "Proposal execution, source adoption, current property verdict and natural-language quality are distinct observations" }
}

export async function summarizeStudy(root: string) {
  const manifest = await json(path.join(root, "manifest.json")), state = await json(path.join(root, "status.json")), reports: any[] = [], reviews: any[] = [], claims: any[] = [], relationships: any[] = []
  for (const attemptId of new Set<string>(manifest.positions.flatMap((p: any) => p.attempts))) {
    const dir = path.join(root, "attempts", attemptId), report = await json(path.join(dir, "report.json")), claim = await json(path.join(dir, "claim.json"))
    let review: any, raw: any
    try { review = await json(path.join(dir, "source-review.json")) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
    try { raw = JSON.parse(gunzipSync(await readFile(path.join(dir, "inquiry-run.json.gz"))).toString("utf8")) } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
    reports.push(report); claims.push(claim); if (review) reviews.push(review)
    relationships.push(attemptRelationships(report, raw, review))
  }
  const rows = manifest.positions.map((p: any) => ({ id: p.id, status: p.status, firstAttempt: p.attempts[0] ?? null, revisions: p.attempts.slice(1), attempts: p.attempts, unrunReason: p.unrunReason ?? null, results: reports.filter(r => r.positionId === p.id).map(r => ({ attemptId: r.attemptId, runtimeTree: r.runtimeTree, delivered: isDelivered(r), hostToolCalls: r.hostToolCalls, toolCalls: r.toolBudget?.totalUsed ?? r.hostToolCalls, independentProperties: crossFunctionProperties(r), review: reviews.find(v => v.attemptId === r.attemptId) ?? null })) }))
  const groups = { diagnostic: reports.filter(r => r.positionId === "extraction-download"), qualityFirst: reports.filter(r => r.positionId.startsWith("quality-") && r.attemptId.endsWith("/original")), revisions: reports.filter(r => !r.attemptId.endsWith("/original")), changes: reports.filter(r => /^(policy|premise|source)-/.test(r.positionId)), unknown: reports.filter(r => r.status.endsWith("unknown")) }
  const result = { schemaVersion: "authorization-bd-summary/v1", identity, status: state.status, rows, attemptRelationships: relationships, qualityComparison: qualityPanel(manifest.positions, reports, reviews, claims), accounting: { ...studyAccounting(reports), groups: Object.fromEntries(Object.entries(groups).map(([id, values]) => [id, studyAccounting(values)])), groupsOverlap: "Groups are overlapping views: unknown may belong to any execution group and revisions may belong to changes; do not add group totals to total costs" }, conclusionsAllowed: ["support", "tradeoff", "no-observed-difference", "negative", "inconclusive"], inheritedUnknownsRetained: true, targetExecutions: 0, outcomes: manifest.outcomes ?? null }
  await write(path.join(root, "summary.json"), result); await write(path.join(root, "accounting.json"), result.accounting)
  return result
}
