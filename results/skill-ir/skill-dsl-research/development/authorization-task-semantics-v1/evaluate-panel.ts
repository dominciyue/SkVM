import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const mode = process.argv[2]
if (mode !== "evaluate" && mode !== "replay") throw Error("Usage: bun evaluate-panel.ts evaluate|replay")
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex")
const configBytes = await readFile(path.join(root, "panel-config.json"))
const config = JSON.parse(configBytes.toString("utf8"))
const configSha256 = sha(configBytes)
const map = await readJson(path.join(root, "evaluator", "review-map.json"))
const decisions = await readJson(path.join(root, "evaluator", "review-decisions.json"))
const account = await readJson(path.join(root, "generation-account.json"))
if (map.configSha256 !== configSha256 || account.configSha256 !== configSha256 || account.planned !== 54 || !map.generatedAfterAllPanelUnitsClosed) throw Error("Evaluation identity or generation closure differs")

type Score = { currentDecision: string; controlEvidence: string; branches: string; details: string; labelConsistency: string; extra: string; full: boolean; reason?: string }
const scores = new Map<string, Score>()
for (const [caseId, record] of Object.entries(decisions.cases) as Array<[string, any]>) {
  for (const id of record.anonymousIds) {
    if (scores.has(id) || map.map[id]?.caseId !== caseId) throw Error(`Blind review identity mismatch ${id}`)
    scores.set(id, { ...record.score, ...(decisions.overrides[id] ?? {}) })
  }
}
if (scores.size !== Object.keys(map.map).length || [...scores.keys()].some(id => !map.map[id])) throw Error("Blind review count differs from registered packets")
for (const [id, identity] of Object.entries(map.map) as Array<[string, any]>) {
  const bytes = await readFile(path.join(root, "evaluator", "packets", `${id}.json`))
  if (sha(bytes) !== identity.packetSha256) throw Error(`Blind packet changed ${id}`)
  const packet = JSON.parse(bytes.toString("utf8"))
  if (packet.anonymousId !== id || packet.caseId !== identity.caseId || sha(packet.answer.rawResponse) !== identity.rawOutputSha256) throw Error(`Blind answer changed ${id}`)
}

const reviewedId = (unitId: string, generation: "initial" | "repair") => Object.entries(map.map).find(([, identity]: [string, any]) => identity.unitId === unitId && identity.generation === generation)?.[0]
const rows: any[] = []
for (const unit of config.units) {
  const item = config.cases.find((candidate: any) => candidate.id === unit.caseId)
  const stored = await readJson(path.join(root, "runs", unit.id, "unit.json"))
  if (!item || stored.configSha256 !== configSha256) throw Error(`Registered unit changed ${unit.id}`)
  const report = stored.report
  const session = path.join(root, "runs", unit.id, "sessions", report.sessionId)
  const run = await readJson(path.join(session, "run.json"))
  const firstId = reviewedId(unit.id, "initial")
  const repairId = reviewedId(unit.id, "repair")
  const firstScore = firstId ? scores.get(firstId)! : null
  const finalId = run.finalKind === "repair" ? repairId : firstId
  const finalScore = report.status === "completed" && finalId ? scores.get(finalId)! : null
  if (report.status === "completed" && !finalScore) throw Error(`Completed unit lacks a final blind review ${unit.id}`)
  const finalArtifact = run.finalKind === "repair" ? run.repair : run.initial
  const wireItem = finalArtifact?.wireResult?.results?.[0]
  const canonicalItem = finalArtifact?.result?.results?.[0]
  const usage = account.rows.find((candidate: any) => candidate.id === unit.id)
  if (!usage || usage.status !== report.status) throw Error(`Generation account differs ${unit.id}`)
  const attempts = run.attempts ?? []
  rows.push({ ...unit, exposure: item.exposure, status: report.status, sessionId: report.sessionId,
    firstResponse: run.firstResponse ?? null, finalKind: run.finalKind ?? null,
    firstReviewId: firstId ?? null, firstReview: firstScore,
    finalReviewId: finalId ?? null, finalReview: finalScore,
    firstFull: !!firstScore?.full && !!run.firstResponse?.deliveryComplete,
    finalFull: !!finalScore?.full,
    observedDecision: wireItem?.decision ?? null, derivedConclusion: canonicalItem?.conclusion ?? null,
    requestedBranchValidation: report.requestedBranchValidation?.status ?? null,
    usage: { providerCalls: usage.providerCalls, respondedCalls: usage.respondedCalls, unknownUsageCalls: usage.unknownUsageCalls, tokens: usage.tokens, actualUsdStatus: usage.actualUsdStatus, totalActualUsd: usage.totalActualUsd },
    fallbackCalls: attempts.filter((attempt: any) => attempt.transport === "prompt-parse").length,
    repairCalls: attempts.filter((attempt: any) => attempt.phase === "domain-repair").length,
    knownDurationMs: attempts.reduce((sum: number, attempt: any) => sum + (attempt.response?.durationMs ?? 0), 0),
    unknownDurationCalls: attempts.filter((attempt: any) => !attempt.response).length })
}

