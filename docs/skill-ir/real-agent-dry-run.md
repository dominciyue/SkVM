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

1. Resolves the explicitly selected corpus through the corpus registry.
2. Loads each selected skill's `irPath` and `tasksPath`.
3. Converts the task into a SkVM `task.json`, including the selected context perturbation.
4. Materializes a system-specific `SKILL.md` when the system uses a skill.
5. Builds a `bun run skvm run ...` command.
6. Writes a `plan.json` containing the commands.

The default mode is dry-run. It does not call a model.

The cold-start default system axis is `no-skill | original | ir-static`. Passing `--systems=` replaces that axis before matrix construction, so archived systems such as `ir-profile` and explicit ablations such as `ir-only` remain runnable. `ir-pgo` is explicit only: it requires held-out tasks and a Final IR directory with a valid sibling `provenance.json`. Base IR can never masquerade as PGO.

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
| `original` | Injects the exact source bytes. File-backed skills are SHA-256 verified and their relative resource closure is copied. |
| `skvm-aot` | Renders a SkVM AOT baseline placeholder; replace with real `skvm aot-compile` proposal path when available. |
| `ir-only` | Renders initial Skill IR steps and rules. |
| `ir-static` | Applies rule normalization and environment guard insertion before rendering checks. |
| `ir-profile` | Applies static passes plus profile-guided repair to the input IR. In the seed corpus this is mostly static materialization unless the IR already contains `profile` annotations. |
| `ir-pgo` | Applies the same profile-guided materialization path to final IR generated from scored result feedback. Use this for Task 11C profile-guided optimization experiments. |

The `skvm-aot` path is intentionally conservative. It does not fake a true SkVM compiler result.

Current checker/controller text is agent-facing material, not independently executed runtime enforcement.

See `docs/skill-ir/profile-feedback-loop.md` for the command that creates profile overlay and final IR artifacts before running `ir-pgo`.

## Command Line

Generate a small dry-run plan:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=calibration' '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--out-dir=results/skill-ir/real-agent-dry-run'
```

PowerShell users should quote comma-separated arguments such as `--systems=no-skill,original`. Without quotes, PowerShell can split the comma list before it reaches Bun.

For controlled corpus expansion, narrow the matrix before applying `--limit`:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=calibration' '--systems=no-skill,original,ir-static' '--contexts=clean' '--agents=skvm' '--environments=windows' '--tasks=review-finding-order-001,ci-node-version-001,portable-env-var-001,dirty-worktree-001,tdd-empty-input-001,report-experiment-notes-001' '--limit=18' '--out-dir=results/skill-ir/multi-skill-smoke-dry-run'
```

The runner supports these selection filters:

| Flag | Matches matrix field |
|---|---|
| `--corpus=` | required corpus id: `calibration` or `pilot` |
| `--allow-tasks-authored` | restricted pre-IR pilot calibration; requires one skill, explicit development tasks, clean context, and exactly `no-skill,original` |
| `--skills=` | explicit skill id filter; exactly one is mandatory with `--allow-tasks-authored` |
| `--systems=` | system configuration, such as `original` or `ir-profile` |
| `--contexts=` | benchmark context id |
| `--agents=` | target agent label, such as `skvm` or `codex` |
| `--environments=` | target environment label, such as `linux` or `windows` |
| `--tasks=` | benchmark task id |
| `--require-env=` | required shell environment variables for `--execute` mode |
| `--ir-override-dir=` | directory containing final `<skill-id>.json` IR files, typically `<profile-feedback-out>/final-ir` for `ir-pgo` runs |
| `--repetitions=` | positive executions per selected matrix cell; applied after `--limit` |
| `--model-family=` | explicit model-family label; inferred from the model id when omitted |
| `--adapter-version=` | adapter/runtime implementation label; defaults to `workspace` |
| `--panel-config-id=` | preregistered panel/configuration label; defaults to `single-run` |

`--systems` overrides the default system axis; the other filters are applied before `--limit`. A small multi-skill smoke run can therefore sample the intended skills and explicit ablations instead of accidentally taking the first rows from the default matrix order.

Every new row carries `model`, `modelFamily`, `adapter`, `adapterVersion`,
`runIndex`, and `panelConfigId`. `--limit` limits matrix cells before
`--repetitions` expands them. Each repetition receives distinct task, skill,
run, and workdir paths while retaining the paired `caseId`.

The runner fails before materialization when `--corpus` is omitted, the selected corpus has no eligible skills, or `ir-pgo` lacks a validated Final IR directory. Normal scheduling still accepts only `runnable` entries. `--allow-tasks-authored` accepts only the pilot corpus, one explicit skill, explicit development tasks, clean context, the complete `no-skill | original` pair, and no IR override. It also rejects a limit that truncates a pair. For PGO the normal path rejects development tasks, corpus mismatch, stale source/base/overlay/final digests, missing skill provenance, and selected skills with zero profile annotations.

`--agents` and `--environments` currently filter scheduling labels only. The command still uses the single global `--adapter` value and the current host OS. Do not interpret different label values as cross-agent or cross-OS execution until executor bindings are implemented.

Execute the generated plan against a real model:

```powershell
$env:OPENROUTER_API_KEY="sk-or-..."
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=calibration' '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--model=openrouter/anthropic/claude-sonnet-4.6' '--adapter=bare-agent' '--execute'
```

Use one infrastructure retry for unstable gateways:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=calibration' '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--execute' '--retries=1' '--retry-delay-ms=1000'
```

When a real run depends on provider credentials, add a pre-execution environment check:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=calibration' '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--execute' '--require-env=SKVM_XTY_API_KEY'
```

