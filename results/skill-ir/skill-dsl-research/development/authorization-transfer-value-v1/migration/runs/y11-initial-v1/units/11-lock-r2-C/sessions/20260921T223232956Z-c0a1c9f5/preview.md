<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: C; condition-analysis: enabled -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
{
  "schemaVersion": "source-authorization-assessment/v0",
  "taskId": "gitea-issue-lock-writer-nonadmin",
  "request": "Determine whether an authenticated repository issue writer with full token scope, but with neither repository-administrator nor site-administrator status, may lock an existing unlocked issue through PUT /repos/{owner}/{repo}/issues/{index}/lock.",
  "repository": "https://github.com/go-gitea/gitea",
  "sourceRef": "fc28937a8d772fe9e4025c9b5f24d5db4d86610b",
  "sourceMode": "fixed-context",
  "policySources": [
    {
      "id": "issue-lock-admin-policy",
      "kind": "study-task-author-policy-from-public-source",
      "text": "The issue-lock route requires repository-administrator or site-administrator status; the handler then also requires issue-write permission before locking an unlocked issue.",
      "location": "policy.json#/normativePolicy",
      "revision": "gitea@fc28937:routers/api/v1/api.go#L451-L459,L1741-L1745;routers/api/v1/repo/issue_lock.go#L15-L81",
      "acceptance": {
        "status": "accepted",
        "actorRole": "study-task-author",
        "reason": "The fixed public route and handler expose both permission gates before the lock mutation."
      }
    }
  ],
  "principals": [
    {
      "id": "authenticated-issue-writer-without-admin-role",
      "role": "authenticated repository issue writer without an administrator role",
      "description": "The caller has full token scope and repository issue-write permission, but is neither a repository administrator nor a site administrator.",
      "startingCapabilities": [
        "authenticated",
        "token-scope-all",
        "repository-issue-read",
        "repository-issue-write"
      ]
    }
  ],
  "resources": [
    {
      "id": "existing-unlocked-issue",
      "type": "repository issue lock state",
      "description": "An existing readable issue whose lock state is currently unlocked."
    }
  ],
  "entries": [
    {
      "id": "put-issue-lock",
      "name": "PUT /repos/{owner}/{repo}/issues/{index}/lock",
      "locations": [
        {
          "path": "route_guard.go",
          "startLine": 4,
          "endLine": 12
        },
        {
          "path": "route_guard.go",
          "startLine": 16,
          "endLine": 20
        },
        {
          "path": "issue_lock.go",
          "startLine": 4,
          "endLine": 70
        }
      ]
    }
  ],
  "obligations": [
    {
      "id": "deny-nonadmin-issue-lock",
      "principalId": "authenticated-issue-writer-without-admin-role",
      "resourceId": "existing-unlocked-issue",
      "relation": "issue-writer-without-repository-or-site-admin-role",
      "operation": "lock-issue",
      "expectation": "deny",
      "conditions": [
        {
          "name": "requester-authenticated",
          "basis": "The bounded scenario fixes an authenticated caller."
        },
        {
          "name": "requester-is-repository-admin",
          "basis": "False in the bounded scenario."
        },
        {
          "name": "requester-is-site-admin",
          "basis": "False in the bounded scenario."
        },
        {
          "name": "requester-has-repository-issue-write",
          "basis": "True in the bounded scenario, isolating the stronger route-level administrator gate."
        },
        {
          "name": "issue-exists-and-is-readable",
          "basis": "The bounded scenario fixes an existing issue visible to the caller."
        },
        {
          "name": "issue-is-currently-locked",
          "basis": "False in the bounded scenario, so a permitted path would reach the lock mutation rather than a no-op success."
        }
      ],
      "policySourceId": "issue-lock-admin-policy",
      "entryIds": [
        "put-issue-lock"
      ]
    }
  ],
  "scopeAssurance": "The fixed crops contain the route-level repository/site administrator middleware, the lock route registration, handler issue lookup, issue-write check, lock mutation, and response. Parent visibility and token middleware are fixed by the scenario but not reproduced beyond the lock group.",
  "requiredAnalysis": [
    "Trace the declared principal, resource relation, authorization control, and protected effect through the supplied fixed source.",
    "State any decisive fact unavailable from the fixed source instead of inferring it, and explain how the declared conditions change reachability."
  ],
  "constraints": [
    "Use only policy.json, route_guard.go, and issue_lock.go from the supplied fixed source context.",
    "Do not execute or modify Gitea and do not contact a deployment.",
    "Do not treat full token scope or repository issue-write permission as repository-administrator status."
  ],
  "allowedConclusions": [
    "source_supported_failure",
    "source_refuted",
    "unknown"
  ],
  "discoveryStatus": "not-tested"
}

