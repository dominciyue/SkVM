# Tasks-Authored Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one preregistered real skill in `tasks-authored` state to run a reproducible pre-IR `no-skill | original` development calibration without committing a fake base IR or weakening normal corpus gates.

**Architecture:** Add a purpose-specific `tasks-authored-calibration` matrix mode behind the explicit `--allow-tasks-authored` CLI flag. The mode selects only `tasks-authored` pilot entries and development tasks, requires one explicit skill plus task set, `clean` context, and the exact paired systems `no-skill,original`, then synthesizes an in-memory source envelope from manifest source metadata solely for exact original materialization. The scorer uses the same explicit flag and loads only development tasks from `tasks-authored` entries.

**Tech Stack:** TypeScript, Bun test, JSON corpus manifests, Markdown research contracts.

---

## File Map

- `src/benchmarks/skill-ir/matrix.ts`: define the typed corpus scheduling mode and filter eligible skill status/task split.
- `src/benchmarks/skill-ir/matrix.test.ts`: prove default pilot scheduling still rejects zero runnable skills and calibration mode selects only development tasks.
- `src/benchmarks/skill-ir/real-agent-run.ts`: parse and validate calibration flags, select one skill, build the runtime source envelope, and materialize a non-empty paired plan.
- `src/benchmarks/skill-ir/real-agent-run.test.ts`: cover accepted calibration plans and every fail-closed boundary.
- `src/benchmarks/skill-ir/score-real-agent-runs.ts`: expose the same opt-in for scoring and load only eligible development tasks.
- `src/benchmarks/skill-ir/score-real-agent-runs.test.ts`: prove default scoring excludes `tasks-authored` while calibration scoring accepts its development rows and rejects held-out rows.
- `benchmarks/skill-ir/pilots/env-manager/env-manager-vertical-lock.json`: preregister the engineering-calibration route, adapter, Windows host, clean context, task ids, systems, and repetitions without storing a secret.
- `src/benchmarks/skill-ir/env-manager-pilot.test.ts`: validate the lock against the pilot manifest and task split.
- `docs/skill-ir/real-agent-dry-run.md`: document commands, source-envelope semantics, and rejection conditions.
- `docs/skill-ir/env-manager-pilot.md`: record the pre-IR calibration state and interpretation boundary.
- `docs/skill-ir/env-manager-vertical-and-pooled-overlay-design.md`: make the scheduling contract authoritative for the vertical.
- `docs/skill-ir/skill-ir-aot-optimization-plan.md`: keep the active execution ledger current.
- `docs/skill-ir/skill-ir-aot-optimization-spec.md`: state that `tasks-authored` is schedulable only through the restricted pre-IR calibration mode.

### Task 1: Matrix Calibration Mode

- [x] **Step 1: Write the failing matrix tests**

Add tests that call:

```ts
buildCorpusMatrixInput("pilot", rootDir, { mode: "tasks-authored-calibration" })
```

Assert that only `env-manager` is selected, only its two `development` task ids appear, and systems equal `no-skill | original`. Keep the existing default `buildCorpusMatrixInput("pilot")` zero-runnable failure assertion.

- [x] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
bun test ./src/benchmarks/skill-ir/matrix.test.ts
```

Expected: FAIL because the third argument and calibration mode do not exist.

- [x] **Step 3: Implement the typed mode**

Add:

```ts
export type CorpusMatrixMode = "runnable" | "tasks-authored-calibration";
export type BuildCorpusMatrixOptions = { mode?: CorpusMatrixMode };
```

In calibration mode, select exactly `status === "tasks-authored"`, load only tasks with `split === "development"`, and return systems `['no-skill', 'original']`. Preserve all existing default behavior.

- [x] **Step 4: Run the focused test and confirm GREEN**

Run the same Bun command. Expected: all matrix tests pass.

### Task 2: Runner Guard And Source Envelope

- [x] **Step 1: Write failing argument and plan tests**

Add tests for `--allow-tasks-authored`, `--skills=env-manager`, and an accepted plan with:

```text
corpus=pilot
systems=no-skill,original
contexts=clean
one explicit skill
explicit development tasks
no ir override
```

The plan must contain paired rows, omit `--skill` for `no-skill`, inject the digest-verified upstream `SKILL.md` for `original`, and leave the manifest without `irPath`.

Add rejection tests for missing `--skills`, multiple skills, held-out task ids, any non-clean context, any system outside the exact pair, `--ir-override-dir`, non-pilot corpus, and a missing/mismatched source digest entry.

- [x] **Step 2: Run the focused runner tests and confirm RED**

```powershell
bun test ./src/benchmarks/skill-ir/real-agent-run.test.ts
```

Expected: FAIL on unknown flags or zero runnable pilot skills.

- [x] **Step 3: Implement strict calibration validation**

Extend `RealAgentRunArgs` with:

```ts
allowTasksAuthored: boolean;
skills?: Set<string>;
```

Validate the full contract before materialization. Filter matrix cases by `skills`, fail when the selected matrix is empty, and reject every forbidden combination before any model call.

- [x] **Step 4: Implement the in-memory source envelope**

For the selected `tasks-authored` entry, match `sourcePath` to one `sourceFiles` record and synthesize a schema-valid runtime carrier whose source is:

```ts
{ kind: "file", path: skill.sourcePath, sha256: sourceFile.sha256 }
```

Use manifest id, name, and categories. Keep semantic arrays empty and label the intent as pre-IR exact-source calibration. Do not write an IR file, set `irPath`, run static passes, compile feedback, or expose the envelope as research evidence.

- [x] **Step 5: Run runner tests and confirm GREEN**

Run the focused runner test, then:

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=pilot' '--allow-tasks-authored' '--skills=env-manager' '--systems=no-skill,original' '--contexts=clean' '--agents=skvm' '--environments=windows' '--tasks=env-manager-node-audit-dev-001,env-manager-vite-audit-dev-002' '--repetitions=2' '--model=xty/gpt-4.1-mini' '--adapter=bare-agent' '--adapter-version=workspace-calibration-v1' '--panel-config-id=env-manager-calibration-v1' '--limit=4' '--out-dir=results/skill-ir/env-manager-calibration-dry-run'
```

