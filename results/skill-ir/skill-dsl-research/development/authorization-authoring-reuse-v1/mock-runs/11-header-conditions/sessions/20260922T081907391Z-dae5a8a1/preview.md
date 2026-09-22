<!-- analysis-profile: task-supplied; origin: input; study-arm: none; condition-analysis: enabled -->

# Organized authorization assessment instruction (B)

Analyze each runnable obligation in the canonical declaration. Follow the declared required analysis, constraints, policy authority, and scope assurance. Explain the source-visible decision without assuming repository discovery or deployment facts. Address every supplied analysis question and report its coverage without inventing an answer.

## Canonical declaration
{
  "schemaVersion": "source-authorization-assessment/v0",
  "taskId": "owui-trusted-header-deployment",
  "request": "Determine whether an unauthenticated external client can impersonate an arbitrary existing user in the actual deployment by sending a trusted-email header to POST /signin.",
  "repository": "https://github.com/open-webui/open-webui",
  "sourceRef": "841c9045d789005145274955e7ef60b1b11a9be9",
  "sourceMode": "fixed-context",
  "policySources": [
    {
      "id": "trusted-proxy-identity-policy",
      "kind": "study-author-policy-from-pinned-project-guidance",
      "text": "Trusted-header authentication is safe only when a trusted reverse proxy is the sole reachable ingress, removes any client-supplied identity header, and injects the authenticated identity itself.",
      "location": "inputs/owui-trusted-header-deployment/task.json#/sourceOfRequirement",
      "revision": "open-webui-docs@d9f637d050e1689e6a4103eafc2b8005a74c9366",
      "acceptance": {
        "status": "accepted",
        "actorRole": "study-task-author",
        "reason": "The task input attributes this bounded paraphrase to pinned project hardening guidance; no source-external deployment fact is accepted."
      }
    }
  ],
  "principals": [
    {
      "id": "unauthenticated-external-client",
      "role": "unauthenticated external client",
      "description": "A client not authenticated by the trusted identity proxy that may control headers on any ingress it can actually reach.",
      "startingCapabilities": [
        "can-send-client-controlled-request-headers-to-a-reachable-ingress"
      ]
    }
  ],
  "resources": [
    {
      "id": "existing-user-session",
      "type": "authenticated-user-identity-and-session",
      "description": "The identity and session of an arbitrary existing user named by a trusted-email header."
    }
  ],
  "entries": [
    {
      "id": "post-signin-trusted-email",
      "name": "POST /signin -> trusted-email-header branch",
      "locations": [
        {
          "path": "inputs/owui-trusted-header-deployment/env_trusted_headers.py",
          "startLine": 1,
          "endLine": 13
        },
        {
          "path": "inputs/owui-trusted-header-deployment/auths_signin.py",
          "startLine": 1,
          "endLine": 62
        }
      ]
    }
  ],
  "obligations": [
    {
      "id": "external-client-trusted-header-impersonation",
      "principalId": "unauthenticated-external-client",
      "resourceId": "existing-user-session",
      "relation": "external-client-to-arbitrary-existing-user-identity",
      "operation": "obtain-session-as-header-selected-user",
      "expectation": "deny",
      "conditions": [
        {
          "name": "password-auth-signin-entry-enabled",
          "basis": "auths_signin.py checks ENABLE_PASSWORD_AUTH before entering the trusted-header branch."
        },
        {
          "name": "trusted-email-header-name-configured",
          "basis": "env_trusted_headers.py makes the header name environment-controlled and auths_signin.py enters the branch only when configured."
        },
        {
          "name": "email-authentication-produces-user",
          "basis": "auths_signin.py returns a session only after authenticate_user_by_email yields a user."
        },
        {
          "name": "deployment-ingress-enforces-header-trust",
          "basis": "The accepted policy requires sole trusted-proxy ingress and removal/replacement of client-supplied identity headers; actual deployment facts are not supplied."
        }
      ],
      "policySourceId": "trusted-proxy-identity-policy",
      "entryIds": [
        "post-signin-trusted-email"
      ]
    }
  ],
  "scopeAssurance": "The allowed source crops expose the feature configuration and conditional identity-to-session path. They do not contain the actual ENABLE_PASSWORD_AUTH value, trusted-header value, ingress reachability, proxy stripping/replacement, or authentication outcome for a real deployment.",
  "requiredAnalysis": [
    "identify the configuration condition and how the header becomes a principal identity",
    "separate application-source capability from actual deployment reachability and proxy behavior",
    "name the minimum missing facts needed to decide the real deployment question",
    "return source_supported_failure, source_refuted, or unknown with exact input locations"
  ],
  "constraints": [
    "Use only the allowed case inputs.",
    "Do not infer environment values, proxy configuration, network topology, or direct reachability.",
    "Do not contact or execute the target deployment."
  ],
  "allowedConclusions": [
    "source_supported_failure",
    "source_refuted",
    "unknown"
  ],
  "discoveryStatus": "not-tested"
}

