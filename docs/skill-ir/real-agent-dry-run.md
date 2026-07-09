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
src/benchmarks/skill-ir/real-agent-run.test.ts
src/benchmarks/skill-ir/scoring.test.ts
```

Generated dry-run output, when the CLI is run:

```text
results/skill-ir/real-agent-dry-run/
```

The generated dry-run directory is an execution artifact. It should not be committed unless a specific evaluation run needs to be archived.

## What The Harness Does

For each selected matrix case, the harness:

1. Reads the corpus manifest.
2. Loads each selected skill's `irPath` and `tasksPath`.
3. Converts the task into a SkVM `task.json`, including the selected context perturbation.
4. Materializes a system-specific `SKILL.md` when the system uses a skill.
5. Builds a `bun run skvm run ...` command.
6. Writes a `plan.json` containing the commands.

The default mode is dry-run. It does not call a model.

## Context Perturbations

`buildSkvmTaskJson` makes the context dimension observable in the task prompt:

| Context | Prompt behavior |
|---|---|
| `clean` | Adds only the clean context label before the task. |
| `noisy` | Adds distracting prior notes and file hints, then states that the current task is authoritative. |
| `long` | Adds a longer surrounding project/conversation context before the actionable task. |
| `compressed` | Adds a lossy prior-context summary and warns that original details may be missing. |

This matters for Task 11: context should be an actual input perturbation, not only a `caseId` label. Runs produced before the 2026-07-09 context audit may contain context labels without full perturbation text; treat those context-specific conclusions conservatively.

## System Materialization

| System | Materialization |
|---|---|
| `no-skill` | No `--skill` flag. |
| `original` | Renders the original source skill text. |
| `skvm-aot` | Renders a SkVM AOT baseline placeholder; replace with real `skvm aot-compile` proposal path when available. |
| `ir-only` | Renders initial Skill IR steps and rules. |
| `ir-static` | Applies rule normalization and environment guard insertion before rendering checks. |
| `ir-profile` | Applies static passes plus profile-guided repair to the input IR. In the seed corpus this is mostly static materialization unless the IR already contains `profile` annotations. |
| `ir-pgo` | Applies the same profile-guided materialization path to final IR generated from scored result feedback. Use this for Task 11C profile-guided optimization experiments. |

The `skvm-aot` path is intentionally conservative. It does not fake a true SkVM compiler result.

See `docs/skill-ir/profile-feedback-loop.md` for the command that creates profile overlay and final IR artifacts before running `ir-pgo`.

## Command Line

Generate a small dry-run plan:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--out-dir=results/skill-ir/real-agent-dry-run'
```

PowerShell users should quote comma-separated arguments such as `--systems=no-skill,original`. Without quotes, PowerShell can split the comma list before it reaches Bun.

For controlled corpus expansion, narrow the matrix before applying `--limit`:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile' '--contexts=clean' '--agents=skvm' '--environments=linux' '--tasks=review-finding-order-001,ci-node-version-001,portable-env-var-001,dirty-worktree-001,tdd-empty-input-001,report-experiment-notes-001' '--limit=12' '--out-dir=results/skill-ir/multi-skill-smoke-dry-run-2026-07-08'
```

The runner supports these selection filters:

| Flag | Matches matrix field |
|---|---|
| `--systems=` | system configuration, such as `original` or `ir-profile` |
| `--contexts=` | benchmark context id |
| `--agents=` | target agent label, such as `skvm` or `codex` |
| `--environments=` | target environment label, such as `linux` or `windows` |
| `--tasks=` | benchmark task id |
| `--require-env=` | required shell environment variables for `--execute` mode |
| `--ir-override-dir=` | directory containing final `<skill-id>.json` IR files, typically `<profile-feedback-out>/final-ir` for `ir-pgo` runs |

Filters are applied before `--limit`, so a small multi-skill smoke run can sample the intended skills instead of accidentally taking the first rows from the default matrix order.

Execute the generated plan against a real model:

```powershell
$env:OPENROUTER_API_KEY="sk-or-..."
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--model=openrouter/anthropic/claude-sonnet-4.6' '--adapter=bare-agent' '--execute'
```

Use one infrastructure retry for unstable gateways:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--execute' '--retries=1' '--retry-delay-ms=1000'
```

When a real run depends on provider credentials, add a pre-execution environment check:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--execute' '--require-env=SKVM_XTY_API_KEY'
```

`--require-env=` accepts a comma-separated list. It fails before writing execution rows when any listed variable is missing or blank. This prevents auth failures from being mistaken for model or skill behavior.

Retries are off by default. They only apply to rows that look like transient provider, network, rate-limit, or timeout failures. Credential/auth failures are classified as infrastructure during scoring, but they are not retried because retrying cannot repair missing or invalid credentials.

Use `--root-dir=<path>` to point the runner at a temporary or alternate benchmark corpus. By default, `rootDir` is the current repository root. The runner expects:

```text
benchmarks/skill-ir/corpus/manifest.json
benchmarks/skill-ir/contexts/standard-contexts.json
```

Each selected manifest skill must provide both:

```text
irPath
tasksPath
```

The task file's `skillId` must match the manifest skill id.

For Task 11C `ir-pgo` runs, first generate profile overlay and final IR artifacts with `profile-feedback-run.ts`, then pass the generated `final-ir` directory:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile,ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=report-overclaim-hard-001' '--model=xty/gpt-4.1-nano' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/profiled-ir-gpt41nano-2026-07-09/final-ir' '--out-dir=results/skill-ir/ir-pgo-dry-run-2026-07-09'
```

The override directory is expected to contain one `<skill-id>.json` file for every manifest skill. `profile-feedback-run.ts` writes that complete set by default.

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
buildPlan(args)
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
bun test ./src/benchmarks/skill-ir/real-agent-run.test.ts
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
- A manifest skill without `irPath` or `tasksPath` fails before any agent call.
- A task file whose `skillId` does not match its manifest skill fails before materialization.
- Unquoted comma-separated PowerShell args can produce an empty plan.
- Unknown task, agent, environment, context, or system filters can produce an empty plan. Inspect `plan.json` before real execution if the selected matrix is new.
- Missing provider credentials can produce fast auth failures. Use `--require-env=<key env var>` for real runs.
- `skvm run` executes but does not score; run `score-real-agent-runs.ts` before feeding data into the final analyzer.
- The current `skvm-aot` materialization is a placeholder until a real `skvm aot-compile` proposal path is wired in.
- The current scorer is heuristic and only supports the seed review criteria. Unsupported criteria fail closed.
- Retry can hide transient gateway instability, so raw rows include `attempts` when execution uses retry. Keep `--retries` small for research runs.
- Historical result files created before the context perturbation audit may have used context labels without true noisy/long/compressed prompt perturbations.

## Modification Notes

- Keep dry-run mode API-key-free.
- Do not commit generated dry-run artifacts unless the run is intentionally archived.
- Add tests before changing command construction or materialized file shapes.
- Keep raw execution logs separate from scored `main-results.jsonl`.
- When adding a new context id, add a materialization test that proves the prompt changes in a measurable way.