Expected: 8 plan entries and no paid execution.

### Task 3: Scorer Calibration Gate

- [x] **Step 1: Write failing scorer tests**

Create a temporary pilot manifest with one `tasks-authored` skill and development/held-out tasks. Assert default corpus scoring cannot resolve the development row, while `--allow-tasks-authored --corpus=pilot` scores it. Assert a held-out row remains unresolved in calibration mode.

- [x] **Step 2: Run scorer tests and confirm RED**

```powershell
bun test ./src/benchmarks/skill-ir/score-real-agent-runs.test.ts
```

Expected: FAIL because the scorer does not recognize the opt-in.

- [x] **Step 3: Implement matching scorer eligibility**

Parse `--allow-tasks-authored`, require `--corpus=pilot`, reject `--manifest`, and load only `status === "tasks-authored"` plus `split === "development"`. Keep normal runnable scoring unchanged.

- [x] **Step 4: Run scorer tests and confirm GREEN**

Run the same command. Expected: all scorer CLI tests pass.

### Task 4: Vertical Lock And Documentation

- [x] **Step 1: Write the failing lock-contract test**

Validate that the lock names `env-manager`, the two development task ids, `clean`, `no-skill | original`, the current Windows host label, a single model route, and no secret-bearing field. Cross-check task ids and split against `tasks.json`.

- [x] **Step 2: Run the pilot contract test and confirm RED**

```powershell
bun test ./src/benchmarks/skill-ir/env-manager-pilot.test.ts
```

Expected: FAIL because `env-manager-vertical-lock.json` does not exist.

- [x] **Step 3: Add the lock and update all relevant docs**

Use `panelConfigId=env-manager-calibration-v1`, `model=xty/gpt-4.1-mini`, `adapter=bare-agent`, `adapterVersion=workspace-calibration-v1`, `repetitions=2`, `contexts=['clean']`, and the two development tasks. Mark the stage `engineering-calibration`, forbid held-out/PGO, and store only `apiKeyEnv=SKVM_XTY_API_KEY`.

- [x] **Step 4: Run lock tests and confirm GREEN**

Run the pilot test and inspect `git diff --check`.

### Task 5: Verification And Paid Calibration

- [x] **Step 1: Run repository verification**

```powershell
bun test
bun run typecheck
python -m unittest discover -s scripts/tests -p 'test_*.py'
git diff --check
```

Expected: all suites pass.

- [x] **Step 2: Probe the preregistered route**

Use the existing route-probe command with `xty/gpt-4.1-mini`, `bare-agent`, and `SKVM_XTY_API_KEY`. Abort paid calibration if the route cannot produce a valid agent run.

- [x] **Step 3: Execute the frozen development calibration**

Run the Task 2 command with `--execute --require-env=SKVM_XTY_API_KEY`, score with:

```powershell
bun ./src/benchmarks/skill-ir/score-real-agent-runs.ts '--corpus=pilot' '--allow-tasks-authored' '--raw=<run-dir>/raw-runs.jsonl' '--out=<run-dir>/scored-results.jsonl'
```

Do not run held-out, create Final IR, or change scorer expectations from these results.

- [x] **Step 4: Analyze calibration discrimination**

Report per-task/per-system success, hard-gate failures, deterministic score, infrastructure exclusions, token/latency diagnostics, and paired differences. If both systems saturate or both fail, first audit fixture/tooling/secret handling; base-IR construction remains blocked until the calibration is executable and meaningfully discriminative.

- [x] **Step 5: Record, commit, and push**

Update the active ledger, env-manager component doc, experiment note, and `D:\skill优化\conversation_log.md`. Commit focused changes on `skill-ir-aot` and push only repository-relevant code/docs/results permitted by project policy.
