# Env Manager Fixture And Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author a source-backed `env-manager` task family and a deterministic, dependency-free evaluator so the pilot is ready for base-IR construction and single-model calibration.

**Architecture:** Add one registered `custom` evaluator, `skill-ir-env-manager`, whose typed inline payload selects a single deterministic check over the persistent run workdir. Commit two development and two held-out tasks with fake-secret fixtures and six evaluator criteria per task. Register the task set in the pilot corpus as `tasks-authored`, but keep the skill non-runnable until a separately audited base IR is added.

**Tech Stack:** TypeScript, Bun, Zod, JSON task fixtures, SkVM custom evaluator API, SHA-256 only where artifact integrity requires it.

---

## File Map

- Create `src/bench/evaluators/env-manager-grade.ts`: payload validation, safe path resolution, deterministic checks, and evaluator registration.
- Create `src/bench/evaluators/env-manager-grade.test.ts`: evaluator unit tests over real temporary workdirs.
- Modify `src/bench/evaluators/index.ts`: side-effect registration import.
- Create `benchmarks/skill-ir/pilots/env-manager/tasks.json`: four source-backed pilot tasks with inline fixtures and evaluator payloads.
- Create `src/benchmarks/skill-ir/env-manager-pilot.test.ts`: committed task-contract and scorer integration tests.
- Modify `benchmarks/skill-ir/corpus/corpora/pilot.json`: add `tasksPath` and move only `env-manager` to `tasks-authored`.
- Modify `src/skill-ir/corpus-fixtures.test.ts`: record the new intermediate corpus state without making the pilot runnable.
- Create `docs/skill-ir/env-manager-pilot.md`: task, output, evaluator, command, and failure-boundary documentation.
- Modify `docs/skill-ir/skill-ir-aot-optimization-plan.md`: mark fixture/validator authoring complete only after verification.
- Modify this plan as steps complete and append `D:/skill优化/conversation_log.md` after the stage.

## Shared Task Output Contract

Every task instructs the agent to leave protected `.env*` files unchanged and create:

```text
.env.example
.env.schema.json
env-report.json
```

`env-report.json` has exactly these array-valued fields:

```json
{
  "definedAndUsed": ["NAME"],
  "definedUnconfirmedUnused": ["NAME"],
  "usedUndefined": ["NAME"],
  "hardcodedSecrets": ["path:identifier"],
  "exposureRisks": ["path:NAME"]
}
```

Arrays are compared as sorted sets. `.env.schema.json` uses a top-level
`variables` object. Each variable rule may declare `type`, `required`,
`minimum`, `maximum`, `format`, `minLength`, and `sensitive`. The evaluator
checks only the preregistered required subset so harmless extra descriptions do
not fail a run.

Each task uses these criterion ids and weights:

```text
env-protected-files   weight 0.20  hard gate
env-no-secret-leak    weight 0.20  hard gate
env-required-artifacts weight 0.15 hard gate
env-classification    weight 0.20
env-example-safety    weight 0.15
env-schema-rules      weight 0.10
```

`hardGateIds` contains the first three ids and `passThreshold` is `0.85`.
No `llm-judge` criterion is present.

### Task 1: Registered Env Manager Evaluator

**Files:**
- Create: `src/bench/evaluators/env-manager-grade.test.ts`
- Create: `src/bench/evaluators/env-manager-grade.ts`
- Modify: `src/bench/evaluators/index.ts`

- [x] **Step 1: Write failing payload and protected-file tests**

Test an exported `envManagerGrade` with a temporary workdir. Assert that:

```ts
await envManagerGrade.run({
  criterion: {
    method: "custom",
    evaluatorId: "skill-ir-env-manager",
    id: "env-protected-files",
    payload: {
      schemaVersion: "skill-ir-env-manager-eval/v1",
      check: "protected-files",
      files: { ".env": "APP_PORT=3000\nDB_PASSWORD=fake-secret\n" },
    },
  },
  runResult,
})
```

passes when `.env` is byte-identical, fails semantically when it changes or is
deleted, and rejects absolute/traversal payload paths as evaluator
infrastructure errors.

- [x] **Step 2: Run the focused test and confirm RED**

```powershell
bun test ./src/bench/evaluators/env-manager-grade.test.ts
```

Expected: import/module failure because `env-manager-grade.ts` does not exist.

