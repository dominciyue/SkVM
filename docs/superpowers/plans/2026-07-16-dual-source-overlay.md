# Dual-Source Residual Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile a gold-isolated Final IR from paired original/static development residuals and validate it through an explicit development replay before held-out evaluation.

**Architecture:** Add a strict repair-evidence projection and evaluator lineage catalog, lower two generic env-manager repair kinds into stable IR rules/checks, bind dual-source artifacts with provenance v2, and add a diagnostic `ir-pgo-dev` consumption path. Preserve provenance v1 and original-only feedback for archived experiments.

**Tech Stack:** TypeScript, Bun test, Zod, JSON/JSONL artifacts, existing Skill IR passes and real-agent runner.

---

### Task 1: Safe Evidence And Failure Lineage

**Files:**
- Create: `src/benchmarks/skill-ir/repair-evidence.ts`
- Create: `src/benchmarks/skill-ir/repair-evidence.test.ts`

- [x] Write RED tests for exact original/static pairing, reproduced and newly-observable residuals, resolved failures, static-regression rejection, distinct-task support, held-out rejection, incomplete identity, and duplicate rows.
- [x] Add canary `expected`, secret, and evaluator-payload properties to test rows and assert serialized `RepairEvidence` excludes them.
- [x] Implement strict evidence projection, `env-manager/v1` lineage, repair-kind mapping, and minimum distinct-task aggregation.
- [x] Run `bun test ./src/benchmarks/skill-ir/repair-evidence.test.ts` and confirm GREEN.

### Task 2: Typed Repair Lowering

**Files:**
- Create: `src/skill-ir/passes/typed-output-repair.ts`
- Create: `src/skill-ir/passes/typed-output-repair.test.ts`
- Modify: `src/benchmarks/skill-ir/profile-feedback.ts`
- Modify: `src/benchmarks/skill-ir/profile-feedback.test.ts`

- [x] Write RED tests showing each repair kind adds one generic rule/check, remains idempotent, rejects unsupported kinds, and contains no benchmark entities.
- [x] Extend `ProfileOverlay` with typed repair directives and compile them before existing profile-guided passes.
- [x] Generate stable profile annotations from eligible directives without modifying the base IR.
- [x] Run both focused suites and confirm GREEN.

### Task 3: Dual-Source Compiler And Provenance V2

**Files:**
- Create: `src/benchmarks/skill-ir/dual-source-feedback-run.ts`
- Create: `src/benchmarks/skill-ir/dual-source-feedback-run.test.ts`
- Modify: `src/benchmarks/skill-ir/final-ir-provenance.ts`
- Modify: `src/benchmarks/skill-ir/final-ir-provenance.test.ts`

- [x] Write RED tests for artifact generation, v2 paired-system/result/evidence digests, construction identity, tamper rejection, and legacy v1 compatibility.
- [x] Implement compiler CLI requiring pilot corpus, development-only paired evidence, explicit catalog versions, and distinct-task threshold.
- [x] Write repair evidence, overlay, Final IR, compatibility IR, summary, and provenance v2.
- [x] Run focused suites and confirm GREEN.

### Task 4: Diagnostic Development Replay

**Files:**
- Modify: `src/benchmarks/skill-ir/matrix.ts`
- Modify: `src/benchmarks/skill-ir/matrix.test.ts`
- Modify: `src/benchmarks/skill-ir/real-agent.ts`
- Modify: `src/benchmarks/skill-ir/real-agent.test.ts`
- Modify: `src/benchmarks/skill-ir/real-agent-run.ts`
- Modify: `src/benchmarks/skill-ir/real-agent-run.test.ts`

- [x] Write RED tests for explicit `ir-pgo-dev`, v2 provenance requirement, development-only tasks, one selected skill, and rejection of held-out/default scheduling.
- [x] Implement the diagnostic label and fail-closed CLI flag without adding it to cold-start or main-table defaults.
- [x] Confirm materialized Markdown contains typed repair rules and verified Final IR paths.
- [x] Run focused runner/matrix/materialization tests and confirm GREEN.

### Task 5: Frozen Artifact Build And Real Replay

**Files:**
- Create: `benchmarks/skill-ir/pilots/env-manager/env-manager-dual-overlay-lock.json`
- Create: `docs/skill-ir/env-manager-dual-source-overlay.md`
- Create: `docs/skill-ir/env-manager-dual-overlay-v1-run.md`
- Modify: canonical spec, plan, profile-feedback, pilot, and provenance docs.

- [x] Add a RED lock test binding frozen scored-results/base/source digests, policy versions, task ids, systems, model, and replay configuration.
- [x] Build dual-source artifacts from the frozen static-v1 scored results and audit all outputs for task/gold/secret leakage.
- [x] Route probe, execute four `ir-pgo-dev` rows, score with the unchanged deterministic evaluator, and compare against frozen `ir-static` rows. Result: v1 matched static at 0/4 and 0.70.
- [x] Run 228+ relevant Bun tests, Python analyzer tests, typecheck, digest/secret scans, and `git diff --check`.
- [x] Update all related docs and `D:\skill优化\conversation_log.md`; commit and push remain the final repository action.

### Task 6: Repair Catalog V2 After Frozen Replay

**Trigger:** The frozen v1 development replay matched `ir-static` at 0/4 and 0.70 mean. Output audit showed that v1's canonical-JSON-Schema instruction conflicts with the task-visible custom `variables` contract, while source-qualified findings have no deterministic item serialization.

- [x] Preserve the v1 artifact package and replay unchanged as negative development evidence.
- [x] Add RED tests for a versioned v2 catalog that gives the explicit runtime output contract precedence and uses deterministic `path:symbol` strings when an array contract does not define an object item schema.
- [x] Bind the selected catalog into overlay, summary, and provenance; keep absent catalog backward-compatible with v1.
- [x] Freeze a v2 amendment lock, compile a separate v2 Final IR package, and rerun development only with unchanged tasks and scorer.
- [x] Apply the frozen gate: v2 reached 1/4 but mean score regressed to 0.6375, so record the artifact-solidification gap and do not run held-out.
