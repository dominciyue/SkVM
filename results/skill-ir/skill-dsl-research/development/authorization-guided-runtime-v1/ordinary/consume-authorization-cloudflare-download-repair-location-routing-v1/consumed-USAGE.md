# Paperless Download authorization inquiry

This directory contains a reusable, source-visible authorization inquiry for the Paperless document Download operation. The declaration is in `inquiry.json`; the copied source is under `./source`. `task.json` is the supplied task configuration and is intentionally preserved.

## Check the declaration

Run the schema and declaration checks from this directory:

```text
skvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=guided-evidence-v2
```

The declaration uses behavior mode and the supplied `guided-evidence-v2` strategy. It is scoped to the supplied `sourceRoot`, `allowedPaths`, repository, and source revision recorded in `inquiry.json`.

## Run the inquiry

Use a configured model identifier and a relative output directory:

```text
skvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=guided-evidence-v2
```

Inspect a completed or incomplete run before relying on it:

```text
skvm authorization inquiry inspect --out=runs
```

An unknown completion must be inspected and must not be automatically resent.

## Edit and compare

An edit file must follow the published `authorization-inquiry-edit/v1` contract. It contains a nonempty reason and operations such as `request` or `premises`, each referring to a question ID. Editing creates a new declaration; it does not analyze or reuse an earlier answer.

```text
skvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json
skvm authorization inquiry compare --input=changed.json --previous=runs --strategy=guided-evidence-v2
```

To run an eligible changed declaration while retaining the previous run as comparison context:

```text
skvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-configured-model-id> --method=D1 --strategy=guided-evidence-v2 --previous=runs
```

All paths above are relative to this directory, so these commands remain usable after the directory is copied elsewhere.

## Guided strategy and remaining duties

The declaration preserves the supplied behavior mode and asks for branch-by-branch treatment of the requested document, root/version resolution, original/archive selection, authenticated-user authorization, ownership, object grants, and missing deployment facts. The guided strategy is evidence-oriented: a later inquiry run should cite the supplied source and distinguish established behavior from unresolved conditions.

This configuration is not an answer, authorization control graph, finding, exploit, patch, or full security-audit report. It intentionally contains no source-derived conclusion or precomputed control value. The operator still must:

- inspect the inquiry result and verify every material claim against the allowed source revision;
- keep ownership, object grants, authentication wiring, soft-deletion/database state, storage contents, proxy/routing behavior, and deployment settings separate when those facts are not visible in the supplied source;
- reject unsupported assumptions about which user grants exist or which document/version is present;
- preserve the bounded local-only scope and do not execute the target, probe a deployment, access the network, install dependencies, or apply patches for this task;
- use the broader security-audit workflow and reporting responsibilities only if a later request explicitly asks for a codebase audit, pen test, report artifacts, or remediation work.
