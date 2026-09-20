# Organized authorization assessment instruction (B)

Task ID: owui-trusted-header-deployment
Request: Determine whether an unauthenticated external client can impersonate an arbitrary existing user in the actual deployment by sending a trusted-email header to POST /signin.
Repository: https://github.com/open-webui/open-webui
Source ref: 841c9045d789005145274955e7ef60b1b11a9be9
Source mode: fixed-context

## Governing policy sources
- trusted-proxy-identity-policy (study-author-policy-from-pinned-project-guidance, accepted)
  Rule: Trusted-header authentication is safe only when a trusted reverse proxy is the sole reachable ingress, removes any client-supplied identity header, and injects the authenticated identity itself.
  Source: inputs/owui-trusted-header-deployment/task.json#/sourceOfRequirement @ open-webui-docs@d9f637d050e1689e6a4103eafc2b8005a74c9366
  Accepted/resolved by: study-task-author
  Reason: The task input attributes this bounded paraphrase to pinned project hardening guidance; no source-external deployment fact is accepted.

## Principals
- unauthenticated-external-client: unauthenticated external client
  Description: A client not authenticated by the trusted identity proxy that may control headers on any ingress it can actually reach.
  Starting capabilities: can-send-client-controlled-request-headers-to-a-reachable-ingress

## Resources
- existing-user-session (authenticated-user-identity-and-session): The identity and session of an arbitrary existing user named by a trusted-email header.

## Declared entries and allowed locations
- post-signin-trusted-email: POST /signin -> trusted-email-header branch
  Allowed source locations: inputs/owui-trusted-header-deployment/env_trusted_headers.py:1-13, inputs/owui-trusted-header-deployment/auths_signin.py:1-62

## Authorization questions
- external-client-trusted-header-impersonation
  Principal/resource: unauthenticated-external-client -> existing-user-session
  Relation/operation/expectation: external-client-to-arbitrary-existing-user-identity / obtain-session-as-header-selected-user / deny
  Conditions: password-auth-signin-entry-enabled: auths_signin.py checks ENABLE_PASSWORD_AUTH before entering the trusted-header branch.; trusted-email-header-name-configured: env_trusted_headers.py makes the header name environment-controlled and auths_signin.py enters the branch only when configured.; email-authentication-produces-user: auths_signin.py returns a session only after authenticate_user_by_email yields a user.; deployment-ingress-enforces-header-trust: The accepted policy requires sole trusted-proxy ingress and removal/replacement of client-supplied identity headers; actual deployment facts are not supplied.
  Policy: trusted-proxy-identity-policy
  Declared entries: post-signin-trusted-email

## Scope assurance
The allowed source crops expose the feature configuration and conditional identity-to-session path. They do not contain the actual ENABLE_PASSWORD_AUTH value, trusted-header value, ingress reachability, proxy stripping/replacement, or authentication outcome for a real deployment.

## Required analysis
- identify the configuration condition and how the header becomes a principal identity
- separate application-source capability from actual deployment reachability and proxy behavior
- name the minimum missing facts needed to decide the real deployment question
- return source_supported_failure, source_refuted, or unknown with exact input locations

## Constraints
- Use only the allowed case inputs.
- Do not infer environment values, proxy configuration, network topology, or direct reachability.
- Do not contact or execute the target deployment.

## Result contract
For every declared entry obligation, return exactly one of: source_supported_failure, source_refuted, unknown.
Support the conclusion with separately identified entry, principal/identity binding, resource binding, strongest visible authorization control, protected effect, and condition facts. Every fact must cite an allowed input path, line range, and retained quotation. For unknown, also name each decisive missing fact and the minimum observation that would decide it. Treat source discovery as not-tested: never turn completed declared obligations or a fixed source crop into a whole-repository or all-entry completeness claim.

## Fixed source context
===== BEGIN ALLOWED INPUT: inputs/owui-trusted-header-deployment/task.json =====
Location note: crop lines 1-20; original locations: not separately supplied
{
  "schemaVersion": "authorization-case-input/v1",
  "caseId": "owui-trusted-header-deployment",
  "repository": "https://github.com/open-webui/open-webui",
  "sourceRef": "841c9045d789005145274955e7ef60b1b11a9be9",
  "task": "Determine whether an unauthenticated external client can impersonate an arbitrary existing user in the actual deployment by sending a trusted-email header to POST /signin.",
  "normativeRequirement": "Trusted-header authentication is safe only when a trusted reverse proxy is the sole reachable ingress, removes any client-supplied identity header, and injects the authenticated identity itself.",
  "sourceOfRequirement": "Study-author policy, paraphrasing the project's pinned hardening guidance at open-webui/docs commit d9f637d050e1689e6a4103eafc2b8005a74c9366, docs/getting-started/advanced-topics/hardening.md lines 265-275. No documentation bytes are redistributed because that repository exposed no license file in this study.",
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
  ]
}

