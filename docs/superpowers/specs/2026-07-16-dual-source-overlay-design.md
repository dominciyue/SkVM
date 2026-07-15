# Dual-Source Residual Overlay Design

Date: 2026-07-16

## Objective

Construct a provenance-bound Final IR from paired `original` and `ir-static`
development evidence without allowing deterministic scorer gold payloads to
enter the compiler. `original` establishes whether a failure lineage predates
static compilation; `ir-static` identifies residual behavior that the Final IR
must repair.

## Evidence Policy

Evidence is paired by skill, task, model, adapter/version, panel/config,
context, environment, and repetition. Criterion comparison is lineage-aware:

| Original state | Static state | Classification | Compiler action |
|---|---|---|---|
| fail | fail | reproduced residual | eligible |
| prerequisite fail | finer failure | newly observable residual | eligible |
| fail | pass | statically resolved | no repair |
| pass | fail | static regression | block Final IR |
| pass | pass | stable pass | no repair |

The first env-manager lineage contains an artifact family whose prerequisite is
`env-required-artifacts` and whose descendants include `env-classification`,
`env-example-safety`, and `env-schema-rules`. Lineage mappings are versioned,
explicit, and evaluator-specific; unknown relations fail closed.

`no-skill` is an evaluation baseline and never contributes overlay evidence.
Held-out rows are rejected during construction.

## Gold Isolation

The compiler consumes `ScoredAgentRunRow` safe summaries only. It must never
load task `eval.payload`, expected variable sets, expected schema subsets,
fixture secret values, or held-out answers. A strict `RepairEvidence` projection
retains only:

- skill/task and complete run identity;
- original/static systems and criterion ids;
- lineage classification and typed repair kind;
- distinct-task and repetition support counts;
- source/base/result digests and policy version.

Unknown properties on scored rows are discarded. Tests inject canary expected
sets and `TEST_ONLY_` values and require them to be absent from repair evidence,
overlay, Final IR, provenance, and generated Markdown.

## Typed Repairs

The first typed repair catalog is intentionally small:

- `source-qualified-finding`: code-derived security and exposure findings must
  contain repository-relative source location plus symbol or location, derived
  from the current workspace;
- `json-schema-contract`: generated schemas must use canonical JSON Schema
  vocabulary and infer types, formats, requiredness, ranges, lengths, and
  sensitivity only from visible project evidence.

The catalog contains generic instructions, not benchmark entities. A repair is
eligible only after the configured minimum number of distinct development tasks
support it. Repetitions increase observation count but do not substitute for
task diversity.

Typed repair lowering adds stable rules and runtime output checks to a copy of
the base IR, then runs existing normalization, environment-guard, profile merge,
profile-guided repair, and validation passes. The frozen base IR is unchanged.

## Artifact And Provenance Contract

The compiler writes:

```text
repair-evidence.json
overlay/env-manager.json
final-ir/env-manager.json
ir/env-manager.json
summary.json
provenance.json
```

Final provenance v2 binds the corpus manifest, paired scored-results digest,
repair-evidence digest, source/base/overlay/final digests, both construction
systems, complete run configurations, task split, and policy/catalog versions.
The runner continues to read legacy provenance v1 for archived artifacts but
requires v2 for the new diagnostic replay.

## Development Replay

Before held-out use, the same development tasks are rerun with an explicit
diagnostic system label `ir-pgo-dev`. It consumes only provenance-validated v2
Final IR and is excluded from all main tables. Its purposes are:

- verify that the intended Final IR is consumed;
- check whether typed residual criteria improve;
- reject hard-gate or criterion regressions against `ir-static`;
- measure token and latency diagnostics.

Development replay never changes the scorer, repair catalog, overlay, or Final
IR. A failed replay returns the method to design work; it does not authorize
held-out execution.

## Acceptance Criteria

- No held-out, infrastructure, no-skill, or scorer payload data contributes.
- Every eligible repair has original/static paired lineage and support from at
  least two distinct development tasks.
- Any static regression blocks compilation.
- Overlay and Final IR contain generic typed rules and no benchmark gold values.
- Provenance validation detects result, evidence, overlay, base, or Final IR
  tampering.
- Development replay has zero hard-gate regressions versus `ir-static`.
