# Authorization inquiry usage

This folder contains a reusable, source-bounded authorization inquiry configuration for the `paperless-share-create` conformance task. The declaration preserves the supplied repository, source revision, allowed paths, mode, identity-independent policy, and user premises. It does not contain an answer, source-derived control graph, expected source behavior, or known runtime values.

## Portable commands

Run these commands from this folder with the `skvm` CLI available on `PATH`:

```sh
skvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=semantic-flow-v1
skvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=semantic-flow-v1
skvm authorization inquiry inspect --out=runs
```

To revise the declaration without analyzing it, create a separate edit file using the documented edit schema and run:

```sh
skvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json
```

For a same-source, same-strategy comparison after a completed or checked run:

```sh
skvm authorization inquiry compare --input=changed.json --previous=runs --strategy=semantic-flow-v1
skvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-model-id> --method=D1 --strategy=semantic-flow-v1 --previous=runs
```

All paths are relative to this portable folder. Replace the model placeholder with the model configured for the environment; do not place credentials in this configuration or in source-controlled files.

## Strategy and scope

The configured strategy is `semantic-flow-v1`. It should trace the share-create request from routing and `ShareLinkViewSet` through inherited permissions, exact-document resolution, serializer validation and persistence, then compare that source behavior with the independent policy. The inquiry is limited to `src/documents` and `src/paperless/urls.py` under the supplied source root and source revision.

This is a focused authorization inquiry, not a complete audit. It preserves the broader security-audit responsibilities that apply to this question: identify the lower-trust caller, exact resource and operation; distinguish endpoint-wide controls from object-level controls; require source evidence for boundary claims; avoid assuming deployment, proxy, identity, or provider behavior; and report unresolved facts explicitly. Any execution, test, local reproduction, or runtime inspection remains subject to the supplied security-audit skill's sandbox and source-only rules. No target code is executed by this configuration.

## Remaining duties

The eventual inquiry run must still:

- verify the actual route and action for share creation;
- trace inherited permission selection and queryset/object lookup;
- inspect the relevant serializer and its request-aware validation or create path;
- determine whether `view_document` is checked for the exact document before the share is persisted;
- distinguish a global `add_sharelink` check from document-level authorization;
- separate source-established behavior from runtime or deployment facts absent from the allowed source;
- state policy compliance only to the extent supported by the source trace; and
- list concrete missing facts and safe validation plans rather than guessing.

Do not use the configuration to probe live or shared services, alter releases, apply patches, install dependencies, or execute target-controlled code outside the applicable sandbox. The mechanical source and configuration files should remain unchanged except for intentional inquiry edits.
