// Aggregate original observations and separately adjudicated answer reviews.
// This does not score answers, select a raw, or alter any archived model run.
import path from "node:path"
import { base, repo, load, save } from "./evidence.ts"
import { positions, verify } from "./study.ts"
import { countObservedUsage } from "../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/study.ts"

const ledger = await load(path.join(base, "attempts.json"))
if (positions.some(p => !ledger.some((e: any) => e.position === p))
  || ledger.some((e: any) => ["running", "unknown"].includes(e.status) || e.lifecycle?.localExecution !== "closed"))
  throw new Error("finite-queue-not-closed")
const review = await load(path.join(base, "evaluation/natural-review.json"))
if (positions.some(position => ["first", "final"].some(phase => !review.rows.some((r: any) => r.position === position && r.phase === phase && r.reviewStatus === "main-reviewed"))))
  throw new Error("every-planned-position-and-phase-requires-review")
const lifecycle = await verify(), packets = await load(path.join(base, "evaluation/client-packets.json"))
const usage = countObservedUsage(ledger.flatMap((e: any) => e.turns ?? []))
const final = review.rows.filter((r: any) => r.phase === "final"), consumers = final.filter((r: any) => !r.position.startsWith("A-"))
const aggregate = (rows: any[]) => ({
  positions: rows.length, delivered: rows.filter(r => r.delivery === "delivered").length,
  wholeFull: rows.filter(r => r.wholeTask === "full").length,
  fullDomains: rows.reduce((n, r) => n + Object.values(r.domains).filter(v => v === "full").length, 0),
  domainDenominator: rows.length * 6,
  coreCorrect: rows.reduce((n, r) => n + Object.values(r.coreRelations).filter(v => v === "correct").length, 0),
  coreIncorrect: rows.reduce((n, r) => n + Object.values(r.coreRelations).filter(v => v === "incorrect").length, 0),
  coreDenominator: rows.reduce((n, r) => n + Object.keys(r.coreRelations).length, 0),
  severeUnsupportedClaims: rows.reduce((n, r) => n + r.severeUnsupportedClaims.length, 0)
})
const quality = { ...aggregate(consumers), byPhase: ["first", "final"].map(phase => ({ phase, ...aggregate(review.rows.filter((r: any) => r.phase === phase && !r.position.startsWith("A-"))) })),
  byArm: ["N", "RR", "RE", "AE"].map(arm => ({ arm, ...aggregate(consumers.filter((r: any) => r.position.startsWith(`${arm}-`))) })) }
const comparisons = ["M", "G"].map(task => {
  const arms = ["N", "RR", "RE", "AE"].map(arm => {
    const e = ledger.find((e: any) => e.position === `${arm}-${task}`), grade = final.find((r: any) => r.position === e.position)
    return { position: e.position, status: e.status, codeEpoch: e.codeEpoch, programSha256: e.programSha256, inputSha256: e.inputSha256, skillSha256: e.skillSha256,
      totalObservedTokens: e.usage ? e.usage.input + e.usage.output : null, durationMs: e.durationMs ?? null,
      observedPurposeWallMs: e.endedAt ? Date.parse(e.endedAt) - Date.parse(e.startedAt) : null,
      domains: grade.domains, coreRelations: grade.coreRelations, wholeTask: grade.wholeTask, severeUnsupportedClaims: grade.severeUnsupportedClaims }
  })
  const rr = arms[1]!, re = arms[2]!, rank: Record<string, number> = { full: 2, partial: 1, incorrect: 0, "not-covered": 0, "not-delivered": 0 }
  return { task, arms, referencePairDelivered: rr.status === "completed" && re.status === "completed",
    sameConsumerSourceEpoch: new Set(arms.map(a => a.codeEpoch.sourceTree)).size === 1,
    sameRawRRRE: rr.programSha256 === re.programSha256, sameInputAndSkill: new Set(arms.map(a => `${a.inputSha256}:${a.skillSha256}`)).size === 1,
    RRtoRE: Object.fromEntries(Object.keys(rr.domains).map(k => [k, rank[re.domains[k]]! > rank[rr.domains[k]]! ? "improved" : rank[re.domains[k]]! < rank[rr.domains[k]]! ? "regressed" : "same-grade"])),
    executionToRulesTokenRatio: rr.totalObservedTokens && re.totalObservedTokens ? re.totalObservedTokens / rr.totalObservedTokens : null,
    interpretation: "N/RR includes preparation; RR/RE isolates available execution/check support for identical reference bytes, not a general causal estimate. AE-G ineligibility is retained. Local wall time includes concurrent offline verification." }
})
const actualUse = []
for (const e of ledger) {
  if (!e.session) { actualUse.push({ position: e.position, status: e.status, providerCalls: 0, answerAdoption: null }); continue }
  const run = await load(path.resolve(repo, e.session, "run.json")), h = run.native?.history ?? [], p = packets.rows.find((r: any) => r.position === e.position)
  const counts: Record<string, number> = {}
  for (const item of h) counts[item.call.name] = (counts[item.call.name] ?? 0) + 1
  actualUse.push({ position: e.position, status: e.status, historyRecords: h.length, toolCalls: counts,
    clientSourceBodies: p.bodies.length, executionOrOutcomePackets: p.executions.length, decodeErrors: p.decodeErrors.length, rulesViolations: p.rulesViolations.length,
    answerAdoption: final.find((r: any) => r.position === e.position)?.adoption,
    distinction: "Tool invocation, delivered result and natural adoption are separate observations; no source execution is inferred from finite DSL evaluation." })
}
await save(path.join(base, "evaluation/actual-use.json"), { rows: actualUse })
const accounting = { identity: "authorization-semantic-validation-v1", known: usage, inputIncludesCacheReadOnce: true, freshInput: usage.input - usage.cacheRead,
  plannedPurposes: positions.length, recordedPurposes: ledger.length, dispatchedPurposes: ledger.filter((e: any) => e.inferenceDispatched).length,
  namedConfirmations: ledger.filter((e: any) => e.repairCause).length, observedTurns: usage.turns,
  authorPreparation: ledger.filter((e: any) => e.position.startsWith("A-")).map((e: any) => ({ position: e.position, usage: e.usage, durationMs: e.durationMs, observedPurposeWallMs: Date.parse(e.endedAt) - Date.parse(e.startedAt), turns: e.turns.length })),
  consumerUsage: countObservedUsage(ledger.filter((e: any) => !e.position.startsWith("A-")).flatMap((e: any) => e.turns ?? [])),
  referencePreparationCost: null, developerAndScoutCost: null, actualUsd: null, hiddenProviderRequests: null, humanMinutes: null,
  sourceAcquisitionCost: null, isolatedSourceTestExecutions: 1, isolatedSourceSubcases: 8, fullModuleSourceExecutions: 0, targetServiceExecutions: 0, businessWrites: 0,
  unknown: ["Actual USD and hidden provider request count are not exposed.", "Reference preparation, development/scout cost and human time are not included in consumer usage.", "Cache reads are already included in input, never added again."], comparisons }
