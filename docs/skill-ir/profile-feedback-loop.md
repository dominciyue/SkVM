# Skill IR Profile Feedback Loop

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

`Final Optimized IR` is produced by compiling the base IR and overlay through deterministic passes: rule normalization, environment guard insertion, profile annotation merge, profile-guided repair, and validation.

The current project should not claim that an arbitrary imported skill can be transformed into a globally optimal final IR without any validation. The practical target is:

```text
cold-start import -> strong static optimized IR
warm-start with execution evidence -> profile-guided final optimized IR
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
```

The `ir/` directory is kept as a compatibility alias for `final-ir/` because `real-agent-run.ts --ir-override-dir` consumes a directory of `<skill-id>.json` files. The base corpus IR files are not overwritten. Final IR artifacts should be treated as experiment artifacts or copied into a dedicated corpus only when a later held-out run needs them.

## Command Line

Generate profile overlay and final IR artifacts from a scored run:

```powershell
bun ./src/benchmarks/skill-ir/profile-feedback-run.ts '--results=results/skill-ir/harder-heldout-compressed-gpt41nano-results-2026-07-09.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--source-system=original' '--min-evidence=1' '--out-dir=results/skill-ir/profiled-ir-gpt41nano-2026-07-09'
```

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
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=report-overclaim-hard-001' '--limit=1' '--model=xty/gpt-4.1-nano' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/profiled-ir-gpt41nano-2026-07-09/final-ir' '--out-dir=results/skill-ir/ir-pgo-dry-run-2026-07-09'
```

The generated `SKILL.md` included:

```text
check-rule-required-sections-profile
recover-rule-required-sections
```

A later Task 11D real-agent validation run compared `original`, `ir-profile`, and `ir-pgo` on two compressed report-synthesis tasks with `xty/gpt-4.1-nano`. The run completed with no infrastructure failures and confirmed that the final IR was consumed by the real-agent materialization path. After scorer wording corrections, all three systems passed both tasks. This is mechanism and non-regression evidence, not a new quality-gain claim. See `docs/skill-ir/ir-pgo-validation-gpt41nano-run.md`.

For a stricter repeated-failure profile, use the default threshold:

```powershell
bun ./src/benchmarks/skill-ir/profile-feedback-run.ts '--results=results/skill-ir/main-results.jsonl' '--manifest=benchmarks/skill-ir/corpus/manifest.json' '--source-system=original' '--task-split=development' '--out-dir=results/skill-ir/profiled-ir-main'
```

`--min-evidence=1` is useful for small case-study calibration runs. The default is `2`, which requires repeated evidence before creating a profile annotation.

## `ir-profile` vs `ir-pgo`

The systems now have distinct meanings:

| System | Meaning |
|---|---|
| `ir-profile` | Static Skill IR materialization plus profile-guided repair over whatever `profile` annotations already exist in the input IR. |
| `ir-pgo` | Profile-guided materialization intended for final IR generated from scored result feedback. |

`ir-pgo` does not magically load profile files by itself. It renders the IR it is given. To evaluate true profile-guided optimization, run the feedback CLI first, point a follow-up corpus or temporary root at the final IR files, then run `real-agent-run.ts` with `--systems=original,ir-profile,ir-pgo`.

The real-agent runner accepts the final IR directory directly:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile,ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=report-overclaim-hard-001' '--model=xty/gpt-4.1-nano' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/profiled-ir-gpt41nano-2026-07-09/final-ir' '--out-dir=results/skill-ir/ir-pgo-dry-run-2026-07-09'
```

`--ir-override-dir` expects a complete set of `<skill-id>.json` files. The feedback CLI writes all manifest skills, even when only one skill receives a new annotation, so the follow-up run cannot accidentally mix base and final IR.

## Failure Modes

- Infrastructure rows are ignored so provider, gateway, credential, timeout, and tool-call-format failures do not become skill profile feedback.
- Unknown failed criteria fall back to stable `rule-<slug>` target refs. They will produce annotations, but profile-guided repair can only generate rule-specific checks when the target ref exists in the IR rule list.
- A low `--min-evidence` can overfit small runs. Use it for case studies, then validate on held-out tasks.
- Final IR should not be treated as the new base corpus until the source rows and train/eval split are documented.

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
