<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: C; condition-analysis: enabled -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
{
  "schemaVersion": "source-authorization-assessment/v0",
  "taskId": "gitea-collaborator-cross-user-permission",
  "request": "Determine whether an authenticated read collaborator who is neither a repository administrator nor a site administrator may query a different collaborator's repository permission through GET /repos/{owner}/{repo}/collaborators/{collaborator}/permission.",
  "repository": "https://github.com/go-gitea/gitea",
  "sourceRef": "fc28937a8d772fe9e4025c9b5f24d5db4d86610b",
  "sourceMode": "fixed-context",
  "policySources": [
    {
      "id": "collaborator-permission-query-policy",
      "kind": "study-task-author-policy-from-public-source",
      "text": "A caller may query a collaborator's repository permission only when the caller is a site administrator, is a repository administrator, or is querying their own username; otherwise the endpoint rejects the request before loading the target collaborator.",
      "location": "policy.json#/normativePolicy",
      "revision": "gitea@fc28937:routers/api/v1/repo/collaborators.go#L247-L301",
      "acceptance": {
        "status": "accepted",
        "actorRole": "study-task-author",
        "reason": "The fixed public source states this bounded endpoint policy and rejection branch explicitly."
      }
    }
  ],
  "principals": [
    {
      "id": "authenticated-read-collaborator",
      "role": "authenticated repository read collaborator",
      "description": "A repository collaborator with read access who is not the target collaborator, a repository administrator, or a site administrator.",
      "startingCapabilities": [
        "authenticated",
        "repository-read",
        "repository-collaborator"
      ]
    }
  ],
  "resources": [
    {
      "id": "other-collaborator-permission",
      "type": "repository collaborator permission",
      "description": "The permission record of a different existing collaborator in the same repository."
    }
  ],
  "entries": [
    {
      "id": "get-collaborator-permission",
      "name": "GET /repos/{owner}/{repo}/collaborators/{collaborator}/permission",
      "locations": [
        {
          "path": "collaborators.go",
          "startLine": 4,
          "endLine": 58
        }
      ]
    }
  ],
  "obligations": [
    {
      "id": "deny-cross-user-permission-query",
      "principalId": "authenticated-read-collaborator",
      "resourceId": "other-collaborator-permission",
      "relation": "different-collaborator-without-repository-or-site-admin-role",
      "operation": "read-collaborator-permission",
      "expectation": "deny",
      "conditions": [
        {
          "name": "requester-authenticated",
          "basis": "The bounded scenario fixes the requester as authenticated."
        },
        {
          "name": "requester-is-target-collaborator",
          "basis": "False in the bounded scenario: the requested username belongs to a different collaborator."
        },
        {
          "name": "requester-is-repository-admin",
          "basis": "False in the bounded scenario: the requester has read collaborator access only."
        },
        {
          "name": "requester-is-site-admin",
          "basis": "False in the bounded scenario."
        },
        {
          "name": "target-collaborator-exists",
          "basis": "The bounded scenario fixes an existing target collaborator so the authorization branch is decisive."
        }
      ],
      "policySourceId": "collaborator-permission-query-policy",
      "entryIds": [
        "get-collaborator-permission"
      ]
    }
  ],
  "scopeAssurance": "The fixed crop contains the declared GET entry, its self/repository-admin/site-admin decision, the HTTP 403 branch, target lookup, and permission response. No other Gitea endpoint or deployment is assessed.",
  "requiredAnalysis": [
    "Trace the declared principal, resource relation, authorization control, and protected effect through the supplied fixed source.",
    "State any decisive fact unavailable from the fixed source instead of inferring it, and explain how the declared conditions change reachability."
  ],
  "constraints": [
    "Use only policy.json and collaborators.go from the supplied fixed source context.",
    "Do not execute or modify Gitea and do not contact a deployment.",
    "Distinguish repository read access from repository administrator permission."
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
        "deny-cross-user-permission-query"
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
        "deny-cross-user-permission-query"
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
        "deny-cross-user-permission-query"
      ],
      "question": "Which source-visible condition or control gates the declared entry before the assessed path proceeds?",
      "applicability": "required",
      "prerequisiteIds": []
    },
    {
      "id": "authorization-core-v1.external-assumption",
      "kind": "external-assumption",
      "obligationIds": [
        "deny-cross-user-permission-query"
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
        "deny-cross-user-permission-query"
      ],
      "question": "How is the declared principal bound to the runtime caller or identity used by the assessed operation?",
      "applicability": "required",
      "prerequisiteIds": []
    },
    {
      "id": "authorization-core-v1.resource-binding",
      "kind": "resource-binding",
      "obligationIds": [
        "deny-cross-user-permission-query"
      ],
      "question": "How is the request-selected object bound to the declared resource, and which other checked resource must remain distinct?",
      "applicability": "required",
      "prerequisiteIds": []
    }
  ],
  "entries": [
    {
      "requirementId": "authorization-core-v1.authorization-decision",
      "obligationId": "deny-cross-user-permission-query::get-collaborator-permission",
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
      "obligationId": "deny-cross-user-permission-query::get-collaborator-permission",
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
      "obligationId": "deny-cross-user-permission-query::get-collaborator-permission",
      "kind": "entry-control",
      "question": "Which source-visible condition or control gates the declared entry before the assessed path proceeds?",
      "applicability": "required",
      "prerequisiteIds": [],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.external-assumption",
      "obligationId": "deny-cross-user-permission-query::get-collaborator-permission",
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
      "obligationId": "deny-cross-user-permission-query::get-collaborator-permission",
      "kind": "identity-binding",
      "question": "How is the declared principal bound to the runtime caller or identity used by the assessed operation?",
      "applicability": "required",
      "prerequisiteIds": [],
      "status": "pending"
    },
    {
      "requirementId": "authorization-core-v1.resource-binding",
      "obligationId": "deny-cross-user-permission-query::get-collaborator-permission",
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
      "authorObligationId": "deny-cross-user-permission-query",
      "obligationId": "deny-cross-user-permission-query::get-collaborator-permission",
      "conditions": [
        {
          "id": "requester-is-repository-admin",
          "name": "requester-is-repository-admin",
          "basis": "False in the bounded scenario: the requester has read collaborator access only."
        },
        {
          "id": "requester-is-site-admin",
          "name": "requester-is-site-admin",
          "basis": "False in the bounded scenario."
        },
        {
          "id": "requester-is-target-collaborator",
          "name": "requester-is-target-collaborator",
          "basis": "False in the bounded scenario: the requested username belongs to a different collaborator."
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
- deny-cross-user-permission-query::get-collaborator-permission
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Return exactly one coverage item for every analysis-ledger pair below. Use the exact requirementId and expanded obligationId. Status must be addressed, unknown, or not-applicable. Every item needs a substantive explanation. addressed and not-applicable require one or more factPointers to fact objects in this same answer, using /results/<index>/facts/<group>/<index>. unknown must explain what prevents an answer. not-applicable is allowed only for when-present questions and must explain from source-backed facts why the branch is absent.
Exact analysis coverage pairs (closed list):
- authorization-core-v1.authorization-decision @ deny-cross-user-permission-query::get-collaborator-permission (required)
- authorization-core-v1.effect-reachability @ deny-cross-user-permission-query::get-collaborator-permission (required)
- authorization-core-v1.entry-control @ deny-cross-user-permission-query::get-collaborator-permission (required)
- authorization-core-v1.external-assumption @ deny-cross-user-permission-query::get-collaborator-permission (when-present)
- authorization-core-v1.identity-binding @ deny-cross-user-permission-query::get-collaborator-permission (required)
- authorization-core-v1.resource-binding @ deny-cross-user-permission-query::get-collaborator-permission (required)
Return one conditionAnalysis entry for every expanded obligation in the condition plan. Use authorization-condition-analysis-result/v1 and the exact condition IDs. Each branch needs a unique id, explicit assumptions, one reachable/blocked/unknown effect, a causal explanation, same-obligation factPointers for reachable or blocked effects, and decisive missingFacts for an unknown effect or unknown-valued assumption. Analysis assumptions are hypotheses for comparing branches; never present them as source-observed or deployment-observed facts. Every requested condition must appear in at least one branch assumption or exactly once in unexaminedConditionIds. Use completeness bounded only when none are unexamined; otherwise use incomplete and explain limitations. bounded means all requested conditions were considered within the authored branch limit, not that every truth assignment or program path was enumerated.
Exact condition analysis obligations and bounds (closed list):
- deny-cross-user-permission-query::get-collaborator-permission; maxBranches=6
  - requester-is-repository-admin: requester-is-repository-admin — False in the bounded scenario: the requester has read collaborator access only.
  - requester-is-site-admin: requester-is-site-admin — False in the bounded scenario.
  - requester-is-target-collaborator: requester-is-target-collaborator — False in the bounded scenario: the requested username belongs to a different collaborator.

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