## Public analysis questions
- Which source-visible gates must be traversed before the trusted-email path can process the request?
- How, if at all, does a request value become the identity used by this entry?
- How is the selected identity bound to the existing-user session resource named by the obligation?
- What source-visible application and accepted-policy controls decide whether this principal may obtain the selected user's session?
- Under which source-visible branch can processing reach the protected session effect?
- Which actual configuration, ingress, proxy, or authentication fact can change the deployment answer, and is it present in this fixed context?
- If an optional provisioning branch is present, how does it affect identity binding before authentication?
- Compare bounded outcomes for external-client-trusted-header-impersonation::post-signin-trusted-email using at most 6 branches. Consider deployment-ingress-enforces-header-trust (The accepted policy requires sole trusted-proxy ingress and removal/replacement of client-supplied identity headers; actual deployment facts are not supplied.); email-authentication-produces-user (auths_signin.py returns a session only after authenticate_user_by_email yields a user.); password-auth-signin-entry-enabled (auths_signin.py checks ENABLE_PASSWORD_AUTH before entering the trusted-header branch.); trusted-email-header-name-configured (env_trusted_headers.py makes the header name environment-controlled and auths_signin.py enters the branch only when configured.). Explain reachable, blocked or unknown effects and decisive missing facts; assumptions are hypotheses, not observed deployment facts. State any unexamined conditions; this is not exhaustive path enumeration.

