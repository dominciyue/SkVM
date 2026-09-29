# SkVM Usage

Command reference and workflows for the `skvm` CLI. For a 1-minute onboarding see the [README](../README.md); for subsystem and data-layout details see [architecture.md](architecture.md).

## CLI conventions

```bash
skvm <command> [options]
skvm --help
skvm <command> --help
skvm --verbose <command>           # enable debug logging
```

Flags use `--key=value` format (no space-separated form). `bun run skvm ...` works interchangeably with the installed `skvm` binary — all examples below use `skvm` for brevity.

For multi-step tasks, set an appropriate execution budget, for example `run --timeout-ms=900000` (15 minutes). This budget covers the source task, not subsequent optimization. A timed-out source task may have complete logs but incomplete outputs; `run --optimize` does not enter optimization in that case. Failed optimization handoffs return a nonzero process exit code, including through the top-level CLI. Increasing the budget starts a new attempt; package-export recovery does not resume a timed-out source task.

Model-id placeholders. `<id>` below is shorthand for `<provider>/<model-id>` — every CLI model id must carry a `<provider>/` prefix that matches a route in `providers.routes`. OpenRouter targets use three segments (e.g. `openrouter/qwen/qwen3.5-35b-a3b`); native-SDK targets use two (e.g. `anthropic/claude-sonnet-4.6`). See [providers.md](providers.md) for the full rule.

Top-level commands:

| Command | Purpose |
|---|---|
| `profile` | Profile a model's primitive capabilities |
| `aot-compile` | AOT-compile skill(s) for target model(s) |
| `pipeline` | Profile if needed, then aot-compile |
| `run` | Run one task with an optional skill (execute-only, no scoring) |
| `bench` | Run benchmark conditions across tasks/models |
| `jit-optimize` | Optimize a skill from synthetic, real, or log-based evidence |
| `proposals` | List, inspect, accept, or reject JIT-optimize proposals |
| `clean-jit` | Remove persisted JIT artifacts for a model+adapter |
| `logs` | List recent runs across subsystems |
| `authorization` | Opt-in bounded source-visible authorization assessment |

## Adapters & providers

Seven agent harness adapters, all registered in `src/adapters/registry.ts`:

