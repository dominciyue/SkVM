# Authorization inquiry usage

This folder contains a reusable, bounded authorization inquiry for the Gitea issue-creation policy:

- `inquiry.json` is the complete published declaration.
- `source/` is the supplied source tree and is the inquiry's `sourceRoot`.
- `task.json`, `format.schema.json`, `cli-usage.txt`, and the reference material are mechanical or skill resources and are preserved.

The inquiry is in `conformance` mode. It compares authenticated repository readers with principals that have write permission to the repository's issues unit, follows the route into the issue-creation effect, asks for relevant exceptions, and requires source/deployment limits to be stated. The independent policy is retained exactly as supplied.

## Portable commands

Run these commands from this portable folder with the authorization-inquiry CLI available on `PATH`. All paths are relative to this folder and options use `--name=value` form.

### Validate the declaration

```text
skvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=focused-closure-v1
```

### Run the bounded inquiry

Substitute the model identifier configured for the environment:

```text
skvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=focused-closure-v1
```

### Inspect completed runs

```text
skvm authorization inquiry inspect --out=runs
```

### Revise the inquiry without analyzing it

Create an edit declaration using the documented edit format, then apply it mechanically:

```text
skvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json
```

For an already checked or completed run with the same source and strategy, compare the changed declaration:

```text
skvm authorization inquiry compare --input=changed.json --previous=runs --strategy=focused-closure-v1
```

A source change requires a fresh run. For a fresh run after an accepted declaration change:

```text
skvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-model-id> --method=D1 --strategy=focused-closure-v1 --previous=runs
```

## Current strategy and scope

The current strategy is `focused-closure-v1`, with method `D1`. The declaration is intentionally focused on the CreateIssue API route and its authorization closure: route registration and middleware, caller identity, repository and issues-unit permission resolution, repository/unit state, issue creation services and models, relevant alternate paths or exceptions, and the final persistence effect. The questions require cross-file reasoning and a conformance judgment rather than an endpoint-only pattern check.

The source boundary is the supplied revision `fc28937a8d772fe9e4025c9b5f24d5db4d86610b` under `source/`, limited by the `allowedPaths` in `inquiry.json`. Results should cite precise source locations and distinguish source-established behavior from assumptions. The policy remains an independent user premise and must not be replaced by source-derived expectations.

## Remaining duties

This configuration does not itself answer the questions, execute target code, change source, or apply patches. Reviewers still must:

1. Read the inquiry result and verify every allow/deny conclusion against the cited source.
2. Confirm that the route trace reaches the actual issue creation effect and that no relevant alternate route or middleware was omitted from the allowed scope.
3. Check any reported exception carefully, including owner, administrator, organization/team, authentication, disabled-unit, repository-visibility, and issue/pull-request distinctions.
4. Treat unresolved or excluded behavior as unresolved; do not convert a bounded source result into a deployment-wide guarantee.
5. Separately validate runtime configuration, reverse proxies, authentication providers, plugins, generated code, database permissions/state, deployment topology, and version drift when those can affect authorization.
6. Preserve the policy distinction that repository read permission alone is insufficient and issue-unit write permission is required.
7. Obtain human approval before making any code or deployment change. No patch is implied or automatically applied by this inquiry.

The broader authorization-review responsibilities remain applicable whenever a broader scope is requested. In particular, a broader audit should revisit identity and trust boundaries, alternate entry points, inheritance, configuration, source exclusions, persistence effects, and deployment controls rather than treating this focused inquiry as a complete security or authorization audit.
