// Deterministic aggregation of persisted observations and human source reviews.
import path from "node:path"
import { writeFile } from "node:fs/promises"
import { base, repo, load, save, positions, verify } from "./study.ts"
import { countObservedUsage } from "../../../results/skill-ir/skill-dsl-research/development/authorization-answer-transfer-v1/study.ts"

const ledger = await load(path.join(base, "attempts.json"))
if (positions.some(p => !ledger.some((e: any) => e.position === p)) || ledger.some((e: any) => ["running", "unknown"].includes(e.status) || e.lifecycle?.localExecution !== "closed")) throw new Error("finite-queue-not-closed")
// Correct the reconstructed archive's elapsed total, preserving original logs.
const recovered = ledger.find((e: any) => e.position === "A-G" && e.hostPostTurnFailure)
if (recovered) {
  const session = path.resolve(repo, recovered.session)
  const turn = await load(path.join(session, "raw/recovery-1/account-turn-1.json"))
  const originalObservedMs = Date.parse(recovered.recoveries[0].lastOriginalEventAt) - Date.parse(recovered.startedAt)
  const durationMs = originalObservedMs + turn.durationMs
  if (recovered.durationMs !== durationMs) {
    await save(path.join(base, "verification/A-G-duration-correction.json"), { providerCalls: 0, priorReportedMs: recovered.durationMs, originalObservedMs, recoveryObservedMs: turn.durationMs, cumulativeObservableMs: durationMs, unobservedInterval: "unknown, excluded from observed total; not asserted free", originalLifecycleFilesChanged: false })
    for (const name of ["run.json", "report.json"]) {
      const report = await load(path.join(session, name))
      report.durationMs = durationMs
      report.telemetry.account.durationMs = durationMs
      report.telemetry.account.turns[0].durationMs = originalObservedMs
      await save(path.join(session, name), report)
    }
    recovered.durationMs = durationMs
    await save(path.join(base, "attempts.json"), ledger)
  }
}
const review = await load(path.join(base, "evaluation/natural-review.json"))
if (review.rows.length !== 12 || review.rows.some((r: any) => r.reviewStatus !== "main-reviewed")) throw new Error("all-original-consumer-answers-require-review")
const lifecycle = await verify()
const usage = countObservedUsage(ledger.flatMap((e: any) => e.turns ?? []))
const pair = (block: string) => {
  const entries = ["N", "R", "E"].map(arm => ledger.find((e: any) => e.position === `${block}-${arm}`))
  const grades = ["N", "R", "E"].map(arm => review.rows.find((r: any) => r.position === `${block}-${arm}`))
  const tokens = entries.map(e => e.usage ? e.usage.input + e.usage.output : null)
  const keys = Object.keys(grades[0].domains)
  const changes = (a: number, b: number) => {
    const rank: Record<string, number> = { full: 2, partial: 1, incorrect: 0, "not-delivered": 0 }
    return Object.fromEntries(keys.map(k => [k, rank[grades[b].domains[k]]! > rank[grades[a].domains[k]]! ? "improved" : rank[grades[b].domains[k]]! < rank[grades[a].domains[k]]! ? "regressed" : "same-grade"]))
  }
  return { block, arms: entries.map((e, i) => ({ position: e.position, codeEpoch: e.codeEpoch, wholeTask: grades[i].wholeTask, domains: grades[i].domains, totalObservedTokens: tokens[i], durationMs: e.durationMs })), sameSourceEpoch: new Set(entries.map(e => e.codeEpoch.sourceTree)).size === 1, sameRawRE: entries[1].programSha256 === entries[2].programSha256, NtoR: changes(0, 1), RtoE: changes(1, 2), executionToRulesTokenRatio: tokens[1] && tokens[2] ? tokens[2] / tokens[1] : null, interpretation: "Grades do not alone establish causality. N-to-R includes preparation; consult actual-use, client packets and natural adoption reviews. Timing includes concurrent local work and is not isolated latency." }
}
const accounting = { identity: "authorization-task-coverage-v1", known: usage, inputIncludesCacheRead: true, freshInput: usage.input - usage.cacheRead, cacheWrite: ledger.flatMap((e: any) => e.turns ?? []).filter((t: any) => t.usage).reduce((n: number, t: any) => n + (t.usage.cacheWrite ?? 0), 0), purposes: positions.length, ledgerEntries: ledger.length, attempts: ledger.length + ledger.reduce((n: number, e: any) => n + (e.recoveries?.length ?? 0), 0), namedConfirmations: ledger.filter((e: any) => e.repairCause).length, observedTurns: usage.turns, authorPreparation: ledger.filter((e: any) => e.position.startsWith("A-")).map((e: any) => ({ position: e.position, usage: e.usage, durationMs: e.durationMs, recoveries: e.recoveries, hostPostTurnFailure: e.hostPostTurnFailure })), actualUsd: null, hiddenProviderRequests: null, developerAndScoutCost: null, humanMinutes: null, unknown: ["Both A-G original interrupted turn and completed recovery turn lack usage. Totals are known lower bounds, not full-study cost.", "Original A-G unobserved downtime and billing remain unknown.", "No tariff estimate is substituted for actual USD."], comparisons: ["M0", "M1", "G0", "G1"].map(pair) }
await save(path.join(base, "accounting.json"), accounting)
const quality = { consumers: 12, delivered: review.rows.filter((r: any) => r.delivery === "delivered").length, wholeFull: review.rows.filter((r: any) => r.wholeTask === "full").length, fullDomains: review.rows.reduce((n: number, r: any) => n + Object.values(r.domains).filter(v => v === "full").length, 0), domainDenominator: 72, perTask: ["M", "G"].map(task => ({ task, wholeFull: review.rows.filter((r: any) => r.position.startsWith(task) && r.wholeTask === "full").length, consumers: 6 })) }
const ordinary = await Promise.all(["M", "G"].map(t => load(path.join(base, `verification/ordinary-${t}.json`))))
const portable = await load(path.join(base, "verification/portability.json"))
const download = await load(path.join(base, "verification/download-compatibility.json"))
const finalChecks = await load(path.join(base, "verification/final-checks.json"))
const engineeringComplete = finalChecks.checks.every((c: any) => c.exitCode === 0)
const acceptance = {
  status: "completed-with-unmet-criteria", finiteQueueComplete: true, engineeringComplete, researchGoalAchieved: false,
  axes: {
    sharedEngineering: { complete: engineeringComplete, evidence: "verification/final-checks.json", limitation: "Actual A-G post-turn crash fixed; original failure and incomplete author phase retained." },
    automaticPrograms: { complete: false, M: { steps: 30, scalarConditionalCases: 29, orderFailures: 3, whole: "partial" }, G: { steps: 7, whole: "partial", scope: "conditional field preparation under unresolved malformed route guard; missing creation/error/effect chain" }, rawSelection: "last submitted; no developer semantic edits or best-score choice" },
    naturalQuality: { complete: quality.wholeFull === 12, ...quality },
    actualAdoption: { evidence: ["evaluation/actual-use.json", "evaluation/client-packets.json", "evaluation/natural-review.json"], completeResearchBenefit: false },
    comparisons: { sameBlockEpoch: accounting.comparisons.every(p => p.sameSourceEpoch), sameRawRE: accounting.comparisons.every(p => p.sameRawRE), stableNetBenefitEstablished: false },
    ordinaryUse: { complete: ordinary.every(o => o.rows.length === 2 && o.rows.every((r: any) => r.exitCode === 0 && !r.archiveFailure && r.inspect?.exitCode === 0)) && portable.withdrawn && download.exitCode === 0, tasks: ["M", "G"], portabilityAndWithdrawal: portable.withdrawn, downloadCompatibility: download.status, limitation: "Runnable finite partial programs do not implement complete source semantics." },
    cost: { observedUsageRecorded: true, fullCostKnown: false }
  },
  lifecycle, policyBoundary: "G write requirement is experimental user policy, not upstream security intent.", targetExecutions: 0, heldOut: false, nextStageAuthorized: false
}
await save(path.join(base, "verification/acceptance-matrix.json"), acceptance)
const summary = { identity: "authorization-task-coverage-v1", ...acceptance, quality, accounting: { known: usage, actualUsd: null, namedConfirmations: accounting.namedConfirmations }, evidence: { sourceReviews: ["evaluation/M-source-review.json", "evaluation/G-source-review.json"], naturalReview: "evaluation/natural-review.json", accounting: "accounting.json", archive: "verification/evidence-bundle.json" } }
await save(path.join(base, "summary.json"), summary)
await writeFile(path.join(base, "execution.md"), `# BS finite execution record

BS0–BS22 concludes as completed-with-unmet-criteria. Fourteen registered purposes were attempted and all persisted requests are locally closed. ${accounting.namedConfirmations}/4 named confirmations were used; A-G original interruption and host recovery remain visible. No target service was executed and no BT work is started.

The shared implementation exposes original duties, bounded source candidates, actual event order and prior calls, and a readable ordinary report. A-G exposed a nested-function owner lookup crash after a completed answer. The fix retains each candidate's generating owner. Its original four checkpoints and answer were archived from persisted observations; no missing final runtime state or usage was invented, and no quality redraw replaced it.

Memos fixed the last 30-step raw. All 29 scalar/conditional cases agree with their registered outcomes, but three source-order cases still fail and complete conversion/anonymous entry proof are absent. Gitea fixed the last seven-step raw: a malformed route guard leaves all field results conditional; route details, service creation, transaction and response errors are incomplete. G1's refetch failure is not represented by that raw.

All twelve original consumer answers are reviewed against six source-first domains. Whole-task full: ${quality.wholeFull}/12; full domains: ${quality.fullDomains}/72. Partial, wrong and omitted facts remain in [the manual reviews](evaluation/natural-review.json). Read actual [client packets](evaluation/client-packets.json) and [adoption traces](evaluation/actual-use.json) alongside the grades. N-to-R includes author preparation; only same-block same-raw R-to-E can inform execution increment. M and G use different production epochs after the shared repair.

Both fixed programs ran through the ordinary CLI with original and changed inputs. The Memos portable copy reproduced its finite result; a decisive source change withdrew the old conclusion while preserving original source. Download compatibility used zero model calls. Examples: [Memos](../../../../../examples/authorization-assessment/shared-link-workflow/README.md), [Gitea](../../../../../examples/authorization-assessment/issue-create-workflow/README.md).

Known input ${usage.input}, including cache read ${usage.cacheRead} once; output ${usage.output}. ${usage.unknownTurns} observed turns lack usage. USD, hidden requests, development/scout cost, human time and unobserved interruption billing remain unknown. Local elapsed times include concurrent local work, not isolated performance evidence. See [accounting](accounting.json).

Fresh verification is retained in [final checks](verification/final-checks.json); engineering, semantic quality and research success are separate in [acceptance](verification/acceptance-matrix.json). Historical full-src failures are not claimed repaired. Originals remain locally; run \`python scripts/research/authorization-task-coverage-v1/pack.py unpack\` from the repository root to restore the hash-verified archive without overwriting changed evidence.
`, "utf8")
console.log(JSON.stringify({ quality, usage, engineeringComplete, finiteQueueComplete: true }, null, 2))
