# Real Pilot Runtime Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every new real-pilot run auditable and artifact-scoreable by persisting a unique workdir, deterministic evaluator results, resource parity, and model/repetition/panel identity from planning through Final IR provenance.

**Architecture:** Extend the existing Skill IR runner instead of adding a parallel harness. `skvm run` continues to execute the agent, while the Skill IR layer supplies a persistent workdir and records run identity. The external scorer reuses `framework/evaluator.ts` for automated criteria and keeps the legacy heuristic path only for calibration tasks without explicit evaluators.

**Tech Stack:** TypeScript, Bun, Zod, JSON/JSONL, existing SkVM evaluator framework, Bun test.

---

## File Structure

- Modify `src/benchmarks/skill-ir/real-agent.ts`: task evaluator/fixture contract, workdir materialization, run identity, and file-backed resource parity.
- Modify `src/benchmarks/skill-ir/real-agent-run.ts`: CLI identity/repetition options, repeated plan rows, execution preflight, and raw-row metadata.
- Modify `src/benchmarks/skill-ir/scoring.ts`: scored-row metadata and deterministic evaluator result shape.
- Modify `src/benchmarks/skill-ir/score-real-agent-runs.ts`: asynchronous evaluator dispatch for tasks with explicit automated criteria.
- Modify `src/benchmarks/skill-ir/profile-feedback.ts`: carry run identity into execution traces.
- Modify `src/profiler/trace-schema.ts`: optional backward-compatible run identity fields for archived traces.
- Modify `src/benchmarks/skill-ir/final-ir-provenance.ts`: record the construction configurations represented by development results.
- Modify corresponding `*.test.ts` files before each production edit.
- Update `docs/skill-ir/real-agent-dry-run.md`, `docs/skill-ir/real-agent-scoring.md`, and `docs/skill-ir/profile-feedback-loop.md` in the same stage.

## Scope Boundary

This plan does not author `env-manager` benchmark tasks, choose the model panel, implement pooled aggregation, or run paid model calls. It establishes the contracts those later stages require. Archived seed JSONL remains readable; missing identity fields are treated as legacy metadata, but every newly generated row contains the complete identity.

### Task 1: Run Identity And Repetitions

**Files:**
- Modify: `src/benchmarks/skill-ir/real-agent.ts`
- Modify: `src/benchmarks/skill-ir/real-agent-run.ts`
- Modify: `src/benchmarks/skill-ir/scoring.ts`
- Test: `src/benchmarks/skill-ir/real-agent-run.test.ts`
- Test: `src/benchmarks/skill-ir/scoring.test.ts`

- [ ] **Step 1: Write failing parser and plan tests**

Add tests proving that `--repetitions=3`, `--model-family=gpt`, `--adapter-version=workspace-2026-07-15`, and `--panel-config-id=env-manager-calibration-v1` are parsed; invalid repetition counts fail; and `buildPlan` emits three rows with one-based `runIndex` values and distinct artifact/workdir paths.

