# Validated Skill Artifact Package

## Status

Northbound engineering specification, updated 2026-07-15. The current implementation is L1/early-L2 and does not yet emit this complete package. It now emits an intermediate Final IR artifact set with digest provenance; that is a prerequisite, not an L3/L4 package.

## Purpose

A Validated Skill Artifact Package is the L3-L4 target of Skill IR compilation. It keeps Skill IR as the authoritative semantics while solidifying repeated reasoning, output structure, environment probes, scripts, templates, and fixed tool plans into reusable artifacts.

The package is intended to improve repeated-run stability. Lower amortized token cost is a possible secondary effect and must be measured rather than assumed.

## Package Layout

```text
optimized_skill/
  skill_ir.json
  skill.md
  artifacts/
    checks/
    schemas/
    scripts/
    templates/
    tool-plans/
  provenance.json
  validation.json
```

| Path | Contract |
|---|---|
| `skill_ir.json` | Authoritative semantic representation. Generated views and artifacts must trace back to stable IR references. |
| `skill.md` | Human/agent-readable view generated from the IR and selected artifacts. It is not independently edited after generation. |
| `artifacts/checks/` | Executable or declarative checks with target refs, inputs, expected results, and failure actions. |
| `artifacts/schemas/` | Reusable input/output contracts that remove repeated schema invention. |
| `artifacts/scripts/` | Deterministic repeated operations that are safer or cheaper than regenerating code per invocation. |
| `artifacts/templates/` | Stable output/file templates with explicit variables and validation rules. |
| `artifacts/tool-plans/` | Fixed or parameterized tool sequences, prerequisites, alternatives, and stop conditions. |
| `provenance.json` | Source URL, commit, source path, license scope, source digest, compiler version, and pass configuration. |
| `validation.json` | Static checks, development evidence, held-out evidence, supported scope, known failures, artifact digests, and invalidation conditions. |

## Solidification Rule

An operation becomes a reusable artifact only when all of the following hold:

- it recurs across invocations or removes a documented failure mode;
- its inputs and outputs can be specified;
- deterministic or bounded validation exists;
- the artifact is safer or more stable than regenerating the operation in-context;
- provenance and invalidation conditions can be recorded.

Natural-language guidance that remains task-dependent should stay in IR or the generated skill view. The compiler should not turn every instruction into code merely to increase artifact count.

## Build Flow

```text
licensed source skill
  -> static base IR
  -> static validation and lowering
  -> development execution evidence
  -> task-local profile overlay
  -> candidate final IR
  -> artifact solidification
  -> held-out package validation
  -> validated package or rejected candidate
```

Development evidence may change the candidate IR or generate artifacts. Held-out evidence may validate or reject the package but must not be fed back into the same reported evaluation run.

## Current Final IR Artifact

Before package solidification, profile feedback emits:

```text
profiled-ir/
  overlay/<skill-id>.json
  final-ir/<skill-id>.json
  summary.json
  provenance.json
```

Final IR is the compiled product of static base IR plus a development-derived overlay. `ir-pgo` is the held-out execution label that consumes this product. Provenance records the selected corpus, `original × development` evidence, and source/base/overlay/final digests; the runner validates all of them before scheduling. This provides artifact identity and train/evaluation separation, but it does not yet provide independently executable L3 checks, scripts, schemas, templates, or tool plans.

## Current Pilot Strategy

The first package prototype should come from one of the three deep pilots:

- `law-to-markdown`: converter/check scripts and staged tool plan;
- `env-manager`: redaction schema, environment probe, and safety checks;
- `experimental-design`: analysis template, seeded script, and output schema.

Choose the first prototype after static/no-skill/original results reveal which repeated work is both useful and verifiable. Do not preselect an artifact solely because files already exist upstream.

## Validation Levels

| Level | Requirement |
|---|---|
| L2 | Lowered controller/checker/adapter specifications exist and preserve IR references. |
| L3 | At least one reusable artifact executes or validates independently of free-form model reasoning. |
| L4 | Package provenance, integrity, supported scope, held-out results, regressions, and invalidation rules are recorded. |

A package is not L4 because it contains many files. It reaches L4 only when the reusable files and their claimed scope are validated.

## Cost Accounting

Package compilation, profile collection, artifact generation, and validation are upfront costs. Runtime prompt tokens, model calls, tool calls, and artifact execution cost are steady-state costs. Break-even is reportable only after the same validated package is reused across repeated invocations:

```text
total_original(N)  = original_runtime_cost * N
total_package(N)   = compile_and_validation_cost + package_runtime_cost * N
```

Until that measurement exists, token counts remain diagnostics and artifact solidification remains an engineering hypothesis.

## Failure And Invalidation

A package must be revalidated when its source digest, compiler/pass version, artifact dependencies, tool interface, target model/harness scope, or high-severity semantic rules change. A held-out regression, stale environment probe, unverifiable script, or missing license scope blocks validation rather than being hidden in notes.

## Implementation Sequence

1. Complete the three deep real-skill static and task-local PGO experiments.
2. Select one repeated, verifiable operation from the evidence.
3. Define the package manifest/provenance/validation schemas with failing tests.
4. Add one artifact emitter and an independent verifier.
5. Compare package execution against `no-skill`, `original`, `ir-static`, and the task-local `ir-pgo` candidate on held-out tasks.
6. Extend artifact types only after the first package demonstrates a stability benefit or a clear failure boundary.

## Verification For Future Changes

When package code is introduced, verification must include schema tests, digest/integrity tests, deterministic artifact tests, source-to-IR traceability, development/held-out separation, and a documented package invalidation test.
