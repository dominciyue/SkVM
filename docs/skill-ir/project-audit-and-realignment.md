# Skill IR Project Audit And Realignment

## Purpose

This document records the current repository layout, result persistence policy, and the main research alignment issues raised after discussion with the advisor and senior student.

The project direction remains:

```text
Skill IR as an AOT pass inside SkVM for improving cross-agent, cross-environment, and cross-context skill stability.
```

The important correction is that current seed skills and experiments are not yet enough to prove broad skill generalization. They are useful for building the pipeline, but the next phase needs stronger skill provenance, no-skill baselines, stability metrics, amortized token-cost analysis, and a clearer artifact-maturity path.

## Folder Map

### Root Files

| Path | Role |
|---|---|
| `package.json`, `bun.lock`, `tsconfig.json`, `bunfig.toml` | TypeScript/Bun project configuration and dependency lockfiles. |
| `README.md`, `README.zh-CN.md`, `CONTRIBUTING.md`, `LICENSE` | Upstream SkVM-facing project documentation. |
| `skvm.config.example.json` | Committed provider/config template. Real local config should not be committed. |
| `AGENTS.md` | Local project rules for this research branch. The root copy is not intended as a public artifact unless explicitly chosen. |

### Source Code

| Path | Role |
|---|---|
| `src/skill-ir/` | New Skill IR subsystem: schema, parser, validator, AOT passes, lowering. |
| `src/skill-ir/passes/` | Static and profile-guided optimization passes such as rule normalization, environment guards, and profile-guided repair. |
| `src/skill-ir/lowering/` | Lowering from Skill IR into controller/checker/adapter artifacts. |
| `src/profiler/` | Trace schema, profile annotation generation, profiler utilities, and existing SkVM profiling logic. |
| `src/benchmarks/skill-ir/` | Skill IR benchmark matrix, real-agent runner, scoring layer, route probe, profile feedback, promotion policy, validation planner. |
| `src/bench/` | Upstream SkVM benchmark utilities and evaluators. |
| `src/adapters/`, `src/providers/` | Model/provider and harness integration. |
| `src/compiler/`, `src/jit-*`, `src/runtime/`, `src/core/`, `src/framework/`, `src/run/`, `src/cli/`, `src/cli-config/` | Existing SkVM compiler/runtime/CLI architecture. The Skill IR work currently stays mostly independent from these internals except through runners and materialization paths. |
| `src/proposals/` | Upstream or existing proposal/demo code. Not central to the Skill IR experiments. |

### Benchmarks And Corpus

| Path | Role |
|---|---|
| `benchmarks/skill-ir/corpus/manifest.json` | Registry of current Skill IR fixtures and target corpus size. |
| `benchmarks/skill-ir/ir/*.json` | Full Skill IR fixtures for current seed skills. |
| `benchmarks/skill-ir/tasks/*.json` | Task prompts and success criteria for each seed skill. |
| `benchmarks/skill-ir/contexts/standard-contexts.json` | Context perturbations: clean, noisy, long, compressed. |

Current `benchmarks/skill-ir` skills are local seed fixtures created for pipeline construction. They are not yet a representative sample from public skill repositories. This is a validity risk and should be corrected before making broad generalization claims.

### Skills

| Path | Role |
|---|---|
| `skills/skvm-general/SKILL.md` | Upstream SkVM general skill. |
| `skills/skvm-jit/SKILL.md` and related docs | Upstream SkVM JIT skill material. |

These are real repository skills and should be considered for a future external/real-skill evaluation track. The current deep-benchmark seed skills do not come from this folder.

### Tests

| Path | Role |
|---|---|
| `test/` | Existing upstream SkVM tests. |
| `src/**/*.test.ts` | Skill IR and benchmark unit tests are colocated with source modules. |
| `scripts/*_test.py` | Python analyzer tests. |

### Documentation

