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

The default system list is the research main table:

```text
no-skill
original
ir-static
ir-pgo
```

`no-skill` and `original` make skill utility, paired deltas, and regressions visible. `ir-static` measures cold-start compilation; `ir-pgo` measures task-local repair from development evidence on disjoint held-out tasks.

The matrix can schedule `ir-pgo` abstractly. The real-agent runner additionally requires `--ir-override-dir` so the scheduled system resolves to development-derived final IR rather than the unchanged base IR.

The `ExperimentSystem` type still supports `skvm-aot`, `ir-only`, and `ir-profile` for explicit use. `ir-only` is an ablation, `ir-profile` preserves archived comparisons, and `skvm-aot` is a stub until it is connected to the upstream AOT path. They are intentionally excluded from `DEFAULT_EXPERIMENT_SYSTEMS`.

## Scheduling Labels Versus Executed Axes

The matrix accepts `agent` and `environment` values and includes them in `caseId`, but it only schedules cases. The current real-agent runner selects one global adapter and runs on the current host; it does not map each matrix label to a different harness or OS. Consequently:

- label-only matrix expansion is not cross-agent or cross-OS evidence;
- current real runs should record the actual adapter and Windows host honestly;
- future adapter/OS claims require execution binding plus run metadata that proves the selected harness and host.

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

## Provenance And Evidence Weight

Each matrix case now carries:

```text
skillProvenance: synthetic-seed | adapted-public | real-public | upstream-skvm | user-provided | unknown
evidenceWeight: calibration-low | support-real | main-real | unknown
```

`buildDefaultMatrixInput` reads these fields from `benchmarks/skill-ir/corpus/manifest.json`. String-only or older programmatic matrix inputs receive `unknown`, which preserves compatibility without silently treating an unlabeled skill as real evidence. The fields remain attached to all systems sharing a paired `caseId` and are propagated by the real-agent runner.

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
- `agent` and `environment` are scheduling metadata until an executor binds them to real harnesses and hosts.
- Missing provenance metadata becomes `unknown`; it never defaults to `real-public` or `main-real`.

## Modification Notes

- Add tests before changing matrix fields because downstream result analysis will depend on them.
- Keep `caseId` stable once real results exist.
- When adding a new deep benchmark skill, add its `tasksPath` in the manifest and check that `tasksBySkill[skillId]` contains only that skill's tasks.
- Add a system to `DEFAULT_EXPERIMENT_SYSTEMS` only when it belongs in the paper's main table. Explicit ablations may remain supported without becoming defaults.
- If packaging becomes explicit in corpus metadata, update `inferSkillPackaging` and its tests in the same commit.
- Keep `skillProvenance` and `evidenceWeight` stable because raw/scored result rows and slice analysis consume them.
