<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1; task-contract: current-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
# Fixed-Source Authorization Assessment

Assess the authorization behavior of the specified handler using only the fixed source entry and the neutral brief below. Do not rely on other repository revisions, inferred implementation details, external documentation, or unstated assumptions. A common public requirements paragraph is supplied separately to all methods; do not quote it verbatim.

## Source

- **Repository:** https://github.com/paperless-ngx/paperless-ngx
- **Fixed source ref:** `126ec414a8b65158368653a2604ae58415e43103`
- **Entry:** `src/documents/views.py:1834-1839`
- **Inspection boundary:** `declared-entry`

Use the source at the fixed ref and entry as the controlling evidence. Do not invent source facts or decide the result from policy alone.

## Accepted policy

A download must pass the owner-aware `view_document` check on the root document before serving any selected file version.

## Question

At `DocumentViewSet.download` handler entry, can an authenticated user download a requested version document they own when its root document is owned by someone else and they lack an object view grant on that root?

## Premises

Assume all of the following at handler entry:

- The authenticated caller has the required global document view permission.
- The caller owns the requested version.
- A different user owns the existing root document.
- The caller has no object view grant on that root.
- The documents exist.

## Required response

Give a source-grounded authorization assessment at the declared-entry boundary. Explicitly:

1. Identify which object is checked by the relevant authorization logic.
2. Identify which file object would be served if the request proceeds.
3. Keep version ownership distinct from authorization on the root document.
4. Explain how the fixed source relates to the accepted policy and the stated premises.
5. State the conclusion only from the evidence available at the specified source entry; do not add facts from elsewhere in the repository.


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
Preparation status: partial

Closure claim: declared-dependencies-only

Prepared from: https://github.com/paperless-ngx/paperless-ngx@126ec414a8b65158368653a2604ae58415e43103; root ../../../authorization-evidence-editing-v1/public-source/paperless

Included original ranges: src/documents/permissions.py:624-637 [locator:located-9, host-context:symbol-d50f36cbe040d6fab5ea55a5]; src/documents/views.py:361-365 [locator:located-10]; src/documents/views.py:406-410 [locator:located-4]; src/documents/views.py:431-435 [locator:located-3]; src/documents/views.py:1008-1045 [locator:located-1]; src/documents/views.py:1369-1449 [locator:located-8, locator:located-11, locator:located-6, locator:located-5, locator:located-2, model-proposal:dep-file-response-gate, model-proposal:dep-root-resource-binding, model-proposal:dep-root-permission-check, model-proposal:dep-version-selection-after-gate]; src/documents/views.py:1834-1840 [entry:download, model-proposal:dep-download-dispatch, host-context:symbol-e9682cc764898616b9d7f9a2]; src/documents/views.py:4941-4997 [model-proposal:dep-file-serving-effect, locator:located-7, host-context:symbol-c6a720f7394d049442611df6]

Unresolved gaps: dep-owner-aware-semantics: depth-budget (src/documents/permissions.py); dep-requested-version-resolution: depth-budget (src/documents/views.py); context:range:src/documents/views.py:361-365: range-uncertain (src/documents/views.py); context:range:src/documents/views.py:406-410: range-uncertain (src/documents/views.py); context:range:src/documents/views.py:431-435: range-uncertain (src/documents/views.py); context:range:src/documents/views.py:1008-1045: range-uncertain (src/documents/views.py); context:range:src/documents/views.py:1369-1449: range-uncertain (src/documents/views.py)

===== BEGIN ALLOWED INPUT: src/documents/permissions.py =====
Source ID: src-18b8f193a13de576
Location note: crop lines 624-637; original locations: src/documents/permissions.py:624-637
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
624 | def has_perms_owner_aware(user, perms, obj):
625 |     """
626 |     Legacy slow path (guardian-backed) single-object permission check.
627 | 
628 |     The queryset-filtering side of this migrated onto
629 |     ``PermittedObjectsFilter``/``permitted_object_ids()``, but this
630 |     single-object check still has many production callers. Several callers
631 |     remain across ``documents/``, ``paperless_mail/``, and ``paperless_ai/``
632 |     -- grep for this function name before removing it.
633 |     """
634 |     checker = ObjectPermissionChecker(user)
635 |     return obj.owner is None or obj.owner == user or checker.has_perm(perms, obj)
636 | 
637 | 
===== END ALLOWED INPUT: src/documents/permissions.py =====