- `bare-agent` — minimal built-in agent loop. Primary adapter for profiling and testing.
- `opencode` — wraps the [OpenCode](https://github.com/sst/opencode) CLI.
- `openclaw` — wraps the OpenClaw CLI.
- `hermes` — wraps the Hermes CLI. Populates full token/cost usage.
- `jiuwenclaw` — wraps `jiuwenclaw-cli` over JSON-RPC. Token/cost are **not** persisted upstream, so bench/profile aggregators report `$0` for jiuwenclaw runs.
- `pi` — wraps the [pi](https://shittycodingagent.ai/) CLI (`@mariozechner/pi-coding-agent`). Populates full token/cost usage via JSON mode.
- `claude-code` — drives the `claude -p` CLI in a sandbox. Populates token/cost usage. Heavy headless use may hit account rate limits / usage-terms.

All commands (`profile`, `aot-compile`, `run`, `bench`, `jit-optimize`) accept any of these seven via `--adapter=<name>`.

Three LLM provider route kinds under `src/providers/`, selected per model id via `providers.routes` in `skvm.config.json` — the `<provider>/` prefix on every model id picks the matching route (first glob match wins):

- **`anthropic`** — Anthropic Claude API, or an Anthropic-compatible gateway via a custom `baseUrl`. Set `ANTHROPIC_API_KEY`.
- **`openai-compatible`** — OpenAI / Azure / vLLM / Ollama / DeepSeek and similar `/v1/chat/completions` gateways. Requires `baseUrl`; for these routes an auto-probe layer can fail over to an Anthropic-shaped endpoint on the same host when tool-call args are polluted (disable with `SKVM_AUTO_PROBE=0`).
- **`openrouter`** — OpenRouter API. Set `OPENROUTER_API_KEY`.

### Bounded authorization assessment (opt-in development capability)

When repository/ref and entry locations are already known, `authorization init --context=./context.json --out=./draft.json` creates a domain draft, `draft.entry-seed.json` and `draft.authoring-guide.md` without a provider. Context uses `schemaVersion: authorization-authoring-context/v1`, `taskId`, optional natural `request`, `repository`, `sourceRef`, relative `sourceRoot`, `allowedFiles` and `entries:[{entryKey,path,startLine,endLine}]`. The draft leaves policy, principals, resources and scenarios for the author and reports `draftStatus: needs-input`. Source roots are relocated from the context coordinate. All three destinations are checked before creation. Fill the missing fields, then use ordinary check/prepare/run. The guide supplies compact field shapes and the same public contract can be reused for first draft and diagnostic revision.

When the current policy and cases are already stated, `authorization init --context=./context.json --task=./current-task.json --out=./authoring.json` compiles the optional `authorization-task-authoring/v1` front end to ordinary authoring/v2 without a model call. The task has one current `policy` and `cases[]`; each case names one declared entry, principal, resource, relation, operation, expectation and boundary. Premises contain `name` and `statement`; conditions are named once in that case; requested branches name only their condition assumptions. The host adds premise entry references, condition references and canonical IDs. It creates `authoring.entry-seed.json` and `authoring.field-provenance.json` alongside the v2 output, and refuses any existing destination. For a model-authored task file, add `--field-origin=model-authored` so the sidecar attributes authored fields accurately. The task contains no future policy or change request. A new policy or premise is a separate named change; compile its new current snapshot and use ordinary `edit`/`compose` and `prepare --reuse` for the resulting valid v2 input. Missing policy or invalid references return field diagnostics before provider creation.

In an explicit assessment contract, `premise.atEntry` is a string key from that scenario's `entries`. A requested branch's `assumptions[].condition` is an exact key from the same scenario's `conditions` dictionary. Use the declared keys rather than boolean values, descriptions or internal lowered IDs. Ordinary `check` validates these references before analysis.

Add `--context=callable-v1` to request/v2 preparation to retain complete, reliably indexed small functions around selected slices. Discovery includes a related class header and referenced methods without enumerating every class member. Final assembly records original selections, exact added `host-context` ranges, `unit-complete|unit-partial|range-uncertain`, omitted ranges and byte budgets in `report.controlContext`. Host-added bodies are separately source-verified and never counted as source already reviewed by the position model. Large or uncertain units retain explicit slices with named gaps. Nested execution and unshown dependencies still require analysis; mechanical completeness does not establish semantic sufficiency. Omitting context keeps the existing packing strategy.

For a policy/premise change on the same raw source, use `authorization prepare --input=./edited/assessment.json --reuse=./prepared/assessment.json --out=./reused`. This zero-provider path preserves snapshots, successful dependencies and every pending gap, then requires a fresh analysis. It verifies repository/ref, entry scope, every bound raw file's digest or missing state, and snapshot bytes. Verification reads from the new input's selected source root, so a byte-identical copy can be relocated. Changed bytes anywhere in a bound file, including omitted lines, invalidate reuse. This binding covers the recorded files, not the whole repository or every allowlisted file. An older report without a full binding also gives a named invalidation; prepare fresh in that case. Reuse retains its existing context strategy and cannot be combined with discovery, a proposal model or a new context choice. Gap retirement requires new verified evidence or an explicit changed scope/premise reason and keeps history; plain reuse preserves gaps.

Local edits can replace existing instructions with `{kind:"public-instruction",statement:"..."}` and one existing response detail with `{kind:"response-detail",scenarioKey:"...",index:0,statement:"..."}`. Include policy `reason` and every linked expectation when they need updating. Unknown fields, absent targets, invalid indices and repeated assignments are rejected. The report's `affectedText` lists related reasons, instructions and response details for semantic review; it preserves unassigned text and adds no approval step.

Use `--method=plain --assessment=explicit-v1 --wire=v6 --task-contract=current-v1` on `check` and `run` to select the optional current output contract. It migrates the product's known old return-label instruction in `requiredAnalysis` to a source-location analysis duty, recording the original and effective wording in the check/session. Unknown custom return-label instructions get a field diagnostic; quoted source/task data stays intact. The provider receives the v6 decision contract once. For explicit allow/deny expectations, inspect shows the host's policy comparison separately from the unchanged model explanation; an explicit opposite legacy label in that explanation is retained with a named diagnostic and uses the existing single repair opportunity. Conditional policy judgments remain the model's responsibility. Session and `compare` bind the selected task contract. Omitting the option keeps compatibility behavior.

The [evidence-editing example](../examples/authorization-assessment/evidence-editing/README.md) gives ordinary commands from context draft through preparation, policy editing, reuse and fresh analysis. The [owner-premise example](../examples/authorization-assessment/task-semantics/README.md) also shows the scoped current task, deterministic compilation, named change, reuse, compare and fresh run. Its outside-checkout copy passed zero-provider validation with matching source bytes and pending gaps; this validates the ordinary file flow, not a paid model outcome. Both examples label provider-free steps and paid analysis separately; users supply task facts and model configuration without writing research logs or ratings.

The [reusable skill package](../examples/authorization-assessment/reusable-skill/SKILL.md) supplies a complete synthetic v2 input and source, using the existing SkVM runtime. `skvm authorization locate --root=./project --file=src/access.ts --match=authorize` reads only the explicit file with literal matching. It reports current-file line count, zero/unique/multiple matches and nearby lines; the default 20-match limit reports truncation. Authors select entry ranges themselves. Absolute/escaping paths, junction escapes and NUL are rejected; no model or target code runs.

The source-visible authorization capability is available through an opt-in top-level command for an ordinary task and explicit source files. It remains a bounded development capability, not a repository-wide scanner, target executor, patch generator, or production security decision.

The package requires an existing SkVM installation containing this command, or a Bun checkout with dependencies installed. Copy the package directory to an ordinary workspace and use `bun <checkout>/src/index.ts authorization` in place of `skvm authorization` when running from source. Supply the policy and its authority, fixed source revision, relevant control-path files, caller/resource facts, and entry ranges yourself.

```powershell
skvm authorization init --out=./assessment.json
skvm authorization check --input=./assessment.json
skvm authorization run --input=./assessment.json --model=<provider/model> --out=./.skvm/authorization-demo
skvm authorization inspect --out=./.skvm/authorization-demo
```

For new authoring, use the complete [authoring-v2.json](../examples/authorization-assessment/authoring-v2.json) example. Write `taskId`, the natural `request`, `repository`, fixed `sourceRef`, relative `sourceRoot`, explicit `sources`, and named dictionaries `policies`, `principals`, `resources`, `entries`, `scenarios`. No internal IDs are needed. Policy text/location/revision/acceptance/reason and each scenario's relation/operation/expectation belong to the author; the program never derives policy from source. Each scenario names its principal, resource, policy and entries. Optional facts and capabilities are string arrays; omit them only when not declared. `conditions` maps names to `{basis}`; optional `analyzeConditions:{names,maxBranches}` requests bounded analysis of declared names (1–12 branches, default 8). `additionalQuestions` and `additionalConstraints` append to the shared host rules. Unknown fields and ambiguous names are rejected.

For field descriptions and structure feedback while editing, use the [local editor schema example](../examples/authorization-assessment/editor-support/README.md). Associate the external draft-07 asset through editor settings; do not add `$schema` to the strict declaration. References, accepted policy, Unicode names, real paths and source ranges still require ordinary `authorization check`. The schema does not validate the truth of policy or source reasoning.

Ordinary `init --from`, `check` and `prepare` share those structure diagnostics. A recognizable v2 draft with a missing version receives applicable field suggestions, including exact `schemaPath` JSON Pointers; it remains invalid until the author explicitly supplies the version. Missing `request` or `policies` does not trigger a cascade of unrelated source/reference errors or a provider call. Unknown input shapes receive version guidance only. `init --format=authoring-v2` also reports the local schema asset and required fields. Policy acceptance and missing facts are never supplied automatically.

```powershell
skvm authorization init --format=authoring-v2 --out=./authoring.json
skvm authorization check --input=./authoring.json --method=plain --wire=v4
skvm authorization run --input=./authoring.json --method=plain --wire=v4 --model=xty/gpt-5.6-sol --out=./runs
skvm authorization check --input=./authoring.json --method=plain --wire=v4 --reasoning=control-binding-v1
```

The template is synthetic: edit its policy, scenario and explicit source locations for your task, or copy the complete example directory to try it unchanged. `check` and `run` accept v2 directly and resolve sourceRoot relative to that original file. A session separately saves `input.json` (original bytes), `normalized-input.json`, `field-provenance.json`, and `execution-dependencies.json`. Check diagnostics group task/policy/source/scenario problems with field paths and fixes. Inspect prints the exact `sessionPath`. After editing the input, pass that returned path as `--previous` to `authorization compare --input=./authoring.json`. Compare inherits the prior method/wire/reasoning strategy unless explicitly overridden, runs no model, and never changes the old session. It reports added/removed/changed scenarios and affected obligations. Shared context changes conservatively affect all run scenarios, including uncited source. Missing old dependencies yield `needs-review`; `current` only means matching inputs, not proven semantic correctness or a reusable cached answer.

To maintain several explicit scenarios from one common declaration, use the [scenario workspace example](../examples/authorization-assessment/scenario-workspace/README.md). The base and each replacement list remain author-owned; the program assembles ordinary authoring/v2 files and records field origins without inferring policy or reusing answers. Preview needs no provider and writes nothing. Publication creates a complete new directory and refuses an existing destination; its atomic publication path currently supports Windows, while preview works on other platforms.

```powershell
skvm authorization compose --workspace=./scenario-workspace/workspace.json --out=./scenario-workspace/generated --check-only
skvm authorization compose --workspace=./scenario-workspace/workspace.json --out=./scenario-workspace/generated --check-only --compare-with=./scenario-workspace/previous-workspace.json
skvm authorization compose --workspace=./scenario-workspace/workspace.json --out=./scenario-workspace/generated
skvm authorization check --input=./scenario-workspace/generated/owner.json --method=plain --wire=v5
```

The optional workspace comparison reads both verified declarations without publishing. It lists common fields that changed, each variant's inherited or explicitly replaced fields, effective input changes, added/removed variants, and review reasons. A common policy change hidden by an explicit replacement is a prompt to check applicability; it is not automatically an author error. Output-directory relocation alone does not count as changed source bytes. A previous model answer still needs ordinary `authorization compare`, which includes all source files seen by that run.

To prepare a bounded source snapshot before analysis, write an `authorization-evidence-request/v1` or `/v2` JSON file that names the original input's `sourceRoot`, allowed files, every entry key and exact source range, dependencies, and file/byte/depth limits. Dependencies use `from` to refer to an entry or another dependency; each one needs an explicit line range to include bytes. A literal `match` may confirm one hit within that range. A dependency whose range cannot be resolved may instead name `unresolvedReason` as `dynamic-dispatch`, `external-middleware`, or `missing-symbol`; the report preserves it as a gap. V1 keeps the original continuous-range behavior; v2 packs distant slices without filling their gaps and records original-to-snapshot line mappings. Quotes must fit a retained slice. `ready` describes the declared or located source request; it does not prove every runtime path or external middleware is visible. A missing optional dependency produces a runnable `partial` snapshot; a missing required entry prevents publication.

```powershell
skvm authorization prepare --input=./assessment.json --request=./evidence-request.json --out=./prepared --check-only=true
skvm authorization prepare --input=./assessment.json --request=./evidence-request.json --out=./prepared
skvm authorization prepare --input=./assessment.json --request=./evidence-request.json --out=./prepared-with-proposal --proposal-model=provider/model
skvm authorization prepare --input=./assessment.json --request=./entry-seed-v2.json --out=./discovered --discover=true --proposal-model=provider/model
skvm authorization prepare --input=./assessment.json --request=./entry-seed-v2.json --out=./with-context --context=callable-v1 --discover=true --proposal-model=provider/model
skvm authorization check --input=./prepared/assessment.json --method=plain --wire=v6
```

The new directory contains `assessment.json`, `source/` snapshots, and `report.json`. With request/v2, `--discover=true` starts from entries and an author-supplied file allowlist; dependencies may be empty. A lexical index locates candidate support within 12 files and a 1MiB candidate-index read budget. Input validation and final snapshot reads happen separately; this is not a bound on all filesystem I/O. It records unresolved, ambiguous and dynamic references in `discovery.json`; it is not a semantic call graph. An optional model receives actual source windows, may request one supplementary round, and only proposes displayed positions. The cumulative source display and final source budgets are each 64KiB UTF-8, with dependency depth 3. There are at most two position calls and one diagnostics-only format revision. Without discovery, the legacy proposal makes one call. Check-only is provider-free and writes nothing.

Discovery proposals now use host-bound window/symbol IDs and an internal v3 selector contract; your request remains v2. Explanations are separate from optional exact literals. In v2, a literal is disambiguated inside its declared range, so an identical line elsewhere does not invalidate it; v1 keeps its historical global-match rule. Missing, ambiguous or unaffordable supplementary reads receive individual outcomes and named report gaps. Other valid reads survive, and a valid entry can produce a runnable partial snapshot. Failed parent dependencies cannot silently admit their children. Unsafe paths, changed source identity or changed indexed bytes reject publication.

The second fresh proposal call receives the same task and policy, verified source locations, related old windows and new windows. Every resent numbered UTF-8 source line counts toward the same 64KiB display budget. The account separates unique source, resent source, prompt/metadata bytes and actual provider tokens. If supplementary reads add no source information, preparation stops without a second position call. A partial result still needs analysis and review of its decisive gaps.

Every paid proposal dispatch and response is archived before parsing in a separate `<output>.attempts-*` directory, including failures, known tokens, actual reported cost or a reason it is unknown, and whether output was published. Output parents and basic writes are checked before dispatch. A dispatched request with unknown completion is retained without automatic resend. The host validates every proposed path, range, literal match and budget; finding a location does not establish that a guard works. Check/prepare show analysis entries, support locations, scenarios and expanded obligations. Support extends evidence only; explicit additional entries remain additional work. Run/inspect retain the report and mapping, and compare treats source or mapping changes as a reason to review the old answer. Policy-only edits may reuse unchanged snapshots but require a fresh run for the changed task.

Use an explicit v2 dependency request when the necessary helper ranges are known. Discovery is useful for a small allowlist with visible references, but review the decisive control path as well as named gaps: the [AL development run](skill-ir/skill-dsl-research.md#731-al-源码定位恢复与普通作者闭环) published all eight materials and still omitted a decisive helper body in a ready report. The [portable example](../examples/authorization-assessment/evidence-editing/README.md) includes valid-bad-valid supplementary locations that retain a named partial gap. State precise relations in task premises: "not the owner" does not by itself exclude an ownerless object when the source permits one.

For a small change to an existing authoring/v2 input, write an `authorization-local-edit/v1` JSON file with `reason` and `operations`. A policy operation names a declared policy and may set `text`, `location`, `revision`, or `reason`; a scenario operation may set `relation`, `operation`, or `expectation`; a premise operation names an existing scenario and premise id and replaces its statement. When a policy is edited, explicitly supply an expectation for every scenario that cites it, even if the value stays the same. The program does not infer the policy decision from the source.

```powershell
skvm authorization edit --input=./authoring.json --edit=./change.json --out=./edited --check-only=true
skvm authorization edit --input=./authoring.json --edit=./change.json --out=./edited
skvm authorization check --input=./edited/assessment.json --method=plain --wire=v6
```

The published `assessment.json` is a complete v2 input with sourceRoot relocated to the new directory; `edit-report.json` lists supplied and changed fields. An incomplete policy review yields diagnostics and a non-runnable `draft.json`. Both commands reject an existing output directory. When changing policy or premises, also review the policy reason, public instruction and counterfactual explanation for stale wording; structural checks do not prove their semantic consistency. Run a fresh session for the changed input, and use `authorization compare` against the old session to identify affected shared context.

The [portable evidence and edit example](../examples/authorization-assessment/evidence-editing/README.md) includes two source files, a named `partial` gap that becomes `ready` after adding an exact helper range, a policy patch with explicit linked-scenario reviews, and the complete ordinary check/run/inspect/compare command sequence. `compare` checks old-answer applicability only; a changed task needs a fresh run and semantic review.

The retained AA FastAPI trial demonstrates ordinary v2 use. From the repository root, these commands inspect an actual completed session and compare its original non-superuser declaration with the independently authored superuser change, without a provider call:

```powershell
$aa = './results/skill-ir/skill-dsl-research/development/authorization-authoring-reuse-v1'
bun ./src/index.ts authorization check --input="$aa/authors/fastapi/original.json" --method=plain --wire=v4
bun ./src/index.ts authorization inspect --out="$aa/runs/author-fastapi-original"
bun ./src/index.ts authorization compare --previous="$aa/runs/author-fastapi-original/sessions/20260922T082410563Z-6b3bedc6" --input="$aa/authors/fastapi/changed.json"
```

Both actual answers enforce their declarations: original deny, changed allow, each with one analysis call. `source_refuted` means the source refutes a policy failure, so it can accompany either correctly enforced outcome; read the explanation. Compare reports `needs-review` and the affected scenario, without upgrading the old answer. The six exposed AA cases support explicit `plain --wire=v4` for ordinary bounded work; use `ledger` for machine-readable coverage and `conditions` for requested bounded branch explanations. These are task-based recommendations, not a change to legacy/default compatibility or a general quality claim.

The [AB external-use evaluation](../results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/summary.json) reused this package/schema on linkding and django-todo. Independent Markdown scored 8/8 full and DSL 6/8: two DSL answers reasoned correctly but emitted the opposite conclusion label. Always check label consistency against the explanation; mechanical validation is not semantic approval. DSL dictionaries and compare can help manage structured inputs, but this study did not establish a quality or labor-saving advantage. Markdown remains a research-only route, with no arbitrary prompt override in the public CLI. The [portable verification](../results/skill-ir/skill-dsl-research/development/authorization-external-reuse-v1/portable-recorded-verification.json) used eight retained wire responses offline in a temporary directory; it added no model observations or paid calls. The [AG accounting clarification](../results/skill-ir/token-accounting-semantics-20260927/ab-accounting-clarification.json) distinguishes AB's old fresh-input-plus-output difference (+11.969%) from complete prompt-plus-output with cache reads included (+3.279%); neither measures human savings or actual USD.

`init` without format retains the original synthetic normalized template and refuses to overwrite an existing path. The older `authorization-assessment-authoring/v1` remains supported; v1/v2 can optionally be normalized separately:

```powershell
skvm authorization init --from=./authoring.json --out=./assessment.json
```

The authoring and output files must stay in the same directory so a relative `sourceRoot` keeps the same bounded meaning. Normalization derives `sourceIdentity` from the task and materializes the shared six-question profile; it does not infer policy or an obligation expectation. A missing author-owned field returns `needs-input` with a field path and fix. The original authoring file is unchanged, and the recorded source ref remains `authored`, not remotely verified.

For a complete editable authoring example, use [authoring.json](../examples/authorization-assessment/authoring.json). Its outer fields are `schemaVersion`, `sourceRoot`, `sources`, and `task`. Omit `analysisProfile` for the default six questions. The following task fields are required; unknown fields are rejected:

| Field | Exact shape and meaning |
|---|---|
| `schemaVersion`, `sourceMode` | `"source-authorization-assessment/v0"`, `"fixed-context"` |
| `taskId`, `request`, `repository`, `sourceRef`, `scopeAssurance` | Nonempty strings: task identity, natural question, repository, fixed revision, bounded scope |
| `policySources` | Array of `{id, kind, text, location, revision, acceptance:{status, actorRole, reason}}`; acceptance status is `accepted`, `conflicted`, or `unresolved`. A file path alone is insufficient. State the accepted normative rule, not a guessed answer. |
| `principals` | Array of `{id, role, description, startingCapabilities: string[]}`; put role/equality scenario facts in description and obligation relation/conditions, not invented boolean fields. |
| `resources` | Array of `{id, type, description}`; put repository/ref at task level. |
| `entries` | Array of `{id, name, locations:[{path, startLine, endLine}]}`; paths are relative to sourceRoot and line numbers refer to the supplied files, including excerpt headers. |
| `obligations` | Array of `{id, principalId, resourceId, relation, operation, expectation, conditions:[{name,basis}], policySourceId, entryIds:string[]}`; referenced IDs must exist; expectation is `allow`, `deny`, or `conditional`; conditions may be empty. |
| `requiredAnalysis`, `constraints` | Nonempty arrays of strings containing the user's analysis duties and scope limits. The profile is derived, but these task requirements remain author-owned. |

For a changed identity relationship, edit `request`, principal/resource descriptions, obligation `relation`, relevant condition bases and `expectation` consistently. Keep the normative policy and fixed source unchanged when they have not changed. A changed expectation is a policy scenario declaration, not the model's conclusion. Run `init --from` and `check --method=plain` before analysis; preserve the first draft if you want to track authoring diagnostics.

You may instead copy `examples/authorization-assessment/`, then edit `assessment.json` and files under `project/`. The strict `authorization-assessment-input/v1` object contains:

- `sourceIdentity.repository/sourceRef`, which must exactly match the task identity;
- `sourceRoot`, resolved from the input file's directory; explicit relative parent segments can select a shared source directory, while the resolved root and source files remain confined to that declared boundary after junction/symlink checks;
- `sources`, an explicit list of portable files beneath `sourceRoot`, including ordinary paths such as `src/routes/items.py`;
- `task`, including policy sources, principals, resources, entries, obligations, bounded scope and constraints; and
- optional `analysisRequirements`; when omitted, the public six-question `authorization-core-v1` profile is used; and
- an optional condition-analysis request, which explicitly opts into the condition sidecar and wire/v3.

No research manifest, oracle, case id, evaluator, or review is required. `check` and `inspect` never initialize a provider. The optional `--arm=N|B|D` is available on `check` and `run`; it defaults to B because the frozen development panel found no additional necessary-semantics or coverage benefit from D and observed more calls and tokens. N and D remain explicit research alternatives. All arms share the task facts, questions, source and output protocol.

Both `check` and `run` accept `--method=plain|ledger|conditions`. `plain` supplies the same public facts and questions with base citation validation, without a coverage ledger or condition sidecar. `ledger` adds traceable requirement coverage and explicitly leaves any condition request unexecuted. `conditions` requires a valid `conditionAnalysisRequest`; missing input is diagnosed before creating a provider. Explicit methods use renderer B and conflict with `--arm=N|D`. Omitting method preserves compatibility: an input condition request selects conditions (`input-request`); otherwise ledger (`default`). Preview, session, inspection and text summary record requested/effective method, selection origin, ignored request and wire version. Explicit selections record `explicit`.

`--wire=legacy|v4|v5|v6` selects transport independently of method. `legacy` preserves wire/v1 for plain, v2 for ledger and v3 for conditions. The opt-in compact `v4` lets the host supply fixed metadata and bind fact IDs. The opt-in `v5` asks the model for `policyStatus: satisfied|violated|undetermined` and maps that field mechanically to the existing canonical conclusion; the model still supplies every source judgment, fact, citation and requested relation. The opt-in `v6` asks for observed behavior and lets the host derive the policy comparison for unconditional obligations; use it with `--assessment=explicit-v1` for the bounded task program, or explicitly with legacy assessment for outcome-only analysis. All versions share the same bounded repair and provider lifecycle. Schema diagnostics, first-response delivery and provider-reported costs remain visible. In the [AE development panel](../results/skill-ir/skill-dsl-research/development/authorization-explicit-policy-v1/panel-summary.json), both v4 and v5 were 6/6 full in each Markdown and DSL arm. This small matched panel did not show a quality gain or justify changing the default.

可选`analysisContract`在authoring/v2中为每个已声明scenario填写`boundary`（`declared-entry|supplied-path|deployment`）、`premises`（带`atEntry`和`task-assumption`来源）、`requestedBranches`（仅列需要回答的条件组合，不填期望effect）及`requiredResponseDetails`。`publicInstruction`可写四臂共用的公开要求段。普通`check/run`在有该sidecar时默认使用`--assessment=explicit-v1 --wire=v6`；`--assessment=legacy --wire=v4`保留相同公开要求但关闭新程序，便于对照。旧输入不变。v6让模型报告实际`decision.observed=allow|deny|unknown`，由宿主对照无条件政策期望；conditional沿用`decision.kind=conditional-policy`。每个结果还包含`branchResults`，未要求时为空数组。宿主检查请求分支的ID、假设、证据引用和遗漏；源码判断仍需审阅。`explicit-v1`要求v6且不能同时用`control-binding-v1`，错误在provider调用前返回。`inspect`显示原始决策、派生结论与请求分支；`compare`在前提、边界、分支或输出策略变化时要求复查旧答案。

Use a premise statement to distinguish an unspecified owner from an absent owner (`null`), another present owner and the caller as owner. If branch explanations matter, declare conditions such as owner presence and owner equality, then request only the needed combinations through existing `requestedBranches`; undeclared combinations are not expanded. Changing just the premise through `authorization edit` changes preview/program/compare dependencies while leaving source and policy intact. Checks catch explicit duplicate or contradictory structured assignments, not contradictions inferred from prose. Review the public instruction, relation and expectations together when changing a premise.

[完整合成示例](../examples/authorization-assessment/task-semantics/README.md)提供入口假设、明确请求的反事实、部署未知和不改源码的政策变化；可直接compose/check，再按需run/inspect/compare。普通用户只需任务、源码、工作目录与模型配置，不需要研究oracle、日志或评分协议。离线check只验证声明、源码位置和程序结构，实际结论仍须审阅。

`--reasoning=standard|control-binding-v1` is independent of method and wire; omission means `standard` with the prior prompt. The optional strategy asks, for each runnable obligation, which object the control checked versus the effect target, whether an upstream control applies to that path, which role or relation exception applies, and which missing external fact could actually change the outcome. It adds questions only: the model still determines source behavior and cites the supplied lines. Check shows the exact prompt; run, repair, inspect and compare retain the selected strategy. A change of strategy marks a prior result for review rather than reusing its answer.

In the [AH public development comparison](../results/skill-ir/skill-dsl-research/development/authorization-semantic-quality-v1/panel-summary.json), standard and focused Markdown each produced 8/11 fully reviewed answers; standard and focused DSL produced 5/11 and 7/11. The focused strategy increased complete prompt and output tokens in both formats, and one DSL answer became an unjustified unknown. Keep `standard` for ordinary runs; choose the focused option when its explicit local control questions help a reviewer, and still review the answer's conclusion against its explanation. The workspace change report is an author review aid: a changed common policy can flow to inherited variants or be masked by an explicit override, and an old answer is never automatically accepted for the new task.

The Z development comparison retains `legacy` as the default wire: v4 reduced first-response structural failures and measured calls on this panel, but its trusted-header unit timed out. Use `--wire=v4` explicitly with any of the three methods; only conditions received the real matched wire comparison. Choose `plain` for a lighter answer, `ledger` when requirement coverage is needed, and `conditions` when bounded condition outcomes are part of the task. Omitted method still follows the input-request/ledger compatibility rule; this is not a claim that the default is a quality winner.

Keep the condition-analysis request opt-in. It is useful when the deliverable explicitly requires bounded outcomes for named conditions, but it is not the ordinary default: one development case gained a requested condition enumeration, while a later three-task Gitea migration showed no P-versus-condition quality gain and the condition method used 12 versus 8 calls, 109,743 versus 37,489 known tokens, and about 2.36 times the known elapsed time. The current default therefore remains B with the shared ledger/profile. A condition sidecar is a structured analysis request, not target execution, symbolic execution, or semantic proof.

Each `run` creates a new non-overwriting directory under `<output-root>/sessions/`, prints its absolute path, and records JSON inputs/results, provider lifecycle JSONL, the exact preview, character sections, provider-reported token usage, and a text summary. Character counts are not token estimates. Every obligation result includes `decisiveMissingFacts` and `suggestedObservations`; an `unknown` conclusion must populate them. `<output-root>/sessions.jsonl` locates the latest session, while passing an exact session directory to `inspect` avoids ambiguity.

Recovery is state-dependent. An invalid `check` or a `provider-unavailable` session without `dispatch.json` made no provider request; fix the reported field/path/dependency or provider route and deliberately start a new session. A dispatched session with no terminal result is `completion-unknown`: inspect it, preserve it, and do not automatically resend it. Invoke `run` again only when you intentionally want a separate attempt. A completed session is always reusable through `inspect`, independently of the evaluator. Custom routes stored in the repository cache may require `$env:SKVM_CACHE = "$PWD/.skvm"` before `run`.

## `profile`

Profiles a model+harness against the 26-primitive capability set and writes cached TCPs under `~/.skvm/profiles/`.

```bash
# Single model
skvm profile --model=<id> --adapter=bare-agent

# Multiple models in parallel
skvm profile --model=<id1>,<id2> --concurrency=4

# Multiple adapters
skvm profile --model=<id> --adapter=bare-agent,opencode

# Batch from bench config
skvm profile --batch --concurrency=6

# List cached profiles
skvm profile --list
```

Notes:
- Profiles are cached per `(model, adapter)`. Re-runs hit the cache by default.
- `--force` re-runs profiling instead of using the cache.
- `--concurrency` distributes slots hierarchically per-adapter then per-model via `distributeSlots()`.

## `aot-compile`

AOT-compiles one or more skills for one or more target model+harness pairs. Variants are written under `~/.skvm/proposals/aot-compile/`.

```bash
# One skill for one model
skvm aot-compile --skill=path/to/SKILL.md --model=<id>

# Multiple models
skvm aot-compile --skill=<path> --model=<id1>,<id2> --concurrency=2

# Run selected passes only
skvm aot-compile --skill=<path> --model=<id> --pass=1,2

# Preview without writing
skvm aot-compile --skill=<path> --model=<id> --dry-run

# Override the compiler backend model
skvm aot-compile --skill=<path> --model=<id> --compiler-model=<id>
```

Three sequential compiler passes:

- **Pass 1** — SCR extraction, gap analysis, and agentic skill rewriting for missing/weak primitives
- **Pass 2** — dependency manifest extraction and idempotent `env-setup.sh` generation
- **Pass 3** — workflow decomposition, DAG construction, and parallelism hints

## `pipeline`

Profiles the target (if no cached TCP exists) and then compiles.

```bash
skvm pipeline --skill=path/to/SKILL.md --model=<id>
```

## `run`

Executes one task against one model+adapter, with or without a skill. **Execute-only — does not score the result.** Use `bench` for scored runs.

```bash
# Without a skill
skvm run --task=path/to/task.json --model=<id> --adapter=bare-agent

# With a skill
skvm run --task=<path> --skill=<path> --model=<id> --adapter=bare-agent

# Control how the skill is delivered to the adapter (inject|discover, default: inject)
skvm run --task=<path> --skill=<path> --model=<id> --adapter=bare-agent --skill-mode=inject

# Reuse a work directory (no cleanup between runs)
skvm run --task=<path> --skill=<path> --model=<id> --workdir=./tmp/run-workdir
```

### Natural task with automatic optimization

The supported default path needs only a natural task, source skill, work directory, and configured model:

```bash
skvm run --prompt="<task>" --skill=./skill --workdir=./project --model=<id> --optimize
```

SkVM runs the task once, captures its execution and passes that evidence to the optimizer. Any resulting package is saved under the run session. Capture and handoff are automatic; the optimizer uses `--model` unless `--optimizer-model=<id>` is set. Use `--package-out=<new-empty-directory>` to override the package location. For existing logs, use the advanced `jit-optimize --task-source=log` path.

JSON reference checks compare parsed values, not formatting or object key order. A passed local case means it executed successfully; without independent task checks the package remains a usable draft, not an independently validated recommendation. Resolve bundled scripts relative to their `SKILL.md` directory. Manifests, validation reports and hashes are diagnostic evidence, not routine steps for consuming a skill; follow the program's own exit-code convention.

Automatic run-scoped capture is currently verified only for the default `bare-agent` adapter. The other registered adapters may have manual trace readers, but that does not make automatic capture supported; `run --optimize` rejects them before source execution. The target model must match a `providers.routes` entry in the active `skvm.config.json`. Missing configuration produces a concrete route error instead of silently selecting another provider.

If source execution finished and a known atomic package-export step failed, resume that session without rerunning the task or optimizer:

```bash
skvm run --resume-optimization=path/to/optimization-session.json
```

States whose external completion is unknown remain non-replayable. A completed package can be `draft` or `validated-recommendation`; package-file closure alone is not behavior validation, and neither status establishes whole-skill correctness or cost savings.

A recorded example is the [R7 development run](../results/skill-ir/skill-optimization-production-closure-20260913/r7/report.json). Source execution, capture and handoff completed, but the optimizer changed documentation only. Its package remained `draft`, behavior was `not-run`, and USD cost was unknown. Use the portable command above for a new task; the report preserves that run's local setup.

### Copy and use an exported package

An exported package is an ordinary skill directory. Copy it once, then point `--skill` at the copy:

```powershell
Copy-Item -LiteralPath <exported-package> -Destination .\optimized-skill -Recurse
skvm run --prompt="<task>" --skill=.\optimized-skill --workdir=.\project --model=<id>
```

Start with `OPTIMIZATION-USAGE.md` for the package's commands and limits. The manifest is available for diagnostics. For example, the Law TXT package can run directly from its new parent directory with Python bytecode disabled:

```powershell
python -B .\optimized-skill\scripts\law_to_markdown.py .\project\document.txt --law-decision law --artifact-level minimal
```

This is a historical H13 TXT example, rather than the default workflow for a new skill. H13 verified that command after a single copy to a fresh Windows temporary directory: package closure passed before and after, Stage3 A/B/overall passed, the input and package digests were unchanged, and no research-root path was embedded. PDF/DOCX were outside that check. For those formats, follow the package's `SKILL.md`: use the configured `mineru-ocr` route, or install `python-docx>=1.1.0` and `pdfplumber>=0.11.0` for an explicitly authorized local fallback.

The C8/C9 Law development package contains a local contract checker. It covers part of the skill's work; its invocation is:

```powershell
python -B .\law-batch-package\scripts\contract_checker.py --root .\case --contract .\case\law-contract.json --source .\case\document.txt
```

The package was naturally consumed through the ordinary `run --prompt --skill --workdir --model` entry on an original and a semantic-variation Law task. A clean reproduction used Python 3.12.13 and the pinned dependency record at `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c9/dependencies.lock.txt`; the generated checker itself uses only the Python standard library. The checker covers protected-input presence, review-evidence shape/consistency, character-stream preservation, enumerated-item lines, and exact output sets. Classification, pre/post input hashes, and semantic quality remain agent duties. See the C8/C9 reports before treating a package as a validated recommendation.

## `bench`

Runs benchmark conditions over tasks, skills, and models. Logs and reports land under `~/.skvm/log/bench/{sessionId}/`.

```bash
# Single model
skvm bench --model=<id> --adapter=bare-agent

# Multiple models in parallel
skvm bench --model=<id1>,<id2> --concurrency=4

# Specific conditions and tasks
skvm bench --model=<id> --conditions=no-skill,original,aot-compiled,jit-boost --tasks=<task1>,<task2>

# Defer LLM-judge evaluation (write an async-judge manifest)
skvm bench --model=<id> --async-judge

# Run the deferred judge later
skvm bench --judge --manifest=<dir> --judge-model=<id> --concurrency=4
```

Condition families:

- `no-skill` — baseline, no skill provided to the model
- `original` — unmodified skill from `skvm-data/skills/`
- `aot-compiled` and `aot-compiled-p{1,2,3}` — full or per-pass AOT output
- `jit-boost` — boost-hooks-enabled runtime
- `jit-optimized` — latest best round from the proposals tree

## `jit-optimize`

Proposal-based skill improvement loop. Three task sources — `synthetic`, `real`, `log` — feed the same round-based optimizer; output goes to `~/.skvm/proposals/jit-optimize/`.

Required for every source:
- `--skill=<path>` (or `--skill-list=<file>`) — skill directory to optimize
- `--task-source=synthetic | real | log` — must be set explicitly
- `--optimizer-model=<id>` — LLM that does the editing
- `--target-model=<id>` — model the skill is tuned for (storage key, and for `synthetic`/`real` also what runs the tasks)
- `--target-adapter=<name>` — optional, defaults to `bare-agent`

### `--task-source=synthetic` (autotune)

The optimizer LLM derives training and held-out tasks directly from the skill, then loops edit → rerun → score.

```bash
skvm jit-optimize \
  --skill=path/to/skill-dir \
  --task-source=synthetic \
  --task-concurrency=3 \
  --optimizer-model=<id> \
  --target-model=<id> \
  --rounds=1 \
  --skill-mode=inject|discover
```

Synthetic-specific flags:
- `--synthetic-count=<n>` — training tasks to generate (default `2`)
- `--synthetic-test-count=<n>` — held-out test tasks (default `1`)

### `--task-source=real`

Run against explicit bench tasks. Training and held-out test sets can be specified separately.

```bash
skvm jit-optimize \
  --skill=path/to/skill-dir \
  --task-source=real \
  --tasks=<train-id-or-path,...> \
  --test-tasks=<test-id-or-path,...> \
  --optimizer-model=<id> \
  --target-model=<id> \
  --rounds=3
```

Real-specific flags:
- `--tasks=<id|path,...>` — **required.** Train tasks by bench id or `task.json` path, comma-separated.
- `--test-tasks=<id|path,...>` — optional. Held-out test tasks; if omitted, `--tasks` is used as both train and test (fallback for small task lists).

### `--task-source=log` (post-mortem)

Feed pre-existing conversation logs to the optimizer without rerunning anything. Good for triaging real failures from production, CI, or an `skvm-jit` post-task optimization hook.

```bash
skvm jit-optimize \
  --skill=path/to/skill-dir \
  --task-source=log \
  --logs=path/to/log1.jsonl,path/to/log2.jsonl \
  --log-records=line:3+line:7,lines:1-4 \
  --failures=path/to/log1-failure.json,path/to/log2-failure.json \
  --optimizer-model=<id> \
  --target-model=<id> \
  --package-out=path/to/new-empty-optimized-skill
```

Log-specific flags:
- `--logs=<path,...>` — **required.** Conversation log files, comma-separated.
- `--log-records=<spec,...>` — optional exact record selection. Supply one comma-separated spec per log; join multiple locators for one log with `+` (for example `line:3+line:7`). The accepted locator syntax is adapter-specific, and the number of specs must match `--logs`.
- `--failures=<path,...>` — optional. Per-log failure JSON files, same order as `--logs`. Each file holds `EvidenceCriterion[]` evidence for its log (structured per-criterion scores the log alone doesn't carry).

Log source does not rerun tasks, so `--rounds`, `--runs-per-task`, `--convergence`, `--baseline`, `--tasks`, `--test-tasks`, and `--synthetic-count` are all forbidden with it. `--target-model` is still required — it's the storage key identifying which model the logs came from.

### Loop controls (synthetic / real)

- `--rounds=<n>` — max optimization rounds (default `3` for synthetic/real, `1` for log)
- `--runs-per-task=<n>` — runs per task per round (default `1`)
- `--convergence=<0-1>` — early-exit threshold on primary score (default `0.95`). Primary score is the test score when a test set exists, else the train score.
- `--baseline` — also run the no-skill and original conditions for comparison

### Delivery

- `--no-keep-all-rounds` — keep only the best round's folder (default keeps all)
- `--auto-apply` — after best-round selection, overwrite the original `--skill` directory, backing up overwritten files inside the proposal
- `--package-out=<new-empty-directory>` — export the selected round as an independent optimized skill without modifying the source. The v2 package manifest binds the proposal, final-history actions, actual filesystem diff, exact file closure, runtime/dependency files, and any already-run action-local validation report; export does not rerun the checks. A genuine no-change leaves this directory absent. Legacy v1 packages remain readable.

The command prints whether the result is a `draft` or `validated-recommendation`, the actual action kinds, applicable inputs and preconditions, residual duties, and concrete validation gaps. A recommendation requires a bound passed report with at least one independent case and no unvalidated or rejected action. This status is limited to those action-local cases and does not claim whole-skill correctness or real agent consumption.

The [G-stage development report](../results/skill-ir/general-skill-optimization-20260913/final-report.json) records a non-API package exported from an exact I18n log record. Its historical invocation is not a current CLI example: in particular, the log path does not accept `--rounds`. Use the log command above and consult the exported package's `OPTIMIZATION-USAGE.md`; file closure, behavior checks and natural task evaluation establish different properties.

### Batch mode

```bash
skvm jit-optimize \
  --skill-list=skills.txt \
  --task-source=real \
  --tasks=<id-or-path,...> \
  --optimizer-model=<id> \
  --target-model=<id> \
  --concurrency=4
```

`--skill-list` is a file with one skill path per line; `--concurrency` runs jobs in parallel.

## `proposals`

Proposals are the unified storage for JIT-optimize output. See [architecture.md](architecture.md#proposals-tree) for the on-disk layout.

```bash
skvm proposals list
skvm proposals show <id>
skvm proposals accept <id>
skvm proposals accept <id> --round=<n>      # override the engine's recommended bestRound
skvm proposals reject <id>
```

Accepting a proposal deploys the chosen round into the target skill directory and backs up overwritten files as `.bak.<timestamp>`. The bench `jit-optimized` condition always reads `round-{bestRound}/` of the latest proposal for a given `(harness, targetModel, skillName)`.

## `clean-jit`

Removes persisted JIT state (boost candidates + solidification state) for a specific model+adapter pair.

```bash
skvm clean-jit --model=<id> --adapter=<name> --dry-run
skvm clean-jit --model=<id> --adapter=<name> --yes
```

## `logs`

Lists recent runs across subsystems for quick inspection.

```bash
skvm logs
skvm logs --type=bench --limit=10
skvm logs --type=profile
skvm logs --type=aot-compile
```

## Environment variables

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Agent execution and profiling via OpenRouter |
| `ANTHROPIC_API_KEY` | Compiler backend via the Anthropic API |
| `SKVM_DATA_DIR` | Override the `skvm-data/` input-dataset root |
| `SKVM_CACHE` | Override the runtime-cache root (default `~/.skvm/`) |
| `SKVM_PROFILES_DIR` | Override the cached-TCP directory |
| `SKVM_LOGS_DIR` | Override the runtime-log directory |
| `SKVM_PROPOSALS_DIR` | Override the proposals-tree root |