| Path | Role |
|---|---|
| `docs/skill-ir/` | Main research documentation, component docs, run docs, and calibration notes for this project. |
| `docs/skill-ir/skill-ir-aot-optimization-spec.md` | High-level project spec and evolving research framing. |
| `docs/skill-ir/skill-ir-aot-optimization-plan.md` | Implementation plan and task history. |

### Results And Local State

| Path | Role |
|---|---|
| `results/skill-ir/` | Committed experiment summaries, scored JSONL, CSV tables, promotion reports, validation plans, and final IR artifacts. |
| `.skvm/` | Local SkVM config/cache/logs. Ignored by git and not intended for commit. |
| `node_modules/` | Local dependencies. Ignored by git. |
| `skvm-data/` | Local data/submodule area. Not part of Skill IR result reporting. |

## Result Persistence

The project currently persists selected experiment artifacts in git under:

```text
results/skill-ir/
```

Persisted artifacts include:

- scored JSONL rows;
- analyzer tables and slices;
- paired-delta CSVs;
- route-probe summaries;
- profile overlay/final IR artifacts;
- promotion-policy reports;
- validation-plan reports.

Raw execution directories and `.skvm/log/` are not committed. Earlier raw run directories were removed after scoring and audit. This is the right default for privacy and repository size, but it means raw model output is not always available for later re-audit unless explicitly archived.

Recommended policy:

- Commit compact scored/evaluation artifacts that support tables and claims.
- Do not commit provider keys, `.skvm/`, raw run directories, or bulky logs.
- For paper-grade claims, archive a minimal anonymized raw-output sample or audit note when scorer behavior is important.

## Current Skill Provenance Assessment

Current deep-benchmark fixtures:

```text
skill-review
skill-ci-diagnostic
skill-env-portability
skill-git-hygiene
skill-tdd-bugfix
skill-report-synthesis
```

These are mostly local synthetic/research fixtures. They are good for:

- building the Skill IR schema and passes;
- testing the runner/scorer/analyzer pipeline;
- constructing controlled failure modes;
- producing early case studies.

They are weak for:

- proving generality to arbitrary skills;
- convincing reviewers that the system handles real public skill distributions;
- avoiding GPT-family prompt-style bias;
- demonstrating non-coding workflows.

The next corpus phase should add explicit provenance labels:

```text
synthetic-seed
adapted-public
real-public
upstream-skvm
user-provided
```

Broad claims should be based on `adapted-public`, `real-public`, `upstream-skvm`, and `user-provided` skills, not only `synthetic-seed`.

## Evidence Weighting

The current synthetic seed skills should be treated as low-weight development evidence. They are useful for checking whether the pipeline runs, whether scorers catch controlled failures, and whether a proposed pass is mechanically connected end to end. They should not dominate the main experiment table or be used as the main proof that Skill IR generalizes to arbitrary skills.

Recommended reporting policy:

- report `synthetic-seed` results separately from real/public skill results;
- use synthetic rows for calibration, debugging, and case-study explanation;
- base broad claims on `adapted-public`, `real-public`, `upstream-skvm`, and `user-provided` rows;
- when aggregating mixed corpora, include provenance counts and either downweight synthetic rows or show a separate real-skill aggregate;
- mark model-family conclusions from the current seed corpus as provisional until real-skill matrices are available.

The next corpus phase should therefore start from real skill intake rather than only expanding the existing synthetic fixtures. The approved initial sources are:

