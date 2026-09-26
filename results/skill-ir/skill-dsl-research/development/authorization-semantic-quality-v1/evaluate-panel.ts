import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createAuthorizationReviewTemplateV2, evaluateAuthorizationGenerationV3, hashAuthorizationRawOutput } from "../../../../../src/benchmarks/authorization-dsl/evaluate.ts"
import { loadPortableSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"
import { reconcileAuthorizationAttemptsFromEvents, summarizeAuthorizationAttempts } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { aggregateTokenObservations, compareTokenGroups, type UsageObservation } from "../../../../../src/measurement/token-accounting.ts"

const root = import.meta.dir, repo = path.resolve(root, "../../../../..")
const read = async (file: string) => JSON.parse(await readFile(file, "utf8"))
const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex")
const configBytes = await readFile(path.join(root, "panel-config.json"), "utf8")
const config = JSON.parse(configBytes), configSha256 = hash(configBytes)
const rubricBytes = await readFile(path.join(root, "evaluator", "rubrics.json"), "utf8")
if (hash(rubricBytes) !== config.evaluatorSha256) throw Error("Frozen evaluator rubric changed")
const rubrics = JSON.parse(rubricBytes)
const responseDetails = await read(path.join(root, "evaluator", "response-details.json"))
const evaluatorRoots = await read(path.join(root, "evaluator", "source-roots.json"))
const map = await read(path.join(root, "evaluator", "review-map.json"))
const decisions = await read(path.join(root, "evaluator", "review-decisions-adjudicated.json"))
if (map.configSha256 !== configSha256) throw Error("Review map config mismatch")

const units: any[] = []
for (const unit of config.units) {
  const item = config.cases.find((candidate: any) => candidate.id === unit.caseId)
  const rubric = rubrics.cases.find((candidate: any) => candidate.caseId === unit.caseId)
  if (!item || !rubric) throw Error("Missing case or rubric: " + unit.caseId)
  const stored = await read(path.join(root, "runs", unit.id, "unit.json"))
  if (stored.configSha256 !== configSha256) throw Error("Unit identity changed: " + unit.id)
  const session = path.join(root, "runs", unit.id, "sessions", stored.report.sessionId)
  const run = await read(path.join(session, "run.json"))
  const sourceBundle = await read(path.join(session, "source-bundle.json"))
  const lines = (await readFile(path.join(session, "events.jsonl"), "utf8")).split(/\r?\n/).filter(Boolean)
  const attempts = reconcileAuthorizationAttemptsFromEvents(run.attempts, lines.map(line => JSON.parse(line)))
  const telemetry = summarizeAuthorizationAttempts(attempts)
  const locations = [...rubric.dispositionRule.sourceLocations, ...rubric.scopeRule.sourceLocations,
    ...rubric.criteria.flatMap((criterion: any) => criterion.sourceLocations)]
  const extraPaths = [...new Set(locations.map((location: any) => location.path))]
    .filter(candidate => !sourceBundle.files.some((file: any) => file.relativePath === candidate)) as string[]
  let reviewSourceBundle
  if (extraPaths.length) {
    const provenance = await read(path.join(root, "inputs", item.id, "provenance.json"))
    const originalFile = path.join(repo, provenance.originalInput)
    const original = await read(originalFile)
    const sourceRoot = evaluatorRoots.overrides[item.id]
      ? path.join(repo, evaluatorRoots.overrides[item.id])
      : path.resolve(path.dirname(originalFile), original.sourceRoot)
    const loaded = await loadPortableSourceBundle({ sourceRoot, repository: sourceBundle.repository,
      sourceRef: sourceBundle.sourceRef, sourceFiles: extraPaths })
    if (!loaded.success) throw Error("Missing evaluator-only source: " + unit.id + JSON.stringify(loaded.diagnostics))
    reviewSourceBundle = loaded.bundle
  }
  const evaluations: Record<string, any> = {}
  for (const generation of ["initial", "repair"] as const) {
    const artifact = run[generation]
    if (!artifact) continue
    const anonymousId = Object.keys(map.map).find(id => map.map[id].unitId === unit.id && map.map[id].generation === generation)
    if (!anonymousId) throw Error("Missing blind row: " + unit.id + "/" + generation)
    if (map.map[anonymousId].rawOutputSha256 !== hashAuthorizationRawOutput(artifact.rawResponse)) throw Error("Raw answer changed: " + unit.id)
    const decision = decisions.rows[anonymousId]
    if (!decision) throw Error("Missing semantic review: " + anonymousId)
    const review = createAuthorizationReviewTemplateV2(rubric, artifact, generation, decision.reviewer ?? "AH-blind-review")
    review.criterionReviews = review.criterionReviews.map(criterion => {
      const assessment = decision.criteria[criterion.criterionId]
      if (!assessment) throw Error("Missing criterion: " + anonymousId + "/" + criterion.criterionId)
      return { ...criterion, ...assessment }
    })
    review.dispositionReview = { ...review.dispositionReview, ...decision.disposition }
    review.scopeReview = { ...review.scopeReview, ...decision.scope }
    const evaluation = evaluateAuthorizationGenerationV3({ rubric, sourceBundle, artifact, generation,
      review, responseDetails: responseDetails[item.id], reviewSourceBundle })
    if (evaluation.reviewValidation.status !== "valid") throw Error("Invalid review: " + anonymousId + JSON.stringify(evaluation.reviewValidation.diagnostics))
    evaluations[generation] = evaluation
    if (process.argv[2] !== "replay") await writeFile(path.join(root, "runs", unit.id, generation + "-review.json"), JSON.stringify(review, null, 2) + "\n")
  }
  const observations: UsageObservation[] = attempts.map((attempt: any, index: number) => ({
    id: unit.id + "/" + attempt.id, semantics: "skvm-disjoint",
    input: attempt.usage?.input ?? null, output: attempt.usage?.output ?? null,
    cacheRead: attempt.usage?.cacheRead ?? null, cacheWrite: attempt.usage?.cacheWrite ?? null,
    actualUSD: attempt.costUsd ?? null,
    evidence: path.relative(repo, session).replaceAll("\\", "/") + "/run.json#/attempts/" + index + "/usage; reconciled with events.jsonl",
  }))
  units.push({ ...unit, status: run.status, firstResponse: run.firstResponse, finalKind: run.finalKind,
    initialEvaluation: evaluations.initial ?? null, finalEvaluation: run.finalKind ? evaluations[run.finalKind] ?? null : null,
    finalConclusion: run.finalKind ? run[run.finalKind]?.result?.results?.[0]?.conclusion ?? null : null,
    telemetry, observations, fallbackCalls: attempts.filter((attempt: any) => attempt.transport === "prompt-parse").length,
    repairCalls: attempts.filter((attempt: any) => attempt.phase === "domain-repair").length,
    knownDurationMs: attempts.reduce((sum: number, attempt: any) => sum + (attempt.response?.durationMs ?? 0), 0),
    unknownDurationCalls: attempts.filter((attempt: any) => !attempt.response).length })
}

const groups: Record<string, any> = {}
for (const phase of ["initial", "repeat"] as const) for (const arm of ["M0", "D0", "M1", "D1"] as const) {
  const selected = units.filter(unit => unit.phase === phase && unit.arm === arm)
  const tokens = aggregateTokenObservations({ id: phase + "-" + arm, account: "ah-analysis",
    source: "skvm-openai-compatible-mapped-usage", semantics: "skvm-disjoint",
    evidence: "Every dispatch including fallback/repair; upstream gateway semantics not independently verified" },
    selected.flatMap(unit => unit.observations))
  groups[phase + "-" + arm] = { units: selected.length,
    completed: selected.filter(unit => unit.status === "completed").length,
    completionUnknown: selected.filter(unit => String(unit.status).includes("unknown")).length,
    firstSchemaValid: selected.filter(unit => unit.firstResponse?.schemaValid).length,
    firstDeliveryComplete: selected.filter(unit => unit.firstResponse?.deliveryComplete).length,
    firstFullSuccess: selected.filter(unit => unit.initialEvaluation?.qualityStatus === "full-success").length,
    finalFullSuccess: selected.filter(unit => unit.finalEvaluation?.qualityStatus === "full-success").length,
    semanticDecisionCorrect: selected.filter(unit => unit.finalEvaluation?.semanticDecisionCorrect).length,
    necessarySupported: selected.filter(unit => unit.finalEvaluation?.dimensions?.necessarySemantics === "supported").length,
    providerCalls: selected.reduce((sum, unit) => sum + (unit.telemetry?.providerCalls ?? 0), 0),
    fallbackCalls: selected.reduce((sum, unit) => sum + unit.fallbackCalls, 0),
    repairCalls: selected.reduce((sum, unit) => sum + unit.repairCalls, 0),
    knownDurationMs: selected.reduce((sum, unit) => sum + unit.knownDurationMs, 0),
    unknownDurationCalls: selected.reduce((sum, unit) => sum + unit.unknownDurationCalls, 0), tokens }
}
const contrasts = []
for (const phase of ["initial", "repeat"] as const) for (const [baseline, candidate] of [["M0", "M1"], ["D0", "D1"], ["M1", "D1"], ["M0", "D0"]] as const) {
  const a = groups[phase + "-" + baseline], b = groups[phase + "-" + candidate]
  contrasts.push({ phase, baseline, candidate, fullSuccessDifference: b.finalFullSuccess - a.finalFullSuccess,
    firstFullSuccessDifference: b.firstFullSuccess - a.firstFullSuccess,
    tokenComparison: compareTokenGroups(a.tokens, b.tokens) })
}
const summary = { schemaVersion: "authorization-ah-panel-summary/v1", configSha256,
  generationClosedBeforeReview: true, cases: config.cases.length, plannedUnits: config.units.length,
  evaluatedUnits: units.length, groups, contrasts, units, evaluationProviderCalls: 0, targetExecutions: 0,
  limitations: ["Public development evidence, not held-out.", "Schema validity alone does not prove semantics.",
    "Mapped adapter tokens; upstream gateway usage and actual USD may be unavailable.",
    "Author human minutes and development-agent token use unavailable."] }
const serialized = JSON.stringify(summary, null, 2) + "\n", output = path.join(root, "panel-summary.json")
if (process.argv[2] === "replay") {
  if (await readFile(output, "utf8") !== serialized) throw Error("Offline replay differs")
  console.log(JSON.stringify({ status: "reproduced", sha256: hash(serialized), providerCalls: 0 }))
} else {
  await writeFile(output, serialized)
  console.log(JSON.stringify(Object.fromEntries(Object.entries(groups).map(([id, group]) => [id, {
    full: group.finalFullSuccess, firstFull: group.firstFullSuccess, calls: group.providerCalls,
    prompt: group.tokens.metrics.promptTokens, total: group.tokens.metrics.totalTokens }]))))
}
