import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const mode = process.argv[2]
if (mode !== "evaluate" && mode !== "replay") throw Error("Usage: bun evaluate-use.ts evaluate|replay")
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const configBytes = await readFile(path.join(root, "author-use-config.json"), "utf8")
const config = JSON.parse(configBytes)
const configSha256 = hash(configBytes)
const rubricBytes = await readFile(path.join(repo, config.rubric.path))
if (hash(rubricBytes) !== config.rubric.sha256) throw Error("Frozen author-use rubric changed")
const rubric = JSON.parse(rubricBytes.toString("utf8"))
const reviewBytes = await readFile(path.join(root, "author-use-reviews.json"))
const reviews = JSON.parse(reviewBytes.toString("utf8"))
const reviewMap = new Map(reviews.rows.map((row: any) => [`${row.unitId}/${row.scenarioKey}`, row]))
const plannedReviews = config.units.reduce((sum: number, unit: any) => sum + unit.scenarios.length, 0)
if (reviews.rows.length !== plannedReviews || reviewMap.size !== plannedReviews) throw Error("Independent review cardinality or identity mismatch")
for (const review of reviews.rows) {
  const verdicts = [review.currentDecision, review.necessaryControl, review.policyComparison, review.boundary]
  if (verdicts.some(verdict => !["correct", "incorrect", "unknown"].includes(verdict)) ||
    (review.full === true && verdicts.some(verdict => verdict !== "correct"))) throw Error(`Inconsistent semantic review ${review.unitId}/${review.scenarioKey}`)
}
const author = await readJson(path.join(root, "author-use-account.json"))
const tokenTotal = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
const analysisTokens = tokenTotal()
const rows: any[] = []
let providerCalls = 0, respondedCalls = 0, unknownUsageCalls = 0, knownDurationMs = 0, unknownDurationCalls = 0
for (const unit of config.units) {
  const out = path.join(root, "author-use-runs", unit.id)
  const claim = await readJson(path.join(out, "claim.json"))
  const stored = await readJson(path.join(out, "unit.json"))
  if (claim.configSha256 !== configSha256 || stored.configSha256 !== configSha256 || stored.unit.id !== unit.id) throw Error(`Use unit identity changed ${unit.id}`)
  const report = stored.report
  const session = path.join(out, "sessions", report.sessionId)
  const run = await readJson(path.join(session, "run.json"))
  const attempts = run.attempts ?? []
  knownDurationMs += attempts.reduce((sum: number, attempt: any) => sum + (attempt.response?.durationMs ?? 0), 0)
  unknownDurationCalls += attempts.filter((attempt: any) => !attempt.response).length
  const telemetry = report.telemetry ?? {}
  providerCalls += telemetry.providerCalls ?? 0
  respondedCalls += telemetry.respondedCalls ?? 0
  unknownUsageCalls += telemetry.unknownUsageCalls ?? 0
  for (const key of Object.keys(analysisTokens) as Array<keyof typeof analysisTokens>) analysisTokens[key] += telemetry.knownTokens?.[key] ?? 0
  const authored = await readJson(path.join(repo, unit.input.path))
  const sourceRows = report.canonicalResult?.results ?? []
  const wireRows = report.wireResult?.results ?? []
  const scenarioRows = []
  for (const scenarioKey of unit.scenarios) {
    const encoded = encodeURIComponent(`scenario:${scenarioKey}`)
    const canonical = sourceRows.find((row: any) => row.obligationId.startsWith(`${encoded}::`))
    const wire = wireRows.find((row: any) => row.obligationId.startsWith(`${encoded}::`))
    const rubricKey = unit.packageId === "gitea-relation-change" && unit.phase === "changed" && scenarioKey === "nonadmin-self" ? "nonadmin-other" : scenarioKey
    const expected = rubric.expected[unit.packageId][unit.phase][rubricKey]
    if (!expected) throw Error(`No frozen criterion: ${unit.id}/${scenarioKey}`)
    const review = reviewMap.get(`${unit.id}/${scenarioKey}`) as any
    if (report.status === "completed" && !review) throw Error(`Completed answer lacks independent review ${unit.id}/${scenarioKey}`)
    const authoredExpectation = authored.scenarios[scenarioKey]?.expectation ?? null
    const observed = wire?.decision?.kind === "observed" ? wire.decision.observed : null
    const derivedConclusion = canonical?.conclusion ?? null
    const objective = { authoredPolicyMatchesBrief: authoredExpectation === expected.policy, observedMatchesSource: observed === expected.observed,
      derivedConclusionMatchesBrief: derivedConclusion === expected.conclusion, branchCount: wire?.branchResults?.length ?? null }
    const full = report.status === "completed" && Object.values(objective).slice(0, 3).every(Boolean) && review?.full === true
    scenarioRows.push({ scenarioKey, rubricKey, expected, authoredExpectation, observed, derivedConclusion, objective, review: review ?? null, full })
  }
  let postRun: any = null
  try { postRun = await readJson(path.join(out, "post-run.json")) } catch { /* inspect/compare can be rerun offline */ }
  rows.push({ ...unit, status: report.status, sessionId: report.sessionId, finalKind: report.finalKind ?? null,
    providerCalls: telemetry.providerCalls ?? null, respondedCalls: telemetry.respondedCalls ?? null, unknownUsageCalls: telemetry.unknownUsageCalls ?? null,
    knownTokens: telemetry.knownTokens ?? null, actualUsdStatus: telemetry.actualUsdStatus ?? "unknown", totalActualUsd: telemetry.totalActualUsd ?? null,
    firstResponseDelivery: run.firstResponse?.deliveryComplete ?? null, inspection: postRun?.inspected ?? null,
    comparison: postRun?.comparison ?? null, scenarios: scenarioRows })
}
const aggregate = (items: any[]) => ({ sessions: items.length, completedSessions: items.filter(row => row.status === "completed").length,
  answeredScenarios: items.flatMap(row => row.scenarios).filter((row: any) => row.review !== null).length,
  fullScenarios: items.flatMap(row => row.scenarios).filter((row: any) => row.full).length,
  providerCalls: items.reduce((sum, row) => sum + (row.providerCalls ?? 0), 0) })
