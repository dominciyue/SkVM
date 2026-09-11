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
