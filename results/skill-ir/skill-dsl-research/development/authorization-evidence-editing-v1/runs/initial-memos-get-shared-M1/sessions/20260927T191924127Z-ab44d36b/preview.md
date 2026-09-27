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
Preparation status: ready

Closure claim: declared-dependencies-only

Prepared from: https://github.com/usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4; root ../../../public-source/memos

Included original ranges: server/api/v1/memo_share_service.go:1-244 [entry:get-shared, locator:active-token]; server/api/v1/memo_access.go:1-210 [locator:read-context]; core/access/memo.go:1-157 [locator:read-decision]; core/access/memo_resolve.go:1-91 [locator:read-resolve]

Unresolved gaps: none

===== BEGIN ALLOWED INPUT: core/access/memo_resolve.go =====
Source ID: src-ec871c89c4ea08c8
Location note: crop lines 1-91; original locations: core/access/memo_resolve.go:1-91
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | package access
2 | 
3 | import (
4 | 	"context"
5 | 
6 | 	"github.com/usememos/memos/store"
7 | )
8 | 
9 | // MemoReadStore is the store subset needed to resolve a memo read context.
10 | // *store.Store satisfies it.
11 | type MemoReadStore interface {
12 | 	GetUser(ctx context.Context, find *store.FindUser) (*store.User, error)
13 | 	GetSpace(ctx context.Context, find *store.FindSpace) (*store.Space, error)
14 | 	GetSpaceMember(ctx context.Context, find *store.FindSpaceMember) (*store.SpaceMember, error)
15 | }
16 | 
17 | // MemoReadFacts holds the viewer-independent authorization inputs for one memo.
18 | // They are resolved once and reused across every viewer evaluated against the
19 | // same memo.
20 | type MemoReadFacts struct {
21 | 	Memo         *store.Memo
22 | 	CreatorValid bool
23 | 	SpaceValid   bool
24 | }
25 | 
26 | // ResolveMemoReadFacts resolves the memo-local authorization inputs that do not
27 | // depend on who is reading: whether the memo has a valid creator and, when it is
28 | // assigned, whether its placement still exists. SpaceValid is authorization
29 | // input only for SPACE reads and placement-dependent projection and
30 | // writes; other audiences remain readable through their own memo-local rules.
31 | func ResolveMemoReadFacts(ctx context.Context, s MemoReadStore, memo *store.Memo) (MemoReadFacts, error) {
32 | 	facts := MemoReadFacts{Memo: memo}
33 | 	if memo == nil {
34 | 		return facts, nil
35 | 	}
36 | 	creatorID := memo.CreatorID
37 | 	creator, err := s.GetUser(ctx, &store.FindUser{ID: &creatorID})
38 | 	if err != nil {
39 | 		return MemoReadFacts{}, err
40 | 	}
41 | 	facts.CreatorValid = creator != nil && creator.ID == creatorID &&
42 | 		(creator.RowStatus == store.Normal || creator.RowStatus == store.Archived)
43 | 
44 | 	facts.SpaceValid = memo.SpaceID == nil
45 | 	if memo.SpaceID != nil {
46 | 		space, err := s.GetSpace(ctx, &store.FindSpace{ID: memo.SpaceID})
47 | 		if err != nil {
48 | 			return MemoReadFacts{}, err
49 | 		}
50 | 		facts.SpaceValid = space != nil
51 | 	}
52 | 	return facts, nil
53 | }
54 | 
55 | // WithViewer completes the read context for one viewer. Only the membership
56 | // lookup is viewer-dependent, so evaluating additional viewers against the same
57 | // memo costs at most one query each.
58 | func (f MemoReadFacts) WithViewer(ctx context.Context, s MemoReadStore, viewer *store.User, allowAnonymous bool, sharedMemoID *int32) (MemoReadContext, error) {
59 | 	readContext := MemoReadContext{
60 | 		Memo:           f.Memo,
61 | 		Viewer:         viewer,
62 | 		AllowAnonymous: allowAnonymous,
63 | 		SharedMemoID:   sharedMemoID,
64 | 		CreatorValid:   f.CreatorValid,
65 | 		SpaceValid:     f.SpaceValid,
66 | 	}
67 | 	if f.Memo == nil || f.Memo.SpaceID == nil || !f.SpaceValid {
68 | 		return readContext, nil
69 | 	}
70 | 	// Membership never changes the outcome for an inactive viewer or for an
71 | 	// instance administrator, so skip the lookup for both.
72 | 	if !IsActiveUser(viewer) || IsInstanceAdmin(viewer) {
73 | 		return readContext, nil
74 | 	}
75 | 	membership, err := s.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: f.Memo.SpaceID, UserID: &viewer.ID})
76 | 	if err != nil {
77 | 		return MemoReadContext{}, err
78 | 	}
79 | 	readContext.ViewerSpaceMember = membership != nil && membership.Role.IsActiveMember()
80 | 	return readContext, nil
81 | }
82 | 
83 | // ResolveMemoReadContext resolves a complete read context for one memo and one
84 | // viewer.
85 | func ResolveMemoReadContext(ctx context.Context, s MemoReadStore, memo *store.Memo, viewer *store.User, allowAnonymous bool, sharedMemoID *int32) (MemoReadContext, error) {
86 | 	facts, err := ResolveMemoReadFacts(ctx, s, memo)
87 | 	if err != nil {
88 | 		return MemoReadContext{}, err
89 | 	}
90 | 	return facts.WithViewer(ctx, s, viewer, allowAnonymous, sharedMemoID)
91 | }
===== END ALLOWED INPUT: core/access/memo_resolve.go =====

