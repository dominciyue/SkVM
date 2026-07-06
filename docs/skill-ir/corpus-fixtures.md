# Skill IR Corpus Fixtures

## Purpose

The Skill IR corpus fixtures provide the first concrete data layer for the Skill IR pipeline. They connect the abstract IR schema to benchmarkable skills, context perturbations, and task definitions.

The fixture files live under:

```text
benchmarks/skill-ir/
```

The fixture validation test is:

```text
src/skill-ir/corpus-fixtures.test.ts
```

## Directory Layout

```text
benchmarks/skill-ir/
  corpus/
    manifest.json
  contexts/
    standard-contexts.json
  ir/
    review-skill.json
  tasks/
    review-skill-tasks.json
```

## Manifest

`benchmarks/skill-ir/corpus/manifest.json` records the intended corpus scale and the known skills currently included.

Important fields:

- `schemaVersion`: currently `skill-ir-corpus/v1`.
- `categories`: the taxonomy categories used by the project.
- `targetCounts`: broad project targets for taxonomy, full IR, and deep benchmark coverage.
- `skills`: one entry per skill fixture.

The initial target scale is:

```json
{
  "taxonomySkills": 60,
  "fullIRSkills": 24,
  "deepBenchmarkSkills": 16
}
```

## Context Perturbations

`benchmarks/skill-ir/contexts/standard-contexts.json` defines the standard context settings used in evaluation:

- `clean`: only task and skill are provided.
- `noisy`: irrelevant or misleading context is present.
- `long`: long surrounding repository or conversation context is present.
- `compressed`: summarized prior context may omit details.

These are the first axis for measuring cross-context stability.

## IR Fixtures

`benchmarks/skill-ir/ir/review-skill.json` is the first complete IR fixture. It represents a code review skill with workflow and constraint-heavy behavior.

The fixture is intentionally small but complete:

- It has required read, analyze, and report steps.
- It includes output-order and prioritization rules.
- It has runtime checks for reading the diff, considering findings, and reporting findings first.
- It validates cleanly through both `SkillIRSchema` and `validateSkillIR`.

## Task Fixtures

`benchmarks/skill-ir/tasks/review-skill-tasks.json` defines benchmark prompts for `skill-review`.

Current splits:

- `development`: may be used while designing or debugging the IR.
- `held-out`: should be reserved for later evaluation.

Each task must include:

- `id`
- `split`
- `prompt`
- `successCriteria`

## Verification

Run the fixture test:

```powershell
bun test ./src/skill-ir/corpus-fixtures.test.ts
```

Run all current Skill IR tests:

```powershell
bun test ./src/skill-ir/schema.test.ts ./src/skill-ir/validate.test.ts ./src/skill-ir/parser.test.ts ./src/skill-ir/corpus-fixtures.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Adding A New Skill Fixture

When adding a skill:

1. Add an entry to `benchmarks/skill-ir/corpus/manifest.json`.
2. Add a full IR file under `benchmarks/skill-ir/ir/`.
3. Add task fixtures under `benchmarks/skill-ir/tasks/`.
4. Ensure the IR passes `SkillIRSchema.parse`.
5. Ensure the IR passes `validateSkillIR` with no errors.
6. Add or update fixture tests if the new fixture introduces a new file shape or category assumption.

## Failure Modes

- A fixture can be valid JSON but fail `SkillIRSchema` if fields are missing or enum values are wrong.
- A fixture can pass schema parsing but fail `validateSkillIR` if step, tool, or check references are inconsistent.
- A task file can be syntactically valid but still weak if `successCriteria` are vague. Prefer criteria that can later be turned into automatic checks.
- Corpus manifest entries can drift from actual file paths. Keep `irPath` and `tasksPath` current when moving files.

## Modification Notes

- Keep fixture ids stable once referenced by traces or result files.
- Use `held-out` tasks only for evaluation, not for manual tuning.
- Prefer adding small, complete fixtures over large partial ones.
- Update this document when fixture layout, split names, or validation policy changes.
