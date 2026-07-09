# Final IR Multi-Skill Multi-Model Run

## Purpose

This Task 11E run evaluates the current final IR artifact beyond the earlier report-only validation. It uses all six current deep-benchmark skills, one hard-002 held-out task per skill, and three route-probed model families.

The goal is to answer a narrower question:

```text
Does the current final IR artifact improve, regress, or stay neutral across multiple skills and model routes?
```

It does not claim that final IR is globally optimal. The current profile overlay contains one report-synthesis annotation, so improvements outside report synthesis are mostly static/final-pass or prompting effects, not broad dynamic-profile learning.

## Scope

Run date: 2026-07-09.

Provider route:

```text
xty/* -> openai-compatible https://svip.xty.app/v1
```

Compared systems:

```text
original
ir-profile
ir-pgo
```

Selected tasks:

```text
review-data-loss-hard-002
ci-engine-warning-hard-002
portable-env-chain-hard-002
commit-partial-index-hard-002
tdd-whitespace-name-hard-002
report-conflicting-notes-hard-002
```

Matrix per selected model:

```text
6 hard-002 held-out tasks
x 1 context: compressed
x 3 systems: original, ir-profile, ir-pgo
x 1 agent label: skvm
x 1 environment label: linux
= 18 rows per model
```

Total executed matrix:

```text
3 selected models x 18 rows = 54 rows
```

## Route Probe

Candidate routes:

```text
xty/gpt-4.1-nano
xty/gemini-2.5-flash
xty/deepseek-v3
xty/qwen3-8b
```

Probe result:

| Model | Status | Decision |
|---|---|---|
| `xty/gpt-4.1-nano` | ok | included as GPT-family stable reference |
| `xty/gemini-2.5-flash` | ok | included as Gemini-family route |
| `xty/qwen3-8b` | ok | included as Qwen-family route |
| `xty/deepseek-v3` | timeout / provider HTTP 500 | excluded |

`deepseek-v3` failed with a provider response indicating `max_tokens (current value: 16384) must be between 0 and 16000`. This is a route/config compatibility issue, not a skill behavior result.

Archived probe output:

```text
results/skill-ir/final-ir-route-probe-results-2026-07-09.jsonl
```

## Commands

Dry-run template:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile,ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=review-data-loss-hard-002,ci-engine-warning-hard-002,portable-env-chain-hard-002,commit-partial-index-hard-002,tdd-whitespace-name-hard-002,report-conflicting-notes-hard-002' '--limit=18' '--model=<model>' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/profiled-ir-gpt41nano-2026-07-09/final-ir' '--out-dir=results/skill-ir/final-ir-multiskill-<model-label>-dry-run-2026-07-09'
```

Execution used the same matrix plus:

```text
--execute
--retries=1
--retry-delay-ms=1000
--require-env=SKVM_XTY_API_KEY
```

Score and analyze template:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=<run-dir>/raw-runs.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--out=<results>.jsonl'
python scripts/analyze_skill_ir_results.py <results>.jsonl <table>.csv
python scripts/analyze_skill_ir_slices.py --input <results>.jsonl --slices-out <slices>.csv --paired-out <paired>.csv --manifest benchmarks/skill-ir/corpus/manifest.json --root-dir .
```

## Execution Health

| Model label | Rows | Exit 0 | Exit 1 | Infrastructure pattern |
|---|---:|---:|---:|---|
| `gpt41nano` | 18 | 18 | 0 | none |
| `gemini25flash` | 18 | 12 | 6 | provider HTTP failures on two tasks across all systems |
| `qwen38b` | 18 | 18 | 0 | none |

Gemini failures happened on:

```text
portable-env-chain-hard-002
commit-partial-index-hard-002
```

For both tasks, all three systems failed at the provider layer. These rows are counted as infrastructure failures and should not be interpreted as skill regressions.

## Scorer Adjustment

Raw-output audit found three deterministic scorer false negatives:

