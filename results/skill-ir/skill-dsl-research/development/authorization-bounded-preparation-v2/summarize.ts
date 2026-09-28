import { readFile } from "node:fs/promises"
import path from "node:path"
import { root, json, hash, save, aggregateUsage } from "./common.ts"

const mode = process.argv[2]
if (!["evaluate", "replay"].includes(mode ?? "")) throw new Error("Usage: bun summarize.ts evaluate|replay (zero provider)")
const plan = await json(path.join(root, "study-plan.json"))
const packing = await json(path.join(root, "packing-summary.json"))
const preparation = await json(path.join(root, "preparation-summary.json"))
const quality = await json(path.join(root, "panel-summary.json"))
const authors = await json(path.join(root, "author-summary.json"))
const use = await json(path.join(root, "author-use-summary.json"))
if (preparation.planned !== 8 || quality.primary.planned !== 40 || use.plannedSessions !== 8 || use.declaredScenarios !== 16 || use.expandedObligations !== 16) throw new Error("Planned denominator changed")
const stages = [
  { stage: "automatic-preparation", ...preparation.usage },
  { stage: "quality-analysis", ...quality.primary.usage },
  { stage: "independent-authoring", ...authors.usage },
  { stage: "fresh-author-consumption", ...use.consumerUsage },
]
const { planned: _stageCount, ...totalUsage } = aggregateUsage(stages)
const summary = {
  schemaVersion: "authorization-ak-summary/v1",
  studyPlanSha256: hash(await readFile(path.join(root, "study-plan.json"))),
  model: plan.model,
  packing: {
    comparison: "Same AJ declared dependency request; zero model calls; not the automatic-route quality contrast",
    maxBytes: packing.maxBytes,
    rows: packing.cases.map((c: any) => ({ id: c.id, versions: c.versions.map((v: any) => ({ version: v.version, status: v.status, bytes: v.bytes, declaredReferenceRanges: v.declaredReferenceCoverage.length, includedReferenceRanges: v.declaredReferenceCoverage.filter((r: any) => r.included).length })) })),
    unrelatedBytes: packing.unrelatedBytes,
  },
  automaticPreparation: {
    planned: preparation.planned, published: preparation.published, unknown: preparation.unknown,
    rows: preparation.rows.map((r: any) => ({ id: r.id, status: r.status, reportStatus: r.reportStatus ?? null, sourceBytes: r.sourceBytes ?? null, declaredReferenceCoverage: r.declaredReferenceCoverage ?? [], gaps: r.gaps ?? [], diagnostics: r.diagnostics ?? [], providerCalls: r.providerCalls })),
    referenceScope: "Exact AJ declared source ranges are a fixed comparison list, not an exhaustive semantic gold; semantic adequacy is separately reviewed on actual material.",
  },
  quality: { primary: quality.primary, groups: quality.groups, paired: quality.paired, sharedRevision: quality.sharedRevision, sensitivity: quality.sensitivity },
  authorUse: {
    plannedSessions: use.plannedSessions, completedSessions: use.completedSessions, declaredScenarios: use.declaredScenarios, expandedObligations: use.expandedObligations,
    firstAuthorValid: authors.firstValid,
    finalValidWithinNormalRevision: authors.rows.filter((r: any) => r.status === "valid" && !r.diagnosticCorrection).length,
    finalAuthorValid: authors.finalValid, normalRevisions: authors.revisions, extraDiagnosticCorrections: authors.diagnosticCorrections,
    protocolDeviation: authors.protocolDeviation, finalAuthorsFaithful: use.finalAuthorsFaithful, fullScenarios: use.fullScenarios,
    changesRequireReview: use.compare.filter((c: any) => c.status === "needs-review").length,
    additionalPreparationJobs: use.sourceReuse.filter((r: any) => r.preparationJob).length,
    additionalPreparationModelCalls: use.sourceReuse.reduce((n: number, r: any) => n + r.modelCalls, 0),
    sourceReuse: use.sourceReuse,
  },
  costs: {
    stages, totalUsage,
    developerAndEvaluatorAgentUsage: "Host usage not exposed; unknown and excluded from provider subtotal",
    humanMinutes: null, transportAttempts: "unknown beyond observed provider dispatches",
    firstAttemptsAndAllRepairsIncluded: true,
  },
  evaluatorIdentity: quality.evaluatorIdentity,
  targetExecutions: 0, providerCallsThisCommand: 0,
  limitations: [
    "Exposed public development tasks, supplied accepted policies and source-file allowlists; no held-out or deployment reliability claim",
    "Automatic preparation failure remains in all planned and paired denominators",
    "Two extra author format corrections exceed the original one-revision protocol and are separately preserved",
    "Candidate-index read budget excludes ordinary input validation and final snapshot filesystem I/O",
    "Actual USD, agent overhead and human time are unknown; no measured time-savings claim",
    "Synthetic Paperless source mutation is a controlled test, not an upstream vulnerability claim",
  ],
}
const file = path.join(root, "summary.json"), bytes = `${JSON.stringify(summary, null, 2)}\n`
if (mode === "replay") { if (await readFile(file, "utf8") !== bytes) throw new Error("Combined summary replay differs") }
else await save(file, summary, true)
process.stdout.write(`${JSON.stringify({ status: mode === "replay" ? "reproduced" : "evaluated", qualityFull: summary.quality.primary.finalFull, authorFull: summary.authorUse.fullScenarios, totalUsage, providerCallsThisCommand: 0 })}\n`)
