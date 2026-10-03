# DeleteSpaceMember authorization inquiry

This directory is a portable, bounded authorization-inquiry configuration for the supplied Memos source revision.

- `inquiry.json` is the complete declaration consumed by the authorization inquiry workflow.
- `task.json` preserves the task identity, source scope, mode, and independent policy.
- `format.schema.json` is the published input schema.
- `source/` is the relative source root. Keep it beside these files when copying the directory.
- `.skvm/skills/github-security-review/` contains the supplied original security-review skill and references.

Run commands from this directory. The commands use only relative paths and named options, so they remain portable after copying this directory elsewhere.

## Check

Validate the complete declaration with the published schema and the guided evidence strategy:

```sh
skvm authorization inquiry check --input=inquiry.json --method=D1 --strategy=guided-evidence-v2
```

## Run

Run the source-visible inquiry. Replace `<configured-model-id>` with the model configured for the local environment; both the model and output directory are required:

```sh
skvm authorization inquiry run --input=inquiry.json --out=runs --model=<configured-model-id> --method=D1 --strategy=guided-evidence-v2
```

Inspect the resulting run, including any unknown or incomplete completion, before treating it as usable:

```sh
skvm authorization inquiry inspect --out=runs
```

## Edit

Create an edit declaration such as `change.json` using the published edit contract (`authorization-inquiry-edit/v1`), then write a changed inquiry without analyzing it:

```sh
skvm authorization inquiry edit --input=inquiry.json --edit=change.json --out=changed.json
```

Check the changed declaration before running it:

```sh
skvm authorization inquiry check --input=changed.json --method=D1 --strategy=guided-evidence-v2
```

## Compare

Compare a changed input against the previous eligible session. `compare` is read-only; the previous path is the prior run directory, not a positional inquiry path:

```sh
skvm authorization inquiry compare --input=changed.json --previous=runs --strategy=guided-evidence-v2
```

To run the changed inquiry while retaining the previous session as context:

```sh
skvm authorization inquiry run --input=changed.json --out=changed-runs --model=<same-configured-model-id> --method=D1 --strategy=guided-evidence-v2 --previous=runs
```

Use the local help commands if the installed release exposes additional options:

```sh
skvm authorization inquiry --help
skvm authorization inquiry check --help
skvm authorization inquiry run --help
skvm authorization inquiry inspect --help
skvm authorization inquiry edit --help
skvm authorization inquiry compare --help
```

## Current guided strategy

1. Resolve the `DeleteSpaceMember` RPC and concrete service entry point.
2. Trace caller identity, target identity, space and membership resolution, role predicates, and the deletion sink only through the declared `allowedPaths` under `./source`.
3. Analyze three paths separately: an ordinary non-administrator member targeting another member, an administrator targeting another member, and a member targeting themselves.
4. Do not assume deployment middleware, interceptors, gateways, or undocumented role grants. If an out-of-scope fact is decisive, retain it as a missing fact and explain how it limits the conclusion.
5. Cite controlling source with repository-relative paths and precise line locations; separate implementation evidence from the user-supplied policy.
6. Compare the established behavior with the policy only after the behavior trace and self-verification pass. Do not treat policy text as evidence of implementation.

The declaration contains the task, questions, actors, resources, operations, explicit user premises, source identity/scope, and independent policy. It does not contain a precomputed answer, authorization control graph, policy finding, or source-derived value.

## Remaining duties and limits

- A run must still inspect and reason over the supplied source, verify every authorization-relevant finding, and report decisive unknowns. Configuration authoring is not the substantive review.
- Static, source-visible analysis cannot establish behavior supplied only by deployment configuration, generated code absent from scope, external services, runtime state, or middleware outside `allowedPaths`. Those facts must not be guessed.
- The policy is independently supplied at `experimental-user-brief:memos-member-policy/v1`; it is a conformance criterion, not repository evidence.
- Do not execute the target application, install dependencies, access the network, mutate `source/`, or apply patches merely to answer this inquiry.
- This bounded request is not a whole-project security audit. If a later request asks for broader vulnerability, dependency, secrets, or business-logic review, follow the complete supplied security-review skill: scope resolution, dependency audit, secrets scan, vulnerability and cross-file analysis, self-verification, findings-summary-first reporting with severity/confidence and source locations, and review-only patch proposals for critical/high findings. Never auto-apply such patches; state: **Review each patch before applying. Nothing has been changed yet.**
