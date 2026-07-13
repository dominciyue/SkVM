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
    ci-diagnostic-skill.json
    env-portability-skill.json
    git-hygiene-skill.json
    tdd-bugfix-skill.json
    report-synthesis-skill.json
  tasks/
    review-skill-tasks.json
    ci-diagnostic-skill-tasks.json
    env-portability-skill-tasks.json
    git-hygiene-skill-tasks.json
    tdd-bugfix-skill-tasks.json
    report-synthesis-skill-tasks.json
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

The current expanded seed corpus contains 6 deep-benchmark fixtures:

| Skill | Categories | Purpose |
|---|---|---|
| `skill-review` | workflow, constraint-heavy | Code review ordering and prioritization. |
| `skill-ci-diagnostic` | diagnostic, tool-use, environment-sensitive | CI log diagnosis with root cause, fix, and verification. |
| `skill-env-portability` | tool-use, environment-sensitive | Cross-shell and cross-OS command adaptation. |
| `skill-git-hygiene` | tool-use, constraint-heavy | Safe dirty-worktree handling. |
| `skill-tdd-bugfix` | workflow, diagnostic | Test-first bug fix planning. |
| `skill-report-synthesis` | generative, workflow, constraint-heavy | Evidence-grounded report generation. |

These fixtures are currently local synthetic/research fixtures. They were created to make the pipeline executable and to cover controlled failure modes. They are not yet a representative sample of public or user-provided skills. Broad generalization claims should wait until the corpus includes externally sourced skills with explicit provenance.

Their evidence weight should be low in the main research claims. They are development and calibration fixtures, not proof that Skill IR handles arbitrary public skills. Report them separately from real/public skill rows or mark them as a controlled case-study slice.

Future manifest entries should record provenance:

```text
synthetic-seed
adapted-public
real-public
upstream-skvm
user-provided
```

The current six fixtures should be labeled `synthetic-seed` once provenance fields are added to the manifest.

Future analysis should avoid one aggregate number that mixes these synthetic rows with real/public rows. If a mixed table is necessary, include provenance counts and a real-skill-only slice.

## Context Perturbations

`benchmarks/skill-ir/contexts/standard-contexts.json` defines the standard context settings used in evaluation:

- `clean`: only task and skill are provided.
- `noisy`: irrelevant or misleading context is present.
- `long`: long surrounding repository or conversation context is present.
- `compressed`: summarized prior context may omit details.

These are the first axis for measuring cross-context stability.

## IR Fixtures

`benchmarks/skill-ir/ir/review-skill.json` was the first complete IR fixture. The current seed corpus now includes six complete IR fixtures across the project categories.

The fixture is intentionally small but complete:

- It has required read, analyze, and report steps.
- It includes output-order and prioritization rules.
- It has runtime checks for reading the diff, considering findings, and reporting findings first.
- It validates cleanly through both `SkillIRSchema` and `validateSkillIR`.

## Task Fixtures

Each task file under `benchmarks/skill-ir/tasks/` defines benchmark prompts for exactly one skill. The file's `skillId` must match the manifest entry.

Current splits:

- `development`: may be used while designing or debugging the IR.
- `held-out`: should be reserved for later evaluation.

Each task must include:

- `id`
- `split`
- `prompt`
- `successCriteria`

For real-agent execution, review tasks must be self-contained. The prompt should include the patch or code snippet being reviewed, preferably as a fenced `diff` block. A task that only says "review a change" is not executable because the agent receives an empty work directory unless explicit fixtures are provided.

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
4. Record provenance and source information.
5. Ensure the IR passes `SkillIRSchema.parse`.
6. Ensure the IR passes `validateSkillIR` with no errors.
7. Add or update fixture tests if the new fixture introduces a new file shape or category assumption.

Preferred next additions:

- upstream SkVM skills from `skills/`;
- public skills from open agent repositories;
- user/lab-provided skills;
- non-coding workflow skills;
- bilingual or Chinese skills;
- schema-heavy output skills;
- environment-sensitive tool skills.

## Failure Modes

- A fixture can be valid JSON but fail `SkillIRSchema` if fields are missing or enum values are wrong.
- A fixture can pass schema parsing but fail `validateSkillIR` if step, tool, or check references are inconsistent.
- A task file can be syntactically valid but still weak if `successCriteria` are vague. Prefer criteria that can later be turned into automatic checks.
- A task can be syntactically valid but unexecutable if the prompt omits the log, diff, code snippet, command, or notes the agent needs. The fixture test enforces self-contained review prompts and minimum prompt length for all seed tasks.
- Corpus manifest entries can drift from actual file paths. Keep `irPath` and `tasksPath` current when moving files.
- Synthetic seed skills can overstate generality if reported as real public skills.
- GPT-friendly coding-agent tasks can hide model-family behavior differences.

## Modification Notes

- Keep fixture ids stable once referenced by traces or result files.
- Use `held-out` tasks only for evaluation, not for manual tuning.
- Prefer adding small, complete fixtures over large partial ones.
- Do not mix synthetic and real/public skills in aggregate claims without reporting provenance.
- Treat current synthetic seed results as lower-confidence calibration evidence until real/public skill coverage exists.
- Update this document when fixture layout, split names, or validation policy changes.
