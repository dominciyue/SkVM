# Authorization inquiry usage

This folder contains a reusable, bounded authorization inquiry for `gitea-create-issue`.
It is configuration only: it does not contain an answer, an expected control graph, or
source-derived known values. `inquiry.json` preserves the supplied repository, revision,
policy, conformance mode, source root, and allowed paths.

## Portable commands

Run these commands from this portable folder with the `skvm` CLI available:

```text
skvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=semantic-flow-v1
skvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=semantic-flow-v1
skvm authorization inquiry inspect --out=runs
```

If the inquiry is edited, use the documented edit and comparison flow:

```text
skvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json
skvm authorization inquiry compare --input=changed.json --previous=runs --strategy=semantic-flow-v1
skvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-model-id> --method=D1 --strategy=semantic-flow-v1 --previous=runs
```

All paths are relative to this folder. Replace the model placeholder with the configured
model identifier. The `--previous` run must be a known completed, checked, or bounded run
for the same source and semantic-flow-v1 strategy; source changes require a fresh run.

## Current strategy

The declaration is intended for `authorization-inquiry/v1` in `conformance` mode using
`semantic-flow-v1`. The inquiry asks the reviewer or analysis system to:

- resolve the CreateIssue API entry point and route-level authentication;
- distinguish authenticated repository readers from principals with write permission to
'the repository's issues unit;
- follow effective permissions through repository, unit, organization, team, owner,
administrator, collaborator, and other relevant principal relationships;
- trace repository and issue-unit checks across route, middleware, model, and service
boundaries rather than assuming an endpoint-local check is sufficient;
- follow the request to the issue-creation effect and identify the final write sink;
- examine alternate routes, internal calls, configuration-dependent behavior, and
relevant exceptions; and
- report a per-principal conformance result together with precise source locations,
confidence or uncertainty, and source/deployment limits.

The independent policy remains authoritative for this inquiry: creating an issue requires
write permission to the repository's issues unit, and repository read permission alone
does not authorize the write. The policy text, origin, and location are preserved exactly
in `inquiry.json`.

## Remaining duties

The declaration is not itself a security review and must not be treated as one. A completed
run still needs human review of the evidence and conclusions. In particular, reviewers
must:

1. Confirm that the resolved route, callers, helper implementations, and final creation
   sink are the ones used by source revision
   `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`.
2. Check every cited line and follow relevant cross-file data flow within the declared
   `allowedPaths`.
3. Validate exceptions explicitly. The supplied policy states no administrator, owner,
   internal-caller, alternate-route, or service-identity exception; any such behavior
   must be surfaced as a distinction or possible non-conformance, not silently accepted.
4. Separate source-established behavior from deployment facts such as reverse proxies,
   authentication providers, plugins, feature flags, repository settings, database
   state, and unscanned routes or packages.
5. Treat unavailable, out-of-scope, or ambiguous evidence as a limitation or follow-up
   duty, never as proof of compliance.
6. Preserve the broader security-review responsibilities when the requested scope is
   expanded: dependency audit, secrets/exposure review, injection and data-flow review,
   authentication and access-control analysis, cryptography and business-logic review,
   self-verification of findings, severity/confidence assessment, and human-reviewed
   patches. Those broader duties are not silently performed by this focused inquiry.
7. Do not auto-apply patches. Any proposed fix must be reviewed by a human before use;
   nothing in this configuration changes source or deployment state.

This focused configuration intentionally performs no target execution, network access,
dependency installation, patch application, or whole-project audit.
