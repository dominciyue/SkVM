import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import { root, sha, replayAccounting } from "../study.ts"
import { AttemptReportSchema } from "../types.ts"
import type { AuthorizationProviderAttempt, AuthorizationLifecycleEvent } from "../../../../../../src/benchmarks/authorization-dsl/telemetry.ts"

const directory = path.join(root, "positions/debug-owui-ingestion-D1/revision-flow-requirements")
const report = AttemptReportSchema.parse(JSON.parse(await readFile(path.join(directory, "report.json"), "utf8")))
const raw = JSON.parse(gunzipSync(await readFile(path.join(directory, report.raw.file))).toString("utf8")) as { attempts: AuthorizationProviderAttempt[]; events: AuthorizationLifecycleEvent[]; domain: { sourceWorkMetrics: unknown; check: { structureValid: boolean; sourceBound: boolean; ruleConsistency: boolean; semanticSupport: string; taskResolution: string }; checkHistory: unknown[] }; sourceAccounting: unknown; sourceVerification: unknown }
const accounting = replayAccounting(raw.attempts, raw.events)
const bindings = Object.fromEntries(await Promise.all(["report.json", "final.txt", report.raw.file].map(async file => { const bytes = await readFile(path.join(directory, file)); return [file, { sha256: sha(bytes), bytes: bytes.length }] })))
const evaluation = {
  schemaVersion: "authorization-av-independent-evaluation/v1", positionId: report.positionId, attemptId: report.attemptId, implementationRevision: report.implementationRevision,
  reviewKind: "independent-readonly-AI-plus-main-source-adjudication", humanReview: false,
  independentReview: { agent: "av11_flow_final_source_review", originalDutyRatings: { callerAndFile: "complete", collectionAndEffect: "complete", ownershipCases: "complete", objectRelation: "complete", inheritedControls: "partial" }, originalJudgment: "The available sources completely answer these duties; the final's unavailable methods and unresolved meanings contradict that source", sourceAnchors: ["backend/open_webui/utils/auth.py:458-464", "backend/open_webui/routers/retrieval.py:1559-1569", "backend/open_webui/models/files.py:161-184", "backend/open_webui/routers/retrieval.py:1673-1732", "backend/open_webui/routers/retrieval.py:1761-1762"], finalExcerpts: ["the implementations and authoritative call bindings were not located", "The authoritative implementation of Files.get_file_by_id is unavailable in the allowed source evidence", "These identifiers describe different resource domains"] },
  mechanismReview: { agent: "av11_files_receiver_location_review", cause: "The two real Files calls have unresolved receiver/import/value binding because Files=FilesTable() is a module value absent from symbol-only lookup", sourceAnchors: ["backend/open_webui/models/files.py:413", "backend/open_webui/routers/retrieval.py:1560", "backend/open_webui/routers/retrieval.py:1562", "src/benchmarks/authorization-dsl/evidence-preparation/structure-index.ts:229"] },
  mainAdjudication: {
    acceptedDelivery: "partial-final", semanticQuality: "partial", correctedReviewerClaims: ["Complete source availability does not grade a delivered answer complete; all ratings below concern only the accepted final", "An unresolved accepted interpretation is mechanically honest; do not grade that phrase as a false affirmative permission claim", "Claims that the actual method source is unavailable are erroneous source-gap attribution; the methods exist in the registered scope. The shared receiver binding gap does not make source absent", "Absence of a route-level collection validator does not by itself prove every upstream/downstream deployment lacks authorization"],
    duties: [
      { questionId: "process-file-caller-flow", status: "partial", basis: "Correct route, dependencies and role split; dependency/lookup meaning and terminal source effect unresolved" },
      { questionId: "process-file-input-object", status: "partial-with-incorrect-gap", basis: "Correct two lookup names and role alternatives, but falsely unavailable methods; exact ID/user filter and 404 omitted" },
      { questionId: "process-file-destination-object", status: "partial", basis: "No destination ownership manufactured; default file-{id}, explicit target, bypass and successful vector write relation omitted" },
      { questionId: "process-file-object-relation", status: "partial", basis: "Correct distinct resource domains; concrete content/metadata/destination relation remains unknown" },
      { questionId: "process-file-ownership-cases", status: "partial-with-incorrect-gap", basis: "Speculative role split retained, but actual caller-owned/other-user/admin matrix and lookup failure result not delivered" },
      { questionId: "process-file-limits", status: "partial-with-incorrect-gap", basis: "Some interpretation, runtime and deployment limits are precise; false unavailable-source attribution proposes unnecessary source-scope expansion" }
    ],
    repairEffect: "Flow-local prerequisites now permit one accepted source unit and 13 steps, versus zero units/steps before the repair; full quality and net saving are not established",
    nextResponsibility: "Unique source module-instance receiver binding plus anonymous negative guards, exact-source zero probe and named real verification; unsupported control remains explicit"
  },
  actual: { ...accounting.summary, recoveries: accounting.recoveries, originalUnknownAttempts: accounting.originalUnknownAttempts, sourceWorkMetrics: raw.domain.sourceWorkMetrics, checkCount: raw.domain.checkHistory.length, check: raw.domain.check, sourceAccounting: raw.sourceAccounting, sourceVerification: raw.sourceVerification, targetExecutions: 0 }, rawBindings: bindings, researchEffectEstablished: false,
}
await writeFile(path.join(root, "evaluations/av11-owui-flow-requirements.json"), JSON.stringify(evaluation, null, 2) + "\n", { encoding: "utf8", flag: "wx" })
console.log(JSON.stringify({ status: evaluation.mainAdjudication.semanticQuality, providerCalls: accounting.summary.providerCalls, acceptedDelivery: evaluation.mainAdjudication.acceptedDelivery }))
