import path from "node:path"
import { readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import { replay, root, type Row } from "./study.ts"

const Reference = z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const Binding = z.object({ rowId: z.string().min(1), attempt: z.number().int().positive(), report: Reference }).strict()
const Rating = z.object({ rating: z.enum(["full", "partial", "incorrect", "not-delivered"]), decisiveError: z.boolean(), overUnknown: z.boolean(), falseComplete: z.boolean(), evidence: z.array(z.string().min(1)).min(1) }).strict()
export const AssessmentSchema = z.object({
  initial: Rating, final: Rating,
  extraction: z.object({ initial: z.enum(["supported", "partial", "incorrect", "none"]), final: z.enum(["supported", "partial", "incorrect", "none"]), incorrectRules: z.array(z.string()), wrongPremiseMappings: z.array(z.string()), amplifiedError: z.boolean(), evidence: z.array(z.string().min(1)).min(1) }).strict(),
  mechanism: z.object({ decisiveHelperHits: z.array(z.string()), irrelevantOrInvalidReads: z.array(z.string()), correctExcludedBranches: z.array(z.string()), wrongExcludedBranches: z.array(z.string()), justifiedResiduals: z.array(z.string()), avoidableResiduals: z.array(z.string()), checkerDetections: z.array(z.string()), checkerFalseRejections: z.array(z.string()), checkerMisses: z.array(z.string()), evidence: z.array(z.string().min(1)).min(1) }).strict(),
  causes: z.array(z.enum(["not-located", "not-read", "extraction-error", "expression-limit", "scheduler-priority", "premise-branch", "policy-comparison", "checker-missed", "protocol", "infrastructure"])), notes: z.string(),
}).strict()
export const SemanticReviewSchema = z.object({ schemaVersion: z.literal("authorization-ar-semantic-review/v1"), id: z.string().min(1), binding: Binding, reviewer: z.object({ kind: z.literal("independent"), mainContextExposed: z.boolean(), representationMayRevealMethod: z.boolean() }).strict(), assessment: AssessmentSchema }).strict()
export const SemanticAdjudicationSchema = z.object({ schemaVersion: z.literal("authorization-ar-semantic-adjudication/v1"), id: z.string().min(1), binding: Binding, independentReview: Reference, assessment: AssessmentSchema, rationale: z.string().min(1), evidence: z.array(z.string().min(1)).min(1) }).strict()
type Review = z.infer<typeof SemanticReviewSchema>
type Adjudication = z.infer<typeof SemanticAdjudicationSchema>
export type Assessment = z.infer<typeof AssessmentSchema>
type Attempt = { attempt: number; artifact: z.infer<typeof Reference> | null; identity: any; status: string; hostValidation: boolean | null; semanticStatus: "unreviewed" | "reviewed" | "adjudicated"; independentReview: Review | null; developerAdjudication: Adjudication | null; assessment: Assessment | null; comparisonIdentity: unknown }
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const key = (binding: { rowId: string; attempt: number }) => `${binding.rowId}/attempt-${binding.attempt}`
const SourceFiles = z.array(z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() })).min(1)
/** Compare retained production identities, never the current bytes of an old input or source tree. */
function comparisonIdentity(identity: any, report: any) {
  const source = SourceFiles.safeParse(report.sourceFiles)
  if (!source.success || !/^[a-f0-9]{64}$/.test(report.inputSha256 ?? "") || !identity.revision || !identity.model || !identity.budgets) return null
  return { task: identity.row.task, inputSha256: report.inputSha256, sourceFiles: source.data.sort((a, b) => a.path.localeCompare(b.path)), revision: identity.revision, model: identity.model, budgets: identity.budgets }
}
async function records<T>(base: string, directory: string, schema: z.ZodType<T>) {
  const output: Array<{ reference: z.infer<typeof Reference>; record: T }> = []
  for (const name of (await readdir(path.join(base, directory)).catch(() => [])).filter(n => n.endsWith(".json")).sort()) {
    const relative = `${directory}/${name}`, bytes = await readFile(path.join(base, relative))
    output.push({ reference: { path: relative, sha256: hash(bytes) }, record: schema.parse(JSON.parse(bytes.toString("utf8"))) })
  }
  return output
}
function summarize(rows: Array<{ attempts: Attempt[] }>) {
  const first = rows.flatMap(r => r.attempts.filter(a => a.attempt === 1)), reviewed = first.filter(a => a.assessment), repairs = rows.flatMap(r => r.attempts.filter(a => a.attempt > 1))
  const count = (phase: "initial" | "final", predicate: (rating: z.infer<typeof Rating>) => boolean) => reviewed.filter(a => predicate(a.assessment![phase])).length
  return { denominator: rows.length, attempted: rows.filter(r => r.attempts.length).length, notRun: rows.filter(r => !r.attempts.length).length, reviewedFirst: reviewed.length, unreviewedFirst: first.length - reviewed.length,
    firstFull: count("initial", r => r.rating === "full"), firstFinalFull: count("final", r => r.rating === "full"), firstDecisiveErrors: count("initial", r => r.decisiveError), firstOverUnknown: count("initial", r => r.overUnknown), firstFalseComplete: count("initial", r => r.falseComplete), finalDecisiveErrors: count("final", r => r.decisiveError), finalOverUnknown: count("final", r => r.overUnknown), finalFalseComplete: count("final", r => r.falseComplete), repairAttempts: repairs.length, reviewedRepairAttempts: repairs.filter(a => a.assessment).length, repairedFinalFull: repairs.filter(a => a.assessment?.final.rating === "full").length }
}

