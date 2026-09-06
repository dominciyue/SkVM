# Q1 development annotation package v2 implementation plan

Date: 2026-09-06. Status: complete. Target branch: `skill-ir-aot`.

## Goal

Freeze a directly distributable, machine-verifiable development annotation package before any real annotator session. Preserve the historical v1 schemas and Q1/Q2 snapshots, close the two reproducible contract gaps reported against `cad4926`, and stop before Q3 or participant data collection.

## Boundaries

- No prospective source selection, held-out access, model/API/paid execution, participant session, Q3/Q4, portfolio, or readiness change.
- Do not modify core, DSL, artifact, scorer, historical locks/results, or the frozen Q2 capability claims.
- Remote development sources may be verified at their already frozen commits, but their source bytes are not vendored. Annotators receive commit-pinned read-only views; license restrictions remain authoritative.
- Keep v1 parsers available for historical records. New annotation material uses an explicitly different v2 identity.

## Work sequence

1. Add RED tests reproducing both review findings:
   - dangling or dependency-inconsistent semantic impact;
   - fabricated, jointly omitted, unknown, or version-drifted annotation units.
2. Add the v2 development-package, blank-form, submission, and batch contracts. Bind the package to exact handbook, source-list, capability-profile, and unit-manifest digests. Validate every annotator against the frozen denominator and re-run the existing four-evidence prediction derivation.
3. Freeze all selected development responsibilities into explicit requirement/workflow-step units with source locators, slice boundaries, and dependency edges. Verify local source bytes and the four remote commit-pinned views without copying restricted upstream source into the repository.
4. Add pre-adjudication summaries for overall agreement, per-source agreement, the four-state confusion matrix, and four evidence-dimension disagreements. Preserve raw independent submissions before adjudication.
5. Synchronize the handbook, onboarding guide, README, spec, plan, handoff, decision ledger, and conversation log. Run focused and broad deterministic verification, stage only the explicit whitelist, commit, and push.

## Stop condition

The next review point is a v2 package that can be handed to two real annotators and rejected by machines on denominator or version drift. Do not start those annotations or Q3 in this stage.
