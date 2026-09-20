# Authorization domain plan (D)

Use the canonical authorization facts and deterministic obligation expansion below. The declaration organizes the work; you still must understand the source control path and justify the conclusion.

## Canonical facts
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

## Compiled obligation plan
{
  "status": "ready",
  "expanded": [
    {
      "id": "external-client-trusted-header-impersonation::post-signin-trusted-email",
      "status": "runnable",
      "authorObligationId": "external-client-trusted-header-impersonation",
      "entryId": "post-signin-trusted-email"
    }
  ],
  "dependencies": {
    "repository": "https://github.com/open-webui/open-webui",
    "sourceRef": "841c9045d789005145274955e7ef60b1b11a9be9",
    "sourceMode": "fixed-context",
    "policies": [
      {
        "id": "trusted-proxy-identity-policy",
        "revision": "open-webui-docs@d9f637d050e1689e6a4103eafc2b8005a74c9366",
        "acceptanceStatus": "accepted"
      }
    ]
  },
  "diagnostics": []
}

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
