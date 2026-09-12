# Current-v2 clean-002 archive recovery

## Purpose and boundary

N6 performs one bounded maintenance search for the historical
`api-tester-operation-dependency-verification-revision-clean-002/report.json` bytes whose recorded SHA-256 is
`c4399a8a1fa5249b9061728105f08c65cad5e97d20dd9f68c9d24631910573d6`.
It does not rerun the historical experiment, replace the old digest, change the old verifier, or treat later
`clean-003` evidence as the missing original.

The search is intentionally limited to the exact relative path in known Git worktrees, exact-path history and
named objects reachable from local refs, and a fixed list of known delivery archives. A Git object is inspected
only when an exact-path query supplies its commit or object identifier. Whole-disk searches, arbitrary filename
searches, and all-remote enumeration are excluded.

## Implementation and runtime

`src/skill-ir/skill-family-current-v2-n6.ts` provides the pure report builder, the one-shot search writer, and an
independent verifier. The writer records command arguments, output, exit status, every worktree root and exact
candidate path, every inspected object, and every known archive binding in a write-once transcript. The report
is derived from that transcript. Only bytes matching the historical SHA-256 produce `recovered-exact`; when a
match exists, the bytes are copied into the new development identity before the result is accepted.

The verifier re-reads the bound transcript, rechecks tracked known-archive bytes, checks any recovered copy, and
recomputes the report and semantic digest. A path or digest mention alone is never a recovery result.

The stage runner is integrated into
`scripts/skill-ir/skill-family-current-v2-prospective.ts`. It requires the code and prior N4 evidence to be pushed
and unchanged before the one-shot search. An interrupted run can reuse already written, valid N6 evidence instead
of overwriting it.

## Public entry points

- `buildCurrentV2N6ArchiveSearch`: validates a transcript and derives the bounded decision.
- `writeCurrentV2N6ArchiveSearch`: executes and archives the bounded local search.
- `verifyCurrentV2N6ArchiveSearch`: independently validates report bindings and recomputes the decision.
- `runN6ArchiveRecoveryStage`: advances the revision-2 execution state from N6 to N14.

Run from the repository root after the N6 implementation commit is pushed:

```powershell
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n6
```

An optional `--searched-at=<ISO timestamp>` is available for deterministic test or replay metadata. The runtime
makes no source, business, model, or paid API calls.

## Evidence and verification

The stage writes:

- `results/skill-ir/skill-family-current-v2-source-repair-001/archive-recovery/cache/search-transcript.json`
- `results/skill-ir/skill-family-current-v2-source-repair-001/archive-recovery/clean-002-search.json`
- `results/skill-ir/skill-family-current-v2-source-repair-001/archive-recovery/recovered-clean-002-report.json`
  only when exact bytes are found

The one authorized search from code commit `9532e9a04fd0feed2317d66dc65bf61f9108b9b1` checked 21 known worktree
roots, 0 exact-path history commits, 0 exact named objects, and 8/8 present known archives. Three archives mention
the historical path and digest, but none has matching bytes. The decision is therefore
`not-recovered-within-search-scope`; the report SHA-256 is
`14094e41d837e667ec96d5da99b9338879a92fb49bd2510ef9ab100bd34e70b9`. Two strict re-verifications passed and
left both the transcript and report hashes unchanged.

Focused verification:

```powershell
bun test ./src/skill-ir/skill-family-current-v2-n6.test.ts ./scripts/skill-ir/skill-family-current-v2-prospective.test.ts
bun run typecheck
```

## Failure modes and future changes

Any failed bounded Git inventory command fails closed. Missing exact files are valid search outcomes. A clue-directed
object read may fail and remains recorded, but cannot be counted as a digest match. A bounded miss is reported as
`not-recovered-within-search-scope`; it is not a claim that future recovery is impossible. N6 is closed after one
valid result and should only be repeated under a new identity if a genuinely new, specific archive clue appears.