===== BEGIN ALLOWED INPUT: core/access/memo.go =====
Source ID: src-da9fb2a209342c1f
Location note: crop lines 1-157; original locations: core/access/memo.go:1-157
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | // Package access defines transport-independent resource authorization policies
2 | // shared by the server's API and HTTP adapters.
3 | package access
4 | 
5 | import "github.com/usememos/memos/store"
6 | 
7 | // MemoReadDenial describes why a memo read was rejected.
8 | type MemoReadDenial int
9 | 
10 | const (
11 | 	// MemoReadDenialNone means the read is allowed.
12 | 	MemoReadDenialNone MemoReadDenial = iota
13 | 	// MemoReadDenialNotFound hides missing, archived, and invalid memo state.
14 | 	MemoReadDenialNotFound
15 | 	// MemoReadDenialUnauthenticated means the resource requires a signed-in user.
16 | 	MemoReadDenialUnauthenticated
17 | 	// MemoReadDenialPermission means the signed-in user cannot read the resource.
18 | 	MemoReadDenialPermission
19 | )
20 | 
21 | // MemoReadClass describes whether the resource is anonymously readable.
22 | type MemoReadClass int
23 | 
24 | const (
25 | 	// MemoReadClassPrivate is for author, authenticated, member, or share-token reads.
26 | 	MemoReadClassPrivate MemoReadClass = iota
27 | 	// MemoReadClassPublic is for resources currently readable without credentials.
28 | 	MemoReadClassPublic
29 | )
30 | 
31 | // MemoReadDecision is the outcome of evaluating memo read access.
32 | type MemoReadDecision struct {
33 | 	Denial MemoReadDenial
34 | 	Class  MemoReadClass
35 | }
36 | 
37 | // MemoReadContext contains the fully resolved authorization context for one
38 | // memo. Relations never contribute authorization; callers evaluate each
39 | // relation endpoint independently.
40 | type MemoReadContext struct {
41 | 	Memo              *store.Memo
42 | 	Viewer            *store.User
43 | 	AllowAnonymous    bool
44 | 	SharedMemoID      *int32
45 | 	CreatorValid      bool
46 | 	SpaceValid        bool
47 | 	ViewerSpaceMember bool
48 | }
49 | 
50 | // Allowed reports whether the read is permitted.
51 | func (d MemoReadDecision) Allowed() bool {
52 | 	return d.Denial == MemoReadDenialNone
53 | }
54 | 
55 | // IsActiveUser reports whether the user exists and is in the normal lifecycle
56 | // state, which every authenticated authorization decision requires.
57 | func IsActiveUser(user *store.User) bool {
58 | 	return user != nil && user.RowStatus == store.Normal
59 | }
60 | 
61 | // IsInstanceAdmin reports whether the user is an active application ADMIN.
62 | // An instance administrator is the superuser for named memo operations: every
63 | // memo-local authorization check (authorship, audience, Space membership and
64 | // participation, attachment and reaction ownership) passes. Structural
65 | // validity still applies, and collection listings keep the audience predicate
66 | // so feeds never surface other users' private memos.
67 | func IsInstanceAdmin(user *store.User) bool {
68 | 	return IsActiveUser(user) && user.Role == store.RoleAdmin
69 | }
70 | 
71 | // CanManageMemo reports whether the actor may perform author-level operations
72 | // on the memo: the active author, or an instance administrator.
73 | func CanManageMemo(actor *store.User, memo *store.Memo) bool {
74 | 	return memo != nil && ownsOrAdministers(actor, memo.CreatorID)
75 | }
76 | 
77 | // CanManageAttachment reports whether the actor may mutate an attachment row
78 | // directly: the active owner, or an instance administrator.
79 | func CanManageAttachment(actor *store.User, attachment *store.Attachment) bool {
80 | 	return attachment != nil && ownsOrAdministers(actor, attachment.CreatorID)
81 | }
82 | 
83 | func ownsOrAdministers(actor *store.User, creatorID int32) bool {
84 | 	return IsActiveUser(actor) && (actor.ID == creatorID || actor.Role == store.RoleAdmin)
85 | }
86 | 
87 | // CheckMemoReadContext evaluates access to exactly one memo. Unknown audience,
88 | // invalid lifecycle state, and a missing or invalid creator fail closed. A
89 | // dangling placement only invalidates SPACE reads; other audiences
90 | // remain memo-local. A share applies only to the exact memo and never to either
91 | // endpoint of a relation.
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
Source ID: src-69d26d731760c05a
Location note: crop lines 1-210; original locations: server/api/v1/memo_access.go:1-210
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | package v1
2 | 
3 | import (
4 | 	"context"
5 | 	stderrors "errors"
6 | 
7 | 	"github.com/pkg/errors"
8 | 	"google.golang.org/grpc/codes"
9 | 	"google.golang.org/grpc/status"
10 | 
11 | 	"github.com/usememos/memos/core/access"
12 | 	"github.com/usememos/memos/store"
13 | )
14 | 
15 | // buildMemoReadContext resolves authorization inputs for exactly one memo.
16 | // Relations never contribute access to either endpoint.
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
31 | 
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
42 | 
43 | func (s *APIV1Service) checkMemoReadAccess(ctx context.Context, memo *store.Memo) error {
44 | 	readContext, err := s.buildMemoReadContext(ctx, memo, nil)
45 | 	if err != nil {
46 | 		return err
47 | 	}
48 | 	return memoAccessDecisionError(access.CheckMemoReadContext(readContext))
49 | }
50 | 
51 | func memoAccessDecisionError(decision access.MemoReadDecision) error {
52 | 	switch decision.Denial {
53 | 	case access.MemoReadDenialNone:
54 | 		return nil
55 | 	case access.MemoReadDenialNotFound:
56 | 		return status.Error(codes.NotFound, "memo not found")
57 | 	case access.MemoReadDenialUnauthenticated:
58 | 		return status.Error(codes.Unauthenticated, "user not authenticated")
59 | 	default:
60 | 		return status.Error(codes.PermissionDenied, "permission denied")
61 | 	}
62 | }
63 | 
64 | // newMemoAccessScope returns the memo-local authorization predicate for a
65 | // caller. Drivers apply it as a database predicate before LIMIT/OFFSET so
66 | // inaccessible rows can neither leak nor skew counts and pagination.
67 | func newMemoAccessScope(currentUser *store.User, allowPublic bool) *store.MemoAccessScope {
68 | 	accessScope := &store.MemoAccessScope{AllowPublic: allowPublic, AllowProtected: currentUser != nil}
69 | 	if currentUser != nil {
70 | 		accessScope.UserID = &currentUser.ID
71 | 	}
72 | 	return accessScope
73 | }
74 | 
75 | // resolveMemoAccessScope resolves the caller and builds their memo access
76 | // scope. For an anonymous caller the instance access policy decides whether
77 | // PUBLIC memos are readable at all. Callers map the returned error to their own
78 | // transport representation.
79 | func (s *APIV1Service) resolveMemoAccessScope(ctx context.Context) (*store.MemoAccessScope, *store.User, error) {
80 | 	currentUser, err := s.fetchCurrentUser(ctx)
81 | 	if err != nil {
82 | 		return nil, nil, errors.Wrap(err, "failed to get current user")
83 | 	}
84 | 	allowPublic := currentUser != nil
85 | 	if currentUser == nil {
86 | 		allowPublic, err = s.Store.AllowsAnonymousAccess(ctx)
87 | 		if err != nil {
88 | 			return nil, nil, errors.Wrap(err, "failed to resolve instance access policy")
89 | 		}
90 | 	}
91 | 	return newMemoAccessScope(currentUser, allowPublic), currentUser, nil
92 | }
93 | 
94 | // resolveSpaceByName resolves a space resource name to an existing Space
95 | // without any membership check.
96 | func (s *APIV1Service) resolveSpaceByName(ctx context.Context, name string) (*store.Space, error) {
97 | 	spaceUID, err := ExtractSpaceUIDFromName(name)
98 | 	if err != nil {
99 | 		return nil, status.Errorf(codes.InvalidArgument, "invalid space name: %v", err)
100 | 	}
101 | 	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UID: &spaceUID})
102 | 	if err != nil {
103 | 		return nil, status.Error(codes.Internal, "failed to get space")
104 | 	}
105 | 	if space == nil {
106 | 		return nil, status.Error(codes.NotFound, "space not found")
107 | 	}
108 | 	return space, nil
109 | }
110 | 
111 | // resolveWritableSpaceByName resolves a space resource name and requires the
112 | // caller to be an active member of it. A non-member receives NotFound so that
113 | // an existing collaboration boundary stays indistinguishable from a missing
114 | // resource.
115 | func (s *APIV1Service) resolveWritableSpaceByName(ctx context.Context, name string, userID int32) (*store.Space, error) {
116 | 	space, err := s.resolveSpaceByName(ctx, name)
117 | 	if err != nil {
118 | 		return nil, err
119 | 	}
120 | 	active, err := s.isActiveSpaceMember(ctx, space.ID, userID)
121 | 	if err != nil {
122 | 		return nil, status.Error(codes.Internal, "failed to resolve space membership")
123 | 	}
124 | 	if !active {
125 | 		return nil, status.Error(codes.NotFound, "space not found")
126 | 	}
127 | 	return space, nil
128 | }
129 | 
130 | // resolveSpaceForMemoPlacement resolves the Space a memo is being placed in.
131 | // An instance administrator may place memos in any existing Space; every
132 | // other caller must be an active member. Collection scopes such as the space
133 | // filter keep using resolveWritableSpaceByName, so feeds stay membership-only.
134 | func (s *APIV1Service) resolveSpaceForMemoPlacement(ctx context.Context, name string, user *store.User) (*store.Space, error) {
135 | 	if access.IsInstanceAdmin(user) {
136 | 		return s.resolveSpaceByName(ctx, name)
137 | 	}
138 | 	return s.resolveWritableSpaceByName(ctx, name, user.ID)
139 | }
140 | 
141 | func (s *APIV1Service) isActiveSpaceMember(ctx context.Context, spaceID, userID int32) (bool, error) {
142 | 	user, err := s.Store.GetUser(ctx, &store.FindUser{ID: &userID})
143 | 	if err != nil {
144 | 		return false, err
145 | 	}
146 | 	if user == nil || user.RowStatus != store.Normal {
147 | 		return false, nil
148 | 	}
149 | 	membership, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &spaceID, UserID: &userID})
150 | 	if err != nil {
151 | 		return false, err
152 | 	}
153 | 	return membership != nil && membership.Role.IsActiveMember(), nil
154 | }
155 | 
156 | func sameOptionalInt32(left, right *int32) bool {
157 | 	if left == nil || right == nil {
158 | 		return left == nil && right == nil
159 | 	}
160 | 	return *left == *right
161 | }
162 | 
163 | func memoWritePolicy(actorUserID int32, lifecycleOnly bool) *store.MemoWritePolicy {
164 | 	return &store.MemoWritePolicy{
165 | 		ActorUserID:   actorUserID,
166 | 		LifecycleOnly: lifecycleOnly,
167 | 	}
168 | }
169 | 
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
184 | 
185 | // requireAssignedMemoWritable requires the placement of an assigned memo to be
186 | // valid and the actor to be an active member of it. An instance administrator
187 | // is exempt from membership but not from placement validity.
188 | func (s *APIV1Service) requireAssignedMemoWritable(ctx context.Context, memo *store.Memo, user *store.User) error {
189 | 	if memo.SpaceID == nil {
190 | 		return nil
191 | 	}
192 | 	space, err := s.Store.GetSpace(ctx, &store.FindSpace{ID: memo.SpaceID})
193 | 	if err != nil {
194 | 		return status.Errorf(codes.Internal, "failed to get memo space")
195 | 	}
196 | 	if space == nil {
197 | 		return status.Errorf(codes.FailedPrecondition, "memo has invalid space placement")
198 | 	}
199 | 	if access.IsInstanceAdmin(user) {
200 | 		return nil
201 | 	}
202 | 	active, err := s.isActiveSpaceMember(ctx, space.ID, user.ID)
203 | 	if err != nil {
204 | 		return status.Errorf(codes.Internal, "failed to resolve space membership")
205 | 	}
206 | 	if !active {
207 | 		return status.Errorf(codes.PermissionDenied, "active space membership is required")
208 | 	}
209 | 	return nil
210 | }
===== END ALLOWED INPUT: server/api/v1/memo_access.go =====

