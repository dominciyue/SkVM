# API Tester Operation Delivery and Candidate Freeze Plan

> **Execution:** Use systematic debugging, TDD, verification-before-completion, and one short-path clean Git worktree. This authorized stage runs continuously through evidence archive and candidate freeze.

**Goal:** Add a manifest-driven ordinary-input operation entry, replace the missing clean archive with additive fully archived evidence, validate the unchanged method on exposed/synthetic inputs, and freeze the exact candidate chain without selecting or running prospective inputs.

**Architecture:** A new standalone module/CLI composes the existing source, admission, projection, independent coverage/dependency, and v2 artifact/checker components. A separate freeze/evidence module builds and verifies the exact candidate snapshot and archived clean closure. The historical fixed-six runner and all old evidence remain unchanged.

## Task 1: Freeze design and recovery state

- [x] Record the missing `clean-002` search result and the non-overwrite policy.
- [x] Specify the ordinary-input manifest, output closure, strict verifier, candidate identity, evidence identity, clean reproduction, claims, and stop point.
- [x] Add spec/plan sections and update the execution-status recovery entry before code.

## Task 2: Build the ordinary-input entry with TDD

- [x] RED-test manifest parsing, digest/format/path binding, exclusive output, no fixed-six dependencies, accepted construction, mixed rejection/unresolved behavior, source-validity advisory retention, and complete operation inventory.
- [x] Implement `api-tester-operation-input.ts` and its CLI. Reuse the unchanged v2 support contract and existing operation/v2 components; do not add source-specific branches or import the fixed-six runner.
- [x] RED-test the strict verifier against analyzer omission/duplication, projection/dependency loss, missing artifact operation, input/report/contract replacement, and extra/tampered closure files; implement the minimum independent checks.
- [x] Run focused tests plus existing source/admission/coverage/v2 artifact regression and typecheck. Broader historical operation validation remains in final verification.

## Task 3: Validate exposed and synthetic inputs

- [x] Build deterministic manifests for only the six already exposed source bytes and permitted synthetic fixtures. Derive expected counts from strict-read evidence rather than embedding them in the runner.
- [x] Run the new entry uniformly for all six sources. Verify Meilisearch's missing construction ref remains unresolved and Bangumi external response refs remain source-validity advisories.
- [x] Compare operation universe, admission, checker-pass, obligations, dependency dimensions, and coverage against the current repaired evidence. Retain every failure/advisory; do not promote partial success to document success.

Result: `main` strictly verifies 6 documents, 562 operations, 112 accepted, 449 rejected, 1 unresolved, 112 checked, and 575/575 obligations. Attempts 001--003 preserve two pre-report implementation failures and the overbroad blocker-classification failure that prompted a focused TDD repair.

## Task 4: Freeze the candidate execution chain

- [x] RED-test the candidate schema and builder for exact implementation/lock/runtime digests, unchanged v2 support id, immutable claim policies, and `inputSelection=not-started`, `predictions=not-authored`, `prospectiveRuns=0` with no rows/predictions.
- [x] Generate the candidate snapshot binding the entry, source/admission/projection, independent coverage/dependency verifier, v2 generator/checker/artifact, dependency lock, helpers, and Bun/Node versions.
- [x] Commit the implementation, tests, docs, and candidate locally. Exact clean reproduction commit: `3ebe60613bab0375047fcb51337d35b3c1830430`.

## Task 5: Archive new clean evidence

- [x] Create a short-path detached worktree at the candidate commit; use locked offline dependencies and record Git/Bun/Node/OS state.
- [x] In that checkout, construct a digest-bound archive package from the six exposed sources/licenses, run all six ordinary-input manifests, run strict verification, and recreate the dependency-revision reproduction-only report.
- [x] Copy the complete input/output/revision closure to `results/skill-ir/api-tester-operation-delivery-freeze-development-001`, preserving every file and digest. Record the absent historical `clean-002` path/digest as missing, not verified.
- [ ] Strictly verify the archive against candidate Git blobs, source-selection digests, candidate snapshot, semantic comparisons, exact closure, and zero model/API/paid accounting. Remove only the verified temporary worktree.

The first detached preflight at `fa20a52` correctly failed before source execution because the archive manifest named 10 ignored v2 scripts absent from Git. `clean-attempt-001/failure.json` preserves it. The successor candidate commit records all declared bytes with scoped binary attributes and adds a Git-tree closure gate before clean reproduction.

## Task 6: Close out and stop extension

- [ ] Update the component guide, developer guide, spec, plan, status, final report/claim history where applicable, handoff, communication ledger, and conversation log.
- [ ] Run fresh focused and `src/skill-ir` regression, typecheck, docs links, frozen-history diff guards, secret/absolute-path scans, `git diff --check`, and an independent read-only review.
- [ ] Commit complete machine evidence and documentation locally; do not push. Mark the operation candidate frozen but still unselected, unpredicted, and never prospectively run.
- [ ] Stop development extension. Recommend a later, separately preregistered unseen-input design only; do not select inputs or author row predictions here.

## Recovery order

1. Read `docs/skill-ir/api-tester-operation-development-status.md`.
2. Confirm branch `api-tester-operation-admission-dev`, tracked changes, and the recorded latest stage commit.
3. Run the status file's `nextCommand`.
4. Continue at the first unchecked item above. Never invoke the frozen 001/002 first-run runner.
