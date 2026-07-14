# Skill IR Profile Feedback Loop

> **Current policy (2026-07-15): task-local repair.** Generate overlays only from a pilot skill's development tasks and evaluate them on disjoint held-out tasks from the same skill/task family. Do not assume cross-model or cross-skill transfer without a separate experiment.

## Purpose

Task 11C adds the missing dynamic feedback path for profile-guided Skill IR optimization. Earlier Task 11 runs showed useful static IR materialization effects, but the base corpus IR files still had empty `profile` arrays. This component turns scored real-agent failures into typed trace feedback, profile overlays, and final optimized IR artifacts.

The IR architecture is three-layered:

```text
Static Base IR
  + Profile Overlay
  + Optimization Passes
= Final Optimized IR
```

`Static Base IR` comes from reading or parsing the skill. It records the skill's intended steps, rules, tools, checks, environment assumptions, and recovery policies. It is the semantic base and should not be overwritten by one experimental run.

`Profile Overlay` comes from observed execution behavior. It records profile annotations such as repeated rule failures, skipped required steps, context-sensitive omissions, or environment-sensitive failures. It is evidence, not the source skill itself.

`Final Optimized IR` is produced by compiling the base IR and overlay through deterministic passes: rule normalization, environment guard insertion, profile annotation merge, profile-guided repair, and validation. Final IR is a compiled artifact, not a runtime-system synonym. Its provenance binds the explicit corpus, `original × development` evidence, source, base IR, overlay, and final IR digests.

The current project should not claim that an arbitrary imported skill can be transformed into a globally optimal final IR without validation. The practical target is:

```text
cold-start import -> strong static optimized IR
warm-start with task-local development evidence -> profile-guided candidate IR
held-out runs -> evidence that the optimization generalizes
```

This keeps the final system compatible with the project goal while avoiding an unsupported promise that no verification is needed.

The feedback loop is:

```text
scored result JSONL
  -> ExecutionTrace rows
  -> ProfileAnnotation records
  -> Profile Overlay JSON
  -> Final Optimized IR JSON
  -> ir-pgo materialization
```

## Files

Implementation:

```text
src/benchmarks/skill-ir/profile-feedback.ts
src/benchmarks/skill-ir/profile-feedback-run.ts
```

Tests:

```text
src/benchmarks/skill-ir/profile-feedback.test.ts
```

Related components:

```text
src/profiler/profile-annotation.ts
src/skill-ir/passes/profile-guided-repair.ts
src/benchmarks/skill-ir/real-agent.ts
src/benchmarks/skill-ir/matrix.ts
```

## Runtime Behavior

`profile-feedback.ts` exposes:

```ts
targetRefForFailedCriterion(criterion, ir)
scoredRowsToExecutionTraces(rows, irBySkill, opts)
mergeProfileAnnotationsIntoIR(ir, annotations)
buildProfiledIRFromScoredRows(ir, rows, opts)
```

The converter:

- skips successful rows;
- skips rows marked `failureType: "infrastructure"`;
- optionally filters by source system, usually `original`;
- optionally filters by task split, usually development or calibration rows;
- maps failed success criteria to stable IR target refs;
- emits `rule-violation` trace events for semantic task failures.

New traces carry the complete run identity: `model`, `modelFamily`, `adapter`,
`adapterVersion`, `runIndex`, and `panelConfigId`. Archived traces may omit all
six fields; partial identity is rejected. Identity is included in `traceId` so
repetitions cannot collide. Duplicate trace evidence is rejected before it can
increase annotation counts, and all relevant rows are identity-validated before
success or infrastructure filtering.

`profile-feedback-run.ts` exposes:

```ts
buildProfileFeedbackArtifacts(rows, irBySkill, opts)
```

and a CLI that writes:

```text
<out-dir>/overlay/<skill-id>.json
<out-dir>/final-ir/<skill-id>.json
<out-dir>/ir/<skill-id>.json
<out-dir>/summary.json
<out-dir>/provenance.json
```

The `ir/` directory is kept as a compatibility alias for `final-ir/` because `real-agent-run.ts --ir-override-dir` consumes a directory of `<skill-id>.json` files. The base corpus IR files are not overwritten. The runner reads `provenance.json` from the parent directory and rejects missing, stale, held-out-derived, hand-edited, or corpus-mismatched artifacts.

`provenance.json` also records sorted, deduplicated construction configurations:

```json
{
  "model": "xty/gpt-4.1-mini",
  "modelFamily": "gpt",
  "adapter": "bare-agent",
  "adapterVersion": "workspace-2026-07-15",
  "panelConfigId": "env-manager-calibration-v1",
  "runIndices": [1, 2, 3]
}
```

These entries are derived from the same scored results file whose SHA-256 is
stored in provenance, both during construction and consumption. Only
`original x development` rows contribute construction metadata. Successful and
infrastructure rows remain represented so the attempted configuration is
disclosed, while infrastructure rows still cannot create repair annotations.
Fully legacy results receive one `{ "status": "legacy-unidentified" }` marker.
Partial identity, mixed legacy/identified rows, duplicate evidence, and configs
that disagree with the hashed results fail closed.

## Command Line

Generate profile overlay and final IR artifacts from a scored run:

```powershell
bun ./src/benchmarks/skill-ir/profile-feedback-run.ts '--corpus=calibration' '--results=results/skill-ir/development-results.jsonl' '--source-system=original' '--task-split=development' '--min-evidence=2' '--out-dir=results/skill-ir/profiled-ir'
```

