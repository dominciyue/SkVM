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
export function positionRows(positions: Position[], reports: any[]) {
  return positions.map(p => {
    const actual = (p.attempts.length ? p.attempts.map(id => reports.find(r => r.attemptId === id)) : reports.filter(r => r.positionId === p.id)).filter(Boolean)
    return { ...p, firstAttempt: actual[0]?.attemptId ?? null, revisions: actual.slice(1).map(r => r.attemptId), observedStatus: actual.at(-1)?.status ?? "not-run", finalPresent: actual.at(-1)?.finalPresent ?? false, crossFunctionProperties: actual.flatMap(crossFunctionProperties), unrunReason: actual.length ? null : p.status === "unrun-account-blocked" ? "BB official account channel paused under the registered recovery rule" : p.kind === "change" && p.arm === "previous" ? "Requires a qualified current same-method local consumer baseline" : "Registered position has not dispatched" }
  })
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
  const manifest = await json(path.join(root, "manifest.json")), state = await json(path.join(root, "status.json")), reports = [], reviews: any[] = []
  for (const id of new Set<string>(manifest.positions.flatMap((p: Position) => p.attempts))) {
    const report = await json(path.join(root, "attempts", id, "report.json")); reports.push(report)
    const reviewed = await review(id); reviews.push(reviewed)
  }
  const rows = positionRows(manifest.positions, reports), use = accounting(reports), realProperties = reports.flatMap(r => crossFunctionProperties(r).map((p: any) => ({ attemptId: r.attemptId, ...p })))
  const result = { schemaVersion: "authorization-bb-summary/v1", identity: manifest.identity, status: state.status, accountChannel: state.accountChannel, positions: rows, denominator: 16, positionsAttempted: rows.filter(p => p.firstAttempt).length, positionsUnrun: rows.filter(p => !p.firstAttempt).length, attempts: reports.length, naturalAnswers: reports.filter(isDelivered).length, partialUndeliveredTexts: reports.filter(r => r.finalPresent && !isDelivered(r)).length, qualityPanel: rows.filter(p => p.kind === "quality"), realProperties, reviews, accounting: use, outcomes: { engineering: "public-chain-tested-real-use-separate", realInterproceduralProperties: realProperties.length ? "observed-pending-independent-source-review" : "not-demonstrated", completeOriginalTasks: reviews.filter(r => r.wholeOriginalTask === "full").length, packageConsumption: reports.filter(r => r.positionId.startsWith("consumer-") && r.actualModelInput?.fullOriginalBundlePrefixMatches && isDelivered(r)).length, changeReuse: reports.filter(r => r.positionId.startsWith("change-") && isDelivered(r)).length, qualityAndCost: "inconclusive-until-comparable-complete-NMD-and-independent-reviews" }, finiteQueueComplete: false, researchGoalAchieved: false, thirdPartyApi: "paused-by-user", nextCommand: state.accountChannel.status.startsWith("paused-") ? "External routing/quota/auth recovery evidence is required before any later dispatch; do not probe or automatically retry." : "bun ./results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/study.ts status" }
  await mkdir(path.join(root, "verification"), { recursive: true }); await write(path.join(root, "summary.json"), result); await write(path.join(root, "accounting.json"), use)
  manifest.outcomes = result.outcomes; await write(path.join(root, "manifest.json"), manifest); return result
}
