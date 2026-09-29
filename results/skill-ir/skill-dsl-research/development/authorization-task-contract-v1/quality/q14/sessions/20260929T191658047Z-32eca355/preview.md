<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task paperless-share-create-document-view, expressed with source-authorization-assessment/v0. At ShareLinkViewSet.create handler entry, can an authenticated caller with global add_sharelink and global view_document permission create a share link for a document owned by someone else when the caller lacks object view_document permission on that document?
Assess repository https://github.com/paperless-ngx/paperless-ngx at source ref 126ec414a8b65158368653a2604ae58415e43103 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:share-target-document-view is a explicit-task-requirement at src/documents/permissions.py:30-53; src/documents/serialisers.py:2851-2886, revision 126ec414a8b65158368653a2604ae58415e43103.
  Policy text: Share-link creation requires the share-link creation permission and view access to the referenced document; a global view_document grant alone does not substitute for the owner-aware object check.
  Acceptance is accepted; accepting actor role: task-author; reason: Public fixed-ref source and task-author bounded requirement.

The principals are:
- principal:global-permissions-only has role authenticated user with global add_sharelink and view_document permissions. Author facts: ["The caller has the global permissions named in the question.","The caller has no object view_document grant on the target document."]
  Starting capabilities: none declared.

The resources are:
- resource:other-document-share is a document and new share link. Author facts: ["The referenced document exists and is owned by another user.","No object view grant is held by the caller."]

The declared source entries are:
- entry:share-create names ShareLinkViewSet.create.
  Source location: src/documents/views.py, startLine 4696, endLine 4717.

The authorization obligations are:
- scenario:global-only-no-document-view: principal principal:global-permissions-only, resource resource:other-document-share, relation global-view-without-object-view, operation create share link referencing document, expected policy disposition deny.
  Policy source: policy:share-target-document-view. Declared entries: entry:share-create.
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
Current question: At ShareLinkViewSet.create handler entry, can an authenticated caller with global add_sharelink and global view_document permission create a share link for a document owned by someone else when the caller lacks object view_document permission on that document?
Analysis boundary: declared-entry.
Task premise: At ShareLinkViewSet.create entry, the authenticated caller has global add_sharelink and view_document, but the referenced document exists, belongs to another user, and has no caller object view grant.
Required response detail: Trace the viewset's permissions and serializer validation of the referenced document; distinguish the share-link object from its target document.

## Explicit assessment program
- Current question scenario%3Aglobal-only-no-document-view::entry%3Ashare-create at entry:share-create; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At ShareLinkViewSet.create entry, the authenticated caller has global add_sharelink and view_document, but the referenced document exists, belongs to another user, and has no caller object view grant..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Trace the viewset's permissions and serializer validation of the referenced document; distinguish the share-link object from its target document..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Aglobal-only-no-document-view::entry%3Ashare-create
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
Preparation status: partial

Closure claim: declared-dependencies-only

Prepared from: https://github.com/paperless-ngx/paperless-ngx@126ec414a8b65158368653a2604ae58415e43103; root ../../../authorization-evidence-editing-v1/public-source/paperless

Included original ranges: src/documents/permissions.py:30-53 [model-proposal:dep-share-create-http-permission-map]; src/documents/permissions.py:624-637 [model-proposal:dep-share-create-owner-aware-check, host-context:symbol-d50f36cbe040d6fab5ea55a5]; src/documents/serialisers.py:2869-2886 [model-proposal:dep-share-create-document-validation]; src/documents/views.py:406-428 [locator:located-2, model-proposal:dep-share-create-user-context]; src/documents/views.py:4696-4719 [model-proposal:dep-share-viewset-composition, entry:share-create, locator:located-1, model-proposal:dep-share-serializer-binding, model-proposal:dep-share-permission-binding]

Unresolved gaps: context:range:src/documents/permissions.py:30-53: range-uncertain (src/documents/permissions.py); context:range:src/documents/serialisers.py:2869-2886: range-uncertain (src/documents/serialisers.py); context:range:src/documents/views.py:406-428: range-uncertain (src/documents/views.py); context:range:src/documents/views.py:4696-4719: range-uncertain (src/documents/views.py)

===== BEGIN ALLOWED INPUT: src/documents/permissions.py =====
Source ID: src-07683b2578aff9f7
Location note: crop lines 30-637; original locations: src/documents/permissions.py:30-53, src/documents/permissions.py:624-637
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
30 | class PaperlessObjectPermissions(DjangoObjectPermissions):
31 |     """
32 |     A permissions backend that checks for object-level permissions
33 |     or for ownership.
34 |     """
35 | 
36 |     perms_map = {
37 |         "GET": ["%(app_label)s.view_%(model_name)s"],
38 |         "OPTIONS": ["%(app_label)s.view_%(model_name)s"],
39 |         "HEAD": ["%(app_label)s.view_%(model_name)s"],
40 |         "POST": ["%(app_label)s.add_%(model_name)s"],
41 |         "PUT": ["%(app_label)s.change_%(model_name)s"],
42 |         "PATCH": ["%(app_label)s.change_%(model_name)s"],
43 |         "DELETE": ["%(app_label)s.delete_%(model_name)s"],
44 |     }
45 | 
46 |     def has_object_permission(self, request, view, obj):
47 |         if hasattr(obj, "owner") and obj.owner is not None:
48 |             if request.user == obj.owner:
49 |                 return True
50 |             else:
51 |                 return super().has_object_permission(request, view, obj)
52 |         else:
53 |             return True  # no owner
[OMITTED original lines 54-623]
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

===== BEGIN ALLOWED INPUT: src/documents/serialisers.py =====
Source ID: src-d74dd1895d260a60
Location note: crop lines 2869-2886; original locations: src/documents/serialisers.py:2869-2886
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
2869 |     def create(self, validated_data):
2870 |         validated_data["slug"] = get_random_string(50)
2871 |         return super().create(validated_data)
2872 | 
2873 |     def validate_document(self, document):
2874 |         if (
2875 |             self.user is not None
2876 |             and self.user.has_perm("documents.view_document")
2877 |             and has_perms_owner_aware(
2878 |                 self.user,
2879 |                 "view_document",
2880 |                 document,
2881 |             )
2882 |         ):
2883 |             return document
2884 |         raise PermissionDenied(
2885 |             _("Insufficient permissions."),
2886 |         )
===== END ALLOWED INPUT: src/documents/serialisers.py =====

===== BEGIN ALLOWED INPUT: src/documents/views.py =====
Source ID: src-b740d736ac7a1cf1
Location note: crop lines 406-4719; original locations: src/documents/views.py:406-428, src/documents/views.py:4696-4719
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
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
[OMITTED original lines 429-4695]
4696 | class ShareLinkViewSet(
4697 |     PassUserMixin,
4698 |     CreateModelMixin,
4699 |     RetrieveModelMixin,
4700 |     DestroyModelMixin,
4701 |     ListModelMixin,
4702 |     GenericViewSet,
4703 | ):
4704 |     model = ShareLink
4705 | 
4706 |     queryset = ShareLink.objects.select_related("document")
4707 | 
4708 |     serializer_class = ShareLinkSerializer
4709 |     pagination_class = StandardPagination
4710 |     permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
4711 |     filter_backends = (
4712 |         DjangoFilterBackend,
4713 |         OrderingFilter,
4714 |         PermittedObjectsFilter,
4715 |     )
4716 |     filterset_class = ShareLinkFilterSet
4717 |     ordering_fields = ("created", "expiration", "document__title")
4718 | 
4719 | 
===== END ALLOWED INPUT: src/documents/views.py =====
