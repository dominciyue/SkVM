# Trusted identity header and actual deployment

For Open WebUI at ref 841c9045d789005145274955e7ef60b1b11a9be9, task owui-trusted-header-deployment, determine whether an unauthenticated external client can impersonate an arbitrary existing user in the actual deployment by sending a trusted-email header to POST /signin. The client can control headers on an ingress it can actually reach. The protected resource is the selected existing user's authenticated identity and session; the normative expectation is deny.

The accepted policy says trusted-header authentication is safe only when a trusted reverse proxy is the sole reachable ingress, removes client-supplied identity headers, and injects the authenticated identity itself. This is the study task author's accepted paraphrase of pinned project guidance, inputs/owui-trusted-header-deployment/task.json#/sourceOfRequirement, revision open-webui-docs@d9f637d050e1689e6a4103eafc2b8005a74c9366. No actual deployment fact has been accepted as part of this policy.

The supplied sources are inputs/owui-trusted-header-deployment/env_trusted_headers.py lines 1-13 and auths_signin.py lines 1-62. They expose feature configuration and the conditional identity-to-session path. Actual ENABLE_PASSWORD_AUTH, configured header value, reachable ingress, proxy stripping/replacement and authentication outcome are not supplied. Separate application capability from the actual deployment question.

Answer these same public questions in the explanation and cited facts:

1. Which source-visible gates must be traversed before the trusted-email path can process the request?
2. How, if at all, does a request value become the identity used by this entry?
3. How is the selected identity bound to the existing-user session resource named by the obligation?
4. What source-visible application and accepted-policy controls decide whether this principal may obtain the selected user's session?
5. Under which source-visible branch can processing reach the protected session effect?
6. Which actual configuration, ingress, proxy, or authentication fact can change the deployment answer, and is it present in this fixed context?
7. If an optional provisioning branch is present, how does it affect identity binding before authentication?

Consider at most six branches over these declared conditions: password-auth-signin-entry-enabled (ENABLE_PASSWORD_AUTH is checked before the trusted-header branch); trusted-email-header-name-configured (environment-controlled name selects the branch); email-authentication-produces-user (a session requires authenticate_user_by_email to yield a user); deployment-ingress-enforces-header-trust (the policy requires sole trusted-proxy ingress and header removal/replacement, whose actual state is not supplied). Explain reachable, blocked or unknown effects, name decisive missing facts and minimum observations, and state any unexamined conditions. Analysis assumptions are hypotheses and do not establish deployment observations or exhaustive path coverage.

Use only this fixed context and exact numbered source citations. Do not infer environment values, proxy configuration, network topology or direct reachability. Do not contact or execute the target. Use the appended result contract and exact obligation ID external-client-trusted-header-impersonation::post-signin-trusted-email.