```ts
const parsed = parseRealAgentRunArgs([
  "--corpus=calibration",
  "--model=xty/gpt-4.1-mini",
  "--model-family=gpt",
  "--adapter=bare-agent",
  "--adapter-version=workspace-2026-07-15",
  "--panel-config-id=env-manager-calibration-v1",
  "--repetitions=3",
]);
expect(parsed).toMatchObject({
  repetitions: 3,
  modelFamily: "gpt",
  adapterVersion: "workspace-2026-07-15",
  panelConfigId: "env-manager-calibration-v1",
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run:

```powershell
bun test ./src/benchmarks/skill-ir/real-agent-run.test.ts ./src/benchmarks/skill-ir/scoring.test.ts
```

Expected: parser expectations fail because the options and row fields do not exist.

- [ ] **Step 3: Add the run identity contract**

Define and propagate this shape through plan, raw, and scored rows:

```ts
export type RunIdentity = {
  model: string;
  modelFamily: string;
  adapter: string;
  adapterVersion: string;
  runIndex: number;
  panelConfigId: string;
};
```

Use `inferModelFamily(model)` when `--model-family` is omitted. Defaults are `repetitions=1`, `adapterVersion="workspace"`, and `panelConfigId="single-run"`. Repeat after matrix filtering so `--limit` continues to limit matrix cells rather than silently limiting repetitions.

- [ ] **Step 4: Preserve archived-row compatibility**

Make the identity fields optional on input/scored JSONL types, while ensuring `executePlan` always writes all six fields for new rows. Copy any present fields unchanged during scoring.

- [ ] **Step 5: Run focused tests and commit**

```powershell
bun test ./src/benchmarks/skill-ir/real-agent-run.test.ts ./src/benchmarks/skill-ir/scoring.test.ts
git add src/benchmarks/skill-ir/real-agent.ts src/benchmarks/skill-ir/real-agent-run.ts src/benchmarks/skill-ir/scoring.ts src/benchmarks/skill-ir/real-agent-run.test.ts src/benchmarks/skill-ir/scoring.test.ts
git commit -m "feat: record real-pilot run identity"
```

Expected: focused tests pass and every new plan row has complete identity metadata.

### Task 2: Persistent Workdirs, Fixtures, And Resource Parity

**Files:**
- Modify: `src/benchmarks/skill-ir/source-fixture.ts`
- Modify: `src/benchmarks/skill-ir/real-agent.ts`
- Test: `src/benchmarks/skill-ir/real-agent.test.ts`
- Test: `src/benchmarks/skill-ir/real-agent-run.test.ts`

- [ ] **Step 1: Write failing workdir and parity tests**

Add tests proving that each materialized run has a required `workDir`, its command contains the same `--workdir=...` path, task fixtures remain in `task.json` for `skvm run` to copy, and a file-backed `ir-static` materialization contains the same non-`SKILL.md` scripts as `original` while replacing only `SKILL.md`.

```ts
expect(entry.command).toContain(`--workdir=${entry.workDir}`);
expect(await Bun.file(join(entry.skillPath!, "..", "scripts", "check.py")).text())
  .toBe("print('ok')\n");
