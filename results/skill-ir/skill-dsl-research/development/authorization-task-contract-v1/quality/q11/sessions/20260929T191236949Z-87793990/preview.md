<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1; task-contract: current-v1 -->

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
Preparation status: partial

Closure claim: declared-dependencies-only

Prepared from: https://github.com/usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4; root ../../../authorization-evidence-editing-v1/public-source/memos

Included original ranges: core/access/memo.go:51-53 [locator:located-4, model-proposal:dep-decision-allowed, host-context:symbol-bcee1deeb0f22df8bf6dbeaa]; core/access/memo.go:57-59 [locator:located-9, model-proposal:dep-active-viewer-test, host-context:symbol-62655a8cc6be33b0bafd4e72]; core/access/memo.go:67-69 [locator:located-8, model-proposal:dep-admin-test, host-context:symbol-83e465d2adf7b6f977218688]; core/access/memo.go:92-157 [locator:located-3, model-proposal:dep-read-decision, host-context:symbol-0360738b678e5fd10a9a9ad2]; core/access/memo_resolve.go:85-91 [locator:located-10, host-context:symbol-260244859ca92777a224d045]; server/api/v1/memo_access.go:17-30 [locator:located-2, model-proposal:dep-anonymous-context-construction, host-context:symbol-41d7e7df637753900681850d]; server/api/v1/memo_access.go:32-41 [locator:located-7, model-proposal:dep-context-for-viewer, host-context:symbol-6ace80e5b35dc976c851e71b]; server/api/v1/memo_share_service.go:170-213 [entry:get-shared, model-proposal:dep-token-entry-branch, model-proposal:dep-shared-memo-binding-and-access, model-proposal:dep-response-effects]; server/api/v1/memo_share_service.go:217-219 [locator:located-6, model-proposal:dep-expiration-test, host-context:symbol-4f439192ce8d3f0f3eb9c3bf]; server/api/v1/memo_share_service.go:221-230 [locator:located-1, model-proposal:dep-active-share-resolution, host-context:symbol-0df6c1c4a771884ec939ddca]; store/memo_share.go:57-59 [locator:located-5, model-proposal:dep-share-store-lookup, host-context:symbol-0703f60500277bac62173c65]

Unresolved gaps: dep-context-resolution-wrapper: depth-budget (core/access/memo_resolve.go); dep-resolved-creator-validity: depth-budget (core/access/memo_resolve.go); dep-shared-memo-context-fields: depth-budget (core/access/memo_resolve.go); dep-anonymous-space-membership-short-circuit: depth-budget (core/access/memo_resolve.go); context:range:server/api/v1/memo_share_service.go:170-213: range-uncertain (server/api/v1/memo_share_service.go)

===== BEGIN ALLOWED INPUT: core/access/memo_resolve.go =====
Source ID: src-6259b9e6d5d77940
Location note: crop lines 85-91; original locations: core/access/memo_resolve.go:85-91
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
85 | func ResolveMemoReadContext(ctx context.Context, s MemoReadStore, memo *store.Memo, viewer *store.User, allowAnonymous bool, sharedMemoID *int32) (MemoReadContext, error) {
86 | 	facts, err := ResolveMemoReadFacts(ctx, s, memo)
87 | 	if err != nil {
88 | 		return MemoReadContext{}, err
89 | 	}
90 | 	return facts.WithViewer(ctx, s, viewer, allowAnonymous, sharedMemoID)
91 | }
===== END ALLOWED INPUT: core/access/memo_resolve.go =====

