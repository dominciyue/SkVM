import path from "node:path"
import { readFile } from "node:fs/promises"
import { z } from "zod"
import { root, json, exists, save, hash } from "./study.ts"

/** Only generation closure permits construction of semantic review material. */
export function makePacket(id: string, task: any, report: any) {
  const native = report.native, domain = report.domain ?? native?.domain, history = domain?.checkHistory ?? []
  return { schemaVersion: "authorization-aq-anonymous-packet/v1", id, task: { brief: task.brief, mode: task.mode, policy: task.policy }, status: report.status,
    initial: report.initial ?? null, final: report.final ?? null, prose: report.prose,
    extractionInitial: history[0]?.slice ?? (domain ? { rules: [], dependencies: [], bindings: [], policyRules: [] } : null), extractionFinal: domain?.slice ?? null,
    extractionProposals: domain?.proposals ?? [], hostChecks: history.map((h: any) => h.check), dependencies: domain?.dependencies ?? [], schedulerActions: (domain?.schedulerActions ?? []).map((a: any) => ({ questionId: a.questionId, dependencyId: a.dependencyId, reason: a.reason, output: a.output })),
    evidence: report.evidence ?? native?.evidence ?? [], deliveryValid: report.validation?.valid ?? !!native?.result,
    reviewCaution: "Citations and host consistency do not prove extraction meaning. Evaluate raw first/final against original source. Representation may reveal the strategy; arm, cost and target scores are hidden. No earlier answer is supplied." }
}
const Rating = z.object({ rating: z.enum(["full", "partial", "incorrect", "not-delivered"]), decisiveError: z.boolean(), overUnknown: z.boolean(), falseComplete: z.boolean(), evidence: z.array(z.string()).min(1) }).strict()
const Extraction = z.object({ initial: z.enum(["supported", "partial", "incorrect", "none"]), final: z.enum(["supported", "partial", "incorrect", "none"]), incorrectRules: z.array(z.string()), wrongPremiseMappings: z.array(z.string()), amplifiedError: z.boolean(), evidence: z.array(z.string()) }).strict()
export const ReviewSchema = z.object({ id: z.string(), initial: Rating, final: Rating, extraction: Extraction, causes: z.array(z.enum(["not-located", "not-read", "extraction-error", "expression-limit", "scheduler-priority", "premise-branch", "policy-comparison", "checker-missed", "protocol", "infrastructure"])), notes: z.string() }).strict()
export async function loadRow(row: any) {
  const dir = path.join(root, "runs", row.id), report = await json(path.join(dir, "report.json"))
  if (report.sessionPath && await exists(path.join(report.sessionPath, "run.json"))) return { ...report, ...await json(path.join(report.sessionPath, "run.json")), row, wallDurationMs: report.wallDurationMs }
  return report
}
async function packets() {
  if (!(await exists(path.join(root, "generation-closed.json")))) throw new Error("Generation must close before semantic review")
  const manifest = await json(path.join(root, "manifest.json")), map: any[] = []
  for (const row of [...manifest.rows].sort((a, b) => hash(a.id).localeCompare(hash(b.id)))) {
    const id = `packet-${hash(`aq-independent-v1:${row.id}`).slice(0, 12)}`, task = await json(path.join(root, "model/inputs", `${row.task}.json`)), report = await loadRow(row)
    await save(path.join(root, "evaluator/packets", `${id}.json`), makePacket(id, task, report))
    map.push({ id, rowId: row.id, task: row.task, sourceRoot: path.resolve(root, "model/inputs", task.sourceRoot), allowedPaths: task.allowedPaths })
  }
  await save(path.join(root, "evaluator/packet-map.json"), map)
  await save(path.join(root, "evaluator/rubric.json"), { generationClosed: true, criteria: ["Decision covers current requested scenarios", "Necessary endpoint/upstream controls and protected effect are supported by original source", "Current premises exclude only inapplicable branches; unspecified is not null", "Principal/resource bindings and input/output objects are distinct", "Unknown names a decisive fact and is not a readable helper omission", "Policy assessment compares only current independently supplied policy"], ratings: { full: "Correct complete bounded answer with no decisive error or avoidable source gap", partial: "Useful correct core but requested branch/control incomplete or avoidable unknown", incorrect: "Decisive source behavior, applicability or policy conclusion is wrong", "not-delivered": "No raw structured answer was submitted" }, firstAndFinalSeparate: true, extractionMeaningSeparate: true, sourceCitationRequired: true, noFieldCountScore: true, hidden: ["arm", "cost", "target scores", "prior answers"], representationMayBeInferred: true })
  console.log(`Created ${map.length} anonymous packets after closure`)
}
function groupSummary(rows: any[]) {
  const count = (field: "initial" | "final", predicate: (v: any) => boolean) => rows.filter(r => predicate(r.review[field])).length
  return { denominator: rows.length, deliveredInitial: count("initial", v => v.rating !== "not-delivered"), deliveredFinal: count("final", v => v.rating !== "not-delivered"), firstFull: count("initial", v => v.rating === "full"), finalFull: count("final", v => v.rating === "full"), firstDecisiveErrors: count("initial", v => v.decisiveError), finalDecisiveErrors: count("final", v => v.decisiveError), firstOverUnknown: count("initial", v => v.overUnknown), finalOverUnknown: count("final", v => v.overUnknown), firstFalseComplete: count("initial", v => v.falseComplete), finalFalseComplete: count("final", v => v.falseComplete), causes: Object.fromEntries([...new Set<string>(rows.flatMap(r => r.review.causes))].map(c => [c, rows.filter(r => r.review.causes.includes(c)).length])) }
}
async function summarize() {
  const manifest = await json(path.join(root, "manifest.json")), mapping = await json(path.join(root, "evaluator/packet-map.json")), raw = await json(path.join(root, "evaluator/reviews.json")), reviews = raw.reviews.map((r: unknown) => ReviewSchema.parse(r))
  if (reviews.length !== 48 || new Set(reviews.map((r: any) => r.id)).size !== 48 || mapping.some((m: any) => !reviews.some((r: any) => r.id === m.id))) throw new Error("Every fixed session needs one independent review")
  const rows: any[] = []
  for (const row of manifest.rows) {
    const packetId = mapping.find((m: any) => m.rowId === row.id).id, review = reviews.find((r: any) => r.id === packetId), run = await loadRow(row), domain = run.domain ?? run.native?.domain, evidence = run.evidence ?? run.native?.evidence ?? [], deps = domain?.dependencies ?? [], actions = domain?.schedulerActions ?? [], checks = domain?.checkHistory ?? []
    const readKeys = actions.filter((a: any) => a.output.status === "ok").flatMap((a: any) => a.output.evidence.map((e: any) => `${e.path}:${e.startLine}:${e.endLine}`))
    rows.push({ ...row, packetId, review, status: run.status, telemetry: run.telemetry ?? null, wallDurationMs: run.wallDurationMs, sourceAccounting: run.sourceAccounting ?? run.native?.sourceAccounting ?? null, extraction: { rules: domain?.slice.rules.length ?? 0, revisions: domain?.slice.revisions.length ?? 0, conflicts: domain?.slice.conflicts.length ?? 0 }, mechanism: { schedulerActions: actions.length, successfulAutoReads: actions.filter((a: any) => a.output.status === "ok").length, failedAutoReads: actions.filter((a: any) => a.output.status !== "ok").length, exactDuplicateAutoReads: readKeys.length - new Set(readKeys).size, decisiveChecked: deps.filter((d: any) => d.decisive && d.state === "checked").length, decisiveOpen: deps.filter((d: any) => d.decisive && !["checked", "inapplicable"].includes(d.state)).length, inapplicableDependencies: deps.filter((d: any) => d.state === "inapplicable").length, inapplicablePaths: domain?.check?.paths.filter((p: any) => p.state === "inapplicable").length ?? 0, residualPaths: domain?.check?.paths.filter((p: any) => p.predicate.truth === "unknown").length ?? 0, initialDiagnostics: checks[0]?.check.diagnostics ?? [], finalDiagnostics: checks.at(-1)?.check.diagnostics ?? [], computation: domain?.computation ?? null }, evidenceRanges: evidence.map((e: any) => ({ id: e.id, path: e.path, startLine: e.startLine, endLine: e.endLine })), nativeUse: run.native ? { skillLoaded: run.skillLoaded, originalSkillPrefixPreserved: run.originalSkillPrefixPreserved, toolBudget: run.native.toolBudget, compiled: !!run.native.program, checkedDelivery: !!run.native.result, referenceCalls: run.native.referenceCalls } : undefined })
  }
  const quality = rows.filter(r => r.kind === "quality"), totalCalls = rows.reduce((n, r) => n + (r.telemetry?.providerCalls ?? 0), 0), unknownCostCalls = rows.reduce((n, r) => n + (r.telemetry?.unknownCostCalls ?? 0), 0), unknownUsageCalls = rows.reduce((n, r) => n + (r.telemetry?.unknownUsageCalls ?? 0), 0)
  const knownTokens: Record<string, number> = {}; for (const row of rows) for (const [key, value] of Object.entries(row.telemetry?.knownTokens ?? {})) if (typeof value === "number") knownTokens[key] = (knownTokens[key] ?? 0) + value
  const summary = { schemaVersion: "authorization-aq-evaluation/v1", denominator: { quality: 40, ablation: 4, native: 4 }, independentReview: { reviewers: raw.reviewers, armAndCostHidden: true, representationMayBeInferred: true, developerAlreadyExposedToPriorCases: true }, arms: Object.fromEntries(["M-L", "D-L", "M-E", "D-E"].map(arm => [arm, groupSummary(quality.filter(r => r.arm === arm))])), originalBlock: groupSummary(quality.filter(r => !r.repeat)), repeatBlock: groupSummary(quality.filter(r => r.repeat)), ablations: rows.filter(r => r.kind === "ablation"), native: rows.filter(r => r.kind === "native"), rows, accounting: { providerCalls: totalCalls, knownTokens, unknownUsageCalls, unknownCostCalls, knownActualUsdSubtotal: rows.reduce((n, r) => n + (r.telemetry?.knownActualUsdSubtotal ?? 0), 0), totalActualUsd: unknownCostCalls || rows.some(r => !r.telemetry) ? null : rows.reduce((n, r) => n + r.telemetry.totalActualUsd, 0), model: manifest.model, providerTransportAttempts: "unknown", developmentAgentTokens: null, developmentAgentUsd: null, humanMinutes: null, targetExecutions: 0 }, revisions: manifest.revisions }
  await save(path.join(root, "evaluation-summary.json"), summary, false)
  console.log(JSON.stringify({ arms: summary.arms, accounting: summary.accounting }))
}
async function replay() {
  if (!(await exists(path.join(root, "generation-closed.json")))) throw new Error("No generation closure")
  const manifest = await json(path.join(root, "manifest.json")), mapping = await json(path.join(root, "evaluator/packet-map.json")), summary = await json(path.join(root, "evaluation-summary.json"))
  if (manifest.rows.length !== 48 || mapping.length !== 48 || summary.rows.length !== 48) throw new Error("Evaluation denominator changed")
  for (const row of manifest.rows) {
    const map = mapping.find((m: any) => m.rowId === row.id), packet = await json(path.join(root, "evaluator/packets", `${map.id}.json`)), expected = makePacket(map.id, await json(path.join(root, "model/inputs", `${row.task}.json`)), await loadRow(row))
    if (JSON.stringify(packet) !== JSON.stringify(expected)) throw new Error(`Packet changed ${row.id}`)
    ReviewSchema.parse(summary.rows.find((r: any) => r.id === row.id).review)
  }
  console.log("48 packet/source/report bindings and independent reviews replayed; provider calls=0")
}
if (import.meta.main) { const command = process.argv[2]; if (command === "packets") await packets(); else if (command === "summarize") await summarize(); else if (command === "replay") await replay(); else throw new Error("Use packets|summarize|replay") }