expect(await Bun.file(entry.skillPath!).text()).toContain("Materialized system: ir-static.");
```

- [ ] **Step 2: Run tests and confirm RED**

```powershell
bun test ./src/benchmarks/skill-ir/real-agent.test.ts ./src/benchmarks/skill-ir/real-agent-run.test.ts
```

Expected: workdir is absent and generated IR lacks the source resource closure.

- [ ] **Step 3: Materialize one unique persistent workdir per row**

Make `MaterializedCase.workDir` required. Include `run-${runIndex}` in the case directory and create `<case>/<system>/run-N/workdir`. `buildRunPlanEntry` must always pass this exact path to `buildSkvmRunCommand`.

- [ ] **Step 4: Carry task fixtures without exposing evaluator-only data**

Extend `SkillIRBenchmarkTask` and `SkvmTaskJson` with optional `fixtures: Record<string, string>`. Copy only fixtures into the generated task JSON. Keep evaluator criteria in `eval`; neither criteria nor expected values are appended to the prompt.

- [ ] **Step 5: Preserve file-backed resources for generated IR systems**

Add a source helper that verifies the upstream source digest, copies the source directory, then lets generated systems overwrite only destination `SKILL.md`. Do not copy any source closure for `no-skill` or inline-source skills.

- [ ] **Step 6: Run focused tests and commit**

```powershell
bun test ./src/benchmarks/skill-ir/real-agent.test.ts ./src/benchmarks/skill-ir/real-agent-run.test.ts
git add src/benchmarks/skill-ir/source-fixture.ts src/benchmarks/skill-ir/real-agent.ts src/benchmarks/skill-ir/real-agent.test.ts src/benchmarks/skill-ir/real-agent-run.test.ts
git commit -m "feat: persist pilot workdirs and resources"
```

### Task 3: Deterministic Evaluator Dispatch

**Files:**
- Modify: `src/benchmarks/skill-ir/real-agent.ts`
- Modify: `src/benchmarks/skill-ir/scoring.ts`
- Modify: `src/benchmarks/skill-ir/score-real-agent-runs.ts`
- Test: `src/benchmarks/skill-ir/real-agent.test.ts`
- Test: `src/benchmarks/skill-ir/scoring.test.ts`
- Test: `src/benchmarks/skill-ir/score-real-agent-runs.test.ts`

- [ ] **Step 1: Write failing task/evaluator tests**

Add a task with inline fixtures, two `file-check` criteria, one declared hard gate, and a `passThreshold`. Assert that `buildSkvmTaskJson` preserves the criteria and uses `gradingType: "automated"` without putting expected values in the prompt.

```ts
const automatedTask: SkillIRBenchmarkTask = {
  id: "artifact-task",
  split: "development",
  prompt: "Create output.json.",
  successCriteria: [],
  fixtures: { "input.txt": "fixture\n" },
  eval: [
    { method: "file-check", id: "output-exists", path: "output.json", mode: "contains", expected: "ok" },
  ],
  hardGateIds: ["output-exists"],
  passThreshold: 1,
};
```

- [ ] **Step 2: Write failing scoring tests**

Create a temporary persistent workdir and raw row. Assert that automated evaluation produces `successSource: "deterministic-evaluator"`, stores criterion/checkpoint results, applies hard gates before the weighted threshold, and maps evaluator `infraError` to `failureType: "infrastructure"` with `failureStage: "evaluation"`.

- [ ] **Step 3: Run tests and confirm RED**

```powershell
bun test ./src/benchmarks/skill-ir/real-agent.test.ts ./src/benchmarks/skill-ir/scoring.test.ts ./src/benchmarks/skill-ir/score-real-agent-runs.test.ts
```

Expected: task schema and asynchronous evaluator-scoring APIs do not exist.

- [ ] **Step 4: Reuse the existing evaluator framework**

Import the evaluator registration barrel and `evaluateAll`; do not add a fifth evaluator method. For explicit `eval` tasks, construct the minimal trustworthy `RunResult` from raw output, token usage, duration, and persisted workdir, then evaluate only when execution was not already an infrastructure failure.

Use `computeWeightedScore(buildEvalDetails(results))`. Success requires all declared hard gates to pass and `overallScore >= passThreshold` (default `1`). Reject duplicate/missing hard-gate ids and reject an explicit real-pilot evaluator set containing `llm-judge` until a separately configured judge provider exists.

- [ ] **Step 5: Keep seed compatibility explicit**

Tasks without `eval` continue through `scoreRunOutput` and retain `successSource: "heuristic-success-criteria"`. This branch is calibration-only. Do not silently fall back to heuristics when a task declares an invalid explicit evaluator.

- [ ] **Step 6: Run focused tests and commit**

```powershell
bun test ./src/benchmarks/skill-ir/real-agent.test.ts ./src/benchmarks/skill-ir/scoring.test.ts ./src/benchmarks/skill-ir/score-real-agent-runs.test.ts
git add src/benchmarks/skill-ir/real-agent.ts src/benchmarks/skill-ir/scoring.ts src/benchmarks/skill-ir/score-real-agent-runs.ts src/benchmarks/skill-ir/real-agent.test.ts src/benchmarks/skill-ir/scoring.test.ts src/benchmarks/skill-ir/score-real-agent-runs.test.ts
git commit -m "feat: score pilot artifacts with SkVM evaluators"
```

### Task 4: Trace And Final IR Provenance Identity

**Files:**
- Modify: `src/profiler/trace-schema.ts`
- Modify: `src/benchmarks/skill-ir/profile-feedback.ts`
- Modify: `src/benchmarks/skill-ir/final-ir-provenance.ts`
- Modify: `src/benchmarks/skill-ir/profile-feedback-run.ts`
- Test: `src/profiler/trace-schema.test.ts`
- Test: `src/benchmarks/skill-ir/profile-feedback.test.ts`
- Test: `src/benchmarks/skill-ir/final-ir-provenance.test.ts`

- [ ] **Step 1: Write failing trace propagation tests**

Assert that a scored row with complete run identity produces a trace carrying the same model, family, adapter/version, run index, and panel id. Archived traces without those fields must still parse.

- [ ] **Step 2: Write failing provenance tests**

Assert that provenance records a sorted, deduplicated `constructionConfigs` array derived from the development scored rows:

```ts
constructionConfigs: [{
  model: "xty/gpt-4.1-mini",
  modelFamily: "gpt",
  adapter: "bare-agent",
  adapterVersion: "workspace-2026-07-15",
  panelConfigId: "env-manager-calibration-v1",
  runIndices: [1, 2, 3],
}]
```

Reject provenance construction when new-format scored rows mix missing and present identity fields. Fully legacy archived files may still compile only under a clearly marked `legacy-unidentified` construction config and cannot later pass a pooled-overlay gate.

- [ ] **Step 3: Run tests and confirm RED**

```powershell
bun test ./src/profiler/trace-schema.test.ts ./src/benchmarks/skill-ir/profile-feedback.test.ts ./src/benchmarks/skill-ir/final-ir-provenance.test.ts
```

- [ ] **Step 4: Implement backward-compatible trace and provenance schemas**

Keep trace schema version `skill-ir-trace/v1` and Final IR provenance version `skill-ir-final-provenance/v1` for additive optional fields. New profile compilation writes complete construction configs; validation preserves existing digest and development-only gates.

- [ ] **Step 5: Run focused tests and commit**

```powershell
bun test ./src/profiler/trace-schema.test.ts ./src/benchmarks/skill-ir/profile-feedback.test.ts ./src/benchmarks/skill-ir/final-ir-provenance.test.ts
git add src/profiler/trace-schema.ts src/benchmarks/skill-ir/profile-feedback.ts src/benchmarks/skill-ir/final-ir-provenance.ts src/benchmarks/skill-ir/profile-feedback-run.ts src/profiler/trace-schema.test.ts src/benchmarks/skill-ir/profile-feedback.test.ts src/benchmarks/skill-ir/final-ir-provenance.test.ts
git commit -m "feat: preserve pilot identity in feedback provenance"
```

### Task 5: Documentation And Full Verification

**Files:**
- Modify: `docs/skill-ir/real-agent-dry-run.md`
- Modify: `docs/skill-ir/real-agent-scoring.md`
- Modify: `docs/skill-ir/profile-feedback-loop.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `docs/skill-ir/real-pilot-runtime-contract-implementation-plan.md`
- Append: `D:/skill优化/conversation_log.md`

