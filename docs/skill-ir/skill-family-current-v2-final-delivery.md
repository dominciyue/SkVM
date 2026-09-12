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

## Decision and failure behavior

The actual evidence requires `completed-with-engineering-shortfall`: the ordinary deterministic entry, package checker,
native consumer, specified fault detection, and detached replay work, but the fixed N10 capability gate did not pass.
Research remains `not-executed`, not negative. Any missing/mutated evidence, denominator drift, failed delivery command,
invented candidate, protected read, or changed historical result fails report verification. Neither file is overwritten.
