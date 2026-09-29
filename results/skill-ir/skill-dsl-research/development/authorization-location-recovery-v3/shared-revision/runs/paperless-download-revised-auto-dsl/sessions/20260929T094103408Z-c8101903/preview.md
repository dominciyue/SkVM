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
Preparation status: partial

Closure claim: declared-dependencies-only

Prepared from: https://github.com/paperless-ngx/paperless-ngx@126ec414a8b65158368653a2604ae58415e43103; root ../../../authorization-evidence-editing-v1/public-source/paperless

Included original ranges: src/documents/views.py:361-365 [locator:located-47]; src/documents/views.py:406-525 [locator:located-41, locator:located-42, locator:located-38, locator:located-39, locator:located-40]; src/documents/views.py:699-706 [locator:located-45]; src/documents/views.py:1008-1112 [model-proposal:dep-viewset-permissions, locator:located-1, locator:located-2, model-proposal:dep-download-viewset-permissions]; src/documents/views.py:1114-1234 [locator:located-3, locator:located-4, locator:located-5, locator:located-6, locator:located-7, locator:located-8]; src/documents/views.py:1245-1367 [locator:located-9, locator:located-10, locator:located-11, locator:located-12, locator:located-13, model-proposal:dep-root-action-permission-pattern]; src/documents/views.py:1369-1474 [locator:located-14, locator:located-15, locator:located-16, locator:located-17, locator:located-18, locator:located-19, locator:located-20, model-proposal:dep-download-file-response, model-proposal:dep-effective-version-selection, model-proposal:dep-version-resolution-helper, model-proposal:dep-version-selection-helper, model-proposal:dep-file-serving-helper]; src/documents/views.py:1480-1535 [locator:located-21]; src/documents/views.py:1544-1596 [locator:located-22]; src/documents/views.py:1604-1782 [locator:located-23, locator:located-24]; src/documents/views.py:1788-1808 [locator:located-25]; src/documents/views.py:1817-1840 [locator:located-26, entry:download, locator:located-27, model-proposal:dep-download-entry, model-proposal:dep-download-handler-entry]; src/documents/views.py:1848-1964 [locator:located-28]; src/documents/views.py:1966-1998 [locator:located-29]; src/documents/views.py:2000-2059 [locator:located-30]; src/documents/views.py:2071-2075 [locator:located-31]; src/documents/views.py:2083-2138 [locator:located-32]; src/documents/views.py:2147-2236 [locator:located-33, locator:located-34, locator:located-35]; src/documents/views.py:2259-2316 [locator:located-36]; src/documents/views.py:2345-2396 [locator:located-37]; src/documents/views.py:4509-4514 [locator:located-46]; src/documents/views.py:4767-4833 [locator:located-49]; src/documents/views.py:4941-4997 [locator:located-48]; src/documents/permissions.py:460-476 [locator:located-50]; src/documents/permissions.py:497-567 [locator:located-43]; src/documents/permissions.py:624-637 [locator:located-44]

Unresolved gaps: dep-owner-aware-root-check: depth-budget (src/documents/permissions.py); dep-root-resolution: location-not-shown; dep-owner-aware-permission-call: location-not-shown (src/documents/permissions.py); dep-root-document-helper: unresolved-parent

