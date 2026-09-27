<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task memos-create-share-admin, expressed with source-authorization-assessment/v0. At CreateMemoShare handler entry, does an authenticated active instance administrator pass the source-visible authorization controls to create a share for an existing active non-SPACE memo authored by someone else? Assess authorization, not whether an external store call succeeds under every runtime condition.
Assess repository https://github.com/usememos/memos at source ref cb42e326ba9cc266a6a9570c53e0fe04c62793f4 in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:memo-share-creator-or-admin is a explicit-task-requirement at proto/api/v1/memo_service.proto:116-123; server/api/v1/memo_share_service.go:54-56, revision cb42e326ba9cc266a6a9570c53e0fe04c62793f4.
  Policy text: A memo share may be created by the memo creator or an instance administrator; SPACE audience memos are not shareable.
  Acceptance is accepted; accepting actor role: task-author; reason: Public fixed-ref source and task-author bounded requirement.

The principals are:
- principal:instance-admin has role authenticated active instance administrator, not the memo creator. Author facts: ["The caller is active and has the instance ADMIN role.","The caller is not the memo's creator."]
  Starting capabilities: none declared.

The resources are:
- resource:other-normal-memo is a memo. Author facts: ["The memo exists, is active, and has a non-SPACE audience.","The memo was created by another user."]

The declared source entries are:
- entry:create-share names CreateMemoShare.
  Source location: server/api/v1/memo_share_service.go, startLine 1, endLine 58.

The authorization obligations are:
- scenario:admin-other-memo: principal principal:instance-admin, resource resource:other-normal-memo, relation active-instance-admin-not-creator, operation create memo share, expected policy disposition allow.
  Policy source: policy:memo-share-creator-or-admin. Declared entries: entry:create-share.
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
Current question: At CreateMemoShare handler entry, does an authenticated active instance administrator pass the source-visible authorization controls to create a share for an existing active non-SPACE memo authored by someone else? Assess authorization, not whether an external store call succeeds under every runtime condition.
Analysis boundary: declared-entry.
Task premise: At CreateMemoShare entry, the caller is an authenticated active instance ADMIN; the selected memo exists, is active, non-SPACE, and authored by another user. The requested expiry, if any, is valid.
Required response detail: Trace the author-or-admin helper and the protected CreateMemoShare store effect; keep store failure and concurrent state changes outside the authorization conclusion.

## Explicit assessment program
- Current question scenario%3Aadmin-other-memo::entry%3Acreate-share at entry:create-share; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At CreateMemoShare entry, the caller is an authenticated active instance ADMIN; the selected memo exists, is active, non-SPACE, and authored by another user. The requested expiry, if any, is valid..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Trace the author-or-admin helper and the protected CreateMemoShare store effect; keep store failure and concurrent state changes outside the authorization conclusion..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Aadmin-other-memo::entry%3Acreate-share
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: server/api/v1/memo_share_service.go =====
Source ID: src-847ba480ee071118
Location note: crop lines 1-58; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | // CreateMemoShare creates an opaque share link for a memo.
2 | // Only the memo's creator may call this.
3 | func (s *APIV1Service) CreateMemoShare(ctx context.Context, request *v1pb.CreateMemoShareRequest) (*v1pb.MemoShare, error) {
4 | 	user, err := s.fetchCurrentUser(ctx)
5 | 	if err != nil {
6 | 		return nil, status.Errorf(codes.Internal, "failed to get user")
7 | 	}
8 | 	if user == nil {
9 | 		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
10 | 	}
11 | 	if err := s.throttleAndCharge(ratelimit.ScopeWriteUser, userKey(user.ID), 1); err != nil {
12 | 		return nil, err
13 | 	}
14 | 
15 | 	memoUID, err := ExtractMemoUIDFromName(request.Parent)
16 | 	if err != nil {
17 | 		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
18 | 	}
19 | 	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
20 | 	if err != nil {
21 | 		return nil, status.Errorf(codes.Internal, "failed to get memo")
22 | 	}
23 | 	if memo == nil {
24 | 		return nil, status.Errorf(codes.NotFound, "memo not found")
25 | 	}
26 | 	if memo.RowStatus != store.Normal {
27 | 		return nil, status.Errorf(codes.FailedPrecondition, "only active memos can be shared")
28 | 	}
29 | 	if !access.CanManageMemo(user, memo) {
30 | 		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
31 | 	}
32 | 	if memo.Visibility == store.SpaceAudience {
33 | 		return nil, status.Errorf(codes.FailedPrecondition, "SPACE audience memos cannot be shared")
34 | 	}
35 | 	var expiresTs *int64
36 | 	if request.MemoShare != nil && request.MemoShare.ExpireTime != nil {
37 | 		ts := request.MemoShare.ExpireTime.AsTime().Unix()
38 | 		if ts <= time.Now().Unix() {
39 | 			return nil, status.Errorf(codes.InvalidArgument, "expire_time must be in the future")
40 | 		}
41 | 		expiresTs = &ts
42 | 	}
43 | 
44 | 	// Generate a URL-safe token using shortuuid (base57-encoded UUID v4, 22 chars, 122-bit entropy).
45 | 	policy := memoWritePolicy(user.ID, false)
46 | 	policy.CreatingShare = true
47 | 	ms, err := s.Store.CreateMemoShare(ctx, &store.MemoShare{
48 | 		UID:       shortuuid.New(),
49 | 		MemoID:    memo.ID,
50 | 		CreatorID: user.ID,
51 | 		ExpiresTs: expiresTs,
52 | 		Policy:    policy,
53 | 	})
54 | 	if err != nil {
55 | 		return nil, mapMemoWriteError(err, "failed to create memo share")
56 | 	}
57 | 
58 | 	return convertMemoShareFromStore(ms, memo.UID), nil
===== END ALLOWED INPUT: server/api/v1/memo_share_service.go =====
