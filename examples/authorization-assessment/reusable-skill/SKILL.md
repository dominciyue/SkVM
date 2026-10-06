---
name: skvm-authorization
description: Use when investigating source-visible authorization behavior or comparing it with independently supplied policy in a bounded local source revision, including changes to the current request, policy or premises.
---

# Bounded source authorization

Investigate visible authorization behavior; compare policy only when the user supplies it independently. This package requires an existing SkVM checkout with Bun dependencies installed, or an installation containing `authorization`. It does not bundle a runtime. From a checkout use `bun <checkout>/src/index.ts authorization` in place of `skvm authorization` below.

For a natural task, copy this directory and start from [inquiry.json](inquiry.json). Replace its synthetic repository/ref, relative sourceRoot, allowedPaths and brief with the current task. `behavior` needs no policy, expected answer or preselected entry lines. For `conformance`, supply `policy:{text,origin:"user"|"external-policy",location}` independently. During D1 run the model declares questions, requests bounded source_list/search/symbol/read actions and returns behavior, conditional branches, evidence IDs and exact gaps. The host organizes six pending relations and checks citations; semantic correctness still needs review. M uses the brief with the same source tools; D0 declares questions without the relation queue.

```sh
skvm authorization inquiry check --input=./inquiry.json --method=D1 --strategy=domain-evidence-v1
skvm authorization inquiry run --input=./inquiry.json --method=D1 --strategy=domain-evidence-v1 --model=<provider/model> --out=./inquiry-runs
skvm authorization inquiry inspect --out=./inquiry-runs
skvm authorization inquiry edit --input=./inquiry.json --edit=./inquiry-edit.json --out=./changed-inquiry.json
skvm authorization inquiry compare --input=./changed-inquiry.json --previous=./inquiry-runs --strategy=domain-evidence-v1
```

Only run calls the provider. Inspect, edit and compare are offline. Compare checks the whole current task and indexed source, marks changed work needs-review and never reuses the old answer. Source tools cannot run target code, write files, use shell/network or read outside the allowlist. Limits are 12 dispatches, 24 tool actions, 256 KiB cumulative target source shown to the model, 300 seconds per call and 1200 seconds per session; one delivery repair is allowed. Save unknown completion and inspect the retained session rather than resend it automatically.

The optional strategy above asks the model for cited local controls and helper dependencies. The program chooses up to two unambiguous source reads per response, substitutes explicit user premises into bounded conditions, and checks formal object/branch/behavior/policy consistency. The model still discovers and interprets source behavior, maps natural policy and explains gaps; these meanings need review. Omit the strategy to retain legacy behavior. No user-authored control graph or expected source answer is required. Changes to policy, premises, strategy or source are tracked by compare and require fresh analysis; old semantic rules are not automatically reused.

To load an existing original skill through ordinary `skvm run`, use `--skill=<SKILL.md> --prompt=<current-task> --authorization-scope=./inquiry.json --authorization-trace=<new-json-file> --model=<provider/model>`. The opt-in bare-agent runtime preserves full skill injection and installs the same common read tools plus bounded skill_reference_read. Add `--authorization-domain-tools` only for a package that describes authorization_compile, authorization_observe and authorization_check_result. Domain check validates structure and actually shown evidence; it does not approve security semantics. Whole audits, deployment verification, patching and duties outside the bounded question remain the user's responsibility.

With domain tools, add `--authorization-strategy=domain-evidence-v1` for the same execution engine. Submit incremental `authorization-control-slice/v1` proposals as `controlDelta` on observe/check. The runtime provides the bounded rule, dependency, predicate, user-binding and independent-policy shapes. Incorporate automatic source reads into linked rules, use returned digests for explicit revisions, and finish with the result check; one repaired check is available inside the native 22 exploration + 2 check budget.

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

For the current source-assisted operation strategy, the same natural input needs no source graph or expected answer. From this directory use:

```sh
skvm authorization inquiry check --input=./inquiry.json --method=M --strategy=operation-evidence-v2
skvm authorization inquiry run --input=./inquiry.json --out=./operation-runs --method=M --strategy=operation-evidence-v2 --model=<provider/model>
skvm authorization inquiry inspect --out=./operation-runs
skvm authorization inquiry init --from=./operation-runs/sessions/<returned-id> --out=./declared-operation.json
skvm authorization inquiry edit --input=./declared-operation.json --edit=./inquiry-premise-edit.json --out=./current-premise.json
skvm authorization inquiry compare --input=./current-premise.json --previous=./operation-runs/sessions/<returned-id> --strategy=operation-evidence-v2
skvm authorization inquiry run --input=./current-premise.json --out=./changed-operation-runs --method=M --strategy=operation-evidence-v2 --model=<provider/model> --previous=./operation-runs/sessions/<returned-id>
```

M preserves the entire natural brief and compiles it without a declaration call. D1 lets the model author operation/questions from that same request within the session budget; a complete supplied v2 declaration compiles without reauthoring. Export the retained declaration before a premise edit so that every original operation and question remains identical. The [premise edit](inquiry-premise-edit.json) targets `q1`, the ordinary M frontend's question; for D1, use the actual retained question ID and preserve its full request. The earlier `inquiry-edit.json` replaces the entire natural request and illustrates a different edit.

Questions about the same action share source work while policy and premise conclusions remain separate. The host supplies source anchors and executable branch/call syntax; explain the required anchors and cited objects. Calls inside an unsupported control region keep their original source and an explicit gap; annotating every child cannot make that region executable or complete. Source literals/finite field writes belong to shown source interpretations. Known user values require exact current user text for that question or the actual global brief; another question's premise cannot supply them.

Compatible locally frozen partial v2 sessions can restore dependency-valid source materials at their unreviewed grade, including earlier accepted materials when a later remote request's usage remains unknown. Compare reports exactly which dependencies changed; zero restored materials means zero material reuse. Old answers, checks and policy maps are discarded. Policy comparison may change behavior to conformance only with independently supplied policy. Changed user premises discard their old values and require current mappings. Legacy unknown sessions retain their inspection requirement. These commands illustrate the interface, not measured security quality or cost savings. For ordinary full-skill use add `--authorization-method=M --authorization-strategy=operation-evidence-v2 --authorization-domain-tools` to the scope-bound `skvm run` above and keep the original report duties.

Inspect the selected entry as well as the final prose. If it is unrelated to the request, locate the actual declaration with source search/symbol tools and submit the shown candidate ID for that same work item through `controlDelta.workSelections`. Read and interpret the next offered source window; a source read or defer alone does not replace the selected entry. A tool may return successfully while its `controlDiagnostics` rejects the interpretation. Evaluate the final against the current graph and original source, preserving incomplete checks and unknown completion separately. AU's retained natural Download N answer is sufficient for its bounded question, but that observation does not establish operation-core quality, reuse benefit or cost savings.

Read the explanation: `source_refuted` means policy failure is refuted, consistent with enforced allow or deny. `unknown` must name decisive missing facts and needed observations. Inspect citations and reasoning; host checks prove structure and source ranges, not semantic correctness. Use ledger for explicit coverage and conditions for requested bounded branches; defaults remain compatible. Repository discovery, deployment verification, dependency/secret scanning, patching and whole security reviews remain outside this skill.
