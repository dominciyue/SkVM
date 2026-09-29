<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
# Authorization Assessment Authoring Task

Complete only the unknown domain dictionaries and `analysisContract` in the supplied `authorization-assessment-authoring/v2` draft. Do not modify host-known fields, source bytes, identities, task ID, entry, or file scope.

## Source identity

- **Task ID:** `al-use-memos-members`
- **Repository:** `https://github.com/usememos/memos`
- **Source ref:** `cb42e326ba9cc266a6a9570c53e0fe04c62793f4`
- **Source root:** `../../../../authorization-evidence-editing-v1/public-source/memos`
- **Allowed files:**
  - `server/api/v1/space_service.go`
  - `store/space.go`

## Analysis entry

Declare only this entry:

- **Entry key:** `delete-member`
- **Path:** `server/api/v1/space_service.go`
- **Start line:** `740`
- **End line:** `763`

Helpers are evidence-request dependencies, not additional entries. An empty dependency list with `discover=true` is supported.

## Request

> At DeleteSpaceMember handler entry, compare removal of the caller's own active membership with removal of a different active member's membership in the same space. Assume resource resolution succeeds. Report source-visible authorization and the accepted-policy comparison separately.

## Domain dictionaries

Use exactly these named keys:

- Policy key: `rule`
- Principal key: `caller`
- Resource key: `target`
- Scenario keys:
  - `self-leave`
  - `other-member`

Populate only explicit public facts. Do not infer source outcomes, owner facts, or additional authorization obligations.

### Policy

For the original/current accepted policy, copy verbatim:

> An active space member may delete their own membership to leave. Removing a different active member requires space administrator authority.

For the changed accepted policy, copy verbatim:

> An active space member may delete their own membership and may remove a different active member of the same space without space administrator authority.

Retain the policy locations:

- Original: `author-briefs.json#/memos-space-policy/originalPolicy`
- Changed: `author-briefs.json#/memos-space-policy/changedPolicy`

### Principal

Define `caller` from the supplied scenarios as an authenticated active ordinary non-administrator member. Do not add roles, ownership, or administrator authority.

### Resource

Define `target` as the active space membership selected for deletion in the same space. The scenario relation determines whether it belongs to the caller or a different active member.

## Scenario obligations

### `self-leave`

- **Principal:** `authenticated active ordinary non-administrator member`
- **Relation:** `caller-is-target-member`
- **Operation:** `delete own membership`
- **Premise ID:** `target-relation`
- **Premise:** `At handler entry, the active ordinary non-administrator caller targets their own active membership in the selected space, and resolveSpaceMemberResource succeeds.`
- **Original expectation:** `allow`
- **Changed expectation:** `allow`

Review this scenario explicitly even though its accepted-policy expectation is unchanged.

### `other-member`

- **Principal:** `authenticated active ordinary non-administrator member`
- **Relation:** `caller-is-not-target-member-and-not-admin`
- **Operation:** `delete another active membership`
- **Premise ID:** `target-relation`
- **Premise:** `At handler entry, the active ordinary non-administrator caller targets a different active member in the same space, and resolveSpaceMemberResource succeeds.`
- **Original expectation:** `deny`
- **Changed expectation:** `allow`

## Analysis contract

Require the eventual assessment to evaluate both scenarios at the `delete-member` handler entry and to report these dimensions separately:

1. **Source-visible authorization:** evidence from the unchanged source implementation, without treating policy text as source behavior.
2. **Accepted-policy comparison:** compare each scenario against both the original and changed accepted policies.

The source implementation and source identity are unchanged between policy variants. Do not pre-author or infer the source-visible result.

Retain:

- **Variant:** `original`
- **Requested counterfactuals:** `[]`

Do not add counterfactuals, owner assumptions, extra scenarios, extra entries, or obligations beyond the two supplied scenarios.

## Public analysis questions
Use the current declared policy and explicit premises. Trace decisive control and effect, distinguish unspecified from absent, and answer requested branches without inventing runtime facts.

## Explicit assessment program
- Current question scenario%3Aother-member::entry%3Adelete-member at entry:delete-member; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): target-relation: At handler entry, the active ordinary non-administrator caller targets a different active member in the same space, and resolveSpaceMemberResource succeeds..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Report source behavior and policy comparison separately; source-external store failure is not authorization..
- Current question scenario%3Aself-leave::entry%3Adelete-member at entry:delete-member; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): target-relation: At handler entry, the active ordinary non-administrator caller targets their own active membership in the selected space, and resolveSpaceMemberResource succeeds..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Report source behavior and policy comparison separately; source-external store failure is not authorization..

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

Included original ranges: server/api/v1/space_service.go:19-28 [locator:located-1, model-proposal:dep-current-user-required, host-context:symbol-12eb7dac928e86106592748c]; server/api/v1/space_service.go:30-52 [locator:located-6, model-proposal:dep-caller-active-membership, host-context:symbol-c3ee4a2f03056c3fb56db4cd]; server/api/v1/space_service.go:54-59 [locator:located-3, model-proposal:dep-admin-definition, host-context:symbol-eb4e415f21147ca064d4c55c]; server/api/v1/space_service.go:61-84 [locator:located-5, model-proposal:dep-delete-error-mapping, host-context:symbol-0e7822328c5396a8288809cc]; server/api/v1/space_service.go:167-177 [locator:located-9, host-context:symbol-f4834a3faee1c8edb02208dc]; server/api/v1/space_service.go:632-663 [model-proposal:dep-resolve-caller-space-membership, locator:located-2, model-proposal:dep-resolve-target-user, model-proposal:dep-target-active-membership, host-context:symbol-6822d3f661c6342b91c7f786]; server/api/v1/space_service.go:666-676 [locator:located-7, host-context:symbol-90382e31527d5b7ad59a8fbf]; server/api/v1/space_service.go:740-764 [entry:delete-member, locator:located-4, model-proposal:dep-authenticated-caller, model-proposal:dep-member-resource-resolution, model-proposal:dep-self-comparison, model-proposal:dep-nonself-admin-gate, model-proposal:dep-delete-effect]; store/space.go:64-66 [locator:located-8, model-proposal:dep-active-role-definition, host-context:symbol-5ef85125477058a67954fea3]; store/space.go:274-279 [model-proposal:dep-store-delete-member-delegation, host-context:symbol-b7584dffb029aa15078b5648]

Unresolved gaps: context:range:server/api/v1/space_service.go:740-764: range-uncertain (server/api/v1/space_service.go)

===== BEGIN ALLOWED INPUT: server/api/v1/space_service.go =====
Source ID: src-78bfbd739bb9ce65
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
Source ID: src-a1b44d1a06dae144
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
