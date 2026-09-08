# API Tester operation admission and validation design

Date: 2026-09-09

Status: approved for local development, verification, reports, documentation, and commits

## Decision

Build an additive operation-level development pipeline over exactly the six already-exposed v2 migration documents. It independently enumerates every source operation, derives a dependency-preserving projection per operation, uses the unchanged v2 contract as the admission oracle, aggregates accepted projections by source document, and runs the unchanged v2 generator/checker. A second identity reads the first report and validates representation invariance, fault detection, and offline clean-checkout reproduction.

The identities are:

- Task 1: `skill-ir-api-tester-operation-admission-development-001`;
- Task 2: `skill-ir-api-tester-operation-validation-development-001`;
- combined closeout: `skill-ir-api-tester-operation-development-001`.

## Layer boundaries

1. `operation-source` parses JSON/YAML with duplicate-key detection, enumerates standard HTTP methods, records source locators and dependency facts, and creates projections. It never calls the constructor.
2. `operation-admission` audits every target dependency for all locatable gaps, then calls the unchanged v2 builder on the target projection. `accepted` requires the builder to return exactly one matching operation.
3. `operation-coverage` independently reparses raw bytes and establishes the operation universe. It does not accept a constructor list as input authority and separately compares analyzer, projection, contract, and artifact endpoint sets.
4. `operation-development` binds the six source/license digests, performs Task 1, aggregates accepted operations per document, and calls the existing v2 package/generator/checker. It writes compact machine evidence and portable artifact closure without vendoring original OpenAPI bytes.
5. `operation-validation` strict-reads Task 1 evidence, chooses the positive or all-negative branch, applies preregistered transformations and fault injections, and records a clean-checkout offline reproduction.

## Dependency-preserving projection

A projection retains the original OpenAPI version, info and operation-relevant top-level metadata, components, top-level security, and one path item. The path item retains path-level metadata and exactly one operation. Path-level and operation-level parameters are resolved by `(in,name)` with operation override taking precedence; their origin remains in the dependency ledger even when the effective array is lowered onto the operation for compatibility with the v2 builder. The full target operation, including request body, responses, callbacks and security override, is preserved. A dependency that cannot be resolved or safely represented closes admission rather than being guessed.

All accepted operations for one document are then merged into one aggregate projection using the same rules. This keeps package count bounded while the coverage gate still reasons over individual operations.

## Diagnostics

Each operation has a complete diagnostics array, with stable code, category, locator, message and evidence source. Categories are:

- `unsupported-syntax`: malformed or explicitly unsupported structural syntax;
- `semantics-not-preserved`: the projection/current contract cannot prove equivalent inherited, reference, security, request or response meaning;
- `missing-public-construction-evidence`: public constraints exist but v2 has no deterministic construction/checking basis;
- `implementation-failure`: an unexpected parser, projection, package, generator, checker or report failure.

The unchanged v2 exception is recorded as `firstObservedRejection` and marked `completeGapSet=false`. It can corroborate a diagnostic but cannot erase later findings.

## Task 1 result rules

For every source, the report separates `enumerationComplete`, `operationCount`, `acceptedCount`, `constructedCount`, `checkerPassOperationCount`, `coverage`, `artifactCorrectness`, and `contractObligationCoverage`. A document is never labelled successful when some operations remain rejected or unresolved. If no real operation is accepted, the report is an honest complete negative result.

The runtime writes only derived normalized contracts, packages, plans, reports, validation reports and compact metadata. Original source and license bytes stay in the digest-bound external cache.

## Task 2 branch and relations

The branch is derived from the strict Task 1 report:

- at least one real operation constructed and checker-passed: validate all applicable positive transformations and inject coverage/dependency/artifact faults against real accepted operations;
- zero real checker-pass operations with complete enumeration/diagnostics: validate stable enumeration/rejection behavior and use a labelled synthetic positive only for checker mutation tests;
- correctness defect in enumeration or dependency preservation: preserve the failing evidence, add a RED regression and repair before any reliability claim; if not repairable, mark blocked.

Every derivative binds the parent SHA-256, transform type and parameters. Applicability and expected comparison fields are declared before execution. Byte SHA-256 must change; operation keys, admission status, normalized contract semantics and coverage must remain equal where the transform is semantics-preserving. Adding an unrelated unsupported operation may add one rejection while leaving prior accepted operations unchanged. Local-ref/inline comparison is only allowed when the resolver proves exact target equivalence.

## Clean reproduction

Create a clean checkout at the Task 1 commit, install the exact `bun.lock` dependency graph in offline mode from local cache, pass the same external-cache root, run the Task 1 CLI into a fresh output, and compare a portable semantic digest that excludes timestamps, local paths and measured durations. Record checkout commit, input manifest digest, Bun/Node/OS, install command/result, run command/result and artifact/checker digests.

## Protected boundary

Do not modify the v1/v2 product implementation, candidate, 001/002 inputs, predictions, locks or reports. Do not start prospective, read held-out/Q1 reserved material, enter a second profile/Q4, change readiness/portfolio, call a model/API/paid service, or claim human savings/ecosystem acceptance. Derived inputs are not new real samples and local operation success is not real API behavior validation.
