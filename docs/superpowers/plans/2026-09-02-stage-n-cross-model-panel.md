# Stage N Cross-Model Stability Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze a new Stage N identity for a single cross-model comparison over API Tester and Env Manager, run only zero-cost planning plus one original smoke per model family and skill, and stop before any paid matrix.

**Architecture:** Stage N is additive and isolated from Stage M/P1/P2. A strict lock records the two source experiment bindings, GPT digest bindings, three model-family routes, fixed 24+8 denominator, smoke authorization, and prohibited actions. A planner reconstructs and verifies the frozen inputs and produces deterministic rows; a runner executes only the smoke phase, persists compact qualification evidence, and refuses matrix execution until a later explicit authorization is added. Existing `buildPlan`, `buildRunPlanEntry`, `executeGenericPlanRow`, execution observations, and validated-artifact runtime are reused without changing their contracts.

**Tech Stack:** TypeScript, Zod, Bun, existing SkVM real-agent and artifact runners, SHA-256 digest verification, focused Bun tests.

---

### Task 1: Freeze the Stage N contract and failing tests

**Files:**
- Create: `benchmarks/skill-ir/panels/stage-n-cross-model-aot-stability-001/panel-lock.json`
- Create: `src/benchmarks/skill-ir/stage-n-cross-model-panel.test.ts`
- Create: `src/benchmarks/skill-ir/stage-n-cross-model-panel-plan.test.ts`
- Create: `src/benchmarks/skill-ir/stage-n-cross-model-panel-run.test.ts`

- [ ] **Step 1: Write RED contract tests**

  Cover: exact identity and three routes; `original=24`, `artifact=8`, `logical=32`; `retries=0`, `reserve=0`, `replacement=0`; GPT bindings point to the existing C1/C2 evidence; smoke rows are exactly one original row per family and skill; DeepSeek failure is retained as a negative qualification row; missing denominator blocks; matrix phase is rejected without a separate authorization.

- [ ] **Step 2: Run the focused tests and confirm RED**

  Run:

  ```powershell
  bun test ./src/benchmarks/skill-ir/stage-n-cross-model-panel.test.ts ./src/benchmarks/skill-ir/stage-n-cross-model-panel-plan.test.ts ./src/benchmarks/skill-ir/stage-n-cross-model-panel-run.test.ts
  ```

  Expected: module/schema symbols are missing and tests fail for the expected missing-contract reasons.

### Task 2: Implement the Stage N schema and deterministic builders

**Files:**
- Create: `src/benchmarks/skill-ir/stage-n-cross-model-panel.ts`
- Create: `src/benchmarks/skill-ir/stage-n-cross-model-panel-plan.ts`

- [ ] **Step 1: Add strict Zod schemas**

  Define the new identity, model families (`gpt`, `claude`, `deepseek`), skills (`api-tester`, `env-manager-v3`), smoke row, qualification report, and plan projection. Encode the 24/8/32 denominator algebra in `superRefine`; reject any drift, duplicate family/skill row, nonzero retry/reserve/replacement, or matrix authorization flag.

- [ ] **Step 2: Implement lock and evidence verification**

  Verify regular files, containment, and SHA-256 for the API Tester lock/report and Env Manager policy/quality/cost evidence. Require the C1/C2 records to contain four original rows and four deterministic artifact rows/pairs, and bind GPT without rerunning them.

- [ ] **Step 3: Implement plan construction**

  Reuse existing pilot task materialization and `buildPlan` for future family rows, but emit only deterministic plan metadata in Stage 0. Build a single smoke row per family/skill from task 1, repetition 1, `system=original`; build artifact denominator metadata from the two existing four-row evidence sets without executing it.

- [ ] **Step 4: Run focused schema/plan tests to GREEN**

  Run the three focused test files and confirm denominator, binding, path, and fail-closed assertions pass.

### Task 3: Implement the smoke-only serial runner

**Files:**
- Create: `src/benchmarks/skill-ir/stage-n-cross-model-panel-run.ts`
- Create: `docs/skill-ir/stage-n-cross-model-aot-stability-panel.md`

- [ ] **Step 1: Add CLI parsing**

  Support `--root-dir`, `--lock`, `--out-dir`, and `--phase=plan|smoke|matrix`; reject unknown flags and all alternate output roots.

- [ ] **Step 2: Implement Stage 0 plan persistence**

  Write `plan.json` with lock digest, exact denominator, GPT bindings, smoke rows, and `matrixAuthorized=false`; perform no API-key check and no model dispatch.

- [ ] **Step 3: Implement smoke execution**

  Execute family/skill smoke rows serially with `executeGenericPlanRow`, `retries=0`, and the frozen watchdog. Persist only sanitized execution observations and qualification summary; classify each row by terminal/execution status and usage availability. Never call scorer or artifact runtime during smoke.

- [ ] **Step 4: Implement fail-closed matrix refusal**

  `--phase=matrix` must reject before credential lookup or dispatch because this turn creates no paid-matrix authorization. A smoke failure records `status=failed`, `eligibleFamilies` excludes that family, and the report remains a negative qualification result with the original denominator unchanged.

- [ ] **Step 5: Run runner tests to GREEN**

  Verify no dispatch on plan/matrix refusal, serial order, one row per family/skill, usage gating, and failure-row retention.

### Task 4: Stage 0 and smoke execution checkpoint

- [ ] **Step 1: Run Stage 0 plan**

  ```powershell
  bun run ./src/benchmarks/skill-ir/stage-n-cross-model-panel-run.ts --phase=plan --root-dir=D:/skill优化/SkVM --lock=benchmarks/skill-ir/panels/stage-n-cross-model-aot-stability-001/panel-lock.json --out-dir=results/skill-ir/stage-n-cross-model-aot-stability-001
  ```

  Confirm zero API/model calls and exact 24/8/32 projection.

- [ ] **Step 2: Run only the smoke qualification**

  ```powershell
  bun run ./src/benchmarks/skill-ir/stage-n-cross-model-panel-run.ts --phase=smoke --root-dir=D:/skill优化/SkVM --lock=benchmarks/skill-ir/panels/stage-n-cross-model-aot-stability-001/panel-lock.json --out-dir=results/skill-ir/stage-n-cross-model-aot-stability-001
  ```

  Stop immediately after the compact smoke result. Do not create `matrix-report.json`, do not retry, and do not execute the matrix.

### Task 5: Documentation, log, and verification

- [ ] **Step 1: Update `conversation_log.md` and `project_handoff.md`**

  Record the new identity, exact denominator, smoke result, no-matrix stop point, and open authorization point. Keep Stage M/P1/P2 unchanged.

- [ ] **Step 2: Run fresh verification**

  ```powershell
  bun test ./src/benchmarks/skill-ir/stage-n-cross-model-panel.test.ts ./src/benchmarks/skill-ir/stage-n-cross-model-panel-plan.test.ts ./src/benchmarks/skill-ir/stage-n-cross-model-panel-run.test.ts
  node node_modules/typescript/bin/tsc --noEmit --pretty false
  git diff --check
  ```

- [ ] **Step 3: Review scope before stopping**

  Confirm no Stage M/P1/P2 files changed, no matrix result exists, no held-out input was read, no readiness/portfolio fields changed, and no API key value appears in files or logs.
