import { readFile } from "node:fs/promises"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { root, absolute, exists, json, save, aggregateUsage, verifyStudy, hash } from "./common.ts"

const plan = await verifyStudy(), state = await json(path.join(root, "status.json"))
const categories: Record<string, any[]> = {}
for (const row of state.paidRows) {
  const phase = row.id.startsWith("quality-revision:") ? "revision-analysis" : row.id.startsWith("author-prepare:") ? "author-shared-preparation" : row.id.split(":")[0]
  ;(categories[phase] ??= []).push(row)
}
const byPhase = Object.fromEntries(Object.entries(categories).map(([phase, rows]) => [phase, { recordedRows: rows.length, ...aggregateUsage(rows.map(r => r.account)) }]))
const preparation = []
for (const c of plan.cases.filter((c: any) => c.primary)) {
  const dir = path.join(root, "inputs", c.id, "callable-v1"), jobFile = path.join(root, "preparation-jobs", c.id, "job.json")
  if (!await exists(jobFile)) { preparation.push({ id: c.id, status: "not-dispatched-or-unknown" }); continue }
  const job = await json(jobFile), published = await exists(path.join(dir, "assessment.json"))
  const sources = []
  if (published) for (const s of job.report.included) { const bytes = await readFile(path.join(dir, "source", s.path)); sources.push({ path: s.path, snapshotBytes: bytes.length, sha256: hash(bytes), segments: s.segments }) }
  preparation.push({ id: c.id, status: job.report?.status, published, sources,
    snapshotBytes: sources.reduce((n, s) => n + s.snapshotBytes, 0), rawSourceBytes: (await Promise.all(c.sourceFiles.map(async (b: any) => (await readFile(absolute(b))).length))).reduce((n: number, b: number) => n + b, 0),
    hostContextRanges: job.report?.controlContext?.expansions, units: job.report?.controlContext?.units, gaps: job.report?.gaps,
    sourceDisplay: job.report?.proposal?.account?.sourceDisplay ?? null, sharedConsumersPlanned: 2, paidAccount: state.paidRows.find((r: any) => r.id === "prepare:" + c.id)?.account })
}
const inherited = [], comparisons = [], authorPreparation = []
const briefs = await json(absolute(plan.authorBriefs))
for (const b of briefs.packages) {
  const shared = path.join(root, "author-material", b.id, "prepared"), reportFile = path.join(shared, "report.json")
  if (!await exists(reportFile)) continue
  const report = await json(reportFile), sources = []
  for (const s of report.included) { const bytes = await readFile(path.join(shared, "source", s.path)); sources.push({ path: s.path, bytes: bytes.length, sha256: hash(bytes) }) }
  const consumed = []
  for (const u of plan.consumers.filter((u: any) => u.packageId === b.id)) {
    const dir = path.join(root, "consumers", u.id), f = path.join(dir, "material", "report.json")
    if (!await exists(f)) { inherited.push({ id: u.id, status: "blocked-or-not-yet-consumed" }); continue }
    const after = await json(f)
    if (!isDeepStrictEqual(report.gaps, after.gaps) || !isDeepStrictEqual(report.included, after.included) || !isDeepStrictEqual(report.materialBinding, after.materialBinding)) throw new Error("Reused source/gaps changed " + u.id)
    for (const s of sources) if (hash(await readFile(path.join(dir, "material", "source", s.path))) !== s.sha256) throw new Error("Reused snapshot bytes changed " + u.id)
    inherited.push({ id: u.id, status: "verified", sameSource: true, sameRanges: true, sameMaterialBinding: true, pendingGapIds: after.gaps.map((g: any) => g.id), requiresAnalysis: true })
    const use = await json(path.join(dir, "report.json")); if (use.status === "completed") consumed.push(u.id)
    if (await exists(path.join(dir, "compare.json"))) {
      const cmp = await json(path.join(dir, "compare.json")); comparisons.push({ id: u.id, exitCode: cmp.exitCode, status: cmp.report?.status, changed: cmp.report?.changed, sourceChanged: cmp.report?.sourceChanged, diagnostics: cmp.errors })
    }
  }
  const account = state.paidRows.find((r: any) => r.id === "author-prepare:" + b.id)?.account
  authorPreparation.push({ packageId: b.id, status: report.status, sources, snapshotBytes: sources.reduce((n, s) => n + s.bytes, 0), pendingGapIds: report.gaps.map((g: any) => g.id), plannedConsumers: 4, completedConsumers: consumed,
    preparationUsage: account, amortization: { divisor: consumed.length, completePromptPerCompletedUse: consumed.length && !account?.unknownUsageCalls ? (account.knownTokens.input + account.knownTokens.cacheRead + account.knownTokens.cacheWrite) / consumed.length : null }, unusedPreparationCostRetained: true })
}
const result = { schemaVersion: "authorization-am-cost-and-reuse/v1", byPhase, allPaid: aggregateUsage(state.paidRows.map((r: any) => r.account)), preparation, authorPreparation, inherited, comparisons,
  planned: { preparation: 4, quality: 16, revision: 4, authors: 8, consumers: 8, obligations: 16 },
  authorHostRoles: { generatedKnownMetadataFields: ["taskId", "request", "repository", "sourceRef", "sourceRoot", "sources", "entries"], hostInferredDomainFacts: 0, dslOutputStillCopiesKnownMetadata: true, markdownHostScaffoldUsesExplicitPublicBriefOnly: true },
  billing: { actualUsd: null, estimatesUsedAsMeasuredCost: false, humanMinutes: null, developerAndReviewerHostUsage: "not exposed", hiddenTransportRetries: "unknown" }, providerCallsThisCommand: 0, targetExecutions: 0 }
await save(path.join(root, "cost-and-reuse-summary.json"), result)
console.log(JSON.stringify({ byPhase, allPaid: result.allPaid, inherited: inherited.map(r => ({ id: r.id, status: r.status })), comparisons, providerCallsThisCommand: 0 }))
