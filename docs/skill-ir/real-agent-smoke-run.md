# Skill IR Real-Agent Smoke Run

## Purpose

This document records the first real-agent Task 11 smoke run through an OpenAI-compatible aggregation gateway. It is not a final benchmark result. Its purpose is to verify the end-to-end path:

```text
materialized Skill IR cases
  -> skvm run with bare-agent
  -> raw-runs.jsonl
  -> scored JSONL
  -> analyzer CSV
```

## Provider Setup

The smoke run used an OpenAI-compatible route with a temporary local SkVM cache config at:

```text
.skvm/skvm.config.json
```

The file name matters. SkVM reads `$SKVM_CACHE/skvm.config.json`; `.skvm/config.json` is ignored by the provider registry.

```json
{
  "providers": {
    "routes": [
      {
        "match": "xty/*",
        "kind": "openai-compatible",
        "apiKeyEnv": "SKVM_XTY_API_KEY",
        "baseUrl": "https://svip.xty.app/v1"
      }
    ]
  }
}
```

The API key was supplied only through `SKVM_XTY_API_KEY` in the shell environment. It was not written to the repository or to this document.

The model used for the smoke run was:

```text
xty/gpt-4.1-mini
```

`SKVM_AUTO_PROBE=0` was set for this run to avoid extra gateway probe calls and config mutation during the smoke test.

## Root-Cause Finding

The first real-agent attempt exposed a benchmark fixture issue: the review seed tasks only described the kind of change to review, but did not include the actual patch or fixture files. The bare agent correctly reported that there were no files or snippets to review.

The fix was to make the review tasks self-contained by embedding concrete fenced `diff` patches in the task prompts. A corpus fixture test now enforces this for the current seed review tasks.

Changed files:

```text
benchmarks/skill-ir/tasks/review-skill-tasks.json
src/skill-ir/corpus-fixtures.test.ts
docs/skill-ir/corpus-fixtures.md
```

## Commands

Small paired smoke run:

```powershell
$env:SKVM_CACHE=(Resolve-Path .skvm).Path
$env:SKVM_XTY_API_KEY="<redacted>"
$env:SKVM_AUTO_PROBE="0"
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=2' '--systems=no-skill,original' '--contexts=clean' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--out-dir=results/skill-ir/real-agent-smoke-run-2026-07-08' '--execute'
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/real-agent-smoke-run-2026-07-08/raw-runs.jsonl' '--tasks=benchmarks/skill-ir/tasks/review-skill-tasks.json' '--out=results/skill-ir/smoke-results-2026-07-08.jsonl'
python scripts/analyze_skill_ir_results.py results/skill-ir/smoke-results-2026-07-08.jsonl results/skill-ir/smoke-table-2026-07-08.csv
```

Small matrix smoke run:

```powershell
$env:SKVM_CACHE=(Resolve-Path .skvm).Path
$env:SKVM_XTY_API_KEY="<redacted>"
$env:SKVM_AUTO_PROBE="0"
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=12' '--systems=no-skill,original,skvm-aot,ir-only,ir-static,ir-profile' '--contexts=clean' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--out-dir=results/skill-ir/real-agent-smoke-matrix-2026-07-08' '--execute'
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/real-agent-smoke-matrix-2026-07-08/raw-runs.jsonl' '--tasks=benchmarks/skill-ir/tasks/review-skill-tasks.json' '--out=results/skill-ir/smoke-matrix-results-2026-07-08.jsonl'
python scripts/analyze_skill_ir_results.py results/skill-ir/smoke-matrix-results-2026-07-08.jsonl results/skill-ir/smoke-matrix-table-2026-07-08.csv
```

## Smoke Results

The paired smoke run produced two successful scored rows:

```text
results/skill-ir/smoke-results-2026-07-08.jsonl
results/skill-ir/smoke-table-2026-07-08.csv
```

The 12-cell smoke matrix produced:

```text
results/skill-ir/smoke-matrix-results-2026-07-08.jsonl
results/skill-ir/smoke-matrix-table-2026-07-08.csv
```

Observed matrix summary:

- `skvm-aot`, `ir-only`, `ir-static`, and `ir-profile`: 2/2 scored successes.
- `no-skill` and `original`: 1/2 scored successes in the matrix file.
- The two failed rows were both first-task infrastructure failures: `ProviderNetworkError: openai-compatible(svip.xty.app) network error: The operation timed out.`
- The scored JSONL marks these rows with `failureType: "infrastructure"`.
- A separate paired retry for the same first task completed successfully for both `no-skill` and `original`, so these two matrix failures should be treated as gateway/transport instability, not as final method regressions.
- The summary analyzer skips infrastructure-failure rows when computing paired deltas, so the optimized systems are not credited for beating a timed-out baseline.

