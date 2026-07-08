# Discriminative Task 11 Run

## Purpose

This document records the first bounded Task 11 run that is intentionally more discriminative than the clean-context smoke test. It keeps the same six seed deep-benchmark skills, but adds held-out tasks and a noisy context so the run can expose stability differences without jumping to the full benchmark scale.

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
x 2 contexts: clean and noisy
x 2 systems: original and ir-profile
x 1 agent label: skvm
x 1 environment label: linux
= 48 executed rows, 24 paired cases
```

The dry-run plan was checked before execution:

```text
48 rows
24 unique paired case ids
24 original rows
24 ir-profile rows
8 rows per skill
24 clean rows
24 noisy rows
4 rows per task id
```

## Commands

Dry-run plan:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile' '--contexts=clean,noisy' '--agents=skvm' '--environments=linux' '--tasks=review-finding-order-001,review-missing-test-001,ci-node-version-001,ci-missing-env-001,portable-env-var-001,portable-rm-001,dirty-worktree-001,commit-scope-001,tdd-empty-input-001,tdd-off-by-one-001,report-experiment-notes-001,report-lab-update-001' '--limit=48' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--out-dir=results/skill-ir/discriminative-task11-dry-run-2026-07-09'
```

Real execution used the same filters plus `--execute`, `--retries=1`, and `--require-env=SKVM_XTY_API_KEY`.

Score and summarize:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/discriminative-task11-run-2026-07-09/raw-runs.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--out=results/skill-ir/discriminative-task11-results-2026-07-09.jsonl'
python scripts/analyze_skill_ir_results.py results/skill-ir/discriminative-task11-results-2026-07-09.jsonl results/skill-ir/discriminative-task11-table-2026-07-09.csv
```

Archived scored outputs:

```text
results/skill-ir/discriminative-task11-results-2026-07-09.jsonl
results/skill-ir/discriminative-task11-table-2026-07-09.csv
```

Raw execution directories were not archived and were removed after scoring. Re-run the command above if a later report needs a fresh raw transcript.

## Execution Health

Raw-run inspection:

```text
rows: 48
exitCode=0: 48
attempts=1: 48
ProviderAuthError: 0
ProviderNetworkError: 0
OpenRouter fallback: 0
operation timed out: 0
API error 429: 0
duration range: 3036 ms to 44476 ms
```

This run is therefore usable as model/skill behavior evidence, not just infrastructure smoke evidence.

## Summary

| System | Mean success | Worst-case success | Rule violations | Mean latency ms | Mean token cost | Paired cases | Paired delta | Infrastructure failures | Agent failures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `original` | 0.9167 | 0.9167 | 2 | 6347.96 | 1266.17 | 0 | 0.0 | 0 | 0 |
| `ir-profile` | 1.0 | 1.0 | 0 | 6651.92 | 1470.33 | 24 | 0.0833 | 0 | 0 |

Sliced success:

| Slice | `original` | `ir-profile` |
|---|---:|---:|
| clean context | 11/12 | 12/12 |
| noisy context | 11/12 | 12/12 |
| development tasks | 11/12 | 12/12 |
| held-out tasks | 11/12 | 12/12 |

Per-skill success:

| Skill | `original` | `ir-profile` |
|---|---:|---:|
| `skill-review` | 4/4 | 4/4 |
| `skill-ci-diagnostic` | 4/4 | 4/4 |
| `skill-env-portability` | 4/4 | 4/4 |
| `skill-git-hygiene` | 4/4 | 4/4 |
| `skill-tdd-bugfix` | 3/4 | 4/4 |
| `skill-report-synthesis` | 3/4 | 4/4 |

## Interpretation

The result is the first useful positive signal for the Skill IR AOT direction:

- `ir-profile` improves paired success by 2 cases out of 24 without introducing regressions.
- The gains appear in two different skill categories: workflow/diagnostic TDD and generative/report synthesis.
- The improvement is visible in both development and held-out coverage, and across clean/noisy contexts.
- The cost tradeoff is real: `ir-profile` uses about 16.1% more mean tokens and about 4.8% more mean latency in this run.

This should be described as a bounded seed-corpus result, not a full benchmark conclusion. It supports the claim that IR/profile-guided materialization can make skill behavior more stable, while also showing that cost must be measured and optimized.

## Post-Run Context Audit

A follow-up context perturbation audit found that this run's `clean` and `noisy` cases used distinct context labels, but the task materialization did not yet inject full noisy-context distractor text. The aggregate paired comparison remains useful because systems are still compared on identical case ids and identical task inputs, but the context-specific interpretation should be stated carefully: this run is stronger evidence for six-skill, two-task paired behavior than for robustness under true noisy context.

After the audit, `buildSkvmTaskJson` now injects real `noisy`, `long`, and `compressed` perturbation text. Future context experiments should be generated after that change.

Additional diagnostic artifacts from the scored results:

```text
results/skill-ir/discriminative-task11-slices-2026-07-09.csv
results/skill-ir/discriminative-task11-paired-deltas-2026-07-09.csv
```

## Paired Gains

Two paired cases improved:

```text
skill-tdd-bugfix:skvm:linux:clean:tdd-empty-input-001
original failed: Failing test is mentioned before implementation.
ir-profile passed.
```

The original output described the implementation and then mentioned that a failing test had been added. The `ir-profile` output explicitly started with the failing test before the concrete fix and verification steps.

```text
skill-report-synthesis:skvm:linux:noisy:report-lab-update-001
original failed: Required sections are present.
ir-profile passed.
```

The original output used numbered sections but omitted the expected Summary/Evidence section structure under noisy context. The `ir-profile` output preserved Summary, Evidence, Evidence Limitations, and Next Steps.

## Scorer Adjustment

Inspecting failed rows revealed a scorer false negative: outputs with the heading `Evidence Limitations` were not accepted by the `Evidence limitation is mentioned.` criterion when no other matching phrase was present. The scorer now accepts both singular and plural limitation headings, and the run was rescored after this fix.

## Follow-Up

- Add `long` context next, but keep systems limited to `original` and `ir-profile` until the token cost is understood.
- Add at least one second model route to check whether the paired gains survive model variation.
- Convert the two paired gains into report case studies with short output excerpts and scorer rationale.
- Investigate high-token rows, especially the original `skill-tdd-bugfix` clean development row and the `ir-profile` report synthesis noisy row.
