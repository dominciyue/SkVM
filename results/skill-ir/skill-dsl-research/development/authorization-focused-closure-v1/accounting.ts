import path from "node:path"
import { readFile, readdir, writeFile } from "node:fs/promises"
import { root, sha } from "./prepare.ts"
import { sumUsage } from "../authorization-semantic-lowering-v1/accounting.ts"
import { hasUnknownAuthorizationCompletion } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"

type RecordValue = Record<string, any>
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const lines = async (file: string) => (await readFile(file, "utf8").catch(() => "")).split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s))
export function makePanel(manifest: RecordValue, attempts: RecordValue[], reviews: RecordValue[], admissions: RecordValue[]) {
  for (const review of reviews) {
    const retained = attempts.find(a => a.originalArtifact === review.report)
    if (!retained || retained.originalArtifactSha256 !== review.reportSha256) throw new Error("Source review hash does not match retained report: " + review.row)
  }
  const rows = [...manifest.rows, ...(manifest.authors ?? []).flatMap((a: RecordValue) => [{ ...a, kind: "author" }, { ...a, id: "consume-" + a.id, kind: "authored-consume" }])]
  return rows.map(row => {
    const runs = attempts.filter(a => a.id === row.id).sort((a, b) => a.attempt - b.attempt)
    const view = (a: RecordValue | undefined) => a ? { artifact: a.originalArtifact, artifactSha256: a.originalArtifactSha256, status: a.originalStatus, revision: a.revision, account: a.account, checked: a.checked, bounded: a.bounded, completionUnknown: a.completionUnknown, sourceVerification: a.sourceVerification, sourceReview: reviews.find(v => v.report === a.originalArtifact && v.reportSha256 === a.originalArtifactSha256) ?? null } : null
    const admission = admissions.filter(a => a.id === row.id || a.row === row.id).at(-1)
    return { id: row.id, task: row.task, kind: row.kind, studyArm: row.studyArm, first: view(runs.find(a => a.attempt === 1)), lastKnown: view(runs.at(-1)), repairs: runs.filter(a => a.attempt > 1).map(a => a.originalArtifact), admission: admission ?? row.admission ?? null, status: runs.at(-1)?.originalStatus ?? admission?.status ?? "not-run", allAttempts: sumUsage(runs.map(a => a.account)) }
  })
}
export async function collectAccounting() {
  const manifest = await json(path.join(root, "manifest.json")), attempts: RecordValue[] = [], active: RecordValue[] = [], calls: RecordValue[] = []
  for (const id of (await readdir(path.join(root, "runs"))).sort()) {
    for (const name of (await readdir(path.join(root, "runs", id))).filter(n => /^attempt-\d+$/.test(n)).sort((a, b) => Number(a.slice(8)) - Number(b.slice(8)))) {
      const directory = path.join(root, "runs", id, name), claim = await json(path.join(directory, "claim.json")), relative = `runs/${id}/${name}/report.json`, bytes = await readFile(path.join(root, relative)).catch(() => undefined)
      if (!bytes) { active.push({ id, attempt: claim.attempt, startedAt: claim.startedAt, noAutomaticResend: true }); continue }
      const r = JSON.parse(bytes.toString("utf8")).report, account = r.telemetry ?? {}
      let requests = r.requests, providerAttempts = r.attempts
      if ((!requests || !providerAttempts) && r.sessionPath) {
        const run = await json(path.join(r.sessionPath, "run.json"))
        requests ??= run.requests; providerAttempts ??= run.attempts
      }
      const checked = r.validation?.valid === true && !!r.result && !hasUnknownAuthorizationCompletion(r) && r.sourceVerification?.valid !== false
      const questionChecks = r.validation?.questionChecks
      const bounded = checked && (Array.isArray(questionChecks) && questionChecks.length > 0 ? questionChecks.every((q: RecordValue) => q.evidenceCoverage === "bounded") : r.domain?.check?.evidenceCoverage === "bounded")
      attempts.push({ id, attempt: claim.attempt, row: claim.row, revision: claim.revision, model: claim.model, budgets: claim.budgets, repairId: claim.repairId, repairOf: claim.repairOf, originalArtifact: relative, originalArtifactSha256: sha(bytes), originalStatus: r.status, completionUnknown: hasUnknownAuthorizationCompletion(r), account, sourceAccounting: r.sourceAccounting ?? null, sourceVerification: r.sourceVerification ?? null, checked, bounded, acceptedUnits: r.domain?.semantic?.units?.length ?? null, observedSerializedRequestBytes: Array.isArray(requests) ? requests.reduce((n: number, x: unknown) => n + Buffer.byteLength(JSON.stringify(x)), 0) : null, requestMeasure: "UTF-8 retained JSON; not HTTP bytes or token count", targetExecutions: r.targetExecutions ?? 0 })
      if (Array.isArray(providerAttempts)) for (const [index, a] of providerAttempts.entries()) calls.push({ artifact: relative, artifactSha256: sha(bytes), call: index + 1, id: a.id, phase: requests?.[index]?.phase ?? "ordinary", status: a.status, usage: a.response?.tokens ?? a.usage ?? null, actualUSD: a.actualUsd ?? null })
    }
  }
  const reviews: RecordValue[] = []
  for (const name of (await readdir(path.join(root, "evaluations"))).filter(n => n.endsWith(".json")).sort()) {
    const value = await json(path.join(root, "evaluations", name))
    if (value.schemaVersion === "authorization-at-source-reviews/v1") reviews.push(...value.rows)
  }
  const admissions = await lines(path.join(root, "admissions.jsonl")), panel = makePanel(manifest, attempts, reviews, admissions)
  const quality = attempts.filter(a => a.row.kind === "quality"), native = attempts.filter(a => a.row.kind === "native"), authors = attempts.filter(a => a.row.kind === "author"), consumers = attempts.filter(a => a.row.kind === "authored-consume")
  const authorWorkload = []
  for (const a of authors) {
    const directory = path.dirname(path.join(root, a.originalArtifact)), input = await json(path.join(directory, "authored-inquiry.json"))
    authorWorkload.push({ id: a.id, attempt: a.attempt, questions: input.inquiry.questions.length, premises: input.inquiry.questions.reduce((n: number, q: RecordValue) => n + q.premises.length, 0), inputSha256: sha(await readFile(path.join(directory, "authored-inquiry.json"))), usageSha256: sha(await readFile(path.join(directory, "authored-USAGE.md"))), modelCalls: a.account.providerCalls ?? null, humanMinutes: null, authoringIsAnalysisCompletion: false })
  }
  const allAttempts = sumUsage(attempts.map(a => a.account))
  const accounting = { schemaVersion: "authorization-at-accounting/v1", collectedAt: new Date().toISOString(), registered: manifest.denominators, closedAttempts: attempts.length, active, allAttempts, primaryQualityFirsts: sumUsage(quality.filter(a => a.attempt === 1).map(a => a.account)), qualityRepairs: sumUsage(quality.filter(a => a.attempt > 1).map(a => a.account)), debug: sumUsage(attempts.filter(a => a.row.kind === "debug").map(a => a.account)), native: sumUsage(native.map(a => a.account)), authoring: sumUsage(authors.map(a => a.account)), exactAuthorConsumers: sumUsage(consumers.map(a => a.account)), authorWorkload, panel, developerUsage: null, humanMinutes: null, targetExecutions: attempts.reduce((n, a) => n + a.targetExecutions, 0), costs: "Fresh input/cache reads and firsts/repairs separate; actual USD is not inferred from tokens. Missing usage, dollars, developer and human time remain unknown.", comparison: "Descriptive same-task firsts only when model, budget, source and implementation revision agree; repaired or historical versions cannot establish a causal gain." }
  const primary = panel.filter(p => ["quality", "native", "variation", "source-change"].includes(p.kind))
  const summary = { schemaVersion: "authorization-at-summary/v1", collectedAt: accounting.collectedAt, status: "in-progress", registered: manifest.denominators, actual: { closedAttempts: attempts.length, active: active.length, knownCalls: allAttempts.knownProviderCalls, knownResponses: allAttempts.knownRespondedCalls, primaryRunPositions: primary.filter(p => p.first).length, primaryBlockedPositions: primary.filter(p => !p.first && p.status.startsWith("blocked")).length }, primary: primary.map(p => ({ id: p.id, kind: p.kind, status: p.status, firstSourceGrade: p.first?.sourceReview?.grade ?? null, lastSourceGrade: p.lastKnown?.sourceReview?.grade ?? null, checked: p.lastKnown?.checked ?? false, bounded: p.lastKnown?.bounded ?? false, completionUnknown: p.lastKnown?.completionUnknown ?? false })), unmetCriteria: ["Persistent source interpretations do not yet establish full checked authorization closure across tasks.", "Policy/premise reuse requires full source adequacy and known checked/bounded current base.", "No qualified same-version quality/cost improvement is established."], actualUSD: allAttempts.totalActualUsd, developerUsage: null, humanMinutes: null, targetExecutions: accounting.targetExecutions }
  await writeFile(path.join(root, "call-index.json"), JSON.stringify({ schemaVersion: "authorization-at-call-index/v1", attempts, calls, active }, null, 2) + "\n")
  await writeFile(path.join(root, "accounting.json"), JSON.stringify(accounting, null, 2) + "\n")
  await writeFile(path.join(root, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
  return accounting
}
if (import.meta.main) {
  const a = await collectAccounting()
  console.log(JSON.stringify({ closedAttempts: a.closedAttempts, active: a.active, allAttempts: a.allAttempts, providerCallsThisCommand: 0 }))
}
