# True Long Task 11 Run

## Purpose

This document records the Task 11 run for the real `long` context perturbation. It follows the context perturbation audit and uses prompts that include an extended background section before the actionable task.

The goal is to test whether `ir-profile` provides extra stability when the task is surrounded by longer context, and to measure the cost tradeoff against the original natural-language skill.

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
6 skills
x 2 tasks per skill: one development task and one held-out task
x 1 context: long
x 2 systems: original and ir-profile
x 1 agent label: skvm
x 1 environment label: linux
= 24 executed rows, 12 paired cases
```

## Dry-Run Audit

Before execution, the dry-run plan was inspected:

```text
24 rows
12 unique paired case ids
12 original rows
12 ir-profile rows
4 rows per skill
2 rows per task id
24 long rows
```

The generated `task.json` prompt included the expected perturbation markers:

```text
Context perturbation: long
Long surrounding context
The actionable request is the current task below
```

This makes the run usable as a true long-context check.

## Commands

Dry-run plan:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile' '--contexts=long' '--agents=skvm' '--environments=linux' '--tasks=review-finding-order-001,review-missing-test-001,ci-node-version-001,ci-missing-env-001,portable-env-var-001,portable-rm-001,dirty-worktree-001,commit-scope-001,tdd-empty-input-001,tdd-off-by-one-001,report-experiment-notes-001,report-lab-update-001' '--limit=24' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--out-dir=results/skill-ir/true-long-task11-dry-run-2026-07-09'
```

Real execution used the same filters plus `--execute`, `--retries=1`, and `--require-env=SKVM_XTY_API_KEY`.

Score and summarize:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/true-long-task11-run-2026-07-09/raw-runs.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--out=results/skill-ir/true-long-task11-results-2026-07-09.jsonl'
python scripts/analyze_skill_ir_results.py results/skill-ir/true-long-task11-results-2026-07-09.jsonl results/skill-ir/true-long-task11-table-2026-07-09.csv
python scripts/analyze_skill_ir_slices.py --input results/skill-ir/true-long-task11-results-2026-07-09.jsonl --slices-out results/skill-ir/true-long-task11-slices-2026-07-09.csv --paired-out results/skill-ir/true-long-task11-paired-deltas-2026-07-09.csv --manifest benchmarks/skill-ir/corpus/manifest.json --root-dir .
```

Archived scored outputs:

```text
results/skill-ir/true-long-task11-results-2026-07-09.jsonl
results/skill-ir/true-long-task11-table-2026-07-09.csv
results/skill-ir/true-long-task11-slices-2026-07-09.csv
results/skill-ir/true-long-task11-paired-deltas-2026-07-09.csv
```

Raw execution directories were not archived after scoring.

## Execution Health

Raw-run inspection:

```text
rows: 24
exitCode=0: 24
attempts=1: 24
ProviderAuthError: 0
ProviderNetworkError: 0
OpenRouter fallback: 0
operation timed out: 0
API error 429: 0
duration range: 3367 ms to 8998 ms
```

## Summary

| System | Mean success | Worst-case success | Rule violations | Mean latency ms | Mean token cost | Paired cases | Paired delta | Infrastructure failures | Agent failures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `original` | 1.0 | 1.0 | 0 | 5039.92 | 973.5 | 0 | 0.0 | 0 | 0 |
| `ir-profile` | 1.0 | 1.0 | 0 | 5207.92 | 1792.08 | 12 | 0.0 | 0 | 0 |

Per-skill success:

| Skill | `original` | `ir-profile` |
|---|---:|---:|
| `skill-review` | 2/2 | 2/2 |
| `skill-ci-diagnostic` | 2/2 | 2/2 |
| `skill-env-portability` | 2/2 | 2/2 |
| `skill-git-hygiene` | 2/2 | 2/2 |
| `skill-tdd-bugfix` | 2/2 | 2/2 |
| `skill-report-synthesis` | 2/2 | 2/2 |

## Interpretation

This run does not show a quality advantage for `ir-profile` under true long context. Both systems pass all 12 paired cases with no scorer failures, no infrastructure failures, and no regressions.

It does show that the current `ir-profile` materialization remains more expensive:

- Mean token cost is about 84.1% higher than `original`.
- Mean latency is about 3.3% higher than `original`.
- The largest token deltas appear in `skill-report-synthesis` and `skill-ci-diagnostic`.

Together with the true noisy run, this suggests that the current six-skill seed corpus is no longer difficult enough for `original` under single-model settings. The next evaluation step should either add a second model or expand harder tasks before making stronger optimization claims.

## Follow-Up

- Add a second model route to test whether the no-gain result is specific to `gpt-4.1-mini`.
- Add harder held-out tasks or expand the deep corpus before another same-model context-only run.
- Treat cost-aware IR/profile rendering as a first-class optimization target.
