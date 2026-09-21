<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: P; condition-analysis: disabled -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task gitea-issue-assignee-nonwriter, expressed with source-authorization-assessment/v0. Determine whether an authenticated caller whose token has issue-write scope, but who lacks repository issue-write permission, may add an existing user to an existing issue through POST /repos/{owner}/{repo}/issues/{index}/assignees.
Assess repository https://github.com/go-gitea/gitea at source ref fc28937a8d772fe9e4025c9b5f24d5db4d86610b in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- issue-assignee-write-policy is a study-task-author-policy-from-public-source at policy.json#/normativePolicy, revision gitea@fc28937:routers/api/v1/repo/issue_assignee.go#L20-L65,L189-L238.
  Policy text: Adding issue assignees requires repository permission to write the issue or pull request; a caller without that permission is rejected before assignee resolution or mutation.
  Acceptance is accepted; accepting actor role: study-task-author; reason: The fixed public source places the repository permission check before assignee resolution and mutation.

The principals are:
- authenticated-token-holder-without-repo-issue-write has role authenticated issue-scope token holder without repository issue-write permission. The caller has an issue-write token scope and can identify the issue, but has no repository permission to write issues or pull requests.
  Starting capabilities: authenticated, token-scope-write-issue, repository-issue-read.

The resources are:
- existing-issue-assignee-set is a issue assignee set. The assignee set of an existing issue, with an existing user requested for addition.

The declared source entries are:
- post-issue-assignees names POST /repos/{owner}/{repo}/issues/{index}/assignees.
  Source location: issue_assignee.go, startLine 4, endLine 49.
  Source location: issue_assignee.go, startLine 53, endLine 102.

The authorization obligations are:
- deny-nonwriter-assignee-add: principal authenticated-token-holder-without-repo-issue-write, resource existing-issue-assignee-set, relation token-authorized-but-without-repository-issue-write-permission, operation add-issue-assignee, expected policy disposition deny.
  Policy source: issue-assignee-write-policy. Declared entries: post-issue-assignees.
  Condition requester-authenticated: The bounded scenario fixes an authenticated caller.
  Condition token-has-issue-write-scope: True in the bounded scenario; token scope alone does not supply repository permission.
  Condition issue-exists: The bounded scenario fixes an existing issue.
  Condition requester-has-repository-issue-write: False in the bounded scenario.
  Condition assignee-exists: The requested assignee exists in the bounded scenario.

Scope assurance: The fixed crop contains the declared POST wrapper, issue lookup, repository issue-write check, HTTP 403 branch, assignee resolution, mutation call, and success response. Token authentication middleware and other endpoints are outside this crop.
Required analysis:
- Trace the declared principal, resource relation, authorization control, and protected effect through the supplied fixed source.
- State any decisive fact unavailable from the fixed source instead of inferring it, and explain how the declared conditions change reachability.
Constraints:
- Use only policy.json and issue_assignee.go from the supplied fixed source context.
- Do not execute or modify Gitea and do not contact a deployment.
- Do not treat an issue-write token scope as repository issue-write permission.
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
- deny-nonwriter-assignee-add::post-issue-assignees
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

===== BEGIN ALLOWED INPUT: policy.json =====
Source ID: src-f1bba60014ed86cf
Location note: crop lines 1-9; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | {
2 |   "schemaVersion": "authorization-migration-public-policy/v1",
3 |   "repository": "https://github.com/go-gitea/gitea",
4 |   "sourceRef": "fc28937a8d772fe9e4025c9b5f24d5db4d86610b",
5 |   "upstreamSource": "routers/api/v1/repo/issue_assignee.go#L20-L65,L189-L238",
6 |   "normativePolicy": "Adding issue assignees requires repository permission to write the issue or pull request. A caller without that repository permission receives HTTP 403 before assignee names are resolved or the issue's assignees are mutated.",
7 |   "boundedScenario": "The caller is authenticated and has an issue-write token scope but lacks repository issue-write permission; the issue and requested user both exist.",
8 |   "claimBoundary": "Token scope and repository permission are distinct in this bounded task. The policy is accepted only for the declared fixed source entry."
9 | }
===== END ALLOWED INPUT: policy.json =====