===== BEGIN ALLOWED INPUT: core/access/memo.go =====
Source ID: src-5680870821a0e984
Location note: crop lines 51-157; original locations: core/access/memo.go:51-53, core/access/memo.go:57-59, core/access/memo.go:67-69, core/access/memo.go:92-157
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
51 | func (d MemoReadDecision) Allowed() bool {
52 | 	return d.Denial == MemoReadDenialNone
53 | }
[OMITTED original lines 54-56]
57 | func IsActiveUser(user *store.User) bool {
58 | 	return user != nil && user.RowStatus == store.Normal
59 | }
[OMITTED original lines 60-66]
67 | func IsInstanceAdmin(user *store.User) bool {
68 | 	return IsActiveUser(user) && user.Role == store.RoleAdmin
69 | }
[OMITTED original lines 70-91]
92 | func CheckMemoReadContext(ctx MemoReadContext) MemoReadDecision {
93 | 	memo := ctx.Memo
94 | 	if memo == nil || !ctx.CreatorValid {
95 | 		return MemoReadDecision{Denial: MemoReadDenialNotFound}
96 | 	}
97 | 	if memo.Visibility != store.Public && memo.Visibility != store.Protected && memo.Visibility != store.Private && memo.Visibility != store.SpaceAudience {
98 | 		return MemoReadDecision{Denial: MemoReadDenialNotFound}
99 | 	}
100 | 	if memo.Visibility == store.SpaceAudience && (memo.SpaceID == nil || !ctx.SpaceValid) {
101 | 		return MemoReadDecision{Denial: MemoReadDenialNotFound}
102 | 	}
103 | 
104 | 	if memo.RowStatus != store.Normal && memo.RowStatus != store.Archived {
105 | 		return MemoReadDecision{Denial: MemoReadDenialNotFound}
106 | 	}
107 | 	// A structurally valid memo is readable by name to an instance
108 | 	// administrator regardless of audience, placement, or lifecycle state.
109 | 	if IsInstanceAdmin(ctx.Viewer) {
110 | 		return MemoReadDecision{Class: MemoReadClassPrivate}
111 | 	}
112 | 
113 | 	viewerActive := IsActiveUser(ctx.Viewer)
114 | 	viewerIsAuthor := viewerActive && ctx.Viewer.ID == memo.CreatorID
115 | 	if memo.RowStatus == store.Archived && !viewerIsAuthor {
116 | 		return MemoReadDecision{Denial: MemoReadDenialNotFound}
117 | 	}
118 | 
119 | 	shareApplies := ctx.SharedMemoID != nil && memo.ID == *ctx.SharedMemoID && memo.Visibility != store.SpaceAudience
120 | 	if shareApplies {
121 | 		return MemoReadDecision{Class: MemoReadClassPrivate}
122 | 	}
123 | 
124 | 	switch memo.Visibility {
125 | 	case store.Public:
126 | 		if ctx.AllowAnonymous {
127 | 			return MemoReadDecision{Class: MemoReadClassPublic}
128 | 		}
129 | 		if viewerActive {
130 | 			return MemoReadDecision{Class: MemoReadClassPrivate}
131 | 		}
132 | 		return MemoReadDecision{Denial: MemoReadDenialUnauthenticated}
133 | 	case store.Protected:
134 | 		if viewerActive {
135 | 			return MemoReadDecision{Class: MemoReadClassPrivate}
136 | 		}
137 | 		return MemoReadDecision{Denial: MemoReadDenialUnauthenticated}
138 | 	case store.Private:
139 | 		if !viewerActive {
140 | 			return MemoReadDecision{Denial: MemoReadDenialUnauthenticated}
141 | 		}
142 | 		if !viewerIsAuthor {
143 | 			return MemoReadDecision{Denial: MemoReadDenialPermission}
144 | 		}
145 | 		return MemoReadDecision{Class: MemoReadClassPrivate}
146 | 	case store.SpaceAudience:
147 | 		if !viewerActive {
148 | 			return MemoReadDecision{Denial: MemoReadDenialUnauthenticated}
149 | 		}
150 | 		if ctx.ViewerSpaceMember {
151 | 			return MemoReadDecision{Class: MemoReadClassPrivate}
152 | 		}
153 | 		return MemoReadDecision{Denial: MemoReadDenialPermission}
154 | 	default:
155 | 		return MemoReadDecision{Denial: MemoReadDenialNotFound}
156 | 	}
157 | }
===== END ALLOWED INPUT: core/access/memo.go =====

===== BEGIN ALLOWED INPUT: server/api/v1/memo_access.go =====
Source ID: src-4715f0667b50b99d
Location note: crop lines 17-41; original locations: server/api/v1/memo_access.go:17-30, server/api/v1/memo_access.go:32-41
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
17 | func (s *APIV1Service) buildMemoReadContext(ctx context.Context, memo *store.Memo, sharedMemoID *int32) (access.MemoReadContext, error) {
18 | 	viewer, err := s.fetchCurrentUser(ctx)
19 | 	if err != nil {
20 | 		return access.MemoReadContext{}, status.Errorf(codes.Internal, "failed to get user")
21 | 	}
22 | 	allowAnonymous := false
23 | 	if viewer == nil {
24 | 		allowAnonymous, err = s.Store.AllowsAnonymousAccess(ctx)
25 | 		if err != nil {
26 | 			return access.MemoReadContext{}, status.Errorf(codes.Internal, "failed to resolve instance access policy")
27 | 		}
28 | 	}
29 | 	return s.buildMemoReadContextForViewer(ctx, memo, viewer, allowAnonymous, sharedMemoID)
30 | }
[OMITTED original lines 31-31]
32 | func (s *APIV1Service) buildMemoReadContextForViewer(ctx context.Context, memo *store.Memo, viewer *store.User, allowAnonymous bool, sharedMemoID *int32) (access.MemoReadContext, error) {
33 | 	if memo == nil {
34 | 		return access.MemoReadContext{}, status.Error(codes.NotFound, "memo not found")
35 | 	}
36 | 	readContext, err := access.ResolveMemoReadContext(ctx, s.Store, memo, viewer, allowAnonymous, sharedMemoID)
37 | 	if err != nil {
38 | 		return access.MemoReadContext{}, status.Errorf(codes.Internal, "failed to resolve memo access")
39 | 	}
40 | 	return readContext, nil
41 | }
===== END ALLOWED INPUT: server/api/v1/memo_access.go =====

