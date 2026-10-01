import path from "node:path"
import { z } from "zod"
import { root, json, exists, save, hash, registeredStudyRows } from "./study.ts"

export function registeredEvaluationRows(manifest: any): any[] {
  return registeredStudyRows(manifest)
}

export function assertGenerationClosed(manifest: any, files: string[]) {
  registeredEvaluationRows(manifest)
  if (!files.includes("generation-closed.json")) throw new Error("Primary generation must close before semantic review")
  if (manifest.revisions.length && !files.includes("revision-generation-closed.json")) throw new Error("Registered revision generation must close before semantic review")
}

async function requireClosure(manifest: any) {
  const files: string[] = []
  for (const file of ["generation-closed.json", "revision-generation-closed.json"]) if (await exists(path.join(root, file))) files.push(file)
  assertGenerationClosed(manifest, files)
}

function evidenceReferences(evidence: any[]) {
  return evidence.map(({ quote: _quote, text: _text, ...reference }) => reference)
}

/** Meaning is reviewed from the raw answers and original source, after all registered generation closes. */
export function makePacket(id: string, task: any, report: any) {
  const native = report.native, domain = report.domain ?? native?.domain, history = domain?.checkHistory ?? []
  const firstProposal = domain?.proposals?.find((p: any) => ["rules", "dependencies", "bindings", "policyRules"].some(k => Array.isArray(p.delta?.[k]) && p.delta[k].length > 0))?.delta
  return {
    schemaVersion: "authorization-aq-anonymous-packet/v1", id,
    task: { brief: task.brief, mode: task.mode, policy: task.policy }, status: report.status,
    initial: report.initial ?? null, final: report.final ?? null,
    prose: report.prose ?? null,
    initialProse: report.initial == null ? report.prose ?? null : null,
    initialValidation: report.initialValidation ?? null, finalValidation: report.validation ?? null,
    error: report.error ?? null,
    extractionInitial: firstProposal ?? history[0]?.slice ?? (domain ? { rules: [], dependencies: [], bindings: [], policyRules: [] } : null),
    extractionInitialOrigin: firstProposal ? "first-control-proposal" : history.length ? "first-answer-check" : "no-control-proposal",
    extractionFinal: domain?.slice ?? null, extractionProposals: domain?.proposals ?? [],
    hostChecks: history.map((h: any) => h.check), dependencies: domain?.dependencies ?? [],
    schedulerActions: (domain?.schedulerActions ?? []).map((a: any) => ({ questionId: a.questionId, dependencyId: a.dependencyId, reason: a.reason, output: { ...a.output, evidence: evidenceReferences(a.output.evidence ?? []) } })),
    evidence: evidenceReferences(report.evidence ?? native?.evidence ?? []),
    deliveryValid: report.validation?.valid ?? !!native?.result,
    reviewCaution: "Citations and host consistency do not prove extraction meaning. Evaluate raw first/final and final prose against original source at the retained evidence ranges. A native prose answer can be delivered despite failed host checking. Representation may reveal strategy; arm, cost and target scores are hidden. No earlier answer is supplied.",
  }
}

const Rating = z.object({ rating: z.enum(["full", "partial", "incorrect", "not-delivered"]), decisiveError: z.boolean(), overUnknown: z.boolean(), falseComplete: z.boolean(), evidence: z.array(z.string()).min(1) }).strict()
const Extraction = z.object({ initial: z.enum(["supported", "partial", "incorrect", "none"]), final: z.enum(["supported", "partial", "incorrect", "none"]), incorrectRules: z.array(z.string()), wrongPremiseMappings: z.array(z.string()), amplifiedError: z.boolean(), evidence: z.array(z.string()).min(1) }).strict()
const Mechanism = z.object({
  decisiveHelperHits: z.array(z.string()), irrelevantOrInvalidReads: z.array(z.string()),
  correctExcludedBranches: z.array(z.string()), wrongExcludedBranches: z.array(z.string()),
  justifiedResiduals: z.array(z.string()), avoidableResiduals: z.array(z.string()),
  checkerDetections: z.array(z.string()), checkerFalseRejections: z.array(z.string()), checkerMisses: z.array(z.string()),
  evidence: z.array(z.string()).min(1),
}).strict()
export const ReviewSchema = z.object({ id: z.string(), initial: Rating, final: Rating, extraction: Extraction, mechanism: Mechanism, causes: z.array(z.enum(["not-located", "not-read", "extraction-error", "expression-limit", "scheduler-priority", "premise-branch", "policy-comparison", "checker-missed", "protocol", "infrastructure"])), notes: z.string() }).strict()

