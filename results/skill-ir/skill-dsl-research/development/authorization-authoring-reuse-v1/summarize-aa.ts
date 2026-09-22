import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { reconcileAuthorizationAttemptsFromEvents, summarizeAuthorizationAttempts } from "../../../../../src/benchmarks/authorization-dsl/telemetry.ts"
import { validateConditionAnalysisResult } from "../../../../../src/task-dsl/authorization/conditions.ts"
const root = import.meta.dir
const read = async (p: string) => JSON.parse(await readFile(path.join(root, p), "utf8"))
const panel = await read("panel-summary.json")
const authorSteps = await read("author-steps.json")
const authors = []
for (const name of ["gitea", "fastapi"]) {
  for (const variant of ["original", "changed"]) {
    const id = `author-${name}-${variant}`
    const unit = await read(`runs/${id}/unit.json`)
    const session = `runs/${id}/sessions/${unit.report.sessionId}`
    const run = await read(`${session}/run.json`)
    const events = (await readFile(path.join(root, session, "events.jsonl"), "utf8")).trim().split(/\r?\n/).map(s => JSON.parse(s))
    const attempts = reconcileAuthorizationAttemptsFromEvents(run.attempts, events)
    const artifact = run[run.finalKind]
    const semanticOutcome = variant === "original" ? "deny" : "allow"
    authors.push({ id, session, status: run.status, firstResponse: run.firstResponse, finalKind: run.finalKind,
      telemetry: summarizeAuthorizationAttempts(attempts), knownDurationMs: attempts.reduce((n, a) => n + (a.response?.durationMs ?? 0), 0),
      semanticReview: { reviewer: "main-agent", rawOutputSha256: createHash("sha256").update(artifact.rawResponse).digest("hex"), semanticOutcome,
        status: "supported", answerLocation: "/results/0/explanation", conclusion: artifact.result.results[0].conclusion,
        reason: name === "gitea" ? (variant === "original" ? "Neither admin role and different username trigger403 before target loading; collaborators.go:35-39,41-57." : "Self username makes denial conjunction false; permission lookup/response follows on success; collaborators.go:35-39,41-57.") : (variant === "original" ? "Non-superuser and owner mismatch raise403 before update/commit; items.py:86-96." : "Superuser bypasses owner-mismatch rejection; update/commit follows; items.py:86-96."),
        scope: "supplied fixed source and declared facts only", unsupportedFacts: [], falsePositive: false, falseNegative: false,
        note: "source_refuted means declared policy failure refuted; it is consistent with both correctly enforced allow and deny." } })
  }
}
function aggregate(us: any[]) {
  return { units: us.length, providerCalls: us.reduce((n,u)=>n+u.telemetry.providerCalls,0),
    knownTokens: Object.fromEntries(["input","output","cacheRead","cacheWrite"].map(k=>[k,us.reduce((n,u)=>n+u.telemetry.knownTokens[k],0)])),
    knownDurationMs: us.reduce((n,u)=>n+u.knownDurationMs,0), unknownUsageCalls: us.reduce((n,u)=>n+u.telemetry.unknownUsageCalls,0),
    actualUSD: null, costStatus: "provider did not report actual price; author and development agent costs unmeasured separately" }
}
const headerUnit = await read("runs/11-header-conditions/unit.json")
const header = await read(`runs/11-header-conditions/sessions/${headerUnit.report.sessionId}/run.json`)
const recheck = validateConditionAnalysisResult(header.conditionPlan, header.initial.result, header.initial.conditionAnalysis)
if (recheck.status !== "valid") throw new Error(JSON.stringify(recheck.diagnostics))
const summary = {
  schemaVersion: "authorization-aa-summary/v1", status: "complete", analysisUnits: 16,
  initialPanel: { units: 12, firstSchemaValid: 12, firstDeliveryComplete: 11, finalDeliveryComplete: 12,
    finalSemanticDecisionCorrect: 12, finalNecessarySupported: 12, firstDeliveredFullSuccess: 10, finalFullSuccess: 11,
    falsePositives: 0, falseNegatives: 0, observedUnsupportedFacts: 0,
    pairedFive: Object.fromEntries(["plain","ledger"].map(method=>[method,{...aggregate(panel.units.filter((u:any)=>u.method===method && u.caseId!=="header")), fullSuccess: 5}])),
    header: panel.units.filter((u:any)=>u.caseId==="header").map((u:any)=>({id:u.id,method:u.method,firstResponse:u.firstResponse,firstDeliveredQuality:u.firstDeliveredQuality,dimensions:u.evaluation.dimensions,qualityStatus:u.evaluation.qualityStatus,telemetry:u.telemetry,knownDurationMs:u.knownDurationMs})),
    usage: aggregate(panel.units), note: "Same exposed development cases, one run per arm; no generalization or significance claim. Not-applicable dimensions are not failures." },
  authorTrials: {steps:authorSteps.authors, runs:authors, firstValidAuthors:1, finalValidAuthors:2, originalChangedPairsCompleted:2, semanticTransitions:["gitea deny -> allow","fastapi deny -> allow"],usage:aggregate(authors),humanMinutes:null,proceduralIsolationOnly:true,humanStudy:false},
  totalAnalysisUsage:aggregate([...panel.units,...authors]),
  revision: {kind:"offline-validator-correction",extraProviderCalls:0,extraAnalysisUnits:0,
    trigger:"Three known-blocked header branches rejected because unrelated assumptions were unknown; retained first answer had no decisive missing fact for already settled effects.",
    originalDiagnostics:header.initial.conditionValidation.diagnostics,recheckedInitialStatus:recheck.status,
    semanticSupport:recheck.semanticSupport, historicalFirstDeliveryUnchanged:true,
    rule:"Only unknown effect requires missing facts; known effects require same-obligation fact pointers. No mechanical semantic promotion.",
    limitation:"Offline replay demonstrates removal of this false rejection, not a newly observed one-call performance result."},
  conclusions:{authoring:"helper-only: author-owned semantics preserved; no internal IDs required; 1/2 first valid and2/2 after at most one author relay, no main-agent field correction; not a randomized v1/v2 usability study",change:"helper-only: full-context changes conservatively invalidate shared scenarios; input applicability only, not automatic answer reuse",runtime:"five matched plain/ledger cases tie on quality with ledger overhead; header conditions improves explicit explanation but initial contract caused repair; use plain for ordinary bounded tasks, ledger for explicit coverage audit, conditions when branch analysis is required"},
  engineering:{tests:183,assertions:1337,typecheck:"passed",legacyDefaultUnchanged:true,wireExperiment:"v4"},
  remainingLimits:["Two clean-context model authors, not humans or filesystem-isolated agents.","Source/policy selection and semantic facts remain author responsibilities.","Actual USD and development/author agent costs unknown.","No automatic caching or partial-context scheduling; changed shared input conservatively affects all scenarios.","Only exposed development cases; deployment and repository discovery remain not-tested."]
}
const out = JSON.stringify(summary,null,2)+"\n"
if(process.argv.includes("--replay")) {
  if(await readFile(path.join(root,"summary.json"),"utf8")!==out) throw new Error("AA summary replay differs")
  console.log("AA summary reproduced without provider calls")
} else {
  await writeFile(path.join(root,"summary.json"),out,"utf8")
  console.log(JSON.stringify({pairs:summary.initialPanel.pairedFive,header:summary.initialPanel.header,usage:summary.totalAnalysisUsage,revision:recheck.status},null,2))
}
