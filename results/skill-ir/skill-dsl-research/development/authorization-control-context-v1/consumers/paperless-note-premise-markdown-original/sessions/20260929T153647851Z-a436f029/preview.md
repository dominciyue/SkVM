<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
# Authorization Assessment Authoring Instructions

## Source identity

- **Task ID:** `al-use-paperless-note`
- **Repository:** `https://github.com/paperless-ngx/paperless-ngx`
- **Source ref:** `126ec414a8b65158368653a2604ae58415e43103`
- **Source root:** `../../../../authorization-evidence-editing-v1/public-source/paperless`
- **Allowed files:**
  - `src/documents/views.py`
  - `src/documents/permissions.py`
- **Request:** At notes POST handler entry assess both scenarios. The caller is not the document owner. The owner's presence is unspecified in the original task: distinguish absent from other-present where it changes authorization. Both callers have all stated global permissions and can view the document. Separate source-visible authorization from accepted-policy comparison.

## Analysis entry

Declare only this analysis entry:

- **Entry key:** `notes-post`
- **Path:** `src/documents/views.py`
- **Start line:** `1841`
- **End line:** `1913`

Helpers must be represented only as evidence-request dependencies, not as additional analysis entries. An empty dependency list with `discover=true` is supported.

## Domain dictionaries

Fill only the unknown domain dictionaries using these named keys:

### Policy: `rule`

> Creating a note requires the stated global permissions and either document ownership or an object change_document grant; an object view grant alone is insufficient.

The original and changed policies are identical. Preserve both policy identities without modifying the text.

- **Original policy location:** `author-briefs.json#/paperless-note-premise/originalPolicy`
- **Changed policy location:** `author-briefs.json#/paperless-note-premise/originalPolicy`

### Principal: `caller`

> authenticated user with the stated global permissions

### Resource: `target`

The document on which the caller attempts to create a note.

Do not add inferred attributes, permissions, ownership facts, or authorization obligations to these domain definitions.

## Scenarios

Retain exactly the two supplied scenario keys.

### `view-only`

- **Principal:** `caller`
- **Target:** `target`
- **Relation:** `not-owner-view-only`
- **Operation:** `create a note on the document`
- **Premise ID:** `object-relation`

**Original premise:**

> At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has no object change_document grant. Owner presence is unspecified: it may be absent or owned by a different user.

**Changed/current premise:**

> At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has no object change_document grant. Owner is other-present: a different user owns the document.

- **Original expectation:** `deny`
- **Changed/current expectation:** `deny`

### `change-granted`

- **Principal:** `caller`
- **Target:** `target`
- **Relation:** `not-owner-change-granted`
- **Operation:** `create a note on the document`
- **Premise ID:** `object-relation`

**Original premise:**

> At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has an object change_document grant. Owner presence is unspecified: it may be absent or owned by a different user.

**Changed/current premise:**

> At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has an object change_document grant. Owner is other-present: a different user owns the document.

- **Original expectation:** `allow`
- **Changed/current expectation:** `allow`

## Requested counterfactuals

Retain both requested owner-presence counterfactuals for each scenario:

- `absent`
- `other-present`

Assess the counterfactuals only where owner presence changes authorization.

## Analysis contract

For each supplied scenario:

1. Begin assessment at the `notes-post` handler entry.
2. Assess source-visible authorization separately from comparison with the accepted policy.
3. Preserve the stated global permissions, object grants, non-owner relation, operation, conditions, and expectations.
4. Distinguish an absent owner from an owner who is a different user where that distinction changes authorization.
5. Use only the allowed source files for evidence.
6. Represent helper inspection through evidence-request dependencies; do not declare helper functions as analysis entries.
7. Do not infer source outcomes in the authored task.
8. Do not add scenarios, obligations, permissions, relations, conditions, or policy requirements.
9. Do not change source bytes, source ref, task identity, entry identity, scenario identities, or expectations.
10. Record the premise change only: the original owner-presence statement is unspecified, while the changed/current statement fixes the owner as other-present.

## Public analysis questions
Use the current declared policy and explicit premises. Trace decisive control and effect, distinguish unspecified from absent, and answer requested branches without inventing runtime facts.

## Explicit assessment program
- Current question scenario%3Achange-granted::entry%3Anotes-post at entry:notes-post; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): object-relation: At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has an object change_document grant. Owner presence is unspecified: it may be absent or owned by a different user..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Explicit counterfactual scenario%3Achange-granted::entry%3Anotes-post::branch:absent: condition:change-granted:owner-present=false. Answer separately from the current case.
  Explicit counterfactual scenario%3Achange-granted::entry%3Anotes-post::branch:other-present: condition:change-granted:owner-present=true. Answer separately from the current case.
  Required response details: Report source behavior and policy comparison separately; source-external store failure is not authorization..
