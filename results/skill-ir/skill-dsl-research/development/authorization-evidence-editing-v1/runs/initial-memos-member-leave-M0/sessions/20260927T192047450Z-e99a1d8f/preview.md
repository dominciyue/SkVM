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
===== BEGIN ALLOWED INPUT: server/api/v1/space_service.go =====
Source ID: src-71879330529c8ea0
Location note: crop lines 1-24; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | // DeleteSpaceMember removes a membership or lets a member leave a space.
2 | func (s *APIV1Service) DeleteSpaceMember(ctx context.Context, request *v1pb.DeleteSpaceMemberRequest) (*emptypb.Empty, error) {
3 | 	currentUser, err := s.requireCurrentSpaceUser(ctx)
4 | 	if err != nil {
5 | 		return nil, err
6 | 	}
7 | 	_, targetUser, callerMembership, targetMembership, err := s.resolveSpaceMemberResource(ctx, request.Name, currentUser)
8 | 	if err != nil {
9 | 		return nil, err
10 | 	}
11 | 	isSelf := targetUser.ID == currentUser.ID
12 | 	if !isSelf {
13 | 		if err := requireSpaceAdministrator(callerMembership); err != nil {
14 | 			return nil, err
15 | 		}
16 | 	}
17 | 	if err := s.Store.DeleteSpaceMember(ctx, &store.DeleteSpaceMember{
18 | 		SpaceID: targetMembership.SpaceID,
19 | 		UserID:  targetMembership.UserID,
20 | 	}, currentUser.ID); err != nil {
21 | 		return nil, mapSpaceMutationError(err, "failed to delete space member")
22 | 	}
23 | 	s.SSEHub.publishSpaceChanged()
24 | 	return &emptypb.Empty{}, nil
===== END ALLOWED INPUT: server/api/v1/space_service.go =====
