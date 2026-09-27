# Assessment Instructions: `GetRepoPermissions`

## Scope and evidence boundary

Assess only the supplied crop from `collaborators.go`, lines 4–58, at fixed ref `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`. Do not infer behavior from other files, middleware, route registration, tests, database functions, or undocumented assumptions.

For both scenarios, the analysis boundary is the entry point `GetRepoPermissions` at line 5, with the stated entry premises already in force. Trace only the observable control flow in the supplied crop, including:

- The collaborator username read at line 35.
- The authorization condition and forbidden response at lines 36–39.
- Target-user loading and its error handling at lines 41–49.
- Permission lookup at lines 51–55.
- Successful response construction at lines 57–58.

Keep the accepted policy separate from the behavior observed in the handler. The accepted policy is authoritative and must not be rewritten to match the implementation.

## Accepted policy

A caller may query a collaborator’s repository permission when the caller is:

1. A site administrator;
2. A repository administrator; or
3. Querying their own username.

Otherwise, the request must be rejected with HTTP 403 before the target collaborator is loaded.

## Scenario 1: `nonadmin-other`

### Entry premise and principal/resource relation

At handler entry:

- The caller is authenticated and is a repository-read collaborator.
- The caller is neither a site administrator nor a repository administrator.
- The caller queries their own existing username.
- The caller and the queried collaborator are therefore the same principal by username.
- The queried collaborator exists.

### Assessment task

Determine whether the current handler behavior conforms to the accepted policy for this self-query scenario.

Your assessment must:

- State the outcome required by the accepted policy, separately from the implementation observations.
- Explain how the caller/queried-username relationship affects the policy analysis.
- Cite the relevant source location(s), especially the username comparison and authorization condition at lines 35–39.
- Determine whether execution is stopped with HTTP 403 or proceeds to target-user loading at lines 41–49.
- If execution proceeds, trace the subsequent permission lookup and response path at lines 51–58.
- Identify any discrepancy between the accepted policy and the observed handler behavior, if one exists.
- Do not use the collaborator’s existence to bypass or alter the authorization requirement; treat existence only according to the stated entry premise.

### Requested-change task

If a change is required, describe the smallest behavior-level change needed to make this self-query scenario conform to the accepted policy. Identify the relevant authorization location, preserve the HTTP 403 requirement for unauthorized requests, and preserve the requirement that any rejected request terminates before target-collaborator loading. Do not provide an implementation patch unless the assessor’s format specifically requires one.

## Scenario 2: `repo-admin-other`

### Entry premise and principal/resource relation

At handler entry:

- The caller is authenticated and is a repository administrator.
- The queried collaborator exists.
- The caller queries a different existing username.
- The caller and the queried collaborator are different principals by username.

### Assessment task

Determine whether the current handler behavior conforms to the accepted policy for this repository-administrator query.

Your assessment must:

- State the outcome required by the accepted policy, separately from the implementation observations.
- Explain how the caller/queried-username relationship affects the policy analysis.
- Cite the relevant source location(s), especially the authorization condition and response at lines 35–39.
- Trace whether execution proceeds to target-user loading at lines 41–49.
- If execution proceeds, trace permission lookup and successful response construction at lines 51–58.
- Identify any discrepancy between the accepted policy and the observed handler behavior, if one exists.

### Requested-change task

If a change is required, describe the smallest behavior-level change needed to make this scenario conform to the accepted policy. Identify the relevant source location and preserve the policy distinction among site administrators, repository administrators, and callers querying their own username. Do not change the accepted policy to accommodate the current implementation, and do not provide an implementation patch unless the assessor’s format specifically requires one.

## Required response structure

For each scenario, provide:

1. Entry premise and analysis boundary.
2. Principal/resource relationship.
3. Accepted-policy requirement.
4. Observed handler behavior with source-line citations.
5. Conformance assessment.
6. Requested change, only if needed.

Explicitly distinguish every policy conclusion from every observation about the supplied source crop. Do not consult or mention another author’s draft or an answer key.
