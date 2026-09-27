import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const mode = process.argv[2]
if (mode !== "evaluate" && mode !== "replay") throw new Error("Usage: bun evaluate-author-use.ts evaluate|replay")
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex")
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const checkedRef = async (ref: { path: string; sha256: string }) => {
  const bytes = await readFile(path.join(repo, ref.path))
  if (hash(bytes) !== ref.sha256) throw new Error(`Frozen byte mismatch: ${ref.path}`)
}
const sumTokens = (rows: any[]) => rows.reduce((out, row) => {
  for (const key of ["input", "output", "cacheRead", "cacheWrite"])
    out[key] += Number(row[key] ?? 0)
  return out
}, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

const configBytes = await readFile(path.join(root, "author-use-config.json"))
const configSha256 = hash(configBytes)
const config = JSON.parse(configBytes.toString("utf8"))
const reviewBytes = await readFile(path.join(root, "author-use-review.json"))
const reviewSha256 = hash(reviewBytes)
const review = JSON.parse(reviewBytes.toString("utf8"))
const replay = await readJson(path.join(root, "author-use-replay.json"))
const oracleBytes = await readFile(path.join(root, "author-use-oracle.json"))
const oracle = JSON.parse(oracleBytes.toString("utf8"))
if (!config.frozenBeforeConsumerRun || !review.reviewAfterAllEightSessionsClosed || config.units.length !== 8
  || replay.configSha256 !== configSha256 || replay.planned !== 8 || replay.terminal !== 8
  || hash(oracleBytes) !== config.oracleSha256 || review.sessions.length !== 8)
  throw new Error("Author-use freeze, review, or replay mismatch")
for (const ref of [config.brief, ...config.selected, ...config.sources, ...config.implementation]) await checkedRef(ref)
if (hash(await readFile(path.join(root, "author-use-plan.json"))) !== config.planSha256)
  throw new Error("Author-use plan changed")

const rows: any[] = []
for (const unit of config.units) {
  await checkedRef(unit.input)
  if (unit.markdown) await checkedRef(unit.markdown)
  const stored = await readJson(path.join(root, "author-use-runs", unit.id, "unit.json"))
  const replayRow = replay.rows.find((item: any) => item.id === unit.id)
  const score = review.sessions.find((item: any) => item.id === unit.id)
  if (stored.configSha256 !== configSha256 || stored.unit.id !== unit.id || stored.report.status !== "completed"
    || replayRow?.status !== "completed" || replayRow.inspectedStatus !== "completed"
    || score?.rating !== "full" || score.declaredScenarios !== unit.scenarios.length)
    throw new Error(`Author-use run/review mismatch: ${unit.id}`)
  const report = stored.report
  const judgments: any[] = []
  for (const scenario of unit.scenarios) {
    const matches = report.observedDecisions.filter((decision: any) => decision.obligationId.startsWith(`scenario%3A${scenario}::`))
    const expected = oracle.packages[unit.packageId]?.[unit.phase]?.[scenario]
    if (!expected || !matches.length || score.scenarios[scenario] !== "full")
      throw new Error(`Missing scenario/oracle ${unit.id}/${scenario}`)
    const declared = matches[0]
    if (declared.expectation !== expected.expectation || declared.observed !== expected.observed
      || declared.derivedConclusion !== expected.conclusion)
      throw new Error(`Declared scenario differs from frozen oracle: ${unit.id}/${scenario}`)
    judgments.push({ scenario, obligationId: declared.obligationId, ...expected, rating: score.scenarios[scenario] })
  }
  if (report.observedDecisions.length !== score.expandedObligations || report.telemetry.unknownUsageCalls !== 0)
    throw new Error(`Expanded obligations or usage mismatch: ${unit.id}`)
  let comparison: any = null
  if (unit.phase === "changed") {
    const post = await readJson(path.join(root, "author-use-runs", unit.id, "post-run.json"))
    comparison = post.comparison
    if (post.inspected.status !== "completed" || comparison?.status !== "needs-review"
      || comparison.semanticRevalidation !== "not-performed" || comparison.providerCalls !== 0
      || comparison.applicabilityOnly !== true)
      throw new Error(`Changed comparison mismatch: ${unit.id}`)
  }
  rows.push({ id: unit.id, packageId: unit.packageId, phase: unit.phase, representation: unit.representation,
    status: report.status, finalKind: report.finalKind, declaredScenarios: judgments, expandedObligations: score.expandedObligations,
    providerCalls: report.telemetry.providerCalls, knownTokens: report.telemetry.knownTokens,
    tokensStatus: report.telemetry.tokensStatus, actualUsdStatus: report.telemetry.actualUsdStatus,
    totalActualUsd: report.telemetry.totalActualUsd,
    comparison: comparison ? { status: comparison.status, semanticRevalidation: comparison.semanticRevalidation,
      providerCalls: comparison.providerCalls, affectedScenarioIds: comparison.affectedScenarioIds } : null })
}

const attemptsDir = path.join(root, "author-attempts", "use")
const attemptFiles = (await readdir(attemptsDir)).filter(name => name.endsWith(".json") && !name.endsWith(".claim.json"))
const attempts = await Promise.all(attemptFiles.map(name => readJson(path.join(attemptsDir, name))))
const initialIds = new Set(config.units.map((unit: any) => unit.id))
const revisions = attempts.filter(item => item.attemptNumber === 2)
const firstAttempts = attempts.filter(item => item.attemptNumber === undefined)
if (attempts.length !== 10 || attempts.some(item => item.status !== "completed" || !item.response?.tokens || !initialIds.has(item.id))
  || initialIds.size !== 8 || firstAttempts.length !== 8 || new Set(firstAttempts.map(item => item.id)).size !== 8
  || revisions.length !== 2 || new Set(revisions.map(item => item.id)).size !== 2
  || revisions.some(item => !["memos-space-policy-dsl-changed", "paperless-note-relation-markdown-changed"].includes(item.id))
  || review.authorDeliveries.diagnosticRevisions !== 2)
  throw new Error("Author attempts differ from eight first deliveries and two recorded revisions")
const authorTokens = sumTokens(attempts.map(item => item.response.tokens))
const consumerTokens = sumTokens(rows.map(item => item.knownTokens))
const byRepresentation = Object.fromEntries(["markdown", "dsl"].map(representation => {
  const authorRows = attempts.filter(item => config.units.find((unit: any) => unit.id === item.id)?.representation === representation)
  const consumerRows = rows.filter(item => item.representation === representation)
  return [representation, { authorProviderCalls: authorRows.length, authorKnownTokens: sumTokens(authorRows.map(item => item.response.tokens)),
    consumerSessions: consumerRows.length, consumerProviderCalls: consumerRows.reduce((sum, row) => sum + row.providerCalls, 0),
    consumerKnownTokens: sumTokens(consumerRows.map(row => row.knownTokens)),
    declaredScenarios: consumerRows.reduce((sum, row) => sum + row.declaredScenarios.length, 0),
    expandedObligations: consumerRows.reduce((sum, row) => sum + row.expandedObligations, 0) }]
}))
const summary = { schemaVersion: "authorization-aj-author-use-summary/v1", configSha256, reviewSha256,
  planSha256: config.planSha256, oracleSha256: config.oracleSha256,
  author: { plannedDeliveries: review.authorDeliveries.planned,
    firstAttemptSemanticallyValid: review.authorDeliveries.firstAttemptSemanticallyValid,
    finalSemanticallyValid: review.authorDeliveries.finalSemanticallyValid,
    diagnosticRevisions: review.authorDeliveries.diagnosticRevisions,
    providerCalls: attempts.length, knownTokens: authorTokens, actualUsdStatus: "unknown", totalActualUsd: null,
    humanMinutes: review.humanMinutes },
  consumer: { sessions: rows.length, completed: rows.filter(row => row.status === "completed").length,
    fullSessions: rows.filter(row => row.declaredScenarios.every((item: any) => item.rating === "full")).length,
    declaredScenarios: rows.reduce((sum, row) => sum + row.declaredScenarios.length, 0),
    oracleMatchedScenarios: rows.reduce((sum, row) => sum + row.declaredScenarios.length, 0),
    expandedObligations: rows.reduce((sum, row) => sum + row.expandedObligations, 0),
    providerCalls: rows.reduce((sum, row) => sum + row.providerCalls, 0), knownTokens: consumerTokens,
    actualUsdStatus: rows.every(row => row.actualUsdStatus === "complete") ? "complete" : "unknown",
    totalActualUsd: rows.every(row => row.actualUsdStatus === "complete") ? rows.reduce((sum, row) => sum + Number(row.totalActualUsd), 0) : null,
    targetExecutions: 0 },
  byRepresentation,
  comparisons: { total: rows.filter(row => row.comparison).length,
    applicabilityNeedsReview: rows.filter(row => row.comparison?.status === "needs-review").length,
    providerCalls: rows.reduce((sum, row) => sum + Number(row.comparison?.providerCalls ?? 0), 0),
    freshChangedSessions: rows.filter(row => row.phase === "changed" && row.status === "completed").length },
  rows,
  limitations: ["Public development packages, not held-out.", "No target or deployment was executed.",
    "Paperless DSL authoring introduced three extra helper entries, expanding two scenarios to eight obligations in each original and changed run.",
    "Comparisons are applicability-only; the four changed inputs were separately consumed in fresh sessions.",
    "Actual USD and human minutes were not reported; null means unknown."] }
if (summary.consumer.declaredScenarios !== 16 || summary.consumer.expandedObligations !== 28
  || summary.comparisons.total !== 4 || summary.comparisons.freshChangedSessions !== 4)
  throw new Error("Author-use aggregate differs from registered scope")
const serialized = `${JSON.stringify(summary, null, 2)}\n`
const output = path.join(root, "author-use-summary.json")
if (mode === "replay") {
  if (await readFile(output, "utf8") !== serialized) throw new Error("Offline author-use replay differs")
  process.stdout.write(`${JSON.stringify({ status: "reproduced", sha256: hash(serialized), providerCallsThisCommand: 0 })}\n`)
} else {
  await writeFile(output, serialized, { flag: "wx" })
  process.stdout.write(`${JSON.stringify({ status: "evaluated", sha256: hash(serialized), author: summary.author,
    consumer: summary.consumer, comparisons: summary.comparisons })}\n`)
}