## Analysis requirement ledger
{
  "status": "ready",
  "requirements": [
    {
      "id": "header.authorization-decision",
      "kind": "authorization-decision",
      "obligationIds": [
        "external-client-trusted-header-impersonation"
      ],
      "question": "What source-visible application and accepted-policy controls decide whether this principal may obtain the selected user's session?",
      "applicability": "required",
      "prerequisiteIds": [
        "header.identity-binding",
        "header.session-resource"
      ]
    },
    {
      "id": "header.deployment-assumptions",
      "kind": "external-assumption",
      "obligationIds": [
        "external-client-trusted-header-impersonation"
      ],
      "question": "Which actual configuration, ingress, proxy, or authentication fact can change the deployment answer, and is it present in this fixed context?",
      "applicability": "required",
      "prerequisiteIds": [
        "header.session-effect"
      ]
    },
    {
      "id": "header.entry-control",
      "kind": "entry-control",
      "obligationIds": [
        "external-client-trusted-header-impersonation"
      ],
      "question": "Which source-visible gates must be traversed before the trusted-email path can process the request?",
      "applicability": "required",
      "prerequisiteIds": []
    },
    {
      "id": "header.identity-binding",
      "kind": "identity-binding",
      "obligationIds": [
        "external-client-trusted-header-impersonation"
      ],
      "question": "How, if at all, does a request value become the identity used by this entry?",
      "applicability": "required",
      "prerequisiteIds": []
    },
    {
      "id": "header.optional-provisioning",
      "kind": "identity-binding",
      "obligationIds": [
        "external-client-trusted-header-impersonation"
      ],
      "question": "If an optional provisioning branch is present, how does it affect identity binding before authentication?",
      "applicability": "when-present",
      "prerequisiteIds": [
        "header.identity-binding"
      ]
    },
    {
      "id": "header.session-effect",
      "kind": "effect-reachability",
      "obligationIds": [
        "external-client-trusted-header-impersonation"
      ],
      "question": "Under which source-visible branch can processing reach the protected session effect?",
      "applicability": "required",
      "prerequisiteIds": [
        "header.authorization-decision",
        "header.entry-control"
      ]
    },
    {
      "id": "header.session-resource",
      "kind": "resource-binding",
      "obligationIds": [
        "external-client-trusted-header-impersonation"
      ],
      "question": "How is the selected identity bound to the existing-user session resource named by the obligation?",
      "applicability": "required",
      "prerequisiteIds": [
        "header.identity-binding"
      ]
    }
  ],
  "entries": [
    {
      "requirementId": "header.authorization-decision",
      "obligationId": "external-client-trusted-header-impersonation::post-signin-trusted-email",
      "kind": "authorization-decision",
      "question": "What source-visible application and accepted-policy controls decide whether this principal may obtain the selected user's session?",
      "applicability": "required",
      "prerequisiteIds": [
        "header.identity-binding",
        "header.session-resource"
      ],
      "status": "pending"
    },
    {
      "requirementId": "header.deployment-assumptions",
      "obligationId": "external-client-trusted-header-impersonation::post-signin-trusted-email",
      "kind": "external-assumption",
      "question": "Which actual configuration, ingress, proxy, or authentication fact can change the deployment answer, and is it present in this fixed context?",
      "applicability": "required",
      "prerequisiteIds": [
        "header.session-effect"
      ],
      "status": "pending"
    },
    {
      "requirementId": "header.entry-control",
      "obligationId": "external-client-trusted-header-impersonation::post-signin-trusted-email",
      "kind": "entry-control",
      "question": "Which source-visible gates must be traversed before the trusted-email path can process the request?",
      "applicability": "required",
      "prerequisiteIds": [],
      "status": "pending"
    },
    {
      "requirementId": "header.identity-binding",
      "obligationId": "external-client-trusted-header-impersonation::post-signin-trusted-email",
      "kind": "identity-binding",
      "question": "How, if at all, does a request value become the identity used by this entry?",
      "applicability": "required",
      "prerequisiteIds": [],
      "status": "pending"
    },
    {
      "requirementId": "header.optional-provisioning",
      "obligationId": "external-client-trusted-header-impersonation::post-signin-trusted-email",
      "kind": "identity-binding",
      "question": "If an optional provisioning branch is present, how does it affect identity binding before authentication?",
      "applicability": "when-present",
      "prerequisiteIds": [
        "header.identity-binding"
      ],
      "status": "pending"
    },
    {
      "requirementId": "header.session-effect",
      "obligationId": "external-client-trusted-header-impersonation::post-signin-trusted-email",
      "kind": "effect-reachability",
      "question": "Under which source-visible branch can processing reach the protected session effect?",
      "applicability": "required",
      "prerequisiteIds": [
        "header.authorization-decision",
        "header.entry-control"
      ],
      "status": "pending"
    },
    {
      "requirementId": "header.session-resource",
      "obligationId": "external-client-trusted-header-impersonation::post-signin-trusted-email",
      "kind": "resource-binding",
      "question": "How is the selected identity bound to the existing-user session resource named by the obligation?",
      "applicability": "required",
      "prerequisiteIds": [
        "header.identity-binding"
      ],
      "status": "pending"
    }
  ]
}

## Condition analysis request
{
  "status": "ready",
  "entries": [
    {
      "authorObligationId": "external-client-trusted-header-impersonation",
      "obligationId": "external-client-trusted-header-impersonation::post-signin-trusted-email",
      "conditions": [
        {
          "id": "deployment-ingress-trusted",
          "name": "deployment-ingress-enforces-header-trust",
          "basis": "The accepted policy requires sole trusted-proxy ingress and removal/replacement of client-supplied identity headers; actual deployment facts are not supplied."
        },
        {
          "id": "email-auth-produces-user",
          "name": "email-authentication-produces-user",
          "basis": "auths_signin.py returns a session only after authenticate_user_by_email yields a user."
        },
        {
          "id": "password-auth-entry-enabled",
          "name": "password-auth-signin-entry-enabled",
          "basis": "auths_signin.py checks ENABLE_PASSWORD_AUTH before entering the trusted-header branch."
        },
        {
          "id": "trusted-header-configured",
          "name": "trusted-email-header-name-configured",
          "basis": "env_trusted_headers.py makes the header name environment-controlled and auths_signin.py enters the branch only when configured."
        }
      ],
      "maxBranches": 6
    }
  ]
}