function aggregate(selected: any[]) {
  const tokens = selected.reduce((total, row) => ({ input: total.input + (row.usage.tokens?.input ?? 0), output: total.output + (row.usage.tokens?.output ?? 0), cacheRead: total.cacheRead + (row.usage.tokens?.cacheRead ?? 0), cacheWrite: total.cacheWrite + (row.usage.tokens?.cacheWrite ?? 0) }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
  return { planned: selected.length, completed: selected.filter(row => row.status === "completed").length,
    timeoutUnknown: selected.filter(row => row.status === "timeout-unknown").length,
    transportFailed: selected.filter(row => row.status === "transport-failed").length,
    firstDeliveryComplete: selected.filter(row => row.firstResponse?.deliveryComplete).length,
    firstFull: selected.filter(row => row.firstFull).length, finalFull: selected.filter(row => row.finalFull).length,
    currentDecisionCorrectOrJustifiedUnknown: selected.filter(row => ["correct", "justified-unknown"].includes(row.finalReview?.currentDecision)).length,
    requestedBranchesComplete: selected.filter(row => row.finalReview?.branches === "complete-correct").length,
    providerCalls: selected.reduce((sum, row) => sum + (row.usage.providerCalls ?? 0), 0),
    fallbackCalls: selected.reduce((sum, row) => sum + row.fallbackCalls, 0), repairCalls: selected.reduce((sum, row) => sum + row.repairCalls, 0),
    knownDurationMs: selected.reduce((sum, row) => sum + row.knownDurationMs, 0), unknownDurationCalls: selected.reduce((sum, row) => sum + row.unknownDurationCalls, 0),
    knownTokens: tokens, tokensStatus: selected.every(row => row.usage.unknownUsageCalls === 0) ? "complete" : "partial",
    actualUsdStatus: selected.every(row => row.usage.actualUsdStatus === "complete") ? "complete" : "unknown" }
}

const groups: Record<string, ReturnType<typeof aggregate>> = {}
for (const phase of ["initial", "repeat", "outcome-only"]) for (const arm of ["M0", "D0", "M1", "D1"]) {
  const selected = rows.filter(row => row.phase === phase && row.arm === arm)
  if (selected.length) groups[`${phase}/${arm}`] = aggregate(selected)
}
const paired = []
for (const phase of ["initial", "repeat"]) for (const [baseline, candidate] of [["M0", "M1"], ["D0", "D1"], ["M0", "D0"], ["M1", "D1"]]) {
  const pairs = [...new Set(rows.filter(row => row.phase === phase).map(row => row.caseId))].map(caseId => ({ baseline: rows.find(row => row.phase === phase && row.caseId === caseId && row.arm === baseline), candidate: rows.find(row => row.phase === phase && row.caseId === caseId && row.arm === candidate) })).filter(pair => pair.baseline && pair.candidate)
  const bothCompleted = pairs.filter(pair => pair.baseline!.status === "completed" && pair.candidate!.status === "completed")
  paired.push({ phase, baseline, candidate, registeredPairs: pairs.length, bothCompleted: bothCompleted.length,
    baselineFullInCompletedPairs: bothCompleted.filter(pair => pair.baseline!.finalFull).length,
    candidateFullInCompletedPairs: bothCompleted.filter(pair => pair.candidate!.finalFull).length,
    baselineFullIntentToTreat: pairs.filter(pair => pair.baseline!.finalFull).length,
    candidateFullIntentToTreat: pairs.filter(pair => pair.candidate!.finalFull).length })
}
const mechanisms = ["label-direction", "entry-boundary", "requested-branches"].map(mechanism => {
  const selected = rows.filter(row => row.mechanism === mechanism)
  return { mechanism, units: selected.map(row => ({ id: row.id, status: row.status, observedDecision: row.observedDecision, derivedConclusion: row.derivedConclusion, full: row.finalFull })) }
})
const summary = { schemaVersion: "authorization-ai-panel-summary/v1", configSha256, generationClosedBeforeReview: true,
  plannedUnits: rows.length, reviewedPackets: scores.size, completedUnits: rows.filter(row => row.status === "completed").length,
  primary: aggregate(rows), groups, paired, mechanisms, rows,
  sensitivity: { disputedPacket: "r-a387661853b3", primaryFull: aggregate(rows).finalFull, conservativeFull: aggregate(rows).finalFull + 1,
    note: "One fixed-crop helper-prefix ambiguity changes M1 owui-file from over-abstention to justified unknown; no robust mechanism benefit should hinge on that row." },
  sourceSupport: "Fresh-context, read-only blind case reviews with a separate targeted adjudication; reviewer dimensions are persisted and hash-bound to packet bytes.",
  limitations: ["Public development and declared scenario variations, not held-out.", "Fourteen panel units had no delivered semantic answer; timeout/transport outcomes stay in the registered denominator and are not resent.", "A gateway did not report actual USD. Known tokens exclude fourteen unknown-usage calls; cache-read is separate from input/output.", "A single OWUI file source crop admits a conservative alternative judgment, reported in sensitivity rather than hidden.", "No target or deployment was executed; source conclusions remain bounded to the supplied crop."],
  evaluationProviderCalls: 0, targetExecutions: 0 }
const serialized = `${JSON.stringify(summary, null, 2)}\n`
const output = path.join(root, "panel-summary.json")
if (mode === "replay") {
  if (await readFile(output, "utf8") !== serialized) throw Error("Offline evaluation replay differs")
  console.log(JSON.stringify({ status: "reproduced", sha256: sha(serialized), plannedUnits: summary.plannedUnits, reviewedPackets: summary.reviewedPackets, providerCalls: 0 }))
} else {
  await writeFile(output, serialized, { flag: "wx" })
  console.log(JSON.stringify({ status: "evaluated", sha256: sha(serialized), plannedUnits: summary.plannedUnits, reviewedPackets: summary.reviewedPackets, primary: summary.primary, groups: Object.fromEntries(Object.entries(groups).map(([id, group]) => [id, { planned: group.planned, completed: group.completed, firstFull: group.firstFull, finalFull: group.finalFull, providerCalls: group.providerCalls }])) }))
}