export function assertReviewBindings(reviews: any[], rows: any[]) {
  if (reviews.length !== rows.length || new Set(reviews.map(r => r.id)).size !== reviews.length) throw new Error("Review denominator changed")
  for (const review of reviews) {
    const bound = rows.find(r => r.packetId === review.id)?.review
    if (JSON.stringify(bound) !== JSON.stringify(review)) throw new Error(`Review changed ${review.id}`)
  }
}

export async function loadRow(row: any) {
  const dir = path.join(root, "runs", row.id), report = await json(path.join(dir, "report.json"))
  if (report.sessionPath && await exists(path.join(report.sessionPath, "run.json"))) return { ...report, ...await json(path.join(report.sessionPath, "run.json")), row, wallDurationMs: report.wallDurationMs }
  return report
}

async function packets() {
  const manifest = await json(path.join(root, "manifest.json")); await requireClosure(manifest)
  const map: any[] = [], groups: Record<string, any> = {}
  for (const row of registeredEvaluationRows(manifest).sort((a, b) => hash(a.id).localeCompare(hash(b.id)))) {
    const id = `packet-${hash(`aq-independent-v1:${row.id}`).slice(0, 12)}`
    const task = await json(path.join(root, "model/inputs", `${row.task}.json`)), report = await loadRow(row)
    const packetFile = path.join(root, "evaluator/packets", `${id}.json`)
    await save(packetFile, makePacket(id, task, report))
    const sourceRoot = path.resolve(root, "model/inputs", task.sourceRoot)
    map.push({ id, rowId: row.id, task: row.task, sourceRoot, allowedPaths: task.allowedPaths })
    const group = row.task.startsWith("paperless-notes") ? "paperless-notes" : row.task.startsWith("memos-remove") ? "memos-remove" : row.task
    groups[group] ??= { case: group, sourceRoot, allowedPaths: task.allowedPaths, packets: [] }
    groups[group].packets.push({ id, packetFile })
  }
  await save(path.join(root, "evaluator/packet-map.json"), map)
  await save(path.join(root, "evaluator/groups.json"), Object.values(groups))
  await save(path.join(root, "evaluator/rubric.json"), {
    generationClosed: true,
    criteria: ["Decision covers current requested scenarios", "Necessary endpoint/upstream controls and protected effect are supported by original source", "Current premises exclude only inapplicable branches; unspecified is not null", "Principal/resource bindings and input/output objects are distinct", "Unknown names a decisive fact and is not a readable helper omission", "Policy assessment compares only current independently supplied policy"],
    ratings: { full: "Correct complete bounded answer with no decisive error or avoidable source gap", partial: "Useful correct core but requested branch/control incomplete or avoidable unknown", incorrect: "Decisive source behavior, applicability or policy conclusion is wrong", "not-delivered": "No answer was submitted: neither raw structured result nor final native prose" },
    firstAndFinalSeparate: true, extractionMeaningSeparate: true, sourceCitationRequired: true, noFieldCountScore: true,
    initialExtraction: "Rate the first nonempty raw control proposal even when host rejection prevented acceptance or answer delivery. Its origin is marked. Final extraction is accepted host state plus preserved proposals; citations/acceptance are separate from semantic support.",
    nativeProse: "If no structured candidate exists, the final prose is both first and final delivery. Otherwise rate the first structured candidate separately; assess final prose and final candidate together, including contradictions.",
    mechanisms: "Use arrays of specific dependency/path/check IDs with original-source anchors; an empty array means no observed semantic event. Host field counts and diagnostics alone are not proof of helper relevance, correctness or false rejection.",
    protocol: "No delivered answer after schema failure is not-delivered; preserved failures still count in the session denominator. Do not invent a semantic error from a format failure.",
    hidden: ["arm", "cost", "target scores", "prior answers"], representationMayBeInferred: true,
  })
  console.log(`Created ${map.length} anonymous packets after closure`)
}