## Result contract
Use compact wire/v4: top-level results only. Each item has obligationId, conclusion, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation, with one of: source_supported_failure, source_refuted, unknown.
Interpret conclusion labels relative to the declared policy expectation, not as direct synonyms for allow or deny:
- source_supported_failure: the fixed source supports that the declared policy expectation fails under the stated conditions.
- source_refuted: the fixed source supports that the declared policy expectation is enforced under the stated conditions, refuting a policy failure.
- unknown: the fixed source and declared context are insufficient to decide whether the expectation fails or is enforced.
Exact runnable obligation IDs (closed list):
- external-client-trusted-header-impersonation::post-signin-trusted-email
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
In each result item, return exactly one coverage item for every analysis-ledger pair below. Use the exact requirementId; the enclosing result supplies obligationId. Status must be addressed, unknown, or not-applicable. Every item needs a substantive explanation. addressed and not-applicable require one or more factIds to fact objects in this same answer, using IDs from this item's facts array. unknown must explain what prevents an answer. not-applicable is allowed only for when-present questions and must explain from source-backed facts why the branch is absent.
Exact analysis coverage pairs (closed list):
- header.authorization-decision @ external-client-trusted-header-impersonation::post-signin-trusted-email (required)
- header.deployment-assumptions @ external-client-trusted-header-impersonation::post-signin-trusted-email (required)
- header.entry-control @ external-client-trusted-header-impersonation::post-signin-trusted-email (required)
- header.identity-binding @ external-client-trusted-header-impersonation::post-signin-trusted-email (required)
- header.optional-provisioning @ external-client-trusted-header-impersonation::post-signin-trusted-email (when-present)
- header.session-effect @ external-client-trusted-header-impersonation::post-signin-trusted-email (required)
- header.session-resource @ external-client-trusted-header-impersonation::post-signin-trusted-email (required)
Return one item-local condition object for every expanded obligation in the condition plan. Do not output schemaVersion or analyses wrappers. Use the exact condition IDs. Each branch needs a unique id, explicit assumptions, one reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for reachable or blocked effects, and decisive missingFacts for an unknown effect or unknown-valued assumption. Analysis assumptions are hypotheses for comparing branches; never present them as source-observed or deployment-observed facts. Every requested condition must appear in at least one branch assumption or exactly once in unexaminedConditionIds. Use completeness bounded only when none are unexamined; otherwise use incomplete and explain limitations. bounded means all requested conditions were considered within the authored branch limit, not that every truth assignment or program path was enumerated.
Exact condition analysis obligations and bounds (closed list):
- external-client-trusted-header-impersonation::post-signin-trusted-email; maxBranches=6
  - deployment-ingress-trusted: deployment-ingress-enforces-header-trust — The accepted policy requires sole trusted-proxy ingress and removal/replacement of client-supplied identity headers; actual deployment facts are not supplied.
  - email-auth-produces-user: email-authentication-produces-user — auths_signin.py returns a session only after authenticate_user_by_email yields a user.
  - password-auth-entry-enabled: password-auth-signin-entry-enabled — auths_signin.py checks ENABLE_PASSWORD_AUTH before entering the trusted-header branch.
  - trusted-header-configured: trusted-email-header-name-configured — env_trusted_headers.py makes the header name environment-controlled and auths_signin.py enters the branch only when configured.

