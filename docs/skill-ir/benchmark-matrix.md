# Skill IR Benchmark Matrix

## Purpose

The benchmark matrix defines which experiment cases should be run when comparing original skills, SkVM baselines, and Skill IR optimized systems. It turns the research dimensions into stable paired cases:

```text
Skill x Agent x Environment x Context x Task x System
```

The implementation lives in:

```text
src/benchmarks/skill-ir/matrix.ts
src/benchmarks/skill-ir/run.ts
```

Focused tests live in:

```text
src/benchmarks/skill-ir/matrix.test.ts
```

## Public API

```ts
buildExperimentMatrix(input: MatrixInput): ExperimentCase[]
buildDefaultMatrixInput(rootDir?: string): MatrixInput
```

`buildExperimentMatrix` builds the paired Cartesian product. `buildDefaultMatrixInput` reads the current benchmark fixture files:

```text
benchmarks/skill-ir/corpus/manifest.json
benchmarks/skill-ir/contexts/standard-contexts.json
benchmarks/skill-ir/tasks/*.json
```

## Skill-Specific Tasks

`MatrixInput` supports both:

```ts
tasks: string[]
tasksBySkill?: Record<string, string[]>
```

`tasks` is kept as a compatibility and reporting field. When `tasksBySkill` is present, `buildExperimentMatrix` schedules only the tasks owned by the current skill. This matters before Task 11B expansion: a multi-skill corpus must not produce synthetic cases such as `skill-review` paired with a diagnostic skill's task.

`buildDefaultMatrixInput` now builds `tasksBySkill` from each manifest entry's `tasksPath`, while also preserving the flattened `tasks` list for existing callers and documentation.

## Experiment Systems

The default system list is:

```text
no-skill
original
skvm-aot
ir-only
ir-static
ir-profile
```

This follows Task 7.5's literature calibration. `no-skill` and `original` make paired deltas and regressions visible; the IR systems show the effect of adding structure, static passes, and profile-guided repair.

## Paired Case Ids

Each case has a stable `caseId`:

```text
${skill}:${agent}:${environment}:${context}:${task}
```

All systems for the same skill, agent, environment, context, and task share the same `caseId`. Task 9's analyzer can use this to compute deltas against `baselineSystem` and count regressions.

## Skill Packaging

Each `ExperimentCase` includes `skillPackaging`:

```text
focused | broad | unknown
```

The current fixture loader infers seed skills as `focused` unless a manifest note explicitly says they are broad. This field exists because related work suggests broad skill bundles can confound skill evaluation. Later corpus work should make packaging explicit in the manifest.

## Command Line

Run only the matrix tests:

```powershell
bun test ./src/benchmarks/skill-ir/matrix.test.ts
```

Print the current default matrix:

```powershell
bun ./src/benchmarks/skill-ir/run.ts
```

Run matrix plus current Skill IR subsystem tests:

```powershell
bun test ./src/benchmarks/skill-ir/matrix.test.ts ./src/skill-ir/schema.test.ts ./src/skill-ir/validate.test.ts ./src/skill-ir/parser.test.ts ./src/skill-ir/corpus-fixtures.test.ts ./src/profiler/trace-schema.test.ts ./src/profiler/profile-annotation.test.ts ./src/skill-ir/passes/rule-normalization.test.ts ./src/skill-ir/passes/environment-guards.test.ts ./src/skill-ir/passes/profile-guided-repair.test.ts ./src/skill-ir/lowering/lowering.test.ts
```

Run type checking:

```powershell
bun run typecheck
```

## Assumptions And Failure Modes

- The default loader assumes task paths in `manifest.json` are relative to the repository root.
- A single task id is not required to be globally unique. `caseId` remains unique because it also includes the skill id.
- If `tasksBySkill` is supplied and a skill has no task list, the matrix schedules zero cases for that skill instead of falling back to unrelated tasks.
- The loader does not validate full JSON schema. Existing corpus fixture tests cover the seed files; deeper benchmark schema validation can be added with result schemas.
- The matrix only schedules cases. It does not execute agents or judge task success.

## Modification Notes

- Add tests before changing matrix fields because downstream result analysis will depend on them.
- Keep `caseId` stable once real results exist.
- When adding a new deep benchmark skill, add its `tasksPath` in the manifest and check that `tasksBySkill[skillId]` contains only that skill's tasks.
- If adding new systems, update `DEFAULT_EXPERIMENT_SYSTEMS`, this document, and Task 10 experiment design.
- If packaging becomes explicit in corpus metadata, update `inferSkillPackaging` and its tests in the same commit.
