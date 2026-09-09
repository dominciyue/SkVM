# Public-Structure Offline Responsibility Family Contract Design

**Date:** 2026-09-10

**Identity:** `skill-ir-public-structure-offline-family-contract-development-001`

**Branch:** `api-tester-operation-unseen-prospective-001`

**Status:** approved by the user-authored continuous-goal specification; development-only while the prospective pre-source push gate is unresolved

## 1. Purpose and boundary

This component makes `public-structure-driven offline conversion and reporting` a falsifiable responsibility family. It classifies complete responsibilities, not whole skills and not isolated syntax features. It must answer three independent questions:

1. Is the responsibility itself inside the family definition?
2. Are public verification and construction evidence sufficient?
3. Does the current frozen SkVM implementation support the required capabilities?

The answers must not be inferred from a successful candidate run. A current implementation failure does not redefine the family, and a family member is not automatically supported. The component is retrospective development research informed by already exposed evidence; it is not a prospective prediction, does not alter Q1/Q2 frozen records, and does not access any pending OpenAPI prospective source, held-out source, or Q1 reserve.

Task 2 remains incomplete until `pre-source-freeze-revision-001.json` is pushed and remotely verified. The continuous-goal specification explicitly permits independent family-definition work while that external gate is blocked. No Task 3 result is assumed; prospective evidence is represented as pending.

## 2. Considered approaches

### A. Extend the existing four-state classifier

This would add family membership and current support to `rules-sufficient-*` states. It reuses code but preserves the ambiguity Task 7 is meant to remove: task nature, evidence sufficiency, and implementation support would still collapse into one value.

### B. Orthogonal responsibility matrix (selected)

Create an additive strict contract with separate criterion classes, evidence dimensions, and current-support dimensions. Provide a deterministic derived assessment and a lossless skill aggregation. Existing classification evidence and API operation evidence are referenced, not rewritten. This is the smallest design that can distinguish the four required layers and fail closed on missing evidence.

### C. Documentation-only taxonomy

This is easy to read but cannot detect missing criteria, unsupported claims, broken locators, contradictory classifications, or aggregation that hides rejected responsibilities. It is insufficient for the requested machine evidence.

## 3. Unit and scope model

The atomic unit is a complete `responsibility` from a frozen skill scope. Each record binds:

- `responsibilityId`, description, source identity, and every direct dependency;
- whether the input structure and output responsibility are explicitly public;
- the construction rules, verification rules, dependency closure, side effects, and external semantic decisions;
- exact source locators for each material claim;
- the current capability requirements and their implementation status;
- counterexamples or an explicit `unverified` marker for every key criterion.

A responsibility cannot be split after classification merely to isolate an easy step. Task 8 will freeze complete responsibility denominators before applying this contract.

## 4. Criterion classes

Every criterion has a stable ID, a question, a class, an epistemic role, an applicability rule, and evidence requirements.

### 4.1 Family-necessary conditions

These define the family independently of SkVM:

- `public-input-structure`: all semantically relevant input structure is public and addressable;
- `explicit-output-responsibility`: the required output facts and permitted variation are explicit;
- `offline-deterministic-transformation`: construction is a finite rule or tool composition over supplied inputs and explicit parameters;
- `public-verification-contract`: conformance can be checked from public inputs/rules without a hidden gold answer;
- `declared-dependency-closure`: required references, templates, tools, and state are named and can be bounded;
- `bounded-side-effects`: effects are absent or limited to declared local outputs;
- `no-unbound-semantic-decision`: every business/expert/user choice is either absent or supplied as an explicit input parameter.

Failure of a family-necessary condition yields `out-of-family`; missing proof yields `family-membership-unknown`. Neither result says anything about whether a bespoke model or human workflow could perform the work.

### 4.2 Evidence sufficiency dimensions

The assessment separately derives:

- `verifiability`: `verifiable | not-verifiable | unknown`;
- `constructibility`: `constructible | not-constructible | unknown`;
- `sourceValidity`: `valid | advisory | blocked | unknown`;
- `dependencyClosure`: `closed | open | unknown`.

Knowing how to verify never implies knowing how to construct. Alternative-valid outputs are allowed when the public checker accepts the permitted equivalence class. A source defect can block one responsibility without redefining the family or all sibling responsibilities.

### 4.3 Current engineering support

Current support is derived only after family and evidence assessment:

- `supported`: every required capability is implemented, current-tested, and declared for new inputs;
- `missing`: rules are sufficient but at least one required capability is not supported;
- `not-assessable`: family membership, construction evidence, or dependencies are unknown/open;
- `not-applicable`: the responsibility is out of family.

