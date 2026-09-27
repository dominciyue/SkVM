<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task memos-get-shared-anonymous, expressed with source-authorization-assessment/v0. At GetSharedMemo handler entry, can an anonymous caller retrieve the private, active, non-SPACE memo associated with a supplied share token when this task does not say whether the token exists or is unexpired? Assume the associated memo has a valid creator if the token resolves. State the source-visible branches and missing runtime facts.
Assess repository https://github.com/usememos/memos at source ref cb42e326ba9cc266a6a9570c53e0fe04c62793f4 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:share-token-exact-memo is a explicit-task-requirement at proto/api/v1/memo_service.proto:134-138; server/api/v1/memo_share_service.go:170-213, revision cb42e326ba9cc266a6a9570c53e0fe04c62793f4.
  Policy text: GetSharedMemo needs no authentication; a current share token grants access to its exact memo only. Invalid or expired tokens and inaccessible memos yield NOT_FOUND.
  Acceptance is accepted; accepting actor role: task-author; reason: Public fixed-ref source and task-author bounded requirement.

The principals are:
- principal:anonymous-token-holder has role anonymous caller presenting an unspecified share token. Author facts: ["The caller is not authenticated.","Token existence and expiry are not supplied as facts."]
  Starting capabilities: none declared.

The resources are:
- resource:private-memo is a memo. Author facts: ["If the token resolves, its associated memo is active, private, non-SPACE, and has a valid creator.","There is no separately named memo identifier in GetSharedMemoRequest."]

The declared source entries are:
- entry:get-shared names GetSharedMemo.
  Source location: server/api/v1/memo_share_service.go, startLine 1, endLine 44.

The authorization obligations are:
- scenario:token-status-unspecified: principal principal:anonymous-token-holder, resource resource:private-memo, relation anonymous-token-validity-unknown, operation retrieve token-associated memo, expected policy disposition conditional.
  Policy source: policy:share-token-exact-memo. Declared entries: entry:get-shared.
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
Current question: At GetSharedMemo handler entry, can an anonymous caller retrieve the private, active, non-SPACE memo associated with a supplied share token when this task does not say whether the token exists or is unexpired? Assume the associated memo has a valid creator if the token resolves. State the source-visible branches and missing runtime facts.
Analysis boundary: declared-entry.
Task premise: At GetSharedMemo entry, the caller is anonymous. If the token resolves, its associated memo is active, private, non-SPACE, and has a valid creator. Token existence and expiry are unspecified.
Required response detail: Explain the valid token-associated memo and invalid/expired branches; do not invent token state, a separate requested memo identity, or deployment success.

## Explicit assessment program
- Current question scenario%3Atoken-status-unspecified::entry%3Aget-shared at entry:get-shared; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At GetSharedMemo entry, the caller is anonymous. If the token resolves, its associated memo is active, private, non-SPACE, and has a valid creator. Token existence and expiry are unspecified..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Explain the valid token-associated memo and invalid/expired branches; do not invent token state, a separate requested memo identity, or deployment success..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Atoken-status-unspecified::entry%3Aget-shared
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: server/api/v1/memo_share_service.go =====
Source ID: src-b44fe986e41bdfae
Location note: crop lines 1-44; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | // GetSharedMemo resolves a share token to its memo. No authentication required.
2 | // Returns NOT_FOUND for invalid or expired tokens (no information leakage).
3 | func (s *APIV1Service) GetSharedMemo(ctx context.Context, request *v1pb.GetSharedMemoRequest) (*v1pb.Memo, error) {
4 | 	ms, err := s.getActiveMemoShare(ctx, request.ShareToken)
5 | 	if err != nil {
6 | 		return nil, err
7 | 	}
8 | 
9 | 	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{ID: &ms.MemoID})
10 | 	if err != nil {
11 | 		return nil, status.Errorf(codes.Internal, "failed to get memo")
12 | 	}
13 | 	// Treat archived or missing memos the same as an invalid token — no information leakage.
14 | 	if memo == nil || memo.RowStatus != store.Normal || memo.Visibility == store.SpaceAudience {
15 | 		return nil, status.Errorf(codes.NotFound, "not found")
16 | 	}
17 | 	readContext, err := s.buildMemoReadContext(ctx, memo, &ms.MemoID)
18 | 	if err != nil || !access.CheckMemoReadContext(readContext).Allowed() {
19 | 		return nil, status.Error(codes.NotFound, "not found")
20 | 	}
21 | 
22 | 	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{
23 | 		MemoID: &memo.ID,
24 | 	})
25 | 	if err != nil {
26 | 		return nil, status.Errorf(codes.Internal, "failed to list reactions")
27 | 	}
28 | 
29 | 	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{MemoID: &memo.ID})
30 | 	if err != nil {
31 | 		return nil, status.Errorf(codes.Internal, "failed to list attachments")
32 | 	}
33 | 
34 | 	memoMessage, err := s.convertMemoFromStore(ctx, memo, reactions, attachments, nil)
35 | 	if err != nil {
36 | 		if stderrors.Is(err, errMemoCreatorNotFound) {
37 | 			return nil, status.Errorf(codes.NotFound, "not found")
38 | 		}
39 | 		return nil, errors.Wrap(err, "failed to convert memo")
40 | 	}
41 | 	// A share token grants access to this memo only, not to its surrounding
42 | 	// conversation or relation graph.
43 | 	memoMessage.Parent = nil
44 | 	return memoMessage, nil
===== END ALLOWED INPUT: server/api/v1/memo_share_service.go =====
