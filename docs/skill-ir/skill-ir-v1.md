# Skill IR v1

## Purpose

Skill IR v1 is the first structured intermediate representation for natural-language skills in this project. It makes skill semantics explicit enough for validation, AOT optimization passes, profile annotations, and runtime lowering.

The schema is implemented in:

```text
src/skill-ir/schema.ts
```

The focused schema tests are implemented in:

```text
src/skill-ir/schema.test.ts
```

## What It Represents

The top-level `SkillIR` object records:

- `schemaVersion`: fixed version tag, currently `skill-ir/v1`.
- `id` and `name`: stable identity for the skill.
- `category`: one or more skill categories used for corpus analysis and pass selection.
- `intent`: the skill's high-level purpose.
- `source`: where the skill came from, either inline text or a repository-relative file path pinned by SHA-256.
- `inputs` and `outputs`: expected inputs and produced artifacts.
- `preconditions`: requirements that should hold before execution.
- `steps`: ordered or dependency-linked execution units.
- `rules`: extracted MUST / NEVER / SHOULD constraints.
- `tools`: tool requirements and platform-specific notes.
- `environment`: assumptions about OS, container, WSL, or runtime context.
- `checks`: preflight, step, rule, and output checks generated from the IR.
- `recovery`: failure recovery policies.
- `profile`: dynamic observations derived from execution traces.

## Implementation

The schema uses Zod so runtime validation and TypeScript inference stay in sync. Each nested concept has its own exported schema:

```text
SkillCategorySchema
SkillSourceSchema
InputSpecSchema
OutputSpecSchema
ConditionSchema
StepSchema
RuleSchema
ToolRequirementSchema
EnvironmentAssumptionSchema
RuntimeCheckSchema
RecoveryPolicySchema
ProfileAnnotationSchema
SkillIRSchema
```

TypeScript types are inferred from Zod:

```ts
export type SkillIR = z.infer<typeof SkillIRSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type RuntimeCheck = z.infer<typeof RuntimeCheckSchema>;
export type ProfileAnnotation = z.infer<typeof ProfileAnnotationSchema>;
```

This keeps future passes type-safe without duplicating schema definitions.

### Source Contract

```ts
type SkillSource =
  | { kind: "inline"; text: string }
  | { kind: "file"; path: string; sha256: string };
```

File paths must stay inside the repository root and `sha256` must be a 64-character hexadecimal digest of the exact source bytes. Real-agent `original` materialization verifies the digest, injects those exact bytes as `SKILL.md`, and copies the source directory closure so relative scripts and references remain available. Missing, escaped, or stale sources fail before execution.

## Runtime Behavior

Consumers should call:

```ts
SkillIRSchema.parse(candidate);
```

This returns a typed `SkillIR` when the candidate is valid and throws a Zod error when the candidate is invalid. Parser, validator, pass, profiler, and lowering modules should accept `SkillIR` after schema parsing rather than trusting raw JSON.

## Command Line

Run the focused schema tests:

```powershell
bun test ./src/skill-ir/schema.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

Run the full test suite when the Windows shell baseline is under control:

```powershell
$env:PATH='C:\Program Files\Git\usr\bin;' + $env:PATH
bun test
```

## Example

```json
{
  "schemaVersion": "skill-ir/v1",
  "id": "skill-review",
  "name": "Code Review",
  "category": ["workflow", "constraint-heavy"],
  "intent": "Review code changes and report findings first.",
  "source": { "kind": "file", "path": "skills/review/SKILL.md" },
  "inputs": [],
  "outputs": [{ "id": "final-response", "description": "Review findings", "required": true }],
  "preconditions": [],
  "steps": [
    {
      "id": "step-read-diff",
      "title": "Read diff",
      "description": "Inspect changed files before producing findings.",
      "kind": "read",
      "required": true,
      "dependsOn": [],
      "toolRefs": [],
      "produces": ["diff-understanding"],
      "successCheckRefs": ["check-diff-read"],
      "failureModes": ["missing-diff"]
    }
  ],
  "rules": [
    {
      "id": "rule-findings-first",
      "sourceText": "Findings should lead the response.",
      "level": "must",
      "scope": "output",
      "checkability": "human",
      "severity": "high",
      "normalizedForm": "Output begins with findings before summary."
    }
  ],
  "tools": [],
  "environment": [],
  "checks": [
    {
      "id": "check-diff-read",
      "name": "Diff was inspected",
      "kind": "step-success",
      "targetRef": "step-read-diff",
      "assertion": "The execution trace includes a diff or file inspection action.",
      "onFailure": "abort"
    }
  ],
  "recovery": [],
  "profile": []
}
```

## Assumptions And Failure Modes

- `SkillIRSchema` validates shape only. Cross-reference checks such as missing `dependsOn` targets belong in `src/skill-ir/validate.ts`.
- Step ordering is represented through `dependsOn`, not a full control-flow graph.
- `checkability: "human"` is allowed at schema level. Later validation can warn or fail when high-severity rules remain human-only.
- Platform behavior is represented as metadata here. Environment-specific command generation belongs in later adapter/lowering modules.

## Modification Notes

- Add new enum values only when a pass or benchmark needs them.
- Keep schema changes backward-compatible when possible.
- If a field becomes required, update parser, validator, fixtures, and corpus IR examples in the same stage.
- Update this document whenever `src/skill-ir/schema.ts` changes.
