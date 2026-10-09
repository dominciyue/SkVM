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

Model-id placeholders. Provider-backed `<id>` is shorthand for `<provider>/<model-id>` and must match a route in `providers.routes`. OpenRouter targets use three segments (e.g. `openrouter/qwen/qwen3.5-35b-a3b`); native SDK targets use two (e.g. `anthropic/claude-sonnet-4.6`). The bounded `codex-account` entrance uses the authorized bare id `gpt-5.6-sol` and CLI-owned login. See [providers.md](providers.md) for provider routes.

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

Eight agent harness adapters, all registered in `src/adapters/registry.ts`:

- `bare-agent` — minimal built-in agent loop. Primary adapter for profiling and testing.
- `opencode` — wraps the [OpenCode](https://github.com/sst/opencode) CLI.
- `openclaw` — wraps the OpenClaw CLI.
- `hermes` — wraps the Hermes CLI. Populates full token/cost usage.
- `jiuwenclaw` — wraps `jiuwenclaw-cli` over JSON-RPC. Token/cost are **not** persisted upstream, so bench/profile aggregators report `$0` for jiuwenclaw runs.
- `pi` — wraps the [pi](https://shittycodingagent.ai/) CLI (`@mariozechner/pi-coding-agent`). Populates full token/cost usage via JSON mode.
- `claude-code` — drives the `claude -p` CLI in a sandbox. Populates token/cost usage. Heavy headless use may hit account rate limits / usage-terms.
- `codex-account` — bounded authorization source runtime through the official Codex app-server and existing login. Requires an explicit source scope and verified version/configuration; exact CLI 0.159.0-alpha.12.1, 0.160.0 and 0.162.0-alpha.2 are admitted with per-session effective controls.

The registry accepts `--adapter=<name>` across harness commands. `codex-account` requires bounded source configuration and is currently intended for the two authorization entrances below; it is not a general profile/compiler provider.

Three LLM provider route kinds under `src/providers/`, selected per model id via `providers.routes` in `skvm.config.json` — the `<provider>/` prefix on every model id picks the matching route (first glob match wins):

- **`anthropic`** — Anthropic Claude API, or an Anthropic-compatible gateway via a custom `baseUrl`. Set `ANTHROPIC_API_KEY`.
- **`openai-compatible`** — OpenAI / Azure / vLLM / Ollama / DeepSeek and similar `/v1/chat/completions` gateways. Requires `baseUrl`; for these routes an auto-probe layer can fail over to an Anthropic-shaped endpoint on the same host when tool-call args are polluted (disable with `SKVM_AUTO_PROBE=0`).
- **`openrouter`** — OpenRouter API. Set `OPENROUTER_API_KEY`.

### Bounded authorization assessment (opt-in development capability)

The explicit `operation-evidence-v4` strategy adds source-invariant exclusions, incremental annotation requirements and ordered context-failure summaries to the shared inquiry/native runtime. It retains the original question set, source and unknown behavior. Proposed property coverage does not establish whole-answer sufficiency. V4 materials use a separate semantic version from v3; use current same-strategy sessions for `--previous`. Public inquiry `run --skill=<complete-original-SKILL.md>` supplies and archives the original skill bytes. For the controlled account harness, use `--harness=codex-account --model=gpt-5.6-sol --strategy=operation-evidence-v4 --account-boundary=<reviewed-boundary.json>` and host tool/read/display/session limits. Ordinary `run --adapter=codex-account --authorization-strategy=operation-evidence-v4` uses the same core and complete skill. These tested interfaces are development capabilities; current full-task quality is still being measured.

AY's explicit `operation-evidence-v5` uses `question-control/v1` materials for question dependencies, source-bound framework/object relationships and per-question checks. Its two native answers remained source-partial; its original-byte Download author consumer was independently source-full while its machine check stayed partial. Source completeness, a checked result and measured benefit are separate. V5 remains compatible; the current examples below select v6. Keep a same-strategy current session for changes, and use `D1` when consuming a complete authored declaration.

AZ adds explicit `operation-evidence-v6`: task-only properties can bind to shown source, bounded helper summaries can narrow dependencies, and format correction has two opportunities separate from two semantic checks within the same total budget. Unknown effects and framework relations remain gaps. To select it, use `--strategy=operation-evidence-v6` for inquiry commands or `--authorization-strategy=operation-evidence-v6` for native run. Current source/answer templates supply IDs and field shapes only. Old declarations do not automatically acquire source bindings. [AZ results](../results/skill-ir/skill-dsl-research/development/authorization-property-abstraction-v1/summary.json) have no real material adoption or current machine result; N/M natural source quality was full/partial, and D failed in official workspace routing. This remains an opt-in development capability.

BA keeps v6 and adds typed host-managed source edits. Copy the current `task.sourceEdit.template`, fill the offered typed slots and send it inside native `controlDelta` or at the structured step root. Root property bindings omit anchorId; predicates and domain meanings remain your model's responsibility. Current source and answer views show the accepted shapes. Valid incomplete fields remain local drafts; accepted units, available materials, actual uses and checked properties are reported separately. After three format rejects only a valid final check remains available within the unchanged total cap; another malformed final closes delivery. [Current BA evidence](../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/summary.json) contains three delivered pilot answers and a routing-failed named retest. Source-full OWUI prose did not establish a checked machine chain, and paired quality/reuse effects remain unmeasured.

BB adds opt-in `operation-evidence-v7` through the same inquiry/native commands. Actual calls retain arguments, receiver and returned objects under every source role; an effect label selects a candidate whose reachable callee effects are checked. Current `propertyReferences` supplies qualified source/revision/question/operation refs for `effectRef` and optional `guardRef`; a missing guard can be queried. Valid partial edits enter incomplete materials, and named relevant unknowns continue to block their properties. Whole-task gaps and source-meaning review remain separate. The ordinary CLI has checked the retained Download common input as valid with v7; native help exposes `--authorization-strategy`. From `D:/skill优化/SkVM`, these are actual saved zero-call commands:

```powershell
bun src/index.ts authorization inquiry check --input=./results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/model/inputs/download-common.json --method=M --strategy=operation-evidence-v7
bun ./results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/study.ts status
bun ./results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/study.ts help
```

In the current source form, remove a mistaken optional annotation with `{anchorId:<shown anchor>,field:"guardBranch",value:null}` (or another field listed in `sourceEdit.clearing.fields`). This clears only that field and reruns validation; missing source meanings remain unknown. Required role/explanation and root fields cannot be null. The retained proposal and rejection history remain available.

The BB runner's `replay` command re-submits the two frozen BA proposals without adding source meaning or calling a model. `prepare consumer-download-inquiry` and `prepare consumer-owui-native` restore reproducible source copies only after the unchanged author declaration/Usage identity passes. `equivalence` validates the complete common M/D facts, original natural N brief, same source and full skill. `run <registered-position> [new-named-revision]` is the paid command; first attempts cannot be overwritten, and active/unknown completion plus quota/auth/routing pause state prevents another dispatch. Current channel and actual outcomes are recorded by BB `status`/`summarize`; a prepared package or derived replay is not real consumption.

`pilot-reference.ts` retains the first Download M reference to `pilot-download/optional-field-clear-1` as a historical observation and appends the named `source-order-marker-1` reference for the current six-row panel. All six rows share the runtime epoch, original task/source/skill, model, effort and budget; referenced attempts add zero model calls or independent samples. Download N/D natural answers are source-full and M is partial; OWUI N/M/D are partial. Current machine properties remain unknown with empty traces. The optional-field-clear run did not use clearing, so it does not establish that operation's real adoption or causal benefit.

BB resumed on 2026-10-10. Download original-package consumption delivered; OWUI's interrupted ephemeral original remains completion/final-cost unknown. After checking the original lifecycle and lack of a recoverable rollout, the user explicitly approved one named `consumer-owui-native/user-resume-1` run and continuation of the original queue. The [manual disposition](../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/user-resume-1-disposition.json) retains the original bytes and unknown accounting; other unknown requests still block dispatch. The zero-call `status` command above shows current state. [Summary](../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/summary.json) separates completed usage from partial pre-interruption usage.

The named OWUI run also timed out without a server terminal. A [second scoped decision](../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/user-resume-1-fresh-disposition.json) retained both unknowns and authorized only three fresh changes, once each. Those calls finished: policy/source delivered partial answers with2 adoptions and unknown properties; premise failed with a retained routing terminal and no answer/usage. Three previous arms lack a qualified baseline. `status` now reports `completed-with-unmet-criteria` and `authorizedExecutionComplete:true`, while `finiteQueueComplete` and `researchGoalAchieved` remain false. Read the [closeout](../results/skill-ir/skill-dsl-research/development/authorization-interprocedural-property-v1/verification/authorized-execution-closeout.json) before follow-up work; these decisions authorize no further resampling. This resume's full `replay` did not pass; the isolated preparation profile also reached its finite bound.

The [AX package verification](../results/skill-ir/skill-dsl-research/development/authorization-property-execution-v1/verification/portable-package.json) identifies the complete Download/OWUI delivery folder and ZIP. Open its README.md and COMMANDS.md: they include the original natural tasks, unchanged author declarations/Usage, both complete original skill bundles, allowed source snapshots and Download policy/premise/source changes. All four original Download questions remain; the new ownership fact replaces only the old unspecified-ownership premise. Eleven public commands ran without inference, and all 418 ZIP entries matched the byte manifest. This verifies a portable artifact for an existing SkVM/Bun checkout; the two actual model consumers remain pending. Full original skill investigation, validation and reporting duties continue to apply.

BC adds explicit `task-binding-v1` on these same commands. Supply your complete original skill, natural questions, source scope and model configuration. The system prepares task-only properties and retains every original question, including residual evidence-limit duties; you do not have to author property IDs or source bindings first. Preparation and source interpretation remain model proposals, and a narrow checked property does not certify the whole task. BC completed five original/revised/changed Download attempts, all delivered but source-partial; none produced a qualified cross-source property. Four comparison arms and three previous arms were blocked before inference. The [BC acceptance record](../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/acceptance-matrix.json) separates engineering, actual delivery, property checks and unproven reuse or benefit.

For a copy of the complete original package at `./download` and your complete skill/boundary, use the following public command shapes. Keep edited inputs beside the original input so its relative sourceRoot still resolves. Replace `<session-id>` with run's returned session; check, inspect, edit and compare make no inference request. Run uses the configured account model with high effort and includes preparation in its budget.

```powershell
bun src/index.ts authorization inquiry check --input=./download/inquiry.json --method=D1 --strategy=task-binding-v1
bun src/index.ts authorization inquiry run --input=./download/inquiry.json --skill=./cloudflare-security-audit/SKILL.md --out=./bc-account-runs --method=D1 --strategy=task-binding-v1 --harness=codex-account --model=gpt-5.6-sol --account-boundary=./account-boundary.json --max-tool-calls=64 --max-display-bytes=786432 --max-read-bytes=33554432 --session-timeout-ms=2700000
bun src/index.ts authorization inquiry inspect "--out=./bc-account-runs/sessions/<session-id>"
bun src/index.ts authorization inquiry edit --input=./download/inquiry.json --edit=./premise-edit.json --out=./download/changed.json
bun src/index.ts authorization inquiry compare --input=./download/changed.json "--previous=./bc-account-runs/sessions/<session-id>" --strategy=task-binding-v1
```

For example, `premise-edit.json` replaces only this question's premises with your explicitly supplied facts; keep any still-applicable premises in that array:

```json
{"schemaVersion":"authorization-inquiry-edit/v1","reason":"The caller's ownership is now supplied","operations":[{"kind":"premises","questionId":"authorization-and-selection-order","premises":[{"text":"The authenticated caller owns the requested document.","origin":"user"},{"text":"Relevant source branches must be analyzed rather than assuming a grant.","origin":"user"}]}]}
```

A changed task is prepared again and conclusions are recomputed. Add `--previous=<session-path>` to run only when compare permits reuse of the current same-strategy source materials; an old answer is never reused. Source changes invalidate affected interpretations. Research reuse additionally requires a current model-derived, independently reviewed cross-source property for the same original task. [BC public command verification](../results/skill-ir/skill-dsl-research/development/authorization-task-binding-v1/verification/public-command-contract.json) uses an explicit zero-inference unavailable-provider fixture; it verifies CLI/archive/edit/compare contracts, not successful model analysis or reuse. Native run selects the same behavior with `--authorization-strategy=task-binding-v1` and the existing authorization flags.

From a current repository checkout with your input, complete skill and reviewed boundary, the public command shapes are below. Replace `<id>` with the session returned by run. The native example reads the exact retained task file in PowerShell; the package COMMANDS.md supplies its full paths.

```powershell
bun src/index.ts authorization inquiry check --input=./inquiry.json --method=M --strategy=operation-evidence-v6
bun src/index.ts authorization inquiry init --from=./inquiry.json --out=./declared-copy.json
bun src/index.ts authorization inquiry edit --input=./inquiry.json --edit=./premise-edit.json --out=./changed.json
bun src/index.ts authorization inquiry inspect "--out=./account-runs/sessions/<id>"
bun src/index.ts authorization inquiry compare --input=./changed.json "--previous=./account-runs/sessions/<id>" --strategy=operation-evidence-v6
bun src/index.ts authorization inquiry run --input=./inquiry.json --skill=./security-review/SKILL.md --out=./account-runs --method=M --strategy=operation-evidence-v6 --harness=codex-account --model=gpt-5.6-sol --account-boundary=./account-boundary.json --max-tool-calls=64 --max-display-bytes=786432 --max-read-bytes=33554432 --session-timeout-ms=2700000
$Task = Get-Content -LiteralPath './original-task.txt' -Raw -Encoding UTF8
bun src/index.ts run --skill=./security-review/SKILL.md "--prompt=$Task" --authorization-scope=./inquiry.json --authorization-domain-tools=true --authorization-method=M --authorization-strategy=operation-evidence-v6 --adapter=codex-account --model=gpt-5.6-sol --authorization-account-boundary=./account-boundary.json --authorization-max-tool-calls=64 --authorization-max-display-bytes=786432 --authorization-max-read-bytes=33554432 --authorization-session-timeout-ms=2700000
```

Inquiry edit uses `authorization-inquiry-edit/v1` and writes a new JSON file; existing outputs are not overwritten. Policy edits require conformance mode. Init exports declarations, and compare never reuses old answers. Only run calls the model, whose account effort is fixed high. The package's machine-bound boundary is not automatically valid after migration; pin the current reviewed instruction paths/SHA. If a retained account run is unknown, inspect and adjudicate that original run before resending. AX/AY quota refusals and the AZ routing failure are historical. BA's one bounded recovery succeeded, then its named OWUI retest encountered another terminal `workspace routing discovery failed`; the current account queue pauses pending new external routing evidence. Native-app metadata alone does not establish availability of that controlled channel. No model/provider switch, purchase or reset credit use is made. A compare `reusable` material-level result with zero available/restored/used materials is not an observed reuse benefit. Use `D1` instead of `M` for a complete authored consumer declaration; current original-byte packages can be restored with the zero-call preparations in the [BA README](../results/skill-ir/skill-dsl-research/development/authorization-semantic-submission-v1/README.md).

For a natural source-behavior question use `skvm authorization inquiry check/run/inspect/edit/compare`. The [inquiry example](../examples/authorization-assessment/reusable-skill/inquiry.json) supplies `authorization-inquiry-input/v1`: taskId, repository/ref, relative sourceRoot, allowedPaths, mode and brief. Behavior needs no policy or expected outcome. Conformance requires an independent `policy:{text,origin:"user"|"external-policy",location}`. A complete `inquiry` replaces brief/mode/policy and compiles without a provider. Natural D0/D1 runs include model authoring; M retains the natural brief. All three use the same bounded original source tools in the current analysis. D1 adds pending entry/principal/resource/guard/effect/exception relations and mechanical observation feedback.

```sh
skvm authorization inquiry check --input=./inquiry.json --method=D1 --strategy=domain-evidence-v1
skvm authorization inquiry run --input=./inquiry.json --out=./runs --method=D1 --strategy=domain-evidence-v1 --model=<provider/model>
skvm authorization inquiry inspect --out=./runs
skvm authorization inquiry edit --input=./inquiry.json --edit=./inquiry-edit.json --out=./changed.json
skvm authorization inquiry compare --input=./changed.json --previous=./runs --strategy=domain-evidence-v1
```

Only run uses a provider. It retains input, source identities, actual read events, provider requests, first/final deliveries and partial/unknown costs in a new session. Compare checks every indexed source file including uncited bytes, and the entire request, premises, policy and scope; changed work needs fresh review and the old answer is never reused. Source actions are read-only and confined to the allowlist, excluding evaluator/test/secret paths. Limits are 12 dispatches, 24 actions, 256 KiB cumulative model target-source display, 300s per call and 1200s per session; initial indexing is bounded to 512 files/8 MiB. Each structured tool step permits 1–8 actions; both output transports expose these limits. The existing protocol fallback receives bounded field diagnostics without increasing dispatch limits or silently truncating actions. One result repair is available. Mechanical validity is separate from semantic support, which remains unreviewed.

`--strategy=domain-evidence-v1` enables the shared domain runtime for M, D0 or D1; omitting it keeps `legacy`. The model proposes cited local control rules and dependencies. The host reads at most two uniquely located dependencies per response, within the same budget, partially evaluates finite predicates using original explicit user text, and checks object/path/behavior/policy consistency. Ambiguous locations, unsupported expressions and incomplete policy mappings remain named gaps. `sourceBound` and a consistent rule graph do not prove extraction meaning. Inspect retains raw proposals, each check's rule snapshot, source actions and pure computation counts. Compare distinguishes policy-only and explicit premise-only changes, source invalidation and strategy changes; domain-evidence-v1 still starts fresh analysis.

In domain results, `branches` describes paths feasible under the current premises and earlier rejections, with each `id` matching its control `pathKey`. When the user also asks about an excluded alternative or counterfactual, preserve that answer and its shown-source citations in `behavior.explanation`, distinguishing it from the current run. The cited control rules remain available for later premise changes. Unspecified premises retain all feasible alternatives and a named missing fact; a mechanically checked result still requires separate source-semantic review.

`--strategy=guided-evidence-v2` additionally manages source work and local explanations. For compatible complete inquiries, `run --previous=<sessionPath>` can reuse checked source interpretation after verifying current source bytes. A changed policy is mapped anew; changed premises discard old values in the affected questions, recompute paths and activate relevant source reads. The final answer is always newly generated and checked. `compare` reports `reuseEligibility` without a model call. Missing footprints, changed source or incompatible settings return `needs-fresh-analysis` and a fresh-run command; an unresolved previous request returns an inspection command and must not be resent. Reuse requires complete current questions and matching model/method/guided settings. After a natural-brief run, export its retained declaration with `init` to avoid retyping those questions; the previous run still needs checked bounded footprints.

`init --from=<input file|session directory|archive root> --out=<new input file>` writes a new public configuration without a model call. A session export copies only its input metadata and retained question declaration; it does not copy answers, control graphs or checked flags. Source paths are rebased from the original input location recorded in the matching check archive. If that location is missing, supply `--source-root=<current source directory>` explicitly. Exporting does not make a partial or unknown session eligible for reuse. Model-authored questions remain semantically unreviewed.

```sh
skvm authorization inquiry init --from=./runs/sessions/<id> --out=./declared.json
skvm authorization inquiry edit --input=./declared.json --edit=./inquiry-edit.json --out=./changed.json
skvm authorization inquiry compare --input=./changed.json --previous=./runs/sessions/<id> --strategy=guided-evidence-v2
skvm authorization inquiry run --input=./changed.json --out=./runs --method=D1 --strategy=guided-evidence-v2 --model=<provider/model> --previous=./runs/sessions/<id>
```

Ordinary `skvm run --skill=<SKILL.md> --prompt=<task> --authorization-scope=<inquiry.json> --authorization-trace=<new-file> --model=<provider/model>` opts the bare-agent into the same restricted runtime and full original skill injection. Add `--authorization-domain-tools` for packages that use authorization_compile/observe/check_result. Incremental requests/lifecycle/tool events are retained beside the final trace in `<new-file>.events`. Defaults retain their existing behavior; target execution and whole security audits remain outside this bounded capability.

Add `--authorization-strategy=domain-evidence-v1` together with `--authorization-domain-tools` to execute those same domain rules in ordinary native skill use. A strategy without a scope, or the new strategy without domain tools, fails before provider creation. The original skill and companions stay available; a control delta may be submitted through `authorization_observe` or `authorization_check_result`, and a rule revision invalidates the earlier checked result.

`--strategy=semantic-flow-v1` (or ordinary run `--authorization-strategy=semantic-flow-v1 --authorization-domain-tools`) lets the model explain local source blocks while the host forms paths and final references. Explicit choices keep alternatives separate; a successful helper return is distinguished from an actual protected operation. The current result revision is checked, and source meaning still needs review. User input remains the same natural brief or inquiry declaration; no control graph is required. Same-strategy checked sessions support the existing `--previous` workflow. Changed source, partial footprints or unknown completion keep the existing fresh/inspection requirements.

`--strategy=focused-closure-v1` keeps one current source interpretation until accepted or explicitly deferred, and derives its bookkeeping fields in the host. Both natural tasks and declarations use the same locate/interpret/link/review/answer workflow. Source self-review and final checking remain within the session budget; source meaning is still unreviewed. Ordinary skills select `--authorization-strategy=focused-closure-v1 --authorization-domain-tools`. Optional budget flags are `--authorization-max-provider-calls=24 --authorization-max-tool-calls=48 --authorization-max-display-bytes=524288 --authorization-max-read-bytes=8388608`, together with `--max-steps=24`; omit them to keep the existing defaults. This opt-in development strategy has real use records: AT's 12 quality firsts remain partial, two original native natural answers are sufficient conditional source explanations, and all four native formal checks fail. See [AT results](../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/summary.json).

Inquiry runs also accept explicit positive integer limits: `--max-provider-calls=32 --max-tool-calls=48 --max-display-bytes=524288 --max-read-bytes=8388608 --max-output-tokens=6000 --request-timeout-ms=300000 --session-timeout-ms=1200000`. These flags bound the actual public consumer session; omitted limits keep its defaults. Source read/index bytes are cumulative. Focused supporting source windows show ordinary read bodies within the same source display budget without selecting a callee automatically.

`operation-evidence-v1` adds source structure candidates and shared operation interpretations to the same runtime. Ordinary use selects `--authorization-strategy=operation-evidence-v1 --authorization-domain-tools --authorization-method=M`; M keeps the entire natural brief and compiles it without a declaration call. Use `--authorization-method=D1` to let the model author a v2 operation declaration from that brief within the same provider/tool budget. A complete supplied v1/v2 declaration compiles without another author call. These flags require a source scope. The original skill and its companion files remain available. Unique source relationships can bind accepted helpers automatically; missing typed arguments still require correction. Source constants and finite field writes stay in source interpretations; user values require original user spans. Source interpretation and current checks remain separate from independent source quality. Current actual-use results and sealed unknown requests are recorded in [current status](skill-ir/current-status.md) and [AU summary](../results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/summary.json).

Use `--authorization-max-output-tokens=6000` with an ordinary source scope to bound every actual provider request's output. Smaller caller limits are preserved; omitting the flag keeps the existing behavior. The operation inquiry frontend uses one direct focused action container and direct final-result fields; ordinary native tools use their existing `controlDelta` contract. Both enter the same domain core.

The explicit development strategy `operation-evidence-v2` uses original source anchors and host-derived call/branch syntax while the model explains their domain meaning. Select `authorization inquiry run --strategy=operation-evidence-v2 --method=M` for a natural task or `--method=D1` for a model-authored operation declaration; a complete inquiry avoids another author call. Ordinary full skills select `--authorization-strategy=operation-evidence-v2 --authorization-domain-tools --authorization-method=M|D1`. Missing user conditions retain alternatives. Missing conformance policy retains source behavior and an undetermined policy comparison; old strategies keep their policy requirement. Current delivery distinguishes unread source, unresolved interpretation, unknown user premises and unspecified policy. Mechanical consistency still needs independent source review.

For explicitly bounded ordinary runs, use `--authorization-request-timeout-ms=300000 --authorization-session-timeout-ms=7500000 --timeout-ms=7500000` together with provider/action/read/display/output caps. v2 closes timed-out local consumers before at most one recovery per request and two per position within the same total budget; remote completion and fees may stay unknown. Source-only ordinary N may opt into the same policy with `--authorization-readonly-recovery`. Writers do not receive automatic recovery. `--previous` in v2 restores only known source materials from frozen local state, recomputes answers and policy/premise mappings, and reports specific invalidated dependencies; legacy unknown sessions remain sealed. A final source verification failure withdraws current conclusions while retaining history. [AV status](../results/skill-ir/skill-dsl-research/development/authorization-source-assisted-closure-v1/status.json) separates engineering verification from actual use and research effect.

Three consecutive identical tool actions end an ordinary agent run with an unfinished-work error. Inspect the retained trace and specific gap before starting a new run; intermediate tool-round text is not a final report. A source-analysis report also needs a natural terminal response and nonempty final text. A blank end-turn or a source read alone does not establish delivery. Artifact-writing tasks still use their artifact contract, so they may finish without additional prose.

`operation-evidence-v3` explicitly adds finite try/handler/else/finally, Python short circuit values, bounded loops and path-specific gaps. Helper source materials can be saved before an entry is accepted. Current accepted entries use helpers only through verified source calls, receivers and actual arguments. Compatible `--previous` restores dependency-valid unreviewed materials and original evidence, then computes a new policy/premise answer; it never restores an old final/check. Inspect `eligible/materialsAvailable/materialsRestored/materialsUsed` separately. Zero restored materials is `no-materials-restored`, not a reuse gain. Missing historical footprints require fresh validation. Unknown subtype/context-exit/dynamic-loop relations remain named limits.

For the account entrance, use the existing CLI login and an explicit scope. The driver checks effective configuration, readonly/network-disabled permissions and empty extra roots in a clean session directory before inference. The official bounded Code Mode host routes only registered callbacks; target execution and extra tools are disabled. A global user instruction file may still load in this CLI version. Its already-reviewed generic policy must be pinned in a generated `codex-account-boundary/v1` file; unknown or changed instruction sources return unavailable. Add `--account-boundary=./account-boundary.json` to inquiry or `--authorization-account-boundary=./account-boundary.json` to ordinary run when such sources exist. Full original skill text remains available in ordinary run. A successful anonymous tool smoke establishes runtime access, separately from complete task quality.

```sh
skvm authorization inquiry run --input=./inquiry.json --out=./account-runs --method=M --strategy=operation-evidence-v3 --harness=codex-account --model=gpt-5.6-sol --max-tool-calls=64 --max-display-bytes=786432 --max-read-bytes=33554432 --session-timeout-ms=7500000
skvm run --skill=./security-review/SKILL.md --prompt="Review the complete task in the supplied scope." --authorization-scope=./inquiry.json --authorization-domain-tools --authorization-method=M --authorization-strategy=operation-evidence-v3 --adapter=codex-account --model=gpt-5.6-sol --authorization-max-tool-calls=64 --authorization-max-display-bytes=786432 --authorization-max-read-bytes=33554432 --authorization-session-timeout-ms=7500000 --authorization-trace=./account-trace.json
```

Account effort is fixed to high. M and D1 share the source core; a supplied complete inquiry avoids authoring. D0, external credentials/CLI overrides and provider-specific request-count/output-token/per-request-timeout/automatic-recovery limits are explicitly unsupported. Use host tool/read/display/session limits. Internal account requests and actual USD stay unknown; observed cumulative tokens, if available, are separate from cost availability. No private endpoint or paid provider fallback is used. Known credential formats and account identifiers are masked in account trace/report copies; this is not a general secret detector. The retained input file remains the original user task. [AW results](../results/skill-ir/skill-dsl-research/development/authorization-control-materials-v1/summary.json) separate engineering tests and metadata reduction from undispatched real quality/reuse experiments.

For an existing security skill and a scope file containing your natural question, source identity, relative source folder and independent policy:

```sh
skvm run --skill=./security-review/SKILL.md --prompt="Review the authorization question in the supplied scope and report source limits." --authorization-scope=./inquiry.json --authorization-domain-tools --authorization-strategy=semantic-flow-v1 --authorization-trace=./authorization-trace.json --adapter=bare-agent --model=<provider/model>
```

The complete skill and its reference files remain available. Read the final prose together with the trace's current `domain.check`, rejected drafts and source gaps. `semanticSupport:unreviewed` requires source judgment; valid format or verified source bytes alone do not mean checked/bounded delivery. AS and AT used both original skills on original/changed tasks and consumed four model-authored configurations unchanged. AT's four configurations are faithful, but their consumers remain partial. Both policy/premise previous positions were blocked with zero calls because no full source-quality, checked/bounded base exists. See [AS results](../results/skill-ir/skill-dsl-research/development/authorization-semantic-lowering-v1/summary.json) and [AT results](../results/skill-ir/skill-dsl-research/development/authorization-focused-closure-v1/summary.json).

From this repository checkout, the retained natural Download scope includes the locked framework source and uses the complete original security skill through the public entrances below. `check` does not call a provider; `run` uses your configured model route and writes a new session. These commands exercise a development capability whose result may remain partial. Inspect the session returned by run before another dispatch if completion is unknown. The retained AU Share and Gitea tasks have unknown requests and remain sealed across representations; inspect those original sessions without resending them.

```sh
bun src/index.ts authorization inquiry check --input=results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/model/inputs/paperless-download.json --method=D1 --strategy=operation-evidence-v1
bun src/index.ts authorization inquiry run --input=results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/model/inputs/paperless-download.json --out=.skvm/user-operation-inquiry --method=D1 --strategy=operation-evidence-v1 --model=xty/gpt-5.6-sol --max-provider-calls=24 --max-tool-calls=64 --max-display-bytes=786432 --max-read-bytes=33554432 --max-output-tokens=6000
bun src/index.ts run --skill=results/skill-ir/skill-dsl-research/development/authorization-domain-execution-v1/model/source-skills/cloudflare-security-audit/SKILL.md --prompt="Investigate the authorization behavior in the supplied scope and report visible conditions and source limits." --authorization-scope=results/skill-ir/skill-dsl-research/development/authorization-operation-evidence-v1/model/inputs/paperless-download.json --authorization-domain-tools --authorization-strategy=operation-evidence-v1 --authorization-method=M --authorization-trace=.skvm/user-operation-native.json --authorization-max-provider-calls=24 --authorization-max-tool-calls=64 --authorization-max-display-bytes=786432 --authorization-max-read-bytes=33554432 --authorization-max-output-tokens=6000 --max-steps=24 --adapter=bare-agent --model=xty/gpt-5.6-sol
```

Focused sessions reserve final verification of all indexed paths and bytes inside the same cumulative read budget. A source edit withdraws the old result and requires fresh analysis. Source verification adds no model call and does not complete missing interpretations. The isolated source-change example correctly invalidated its previous answer; only its second fresh final identified the removed exact-document guard, and both fresh analyses remained partial.

The scope file's current brief/declaration, mode and independent policy are delivered to the ordinary skill runtime. The natural prompt can describe the investigation without repeating policy fields. Use the [reusable skill example](../examples/authorization-assessment/reusable-skill/SKILL.md) for a movable source folder and request-edit workflow. Native domain mode reserves two of the total 24 actions for the initial result check and one diagnostic repair; source/reference/compile/observe share the other 22. Tool responses report both remaining budgets. Explicit domain budgets below 3 fail with `tool-budget`; common-only budgets keep their original limit. Tool registration, actual tool use, checked result delivery and semantic answer quality are distinct outcomes; reserved capacity enables checks but does not ensure the model submits a valid result.

The reusable example also shows v2 operation check/run/inspect, `init` to export the complete retained declaration, a separate question-specific current-premise edit and `compare --previous=<exact session>`. Keep every original operation and question request unchanged for material reuse. Its premise edit targets the M frontend's `q1`; D1 users copy the actual retained question ID. The older natural request-edit example replaces the request and does not demonstrate premise-only reuse. Compatible locally frozen partial v2 sessions may recover dependency-valid source materials at their existing unreviewed grade; a policy/premise change remaps current facts and regenerates the answer. Behavior-to-conformance plus an independent policy is allowed at the material layer. Changed source dependencies are individually invalidated; zero recovered materials establishes no reuse benefit. Inspect `reuseEligibility` first and retain source invalidation or legacy unknown-completion refusal; no old final becomes a current answer. Do not supply run evaluations or expected source conclusions in an authored scope.

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