- Current question scenario%3Aview-only::entry%3Anotes-post at entry:notes-post; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): object-relation: At handler entry, the caller has global add_note, view_document and change_document permissions and an object view grant, is not the document owner, and has no object change_document grant. Owner presence is unspecified: it may be absent or owned by a different user..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Explicit counterfactual scenario%3Aview-only::entry%3Anotes-post::branch:absent: condition:view-only:owner-present=false. Answer separately from the current case.
  Explicit counterfactual scenario%3Aview-only::entry%3Anotes-post::branch:other-present: condition:view-only:owner-present=true. Answer separately from the current case.
  Required response details: Report source behavior and policy comparison separately; source-external store failure is not authorization..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- scenario%3Achange-granted::entry%3Anotes-post: scenario%3Achange-granted::entry%3Anotes-post::branch:absent [{"conditionId":"condition:change-granted:owner-present","value":"false"}]
- scenario%3Achange-granted::entry%3Anotes-post: scenario%3Achange-granted::entry%3Anotes-post::branch:other-present [{"conditionId":"condition:change-granted:owner-present","value":"true"}]
- scenario%3Aview-only::entry%3Anotes-post: scenario%3Aview-only::entry%3Anotes-post::branch:absent [{"conditionId":"condition:view-only:owner-present","value":"false"}]
- scenario%3Aview-only::entry%3Anotes-post: scenario%3Aview-only::entry%3Anotes-post::branch:other-present [{"conditionId":"condition:view-only:owner-present","value":"true"}]
Exact runnable obligation IDs (closed list):
- scenario%3Achange-granted::entry%3Anotes-post
- scenario%3Aview-only::entry%3Anotes-post
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
Preparation status: partial

Closure claim: declared-dependencies-only

Prepared from: https://github.com/paperless-ngx/paperless-ngx@126ec414a8b65158368653a2604ae58415e43103; root ../../../authorization-evidence-editing-v1/public-source/paperless

Included original ranges: src/documents/permissions.py:345-407 [locator:located-6, host-context:symbol-eb1cc3a5ccb526fe7951cf85]; src/documents/permissions.py:460-476 [locator:located-7, host-context:symbol-0353073a301a66f562966793]; src/documents/permissions.py:624-637 [locator:located-2, model-proposal:dep-owner-aware-decision, host-context:symbol-d50f36cbe040d6fab5ea55a5]; src/documents/permissions.py:678-691 [model-proposal:dep-notes-post-global-permissions-map]; src/documents/permissions.py:693-701 [model-proposal:dep-notes-global-permission-check, host-context:symbol-2128309ca7535c841e0ef0c8]; src/documents/views.py:406-410 [locator:located-5]; src/documents/views.py:431-435 [locator:located-4]; src/documents/views.py:1008-1045 [model-proposal:dep-document-viewset-default-permissions, locator:located-1]; src/documents/views.py:1841-1913 [model-proposal:dep-notes-action-permissions, entry:notes-post, model-proposal:dep-notes-caller-identity, model-proposal:dep-notes-document-owner-binding, model-proposal:dep-notes-view-gate, model-proposal:dep-notes-post-change-gate, model-proposal:dep-notes-create-effect]; src/documents/views.py:4767-4833 [locator:located-3, host-context:symbol-14fa67f5ad9c0c69d8e39c6c]

Unresolved gaps: context:range:src/documents/permissions.py:678-691: range-uncertain (src/documents/permissions.py); context:range:src/documents/views.py:406-410: range-uncertain (src/documents/views.py); context:range:src/documents/views.py:431-435: range-uncertain (src/documents/views.py); context:range:src/documents/views.py:1008-1045: range-uncertain (src/documents/views.py); context:range:src/documents/views.py:1841-1913: range-uncertain (src/documents/views.py)

