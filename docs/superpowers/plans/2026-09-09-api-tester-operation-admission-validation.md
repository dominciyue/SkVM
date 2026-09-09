# API Tester Operation Admission and Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, superpowers:test-driven-development, and superpowers:verification-before-completion to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user already selected inline execution in this continuous goal; do not pause between Task 1 and Task 2.

**Goal:** Explain admission for every operation in the six exposed v2 migration documents, construct and independently check every admitted operation without silent omission, then validate metamorphic stability, fault detection, and clean offline reproduction.

**Architecture:** Keep the frozen v2 implementation byte-identical. Add independent source-enumeration, operation-projection, admission, coverage, development-runner, and validation modules. The Task 2 runner strict-reads Task 1 evidence and selects its branch from actual counts.

**Tech Stack:** TypeScript, Bun tests/runtime, Zod, YAML CST parsing with duplicate-key checks, existing API Tester v2 artifact generator/checker, SHA-256, clean Git worktree.

---

## File map

- `src/skill-ir/api-tester-operation-source.ts`: strict source parser, operation/dependency inventory, single/aggregate projections.
- `src/skill-ir/api-tester-operation-coverage.ts`: independent raw-source universe and coverage/dependency comparison.
- `src/skill-ir/api-tester-operation-admission.ts`: exhaustive findings plus unchanged v2 admission oracle.
- `src/skill-ir/api-tester-operation-development.ts`: six-source binding, artifact construction, Task 1 report and portable digest.
- `src/skill-ir/api-tester-operation-development-run.ts`: Task 1 CLI.
- `src/skill-ir/api-tester-operation-validation.ts`: transformations, fault injections, reproduction evidence, Task 2/combined reports.
- `src/skill-ir/api-tester-operation-validation-run.ts`: Task 2 CLI.
- matching `*.test.ts` files: focused RED/GREEN contracts.
- `benchmarks/skill-ir/pilots/api-tester/operation-admission-development-001/development-contract.json`: additive source/result/accounting contract.
- `results/skill-ir/api-tester-operation-*/report.json`: machine evidence.
- `docs/skill-ir/api-tester-operation-admission.md`: component/runtime/verification guide.
- `docs/skill-ir/api-tester-operation-development-status.md`: concise recovery checkpoint.

### Task 1: Source universe and dependency projection

**Files:** create `api-tester-operation-source.test.ts` and, after RED, `api-tester-operation-source.ts`.

- [x] Write tests using JSON/YAML fixtures that require exact operation keys/locators, duplicate-key and path-item-ref unresolved results, effective path/operation parameter override, inherited/overridden security, request/response/ref inventory, and dependency-preserving projection.
- [x] Run `bun test ./src/skill-ir/api-tester-operation-source.test.ts`; expect module-not-found.
- [x] Implement strict parsing and these public types/functions:

```ts
type OperationKey = `${Uppercase<HttpMethod>} ${string}`;
type EnumerationResult = { complete: boolean; operations: SourceOperation[]; unresolved: SourceIssue[] };
function enumerateApiTesterOperations(text: string, format: "json" | "yaml"): EnumerationResult;
function projectApiTesterOperation(document: unknown, key: OperationKey): OperationProjection;
function aggregateApiTesterOperations(document: unknown, keys: OperationKey[]): OperationProjection;
```

- [x] Run the focused test and existing v2 contract test; expect pass.
- [x] Commit the source/projection layer with its test and component-doc update.

### Task 2: Admission findings and independent coverage

**Files:** create `api-tester-operation-admission.test.ts`, `api-tester-operation-coverage.test.ts`; then create corresponding implementation files.

- [x] Write RED tests for multiple simultaneous findings, all four categories, first rejection marked incomplete, accepted projection exactly one operation, omission, duplicate, parameter/ref/security loss, summary drift and false acceptance.
- [x] Run both tests; observed the expected missing-module failures.
- [x] Implement:

