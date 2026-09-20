# SkVM Usage

Command reference and workflows for the `skvm` CLI. For a 1-minute onboarding see the [README](../README.md); for subsystem and data-layout details see [architecture.md](architecture.md).

## CLI conventions

```bash
skvm <command> [options]
skvm --help
skvm <command> --help
skvm --verbose <command>           # enable debug logging
```

Flags use `--key=value` format (no space-separated form). `bun run skvm ...` works interchangeably with the installed `skvm` binary — all examples below use `skvm` for brevity.

For multi-step tasks, set an appropriate execution budget, for example `run --timeout-ms=900000` (15 minutes). This budget covers the source task, not subsequent optimization. A timed-out source task may have complete logs but incomplete outputs; `run --optimize` does not enter optimization in that case. Failed optimization handoffs return a nonzero process exit code, including through the top-level CLI. Increasing the budget starts a new attempt; package-export recovery does not resume a timed-out source task.

Model-id placeholders. `<id>` below is shorthand for `<provider>/<model-id>` — every CLI model id must carry a `<provider>/` prefix that matches a route in `providers.routes`. OpenRouter targets use three segments (e.g. `openrouter/qwen/qwen3.5-35b-a3b`); native-SDK targets use two (e.g. `anthropic/claude-sonnet-4.6`). See [providers.md](providers.md) for the full rule.

Top-level commands:

| Command | Purpose |
|---|---|
| `profile` | Profile a model's primitive capabilities |
| `aot-compile` | AOT-compile skill(s) for target model(s) |
| `pipeline` | Profile if needed, then aot-compile |
| `run` | Run one task with an optional skill (execute-only, no scoring) |
| `bench` | Run benchmark conditions across tasks/models |
| `jit-optimize` | Optimize a skill from synthetic, real, or log-based evidence |
| `proposals` | List, inspect, accept, or reject JIT-optimize proposals |
| `clean-jit` | Remove persisted JIT artifacts for a model+adapter |
| `logs` | List recent runs across subsystems |

## Adapters & providers

Seven agent harness adapters, all registered in `src/adapters/registry.ts`:

