# Skill Family Class Proof 002

This component is the development-only, recoverable pipeline for the
`openapi-contract-to-offline-request-specimen` class. It keeps class membership,
source-grounded obligations, construction, independent checking, and transfer
decisions as separate records. A local artifact can prove a bounded request
specimen obligation; it does not prove a complete skill, a live API, or
production readiness.

## Entry points

Run from the `SkVM` checkout:

```powershell
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=lock
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=resume
```

The command stores all new evidence below
`results/skill-ir/skill-family-class-proof-20260911/`. The status file is
`execution-status.json`; it is the recovery source of truth for the next
unfinished R/E step. Each step is idempotent at the identity level and does not
rewrite an existing first-run report.

`--step=lock` reads only the already persisted R3 eligibility/source metadata
to choose repository-distinct primary and reserve rows. It writes
`method-lock.json` before reading any primary bytes or invoking construction,
then digest-checks and copies the selected source bodies, direct resources, and
the two fixed input bindings into the identity directory. The completed role
assignment is recorded separately in `primary-selection.json`, including
screening and post-lock read counts. No accepted count or construction outcome
is an input to this selection.

## Contract and data flow

The fixed class requires a public OpenAPI/Swagger/JSON API contract locator, an
explicit offline request or test output duty, a coverage locator, two or more
derivable inputs, and semantics that an independent checker can determine
without credentials or a business service. The flow is:

```text
source commit/path -> eligibility -> responsibility/obligation ledger
  -> input -> shared construction -> independent checker -> report
```

`src/skill-ir/skill-family-eligibility.ts` is a pure, model-free preflight.
`src/skill-ir/skill-family-class-construction.ts` remains the shared
constructor/checker profile. The orchestrator records source, model, paid, and
infrastructure accounting independently and never dispatches a model for
eligibility.

## State and roles

The state sequence is `planned -> screening -> development -> capability-ready
-> method-locked -> primary-running -> revised-once|no-revision -> reported
-> extension-running`. A shortfall or implementation issue is retained as
`screening-shortfall`, `method-not-ready`, or `blocked-before-evaluation`.
Screened candidates are not primary results. Primary bodies are read only after
the method lock, and first-run rows are immutable once written.

## Result fields

Machine reports must include `protocolReady`, `inputReady`, `capabilityReady`,
and `transferDecision`, plus member, obligation, input, artifact, checker, and
failure denominators. `bounded-positive` requires three repository-distinct
primary members with two applicable inputs each, at least 90% core obligation
coverage, at least two thirds first-run accepted members, and 100% independent
checker passage. Otherwise the appropriate negative, insufficient, or blocked
decision is retained; no result is promoted by hand.

## Failure and boundary semantics

Unsupported syntax, semantics that cannot be preserved, missing public evidence,
and implementation failures are distinct reasons. Missing `$ref`, authentication
or live-state evidence is not guessed. Meilisearch-style missing references stay
construction blockers; Bangumi-style external response material is an advisory,
not source validity proof. Source-blocked, outside-class, unresolved, rejected,
and checker-failed rows remain in their original denominator.

Historical v1/v2 candidates, the original `0/6`, Q1/held-out material,
readiness, and prior result directories are read-only. No prospective sample is
selected or predicted by this component until a separately locked identity
allows it. Development-agent cost is recorded separately from artifact runtime
cost. Remote GitHub and paid/model calls, when useful, are recorded with their
purpose and returned usage; none are required for the eligibility function.

## Testing and maintenance

Use TDD for code changes. Focused tests are:

```powershell
bun test ./src/skill-ir/skill-family-eligibility.test.ts
bun test ./scripts/skill-ir/skill-family-class-proof.test.ts
bun run typecheck
```

Before a release or handoff, run the relevant class-proof verifier and a clean,
offline replay from the committed evidence directory. Never use the historical
six-source runner as a substitute for this entry point, and never stage the
unrelated untracked historical materials in the repository root.

## Current execution checkpoint

R0-R4 are complete for `skill-family-class-proof-002`. R1's pure preflight
has 14 focused tests and performs no model, network, construction, or checker
work. R2 froze a metadata-only pool of 293 candidates from 191 repositories
before construction. R3 acquired 39 screened bodies, classified 12 as eligible
across six repositories, retained 27 exclusions, and bound all 12 already
exposed development OpenAPI inputs. Eight authenticated GitHub blob reads were
recorded; model and paid calls remain zero.

R4 selected one eligible member per repository before construction and bound
the first two entries in the archived input index: `onepassword-connect` (15
operations) and `onepassword-partnership` (4 operations). The resulting ledger
contains six members, 12 input bindings, 16 source-located core obligations, 26
outside-class duties, and 216 unresolved source-located duties. Unresolved rows
remain in the denominator and are not treated as constructible outcomes. The
first R4 attempt exposed a missing repository field in the already written R3
eligibility rows; the repair hydrates that identity only from the independently
persisted source ledger and rejects missing or conflicting bindings.

