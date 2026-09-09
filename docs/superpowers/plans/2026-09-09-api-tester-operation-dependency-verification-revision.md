# API Tester Operation Dependency-Verification Revision Plan

> **Execution:** Use systematic debugging, test-driven development, verification-before-completion, and a clean Git worktree. This is a continuous authorized local-development stage; do not pause after the focused fix.

**Goal:** Repair independent operation dependency verification, measure its impact on the six exposed development documents, and reproduce the revision offline from a clean checkout without altering frozen or prior development evidence.

**Architecture:** Extend `api-tester-operation-coverage` with an independently derived, cycle-safe local-reference graph and effective security-scheme comparison. Add a separate revision-development runner/report that binds the old evidence, runs the repaired Task 1 pipeline into a new directory, compares semantic results dynamically, records the old misses and fixed outcomes, and verifies one clean replay.

**Identity:** `skill-ir-api-tester-operation-dependency-verification-revision-development-001`

## Task 1: Freeze the revision contract and RED evidence

- [x] Add the unchanged-projection control and three required mutation tests: response component type drift, nested parameter-schema constraint drift, and same-name apiKey header-name drift.
- [x] Run only the focused coverage test and retain evidence that all three mutations falsely pass at review baseline `d2e748868a3c5e88b49cb940d4cd495f7b4dcf68` while the control passes.
- [x] Add a shared/cyclic local-reference regression so closure traversal is bounded and transitive changes are observable.
- [x] Define the new identity, contract, output paths, exact old-report binding, fault registry, six-source boundary, zero-runtime-call accounting, and clean-reproduction fields.

## Task 2: Implement the minimal verifier repair

- [x] Derive operation roots independently from source/projected documents; do not consume analyzer or constructor inventories.
- [x] Compare effective parameters, request, responses, global/operation security requirements, named security-scheme definitions, and every reachable local-reference target.
- [x] Traverse shared/cyclic dependencies with visited graph nodes. Record missing/external/invalid targets instead of guessing them.
- [x] Separate projection preservation, construction obligations, and source validity in the report while retaining compatible coarse failure codes.
- [x] Run the focused tests to GREEN, followed by source/admission/development/validation regression and typecheck.

## Task 3: Add the revision-development runner and strict verifier

- [x] RED-test contract/report schema, exact baseline/report bindings, the one-control/three-miss registry, repaired detector outcomes, dynamic old/fresh comparisons, source-blocker retention, accounting, and write-once output.
- [x] Implement a CLI that verifies the baseline report, reruns the same six digest-bound sources through the repaired development pipeline into `<result>/replay`, and writes a new revision report without touching old results.
- [x] Compare per-document operation keys/statuses/dependency results plus aggregate operation universe, admission, checker-pass counts, and obligation coverage. Derive expected values from the verified old report; never encode `112` as a required result.
- [x] Strictly re-read every new report/inventory/artifact, compare the report revision to the verified checkout's live Git commit/detached state, and reject binding or portable-digest drift.

## Task 4: Execute and reproduce the revision

- [x] Commit the design, tests, implementation, contract, and runnable entry on `api-tester-operation-admission-dev`; exact revision commit is `a359c0c68862637153b98a7f7ae797de35e0564c`.
- [x] Run the new entry once in the development checkout with the existing six-source offline cache and a fresh result directory.
- [x] Read `superpowers:using-git-worktrees`, create an independent detached clean checkout at that exact revision commit, install `bun.lock` with `--frozen-lockfile --offline`, and run the same revision entry into a fresh clean result.
- [x] Compare portable semantics, per-document comparisons, dependency outcomes, checker counts, obligations, and evidence digests; keep OS/Bun/Node/path/time fields separate.

## Task 5: Close out evidence and claims

- [x] Update the component guide, spec, project plan, status file, final report/claim history where applicable, handoff, communication ledger, and conversation log. Correct the historical claim by addition: old reports remain immutable but no longer support an unqualified “no implementation defect” statement.
- [x] Run fresh focused/broad tests, typecheck, documentation links, frozen-history digest checks, secret/absolute-path scans, and `git diff --check`.
- [ ] Commit the new machine evidence and documentation locally. Do not push.
- [ ] State whether the repaired evidence is sufficient to freeze a new operation candidate. Even if sufficient, only recommend a next design; do not select or execute unseen inputs.

## Recovery order

1. Read `docs/skill-ir/api-tester-operation-development-status.md`.
2. Confirm branch `api-tester-operation-admission-dev`, the recorded latest commit, and that old result paths are unchanged.
3. Run the status file's `nextCommand`.
4. Continue at the first unchecked item above; never invoke the frozen 001/002 first-run runner.
