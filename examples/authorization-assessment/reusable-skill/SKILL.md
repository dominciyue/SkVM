---
name: skvm-authorization
description: Use when investigating source-visible authorization behavior or comparing it with independently supplied policy in a bounded local source revision, including changes to the current request, policy or premises.
---

# Bounded source authorization

Investigate visible authorization behavior; compare policy only when the user supplies it independently. This package requires an existing SkVM checkout with Bun dependencies installed, or an installation containing `authorization`. It does not bundle a runtime. From a checkout use `bun <checkout>/src/index.ts authorization` in place of `skvm authorization` below.

For a natural task, copy this directory and start from [inquiry.json](inquiry.json). Replace its synthetic repository/ref, relative sourceRoot, allowedPaths and brief with the current task. `behavior` needs no policy, expected answer or preselected entry lines. For `conformance`, supply `policy:{text,origin:"user"|"external-policy",location}` independently. During D1 run the model declares questions, requests bounded source_list/search/symbol/read actions and returns behavior, conditional branches, evidence IDs and exact gaps. The host organizes six pending relations and checks citations; semantic correctness still needs review. M uses the brief with the same source tools; D0 declares questions without the relation queue.

```sh
skvm authorization inquiry check --input=./inquiry.json --method=D1
skvm authorization inquiry run --input=./inquiry.json --method=D1 --model=<provider/model> --out=./inquiry-runs
skvm authorization inquiry inspect --out=./inquiry-runs
skvm authorization inquiry edit --input=./inquiry.json --edit=./inquiry-edit.json --out=./changed-inquiry.json
skvm authorization inquiry compare --input=./changed-inquiry.json --previous=./inquiry-runs
```

Only run calls the provider. Inspect, edit and compare are offline. Compare checks the whole current task and indexed source, marks changed work needs-review and never reuses the old answer. Source tools cannot run target code, write files, use shell/network or read outside the allowlist. Limits are 12 dispatches, 24 tool actions, 256 KiB cumulative target source shown to the model, 300 seconds per call and 1200 seconds per session; one delivery repair is allowed. Save unknown completion and inspect the retained session rather than resend it automatically.

To load an existing original skill through ordinary `skvm run`, use `--skill=<SKILL.md> --prompt=<current-task> --authorization-scope=./inquiry.json --authorization-trace=<new-json-file> --model=<provider/model>`. The opt-in bare-agent runtime preserves full skill injection and installs the same common read tools plus bounded skill_reference_read. Add `--authorization-domain-tools` only for a package that describes authorization_compile, authorization_observe and authorization_check_result. Domain check validates structure and actually shown evidence; it does not approve security semantics. Whole audits, deployment verification, patching and duties outside the bounded question remain the user's responsibility.

The older explicit assessment workflow below remains available when policy, scenarios and selected source ranges are already supplied.

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