- Safe staged-only git cleanup used `git restore --staged`, which is not destructive.
- TDD output used `Test-first approach` plus a whitespace-only test, which satisfies the TDD ordering intent.
- Report outputs used `unsupported`, `avoids overstating`, or `explicitly avoids overstating` wording to avoid overclaiming.

Regression tests were added before matcher changes:

```powershell
bun test ./src/benchmarks/skill-ir/scoring.test.ts --test-name-pattern "final-ir runs|safe staged-only|unsupported-claim"
```

After the matcher update, the same raw rows were rescored.

## Results By Model

### gpt-4.1-nano

| System | Mean success | Rule violations | Paired cases | Paired delta | Regressions | Mean latency ms | Mean token cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| `original` | 0.8333 | 1 | 0 | 0.0 | 0 | 13466.33 | 1781.83 |
| `ir-profile` | 0.8333 | 1 | 6 | 0.0 | 1 | 23112.33 | 3430.33 |
| `ir-pgo` | 1.0 | 0 | 6 | 0.1667 | 0 | 20714.17 | 4485.5 |

Interpretation:

- `ir-pgo` passed all six tasks.
- `ir-profile` gained on git hygiene but regressed on TDD.
- `ir-pgo` avoided that static `ir-profile` regression, but used more tokens than both baselines.

### gemini-2.5-flash

| System | Mean success | Rule violations | Paired cases | Paired delta | Infrastructure failures | Mean latency ms | Mean token cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| `original` | 0.6667 | 0 | 0 | 0.0 | 2 | 6962.17 | 1172.75 |
| `ir-profile` | 0.6667 | 0 | 4 | 0.0 | 2 | 8942.5 | 1628.0 |
| `ir-pgo` | 0.6667 | 0 | 4 | 0.0 | 2 | 7783.5 | 1693.75 |

Interpretation:

- On non-infrastructure rows, all systems passed.
- This route is usable for some cases but still has provider/tool-call fragility.
- It should not be used for broad cross-family claims without stronger route stability controls.

### qwen3-8b

| System | Mean success | Rule violations | Paired cases | Paired delta | Regressions | Mean latency ms | Mean token cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| `original` | 0.3333 | 8 | 0 | 0.0 | 0 | 27395.5 | 5400.17 |
| `ir-profile` | 0.8333 | 1 | 6 | 0.5 | 0 | 21616.67 | 5400.33 |
| `ir-pgo` | 0.5 | 3 | 6 | 0.1667 | 0 | 20087.0 | 5282.17 |

Interpretation:

- Qwen is the most discriminative route in this experiment.
- Static `ir-profile` substantially improves Qwen: 5/6 pass vs original 2/6.
- `ir-pgo` improves over original but underperforms `ir-profile`: 3/6 pass.
- This suggests the current final IR artifact is not uniformly better than static IR. The dynamic overlay or final-IR materialization can change prompt behavior in ways that do not transfer across model families.

## Cross-Model Aggregate

Excluding infrastructure rows:

| System | Semantic rows | Successes | Mean semantic success | Rule violations | Mean latency ms | Mean token cost |
|---|---:|---:|---:|---:|---:|---:|
| `original` | 16 | 11 | 0.6875 | 9 | 16709.0 | 2986.44 |
| `ir-profile` | 16 | 14 | 0.8750 | 2 | 18259.25 | 3718.5 |
| `ir-pgo` | 16 | 13 | 0.8125 | 3 | 16807.19 | 4086.31 |

By model/system:

| Model | `original` | `ir-profile` | `ir-pgo` |
|---|---:|---:|---:|
| `gpt41nano` | 5/6 | 5/6 | 6/6 |
| `gemini25flash` | 4/4 semantic | 4/4 semantic | 4/4 semantic |
| `qwen38b` | 2/6 | 5/6 | 3/6 |

## Final IR Judgment

The current final IR is real and executable, but it is not yet the best artifact across models.

What improved:

