import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { createAuthorizationReviewTemplateV2, evaluateAuthorizationGenerationV3, hashAuthorizationRawOutput } from "../../../../../src/benchmarks/authorization-dsl/evaluate.ts"
import { reconcileAuthorizationAttemptsFromEvents, summarizeAuthorizationAttempts } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { loadPortableSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { aggregateTokenObservations, compareTokenGroups, type UsageObservation } from "../../../../../src/measurement/token-accounting.ts"
const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const read = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const bytes = await readFile(path.join(root, "panel-config.json"), "utf8"), config = JSON.parse(bytes)
for (const unit of config.units) await read(path.join(root, "runs", unit.id, "unit.json"))
const plan = await read(path.join(root, "evaluator/review-decisions.json"))
const correction = await read(path.join(root, "evaluator-source-root-correction.json"))
const rubrics = new Map<string, any[]>()
for (const c of config.cases) if (!rubrics.has(c.evaluator.path)) {
  const raw = await readFile(path.join(repo, c.evaluator.path), "utf8")
  if (createHash("sha256").update(raw).digest("hex") !== c.evaluator.sha256) throw Error("Rubric changed")
  rubrics.set(c.evaluator.path, JSON.parse(raw).cases)
}
const units: any[] = []
for (const unit of config.units) {
  const c = config.cases.find((c: any) => c.id === unit.caseId)
  const stored = await read(path.join(root, "runs", unit.id, "unit.json"))
  const session = path.join(root, "runs", unit.id, "sessions", stored.report.sessionId)
  const run = await read(path.join(session, "run.json")).catch(() => null)
  if (!run) { units.push({ ...unit, status: stored.report.status, evaluation: null, observations: [], unmeasuredUnit: true }); continue }
  const sourceBundle = await read(path.join(session, "source-bundle.json"))
  const events = (await readFile(path.join(session, "events.jsonl"), "utf8")).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  const attempts = reconcileAuthorizationAttemptsFromEvents(run.attempts, events), telemetry = summarizeAuthorizationAttempts(attempts)
  const artifact = run.finalKind ? run[run.finalKind] : undefined
  const decision = plan.units[unit.id]
  let evaluation: any = null
  if (artifact) {
    const { responseDetails, ...rubric } = rubrics.get(c.evaluator.path)!.find((r: any) => r.taskId === c.taskId)
    if (!decision || decision.rawOutputSha256 !== hashAuthorizationRawOutput(artifact.rawResponse)) throw Error(`Missing/stale review ${unit.id}`)
    const review = createAuthorizationReviewTemplateV2(rubric, artifact, run.finalKind, "AE-development-agent")
    review.criterionReviews = review.criterionReviews.map(item => {
      const d = decision.criteria[item.criterionId]
      if (!d) throw Error(`Missing criterion ${unit.id}/${item.criterionId}`)
      return { ...item, status: d.status, answerLocation: d.answerLocation, reason: d.reason }
    })
    review.dispositionReview = { ...review.dispositionReview, ...decision.disposition }
    review.scopeReview = { ...review.scopeReview, ...decision.scope }
    const extraPaths = [...new Set([...rubric.dispositionRule.sourceLocations, ...rubric.scopeRule.sourceLocations, ...rubric.criteria.flatMap((q: any) => q.sourceLocations)].map((l: any) => l.path))].filter(p => !sourceBundle.files.some((f: any) => f.relativePath === p)) as string[]
    let reviewSourceBundle
    if (extraPaths.length) {
      const sourceRoot = correction.cases.includes(c.id) ? correction.effectiveSourceRoot : c.evaluator.sourceRoot
      const loaded = await loadPortableSourceBundle({ sourceRoot: path.join(repo, sourceRoot), repository: sourceBundle.repository, sourceRef: sourceBundle.sourceRef, sourceFiles: extraPaths })
      if (!loaded.success) throw Error(JSON.stringify(loaded.diagnostics))
      reviewSourceBundle = loaded.bundle
    }
    evaluation = evaluateAuthorizationGenerationV3({ rubric, sourceBundle, artifact, generation: run.finalKind, review, responseDetails, reviewSourceBundle })
    if (evaluation.reviewValidation.status !== "valid") throw Error(JSON.stringify(evaluation.reviewValidation))
    if (!process.argv.includes("--replay")) await writeFile(path.join(root, "runs", unit.id, "review.json"), JSON.stringify(review, null, 2) + "\n")
  }
  const observations: UsageObservation[] = attempts.map((attempt, index) => ({ id: `${unit.id}/${attempt.id}`, semantics: "skvm-disjoint", input: attempt.usage?.input ?? null, output: attempt.usage?.output ?? null, cacheRead: attempt.usage?.cacheRead ?? null, cacheWrite: attempt.usage?.cacheWrite ?? null, actualUSD: attempt.costUsd ?? null, evidence: `${path.relative(repo, session).replaceAll("\\", "/")}/run.json#/attempts/${index}/usage; reconciled with events.jsonl` }))
  units.push({ ...unit, status: run.status, firstResponse: run.firstResponse, canonicalConclusion: artifact?.result.results[0]?.conclusion ?? null, modelPolicyStatus: unit.wire === "v5" ? artifact?.wireResult.results[0]?.policyStatus ?? null : null, evaluation, actualDecisionCorrect: decision?.actualDecisionCorrect ?? null, actualDecision: decision?.actualDecision ?? null, justifiedUnknown: decision?.justifiedUnknown ?? null, firstDeliveredQuality: run.firstResponse?.deliveryComplete && run.finalKind === "initial" ? evaluation?.qualityStatus ?? "unreviewed" : "not-delivered", telemetry, fallbackCalls: attempts.filter(a => a.transport === "prompt-parse").length, repairCalls: attempts.filter(a => a.phase === "domain-repair").length, knownDurationMs: attempts.reduce((n, a) => n + (a.response?.durationMs ?? 0), 0), unknownDurationCalls: attempts.filter(a => !a.response).length, observations })
}
const groups: Record<string, any> = {}
for (const arm of ["markdown", "dsl"]) for (const wire of ["v4", "v5"]) {
  const id = `${arm}-${wire}`, selected = units.filter(u => u.arm === arm && u.wire === wire), evaluated = selected.filter(u => u.evaluation)
  const tokens = aggregateTokenObservations({ id, account: "ae-analysis", source: "skvm-openai-compatible-mapped-usage", semantics: "skvm-disjoint", evidence: "src/providers/openai-compatible.ts:263-277; every actual dispatch, including fallback/repair and missing response; gateway upstream semantics not independently verified" }, selected.flatMap(u => u.observations))
  groups[id] = { units: selected.length, completed: selected.filter(u => u.status === "completed").length, completionUnknown: selected.filter(u => u.status.includes("unknown")).length, firstSchemaValid: selected.filter(u => u.firstResponse?.schemaValid).length, firstDeliveryComplete: selected.filter(u => u.firstResponse?.deliveryComplete).length, reviewed: evaluated.length, semanticDecisionCorrect: evaluated.filter(u => u.evaluation.semanticDecisionCorrect).length, actualDecisionCorrect: selected.filter(u => u.actualDecisionCorrect === true).length, necessarySupported: evaluated.filter(u => u.evaluation.dimensions.necessarySemantics === "supported").length, explanationComplete: evaluated.filter(u => u.evaluation.dimensions.explanationCompleteness === "complete").length, fullSuccess: evaluated.filter(u => u.evaluation.qualityStatus === "full-success").length, firstDeliveredFullSuccess: selected.filter(u => u.firstDeliveredQuality === "full-success").length, reverseLabelErrors: selected.filter(u => u.actualDecisionCorrect && u.evaluation && !u.evaluation.semanticDecisionCorrect).map(u => u.id), providerCalls: selected.reduce((n, u) => n + (u.telemetry?.providerCalls ?? 0), 0), fallbackCalls: selected.reduce((n, u) => n + (u.fallbackCalls ?? 0), 0), repairCalls: selected.reduce((n, u) => n + (u.repairCalls ?? 0), 0), knownDurationMs: selected.reduce((n, u) => n + (u.knownDurationMs ?? 0), 0), unknownDurationCalls: selected.reduce((n, u) => n + (u.unknownDurationCalls ?? 0), 0), tokens }
}
const comparisons = [ ["markdown-v4", "markdown-v5"], ["dsl-v4", "dsl-v5"], ["markdown-v4", "dsl-v4"], ["markdown-v5", "dsl-v5"] ].map(([a, b]) => ({ baseline: a, candidate: b, tokens: compareTokenGroups(groups[a!].tokens, groups[b!].tokens), durationPercentChange: groups[a!].unknownDurationCalls || groups[b!].unknownDurationCalls ? null : (groups[b!].knownDurationMs / groups[a!].knownDurationMs - 1) * 100 }))
const summary = { schemaVersion: "authorization-ae-panel-summary/v1", configSha256: createHash("sha256").update(bytes).digest("hex"), generationClosedBeforeReview: true, evaluatorSourceRootCorrection: "evaluator-source-root-correction.json", groups, comparisons, units, evaluationProviderCalls: 0, targetExecutions: 0, limitations: ["Development mechanism panel, one observation per factor/case; no production or general reliability claim.", "Mapped usage reconstructs adapter prompt, not independently verified gateway raw usage. Actual USD unreported; missing counts remain null.", "No author/developer cost or human time savings inferred."] }
const serialized = JSON.stringify(summary, null, 2) + "\n", output = path.join(root, "panel-summary.json")
if (process.argv.includes("--replay")) { if (await readFile(output, "utf8") !== serialized) throw Error("Replay differs"); console.log(JSON.stringify({ status: "reproduced", sha256: createHash("sha256").update(serialized).digest("hex"), providerCalls: 0 })) }
else { await writeFile(output, serialized); console.log(JSON.stringify(Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, { full: g.fullSuccess, labelCorrect: g.semanticDecisionCorrect, reasoningCorrect: g.actualDecisionCorrect, calls: g.providerCalls, prompt: g.tokens.metrics.promptTokens, total: g.tokens.metrics.totalTokens }])), null, 2)) }
