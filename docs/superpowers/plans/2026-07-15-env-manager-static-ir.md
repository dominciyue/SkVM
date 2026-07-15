# Env Manager Static IR Implementation Plan

> **For agentic workers:** use test-driven development and update this checklist as each step is verified.

**Goal:** Build a source-audited `env-manager` base IR, make its complete static
semantics agent-visible, and run a frozen `no-skill | original | ir-static`
development experiment without dynamic repair or held-out leakage.

**Architecture:** Extend the existing Markdown lowering to consume all semantic
schema views, encode the pinned public skill as a profile-empty base IR, validate
its provenance and leakage boundary, transition only this pilot to `runnable`,
then execute a separately preregistered static calibration.

**Tech stack:** TypeScript, Bun, Zod, JSON corpus fixtures, deterministic custom
scoring, Markdown research contracts.

## Task 1: Complete Agent-Facing Static Lowering

- [x] Add a failing renderer test for inputs, outputs, preconditions, tools, and environment assumptions.
- [x] Confirm RED with `bun test ./src/benchmarks/skill-ir/real-agent.test.ts`.
- [x] Render concise sections for the five views without changing exact `original` materialization.
- [x] Confirm GREEN and document the runtime behavior.

## Task 2: Construct And Audit Base IR

- [x] Add failing corpus tests for a runnable, digest-pinned, profile-empty `env-manager` IR.
- [x] Add leakage assertions for task ids, evaluator internals, fixture-only identifiers, and synthetic secrets.
- [x] Create `base-ir.json` and a field-level source audit from only pinned source semantics and static clarifications.
- [x] Validate schema, references, source digest, and empty profile.

## Task 3: Transition Corpus Scheduling

- [x] Update failing matrix expectations so normal pilot scheduling selects only `env-manager` with cold-start systems.
- [x] Set `status=runnable` and add `irPath` only after Task 2 gates pass.
- [x] Keep the pre-IR calibration mode fail-closed for all remaining states.
- [x] Confirm normal dry-run produces the expected three-system development rows.

## Task 4: Freeze Static Experiment

- [x] Add a failing lock-contract test.
- [x] Create `env-manager-static-lock.json` with source/base digests and the frozen model/matrix contract.
- [x] Prohibit held-out execution, profile/PGO compilation, scorer tuning, and IR edits after execution begins.
- [x] Confirm the lock is secret-free and internally consistent.

## Task 5: Verify And Execute

- [x] Run focused tests, the relevant Bun suite, Python analyzer tests, typecheck, and `git diff --check`.
- [x] Probe `xty/gpt-4.1-mini`; abort paid execution on route failure.
- [x] Execute 12 development rows: 3 systems x 2 tasks x 2 repetitions.
- [x] Score deterministically and produce the analysis table.
- [x] Report success, hard gates, criterion scores, paired deltas, tokens, latency, and exclusions.

## Task 6: Preserve Evidence

- [x] Update component docs, canonical spec/plan, and experiment note to the observed state.
- [x] Append `D:\skill优化\conversation_log.md` with decisions and verification evidence.
- [ ] Commit and push repository-relevant code, docs, lock, and compact results; keep secrets and bulky workdirs local.