function groupSummary(rows: any[]) {
  const count = (field: "initial" | "final", predicate: (v: any) => boolean) => rows.filter(r => predicate(r.review[field])).length
  return { denominator: rows.length, deliveredInitial: count("initial", v => v.rating !== "not-delivered"), deliveredFinal: count("final", v => v.rating !== "not-delivered"), firstFull: count("initial", v => v.rating === "full"), finalFull: count("final", v => v.rating === "full"), firstDecisiveErrors: count("initial", v => v.decisiveError), finalDecisiveErrors: count("final", v => v.decisiveError), firstOverUnknown: count("initial", v => v.overUnknown), finalOverUnknown: count("final", v => v.overUnknown), firstFalseComplete: count("initial", v => v.falseComplete), finalFalseComplete: count("final", v => v.falseComplete), causes: Object.fromEntries([...new Set<string>(rows.flatMap(r => r.review.causes))].map(c => [c, rows.filter(r => r.review.causes.includes(c)).length])), accounting: accounting(rows) }
}

function accounting(rows: any[]) {
  const knownTokens: Record<string, number> = {}
  for (const row of rows) for (const [key, value] of Object.entries(row.telemetry?.knownTokens ?? {})) if (typeof value === "number") knownTokens[key] = (knownTokens[key] ?? 0) + value
  const unknownUsageCalls = rows.reduce((n, r) => n + (r.telemetry?.unknownUsageCalls ?? r.providerCalls), 0)
  const unknownCostCalls = rows.reduce((n, r) => n + (r.telemetry?.unknownCostCalls ?? r.providerCalls), 0)
  const knownActualUsdSubtotal = rows.reduce((n, r) => n + (r.telemetry?.knownActualUsdSubtotal ?? 0), 0)
  return { providerCalls: rows.reduce((n, r) => n + r.providerCalls, 0), knownTokens, completePromptTokensKnown: (knownTokens.input ?? 0) + (knownTokens.cacheRead ?? 0), unknownUsageCalls, unknownCostCalls, knownActualUsdSubtotal, totalActualUsd: unknownCostCalls || rows.some(r => !r.telemetry) ? null : knownActualUsdSubtotal, summedSessionWallMs: rows.reduce((n, r) => n + (r.wallDurationMs ?? 0), 0), unknownWallSessions: rows.filter(r => typeof r.wallDurationMs !== "number").length }
}