Evidence is in `candidate-pool.json`, `screening-policy.json`,
`screening-discovery.json`, `source-ledger.json`, `eligibility.json`,
`responsibility-ledger.json`, `task-inputs.json`, and
`development-ledger.json` below the result directory. The next action is R5:
derive a gap matrix from actual development inputs and select only a shared,
contract-internal gap with an independent oracle.

R5 and R6 are now recorded. The gap matrix has 12 source-duty observations
(six members across two inputs) and one retained source shortfall. A prior
three-member calibration supplied the before snapshot for `format:url`: 414
unresolved witness cases were observed. The shared offline witness/checker now
constructs and validates that format; the current `onepassword-connect`
snapshot has zero unresolved cases. This is a bounded offline extension and
does not add `url` to the production v2 scalar contract, which remains
unchanged.

R6 runs use `development-runs/<candidate>/<input>/` with an exclusive manifest
and copied, digest-bound input. Each run invokes
`runApiTesterOperationInput` once and then
`verifyApiTesterOperationInputOutput` independently. The machine gate reports
12/12 verified input runs, 114 enumerated operations, 42 accepted and 42
checker-checked operations, 100% core-obligation coverage, and no
infrastructure, source, constructor, or checker failures. The gate is therefore
`protocolReady=true`, `inputReady=true`, and `capabilityReady=true` for this
development slice only. It is not a primary or prospective result.

The next action is R7: run pre-registered metamorphic and negative fault
injections against independent coverage, dependency, artifact-checker, and
binding layers. Preserve the clean development run directories and never
rewrite their first-run summaries.

R7 is complete. The validation entry point is
`bun ./scripts/skill-ir/skill-family-class-proof.ts --step=validation` and it
reads only the digest-bound R6 input copies plus the labelled synthetic
`local-ref-arrays` fixture. Twelve real development inputs produced 72 derived
cases across the six registered transforms: 60 applicable cases passed, 12
local-reference cases were explicitly `not-applicable`, and there were no
failed, unsupported, or unresolved cases. The six legal synthetic boundary
cases all passed and added no independent real samples.

The independent fault harness registered 16 mutations and detected all 16 at
their predeclared layers (source coverage, admission consistency, dependency
verification, independent checker, or package binding); missed,
not-applicable, and unresolved counts are all zero. Machine evidence is in
`metamorphic-validation.json`, `fault-detection.json`, and `r7-validation.json`.
The report keeps the synthetic fault set separate from real success and does
not change the v2 contract, readiness, historical `0/6`, or prospective
boundaries. The next action is R8 method lock and primary selection.

R8 is complete. `bun ./scripts/skill-ir/skill-family-class-proof.ts --step=lock`
first exposed and preserved an input-order mismatch between the stale
`task-inputs.json` snapshot and the R4/R6 development ledger; the failed attempt
is recorded in `r8-input-binding-mismatch-attempt-001.json` and did not run
construction. A second pre-commit binding snapshot is retained in
`r8-implementation-binding-mismatch-attempt-002.json`; it records the corrected
selection before its implementation was committed. The repaired lock uses the first two bindings agreed by all six
development members and cross-checks each task binding by `inputId`, format,
bytes, and SHA-256. `method-lock.json` binds implementation commit `df3b5d9`,
39 screened bodies, 12 eligible candidates, three repository-distinct primary
members (`candidate-091`, `candidate-112`, `candidate-217`), and two reserves.
The lock records `screeningBodyReadCount=39` and
`primaryBodyReadCount=0`; only after it was persisted were three primary bodies,
five direct resources, and six fixed inputs copied and digest-checked. The
separate `primary-selection.json` shows each primary bound to
`onepassword-connect` and `onepassword-partnership`, with
`outcomeDataUsed=false`. No primary construction or prospective run has begun;
the next action is R9 first-run construction.

R9 is complete through
`bun ./scripts/skill-ir/skill-family-class-proof.ts --step=primary-first-run`.
The immutable report contains six rows for three repository-distinct primary
members and the two locked inputs. All six independent verifiers passed. Across
the rows, 57 source operations were enumerated, 21 operations were accepted
within the unchanged v2 contract, and all 21 generated operations passed the
artifact checker. All three members produced a non-empty accepted artifact.
Fourteen of 15 source-located core obligations were constructed, for 93.33%
coverage, so the machine result is `protocolReady=true`, `inputReady=true`,
`capabilityReady=true`, and `transferDecision=bounded-positive`.

The first two orchestration attempts are preserved rather than overwritten.
Attempt 1 read an invalid top-level artifact field after the underlying runners
had emitted output; attempt 2 omitted `inputValid` from otherwise verified
aggregate rows. `r9-first-run-binding.json` binds both failed reports and the
canonical third report to their implementation commits and SHA-256 values.
Neither repair changed the constructor, checker, support contract, selected
members, or inputs.