===== BEGIN ALLOWED INPUT: server/api/v1/memo_share_service.go =====
Source ID: src-ba5b8420bf39f2db
Location note: crop lines 1-244; original locations: server/api/v1/memo_share_service.go:1-244
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | package v1
2 | 
3 | import (
4 | 	"context"
5 | 	stderrors "errors"
6 | 	"fmt"
7 | 	"time"
8 | 
9 | 	"google.golang.org/grpc/codes"
10 | 	"google.golang.org/grpc/status"
11 | 	"google.golang.org/protobuf/types/known/emptypb"
12 | 	"google.golang.org/protobuf/types/known/timestamppb"
13 | 
14 | 	"github.com/lithammer/shortuuid/v4"
15 | 	"github.com/pkg/errors"
16 | 
17 | 	"github.com/usememos/memos/core/access"
18 | 	"github.com/usememos/memos/internal/ratelimit"
19 | 	v1pb "github.com/usememos/memos/proto/gen/api/v1"
20 | 	"github.com/usememos/memos/store"
21 | )
22 | 
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
82 | 
83 | // ListMemoShares lists all share links for a memo.
84 | // Only the memo's creator may call this.
85 | func (s *APIV1Service) ListMemoShares(ctx context.Context, request *v1pb.ListMemoSharesRequest) (*v1pb.ListMemoSharesResponse, error) {
86 | 	user, err := s.fetchCurrentUser(ctx)
87 | 	if err != nil {
88 | 		return nil, status.Errorf(codes.Internal, "failed to get user")
89 | 	}
90 | 	if user == nil {
91 | 		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
92 | 	}
93 | 
94 | 	memoUID, err := ExtractMemoUIDFromName(request.Parent)
95 | 	if err != nil {
96 | 		return nil, status.Errorf(codes.InvalidArgument, "invalid memo name: %v", err)
97 | 	}
98 | 	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
99 | 	if err != nil {
100 | 		return nil, status.Errorf(codes.Internal, "failed to get memo")
101 | 	}
102 | 	if memo == nil {
103 | 		return nil, status.Errorf(codes.NotFound, "memo not found")
104 | 	}
105 | 	if !access.CanManageMemo(user, memo) {
106 | 		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
107 | 	}
108 | 	if err := s.requireAssignedMemoWritable(ctx, memo, user); err != nil {
109 | 		return nil, err
110 | 	}
111 | 
112 | 	shares, err := s.Store.ListMemoShares(ctx, &store.FindMemoShare{MemoID: &memo.ID})
113 | 	if err != nil {
114 | 		return nil, status.Errorf(codes.Internal, "failed to list memo shares")
115 | 	}
116 | 
117 | 	response := &v1pb.ListMemoSharesResponse{}
118 | 	for _, ms := range shares {
119 | 		response.MemoShares = append(response.MemoShares, convertMemoShareFromStore(ms, memo.UID))
120 | 	}
121 | 	return response, nil
122 | }
123 | 
124 | // DeleteMemoShare revokes a share link.
125 | // Only the memo's creator may call this.
126 | func (s *APIV1Service) DeleteMemoShare(ctx context.Context, request *v1pb.DeleteMemoShareRequest) (*emptypb.Empty, error) {
127 | 	user, err := s.fetchCurrentUser(ctx)
128 | 	if err != nil {
129 | 		return nil, status.Errorf(codes.Internal, "failed to get user")
130 | 	}
131 | 	if user == nil {
132 | 		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
133 | 	}
134 | 
135 | 	// name format: memos/{memoUID}/shares/{shareToken}
136 | 	tokens, err := GetNameParentTokens(request.Name, MemoNamePrefix, MemoShareNamePrefix)
137 | 	if err != nil {
138 | 		return nil, status.Errorf(codes.InvalidArgument, "invalid share name: %v", err)
139 | 	}
140 | 	memoUID, shareToken := tokens[0], tokens[1]
141 | 
142 | 	memo, err := s.Store.GetMemo(ctx, &store.FindMemo{UID: &memoUID})
143 | 	if err != nil {
144 | 		return nil, status.Errorf(codes.Internal, "failed to get memo")
145 | 	}
146 | 	if memo == nil {
147 | 		return nil, status.Errorf(codes.NotFound, "memo not found")
148 | 	}
149 | 	if !access.CanManageMemo(user, memo) {
150 | 		return nil, status.Errorf(codes.PermissionDenied, "permission denied")
151 | 	}
152 | 	ms, err := s.Store.GetMemoShare(ctx, &store.FindMemoShare{UID: &shareToken})
153 | 	if err != nil {
154 | 		return nil, status.Errorf(codes.Internal, "failed to get memo share")
155 | 	}
156 | 	if ms == nil || ms.MemoID != memo.ID {
157 | 		return nil, status.Errorf(codes.NotFound, "memo share not found")
158 | 	}
159 | 
160 | 	if err := s.Store.DeleteMemoShare(ctx, &store.DeleteMemoShare{
161 | 		UID:    &shareToken,
162 | 		MemoID: &memo.ID,
163 | 		Policy: memoWritePolicy(user.ID, false),
164 | 	}); err != nil {
165 | 		return nil, mapMemoWriteError(err, "failed to delete memo share")
166 | 	}
167 | 	return &emptypb.Empty{}, nil
168 | }
169 | 
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
214 | }
215 | 
216 | // isMemoShareExpired returns true if the share has a defined expiry that has already passed.
217 | func isMemoShareExpired(ms *store.MemoShare) bool {
218 | 	return ms.ExpiresTs != nil && time.Now().Unix() > *ms.ExpiresTs
219 | }
220 | 
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
231 | 
232 | // convertMemoShareFromStore converts a store MemoShare to the proto MemoShare message.
233 | // name format: memos/{memoUID}/shares/{shareToken}.
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
