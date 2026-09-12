# Current-v2 detached engineering clean replay

## Purpose and boundary

N14 proves that the current development execution chain can be rebuilt and consumed from an exact pushed commit in
a separate detached Git worktree. It is an engineering replay, not a research candidate, prospective run, transfer
result, or new real input. Because N9, N11, and N12 ended `not-executed`, the report binds an
`engineeringCodeCommit` and requires `researchCandidate: null`.

The replay uses only committed development inputs and deterministic loopback fixtures. It does not run the historical
001/002 runner, read held-out or Q1-reserved material, change the historical document-level `0/6`, alter readiness,
or make a claim about live API behavior. Source, business, model, paid, held-out, reserved, and prospective counters
remain zero. Native loopback HTTP calls are counted separately.

## Implementation and runtime

`src/skill-ir/skill-family-current-v2-n14.ts` contains the report builder, detached replay implementation, and strict
archive verifier. `scripts/skill-ir/skill-family-current-v2-clean-replay.ts` is the internal entry used by the detached
checkout. `runN14CleanReplayStage` in the current-v2 stage runner is the resumable outer entry.

The outer entry requires `HEAD` to equal `origin/skill-ir-aot`, creates a new detached worktree outside the repository
with `core.autocrlf=false`, `core.eol=lf`, and long paths enabled, and verifies its exact HEAD, detached state, tracked
cleanliness, and byte equality for every committed baseline. Checkout and output roots must be separate trees.
It then runs `bun install --frozen-lockfile --offline`, creates a no-pip virtual environment, extracts the fixed Python
dependency archive, and verifies every extracted file against the committed manifest.

Inside the clean checkout, the replay performs three independent checks:

1. It rebuilds the four N8 ordinary-entry cases and bundle replay, then compares their normalized semantic fields to
   the committed N8 report.
2. It rebuilds all nine N10 task packages from the committed lock. Every package digest, semantic plan, backend,
   consumer result, source-closure summary, required-obligation state, aggregate denominator, and failure reason is
   compared with the immutable first run.
3. It invokes the N5 Python/pytest consumer directly on emitted package directories. JUnit accounting preserves
   attempted, executed, passed, failed, errors, and skipped as distinct values and separately counts loopback HTTP.

Focused tests and the repository typecheck then run inside the detached checkout. The outer process copies the N8,
N10, native-consumer, task-package, and JUnit bytes into a write-once repository archive. The archive is marked binary
in `.gitattributes` so checkout conversion cannot change the recorded bytes.

## Public entry points

- `summarizeCurrentV2N14NativeConsumer`: checks native JUnit denominator conservation.
- `compareCurrentV2N14TaskRows`: compares full and failure-specific N10 task semantics.
- `buildCurrentV2N14CleanReplayReport`: derives a development-only final decision from bounded evidence.
- `runCurrentV2N14Inside`: performs replay work inside the detached checkout.
- `runCurrentV2N14CleanReplay`: prepares dependencies, invokes the clean checkout, and archives evidence.
- `verifyCurrentV2N14CleanReplay`: rehashes all provenance and archive files, reads baseline bytes from the exact Git
  commit, cross-binds attempt/inside/final summaries, and recomputes the report.

Run N14 from the repository root after its implementation commit has been pushed:

```powershell
bun ./scripts/skill-ir/skill-family-current-v2-prospective.ts --step=n14 `
  --checkout=D:\cv2-n14-<commit>-a1 `
  --output=D:\cv2-n14-output-<commit>-a1 `
  --python-base=D:\anaconda\python.exe `
  --python-archive=D:\skill优化\SkVM-offline-packages\family-current-20260911\python-dependencies.tgz `
  --attempt=1
```

Paths must be absolute, unused, outside the repository, and mutually non-nested. A completed stage can be strictly
reverified by running `--step=n14` again without the path arguments.

## Evidence and verification

The stage writes only under the new identity:

- `clean-replay/attempt-NNN.json`: write-once command, environment, dependency, and outcome transcript.
- `clean-replay/cache/inside-report-attempt-NNN.json`: the report produced inside the detached checkout.
- `clean-replay/archive/attempt-NNN/**`: exact generated packages and native consumer evidence.
- `clean-replay/archive-manifest-attempt-NNN.json`: digest and byte-size inventory for every archived file.
- `clean-replay/report.json`: the final cross-bound engineering replay report, written only after all checks pass.

Focused local verification before the detached run:

```powershell
bun test ./src/skill-ir/skill-family-current-v2-n14.test.ts ./scripts/skill-ir/skill-family-current-v2-prospective.test.ts
bun run typecheck
```

## Failure behavior and claim limits

An attempt file is never overwritten. If preparation, replay, comparison, tests, typecheck, or archiving fails, the
stage remains N14 and records the original command transcript and error. A repair must use a new attempt number and
new external paths; earlier failed evidence remains listed in execution state. The final report cannot be created by
relaxing an oracle, treating a skipped test as a pass, omitting an unresolved reason, or supplying a research commit.

Attempt 1 at engineering commit `54506625f7888df73db347c54f2e7dc82d785e47` reached an internally passing replay
but failed the independent package-binding verifier with `N14_BASELINE_BINDING_MISMATCH:bun.lock`. The detached
Windows checkout had converted the committed LF lock bytes (SHA-256 `1574eee04241e492f4ac3eca0d9e081701be0c4ac0da521bb03e6b408e10f306`)
to CRLF bytes (SHA-256 `2a2b45f7ea2015023be7ff1ceb22e5cf91a51888cb6f12a752d5b80c1681d803`). The
attempt, internal report, complete generated archive, unverified final-report bytes, and strict-verifier failure record
are retained. The revision changes only detached-checkout byte canonicalization and adds a pre-execution Git-blob
comparison; it does not relax any semantic or package oracle.

A passing report means only that the fixed development implementation and evidence reproduce from the bound commit
with the declared offline dependencies. It does not validate live API behavior, the whole API Tester skill, a full
source document, a prospective sample, human agreement, or human-effort savings.

## Actual N14 result

Attempt 2 used engineering commit `b10cdce035890a0134e929f1f9fb23c33325a202` and passed. The final report is
3,569 bytes with SHA-256 `dedb77ccea579556d10e5ad0805ec261406462670bd5b094275e38478e411a57`;
the archive contains 95 files/4,119,563 bytes. N8 reproduced 4/4 cases plus its bundle binding. N10 reproduced all
9 packages and their failure semantics: 4 tasks complete, 18 required obligations, 8 checked/exported, and 10
unresolved. Direct native consumption conserved JUnit denominators at 9 attempted, 4 executed/passed, 0 failed/error,
5 skipped, and 4 loopback HTTP calls. The detached checkout ran 35 focused tests with 104 assertions and a passing
typecheck. Two subsequent strict verifications passed and left the final report digest unchanged.