await save(path.join(base, "accounting.json"), accounting)
const checks = await load(path.join(base, "verification/final-checks.json"))
const ordinary = await Promise.all(["M", "G"].map(t => load(path.join(base, `verification/ordinary-${t}.json`))))
const movedM = await load(path.join(base, "verification/portability-M.json")), movedG = await load(path.join(base, "verification/portability-G-review.json"))
const m = await load(path.join(base, "automatic/M-eligibility.json")), g = await load(path.join(base, "automatic/G-eligibility.json"))
const engineeringComplete = checks.checks.every((c: any) => c.exitCode === 0)
const comparable = comparisons.every(c => c.referencePairDelivered && c.sameConsumerSourceEpoch && c.sameRawRRRE && c.sameInputAndSkill)
const acceptance = { finiteQueueComplete: true, engineeringComplete,
  researchDiagnosticMinimumMet: engineeringComplete && m.eligible && comparable && lifecycle.activeOrUnknown.length === 0,
  completeAutomaticSemantics: false, completeNaturalQuality: quality.wholeFull === quality.positions, stableNetBenefitEstablished: false,
  axes: { automaticPrograms: { M: m, G: g, chronologicalLastRaw: true, manualSemanticEdits: false },
    quality, comparable, actualUse: "evaluation/actual-use.json",
    ordinaryUse: { complete: ordinary.every(o => o.rows.length === 2 && o.rows.every((r: any) => r.exitCode === 0 && !r.archiveFailure && r.inspect?.exitCode === 0)) && movedM.withdrawn && movedG.verified,
      caveat: "G source-change propagation is verified separately from its failed semantic qualification." } },
  lifecycle, isolatedSourceTestExecutions: 1, targetServiceExecutions: 0, businessWrites: 0, heldOut: false, nextStageAuthorized: false }
await save(path.join(base, "verification/acceptance-matrix.json"), acceptance)
await save(path.join(base, "summary.json"), { identity: "authorization-semantic-validation-v1", ...acceptance, accounting: { known: usage, actualUsd: null, namedConfirmations: accounting.namedConfirmations },
  evidence: { naturalReview: "evaluation/natural-review.json", sourceReviews: ["evaluation/M-source-review.json", "evaluation/G-source-review.json"], accounting: "accounting.json", archive: "verification/evidence-bundle.json" } })
console.log(JSON.stringify({ quality, usage, comparable, engineeringComplete, researchDiagnosticMinimumMet: acceptance.researchDiagnosticMinimumMet }, null, 2))
