<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: P; condition-analysis: disabled -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task gitea-collaborator-cross-user-permission, expressed with source-authorization-assessment/v0. Determine whether an authenticated read collaborator who is neither a repository administrator nor a site administrator may query a different collaborator's repository permission through GET /repos/{owner}/{repo}/collaborators/{collaborator}/permission.
Assess repository https://github.com/go-gitea/gitea at source ref fc28937a8d772fe9e4025c9b5f24d5db4d86610b in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- collaborator-permission-query-policy is a study-task-author-policy-from-public-source at policy.json#/normativePolicy, revision gitea@fc28937:routers/api/v1/repo/collaborators.go#L247-L301.
  Policy text: A caller may query a collaborator's repository permission only when the caller is a site administrator, is a repository administrator, or is querying their own username; otherwise the endpoint rejects the request before loading the target collaborator.
  Acceptance is accepted; accepting actor role: study-task-author; reason: The fixed public source states this bounded endpoint policy and rejection branch explicitly.

The principals are:
- authenticated-read-collaborator has role authenticated repository read collaborator. A repository collaborator with read access who is not the target collaborator, a repository administrator, or a site administrator.
  Starting capabilities: authenticated, repository-read, repository-collaborator.

The resources are:
- other-collaborator-permission is a repository collaborator permission. The permission record of a different existing collaborator in the same repository.

The declared source entries are:
- get-collaborator-permission names GET /repos/{owner}/{repo}/collaborators/{collaborator}/permission.
  Source location: collaborators.go, startLine 4, endLine 58.

The authorization obligations are:
- deny-cross-user-permission-query: principal authenticated-read-collaborator, resource other-collaborator-permission, relation different-collaborator-without-repository-or-site-admin-role, operation read-collaborator-permission, expected policy disposition deny.
  Policy source: collaborator-permission-query-policy. Declared entries: get-collaborator-permission.
  Condition requester-authenticated: The bounded scenario fixes the requester as authenticated.
  Condition requester-is-target-collaborator: False in the bounded scenario: the requested username belongs to a different collaborator.
  Condition requester-is-repository-admin: False in the bounded scenario: the requester has read collaborator access only.
  Condition requester-is-site-admin: False in the bounded scenario.
  Condition target-collaborator-exists: The bounded scenario fixes an existing target collaborator so the authorization branch is decisive.

Scope assurance: The fixed crop contains the declared GET entry, its self/repository-admin/site-admin decision, the HTTP 403 branch, target lookup, and permission response. No other Gitea endpoint or deployment is assessed.
Required analysis:
- Trace the declared principal, resource relation, authorization control, and protected effect through the supplied fixed source.
- State any decisive fact unavailable from the fixed source instead of inferring it, and explain how the declared conditions change reachability.
Constraints:
- Use only policy.json and collaborators.go from the supplied fixed source context.
- Do not execute or modify Gitea and do not contact a deployment.
- Distinguish repository read access from repository administrator permission.
Allowed conclusions: source_supported_failure, source_refuted, unknown.

## Public analysis questions
- Which source-visible condition or control gates the declared entry before the assessed path proceeds?
- How is the declared principal bound to the runtime caller or identity used by the assessed operation?
- How is the request-selected object bound to the declared resource, and which other checked resource must remain distinct?
- What is the strongest source-visible authorization decision for this principal, resource relation, operation, and condition set, including any role or ownership branch?
- After the visible controls, can the requested operation reach the declared protected effect, and under which source-visible branch?
- Which source-external fact, if any, can change the answer, and is that fact supplied or still unknown in this fixed context?

## Result contract
Return exactly one result for every runnable expanded obligation, with one of: source_supported_failure, source_refuted, unknown.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.
Exact runnable obligation IDs (closed list):
- deny-cross-user-permission-query::get-collaborator-permission
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

===== BEGIN ALLOWED INPUT: policy.json =====
Source ID: src-6cadf77ba934e179
Location note: crop lines 1-9; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | {
2 |   "schemaVersion": "authorization-migration-public-policy/v1",
3 |   "repository": "https://github.com/go-gitea/gitea",
4 |   "sourceRef": "fc28937a8d772fe9e4025c9b5f24d5db4d86610b",
5 |   "upstreamSource": "routers/api/v1/repo/collaborators.go#L247-L301",
6 |   "normativePolicy": "A caller may query a collaborator's repository permission when the caller is a site administrator, is a repository administrator, or is querying their own username. If none of those relations holds, the request is rejected with HTTP 403 before the target collaborator is loaded.",
7 |   "boundedScenario": "The caller is authenticated and has repository read access, is a collaborator, is not a site or repository administrator, and queries a different existing collaborator.",
8 |   "claimBoundary": "This policy is accepted for the declared fixed source entry only. It is not a claim about every Gitea version, endpoint, or deployment."
9 | }
===== END ALLOWED INPUT: policy.json =====
