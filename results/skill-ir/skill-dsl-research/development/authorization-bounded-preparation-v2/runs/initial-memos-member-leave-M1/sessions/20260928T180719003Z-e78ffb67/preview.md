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
Preparation status: partial

Closure claim: declared-dependencies-only

Prepared from: https://github.com/usememos/memos@cb42e326ba9cc266a6a9570c53e0fe04c62793f4; root ../../../authorization-evidence-editing-v1/public-source/memos

Included original ranges: server/api/v1/space_service.go:19-28 [locator:located-1, model-proposal:dep-auth-helper]; server/api/v1/space_service.go:30-52 [locator:located-6, model-proposal:dep-caller-membership-resolution]; server/api/v1/space_service.go:54-59 [locator:located-3, model-proposal:dep-admin-requirement]; server/api/v1/space_service.go:61-84 [locator:located-5, model-proposal:dep-delete-error-mapping]; server/api/v1/space_service.go:167-177 [locator:located-9]; server/api/v1/space_service.go:632-663 [locator:located-2, model-proposal:dep-resource-resolution]; server/api/v1/space_service.go:666-676 [locator:located-7]; server/api/v1/space_service.go:740-764 [entry:delete-member, locator:located-4, model-proposal:dep-auth-call, model-proposal:dep-resource-resolution-call, model-proposal:dep-self-versus-other-branch, model-proposal:dep-delete-effect-call]; store/space.go:64-66 [locator:located-8]; store/space.go:274-279 [model-proposal:dep-store-delete-space-member]

Unresolved gaps: dep-active-role-definition: depth-budget (store/space.go)

===== BEGIN ALLOWED INPUT: server/api/v1/space_service.go =====
Source ID: src-e2ad4ef5bd43e06f
Location note: crop lines 19-764; original locations: server/api/v1/space_service.go:19-28, server/api/v1/space_service.go:30-52, server/api/v1/space_service.go:54-59, server/api/v1/space_service.go:61-84, server/api/v1/space_service.go:167-177, server/api/v1/space_service.go:632-663, server/api/v1/space_service.go:666-676, server/api/v1/space_service.go:740-764
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
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
[OMITTED original lines 29-29]
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
[OMITTED original lines 53-53]
54 | func requireSpaceAdministrator(member *store.SpaceMember) error {
55 | 	if member == nil || member.Role != store.SpaceMemberRoleAdmin {
56 | 		return status.Error(codes.PermissionDenied, "space administrator permission required")
57 | 	}
58 | 	return nil
59 | }
[OMITTED original lines 60-60]
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
[OMITTED original lines 85-166]
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
[OMITTED original lines 178-631]
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
[OMITTED original lines 664-665]
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
[OMITTED original lines 677-739]
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

===== BEGIN ALLOWED INPUT: store/space.go =====
Source ID: src-a88b144abe83d813
Location note: crop lines 64-279; original locations: store/space.go:64-66, store/space.go:274-279
Citation contract: use original line numbers in one displayed segment; ranges cannot cross omitted intervals or sources.
64 | func (r SpaceMemberRole) IsActiveMember() bool {
65 | 	return r == SpaceMemberRoleAdmin || r == SpaceMemberRoleUser
66 | }
[OMITTED original lines 67-273]
274 | func (s *Store) DeleteSpaceMember(ctx context.Context, delete *DeleteSpaceMember, actorUserID int32) error {
275 | 	if delete == nil || delete.SpaceID <= 0 || delete.UserID <= 0 || actorUserID <= 0 {
276 | 		return errors.New("space member deletion requires space, user, and actor")
277 | 	}
278 | 	return s.driver.DeleteSpaceMember(ctx, delete, actorUserID)
279 | }
===== END ALLOWED INPUT: store/space.go =====