- [ ] **Step 1: Document runtime and CLI behavior**

Document `--repetitions`, `--model-family`, `--adapter-version`, and `--panel-config-id`; persistent workdir layout; deterministic evaluator result fields; hard-gate and infrastructure behavior; resource parity; legacy heuristic compatibility; and the fact that pooled construction is still disabled.

- [ ] **Step 2: Mark the infrastructure ledger item complete**

Update the canonical plan only after fresh verification. Keep `env-manager` fixture/validator authoring as the next unchecked item.

- [ ] **Step 3: Run full verification**

```powershell
bun test ./src/skill-ir ./src/profiler ./src/benchmarks/skill-ir
bun run typecheck
git diff --check
```

Expected: all tests and typecheck pass; diff check reports no whitespace errors.

- [ ] **Step 4: Append the stage log and commit**

Record files changed, red/green commands, final test counts, design decisions, and remaining risks in `D:/skill优化/conversation_log.md`.

```powershell
git add docs/skill-ir
git commit -m "docs: record real-pilot runtime contract"
git push origin skill-ir-aot
```

## Self-Review

- Spec coverage: workdir persistence, deterministic evaluator reuse, infrastructure classification, model/run/panel identity, resource parity, trace propagation, and provenance are each mapped to a task.
- Scope exclusions are explicit: no env-manager task authoring, panel choice, pooling, or paid execution.
- Type consistency: `RunIdentity` uses the same six field names in plan, raw row, scored row, trace, and provenance.
- Backward compatibility: archived heuristic rows remain readable, while all new rows are complete and auditable.
- No placeholder implementation steps remain.