const byRepresentation = Object.fromEntries(["markdown", "dsl"].map(name => [name, aggregate(rows.filter(row => row.representation === name))]))
const byPhase = Object.fromEntries(["original", "changed"].map(name => [name, aggregate(rows.filter(row => row.phase === name))]))
const totalKnownTokens = Object.fromEntries((Object.keys(analysisTokens) as Array<keyof typeof analysisTokens>).map(key => [key, analysisTokens[key] + author.knownTokens[key]]))
const summary = { schemaVersion: "authorization-ai-author-use-summary/v1", configSha256, rubricSha256: hash(rubricBytes), reviewSha256: hash(reviewBytes),
  plannedSessions: config.units.length, plannedScenarios: config.units.reduce((sum: number, unit: any) => sum + unit.scenarios.length, 0),
  actual: aggregate(rows), byRepresentation, byPhase,
  analysisAccount: { providerCalls, respondedCalls, unknownUsageCalls, knownTokens: analysisTokens, knownDurationMs, unknownDurationCalls,
    actualUsd: null, actualUsdStatus: "unknown", targetExecutions: 0, automaticResends: 0 },
  authorAccount: { outerRequests: author.attempts, respondedOuterRequests: author.respondedOuterRequests, failedOuterRequestsWithUnknownUsage: author.failedOuterRequestsWithUnknownUsage,
    knownTokens: author.knownTokens, firstAttemptAuthorValid: author.firstAttemptAuthorValid, finalAuthorValid: author.finalAuthorValid,
    machineRecoveredForConsumption: author.machineRecoveredForConsumption, actualUsdStatus: "unknown", humanMinutes: "unknown" },
  combinedKnownTokens: totalKnownTokens, combinedActualUsd: null, humanMinutes: "unknown",
  notes: ["Two scenarios share each fresh session; the planned sixteen scenario answers use eight provider sessions.",
    "The Gitea structured changed input is a one-character syntax recovery after an unsuccessful diagnostic repair, never counted as author success.",
    "The Gitea structured changed author also changed taskId and the first scenario key; rubric mapping follows the self-query relation without hiding that edit spread.",
    "A structural host success and citation presence do not prove the source semantics; independent review is required for each completed scenario.",
    "Unknown provider usage and actual USD are not zero. No target was executed, and no human time saving was measured."], rows }
const serialized = `${JSON.stringify(summary, null, 2)}\n`
const output = path.join(root, "author-use-summary.json")
if (mode === "replay") {
  if (await readFile(output, "utf8") !== serialized) throw Error("Author-use replay differs")
  console.log(JSON.stringify({ status: "reproduced", sha256: hash(serialized), providerCalls: 0, scenarios: summary.plannedScenarios }))
} else {
  await writeFile(output, serialized, { flag: "wx" })
  console.log(JSON.stringify({ status: "evaluated", sha256: hash(serialized), actual: summary.actual, byRepresentation, byPhase,
    analysisAccount: summary.analysisAccount, combinedKnownTokens: summary.combinedKnownTokens }))
}
