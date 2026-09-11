# API Tester Delivery Verification Retry

This is an additive record of the 2026-09-12 retry of the historical API Tester
delivery verifier. It does not replace the frozen delivery report or restore the
missing `api-tester-operation-dependency-verification-revision-clean-002/report.json`.

## Reproduction

Use the detached checkout at commit `65216d878760f7fac3bd561fed9443a2f3b20d22`
with the candidate binding at `3ebe60613bab0375047fcb51337d35b3c1830430`.
Install dependencies offline, then run:

```text
bun install --frozen-lockfile --offline
bun ./src/skill-ir/api-tester-operation-delivery-report-run.ts --mode=verify --root=. --node=C:/Program Files/nodejs/node.exe --git=C:/Program Files/Git/cmd/git.exe
```

The verifier process must use `core.autocrlf=true`, matching the Windows byte
materialization used when the archived candidate metadata was written. In the
temporary checkout, the filtered bytes for `package.json` and `bun.lock` were
materialized before the command. The command returned:

```json
{"status":"verified","candidateCommit":"3ebe60613bab0375047fcb51337d35b3c1830430","prospectiveRuns":0,"portableSemanticSha256":"f423485bf08cbbe53908d82df5b0d09a8adab3b1072184e1736cae7dfe7f3177"}
```

The machine-readable record is
`results/skill-ir/api-tester-operation-delivery-freeze-retry-20260912.json`.

## Interpretation

The earlier default-worktree failure (`candidate commit blob mismatch:
package.json`) is a line-ending materialization mismatch, not evidence that the
candidate bytes or semantic report changed. The exact candidate checkout cannot
run this verifier because the verifier was added in the later archive commit;
that fact is retained in the retry record. No frozen report, candidate binding,
readiness value, or historical result was modified.

Automatic platform safety and audit controls are not disabled. No external audit
service, model call, remote API, or paid call was used by this retry.