Capability evidence must name existing implementation and validation evidence. An operation, parser, or runtime primitive merely existing is insufficient.

### 4.4 Criterion role

Each criterion is tagged as one of:

- `necessary-family-condition`;
- `current-engineering-limit`;
- `unverified-hypothesis`.

The machine validator rejects using a current engineering limit to define family membership, and rejects an unverified hypothesis presented as a satisfied necessary condition.

The initial matrix has exactly nine criteria: the seven family-necessary IDs above, `current-capability-readiness` as the current engineering limit, and `cross-repository-generalization` as the explicitly unverified hypothesis.

## 5. Failure attribution

Failure attribution is multi-valued and locator-backed:

- `rule-insufficient`;
- `verification-evidence-missing`;
- `construction-evidence-missing`;
- `capability-missing`;
- `source-defect`;
- `dependency-open`;
- `external-semantic-decision`;
- `environment-limit`;
- `implementation-failure`.

The first observed reason is never treated as the complete gap set. `source-defect`, `capability-missing`, and `environment-limit` cannot be rewritten as “this family is not automatable.”

## 6. Skill aggregation

Skill-level output is lossless and denominator-preserving:

- `all`: every scoped responsibility is in-family;
- `mixed`: at least one is in-family and at least one is out-of-family;
- `none`: every complete scoped responsibility is out-of-family;
- `incomplete`: at least one responsibility is missing or membership remains unknown.

The aggregate reports counts for total responsibilities, in-family, out-of-family, unknown, verifiable, constructible, current-supported, and each failure attribution. It never labels a mixed skill “automated” merely because one accepted responsibility produced an artifact.

## 7. Initial evidence and counterexamples

The initial matrix uses only already exposed project evidence:

- positive: public JSON key enumeration, sort/deduplicate, and declared JSON output;
- current-capability boundary: Conventional Commit snapshot-to-changelog rules can be public and constructible while the current backend/checker composition is missing;
- semantic-decision boundary: PDF field extraction may be verifiable while natural-language-to-field mapping remains an external semantic choice;
- information boundary: OpenAPI design-first resource/auth/error policy is not constructible without public policy inputs;
- source-defect boundary: Meilisearch `GET /tasks` has a missing local parameter reference;
- advisory boundary: Bangumi external response references affect source validity but are not v2 construction obligations;
- mechanism boundary: API operation projection can be constructible while independent dependency verification is still required to make the verified-artifact claim.

Every example records whether it is a positive, near-boundary counterexample, or unverified case. Prospective results remain `pending-not-observed` and cannot be cited as family evidence.

## 8. Artifacts and interfaces

Additive deliverables:

- `src/benchmarks/skill-ir/public-structure-offline-family-contract.ts`: strict schemas, derivation, aggregation, evidence-locator verification;
- `src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts`: TDD for orthogonality, missing evidence, contradiction, dependency propagation, mixed aggregation, and tamper rejection;
- `benchmarks/skill-ir/classification/public-structure-offline-family-contract-v1.json`: criterion and evidence matrix;
- `benchmarks/skill-ir/classification/public-structure-offline-family-counterexamples-v1.json`: counterexample registry;
- `docs/skill-ir/public-structure-offline-family-contract.md`: component guide and current claims/limits.

The implementation remains independent of the API candidate and does not import a candidate runner. It may reuse canonical hashing and strict-schema patterns but not observed prospective results.

## 9. Verification and stop conditions

TDD must first demonstrate that the existing one-dimensional status cannot represent: verifiable-but-not-constructible, constructible-but-currently-unsupported, source-defect-with-supported-siblings, and mixed-skill aggregation. The new validator must reject:

- missing/duplicate criterion IDs;
- a necessary condition without evidence;
- a current implementation fact used as family membership;
- `verifiable` inferred from candidate success;
- `constructible` with an unbound semantic choice;
- `supported` with a missing/new-input-unready capability;
- omitted responsibility or dependency cycle;
- broken source locator or source digest;
- skill aggregation that drops out-of-family or unknown responsibilities.

Focused tests, typecheck, documentation link checks, source-reference verification, and exact staging are required before the Task 7 checkpoint. Any contradiction with the frozen classification handbooks is a design blocker; any pending prospective claim remains explicitly unavailable rather than guessed.

## 10. Claims allowed after Task 7

Task 7 may claim that the project has a falsifiable, machine-checked responsibility-family definition and can distinguish family membership, evidence sufficiency, and current support on already exposed examples. It may not claim ecosystem prevalence, unseen-input success, new-skill automatic onboarding, real API correctness, human savings, or readiness.
