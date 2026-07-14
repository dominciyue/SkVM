# Skill IR Lowering

## Purpose

Lowering converts optimized `SkillIR` into runtime-facing artifacts. The v1 lowering layer does not execute tools, run checks, or control an agent directly. It prepares structured data that later runtime modules can consume.

This places the implementation at L1/early-L2 maturity. Rendered controller/checker/adapter material is a declarative specification, not independent runtime enforcement.

The implementation lives in:

```text
src/skill-ir/lowering/
```

Focused tests live in:

```text
src/skill-ir/lowering/lowering.test.ts
```

## Public API

```ts
lowerToControllerPlan(ir: SkillIR): ControllerPlan
lowerToCheckerSpec(ir: SkillIR): CheckerSpec
lowerToAdapterSpec(ir: SkillIR): AdapterSpec
```

The functions are pure transformations. They return new artifact objects and copy nested arrays so artifact consumers do not share mutable arrays with the source IR.

## Controller Plan

Implemented in:

```text
src/skill-ir/lowering/controller.ts
```

The controller plan contains the skill identity, intent, and executable step skeleton:

```ts
type ControllerPlan = {
  skillId: string;
  skillName: string;
  intent: string;
  steps: ControllerStep[];
};
```

Each `ControllerStep` keeps:

- `id`
- `title`
- `kind`
- `required`
- `dependsOn`
- `toolRefs`
- `checks`
- `produces`

The controller plan is intended to guide an agent runtime through required skill steps and expose which checks should be satisfied per step.

## Checker Spec

Implemented in:

```text
src/skill-ir/lowering/checker.ts
```

The checker spec contains:

- `skillId`
- `checks`
- `recovery`

Runtime checks come from static IR, AOT passes, and profile-guided repair. Recovery policies tell later checker/runtime code what to try when a check fails.

## Adapter Spec

Implemented in:

```text
src/skill-ir/lowering/adapter.ts
```

The adapter spec contains:

- `skillId`
- `tools`
- `environment`

It is the bridge between IR-level tool requirements and later platform-specific execution. The current layer preserves `availabilityCheck`, `alternatives`, `platformNotes`, and environment assumptions without running any command.

## Expected Pipeline Position

The intended pipeline is:

```text
SkillIR
  -> validation
  -> AOT passes
  -> lowering
  -> controller / checker / adapter runtime
```

Lowering should receive a validated and optimized IR. It does not repair missing references; that remains the validator's responsibility.

## Engineering North Star

The full package contract is documented in `docs/skill-ir/validated-skill-artifact-package.md`.

Lowering should eventually populate a Validated Skill Artifact Package:

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
  provenance + validation notes
```

`skill_ir.json` remains the authoritative semantics, while `skill.md` is a generated human/agent view. Reusable artifacts should be emitted only when they replace repeated reasoning or generation and have an explicit validation record. Package creation, cache policy, executable checkers, and artifact integrity are not implemented by the current lowering functions.

## Command Line

Run only lowering tests:

```powershell
bun test ./src/skill-ir/lowering/lowering.test.ts
```

Run the current Skill IR subsystem tests:

```powershell
bun test ./src/skill-ir/schema.test.ts ./src/skill-ir/validate.test.ts ./src/skill-ir/parser.test.ts ./src/skill-ir/corpus-fixtures.test.ts ./src/profiler/trace-schema.test.ts ./src/profiler/profile-annotation.test.ts ./src/skill-ir/passes/rule-normalization.test.ts ./src/skill-ir/passes/environment-guards.test.ts ./src/skill-ir/passes/profile-guided-repair.test.ts ./src/skill-ir/lowering/lowering.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Assumptions And Failure Modes

- Input should already satisfy `SkillIRSchema` and `validateSkillIR`.
- Lowering preserves IR order. Step scheduling or topological sorting belongs in a later controller runtime.
- Checker assertions are declarative strings at this stage.
- Adapter commands are declarative strings at this stage.
- Duplicate checks, tools, or steps are not resolved here.

## Modification Notes

- Add failing tests before changing artifact shape.
- Keep artifact types explicit because benchmark output and future runtime adapters will depend on them.
- Avoid returning source IR arrays directly.
- Update this document when artifact fields or pipeline position changes.
