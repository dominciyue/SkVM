# Authorization inquiry usage

This folder contains a reusable, source-bounded authorization inquiry for the Gitea `CreateIssue` path.

## What is configured

- **Task:** `gitea-create-issue`
- **Repository:** `go-gitea/gitea`
- **Revision:** `fc28937a8d772fe9e4025c9b5f24d5db4d86610b`
- **Source root:** `source`
- **Mode:** `conformance`
- **Policy:** Any authenticated repository reader may create an issue when the issues unit is enabled; issue-unit write permission is not required.
- **Strategy:** `focused-closure-v1`
- **Inquiry:** `inquiry.json`

The inquiry separates the caller classes, repository and issues-unit resources, route access, authorization decisions, and the final issue-creation effect. It also asks for source-supported exceptions and explicit source, configuration, deployment, and alternate-path limits.

## Portable commands

Run these commands from this portable folder. All paths are relative to this folder, and every option uses `--name=value` syntax.

### Validate the inquiry

```text
skvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=focused-closure-v1
```

### Run the focused inquiry

Use the model identifier configured for the environment:

```text
skvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=focused-closure-v1
```

### Inspect completed runs

```text
skvm authorization inquiry inspect --out=runs
```

### Prepare an edited inquiry

Create a separate edit document using the published edit shape, then apply it without analysis:

```text
skvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json
```

For a policy change, use an operation such as:

```text
{schemaVersion:"authorization-inquiry-edit/v1",reason:"<nonempty>",operations:[{kind:"policy",policy:{text:"<policy>",origin:"user",location:"<location>"}}]}
```

For a request or premise change, use the corresponding `request` or `premises` operation and the existing question ID. Editing never analyzes the source.

### Compare or rerun a changed inquiry

Comparison requires a known completed, checked, or bounded prior run using the same source and strategy:

```text
skvm authorization inquiry compare --input=changed.json --previous=runs --strategy=focused-closure-v1
skvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-model-id> --method=D1 --strategy=focused-closure-v1 --previous=runs
```

If the source changes, perform a fresh run rather than relying on a previous result.

## Current focused-closure-v1 strategy

The inquiry is intentionally focused rather than a whole-repository audit. A conforming analysis should:

1. Resolve the API route and its authentication, repository-loading, and permission middleware.
2. Trace authenticated repository-reader status separately from issue-unit write permission.
3. Locate the issues-unit enabled gate and any repository, organization, team, administrator, token, fork, or visibility branches that affect the path.
4. Follow `CreateIssue` into issue services, models, persistence, and response conversion to identify the actual creation effect.
5. Check alternate callers or routes within the declared allowed paths where they can alter the result.
6. Reconcile all observed controls with the independent policy, including the case where a reader lacks issue-unit write permission.
7. Report source-supported exceptions and distinguish them from deployment or configuration conditions that were not inspected.
8. State precise file/line evidence where available, confidence, and the limits imposed by `sourceRoot`, `allowedPaths`, and `sourceRef`.

The supplied source is copied under `source`. It may be inspected by the inquiry runner only as needed to answer these questions. No target execution, patch application, network access, dependency installation, or whole-project security audit is implied by this configuration.

## Remaining duties

This configuration is not an answer or a control graph. The eventual run must still establish the route-to-effect behavior from source and must not invent source-derived values. In particular, the operator or analyst must:

- review the generated result rather than treating it as authoritative;
- verify the exact revision and that the copied source matches it;
- distinguish confirmed source behavior from assumptions about deployment configuration, feature flags, authentication providers, reverse proxies, permissions caches, and database state;
- account for paths outside `allowedPaths` as unexamined unless their behavior is established through permitted evidence;
- inspect alternate API, web, internal, service, webhook, bot, administrator, installation, and integration paths separately when they are relevant but out of scope;
- verify whether middleware, global hooks, or deployment controls sit outside the focused source closure;
- manually validate line references and any claimed exception against the source before relying on the conclusion; and
- perform broader security-review responsibilities when a broader scope is requested, including dependency auditing, secrets and exposure scanning, vulnerability-category review, cross-file data-flow analysis, self-verification, and human review of any proposed patch.

No patches are authorized by this configuration. Any later patch proposal must be reviewed by a human before application, and nothing should be auto-applied.
