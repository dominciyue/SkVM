import { readFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"
import path from "node:path"
import { root, sha, write } from "./study.ts"
import { loadInquiryInput } from "../../../../../src/benchmarks/authorization-dsl/inquiry-local.ts"
import { createInquiryTools } from "../../../../../src/benchmarks/authorization-dsl/inquiry-tools.ts"
import { compileSourceEdit } from "../../../../../src/task-dsl/authorization/source-edit.ts"
import { lowerSourceInterpretation } from "../../../../../src/task-dsl/authorization/source-interpretation.ts"
import { review } from "./summarize.ts"

export async function diagnoseOriginalDownload() {
  const directory = path.join(root, "attempts/pilot-download/original"), rawBytes = await readFile(path.join(directory, "run-result.json.gz")), run = JSON.parse(gunzipSync(rawBytes).toString("utf8")), domain = run.authorizationInquiry.domain, claim = JSON.parse(await readFile(path.join(directory, "claim.json"), "utf8")), loaded = await loadInquiryInput(claim.inputFile)
  if (loaded.inputSha256 !== claim.inputSha256) throw new Error("Current original input differs from the dispatched claim")
  const history: any[] = domain.focus.sourceInterpretations, draft = history.filter(h => h.event === "edited" && h.generated?.annotations?.some((a: any) => a.anchorId === "anchor-8c381d46def5890f94e11a98")).at(-1)!.generated
  const query = draft.propertyBindings[0], tools = await createInquiryTools({ ...loaded.context, structure: true, controlSemantics: "finite-control/v1", propertyDirected: true, questionDirected: true }), source = tools.structure!.symbols.find(s => s.id === query.effectRef.sourceId)!
  await tools.execute("source_read", { path: source.path, startLine: source.startLine, endLine: source.endLine })
  const skeleton = (await tools.sourceSkeleton(source.id, query.effectRef.receiverClass))!
  if (draft.revision !== skeleton.revision) throw new Error("Original draft needs a separately recorded host revision migration")
  const anchor = skeleton.anchors.find(a => a.id === "anchor-8c381d46def5890f94e11a98")!, original = lowerSourceInterpretation(skeleton, draft, { index: tools.structure, itemId: "original-helper", handle: "original-helper", questionId: "q1", role: "helper", propertyDirected: true })
  const clear = { schemaVersion: "authorization-source-edit/v1", kind: "edit", transactionId: "diagnostic-current", edits: [{ anchorId: anchor.id, field: "guardBranch", value: null }] }, edited = compileSourceEdit(skeleton, clear, { transactionId: "diagnostic-current", previous: draft, progressive: true }), lowered = lowerSourceInterpretation(skeleton, edited.interpretation, { index: tools.structure, itemId: "original-helper", handle: "original-helper", questionId: "q1", role: "helper", propertyDirected: true })
  const result = { schemaVersion: "authorization-bb-pilot-diagnostic/v1", attemptId: claim.attemptId, rawSha256: sha(rawBytes), inputSha256: claim.inputSha256, modelCalls: 0, source: skeleton.source, retainedDraftRevision: draft.revision, earliestBlockingLayer: "source-interpretation", malformedAnchor: { id: anchor.id, kind: anchor.kind, text: anchor.text, retainedGuardBranch: draft.annotations.find((a: any) => a.anchorId === anchor.id).guardBranch }, originalDiagnostics: original.diagnostics, sourceEditRepair: clear, acceptedEdits: edited.acceptedEdits, repairDiagnostics: edited.diagnostics, remainingLoweringDiagnostics: lowered.diagnostics, guardFaultRemoved: original.diagnostics.some(d => d.code === "source-interpretation-guard") && !lowered.diagnostics.some(d => d.code === "source-interpretation-guard"), newSemanticFields: 0, meaningRemoved: ["erroneous guardBranch on actual call"], liveOutcomeUnchanged: true, wholeTaskCertified: false, next: "Named original-input model verification; no diagnostic or source review is provided to runtime" }
  await write(path.join(root, "verification/pilot-download-diagnostic.json"), result)
  const reviewed = await review(claim.attemptId)
  Object.assign(reviewed, { status: "source-reviewed", wholeOriginalTask: "partial", crossFunctionProperty: "natural-root-version-relation-covered-machine-unknown", reviewBasis: { independentReadOnlyAgents: ["bb_download_source_review", "bb_download_pipeline_audit"], mainSourceSpotChecks: ["src/paperless/urls.py:77", "src/documents/permissions.py:36-44", "src/documents/views.py:1401-1448", "src/documents/models.py:452-475"], fullyBlind: false, unsupportedProjectionDiagnosisRejected: "file_response never became an available helper: guard rejection precedes material-target-unavailable" }, findings: [
    { criterion: "root-version-authorization-object", status: "covered", answerLines: "3,14-40", source: "src/documents/views.py:1401-1448; src/documents/versioning.py:140-195", detail: "Checks root, then chooses a member of its version family; no independent version-level authorization is inferred." },
    { criterion: "ownership-and-object-grants", status: "covered", answerLines: "17-27", source: "src/documents/permissions.py:624-635", detail: "Ownerless, owner and object-grant branches are described conditionally, without assuming a grant." },
    { criterion: "registered-entry-and-model-permission", status: "missing", answerLines: "7-12", source: "src/paperless/urls.py:77; src/documents/views.py:2503-2507; src/documents/permissions.py:36-44; framework/rest_framework-3.18.1/rest_framework/permissions.py:233-246", detail: "Names the inherited download action but omits the registered UnifiedSearchViewSet and the GET documents.view_document model-permission requirement." },
    { criterion: "representation-and-path-conditions", status: "partial", answerLines: "42-51", source: "src/documents/views.py:4941-4995; src/documents/models.py:452-475", detail: "Correct original/archive selection, but omits the resolved ORIGINALS_DIR/ARCHIVE_DIR paths, filename fields and binary open; configuration/file existence remain conditional deployment facts." },
    { criterion: "failure-branches", status: "partial", answerLines: "7,23,35", source: "src/documents/views.py:1375-1386,1421-1427; src/documents/versioning.py:189-195", detail: "Covers permission 403 and broad missing/nonfamily 404, but does not enumerate invalid-version selection failure." },
    { criterion: "current-machine-closure", status: "unknown", source: "report.json propertyAnalysis.checks", detail: "One current property check with an empty trace, unbound principal/resource, rejected helper and open framework dependencies; local natural answer does not establish machine closure." },
  ] })
  await write(path.join(directory, "source-review.json"), reviewed)
  return { guardFaultRemoved: result.guardFaultRemoved, acceptedEdits: result.acceptedEdits, remainingDiagnostics: lowered.diagnostics.map(d => d.code), modelCalls: 0 }
}
if (import.meta.main) console.log(JSON.stringify(await diagnoseOriginalDownload()))
