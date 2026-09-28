<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
# Paperless-ngx Notes POST Authorization Task

## Repository and source

- **Repository:** `https://github.com/paperless-ngx/paperless-ngx`
- **Original source ref:** `126ec414a8b65158368653a2604ae58415e43103`
- **Changed source ref:** `synthetic-ak-change-grants-disabled-v1-6c01553267afcf78`
- **Use for this task:** the supplied synthetic source copy at the changed source ref
- **Allowed files:**
  - `src/documents/views.py`
  - `src/documents/permissions.py`
- **Requested analysis entry:** the `notes` handler’s POST path
- **File and original range:** `src/documents/views.py`, lines `1841–1913`
- **Handler:** `notes(self, request, pk=None)`

Analyze only the requested handler as the primary analysis entry. Permission helpers and other supporting definitions belong in evidence-request dependencies. Do not author helper positions as additional analysis entries. An empty dependency list with discovery enabled is acceptable when appropriate.

## Accepted policy

> Creating a note requires the stated global permissions and object-level change_document authorization; a view grant alone is insufficient, while document ownership or an object change grant can satisfy the object control.

## Task

At the notes POST handler, assess whether `Note.objects.create` is reached for each scenario below. Both callers are authenticated and hold the stated global `add_note`, `view_document`, and `change_document` permissions. Both callers can view the document. Use the declared object relation in each scenario.

For each scenario:

1. Trace the relevant authorization checks in the requested handler.
2. Request or cite helper evidence as needed, without treating helper positions as additional authored analysis entries.
3. Determine whether execution reaches `Note.objects.create`.
4. Cite the relevant source locations.
5. Compare the accepted policy with the observed authorization control and resulting effect.
6. Separate the policy expectation from the observed source control and effect.
7. Do not infer facts beyond the stated scenario premise.

## Scenarios

### `view-only`

**Principal:** authenticated user with the stated global permissions

**Relation:** `object-view-granted-not-owner-no-change-grant`

**Operation:** create a note on the document

**Premise:**

> At handler entry, the caller has the stated global permissions and object view grant, but is not the document owner and has no object change_document grant.

**Policy expectation:** `deny`

### `change-granted`

**Principal:** authenticated user with the stated global permissions

**Relation:** `object-change-granted-not-owner`

**Operation:** create a note on the document

**Premise:**

> At handler entry, the caller has the stated global permissions and object view and change_document grants, but is not the document owner.

**Policy expectation:** `allow`

## Required source evidence

Cite source locations for:

- the document view authorization check;
- the POST-specific change authorization check;
- the `Note.objects.create` call;
- any owner-aware permission helper behavior relied upon.

Keep helper evidence in evidence-request dependencies rather than authoring helper positions as separate analysis entries.

## Required reporting

For each scenario, report separately:

- the stated policy expectation;
- the relevant authorization checks in the requested handler;
- the observed source control;
- whether `Note.objects.create` is reached;
- the resulting effect;
- the comparison between the accepted policy and the observed control/effect;
- precise source citations.

Do not provide either scenario’s observed answer in these task instructions. Do not alter, reinterpret, or weaken the premises. Keep the analysis scoped to the requested notes POST handler and the evidence required to evaluate it.

## Changed-source preparation

Use the supplied synthetic source copy and its new source ref:

- **Source ref:** `synthetic-ak-change-grants-disabled-v1-6c01553267afcf78`
- **Source root:** `../../../author-source/paperless-synthetic`

Make the requested local source change by using the supplied changed source. Preserve all unaffected content. The changed source modifies only the owner-aware permission helper so that non-owner `change_document` object grants are no longer honored. Do not modify the accepted policy, scenario premises or relations, policy expectations, identities, or task ID. A complete edited file is allowed if needed.

Re-prepare the changed source, compare it with the original session, and run the changed source fresh. Preparation must not be treated as execution of target code. Do not answer the scenarios in the authored instructions.

## Public analysis questions
Assess both declared scenarios at handler entry using the supplied fixed source and accepted task policy. Treat premises as task assumptions, trace identity/object/control/effect with exact supplied-source citations, and separate policy expectation from observed authorization. Do not execute target code or infer deployment facts.

## Explicit assessment program
- Current question scenario%3Achange-granted::entry%3Anotes-post at entry:notes-post; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): object-relation: At handler entry, the caller has the stated global permissions and object view and change_document grants, but is not the document owner..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Trace the decisive source-visible control and protected effect, and compare with the accepted policy..
- Current question scenario%3Aview-only::entry%3Anotes-post at entry:notes-post; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): object-relation: At handler entry, the caller has the stated global permissions and object view grant, but is not the document owner and has no object change_document grant..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Trace the decisive source-visible control and protected effect, and compare with the accepted policy..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Achange-granted::entry%3Anotes-post
- scenario%3Aview-only::entry%3Anotes-post
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
Preparation status: partial

Closure claim: declared-dependencies-only

Prepared from: https://github.com/paperless-ngx/paperless-ngx@synthetic-ak-change-grants-disabled-v1-6c01553267afcf78; root ../../author-source/paperless-synthetic

Included original ranges: src/documents/views.py:1841-1913 [model-proposal:dep-1, entry:notes-post]; src/documents/views.py:4767-4833 [locator:located-2]; src/documents/permissions.py:345-350 [locator:located-3]; src/documents/permissions.py:460-464 [locator:located-4]; src/documents/permissions.py:624-637 [locator:located-1]

Unresolved gaps: dep-2: ambiguous-location (src/documents/views.py); dep-3: ambiguous-location (src/documents/views.py); dep-4: ambiguous-location (src/documents/views.py); dep-5: ambiguous-location (src/documents/views.py); dep-6: ambiguous-location (src/documents/permissions.py); dep-7: ambiguous-location (src/documents/views.py); dep-8: ambiguous-location (src/documents/permissions.py)

===== BEGIN ALLOWED INPUT: src/documents/permissions.py =====
Source ID: src-ca3b218796aad639
Location note: crop lines 345-637; original locations: src/documents/permissions.py:345-350, src/documents/permissions.py:460-464, src/documents/permissions.py:624-637
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
345 | def permitted_object_ids(
346 |     user: User | None,
347 |     model: type[Model],
348 |     perm: str,
349 |     *,
350 |     include_deleted: bool = False,
[OMITTED original lines 351-459]
460 | def permitted_document_ids(
461 |     user: User | None,
462 |     *,
463 |     perm: str = "view_document",
464 |     include_deleted: bool = False,
[OMITTED original lines 465-623]
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
635 |     return obj.owner is None or obj.owner == user or (perms != "change_document" and checker.has_perm(perms, obj))
636 | 
637 | 
===== END ALLOWED INPUT: src/documents/permissions.py =====

===== BEGIN ALLOWED INPUT: src/documents/views.py =====
Source ID: src-4254268361531e1d
Location note: crop lines 1841-4833; original locations: src/documents/views.py:1841-1913, src/documents/views.py:4767-4833
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
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