## Analysis requirement ledger
{
  "status": "ready",
  "requirements": [
    {
      "id": "authorization-core-v1.authorization-decision",
      "kind": "authorization-decision",
      "obligationIds": [
        "deny-nonadmin-issue-lock"
      ],
      "question": "What is the strongest source-visible authorization decision for this principal, resource relation, operation, and condition set, including any role or ownership branch?",
      "applicability": "required",
      "prerequisiteIds": [
        "authorization-core-v1.identity-binding",
        "authorization-core-v1.resource-binding"
      ]
    },
    {
      "id": "authorization-core-v1.effect-reachability",
      "kind": "effect-reachability",
      "obligationIds": [
        "deny-nonadmin-issue-lock"
      ],
      "question": "After the visible controls, can the requested operation reach the declared protected effect, and under which source-visible branch?",
      "applicability": "required",
      "prerequisiteIds": [
        "authorization-core-v1.authorization-decision",
        "authorization-core-v1.entry-control"
      ]
    },
    {
      "id": "authorization-core-v1.entry-control",
      "kind": "entry-control",
      "obligationIds": [
        "deny-nonadmin-issue-lock"
      ],
      "question": "Which source-visible condition or control gates the declared entry before the assessed path proceeds?",
      "applicability": "required",
      "prerequisiteIds": []
    },
    {
      "id": "authorization-core-v1.external-assumption",
      "kind": "external-assumption",
      "obligationIds": [
        "deny-nonadmin-issue-lock"
      ],
      "question": "Which source-external fact, if any, can change the answer, and is that fact supplied or still unknown in this fixed context?",
      "applicability": "when-present",
      "prerequisiteIds": [
        "authorization-core-v1.effect-reachability"
      ]
    },
    {
      "id": "authorization-core-v1.identity-binding",
      "kind": "identity-binding",
      "obligationIds": [
        "deny-nonadmin-issue-lock"
      ],
      "question": "How is the declared principal bound to the runtime caller or identity used by the assessed operation?",
      "applicability": "required",
      "prerequisiteIds": []
    },
    {
      "id": "authorization-core-v1.resource-binding",
      "kind": "resource-binding",
      "obligationIds": [
        "deny-nonadmin-issue-lock"
      ],
      "question": "How is the request-selected object bound to the declared resource, and which other checked resource must remain distinct?",
      "applicability": "required",
      "prerequisiteIds": []
    }
  ],
  "entries": [
    {
      "requirementId": "authorization-core-v1.authorization-decision",
      "obligationId": "deny-nonadmin-issue-lock::put-issue-lock",
      "kind": "authorization-decision",
      "question": "What is the strongest source-visible authorization decision for this principal, resource relation, operation, and condition set, including any role or ownership branch?",
      "applicability": "required",
      "prerequisiteIds": [
        "authorization-core-v1.identity-binding",
        "authorization-core-v1.resource-binding"
      ],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.effect-reachability",
      "obligationId": "deny-nonadmin-issue-lock::put-issue-lock",
      "kind": "effect-reachability",
      "question": "After the visible controls, can the requested operation reach the declared protected effect, and under which source-visible branch?",
      "applicability": "required",
      "prerequisiteIds": [
        "authorization-core-v1.authorization-decision",
        "authorization-core-v1.entry-control"
      ],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.entry-control",
      "obligationId": "deny-nonadmin-issue-lock::put-issue-lock",
      "kind": "entry-control",
      "question": "Which source-visible condition or control gates the declared entry before the assessed path proceeds?",
      "applicability": "required",
      "prerequisiteIds": [],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.external-assumption",
      "obligationId": "deny-nonadmin-issue-lock::put-issue-lock",
      "kind": "external-assumption",
      "question": "Which source-external fact, if any, can change the answer, and is that fact supplied or still unknown in this fixed context?",
      "applicability": "when-present",
      "prerequisiteIds": [
        "authorization-core-v1.effect-reachability"
      ],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.identity-binding",
      "obligationId": "deny-nonadmin-issue-lock::put-issue-lock",
      "kind": "identity-binding",
      "question": "How is the declared principal bound to the runtime caller or identity used by the assessed operation?",
      "applicability": "required",
      "prerequisiteIds": [],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.resource-binding",
      "obligationId": "deny-nonadmin-issue-lock::put-issue-lock",
      "kind": "resource-binding",
      "question": "How is the request-selected object bound to the declared resource, and which other checked resource must remain distinct?",
      "applicability": "required",
      "prerequisiteIds": [],
      "status": "pending"
    }
  ]
}

