# DeleteSpaceMember authorization inquiry

This directory is a portable, bounded authorization-inquiry configuration for the supplied Memos source revision.

- `inquiry.json` is the complete declaration consumed by the authorization inquiry workflow.
- `task.json` preserves the task identity, source scope, mode, and independent policy.
- `format.schema.json` is the published input schema.
- `source/` is the relative source root. Keep it beside these files when copying the directory.
- `.skvm/skills/github-security-review/` contains the supplied original security-review skill and references.

Run commands from this directory. No absolute development path is required.

## Check

Validate the declaration and verify that the bounded source is available:

```sh
skvm authorization inquiry check inquiry.json --schema format.schema.json
```

## Run

Run the source-visible authorization inquiry:

```sh
skvm authorization inquiry run inquiry.json
```

The configuration selects `conformance` mode, carries the independent policy and its origin/location, and limits source analysis to `./source` plus the declared `allowedPaths`.

## Guided edit

Open the declaration in the ordinary guided editor, preserving the existing task identity and scope unless intentionally revising them:

```sh
skvm authorization inquiry edit inquiry.json --strategy guided
```

After editing, check it again:

```sh
skvm authorization inquiry check inquiry.json --schema format.schema.json
```

## Compare

Save run outputs outside `source/`, then compare two inquiry results, for example before and after an intentional source or inquiry revision:

```sh
skvm authorization inquiry run inquiry.json --output results/current.json
skvm authorization inquiry compare results/baseline.json results/current.json
```

If the locally installed `skvm` release uses positional output paths or different output/strategy flag spellings, use the equivalent shown by:

```sh
skvm authorization inquiry --help
skvm authorization inquiry check --help
skvm authorization inquiry run --help
skvm authorization inquiry edit --help
skvm authorization inquiry compare --help
```

## Current guided strategy

1. Resolve the `DeleteSpaceMember` RPC and concrete service entry point.
2. Trace caller identity, target identity, space and membership resolution, role predicates, and the deletion sink only through the declared allowed paths.
3. Analyze three paths separately: an ordinary non-administrator member targeting another member, an administrator targeting another member, and a member targeting themselves.
4. Do not assume deployment middleware, interceptors, gateways, or undocumented role grants. If an out-of-scope fact is decisive, retain it as a missing fact and explain how it limits the conclusion.
5. Cite controlling source with repository-relative paths and precise line locations; separate implementation evidence from the user-supplied policy.
6. Compare the established behavior with the policy only after the behavior trace and self-verification pass. Do not treat policy text as evidence of implementation.

This strategy is intentionally bounded to the requested authorization question. It does not precompute an answer, authorization control graph, policy finding, or known source-derived value.

## Remaining duties and limits

- A run must still inspect and reason over the supplied source, verify every authorization-relevant finding, and report decisive unknowns. Configuration authoring is not the substantive review.
- Static, source-visible analysis cannot establish behavior supplied only by deployment configuration, generated code absent from scope, external services, runtime state, or middleware outside `allowedPaths`. Those facts must not be guessed.
- The policy is independently supplied at `experimental-user-brief:memos-member-policy/v1`; it is a conformance criterion, not repository evidence.
- Do not execute the target application, install dependencies, access the network, mutate `source/`, or apply patches merely to answer this inquiry.
- This bounded request is not a whole-project security audit. If a later request asks for broader vulnerability, dependency, secrets, or business-logic review, follow the complete supplied security-review skill: scope resolution, dependency audit, secrets scan, vulnerability and cross-file analysis, self-verification, findings-summary-first reporting with severity/confidence and source locations, and review-only patch proposals for critical/high findings. Never auto-apply such patches; state: **Review each patch before applying. Nothing has been changed yet.**