## Interpretation

This smoke run validates the Task 11 pipeline and proves that the OpenAI-compatible route can drive `bare-agent` through SkVM. It also shows why Task 11 evaluation needs separate fields for task failure, provider failure, and scoring failure before producing final research claims.

The scored JSONL now records a coarse `failureType` for non-zero exits, and the summary analyzer reports `infrastructure_failures` and `agent_failures`. This keeps provider instability from looking like skill regressions:

- model/agent task failure,
- provider/network infrastructure failure,
- scorer/verifier failure,
- true skill rule violation.

Paired comparison is only meaningful when both baseline and compared rows are valid task attempts. Infrastructure failures are still visible in `mean_success` and failure counts, but they are excluded from `paired_delta_success`, `regression_count`, and `negative_delta_count`.

## Multi-Skill Smoke Setup Notes

The first 2026-07-09 multi-skill smoke attempts were intentionally discarded after raw-log inspection:

- `multi-skill-smoke-run-2026-07-09` used `.skvm/config.json`, so SkVM ignored the intended `xty/*` route and fell back to the built-in OpenRouter route.
- `multi-skill-smoke-run-2026-07-09-r2` used `.skvm/skvm.config.json`, so the route matched, but every row failed before model execution with `ProviderAuthError` because `SKVM_XTY_API_KEY` was missing inside the execution process.

These runs are infrastructure setup failures, not skill or model results. The runner now supports `--require-env=` so a missing key can fail before generating raw execution rows.

## Multi-Skill Smoke Results

The valid 2026-07-09 `r3` run covered six deep-benchmark seed skills, one development task per skill, the `skvm` agent label, the `linux` environment label, clean context, and two systems: `original` and `ir-profile`.

Archived scored outputs:

```text
results/skill-ir/multi-skill-smoke-results-2026-07-09-r3.jsonl
results/skill-ir/multi-skill-smoke-table-2026-07-09-r3.csv
```

Summary table:

| System | Mean success | Rule violations | Infrastructure failures | Agent failures | Paired delta vs original |
|---|---:|---:|---:|---:|---:|
| `original` | 1.0 | 0 | 0 | 0 | 0.0 |
| `ir-profile` | 1.0 | 0 | 0 | 0 | 0.0 |

Per-skill result:

| Skill | `original` | `ir-profile` |
|---|---:|---:|
| `skill-review` | pass | pass |
| `skill-ci-diagnostic` | pass | pass |
| `skill-env-portability` | pass | pass |
| `skill-git-hygiene` | pass | pass |
| `skill-tdd-bugfix` | pass | pass |
| `skill-report-synthesis` | pass | pass |

This result validates that the expanded six-skill seed corpus can run through the real-agent path and be scored through manifest-based task lookup. It does not yet show an effectiveness improvement because both compared systems pass all six selected development tasks.

The run also exposed a cost signal: `ir-profile` generally used more input tokens than `original`, and `skill-report-synthesis` under `ir-profile` was much slower than the corresponding `original` row. This should be tracked before scaling the matrix, because a stable skill can still be too verbose or expensive.

## Follow-Up

- Use `--retries=1` or another small retry budget before running a larger matrix through an unstable gateway.
- The multi-skill smoke uses explicit filters to cover one development task from each deep-benchmark skill while keeping cost bounded:

```powershell
$env:SKVM_CACHE=(Resolve-Path .skvm).Path
$env:SKVM_XTY_API_KEY="<redacted>"
$env:SKVM_AUTO_PROBE="0"
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile' '--contexts=clean' '--agents=skvm' '--environments=linux' '--tasks=review-finding-order-001,ci-node-version-001,portable-env-var-001,dirty-worktree-001,tdd-empty-input-001,report-experiment-notes-001' '--limit=12' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--out-dir=results/skill-ir/multi-skill-smoke-run-2026-07-09-r3' '--execute' '--retries=1' '--retry-delay-ms=1000' '--require-env=SKVM_XTY_API_KEY'
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/multi-skill-smoke-run-2026-07-09-r3/raw-runs.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--out=results/skill-ir/multi-skill-smoke-results-2026-07-09-r3.jsonl'
python scripts/analyze_skill_ir_results.py results/skill-ir/multi-skill-smoke-results-2026-07-09-r3.jsonl results/skill-ir/multi-skill-smoke-table-2026-07-09-r3.csv
```

- Keep raw run directories local unless a specific run is intentionally archived.
- Run at least one additional model after the pipeline is stable to avoid overfitting conclusions to `gpt-4.1-mini`.
- Expand the deep benchmark only after checking that infrastructure failures remain low, cost remains acceptable, and failures are reported separately.
