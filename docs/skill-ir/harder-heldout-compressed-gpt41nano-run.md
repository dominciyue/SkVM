# Harder Held-Out Compressed Run With gpt-4.1-nano

## Purpose

This document records the second-model Task 11 run over the six harder held-out tasks. The previous hard-task compressed run used `xty/gpt-4.1-mini` and showed parity between `original` and `ir-profile`. This run switches to a weaker OpenAI-family route, `xty/gpt-4.1-nano`, to test whether Skill IR structure helps more when the base model is less robust.

## Model Selection

The XTY OpenAI-compatible gateway exposed 444 models through `/v1/models`. A first cross-family candidate, `xty/qwen2.5-7b-instruct`, was selected because it looked like a weaker instruction model. The first real-agent case did not complete within the outer execution budget and produced no raw rows, so the stuck runner and child `bun run skvm run` processes were stopped and the route was not used for this archived comparison.

The archived run uses:

```text
xty/gpt-4.1-nano
bare-agent
```

This keeps the run on a fast compatible route while still lowering model capability relative to `xty/gpt-4.1-mini`.

## Scope

Run date: 2026-07-09.

Provider route:

```text
xty/* -> openai-compatible https://svip.xty.app/v1
```

Matrix:

```text
6 harder held-out tasks
x 1 context: compressed
x 2 systems: original and ir-profile
x 1 agent label: skvm
x 1 environment label: linux
= 12 executed rows, 6 paired cases
```

Selected tasks:

```text
review-security-hard-001
ci-cache-warning-hard-001
portable-clean-hard-001
commit-secret-hard-001
tdd-zero-page-hard-001
report-overclaim-hard-001
```

## Dry-Run Audit

The dry-run plan was inspected before execution:

```text
12 rows
6 unique paired case ids
6 original rows
6 ir-profile rows
2 rows per skill
2 rows per hard task id
12 compressed rows
12 commands with --model=xty/gpt-4.1-nano
```

The generated task prompt included the expected perturbation markers:

```text
Context perturbation: compressed
Compressed prior context
lossy
```

## Commands

Dry-run plan:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=review-security-hard-001,ci-cache-warning-hard-001,portable-clean-hard-001,commit-secret-hard-001,tdd-zero-page-hard-001,report-overclaim-hard-001' '--limit=12' '--model=xty/gpt-4.1-nano' '--adapter=bare-agent' '--out-dir=results/skill-ir/harder-heldout-compressed-gpt41nano-dry-run-2026-07-09'
```

Real execution used the same filters plus `--execute`, `--retries=1`, `--retry-delay-ms=1000`, and `--require-env=SKVM_XTY_API_KEY`.

Score and summarize:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/harder-heldout-compressed-gpt41nano-run-2026-07-09/raw-runs.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--out=results/skill-ir/harder-heldout-compressed-gpt41nano-results-2026-07-09.jsonl'
python scripts/analyze_skill_ir_results.py results/skill-ir/harder-heldout-compressed-gpt41nano-results-2026-07-09.jsonl results/skill-ir/harder-heldout-compressed-gpt41nano-table-2026-07-09.csv
python scripts/analyze_skill_ir_slices.py --input results/skill-ir/harder-heldout-compressed-gpt41nano-results-2026-07-09.jsonl --slices-out results/skill-ir/harder-heldout-compressed-gpt41nano-slices-2026-07-09.csv --paired-out results/skill-ir/harder-heldout-compressed-gpt41nano-paired-deltas-2026-07-09.csv --manifest benchmarks/skill-ir/corpus/manifest.json --root-dir .
```

Archived scored outputs:

```text
results/skill-ir/harder-heldout-compressed-gpt41nano-results-2026-07-09.jsonl
results/skill-ir/harder-heldout-compressed-gpt41nano-table-2026-07-09.csv
results/skill-ir/harder-heldout-compressed-gpt41nano-slices-2026-07-09.csv
results/skill-ir/harder-heldout-compressed-gpt41nano-paired-deltas-2026-07-09.csv
```

Raw execution directories were not archived after scoring.

## Execution Health

Raw-run inspection:

```text
rows: 12
exitCode=0: 12
attempts=1: 12
ProviderAuthError: 0
ProviderNetworkError: 0
OpenRouter fallback: 0
operation timed out: 0
API error 429: 0
duration range: 6506 ms to 68660 ms
```

## Scorer Adjustment

The initial scored result showed failures in git hygiene, TDD, and report synthesis cases. Raw-output inspection found several false negatives:

- Safe-commit answers preserved unrelated files by saying private notes stayed uncommitted and untracked `.env.local`, raw logs, and scratch files remained in place and ignored.
- TDD answers used `failing edge-case test first` wording before showing a `pageSize is 0` case.
- Report answers avoided overclaiming with `does not demonstrate a clear quality advantage`, which the previous matcher did not accept.

Regression tests were added in `src/benchmarks/skill-ir/scoring.test.ts`, the matcher was updated in `src/benchmarks/skill-ir/scoring.ts`, and the run was rescored from the same raw logs.

The remaining `original` failure is intentional: the report output did not include the required `Summary` section, while `ir-profile` did.

## Summary

| System | Mean success | Worst-case success | Rule violations | Mean latency ms | Mean token cost | Paired cases | Paired delta | Infrastructure failures | Agent failures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `original` | 0.8333 | 0.8333 | 1 | 25660.67 | 4042.5 | 0 | 0.0 | 0 | 0 |
| `ir-profile` | 1.0 | 1.0 | 0 | 20674.5 | 3701.67 | 6 | 0.1667 | 0 | 0 |

Per-task paired result:

| Task | Result |
|---|---|
| `review-security-hard-001` | same: both pass |
| `ci-cache-warning-hard-001` | same: both pass |
| `portable-clean-hard-001` | same: both pass |
| `commit-secret-hard-001` | same: both pass after scorer correction |
| `tdd-zero-page-hard-001` | same: both pass after scorer correction |
| `report-overclaim-hard-001` | gain: `ir-profile` passes, `original` fails required sections |

## Interpretation

This run gives the first clean hard-task result where the current `ir-profile` materialization outperforms `original` on a paired real-agent matrix:

- `ir-profile` passes all six hard held-out tasks.
- `original` misses one structure-sensitive report task.
- There are no regressions and no infrastructure failures.
- `ir-profile` is also cheaper and faster on average in this small run, although per-task latency varies sharply.

The result is still bounded: it covers one model route, six held-out tasks, one context perturbation, one agent label, and one environment label. It is useful evidence that Skill IR structure can help weaker models obey report structure under compressed context, not a broad claim that `ir-profile` is always better.

## Follow-Up

- Repeat the second-model experiment with another compatible weak route if available, preferably after a short single-case route probe.
- Add a route-health/probe mode before full real-agent execution so stalled model routes are detected without creating partial run directories.
- Continue expanding hard held-out tasks that stress structured output, instruction priority, and context compression.