## Condition analysis request
{
  "status": "ready",
  "entries": [
    {
      "authorObligationId": "deny-nonadmin-issue-lock",
      "obligationId": "deny-nonadmin-issue-lock::put-issue-lock",
      "conditions": [
        {
          "id": "requester-has-repository-issue-write",
          "name": "requester-has-repository-issue-write",
          "basis": "True in the bounded scenario, isolating the stronger route-level administrator gate."
        },
        {
          "id": "requester-is-repository-admin",
          "name": "requester-is-repository-admin",
          "basis": "False in the bounded scenario."
        },
        {
          "id": "requester-is-site-admin",
          "name": "requester-is-site-admin",
          "basis": "False in the bounded scenario."
        }
      ],
      "maxBranches": 6
    }
  ]
}

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
Return exactly one coverage item for every analysis-ledger pair below. Use the exact requirementId and expanded obligationId. Status must be addressed, unknown, or not-applicable. Every item needs a substantive explanation. addressed and not-applicable require one or more factPointers to fact objects in this same answer, using /results/<index>/facts/<group>/<index>. unknown must explain what prevents an answer. not-applicable is allowed only for when-present questions and must explain from source-backed facts why the branch is absent.
Exact analysis coverage pairs (closed list):
- authorization-core-v1.authorization-decision @ deny-nonadmin-issue-lock::put-issue-lock (required)
- authorization-core-v1.effect-reachability @ deny-nonadmin-issue-lock::put-issue-lock (required)
- authorization-core-v1.entry-control @ deny-nonadmin-issue-lock::put-issue-lock (required)
- authorization-core-v1.external-assumption @ deny-nonadmin-issue-lock::put-issue-lock (when-present)
- authorization-core-v1.identity-binding @ deny-nonadmin-issue-lock::put-issue-lock (required)
- authorization-core-v1.resource-binding @ deny-nonadmin-issue-lock::put-issue-lock (required)
Return one conditionAnalysis entry for every expanded obligation in the condition plan. Use authorization-condition-analysis-result/v1 and the exact condition IDs. Each branch needs a unique id, explicit assumptions, one reachable/blocked/unknown effect, a causal explanation, same-obligation factPointers for reachable or blocked effects, and decisive missingFacts for an unknown effect or unknown-valued assumption. Analysis assumptions are hypotheses for comparing branches; never present them as source-observed or deployment-observed facts. Every requested condition must appear in at least one branch assumption or exactly once in unexaminedConditionIds. Use completeness bounded only when none are unexamined; otherwise use incomplete and explain limitations. bounded means all requested conditions were considered within the authored branch limit, not that every truth assignment or program path was enumerated.
Exact condition analysis obligations and bounds (closed list):
- deny-nonadmin-issue-lock::put-issue-lock; maxBranches=6
  - requester-has-repository-issue-write: requester-has-repository-issue-write — True in the bounded scenario, isolating the stronger route-level administrator gate.
  - requester-is-repository-admin: requester-is-repository-admin — False in the bounded scenario.
  - requester-is-site-admin: requester-is-site-admin — False in the bounded scenario.

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
