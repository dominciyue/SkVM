<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
# Fixed-Source Authorization Assessment

Assess the authorization behavior of the specified handler using only the repository source at the fixed reference below and the separately supplied common public requirements paragraph. Do not rely on later or earlier revisions, undocumented assumptions, an answer key, or any DSL draft.

- **Repository:** https://github.com/usememos/memos
- **Fixed source ref:** `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`
- **Source entry:** `server/api/v1/space_service.go:740-763`
- **Boundary:** `declared-entry`

## Accepted policy

A space member may delete their own membership to leave. Removing a different member requires space administrator authority.

## Question

At `DeleteSpaceMember` handler entry, may an authenticated active ordinary member delete their own active membership, and may the same non-administrator delete a different active member's membership in that space? Assume resource resolution succeeds and compare the two requested targets.

## Premises

1. At `DeleteSpaceMember` entry, the active ordinary member targets their own active membership, and `resolveSpaceMemberResource` succeeds.
2. For the second scenario, the same active ordinary non-administrator targets a different active member in the same space, and resource resolution succeeds.

## Required analysis and response

- Inspect and cite only the relevant behavior available from the fixed source entry and its directly necessary surrounding source at the fixed ref.
- Apply the separately supplied common public requirements paragraph without quoting it verbatim.
- Analyze the two target cases separately and compare them.
- Explain the self-membership exception and the separate administrator check required when the target is a different member.
- Do not assume that the caller is an administrator.
- State the resulting authorization determination for each scenario, identifying the source condition or branch that supports it.
- Do not invent source facts, unstated premises, or behavior outside the declared-entry boundary.


## Public analysis questions
Decide the current scenario at the stated declared-entry boundary from the supplied fixed source and accepted policy. Treat premises as question assumptions, not source or deployment proof. Trace the decisive authorization control, protected object and effect with exact supplied-source locations. State any decisive missing runtime fact rather than assuming it. Do not execute the target, infer missing deployment facts, or consult later versions.
Current question: At DeleteSpaceMember handler entry, may an authenticated active ordinary member delete their own active membership, and may the same non-administrator delete a different active member's membership in that space? Assume resource resolution succeeds and compare the two requested targets.
Analysis boundary: declared-entry.
Task premise: At DeleteSpaceMember entry, the active ordinary member targets their own active membership, and resolveSpaceMemberResource succeeds.
Required response detail: Explain the self exception and the separate administrator check for a different target; do not assume the caller is an administrator.

## Explicit assessment program
- Current question scenario%3Aother-member::entry%3Adelete-member at entry:delete-member; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At DeleteSpaceMember entry, the active ordinary non-administrator targets a different active member in the same space, and resolveSpaceMemberResource succeeds..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Explain why the administrator guard blocks deletion of another member before the store effect..
- Current question scenario%3Aself-leave::entry%3Adelete-member at entry:delete-member; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): premise-1: At DeleteSpaceMember entry, the active ordinary member targets their own active membership, and resolveSpaceMemberResource succeeds..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Explain the self exception and the separate administrator check for a different target; do not assume the caller is an administrator..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Aother-member::entry%3Adelete-member
- scenario%3Aself-leave::entry%3Adelete-member
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
Preparation status: ready

Closure claim: declared-dependencies-only

Prepared from: https://github.com/usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4; root ../../../public-source/memos

Included original ranges: server/api/v1/space_service.go:1-764 [entry:delete-member, locator:member-resolution, locator:administrator-guard]

Unresolved gaps: none

