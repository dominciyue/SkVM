# Executable Artifact Runtime

## Status

Implemented on 2026-07-16 for the source-backed `env-manager` development
vertical. The emitted `executable-artifact/v1` package is an L3-oriented
prototype: its checker and templates execute independently of free-form model
reasoning. It has not passed the frozen development gate and is not L4 or
held-out evidence.

## Purpose

This component replaces prompt-only output repair with a provenance-bound,
Runner-enforced lifecycle:

```text
preflight -> template materialization -> generation -> validate
          -> at most one sanitized repair -> revalidate -> stop
          -> existing offline deterministic scorer
```

The runtime validator controls structural and safety repair. It cannot declare
benchmark success. The final workdir and output still go through the unchanged
deterministic `env-manager` scorer.

## Construction Inputs

The first package is compiled from the frozen profile-empty base IR,
gold-isolated dual-source development `RepairEvidence`, and `id`, `split`, and
user-visible `prompt` projections from the task set. Source, base IR, evidence,
predecessor, contract, compiler, and artifact digests are recorded.

The compiler never serializes evaluator payloads, criterion expected values,
hard-gate ids, held-out prompts/results, fixture gold sets, or secret values.
Tests inject canaries for each forbidden source.

## Package And Lock

```text
benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1/
  package-manifest.json
  package-provenance.json
  skill-ir.json
  skill.md
  validation-policy.json
  artifacts/
    contracts/env-manager-output-contract.json
    templates/env-report.template.json
    templates/env-schema.template.json
    checks/validate-output.ts
```

`skill-ir.json` is the frozen base IR, not a failed v1/v2 Final IR candidate.
The old candidates appear only as predecessor provenance. Templates contain
`__SKVM_REQUIRED__`; materialization alone therefore fails validation.

The frozen lock is
`benchmarks/skill-ir/pilots/env-manager/env-manager-executable-artifact-v1-lock.json`.
Runner planning validates its package digests, model, family, adapter, adapter
version, task set, context, agent, environment, repetitions, and repair mode.
`ir-artifact-dev` is absent from default matrices.

## Runtime Components

| File | Responsibility |
|---|---|
| `artifact-package.ts` | Strict schemas, safe paths, package/provenance/lock digests, undeclared-file rejection. |
| `artifact-package-compiler.ts` | Prompt-only contract extraction and deterministic package emission. |
| `artifact-package-run.ts` | Package compile and verify CLI. |
| `artifact-preflight.ts` | Scope checks, protected-file snapshot, and template materialization. |
| `artifact-runtime.ts` | Checker execution, repair projection, bounded state machine, and split costs. |
| `real-agent-run.ts` | Explicit guards, lock-aware planning, command execution, and raw rows. |
| `scoring.ts` | Existing scorer dispatch plus artifact metadata and aggregate usage. |

## Repair Input

`RuntimeValidationReport` is strict. Repair sees only:

```text
code | relativePath | jsonPointer | missingField | expectedType
```

Codes and expected types are closed enums. Paths are normalized and
workdir-relative. Extra properties, free-form messages, contents, snippets,
actual values, source text, secrets, and absolute paths invalidate the report
and block repair.

Runner writes a separate repair task with no fixtures and `eval: []`. Its
prompt contains a static instruction and a freshly parsed whitelist projection.
The command preserves model, adapter, skill, and workdir. The state machine has
no transition to a second repair.

## Preflight And Workdir Safety

Before a model call, Runner resets the workdir, materializes task fixtures,
validates package/provenance/lock/scope/task contract/runtime, snapshots every
pre-existing non-output file by relative path and SHA-256, and materializes
only declared templates.

After generation and repair, protected files are checked again. Mutation is a
semantic hard stop and is never repair-eligible. Reports contain paths and
digests only, never fixture bytes. Symlinks and non-regular entries are rejected.

## Validator Versus Scorer

The checker validates declared output existence, JSON parseability, the five
user-visible report arrays, top-level `variables`, allowed schema-rule fields,
template sentinels, and generic `TEST_ONLY_` occurrences. It does not know the
scorer's expected variable sets or secret values.

Raw and scored rows preserve:

```text
initialValidation | finalValidation | repairAttempted | repairedToPass
generationUsage | repairUsage | aggregateUsage | validationDurationMs
```

Offline success, hard gates, and evaluator score remain authoritative. Token
totals use `aggregateUsage`; generation and repair usage remain separately
available for attribution.

## Failure Classification

| Failure | Result | Repair |
|---|---|---:|
| Package, lock, digest, path, runtime, or scope preflight | Infrastructure/package | No |
| Provider failure after provider retries | Infrastructure | No semantic repair |
| Checker crash, timeout, invalid JSON/report schema | Infrastructure/validator | No |
| Missing/malformed output, wrong type/field, sentinel | Semantic validation | At most once |
| Generic synthetic-secret prefix in output | Semantic safety | At most once without value disclosure |
| Protected fixture mutation | Semantic hard stop | No |
| Revalidation failure | Final semantic failure | Stop |

## Commands

