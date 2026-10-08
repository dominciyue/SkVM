import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"

const root = import.meta.dir
const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const read = async (file: string) => JSON.parse(await readFile(path.join(root, file), "utf8"))
const write = async (file: string, value: unknown) => writeFile(path.join(root, file), JSON.stringify(value, null, 2) + "\n", "utf8")
type Usage = { input: number; output: number; cacheRead?: number; cacheWrite?: number }
interface UsageRow { attemptId: string; accountUsage: Usage | null; hostToolCalls: number; durationMs: number | null }
interface QualityRow { attemptId: string; positionId: string; finalPresent: boolean; status: string; sourceQuality: string; resultPresent: boolean; domainTools: boolean; formatBudgetExhausted: boolean }
interface Position { id: string; kind: string; task: string; arm?: string; repeat?: number; status: string; attempts: string[] }

export function aggregateUsage(rows: UsageRow[]) {
  if (new Set(rows.map(r => r.attemptId)).size !== rows.length) throw new Error("duplicate account session")
  const totals = rows.reduce((sum, r) => ({ input: sum.input + (r.accountUsage?.input ?? 0), output: sum.output + (r.accountUsage?.output ?? 0), cacheRead: sum.cacheRead + (r.accountUsage?.cacheRead ?? 0), cacheWrite: sum.cacheWrite + (r.accountUsage?.cacheWrite ?? 0) }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  const usageUnknownAttempts = rows.filter(r => !r.accountUsage).map(r => r.attemptId)
  return { sessionsWithObservedUsage: rows.length - usageUnknownAttempts.length, usageUnknownAttempts, allUsageReported: !usageUnknownAttempts.length,
    knownTokenTotals: { ...totals, total: totals.input + totals.output, inputExcludingCacheRead: totals.input - totals.cacheRead }, inputIncludesCached: true,
    hostToolCalls: rows.reduce((v, r) => v + r.hostToolCalls, 0), durationMs: rows.reduce((v, r) => v + (r.durationMs ?? 0), 0), durationUnknownAttempts: rows.filter(r => r.durationMs === null).map(r => r.attemptId),
    actualUsd: null, providerRequests: null, developmentUsage: null, scoutUsage: null, humanMinutes: null }
}

export function qualityPanel(positions: Position[], facts: QualityRow[]) {
  const rows = positions.filter(p => p.kind === "quality").map(p => {
    const first = facts.find(f => f.attemptId === p.attempts[0])
    return { positionId: p.id, task: p.task, arm: p.arm, repeat: p.repeat, status: p.status, attemptId: first?.attemptId ?? null,
      naturalDelivered: !!first?.finalPresent, sourceQuality: first?.sourceQuality ?? "unrun", machineResultPresent: !!first?.resultPresent,
      formatBudgetExhausted: first?.formatBudgetExhausted ?? null,
      protocolAndSourceFull: !!first && first.status === "completed" && first.finalPresent && first.sourceQuality === "full" && (!first.domainTools || first.resultPresent && !first.formatBudgetExhausted) }
  })
  if (rows.length !== 12) throw new Error("quality denominator must remain twelve")
  return { denominator: 12, attempted: rows.filter(r => r.attemptId).length, unrun: rows.filter(r => !r.attemptId).length,
    naturalDelivered: rows.filter(r => r.naturalDelivered).length, sourceFull: rows.filter(r => r.sourceQuality === "full").length, sourcePartial: rows.filter(r => r.sourceQuality === "partial").length,
    undelivered: rows.filter(r => r.attemptId && !r.naturalDelivered).length, machineResults: rows.filter(r => r.machineResultPresent).length, protocolAndSourceFull: rows.filter(r => r.protocolAndSourceFull).length,
    scoring: "First attempts only. Source quality is independent. End-to-end full additionally requires the requested domain delivery contract for M/D. Protocol failures and unrun rows remain in denominator twelve.", rows }
}

export async function summarize() {
  const manifest = await read("manifest.json"), status = await read("status.json")
  if (status.activeAttempts.length || status.unknownCompletions.length) throw new Error("Inspect active/unknown sessions before aggregation")
  const reviews = [await read("evaluation/single-download-original.json"), ...(await read("evaluation/reviews.json")).entries]
  const facts = [], evidence = []
  for (const p of manifest.positions as Position[]) for (const attemptId of p.attempts) {
    const directory = `attempts/${attemptId}`, report = await read(`${directory}/report.json`), claim = await read(`${directory}/claim.json`), observation = await read(`${directory}/runtime-observation.json`)
    const answer = await readFile(path.join(root, directory, "answer-original.md")), review = reviews.find(r => r.attemptId === attemptId)
    if (report.attemptId !== attemptId || report.positionId !== p.id || digest(answer) !== report.answerSha256 || review && review.answerSha256 !== report.answerSha256) throw new Error(`Original/review identity mismatch: ${attemptId}`)
    if (report.finalPresent && !review) throw new Error(`Delivered answer lacks independent review: ${attemptId}`)
    for (const file of ["claim.json", "report.json", "answer-original.md", "runtime-observation.json"]) {
      const bytes = await readFile(path.join(root, directory, file)); evidence.push({ file: `${directory}/${file}`, sha256: digest(bytes), bytes: bytes.length })
    }
    facts.push({ attemptId, positionId: p.id, kind: p.kind, task: p.task, arm: p.arm ?? null, repeat: p.repeat ?? null, gitRevision: report.gitRevision, runtimeTree: report.runtimeTree, runnerSha256: claim.runnerSha256, startedAt: claim.startedAt,
      status: report.status, terminalStatus: report.terminalStatus, terminalError: report.terminalError ?? null, finalPresent: report.finalPresent, sourceQuality: review?.sourceQuality ?? "undelivered", answerSha256: report.answerSha256,
      resultPresent: report.resultPresent === true, domainTools: observation.domainTools === true, formatBudgetExhausted: observation.toolBudget?.formatBudgetExhausted === true,
      sourceWorkMetrics: observation.sourceWorkMetrics, materialUses: observation.materialUses, checkHistoryCount: observation.checkHistoryCount, propertyQueryCounts: observation.propertyQueryCounts,
      accountUsage: report.accountUsage, hostToolCalls: report.hostToolCalls, durationMs: report.durationMs, sourceAccounting: report.sourceAccounting ?? null, actualUsd: null, providerRequests: null })
  }
  const accounting = { schemaVersion: "authorization-az-accounting/v1", identity: manifest.identity, ...aggregateUsage(facts), visibleExperimentSessionsDispatched: facts.length,
    counting: "One report per actual attempt; inquiry and native views are never counted twice. Known totals exclude unknown usage rather than replacing it with zero. Cache read is a component of input. Host callbacks and weighted tool budget are not provider requests.",
    authorPreparation: { newCalls: 0, historicalAuthorCost: null, reusedOriginalBytes: true, amortizationMeasured: false }, targetExecutions: 0 }
  const panel = qualityPanel(manifest.positions, facts)
  const summary = { schemaVersion: "authorization-az-summary/v1", identity: manifest.identity, status: "completed-with-unmet-criteria", finiteQueueComplete: true, researchGoalAchieved: false,
    registeredPositions: manifest.positions.length, attemptedPositions: manifest.positions.filter((p: Position) => p.attempts.length).length, attempts: facts.length, extraRepairAttempts: facts.length - manifest.positions.filter((p: Position) => p.attempts.length).length,
    unrunPositions: manifest.positions.filter((p: Position) => !p.attempts.length).map((p: Position) => ({ id: p.id, status: p.status })), accountChannel: status.accountChannel,
    outcomes: { engineering: "partial: bounded vertical chain tested; full framework semantic summaries incomplete", realUse: "four natural deliveries across one exposed task; no current domain check/result or material adoption", quality: "inconclusive: three of twelve positions attempted, only N/M delivered, D routing failure", reuse: "not-measured: both consumers and all six changes blocked; offline contracts only", singleProperty: "not-achieved: original and named repair exhausted format budget" },
    quality: panel, attemptsInActualOrder: [...facts].sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    comparison: { conclusion: "inconclusive", observedDownloadFirstPair: "N source full, M source partial; M used more input tokens. One delivered pair and no delivered D cannot establish a stable method or expression effect.", limitations: ["Only development sources already exposed to implementation", "Nine quality positions and the second task were unrun", "Historical D author decomposition differs from M host question normalization", "No qualified complete base for real reuse", "Protocol, source quality and engineering evidence remain separate"] },
    evidence, accountingFile: "accounting.json", verificationFile: "verification.json", reviewsFile: "evaluation/reviews.json", originalAnswersModified: false, evaluatorProvidedToRuntime: false, targetExecutions: 0 }
  if (summary.registeredPositions !== 21 || summary.attemptedPositions + summary.unrunPositions.length !== 21) throw new Error("position denominator changed")
  await write("accounting.json", accounting); await write("summary.json", summary)
  console.log(JSON.stringify({ positions: summary.registeredPositions, attempted: summary.attemptedPositions, attempts: facts.length, quality: { attempted: panel.attempted, full: panel.sourceFull, partial: panel.sourcePartial, unrun: panel.unrun }, tokens: accounting.knownTokenTotals, unknownUsage: accounting.usageUnknownAttempts, researchGoalAchieved: false }))
  return summary
}

if (import.meta.main) await summarize()
