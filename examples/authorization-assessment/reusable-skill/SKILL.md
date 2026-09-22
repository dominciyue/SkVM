---
name: skvm-authorization
description: Use when assessing an explicitly scoped authorization question against a fixed source revision with known policy, roles and resource relationships, or revising that assessment after those inputs change.
---

# Bounded source authorization

Assess whether visible control paths enforce the supplied policy. This package requires an existing SkVM checkout with Bun dependencies installed, or an installation containing `authorization`. It does not bundle a runtime. From a checkout use `bun <checkout>/src/index.ts authorization` in place of `skvm authorization` below.

Copy [authoring.json](authoring.json) and its [synthetic source](project/src/record.ts) to try the example. For a real task, replace synthetic facts and sources. Keep the input next to its `project/` source root. Fix a repository revision and supply the relevant entry, upstream controls, resource bindings and protected effects. Missing decisive dependencies remain explicit gaps.

The author owns policy text, authority/location/revision, acceptance reason, principal role/facts, resource facts, entry locations, scenario relation, operation and policy expectation. `expectation` states the normative requirement, not a predicted source answer. Named dictionaries avoid internal IDs. Use the complete example's shapes; do not invent boolean fields. Optional facts/capabilities are string arrays; conditions map names to `{basis}`. Add task-specific questions using `additionalQuestions`.

```sh
skvm authorization locate --root=./project --file=src/record.ts --match=archiveRecord
skvm authorization check --input=./authoring.json --method=plain --wire=v4
skvm authorization run --input=./authoring.json --method=plain --wire=v4 --model=<provider/model> --out=./runs
skvm authorization inspect --out=./runs
```

For task-specific scope and assumptions use `additionalConstraints: string[]`; use `additionalQuestions: string[]` for extra questions. Top-level `constraints`, `questions`, `context` and `sourceGaps` are not v2 fields. Put resource facts in `resources.<name>.facts` and source gaps in `additionalConstraints`; retain the information when fixing unknown-key diagnostics.

`locate` matches literal text in one explicit file. Multiple matches require author selection; it does not infer function ranges. All line numbers refer to the supplied file, including excerpt headers, rather than upstream positions. `check` diagnoses author paths and never calls a model. Correct missing author information without inferring policy from implementation.

For a role, relation or policy change, save `changed.json`, update affected descriptions and expectations, then use the session path returned by inspect:

```sh
skvm authorization compare --previous=<sessionPath> --input=./changed.json
skvm authorization check --input=./changed.json --method=plain --wire=v4
```

Compare is read-only applicability analysis, not answer reuse. A shared context change affects all scenarios. Run again only when a new analysis is wanted. Unknown completion is not permission to resend automatically.

For scripted preparation, the optional `composeAuthorizationAuthoring` export in the checkout's `src/benchmarks/authorization-dsl/authoring-compose.ts` accepts a complete v2 base and `{field,value,origin}[]` replacements. It replaces whole top-level fields and records provenance; it does not merge nested objects or infer policy. Run ordinary `check` afterwards for references and source bounds.

Read the explanation: `source_refuted` means policy failure is refuted, consistent with enforced allow or deny. `unknown` must name decisive missing facts and needed observations. Inspect citations and reasoning; host checks prove structure and source ranges, not semantic correctness. Use ledger for explicit coverage and conditions for requested bounded branches; defaults remain compatible. Repository discovery, deployment verification, dependency/secret scanning, patching and whole security reviews remain outside this skill.
