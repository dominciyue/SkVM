# Skill Family Minimum Delivery Stage

Status: `reported` (development-only, 2026-09-11).

This component evaluates the class-scoped responsibility slice
`api-contract-driven-offline-test-construction`. It composes the existing source
loader, duty ledger, operation-input constructor, v2 generator/checker, and
independent coverage checks. It does not claim whole-skill automation, live API
correctness, business-state authority, native-output completion, human savings,
or future-member generalization.

## Frozen Identity

- Stage: `skill-family-minimum-delivery-001`, plan revision `2`.
- Branch: `skill-family-minimum-delivery-001`.
- Implementation commit bound by the manifest: `b29500ca36f36936b8f6cdc44e14e81a3dfe33f2`.
- Final clean reproduction commit: `96e41beacaacfbc7eb91819f9c17e5a699a06397`.
- The historical D1-D9, v1/v2, Q1, readiness, 0/6, and 001/002 records are unchanged.

## Evidence Roles and Contract

Every manifest row has one immutable role:

- `calibration-only`: exposed development material used to test extraction,
  semantic review, accounting, and checker plumbing;
- `development-shadow`: exposed development material run through the candidate
  method before the freeze gate;
- `primary-heldout`: a repository-distinct member selected after the gate;
- `primary-revision`: one separately reported shared revision, when required.

Before construction, each class-scoped obligation is classified as exactly one of
`constructed`, `rejected-with-reason`, `unresolved`, `outside-class`, or
`source-blocked`. `accepted` is an artifact outcome only, and requires an
independent passing checker report. A member marked complete for the class scope
is not thereby complete as a whole skill.

## Actual Result

The machine report is
`results/skill-ir/skill-family-minimum-delivery-20260911/report.json` and the
reproduction report is under its `clean-reproduction/` directory. The final
decision is `insufficient-evidence` because none of the three selected held-out
members had an applicable input and all 98 held-out obligations were not fully
classified. The method itself was ready and frozen before those bodies were read.

| Measure | Result |
|---|---:|
| selected held-out members | 3 |
| repository/owner independence | eligible; distinct repositories and owners; no forks |
| class-scoped duties / obligations | 43 / 98 |
| complete held-out members | 0 |
| obligation dispositions | 0 constructed, 0 rejected, 95 unresolved, 3 outside-class, 0 source-blocked |
| input-qualified members / applicable inputs | 0 / 0 |
| accepted artifacts | 0 |
| independent checker coverage | 1 (vacuous because no artifact was accepted) |
| method/freeze status | `true` / `method-frozen` |
| external accounting | 13 source API calls, 3 model calls, 3 paid calls; 6,165 known input and 15,305 known output tokens; billing unknown |

The result is a complete negative/insufficient denominator record, not a failed
attempt to manufacture a positive. Julia has 8 unresolved obligations, the
ffsshhttiikk OpenAPI member has 56 unresolved plus 1 outside-class obligation, and
Jellyfin has 31 unresolved plus 2 outside-class obligations. The selected reserve
was not read. The original source blocker and source-validity advisories remain
in their first-run records.

## Reproduction

From a short-path detached checkout of the final reproduction commit, with Git
line-ending conversion disabled:

```text
git -c core.longpaths=true -c core.autocrlf=false worktree add --detach D:/fmc96e41be 96e41be
cd /d D:/fmc96e41be
bun install --frozen-lockfile --offline
bun ./scripts/skill-ir/skill-family-minimum-delivery.ts --step=reproduce --out=results/skill-ir/skill-family-minimum-delivery-20260911/clean-reproduction/report.json
```

The clean run used Bun `1.3.14` and reported Node compatibility `24.3.0`; it
returned `passed`, matched semantic snapshot
`12bd1c705a9d9da9f9ae3200029c787fedc9d51dc948779314871114df1ff362`, verified
all evidence and checker bindings, and made zero source/model/paid calls. The
main tree then ran `--step=m6`, which produced the final report.

Two non-authoritative attempts are retained instead of overwritten:

- `clean-attempt-001.json`: the host checkout hit long-path checkout failure and
  nine line-ending-modified historical files;
- `clean-attempt-002.json`: the candidate had captured a CRLF working-tree digest
  for the contract while the clean checkout had committed LF bytes.

The contract was restored to its committed LF bytes, the old decision and
candidate were archived as `decision-pre-clean-001.json` and
`report-candidate-pre-clean-001.json`, and the formal decision/candidate were
regenerated. This preserves both failures and prevents a re-runnable command from
being mistaken for an archived original report.

## Commands and Verification

The development entry point is:

```text
bun ./scripts/skill-ir/skill-family-minimum-delivery.ts --step=status
bun ./scripts/skill-ir/skill-family-minimum-delivery.ts --step=m5
bun ./scripts/skill-ir/skill-family-minimum-delivery.ts --step=m6
```

`--step=m5` computes the decision from the independently read source, selection,
fetch, duty, and checker evidence. `--step=m6` verifies or writes the candidate,
requires a passed clean reproduction, and binds its report digest. The manifest
validator is side-effect free and is shared by the CLI and runner; this avoids a
top-level-await self-import deadlock.

Focused deterministic tests, the repository typecheck, the explicit script
typecheck, and the documentation link checks are recorded in the stage
verification artifact and final handoff. No historical runner was re-run.

## Limits and Recovery

The evidence remains `development`. It does not alter readiness, the original
document-level `0/6`, or any prospective denominator. No new prospective or
held-out input was selected after this stage, and no downloaded skill command was
executed. To resume, read this document, the task plan, the latest
`deadline-execution-status.md` entry, and `stage-manifest.json`, then run the
status command before touching any evidence. Do not replace first-run files or
reinterpret unresolved obligations as rejection or success.

## Successor route

The reported identity is closed. A separate route is registered in
[Skill Family Class Proof and Automation Recovery](../superpowers/plans/2026-09-11-skill-family-class-proof-recovery.md)
under `skill-family-class-proof-002`. It first screens candidates with a deterministic,
model-free eligibility preflight and narrows the measured slice to
`openapi-contract-to-offline-request-specimen`. The successor may read and acquire new
public sources, but it must keep screening, development, primary first-run, and any
revision in separate records. This note does not change the `insufficient-evidence`
decision or reopen this stage.
