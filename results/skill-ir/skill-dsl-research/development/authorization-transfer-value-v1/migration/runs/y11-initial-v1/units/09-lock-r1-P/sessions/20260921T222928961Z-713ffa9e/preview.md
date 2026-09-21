<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: P; condition-analysis: disabled -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
This is task gitea-issue-lock-writer-nonadmin, expressed with source-authorization-assessment/v0. Determine whether an authenticated repository issue writer with full token scope, but with neither repository-administrator nor site-administrator status, may lock an existing unlocked issue through PUT /repos/{owner}/{repo}/issues/{index}/lock.
Assess repository https://github.com/go-gitea/gitea at source ref fc28937a8d772fe9e4025c9b5f24d5db4d86610b in fixed-context mode. Source discovery status is not-tested.

The accepted policy material is:
- issue-lock-admin-policy is a study-task-author-policy-from-public-source at policy.json#/normativePolicy, revision gitea@fc28937:routers/api/v1/api.go#L451-L459,L1741-L1745;routers/api/v1/repo/issue_lock.go#L15-L81.
  Policy text: The issue-lock route requires repository-administrator or site-administrator status; the handler then also requires issue-write permission before locking an unlocked issue.
  Acceptance is accepted; accepting actor role: study-task-author; reason: The fixed public route and handler expose both permission gates before the lock mutation.

The principals are:
- authenticated-issue-writer-without-admin-role has role authenticated repository issue writer without an administrator role. The caller has full token scope and repository issue-write permission, but is neither a repository administrator nor a site administrator.
  Starting capabilities: authenticated, token-scope-all, repository-issue-read, repository-issue-write.

The resources are:
- existing-unlocked-issue is a repository issue lock state. An existing readable issue whose lock state is currently unlocked.

The declared source entries are:
- put-issue-lock names PUT /repos/{owner}/{repo}/issues/{index}/lock.
  Source location: route_guard.go, startLine 4, endLine 12.
  Source location: route_guard.go, startLine 16, endLine 20.
  Source location: issue_lock.go, startLine 4, endLine 70.

The authorization obligations are:
- deny-nonadmin-issue-lock: principal authenticated-issue-writer-without-admin-role, resource existing-unlocked-issue, relation issue-writer-without-repository-or-site-admin-role, operation lock-issue, expected policy disposition deny.
  Policy source: issue-lock-admin-policy. Declared entries: put-issue-lock.
  Condition requester-authenticated: The bounded scenario fixes an authenticated caller.
  Condition requester-is-repository-admin: False in the bounded scenario.
  Condition requester-is-site-admin: False in the bounded scenario.
  Condition requester-has-repository-issue-write: True in the bounded scenario, isolating the stronger route-level administrator gate.
  Condition issue-exists-and-is-readable: The bounded scenario fixes an existing issue visible to the caller.
  Condition issue-is-currently-locked: False in the bounded scenario, so a permitted path would reach the lock mutation rather than a no-op success.

Scope assurance: The fixed crops contain the route-level repository/site administrator middleware, the lock route registration, handler issue lookup, issue-write check, lock mutation, and response. Parent visibility and token middleware are fixed by the scenario but not reproduced beyond the lock group.
Required analysis:
- Trace the declared principal, resource relation, authorization control, and protected effect through the supplied fixed source.
- State any decisive fact unavailable from the fixed source instead of inferring it, and explain how the declared conditions change reachability.
Constraints:
- Use only policy.json, route_guard.go, and issue_lock.go from the supplied fixed source context.
- Do not execute or modify Gitea and do not contact a deployment.
- Do not treat full token scope or repository issue-write permission as repository-administrator status.
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
- deny-nonadmin-issue-lock::put-issue-lock
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

===== BEGIN ALLOWED INPUT: policy.json =====
Source ID: src-d7fc325914ed5f64
Location note: crop lines 1-12; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | {
2 |   "schemaVersion": "authorization-migration-public-policy/v1",
3 |   "repository": "https://github.com/go-gitea/gitea",
4 |   "sourceRef": "fc28937a8d772fe9e4025c9b5f24d5db4d86610b",
5 |   "upstreamSources": [
6 |     "routers/api/v1/api.go#L451-L459,L1741-L1745",
7 |     "routers/api/v1/repo/issue_lock.go#L15-L81"
8 |   ],
9 |   "normativePolicy": "The issue-lock route requires the caller to be a repository administrator or site administrator. After that route gate, the handler also requires permission to write the issue or pull request before it may lock an unlocked issue.",
10 |   "boundedScenario": "The caller is authenticated, has full token scope and repository issue-write permission, but is neither a repository administrator nor a site administrator; the issue exists, is readable, and is currently unlocked.",
11 |   "claimBoundary": "The assessment concerns the declared API route and fixed source only. It does not infer deployment state or permissions outside the supplied scenario."
12 | }
===== END ALLOWED INPUT: policy.json =====

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
