# Real Pilot Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace synthetic/default ambiguities with exact source-backed baselines, explicit corpus scheduling, cold-start-only defaults, and provenance-validated PGO artifacts.

**Architecture:** A corpus registry resolves explicit calibration or pilot manifests. A source loader verifies repository-relative snapshots and digests before materialization. Profile feedback emits a provenance sidecar that the real-agent runner validates before held-out `ir-pgo` execution.

**Tech Stack:** TypeScript, Bun, Zod, Node filesystem/crypto APIs, JSON manifests, Markdown documentation.

---

## Task 1: Source And Prompt Correctness

**Files:**
- Create: `src/benchmarks/skill-ir/source-fixture.ts`
- Create: `src/benchmarks/skill-ir/source-fixture.test.ts`
- Modify: `src/skill-ir/schema.ts`
- Modify: `src/skill-ir/schema.test.ts`
- Modify: `src/benchmarks/skill-ir/real-agent.ts`
- Modify: `src/benchmarks/skill-ir/real-agent.test.ts`

- [x] Add tests requiring SHA-256 on file sources, rejecting path escape/digest mismatch, rendering exact original text, copying relative resources, and excluding `successCriteria` from agent prompt.
- [x] Run the focused tests and confirm failures are caused by the missing contracts.
- [x] Implement verified source loading and exact original materialization without generated wrappers.
- [x] Move success criteria into the judge rubric only, including perturbation wording.
- [x] Run focused source/schema/materialization tests to green.

## Task 2: Explicit Corpus Registry

**Files:**
- Create: `src/benchmarks/skill-ir/corpus-registry.ts`
- Create: `src/benchmarks/skill-ir/corpus-registry.test.ts`
- Create: `benchmarks/skill-ir/corpus/corpora/calibration.json`
- Create: `benchmarks/skill-ir/corpus/corpora/pilot.json`
- Replace: `benchmarks/skill-ir/corpus/manifest.json`
- Modify: `src/benchmarks/skill-ir/matrix.ts`
- Modify: `src/benchmarks/skill-ir/matrix.test.ts`
- Modify: `src/benchmarks/skill-ir/run.ts`
- Modify: `src/benchmarks/skill-ir/real-agent-run.ts`
- Modify: relevant tests

- [x] Add failing tests for explicit corpus resolution, missing-corpus failure, calibration depth, pilot Wave registration, source-only readiness, and cold-start systems `no-skill|original|ir-static`.
- [x] Run tests and confirm the old implicit manifest/default PGO behavior fails them.
- [x] Implement registry resolution and require `--corpus` in matrix, real-agent, and route-probe CLIs.
- [x] Move six seeds to the calibration manifest and register six real pilots in the pilot manifest.
- [x] Keep source-only pilot entries unscheduled until IR/tasks become runnable.
- [x] Run matrix, corpus, runner, and route-probe tests to green.

## Task 3: Final IR Provenance

**Files:**
- Create: `src/benchmarks/skill-ir/final-ir-provenance.ts`
- Create: `src/benchmarks/skill-ir/final-ir-provenance.test.ts`
- Modify: `src/benchmarks/skill-ir/profile-feedback-run.ts`
- Modify: `src/benchmarks/skill-ir/profile-feedback.test.ts`
- Modify: `src/benchmarks/skill-ir/real-agent-run.ts`
- Modify: `src/benchmarks/skill-ir/real-agent-run.test.ts`

- [x] Add failing tests that require `sourceSystem=original`, `taskSplit=development`, an explicit corpus, and matching source/base/final digests.
- [x] Run focused tests and confirm missing provenance is accepted by the old implementation.
- [x] Emit `provenance.json` after Final IR compilation.
- [x] Validate provenance before any held-out `ir-pgo` plan is materialized.
- [x] Reject held-out-derived, stale, hand-edited, or corpus-mismatched Final IR.
- [x] Run focused feedback/runner tests to green, including valid and tampered artifact paths.

## Task 4: Real Pilot Source Import

**Files:**
- Create: `benchmarks/skill-ir/pilots/law-to-markdown/source/**`
- Create: `benchmarks/skill-ir/pilots/env-manager/source/**`
- Create: `benchmarks/skill-ir/pilots/experimental-design/source/**`
- Modify: `benchmarks/skill-ir/corpus/corpora/pilot.json`
- Modify: `src/skill-ir/corpus-fixtures.test.ts`

- [x] Import exact licensed source closures from the pinned commits recorded in `real-skill-intake.json`.
- [x] Record SHA-256 for every committed source file and license scope.
- [x] Add failing corpus tests for source existence, hashes, Wave A/Wave B registration, and status.
- [x] Run corpus tests red, update manifests, then run them green.

## Task 5: Documentation And Verification

**Files:**
- Modify: canonical spec and plan
- Modify: `docs/skill-ir/real-agent-dry-run.md`
- Modify: `docs/skill-ir/profile-feedback-loop.md`
- Modify: `docs/skill-ir/benchmark-matrix.md`
- Modify: `docs/skill-ir/real-skill-intake.md`
- Modify: `docs/skill-ir/corpus-fixtures.md`
- Modify: `docs/skill-ir/experiment-design.md`

- [x] Replace current four-system default language with three-system cold-start scheduling plus explicit held-out PGO.
- [x] Mark Wave B mandatory for the complete main claim.
- [x] Replace old `targetCounts` with current 3+3 scope and historical aspirations.
- [x] Replace intake references to `ir-profile` with the current systems.
- [x] Run all Skill IR/profiler/benchmark tests, Python analyzers, typecheck, diff check, source comparison, and secret scan.
- [ ] Append `D:\skill优化\conversation_log.md`, commit, and push `skill-ir-aot`.
