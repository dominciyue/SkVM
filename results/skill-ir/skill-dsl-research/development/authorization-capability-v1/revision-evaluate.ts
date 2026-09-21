import { createHash } from "node:crypto"
import path from "node:path"
import {
  AuthorizationEvaluationRubricsV2Schema,
  createAuthorizationReviewTemplateV2,
  evaluateAuthorizationGenerationV2,
} from "../../../../../src/benchmarks/authorization-dsl/evaluate.ts"
import { loadPortableSourceBundle } from "../../../../../src/benchmarks/authorization-dsl/inputs.ts"

const repositoryRoot = process.cwd()
const evidenceRoot = path.join(
  repositoryRoot,
  "results/skill-ir/skill-dsl-research/development/authorization-capability-v1",
)
const runRoot = path.join(evidenceRoot, "runs/x11-conclusion-contract-v1")

async function readText(candidate: string): Promise<string> {
  return Bun.file(candidate).text()
}

async function readJson(candidate: string): Promise<any> {
  return JSON.parse(await readText(candidate))
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function rubricSourcePaths(rubric: any): string[] {
  return [...new Set<string>([
    ...rubric.dispositionRule.sourceLocations.map((location: any) => location.path),
    ...rubric.scopeRule.sourceLocations.map((location: any) => location.path),
    ...rubric.criteria.flatMap((criterion: any) => criterion.sourceLocations.map((location: any) => location.path)),
  ])].sort()
}

function operationFor(run: any) {
  const responses = run.attempts.filter((attempt: any) => attempt.response !== undefined)
  return {
    providerCalls: run.attempts.length,
    schemaToolCalls: run.attempts.filter((attempt: any) => attempt.transport === "schema-tool").length,
    promptParseCalls: run.attempts.filter((attempt: any) => attempt.transport === "prompt-parse").length,
    domainRepairCalls: run.attempts.filter((attempt: any) => attempt.phase === "domain-repair").length,
    unknownElapsedCalls: run.attempts.length - responses.length,
    knownElapsedMsSubtotal: responses.reduce(
      (sum: number, attempt: any) => sum + attempt.response.durationMs,
      0,
    ),
    knownTokens: { ...run.telemetry.knownTokens },
    unknownUsageCalls: run.telemetry.unknownUsageCalls,
    knownActualUsdSubtotal: run.telemetry.knownActualUsdSubtotal,
    totalActualUsd: run.telemetry.totalActualUsd,
    unknownCostCalls: run.telemetry.unknownCostCalls,
  }
}

function countCitations(artifact: any): number {
  return artifact.result.results.reduce(
    (total: number, result: any) => total + Object.values(result.facts)
      .flat()
      .reduce((sum: number, fact: any) => sum + fact.citations.length, 0),
    0,
  )
}

function summarize(units: any[]) {
  const summary = {
    units: units.length,
    completed: 0,
    firstResponseAccepted: 0,
    firstValid: 0,
    fullSuccess: 0,
    partial: 0,
    incorrect: 0,
    labelCorrect: 0,
    semanticDecisionCorrect: 0,
    necessarySupported: 0,
    coverageValid: 0,
    citations: 0,
    providerCalls: 0,
    schemaToolCalls: 0,
    promptParseCalls: 0,
    domainRepairCalls: 0,
    unknownElapsedCalls: 0,
    knownElapsedMsSubtotal: 0,
    knownTokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    unknownUsageCalls: 0,
    knownActualUsdSubtotal: 0,
    totalActualUsd: null as number | null,
    unknownCostCalls: 0,
  }
  for (const unit of units) {
    if (unit.runStatus === "completed") summary.completed += 1
    if (unit.firstResponseAccepted) summary.firstResponseAccepted += 1
    if (unit.firstValidCall !== null) summary.firstValid += 1
    if (unit.qualityStatus === "full-success") summary.fullSuccess += 1
    if (unit.qualityStatus === "partial") summary.partial += 1
    if (unit.qualityStatus === "incorrect") summary.incorrect += 1
    if (unit.labelCorrect) summary.labelCorrect += 1
    if (unit.semanticDecisionCorrect === true) summary.semanticDecisionCorrect += 1
    if (unit.dimensions.necessarySemantics === "supported") summary.necessarySupported += 1
    if (unit.coverage.status === "valid") summary.coverageValid += 1
    summary.citations += unit.citations
    for (const key of [
      "providerCalls",
      "schemaToolCalls",
      "promptParseCalls",
      "domainRepairCalls",
      "unknownElapsedCalls",
      "knownElapsedMsSubtotal",
      "unknownUsageCalls",
      "knownActualUsdSubtotal",
      "unknownCostCalls",
    ] as const) summary[key] += unit.operation[key]
    for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
      summary.knownTokens[key] += unit.operation.knownTokens[key]
    }
  }
  summary.totalActualUsd = summary.unknownCostCalls === 0 ? summary.knownActualUsdSubtotal : null
  return summary
}

