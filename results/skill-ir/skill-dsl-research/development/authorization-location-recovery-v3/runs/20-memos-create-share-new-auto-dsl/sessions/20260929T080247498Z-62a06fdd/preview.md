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
  Source location: server/api/v1/memo_share_service.go, startLine 23, endLine 80.

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
Preparation status: partial

Closure claim: declared-dependencies-only

Prepared from: https://github.com/usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4; root ../../../authorization-evidence-editing-v1/public-source/memos

Included original ranges: server/api/v1/memo_share_service.go:23-81 [entry:create-share, locator:located-4, model-proposal:dep-create-share-auth-controls]; server/api/v1/memo_share_service.go:234-244 [locator:located-6]; store/memo.go:228-230 [locator:located-7]; store/memo.go:232-243 [locator:located-1, model-proposal:dep-existing-memo-resolution]; core/access/memo.go:57-59 [locator:located-9]; core/access/memo.go:73-75 [locator:located-2, model-proposal:dep-can-manage-memo]; core/access/memo.go:83-85 [locator:located-8, model-proposal:dep-owner-or-admin]; server/api/v1/memo_access.go:163-168 [locator:located-3]; server/api/v1/memo_access.go:170-183 [locator:located-5]

Unresolved gaps: dep-active-user: depth-budget (core/access/memo.go)

===== BEGIN ALLOWED INPUT: core/access/memo.go =====
Source ID: src-34c8331239a9d018
Location note: crop lines 57-85; original locations: core/access/memo.go:57-59, core/access/memo.go:73-75, core/access/memo.go:83-85
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
57 | func IsActiveUser(user *store.User) bool {
58 | 	return user != nil && user.RowStatus == store.Normal
59 | }
[OMITTED original lines 60-72]
73 | func CanManageMemo(actor *store.User, memo *store.Memo) bool {
74 | 	return memo != nil && ownsOrAdministers(actor, memo.CreatorID)
75 | }
[OMITTED original lines 76-82]
83 | func ownsOrAdministers(actor *store.User, creatorID int32) bool {
84 | 	return IsActiveUser(actor) && (actor.ID == creatorID || actor.Role == store.RoleAdmin)
85 | }
===== END ALLOWED INPUT: core/access/memo.go =====

===== BEGIN ALLOWED INPUT: server/api/v1/memo_access.go =====
Source ID: src-b908698469d1eb22
Location note: crop lines 163-183; original locations: server/api/v1/memo_access.go:163-168, server/api/v1/memo_access.go:170-183
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
163 | func memoWritePolicy(actorUserID int32, lifecycleOnly bool) *store.MemoWritePolicy {
164 | 	return &store.MemoWritePolicy{
165 | 		ActorUserID:   actorUserID,
166 | 		LifecycleOnly: lifecycleOnly,
167 | 	}
168 | }
[OMITTED original lines 169-169]
170 | func mapMemoWriteError(err error, operation string) error {
171 | 	switch {
172 | 	case stderrors.Is(err, store.ErrMemoMutationConflict):
173 | 		return status.Errorf(codes.FailedPrecondition, "memo state changed: %v", err)
174 | 	case stderrors.Is(err, store.ErrMemoSpaceNotWritable):
175 | 		return status.Error(codes.FailedPrecondition, "memo space is no longer writable")
176 | 	case stderrors.Is(err, store.ErrMemoSpaceMembershipRequired), stderrors.Is(err, store.ErrMemoPermissionDenied):
177 | 		return status.Error(codes.PermissionDenied, "permission denied")
178 | 	case stderrors.Is(err, store.ErrMemoShareConflict):
179 | 		return status.Error(codes.FailedPrecondition, "revoke active shares before using the SPACE audience")
180 | 	default:
181 | 		return status.Errorf(codes.Internal, "%s: %v", operation, err)
182 | 	}
183 | }
===== END ALLOWED INPUT: server/api/v1/memo_access.go =====

