# Current-v2 final development delivery

## Purpose

N15 produces one machine-verifiable, user-oriented final report for the revision-2 current-v2 stage. It answers what
the ordinary input is, which bounded task slices work, the real source/task/provider/operation denominators, native
execution and skips, failures, cost, human boundaries, remaining issues, and the next safe action. Engineering delivery
and research outcome are separate fields.

The final report is development evidence. A complete stage ledger is not allowed to turn an engineering shortfall or
an unexecuted research chain into a positive result.

## Evidence and implementation contract

`src/skill-ir/skill-family-current-v2-n15.ts` reads all material evidence as Git blobs from the exact N14 evidence
commit. It hashes every bound file and derives the final fields from the parsed reports. The pre-N15 execution status
is also read from that commit, avoiding a mutable-status self-reference when N15 later marks itself terminal.

Before writing the report, the stage runner records current-v2 focused tests, the full TypeScript check, documentation
link unit/full checks, `git diff --check`, tracked cleanliness, and local/origin commit alignment in
`delivery-verification.json`. The strict verifier re-reads this verification file, re-reads every source blob from the
bound evidence commit, and recomputes the final report.

## Public entry points

- `buildCurrentV2N15FinalReport`: validates cross-report denominators and derives the final development decision.
- `writeCurrentV2N15Delivery`: runs delivery checks and writes the verification and final reports once.
- `verifyCurrentV2N15Delivery`: independently rehashes and recomputes the delivery.
- `runN15DeliveryStage`: resumable stage entry that makes N15 terminal without changing protected historical state.

After the N15 implementation commit is pushed, run:

```powershell
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n15
```

A completed result can be strictly reverified with the same command. The files are:

- `results/skill-ir/skill-family-current-v2-source-repair-001/delivery-verification.json`
- `results/skill-ir/skill-family-current-v2-source-repair-001/final-report.json`

## Actual result

The pushed delivery code is `ec4d6a1800ff26d8db9d84b896efa667abf90d34`; the immutable evidence commit is
`53a0601aba430b89f5e5f58d0dec54fb79a3f9d7`. The verification report is 15,864 bytes with SHA-256
`1272771b5b0446da37e46d1bddfebcae92e443305be34bf25b90140ec52f03b4`; the final report is 11,578
bytes with SHA-256 `e07e3c85861a24450bdc2e4d188ee75c9dbf0f427af73ab1eb7ccd2252a4d5d8`. Two independent
`--step=n15` reruns strictly recomputed the report and preserved the digest.

The final decision is `completed-with-engineering-shortfall`. The fixed development panel contains 6 inputs, 3
providers, 47 operations, and 9 tasks: 9 package checks pass, 4 tasks are complete, and 18 required obligations split
into 8 checked/exported plus 10 unresolved. Native consumption is 9 attempted, 4 executed/passed, 5 skipped, and 0
failed/errors. The delivery verification records 83 focused tests, 294 assertions, full typecheck, zero broken or
legacy documentation references, a clean tracked tree, and HEAD/origin alignment.

After the verification file itself was committed, the repository-wide link check initially found the two withdrawn
historical targets quoted inside that immutable command transcript. The report was not rewritten. Those two exact
source-target pairs were added to the retired-reference manifest, so the final scan reports zero broken/legacy links
and eight explicit retired pairs (six historical pairs plus two transcript self-archive pairs).

Research remains `not-executed`: candidate is null, transfer is not assessed, and prospective runs are zero. Project
runtime accounting is source/business/model/paid=`2/0/0/0` plus 17 native loopback calls; development-agent cost and
monetary cost were not measured. Meilisearch's missing total reference, the Bangumi live-source advisory, and the
historical clean-002 archive gap remain explicit limitations.

## Decision and failure behavior

The actual evidence requires `completed-with-engineering-shortfall`: the ordinary deterministic entry, package checker,
native consumer, specified fault detection, and detached replay work, but the fixed N10 capability gate did not pass.
Research remains `not-executed`, not negative. Any missing/mutated evidence, denominator drift, failed delivery command,
invented candidate, protected read, or changed historical result fails report verification. Neither file is overwritten.
