# Assessment Instructions: `GetRepoPermissions`

## Scope and evidence boundary

Assess only the supplied crop from `collaborators.go`, lines 4–58, at fixed ref `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`. Do not infer behavior from other files, middleware, route registration, tests, database functions, or undocumented assumptions.

The analysis boundary for both scenarios is the handler entry point `GetRepoPermissions` at line 5, with the stated entry premises already in force. Trace only the observable control flow in the supplied crop, including:

- The collaborator username read at line 35.
- The authorization condition and forbidden response at lines 36–39.
- Target-user loading at lines 41–49.
- Permission lookup at lines 51–55.
- Successful response construction at lines 57–58.

Explicitly distinguish the accepted policy from the behavior observed in the supplied handler. The policy is authoritative and must not be rewritten to match the implementation.

## Accepted policy

A caller may query a collaborator’s repository permission when the caller is:

1. A site administrator;
2. A repository administrator; or
3. Querying their own username.

Otherwise, the request must be rejected with HTTP 403 before the target collaborator is loaded.

## Scenario 1: `nonadmin-other`

### Entry premise

At handler entry:

- The caller is authenticated and is a repository-read collaborator.
- The caller is neither a site administrator nor a repository administrator.
- The queried collaborator exists.
- The caller’s username and the queried collaborator’s username differ.

### Assessment task

Determine whether the current handler behavior conforms to the accepted policy for this scenario.

Your assessment must:

- State the policy outcome that should govern this scenario, separately from implementation observations.
- Cite the relevant source line(s) supporting the observed authorization decision.
- Verify whether target-user loading is prevented or permitted before the request terminates.
- Identify any discrepancy between the accepted policy and the observed handler behavior, if one exists.
- Do not rely on the target user’s existence to bypass or alter the authorization requirement.

### Requested-change task

If a change is required, describe the smallest behavior-level change needed to make this scenario conform to the accepted policy. Identify the relevant source location and preserve the requirement that unauthorized requests receive HTTP 403 before the target collaborator is loaded. Do not provide an implementation patch unless specifically required by the assessor’s format.

## Scenario 2: `repo-admin-other`

### Entry premise

At handler entry:

- The caller is authenticated and is a repository administrator.
- The queried collaborator exists.
- The caller’s username and the queried collaborator’s username differ.

### Assessment task

Determine whether the current handler behavior conforms to the accepted policy for this scenario.

Your assessment must:

- State the policy outcome that should govern this scenario, separately from implementation observations.
- Cite the relevant source line(s) supporting the observed authorization decision.
- Trace whether execution proceeds to target-user loading and permission lookup.
- Identify any discrepancy between the accepted policy and the observed handler behavior, if one exists.

### Requested-change task

If a change is required, describe the smallest behavior-level change needed to make this scenario conform to the accepted policy. Identify the relevant source location and preserve the policy distinction between repository administrators, site administrators, and callers querying their own username. Do not change the policy to accommodate the current implementation.

## Required response structure

For each scenario, provide:

1. Entry premise and analysis boundary.
2. Accepted-policy requirement.
3. Observed handler behavior with source-line citations.
4. Conformance assessment.
5. Requested change, only if needed.

Do not consult or mention another author’s draft or an answer key.