```ts
type AdmissionFinding = { code: string; category: FindingCategory; locator: string; message: string };
function analyzeApiTesterOperation(input: AnalyzeInput): OperationAdmission;
function independentlyEnumerateApiTesterOperations(text: string, format: "json" | "yaml"): CoverageUniverse;
function verifyApiTesterOperationCoverage(input: CoverageInput): CoverageReport;
function verifyApiTesterProjectionDependencies(input: DependencyInput): DependencyReport;
```

- [x] Keep the coverage module independent from the admission analyzer and constructor-provided universe.
- [x] Run focused plus v2 parser tests; 17 tests and 76 assertions passed; typecheck passed. Commit.

### Task 3: Task 1 six-document runner and report

**Files:** create development contract JSON, `api-tester-operation-development.test.ts`, then development implementation/CLI and Task 1 result.

- [x] RED-test exact six-row identity/digests, no forbidden source ids, complete operation conservation, report schema, accepted/constructed/checker count inequalities, separate coverage/artifact gates, zero runtime calls, and no absolute cache paths.
- [x] Run the test; observed missing development module/report, then missing strict report verifier, before each GREEN implementation.
- [x] Implement the runner: verify selection/002 evidence and source/license bytes; enumerate/analyze all operations; aggregate admitted operations per document; run existing v2 artifact pipeline; copy only derived artifact closure; independently verify coverage; write report with exclusive create.
- [x] Execute against `D:/skill优化/.tmp-api-v2-feature-migration-20260908` and retain every rejection/revision record. Attempts 1 and 2 remain digest-bound beside the final result.
- [x] Strict-parse the report, six inventories and five artifact closures; run regression/docs/diff/frozen-digest checks; commit Task 1 as `f92e8a1`.

### Task 4: Task 2 transformations and fault detection

**Files:** create `api-tester-operation-validation.test.ts`, then validation implementation/CLI.

- [x] RED-test branch selection from actual Task 1 counts; no caller override is allowed.
- [x] RED-test preregistration, changed byte digest and semantic comparison for key/path/operation reorder, formatting, JSON/YAML, description, added unsupported operation and local-ref/inline; require typed non-applicability.
- [x] RED-test omission/duplicate/dependency/security/summary/false-acceptance and checker endpoint/witness tampering with expected detector layer/code.
- [x] Run focused validation test; observed the missing module RED.
- [x] Implement deterministic transformations and injections without source-id/path success branches; reuse Task 1 evidence when already sufficient.
- [x] Run focused tests. Real object-order runs exposed fail-fast message key-order drift; a RED regression now compares stable rejection code plus full findings, and all six real rows pass.
- [x] After independent read-only review, add RED tampering cases and bind transform state/comparison fields plus fault detector layer/code to the implementation registries.

### Task 5: Clean offline reproduction and combined closeout

**Files:** update validation runner/report, combined report, docs/status/ledgers.

- [x] Strict-read the Task 1 commit/report and verify all evidence digests before validation.
- [x] Create a clean Git worktree at the Task 1 commit, run locked offline dependency installation, then run Task 1 CLI against the same digest-bound external cache into a fresh result.
- [x] Compare portable semantic digests, source coverage, admitted/constructed/checker counts, and artifact program/checker digests; record environment separately.
- [x] Write Task 2 and combined reports with exclusive creation. Combined status is `completed-with-source-blocker`; bounded implementation evidence passes while source correctness remains blocked.
- [x] Run fresh focused suites, relevant API/CLI broad tests, Skill IR current broad, typecheck, documentation links, secret/absolute-path/frozen-history scans and `git diff --check`.
- [x] Update component/spec/plan/status/README/current status/developer guide/claim evidence/handoff/communication/conversation log as applicable; explicitly stage only this stage and commit on `api-tester-operation-admission-dev`.

## Recovery command order

1. Read `docs/skill-ir/api-tester-operation-development-status.md`.
2. Verify `git status --short --branch` and the recorded stage commit.
3. Run the status file's `nextCommand` exactly.
4. Never invoke `api-tester-v2-feature-migration-first-run.ts`; all new runs use the operation-development or operation-validation CLI with a fresh output.
