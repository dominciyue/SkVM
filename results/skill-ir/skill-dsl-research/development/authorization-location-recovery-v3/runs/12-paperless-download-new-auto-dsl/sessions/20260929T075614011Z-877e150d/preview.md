<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task paperless-version-download-root, expressed with source-authorization-assessment/v0. At DocumentViewSet.download handler entry, can an authenticated user download a requested version document they own when its root document is owned by someone else and they lack an object view grant on that root? Assume the user has the required global view permission and the documents exist.
Assess repository https://github.com/paperless-ngx/paperless-ngx at source ref 126ec414a8b65158368653a2604ae58415e43103 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:document-root-view is a explicit-task-requirement at src/documents/views.py:1401-1448; src/documents/permissions.py:624-635, revision 126ec414a8b65158368653a2604ae58415e43103.
  Policy text: A download must pass the owner-aware view_document check on the root document before serving any selected file version.
  Acceptance is accepted; accepting actor role: task-author; reason: Public fixed-ref source and task-author bounded requirement.

The principals are:
- principal:version-owner has role authenticated user who owns the requested version but not the root document. Author facts: ["The caller has global documents.view_document permission.","The caller has no object view_document grant on the root."]
  Starting capabilities: none declared.

The resources are:
- resource:rooted-version is a document version and root. Author facts: ["The requested version and its root both exist.","The version is caller-owned; the root has another owner and no caller view grant."]

The declared source entries are:
- entry:download names DocumentViewSet.download.
  Source location: src/documents/views.py, startLine 1834, endLine 1839.

The authorization obligations are:
- scenario:version-owner-no-root-view: principal principal:version-owner, resource resource:rooted-version, relation owns-version-not-root, operation download requested document version, expected policy disposition deny.
  Policy source: policy:document-root-view. Declared entries: entry:download.
  Conditions: none declared.

Scope assurance: Only explicitly declared scenarios and supplied source are assessed; repository discovery and deployment behavior are not tested.
Required analysis:
- Trace entry, identity and resource binding, strongest authorization control, and protected effect. Explain decisive missing source-external facts.
- identify the principal, operation, protected resource, decisive control, and effect
- return source_supported_failure, source_refuted, or unknown with exact supplied-source locations
Constraints:
- Use only supplied fixed source context. Do not execute or modify the target, contact a deployment, or claim repository-wide discovery.
- Use only the supplied fixed-ref case inputs.
- Do not execute the target project or infer deployment facts.
Allowed decision kinds: observed for allow/deny expectations; conditional-policy for conditional expectations.

## Public analysis questions
Decide the current scenario at the stated declared-entry boundary from the supplied fixed source and accepted policy. Treat premises as question assumptions, not source or deployment proof. Trace the decisive authorization control, protected object and effect with exact supplied-source locations. State any decisive missing runtime fact rather than assuming it. Do not execute the target, infer missing deployment facts, or consult later versions.
Current question: At DocumentViewSet.download handler entry, can an authenticated user download a requested version document they own when its root document is owned by someone else and they lack an object view grant on that root? Assume the user has the required global view permission and the documents exist.
Analysis boundary: declared-entry.
Task premise: At download entry, the authenticated caller has global document view permission and owns the requested version, but a different user owns the existing root document and the caller has no object view grant on that root.
Required response detail: Identify which object is checked and which file object would be served; do not collapse version ownership into root authorization.

## Explicit assessment program
- Current question scenario%3Aversion-owner-no-root-view::entry%3Adownload at entry:download; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At download entry, the authenticated caller has global document view permission and owns the requested version, but a different user owns the existing root document and the caller has no object view grant on that root..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Identify which object is checked and which file object would be served; do not collapse version ownership into root authorization..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Aversion-owner-no-root-view::entry%3Adownload
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
Preparation status: ready

Closure claim: declared-dependencies-only

Prepared from: https://github.com/paperless-ngx/paperless-ngx@126ec414a8b65158368653a2604ae58415e43103; root ../../../authorization-evidence-editing-v1/public-source/paperless

Included original ranges: src/documents/views.py:1369-1374 [locator:located-5]; src/documents/views.py:1388-1392 [locator:located-3]; src/documents/views.py:1401-1406 [locator:located-2]; src/documents/views.py:1429-1449 [model-proposal:dep-file-response-control, locator:located-1]; src/documents/views.py:1834-1839 [entry:download, model-proposal:dep-download-entry-control]; src/documents/views.py:4941-4946 [locator:located-4]

Unresolved gaps: none

===== BEGIN ALLOWED INPUT: src/documents/views.py =====
Source ID: src-0afda2bcf1b0e4f8
Location note: crop lines 1369-4946; original locations: src/documents/views.py:1369-1374, src/documents/views.py:1388-1392, src/documents/views.py:1401-1406, src/documents/views.py:1429-1449, src/documents/views.py:1834-1839, src/documents/views.py:4941-4946
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
1369 |     def original_requested(request):
1370 |         return (
1371 |             "original" in request.query_params
1372 |             and request.query_params["original"] == "true"
1373 |         )
1374 | 
[OMITTED original lines 1375-1387]
1388 |     def _get_effective_file_doc(
1389 |         self,
1390 |         request_doc: Document,
1391 |         root_doc: Document,
1392 |         request: Request,
[OMITTED original lines 1393-1400]
1401 |     def _resolve_request_and_root_doc(
1402 |         self,
1403 |         pk,
1404 |         request: Request,
1405 |         *,
1406 |         include_deleted: bool = False,
[OMITTED original lines 1407-1428]
1429 |     def file_response(self, pk, request, disposition):
1430 |         resolved = self._resolve_request_and_root_doc(
1431 |             pk,
1432 |             request,
1433 |             include_deleted=True,
1434 |         )
1435 |         if isinstance(resolved, HttpResponseForbidden):
1436 |             return resolved
1437 |         file_doc = self._get_effective_file_doc(
1438 |             resolved.request_doc,
1439 |             resolved.root_doc,
1440 |             request,
1441 |         )
1442 |         return serve_file(
1443 |             doc=file_doc,
1444 |             use_archive=not self.original_requested(request)
1445 |             and file_doc.has_archive_version,
1446 |             disposition=disposition,
1447 |             follow_formatting=request.query_params.get("follow_formatting", False),
1448 |         )
1449 | 
[OMITTED original lines 1450-1833]
1834 |     @action(methods=["get"], detail=True)
1835 |     def download(self, request, pk=None):
1836 |         try:
1837 |             return self.file_response(pk, request, "attachment")
1838 |         except (FileNotFoundError, Document.DoesNotExist):
1839 |             raise Http404
[OMITTED original lines 1840-4940]
4941 | def serve_file(
4942 |     *,
4943 |     doc: Document,
4944 |     use_archive: bool,
4945 |     disposition: str,
4946 |     follow_formatting: bool = False,
===== END ALLOWED INPUT: src/documents/views.py =====
