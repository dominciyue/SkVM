# Skill Family Minimum Delivery Stage

Status: `planned-not-started`.

This document describes the stage runner and evidence contract planned in
[the implementation plan](../superpowers/plans/2026-09-11-skill-family-minimum-delivery.md).
It does not claim that calibration, shadow, freeze-gate, or held-out execution has run.

## Purpose

The stage evaluates the class-scoped responsibility slice
`api-contract-driven-offline-test-construction`. It composes the existing skill loader,
source-grounded mapping, operation-input constructors, production bindings, and
independent checkers. Whole-skill behavior, live API correctness, business state, and
human-effort savings remain outside this component.

## Evidence Roles

Every manifest row has one immutable role:

- `calibration-only`: exposed development material used to test extraction, semantic review,
  obligation accounting, and checker plumbing;
- `development-shadow`: exposed development material run through the candidate method before
  the freeze gate; a repair is kept in a separate revision;
- `primary-heldout`: a repository-distinct member selected after the freeze gate; its first
  run is the primary transfer result;
- `primary-revision`: one optional shared revision after the primary first run.

Rows cannot change roles after construction. A repaired development row is never relabeled
as held-out.

## Obligation Contract

Before construction, every class-scoped duty and obligation has exactly one disposition:

`constructed`, `rejected-with-reason`, `unresolved`, `outside-class`, or `source-blocked`.

`accepted` describes an artifact, not an obligation. An accepted artifact is valid only when
an independent checker result is present. Profile-specific values such as
`not-fully-verified` or `not-implemented-by-profile` remain unresolved evidence and cannot
be counted as accepted.

## Planned Runtime Flow

The planned runner will move through these states:

`planned -> calibrating -> shadow -> gate-ready -> method-frozen -> heldout-running -> revised-once | no-revision -> reported`.

Calibration and shadow failures move to `method-not-ready`; acquisition or infrastructure
failures before a fair run move to `blocked-before-evaluation`; an insufficient input or
source denominator moves to `insufficient-evidence`.

The runner will record, per member and per input:

- source identity and locator status;
- duty and obligation dispositions before artifact counts;
- construction and checker results;
- first-run versus revision status;
- source/API/model/paid calls, known tokens, unknown billing, and unmeasured agent cost;
- repository-specific adaptation and reproduction commit.

## Planned Inputs and Outputs

The implementation plan reserves these paths under one stage directory:

```text
results/skill-ir/skill-family-minimum-delivery-20260911/
  stage-manifest.json
  calibration/
  shadow-first-run/
  shadow-revision-1/
  freeze-gate.json
  heldout-selection.json
  heldout-first-run/
  revision-1/
  report.json
```

The runner must fail closed for duplicate IDs, missing source locators, unclassified
obligations, accepted rows without checker evidence, role changes, and repository-specific
dispatch. It must never derive a denominator from accepted rows alone.

## Verification and Limits

Implementation will use focused deterministic tests first, then the project typecheck,
documentation checks, and one clean-checkout reproduction. Historical results and untracked
experiment materials are not rewritten. A positive result is bounded to the documented
responsibility slice; a complete calibration/shadow result with `method-not-ready` is a valid
intermediate delivery and does not imply that the class is impossible to automate.