Compile and verify:

```powershell
bun ./src/benchmarks/skill-ir/artifact-package-run.ts '--base-ir=benchmarks/skill-ir/pilots/env-manager/base-ir.json' '--repair-evidence=results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/repair-evidence.json' '--tasks=benchmarks/skill-ir/pilots/env-manager/tasks.json' '--source=benchmarks/skill-ir/pilots/env-manager/source/SKILL.md' '--predecessor=results/skill-ir/env-manager-dual-overlay-v1-2026-07-16/provenance.json,results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/provenance.json' '--out-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1'
bun ./src/benchmarks/skill-ir/artifact-package-run.ts '--verify-only=benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1'
```

Generate the check-only dry-run plan:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=pilot' '--allow-artifact-development-replay' '--artifact-package-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1' '--artifact-lock=benchmarks/skill-ir/pilots/env-manager/env-manager-executable-artifact-v1-lock.json' '--artifact-repair-mode=check-only' '--skills=env-manager' '--systems=ir-artifact-dev' '--contexts=clean' '--agents=skvm' '--environments=windows' '--tasks=env-manager-node-audit-dev-001,env-manager-vite-audit-dev-002' '--repetitions=2' '--model=xty/gpt-4.1-mini' '--model-family=gpt' '--adapter=bare-agent' '--adapter-version=workspace-executable-artifact-v1' '--panel-config-id=env-manager-executable-artifact-v1-check-only' '--limit=2' '--out-dir=results/skill-ir/env-manager-executable-artifact-v1-check-only-dry-run'
```

Use the same command with `--artifact-repair-mode=one-repair` and distinct
panel/output ids for the repair arm. Add `--execute` and the required API-key
guard only after route probe and both dry-run plans pass.

## Verification

```powershell
bun test ./src/benchmarks/skill-ir/artifact-package.test.ts ./src/benchmarks/skill-ir/artifact-package-compiler.test.ts ./src/benchmarks/skill-ir/artifact-preflight.test.ts ./src/benchmarks/skill-ir/artifact-runtime.test.ts ./src/benchmarks/skill-ir/real-agent-run.test.ts ./src/benchmarks/skill-ir/scoring.test.ts ./src/benchmarks/skill-ir/env-manager-pilot.test.ts
bun run typecheck
```

Tests cover prompt/evaluator isolation, deterministic emission, package/lock
tamper, path containment, protected mutation, strict report fields,
exactly-once repair, real checker execution, raw rows, and unchanged scoring.

### 2026-07-16 Implementation Verification

Fresh repository-level verification after package emission and Runner
integration produced:

```text
bun test ./src/skill-ir ./src/benchmarks/skill-ir ./src/bench/evaluators
  280 pass, 0 fail, 1210 assertions, 32 files
python scripts/analyze_skill_ir_results_test.py
  9 tests passed
python scripts/analyze_skill_ir_slices_test.py
  8 tests passed
bun run typecheck
  passed
git diff --check
  no whitespace errors; Windows line-ending warning only
```

Both frozen development arms were then materialized without `--execute`.
Each plan contained exactly four rows: two registered development tasks times
two repetitions. The check-only plan contained only `check-only`; the repair
plan contained only `one-repair`. Both used `ir-artifact-dev`, Windows,
`clean`, one package path, and one contract digest. Neither plan created
`raw-runs.jsonl`, and a secret-pattern scan found no API key.

These checks established implementation and scheduling integrity only. The
subsequent frozen development result is recorded below.

### 2026-07-16 Frozen Development Result

The exact `xty/gpt-4.1-mini` route probe passed. Both four-row arms then
executed and scored without infrastructure failures:

| Mode | Success | Mean score | Runtime final pass | Repair calls | Mean tokens | Mean latency |
|---|---:|---:|---:|---:|---:|---:|
| `check-only` | 0/4 | 0.55 | 3/4 | 0 | 7,164.75 | 37,843.75 ms |
| `one-repair` | 0/4 | 0.70 | 4/4 | 0 | 7,605.25 | 26,539.75 ms |

The frozen gate failed its minimum 3/4 successes and 0.85 mean score. All four
one-repair generations passed initial runtime validation, so repair never ran.
The arm-level score difference is independent generation variation and cannot
be attributed to repair. The deterministic scorer rejected classification and
schema semantics in every row even when the runtime validator passed. See
`docs/skill-ir/env-manager-executable-artifact-v1-run.md` for criterion counts,
cost attribution, and persisted evidence.

The package is therefore operational but not optimized successfully. Held-out
remains blocked. A future semantic validator must use a new package catalog and
lock, derive checks from workspace evidence and the public contract, and remain
isolated from scorer expected values.

## Modification Notes

- Contract changes require new package digests and a re-frozen lock.
- New validation codes require schema, checker, leakage-test, and doc updates.
- Evaluator knowledge must not enter the checker to improve a replay.
- Semantic changes use a new catalog; dual-overlay v1/v2 stay immutable.
- Held-out remains blocked until the frozen one-repair development gate passes
  without scorer or task tuning.
