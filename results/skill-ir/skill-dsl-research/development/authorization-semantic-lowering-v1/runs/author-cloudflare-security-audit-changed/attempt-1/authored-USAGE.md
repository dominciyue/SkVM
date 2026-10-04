# Authorization inquiry usage

This folder contains a reusable, source-bounded authorization inquiry for the `paperless-share-create` task.

## Portable commands

Run these commands from the folder containing `inquiry.json`, using the configured `skvm` executable:

```text
skvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=semantic-flow-v1
skvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=semantic-flow-v1
skvm authorization inquiry inspect --out=runs
```

For a revised configuration, use the mechanical edit and comparison commands without changing the source or policy implicitly:

```text
skvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json
skvm authorization inquiry compare --input=changed.json --previous=runs --strategy=semantic-flow-v1
skvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-model-id> --method=D1 --strategy=semantic-flow-v1 --previous=runs
```

All options use `--name=value`, and paths are relative to the portable inquiry folder. The configured `sourceRoot` is `source`; the allowed source paths are restricted to `src/documents` and `src/paperless/urls.py`.

## Strategy and scope

The inquiry uses the current `semantic-flow-v1` strategy and `conformance` mode. It asks for a source-level trace of the share-creation endpoint, exact document resolution, inherited permission behavior, serializer validation/save behavior, ownership enforcement, policy comparison, and concrete unresolved facts. The independent policy remains user-supplied and authoritative:

> Only the owner of the exact document may create a share. Object-level view_document grants without ownership are insufficient.

The inquiry is configuration only. It does not itself answer the questions, establish source-derived facts, execute the target, apply patches, install dependencies, use the network, or perform a whole-codebase audit. Preserve the supplied source and mechanical files.

## Remaining duties

A later authorized inquiry run must:

- inspect only the supplied source tree and allowed paths;
- trace the actual URL, view-set, inherited permission, object lookup, serializer, and persistence paths;
- distinguish global/model permissions and document existence from authorization for the exact document;
- identify whether ownership of that exact document is checked before share creation;
- separate source-established behavior from framework, deployment, identity, or environment facts that are not present;
- report policy compliance only when the relevant decision path is established, otherwise state the precise missing facts;
- retain the broader applicable security guidance: do not infer controls not shown in source, do not execute target code or probe live/shared systems without the required sandbox and authorization, and do not turn an unverified hypothesis into a confirmed vulnerability.

Any subsequent full audit or broader review requested by the owner should preserve its applicable coverage, evidence, validation, reporting, and source/local-execution safeguards rather than treating this focused inquiry as a complete audit.
