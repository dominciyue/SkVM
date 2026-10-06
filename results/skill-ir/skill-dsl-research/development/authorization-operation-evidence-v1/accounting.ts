import path from "node:path"
import { readFile, writeFile, readdir } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import { isDeepStrictEqual } from "node:util"
import { root, json, sha, check } from "./study.ts"
import { sumUsage } from "../authorization-semantic-lowering-v1/accounting.ts"
import { capturedProviderRecords, proofStatus } from "../authorization-focused-closure-v1/accounting.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
type Value = Record<string, any>
const lines = async (file: string) => (await readFile(file, "utf8").catch(error => { if (error.code !== "ENOENT") throw error; return "" })).split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s))
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0
export function originalOperationCount(report: Value): number | null {
  const operations = report.program?.operations ?? report.domain?.program?.operations
  return Array.isArray(operations) ? operations.length : null
}
export function reviewProjection(value: Value): Value | undefined {
  if (["au-independent-source-evaluation/v1", "au-independent-author-evaluation/v1"].includes(value.schemaVersion)) return value
  if (value.schemaVersion === "authorization-au-source-review/v1") return { ...value, artifact: value.report, sha256: value.reportSha256, grade: value.mainAdjudication?.overall }
}
export function queueConclusion(retained: Value, panel: Value[], attempts: Value[], activeCount: number) {
  const completionUnknownAttempts = attempts.filter(a => a.completionUnknown === true).length
  const unresolvedPositions = panel.filter(p => !p.first && !(p.admission?.id === p.id && p.admission.task === p.task && p.status.startsWith("blocked") && p.admission.status === p.status && p.admission.providerCalls === 0 && attempts.some(a => a.artifact === p.admission.cause && a.sha256 === p.admission.causeSha256 && a.row?.task === p.task))).map(p => p.id)
  const finiteQueueComplete = retained.finiteQueueComplete === true && activeCount === 0 && unresolvedPositions.length === 0
  const researchGoalAchieved = finiteQueueComplete && completionUnknownAttempts === 0 && retained.researchGoalAchieved === true
  return { status: finiteQueueComplete ? researchGoalAchieved ? "completed" : "completed-with-unmet-criteria" : "in-progress", finiteQueueComplete, researchGoalAchieved, completionUnknownAttempts, unresolvedPositions }
}
export function measureCapture(records: Value[], retained: Value) {
  const measured = capturedProviderRecords(records)
  if (measured.account.providerCalls !== retained.providerCalls || measured.account.respondedCalls !== retained.respondedCalls || ["input", "output", "cacheRead", "cacheWrite"].some(k => measured.account.knownTokens[k] !== retained.knownTokens?.[k])) throw new Error("Original cumulative telemetry differs from archived ordinary request/response records")
  return measured
}
export function targetExecutions(kind: string, report: Value, review: Value | undefined, reportSha256: string): number | null {
  if (kind === "author") return review?.schemaVersion === "au-independent-author-evaluation/v1" && review.sha256 === reportSha256 && review.targetExecutionAudit?.verified === true && count(review.targetExecutionAudit.targetExecutions) ? review.targetExecutionAudit.targetExecutions : null
  if (count(report.targetExecutions)) return report.targetExecutions
  if (report.targetExecutions === undefined && ["debug", "variation"].includes(kind)) return 0
  return null
}
export function buildPanel(rows: Value[], attempts: Value[], reviews: Value[], admissions: Value[]) {
  for (const review of reviews) {
    const retained = attempts.find(a => a.artifact === review.artifact)
    if (!retained || retained.sha256 !== review.sha256) throw new Error("Independent review is not bound to original report bytes")
  }
  return rows.map(row => {
    const runs = attempts.filter(a => a.id === row.id).sort((a, b) => a.attempt - b.attempt), admission = admissions.filter(a => a.id === row.id).at(-1)
    const view = (a: Value | undefined) => a ? { artifact: a.artifact, sha256: a.sha256, status: a.status, revision: a.revision, model: a.model, account: a.account, checked: a.checked ?? false, bounded: a.bounded ?? false, completionUnknown: a.completionUnknown ?? false, sourceVerification: a.sourceVerification ?? null, review: reviews.find(v => v.artifact === a.artifact && v.sha256 === a.sha256) ?? null } : null
    return { ...row, first: view(runs.find(a => a.attempt === 1)), lastKnown: view(runs.at(-1)), repairs: runs.filter(a => a.attempt > 1).map(a => a.artifact), admission: admission ?? null, status: runs.at(-1)?.status ?? admission?.status ?? "not-dispatched", allAttempts: sumUsage(runs.map(a => a.account)) }
  })
}
export async function collectAccounting() {
  await check()
  const manifest = await json(path.join(root, "manifest.json")), attempts: Value[] = [], calls: Value[] = [], active: Value[] = [], reviews: Value[] = []
  for (const file of (await readdir(path.join(root, "evaluations"))).filter(f => f.endsWith(".json")).sort()) {
    const value = reviewProjection(await json(path.join(root, "evaluations", file)))
    if (value) reviews.push({ ...value, evaluationFile: `evaluations/${file}` })
  }
  for (const id of (await readdir(path.join(root, "runs")).catch(() => [])).sort()) for (const name of (await readdir(path.join(root, "runs", id))).filter(n => /^attempt-\d+$/.test(n)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)))) {
    const directory = path.join(root, "runs", id, name), claim = await json(path.join(directory, "claim.json")), artifact = `runs/${id}/${name}/report.json`, bytes = await readFile(path.join(root, artifact)).catch(error => { if (error.code !== "ENOENT") throw error; return undefined })
    if (!bytes) { active.push({ id, attempt: claim.attempt, startedAt: claim.startedAt, noAutomaticResend: true }); continue }
    const outer = JSON.parse(bytes.toString("utf8")), r = outer.report, digest = sha(bytes), row = manifest.rows.find((p: Value) => p.id === id)
    if (!isDeepStrictEqual(outer.identity, claim) || !row || ["id", "task", "kind", "arm", "variant", "route", "change"].some(k => claim.row[k] !== row[k])) throw new Error("Retained claim/report/registered position identity mismatch")
    let account = r.telemetry ?? {}, requests = r.requests, providerAttempts = r.attempts, measuredRequestBytes: number | null = null
    const capture = r.capture ?? r.conversationCapture
    if (capture?.sourceCaptureFiles?.length) {
      const records: Value[] = [], locations: Value[] = []
      for (const f of capture.sourceCaptureFiles) {
        const file = path.resolve(directory, f.archive), relation = path.relative(directory, file)
        if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) throw new Error("Ordinary capture archive escapes its original attempt")
        const raw = await readFile(file), items = gunzipSync(raw).toString("utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
        locations.push({ capture: path.relative(root, file).split(path.sep).join("/"), captureSha256: sha(raw), firstRecordIndex: records.length, records: items.length }); records.push(...items)
      }
      const measured = measureCapture(records, account); account = measured.account
      for (const c of measured.calls) calls.push({ artifact, artifactSha256: digest, ...c, phase: claim.row.kind === "author" ? "ordinary-author" : "ordinary-entry", captureLocations: locations })
      measuredRequestBytes = records.filter(x => x.type === "request").reduce((n, x) => n + Buffer.byteLength(JSON.stringify(x)), 0)
    } else {
      if ((!requests || !providerAttempts) && r.sessionPath) { const run = await json(path.join(r.sessionPath, "run.json")); requests ??= run.requests; providerAttempts ??= run.attempts }
      if (Array.isArray(providerAttempts)) for (const [i, a] of providerAttempts.entries()) calls.push({ artifact, artifactSha256: digest, call: i + 1, id: a.id, phase: requests?.[i]?.phase ?? a.phase ?? "ordinary", status: a.status, usage: a.response?.tokens ?? a.usage ?? null, actualUSD: a.actualUsd ?? null })
      measuredRequestBytes = Array.isArray(requests) ? requests.reduce((n: number, x: unknown) => n + Buffer.byteLength(JSON.stringify(x)), 0) : null
    }
    const review = reviews.find(v => v.artifact === artifact && v.sha256 === digest), proof = proofStatus(r)
    attempts.push({ id, attempt: claim.attempt, row: claim.row, revision: claim.revision, model: claim.model, budgets: claim.budgets, repairId: claim.repairId, repairOf: claim.repairOf, artifact, sha256: digest, status: r.status, completionUnknown: r.completionUnknown === true || hasUnknownAuthorizationCompletion(r), account, ...proof, sourceVerification: r.sourceVerification ?? null, sourceAccounting: r.sourceAccounting ?? null, acceptedSourceUnits: r.domain?.semantic?.units?.length ?? null, originalOperationCount: originalOperationCount(r), authorCoverage: claim.row.kind === "author" ? review?.authorCoverage ?? "unreviewed" : null, targetExecutions: targetExecutions(claim.row.kind, r, review, digest), observedSerializedRequestBytes: measuredRequestBytes, requestMeasure: "UTF-8 retained request JSON, not HTTP bytes or token count", durationMs: r.durationMs ?? null })
  }
  const admissions = await lines(path.join(root, "admissions.jsonl")), panel = buildPanel(manifest.rows, attempts, reviews, admissions), allAttempts = sumUsage(attempts.map(a => a.account)), byKind: Value = {}
  for (const kind of ["debug", "native", "author", "consumer", "variation", "quality"]) {
    const group = attempts.filter(a => a.row.kind === kind)
    byKind[kind] = { firsts: sumUsage(group.filter(a => a.attempt === 1).map(a => a.account)), repairs: sumUsage(group.filter(a => a.attempt > 1).map(a => a.account)), all: sumUsage(group.map(a => a.account)) }
  }
  const unknownTargets = attempts.filter(a => a.targetExecutions === null).length, retainedStatus = await json(path.join(root, "status.json")), collectedAt = new Date().toISOString()
  const accounting = { schemaVersion: "authorization-au-accounting/v1", collectedAt, registeredPositions: 32, closedAttempts: attempts.length, active, allAttempts, byKind, panel, targetExecutions: unknownTargets ? null : attempts.reduce((n, a) => n + a.targetExecutions, 0), targetExecutionUnknownAttempts: unknownTargets, developerUsage: null, independentAIUsage: null, humanMinutes: null, actualUSD: allAttempts.totalActualUsd, comparisonRule: "Same-task same-model/source/skill/budget/revision firsts only; author declaration and preparation costs included. Firsts/repairs and versions stay separate; source quality is independent of mechanical checks.", costRule: "Original raw conversation is counted once; dollars are never inferred from tokens, developer/scout usage and human time remain unknown." }
  const processActive = retainedStatus.active ?? [], activeIds = new Set([...active, ...processActive].map(a => a.id))
  const summary = { schemaVersion: "authorization-au-summary/v1", collectedAt, ...queueConclusion(retainedStatus, panel, attempts, activeIds.size), conclusions: retainedStatus.conclusions ?? null, registeredPositions: 32, actual: { closedAttempts: attempts.length, activeAttempts: active.length, processActive, dispatchedPositions: panel.filter(p => p.first).length, blockedPositions: panel.filter(p => !p.first && p.status.startsWith("blocked")).length, notDispatchedPositions: panel.filter(p => !p.first && !p.status.startsWith("blocked")).length, knownCalls: allAttempts.knownProviderCalls, knownResponses: allAttempts.knownRespondedCalls }, actualUSD: allAttempts.totalActualUsd, developerUsage: null, independentAIUsage: null, humanMinutes: null, targetExecutions: accounting.targetExecutions }
  await writeFile(path.join(root, "call-index.json"), JSON.stringify({ schemaVersion: "authorization-au-call-index/v1", collectedAt, attempts, calls, active }, null, 2) + "\n")
  await writeFile(path.join(root, "accounting.json"), JSON.stringify(accounting, null, 2) + "\n"); await writeFile(path.join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
  return accounting
}
if (import.meta.main) { const a = await collectAccounting(); console.log(JSON.stringify({ closedAttempts: a.closedAttempts, active: a.active, allAttempts: a.allAttempts, providerCallsThisCommand: 0 }, null, 2)) }
