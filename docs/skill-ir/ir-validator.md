# Skill IR Validator

## Purpose

The Skill IR validator checks semantic consistency after raw JSON has already passed `SkillIRSchema.parse`. It is the first IR-level gate before AOT optimization passes run.

The validator is implemented in:

```text
src/skill-ir/validate.ts
```

Focused tests are implemented in:

```text
src/skill-ir/validate.test.ts
```

## Boundary With The Schema

`src/skill-ir/schema.ts` validates object shape and field types. The validator checks relationships between fields.

Examples:

- Schema checks that `steps` is an array.
- Validator checks that `step.dependsOn` points to existing steps.
- Schema checks that `toolRefs` is an array of strings.
- Validator checks that each referenced tool exists in `tools`.
- Schema allows high-severity human-checkable rules.
- Validator warns when high-severity MUST or NEVER rules remain human-only.

This separation keeps schema parsing fast and reusable while allowing stricter project policy to evolve in the validator.

## Runtime Behavior

The public API is:

```ts
validateSkillIR(ir: SkillIR): ValidationReport
```

It returns:

```ts
type ValidationReport = {
  errors: string[];
  warnings: string[];
};
```

Errors represent consistency problems that should block downstream passes. Warnings represent risks that may be acceptable during early corpus construction but should be reviewed.

## Checks

Current error checks:

- A step dependency must reference an existing step.
- A step tool reference must reference an existing tool.
- A step success check reference must reference an existing runtime check.
- A required step must define at least one success check or produced artifact.
- An `environment-sensitive` skill must define at least one environment assumption.

Current warning checks:

- A high-severity MUST or NEVER rule should not remain only human-checkable.

## Command Line

Run focused validator tests:

```powershell
bun test ./src/skill-ir/validate.test.ts
```

Run schema and validator tests together:

```powershell
bun test ./src/skill-ir/schema.test.ts ./src/skill-ir/validate.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Failure Modes

- The validator assumes the input already satisfies `SkillIRSchema`. Passing raw JSON directly can lead to misleading errors.
- The validator does not currently detect cycles in `dependsOn`. Add that when pass ordering depends on topological sorting.
- The validator does not enforce unique ids because the schema currently treats ids as plain strings. Add duplicate detection if corpus construction begins producing repeated ids.

## Modification Notes

- Add tests before each new consistency check.
- Keep error messages stable because tests and future corpus reports may match them.
- Prefer warnings for risks that should not block early IR extraction.
- Prefer errors for problems that make downstream passes ambiguous or unsafe.
- Update this document whenever `src/skill-ir/validate.ts` changes.
