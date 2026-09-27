<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: legacy -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
At `https://github.com/go-gitea/gitea` ref `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`, assess the issue-lock API route using the supplied `route_guard.go` and `issue_lock.go` crops. The principal is authenticated with full token scope and repository issue-write permission, is neither a repository administrator nor site administrator, and targets an existing readable unlocked issue. Apply the policy that the route first requires repository- or site-administrator status, then requires issue or pull-request write permission before locking. Trace both authorization gates to the lock effect, identifying principal, operation, resource, route entries, and permissions. Cite exact supplied-source locations, remain within the fixed scenario, and do not infer deployment state or execute or deploy the project.


## Public analysis questions
Decide the current scenario at the stated boundary from the supplied fixed source and accepted policy. Treat listed premises as question assumptions at the named entry, not as source or deployment proof. Trace the decisive authorization control and protected effect with exact supplied-source locations. Answer every explicitly requested counterfactual branch separately, identifying its changed assumptions and any decisive unknown. Include only the response details requested below. Do not execute the target, infer missing deployment facts, or consult later versions.
Current question: Can an authenticated issue writer with full token scope but neither repository-admin nor site-admin status lock an existing unlocked issue through the named PUT route?
Analysis boundary: declared-entry.
Task premise: At the named PUT route the authenticated caller has full token scope and issue-write permission but neither repository-admin nor site-admin status; the issue exists and is unlocked.
Required response detail: Trace the route and handler gates in order and identify whether the lock mutation is reached.

## Result contract
Use compact wire/v4: top-level results only. Each item has obligationId, conclusion, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation, with one of: source_supported_failure, source_refuted, unknown.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.
Exact runnable obligation IDs (closed list):
- scenario%3Adeny-nonadmin-issue-lock::entry%3Aput-issue-lock
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: issue_lock.go =====
Source ID: src-ed35041e326128c5
Location note: crop lines 1-70; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | // Fixed excerpt from go-gitea/gitea at fc28937a8d772fe9e4025c9b5f24d5db4d86610b.
2 | // Original path and range: routers/api/v1/repo/issue_lock.go:15-81.
3 | 
4 | // LockIssue lock an issue
5 | func LockIssue(ctx *context.APIContext) {
6 | 	// swagger:operation PUT /repos/{owner}/{repo}/issues/{index}/lock issue issueLockIssue
7 | 	// ---
8 | 	// summary: Lock an issue
9 | 	// consumes:
10 | 	// - application/json
11 | 	// produces:
12 | 	// - application/json
13 | 	// parameters:
14 | 	// - name: owner
15 | 	//   in: path
16 | 	//   description: owner of the repo
17 | 	//   type: string
18 | 	//   required: true
19 | 	// - name: repo
20 | 	//   in: path
21 | 	//   description: name of the repo
22 | 	//   type: string
23 | 	//   required: true
24 | 	// - name: index
25 | 	//   in: path
26 | 	//   description: index of the issue
27 | 	//   type: integer
28 | 	//   format: int64
29 | 	//   required: true
30 | 	// - name: body
31 | 	//   in: body
32 | 	//   schema:
33 | 	//     "$ref": "#/definitions/LockIssueOption"
34 | 	// responses:
35 | 	//   "204":
36 | 	//     "$ref": "#/responses/empty"
37 | 	//   "403":
38 | 	//     "$ref": "#/responses/forbidden"
39 | 	//   "404":
40 | 	//     "$ref": "#/responses/notFound"
41 | 
42 | 	reason := web.GetForm[*api.LockIssueOption](ctx).Reason
43 | 	issue, err := issues_model.GetIssueByIndex(ctx, ctx.Repo.Repository.ID, ctx.PathParamInt64("index"))
44 | 	if err != nil {
45 | 		ctx.APIErrorAuto(err)
46 | 		return
47 | 	}
48 | 
49 | 	if !ctx.Repo.Permission.CanWriteIssuesOrPulls(issue.IsPull) {
50 | 		ctx.APIError(http.StatusForbidden, "no permission to lock this issue")
51 | 		return
52 | 	}
53 | 
54 | 	if !issue.IsLocked {
55 | 		opt := &issues_model.IssueLockOptions{
56 | 			Doer:   ctx.ContextUser,
57 | 			Issue:  issue,
58 | 			Reason: reason,
59 | 		}
60 | 
61 | 		issue.Repo = ctx.Repo.Repository
62 | 		err = issues_model.LockIssue(ctx, opt)
63 | 		if err != nil {
64 | 			ctx.APIErrorInternal(err)
65 | 			return
66 | 		}
67 | 	}
68 | 
69 | 	ctx.Status(http.StatusNoContent)
70 | }
===== END ALLOWED INPUT: issue_lock.go =====

===== BEGIN ALLOWED INPUT: route_guard.go =====
Source ID: src-abc290f763b410ea
Location note: crop lines 1-20; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | // Fixed excerpts from go-gitea/gitea at fc28937a8d772fe9e4025c9b5f24d5db4d86610b.
2 | // Original path and ranges: routers/api/v1/api.go:451-459,1741-1745.
3 | 
4 | // reqAdmin user should be an owner or a collaborator with admin write of a repository, or site admin
5 | func reqAdmin() func(ctx *context.APIContext) {
6 | 	return func(ctx *context.APIContext) {
7 | 		if !ctx.IsUserRepoAdmin() && !ctx.IsUserSiteAdmin() {
8 | 			ctx.APIError(http.StatusForbidden, "user should be an owner or a collaborator with admin write of a repository")
9 | 			return
10 | 		}
11 | 	}
12 | }
13 | 
14 | // Upstream route tree outside the declared lock group is omitted.
15 | 
16 | m.Group("/lock", func() {
17 | 	m.Combo("").
18 | 		Put(bind(api.LockIssueOption{}), repo.LockIssue).
19 | 		Delete(repo.UnlockIssue)
20 | }, reqToken(), reqAdmin())
===== END ALLOWED INPUT: route_guard.go =====
