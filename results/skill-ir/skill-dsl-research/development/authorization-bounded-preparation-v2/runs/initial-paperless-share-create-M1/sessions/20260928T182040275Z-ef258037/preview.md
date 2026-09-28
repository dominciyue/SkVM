<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
# Fixed-Source Authorization Assessment

Assess the authorization behavior using only the repository and fixed source revision below. Do not invent source facts, rely on later revisions, or assume an answer from the accepted policy. Base the conclusion on a trace of the cited implementation and directly relevant definitions at the same revision.

## Repository and Source

- **Repository:** https://github.com/paperless-ngx/paperless-ngx
- **Fixed source ref:** `126ec414a8b65158368653a2604ae58415e43103`
- **Entry:** `src/documents/views.py:4696-4717`

## Accepted Policy

Share-link creation requires the share-link creation permission and view access to the referenced document; a global `view_document` grant alone does not substitute for the owner-aware object check.

## Question

At `ShareLinkViewSet.create` handler entry, can an authenticated caller with global `add_sharelink` and global `view_document` permission create a share link for a document owned by someone else when the caller lacks object `view_document` permission on that document?

## Boundary

`declared-entry`

## Premises

At `ShareLinkViewSet.create` entry:

- The caller is authenticated.
- The caller has global `add_sharelink`.
- The caller has global `view_document`.
- The referenced document exists.
- The referenced document belongs to another user.
- The caller has no object-level `view_document` grant for that document.

## Required Analysis

Trace:

1. The permissions applied by `ShareLinkViewSet`, including how they govern creation of the share-link object.
2. The `create` path from the declared handler entry through serializer validation.
3. How the serializer resolves and validates the referenced document.
4. Any owner-aware or object-level document permission check reached on this path.
5. Whether global `view_document` affects or substitutes for that object-level check.

Explicitly distinguish:

- Authorization to create the **share-link object**, and
- Authorization to view the **target document** referenced by that share link.

Answer the question directly and support the conclusion with precise citations to relevant files, symbols, and line ranges from the fixed revision. Do not decide the result from the policy text alone; derive it from the fixed source and then assess it against the accepted policy.


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

Included original ranges: src/documents/views.py:406-430 [locator:located-2, locator:located-3]; src/documents/views.py:4696-4717 [locator:located-1, entry:share-create]

Unresolved gaps: dep-1: ambiguous-location (src/documents/serialisers.py); dep-2: ambiguous-location (src/documents/permissions.py)

===== BEGIN ALLOWED INPUT: src/documents/views.py =====
Source ID: src-149e2c31b30d3ec6
Location note: crop lines 406-4717; original locations: src/documents/views.py:406-430, src/documents/views.py:4696-4717
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
429 | 
430 | 
[OMITTED original lines 431-4695]
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
===== END ALLOWED INPUT: src/documents/views.py =====
