import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { createAuthorizationReviewTemplateV2, evaluateAuthorizationGenerationV3, hashAuthorizationRawOutput } from "../../../../../src/benchmarks/authorization-dsl/evaluate.ts"
import { reconcileAuthorizationAttemptsFromEvents, summarizeAuthorizationAttempts } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { loadPortableSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
const root = import.meta.dir
const repo = path.resolve(root, "../../../../..")
const read = async (p: string) => JSON.parse(await readFile(p, "utf8"))
const configFile = process.argv.find(a => a.startsWith("--config="))?.slice(9) ?? "panel-config.json"
const config = await read(path.join(root, configFile))
const summaryFile = config.summaryFile ?? "panel-summary.json"
const rubricBytes = await readFile(path.join(root, "evaluator/rubrics-v3.json"), "utf8")
if (createHash("sha256").update(rubricBytes).digest("hex") !== config.evaluatorSha256) throw new Error("Frozen rubric changed")
const rubrics = JSON.parse(rubricBytes).cases
// Do not review a partial panel: every unit must have its immutable terminal record first.
for (const unit of config.units) await read(path.join(root, "runs", unit.id, "unit.json"))
const plan = await read(path.join(root, config.reviewDecisions ?? "evaluator/review-decisions.json"))
const units = []
for (const unit of config.units) {
  const stored = await read(path.join(root, "runs", unit.id, "unit.json"))
  // Stored absolute paths are provenance, not a dependency for offline replay.
  const session = path.join(root, "runs", unit.id, "sessions", stored.report.sessionId)
  const run = await read(path.join(session, "run.json"))
  const sourceBundle = await read(path.join(session, "source-bundle.json"))
  const events = (await readFile(path.join(session, "events.jsonl"), "utf8")).trim().split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s))
  const attempts = reconcileAuthorizationAttemptsFromEvents(run.attempts, events)
  const telemetry = summarizeAuthorizationAttempts(attempts)
  const artifact = run.finalKind ? run[run.finalKind] : undefined
  let evaluation: unknown = null
  if (artifact) {
    const { responseDetails, ...rubric } = rubrics.find((c: any) => c.taskId === run.compiled.task.taskId)
    const decision = plan.units[unit.id]
    if (!decision || decision.rawOutputSha256 !== hashAuthorizationRawOutput(artifact.rawResponse)) throw new Error(`Missing or stale semantic review ${unit.id}`)
    const review = createAuthorizationReviewTemplateV2(rubric, artifact, run.finalKind, "AA-development-agent")
    review.criterionReviews = review.criterionReviews.map(c => {
      const d = decision.criteria[c.criterionId]
      if (!d) throw new Error(`Missing criterion ${unit.id}/${c.criterionId}`)
      return { ...c, status: d.status, answerLocation: d.answerLocation, reason: d.reason }
    })
    review.dispositionReview = { ...review.dispositionReview, ...decision.disposition }
    review.scopeReview = { ...review.scopeReview, ...decision.scope }
    const extraPaths = [...new Set([...rubric.dispositionRule.sourceLocations, ...rubric.scopeRule.sourceLocations, ...rubric.criteria.flatMap((c: any) => c.sourceLocations)].map((l: any) => l.path))].filter(p => !sourceBundle.files.some((f: any) => f.relativePath === p)) as string[]
    let reviewSourceBundle
    if (extraPaths.length) {
      const loaded = await loadPortableSourceBundle({ sourceRoot: path.join(repo, "results/skill-ir/skill-dsl-research/cases/authorization"), repository: sourceBundle.repository, sourceRef: sourceBundle.sourceRef, sourceFiles: extraPaths })
      if (!loaded.success) throw new Error(JSON.stringify(loaded.diagnostics))
      reviewSourceBundle = loaded.bundle
    }
    const evaluated = evaluateAuthorizationGenerationV3({ rubric, sourceBundle, artifact, generation: run.finalKind, review, responseDetails, reviewSourceBundle })
    if (evaluated.reviewValidation.status !== "valid") throw new Error(JSON.stringify(evaluated.reviewValidation))
    evaluation = evaluated
    await writeFile(path.join(root, "runs", unit.id, "review.json"), JSON.stringify(review, null, 2) + "\n", "utf8")
  }
  units.push({ ...unit, status: run.status, firstResponse: run.firstResponse,
    firstDeliveredQuality: run.firstResponse.deliveryComplete && run.finalKind === "initial" ? (evaluation as any)?.qualityStatus ?? "unreviewed" : "not-delivered",
    evaluation, telemetry,
    fallbackCalls: attempts.filter(a => a.transport === "prompt-parse").length,
    repairCalls: attempts.filter(a => a.phase === "domain-repair").length,
    lateSettlements: attempts.filter(a => a.lateSettlement).map(a => ({ attemptId: a.id, kind: a.lateSettlement!.kind, durationMs: a.response?.durationMs ?? null })),
    knownDurationMs: attempts.reduce((n, a) => n + (a.response?.durationMs ?? 0), 0),
    responseCountAtReturn: run.telemetry.respondedCalls,
    promptCharacters: run.promptCharacters,
    finalOutputCharacters: artifact?.rawResponse.length ?? null,
  })
}
const groups = Object.fromEntries(["plain", "ledger", "conditions"].map(wire => {
  const selected = units.filter(u => u.method === wire)
  const evaluations = selected.map(u => u.evaluation).filter(Boolean) as any[]
  return [wire, { units: selected.length, completed: selected.filter(u => u.status === "completed").length, completionUnknown: selected.filter(u => u.status.includes("unknown")).length,
    firstSchemaValid: selected.filter(u => u.firstResponse.schemaValid).length, firstDeliveryComplete: selected.filter(u => u.firstResponse.deliveryComplete).length,
    reviewed: evaluations.length, semanticDecisionCorrect: evaluations.filter(e => e.semanticDecisionCorrect).length,
    necessarySupported: evaluations.filter(e => e.dimensions.necessarySemantics === "supported").length,
    fullSuccess: evaluations.filter(e => e.qualityStatus === "full-success").length,
    firstDeliveredFullSuccess: selected.filter(u => u.firstDeliveredQuality === "full-success").length,
    conditionExplanationComplete: evaluations.filter(e => e.dimensions.explanationCompleteness === "complete").length,
    responseDetailComplete: evaluations.filter(e => e.dimensions.responseDetails === "complete").length,
    providerCalls: selected.reduce((n, u) => n + u.telemetry.providerCalls, 0), fallbackCalls: selected.reduce((n, u) => n + u.fallbackCalls, 0), repairCalls: selected.reduce((n, u) => n + u.repairCalls, 0),
    knownTokens: Object.fromEntries(["input", "output", "cacheRead", "cacheWrite"].map(k => [k, selected.reduce((n, u) => n + (u.telemetry.knownTokens as any)[k], 0)])),
    unknownUsageCalls: selected.reduce((n, u) => n + u.telemetry.unknownUsageCalls, 0), knownDurationMs: selected.reduce((n, u) => n + u.knownDurationMs, 0), actualUSD: null,
  }]
}))
const summary = { schemaVersion: "authorization-protocol-panel-summary/v1", configSha256: createHash("sha256").update(await readFile(path.join(root, configFile))).digest("hex"), generationClosedBeforeReview: true, groups, units, evaluationProviderCalls: 0, targetExecutions: 0 }
const serialized = JSON.stringify(summary, null, 2) + "\n"
if (process.argv.includes("--replay")) {
  const previous = await readFile(path.join(root, summaryFile), "utf8")
  if (previous !== serialized) throw new Error("Replay differs from retained summary")
  console.log(JSON.stringify({ status: "reproduced", sha256: createHash("sha256").update(serialized).digest("hex"), providerCalls: 0 }))
} else {
  await writeFile(path.join(root, summaryFile), serialized, "utf8")
  console.log(JSON.stringify(groups, null, 2))
}