===== BEGIN ALLOWED INPUT: src/documents/views.py =====
Source ID: src-7632cecb669d34e1
Location note: crop lines 361-4997; original locations: src/documents/views.py:361-365, src/documents/views.py:406-410, src/documents/views.py:431-435, src/documents/views.py:1008-1045, src/documents/views.py:1369-1449, src/documents/views.py:1834-1840, src/documents/views.py:4941-4997
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
361 | class ResolvedRequestDocs(NamedTuple):
362 |     request_doc: Document
363 |     root_doc: Document
364 | 
365 | 
[OMITTED original lines 366-405]
406 | class PassUserMixin(GenericAPIView[Any]):
407 |     """
408 |     Pass a user object to serializer
409 |     """
410 | 
[OMITTED original lines 411-430]
431 | class BulkPermissionMixin:
432 |     """
433 |     Prefetch Django-Guardian permissions for a list before serialization, to avoid N+1 queries.
434 |     """
435 | 
[OMITTED original lines 436-1007]
1008 | class DocumentViewSet(
1009 |     BulkPermissionMixin,
1010 |     PassUserMixin,
1011 |     RetrieveModelMixin,
1012 |     UpdateModelMixin,
1013 |     DestroyModelMixin,
1014 |     ListModelMixin,
1015 |     GenericViewSet[Document],
1016 | ):
1017 |     model = Document
1018 |     queryset = Document.objects.all()
1019 |     serializer_class = DocumentSerializer
1020 |     pagination_class = StandardPagination
1021 |     permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
1022 |     filter_backends = (
1023 |         DjangoFilterBackend,
1024 |         SearchFilter,
1025 |         DocumentsOrderingFilter,
1026 |         PermittedObjectsFilter,
1027 |     )
1028 |     filterset_class = DocumentFilterSet
1029 |     search_fields = ("title", "correspondent__name", "effective_content")
1030 |     ordering_fields = (
1031 |         "id",
1032 |         "title",
1033 |         "correspondent__name",
1034 |         "document_type__name",
1035 |         "storage_path__name",
1036 |         "created",
1037 |         "modified",
1038 |         "added",
1039 |         "archive_serial_number",
1040 |         "num_notes",
1041 |         "owner",
1042 |         "page_count",
1043 |         "custom_field_",
1044 |     )
1045 | 
[OMITTED original lines 1046-1368]
1369 |     def original_requested(request):
1370 |         return (
1371 |             "original" in request.query_params
1372 |             and request.query_params["original"] == "true"
1373 |         )
1374 | 
1375 |     def _resolve_file_doc(self, root_doc: Document, request):
1376 |         version_requested = get_request_version_param(request) is not None
1377 |         resolution = resolve_requested_version_for_root(
1378 |             root_doc,
1379 |             request,
1380 |             include_deleted=version_requested,
1381 |         )
1382 |         if resolution.error == VersionResolutionError.INVALID:
1383 |             raise NotFound("Invalid version parameter")
1384 |         if resolution.document is None:
1385 |             raise Http404
1386 |         return resolution.document
1387 | 
1388 |     def _get_effective_file_doc(
1389 |         self,
1390 |         request_doc: Document,
1391 |         root_doc: Document,
1392 |         request: Request,
1393 |     ) -> Document:
1394 |         if (
1395 |             request_doc.root_document_id is not None
1396 |             and get_request_version_param(request) is None
1397 |         ):
1398 |             return request_doc
1399 |         return self._resolve_file_doc(root_doc, request)
1400 | 
1401 |     def _resolve_request_and_root_doc(
1402 |         self,
1403 |         pk,
1404 |         request: Request,
1405 |         *,
1406 |         include_deleted: bool = False,
1407 |     ) -> ResolvedRequestDocs | HttpResponseForbidden:
1408 |         manager = Document.global_objects if include_deleted else Document.objects
1409 |         try:
1410 |             request_doc = manager.select_related(
1411 |                 "owner",
1412 |                 "root_document",
1413 |             ).get(id=pk)
1414 |         except Document.DoesNotExist:
1415 |             raise Http404
1416 | 
1417 |         root_doc = get_root_document(
1418 |             request_doc,
1419 |             include_deleted=include_deleted,
1420 |         )
1421 |         if request.user is not None and not has_perms_owner_aware(
1422 |             request.user,
1423 |             "view_document",
1424 |             root_doc,
1425 |         ):
1426 |             return HttpResponseForbidden("Insufficient permissions")
1427 |         return ResolvedRequestDocs(request_doc=request_doc, root_doc=root_doc)
1428 | 
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
1840 | 
[OMITTED original lines 1841-4940]
4941 | def serve_file(
4942 |     *,
4943 |     doc: Document,
4944 |     use_archive: bool,
4945 |     disposition: str,
4946 |     follow_formatting: bool = False,
4947 | ) -> FileResponse:
4948 |     if use_archive:
4949 |         if TYPE_CHECKING:
4950 |             assert doc.archive_filename
4951 | 
4952 |         file_handle = doc.archive_file
4953 |         filename = (
4954 |             doc.archive_filename
4955 |             if follow_formatting
4956 |             else doc.get_public_filename(archive=True)
4957 |         )
4958 |         mime_type = "application/pdf"
4959 |     else:
4960 |         if TYPE_CHECKING:
4961 |             assert doc.filename
4962 | 
4963 |         file_handle = doc.source_file
4964 |         filename = doc.filename if follow_formatting else doc.get_public_filename()
4965 |         mime_type = doc.mime_type
4966 |         # Support browser previewing csv files by using text mime type
4967 |         if mime_type in {"application/csv", "text/csv"} and disposition == "inline":
4968 |             mime_type = "text/plain"
4969 |         # Tell browsers to use UTF-8 for the text files we parse as UTF-8
4970 |         if mime_type in {"text/plain", "text/csv", "application/csv"}:
4971 |             mime_type = f"{mime_type}; charset=utf-8"
4972 | 
4973 |     response = FileResponse(file_handle, content_type=mime_type)
4974 |     # Firefox is not able to handle unicode characters in filename field
4975 |     # RFC 5987 addresses this issue
4976 |     # see https://datatracker.ietf.org/doc/html/rfc5987#section-4.2
4977 |     # Chromium cannot handle commas in the filename
4978 |     filename_normalized = (
4979 |         normalize("NFKD", filename.replace(",", "_"))
4980 |         .encode(
4981 |             "ascii",
4982 |             "ignore",
4983 |         )
4984 |         .decode("ascii")
4985 |         .replace("\\", "_")
4986 |         .replace('"', "_")
4987 |     )
4988 |     filename_encoded = quote(filename)
4989 |     content_disposition = (
4990 |         f"{disposition}; "
4991 |         f'filename="{filename_normalized}"; '
4992 |         f"filename*=utf-8''{filename_encoded}"
4993 |     )
4994 |     response["Content-Disposition"] = content_disposition
4995 |     return response
4996 | 
4997 | 
===== END ALLOWED INPUT: src/documents/views.py =====
