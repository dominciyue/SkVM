import { readFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { accounting as inheritedAccounting, crossFunctionProperties, isDelivered } from "../authorization-interprocedural-property-v1/summarize.ts"
import { root, write } from "./study.ts"
export { crossFunctionProperties, isDelivered }
export function accounting(reports: any[]) {
  const unique = new Map<string, any>()
  for (const r of reports) { if (unique.has(r.attemptId) && !isDeepStrictEqual(unique.get(r.attemptId), r)) throw new Error("Conflicting reports for the same immutable attempt"); unique.set(r.attemptId, r) }
  return inheritedAccounting([...unique.values()].map(r => r.inferenceDispatched === false ? { ...r, accountUsage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, terminalStatus: "not-dispatched" } : r))
}
export interface BaselineBasis { inputSha256: string; questions: Array<{ id: string; request: string }>; sourceFiles: Array<{ path: string; sha256: string }>; model: string; effort: string; limits: unknown; skillIdentity: unknown }
const sourceIdentity = (files: Array<{ path: string; sha256: string }> = []) => files.map(f => [f.path, f.sha256]).sort((a, b) => a[0]!.localeCompare(b[0]!))
export function qualifiedPropertyEvidence(report: any, review: any, runtimeTree: string, claim: any, basis: BaselineBasis) {
  if (!isDelivered(report) || report.method !== "D1" || report.strategy !== "task-binding-v1" || report.runtimeTree !== runtimeTree || report.sourceVerification?.valid !== true || review.status !== "source-reviewed") return false
  if (claim.attemptId !== report.attemptId || review.attemptId !== report.attemptId || claim.runtimeTree !== runtimeTree || claim.inputSha256 !== basis.inputSha256 || report.inputSha256 !== basis.inputSha256 || claim.originalTaskSha256 !== basis.inputSha256 || review.inputSha256 !== report.inputSha256 || review.answerSha256 !== report.answerSha256 || review.runtimeTree !== runtimeTree) return false
  if (claim.model !== basis.model || claim.effort !== basis.effort || !isDeepStrictEqual(claim.limits, basis.limits) || !isDeepStrictEqual(claim.skillIdentity, basis.skillIdentity) || !isDeepStrictEqual(claim.originalQuestionIds, basis.questions.map(q => q.id)) || !isDeepStrictEqual(sourceIdentity(claim.sourceFiles), sourceIdentity(basis.sourceFiles))) return false
  const preparation = report.taskPreparation
  if (preparation?.schemaVersion !== "authorization-task-properties/v1" || !isDeepStrictEqual(preparation.questions.map((q: any) => [q.questionId, q.residualRequest]), basis.questions.map(q => [q.id, q.request]))) return false
  return crossFunctionProperties(report).some((p: any) => {
    const question = preparation.questions.find((q: any) => q.questionId === p.questionId), declared = question?.properties.find((q: any) => q.id === p.propertyId), task = basis.questions.find(q => q.id === p.questionId)
    if (question?.origin !== "model-task-proposal" || question?.state !== "prepared" || !declared?.requirement || declared.kind !== p.kind || !task?.request.includes(declared.requirement)) return false
    if (!p.traceDetails.every((r: any) => !r.source || basis.sourceFiles.some(s => s.path === r.source.path && s.sha256 === r.source.sha256))) return false
    return review.propertyReviews?.some((r: any) => r.questionId === p.questionId && r.propertyId === p.propertyId && r.kind === declared.kind && r.requirement === declared.requirement && r.sourceSupported === true)
  })
}
export const qualifiedBaseline = (report: any, review: any, runtimeTree: string, claim: any, basis: BaselineBasis) => !!report.sessionPath && qualifiedPropertyEvidence(report, review, runtimeTree, claim, basis)
export async function summarize() {
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8")), reports: any[] = [], reviews: any[] = []
  for (const position of manifest.positions) for (const id of position.attempts) {
    const directory = path.join(root, "attempts", id); reports.push(JSON.parse(await readFile(path.join(directory, "report.json"), "utf8")))
    try { reviews.push(JSON.parse(await readFile(path.join(directory, "source-review.json"), "utf8"))) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  }
  const rows = manifest.positions.map((p: any) => { const r = reports.find(r => r.attemptId === p.attempts.at(-1)); return { id: p.id, status: r?.status ?? p.status, firstAttempt: p.attempts[0] ?? null, revisions: p.attempts.slice(1), unrunReason: p.unrunReason ?? null, delivered: !!r && isDelivered(r), wholeOriginalTask: reviews.find(v => v.attemptId === r?.attemptId)?.wholeOriginalTask ?? "not-reviewed", currentCrossSourceProperties: r ? crossFunctionProperties(r) : [] } })
  const result = { schemaVersion: "authorization-bc-summary/v1", rows, accounting: accounting(reports), inheritedUnknownsRetained: true, targetExecutions: 0, researchGoalAchieved: false }
  await write(path.join(root, "accounting.json"), result.accounting); await write(path.join(root, "summary.json"), result); return result
}
