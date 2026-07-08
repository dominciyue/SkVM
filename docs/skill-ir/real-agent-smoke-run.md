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

The smoke run used an OpenAI-compatible route with a temporary local SkVM cache config:

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

## Interpretation

This smoke run validates the Task 11 pipeline and proves that the OpenAI-compatible route can drive `bare-agent` through SkVM. It also shows why Task 11 evaluation needs separate fields for task failure, provider failure, and scoring failure before producing final research claims.

The scored JSONL now records a coarse `failureType` for non-zero exits. The final evaluator should carry this further into aggregate tables so infrastructure failures do not look like skill regressions:

- model/agent task failure,
- provider/network infrastructure failure,
- scorer/verifier failure,
- true skill rule violation.

## Follow-Up

- Add retry or infra-failure classification before running a larger matrix.
- Keep raw run directories local unless a specific run is intentionally archived.
- Run at least one additional model after the pipeline is stable to avoid overfitting conclusions to `gpt-4.1-mini`.
- Expand the deep benchmark only after the evaluator separates infrastructure failures from actual skill behavior.