===== BEGIN ALLOWED INPUT: server/api/v1/memo_share_service.go =====
Source ID: src-9c7f468cb084f5da
Location note: crop lines 23-244; original locations: server/api/v1/memo_share_service.go:23-81, server/api/v1/memo_share_service.go:234-244
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
23 | // CreateMemoShare creates an opaque share link for a memo.
24 | // Only the memo's creator may call this.
25 | func (s *APIV1Service) CreateMemoShare(ctx context.Context, request *v1pb.CreateMemoShareRequest) (*v1pb.MemoShare, error) {
26 | 	user, err := s.fetchCurrentUser(ctx)
27 | 	if err != nil {
28 | 		return nil, status.Errorf(codes.Internal, "failed to get user")
29 | 	}
30 | 	if user == nil {
31 | 		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
32 | 	}
33 | 	if err := s.throttleAndCharge(ratelimit.ScopeWriteUser, userKey(user.ID), 1); err != nil {
34 | 		return nil, err
35 | 	}
36 | 
37 | 	memoUID, err := ExtractMemoUIDFromName(request.Parent)
38 | 	if err != nil {
39 | 		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
40 | 	}
41 | 	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
42 | 	if err != nil {
43 | 		return nil, status.Errorf(codes.Internal, "failed to get memo")
44 | 	}
45 | 	if memo == nil {
46 | 		return nil, status.Errorf(codes.NotFound, "memo not found")
47 | 	}
48 | 	if memo.RowStatus != store.Normal {
49 | 		return nil, status.Errorf(codes.FailedPrecondition, "only active memos can be shared")
50 | 	}
51 | 	if !access.CanManageMemo(user, memo) {
52 | 		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
53 | 	}
54 | 	if memo.Visibility == store.SpaceAudience {
55 | 		return nil, status.Errorf(codes.FailedPrecondition, "SPACE audience memos cannot be shared")
56 | 	}
57 | 	var expiresTs *int64
58 | 	if request.MemoShare != nil && request.MemoShare.ExpireTime != nil {
59 | 		ts := request.MemoShare.ExpireTime.AsTime().Unix()
60 | 		if ts <= time.Now().Unix() {
61 | 			return nil, status.Errorf(codes.InvalidArgument, "expire_time must be in the future")
62 | 		}
63 | 		expiresTs = &ts
64 | 	}
65 | 
66 | 	// Generate a URL-safe token using shortuuid (base57-encoded UUID v4, 22 chars, 122-bit entropy).
67 | 	policy := memoWritePolicy(user.ID, false)
68 | 	policy.CreatingShare = true
69 | 	ms, err := s.Store.CreateMemoShare(ctx, &store.MemoShare{
70 | 		UID:       shortuuid.New(),
71 | 		MemoID:    memo.ID,
72 | 		CreatorID: user.ID,
73 | 		ExpiresTs: expiresTs,
74 | 		Policy:    policy,
75 | 	})
76 | 	if err != nil {
77 | 		return nil, mapMemoWriteError(err, "failed to create memo share")
78 | 	}
79 | 
80 | 	return convertMemoShareFromStore(ms, memo.UID), nil
81 | }
[OMITTED original lines 82-233]
234 | func convertMemoShareFromStore(ms *store.MemoShare, memoUID string) *v1pb.MemoShare {
235 | 	name := fmt.Sprintf("%s%s/%s%s", MemoNamePrefix, memoUID, MemoShareNamePrefix, ms.UID)
236 | 	pb := &v1pb.MemoShare{
237 | 		Name:       name,
238 | 		CreateTime: timestamppb.New(time.Unix(ms.CreatedTs, 0)),
239 | 	}
240 | 	if ms.ExpiresTs != nil {
241 | 		pb.ExpireTime = timestamppb.New(time.Unix(*ms.ExpiresTs, 0))
242 | 	}
243 | 	return pb
244 | }
===== END ALLOWED INPUT: server/api/v1/memo_share_service.go =====

===== BEGIN ALLOWED INPUT: store/memo.go =====
Source ID: src-b8116a78be57bdb7
Location note: crop lines 228-243; original locations: store/memo.go:228-230, store/memo.go:232-243
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
228 | func (s *Store) ListMemos(ctx context.Context, find *FindMemo) ([]*Memo, error) {
229 | 	return s.driver.ListMemos(ctx, find)
230 | }
[OMITTED original lines 231-231]
232 | func (s *Store) GetMemo(ctx context.Context, find *FindMemo) (*Memo, error) {
233 | 	list, err := s.ListMemos(ctx, find)
234 | 	if err != nil {
235 | 		return nil, err
236 | 	}
237 | 	if len(list) == 0 {
238 | 		return nil, nil
239 | 	}
240 | 
241 | 	memo := list[0]
242 | 	return memo, nil
243 | }
===== END ALLOWED INPUT: store/memo.go =====