The sole unconstructed core duty is candidate 091's strict-extra-fields duty:
both fixed inputs lack an `additionalProperties` source instance. It occurs in
only one primary member, so the pre-registered shared-revision rule is not met.
The next action is R10 `no-revision`; this result must not be promoted to
`strong-positive` by broadening the contract or manufacturing an input feature.

R12 clean replay is complete. The first replay attempt is retained as
`clean-replay-attempt-001.json`: at commit `2877b77`, all six independent
verifiers correctly rejected the checkout because the generated
`artifacts/scripts/api-test-generate.mjs` and `artifacts/checks/api-test-check.mjs`
files were missing from the committed output closure. The checker was not
relaxed. Those twelve already-produced programs (six inputs times two) were
archived explicitly in commit `1663d4f`, and the repaired clean checkout
`D:\cp-clean-r12c` was detached at `3e33dfc`. With
`bun install --frozen-lockfile --offline` (236 packages),
`bun ./scripts/skill-ir/skill-family-class-proof.ts --step=clean-replay
--out=D:\cp-clean-r12-report-003.json` produced the formal
`clean-replay.json`: 19/19 evidence files, 6/6 verified runs, 57 operations,
21 accepted and 21 independently checked, with semantic denominators matching
`final-report.json` and external model/API/paid calls `0/0/0`.

The clean report deliberately records both the status-declared HEAD and the
actual detached HEAD; the former predates the final archive/type fix and the
latter is the replay commit. The clean checkout also passed the focused suite
(27 tests/95 assertions), `bun run typecheck`, and a script-specific check with
zero diagnostics for this class-proof file. A command-line typecheck that
follows all imports still surfaces unrelated historical module diagnostics;
those are reported separately and are not used to weaken the class-proof
checker. R12 remains offline development evidence and does not alter the old
`0/6`, readiness, Q1, held-out, or prospective boundaries.

R10 is complete. `no-revision.json` independently rebuilds the R9 core-duty
outcomes and records one observed `strict-extra-fields` gap for candidate 091.
Because no second primary member has the same contract-internal gap, the
pre-registered shared-revision threshold is not met. The report therefore has
`decision=no-revision` and `revision.attempted=false`; no primary-revision run
or contract change was performed. The next action is R11 final denominators and
boundary report.

R11 is complete through
`bun ./scripts/skill-ir/skill-family-class-proof.ts --step=final-report`.
`final-report.json` binds the method lock, primary selection, responsibility and
development ledgers, R7 validation, R9 first-run, R10 decision, and the historical
API Tester `0/6` report by SHA-256. Its primary denominators are 3 members, 6
complete applicable inputs, 15 core obligations (14 constructed, 93.33%), 21
accepted artifacts (21 independently checked), and 57 enumerated operations
(36 rejected, 0 unresolved). The four gates remain
`protocolReady=true`, `inputReady=true`, `capabilityReady=true`, and
`transferDecision=bounded-positive`.

The report records source/model/paid accounting as 17/0/0 and 12 local
primary-run calls. Per-member mapping is source-declared and ledger-bound to the
shared constructor; semantic review remains required and is not automated.
Construction/checker sub-times and human minutes are explicitly
`not-measured`; no matched original-skill/model comparison was run. The only
unconstructed core duty is candidate 091's `strict-extra-fields`, and it does
not meet the two-member revision threshold. Prospective preparation is
`not-ready` because a separate identity, input-selection lock, prediction plan,
and readiness decision have not been registered. The first aggregator bug is
retained as `final-report-attempt-001.json`; the formal report is write-once.

R9 is complete through
`bun ./scripts/skill-ir/skill-family-class-proof.ts --step=primary-first-run`.
The immutable report contains six rows for three repository-distinct primary
members and the two locked inputs. All six independent verifiers passed. Across
the rows, 57 source operations were enumerated, 21 operations were accepted
within the unchanged v2 contract, and all 21 generated operations passed the
artifact checker. All three members produced a non-empty accepted artifact.
Fourteen of 15 source-located core obligations were constructed, for 93.33%
coverage, so the machine result is `protocolReady=true`, `inputReady=true`,
`capabilityReady=true`, and `transferDecision=bounded-positive`.

The first two orchestration attempts are preserved rather than overwritten.
Attempt 1 read an invalid top-level artifact field after the underlying runners
had emitted output; attempt 2 omitted `inputValid` from otherwise verified
aggregate rows. `r9-first-run-binding.json` binds both failed reports and the
canonical third report to their implementation commits and SHA-256 values.
Neither repair changed the constructor, checker, support contract, selected
members, or inputs.

The sole unconstructed core duty is candidate 091's strict-extra-fields duty:
both fixed inputs lack an `additionalProperties` source instance. It occurs in
only one primary member, so the pre-registered shared-revision rule is not met.
The next action is R10 `no-revision`; this result must not be promoted to
`strong-positive` by broadening the contract or manufacturing an input feature.
