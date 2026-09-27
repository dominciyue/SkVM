<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
# Assessment Instructions: `GetRepoPermissions`

## Scope and evidence boundary

Assess only the supplied crop from `collaborators.go`, lines 4–58, at fixed ref `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`. Do not infer behavior from other files, middleware, route registration, tests, database functions, or undocumented assumptions.

The analysis boundary for both scenarios is the handler entry point `GetRepoPermissions` at line 5, with the stated entry premises already in force. Trace only the observable control flow in the supplied crop, including:

- The collaborator username read at line 35.
- The authorization condition and forbidden response at lines 36–39.
- Target-user loading at lines 41–49.
- Permission lookup at lines 51–55.
- Successful response construction at lines 57–58.

Explicitly distinguish the accepted policy from the behavior observed in the supplied handler. The policy is authoritative and must not be rewritten to match the implementation.

## Accepted policy

A caller may query a collaborator’s repository permission when the caller is:

1. A site administrator;
2. A repository administrator; or
3. Querying their own username.

Otherwise, the request must be rejected with HTTP 403 before the target collaborator is loaded.

## Scenario 1: `nonadmin-other`

### Entry premise

At handler entry:

- The caller is authenticated and is a repository-read collaborator.
- The caller is neither a site administrator nor a repository administrator.
- The queried collaborator exists.
- The caller’s username and the queried collaborator’s username differ.

### Assessment task

Determine whether the current handler behavior conforms to the accepted policy for this scenario.

Your assessment must:

- State the policy outcome that should govern this scenario, separately from implementation observations.
- Cite the relevant source line(s) supporting the observed authorization decision.
- Verify whether target-user loading is prevented or permitted before the request terminates.
- Identify any discrepancy between the accepted policy and the observed handler behavior, if one exists.
- Do not rely on the target user’s existence to bypass or alter the authorization requirement.

### Requested-change task

If a change is required, describe the smallest behavior-level change needed to make this scenario conform to the accepted policy. Identify the relevant source location and preserve the requirement that unauthorized requests receive HTTP 403 before the target collaborator is loaded. Do not provide an implementation patch unless specifically required by the assessor’s format.

## Scenario 2: `repo-admin-other`

### Entry premise

At handler entry:

- The caller is authenticated and is a repository administrator.
- The queried collaborator exists.
- The caller’s username and the queried collaborator’s username differ.

### Assessment task

Determine whether the current handler behavior conforms to the accepted policy for this scenario.

Your assessment must:

- State the policy outcome that should govern this scenario, separately from implementation observations.
- Cite the relevant source line(s) supporting the observed authorization decision.
- Trace whether execution proceeds to target-user loading and permission lookup.
- Identify any discrepancy between the accepted policy and the observed handler behavior, if one exists.

### Requested-change task

If a change is required, describe the smallest behavior-level change needed to make this scenario conform to the accepted policy. Identify the relevant source location and preserve the policy distinction between repository administrators, site administrators, and callers querying their own username. Do not change the policy to accommodate the current implementation.

## Required response structure

For each scenario, provide:

1. Entry premise and analysis boundary.
2. Accepted-policy requirement.
3. Observed handler behavior with source-line citations.
4. Conformance assessment.
5. Requested change, only if needed.

Do not consult or mention another author’s draft or an answer key.


## Public analysis questions
Assess each current question at its stated handler-entry boundary using the fixed supplied source and accepted policy. Treat the entry premise as given, not as proof about upstream binding. Distinguish observed control flow from the accepted policy and cite decisive source lines. Do not execute the target or infer unsupplied deployment facts.

## Explicit assessment program
- Current question scenario%3Anonadmin-other::entry%3Apermissions at entry:permissions; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): entry-premise: At entry, caller and queried existing collaborator have different usernames; caller is neither site nor repository administrator..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Separate the accepted policy from observed source behavior and do not assert upstream principal binding from this handler crop..
- Current question scenario%3Arepo-admin-other::entry%3Apermissions at entry:permissions; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): entry-premise: At entry, caller is a repository administrator and the queried existing collaborator has a different username..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: Separate the accepted policy from observed source behavior and do not assert upstream principal binding from this handler crop..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Anonadmin-other::entry%3Apermissions
- scenario%3Arepo-admin-other::entry%3Apermissions
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: collaborators.go =====
Source ID: src-89fab2db8921e6cb
Location note: crop lines 1-58; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | // Fixed excerpt from go-gitea/gitea at fc28937a8d772fe9e4025c9b5f24d5db4d86610b.
2 | // Original path and range: routers/api/v1/repo/collaborators.go:247-301.
3 | 
4 | // GetRepoPermissions gets repository permissions for a user
5 | func GetRepoPermissions(ctx *context.APIContext) {
6 | 	// swagger:operation GET /repos/{owner}/{repo}/collaborators/{collaborator}/permission repository repoGetRepoPermissions
7 | 	// ---
8 | 	// summary: Get repository permissions for a user
9 | 	// produces:
10 | 	// - application/json
11 | 	// parameters:
12 | 	// - name: owner
13 | 	//   in: path
14 | 	//   description: owner of the repo
15 | 	//   type: string
16 | 	//   required: true
17 | 	// - name: repo
18 | 	//   in: path
19 | 	//   description: name of the repo
20 | 	//   type: string
21 | 	//   required: true
22 | 	// - name: collaborator
23 | 	//   in: path
24 | 	//   description: username of the collaborator whose permissions are to be obtained
25 | 	//   type: string
26 | 	//   required: true
27 | 	// responses:
28 | 	//   "200":
29 | 	//     "$ref": "#/responses/RepoCollaboratorPermission"
30 | 	//   "404":
31 | 	//     "$ref": "#/responses/notFound"
32 | 	//   "403":
33 | 	//     "$ref": "#/responses/forbidden"
34 | 
35 | 	collaboratorUsername := ctx.PathParam("collaborator")
36 | 	if !ctx.Doer.IsAdmin && !strings.EqualFold(ctx.Doer.LowerName, collaboratorUsername) && !ctx.IsUserRepoAdmin() {
37 | 		ctx.APIError(http.StatusForbidden, "Only admins can query all permissions, repo admins can query all repo permissions, collaborators can query only their own")
38 | 		return
39 | 	}
40 | 
41 | 	collaborator, err := user_model.GetUserByName(ctx, collaboratorUsername)
42 | 	if err != nil {
43 | 		if user_model.IsErrUserNotExist(err) {
44 | 			ctx.APIError(http.StatusNotFound, err.Error())
45 | 		} else {
46 | 			ctx.APIErrorInternal(err)
47 | 		}
48 | 		return
49 | 	}
50 | 
51 | 	permission, err := access_model.GetIndividualUserRepoPermission(ctx, ctx.Repo.Repository, collaborator)
52 | 	if err != nil {
53 | 		ctx.APIErrorInternal(err)
54 | 		return
55 | 	}
56 | 
57 | 	ctx.JSON(http.StatusOK, convert.ToUserAndPermission(ctx, collaborator, ctx.ContextUser, permission.AccessMode))
58 | }
===== END ALLOWED INPUT: collaborators.go =====