===== BEGIN ALLOWED INPUT: server/api/v1/space_service.go =====
Source ID: src-66ca8138a5e00794
Location note: crop lines 1-764; original locations: server/api/v1/space_service.go:1-764
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | package v1
2 | 
3 | import (
4 | 	"context"
5 | 	"database/sql"
6 | 	"strings"
7 | 
8 | 	"github.com/pkg/errors"
9 | 	"google.golang.org/grpc/codes"
10 | 	"google.golang.org/grpc/status"
11 | 	"google.golang.org/protobuf/proto"
12 | 	"google.golang.org/protobuf/types/known/emptypb"
13 | 
14 | 	v1pb "github.com/usememos/memos/proto/gen/api/v1"
15 | 	storepb "github.com/usememos/memos/proto/gen/store"
16 | 	"github.com/usememos/memos/store"
17 | )
18 | 
19 | func (s *APIV1Service) requireCurrentSpaceUser(ctx context.Context) (*store.User, error) {
20 | 	user, err := s.fetchCurrentUser(ctx)
21 | 	if err != nil {
22 | 		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
23 | 	}
24 | 	if user == nil {
25 | 		return nil, status.Error(codes.Unauthenticated, "user not authenticated")
26 | 	}
27 | 	return user, nil
28 | }
29 | 
30 | func (s *APIV1Service) resolveMemberSpace(ctx context.Context, name string, currentUser *store.User) (*store.Space, *store.SpaceMember, error) {
31 | 	uid, err := ExtractSpaceUIDFromName(name)
32 | 	if err != nil {
33 | 		return nil, nil, status.Errorf(codes.InvalidArgument, "invalid space name: %v", err)
34 | 	}
35 | 	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UID: &uid, MemberUserID: &currentUser.ID})
36 | 	if err != nil {
37 | 		return nil, nil, status.Errorf(codes.Internal, "failed to get space: %v", err)
38 | 	}
39 | 	if space == nil {
40 | 		return nil, nil, status.Error(codes.NotFound, "space not found")
41 | 	}
42 | 	member, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &space.ID, UserID: &currentUser.ID})
43 | 	if err != nil {
44 | 		return nil, nil, status.Errorf(codes.Internal, "failed to get space membership: %v", err)
45 | 	}
46 | 	if member == nil || !member.Role.IsActiveMember() {
47 | 		// A non-member must not be able to distinguish an existing private
48 | 		// collaboration boundary from a missing resource.
49 | 		return nil, nil, status.Error(codes.NotFound, "space not found")
50 | 	}
51 | 	return space, member, nil
52 | }
53 | 
54 | func requireSpaceAdministrator(member *store.SpaceMember) error {
55 | 	if member == nil || member.Role != store.SpaceMemberRoleAdmin {
56 | 		return status.Error(codes.PermissionDenied, "space administrator permission required")
57 | 	}
58 | 	return nil
59 | }
60 | 
61 | func mapSpaceMutationError(err error, operation string) error {
62 | 	switch {
63 | 	case err == nil:
64 | 		return nil
65 | 	case errors.Is(err, store.ErrLastSpaceAdmin):
66 | 		return status.Error(codes.FailedPrecondition, "a space must retain an active administrator")
67 | 	case errors.Is(err, store.ErrSpacePermissionDenied):
68 | 		return status.Error(codes.NotFound, "space not found")
69 | 	case errors.Is(err, store.ErrSpaceMemberNotActive):
70 | 		return status.Error(codes.FailedPrecondition, "space members must be active users")
71 | 	case errors.Is(err, store.ErrSpaceAlreadyExists):
72 | 		return status.Error(codes.AlreadyExists, "space already exists")
73 | 	case errors.Is(err, store.ErrSpaceMemberAlreadyExists):
74 | 		return status.Error(codes.AlreadyExists, "space membership or invitation already exists")
75 | 	case errors.Is(err, store.ErrSpaceInvitationNotFound):
76 | 		return status.Error(codes.NotFound, "space invitation not found")
77 | 	case errors.Is(err, store.ErrSpaceNotFound), errors.Is(err, store.ErrSpaceMemberNotFound):
78 | 		return status.Error(codes.NotFound, "space or membership not found")
79 | 	case errors.Is(err, sql.ErrNoRows):
80 | 		return status.Error(codes.NotFound, "space or membership not found")
81 | 	default:
82 | 		return status.Errorf(codes.Internal, "%s: %v", operation, err)
83 | 	}
84 | }
85 | 
86 | // CreateSpace creates a space with the caller as its first administrator.
87 | func (s *APIV1Service) CreateSpace(ctx context.Context, request *v1pb.CreateSpaceRequest) (*v1pb.Space, error) {
88 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
89 | 	if err != nil {
90 | 		return nil, err
91 | 	}
92 | 	if request.GetSpace() == nil {
93 | 		return nil, status.Error(codes.InvalidArgument, "space is required")
94 | 	}
95 | 	title := strings.TrimSpace(request.Space.Title)
96 | 	if title == "" {
97 | 		return nil, status.Error(codes.InvalidArgument, "space title is required")
98 | 	}
99 | 	uid, err := ValidateAndGenerateSpaceUID(request.SpaceId)
100 | 	if err != nil {
101 | 		return nil, err
102 | 	}
103 | 	icon := convertSpaceIconToStore(request.Space.Icon)
104 | 	if err := store.ValidateSpaceIcon(icon); err != nil {
105 | 		return nil, status.Errorf(codes.InvalidArgument, "%v", err)
106 | 	}
107 | 	created, err := s.Store.CreateSpace(ctx, &store.Space{
108 | 		UID:         uid,
109 | 		Title:       title,
110 | 		Description: strings.TrimSpace(request.Space.Description),
111 | 		Payload:     &storepb.SpacePayload{Icon: icon},
112 | 	}, currentUser.ID)
113 | 	if err != nil {
114 | 		return nil, mapSpaceMutationError(err, "failed to create space")
115 | 	}
116 | 	s.SSEHub.publishSpaceChanged()
117 | 	return convertSpaceFromStore(created), nil
118 | }
119 | 
120 | // ListSpaces lists only spaces with a membership for the caller.
121 | func (s *APIV1Service) ListSpaces(ctx context.Context, request *v1pb.ListSpacesRequest) (*v1pb.ListSpacesResponse, error) {
122 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
123 | 	if err != nil {
124 | 		return nil, err
125 | 	}
126 | 	limit, offset, err := listSpacePage(request.PageSize, request.PageToken)
127 | 	if err != nil {
128 | 		return nil, err
129 | 	}
130 | 	limitPlusOne := limit + 1
131 | 	spaces, err := s.Store.ListSpaces(ctx, &store.FindSpace{
132 | 		MemberUserID: &currentUser.ID,
133 | 		Limit:        &limitPlusOne,
134 | 		Offset:       &offset,
135 | 	})
136 | 	if err != nil {
137 | 		return nil, status.Errorf(codes.Internal, "failed to list spaces: %v", err)
138 | 	}
139 | 
140 | 	nextPageToken := ""
141 | 	if len(spaces) == limitPlusOne {
142 | 		spaces = spaces[:limit]
143 | 		nextPageToken, err = getPageToken(limit, offset+limit)
144 | 		if err != nil {
145 | 			return nil, status.Errorf(codes.Internal, "failed to create next page token: %v", err)
146 | 		}
147 | 	}
148 | 	response := &v1pb.ListSpacesResponse{Spaces: make([]*v1pb.Space, 0, len(spaces)), NextPageToken: nextPageToken}
149 | 	for _, space := range spaces {
150 | 		response.Spaces = append(response.Spaces, convertSpaceFromStore(space))
151 | 	}
152 | 	return response, nil
153 | }
154 | 
155 | func listSpacePage(pageSize int32, pageToken string) (int, int, error) {
156 | 	if pageToken == "" {
157 | 		return normalizePageSize(pageSize), 0, nil
158 | 	}
159 | 	var token v1pb.PageToken
160 | 	if err := unmarshalPageToken(pageToken, &token); err != nil {
161 | 		return 0, 0, status.Errorf(codes.InvalidArgument, "invalid page token: %v", err)
162 | 	}
163 | 	return normalizePageSize(token.Limit), max(int(token.Offset), 0), nil
164 | }
165 | 
166 | // GetSpace gets a space visible to the caller through membership.
167 | func (s *APIV1Service) GetSpace(ctx context.Context, request *v1pb.GetSpaceRequest) (*v1pb.Space, error) {
168 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
169 | 	if err != nil {
170 | 		return nil, err
171 | 	}
172 | 	space, _, err := s.resolveMemberSpace(ctx, request.Name, currentUser)
173 | 	if err != nil {
174 | 		return nil, err
175 | 	}
176 | 	return convertSpaceFromStore(space), nil
177 | }
178 | 
179 | // UpdateSpace updates Space metadata.
180 | func (s *APIV1Service) UpdateSpace(ctx context.Context, request *v1pb.UpdateSpaceRequest) (*v1pb.Space, error) {
181 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
182 | 	if err != nil {
183 | 		return nil, err
184 | 	}
185 | 	if request.GetSpace() == nil {
186 | 		return nil, status.Error(codes.InvalidArgument, "space is required")
187 | 	}
188 | 	if request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
189 | 		return nil, status.Error(codes.InvalidArgument, "update mask is required")
190 | 	}
191 | 	space, membership, err := s.resolveMemberSpace(ctx, request.Space.Name, currentUser)
192 | 	if err != nil {
193 | 		return nil, err
194 | 	}
195 | 	if err := requireSpaceAdministrator(membership); err != nil {
196 | 		return nil, err
197 | 	}
198 | 
199 | 	update := &store.UpdateSpace{ID: space.ID}
200 | 	for _, path := range request.UpdateMask.Paths {
201 | 		switch path {
202 | 		case "title":
203 | 			title := strings.TrimSpace(request.Space.Title)
204 | 			if title == "" {
205 | 				return nil, status.Error(codes.InvalidArgument, "space title is required")
206 | 			}
207 | 			update.Title = &title
208 | 		case "description":
209 | 			description := strings.TrimSpace(request.Space.Description)
210 | 			update.Description = &description
211 | 		case "icon":
212 | 			icon := convertSpaceIconToStore(request.Space.Icon)
213 | 			if err := store.ValidateSpaceIcon(icon); err != nil {
214 | 				return nil, status.Errorf(codes.InvalidArgument, "%v", err)
215 | 			}
216 | 			update.Payload = &storepb.SpacePayload{}
217 | 			if space.Payload != nil {
218 | 				update.Payload = proto.CloneOf(space.Payload)
219 | 			}
220 | 			update.Payload.Icon = icon
221 | 		default:
222 | 			return nil, status.Errorf(codes.InvalidArgument, "unsupported update mask path: %s", path)
223 | 		}
224 | 	}
225 | 	updated, err := s.Store.UpdateSpace(ctx, update, currentUser.ID)
226 | 	if err != nil {
227 | 		return nil, mapSpaceMutationError(err, "failed to update space")
228 | 	}
229 | 	if updated == nil {
230 | 		return nil, status.Error(codes.NotFound, "space not found")
231 | 	}
232 | 	s.SSEHub.publishSpaceChanged()
233 | 	return convertSpaceFromStore(updated), nil
234 | }
235 | 
236 | // DeleteSpace permanently deletes the Space and every memo directly placed
237 | // in it. The result deliberately exposes no memo inventory to the administrator.
238 | func (s *APIV1Service) DeleteSpace(ctx context.Context, request *v1pb.DeleteSpaceRequest) (*emptypb.Empty, error) {
239 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
240 | 	if err != nil {
241 | 		return nil, err
242 | 	}
243 | 	space, membership, err := s.resolveMemberSpace(ctx, request.Name, currentUser)
244 | 	if err != nil {
245 | 		return nil, err
246 | 	}
247 | 	if err := requireSpaceAdministrator(membership); err != nil {
248 | 		return nil, err
249 | 	}
250 | 	deleteResult, err := s.Store.DeleteSpace(ctx, &store.DeleteSpace{ID: space.ID, ActorUserID: currentUser.ID})
251 | 	if err != nil {
252 | 		return nil, mapSpaceMutationError(err, "failed to delete space")
253 | 	}
254 | 	s.SSEHub.publishSpaceChanged()
255 | 	if err := s.cleanupDeletedAttachmentStorage(ctx, deleteResult.Attachments); err != nil {
256 | 		return nil, status.Errorf(codes.Internal, "space was deleted but attachment storage cleanup failed: %v", err)
257 | 	}
258 | 	return &emptypb.Empty{}, nil
259 | }
260 | 
261 | // CreateSpaceInvitation creates a pending invitation without granting any
262 | // Space access to the invitee.
263 | func (s *APIV1Service) CreateSpaceInvitation(ctx context.Context, request *v1pb.CreateSpaceInvitationRequest) (*v1pb.SpaceInvitation, error) {
264 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
265 | 	if err != nil {
266 | 		return nil, err
267 | 	}
268 | 	if request.GetSpaceInvitation() == nil {
269 | 		return nil, status.Error(codes.InvalidArgument, "space invitation is required")
270 | 	}
271 | 	space, callerMembership, err := s.resolveMemberSpace(ctx, request.Parent, currentUser)
272 | 	if err != nil {
273 | 		return nil, err
274 | 	}
275 | 	if err := requireSpaceAdministrator(callerMembership); err != nil {
276 | 		return nil, err
277 | 	}
278 | 	targetUsername, err := parseUsernameFromName(request.SpaceInvitation.Invitee)
279 | 	if err != nil {
280 | 		return nil, status.Errorf(codes.InvalidArgument, "invalid invitation invitee: %v", err)
281 | 	}
282 | 	targetUser, err := s.Store.GetUser(ctx, &store.FindUser{Username: &targetUsername})
283 | 	if err != nil {
284 | 		return nil, status.Errorf(codes.Internal, "failed to get invitation invitee: %v", err)
285 | 	}
286 | 	if targetUser == nil {
287 | 		return nil, status.Error(codes.NotFound, "user not found")
288 | 	}
289 | 	if targetUser.RowStatus != store.Normal {
290 | 		return nil, status.Error(codes.FailedPrecondition, "only active users can be invited to a space")
291 | 	}
292 | 	role, ok := convertSpaceMemberRoleToStore(request.SpaceInvitation.Role)
293 | 	if !ok {
294 | 		return nil, status.Error(codes.InvalidArgument, "space invitation role must be ADMIN or USER")
295 | 	}
296 | 	expectedName := buildSpaceInvitationName(space.UID, targetUser.Username)
297 | 	if request.SpaceInvitation.Name != "" && request.SpaceInvitation.Name != expectedName {
298 | 		return nil, status.Error(codes.InvalidArgument, "space invitation name does not match parent and invitee")
299 | 	}
300 | 	created, err := s.Store.CreateSpaceInvitation(ctx, &store.SpaceInvitation{
301 | 		SpaceID: space.ID,
302 | 		UserID:  targetUser.ID,
303 | 		Role:    role,
304 | 	}, currentUser.ID)
305 | 	if err != nil {
306 | 		return nil, mapSpaceMutationError(err, "failed to create space invitation")
307 | 	}
308 | 	s.createSpaceInvitationNotification(ctx, space, currentUser, targetUser)
309 | 	s.SSEHub.publishSpaceChanged()
310 | 	return convertSpaceInvitationFromStore(space, targetUser, created), nil
311 | }
312 | 
313 | // ListSpaceInvitations lists pending invitations after requiring an active
314 | // Space administrator.
315 | func (s *APIV1Service) ListSpaceInvitations(ctx context.Context, request *v1pb.ListSpaceInvitationsRequest) (*v1pb.ListSpaceInvitationsResponse, error) {
316 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
317 | 	if err != nil {
318 | 		return nil, err
319 | 	}
320 | 	space, callerMembership, err := s.resolveMemberSpace(ctx, request.Parent, currentUser)
321 | 	if err != nil {
322 | 		return nil, err
323 | 	}
324 | 	if err := requireSpaceAdministrator(callerMembership); err != nil {
325 | 		return nil, err
326 | 	}
327 | 	limit, offset, err := listSpacePage(request.PageSize, request.PageToken)
328 | 	if err != nil {
329 | 		return nil, err
330 | 	}
331 | 	limitPlusOne := limit + 1
332 | 	invitations, err := s.Store.ListSpaceInvitations(ctx, &store.FindSpaceInvitation{
333 | 		SpaceID:      &space.ID,
334 | 		ViewerUserID: &currentUser.ID,
335 | 		Limit:        &limitPlusOne,
336 | 		Offset:       &offset,
337 | 	})
338 | 	if err != nil {
339 | 		return nil, status.Errorf(codes.Internal, "failed to list space invitations: %v", err)
340 | 	}
341 | 	nextPageToken := ""
342 | 	if len(invitations) == limitPlusOne {
343 | 		invitations = invitations[:limit]
344 | 		nextPageToken, err = getPageToken(limit, offset+limit)
345 | 		if err != nil {
346 | 			return nil, status.Errorf(codes.Internal, "failed to create next page token: %v", err)
347 | 		}
348 | 	}
349 | 	response := &v1pb.ListSpaceInvitationsResponse{
350 | 		SpaceInvitations: make([]*v1pb.SpaceInvitation, 0, len(invitations)),
351 | 		NextPageToken:    nextPageToken,
352 | 	}
353 | 	if len(invitations) == 0 {
354 | 		return response, nil
355 | 	}
356 | 	userIDs := make([]int32, 0, len(invitations))
357 | 	for _, invitation := range invitations {
358 | 		userIDs = append(userIDs, invitation.UserID)
359 | 	}
360 | 	users, err := s.Store.ListUsers(ctx, &store.FindUser{IDList: userIDs})
361 | 	if err != nil {
362 | 		return nil, status.Errorf(codes.Internal, "failed to resolve invitation invitees: %v", err)
363 | 	}
364 | 	usersByID := make(map[int32]*store.User, len(users))
365 | 	for _, user := range users {
366 | 		usersByID[user.ID] = user
367 | 	}
368 | 	for _, invitation := range invitations {
369 | 		user := usersByID[invitation.UserID]
370 | 		if user == nil || convertSpaceMemberRoleFromStore(invitation.Role) == v1pb.SpaceMember_ROLE_UNSPECIFIED {
371 | 			continue
372 | 		}
373 | 		response.SpaceInvitations = append(response.SpaceInvitations, convertSpaceInvitationFromStore(space, user, invitation))
374 | 	}
375 | 	return response, nil
376 | }
377 | 
378 | // ListUserSpaceInvitations lists the authenticated user's received pending
379 | // invitations. A user cannot enumerate another user's invitations.
380 | func (s *APIV1Service) ListUserSpaceInvitations(ctx context.Context, request *v1pb.ListUserSpaceInvitationsRequest) (*v1pb.ListUserSpaceInvitationsResponse, error) {
381 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
382 | 	if err != nil {
383 | 		return nil, err
384 | 	}
385 | 	username, err := parseUsernameFromName(request.Parent)
386 | 	if err != nil {
387 | 		return nil, status.Errorf(codes.InvalidArgument, "invalid user parent: %v", err)
388 | 	}
389 | 	if username != currentUser.Username {
390 | 		return nil, status.Error(codes.PermissionDenied, "users may only list their own space invitations")
391 | 	}
392 | 	limit, offset, err := listSpacePage(request.PageSize, request.PageToken)
393 | 	if err != nil {
394 | 		return nil, err
395 | 	}
396 | 	limitPlusOne := limit + 1
397 | 	invitations, err := s.Store.ListSpaceInvitations(ctx, &store.FindSpaceInvitation{
398 | 		UserID:       &currentUser.ID,
399 | 		ViewerUserID: &currentUser.ID,
400 | 		Limit:        &limitPlusOne,
401 | 		Offset:       &offset,
402 | 	})
403 | 	if err != nil {
404 | 		return nil, status.Errorf(codes.Internal, "failed to list user space invitations: %v", err)
405 | 	}
406 | 	nextPageToken := ""
407 | 	if len(invitations) == limitPlusOne {
408 | 		invitations = invitations[:limit]
409 | 		nextPageToken, err = getPageToken(limit, offset+limit)
410 | 		if err != nil {
411 | 			return nil, status.Errorf(codes.Internal, "failed to create next page token: %v", err)
412 | 		}
413 | 	}
414 | 	response := &v1pb.ListUserSpaceInvitationsResponse{
415 | 		SpaceInvitations: make([]*v1pb.SpaceInvitation, 0, len(invitations)),
416 | 		NextPageToken:    nextPageToken,
417 | 	}
418 | 	if len(invitations) == 0 {
419 | 		return response, nil
420 | 	}
421 | 	spaceIDs := make([]int32, 0, len(invitations))
422 | 	for _, invitation := range invitations {
423 | 		spaceIDs = append(spaceIDs, invitation.SpaceID)
424 | 	}
425 | 	spaces, err := s.Store.ListSpaces(ctx, &store.FindSpace{IDList: spaceIDs})
426 | 	if err != nil {
427 | 		return nil, status.Errorf(codes.Internal, "failed to resolve invitation spaces: %v", err)
428 | 	}
429 | 	spacesByID := make(map[int32]*store.Space, len(spaces))
430 | 	for _, space := range spaces {
431 | 		spacesByID[space.ID] = space
432 | 	}
433 | 	for _, invitation := range invitations {
434 | 		space := spacesByID[invitation.SpaceID]
435 | 		if space == nil || convertSpaceMemberRoleFromStore(invitation.Role) == v1pb.SpaceMember_ROLE_UNSPECIFIED {
436 | 			continue
437 | 		}
438 | 		response.SpaceInvitations = append(response.SpaceInvitations, convertSpaceInvitationFromStore(space, currentUser, invitation))
439 | 	}
440 | 	return response, nil
441 | }
442 | 
443 | // resolveSpaceInvitationResource resolves an invitation and authorizes either
444 | // its invitee or an active administrator of its Space.
445 | func (s *APIV1Service) resolveSpaceInvitationResource(ctx context.Context, name string, currentUser *store.User) (*store.Space, *store.User, *store.SpaceMember, *store.SpaceInvitation, error) {
446 | 	spaceUID, username, err := ExtractSpaceInvitationTokensFromName(name)
447 | 	if err != nil {
448 | 		return nil, nil, nil, nil, status.Errorf(codes.InvalidArgument, "invalid space invitation name: %v", err)
449 | 	}
450 | 	space, err := s.Store.GetSpace(ctx, &store.FindSpace{UID: &spaceUID})
451 | 	if err != nil {
452 | 		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to resolve invitation space: %v", err)
453 | 	}
454 | 	if space == nil {
455 | 		return nil, nil, nil, nil, status.Error(codes.NotFound, "space invitation not found")
456 | 	}
457 | 	targetUser, err := s.Store.GetUser(ctx, &store.FindUser{Username: &username})
458 | 	if err != nil {
459 | 		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to resolve invitation invitee: %v", err)
460 | 	}
461 | 	if targetUser == nil {
462 | 		return nil, nil, nil, nil, status.Error(codes.NotFound, "space invitation not found")
463 | 	}
464 | 	callerMembership, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{SpaceID: &space.ID, UserID: &currentUser.ID})
465 | 	if err != nil {
466 | 		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to resolve caller space membership: %v", err)
467 | 	}
468 | 	isInvitee := targetUser.ID == currentUser.ID
469 | 	isAdministrator := callerMembership != nil && callerMembership.Role == store.SpaceMemberRoleAdmin
470 | 	if !isInvitee && !isAdministrator {
471 | 		return nil, nil, nil, nil, status.Error(codes.NotFound, "space invitation not found")
472 | 	}
473 | 	invitation, err := s.Store.GetSpaceInvitation(ctx, &store.FindSpaceInvitation{
474 | 		SpaceID:      &space.ID,
475 | 		UserID:       &targetUser.ID,
476 | 		ViewerUserID: &currentUser.ID,
477 | 	})
478 | 	if err != nil {
479 | 		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to get space invitation: %v", err)
480 | 	}
481 | 	if invitation == nil || convertSpaceMemberRoleFromStore(invitation.Role) == v1pb.SpaceMember_ROLE_UNSPECIFIED {
482 | 		return nil, nil, nil, nil, status.Error(codes.NotFound, "space invitation not found")
483 | 	}
484 | 	return space, targetUser, callerMembership, invitation, nil
485 | }
486 | 
487 | // GetSpaceInvitation gets a pending invitation for its invitee or a Space
488 | // administrator.
489 | func (s *APIV1Service) GetSpaceInvitation(ctx context.Context, request *v1pb.GetSpaceInvitationRequest) (*v1pb.SpaceInvitation, error) {
490 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
491 | 	if err != nil {
492 | 		return nil, err
493 | 	}
494 | 	space, targetUser, _, invitation, err := s.resolveSpaceInvitationResource(ctx, request.Name, currentUser)
495 | 	if err != nil {
496 | 		return nil, err
497 | 	}
498 | 	return convertSpaceInvitationFromStore(space, targetUser, invitation), nil
499 | }
500 | 
501 | // DeleteSpaceInvitation revokes a pending invitation. Only an active Space
502 | // administrator can revoke it.
503 | func (s *APIV1Service) DeleteSpaceInvitation(ctx context.Context, request *v1pb.DeleteSpaceInvitationRequest) (*emptypb.Empty, error) {
504 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
505 | 	if err != nil {
506 | 		return nil, err
507 | 	}
508 | 	_, targetUser, callerMembership, invitation, err := s.resolveSpaceInvitationResource(ctx, request.Name, currentUser)
509 | 	if err != nil {
510 | 		return nil, err
511 | 	}
512 | 	if err := requireSpaceAdministrator(callerMembership); err != nil {
513 | 		return nil, err
514 | 	}
515 | 	if err := s.Store.RevokeSpaceInvitation(ctx, &store.RevokeSpaceInvitation{
516 | 		SpaceID: invitation.SpaceID,
517 | 		UserID:  targetUser.ID,
518 | 	}, currentUser.ID); err != nil {
519 | 		return nil, mapSpaceMutationError(err, "failed to revoke space invitation")
520 | 	}
521 | 	s.deleteSpaceInvitationNotifications(ctx, targetUser.ID, invitation.SpaceID)
522 | 	s.SSEHub.publishSpaceChanged()
523 | 	return &emptypb.Empty{}, nil
524 | }
525 | 
526 | // AcceptSpaceInvitation activates the invited user's membership with the role
527 | // selected by the administrator who created the invitation.
528 | func (s *APIV1Service) AcceptSpaceInvitation(ctx context.Context, request *v1pb.AcceptSpaceInvitationRequest) (*v1pb.SpaceMember, error) {
529 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
530 | 	if err != nil {
531 | 		return nil, err
532 | 	}
533 | 	space, targetUser, _, invitation, err := s.resolveSpaceInvitationResource(ctx, request.Name, currentUser)
534 | 	if err != nil {
535 | 		return nil, err
536 | 	}
537 | 	if targetUser.ID != currentUser.ID {
538 | 		return nil, status.Error(codes.PermissionDenied, "only the invitee may accept a space invitation")
539 | 	}
540 | 	member, err := s.Store.AcceptSpaceInvitation(ctx, &store.AcceptSpaceInvitation{SpaceID: invitation.SpaceID, UserID: currentUser.ID}, currentUser.ID)
541 | 	if err != nil {
542 | 		return nil, mapSpaceMutationError(err, "failed to accept space invitation")
543 | 	}
544 | 	s.archiveSpaceInvitationNotifications(ctx, currentUser.ID, invitation.SpaceID)
545 | 	s.SSEHub.publishSpaceChanged()
546 | 	return convertSpaceMemberFromStore(space, currentUser, member), nil
547 | }
548 | 
549 | // DeclineSpaceInvitation deletes the authenticated invitee's pending
550 | // invitation without ever creating a membership.
551 | func (s *APIV1Service) DeclineSpaceInvitation(ctx context.Context, request *v1pb.DeclineSpaceInvitationRequest) (*emptypb.Empty, error) {
552 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
553 | 	if err != nil {
554 | 		return nil, err
555 | 	}
556 | 	_, targetUser, _, invitation, err := s.resolveSpaceInvitationResource(ctx, request.Name, currentUser)
557 | 	if err != nil {
558 | 		return nil, err
559 | 	}
560 | 	if targetUser.ID != currentUser.ID {
561 | 		return nil, status.Error(codes.PermissionDenied, "only the invitee may decline a space invitation")
562 | 	}
563 | 	if err := s.Store.DeclineSpaceInvitation(ctx, &store.DeclineSpaceInvitation{SpaceID: invitation.SpaceID, UserID: currentUser.ID}, currentUser.ID); err != nil {
564 | 		return nil, mapSpaceMutationError(err, "failed to decline space invitation")
565 | 	}
566 | 	s.deleteSpaceInvitationNotifications(ctx, currentUser.ID, invitation.SpaceID)
567 | 	s.SSEHub.publishSpaceChanged()
568 | 	return &emptypb.Empty{}, nil
569 | }
570 | 
571 | // ListSpaceMembers lists memberships after authorizing the caller's own
572 | // membership before applying pagination.
573 | func (s *APIV1Service) ListSpaceMembers(ctx context.Context, request *v1pb.ListSpaceMembersRequest) (*v1pb.ListSpaceMembersResponse, error) {
574 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
575 | 	if err != nil {
576 | 		return nil, err
577 | 	}
578 | 	space, _, err := s.resolveMemberSpace(ctx, request.Parent, currentUser)
579 | 	if err != nil {
580 | 		return nil, err
581 | 	}
582 | 	limit, offset, err := listSpacePage(request.PageSize, request.PageToken)
583 | 	if err != nil {
584 | 		return nil, err
585 | 	}
586 | 	limitPlusOne := limit + 1
587 | 	members, err := s.Store.ListSpaceMembers(ctx, &store.FindSpaceMember{
588 | 		SpaceID:      &space.ID,
589 | 		ViewerUserID: &currentUser.ID,
590 | 		Limit:        &limitPlusOne,
591 | 		Offset:       &offset,
592 | 	})
593 | 	if err != nil {
594 | 		return nil, status.Errorf(codes.Internal, "failed to list space members: %v", err)
595 | 	}
596 | 	nextPageToken := ""
597 | 	if len(members) == limitPlusOne {
598 | 		members = members[:limit]
599 | 		nextPageToken, err = getPageToken(limit, offset+limit)
600 | 		if err != nil {
601 | 			return nil, status.Errorf(codes.Internal, "failed to create next page token: %v", err)
602 | 		}
603 | 	}
604 | 	response := &v1pb.ListSpaceMembersResponse{SpaceMembers: make([]*v1pb.SpaceMember, 0, len(members)), NextPageToken: nextPageToken}
605 | 	if len(members) == 0 {
606 | 		return response, nil
607 | 	}
608 | 
609 | 	userIDs := make([]int32, 0, len(members))
610 | 	for _, member := range members {
611 | 		userIDs = append(userIDs, member.UserID)
612 | 	}
613 | 	users, err := s.Store.ListUsers(ctx, &store.FindUser{IDList: userIDs})
614 | 	if err != nil {
615 | 		return nil, status.Errorf(codes.Internal, "failed to resolve space members: %v", err)
616 | 	}
617 | 	usersByID := make(map[int32]*store.User, len(users))
618 | 	for _, user := range users {
619 | 		usersByID[user.ID] = user
620 | 	}
621 | 	for _, member := range members {
622 | 		user := usersByID[member.UserID]
623 | 		if user == nil || user.RowStatus != store.Normal || convertSpaceMemberRoleFromStore(member.Role) == v1pb.SpaceMember_ROLE_UNSPECIFIED {
624 | 			// Malformed/dangling memberships are never exposed as active access.
625 | 			continue
626 | 		}
627 | 		response.SpaceMembers = append(response.SpaceMembers, convertSpaceMemberFromStore(space, user, member))
628 | 	}
629 | 	return response, nil
630 | }
631 | 
632 | func (s *APIV1Service) resolveSpaceMemberResource(ctx context.Context, name string, currentUser *store.User) (*store.Space, *store.User, *store.SpaceMember, *store.SpaceMember, error) {
633 | 	spaceUID, username, err := ExtractSpaceMemberTokensFromName(name)
634 | 	if err != nil {
635 | 		return nil, nil, nil, nil, status.Errorf(codes.InvalidArgument, "invalid space member name: %v", err)
636 | 	}
637 | 	space, callerMembership, err := s.resolveMemberSpace(ctx, buildSpaceName(spaceUID), currentUser)
638 | 	if err != nil {
639 | 		return nil, nil, nil, nil, err
640 | 	}
641 | 	targetUser, err := ResolveUserByName(ctx, s.Store, BuildUserName(username))
642 | 	if err != nil {
643 | 		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to resolve member user: %v", err)
644 | 	}
645 | 	if targetUser == nil {
646 | 		return nil, nil, nil, nil, status.Error(codes.NotFound, "space member not found")
647 | 	}
648 | 	if targetUser.RowStatus != store.Normal {
649 | 		return nil, nil, nil, nil, status.Error(codes.NotFound, "space member not found")
650 | 	}
651 | 	targetMembership, err := s.Store.GetSpaceMember(ctx, &store.FindSpaceMember{
652 | 		SpaceID:      &space.ID,
653 | 		UserID:       &targetUser.ID,
654 | 		ViewerUserID: &currentUser.ID,
655 | 	})
656 | 	if err != nil {
657 | 		return nil, nil, nil, nil, status.Errorf(codes.Internal, "failed to get space membership: %v", err)
658 | 	}
659 | 	if targetMembership == nil || !targetMembership.Role.IsActiveMember() {
660 | 		return nil, nil, nil, nil, status.Error(codes.NotFound, "space member not found")
661 | 	}
662 | 	return space, targetUser, callerMembership, targetMembership, nil
663 | }
664 | 
665 | // GetSpaceMember gets one membership visible to another member of the space.
666 | func (s *APIV1Service) GetSpaceMember(ctx context.Context, request *v1pb.GetSpaceMemberRequest) (*v1pb.SpaceMember, error) {
667 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
668 | 	if err != nil {
669 | 		return nil, err
670 | 	}
671 | 	space, targetUser, _, membership, err := s.resolveSpaceMemberResource(ctx, request.Name, currentUser)
672 | 	if err != nil {
673 | 		return nil, err
674 | 	}
675 | 	return convertSpaceMemberFromStore(space, targetUser, membership), nil
676 | }
677 | 
678 | // UpdateSpaceMember changes a member's role in a Space.
679 | func (s *APIV1Service) UpdateSpaceMember(ctx context.Context, request *v1pb.UpdateSpaceMemberRequest) (*v1pb.SpaceMember, error) {
680 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
681 | 	if err != nil {
682 | 		return nil, err
683 | 	}
684 | 	if request.GetSpaceMember() == nil {
685 | 		return nil, status.Error(codes.InvalidArgument, "space member is required")
686 | 	}
687 | 	if request.UpdateMask == nil || len(request.UpdateMask.Paths) == 0 {
688 | 		return nil, status.Error(codes.InvalidArgument, "update mask must include role")
689 | 	}
690 | 	roleIncluded := false
691 | 	userIncluded := false
692 | 	for _, path := range request.UpdateMask.Paths {
693 | 		switch path {
694 | 		case "role":
695 | 			roleIncluded = true
696 | 		case "user":
697 | 			// grpc-gateway infers user from the schema-required REST body. It is
698 | 			// accepted as immutable identity context, never as a mutable field.
699 | 			userIncluded = true
700 | 		default:
701 | 			return nil, status.Errorf(codes.InvalidArgument, "unsupported update mask path: %s", path)
702 | 		}
703 | 	}
704 | 	if !roleIncluded {
705 | 		return nil, status.Error(codes.InvalidArgument, "update mask must include role")
706 | 	}
707 | 	space, targetUser, callerMembership, targetMembership, err := s.resolveSpaceMemberResource(ctx, request.SpaceMember.Name, currentUser)
708 | 	if err != nil {
709 | 		return nil, err
710 | 	}
711 | 	expectedUser := BuildUserName(targetUser.Username)
712 | 	if userIncluded && request.SpaceMember.User == "" {
713 | 		return nil, status.Error(codes.InvalidArgument, "space member user is required when included in the update mask")
714 | 	}
715 | 	if request.SpaceMember.User != "" && request.SpaceMember.User != expectedUser {
716 | 		return nil, status.Error(codes.InvalidArgument, "space member user does not match name")
717 | 	}
718 | 	if err := requireSpaceAdministrator(callerMembership); err != nil {
719 | 		return nil, err
720 | 	}
721 | 	role, ok := convertSpaceMemberRoleToStore(request.SpaceMember.Role)
722 | 	if !ok {
723 | 		return nil, status.Error(codes.InvalidArgument, "space member role must be ADMIN or USER")
724 | 	}
725 | 	updated, err := s.Store.UpdateSpaceMember(ctx, &store.UpdateSpaceMember{
726 | 		SpaceID: targetMembership.SpaceID,
727 | 		UserID:  targetMembership.UserID,
728 | 		Role:    &role,
729 | 	}, currentUser.ID)
730 | 	if err != nil {
731 | 		return nil, mapSpaceMutationError(err, "failed to update space member")
732 | 	}
733 | 	if updated == nil {
734 | 		return nil, status.Error(codes.NotFound, "space member not found")
735 | 	}
736 | 	s.SSEHub.publishSpaceChanged()
737 | 	return convertSpaceMemberFromStore(space, targetUser, updated), nil
738 | }
739 | 
740 | // DeleteSpaceMember removes a membership or lets a member leave a space.
741 | func (s *APIV1Service) DeleteSpaceMember(ctx context.Context, request *v1pb.DeleteSpaceMemberRequest) (*emptypb.Empty, error) {
742 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
743 | 	if err != nil {
744 | 		return nil, err
745 | 	}
746 | 	_, targetUser, callerMembership, targetMembership, err := s.resolveSpaceMemberResource(ctx, request.Name, currentUser)
747 | 	if err != nil {
748 | 		return nil, err
749 | 	}
750 | 	isSelf := targetUser.ID == currentUser.ID
751 | 	if !isSelf {
752 | 		if err := requireSpaceAdministrator(callerMembership); err != nil {
753 | 			return nil, err
754 | 		}
755 | 	}
756 | 	if err := s.Store.DeleteSpaceMember(ctx, &store.DeleteSpaceMember{
757 | 		SpaceID: targetMembership.SpaceID,
758 | 		UserID:  targetMembership.UserID,
759 | 	}, currentUser.ID); err != nil {
760 | 		return nil, mapSpaceMutationError(err, "failed to delete space member")
761 | 	}
762 | 	s.SSEHub.publishSpaceChanged()
763 | 	return &emptypb.Empty{}, nil
764 | }
===== END ALLOWED INPUT: server/api/v1/space_service.go =====
