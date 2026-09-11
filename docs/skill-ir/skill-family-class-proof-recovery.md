# Class-Proof Recovery Manual

This manual is for the development identity `skill-family-class-proof-002`.
It describes how to resume the bounded
`openapi-contract-to-offline-request-specimen` class proof without changing
historical results, the v2 support contract, readiness, or prospective scope.

## Start

Run from the `SkVM` checkout on branch `skill-ir-aot`:

```powershell
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=resume
```

The durable status file is
`results/skill-ir/skill-family-class-proof-20260911/execution-status.json`.
The first unfinished extension task is selected from its `extensions` map.
Completed or `not-applicable` tasks are reused; a `blocked` task stops the
queue. Reports are write-once, so a failed attempt receives an `attempt-*`
name and is never replaced by a later repair.

## Evidence navigation

- R0-R12: `docs/superpowers/plans/2026-09-11-skill-family-class-proof-recovery.md`
- Component contract: `docs/skill-ir/skill-family-class-proof-002.md`
- Result index: `docs/skill-ir/skill-family-current-results.md`
- Extension reports: `extension-e1.json` through `extension-e6.json`
- Clean replay: `clean-replay.json`
- Invalid E2 attempt retained as `extension-e2-attempt-001.json` and
  `extension-runs/e2-attempt-001/`

Direct task commands are available for diagnosis:

```powershell
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=extension-e1
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=extension-e2
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=extension-e3
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=extension-e4
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=extension-e5
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=extension-e6
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=extension-clean-replay --out=<offline-extension-report.json>
```

`extension-e2` uses only screened eligible bodies, one member per repository,
and the two locked development inputs. `extension-e5` uses labelled synthetic
representations; its derived inputs never increase a real-sample denominator.

## Clean replay

Use a detached checkout at the committed implementation and install only the
lockfile dependencies:

```powershell
bun install --frozen-lockfile --offline
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=clean-replay --out=<offline-report.json>
```

Record the checkout commit, Bun/Node versions, input and evidence digests, and
external call counts. A replay failure is evidence to preserve, not a reason to
relax a checker or edit an earlier report.

`extension-clean-replay` is the extension-specific offline check. It independently
verifies each committed E2 run with the checker, validates E5 totals, and calls
`resume`; a clean result must report ten verified runs, zero failures, and no
newly executed extension task.

The post-archive clean result is committed at
`results/skill-ir/skill-family-class-proof-20260911/extension-clean-replay.json`.
It was produced from detached commit
`aa57d74910be5ab09e175d9cd507ed897d0b9e92` (`D:\cp-clean-ext-aa57d74`) with
Bun `1.3.14`, Node `v24.3.0`, and the offline lockfile install. Its SHA-256 is
`72f3adf8226ae7d91c6e9d43203fe958f6b568f45c1314b0a04e41f8690110e7`; the
report says `pass`, `10/10` E2 runs, `18/18` E5 cases, and zero external
model/API/paid calls. The external copy
`D:\cp-clean-ext-report-aa57d74.json` is retained as the run output.

The final status-bound commit `9d95faa742978579ccd0ae24b68c990d1b1ba69e`
was replayed separately from `D:\cp-clean-ext-9d95faa`. Its supplemental
report is `results/skill-ir/skill-family-class-proof-20260911/extension-clean-replay-final.json`
(SHA-256
`f7c284a0a52d6411ac5f9dc62ce85265b6f4925ab354c34980cfdfa32f34bea4`), while
the raw output remains at `D:\cp-clean-ext-report-9d95faa.json`. It also
returned `pass` with 10/10 E2 runs, 18/18 E5 cases, and zero external calls.

## Boundaries

Meilisearch missing references remain construction blockers. Bangumi external
response material remains a source-validity advisory and is not proof of source
validity. A local operation or artifact passing does not prove a complete
document, a whole skill, or live API behavior. The historical API Tester `0/6`,
readiness, Q1/held-out isolation, and all frozen v1/v2 execution surfaces stay
unchanged. Do not select or read unseen inputs, start a prospective run, or
write predictions from this manual; those require a separately locked identity
and pre-registered design.

## Verification

After a repair, run the focused suites and typecheck before committing:

```powershell
bun test ./src/skill-ir/skill-family-class-proof-extension.test.ts
bun test ./scripts/skill-ir/skill-family-class-proof.test.ts
bun run typecheck
```

Keep source API, model, paid, runtime, and development-agent accounting
separate in every report. Do not add unrelated historical files to a commit.
