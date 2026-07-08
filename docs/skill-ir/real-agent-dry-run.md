# Skill IR Real-Agent Dry Run

## Purpose

Task 11A builds the bridge from the Skill IR benchmark matrix to real SkVM agent execution. It does not yet claim final benchmark results. It prepares task files, materializes system-specific skill files, and generates reproducible `skvm run` commands.

This stage exists before full corpus expansion so the experiment harness can be checked on a small seed benchmark.

## Files

Implementation:

```text
src/benchmarks/skill-ir/real-agent.ts
src/benchmarks/skill-ir/real-agent-run.ts
src/benchmarks/skill-ir/scoring.ts
src/benchmarks/skill-ir/score-real-agent-runs.ts
```

Tests:

```text
src/benchmarks/skill-ir/real-agent.test.ts
src/benchmarks/skill-ir/scoring.test.ts
```

Generated dry-run output, when the CLI is run:

```text
results/skill-ir/real-agent-dry-run/
```

The generated dry-run directory is an execution artifact. It should not be committed unless a specific evaluation run needs to be archived.

## What The Harness Does

For each selected matrix case, the harness:

1. Reads the current Skill IR fixture.
2. Reads the current benchmark task fixture.
3. Converts the task into a SkVM `task.json`.
4. Materializes a system-specific `SKILL.md` when the system uses a skill.
5. Builds a `bun run skvm run ...` command.
6. Writes a `plan.json` containing the commands.

The default mode is dry-run. It does not call a model.

## System Materialization

| System | Materialization |
|---|---|
| `no-skill` | No `--skill` flag. |
| `original` | Renders the original source skill text. |
| `skvm-aot` | Renders a SkVM AOT baseline placeholder; replace with real `skvm aot-compile` proposal path when available. |
| `ir-only` | Renders initial Skill IR steps and rules. |
| `ir-static` | Applies rule normalization and environment guard insertion before rendering checks. |
| `ir-profile` | Applies static passes plus profile-guided repair before rendering checks and recovery policies. |

The `skvm-aot` path is intentionally conservative. It does not fake a true SkVM compiler result.

## Command Line

Generate a small dry-run plan:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--out-dir=results/skill-ir/real-agent-dry-run'
```

PowerShell users should quote comma-separated arguments such as `--systems=no-skill,original`. Without quotes, PowerShell can split the comma list before it reaches Bun.

Execute the generated plan against a real model:

```powershell
$env:OPENROUTER_API_KEY="sk-or-..."
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--model=openrouter/anthropic/claude-sonnet-4.6' '--adapter=bare-agent' '--execute'
```

Use one infrastructure retry for unstable gateways:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--execute' '--retries=1' '--retry-delay-ms=1000'
```

Retries are off by default. They only apply to rows that look like provider, network, auth, rate-limit, or timeout failures. Agent failures are not retried.

The `--execute` mode writes raw execution logs to:

```text
results/skill-ir/real-agent-dry-run/raw-runs.jsonl
```

`raw-runs.jsonl` is execution-only. It should not be treated as final scored benchmark results until a scoring step maps outputs to `success`, `ruleViolations`, `stepCoverage`, token cost, and latency.

Score the raw execution logs into analyzer-compatible results:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--raw=results/skill-ir/real-agent-dry-run/raw-runs.jsonl' '--tasks=benchmarks/skill-ir/tasks/review-skill-tasks.json' '--out=results/skill-ir/main-results.jsonl'
```

Then produce a summary table:

```powershell
python scripts/analyze_skill_ir_results.py results/skill-ir/main-results.jsonl results/skill-ir/main-table.csv
```

See `docs/skill-ir/real-agent-scoring.md` for the scorer contract and current heuristic criteria.

See `docs/skill-ir/real-agent-smoke-run.md` for the first real-agent smoke run through an OpenAI-compatible gateway.

## Public Helpers

```ts
buildSkvmTaskJson(task, opts)
renderSkillMarkdown(ir, system)
materializeCaseArtifacts(opts)
buildSkvmRunCommand(opts)
buildRunPlanEntry(materialized, opts)
```

These helpers are tested independently so real API calls are not needed for code verification.

## Required User Inputs For Real Execution

To actually call a real agent, the user must provide:

- A model id, for example `openrouter/anthropic/claude-sonnet-4.6`.
- A matching API key or configured provider route.
- An adapter, initially `bare-agent` is recommended.

For OpenRouter:

```powershell
$env:OPENROUTER_API_KEY="sk-or-..."
```

For Anthropic:

```powershell
$env:ANTHROPIC_API_KEY="sk-ant-..."
```

## Relationship To Task 11

Task 11A is a dry-run and execution harness. It is not the final evaluation.

The remaining Task 11 work is:

1. Run real agent execution with a configured model/API key.
2. Score `raw-runs.jsonl` into `main-results.jsonl`.
3. Run the analyzer to produce `main-table.csv`.
4. Write case studies from real or clearly marked dry-run data.
5. Expand the deep benchmark corpus after the pipeline is stable.

## Verification

Run focused tests:

```powershell
bun test ./src/benchmarks/skill-ir/real-agent.test.ts
bun test ./src/benchmarks/skill-ir/scoring.test.ts
```

Run a dry-run plan:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--out-dir=results/skill-ir/real-agent-dry-run'
```

Run current TypeScript checks:

```powershell
bun run typecheck
```

## Failure Modes

- Missing model/API key only matters with `--execute`.
- Unquoted comma-separated PowerShell args can produce an empty plan.
- `skvm run` executes but does not score; run `score-real-agent-runs.ts` before feeding data into the final analyzer.
- The current `skvm-aot` materialization is a placeholder until a real `skvm aot-compile` proposal path is wired in.
- The current scorer is heuristic and only supports the seed review criteria. Unsupported criteria fail closed.
- Retry can hide transient gateway instability, so raw rows include `attempts` when execution uses retry. Keep `--retries` small for research runs.

## Modification Notes

- Keep dry-run mode API-key-free.
- Do not commit generated dry-run artifacts unless the run is intentionally archived.
- Add tests before changing command construction or materialized file shapes.
- Keep raw execution logs separate from scored `main-results.jsonl`.
