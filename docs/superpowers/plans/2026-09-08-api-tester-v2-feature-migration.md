# API Tester v2 feature-stratified migration implementation plan

Date: 2026-09-08

> Execute serially in the current `skill-ir-aot` checkout. Preserve unrelated untracked files. Use TDD for the new freeze/runner contract, and never invoke the constructor on a selected real input before the freeze commit is pushed.

## Goal

Freeze the actual API Tester v2 unified-CLI execution surface, select and predict six new real inputs plus four boundary inputs by structural review, then perform one immutable ten-row migration run with digest-bound evidence and zero model/API/paid calls.

## Stage 1: authority and design

1. Add the approved design and this file-level plan.
2. Add spec section 14.16 and plan section 4.45 with the exact identities, 6+4 denominator, freeze-before-run rule, cost boundary, and non-claims.
3. Commit and push the design checkpoint before implementation.

## Stage 2: RED contracts

Files:

- Create `src/benchmarks/skill-ir/api-tester-v2-feature-migration.test.ts`.
- Create `src/benchmarks/skill-ir/api-tester-v2-feature-migration.ts` only after the initial missing-module failure.

Tests must first fail for the expected missing implementation, then require:

- candidate binding of the top-level route, unified CLI, preset, v2 contract/program/artifact, shared safety helpers, and dependency locks;
- six unique real inputs and four boundary rows, exact 2/2/2 primary real strata, unique repository lineage, and no forbidden old/Q1 input reuse;
- immutable upstream content/license bindings and recorded inclusion/exclusion reasons;
- one pre-run prediction per row and zero retry/replacement/fix policy;
- freeze-commit and offline-cache digest verification;
- unified-CLI invocation, fail-closed row accounting, checker/output evidence, separated strata, and explicit cost fields;
- a result writer that cannot overwrite an existing first-run report.

Use only disposable synthetic test fixtures. Selected real input bytes may be structurally inspected and digest-verified, but not passed to the v2 parser, artifact runner, preset, or CLI before the pushed freeze.

## Stage 3: structurally select and freeze inputs

1. Inspect primary upstream repositories and pin six documents at full commits plus their license files.
2. Cache the exact bytes outside the repository and build a structural inventory without importing the v2 constructor.
3. Select exactly two primary rows per requested feature stratum. Store secondary feature labels without duplicate counting; preserve rejected candidates and reasons.
4. Create four small boundary fixtures that exercise declared v2 rejection behavior.
5. Create one v2 binding per row using only ordinary data/path/output parameters.
6. Generate the candidate and experiment lock with `resultState=not-run`.

## Stage 4: GREEN runner and freeze checkpoint

Files:

- Create `src/benchmarks/skill-ir/api-tester-v2-feature-migration.ts`.
- Create `src/benchmarks/skill-ir/api-tester-v2-feature-migration-freeze-run.ts`.
- Create `src/benchmarks/skill-ir/api-tester-v2-feature-migration-first-run.ts`.
- Create `benchmarks/skill-ir/classification/api-tester-constructor-candidate-v2.json`.
- Create `benchmarks/skill-ir/pilots/api-tester/v2-feature-migration-001/` lock, bindings, fixtures, and selection evidence.
- Create `docs/skill-ir/api-tester-v2-feature-migration.md`.

Implement the smallest code that satisfies the RED contract. The first-run runner must print one budget line and one stop-loss line before work, verify the pushed freeze, invoke `node bin/skvm.js artifact ...` once per row, retain failures, sanitize local paths, and write the report with exclusive creation.

Run focused tests, relevant v1/v2/CLI regressions, typecheck, document checks, repository scans, and diff checks. Explicitly stage only the freeze whitelist, commit, and push. Do not execute the panel before the remote ancestor check can succeed.

## Stage 5: unique first run

1. Confirm `origin/skill-ir-aot...HEAD=0/0`, the full freeze SHA, cache digests, candidate closure, and `resultState=not-run`.
2. Print the fixed budget (`rows=10`, `modelCalls=0`, `apiCalls=0`, `paidCalls=0`) and stop-loss (`attemptsPerRow=1`, `retries=0`, `replacements=0`, `candidateFixes=0`).
3. Execute all ten rows exactly once through the unified CLI.
4. Write `results/skill-ir/api-tester-v2-feature-migration-001/first-run-report.json` once. Do not repair, retry, replace, or reroute any row.

## Stage 6: evidence synchronization

Update the component protocol, spec, plan, README/current status/developer guide as needed, claim-evidence table, outer AGENTS active route, handoff, communication ledger, and conversation log. Report real and boundary strata separately, record exact limits and the 467,220-token historical development cost separately from runtime, then run fresh verification, commit the explicit result/document whitelist, and push.

## Stop conditions

- A digest, license, denominator, prediction, cache, freeze-commit, route, or result-path mismatch blocks execution before a row is dispatched.
- A row failure remains in the denominator and never authorizes a retry, replacement, route change, or in-place candidate repair.
- No held-out, Stage M/N, Q1, second profile, new skill, core, DSL, scorer, old lock/result, portfolio, or readiness change is permitted.
