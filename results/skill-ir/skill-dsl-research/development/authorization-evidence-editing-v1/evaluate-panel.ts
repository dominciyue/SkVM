import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const mode = process.argv[2]
if (mode !== "evaluate" && mode !== "replay") throw new Error("Usage: bun evaluate-panel.ts evaluate|replay")
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const configBytes = await readFile(path.join(root, "panel-config.json"))
const configSha256 = hash(configBytes)
const config = JSON.parse(configBytes.toString("utf8")) as { units: Array<{ id: string; phase: string; caseId: string; arm: string; input: string }> }
const map = await readJson(path.join(root, "evaluator", "review-map.json"))
const reviews = await readJson(path.join(root, "evaluator", "review-decisions.json"))
const account = await readJson(path.join(root, "generation-account.json"))
const replay = await readJson(path.join(root, "replay.json"))
if (map.configSha256 !== configSha256 || account.configSha256 !== configSha256 || replay.configSha256 !== configSha256
  || !map.generatedAfterAllPanelUnitsClosed || config.units.length !== 40 || account.planned !== 40 || replay.terminal !== 40)
  throw new Error("Panel/evaluation identity or closure mismatch")
const mapped = Object.entries(map.map) as Array<[string, any]>
const scored = Object.entries(reviews.ratings) as Array<[string, any]>
if (mapped.length !== 40 || scored.length !== 40 || mapped.some(([id]) => !reviews.ratings[id]) || scored.some(([id]) => !map.map[id]))
  throw new Error("Review coverage differs from registered packets")
for (const [id, identity] of mapped) {
  const bytes = await readFile(path.join(root, "evaluator", "packets", `${id}.json`))
  const packet = JSON.parse(bytes.toString("utf8"))
  if (hash(bytes) !== identity.packetSha256 || packet.anonymousId !== id || packet.caseId !== identity.caseId
    || hash(JSON.stringify(packet.answer)) !== identity.answerSha256) throw new Error(`Packet identity changed: ${id}`)
}

const rows: any[] = []
for (const unit of config.units) {
  const identity = mapped.find(([, item]) => item.unitId === unit.id)
  const usage = account.rows.find((item: any) => item.id === unit.id)
  if (!identity || !usage) throw new Error(`Missing review/account ${unit.id}`)
  const [reviewId, binding] = identity
  const score = reviews.ratings[reviewId]
  if (binding.caseId !== unit.caseId || binding.arm !== unit.arm || binding.phase !== unit.phase || binding.evidenceLayer !== unit.input
    || usage.status !== "completed" || !["full", "partial", "incorrect"].includes(score.rating)) throw new Error(`Review mismatch ${unit.id}`)
  const stored = await readJson(path.join(root, "runs", unit.id, "unit.json"))
  if (stored.configSha256 !== configSha256 || stored.report.status !== "completed") throw new Error(`Run changed ${unit.id}`)
  const report = stored.report
  rows.push({ ...unit, anonymousId: reviewId, status: report.status, sessionId: report.sessionId,
    finalKind: usage.finalKind, firstResponse: usage.firstResponse,
    finalReview: score, firstFull: score.rating === "full" && usage.finalKind === "initial" && !!usage.firstResponse?.deliveryComplete,
    finalFull: score.rating === "full", conclusionCorrect: score.conclusion === "correct",
    observedDecisions: report.observedDecisions, canonicalConclusions: report.canonicalResult.results.map((item: any) => item.conclusion),
    usage: { providerCalls: usage.providerCalls, respondedCalls: usage.respondedCalls, unknownUsageCalls: usage.unknownUsageCalls,
      knownTokens: usage.knownTokens, tokensStatus: usage.tokensStatus, actualUsdStatus: usage.actualUsdStatus,
      totalActualUsd: usage.totalActualUsd, knownDurationMs: usage.knownDurationMs,
      fallbackCalls: usage.fallbackCalls, repairCalls: usage.repairCalls, promptCharacters: usage.promptCharacters } })
}

