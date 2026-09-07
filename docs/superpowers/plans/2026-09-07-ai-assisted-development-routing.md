# AI-assisted development routing and prospective construction implementation plan

Date: 2026-09-07

## Goal

Create a separate, fail-closed development evidence path from the existing AI annotation drafts to one frozen API Tester prospective construction run, while preserving the original Q1 experiment as incomplete.

## Stage 1: protocol and routing-table contract

1. Add the component protocol and synchronize the authoritative spec, implementation plan, handoff, communication ledger, and claim-evidence table.
2. Add failing tests for a 24-unit routing-table builder: digest binding, unique IDs, exact A/B revision-2 parity, provenance, change records, and explicit non-claims.
3. Implement the builder and runner, then generate `benchmarks/skill-ir/classification/ai-assisted-development-routing-v1.json`.
4. Verify that the external A/B originals are unchanged.

Checkpoint: commit the development protocol and generated routing table.

## Stage 2: candidate and input freeze

1. Add failing tests for a constructor capability snapshot that binds the routing table, historical Q2 profile, source closure, supported features, rejection codes, and checker boundary.
2. Implement and generate `benchmarks/skill-ir/classification/api-tester-constructor-candidate-v1.json` without editing historical Q2.
3. Commit four synthetic boundary fixtures.
4. Add failing tests for a prospective experiment lock with exactly four real and four boundary rows, frozen selection rules, source/license digests, one prediction per row, zero-retry policy, separated cost schema, and no results.
5. Implement and generate the lock.
6. Run deterministic verification, make a focused freeze commit, and push it to `origin/skill-ir-aot`.

Checkpoint: the pushed freeze commit is the only authorization point for execution. No constructor run on the selected inputs occurs before it.

## Stage 3: immutable first run

1. Add/finish the result runner and tests against disposable fixtures.
2. Verify the lock against its freeze commit and the upstream branch.
3. Print the frozen denominator, zero-call budget, no-retry policy, and stop-loss line.
4. Execute all eight inputs exactly once from the verified offline cache.
5. Write the immutable first-run report under `results/skill-ir/api-tester-constructor-prospective-001/`.
6. Report accepted, rejected, checker-failed, and infrastructure-failed rows; keep every row in the denominator and separate real/boundary summaries.

Checkpoint: do not repair the candidate or replace inputs after seeing results.

## Stage 4: evidence synchronization

1. Update the component protocol, spec, plan, claim-evidence table, handoff, communication ledger, and conversation log with the frozen result and exact limits.
2. Run focused tests, type checking, document-link validation, repository scans, and `git diff --check`.
3. Commit only the explicit stage whitelist and push `origin/skill-ir-aot`.

## Stop conditions

- Any provenance or digest mismatch blocks generation.
- Any denominator, prediction, or sample-license omission blocks the freeze commit.
- Any lock/freeze-commit mismatch blocks execution.
- Any row failure is reported and retained; it does not authorize retry, replacement, route switching, or candidate modification.
- No held-out, readiness, portfolio, Stage M/N, core, DSL, old-lock, or historical-Q2 change is permitted.
