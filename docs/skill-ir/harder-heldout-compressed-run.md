# Harder Held-Out Compressed Task 11 Run

## Purpose

This document records the first real-agent run over the six harder held-out tasks. The run uses the true `compressed` context perturbation, where the task is preceded by a lossy prior-context summary.

The goal was to check whether the harder held-out tasks expose quality differences between the original natural-language skill and the current `ir-profile` materialization.

## Scope

Run date: 2026-07-09.

Provider route:

```text
xty/* -> openai-compatible https://svip.xty.app/v1
```

Model and adapter:

```text
xty/gpt-4.1-mini
bare-agent
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

Before execution, the dry-run plan was inspected:

```text
12 rows
6 unique paired case ids
6 original rows
6 ir-profile rows
2 rows per skill
2 rows per hard task id
12 compressed rows
```

The generated `task.json` prompt included the expected perturbation markers:

```text
Context perturbation: compressed
Compressed prior context
lossy
```

## Commands

Dry-run plan:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=review-security-hard-001,ci-cache-warning-hard-001,portable-clean-hard-001,commit-secret-hard-001,tdd-zero-page-hard-001,report-overclaim-hard-001' '--limit=12' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--out-dir=results/skill-ir/harder-heldout-compressed-dry-run-2026-07-09'
```

Real execution used the same filters plus `--execute`, `--retries=1`, and `--require-env=SKVM_XTY_API_KEY`.

Score and summarize:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/harder-heldout-compressed-run-2026-07-09/raw-runs.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--out=results/skill-ir/harder-heldout-compressed-results-2026-07-09.jsonl'
python scripts/analyze_skill_ir_results.py results/skill-ir/harder-heldout-compressed-results-2026-07-09.jsonl results/skill-ir/harder-heldout-compressed-table-2026-07-09.csv
python scripts/analyze_skill_ir_slices.py --input results/skill-ir/harder-heldout-compressed-results-2026-07-09.jsonl --slices-out results/skill-ir/harder-heldout-compressed-slices-2026-07-09.csv --paired-out results/skill-ir/harder-heldout-compressed-paired-deltas-2026-07-09.csv --manifest benchmarks/skill-ir/corpus/manifest.json --root-dir .
```

Archived scored outputs:

```text
results/skill-ir/harder-heldout-compressed-results-2026-07-09.jsonl
results/skill-ir/harder-heldout-compressed-table-2026-07-09.csv
results/skill-ir/harder-heldout-compressed-slices-2026-07-09.csv
results/skill-ir/harder-heldout-compressed-paired-deltas-2026-07-09.csv
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
duration range: 2996 ms to 9757 ms
```

## Scorer Adjustment

The initial scored result showed several failures, but raw-output inspection found false negatives in the heuristic scorer:

- Real CI answers identified the missing generated client as the root cause without explicitly restating that warning lines were distractors.
- Git hygiene answers excluded `.env.local`, raw logs, and scratch files across multiple lines, which the previous matcher did not handle.
- TDD answers used a `Failing test:` heading followed by a `pageSize is 0` case across lines.
- Report answers used evidence limitations and restrained language without the exact earlier overclaiming phrase.

Regression tests were added for these real output shapes, the matcher was updated, and the run was rescored from the same raw logs.

## Summary

| System | Mean success | Worst-case success | Rule violations | Mean latency ms | Mean token cost | Paired cases | Paired delta | Infrastructure failures | Agent failures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `original` | 1.0 | 1.0 | 0 | 6087.67 | 1057.5 | 0 | 0.0 | 0 | 0 |
| `ir-profile` | 1.0 | 1.0 | 0 | 6590.67 | 1999.0 | 6 | 0.0 | 0 | 0 |

Per-task paired result:

| Task | Result |
|---|---|
| `review-security-hard-001` | same: both pass |
| `ci-cache-warning-hard-001` | same: both pass after scorer correction |
| `portable-clean-hard-001` | same: both pass |
| `commit-secret-hard-001` | same: both pass after scorer correction |
| `tdd-zero-page-hard-001` | same: both pass after scorer correction |
| `report-overclaim-hard-001` | same: both pass after scorer correction |

## Interpretation

The harder held-out compressed run does not show a quality advantage for `ir-profile`: both systems passed all six paired hard tasks after correcting scorer false negatives.

It does reinforce the cost issue:

- `ir-profile` mean token cost is about 89.0% higher than `original`.
- `ir-profile` mean latency is about 8.3% higher than `original`.

The useful result is methodological: the harder tasks exposed scorer gaps and produced more realistic answer shapes, but under `xty/gpt-4.1-mini` the current original skill remains strong enough to pass these six tasks. The next discriminative step should use a second model route or a weaker/cheaper model to test whether Skill IR structure helps more when the base model is less robust.

## Follow-Up

- Run the same six hard tasks on a second model route before expanding task count again.
- Keep scorer false-negative audits mandatory after every hard-task run.
- Track cost-aware prompt/profile compression as an optimization pass goal.