function aggregate(selected: any[]) {
  const tokens = selected.reduce((sum, row) => {
    for (const key of ["input", "output", "cacheRead", "cacheWrite"]) sum[key] = (sum[key] ?? 0) + Number(row.usage.knownTokens?.[key] ?? 0)
    return sum
  }, {} as Record<string, number>)
  return { planned: selected.length, completed: selected.filter(row => row.status === "completed").length,
    firstDeliveryComplete: selected.filter(row => row.firstResponse?.deliveryComplete).length,
    firstFull: selected.filter(row => row.firstFull).length, finalFull: selected.filter(row => row.finalFull).length,
    conclusionCorrect: selected.filter(row => row.conclusionCorrect).length,
    justifiedUnknown: selected.filter(row => row.finalReview.behavior === "justified-unknown").length,
    providerCalls: selected.reduce((sum, row) => sum + Number(row.usage.providerCalls), 0),
    fallbackCalls: selected.reduce((sum, row) => sum + Number(row.usage.fallbackCalls), 0),
    repairCalls: selected.reduce((sum, row) => sum + Number(row.usage.repairCalls), 0),
    knownDurationMs: selected.reduce((sum, row) => sum + Number(row.usage.knownDurationMs), 0),
    knownTokens: tokens, tokensStatus: selected.every(row => row.usage.unknownUsageCalls === 0) ? "complete" : "partial",
    actualUsdStatus: selected.every(row => row.usage.actualUsdStatus === "complete") ? "complete" : "unknown",
    totalActualUsd: selected.every(row => row.usage.actualUsdStatus === "complete") ? selected.reduce((sum, row) => sum + Number(row.usage.totalActualUsd), 0) : null }
}
const groups: Record<string, ReturnType<typeof aggregate>> = {}
for (const phase of ["initial", "repeat"]) for (const arm of ["M0", "D0", "M1", "D1"]) {
  const selected = rows.filter(row => row.phase === phase && row.arm === arm)
  groups[`${phase}/${arm}`] = aggregate(selected)
}
const paired = []
for (const phase of ["initial", "repeat"]) for (const [baseline, candidate] of [["M0", "M1"], ["D0", "D1"], ["M0", "D0"], ["M1", "D1"]]) {
  const pairs = [...new Set(rows.filter(row => row.phase === phase).map(row => row.caseId))].map(caseId => ({
    baseline: rows.find(row => row.phase === phase && row.caseId === caseId && row.arm === baseline)!,
    candidate: rows.find(row => row.phase === phase && row.caseId === caseId && row.arm === candidate)!,
  }))
  if (pairs.some(pair => !pair.baseline || !pair.candidate)) throw new Error(`Incomplete pair ${phase}/${baseline}/${candidate}`)
  paired.push({ phase, baseline, candidate, registeredPairs: pairs.length,
    baselineFull: pairs.filter(pair => pair.baseline.finalFull).length,
    candidateFull: pairs.filter(pair => pair.candidate.finalFull).length,
    improvement: pairs.filter(pair => !pair.baseline.finalFull && pair.candidate.finalFull).map(pair => pair.baseline.caseId),
    regression: pairs.filter(pair => pair.baseline.finalFull && !pair.candidate.finalFull).map(pair => pair.baseline.caseId) })
}
const summary = { schemaVersion: "authorization-aj-panel-summary/v1", configSha256,
  generatedBeforeReview: true, plannedUnits: rows.length, reviewedPackets: mapped.length,
  primary: aggregate(rows), groups, paired, rows,
  interpretationBoundary: "The 0/1 evidence contrast changes supplied source bytes for both representations. Same-layer M/D pairs isolate this specific representation difference; neither contrast proves general causal benefit beyond these public development tasks.",
  limitations: ["Public development tasks, not held-out.", "No target or deployment was executed.", "The prepared Paperless share-create input retained a named 64KiB gap.", "Gateway did not report actual USD; null is unknown rather than zero.", "Three Markdown sessions required one diagnostics-only repair each; initial delivery and final review are separate.", "Blind packet ratings include targeted Memos GetShared adjudication after one reviewer missed a canonical-label contradiction."],
  panelProviderCalls: account.providerCalls, targetExecutions: 0 }
const serialized = `${JSON.stringify(summary, null, 2)}\n`
const output = path.join(root, "panel-summary.json")
if (mode === "replay") {
  if (await readFile(output, "utf8") !== serialized) throw new Error("Offline evaluation replay differs")
  process.stdout.write(`${JSON.stringify({ status: "reproduced", sha256: hash(serialized), planned: rows.length, providerCallsThisCommand: 0 })}\n`)
} else {
  await writeFile(output, serialized, { flag: "wx" })
  process.stdout.write(`${JSON.stringify({ status: "evaluated", sha256: hash(serialized), primary: summary.primary,
    groups: Object.fromEntries(Object.entries(groups).map(([id, group]) => [id, { full: group.finalFull, firstFull: group.firstFull, providerCalls: group.providerCalls }])) })}\n`)
}