===== BEGIN ALLOWED INPUT: src/documents/permissions.py =====
Source ID: src-1f369f7ea734caf5
Location note: crop lines 460-637; original locations: src/documents/permissions.py:460-476, src/documents/permissions.py:497-567, src/documents/permissions.py:624-637
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
460 | def permitted_document_ids(
461 |     user: User | None,
462 |     *,
463 |     perm: str = "view_document",
464 |     include_deleted: bool = False,
465 | ) -> QuerySet[int]:
466 |     """
467 |     Document-specific convenience wrapper around ``permitted_object_ids``.
468 |     Return a queryset of document IDs the user has ``perm`` on (default
469 |     ``"view_document"``). By default limited to non-deleted documents; pass
470 |     ``include_deleted=True`` for callers that need to check permission on
471 |     soft-deleted documents (e.g. trash restore). This intentionally avoids
472 |     ``get_objects_for_user`` to keep the subquery small and index-friendly.
473 |     """
474 |     return permitted_object_ids(user, Document, perm, include_deleted=include_deleted)
475 | 
476 | 
[OMITTED original lines 477-496]
497 | def annotate_document_count_by_ids(
498 |     queryset: QuerySet[Any],
499 |     through_model: Any,
500 |     related_object_field: str,
501 |     document_ids: Any,
502 |     target_field: str = "document_id",
503 | ) -> QuerySet[Any]:
504 |     """
505 |     Annotate a queryset with a document count for a relation to Document that
506 |     goes through an M2M/through-model table (e.g. Tag via
507 |     ``Document.tags.through``, or CustomField via ``CustomFieldInstance``),
508 |     for an explicit, already-resolved set of document ids.
509 | 
510 |     Counts are computed via a single, independent GROUP BY over the relation
511 |     table -- with the id filter expressed as a plain ``WHERE`` rather than an
512 |     aggregate ``FILTER`` -- then injected via ``Case``/``When``. This
513 |     deliberately avoids two slower alternatives found while building this:
514 | 
515 |     - A per-outer-row correlated subquery (one execution per row of the
516 |       annotated queryset): fine at a handful of rows, catastrophic once the
517 |       queryset has hundreds/thousands of rows.
518 |     - ``Count(..., filter=Q(id__in=document_ids), distinct=True)`` applied
519 |       directly to the M2M relation: Postgres can fail to plan the ``id__in``
520 |       check as a semi-join and instead re-checks subquery membership once per
521 |       row of the (much larger) M2M join -- worse than the correlated subquery.
522 | 
523 |     Aggregation is restricted to rows whose ``related_object_field`` is one of
524 |     ``queryset``'s pks, so passing a subset (e.g. a handful of tag descendants)
525 |     doesn't pay the cost of counting for every row matching ``document_ids``.
526 | 
527 |     Args:
528 |         queryset: base queryset to annotate (must contain pk)
529 |         through_model: model representing the relation (e.g., Document.tags.through
530 |                        or CustomFieldInstance)
531 |         related_object_field: field on the relation pointing back to queryset pk
532 |         document_ids: the document ids to count against -- a concrete list/set,
533 |                        or a simple (already resolved) queryset of ids. Callers
534 |                        that need this filtered by a complex condition (e.g. a
535 |                        permission check) should resolve it to a concrete list
536 |                        first if the same ids will be reused across multiple
537 |                        calls, rather than passing the complex queryset itself
538 |                        into each -- see ``_get_selection_data_for_queryset``.
539 |         target_field: field on the relation pointing to Document id
540 |     """
541 | 
542 |     counts = (
543 |         through_model.objects.filter(
544 |             **{
545 |                 f"{related_object_field}__in": queryset.values("pk"),
546 |                 f"{target_field}__in": document_ids,
547 |             },
548 |         )
549 |         .values(related_object_field)
550 |         .annotate(c=Count(target_field, distinct=True))
551 |     )
552 |     counts_by_pk = {row[related_object_field]: row["c"] for row in counts}
553 | 
554 |     if not counts_by_pk:
555 |         return queryset.annotate(
556 |             document_count=Value(0, output_field=IntegerField()),
557 |         )
558 | 
559 |     return queryset.annotate(
560 |         document_count=Case(
561 |             *(When(pk=pk, then=Value(count)) for pk, count in counts_by_pk.items()),
562 |             default=Value(0),
563 |             output_field=IntegerField(),
564 |         ),
565 |     )
566 | 
567 | 
[OMITTED original lines 568-623]
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
Source ID: src-62f289a6149b051c
Location note: crop lines 361-4997; original locations: src/documents/views.py:361-365, src/documents/views.py:406-525, src/documents/views.py:699-706, src/documents/views.py:1008-1112, src/documents/views.py:1114-1234, src/documents/views.py:1245-1367, src/documents/views.py:1369-1474, src/documents/views.py:1480-1535, src/documents/views.py:1544-1596, src/documents/views.py:1604-1782, src/documents/views.py:1788-1808, src/documents/views.py:1817-1840, src/documents/views.py:1848-1964, src/documents/views.py:1966-1998, src/documents/views.py:2000-2059, src/documents/views.py:2071-2075, src/documents/views.py:2083-2138, src/documents/views.py:2147-2236, src/documents/views.py:2259-2316, src/documents/views.py:2345-2396, src/documents/views.py:4509-4514, src/documents/views.py:4767-4833, src/documents/views.py:4941-4997
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
411 |     def get_serializer(self, *args, **kwargs):
412 |         serializer_class = self.get_serializer_class()
413 |         if isinstance(serializer_class, type) and issubclass(
414 |             serializer_class,
415 |             SerializerWithPerms,
416 |         ):
417 |             kwargs.setdefault("user", self.request.user)
418 |             try:
419 |                 full_perms = get_boolean(
420 |                     str(self.request.query_params.get("full_perms", "false")),
421 |                 )
422 |             except ValueError:
423 |                 full_perms = False
424 |             kwargs.setdefault(
425 |                 "full_perms",
426 |                 full_perms,
427 |             )
428 |         return super().get_serializer(*args, **kwargs)
429 | 
430 | 
431 | class BulkPermissionMixin:
432 |     """
433 |     Prefetch Django-Guardian permissions for a list before serialization, to avoid N+1 queries.
434 |     """
435 | 
436 |     def _get_object_perms(
437 |         self,
438 |         objects: list,
439 |         perm_codenames: list[str],
440 |         actor: Literal["users", "groups"],
441 |     ) -> dict[int, dict[str, list[int]]]:
442 |         """
443 |         Collect object-level permissions for either users or groups.
444 |         """
445 |         model = self.queryset.model
446 |         obj_perm_model = (
447 |             get_user_obj_perms_model(model)
448 |             if actor == "users"
449 |             else get_group_obj_perms_model(model)
450 |         )
451 |         id_field = "user_id" if actor == "users" else "group_id"
452 |         ctype = ContentType.objects.get_for_model(model)
453 |         object_pks = [obj.pk for obj in objects]
454 | 
455 |         perms_qs = obj_perm_model.objects.filter(
456 |             content_type=ctype,
457 |             object_pk__in=object_pks,
458 |             permission__codename__in=perm_codenames,
459 |         ).values_list("object_pk", id_field, "permission__codename")
460 | 
461 |         perms: dict[int, dict[str, list[int]]] = defaultdict(lambda: defaultdict(list))
462 |         for object_pk, actor_id, codename in perms_qs:
463 |             perms[int(object_pk)][codename].append(actor_id)
464 | 
465 |         # Ensure that all objects have all codenames, even if empty
466 |         for pk in object_pks:
467 |             for codename in perm_codenames:
468 |                 perms[pk][codename]
469 | 
470 |         return perms
471 | 
472 |     def get_serializer_context(self):
473 |         """
474 |         Get all permissions of the current list of objects at once and pass them to the serializer.
475 |         This avoid fetching permissions object by object in database.
476 |         """
477 |         context = super().get_serializer_context()
478 | 
479 |         if getattr(self, "action", None) != "list":
480 |             # Batching only pays off across a page of objects; for single-object
481 |             # actions (retrieve, update, ...) the per-object fallback in
482 |             # get_user_can_change()/_get_perms() is cheap and avoids scanning
483 |             # the whole queryset here.
484 |             return context
485 | 
486 |         # Check which objects are being paginated
487 |         page = getattr(self, "paginator", None)
488 |         if page and hasattr(page, "page"):
489 |             queryset = page.page.object_list
490 |         elif hasattr(self, "page"):
491 |             queryset = self.page
492 |         else:
493 |             queryset = self.filter_queryset(self.get_queryset())
494 | 
495 |         model_name = self.queryset.model.__name__.lower()
496 |         permission_name_view = f"view_{model_name}"
497 |         permission_name_change = f"change_{model_name}"
498 | 
499 |         user_perms = self._get_object_perms(
500 |             objects=queryset,
501 |             perm_codenames=[permission_name_view, permission_name_change],
502 |             actor="users",
503 |         )
504 |         group_perms = self._get_object_perms(
505 |             objects=queryset,
506 |             perm_codenames=[permission_name_view, permission_name_change],
507 |             actor="groups",
508 |         )
509 | 
510 |         context["users_view_perms"] = {
511 |             pk: user_perms[pk][permission_name_view] for pk in user_perms
512 |         }
513 |         context["users_change_perms"] = {
514 |             pk: user_perms[pk][permission_name_change] for pk in user_perms
515 |         }
516 |         context["groups_view_perms"] = {
517 |             pk: group_perms[pk][permission_name_view] for pk in group_perms
518 |         }
519 |         context["groups_change_perms"] = {
520 |             pk: group_perms[pk][permission_name_change] for pk in group_perms
521 |         }
522 | 
523 |         return context
524 | 
525 | 
[OMITTED original lines 526-698]
699 |     def perform_update(self, serializer):
700 |         old_parent = self.get_object().get_parent()
701 |         tag = serializer.save()
702 |         new_parent = tag.get_parent()
703 |         if new_parent and old_parent != new_parent:
704 |             update_document_parent_tags(tag, new_parent)
705 | 
706 | 
[OMITTED original lines 707-1007]
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
1046 |     def _get_selection_data_for_queryset(self, queryset):
1047 |         # Resolve once instead of once per model below. `queryset` can carry an
1048 |         # arbitrarily expensive WHERE clause (user filters plus the permission
1049 |         # filter); re-embedding it as a subquery inside 5 separate Count(...)
1050 |         # calls forces the database to re-evaluate that whole thing 5 times, and
1051 |         # -- for FK relations especially -- can defeat semi-join planning
1052 |         # entirely at scale. A concrete id list is cheap to reuse.
1053 |         # order_by() drops the default/user ordering -- irrelevant for a plain
1054 |         # id list, but left in place it forces a sort over the full filtered
1055 |         # set before the ids can even be collected.
1056 |         document_ids = list(queryset.order_by().values_list("pk", flat=True))
1057 | 
1058 |         correspondents = Correspondent.objects.annotate(
1059 |             document_count=Count(
1060 |                 "documents",
1061 |                 filter=Q(documents__id__in=document_ids),
1062 |                 distinct=True,
1063 |             ),
1064 |         )
1065 |         document_types = DocumentType.objects.annotate(
1066 |             document_count=Count(
1067 |                 "documents",
1068 |                 filter=Q(documents__id__in=document_ids),
1069 |                 distinct=True,
1070 |             ),
1071 |         )
1072 |         storage_paths = StoragePath.objects.annotate(
1073 |             document_count=Count(
1074 |                 "documents",
1075 |                 filter=Q(documents__id__in=document_ids),
1076 |                 distinct=True,
1077 |             ),
1078 |         )
1079 |         # Tag and CustomField reach Document through an M2M/through-model table;
1080 |         # a plain Count(filter=...) there is a much more expensive plan than the
1081 |         # FK relations above once the bridge table is large -- see
1082 |         # annotate_document_count_by_ids() for why.
1083 |         tags = annotate_document_count_by_ids(
1084 |             Tag.objects.all(),
1085 |             through_model=Document.tags.through,
1086 |             related_object_field="tag_id",
1087 |             document_ids=document_ids,
1088 |         )
1089 |         custom_fields = annotate_document_count_by_ids(
1090 |             CustomField.objects.all(),
1091 |             through_model=CustomFieldInstance,
1092 |             related_object_field="field_id",
1093 |             document_ids=document_ids,
1094 |         )
1095 |         return {
1096 |             "selected_correspondents": [
1097 |                 {"id": t.id, "document_count": t.document_count} for t in correspondents
1098 |             ],
1099 |             "selected_tags": [
1100 |                 {"id": t.id, "document_count": t.document_count} for t in tags
1101 |             ],
1102 |             "selected_document_types": [
1103 |                 {"id": t.id, "document_count": t.document_count} for t in document_types
1104 |             ],
1105 |             "selected_storage_paths": [
1106 |                 {"id": t.id, "document_count": t.document_count} for t in storage_paths
1107 |             ],
1108 |             "selected_custom_fields": [
1109 |                 {"id": t.id, "document_count": t.document_count} for t in custom_fields
1110 |             ],
1111 |         }
1112 | 
[OMITTED original lines 1113-1113]
1114 |     def _content_filter_params(cls) -> tuple[str, ...]:
1115 |         """
1116 |         Query params whose filtering needs effective_content evaluated in SQL
1117 |         against every candidate row -- see
1118 |         _needs_effective_content_annotation(). Derived rather than
1119 |         hand-maintained so a new content-filtering param counts automatically.
1120 |         """
1121 |         params = [
1122 |             name
1123 |             for name, f in DocumentFilterSet.declared_filters.items()
1124 |             if isinstance(f, (TitleContentFilter, EffectiveContentFilter))
1125 |         ]
1126 |         if "effective_content" in cls.search_fields:
1127 |             params.append(SearchFilter().search_param)
1128 |         return tuple(params)
1129 | 
1130 |     def _needs_effective_content_annotation(self) -> bool:
1131 |         # effective_content is a per-row correlated subquery resolving each
1132 |         # document's latest version. Filtering *on* it forces the database to
1133 |         # evaluate it for every candidate row before reaching the LIMIT, which
1134 |         # the root_document_id self-join makes pathological on MariaDB
1135 |         # specifically once real candidate counts get large; otherwise the
1136 |         # "versions" prefetch + Document.get_effective_content() resolves only
1137 |         # the page that survives pagination. Every param here is deprecated in
1138 |         # favor of the Tantivy-backed search endpoint (see filters.py's
1139 |         # TitleContentFilter/EffectiveContentFilter docs), so pay that cost
1140 |         # only when one is actually used. Blank values don't count, matching
1141 |         # how those filters themselves no-op on them -- an empty `?search=`
1142 |         # applies no predicate.
1143 |         params = self.request.query_params
1144 |         return any(
1145 |             params.get(param, "").strip() for param in self._content_filter_params()
1146 |         )
1147 | 
1148 |     def _requested_fields(self) -> list[str] | None:
1149 |         # The sparse-fieldset `fields` param, as DynamicFieldsModelSerializer
1150 |         # wants it: None means "no restriction, serialize everything", which
1151 |         # a blank value means too. get_queryset() and get_serializer() both
1152 |         # branch on this, and they have to read it identically -- a queryset
1153 |         # that skips the content prefetch for a response that still
1154 |         # serializes content reintroduces get_effective_content()'s
1155 |         # per-instance fallback.
1156 |         fields_param = self.request.query_params.get("fields")
1157 |         return fields_param.split(",") if fields_param else None
1158 | 
1159 |     def _needs_effective_content_prefetch(self) -> bool:
1160 |         # The prefetch spares get_effective_content() a per-instance fallback
1161 |         # query, but only earns itself when content can reach the response.
1162 |         fields = self._requested_fields()
1163 |         return fields is None or "content" in fields
1164 | 
1165 |     def get_queryset(self):
1166 |         # A correlated subquery avoids the LEFT JOIN + Count() this used to
1167 |         # be, which forced a GROUP BY aggregate over every matching document
1168 |         # before the query could even be sorted or limited.
1169 |         note_count = Subquery(
1170 |             Note.objects.filter(document=OuterRef("pk"))
1171 |             .order_by()
1172 |             .values("document")
1173 |             .annotate(count=Count("pk"))
1174 |             .values("count"),
1175 |             output_field=IntegerField(),
1176 |         )
1177 |         # No .distinct() here: nothing in this base queryset can produce
1178 |         # duplicate document rows (select_related below is all FK-to-PK;
1179 |         # permission filtering is a boolean id__in predicate, not a join).
1180 |         # M2M-based filters that *do* introduce a join (e.g. tags__id__in)
1181 |         # already call .distinct() themselves where they need it -- see
1182 |         # ObjectFilter.filter(). A blanket .distinct() here forces the
1183 |         # database to fully sort and dedupe every visible document before
1184 |         # it can apply LIMIT, which is disastrous at scale.
1185 |         prefetches = [
1186 |             Prefetch(
1187 |                 "versions",
1188 |                 queryset=Document.objects.only(
1189 |                     "id",
1190 |                     "added",
1191 |                     "checksum",
1192 |                     "version_label",
1193 |                     "root_document_id",
1194 |                     "version_index",
1195 |                 ),
1196 |             ),
1197 |             "tags",
1198 |             Prefetch(
1199 |                 "custom_fields",
1200 |                 queryset=CustomFieldInstance.objects.select_related("field"),
1201 |             ),
1202 |             # NotesSerializer nests the author, this avoids query per note
1203 |             Prefetch("notes", queryset=Note.objects.select_related("user")),
1204 |         ]
1205 |         if self._needs_effective_content_prefetch():
1206 |             prefetches.append(latest_version_content_prefetch())
1207 |         queryset = (
1208 |             Document.objects.filter(root_document__isnull=True)
1209 |             .order_by("-created", "-id")
1210 |             .annotate(num_notes=Coalesce(note_count, 0))
1211 |             .select_related("correspondent", "storage_path", "document_type", "owner")
1212 |             .prefetch_related(*prefetches)
1213 |         )
1214 |         if self._needs_effective_content_annotation():
1215 |             queryset = annotate_effective_content(queryset)
1216 |         return queryset
1217 | 
1218 |     def get_serializer(self, *args, **kwargs):
1219 |         truncate_content = self.request.query_params.get("truncate_content", "False")
1220 |         kwargs.setdefault("context", self.get_serializer_context())
1221 |         kwargs.setdefault("fields", self._requested_fields())
1222 |         kwargs.setdefault("truncate_content", truncate_content.lower() in ["true", "1"])
1223 |         try:
1224 |             full_perms = get_boolean(
1225 |                 str(self.request.query_params.get("full_perms", "false")),
1226 |             )
1227 |         except ValueError:
1228 |             full_perms = False
1229 |         kwargs.setdefault(
1230 |             "full_perms",
1231 |             full_perms,
1232 |         )
1233 |         return super().get_serializer(*args, **kwargs)
1234 | 
[OMITTED original lines 1235-1244]
1245 |     def root(self, request, pk=None):
1246 |         try:
1247 |             doc = Document.global_objects.select_related(
1248 |                 "owner",
1249 |                 "root_document",
1250 |             ).get(pk=pk)
1251 |         except Document.DoesNotExist:
1252 |             raise Http404
1253 | 
1254 |         root_doc = get_root_document(doc)
1255 |         if request.user is not None and not has_perms_owner_aware(
1256 |             request.user,
1257 |             "view_document",
1258 |             root_doc,
1259 |         ):
1260 |             return HttpResponseForbidden("Insufficient permissions")
1261 | 
1262 |         return Response({"root_id": root_doc.id})
1263 | 
1264 |     def retrieve(
1265 |         self,
1266 |         request: Request,
1267 |         *args: Any,
1268 |         **kwargs: Any,
1269 |     ) -> Response:
1270 |         response = super().retrieve(request, *args, **kwargs)
1271 |         if (
1272 |             "version" not in request.query_params
1273 |             or not isinstance(response.data, dict)
1274 |             or "content" not in response.data
1275 |         ):
1276 |             return response
1277 | 
1278 |         root_doc = self.get_object()
1279 |         content_doc = self._resolve_file_doc(root_doc, request)
1280 |         response.data["content"] = content_doc.content or ""
1281 |         return response
1282 | 
1283 |     def update(self, request, *args, **kwargs):
1284 |         partial = kwargs.pop("partial", False)
1285 |         root_doc = self.get_object()
1286 |         content_doc = (
1287 |             self._resolve_file_doc(root_doc, request)
1288 |             if "version" in request.query_params
1289 |             else get_latest_version_for_root(root_doc)
1290 |         )
1291 |         content_updated = "content" in request.data
1292 |         updated_content = request.data.get("content") if content_updated else None
1293 | 
1294 |         data = request.data.copy()
1295 |         serializer_partial = partial
1296 |         if content_updated and content_doc.id != root_doc.id:
1297 |             if updated_content is None:
1298 |                 raise ValidationError({"content": ["This field may not be null."]})
1299 |             data.pop("content", None)
1300 |             serializer_partial = True
1301 | 
1302 |         serializer = self.get_serializer(
1303 |             root_doc,
1304 |             data=data,
1305 |             partial=serializer_partial,
1306 |         )
1307 |         serializer.is_valid(raise_exception=True)
1308 |         self.perform_update(serializer)
1309 | 
1310 |         if content_updated and content_doc.id != root_doc.id:
1311 |             content_doc.content = (
1312 |                 str(updated_content) if updated_content is not None else ""
1313 |             )
1314 |             content_doc.save(update_fields=["content", "modified"])
1315 | 
1316 |         refreshed_doc = self.get_queryset().get(pk=root_doc.pk)
1317 |         response_data = self.get_serializer(refreshed_doc).data
1318 |         if "version" in request.query_params and "content" in response_data:
1319 |             response_data["content"] = content_doc.content
1320 |         response = Response(response_data)
1321 | 
1322 |         from documents.search import get_backend
1323 | 
1324 |         get_backend().add_or_update(refreshed_doc)
1325 | 
1326 |         document_updated.send(
1327 |             sender=self.__class__,
1328 |             document=refreshed_doc,
1329 |         )
1330 | 
1331 |         return response
1332 | 
1333 |     def list(self, request, *args, **kwargs):
1334 |         if not get_boolean(
1335 |             str(request.query_params.get("include_selection_data", "false")),
1336 |         ):
1337 |             return super().list(request, *args, **kwargs)
1338 | 
1339 |         queryset = self.filter_queryset(self.get_queryset())
1340 |         selection_data = self._get_selection_data_for_queryset(queryset)
1341 | 
1342 |         page = self.paginate_queryset(queryset)
1343 |         if page is not None:
1344 |             serializer = self.get_serializer(page, many=True)
1345 |             response = self.get_paginated_response(serializer.data)
1346 |             response.data["selection_data"] = selection_data
1347 |             return response
1348 | 
1349 |         serializer = self.get_serializer(queryset, many=True)
1350 |         return Response({"results": serializer.data, "selection_data": selection_data})
1351 | 
1352 |     def destroy(self, request, *args, **kwargs):
1353 |         from documents.search import get_backend
1354 | 
1355 |         get_backend().remove(self.get_object().pk)
1356 |         try:
1357 |             return super().destroy(request, *args, **kwargs)
1358 |         except Exception as e:
1359 |             if "Data too long for column" in str(e):
1360 |                 logger.warning(
1361 |                     "Detected a possible incompatible database column. See https://docs.paperless-ngx.com/troubleshooting/#convert-uuid-field",
1362 |                 )
1363 |             logger.error(f"Error deleting document: {e!s}")
1364 |             return HttpResponseBadRequest(
1365 |                 "Error deleting document, check logs for more detail.",
1366 |             )
1367 | 
[OMITTED original lines 1368-1368]
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
1450 |     def get_metadata(self, file, mime_type):
1451 |         if not Path(file).is_file():
1452 |             return None
1453 | 
1454 |         parser_class = get_parser_registry().get_parser_for_file(
1455 |             mime_type,
1456 |             Path(file).name,
1457 |             Path(file),
1458 |         )
1459 |         if parser_class:
1460 |             try:
1461 |                 with parser_class() as parser:
1462 |                     return parser.extract_metadata(file, mime_type)
1463 |             except Exception:  # pragma: no cover
1464 |                 logger.exception(f"Issue getting metadata for {file}")
1465 |                 return []
1466 |         else:  # pragma: no cover
1467 |             logger.warning(f"No parser for {mime_type}")
1468 |             return []
1469 | 
1470 |     def get_filesize(self, filename):
1471 |         if Path(filename).is_file():
1472 |             return Path(filename).stat().st_size
1473 |         return None
1474 | 
[OMITTED original lines 1475-1479]
1480 |     def metadata(self, request, pk=None):
1481 |         resolved = self._resolve_request_and_root_doc(pk, request)
1482 |         if isinstance(resolved, HttpResponseForbidden):
1483 |             return resolved
1484 | 
1485 |         # Choose the effective document (newest version by default,
1486 |         # or explicit via ?version=).
1487 |         doc = self._get_effective_file_doc(
1488 |             resolved.request_doc,
1489 |             resolved.root_doc,
1490 |             request,
1491 |         )
1492 | 
1493 |         document_cached_metadata = get_metadata_cache(doc.pk)
1494 | 
1495 |         archive_metadata = None
1496 |         archive_filesize = (
1497 |             self.get_filesize(doc.archive_path) if doc.has_archive_version else None
1498 |         )
1499 |         if document_cached_metadata is not None:
1500 |             original_metadata = document_cached_metadata.original_metadata
1501 |             archive_metadata = document_cached_metadata.archive_metadata
1502 |             refresh_metadata_cache(doc.pk)
1503 |         else:
1504 |             original_metadata = self.get_metadata(doc.source_path, doc.mime_type)
1505 | 
1506 |             if doc.has_archive_version:
1507 |                 archive_metadata = self.get_metadata(
1508 |                     doc.archive_path,
1509 |                     "application/pdf",
1510 |                 )
1511 |             set_metadata_cache(doc, original_metadata, archive_metadata)
1512 | 
1513 |         meta = {
1514 |             "original_checksum": doc.checksum,
1515 |             "original_size": self.get_filesize(doc.source_path),
1516 |             "original_mime_type": doc.mime_type,
1517 |             "media_filename": doc.filename,
1518 |             "has_archive_version": doc.has_archive_version,
1519 |             "original_metadata": original_metadata,
1520 |             "archive_checksum": doc.archive_checksum,
1521 |             "archive_media_filename": doc.archive_filename,
1522 |             "original_filename": doc.original_filename,
1523 |             "archive_size": archive_filesize,
1524 |             "archive_metadata": archive_metadata,
1525 |         }
1526 | 
1527 |         lang = "en"
1528 |         try:
1529 |             lang = detect(doc.content)
1530 |         except Exception:
1531 |             pass
1532 |         meta["lang"] = lang
1533 | 
1534 |         return Response(meta)
1535 | 
[OMITTED original lines 1536-1543]
1544 |     def suggestions(self, request, pk=None):
1545 |         doc = get_object_or_404(
1546 |             Document.objects.select_related("owner").prefetch_related("versions"),
1547 |             pk=pk,
1548 |         )
1549 |         if request.user is not None and not has_perms_owner_aware(
1550 |             request.user,
1551 |             "change_document",
1552 |             doc,
1553 |         ):
1554 |             return HttpResponseForbidden("Insufficient permissions")
1555 | 
1556 |         document_suggestions = get_suggestion_cache(doc.pk)
1557 | 
1558 |         if document_suggestions is not None:
1559 |             refresh_suggestions_cache(doc.pk)
1560 |             return Response(document_suggestions.suggestions)
1561 | 
1562 |         classifier = load_classifier()
1563 | 
1564 |         dates = []
1565 |         if settings.NUMBER_OF_SUGGESTED_DATES > 0:
1566 |             with get_date_parser() as date_parser:
1567 |                 gen = date_parser.parse(doc.filename, doc.content)
1568 |                 dates = sorted(
1569 |                     {
1570 |                         i
1571 |                         for i in itertools.islice(
1572 |                             gen,
1573 |                             settings.NUMBER_OF_SUGGESTED_DATES,
1574 |                         )
1575 |                     },
1576 |                 )
1577 | 
1578 |         resp_data = {
1579 |             "correspondents": [
1580 |                 c.id for c in match_correspondents(doc, classifier, request.user)
1581 |             ],
1582 |             "tags": [t.id for t in match_tags(doc, classifier, request.user)],
1583 |             "document_types": [
1584 |                 dt.id for dt in match_document_types(doc, classifier, request.user)
1585 |             ],
1586 |             "storage_paths": [
1587 |                 dt.id for dt in match_storage_paths(doc, classifier, request.user)
1588 |             ],
1589 |             "dates": [date.strftime("%Y-%m-%d") for date in dates if date is not None],
1590 |         }
1591 | 
1592 |         # Cache the suggestions and the classifier hash for later
1593 |         set_suggestions_cache(doc.pk, resp_data, classifier)
1594 | 
1595 |         return Response(resp_data)
1596 | 
[OMITTED original lines 1597-1603]
1604 |     def ai_suggestions(self, request, pk=None):
1605 |         doc = get_object_or_404(
1606 |             Document.objects.select_related("owner").prefetch_related("versions"),
1607 |             pk=pk,
1608 |         )
1609 |         if request.user is not None and not has_perms_owner_aware(
1610 |             request.user,
1611 |             "change_document",
1612 |             doc,
1613 |         ):
1614 |             return HttpResponseForbidden("Insufficient permissions")
1615 | 
1616 |         ai_config = AIConfig()
1617 |         if not ai_config.ai_enabled:
1618 |             return HttpResponseBadRequest("AI is required for this feature")
1619 | 
1620 |         output_language = get_llm_output_language(
1621 |             ai_config=ai_config,
1622 |             user=request.user,
1623 |         )
1624 |         llm_cache_backend = ":".join(
1625 |             part
1626 |             for part in (
1627 |                 ai_config.llm_backend,
1628 |                 ai_config.llm_model,
1629 |                 ai_config.llm_endpoint,
1630 |                 output_language,
1631 |                 f"user={request.user.pk}",
1632 |             )
1633 |             if part
1634 |         )
1635 | 
1636 |         cached_llm_suggestions = get_llm_suggestion_cache(
1637 |             doc.pk,
1638 |             backend=llm_cache_backend,
1639 |         )
1640 | 
1641 |         if cached_llm_suggestions:
1642 |             # Only the raw model choices are cached, never resolved object
1643 |             # ids. resolve_choice() below still runs permission filtering
1644 |             # freshly for this requester on every request, cache hit or not,
1645 |             # so a resolved id cached for one user's visibility can never be
1646 |             # handed unfiltered to a second, less-privileged requester of
1647 |             # the same (backend + user-keyed) cache entry.
1648 |             refresh_llm_suggestions_cache(
1649 |                 doc.pk,
1650 |                 backend=llm_cache_backend,
1651 |             )
1652 |             llm_suggestions = cached_llm_suggestions.suggestions
1653 |         else:
1654 |             try:
1655 |                 llm_suggestions = get_ai_document_classification(
1656 |                     doc,
1657 |                     request.user,
1658 |                     output_language,
1659 |                 )
1660 |             except ValueError as exc:
1661 |                 logger.exception(
1662 |                     "Invalid AI configuration while generating suggestions for "
1663 |                     "document %s: %s",
1664 |                     doc.pk,
1665 |                     exc,
1666 |                     exc_info=True,
1667 |                 )
1668 |                 raise ValidationError(
1669 |                     {"ai": [_("Invalid AI configuration.")]},
1670 |                 ) from exc
1671 |             except LLMTimeoutError as exc:
1672 |                 logger.exception(
1673 |                     "AI backend timed out while generating suggestions for "
1674 |                     "document %s: %s",
1675 |                     doc.pk,
1676 |                     exc,
1677 |                     exc_info=True,
1678 |                 )
1679 |                 return Response(
1680 |                     {"ai": [_("AI backend request timed out.")]},
1681 |                     status=status.HTTP_503_SERVICE_UNAVAILABLE,
1682 |                 )
1683 |             except LLMProviderError:
1684 |                 logger.exception(
1685 |                     "AI backend rejected the request for document %s",
1686 |                     doc.pk,
1687 |                 )
1688 |                 return Response(
1689 |                     {
1690 |                         "ai": [
1691 |                             _(
1692 |                                 "AI backend rejected the request. "
1693 |                                 "Check logs for details.",
1694 |                             ),
1695 |                         ],
1696 |                     },
1697 |                     status=status.HTTP_502_BAD_GATEWAY,
1698 |                 )
1699 |             set_llm_suggestions_cache(
1700 |                 doc.pk,
1701 |                 llm_suggestions,
1702 |                 backend=llm_cache_backend,
1703 |             )
1704 | 
1705 |         tags_choice: TaxonomyChoiceDict = llm_suggestions["tags"]
1706 |         correspondents_choice: TaxonomyChoiceDict = llm_suggestions["correspondents"]
1707 |         document_types_choice: TaxonomyChoiceDict = llm_suggestions["document_types"]
1708 |         storage_paths_choice: TaxonomyChoiceDict = llm_suggestions["storage_paths"]
1709 | 
1710 |         def resolve_choice(
1711 |             choice: "TaxonomyChoiceDict",
1712 |             resolve_ids: Callable[[list[int], User], list],
1713 |             match_names: Callable[[list[str], User], list],
1714 |         ) -> list:
1715 |             """The ids the model picked from the candidates it was shown, plus
1716 |             name matches for the values it proposed as new. The schema allows
1717 |             the same object to satisfy both an existing_id and a new_name in
1718 |             one valid response, so results are deduplicated by pk (keeping
1719 |             first-seen order) rather than trusting the two lookups to be
1720 |             disjoint.
1721 |             """
1722 |             matched = resolve_ids(choice["existing_ids"], request.user) + match_names(
1723 |                 choice["new_names"],
1724 |                 request.user,
1725 |             )
1726 |             seen_ids: set[int] = set()
1727 |             deduped = []
1728 |             for obj in matched:
1729 |                 if obj.pk in seen_ids:
1730 |                     continue
1731 |                 seen_ids.add(obj.pk)
1732 |                 deduped.append(obj)
1733 |             return deduped
1734 | 
1735 |         matched_tags = resolve_choice(
1736 |             tags_choice,
1737 |             resolve_tag_ids,
1738 |             match_tags_by_name,
1739 |         )
1740 |         matched_correspondents = resolve_choice(
1741 |             correspondents_choice,
1742 |             resolve_correspondent_ids,
1743 |             match_correspondents_by_name,
1744 |         )
1745 |         matched_types = resolve_choice(
1746 |             document_types_choice,
1747 |             resolve_document_type_ids,
1748 |             match_document_types_by_name,
1749 |         )
1750 |         matched_paths = resolve_choice(
1751 |             storage_paths_choice,
1752 |             resolve_storage_path_ids,
1753 |             match_storage_paths_by_name,
1754 |         )
1755 | 
1756 |         resp_data = {
1757 |             "title": llm_suggestions["title"],
1758 |             "tags": [t.id for t in matched_tags],
1759 |             "suggested_tags": extract_unmatched_names(
1760 |                 tags_choice["new_names"],
1761 |                 matched_tags,
1762 |             ),
1763 |             "correspondents": [c.id for c in matched_correspondents],
1764 |             "suggested_correspondents": extract_unmatched_names(
1765 |                 correspondents_choice["new_names"],
1766 |                 matched_correspondents,
1767 |             ),
1768 |             "document_types": [d.id for d in matched_types],
1769 |             "suggested_document_types": extract_unmatched_names(
1770 |                 document_types_choice["new_names"],
1771 |                 matched_types,
1772 |             ),
1773 |             "storage_paths": [s.id for s in matched_paths],
1774 |             "suggested_storage_paths": extract_unmatched_names(
1775 |                 storage_paths_choice["new_names"],
1776 |                 matched_paths,
1777 |             ),
1778 |             "dates": llm_suggestions["dates"],
1779 |         }
1780 | 
1781 |         return Response(resp_data)
1782 | 
[OMITTED original lines 1783-1787]
1788 |     def preview(self, request, pk=None):
1789 |         resolved = self._resolve_request_and_root_doc(pk, request, include_deleted=True)
1790 |         if isinstance(resolved, HttpResponseForbidden):
1791 |             return resolved
1792 | 
1793 |         try:
1794 |             file_doc = self._get_effective_file_doc(
1795 |                 resolved.request_doc,
1796 |                 resolved.root_doc,
1797 |                 request,
1798 |             )
1799 | 
1800 |             return serve_file(
1801 |                 doc=file_doc,
1802 |                 use_archive=not self.original_requested(request)
1803 |                 and file_doc.has_archive_version,
1804 |                 disposition="inline",
1805 |             )
1806 |         except FileNotFoundError:
1807 |             raise Http404
1808 | 
[OMITTED original lines 1809-1816]
1817 |     def thumb(self, request, pk=None):
1818 |         resolved = self._resolve_request_and_root_doc(pk, request, include_deleted=True)
1819 |         if isinstance(resolved, HttpResponseForbidden):
1820 |             return resolved
1821 | 
1822 |         try:
1823 |             file_doc = self._get_effective_file_doc(
1824 |                 resolved.request_doc,
1825 |                 resolved.root_doc,
1826 |                 request,
1827 |             )
1828 |             handle = file_doc.thumbnail_file
1829 | 
1830 |             return FileResponse(handle, content_type="image/webp")
1831 |         except FileNotFoundError:
1832 |             raise Http404
1833 | 
1834 |     @action(methods=["get"], detail=True)
1835 |     def download(self, request, pk=None):
1836 |         try:
1837 |             return self.file_response(pk, request, "attachment")
1838 |         except (FileNotFoundError, Document.DoesNotExist):
1839 |             raise Http404
1840 | 
[OMITTED original lines 1841-1847]
1848 |     def notes(self, request, pk=None):
1849 |         currentUser = request.user
1850 |         try:
1851 |             doc = (
1852 |                 Document.objects.select_related("owner")
1853 |                 .prefetch_related("notes")
1854 |                 .only("pk", "owner__id")
1855 |                 .get(pk=pk)
1856 |             )
1857 |             if currentUser is not None and not has_perms_owner_aware(
1858 |                 currentUser,
1859 |                 "view_document",
1860 |                 doc,
1861 |             ):
1862 |                 return HttpResponseForbidden("Insufficient permissions to view notes")
1863 |         except Document.DoesNotExist:
1864 |             raise Http404
1865 | 
1866 |         serializer = self.get_serializer(doc)
1867 | 
1868 |         if request.method == "GET":
1869 |             try:
1870 |                 notes = serializer.to_representation(doc).get("notes")
1871 |                 return Response(notes)
1872 |             except Exception as e:
1873 |                 logger.warning(f"An error occurred retrieving notes: {e!s}")
1874 |                 return Response(
1875 |                     {"error": "Error retrieving notes, check logs for more detail."},
1876 |                 )
1877 |         elif request.method == "POST":
1878 |             try:
1879 |                 if currentUser is not None and not has_perms_owner_aware(
1880 |                     currentUser,
1881 |                     "change_document",
1882 |                     doc,
1883 |                 ):
1884 |                     return HttpResponseForbidden(
1885 |                         "Insufficient permissions to create notes",
1886 |                     )
1887 | 
1888 |                 c = Note.objects.create(
1889 |                     document=doc,
1890 |                     note=request.data["note"],
1891 |                     user=currentUser,
1892 |                 )
1893 |                 # If audit log is enabled make an entry in the log
1894 |                 # about this note change
1895 |                 if settings.AUDIT_LOG_ENABLED:
1896 |                     LogEntry.objects.log_create(
1897 |                         instance=doc,
1898 |                         changes={
1899 |                             "Note Added": ["None", c.id],
1900 |                         },
1901 |                         action=LogEntry.Action.UPDATE,
1902 |                     )
1903 | 
1904 |                 doc.modified = timezone.now()
1905 |                 doc.save(update_fields=["modified"])
1906 | 
1907 |                 from documents.search import get_backend
1908 | 
1909 |                 get_backend().add_or_update(doc)
1910 | 
1911 |                 notes = serializer.to_representation(doc).get("notes")
1912 | 
1913 |                 return Response(notes)
1914 |             except Exception as e:
1915 |                 logger.warning(f"An error occurred saving note: {e!s}")
1916 |                 return Response(
1917 |                     {
1918 |                         "error": "Error saving note, check logs for more detail.",
1919 |                     },
1920 |                 )
1921 |         elif request.method == "DELETE":
1922 |             if currentUser is not None and not has_perms_owner_aware(
1923 |                 currentUser,
1924 |                 "change_document",
1925 |                 doc,
1926 |             ):
1927 |                 return HttpResponseForbidden("Insufficient permissions to delete notes")
1928 | 
1929 |             note_id = request.GET.get("id")
1930 |             if not note_id:
1931 |                 raise ValidationError({"id": "This field is required."})
1932 |             try:
1933 |                 note_id_int = int(note_id)
1934 |             except ValueError:
1935 |                 raise ValidationError({"id": "A valid integer is required."})
1936 |             note = get_object_or_404(Note, id=note_id_int, document=doc)
1937 |             if settings.AUDIT_LOG_ENABLED:
1938 |                 LogEntry.objects.log_create(
1939 |                     instance=doc,
1940 |                     changes={
1941 |                         "Note Deleted": [note.id, "None"],
1942 |                     },
1943 |                     action=LogEntry.Action.UPDATE,
1944 |                 )
1945 | 
1946 |             note.delete()
1947 | 
1948 |             doc.modified = timezone.now()
1949 |             doc.save(update_fields=["modified"])
1950 | 
1951 |             from documents.search import get_backend
1952 | 
1953 |             get_backend().add_or_update(doc)
1954 | 
1955 |             notes = serializer.to_representation(doc).get("notes")
1956 | 
1957 |             return Response(notes)
1958 | 
1959 |         return Response(
1960 |             {
1961 |                 "error": "error",
1962 |             },
1963 |         )
1964 | 
[OMITTED original lines 1965-1965]
1966 |     def share_links(self, request, pk=None):
1967 |         currentUser = request.user
1968 |         try:
1969 |             doc = Document.objects.select_related("owner").get(pk=pk)
1970 |             if currentUser is not None and not has_perms_owner_aware(
1971 |                 currentUser,
1972 |                 "change_document",
1973 |                 doc,
1974 |             ):
1975 |                 return HttpResponseForbidden(
1976 |                     "Insufficient permissions to add share link",
1977 |                 )
1978 |         except Document.DoesNotExist:
1979 |             raise Http404
1980 | 
1981 |         if request.method == "GET":
1982 |             now = timezone.now()
1983 |             links = (
1984 |                 ShareLink.objects.filter(document=doc)
1985 |                 .select_related("document")
1986 |                 .only(
1987 |                     "pk",
1988 |                     "created",
1989 |                     "expiration",
1990 |                     "slug",
1991 |                     "document__title",
1992 |                 )
1993 |                 .exclude(expiration__lt=now)
1994 |                 .order_by("-created")
1995 |             )
1996 |             serializer = ShareLinkSerializer(links, many=True)
1997 |             return Response(serializer.data)
1998 | 
[OMITTED original lines 1999-1999]
2000 |     def history(self, request, pk=None):
2001 |         if not settings.AUDIT_LOG_ENABLED:
2002 |             return HttpResponseBadRequest("Audit log is disabled")
2003 |         try:
2004 |             doc = Document.objects.get(pk=pk)
2005 |             if not request.user.has_perm("auditlog.view_logentry") or (
2006 |                 doc.owner is not None
2007 |                 and doc.owner != request.user
2008 |                 and not request.user.is_superuser
2009 |             ):
2010 |                 return HttpResponseForbidden(
2011 |                     "Insufficient permissions",
2012 |                 )
2013 |         except Document.DoesNotExist:  # pragma: no cover
2014 |             raise Http404
2015 | 
2016 |         # documents
2017 |         entries = [
2018 |             {
2019 |                 "id": entry.id,
2020 |                 "timestamp": entry.timestamp,
2021 |                 "action": entry.get_action_display(),
2022 |                 "changes": entry.changes,
2023 |                 "actor": (
2024 |                     {"id": entry.actor.id, "username": entry.actor.username}
2025 |                     if entry.actor
2026 |                     else None
2027 |                 ),
2028 |             }
2029 |             for entry in LogEntry.objects.get_for_object(doc).select_related(
2030 |                 "actor",
2031 |             )
2032 |         ]
2033 | 
2034 |         # custom fields
2035 |         for entry in LogEntry.objects.get_for_objects(
2036 |             doc.custom_fields.all(),
2037 |         ).select_related("actor"):
2038 |             entries.append(
2039 |                 {
2040 |                     "id": entry.id,
2041 |                     "timestamp": entry.timestamp,
2042 |                     "action": entry.get_action_display(),
2043 |                     "changes": {
2044 |                         "custom_fields": {
2045 |                             "type": "custom_field",
2046 |                             "field": str(entry.object_repr).split(":")[0].strip(),
2047 |                             "value": str(entry.object_repr).split(":")[1].strip(),
2048 |                         },
2049 |                     },
2050 |                     "actor": (
2051 |                         {"id": entry.actor.id, "username": entry.actor.username}
2052 |                         if entry.actor
2053 |                         else None
2054 |                     ),
2055 |                 },
2056 |             )
2057 | 
2058 |         return Response(sorted(entries, key=lambda x: x["timestamp"], reverse=True))
2059 | 
[OMITTED original lines 2060-2070]
2071 |     def email_document(self, request, pk=None):
2072 |         request_data = request.data.copy()
2073 |         request_data.setlist("documents", [pk])
2074 |         return self.email_documents(request, data=request_data)
2075 | 
[OMITTED original lines 2076-2082]
2083 |     def email_documents(self, request, data=None):
2084 |         serializer = EmailSerializer(data=data or request.data)
2085 |         serializer.is_valid(raise_exception=True)
2086 | 
2087 |         validated_data = serializer.validated_data
2088 |         document_ids = validated_data.get("documents")
2089 |         addresses = validated_data.get("addresses").split(",")
2090 |         addresses = [addr.strip() for addr in addresses]
2091 |         subject = validated_data.get("subject")
2092 |         message = validated_data.get("message")
2093 |         use_archive_version = validated_data.get("use_archive_version", True)
2094 | 
2095 |         documents = Document.objects.filter(pk__in=document_ids)
2096 |         if (
2097 |             request.user is not None
2098 |             and documents.exclude(
2099 |                 pk__in=permitted_document_ids(request.user),
2100 |             ).exists()
2101 |         ):
2102 |             return HttpResponseForbidden("Insufficient permissions")
2103 | 
2104 |         try:
2105 |             attachments: list[EmailAttachment] = []
2106 |             for doc in documents:
2107 |                 attachment_path = (
2108 |                     doc.archive_path
2109 |                     if use_archive_version and doc.has_archive_version
2110 |                     else doc.source_path
2111 |                 )
2112 |                 attachments.append(
2113 |                     EmailAttachment(
2114 |                         path=attachment_path,
2115 |                         mime_type=doc.mime_type,
2116 |                         friendly_name=doc.get_public_filename(
2117 |                             archive=use_archive_version and doc.has_archive_version,
2118 |                         ),
2119 |                     ),
2120 |                 )
2121 | 
2122 |             send_email(
2123 |                 subject=subject,
2124 |                 body=message,
2125 |                 to=addresses,
2126 |                 attachments=attachments,
2127 |             )
2128 | 
2129 |             logger.debug(
2130 |                 f"Sent documents {[doc.id for doc in documents]} via email to {addresses}",
2131 |             )
2132 |             return Response({"message": "Email sent"})
2133 |         except Exception as e:
2134 |             logger.warning(f"An error occurred emailing documents: {e!s}")
2135 |             return HttpResponseServerError(
2136 |                 "Error emailing documents, check logs for more detail.",
2137 |             )
2138 | 
[OMITTED original lines 2139-2146]
2147 |     def update_version(self, request, pk=None):
2148 |         serializer = DocumentVersionSerializer(data=request.data)
2149 |         serializer.is_valid(raise_exception=True)
2150 | 
2151 |         try:
2152 |             request_doc = Document.objects.select_related(
2153 |                 "owner",
2154 |                 "root_document",
2155 |             ).get(pk=pk)
2156 |             root_doc = get_root_document(request_doc)
2157 |             if request.user is not None and (
2158 |                 not request.user.has_perm("documents.change_document")
2159 |                 or not has_perms_owner_aware(
2160 |                     request.user,
2161 |                     "change_document",
2162 |                     root_doc,
2163 |                 )
2164 |             ):
2165 |                 return HttpResponseForbidden("Insufficient permissions")
2166 |         except Document.DoesNotExist:
2167 |             raise Http404
2168 | 
2169 |         try:
2170 |             doc_name, doc_data = serializer.validated_data.get("document")
2171 |             version_label = serializer.validated_data.get("version_label")
2172 | 
2173 |             t = int(mktime(datetime.now().timetuple()))
2174 | 
2175 |             settings.SCRATCH_DIR.mkdir(parents=True, exist_ok=True)
2176 | 
2177 |             temp_file_path = Path(tempfile.mkdtemp(dir=settings.SCRATCH_DIR)) / Path(
2178 |                 pathvalidate.sanitize_filename(doc_name),
2179 |             )
2180 | 
2181 |             temp_file_path.write_bytes(doc_data)
2182 | 
2183 |             os.utime(temp_file_path, times=(t, t))
2184 | 
2185 |             input_doc = ConsumableDocument(
2186 |                 source=DocumentSource.ApiUpload,
2187 |                 original_file=temp_file_path,
2188 |                 root_document_id=root_doc.pk,
2189 |             )
2190 | 
2191 |             overrides = DocumentMetadataOverrides()
2192 |             if version_label:
2193 |                 overrides.version_label = version_label.strip()
2194 |             if request.user is not None:
2195 |                 overrides.owner_id = request.user.id
2196 |                 overrides.actor_id = request.user.id
2197 | 
2198 |             async_task = consume_file.apply_async(
2199 |                 kwargs={"input_doc": input_doc, "overrides": overrides},
2200 |                 headers={"trigger_source": PaperlessTask.TriggerSource.WEB_UI},
2201 |             )
2202 |             logger.debug(
2203 |                 f"Updated document {root_doc.id} with new version",
2204 |             )
2205 |             return Response(async_task.id)
2206 |         except Exception as e:
2207 |             logger.warning(f"An error occurred updating document: {e!s}")
2208 |             return HttpResponseServerError(
2209 |                 "Error updating document, check logs for more detail.",
2210 |             )
2211 | 
2212 |     def _get_root_doc_for_version_action(self, pk) -> Document:
2213 |         try:
2214 |             root_doc = Document.objects.select_related(
2215 |                 "owner",
2216 |                 "root_document",
2217 |             ).get(pk=pk)
2218 |         except Document.DoesNotExist:
2219 |             raise Http404
2220 |         return get_root_document(root_doc)
2221 | 
2222 |     def _get_version_doc_for_root(self, root_doc: Document, version_id) -> Document:
2223 |         try:
2224 |             version_doc = Document.objects.select_related("owner").get(
2225 |                 pk=version_id,
2226 |             )
2227 |         except Document.DoesNotExist:
2228 |             raise Http404
2229 | 
2230 |         if (
2231 |             version_doc.id != root_doc.id
2232 |             and version_doc.root_document_id != root_doc.id
2233 |         ):
2234 |             raise Http404
2235 |         return version_doc
2236 | 
[OMITTED original lines 2237-2258]
2259 |     def delete_version(self, request, pk=None, version_id=None):
2260 |         root_doc = self._get_root_doc_for_version_action(pk)
2261 | 
2262 |         if request.user is not None and not has_perms_owner_aware(
2263 |             request.user,
2264 |             "delete_document",
2265 |             root_doc,
2266 |         ):
2267 |             return HttpResponseForbidden("Insufficient permissions")
2268 | 
2269 |         version_doc = self._get_version_doc_for_root(root_doc, version_id)
2270 | 
2271 |         if version_doc.id == root_doc.id:
2272 |             return HttpResponseBadRequest(
2273 |                 "Cannot delete the root/original version. Delete the document instead.",
2274 |             )
2275 | 
2276 |         from documents.search import get_backend
2277 | 
2278 |         _backend = get_backend()
2279 |         _backend.remove(version_doc.pk)
2280 |         version_doc_id = version_doc.id
2281 |         version_doc.delete()
2282 |         root_doc.modified = timezone.now()
2283 |         Document.objects.filter(pk=root_doc.pk).update(modified=root_doc.modified)
2284 |         _backend.add_or_update(root_doc)
2285 |         if settings.AUDIT_LOG_ENABLED:
2286 |             actor = (
2287 |                 request.user if request.user and request.user.is_authenticated else None
2288 |             )
2289 |             LogEntry.objects.log_create(
2290 |                 instance=root_doc,
2291 |                 changes={
2292 |                     "Version Deleted": ["None", version_doc_id],
2293 |                 },
2294 |                 action=LogEntry.Action.UPDATE,
2295 |                 actor=actor,
2296 |                 additional_data={
2297 |                     "reason": "Version deleted",
2298 |                     "version_id": version_doc_id,
2299 |                 },
2300 |             )
2301 | 
2302 |         current = versions_newest_first(
2303 |             Document.objects.filter(Q(id=root_doc.id) | Q(root_document=root_doc)),
2304 |         ).first()
2305 | 
2306 |         document_updated.send(
2307 |             sender=self.__class__,
2308 |             document=root_doc,
2309 |         )
2310 |         return Response(
2311 |             {
2312 |                 "result": "OK",
2313 |                 "current_version_id": current.id if current else root_doc.id,
2314 |             },
2315 |         )
2316 | 
[OMITTED original lines 2317-2344]
2345 |     def update_version_label(self, request, pk=None, version_id=None):
2346 |         serializer = DocumentVersionLabelSerializer(data=request.data)
2347 |         serializer.is_valid(raise_exception=True)
2348 | 
2349 |         root_doc = self._get_root_doc_for_version_action(pk)
2350 |         if request.user is not None and not has_perms_owner_aware(
2351 |             request.user,
2352 |             "change_document",
2353 |             root_doc,
2354 |         ):
2355 |             return HttpResponseForbidden("Insufficient permissions")
2356 | 
2357 |         version_doc = self._get_version_doc_for_root(root_doc, version_id)
2358 |         old_label = version_doc.version_label
2359 |         version_doc.version_label = serializer.validated_data["version_label"]
2360 |         version_doc.save(update_fields=["version_label"])
2361 |         root_doc.modified = timezone.now()
2362 |         Document.objects.filter(pk=root_doc.pk).update(modified=root_doc.modified)
2363 | 
2364 |         if settings.AUDIT_LOG_ENABLED and old_label != version_doc.version_label:
2365 |             actor = (
2366 |                 request.user if request.user and request.user.is_authenticated else None
2367 |             )
2368 |             LogEntry.objects.log_create(
2369 |                 instance=root_doc,
2370 |                 changes={
2371 |                     "Version Label": [old_label, version_doc.version_label],
2372 |                 },
2373 |                 action=LogEntry.Action.UPDATE,
2374 |                 actor=actor,
2375 |                 additional_data={
2376 |                     "reason": "Version label updated",
2377 |                     "version_id": version_doc.id,
2378 |                 },
2379 |             )
2380 | 
2381 |         document_updated.send(
2382 |             sender=self.__class__,
2383 |             document=root_doc,
2384 |         )
2385 | 
2386 |         return Response(
2387 |             {
2388 |                 "id": version_doc.id,
2389 |                 "added": version_doc.added,
2390 |                 "version_label": version_doc.version_label,
2391 |                 "checksum": version_doc.checksum,
2392 |                 "is_root": version_doc.id == root_doc.id,
2393 |             },
2394 |         )
2395 | 
2396 | 
[OMITTED original lines 2397-4508]
4509 |     def paginate_queryset(self, queryset):
4510 |         # v9: tasks endpoint was not paginated; preserve plain-list response
4511 |         if self.request.version and int(self.request.version) < 10:
4512 |             return None
4513 |         return super().paginate_queryset(queryset)
4514 | 
[OMITTED original lines 4515-4766]
4767 |     def create(self, request, *args, **kwargs):
4768 |         serializer = self.get_serializer(data=request.data)
4769 |         serializer.is_valid(raise_exception=True)
4770 |         document_ids = serializer.validated_data["document_ids"]
4771 |         documents_qs = Document.objects.filter(pk__in=document_ids).select_related(
4772 |             "owner",
4773 |         )
4774 |         found_ids = set(documents_qs.values_list("pk", flat=True))
4775 |         missing = sorted(set(document_ids) - found_ids)
4776 |         if missing:
4777 |             raise ValidationError(
4778 |                 {
4779 |                     "document_ids": _(
4780 |                         "Documents not found: %(ids)s",
4781 |                     )
4782 |                     % {"ids": ", ".join(str(item) for item in missing)},
4783 |                 },
4784 |             )
4785 | 
4786 |         documents = list(documents_qs)
4787 |         permitted_ids = set(permitted_document_ids(request.user))
4788 |         for document in documents:
4789 |             if document.pk not in permitted_ids:
4790 |                 raise ValidationError(
4791 |                     {
4792 |                         "document_ids": _(
4793 |                             "Insufficient permissions to share document %(id)s.",
4794 |                         )
4795 |                         % {"id": document.pk},
4796 |                     },
4797 |                 )
4798 | 
4799 |         document_map = {document.pk: document for document in documents}
4800 |         ordered_documents = [document_map[doc_id] for doc_id in document_ids]
4801 | 
4802 |         bundle = serializer.save(
4803 |             owner=request.user,
4804 |             documents=ordered_documents,
4805 |         )
4806 |         bundle.remove_file()
4807 |         bundle.status = ShareLinkBundle.Status.PENDING
4808 |         bundle.last_error = None
4809 |         bundle.size_bytes = None
4810 |         bundle.built_at = None
4811 |         bundle.file_path = ""
4812 |         bundle.save(
4813 |             update_fields=[
4814 |                 "status",
4815 |                 "last_error",
4816 |                 "size_bytes",
4817 |                 "built_at",
4818 |                 "file_path",
4819 |             ],
4820 |         )
4821 |         build_share_link_bundle.apply_async(
4822 |             kwargs={"bundle_id": bundle.pk},
4823 |             headers={"trigger_source": PaperlessTask.TriggerSource.MANUAL},
4824 |         )
4825 |         bundle.document_total = len(ordered_documents)
4826 |         response_serializer = self.get_serializer(bundle)
4827 |         headers = self.get_success_headers(response_serializer.data)
4828 |         return Response(
4829 |             response_serializer.data,
4830 |             status=status.HTTP_201_CREATED,
4831 |             headers=headers,
4832 |         )
4833 | 
[OMITTED original lines 4834-4940]
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