`--corpus` and `--task-split=development` are required. The compiler refuses non-`original` source systems and non-development evidence.

The first Task 11C local verification used this command on 2026-07-09. It read 12 scored rows, converted one non-infrastructure original failure into a trace, and generated one annotation for `skill-report-synthesis`:

```text
targetRef: rule-required-sections
sourceTrace: score-skill-report-synthesis-skvm-linux-compressed-report-overclaim-hard-001-original
observation: frequent-failure
```

The output was written to:

```text
results/skill-ir/profiled-ir-gpt41nano-2026-07-09/
```

A follow-up dry-run verified that `ir-pgo` can consume this final IR:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=calibration' '--systems=ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=windows' '--tasks=<held-out-task-id>' '--limit=1' '--model=<model>' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/profiled-ir/final-ir' '--out-dir=results/skill-ir/ir-pgo-held-out-dry-run'
```

The generated `SKILL.md` included:

```text
check-rule-required-sections-profile
recover-rule-required-sections
```

A later Task 11D real-agent validation run compared `original`, `ir-profile`, and `ir-pgo` on two compressed report-synthesis tasks with `xty/gpt-4.1-nano`. The run completed with no infrastructure failures and confirmed that the final IR was consumed by the real-agent materialization path. After scorer wording corrections, all three systems passed both tasks. This is mechanism and non-regression evidence, not a new quality-gain claim. See `docs/skill-ir/ir-pgo-validation-gpt41nano-run.md`.

Task 11E then expanded the check to all six current deep-benchmark skills and three route-probed models. The result was mixed: `ir-pgo` performed best on `gpt-4.1-nano`, matched non-infrastructure Gemini rows, but underperformed static `ir-profile` on `qwen3-8b`. This means the current final IR artifact should remain an experiment artifact rather than replacing static IR by default. Future final IR promotion needs model-family evidence, confidence/risk scoring, and cost/latency gates. See `docs/skill-ir/final-ir-multiskill-multimodel-run.md`.

For a stricter repeated-failure profile, use the default threshold:

```powershell
bun ./src/benchmarks/skill-ir/profile-feedback-run.ts '--corpus=pilot' '--results=results/skill-ir/pilot-development-results.jsonl' '--source-system=original' '--task-split=development' '--out-dir=results/skill-ir/pilot-profiled-ir'
```

`--min-evidence=1` is useful for small case-study calibration runs. The default is `2`, which requires repeated evidence before creating a profile annotation.

## `ir-profile` vs `ir-pgo`

The systems now have distinct meanings:

| System | Meaning |
|---|---|
| `ir-profile` | Static Skill IR materialization plus profile-guided repair over whatever `profile` annotations already exist in the input IR. |
| `ir-pgo` | Held-out execution that consumes provenance-validated Final IR generated from scored `original × development` feedback. |

`ir-pgo` does not infer profile files by itself. To evaluate true profile-guided optimization, run the feedback CLI first and pass its Final IR directory to `real-agent-run.ts`. The runner rejects `ir-pgo` without matching provenance and rejects any selected task that is not held-out.

A selected skill must also have at least one profile annotation. The compiler may archive a zero-annotation Final IR, but the runner will not present unchanged behavior under the `ir-pgo` label.

The real-agent runner accepts the final IR directory directly:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=pilot' '--systems=ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=windows' '--tasks=<held-out-task-id>' '--model=<model>' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/pilot-profiled-ir/final-ir' '--out-dir=results/skill-ir/pilot-ir-pgo-held-out'
```

`--ir-override-dir` expects a complete set of `<skill-id>.json` files. The feedback CLI writes all runnable corpus skills, even when only one skill receives a new annotation, so the follow-up run cannot accidentally mix base and final IR. `provenance.json` binds that set to its exact inputs.

## Failure Modes

- Infrastructure rows are ignored so provider, gateway, credential, timeout, and tool-call-format failures do not become skill profile feedback.
- Unknown failed criteria fall back to stable `rule-<slug>` target refs. They will produce annotations, but profile-guided repair can only generate rule-specific checks when the target ref exists in the IR rule list.
- A low `--min-evidence` can overfit small runs. Use it only for method case studies; real pilots require documented development evidence and disjoint held-out validation.
- An overlay generated on one model route is not a model-family profile and must not be assumed to transfer to another route.
- Final IR should not be treated as the new base corpus. It remains a versioned compiled artifact tied to recorded development evidence.
- Construction identity is audit metadata for the current single-model vertical.
  Balanced pooling, conflict arbitration, panel choice, and promotion remain
  disabled until the env-manager vertical is stable.

## Verification

Run focused tests:

```powershell
bun test ./src/benchmarks/skill-ir/profile-feedback.test.ts
```

Run related tests:

```powershell
bun test ./src/benchmarks/skill-ir/profile-feedback.test.ts ./src/profiler/profile-annotation.test.ts ./src/skill-ir/passes/profile-guided-repair.test.ts ./src/benchmarks/skill-ir/matrix.test.ts ./src/benchmarks/skill-ir/real-agent.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Modification Notes

- Add a failed-criterion mapping test before extending `targetRefForFailedCriterion`.
- Keep `ir-profile` stable for comparisons with archived runs.
- Add new behavior to `ir-pgo`, profile overlay generation, or final IR compilation when the change depends on dynamic feedback.
- Keep train/evaluation separation explicit in run documents.
