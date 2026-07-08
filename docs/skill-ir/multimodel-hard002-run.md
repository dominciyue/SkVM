# Multi-Model Hard-002 Task 11 Run

## Purpose

This document records the next Task 11 deepening stage after the first `gpt-4.1-nano` positive result. The stage had three goals:

1. Add a route-health probe so candidate models are checked before larger real-agent runs.
2. Expand the six-skill hard held-out corpus from 18 to 24 tasks.
3. Run a small multi-model comparison over the new hard-002 tasks.

## Route Probe

Probe date: 2026-07-09.

Probe case:

```text
system: original
context: compressed
agent: skvm
environment: linux
task: report-overclaim-hard-001
timeout: 35000 ms
```

Candidate routes:

| Model | Status | Duration ms |
|---|---:|---:|
| `xty/gpt-4.1-mini` | ok | 7016 |
| `xty/gpt-4.1-nano` | ok | 6799 |
| `xty/gpt-4o-mini` | ok | 6718 |
| `xty/gemini-2.5-flash` | ok | 9963 |
| `xty/deepseek-v3` | ok | 15004 |

Archived probe result:

```text
results/skill-ir/route-probe-results-2026-07-09.jsonl
```

The probe selected three routes for the first multi-model matrix:

```text
xty/gpt-4.1-mini
xty/gpt-4.1-nano
xty/gemini-2.5-flash
```

## Hard-002 Task Expansion

Each existing deep benchmark skill received one additional hard held-out task:

| Skill | New task |
|---|---|
| `skill-review` | `review-data-loss-hard-002` |
| `skill-ci-diagnostic` | `ci-engine-warning-hard-002` |
| `skill-env-portability` | `portable-env-chain-hard-002` |
| `skill-git-hygiene` | `commit-partial-index-hard-002` |
| `skill-tdd-bugfix` | `tdd-whitespace-name-hard-002` |
| `skill-report-synthesis` | `report-conflicting-notes-hard-002` |

The seed corpus now has:

```text
6 deep benchmark skills
x 4 tasks per skill: one development task and three held-out tasks
= 24 seed tasks
```

The default matrix now contains:

```text
6 skills x 2 agents x 3 environments x 4 contexts x 4 tasks per skill x 6 systems = 3456 cases
```

## Multi-Model Scope

The real-agent matrix used only the six new hard-002 tasks:

```text
6 hard-002 tasks
x 1 context: compressed
x 2 systems: original and ir-profile
x 1 agent label: skvm
x 1 environment label: linux
x 3 model routes
= 36 executed rows
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

## Commands

Dry-run audit:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=review-data-loss-hard-002,ci-engine-warning-hard-002,portable-env-chain-hard-002,commit-partial-index-hard-002,tdd-whitespace-name-hard-002,report-conflicting-notes-hard-002' '--limit=12' '--model=xty/gpt-4.1-nano' '--adapter=bare-agent' '--out-dir=results/skill-ir/multimodel-hard002-dry-run-2026-07-09'
```

Dry-run audit result:

```text
12 rows
6 unique paired case ids
6 original rows
6 ir-profile rows
2 rows per skill
2 rows per hard-002 task
12 compressed rows
12 commands with --model=xty/gpt-4.1-nano
compressed prompt markers present
```

Each real execution used the same filters plus `--execute`, `--retries=1`, `--retry-delay-ms=1000`, and `--require-env=SKVM_XTY_API_KEY`.

## Archived Outputs

Probe:

```text
results/skill-ir/route-probe-results-2026-07-09.jsonl
```

Per-model scored outputs:

```text
results/skill-ir/multimodel-hard002-gpt41mini-results-2026-07-09.jsonl
results/skill-ir/multimodel-hard002-gpt41mini-table-2026-07-09.csv
results/skill-ir/multimodel-hard002-gpt41mini-slices-2026-07-09.csv
results/skill-ir/multimodel-hard002-gpt41mini-paired-deltas-2026-07-09.csv

results/skill-ir/multimodel-hard002-gpt41nano-results-2026-07-09.jsonl
results/skill-ir/multimodel-hard002-gpt41nano-table-2026-07-09.csv
results/skill-ir/multimodel-hard002-gpt41nano-slices-2026-07-09.csv
results/skill-ir/multimodel-hard002-gpt41nano-paired-deltas-2026-07-09.csv

results/skill-ir/multimodel-hard002-gemini25flash-results-2026-07-09.jsonl
results/skill-ir/multimodel-hard002-gemini25flash-table-2026-07-09.csv
results/skill-ir/multimodel-hard002-gemini25flash-slices-2026-07-09.csv
results/skill-ir/multimodel-hard002-gemini25flash-paired-deltas-2026-07-09.csv
```

