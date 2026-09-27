<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: legacy -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
Using only the supplied crop from Gitea commit `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`—specifically `collaborators.go` and the named `GetRepoPermissions` handler—assess the current question at the declared-entry boundary. Apply the accepted authorization policy supplied with the task without importing facts from outside the crop, and do not infer behavior beyond the handler’s relevant entry-point logic.

The premises are that the authenticated caller has repository-read access but is neither a site administrator nor a repository administrator, and that the requested username is the caller’s own existing username. State whether the request is authorized, explain how the self-query condition is evaluated, and distinguish that branch from the role check that applies when querying another user. There are no additional requested branches. Do not invent source facts, cite unavailable files, or provide an answer key or evaluator commentary.


## Public analysis questions
Decide the current scenario at the stated boundary from the supplied fixed source and accepted policy. Treat listed premises as question assumptions at the named entry, not as source or deployment proof. Trace the decisive authorization control and protected effect with exact supplied-source locations. Answer every explicitly requested counterfactual branch separately, identifying its changed assumptions and any decisive unknown. Include only the response details requested below. Do not execute the target, infer missing deployment facts, or consult later versions.
Current question: Can the stated authenticated repository-read collaborator who is neither a site nor repository administrator query that caller's own existing username through GetRepoPermissions?
Analysis boundary: declared-entry.
Task premise: At GetRepoPermissions the authenticated repository-read collaborator is neither a site nor repository administrator, and the queried username is the caller's own existing username.
Required response detail: Explain the self-query branch and distinguish it from the other-user role check.

## Result contract
Use compact wire/v4: top-level results only. Each item has obligationId, conclusion, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation, with one of: source_supported_failure, source_refuted, unknown.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.
Exact runnable obligation IDs (closed list):
- scenario%3Adifferent-user-query::entry%3Aget-repo-permissions
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
