# IR-PGO Validation Run With gpt-4.1-nano

## Purpose

This run checks whether the Task 11C final IR artifact can be used in a real `ir-pgo` execution and whether the dynamic profile feedback changes behavior on report-synthesis tasks.

It is intentionally small. The goal is mechanism validation and a first quality check, not a broad final benchmark claim.

## Scope

Run date: 2026-07-09.

Provider route:

```text
xty/* -> openai-compatible https://svip.xty.app/v1
```

Model and adapter:

```text
xty/gpt-4.1-nano
bare-agent
```

Matrix:

```text
2 report-synthesis held-out tasks
x 1 context: compressed
x 3 systems: original, ir-profile, ir-pgo
x 1 agent label: skvm
x 1 environment label: linux
= 6 executed rows
```

Tasks:

```text
report-overclaim-hard-001
report-conflicting-notes-hard-002
```

`report-overclaim-hard-001` is the task that generated the Task 11C profile annotation in the earlier calibration artifact, so it should be treated as calibration replay evidence. `report-conflicting-notes-hard-002` is a nearby held-out report task and is a better check of whether the required-section profile repair generalizes within the same skill.

## Final IR Input

The run used:

```text
results/skill-ir/profiled-ir-gpt41nano-2026-07-09/final-ir
```

The `ir-pgo` materialized skill included:

```text
check-rule-required-sections-profile
recover-rule-required-sections
```

This confirms that the profile overlay and final IR were not just written as files; they were consumed by the real-agent materialization path.

## Commands

Dry-run audit:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile,ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=report-overclaim-hard-001,report-conflicting-notes-hard-002' '--limit=6' '--model=xty/gpt-4.1-nano' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/profiled-ir-gpt41nano-2026-07-09/final-ir' '--out-dir=results/skill-ir/ir-pgo-validation-gpt41nano-dry-run-2026-07-09'
```

Real execution used the same filters plus:

```text
--execute
--retries=1
--retry-delay-ms=1000
--require-env=SKVM_XTY_API_KEY
```

Score and analyze:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/ir-pgo-validation-gpt41nano-run-2026-07-09/raw-runs.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--out=results/skill-ir/ir-pgo-validation-gpt41nano-results-2026-07-09.jsonl'
python scripts/analyze_skill_ir_results.py results/skill-ir/ir-pgo-validation-gpt41nano-results-2026-07-09.jsonl results/skill-ir/ir-pgo-validation-gpt41nano-table-2026-07-09.csv
python scripts/analyze_skill_ir_slices.py --input results/skill-ir/ir-pgo-validation-gpt41nano-results-2026-07-09.jsonl --slices-out results/skill-ir/ir-pgo-validation-gpt41nano-slices-2026-07-09.csv --paired-out results/skill-ir/ir-pgo-validation-gpt41nano-paired-deltas-2026-07-09.csv --manifest benchmarks/skill-ir/corpus/manifest.json --root-dir .
```

Archived scored outputs:

```text
results/skill-ir/ir-pgo-validation-gpt41nano-results-2026-07-09.jsonl
results/skill-ir/ir-pgo-validation-gpt41nano-table-2026-07-09.csv
results/skill-ir/ir-pgo-validation-gpt41nano-slices-2026-07-09.csv
results/skill-ir/ir-pgo-validation-gpt41nano-paired-deltas-2026-07-09.csv
```

Raw execution and dry-run directories are execution artifacts and are not intended to be committed.

## Execution Health

Raw-run inspection:

```text
rows: 6
exitCode=0: 6
attempts=1: 6
systems: original=2, ir-profile=2, ir-pgo=2
infrastructure markers: 0
duration range: 5563 ms to 83915 ms
```

The high maximum duration came from `ir-pgo` on `report-overclaim-hard-001`. It completed successfully, but the latency is a risk to track in later runs.

## Scorer Adjustment

The first scoring pass incorrectly failed all six outputs, mostly on `Overclaiming is avoided`, and one output on `Evidence limitation is mentioned`.

Raw-output audit showed that the outputs used real but previously unsupported conservative phrasing:

```text
Evidence Limits
may not generalize
do not yet observe a clear quality improvement
cannot generalize broader superiority
broader generalization remains unverified
generalization is untested
promising but preliminary
```

A regression test was added before changing the matcher:

```powershell
bun test ./src/benchmarks/skill-ir/scoring.test.ts --test-name-pattern "ir-pgo validation report wording"
```

After the matcher update, the focused test and full scoring test passed, then the same raw rows were rescored.

## Summary

| System | Mean success | Worst-case success | Rule violations | Mean latency ms | Mean token cost | Paired cases | Paired delta | Infrastructure failures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `original` | 1.0 | 1.0 | 0 | 7062.0 | 1157.5 | 0 | 0.0 | 0 |
| `ir-profile` | 1.0 | 1.0 | 0 | 7646.5 | 1961.5 | 2 | 0.0 | 0 |
| `ir-pgo` | 1.0 | 1.0 | 0 | 45586.0 | 1587.0 | 2 | 0.0 | 0 |

Per-task paired result:

| Task | `ir-profile` vs original | `ir-pgo` vs original |
|---|---|---|
| `report-overclaim-hard-001` | same: both pass | same: both pass |
| `report-conflicting-notes-hard-002` | same: both pass | same: both pass |

## Interpretation

This run confirms the `ir-pgo` mechanism:

- Final IR is consumed by the real-agent runner.
- Profile-guided checks and recovery policies appear in the materialized skill.
- The run completes with no infrastructure failures.

It does not show a new quality gain. `original`, static `ir-profile`, and dynamic `ir-pgo` all pass both report tasks after scorer correction. That means the current profile annotation is not harmful on this small sample, but it also does not yet prove that dynamic feedback improves held-out behavior beyond static IR materialization.

The result is consistent with the new validation strategy: small sampled validation can promote confidence in mechanism and non-regression, but stronger quality claims need broader held-out tasks or harder cases where the baseline still fails.

## Follow-Up

- Add more report-synthesis tasks that specifically stress required-section omission under compressed or conflicting context.
- Run `ir-pgo` on a broader sample only after route probing candidate non-GPT models.
- Track latency as a first-class promotion criterion; `ir-pgo` should not be promoted on quality parity if it adds large latency variance.