Cross-model summary:

```text
results/skill-ir/multimodel-hard002-model-summary-2026-07-09.csv
```

Raw execution directories were removed after scoring.

## Execution Health

| Model | Rows | Exit 0 | Infrastructure failures | Notes |
|---|---:|---:|---:|---|
| `xty/gpt-4.1-mini` | 12 | 12 | 0 | One initial bad-key rerun was overwritten before archiving. |
| `xty/gpt-4.1-nano` | 12 | 12 | 0 | Clean execution. |
| `xty/gemini-2.5-flash` | 12 | 8 | 4 | Two paired cases failed on both systems with upstream OCI 400 `toolCalls[0].id` errors after retry. |

Gemini infrastructure failures are not interpreted as skill regressions. Paired deltas skip rows where either side has `failureType: infrastructure`.

## Scorer Adjustment

Raw-output audit found additional valid hard-002 wording shapes:

- `High-Severity` with a hyphen and data-loss wording.
- Warnings described as `red herrings`.
- Secret-like `.skvm/config.json` and raw logs described as staying local or excluded from commit.
- Whitespace-only display-name tests described as strings of spaces.
- Reports avoiding overclaiming with `cannot yet generalize`, `preliminary`, `limited scope`, and `overstatement`.
- Markdown and prose variants of findings-first headings, such as `**Findings:**` and `Here are the findings...`.

Regression tests were added in `src/benchmarks/skill-ir/scoring.test.ts`, the matcher was updated in `src/benchmarks/skill-ir/scoring.ts`, and all affected runs were rescored from the same raw logs.

## Summary

| Model | System | Mean success | Rule violations | Paired cases | Paired delta | Infra failures | Mean latency ms | Mean token cost |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `gpt-4.1-mini` | `original` | 1.0 | 0 | 0 | 0.0 | 0 | 6760.33 | 1218.33 |
| `gpt-4.1-mini` | `ir-profile` | 1.0 | 0 | 6 | 0.0 | 0 | 14747.17 | 1833.67 |
| `gpt-4.1-nano` | `original` | 1.0 | 0 | 0 | 0.0 | 0 | 15579.17 | 2928.5 |
| `gpt-4.1-nano` | `ir-profile` | 1.0 | 0 | 6 | 0.0 | 0 | 22832.33 | 2813.0 |
| `gemini-2.5-flash` | `original` | 0.6667 | 0 | 0 | 0.0 | 2 | 7572.0 | 1172.75 |
| `gemini-2.5-flash` | `ir-profile` | 0.6667 | 0 | 4 | 0.0 | 2 | 10717.5 | 1648.75 |

## Interpretation

The hard-002 run expands coverage and validates the multi-model route workflow, but it does not produce a new quality gain:

- On `gpt-4.1-mini`, both systems pass all six hard-002 tasks.
- On `gpt-4.1-nano`, both systems pass all six hard-002 tasks.
- On `gemini-2.5-flash`, both systems pass all four non-infrastructure paired cases; two paired cases fail due to upstream provider/tool-call format errors on both systems.

This means hard-002 tasks broaden the corpus and improve scorer realism, but they are not yet more discriminative than the previous `report-overclaim-hard-001` second-model result.

The useful Task 11 conclusion is now sharper:

```text
Skill IR currently shows bounded positive evidence on one structure-sensitive report task under gpt-4.1-nano compressed context.
The expanded hard-002 task set did not add new quality gains, but it confirms the runner/scorer/analyzer can support multi-model evaluation and exposes model-route infrastructure instability.
```

## Follow-Up

- Keep route probe as a mandatory preflight before model expansion.
- Add a route/model failure dimension to reporting when cross-family routes have provider-specific failures.
- Create a third hard-task wave that is more adversarial to original skills, especially around output schema enforcement, instruction conflicts, and compressed-context recovery.
- Consider running `deepseek-v3` next because it probed successfully and may offer a more meaningful cross-family comparison than the Gemini route through this gateway.
