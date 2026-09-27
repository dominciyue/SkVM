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
  Source location: src/documents/views.py, startLine 1, endLine 22.

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
===== BEGIN ALLOWED INPUT: src/documents/views.py =====
Source ID: src-64b8926d5eb16fbb
Location note: crop lines 1-22; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | class ShareLinkViewSet(
2 |     PassUserMixin,
3 |     CreateModelMixin,
4 |     RetrieveModelMixin,
5 |     DestroyModelMixin,
6 |     ListModelMixin,
7 |     GenericViewSet,
8 | ):
9 |     model = ShareLink
10 | 
11 |     queryset = ShareLink.objects.select_related("document")
12 | 
13 |     serializer_class = ShareLinkSerializer
14 |     pagination_class = StandardPagination
15 |     permission_classes = (IsAuthenticated, PaperlessObjectPermissions)
16 |     filter_backends = (
17 |         DjangoFilterBackend,
18 |         OrderingFilter,
19 |         PermittedObjectsFilter,
20 |     )
21 |     filterset_class = ShareLinkFilterSet
22 |     ordering_fields = ("created", "expiration", "document__title")
===== END ALLOWED INPUT: src/documents/views.py =====