- `ir-pgo` gave the best GPT-family result in this experiment.
- `ir-pgo` did not regress on Gemini non-infrastructure rows.
- `ir-pgo` improved Qwen over original on one additional task.

What did not improve:

- Static `ir-profile` outperformed `ir-pgo` on Qwen.
- The current dynamic overlay is too narrow: it contains one report-synthesis profile annotation, so it cannot explain improvements across review, CI, portability, git, and TDD tasks.
- `ir-pgo` still has higher token cost than original and does not consistently beat static IR.

This result strengthens the project story in a useful way: Skill IR materialization helps, especially on weaker/different model routes, but the current final IR promotion policy needs model-family awareness and confidence scoring before it should replace static IR by default.

## Promotion Policy Follow-Up

Task 11F converted this manual interpretation into a deterministic promotion report:

```powershell
bun ./src/benchmarks/skill-ir/promotion-policy-run.ts '--run=gpt41nano,xty/gpt-4.1-nano,results/skill-ir/final-ir-multiskill-gpt41nano-results-2026-07-09.jsonl' '--run=gemini25flash,xty/gemini-2.5-flash,results/skill-ir/final-ir-multiskill-gemini25flash-results-2026-07-09.jsonl' '--run=qwen38b,xty/qwen3-8b,results/skill-ir/final-ir-multiskill-qwen38b-results-2026-07-09.jsonl' '--out=results/skill-ir/final-ir-promotion-policy-report-2026-07-09.json'
```

The generated report matches the manual conclusion:

| Model family | Decision | Reason |
|---|---|---|
| `gpt` | `promote-ir-pgo` | `ir-pgo` improved held-out paired success without regressions. |
| `gemini` | `hold-for-more-validation` | Infrastructure rate exceeded the default threshold. |
| `qwen` | `keep-ir-profile` | `ir-pgo` regressed against static `ir-profile` on paired cases. |

This is now the preferred artifact for downstream validation planning because it encodes evidence, risk, cost, and family-specific decisions in one JSON file.

## Optimization Roadmap Update

The next implementation work should target:

1. **Output schema learning:** Learn section/field requirements from repeated output-format failures, not only generic rule checks.
2. **Model-family behavior profiles:** Track whether an overlay was supported by GPT, Gemini, Qwen, or another family before applying it broadly.
3. **Confidence and risk scoring:** Attach support count, model diversity, task split, and regression risk to each profile overlay and final IR artifact.
4. **Validation planner:** Automatically choose how much validation a skill needs before promotion.
5. **Final IR promotion policy:** Promote final IR only when it beats or matches static IR on held-out paired deltas without unacceptable cost or latency variance.

## Archived Outputs

```text
results/skill-ir/final-ir-route-probe-results-2026-07-09.jsonl
results/skill-ir/final-ir-multiskill-gpt41nano-results-2026-07-09.jsonl
results/skill-ir/final-ir-multiskill-gpt41nano-table-2026-07-09.csv
results/skill-ir/final-ir-multiskill-gpt41nano-slices-2026-07-09.csv
results/skill-ir/final-ir-multiskill-gpt41nano-paired-deltas-2026-07-09.csv
results/skill-ir/final-ir-multiskill-gemini25flash-results-2026-07-09.jsonl
results/skill-ir/final-ir-multiskill-gemini25flash-table-2026-07-09.csv
results/skill-ir/final-ir-multiskill-gemini25flash-slices-2026-07-09.csv
results/skill-ir/final-ir-multiskill-gemini25flash-paired-deltas-2026-07-09.csv
results/skill-ir/final-ir-multiskill-qwen38b-results-2026-07-09.jsonl
results/skill-ir/final-ir-multiskill-qwen38b-table-2026-07-09.csv
results/skill-ir/final-ir-multiskill-qwen38b-slices-2026-07-09.csv
results/skill-ir/final-ir-multiskill-qwen38b-paired-deltas-2026-07-09.csv
```

Raw execution and dry-run directories were removed after scoring.