- [x] **Step 3: Implement payload schemas and safe filesystem helpers**

Define a Zod discriminated union with schema version
`skill-ir-env-manager-eval/v1` and checks:

```text
protected-files | no-secret-leak | required-artifacts |
report-classification | env-example | schema-rules
```

All paths must be non-empty repository-style relative paths with no `..`
segment. Resolve and verify real paths remain under `runResult.workDir` before
reading. Invalid payloads or evaluator I/O faults return `infraError`; missing or
incorrect agent artifacts return ordinary `pass:false` results.

- [x] **Step 4: Implement the six deterministic checks test-first**

Add one failing test before each check implementation:

- `protected-files`: exact byte equality for declared files.
- `no-secret-leak`: scan final output and all workdir files except declared
  `allowedPaths`; fail if any non-empty fake-secret value appears.
- `required-artifacts`: require declared files and parse declared JSON files.
- `report-classification`: parse `env-report.json` and compare five fields as
  sorted unique string sets.
- `env-example`: parse dotenv-style names, require declared names, and reject
  declared forbidden values.
- `schema-rules`: parse JSON and deep-match the declared subset under
  `variables` without rejecting extra safe metadata.

- [x] **Step 5: Register and verify the evaluator**

Add `import "./env-manager-grade.ts"` to the evaluator barrel. Test that
`customEvaluators.get("skill-ir-env-manager")` returns the implementation and
that invalid inline payloads fail as evaluator infrastructure rather than agent
semantics.

- [x] **Step 6: Run verification and commit**

```powershell
bun test ./src/bench/evaluators/env-manager-grade.test.ts ./src/framework/evaluator.test.ts
bun run typecheck
git diff --check
git add src/bench/evaluators/env-manager-grade.ts src/bench/evaluators/env-manager-grade.test.ts src/bench/evaluators/index.ts
git commit -m "feat: add deterministic env-manager evaluator"
```

### Task 2: Source-Backed Task Family

**Files:**
- Create: `benchmarks/skill-ir/pilots/env-manager/tasks.json`
- Modify: `src/skill-ir/corpus-fixtures.test.ts`
- Modify: `benchmarks/skill-ir/corpus/corpora/pilot.json`

- [x] **Step 1: Write failing corpus/task contract tests**

Extend `corpus-fixtures.test.ts` to require:

```text
env-manager status = tasks-authored
env-manager tasksPath = benchmarks/skill-ir/pilots/env-manager/tasks.json
2 development tasks + 2 held-out tasks
all fixtures use fake/test-only secrets
all tasks have explicit eval, the three hard gates, passThreshold 0.85,
and no successCriteria wording matcher or llm-judge
```

Also assert that `buildCorpusMatrixInput("pilot")` still fails because zero
skills are `runnable`.

- [x] **Step 2: Run the corpus test and confirm RED**

```powershell
bun test ./src/skill-ir/corpus-fixtures.test.ts ./src/benchmarks/skill-ir/matrix.test.ts
```

Expected: env-manager remains `source-imported` and has no `tasksPath`.

- [x] **Step 3: Author two development tasks**

Create:

```text
env-manager-node-audit-dev-001
env-manager-vite-audit-dev-002
```

The Node task fixtures contain `.env`, `.gitignore`, `src/config.js`, and
`src/auth.js`. Expected classification is:

```json
{
  "definedAndUsed": ["APP_PORT", "REDIS_URL"],
  "definedUnconfirmedUnused": ["DB_PASSWORD", "OLD_API_KEY"],
  "usedUndefined": ["SENDGRID_API_KEY"],
  "hardcodedSecrets": ["src/auth.js:INTERNAL_TOKEN"],
  "exposureRisks": []
}
```

The Vite task includes a `VITE_`-prefixed secret and checks that the report
records it under `exposureRisks` without copying its value to any generated
artifact or final output.

- [x] **Step 4: Author two held-out tasks**

Create:

```text
env-manager-python-audit-heldout-001
env-manager-nextjs-audit-heldout-002
```

The Python task uses `os.getenv` and `os.environ[...]`; the Next.js task includes
safe `NEXT_PUBLIC_` configuration plus an intentionally exposed public-prefix
secret. Variable names, paths, and fake values differ from development tasks.
Held-out evaluator payloads remain committed and deterministic but are never
used to generate profile overlays.

