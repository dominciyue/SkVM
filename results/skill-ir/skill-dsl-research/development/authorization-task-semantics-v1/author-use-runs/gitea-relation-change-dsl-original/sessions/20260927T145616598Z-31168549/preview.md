<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task gitea-relation-change-original, expressed with source-authorization-assessment/v0. Using only the supplied collaborators.go crop at the fixed ref, assess GetRepoPermissions against the accepted policy for both scenarios. Evaluate policy authorization separately from observed source behavior, including whether denial occurs before the target collaborator is loaded. If the implementation diverges, request the minimal source change needed to conform; do not rewrite the accepted policy or assume unshown upstream behavior.
Assess repository https://github.com/go-gitea/gitea at source ref fc28937a8d772fe9e4025c9b5f24d5db4d86610b in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- policy:collaborator-permission-query is a explicit-task-requirement at author-neutral-briefs.json#/packages/1/originalPolicy, revision original.
  Policy text: A caller may query a collaborator's repository permission when the caller is a site administrator, is a repository administrator, or is querying their own username. Otherwise the request is rejected with HTTP 403 before the target collaborator is loaded.
  Acceptance is accepted; accepting actor role: task-author; reason: This is the task author's accepted original authorization policy and must remain independent of implementation behavior.

The principals are:
- principal:nonadmin-read-collaborator has role authenticated repository-read collaborator. Author facts: ["Caller is not a site administrator.","Caller is not a repository administrator.","Caller username differs from the queried collaborator username."]
  Starting capabilities: Read the repository..
- principal:repository-administrator has role authenticated repository administrator. Author facts: ["Caller is a repository administrator.","Caller username differs from the queried collaborator username."]
  Starting capabilities: Administer the repository..

The resources are:
- resource:other-existing-collaborator-permission is a repository collaborator permission. Author facts: ["The queried collaborator exists.","The queried collaborator has a username different from the caller.","The permission belongs to the repository handled by GetRepoPermissions."]

The declared source entries are:
- entry:get-repo-permissions names GetRepoPermissions.
  Source location: collaborators.go, startLine 5, endLine 58.

The authorization obligations are:
- scenario:nonadmin-other: principal principal:nonadmin-read-collaborator, resource resource:other-existing-collaborator-permission, relation permission of another repository collaborator, operation query, expected policy disposition deny.
  Policy source: policy:collaborator-permission-query. Declared entries: entry:get-repo-permissions.
  Conditions: none declared.
- scenario:repo-admin-other: principal principal:repository-administrator, resource resource:other-existing-collaborator-permission, relation permission of another repository collaborator, operation query, expected policy disposition allow.
  Policy source: policy:collaborator-permission-query. Declared entries: entry:get-repo-permissions.
  Conditions: none declared.

Scope assurance: Only explicitly declared scenarios and supplied source are assessed; repository discovery and deployment behavior are not tested.
Required analysis:
- Trace entry, identity and resource binding, strongest authorization control, and protected effect. Explain decisive missing source-external facts.
Constraints:
- Use only supplied fixed source context. Do not execute or modify the target, contact a deployment, or claim repository-wide discovery.
Allowed decision kinds: observed for allow/deny expectations; conditional-policy for conditional expectations.

## Public analysis questions
The analysis boundary is the declared GetRepoPermissions entry and the supplied collaborators.go crop only. Treat each listed premise as true at handler entry, not as proof of upstream authentication, routing, repository loading, or role injection. Do not consult an evaluator or infer code outside the crop. For each scenario, compare the accepted policy judgment with the source path and identify any required minimal change without altering the policy.

## Explicit assessment program
- Current question scenario%3Anonadmin-other::entry%3Aget-repo-permissions at entry:get-repo-permissions; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): authenticated-read-collaborator: At entry, caller is an authenticated repository-read collaborator.; different-usernames: At entry, caller and queried existing collaborator have different usernames.; not-repo-admin: At entry, caller is not a repository administrator.; not-site-admin: At entry, caller is not a site administrator..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: State the accepted-policy authorization judgment.; Trace the relevant supplied-source condition and response path with line references.; Determine whether any denial precedes loading the target collaborator.; State any policy mismatch and the minimal requested source change, or state that none is required..
- Current question scenario%3Arepo-admin-other::entry%3Aget-repo-permissions at entry:get-repo-permissions; boundary: declared-entry.
  Accepted task premises at this entry (not source citations): different-usernames: At entry, caller and queried existing collaborator have different usernames.; existing-collaborator: At entry, the queried collaborator exists.; repo-admin: At entry, caller is a repository administrator..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Required response details: State the accepted-policy authorization judgment.; Trace the relevant supplied-source condition and subsequent permission lookup with line references.; Distinguish authorization from possible downstream lookup or internal errors.; State any policy mismatch and the minimal requested source change, or state that none is required..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- (none)
Exact runnable obligation IDs (closed list):
- scenario%3Anonadmin-other::entry%3Aget-repo-permissions
- scenario%3Arepo-admin-other::entry%3Aget-repo-permissions
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