| Priority | Source | Role |
|---:|---|---|
| 1 | [anbeime/skill](https://github.com/anbeime/skill) | Main real-skill source pool. |
| 2 | [laolaoshiren/claude-code-skills-zh](https://github.com/laolaoshiren/claude-code-skills-zh) | Chinese/developer workflow supplement. |
| 3 | [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | Backup index and conceptual reference. |

The intake table and sampling rules live in `docs/skill-ir/real-skill-intake.md`.

## Metric Realignment

The project's stability goal should be stated as:

```text
An optimized skill should improve or preserve task success across model families, contexts, environments, and agents, while reducing regressions and variance compared with original and no-skill baselines.
```

The token/cost goal should be stated as:

```text
An optimized skill should reduce repeated prompt/tool/code generation overhead where possible by solidifying reusable checks, adapters, generated code, schemas, or tool plans into reusable artifacts.
```

This means token reduction is not just "shorter prompt." It can come from:

- precompiled controller/checker/adapter artifacts;
- reusable tool probes or environment guards;
- generated code/templates cached as artifacts;
- output schemas lowered once instead of regenerated each run;
- avoiding unnecessary skill text when `no-skill` already performs better.

Token cost should be measured as an amortized quantity because AOT optimization can be more expensive on the first import. The first run may pay for parsing, validation, profile collection, code/schema generation, and artifact verification. The intended win is over repeated use:

```text
total_original(N)  = original_runtime_cost * N
total_optimized(N) = compile_cost + profile_cost + optimized_runtime_cost * N
break_even_N       = smallest N where total_optimized(N) <= total_original(N)
```

Reports should separate:

- upfront compile/profile cost;
- steady-state per-run cost;
- break-even invocation count;
- quality-preserving token savings after break-even;
- cases where the optimized skill costs more and does not improve stability.

## IR Artifact Maturity

The current `final IR`, `ir-pgo`, and `ir-profile` artifacts are still research-stage artifacts. In practice they are mostly structured workflow JSON plus some generated checks and recovery policies. This is useful progress, but it is not yet the final goal.

The maturity target should be explicit:

| Level | Name | Meaning |
|---|---|---|
| L0 | Natural skill text | The original natural-language skill. |
| L1 | Structured workflow IR | JSON representation of steps, rules, tools, checks, and recovery. This is close to the current state. |
| L2 | Lowered support artifacts | Controller, checker, adapter, schema, and environment-guard artifacts generated from IR. |
| L3 | Stable reusable blocks | Reusable file/code/template/tool-plan blocks that can be called repeatedly without regenerating the same reasoning or setup. |
| L4 | Validated artifact package | Versioned artifact package with provenance, validation tier, cache policy, model/context notes, and regression evidence. |

The project should not describe the loop as finished. The current loop is a research pipeline that can parse, optimize, run, score, and feed back limited failures. The remaining work is to turn useful IR elements into stable reusable artifacts and prove that repeated invocations become more stable or cheaper.

## No-Skill Baseline

`no-skill` already exists as a system in the benchmark design, but it has not been central in the latest real-agent Task 11 experiments. This should change.

The evaluation should ask:

- Does a skill help compared with no skill?
- Does Skill IR help compared with the original skill?
- Does final IR help compared with static IR?
- Are there task classes where no skill is better because skill instructions add noise or token overhead?

If `no-skill` wins on a task, the correct conclusion may be:

```text
do not apply this skill for this task shape
```

or:

```text
compile a narrower skill/router instead of forcing the full skill.
```

## Next Alignment Actions

1. Completed 2026-07-15: add corpus provenance/evidence fields and propagate them through matrix, runner, scorer, and slice analysis.
2. Completed first intake 2026-07-15: inspect `anbeime/skill`, `laolaoshiren/claude-code-skills-zh`, and `travisvn/awesome-claude-skills`; follow the backup index to the real `K-Dense-AI/claude-scientific-skills` source; select six licensed pilots.
3. Add source-backed real-skill fixtures with attribution, then convert the staged pilot to base IR and task fixtures.
4. Reintroduce `no-skill` into real-agent experimental matrices.
5. Report stability as mean, worst-case, variance, paired delta, and regression count across model/context/environment axes.
6. Report token cost and latency alongside success; optimize only when quality is preserved.
7. Add amortized token metrics: upfront cost, steady-state cost, and break-even invocation count.
8. Add an artifact-solidification track for reusable checks, schemas, adapters, generated code, templates, and fixed tool plans.
9. Treat current GPT/Qwen/Gemini findings as provisional until larger real-skill and no-skill matrices are run.
10. Track IR artifact maturity from JSON workflow IR toward stable reusable code/file/tool-plan packages.
