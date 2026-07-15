# Env Manager Dual-Source Overlay

## Purpose

This component compiles development-only evidence from paired `original` and
`ir-static` rows into a provenance-bound Final IR. It is an engineering
calibration for the first real-public skill, not held-out evidence or a main
claim.

## Evidence Contract

`original` establishes whether a failure lineage existed before static
compilation. `ir-static` supplies the residual shape that remains after the
base IR passes. The compiler applies these rules:

- original fail, static pass: resolved; do not generate a repair;
- original fail, static fail: reproduced residual;
- original pass, static fail: static regression; reject the compilation;
- a finer static residual behind a failed original prerequisite may be marked
  newly observable;
- require support from at least two distinct development tasks;
- ignore no-skill and infrastructure rows;
- reject held-out, duplicate, unmatched, or partially identified rows.

The strict `RepairEvidence` projection contains only task/run identity,
criterion id, lineage, repair kind, and target reference. Scorer expected
values, evaluator payloads, fixture gold sets, and secret values are never
compiler input.

## Runtime Components

```text
src/benchmarks/skill-ir/repair-evidence.ts
src/skill-ir/passes/typed-output-repair.ts
src/benchmarks/skill-ir/dual-source-feedback-run.ts
src/benchmarks/skill-ir/final-ir-provenance.ts
```

The compiler writes `repair-evidence.json`, an overlay, Final IR, a compatibility
IR copy, summary, and provenance v2. Provenance binds the corpus manifest,
frozen scored rows, repair evidence, source/base IR, overlay, Final IR,
construction identity, lineage catalog, and repair catalog.
`.gitattributes` pins LF for Skill IR benchmark, result, and implementation
paths so byte-level digests remain stable across Windows and Unix checkouts.

`ir-pgo-dev` is a diagnostic system available only with
`--allow-development-replay`. It requires pilot corpus, one explicit skill,
clean context, explicit development tasks, an IR override, and provenance v2.
It is absent from default matrices. `ir-pgo` remains held-out only.

## Repair Catalogs

`typed-output-repair/v1` adds generic canonical-schema and source-qualified
finding rules. Its frozen replay showed that a readable rule is insufficient:
the canonical-schema wording conflicted with the task-visible custom
`variables` contract, and finding item serialization remained variable.

`typed-output-repair/v2` preserves the explicit runtime output contract before
generic format conventions. When an array contract does not define an object
item schema, code-derived findings use deterministic `path:symbol` strings.
The v1 package is retained unchanged; v2 is a versioned amendment.

## Commands

Compile a v2 candidate:

```powershell
bun ./src/benchmarks/skill-ir/dual-source-feedback-run.ts '--corpus=pilot' '--skill=env-manager' '--lineage-catalog=env-manager/v1' '--repair-catalog=typed-output-repair/v2' '--min-distinct-tasks=2' '--results=results/skill-ir/env-manager-static-v1-2026-07-15/scored-results.jsonl' '--out-dir=results/skill-ir/env-manager-dual-overlay-v2-2026-07-16'
```

Replay the candidate on development tasks:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=pilot' '--allow-development-replay' '--skills=env-manager' '--systems=ir-pgo-dev' '--contexts=clean' '--agents=skvm' '--environments=windows' '--tasks=env-manager-node-audit-dev-001,env-manager-vite-audit-dev-002' '--repetitions=2' '--model=xty/gpt-4.1-mini' '--model-family=gpt' '--adapter=bare-agent' '--adapter-version=workspace-dual-overlay-v2' '--panel-config-id=env-manager-dual-overlay-dev-v2' '--limit=2' '--ir-override-dir=results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/final-ir' '--out-dir=results/skill-ir/env-manager-dual-overlay-v2-2026-07-16-dev-replay' '--execute' '--require-env=SKVM_XTY_API_KEY'
```

Score with `--corpus=pilot`; passing the pilot JSON as a generic `--manifest`
is intentionally stricter and will validate incomplete intake entries too.

## Frozen Development Results

| System/catalog | Success | Mean score | Token cost | Residuals |
|---|---:|---:|---:|---|
| `ir-static` | 0/4 | 0.7000 | 31,287 | classification, schema |
| repair v1 | 0/4 | 0.7000 | 58,023 | classification, schema |
| repair v2 | 1/4 | 0.6375 | 36,332 | mixed; new artifact/example regressions |

All twelve compared rows had zero infrastructure failures. v2 proved that the
contract-aware rule can work on one Node repetition, but it failed the frozen
development gate because aggregate score regressed. One Vite repetition
claimed fixtures were absent and produced no required artifacts even though
the workdir was materialized. No held-out run was executed.

## Interpretation And Next Work

The static/dynamic compiler and provenance path now work, but prompt-visible
rules alone do not make a stable artifact. The next implementation should
solidify executable output validation or templates and enforce preflight plus
post-generation checks at runtime. It must remain generic, derive contracts
from agent-visible task/skill semantics, avoid evaluator gold, and create a new
versioned repair catalog and lock before another paid replay.

## Verification

```powershell
bun test ./src/benchmarks/skill-ir/repair-evidence.test.ts ./src/skill-ir/passes/typed-output-repair.test.ts ./src/benchmarks/skill-ir/dual-source-feedback-run.test.ts ./src/benchmarks/skill-ir/real-agent-run.test.ts
bun run typecheck
```

Important failure modes include unmatched paired evidence, static regressions,
gold-bearing input, provenance digest mismatch, development/held-out leakage,
catalog drift, and a materialized agent run that does not inspect its workdir.