===== BEGIN ALLOWED INPUT: server/api/v1/memo_share_service.go =====
Source ID: src-e4f8cd24172048ad
Location note: crop lines 170-230; original locations: server/api/v1/memo_share_service.go:170-213, server/api/v1/memo_share_service.go:217-219, server/api/v1/memo_share_service.go:221-230
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
170 | // GetSharedMemo resolves a share token to its memo. No authentication required.
171 | // Returns NOT_FOUND for invalid or expired tokens (no information leakage).
172 | func (s *APIV1Service) GetSharedMemo(ctx context.Context, request *v1pb.GetSharedMemoRequest) (*v1pb.Memo, error) {
173 | 	ms, err := s.getActiveMemoShare(ctx, request.ShareToken)
174 | 	if err != nil {
175 | 		return nil, err
176 | 	}
177 | 
178 | 	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{ID: &ms.MemoID})
179 | 	if err != nil {
180 | 		return nil, status.Errorf(codes.Internal, "failed to get memo")
181 | 	}
182 | 	// Treat archived or missing memos the same as an invalid token — no information leakage.
183 | 	if memo == nil || memo.RowStatus != store.Normal || memo.Visibility == store.SpaceAudience {
184 | 		return nil, status.Errorf(codes.NotFound, "not found")
185 | 	}
186 | 	readContext, err := s.buildMemoReadContext(ctx, memo, &ms.MemoID)
187 | 	if err != nil || !access.CheckMemoReadContext(readContext).Allowed() {
188 | 		return nil, status.Error(codes.NotFound, "not found")
189 | 	}
190 | 
191 | 	reactions, err := s.Store.ListReactions(ctx, &store.FindReaction{
192 | 		MemoID: &memo.ID,
193 | 	})
194 | 	if err != nil {
195 | 		return nil, status.Errorf(codes.Internal, "failed to list reactions")
196 | 	}
197 | 
198 | 	attachments, err := s.Store.ListAttachments(ctx, &store.FindAttachment{MemoID: &memo.ID})
199 | 	if err != nil {
200 | 		return nil, status.Errorf(codes.Internal, "failed to list attachments")
201 | 	}
202 | 
203 | 	memoMessage, err := s.convertMemoFromStore(ctx, memo, reactions, attachments, nil)
204 | 	if err != nil {
205 | 		if stderrors.Is(err, errMemoCreatorNotFound) {
206 | 			return nil, status.Errorf(codes.NotFound, "not found")
207 | 		}
208 | 		return nil, errors.Wrap(err, "failed to convert memo")
209 | 	}
210 | 	// A share token grants access to this memo only, not to its surrounding
211 | 	// conversation or relation graph.
212 | 	memoMessage.Parent = nil
213 | 	return memoMessage, nil
[OMITTED original lines 214-216]
217 | func isMemoShareExpired(ms *store.MemoShare) bool {
218 | 	return ms.ExpiresTs != nil && time.Now().Unix() > *ms.ExpiresTs
219 | }
[OMITTED original lines 220-220]
221 | func (s *APIV1Service) getActiveMemoShare(ctx context.Context, shareID string) (*store.MemoShare, error) {
222 | 	ms, err := s.Store.GetMemoShare(ctx, &store.FindMemoShare{UID: &shareID})
223 | 	if err != nil {
224 | 		return nil, status.Errorf(codes.Internal, "failed to get memo share")
225 | 	}
226 | 	if ms == nil || isMemoShareExpired(ms) {
227 | 		return nil, status.Errorf(codes.NotFound, "not found")
228 | 	}
229 | 	return ms, nil
230 | }
===== END ALLOWED INPUT: server/api/v1/memo_share_service.go =====

===== BEGIN ALLOWED INPUT: store/memo_share.go =====
Source ID: src-ac393523acedb58d
Location note: crop lines 57-59; original locations: store/memo_share.go:57-59
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
57 | func (s *Store) GetMemoShare(ctx context.Context, find *FindMemoShare) (*MemoShare, error) {
58 | 	return s.driver.GetMemoShare(ctx, find)
59 | }
===== END ALLOWED INPUT: store/memo_share.go =====
