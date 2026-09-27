<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task paperless-note-post-object-change, expressed with source-authorization-assessment/v0. At DocumentViewSet.notes POST handler entry, can an authenticated user who has all listed global POST permissions and an object view grant on a document create a note when a different user owns the document and the caller has no object change_document grant?
Assess repository https://github.com/paperless-ngx/paperless-ngx at source ref 126ec414a8b65158368653a2604ae58415e43103 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:note-post-document-change is a explicit-task-requirement at src/documents/permissions.py:673-699; src/documents/views.py:1857-1892, revision 126ec414a8b65158368653a2604ae58415e43103.
  Policy text: Creating a note requires the POST global note/document permissions and an owner-aware change_document check on the target document; viewing the document alone is insufficient.
  Acceptance is accepted; accepting actor role: task-author; reason: Public fixed-ref source and task-author bounded requirement.

The principals are:
- principal:viewer-no-change has role authenticated user with global note POST permissions and only object view access. Author facts: ["The caller has documents.add_note, documents.view_document, and documents.change_document global permissions.","The caller has an object view grant but no object change grant on the document."]
  Starting capabilities: none declared.

The resources are:
- resource:other-document is a document and attached note. Author facts: ["The document exists and is owned by another user.","The caller is not its owner."]

The declared source entries are:
- entry:notes-post names DocumentViewSet.notes POST.
  Source location: src/documents/views.py, startLine 1, endLine 73.

The authorization obligations are:
- scenario:viewer-cannot-add-note: principal principal:viewer-no-change, resource resource:other-document, relation object-view-without-object-change, operation create note on document, expected policy disposition deny.
  Policy source: policy:note-post-document-change. Declared entries: entry:notes-post.
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
Current question: At DocumentViewSet.notes POST handler entry, can an authenticated user who has all listed global POST permissions and an object view grant on a document create a note when a different user owns the document and the caller has no object change_document grant?
Analysis boundary: declared-entry.
Task premise: At notes POST entry, the authenticated caller has the global POST permissions and an object view grant, but is not the document owner and lacks its object change_document grant.
Required response detail: Separate the global PaperlessNotePermissions check, the object view check, the object change check, and Note.objects.create effect.

## Explicit assessment program
- Current question scenario%3Aviewer-cannot-add-note::entry%3Anotes-post at entry:notes-post; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At notes POST entry, the authenticated caller has the global POST permissions and an object view grant, but is not the document owner and lacks its object change_document grant..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Separate the global PaperlessNotePermissions check, the object view check, the object change check, and Note.objects.create effect..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Aviewer-cannot-add-note::entry%3Anotes-post
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: src/documents/views.py =====
Source ID: src-dbf91e921bfbd270
Location note: crop lines 1-73; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 |     @action(
2 |         methods=["get", "post", "delete"],
3 |         detail=True,
4 |         permission_classes=[PaperlessNotePermissions],
5 |         pagination_class=None,
6 |         filter_backends=[],
7 |     )
8 |     def notes(self, request, pk=None):
9 |         currentUser = request.user
10 |         try:
11 |             doc = (
12 |                 Document.objects.select_related("owner")
13 |                 .prefetch_related("notes")
14 |                 .only("pk", "owner__id")
15 |                 .get(pk=pk)
16 |             )
17 |             if currentUser is not None and not has_perms_owner_aware(
18 |                 currentUser,
19 |                 "view_document",
20 |                 doc,
21 |             ):
22 |                 return HttpResponseForbidden("Insufficient permissions to view notes")
23 |         except Document.DoesNotExist:
24 |             raise Http404
25 | 
26 |         serializer = self.get_serializer(doc)
27 | 
28 |         if request.method == "GET":
29 |             try:
30 |                 notes = serializer.to_representation(doc).get("notes")
31 |                 return Response(notes)
32 |             except Exception as e:
33 |                 logger.warning(f"An error occurred retrieving notes: {e!s}")
34 |                 return Response(
35 |                     {"error": "Error retrieving notes, check logs for more detail."},
36 |                 )
37 |         elif request.method == "POST":
38 |             try:
39 |                 if currentUser is not None and not has_perms_owner_aware(
40 |                     currentUser,
41 |                     "change_document",
42 |                     doc,
43 |                 ):
44 |                     return HttpResponseForbidden(
45 |                         "Insufficient permissions to create notes",
46 |                     )
47 | 
48 |                 c = Note.objects.create(
49 |                     document=doc,
50 |                     note=request.data["note"],
51 |                     user=currentUser,
52 |                 )
53 |                 # If audit log is enabled make an entry in the log
54 |                 # about this note change
55 |                 if settings.AUDIT_LOG_ENABLED:
56 |                     LogEntry.objects.log_create(
57 |                         instance=doc,
58 |                         changes={
59 |                             "Note Added": ["None", c.id],
60 |                         },
61 |                         action=LogEntry.Action.UPDATE,
62 |                     )
63 | 
64 |                 doc.modified = timezone.now()
65 |                 doc.save(update_fields=["modified"])
66 | 
67 |                 from documents.search import get_backend
68 | 
69 |                 get_backend().add_or_update(doc)
70 | 
71 |                 notes = serializer.to_representation(doc).get("notes")
72 | 
73 |                 return Response(notes)
===== END ALLOWED INPUT: src/documents/views.py =====
