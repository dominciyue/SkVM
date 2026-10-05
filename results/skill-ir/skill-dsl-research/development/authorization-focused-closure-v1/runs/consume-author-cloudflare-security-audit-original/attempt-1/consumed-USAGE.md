# Authorization inquiry usage

This folder contains a reusable, source-bounded authorization inquiry configuration for task `paperless-share-create`.

## Inputs and scope

- Configuration: `inquiry.json`
- Repository: `paperless-ngx/paperless-ngx`
- Source ref: `126ec414a8b65158368653a2604ae58415e43103`
- Source root: `source` (relative, as required)
- Allowed source paths are the exact paths listed in `inquiry.json`.
- Mode: `conformance`
- Policy: the caller must have `view_document` permission for the exact shared document; global `add_sharelink` permission and knowledge of a document ID are insufficient.

The inquiry deliberately contains questions and user premises only. It does not contain an answer, a completed control graph, expected source behavior, or source-derived known values.

## Portable commands

Run these commands from this portable folder with the `skvm` command available on `PATH`. All input and output paths are relative to this folder, and each option uses `--name=value` syntax.

Check the configuration without running an inquiry:

```text
skvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=focused-closure-v1
```

Run the inquiry with a configured model identifier and retain results under a local output directory:

```text
skvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=focused-closure-v1
```

Inspect the resulting runs:

```text
skvm authorization inquiry inspect --out=runs
```

To revise the request or premises mechanically, create an edit document using the published edit shape, then apply it without analysis:

```text
skvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json
```

For a policy revision, the edit must use an operation of kind `policy`; for a request revision use kind `request`; for premise revision use kind `premises`. Preserve user-origin premises and the policy's stated origin/location unless the policy owner intentionally changes them.

If a compatible completed, checked, or bounded run exists for the same source and strategy, compare a changed inquiry against it:

```text
skvm authorization inquiry compare --input=changed.json --previous=runs --strategy=focused-closure-v1
```

Run the changed inquiry only with the same model identifier and a fresh output directory when the prior run is known to be reusable:

```text
skvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-model-id> --method=D1 --strategy=focused-closure-v1 --previous=runs
```

Do not use a previous run merely because it exists. Source changes require a fresh inquiry; an unknown or incomplete prior run must not be resent as if it were completed.

## Current strategy: `focused-closure-v1`

This configuration is intended for the current focused-closure strategy. The questions form a closure around the requested authorization decision rather than a whole-repository audit:

1. locate the ShareLinkViewSet endpoint and inherited dispatch path;
2. resolve the exact document represented by the request;
3. establish the ordering of permission checks and share creation;
4. include inherited view-set, REST framework, permission, and serializer behavior;
5. distinguish global share-model permission from object-level document permission;
6. trace identifier, existence, lookup, and authorization failure boundaries;
7. check reachable alternate or inherited creation paths; and
8. produce a source-grounded conformance conclusion with explicit missing facts.

The strategy is focused, not exhaustive. It should inspect only the supplied source root and allowed paths, and it should not be treated as a complete security audit or as proof about deployment controls absent from source.

## Remaining duties

The eventual inquiry result must still:

- cite the concrete endpoint, HTTP method, action, source files, symbols, and relevant inherited paths;
- identify the lower-trust caller, exact document resource, share resource, operation, and final trusted decision point;
- show whether `view_document` is evaluated for the exact document before persistence;
- separately describe any global `add_sharelink` or equivalent check and avoid treating it as object authorization;
- distinguish document existence, identifier knowledge, queryset visibility, serializer validation, and authorization;
- state whether each reachable create path is compliant, noncompliant, or unresolved;
- report only source-supported behavior as established and list specific external facts needing validation, such as deployment-specific permission wiring or controls not represented in the allowed source;
- avoid executing target code, probing live services, assuming proxy or deployment behavior, or converting an unverified hypothesis into a confirmed finding; and
- preserve the supplied policy verbatim when assessing conformance.

This configuration authoring step did not execute the target, apply patches, install dependencies, use the network, or launch another model.