===== END ALLOWED INPUT: inputs/owui-trusted-header-deployment/task.json =====

===== BEGIN ALLOWED INPUT: inputs/owui-trusted-header-deployment/env_trusted_headers.py =====
Location note: crop lines 1-13; original locations: backend/open_webui/env.py:529-538
# Cropped from backend/open_webui/env.py at
# https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
# Original lines 529-538.
# Optional env vars for creating an admin account on startup
# Useful for headless/automated deployments
WEBUI_ADMIN_EMAIL = os.environ.get('WEBUI_ADMIN_EMAIL', '')
WEBUI_ADMIN_PASSWORD = os.environ.get('WEBUI_ADMIN_PASSWORD', '')
WEBUI_ADMIN_NAME = os.environ.get('WEBUI_ADMIN_NAME', 'Admin')

WEBUI_AUTH_TRUSTED_EMAIL_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_EMAIL_HEADER', None)
WEBUI_AUTH_TRUSTED_NAME_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_NAME_HEADER', None)
WEBUI_AUTH_TRUSTED_GROUPS_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_GROUPS_HEADER', None)
WEBUI_AUTH_TRUSTED_ROLE_HEADER = os.environ.get('WEBUI_AUTH_TRUSTED_ROLE_HEADER', None)

===== END ALLOWED INPUT: inputs/owui-trusted-header-deployment/env_trusted_headers.py =====

===== BEGIN ALLOWED INPUT: inputs/owui-trusted-header-deployment/auths_signin.py =====
Location note: crop lines 1-62; original locations: backend/open_webui/routers/auths.py:570-623,672-675
# Cropped from backend/open_webui/routers/auths.py at
# https://github.com/open-webui/open-webui/tree/841c9045d789005145274955e7ef60b1b11a9be9
# Original lines 570-623 and 672-675.
@router.post('/signin', response_model=SessionUserResponse)
async def signin(
    request: Request,
    response: Response,
    form_data: SigninForm,
    db: AsyncSession = Depends(get_async_session),
):
    if not ENABLE_PASSWORD_AUTH:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ERROR_MESSAGES.ACTION_PROHIBITED,
        )

    if WEBUI_AUTH_TRUSTED_EMAIL_HEADER:
        if WEBUI_AUTH_TRUSTED_EMAIL_HEADER not in request.headers:
            raise HTTPException(400, detail=ERROR_MESSAGES.INVALID_TRUSTED_HEADER)

        email = request.headers[WEBUI_AUTH_TRUSTED_EMAIL_HEADER].lower()
        name = email

        if WEBUI_AUTH_TRUSTED_NAME_HEADER:
            name = request.headers.get(WEBUI_AUTH_TRUSTED_NAME_HEADER, email)
            try:
                name = urllib.parse.unquote(name, encoding='utf-8')
            except Exception as e:
                pass

        if not await Users.get_user_by_email(email.lower(), db=db):
            await signup_handler(
                request,
                email,
                str(uuid.uuid4()),
                name,
                db=db,
            )

        user = await Auths.authenticate_user_by_email(email, db=db)
        if user:
            if WEBUI_AUTH_TRUSTED_GROUPS_HEADER:
                group_names = request.headers.get(WEBUI_AUTH_TRUSTED_GROUPS_HEADER, '').split(',')
                group_names = [name.strip() for name in group_names if name.strip()]

                if group_names:
                    await Groups.sync_groups_by_group_names(user.id, group_names, db=db)

            if WEBUI_AUTH_TRUSTED_ROLE_HEADER:
                trusted_role = request.headers.get(WEBUI_AUTH_TRUSTED_ROLE_HEADER, '').lower().strip()
                if trusted_role in {'admin', 'user', 'pending'}:
                    if user.role != trusted_role:
                        await Users.update_user_role_by_id(user.id, trusted_role, db=db)
                elif trusted_role:
                    log.warning(f'Ignoring invalid trusted role header value: {trusted_role}')

# Original lines 623-671 handle other sign-in modes and are omitted.

    if user:
        return await create_session_response(request, user, db, response, set_cookie=True)
    else:
        raise HTTPException(400, detail=ERROR_MESSAGES.INVALID_CRED)

===== END ALLOWED INPUT: inputs/owui-trusted-header-deployment/auths_signin.py =====
