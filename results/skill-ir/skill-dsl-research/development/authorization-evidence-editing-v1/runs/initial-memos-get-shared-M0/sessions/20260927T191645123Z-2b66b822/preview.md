<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
# Fixed-Source Authorization Assessment

Use only the neutral public brief below and the separately supplied common public requirements paragraph. Do not quote that common paragraph verbatim. Do not rely on an answer key, evaluator, or any unstated facts.

## Source

- Repository: https://github.com/usememos/memos
- Fixed source ref: `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`
- Entry: `server/api/v1/memo_share_service.go:170-213`
- Boundary: `declared-entry`

Inspect only the specified source entry at the fixed ref and report what is visible there. Do not infer source facts that are not visible in the permitted source.

## Accepted policy

- `GetSharedMemo` needs no authentication.
- A current share token grants access only to its exact memo.
- Invalid or expired tokens, and inaccessible memos, yield `NOT_FOUND`.

## Premises

At `GetSharedMemo` handler entry:

- The caller is anonymous.
- If the token resolves, its associated memo is active, private, non-`SPACE`, and has a valid creator.
- Token existence and expiry are unspecified.

## Question

At `GetSharedMemo` handler entry, can an anonymous caller retrieve the private, active, non-`SPACE` memo associated with a supplied share token when this task does not say whether the token exists or is unexpired?

## Required response

Answer the question using the fixed source and the stated premises. Explain:

1. The source-visible branch for a valid token associated with the described memo.
2. The source-visible branches for an invalid or expired token.
3. Any branch for an inaccessible memo that is visible within the specified entry.
4. Which runtime facts are missing and prevent choosing a single concrete outcome, especially token existence and expiry.

Do not invent token state, a separate requested memo identity, deployment success, or any other runtime or source fact. Distinguish conditional conclusions from facts established by the premises.


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