## Fixed source context
===== BEGIN ALLOWED INPUT: inputs/owui-trusted-header-deployment/auths_signin.py =====
Source ID: src-8d5759765262cf30
Location note: crop lines 1-62; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | # Cropped from backend/open_webui/routers/auths.py at
2 | # https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
3 | # Original lines 570-623 and 672-675.
4 | @router.post('/signin', response_model=SessionUserResponse)
5 | async def signin(
6 |     request: Request,
7 |     response: Response,
8 |     form_data: SigninForm,
9 |     db: AsyncSession = Depends(get_async_session),
10 | ):
11 |     if not ENABLE_PASSWORD_AUTH:
12 |         raise HTTPException(
13 |             status_code=status.HTTP_403_FORBIDDEN,
14 |             detail=ERROR_MESSAGES.ACTION_PROHIBITED,
15 |         )
16 | 
17 |     if WEBUI_AUTH_TRUSTED_EMAIL_HEADER:
18 |         if WEBUI_AUTH_TRUSTED_EMAIL_HEADER not in request.headers:
19 |             raise HTTPException(400, detail=ERROR_MESSAGES.INVALID_TRUSTED_HEADER)
20 | 
21 |         email = request.headers[WEBUI_AUTH_TRUSTED_EMAIL_HEADER].lower()
22 |         name = email
23 | 
24 |         if WEBUI_AUTH_TRUSTED_NAME_HEADER:
25 |             name = request.headers.get(WEBUI_AUTH_TRUSTED_NAME_HEADER, email)
26 |             try:
27 |                 name = urllib.parse.unquote(name, encoding='utf-8')
28 |             except Exception as e:
29 |                 pass
30 | 
31 |         if not await Users.get_user_by_email(email.lower(), db=db):
32 |             await signup_handler(
33 |                 request,
34 |                 email,
35 |                 str(uuid.uuid4()),
36 |                 name,
37 |                 db=db,
38 |             )
39 | 
40 |         user = await Auths.authenticate_user_by_email(email, db=db)
41 |         if user:
42 |             if WEBUI_AUTH_TRUSTED_GROUPS_HEADER:
43 |                 group_names = request.headers.get(WEBUI_AUTH_TRUSTED_GROUPS_HEADER, '').split(',')
44 |                 group_names = [name.strip() for name in group_names if name.strip()]
45 | 
46 |                 if group_names:
47 |                     await Groups.sync_groups_by_group_names(user.id, group_names, db=db)
48 | 
49 |             if WEBUI_AUTH_TRUSTED_ROLE_HEADER:
50 |                 trusted_role = request.headers.get(WEBUI_AUTH_TRUSTED_ROLE_HEADER, '').lower().strip()
51 |                 if trusted_role in {'admin', 'user', 'pending'}:
52 |                     if user.role != trusted_role:
53 |                         await Users.update_user_role_by_id(user.id, trusted_role, db=db)
54 |                 elif trusted_role:
55 |                     log.warning(f'Ignoring invalid trusted role header value: {trusted_role}')
56 | 
57 | # Original lines 623-671 handle other sign-in modes and are omitted.
58 | 
59 |     if user:
60 |         return await create_session_response(request, user, db, response, set_cookie=True)
61 |     else:
62 |         raise HTTPException(400, detail=ERROR_MESSAGES.INVALID_CRED)
===== END ALLOWED INPUT: inputs/owui-trusted-header-deployment/auths_signin.py =====

===== BEGIN ALLOWED INPUT: inputs/owui-trusted-header-deployment/env_trusted_headers.py =====
Source ID: src-5f54873929978798
Location note: crop lines 1-13; original locations: not separately supplied
Citation contract: select one source ID and a closed crop-line range shown below; ranges cannot cross sources.
1 | # Cropped from backend/open_webui/env.py at
2 | # https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
3 | # Original lines 529-538.
4 | # Optional env vars for creating an admin account on startup
5 | # Useful for headless/automated deployments
6 | WEBUI_ADMIN_EMAIL = os.environ.get('WEBUI_ADMIN_EMAIL', '')
7 | WEBUI_ADMIN_PASSWORD = os.environ.get('WEBUI_ADMIN_PASSWORD', '')
8 | WEBUI_ADMIN_NAME = os.environ.get('WEBUI_ADMIN_NAME', 'Admin')
9 | 
10 | WEBUI_AUTH_TRUSTED_EMAIL_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_EMAIL_HEADER', None)
11 | WEBUI_AUTH_TRUSTED_NAME_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_NAME_HEADER', None)
12 | WEBUI_AUTH_TRUSTED_GROUPS_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_GROUPS_HEADER', None)
13 | WEBUI_AUTH_TRUSTED_ROLE_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_ROLE_HEADER', None)
===== END ALLOWED INPUT: inputs/owui-trusted-header-deployment/env_trusted_headers.py =====
