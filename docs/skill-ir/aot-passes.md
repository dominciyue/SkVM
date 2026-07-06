# Skill IR AOT Passes

## Purpose

The AOT pass layer rewrites a validated `SkillIR` into a more executable and checkable form before lowering. The current implementation focuses on three stability problems:

- Natural-language runtime rules should become explicit runtime checks.
- Required tools should be guarded before execution starts.
- Repeated trace failures should feed back into checks and recovery policies.

The pass implementations live in:

```text
src/skill-ir/passes/
```

Focused tests live next to each pass:

```text
src/skill-ir/passes/rule-normalization.test.ts
src/skill-ir/passes/environment-guards.test.ts
src/skill-ir/passes/profile-guided-repair.test.ts
```

## Public API

```ts
normalizeRules(ir: SkillIR): SkillIR
insertEnvironmentGuards(ir: SkillIR): SkillIR
applyProfileGuidedRepair(ir: SkillIR): SkillIR
```

All three functions are pure transformations. They return a new `SkillIR` object and keep the input arrays unchanged.

## Rule Normalization

Implemented in:

```text
src/skill-ir/passes/rule-normalization.ts
```

`normalizeRules` converts runtime-checkable rules into `RuntimeCheck` entries.

Generation rules:

- Only rules with `checkability === "runtime"` generate checks.
- Generated check id is `check-${rule.id}`.
- Existing checks with the same id are preserved and not duplicated.
- `scope === "output"` generates an `output` check.
- Other runtime rules generate `rule-violation` checks.
- High-severity rules use `onFailure: "abort"`.
- Low and medium severity rules use `onFailure: "report"`.
- The check assertion is copied from `rule.normalizedForm`.

This pass turns implicit instructions such as "the final answer must list findings first" into a downstream checker target.

## Environment Guards

Implemented in:

```text
src/skill-ir/passes/environment-guards.ts
```

`insertEnvironmentGuards` generates preflight checks for required tools.

Generation rules:

- Only required tools generate guards.
- Generated check id is `preflight-${tool.id}`.
- Existing checks with the same id are preserved and not duplicated.
- Generated guards are inserted before existing checks so runtime preflight work happens early.
- `command` is copied from `tool.availabilityCheck`.
- If alternatives exist, failure action is `fallback`.
- If no alternatives exist, failure action is `abort`.
- The assertion names available alternatives, or `none` if no alternative exists.

This pass targets cross-machine instability: missing commands, platform-dependent tooling, and different shell/runtime setups.

## Profile-Guided Repair

Implemented in:

```text
src/skill-ir/passes/profile-guided-repair.ts
```

`applyProfileGuidedRepair` consumes `ProfileAnnotation` records generated from execution traces.

Generation rules:

- `frequent-skip` on a `step-*` target generates a step-success check.
- Generated step check id is `check-${targetRef}-profile`.
- The generated step check retries on failure.
- `frequent-failure` generates a recovery policy.
- Generated recovery id is `recover-${targetRef}`.
- Recovery action is `retry` with `maxAttempts: 1`.
- The recovery explanation records the trace evidence count.
- Existing generated checks and recovery policies are preserved and not duplicated.

This pass is the first dynamic feedback point in the project: observed execution instability becomes IR-level repair logic.

## Runtime Order

The intended static pipeline order is:

```text
SkillIR
  -> normalizeRules
  -> insertEnvironmentGuards
  -> applyProfileGuidedRepair
  -> lowering
```

The order keeps rule checks visible before profile repair and places environment guards before ordinary checks. Later work can wrap these functions in an explicit pass manager with pass metadata and ablation toggles.

## Command Line

Run only the AOT pass tests:

```powershell
bun test ./src/skill-ir/passes/rule-normalization.test.ts ./src/skill-ir/passes/environment-guards.test.ts ./src/skill-ir/passes/profile-guided-repair.test.ts
```

Run the current Skill IR subsystem tests:

```powershell
bun test ./src/skill-ir/schema.test.ts ./src/skill-ir/validate.test.ts ./src/skill-ir/parser.test.ts ./src/skill-ir/corpus-fixtures.test.ts ./src/profiler/trace-schema.test.ts ./src/profiler/profile-annotation.test.ts ./src/skill-ir/passes/rule-normalization.test.ts ./src/skill-ir/passes/environment-guards.test.ts ./src/skill-ir/passes/profile-guided-repair.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Assumptions And Failure Modes

- Inputs are expected to have already passed `SkillIRSchema.parse` and `validateSkillIR`.
- A pass detects duplicates by generated id only. If a hand-written check uses a different id but the same semantic target, both checks remain.
- Runtime assertion strings are still declarative. Lowering will decide how much can be executed automatically.
- Environment guard commands are stored, not executed, at this layer.
- Profile-guided repair currently handles `frequent-skip` and `frequent-failure`. `environment-sensitive`, `agent-sensitive`, `context-sensitive`, and `high-token-cost` are reserved for later passes.

## Modification Notes

- Add failing tests before changing pass behavior.
- Keep pass functions side-effect free so benchmark ablations can compose them safely.
- Preserve user-authored checks and recovery policies when a generated id already exists.
- Update this document when generated ids, failure actions, ordering, or supported profile observations change.
