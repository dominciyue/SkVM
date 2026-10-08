import { readFile, writeFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import path from "node:path"
import { aggregateUsage, qualityPanel } from "../authorization-property-abstraction-v1/summarize.ts"
import { root, sha, type Position } from "./study.ts"

const read = async (file: string) => JSON.parse(await readFile(path.join(root, file), "utf8"))
const write = async (file: string, value: unknown) => writeFile(path.join(root, file), JSON.stringify(value, null, 2) + "\n", "utf8")

/** Archive counters only; absence is unknown, never evidence of zero use. */
export function observeArchive(report: any, native: any) {
  const domain = native.domain, account = native.account ?? native.telemetry?.account
  const queries = domain?.propertyAnalysis?.demands?.flatMap((d: any) => d.dependencies?.propertyQueries?.queries ?? [])
  const properties = domain?.propertyAnalysis?.checks?.questions?.flatMap((q: any) => q.properties)
  const contexts = native.contextPayloads
  return {
    dynamicCalls: account ? (account.tools?.length ?? 0) + (account.toolRejections?.length ?? 0) : null,
    automaticReads: domain?.schedulerActions ? domain.schedulerActions.filter((a: any) => a.name === "source_read").length : null,
    formatRejects: report.toolBudget?.formatRejectCount ?? report.toolBudget?.formatRejections ?? null,
    acceptedUnits: report.sourceWorkMetrics?.acceptedSourceUnits ?? domain?.sourceWorkMetrics?.acceptedSourceUnits ?? null,
    materialUses: domain?.materialUses?.length ?? null,
    boundQueries: queries ? queries.filter((q: any) => q.state === "bound").length : null,
    checkedProperties: properties ? properties.filter((p: any) => p.status === "checked").length : null,
    violatedProperties: properties ? properties.filter((p: any) => p.status === "violated").length : null,
    tracedProperties: properties ? properties.filter((p: any) => p.trace?.length).length : null,
    checkHistoryCount: domain?.checkHistory?.length ?? null,
    contextBytes: contexts ? contexts.reduce((sum: any, c: any) => ({ original: sum.original + c.originalBytes, sent: sum.sent + c.sentBytes }), { original: 0, sent: 0 }) : null,
  }
}

export function buildSummary(manifest: any, state: any, facts: any[]) {
  if (manifest.positions.length !== 22) throw new Error("BA denominator must remain22")
  const accounting = { schemaVersion: "authorization-ba-accounting/v1", identity: manifest.identity, ...aggregateUsage(facts), visibleExperimentSessionsDispatched: facts.length,
    counting: "One row per actual attempt, all first/revisions retained. Input includes cacheRead once. Dynamic callbacks and automatic reads are separate, never provider request counts. Unknown costs remain null.", authorPreparation: { historicalAuthorCost: null, newModelCalls: 0, compatibilityCheckOnly: true }, targetExecutions: 0 }
  const attempted = manifest.positions.filter((p: Position) => p.attempts.length).length
  const summary = { schemaVersion: "authorization-ba-summary/v1", identity: manifest.identity, status: state.status, finiteQueueComplete: state.finiteQueueComplete === true, researchGoalAchieved: state.researchGoalAchieved === true,
    registeredPositions: 22, attemptedPositions: attempted, attempts: facts.length, extraRepairAttempts: facts.length - attempted,
    unrunPositions: manifest.positions.filter((p: Position) => !p.attempts.length).map((p: Position) => ({ id: p.id, status: p.status, reason: (p as any).reason ?? "pending" })),
    accountChannel: state.accountChannel, outcomes: manifest.outcomes, quality: qualityPanel(manifest.positions, facts), attemptsInActualOrder: [...facts].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    comparison: state.comparison ?? { conclusion: "inconclusive", reason: "No adjudicated complete same-version two-task comparison yet; source quality and machine adoption are separate." },
    accountingFile: "accounting.json", reviewsFile: "evaluation/reviews.json", originalAnswersModified: false, evaluatorProvidedToRuntime: false, targetExecutions: 0 }
  return { summary, accounting }
}

export async function summarize() {
  const manifest = await read("manifest.json"), state = await read("status.json"), reviews = (await read("evaluation/reviews.json")).reviews
  if (state.activeAttempts.length || state.unknownCompletions.length) throw new Error("Inspect active/unknown completion before aggregation")
  const facts = [], evidence = []
  for (const position of manifest.positions as Position[]) for (const attemptId of position.attempts) {
    const directory = `attempts/${attemptId}`, report = await read(`${directory}/report.json`), claim = await read(`${directory}/claim.json`), answer = await readFile(path.join(root, directory, "answer-original.md"))
    const review = reviews.find((r: any) => r.attemptId === attemptId)
    if (report.attemptId !== attemptId || report.positionId !== position.id || claim.attemptId !== attemptId || sha(answer) !== report.answerSha256 || review && review.answerSha256 !== report.answerSha256) throw new Error(`Original/review identity mismatch: ${attemptId}`)
    if (report.finalPresent && !review) throw new Error(`Delivered original lacks independent review: ${attemptId}`)
    let native: any, archiveFile: string
    if (position.entrance === "native") { archiveFile = `${directory}/run-result.json.gz`; native = JSON.parse(gunzipSync(await readFile(path.join(root, archiveFile))).toString("utf8")).authorizationInquiry }
    else { archiveFile = `${directory}/public-report.json`; native = report.sessionPath ? JSON.parse(await readFile(path.join(report.sessionPath, "run.json"), "utf8")) : await read(archiveFile) }
    const observed = observeArchive(report, native)
    facts.push({ attemptId, positionId: position.id, kind: position.kind, task: position.task, arm: position.arm ?? null, repeat: position.repeat ?? null, firstOrRevision: attemptId === position.attempts[0] ? "first" : "revision", parentAttempt: claim.parentAttempt,
      gitRevision: report.gitRevision, runtimeTree: report.runtimeTree, startedAt: claim.startedAt, status: report.status, terminalStatus: report.terminalStatus, finalPresent: report.finalPresent, sourceQuality: review?.sourceSemanticQuality ?? "undelivered", answerSha256: report.answerSha256,
      resultPresent: report.resultPresent, domainTools: claim.strategy !== "legacy", formatBudgetExhausted: report.toolBudget?.formatBudgetExhausted === true, sourceWorkMetrics: report.sourceWorkMetrics, ...observed,
      accountUsage: report.accountUsage, hostToolCalls: report.hostToolCalls, durationMs: report.durationMs, sourceAccounting: report.sourceAccounting ?? null, actualModelInput: report.actualModelInput, actualUsd: null, providerRequests: null })
    for (const file of ["claim.json", "report.json", "answer-original.md", path.basename(archiveFile)]) {
      const bytes = await readFile(path.join(root, directory, file)); evidence.push({ file: `${directory}/${file}`, bytes: bytes.length, sha256: sha(bytes) })
    }
    await write(`${directory}/runtime-observation.json`, { schemaVersion: "authorization-ba-observation/v1", attemptId, ...observed, targetExecutions: 0 })
  }
  const { summary, accounting } = buildSummary(manifest, state, facts)
  await write("summary.json", { ...summary, evidence }); await write("accounting.json", accounting)
  console.log(JSON.stringify({ positions: summary.registeredPositions, attempted: summary.attemptedPositions, attempts: facts.length, tokens: accounting.knownTokenTotals, conclusion: summary.comparison.conclusion }))
  return summary
}

if (import.meta.main) await summarize()