/** Adaptive evaluation reads retained reports and independent source reviews. It never constructs a provider or dispatches generation. */
export async function evaluateStudy(base = root) {
  const manifest = await json(path.join(base, "manifest.json")), planned: Row[] = manifest.rows
  if (!Array.isArray(planned) || new Set(planned.map(r => r.id)).size !== planned.length) throw new Error("Invalid planned evaluation denominator")
  // Replay already verifies retained claim/report identities and supplies cumulative, unknown-aware accounting.
  const accounting = await replay(base), attemptsByRow = new Map<string, Attempt[]>(), bound = new Map<string, Attempt>()
  for (const ledger of accounting.rows) {
    const dir = path.join(base, "runs", ledger.id), attempts: Attempt[] = []
    for (const name of (await readdir(dir)).filter(n => /^attempt-\d+$/.test(n)).sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]))) {
      const identity = await json(path.join(dir, name, "claim.json")), relative = `runs/${ledger.id}/${name}/report.json`
      const bytes = await readFile(path.join(base, relative)).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error })
      const report = bytes ? JSON.parse(bytes.toString("utf8")).report : null
      const registered = planned.find(r => r.id === ledger.id)
      if (registered && !isDeepStrictEqual(registered, identity.row)) throw new Error("Retained row differs from the planned evaluation denominator")
      const current: Attempt = { attempt: identity.attempt, artifact: bytes ? { path: relative, sha256: hash(bytes) } : null, identity, status: report?.status ?? "completion-unknown", hostValidation: typeof report?.validation?.valid === "boolean" ? report.validation.valid : null, semanticStatus: "unreviewed", independentReview: null, developerAdjudication: null, assessment: null, comparisonIdentity: report ? comparisonIdentity(identity, report) : null }
      attempts.push(current); bound.set(key({ rowId: ledger.id, attempt: current.attempt }), current)
    }
    attemptsByRow.set(ledger.id, attempts)
  }
  const reviews = await records(base, "evaluations/semantic-reviews", SemanticReviewSchema), reviewByPath = new Map(reviews.map(r => [r.reference.path, r])), ids = new Set<string>()
  for (const { record } of reviews) {
    const current = bound.get(key(record.binding))
    if (!current || !isDeepStrictEqual(current.artifact, record.binding.report)) throw new Error(`Changed semantic review report: ${record.id}`)
    if (current.independentReview || ids.has(record.id)) throw new Error(`Duplicate semantic review: ${record.id}`)
    ids.add(record.id); current.independentReview = record; current.assessment = record.assessment; current.semanticStatus = "reviewed"
  }
  const adjudicationIds = new Set<string>()
  for (const { record } of await records(base, "evaluations/semantic-adjudications", SemanticAdjudicationSchema)) {
    const original = reviewByPath.get(record.independentReview.path), current = bound.get(key(record.binding))
    if (!original || !isDeepStrictEqual(original.reference, record.independentReview) || !isDeepStrictEqual(original.record.binding, record.binding) || !current || !isDeepStrictEqual(current.artifact, record.binding.report)) throw new Error(`Adjudication binding mismatch: ${record.id}`)
    if (current.developerAdjudication || adjudicationIds.has(record.id)) throw new Error(`Duplicate semantic adjudication: ${record.id}`)
    adjudicationIds.add(record.id); current.developerAdjudication = record; current.assessment = record.assessment; current.semanticStatus = "adjudicated"
  }
  const describe = (row: Row) => {
    const attempts = attemptsByRow.get(row.id) ?? [], first = attempts.find(a => a.attempt === 1)
    return { ...row, status: !attempts.length ? "not-run" : first?.semanticStatus ?? "first-attempt-missing", firstAttempt: first?.attempt ?? null, repairAttempts: attempts.filter(a => a.attempt > 1).map(a => a.attempt), attempts }
  }
  const primaryRows = planned.map(describe), descriptiveRows = [...attemptsByRow.entries()].filter(([id]) => !planned.some(r => r.id === id)).map(([, attempts]) => describe(attempts[0]!.identity.row))
  const pairedFirstAttempts: any[] = [], unpairedTasks: Array<{ task: string; reason: string }> = []
  for (const task of [...new Set(planned.map(r => r.task))]) {
    const M = primaryRows.find(r => r.task === task && r.method === "M")?.attempts.find(a => a.attempt === 1), D1 = primaryRows.find(r => r.task === task && r.method === "D1")?.attempts.find(a => a.attempt === 1)
    const reason = !M?.assessment || !D1?.assessment ? "first-attempt-not-reviewed" : !M.comparisonIdentity || !D1.comparisonIdentity ? "comparison-identity-unavailable" : !isDeepStrictEqual(M.comparisonIdentity, D1.comparisonIdentity) ? "comparison-identity-mismatch" : null
    if (reason) { unpairedTasks.push({ task, reason }); continue }
    const result = (a: Attempt) => ({ artifact: a.artifact, initial: a.assessment!.initial.rating, final: a.assessment!.final.rating, extractionInitial: a.assessment!.extraction.initial, extractionFinal: a.assessment!.extraction.final, hostValidation: a.hostValidation, adjudicated: !!a.developerAdjudication })
    pairedFirstAttempts.push({ task, comparisonIdentity: M!.comparisonIdentity, M: result(M!), D1: result(D1!) })
  }
  return { schemaVersion: "authorization-ar-semantic-evaluation/v1", development: "adaptive-exposed", firstAndRepairSeparate: true, primarySummary: summarize(primaryRows), descriptiveSummary: summarize(descriptiveRows), primaryRows, descriptiveRows, pairedFirstAttempts, unpairedTasks, accounting, qualityBenefit: "not-established", independentReview: reviews.length ? "partial-or-complete-see-row-status" : "pending", providerCallsDuringEvaluation: 0, targetExecutions: 0 }
}