===== BEGIN ALLOWED INPUT: src/documents/permissions.py =====
Source ID: src-8e23b54ee1e9331a
Location note: crop lines 345-701; original locations: src/documents/permissions.py:345-407, src/documents/permissions.py:460-476, src/documents/permissions.py:624-637, src/documents/permissions.py:678-691, src/documents/permissions.py:693-701
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
345 | def permitted_object_ids(
346 |     user: User | None,
347 |     model: type[Model],
348 |     perm: str,
349 |     *,
350 |     include_deleted: bool = False,
351 | ) -> QuerySet[int]:
352 |     """
353 |     Generic version of ``permitted_document_ids`` for any model with an
354 |     ``owner`` field and guardian object-level permissions. ``include_deleted``
355 |     only has an effect for models exposing a ``global_objects``/``deleted_at``
356 |     soft-delete pattern (currently only ``Document``); for every other model
357 |     it is accepted but has no effect, since those models have no soft-delete
358 |     concept.
359 |     """
360 |     has_soft_delete = hasattr(model, "global_objects")
361 |     manager = (
362 |         model.global_objects if include_deleted and has_soft_delete else model.objects
363 |     )
364 |     base_qs = manager.all().only("id", "owner")
365 | 
366 |     if user is None or not getattr(user, "is_authenticated", False):
367 |         return base_qs.filter(owner__isnull=True).values_list("id", flat=True)
368 | 
369 |     # Deactivated users get nothing, deactivated superusers included, so this
370 |     # has to come before the superuser shortcut. guardian's
371 |     # ObjectPermissionChecker denies inactive users, but get_objects_for_user
372 |     # (the pattern this replaces) does not, so it would not be inherited.
373 |     if not getattr(user, "is_active", False):
374 |         return base_qs.none().values_list("id", flat=True)
375 | 
376 |     if getattr(user, "is_superuser", False):
377 |         return base_qs.values_list("id", flat=True)
378 | 
379 |     # Guardian's UserObjectPermission/GroupObjectPermission always store a bare
380 |     # codename, but has_perm()-style callers commonly pass the qualified
381 |     # "app_label.codename" form. content_type already disambiguates the
382 |     # codename, so just drop any prefix rather than silently under-permitting.
383 |     perm = perm.rsplit(".", 1)[-1]
384 | 
385 |     content_type = ContentType.objects.get_for_model(model)
386 |     perm_filter = {
387 |         "permission__codename": perm,
388 |         "permission__content_type": content_type,
389 |     }
390 | 
391 |     user_perm_ids = (
392 |         UserObjectPermission.objects.filter(user=user, **perm_filter)
393 |         .annotate(object_pk_int=Cast("object_pk", IntegerField()))
394 |         .values_list("object_pk_int", flat=True)
395 |     )
396 |     group_perm_ids = (
397 |         GroupObjectPermission.objects.filter(group__user=user, **perm_filter)
398 |         .annotate(object_pk_int=Cast("object_pk", IntegerField()))
399 |         .values_list("object_pk_int", flat=True)
400 |     )
401 |     permitted_ids = user_perm_ids.union(group_perm_ids)
402 | 
403 |     return base_qs.filter(
404 |         Q(owner=user) | Q(owner__isnull=True) | Q(id__in=permitted_ids),
405 |     ).values_list("id", flat=True)
406 | 
407 | 
[OMITTED original lines 408-459]
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
[OMITTED original lines 477-623]
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
[OMITTED original lines 638-677]
678 |     perms_map = {
679 |         "OPTIONS": ["documents.view_note", "documents.view_document"],
680 |         "GET": ["documents.view_note", "documents.view_document"],
681 |         "POST": [
682 |             "documents.add_note",
683 |             "documents.view_document",
684 |             "documents.change_document",
685 |         ],
686 |         "DELETE": [
687 |             "documents.delete_note",
688 |             "documents.view_document",
689 |             "documents.change_document",
690 |         ],
691 |     }
[OMITTED original lines 692-692]
693 |     def has_permission(self, request, view):
694 |         if not request.user or (not request.user.is_authenticated):  # pragma: no cover
695 |             return False
696 | 
697 |         perms = self.perms_map[request.method]
698 | 
699 |         return request.user.has_perms(perms)
700 | 
701 | 
===== END ALLOWED INPUT: src/documents/permissions.py =====

===== BEGIN ALLOWED INPUT: src/documents/views.py =====
Source ID: src-aaf9347ec6f24c4a
Location note: crop lines 406-4833; original locations: src/documents/views.py:406-410, src/documents/views.py:431-435, src/documents/views.py:1008-1045, src/documents/views.py:1841-1913, src/documents/views.py:4767-4833
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
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
[OMITTED original lines 1046-1840]
1841 |     @action(
1842 |         methods=["get", "post", "delete"],
1843 |         detail=True,
1844 |         permission_classes=[PaperlessNotePermissions],
1845 |         pagination_class=None,
1846 |         filter_backends=[],
1847 |     )
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
[OMITTED original lines 1914-4766]
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
===== END ALLOWED INPUT: src/documents/views.py =====
