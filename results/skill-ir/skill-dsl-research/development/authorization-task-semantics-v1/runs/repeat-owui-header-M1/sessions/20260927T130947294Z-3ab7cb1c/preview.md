<!-- analysis-profile: authorization-core-v1; origin: derived; study-arm: none; condition-analysis: disabled; assessment: explicit-v1 -->

# Source-visible authorization assessment

Assess the authored task below using only the supplied fixed source and common result contract.

## Independent Markdown instructions
At `https://github.com/open-webui/open-webui` ref `841c9045d789005145274955e7ef60b1b11a9be9`, assess whether an unauthenticated external client can impersonate an arbitrary existing user by sending a trusted-email header to `POST /signin`. Apply the policy that trusted-header authentication is safe only when a trusted reverse proxy is the sole reachable ingress, removes client-supplied identity headers, and injects the authenticated identity. Identify the configuration condition, how the header becomes the principal identity, and the boundary between application-source capability and deployment reachability; state the minimum deployment facts required for assessment. Use only the allowed case inputs, cite exact input locations, do not infer environment, proxy, topology, or reachability facts, and do not contact, execute, or deploy against the target.


## Public analysis questions
Decide the current scenario at the stated boundary from the supplied fixed source and accepted policy. Treat listed premises as question assumptions at the named entry, not as source or deployment proof. Trace the decisive authorization control and protected effect with exact supplied-source locations. Answer every explicitly requested counterfactual branch separately, identifying its changed assumptions and any decisive unknown. Include only the response details requested below. Do not execute the target, infer missing deployment facts, or consult later versions.
Current question: Can an unauthenticated external client impersonate an arbitrary existing user in the actual deployment by sending a trusted-email header to POST /signin?
Analysis boundary: deployment.
Task premise: The caller is unauthenticated outside the trusted identity proxy and asks whether an actual reachable deployment permits impersonation via a client-supplied trusted-email header.
Requested counterfactual password-disabled: password-auth-signin-entry-enabled=false.
Requested counterfactual header-unconfigured: password-auth-signin-entry-enabled=true, trusted-email-header-name-configured=false.
Requested counterfactual authentication-no-user: password-auth-signin-entry-enabled=true, trusted-email-header-name-configured=true, email-authentication-produces-user=false.
Requested counterfactual trusted-ingress: password-auth-signin-entry-enabled=true, trusted-email-header-name-configured=true, deployment-ingress-enforces-header-trust=true.
Requested counterfactual client-header-reaches-app: password-auth-signin-entry-enabled=true, trusted-email-header-name-configured=true, email-authentication-produces-user=true, deployment-ingress-enforces-header-trust=false.
Required response detail: Identify the configuration and header-to-identity path, applicable denial/status behavior when source shows it, and the minimum missing facts for the actual deployment.

## Explicit assessment program
- Current question scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email at entry:post-signin-trusted-email; boundary: deployment.
  Accepted task premises at this entry (not source citations): premise-1: The caller is unauthenticated outside the trusted identity proxy and asks whether an actual reachable deployment permits impersonation via a client-supplied trusted-email header..
  Prove the decisive source path within the requested boundary; report a decisive missing binding only when that boundary requires it.
  Explicit counterfactual scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email::branch:authentication-no-user: condition:external-client-trusted-header-impersonation:email-authentication-produces-user=false, condition:external-client-trusted-header-impersonation:password-auth-signin-entry-enabled=true, condition:external-client-trusted-header-impersonation:trusted-email-header-name-configured=true. Answer separately from the current case.
  Explicit counterfactual scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email::branch:client-header-reaches-app: condition:external-client-trusted-header-impersonation:deployment-ingress-enforces-header-trust=false, condition:external-client-trusted-header-impersonation:email-authentication-produces-user=true, condition:external-client-trusted-header-impersonation:password-auth-signin-entry-enabled=true, condition:external-client-trusted-header-impersonation:trusted-email-header-name-configured=true. Answer separately from the current case.
  Explicit counterfactual scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email::branch:header-unconfigured: condition:external-client-trusted-header-impersonation:password-auth-signin-entry-enabled=true, condition:external-client-trusted-header-impersonation:trusted-email-header-name-configured=false. Answer separately from the current case.
  Explicit counterfactual scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email::branch:password-disabled: condition:external-client-trusted-header-impersonation:password-auth-signin-entry-enabled=false. Answer separately from the current case.
  Explicit counterfactual scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email::branch:trusted-ingress: condition:external-client-trusted-header-impersonation:deployment-ingress-enforces-header-trust=true, condition:external-client-trusted-header-impersonation:password-auth-signin-entry-enabled=true, condition:external-client-trusted-header-impersonation:trusted-email-header-name-configured=true. Answer separately from the current case.
  Required response details: Identify the configuration and header-to-identity path, applicable denial/status behavior when source shows it, and the minimum missing facts for the actual deployment..