async function summarize() {
  const manifest = await json(path.join(root, "manifest.json")); await requireClosure(manifest)
  const registered = registeredEvaluationRows(manifest), mapping = await json(path.join(root, "evaluator/packet-map.json")), raw = await json(path.join(root, "evaluator/reviews.json"))
  const reviews = raw.reviews.map((r: unknown) => ReviewSchema.parse(r))
  if (reviews.length !== registered.length || new Set(reviews.map((r: any) => r.id)).size !== registered.length || mapping.length !== registered.length || mapping.some((m: any) => !reviews.some((r: any) => r.id === m.id))) throw new Error("Every registered session needs one independent review")
  const rows: any[] = []
  for (const row of registered) {
    const packetId = mapping.find((m: any) => m.rowId === row.id).id, review = reviews.find((r: any) => r.id === packetId)
    const run = await loadRow(row), domain = run.domain ?? run.native?.domain, evidence = run.evidence ?? run.native?.evidence ?? [], deps = domain?.dependencies ?? [], actions = domain?.schedulerActions ?? [], checks = domain?.checkHistory ?? []
    const readKeys = actions.filter((a: any) => a.output.status === "ok").flatMap((a: any) => a.output.evidence.map((e: any) => `${e.path}:${e.startLine}:${e.endLine}`))
    rows.push({ ...row, packetId, review, status: run.status, providerCalls: run.telemetry?.providerCalls ?? run.providerDispatches ?? 0, telemetry: run.telemetry ?? null, wallDurationMs: run.wallDurationMs, sourceAccounting: run.sourceAccounting ?? run.native?.sourceAccounting ?? null,
      extraction: { rules: domain?.slice.rules.length ?? 0, revisions: domain?.slice.revisions.length ?? 0, conflicts: domain?.slice.conflicts.length ?? 0 },
      mechanism: { schedulerActions: actions.length, successfulAutoReads: actions.filter((a: any) => a.output.status === "ok").length, failedAutoReads: actions.filter((a: any) => a.output.status !== "ok").length, exactDuplicateAutoReads: readKeys.length - new Set(readKeys).size, decisiveChecked: deps.filter((d: any) => d.decisive && d.state === "checked").length, decisiveOpen: deps.filter((d: any) => d.decisive && !["checked", "inapplicable"].includes(d.state)).length, inapplicableDependencies: deps.filter((d: any) => d.state === "inapplicable").length, inapplicablePaths: domain?.check?.paths.filter((p: any) => p.state === "inapplicable").length ?? 0, residualPaths: domain?.check?.paths.filter((p: any) => p.predicate.truth === "unknown").length ?? 0, initialDiagnostics: checks[0]?.check.diagnostics ?? [], finalDiagnostics: checks.at(-1)?.check.diagnostics ?? [], computation: domain?.computation ?? null, independentlyReviewed: review.mechanism },
      evidenceRanges: evidence.map((e: any) => ({ id: e.id, path: e.path, startLine: e.startLine, endLine: e.endLine })),
      nativeUse: run.native ? { skillLoaded: run.skillLoaded, originalSkillPrefixPreserved: run.originalSkillPrefixPreserved, toolBudget: run.native.toolBudget, compiled: !!run.native.program, checkedDelivery: !!run.native.result, referenceCalls: run.native.referenceCalls } : undefined,
    })
  }
  const quality = rows.filter(r => r.kind === "quality"), revisionRows = rows.filter(r => r.kind === "revision")
  const summary = {
    schemaVersion: "authorization-aq-evaluation/v1", denominator: { quality: 40, ablation: 4, native: 4, revision: revisionRows.length },
    independentReview: { reviewers: raw.reviewers, adjudication: raw.adjudication ?? null, armAndCostHidden: true, representationMayBeInferred: true, developerAlreadyExposedToPriorCases: true },
    arms: Object.fromEntries(["M-L", "D-L", "M-E", "D-E"].map(arm => [arm, groupSummary(quality.filter(r => r.arm === arm))])),
    originalBlock: groupSummary(quality.filter(r => !r.repeat)), repeatBlock: groupSummary(quality.filter(r => r.repeat)),
    ablations: rows.filter(r => r.kind === "ablation"), native: rows.filter(r => r.kind === "native"),
    revision: { denominator: revisionRows.length, arms: Object.fromEntries(["M-E", "D-E"].map(arm => [arm, groupSummary(revisionRows.filter(r => r.arm === arm))])), rows: revisionRows, replacesPrimary: false },
    rows, accounting: { ...accounting(rows), model: manifest.model, actualReturnedModel: null, providerTransportAttempts: "unknown", developmentAgentTokens: null, developmentAgentUsd: null, humanMinutes: null, targetExecutions: 0 }, revisions: manifest.revisions,
  }
  await save(path.join(root, "evaluation-summary.json"), summary, false)
  console.log(JSON.stringify({ arms: summary.arms, revision: summary.revision.arms, accounting: summary.accounting }))
}

async function replay() {
  const manifest = await json(path.join(root, "manifest.json")); await requireClosure(manifest)
  const registered = registeredEvaluationRows(manifest), mapping = await json(path.join(root, "evaluator/packet-map.json")), summary = await json(path.join(root, "evaluation-summary.json"))
  if (mapping.length !== registered.length || summary.rows.length !== registered.length) throw new Error("Evaluation denominator changed")
  const reviews = await json(path.join(root, "evaluator/reviews.json"))
  assertReviewBindings(reviews.reviews, summary.rows)
  for (const row of registered) {
    const map = mapping.find((m: any) => m.rowId === row.id), packet = await json(path.join(root, "evaluator/packets", `${map.id}.json`))
    const expected = makePacket(map.id, await json(path.join(root, "model/inputs", `${row.task}.json`)), await loadRow(row))
    if (JSON.stringify(packet) !== JSON.stringify(expected)) throw new Error(`Packet changed ${row.id}`)
    ReviewSchema.parse(summary.rows.find((r: any) => r.id === row.id).review)
  }
  console.log(`${registered.length} packet/source/report bindings and independent reviews replayed; provider calls=0`)
}
if (import.meta.main) { const command = process.argv[2]; if (command === "packets") await packets(); else if (command === "summarize") await summarize(); else if (command === "replay") await replay(); else throw new Error("Use packets|summarize|replay") }