- `bare-agent` — minimal built-in agent loop. Primary adapter for profiling and testing.
- `opencode` — wraps the [OpenCode](https://github.com/sst/opencode) CLI.
- `openclaw` — wraps the OpenClaw CLI.
- `hermes` — wraps the Hermes CLI. Populates full token/cost usage.
- `jiuwenclaw` — wraps `jiuwenclaw-cli` over JSON-RPC. Token/cost are **not** persisted upstream, so bench/profile aggregators report `$0` for jiuwenclaw runs.
- `pi` — wraps the [pi](https://shittycodingagent.ai/) CLI (`@mariozechner/pi-coding-agent`). Populates full token/cost usage via JSON mode.
- `claude-code` — drives the `claude -p` CLI in a sandbox. Populates token/cost usage. Heavy headless use may hit account rate limits / usage-terms.

All commands (`profile`, `aot-compile`, `run`, `bench`, `jit-optimize`) accept any of these seven via `--adapter=<name>`.

Three LLM provider route kinds under `src/providers/`, selected per model id via `providers.routes` in `skvm.config.json` — the `<provider>/` prefix on every model id picks the matching route (first glob match wins):

- **`anthropic`** — Anthropic Claude API, or an Anthropic-compatible gateway via a custom `baseUrl`. Set `ANTHROPIC_API_KEY`.
- **`openai-compatible`** — OpenAI / Azure / vLLM / Ollama / DeepSeek and similar `/v1/chat/completions` gateways. Requires `baseUrl`; for these routes an auto-probe layer can fail over to an Anthropic-shaped endpoint on the same host when tool-call args are polluted (disable with `SKVM_AUTO_PROBE=0`).
- **`openrouter`** — OpenRouter API. Set `OPENROUTER_API_KEY`.

## `profile`

Profiles a model+harness against the 26-primitive capability set and writes cached TCPs under `~/.skvm/profiles/`.

```bash
# Single model
skvm profile --model=<id> --adapter=bare-agent

# Multiple models in parallel
skvm profile --model=<id1>,<id2> --concurrency=4

# Multiple adapters
skvm profile --model=<id> --adapter=bare-agent,opencode

# Batch from bench config
skvm profile --batch --concurrency=6

# List cached profiles
skvm profile --list
```

Notes:
- Profiles are cached per `(model, adapter)`. Re-runs hit the cache by default.
- `--force` re-runs profiling instead of using the cache.
- `--concurrency` distributes slots hierarchically per-adapter then per-model via `distributeSlots()`.

## `aot-compile`

AOT-compiles one or more skills for one or more target model+harness pairs. Variants are written under `~/.skvm/proposals/aot-compile/`.

```bash
# One skill for one model
skvm aot-compile --skill=path/to/SKILL.md --model=<id>

# Multiple models
skvm aot-compile --skill=<path> --model=<id1>,<id2> --concurrency=2

# Run selected passes only
skvm aot-compile --skill=<path> --model=<id> --pass=1,2

# Preview without writing
skvm aot-compile --skill=<path> --model=<id> --dry-run

# Override the compiler backend model
skvm aot-compile --skill=<path> --model=<id> --compiler-model=<id>
```

Three sequential compiler passes:

- **Pass 1** — SCR extraction, gap analysis, and agentic skill rewriting for missing/weak primitives
- **Pass 2** — dependency manifest extraction and idempotent `env-setup.sh` generation
- **Pass 3** — workflow decomposition, DAG construction, and parallelism hints

## `pipeline`

Profiles the target (if no cached TCP exists) and then compiles.

```bash
skvm pipeline --skill=path/to/SKILL.md --model=<id>
```

## `run`

Executes one task against one model+adapter, with or without a skill. **Execute-only — does not score the result.** Use `bench` for scored runs.

```bash
# Without a skill
skvm run --task=path/to/task.json --model=<id> --adapter=bare-agent

# With a skill
skvm run --task=<path> --skill=<path> --model=<id> --adapter=bare-agent

# Control how the skill is delivered to the adapter (inject|discover, default: inject)
skvm run --task=<path> --skill=<path> --model=<id> --adapter=bare-agent --skill-mode=inject

# Reuse a work directory (no cleanup between runs)
skvm run --task=<path> --skill=<path> --model=<id> --workdir=./tmp/run-workdir
```

### Natural task with automatic optimization

The supported default path needs only a natural task, source skill, work directory, and configured model:

```bash
skvm run --prompt="<task>" --skill=./skill --workdir=./project --model=<id> --optimize
```

SkVM runs the task once, captures its execution and passes that evidence to the optimizer. Any resulting package is saved under the run session. Capture and handoff are automatic; the optimizer uses `--model` unless `--optimizer-model=<id>` is set. Use `--package-out=<new-empty-directory>` to override the package location. For existing logs, use the advanced `jit-optimize --task-source=log` path.

JSON reference checks compare parsed values, not formatting or object key order. A passed local case means it executed successfully; without independent task checks the package remains a usable draft, not an independently validated recommendation. Resolve bundled scripts relative to their `SKILL.md` directory. Manifests, validation reports and hashes are diagnostic evidence, not routine steps for consuming a skill; follow the program's own exit-code convention.

Automatic run-scoped capture is currently verified only for the default `bare-agent` adapter. The other registered adapters may have manual trace readers, but that does not make automatic capture supported; `run --optimize` rejects them before source execution. The target model must match a `providers.routes` entry in the active `skvm.config.json`. Missing configuration produces a concrete route error instead of silently selecting another provider.

If source execution finished and a known atomic package-export step failed, resume that session without rerunning the task or optimizer:

```bash
skvm run --resume-optimization=path/to/optimization-session.json
```

States whose external completion is unknown remain non-replayable. A completed package can be `draft` or `validated-recommendation`; package-file closure alone is not behavior validation, and neither status establishes whole-skill correctness or cost savings.

A recorded example is the [R7 development run](../results/skill-ir/skill-optimization-production-closure-20260913/r7/report.json). Source execution, capture and handoff completed, but the optimizer changed documentation only. Its package remained `draft`, behavior was `not-run`, and USD cost was unknown. Use the portable command above for a new task; the report preserves that run's local setup.

### Copy and use an exported package

An exported package is an ordinary skill directory. Copy it once, then point `--skill` at the copy:

```powershell
Copy-Item -LiteralPath <exported-package> -Destination .\optimized-skill -Recurse
skvm run --prompt="<task>" --skill=.\optimized-skill --workdir=.\project --model=<id>
```

Start with `OPTIMIZATION-USAGE.md` for the package's commands and limits. The manifest is available for diagnostics. For example, the Law TXT package can run directly from its new parent directory with Python bytecode disabled:

```powershell
python -B .\optimized-skill\scripts\law_to_markdown.py .\project\document.txt --law-decision law --artifact-level minimal
```

This is a historical H13 TXT example, rather than the default workflow for a new skill. H13 verified that command after a single copy to a fresh Windows temporary directory: package closure passed before and after, Stage3 A/B/overall passed, the input and package digests were unchanged, and no research-root path was embedded. PDF/DOCX were outside that check. For those formats, follow the package's `SKILL.md`: use the configured `mineru-ocr` route, or install `python-docx>=1.1.0` and `pdfplumber>=0.11.0` for an explicitly authorized local fallback.

The C8/C9 Law development package contains a local contract checker. It covers part of the skill's work; its invocation is:

```powershell
python -B .\law-batch-package\scripts\contract_checker.py --root .\case --contract .\case\law-contract.json --source .\case\document.txt
```

The package was naturally consumed through the ordinary `run --prompt --skill --workdir --model` entry on an original and a semantic-variation Law task. A clean reproduction used Python 3.12.13 and the pinned dependency record at `results/skill-ir/skill-optimization-end-to-end-repair-20260914/c9/dependencies.lock.txt`; the generated checker itself uses only the Python standard library. The checker covers protected-input presence, review-evidence shape/consistency, character-stream preservation, enumerated-item lines, and exact output sets. Classification, pre/post input hashes, and semantic quality remain agent duties. See the C8/C9 reports before treating a package as a validated recommendation.

## `bench`

Runs benchmark conditions over tasks, skills, and models. Logs and reports land under `~/.skvm/log/bench/{sessionId}/`.

```bash
# Single model
skvm bench --model=<id> --adapter=bare-agent

# Multiple models in parallel
skvm bench --model=<id1>,<id2> --concurrency=4

# Specific conditions and tasks
skvm bench --model=<id> --conditions=no-skill,original,aot-compiled,jit-boost --tasks=<task1>,<task2>

# Defer LLM-judge evaluation (write an async-judge manifest)
skvm bench --model=<id> --async-judge

# Run the deferred judge later
skvm bench --judge --manifest=<dir> --judge-model=<id> --concurrency=4
```

Condition families:

- `no-skill` — baseline, no skill provided to the model
- `original` — unmodified skill from `skvm-data/skills/`
- `aot-compiled` and `aot-compiled-p{1,2,3}` — full or per-pass AOT output
- `jit-boost` — boost-hooks-enabled runtime
- `jit-optimized` — latest best round from the proposals tree

## `jit-optimize`

Proposal-based skill improvement loop. Three task sources — `synthetic`, `real`, `log` — feed the same round-based optimizer; output goes to `~/.skvm/proposals/jit-optimize/`.

Required for every source:
- `--skill=<path>` (or `--skill-list=<file>`) — skill directory to optimize
- `--task-source=synthetic | real | log` — must be set explicitly
- `--optimizer-model=<id>` — LLM that does the editing
- `--target-model=<id>` — model the skill is tuned for (storage key, and for `synthetic`/`real` also what runs the tasks)
- `--target-adapter=<name>` — optional, defaults to `bare-agent`

### `--task-source=synthetic` (autotune)

The optimizer LLM derives training and held-out tasks directly from the skill, then loops edit → rerun → score.

```bash
skvm jit-optimize \
  --skill=path/to/skill-dir \
  --task-source=synthetic \
  --task-concurrency=3 \
  --optimizer-model=<id> \
  --target-model=<id> \
  --rounds=1 \
  --skill-mode=inject|discover
```

Synthetic-specific flags:
- `--synthetic-count=<n>` — training tasks to generate (default `2`)
- `--synthetic-test-count=<n>` — held-out test tasks (default `1`)

### `--task-source=real`

Run against explicit bench tasks. Training and held-out test sets can be specified separately.

```bash
skvm jit-optimize \
  --skill=path/to/skill-dir \
  --task-source=real \
  --tasks=<train-id-or-path,...> \
  --test-tasks=<test-id-or-path,...> \
  --optimizer-model=<id> \
  --target-model=<id> \
  --rounds=3
```

Real-specific flags:
- `--tasks=<id|path,...>` — **required.** Train tasks by bench id or `task.json` path, comma-separated.
- `--test-tasks=<id|path,...>` — optional. Held-out test tasks; if omitted, `--tasks` is used as both train and test (fallback for small task lists).

### `--task-source=log` (post-mortem)

Feed pre-existing conversation logs to the optimizer without rerunning anything. Good for triaging real failures from production, CI, or an `skvm-jit` post-task optimization hook.

```bash
skvm jit-optimize \
  --skill=path/to/skill-dir \
  --task-source=log \
  --logs=path/to/log1.jsonl,path/to/log2.jsonl \
  --log-records=line:3+line:7,lines:1-4 \
  --failures=path/to/log1-failure.json,path/to/log2-failure.json \
  --optimizer-model=<id> \
  --target-model=<id> \
  --package-out=path/to/new-empty-optimized-skill
```

Log-specific flags:
- `--logs=<path,...>` — **required.** Conversation log files, comma-separated.
- `--log-records=<spec,...>` — optional exact record selection. Supply one comma-separated spec per log; join multiple locators for one log with `+` (for example `line:3+line:7`). The accepted locator syntax is adapter-specific, and the number of specs must match `--logs`.
- `--failures=<path,...>` — optional. Per-log failure JSON files, same order as `--logs`. Each file holds `EvidenceCriterion[]` evidence for its log (structured per-criterion scores the log alone doesn't carry).

Log source does not rerun tasks, so `--rounds`, `--runs-per-task`, `--convergence`, `--baseline`, `--tasks`, `--test-tasks`, and `--synthetic-count` are all forbidden with it. `--target-model` is still required — it's the storage key identifying which model the logs came from.

### Loop controls (synthetic / real)

- `--rounds=<n>` — max optimization rounds (default `3` for synthetic/real, `1` for log)
- `--runs-per-task=<n>` — runs per task per round (default `1`)
- `--convergence=<0-1>` — early-exit threshold on primary score (default `0.95`). Primary score is the test score when a test set exists, else the train score.
- `--baseline` — also run the no-skill and original conditions for comparison

### Delivery

- `--no-keep-all-rounds` — keep only the best round's folder (default keeps all)
- `--auto-apply` — after best-round selection, overwrite the original `--skill` directory, backing up overwritten files inside the proposal
- `--package-out=<new-empty-directory>` — export the selected round as an independent optimized skill without modifying the source. The v2 package manifest binds the proposal, final-history actions, actual filesystem diff, exact file closure, runtime/dependency files, and any already-run action-local validation report; export does not rerun the checks. A genuine no-change leaves this directory absent. Legacy v1 packages remain readable.

The command prints whether the result is a `draft` or `validated-recommendation`, the actual action kinds, applicable inputs and preconditions, residual duties, and concrete validation gaps. A recommendation requires a bound passed report with at least one independent case and no unvalidated or rejected action. This status is limited to those action-local cases and does not claim whole-skill correctness or real agent consumption.

The [G-stage development report](../results/skill-ir/general-skill-optimization-20260913/final-report.json) records a non-API package exported from an exact I18n log record. Its historical invocation is not a current CLI example: in particular, the log path does not accept `--rounds`. Use the log command above and consult the exported package's `OPTIMIZATION-USAGE.md`; file closure, behavior checks and natural task evaluation establish different properties.

### Batch mode

```bash
skvm jit-optimize \
  --skill-list=skills.txt \
  --task-source=real \
  --tasks=<id-or-path,...> \
  --optimizer-model=<id> \
  --target-model=<id> \
  --concurrency=4
```

`--skill-list` is a file with one skill path per line; `--concurrency` runs jobs in parallel.

## `proposals`

Proposals are the unified storage for JIT-optimize output. See [architecture.md](architecture.md#proposals-tree) for the on-disk layout.

```bash
skvm proposals list
skvm proposals show <id>
skvm proposals accept <id>
skvm proposals accept <id> --round=<n>      # override the engine's recommended bestRound
skvm proposals reject <id>
```

Accepting a proposal deploys the chosen round into the target skill directory and backs up overwritten files as `.bak.<timestamp>`. The bench `jit-optimized` condition always reads `round-{bestRound}/` of the latest proposal for a given `(harness, targetModel, skillName)`.

## `clean-jit`

Removes persisted JIT state (boost candidates + solidification state) for a specific model+adapter pair.

```bash
skvm clean-jit --model=<id> --adapter=<name> --dry-run
skvm clean-jit --model=<id> --adapter=<name> --yes
```

## `logs`

Lists recent runs across subsystems for quick inspection.

```bash
skvm logs
skvm logs --type=bench --limit=10
skvm logs --type=profile
skvm logs --type=aot-compile
```

## Environment variables

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Agent execution and profiling via OpenRouter |
| `ANTHROPIC_API_KEY` | Compiler backend via the Anthropic API |
| `SKVM_DATA_DIR` | Override the `skvm-data/` input-dataset root |
| `SKVM_CACHE` | Override the runtime-cache root (default `~/.skvm/`) |
| `SKVM_PROFILES_DIR` | Override the cached-TCP directory |
| `SKVM_LOGS_DIR` | Override the runtime-log directory |
| `SKVM_PROPOSALS_DIR` | Override the proposals-tree root |