## Result contract
Use compact wire/v6: top-level results only. Each item has obligationId, decision and branchResults, explanation, facts as an array of {id, kind, statement, citations}, decisiveMissingFacts and suggestedObservations. Fact IDs must be unique within each obligation. kind is entry/binding/control/effect/condition. The host fills all version/identity/scope metadata and groups facts; never output those fields. Include item-local coverage only when an analysis ledger is supplied, and item-local condition only when a condition request is supplied. Branches do not repeat obligationId.
Return exactly one result for every runnable expanded obligation. Do not output conclusion or policyStatus at the item level. For an authored allow/deny expectation, return decision {kind:"observed",observed:"allow"|"deny"|"unknown"} describing the source-visible behavior, independently of the normative expectation. The host compares that observed behavior with the authored expectation. For an authored conditional expectation, return decision {kind:"conditional-policy",policyStatus:"satisfied"|"violated"|"undetermined"}; the host uses this policy judgment without a binary observed comparison. Unknown requires decisiveMissingFacts and suggestedObservations. Do not infer observed behavior from the expectation or prose.
Every result includes branchResults, an empty array if no branch is requested. For each explicitly requested branch below, return its exact id and assumptions, a reachable/blocked/unknown effect, a causal explanation, same-obligation factIds for known effects, and decisive missingFacts for unknown effects. Counterfactual assumptions are hypotheses; they do not alter the current scenario or establish source/deployment facts. Extra or missing branches are invalid.
Exact requested branch IDs and assumptions (closed list):
- scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email: scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email::branch:authentication-no-user [{"conditionId":"condition:external-client-trusted-header-impersonation:email-authentication-produces-user","value":"false"},{"conditionId":"condition:external-client-trusted-header-impersonation:password-auth-signin-entry-enabled","value":"true"},{"conditionId":"condition:external-client-trusted-header-impersonation:trusted-email-header-name-configured","value":"true"}]
- scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email: scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email::branch:client-header-reaches-app [{"conditionId":"condition:external-client-trusted-header-impersonation:deployment-ingress-enforces-header-trust","value":"false"},{"conditionId":"condition:external-client-trusted-header-impersonation:email-authentication-produces-user","value":"true"},{"conditionId":"condition:external-client-trusted-header-impersonation:password-auth-signin-entry-enabled","value":"true"},{"conditionId":"condition:external-client-trusted-header-impersonation:trusted-email-header-name-configured","value":"true"}]
- scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email: scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email::branch:header-unconfigured [{"conditionId":"condition:external-client-trusted-header-impersonation:password-auth-signin-entry-enabled","value":"true"},{"conditionId":"condition:external-client-trusted-header-impersonation:trusted-email-header-name-configured","value":"false"}]
- scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email: scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email::branch:password-disabled [{"conditionId":"condition:external-client-trusted-header-impersonation:password-auth-signin-entry-enabled","value":"false"}]
- scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email: scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email::branch:trusted-ingress [{"conditionId":"condition:external-client-trusted-header-impersonation:deployment-ingress-enforces-header-trust","value":"true"},{"conditionId":"condition:external-client-trusted-header-impersonation:password-auth-signin-entry-enabled","value":"true"},{"conditionId":"condition:external-client-trusted-header-impersonation:trusted-email-header-name-configured","value":"true"}]
Exact runnable obligation IDs (closed list):
- scenario%3Aexternal-client-trusted-header-impersonation::entry%3Apost-signin-trusted-email
Use each exact expanded ID verbatim as obligationId. Do not substitute the authored obligation ID, omit an ID, or invent an additional ID.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite one sourceId and a closed startLine/endLine range from the numbered exact source catalog. Do not copy paths or quotations; the host binds both from the selected source range. A range cannot cross sources. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.
Address every public analysis question in the explanation and source-backed facts. No separate coverage ledger is required for this plain-method answer.

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