`--require-env=` accepts a comma-separated list. It fails before writing execution rows when any listed variable is missing or blank. This prevents auth failures from being mistaken for model or skill behavior.

Retries are off by default. They only apply to rows that look like transient provider, network, rate-limit, or timeout failures. Credential/auth failures are classified as infrastructure during scoring, but they are not retried because retrying cannot repair missing or invalid credentials.

Use `--root-dir=<path>` to point the runner at a temporary or alternate benchmark corpus. By default, `rootDir` is the current repository root. The runner expects:

```text
benchmarks/skill-ir/corpus/manifest.json
benchmarks/skill-ir/corpus/corpora/<corpus>.json
benchmarks/skill-ir/contexts/standard-contexts.json
```

Each normally scheduled manifest skill must provide both:

```text
irPath
tasksPath
```

The task file's `skillId` must match the manifest skill id.

For the restricted pre-IR calibration, a `tasks-authored` entry provides
`tasksPath`, `sourcePath`, and a matching `sourceFiles` SHA-256 entry instead of
`irPath`. The runner synthesizes an in-memory schema carrier only for verified
original-source materialization. It is never persisted or passed to static/PGO
systems.

For Task 11C `ir-pgo` runs, first generate profile overlay and final IR artifacts with `profile-feedback-run.ts`, then pass the generated `final-ir` directory:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=calibration' '--systems=ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=windows' '--tasks=<held-out-task-id>' '--model=<model>' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/profiled-ir/final-ir' '--out-dir=results/skill-ir/ir-pgo-held-out-dry-run'
```

The override directory is expected to contain one `<skill-id>.json` file for every runnable manifest skill and its parent must contain `provenance.json`. `profile-feedback-run.ts` writes both the complete Final IR set and provenance sidecar. Even in an explicitly mixed command, the override is applied only to `ir-pgo`; `original` and `ir-static` always materialize from base IR so their baselines cannot be contaminated.

The `--execute` mode writes raw execution logs to:

```text
results/skill-ir/real-agent-dry-run/raw-runs.jsonl
```

`raw-runs.jsonl` is execution-only. It should not be treated as final scored benchmark results until a scoring step maps outputs to `success`, `ruleViolations`, `stepCoverage`, token cost, and latency.

Each execution owns a persistent directory:

```text
<out-dir>/<case>/<system>/run-<runIndex>/workdir/
```

The exact path is passed to `skvm run --workdir`. Before every infrastructure
retry, only that run's workdir is cleared and recreated. Task fixtures are
materialized from `task.json`; file-backed skill systems receive the verified
source resource closure. Generated variants replace only `SKILL.md`, preserving
scripts and referenced resources. `no-skill` receives neither the skill nor its
private resource closure.

New raw rows persist `workDir`, complete run identity, and adapter `runStatus`.
A non-`ok` status is an execution failure even when the outer process exits zero.

Score the raw execution logs into analyzer-compatible results:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--corpus=calibration' '--raw=results/skill-ir/real-agent-dry-run/raw-runs.jsonl' '--out=results/skill-ir/main-results.jsonl'
```

Pre-IR pilot calibration must repeat the explicit scorer gate:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--corpus=pilot' '--allow-tasks-authored' '--raw=results/skill-ir/env-manager-calibration-v1/raw-runs.jsonl' '--out=results/skill-ir/env-manager-calibration-v1/scored-results.jsonl'
```

Use the same explicit corpus id for planning, execution, scoring, and profile compilation. `--manifest=<path>` remains available for isolated test fixtures and is mutually exclusive with `--corpus`.

Then produce a summary table:

```powershell
python scripts/analyze_skill_ir_results.py results/skill-ir/main-results.jsonl results/skill-ir/main-table.csv
```

See `docs/skill-ir/real-agent-scoring.md` for the deterministic artifact-evaluator contract and calibration-only heuristic compatibility path.

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
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=calibration' '--limit=4' '--systems=no-skill,original' '--contexts=clean' '--out-dir=results/skill-ir/real-agent-dry-run'
```

Run current TypeScript checks:

```powershell
bun run typecheck
```

## Failure Modes

- Missing model/API key only matters with `--execute`.
- A manifest skill without `irPath` or `tasksPath` fails before any agent call.
- A `tasks-authored` calibration entry without `sourcePath`, a matching source
  digest, or `tasksPath` fails before any agent call.
- A task file whose `skillId` does not match its manifest skill fails before materialization.
- Unquoted comma-separated PowerShell args can produce an empty plan.
- Unknown task, agent, environment, context, or system filters can produce an empty plan. Inspect `plan.json` before real execution if the selected matrix is new.
- Missing provider credentials can produce fast auth failures. Use `--require-env=<key env var>` for real runs.
- `skvm run` executes but does not score; run `score-real-agent-runs.ts` before feeding data into the final analyzer.
- The current `skvm-aot` materialization is a placeholder until a real `skvm aot-compile` proposal path is wired in.
- Real pilot tasks require explicit deterministic evaluators. Only calibration
  seed tasks use heuristic criteria, and unsupported heuristic criteria fail closed.
- Retry can hide transient gateway instability, so raw rows include `attempts` when execution uses retry. Keep `--retries` small for research runs.
- Historical result files created before the context perturbation audit may have used context labels without true noisy/long/compressed prompt perturbations.

## Modification Notes

- Keep dry-run mode API-key-free.
- Do not commit generated dry-run artifacts unless the run is intentionally archived.
- Add tests before changing command construction or materialized file shapes.
- Keep raw execution logs separate from scored `main-results.jsonl`.
- When adding a new context id, add a materialization test that proves the prompt changes in a measurable way.