const revisionConfigPath = path.join(evidenceRoot, "revision-config-v1.json")
const revisionReviewPlanPath = path.join(evidenceRoot, "revision-review-plan-v1.json")
const initialConfigPath = path.join(evidenceRoot, "experiment-config-v1.json")
const revisionConfigBytes = await readText(revisionConfigPath)
const revisionConfig = JSON.parse(revisionConfigBytes)
const reviewPlanBytes = await readText(revisionReviewPlanPath)
const reviewPlan = JSON.parse(reviewPlanBytes)
const initialConfigBytes = await readText(initialConfigPath)
const initialConfig = JSON.parse(initialConfigBytes)
const policyPlanBytes = await readText(path.join(repositoryRoot, reviewPlan.casePolicySource.path))
const policyPlan = JSON.parse(policyPlanBytes)

if (sha256(revisionConfigBytes) !== reviewPlan.revisionConfigSha256) {
  throw new Error("Revision review plan is not bound to revision-config-v1.json.")
}
if (sha256(initialConfigBytes) !== revisionConfig.initialPanel.configSha256) {
  throw new Error("Initial experiment config digest differs from the revision declaration.")
}
if (sha256(policyPlanBytes) !== reviewPlan.casePolicySource.sha256) {
  throw new Error("Case review policy digest differs from the revision review plan.")
}
if (revisionConfig.units.length !== reviewPlan.units.length) {
  throw new Error("Revision config and review plan unit counts differ.")
}

const rubrics = AuthorizationEvaluationRubricsV2Schema.parse(
  await readJson(path.join(repositoryRoot, revisionConfig.evaluation.rubrics)),
)
const units: any[] = []

for (const binding of reviewPlan.units) {
  const configured = revisionConfig.units.find((unit: any) => unit.id === binding.unitId)
  if (!configured || configured.caseId !== binding.caseId || configured.arm !== binding.arm) {
    throw new Error(`Revision unit identity mismatch: ${binding.unitId}`)
  }
  const sessionRoot = path.join(runRoot, ...binding.sessionRelativePath.split("/"))
  const run = await readJson(path.join(sessionRoot, "run.json"))
  const sourceBundle = await readJson(path.join(sessionRoot, "source-bundle.json"))
  const rubric = rubrics.cases.find(candidate => candidate.caseId === binding.caseId)
  const policy = policyPlan.cases.find((candidate: any) => candidate.caseId === binding.caseId)
  const initialCase = initialConfig.cases.find((candidate: any) => candidate.caseId === binding.caseId)
  if (!rubric || !policy || !initialCase || run.finalKind !== binding.generation) {
    throw new Error(`Revision evaluation prerequisites are missing for ${binding.unitId}.`)
  }
  const artifact = run[binding.generation]
  const review = createAuthorizationReviewTemplateV2(
    rubric,
    artifact,
    binding.generation,
    reviewPlan.reviewer.identity,
  )
  if (review.attemptId !== binding.attemptId || review.rawOutputSha256 !== binding.rawOutputSha256) {
    throw new Error(`Revision raw output binding differs for ${binding.unitId}.`)
  }
  const policyByCriterion = new Map(policy.criterionReviews.map((item: any) => [item.criterionId, item]))
  review.criterionReviews = review.criterionReviews.map(criterion => ({
    ...criterion,
    ...policyByCriterion.get(criterion.criterionId),
  }))
  review.dispositionReview = { ...review.dispositionReview, ...policy.dispositionReview }
  review.scopeReview = { ...review.scopeReview, ...policy.scopeReview }

  const modelPaths = new Set(sourceBundle.files.map((file: any) => file.relativePath))
  const missingPaths = rubricSourcePaths(rubric).filter(candidate => !modelPaths.has(candidate))
  let reviewSourceBundle
  if (missingPaths.length > 0) {
    const loaded = await loadPortableSourceBundle({
      sourceRoot: path.join(repositoryRoot, initialCase.sourceRoot),
      repository: sourceBundle.repository,
      sourceRef: sourceBundle.sourceRef,
      sourceFiles: missingPaths,
    })
    if (!loaded.success) throw new Error(`Evaluator sources failed for ${binding.unitId}.`)
    reviewSourceBundle = loaded.bundle
  }
  const evaluation = evaluateAuthorizationGenerationV2({
    rubric,
    sourceBundle,
    artifact,
    generation: binding.generation,
    review,
    ...(reviewSourceBundle ? { reviewSourceBundle } : {}),
  })
  if (evaluation.reviewValidation.status !== "valid") {
    throw new Error(`Revision review is invalid for ${binding.unitId}.`)
  }
  const unitRoot = path.join(runRoot, "units", binding.unitId)
  await Bun.write(path.join(unitRoot, "review.initial.json"), `${JSON.stringify(review, null, 2)}\n`)
  await Bun.write(path.join(unitRoot, "evaluation.initial.json"), `${JSON.stringify(evaluation, null, 2)}\n`)

  const outputAttemptIndex = run.attempts.findIndex((attempt: any) => attempt.id === artifact.outputAttemptId)
  units.push({
    id: binding.unitId,
    caseId: binding.caseId,
    repository: artifact.result.repository,
    arm: binding.arm,
    generation: binding.generation,
    sessionRelativePath: binding.sessionRelativePath,
    runStatus: run.status,
    actualDisposition: evaluation.actualDisposition,
    expectedDisposition: evaluation.expectedDisposition,
    labelCorrect: evaluation.labelCorrect,
    semanticDecisionCorrect: evaluation.semanticDecisionCorrect,
    taskDecisionCorrect: evaluation.taskDecisionCorrect,
    qualityStatus: evaluation.qualityStatus,
    dimensions: evaluation.dimensions,
    scopeHonesty: evaluation.scopeHonesty,
    transportValid: evaluation.transportValid,
    deliveryComplete: evaluation.deliveryComplete,
    reviewValidation: evaluation.reviewValidation.status,
    firstResponseAccepted: outputAttemptIndex === 0,
    firstValidCall: outputAttemptIndex < 0 ? null : outputAttemptIndex + 1,
    repairUsed: run.finalKind === "repair",
    coverage: artifact.coverageValidation
      ? {
          status: artifact.coverageValidation.status,
          declared: artifact.coverageValidation.declared,
          addressed: artifact.coverageValidation.addressed,
          unknown: artifact.coverageValidation.unknown,
          notApplicable: artifact.coverageValidation.notApplicable,
          missing: artifact.coverageValidation.missing.length,
        }
      : { status: "missing", declared: 0, addressed: 0, unknown: 0, notApplicable: 0, missing: 0 },
    citations: countCitations(artifact),
    operation: operationFor(run),
    reviewPath: `units/${binding.unitId}/review.initial.json`,
    evaluationPath: `units/${binding.unitId}/evaluation.initial.json`,
  })
}

