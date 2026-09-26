<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
At `https://github.com/go-gitea/gitea` ref `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`, assess adding issue assignees using the supplied `issue_assignee.go` crop. The principal is authenticated with issue-write token scope but lacks repository issue-write permission; the issue and requested user both exist. Apply the policy that adding assignees requires repository permission to write the issue or pull request, with rejection before assignee resolution or mutation when that permission is absent. Bind principal, token scope, repository permission, operation, resource, entry, and mutation path. Cite exact supplied-source locations, distinguish token scope from repository permission, and perform only fixed-source analysis without execution, deployment, or broader-version claims.


## Control binding questions
For each listed runnable obligation, answer these source-grounded comparison questions concisely in the existing facts and explanation. They are questions, not assertions about source behavior.
- scenario%3Adeny-nonwriter-assignee-add::entry%3Apost-issue-assignees (principal principal:authenticated-token-holder-without-repo-issue-write; target resource:existing-issue-assignee-set; entry entry:post-issue-assignees):
  - For principal principal:authenticated-token-holder-without-repo-issue-write at entry entry:post-issue-assignees, which object is checked by each claimed control, and is that same object the resource:existing-issue-assignee-set affected by add-issue-assignee? If different, identify the source-backed link or gap without treating ownership of one object as permission on another.
  - For entry entry:post-issue-assignees and add-issue-assignee on resource:existing-issue-assignee-set, does each claimed upstream route, middleware, or helper gate apply to the assessed path before the effect? Describe applicable conditions and any visible bypass branch with source support.
  - For principal:authenticated-token-holder-without-repo-issue-write with relation token-authorized-but-without-repository-issue-write-permission to resource:existing-issue-assignee-set under declared conditions assignee-exists, issue-exists, requester-authenticated, requester-has-repository-issue-write, token-has-issue-write-scope, which owner, grantee, staff, or administrator exception actually applies to add-issue-assignee? Distinguish an applicable exception from an exception present elsewhere or one that does not cover this target.
  - For this bounded add-issue-assignee decision on resource:existing-issue-assignee-set, which missing source-external fact, if any, would change the outcome? State the conditional outcomes and minimum observation; do not turn unrelated unknown facts into an unknown decision.

## Result contract
Use compact wire/v4: top-level results only. Each item has obligationId, conclusion, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation, with one of: source_supported_failure, source_refuted, unknown.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.
Exact runnable obligation IDs (closed list):
- scenario%3Adeny-nonwriter-assignee-add::entry%3Apost-issue-assignees
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

## Fixed source context
===== BEGIN ALLOWED INPUT: issue_assignee.go =====
Source ID: src-46786967a1fedfdd
Location note: crop lines 1-102; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | // Fixed excerpts from go-gitea/gitea at fc28937a8d772fe9e4025c9b5f24d5db4d86610b.
2 | // Original path and ranges: routers/api/v1/repo/issue_assignee.go:20-65,189-238.
3 | 
4 | // AddIssueAssignees add assignees to an issue
5 | func AddIssueAssignees(ctx *context.APIContext) {
6 | 	// swagger:operation POST /repos/{owner}/{repo}/issues/{index}/assignees issue issueAddAssignees
7 | 	// ---
8 | 	// summary: Add assignees to an issue
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
32 | 	//   required: true
33 | 	//   schema:
34 | 	//     "$ref": "#/definitions/IssueAssigneesOption"
35 | 	// responses:
36 | 	//   "201":
37 | 	//     "$ref": "#/responses/Issue"
38 | 	//   "400":
39 | 	//     "$ref": "#/responses/error"
40 | 	//   "403":
41 | 	//     "$ref": "#/responses/forbidden"
42 | 	//   "404":
43 | 	//     "$ref": "#/responses/notFound"
44 | 	//   "422":
45 | 	//     "$ref": "#/responses/validationError"
46 | 
47 | 	opts := web.GetForm[*api.IssueAssigneesOption](ctx)
48 | 	updateIssueAssignees(ctx, *opts, true)
49 | }
50 | 
51 | // Upstream lines 66-188 are outside this fixed task crop.
52 | 
53 | func updateIssueAssignees(ctx *context.APIContext, opts api.IssueAssigneesOption, isAdd bool) {
54 | 	issue, err := issues_model.GetIssueByIndex(ctx, ctx.Repo.Repository.ID, ctx.PathParamInt64("index"))
55 | 	if err != nil {
56 | 		ctx.APIErrorAuto(err)
57 | 		return
58 | 	}
59 | 
60 | 	if !ctx.Repo.Permission.CanWriteIssuesOrPulls(issue.IsPull) {
61 | 		ctx.Status(http.StatusForbidden)
62 | 		return
63 | 	}
64 | 
65 | 	if err := issue.LoadAttributes(ctx); err != nil {
66 | 		ctx.APIErrorInternal(err)
67 | 		return
68 | 	}
69 | 
70 | 	assigneeIDs, err := user_model.GetUserIDsByNames(ctx, opts.Assignees, false)
71 | 	if err != nil {
72 | 		if user_model.IsErrUserNotExist(err) {
73 | 			ctx.APIError(http.StatusUnprocessableEntity, err.Error())
74 | 			return
75 | 		}
76 | 		ctx.APIErrorAuto(err)
77 | 		return
78 | 	}
79 | 
80 | 	if isAdd {
81 | 		err = issue_service.AddAssignees(ctx, issue, ctx.Doer, assigneeIDs)
82 | 	} else {
83 | 		err = issue_service.RemoveAssignees(ctx, issue, ctx.Doer, assigneeIDs)
84 | 	}
85 | 
86 | 	if err != nil {
87 | 		ctx.APIErrorAuto(err)
88 | 		return
89 | 	}
90 | 
91 | 	issue, err = issues_model.GetIssueByID(ctx, issue.ID)
92 | 	if err != nil {
93 | 		ctx.APIErrorInternal(err)
94 | 		return
95 | 	}
96 | 
97 | 	status := http.StatusOK
98 | 	if isAdd {
99 | 		status = http.StatusCreated
100 | 	}
101 | 	ctx.JSON(status, convert.ToAPIIssue(ctx, ctx.Doer, issue))
102 | }
===== END ALLOWED INPUT: issue_assignee.go =====
