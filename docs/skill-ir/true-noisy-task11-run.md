# True Noisy Task 11 Run

## Purpose

This document records the first Task 11 run generated after the context perturbation audit. Unlike the earlier discriminative run, the `noisy` context in this run is not only a case label: the materialized task prompt contains explicit distracting prior notes and an instruction that the current task is authoritative.

The goal is narrow: validate whether the current six-skill seed corpus remains stable under the true noisy prompt perturbation, while keeping systems, agent, model, and environment fixed.

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
x 1 context: noisy
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
24 noisy rows
```

The generated `task.json` prompt included the expected perturbation markers:

```text
Context perturbation: noisy
Distracting prior note
The current task below is authoritative
```

This makes the run usable as a true noisy-context check.

## Commands

Dry-run plan:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile' '--contexts=noisy' '--agents=skvm' '--environments=linux' '--tasks=review-finding-order-001,review-missing-test-001,ci-node-version-001,ci-missing-env-001,portable-env-var-001,portable-rm-001,dirty-worktree-001,commit-scope-001,tdd-empty-input-001,tdd-off-by-one-001,report-experiment-notes-001,report-lab-update-001' '--limit=24' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--out-dir=results/skill-ir/true-noisy-task11-dry-run-2026-07-09'
```

Real execution used the same filters plus `--execute`, `--retries=1`, and `--require-env=SKVM_XTY_API_KEY`.

Score and summarize:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/true-noisy-task11-run-2026-07-09/raw-runs.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--out=results/skill-ir/true-noisy-task11-results-2026-07-09.jsonl'
python scripts/analyze_skill_ir_results.py results/skill-ir/true-noisy-task11-results-2026-07-09.jsonl results/skill-ir/true-noisy-task11-table-2026-07-09.csv
python scripts/analyze_skill_ir_slices.py --input results/skill-ir/true-noisy-task11-results-2026-07-09.jsonl --slices-out results/skill-ir/true-noisy-task11-slices-2026-07-09.csv --paired-out results/skill-ir/true-noisy-task11-paired-deltas-2026-07-09.csv --manifest benchmarks/skill-ir/corpus/manifest.json --root-dir .
```

Archived scored outputs:

```text
results/skill-ir/true-noisy-task11-results-2026-07-09.jsonl
results/skill-ir/true-noisy-task11-table-2026-07-09.csv
results/skill-ir/true-noisy-task11-slices-2026-07-09.csv
results/skill-ir/true-noisy-task11-paired-deltas-2026-07-09.csv
```

Raw execution directories were not archived and were removed after scoring.

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
duration range: 3387 ms to 56998 ms
```

## Summary

| System | Mean success | Worst-case success | Rule violations | Mean latency ms | Mean token cost | Paired cases | Paired delta | Infrastructure failures | Agent failures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `original` | 1.0 | 1.0 | 0 | 4900.83 | 892.17 | 0 | 0.0 | 0 | 0 |
| `ir-profile` | 1.0 | 1.0 | 0 | 8918.25 | 1760.25 | 12 | 0.0 | 0 | 0 |

Per-skill success:

| Skill | `original` | `ir-profile` |
|---|---:|---:|
| `skill-review` | 2/2 | 2/2 |
| `skill-ci-diagnostic` | 2/2 | 2/2 |
| `skill-env-portability` | 2/2 | 2/2 |
| `skill-git-hygiene` | 2/2 | 2/2 |
| `skill-tdd-bugfix` | 2/2 | 2/2 |
| `skill-report-synthesis` | 2/2 | 2/2 |

## Scorer Adjustment

Initial inspection showed two apparent `original` failures, but both were scorer false negatives:

- `caused by` wording should satisfy `Root cause is mentioned.`
- `Avoid using destructive git commands like git reset --hard...` should satisfy `Destructive git commands are avoided.` because the commands are explicitly negated, not recommended.

Regression tests were added for both cases, the scorer was updated, and this run was rescored from the same raw execution logs before archiving the final tables.

## Interpretation

This run does not show a quality advantage for `ir-profile` under true noisy context: both systems pass all 12 paired cases after scorer correction.

It does show a clear cost tradeoff:

- `ir-profile` mean token cost is about 97.3% higher than `original`.
- `ir-profile` mean latency is about 82.0% higher than `original`.
- The largest latency outlier is in `skill-report-synthesis` under `ir-profile`.

The disciplined conclusion is therefore: the current six-skill seed corpus can be handled by both systems under the true noisy perturbation, while `ir-profile` is more expensive in this setting. Future optimization should reduce prompt/check verbosity or move fixed logic into lower-cost checker artifacts before claiming broad superiority.

## Follow-Up

- Run a true `long` context matrix next; it is more likely to expose context-ordering and instruction-retention differences.
- Track cost-aware optimization as a real pass goal, not just an analysis metric.
- Keep paired-delta inspection in the loop because scorer false negatives can otherwise look like method gains.
