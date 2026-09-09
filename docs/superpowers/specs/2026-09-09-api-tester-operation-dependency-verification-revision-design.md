# API Tester operation dependency-verification revision design

Date: 2026-09-09

Status: approved by the user for local development, verification, documentation, reports, and commits

## Decision and identity

Repair the additive operation-level dependency verifier without changing the frozen v1/v2 product surface or the immutable Task 1/Task 2 evidence. The new validation identity is `skill-ir-api-tester-operation-dependency-verification-revision-development-001`; its result directory is `results/skill-ir/api-tester-operation-dependency-verification-revision-development-001`.

The review baseline is commit `d2e748868a3c5e88b49cb940d4cd495f7b4dcf68`. The revision report binds that baseline, the old Task 1 report, the repaired implementation files, the six already-exposed source digests, and a fresh replay from one explicit revision commit. It records the pre-fix false-pass observations rather than rewriting the old nine-fault report.

## Confirmed defect

The old verifier expands only a pure top-level `$ref`, compares only first-level referenced targets, omits response references from the relevant set, and compares effective security requirement arrays without comparing named security-scheme definitions. Consequently it falsely passes:

1. a response component schema changed from `type: string` to `type: integer`;
2. a schema referenced inside a parameter target changed from `minimum: 1` to `minimum: 99`;
3. an unchanged security requirement name whose `apiKey` header `name` changed.

An unchanged dependency-preserving projection remains the positive control.

## Independent dependency graph

The verifier derives roots itself from the source and projected documents for the requested operation. It never accepts the constructor's reference inventory as the universe.

Roots are effective path/operation parameters, request body, responses, and effective security. For parameters, OpenAPI `(in,name)` override is applied before comparison. For security, operation-level `security` overrides global security, including an explicit empty array; every named effective scheme also becomes a dependency root.

For each root the verifier walks every nested `$ref`. A local JSON Pointer becomes a graph node containing its pointer and canonical raw target value. References inside that target add graph edges and further nodes. A visited-pointer set handles shared targets and cycles without infinite expansion; equality compares the reachable node/edge facts and canonical target values. Missing, external, malformed, and non-string references are recorded explicitly and never guessed.

## Three result dimensions

The dependency report separates:

- `projectionPreservation`: whether operation roots and every reachable dependency have the same semantics in source and projection;
- `constructionObligations`: whether dependencies required by the unchanged v2 construction contract are valid and preserved;
- `sourceValidity`: whether encountered dependency references are locally resolvable and structurally valid.

Parameter, request, and effective-security dependencies are construction obligations. Response payload dependencies are not v2 construction obligations, but they remain projection-preservation roots: a response component drift must fail preservation even when it does not add a v2 construction obligation. A source-validity issue on a non-construction response dependency is reported without pretending that the v2 constructor needs the payload. A source-validity issue on a construction dependency blocks construction. Existing coarse error codes remain for compatibility; the report also contains locator-bound source issues and per-dimension checks.

## TDD and validation evidence

Before implementation, focused tests must demonstrate all three false passes at the review baseline. The minimal implementation then makes each mutation fail at the intended dependency layer while the unchanged control passes. Additional tests cover shared targets and a recursive reference cycle, so the closure algorithm cannot regress to one-level expansion or unbounded recursion.

The new machine report contains:

- four preregistered observations: one unchanged control plus the three confirmed baseline misses, with old and repaired outcomes;
- a fresh replay of the same six source documents using the repaired verifier and unchanged v2 generator/checker;
- comparisons derived from the old and fresh reports for operation universe, admission, dependency verification, checker-pass counts, and obligation coverage; no expected real-operation count is hard-coded;
- the retained Meilisearch `GET /tasks` missing `#/components/parameters/total` source blocker;
- runtime model/API/paid counts separate from development-agent usage;
- one clean-checkout offline reproduction of this revision and a portable semantic comparison with the main replay.

The revision is reliable only if every injected mutation is detected at the dependency verifier, the unchanged control passes, both old and fresh reports verify strictly, every comparison field is explicitly reported, and the clean replay matches. Any count change is retained and explained rather than forced back to `112`.

## Protected boundary and claim ceiling

Do not change the v1/v2 candidate, parser/builder/generator/checker support surface, 001/002 inputs, predictions, locks, reports, old operation reports, portfolio, or readiness. Do not start prospective, read held-out/Q1 reserved sources, enter a second profile/Q4, or call a model, network API, or paid service. The six source bytes remain the only real development inputs. Local operation evidence does not establish whole-document success, arbitrary OpenAPI support, real API behavior, human savings, ecosystem admission, or readiness.