const preflightResult = await readJson(path.join(
  runRoot,
  "units/01-text-B/sessions/20260921T151159911Z-63848290/result.json",
))
const pairs = ["owui-process-text-controlled", "fastapi-items-foreign-update"].map(caseId => {
  const baseline = units.find(unit => unit.caseId === caseId && unit.arm === "B")
  const domain = units.find(unit => unit.caseId === caseId && unit.arm === "D")
  return {
    caseId,
    B: { unitId: baseline.id, qualityStatus: baseline.qualityStatus, labelCorrect: baseline.labelCorrect },
    D: { unitId: domain.id, qualityStatus: domain.qualityStatus, labelCorrect: domain.labelCorrect },
    differenceDMinusB: {
      providerCalls: domain.operation.providerCalls - baseline.operation.providerCalls,
      inputTokens: domain.operation.knownTokens.input - baseline.operation.knownTokens.input,
      outputTokens: domain.operation.knownTokens.output - baseline.operation.knownTokens.output,
      cacheReadTokens: domain.operation.knownTokens.cacheRead - baseline.operation.knownTokens.cacheRead,
      cacheWriteTokens: domain.operation.knownTokens.cacheWrite - baseline.operation.knownTokens.cacheWrite,
      knownElapsedMsSubtotal: domain.operation.knownElapsedMsSubtotal - baseline.operation.knownElapsedMsSubtotal,
    },
  }
})

const report = {
  schemaVersion: "authorization-capability-revision-evaluation/v1",
  status: "completed",
  modelCallsDuringEvaluation: 0,
  targetExecutions: 0,
  revisionConfigSha256: sha256(revisionConfigBytes),
  reviewPlanSha256: sha256(reviewPlanBytes),
  implementationRevision: revisionConfig.implementationRevision,
  initialPanel: revisionConfig.initialPanel,
  intervention: revisionConfig.intervention,
  reviewer: reviewPlan.reviewer,
  units,
  overall: summarize(units),
  byArm: {
    B: summarize(units.filter(unit => unit.arm === "B")),
    D: summarize(units.filter(unit => unit.arm === "D")),
  },
  pairs,
  preGenerationFailures: [{
    unitId: "01-text-B",
    sessionId: preflightResult.sessionId,
    status: preflightResult.status,
    providerCalls: 0,
    reason: "The ordinary entry did not receive the repository-local SKVM_CACHE route before provider creation; the preserved session has no dispatch artifact and was retried only after setting the frozen panel's route location.",
  }],
  conclusion: {
    observed: "All four bounded revision units used source_refuted and received full-success with supported necessary semantics and valid relation coverage.",
    limit: "This single four-unit revision observation supports the shared-contract defect diagnosis but does not replace the 23-unit initial panel or establish general reliability.",
    furtherRevisionCalls: 0,
  },
  diagnostics: [],
}

await Bun.write(path.join(runRoot, "revision-evaluation-v1.json"), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify({ status: report.status, overall: report.overall, pairs: report.pairs }, null, 2))
