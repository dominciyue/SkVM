# Skill Family Class Proof 002

This component is the development-only, recoverable pipeline for the
`openapi-contract-to-offline-request-specimen` class. It keeps class membership,
source-grounded obligations, construction, independent checking, and transfer
decisions as separate records. A local artifact can prove a bounded request
specimen obligation; it does not prove a complete skill, a live API, or
production readiness.

## Entry points

Run from the `SkVM` checkout:

```powershell
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=status
bun ./scripts/skill-ir/skill-family-class-proof.ts --step=resume
```

The command stores all new evidence below
`results/skill-ir/skill-family-class-proof-20260911/`. The status file is
`execution-status.json`; it is the recovery source of truth for the next
unfinished R/E step. Each step is idempotent at the identity level and does not
rewrite an existing first-run report.

## Contract and data flow

The fixed class requires a public OpenAPI/Swagger/JSON API contract locator, an
explicit offline request or test output duty, a coverage locator, two or more
derivable inputs, and semantics that an independent checker can determine
without credentials or a business service. The flow is:

```text
source commit/path -> eligibility -> responsibility/obligation ledger
  -> input -> shared construction -> independent checker -> report
```

`src/skill-ir/skill-family-eligibility.ts` is a pure, model-free preflight.
`src/skill-ir/skill-family-class-construction.ts` remains the shared
constructor/checker profile. The orchestrator records source, model, paid, and
infrastructure accounting independently and never dispatches a model for
eligibility.

## State and roles

The state sequence is `planned -> screening -> development -> capability-ready
-> method-locked -> primary-running -> revised-once|no-revision -> reported
-> extension-running`. A shortfall or implementation issue is retained as
`screening-shortfall`, `method-not-ready`, or `blocked-before-evaluation`.
Screened candidates are not primary results. Primary bodies are read only after
the method lock, and first-run rows are immutable once written.

## Result fields

Machine reports must include `protocolReady`, `inputReady`, `capabilityReady`,
and `transferDecision`, plus member, obligation, input, artifact, checker, and
failure denominators. `bounded-positive` requires three repository-distinct
primary members with two applicable inputs each, at least 90% core obligation
coverage, at least two thirds first-run accepted members, and 100% independent
checker passage. Otherwise the appropriate negative, insufficient, or blocked
decision is retained; no result is promoted by hand.

## Failure and boundary semantics

Unsupported syntax, semantics that cannot be preserved, missing public evidence,
and implementation failures are distinct reasons. Missing `$ref`, authentication
or live-state evidence is not guessed. Meilisearch-style missing references stay
construction blockers; Bangumi-style external response material is an advisory,
not source validity proof. Source-blocked, outside-class, unresolved, rejected,
and checker-failed rows remain in their original denominator.

Historical v1/v2 candidates, the original `0/6`, Q1/held-out material,
readiness, and prior result directories are read-only. No prospective sample is
selected or predicted by this component until a separately locked identity
allows it. Development-agent cost is recorded separately from artifact runtime
cost. Remote GitHub and paid/model calls, when useful, are recorded with their
purpose and returned usage; none are required for the eligibility function.

## Testing and maintenance

Use TDD for code changes. Focused tests are:

```powershell
bun test ./src/skill-ir/skill-family-eligibility.test.ts
bun test ./scripts/skill-ir/skill-family-class-proof.test.ts
bun run typecheck
```

Before a release or handoff, run the relevant class-proof verifier and a clean,
offline replay from the committed evidence directory. Never use the historical
six-source runner as a substitute for this entry point, and never stage the
unrelated untracked historical materials in the repository root.
