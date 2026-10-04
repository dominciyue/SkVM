# Authorization inquiry usage

This folder contains a reusable, bounded authorization inquiry for task `gitea-create-issue`.
It preserves the supplied repository, revision, source scope, conformance mode, and independent
policy. The source tree is copied under `source`; `sourceRoot` in `inquiry.json` is therefore
`source`.

## Portable commands

Run these commands from this folder with the `skvm` executable available on `PATH`:

```text
skvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=semantic-flow-v1
skvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=semantic-flow-v1
skvm authorization inquiry inspect --out=runs
```

For an explicitly reviewed edit, create an edit document and use:

```text
skvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json
skvm authorization inquiry compare --input=changed.json --previous=runs --strategy=semantic-flow-v1
skvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-model-id> --method=D1 --strategy=semantic-flow-v1 --previous=runs
```

All paths are relative to this portable folder. `--previous` is valid only for a known completed,
checked, or bounded run using the same source and strategy. Source changes require a fresh inquiry;
do not reuse a prior result merely because the question text is similar.

## Current strategy and inquiry intent

The configuration is intended for `semantic-flow-v1` and method `D1`. The questions require a
cross-file authorization trace rather than an endpoint-only inspection. A proper run should:

1. Resolve the CreateIssue route and route-level authentication or API context.
2. Distinguish an authenticated repository reader from a principal with issue-unit write
   permission.
3. Follow repository, organization, permission, unit, and shared-context checks across the
   allowed paths.
4. Establish how an enabled or disabled issues unit affects the decision.
5. Follow the successful path through conversion, service, model, and persistence calls to the
   issue-creation effect.
6. Check relevant exceptions and alternate paths, including deployment-dependent behavior, while
   distinguishing them from the direct CreateIssue route.
7. Compare the observed behavior with the independent policy exactly as supplied and state whether
   the result is compliant, stricter, broader, or indeterminate.
8. Report precise source and deployment limits, confidence, unresolved dependencies, and any
   assumptions instead of filling gaps with source-derived claims.

The inquiry preserves the applicable broader security-review responsibilities as context: reason
about authentication and authorization, trace data flow across files, self-verify apparent
findings, and separate genuine conclusions from uncertain observations. This configuration is a
focused authorization/conformance inquiry, not a general vulnerability scan. If a broader
security review is requested, its dependency, secrets, injection, cryptography, data-handling,
business-logic, and patch-review duties must be performed separately under the complete security
review skill and its references.

## Remaining duties and limits

No target code was executed, patched, network-fetched, installed, or analyzed while authoring
these files. The configuration contains questions and user premises, not answers, a control graph,
expected source behavior, or source-derived known values.

A future inquiry run must still inspect the permitted source at the supplied revision, resolve
reachable callers and shared helpers, and verify line-level evidence. It must not infer behavior
from the task wording or from the independent policy. It must also disclose anything outside the
allowed paths, including unreviewed route registrations, middleware, configuration, database state,
feature flags, deployment settings, plugins, generated code, and alternate issue-creation entry
points. Runtime identity-provider behavior, token claims, repository visibility, unit state, and
administrator or bot behavior may require deployment evidence not present in the copied source.

The independent policy is a user-supplied conformance oracle, not a source fact:

> Any authenticated repository reader may create an issue when the issues unit is enabled. Issue-unit write permission is not required by this policy.

Review any generated inquiry result for exact route and effect evidence, exception handling, and
source/deployment limits before relying on it. Nothing in this authoring step changes the source
or applies a patch.
