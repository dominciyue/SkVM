# Skill IR Profile Feedback Loop

## Purpose

Task 11C adds the missing dynamic feedback path for profile-guided Skill IR optimization. Earlier Task 11 runs showed useful static IR materialization effects, but the base corpus IR files still had empty `profile` arrays. This component turns scored real-agent failures into typed trace feedback and derived profiled IR artifacts.

The feedback loop is:

```text
scored result JSONL
  -> ExecutionTrace rows
  -> ProfileAnnotation records
  -> derived SkillIR JSON
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
<out-dir>/ir/<skill-id>.json
<out-dir>/summary.json
```

The base corpus IR files are not overwritten. Derived IR should be treated as an experiment artifact or copied into a dedicated corpus only when a later held-out run needs it.

## Command Line

Generate derived profiled IR from a scored run:

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

A follow-up dry-run verified that `ir-pgo` can consume this derived IR:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=report-overclaim-hard-001' '--limit=1' '--model=xty/gpt-4.1-nano' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/profiled-ir-gpt41nano-2026-07-09/ir' '--out-dir=results/skill-ir/ir-pgo-dry-run-2026-07-09'
```

The generated `SKILL.md` included:

```text
check-rule-required-sections-profile
recover-rule-required-sections
```

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
| `ir-pgo` | Profile-guided materialization intended for derived IR generated from scored result feedback. |

`ir-pgo` does not magically load profile files by itself. It renders the IR it is given. To evaluate true profile-guided optimization, run the feedback CLI first, point a follow-up corpus or temporary root at the derived IR files, then run `real-agent-run.ts` with `--systems=original,ir-profile,ir-pgo`.

The real-agent runner accepts the derived IR directory directly:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--systems=original,ir-profile,ir-pgo' '--contexts=compressed' '--agents=skvm' '--environments=linux' '--tasks=report-overclaim-hard-001' '--model=xty/gpt-4.1-nano' '--adapter=bare-agent' '--ir-override-dir=results/skill-ir/profiled-ir-gpt41nano-2026-07-09/ir' '--out-dir=results/skill-ir/ir-pgo-dry-run-2026-07-09'
```

`--ir-override-dir` expects a complete set of `<skill-id>.json` files. The feedback CLI writes all manifest skills, even when only one skill receives a new annotation, so the follow-up run cannot accidentally mix base and derived IR.

## Failure Modes

- Infrastructure rows are ignored so provider, gateway, credential, timeout, and tool-call-format failures do not become skill profile feedback.
- Unknown failed criteria fall back to stable `rule-<slug>` target refs. They will produce annotations, but profile-guided repair can only generate rule-specific checks when the target ref exists in the IR rule list.
- A low `--min-evidence` can overfit small runs. Use it for case studies, then validate on held-out tasks.
- Derived IR should not be treated as the new base corpus until the source rows and train/eval split are documented.

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
- Add new behavior to `ir-pgo` or derived IR artifacts when the change depends on dynamic feedback.
- Keep train/evaluation separation explicit in run documents.