- [x] **Step 5: Register the non-runnable task-authored state**

Add `tasksPath` to the env-manager pilot entry and change only its status from
`source-imported` to `tasks-authored`. Do not add `irPath` and do not change the
matrix runnable filter.

- [x] **Step 6: Run verification and commit**

```powershell
bun test ./src/skill-ir/corpus-fixtures.test.ts ./src/benchmarks/skill-ir/matrix.test.ts
git diff --check
git add benchmarks/skill-ir/pilots/env-manager/tasks.json benchmarks/skill-ir/corpus/corpora/pilot.json src/skill-ir/corpus-fixtures.test.ts
git commit -m "feat: add env-manager pilot tasks"
```

### Task 3: End-To-End Deterministic Scoring Fixture

**Files:**
- Create: `src/benchmarks/skill-ir/env-manager-pilot.test.ts`

- [x] **Step 1: Write a failing passing-artifact integration test**

Load the committed Node development task, copy its fixtures into a temporary
workdir, write contract-compliant `.env.example`, `.env.schema.json`, and
`env-report.json`, then call `scoreRawRunRowsBySkill`. Assert:

```text
success = true
successSource = deterministic-evaluator
evaluatorScore = 1
six payload-safe evaluation summaries
no secret value in the serialized scored row
```

- [x] **Step 2: Run the test and confirm RED**

```powershell
bun test ./src/benchmarks/skill-ir/env-manager-pilot.test.ts
```

Expected: committed task/evaluator integration is not yet exercised and the new
test fails until the fixture materialization helper and exact artifacts are
provided.

- [x] **Step 3: Add negative integration cases**

Using fresh workdirs, prove that:

- changing `.env` fails `env-protected-files`;
- copying a fake secret into `.env.example` fails `env-no-secret-leak` and
  `env-example-safety`;
- malformed schema JSON fails `env-required-artifacts`;
- a wrong used/undefined set fails `env-classification`;
- the source fixtures remain unchanged across all evaluator runs.

- [x] **Step 4: Run verification and commit**

```powershell
bun test ./src/benchmarks/skill-ir/env-manager-pilot.test.ts ./src/benchmarks/skill-ir/scoring.test.ts
bun run typecheck
git diff --check
git add src/benchmarks/skill-ir/env-manager-pilot.test.ts
git commit -m "test: verify env-manager pilot scoring"
```

### Task 4: Documentation, Ledger, And Stage Verification

**Files:**
- Create: `docs/skill-ir/env-manager-pilot.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `docs/skill-ir/env-manager-fixture-validator-implementation-plan.md`
- Append: `D:/skill优化/conversation_log.md`

- [x] **Step 1: Document the component**

Document task ids/splits, every fixture, output JSON shapes, evaluator payload
checks, hard gates, score threshold, commands, fake-secret policy, failure
classification, and the reason `tasks-authored` is deliberately non-runnable.

- [x] **Step 2: Run full relevant verification**

```powershell
bun test ./src/bench/evaluators/env-manager-grade.test.ts ./src/skill-ir/corpus-fixtures.test.ts ./src/benchmarks/skill-ir/env-manager-pilot.test.ts ./src/benchmarks/skill-ir
bun run typecheck
git diff --check
```

- [x] **Step 3: Update the ledger and conversation log**

Mark fixture/validator authoring complete. Keep base IR construction and paid
single-model execution unchecked. Record RED/GREEN evidence, files, decisions,
verification counts, and open risks in the stage log.

- [x] **Step 4: Commit and push**

```powershell
git add docs/skill-ir
git commit -m "docs: record env-manager pilot contract"
git push origin skill-ir-aot
```

## Self-Review

- Spec coverage: deterministic scoring, hard gates, fake secrets, protected
  files, development/held-out separation, and non-runnable pre-IR state are each
  mapped to a task.
- Scope: no base IR, model route selection, paid execution, PGO compilation,
  pooled aggregation, or promotion is introduced.
- Type consistency: all criteria use existing `custom` evaluator types and the
  single id `skill-ir-env-manager`; no fifth evaluator method is added.
- Evidence integrity: evaluator payloads are absent from prompts/workdirs,
  protected source fixtures are immutable, and held-out rows cannot feed PGO.
- Placeholder scan: no TODO/TBD or unstated implementation choice remains.
