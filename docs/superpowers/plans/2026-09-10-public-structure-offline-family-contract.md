# Public-Structure Offline Responsibility Family Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a strict, machine-checked responsibility-family contract that separates family membership, public evidence sufficiency, current SkVM support, and skill-level coverage without using prospective outcomes.

**Architecture:** Add one standalone TypeScript module for schemas, deterministic derivation, dependency propagation, aggregation, and evidence verification; one thin CLI; two machine inputs for criteria and counterexamples; one machine verification report; and one component guide. Existing classification and API-operation evidence is referenced by digest and locator, never rewritten or imported into the prospective candidate.

**Tech Stack:** TypeScript, Zod, Bun test/CLI, Node filesystem/crypto, JSON evidence artifacts, Markdown documentation.

---

### Task 1: Core orthogonal assessment contract

**Files:**
- Create: `src/benchmarks/skill-ir/public-structure-offline-family-contract.ts`
- Create: `src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts`

- [x] **Step 1: Write the failing test for orthogonal states**

Create fixtures showing: (a) verifiable but not constructible because an external semantic choice is unbound; (b) constructible but currently unsupported because a capability is not new-input-ready; and (c) a source-blocked responsibility whose family criteria remain satisfied.

```ts
test("keeps family, evidence, source validity, and current support orthogonal", () => {
  expect(deriveFamilyResponsibilityAssessment(verifiableOnlyFixture())).toMatchObject({
    familyMembership: "in-family",
    verifiability: "verifiable",
    constructibility: "not-constructible",
    currentSupport: "not-assessable",
    failureAttributions: ["external-semantic-decision"],
  });
  expect(deriveFamilyResponsibilityAssessment(capabilityMissingFixture())).toMatchObject({
    familyMembership: "in-family",
    constructibility: "constructible",
    currentSupport: "missing",
  });
  expect(deriveFamilyResponsibilityAssessment(sourceBlockedFixture())).toMatchObject({
    familyMembership: "in-family",
    sourceValidity: "blocked",
    currentSupport: "not-assessable",
  });
});
```

- [x] **Step 2: Run the focused test and preserve the expected RED**

Run:

```powershell
bun test ./src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts
```

Expected: module-not-found failure before production code exists.

- [x] **Step 3: Implement strict schemas and deterministic derivation**

Define the seven fixed family criteria, evidence-basis states, semantic-choice states, capability states, failure attributions, and the raw responsibility input. Implement the following public signature:

```ts
export function deriveFamilyResponsibilityAssessment(
  input: FamilyResponsibilityInput | unknown,
): FamilyResponsibilityAssessment;
```

Derivation order is fixed:

```ts
const familyMembership = hasUnknownCriterion ? "family-membership-unknown"
  : hasUnsatisfiedCriterion ? "out-of-family"
  : "in-family";
const verifiability = deriveEvidenceDimension(input.verificationBasis);
const constructibility = deriveConstruction(
  input.constructionBasis,
  input.dependencyClosure,
  input.remainingSemanticChoices,
);
const currentSupport = familyMembership === "out-of-family" ? "not-applicable"
  : familyMembership !== "in-family" || constructibility !== "constructible"
    || input.sourceValidity.status === "blocked" || input.sourceValidity.status === "unknown"
    ? "not-assessable"
    : input.requiredCapabilities.every(isCurrentNewInputReady) ? "supported" : "missing";
```

Reject candidate outcomes as evidence, require evidence IDs for satisfied/unsatisfied facts, and require named missing evidence for unknown facts.

- [x] **Step 4: Run the focused test and verify GREEN**

Expected: all Task 1 tests pass, including false inference from `candidatePassed=true`, an unbound semantic choice, and a missing capability.

- [x] **Step 5: Commit Task 1**

```powershell
git add src/benchmarks/skill-ir/public-structure-offline-family-contract.ts src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts
git commit -m "feat(skill-ir): define offline responsibility family"
```

### Task 2: Dependency propagation and lossless skill aggregation

**Files:**
- Modify: `src/benchmarks/skill-ir/public-structure-offline-family-contract.ts`
- Modify: `src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts`

- [x] **Step 1: Write failing dependency and aggregation tests**

```ts
test("preserves the complete responsibility denominator in skill aggregation", () => {
  const result = deriveFamilyDataset(mixedSkillFixture());
  expect(result.skills[0]).toMatchObject({
    disposition: "mixed",
    totals: { responsibilities: 3, inFamily: 1, outOfFamily: 2 },
  });
});

test("fails closed on omitted responsibilities and dependency cycles", () => {
  expect(() => deriveFamilyDataset(omittedResponsibilityFixture())).toThrow(/denominator/iu);
  expect(() => deriveFamilyDataset(cyclicDependencyFixture())).toThrow(/cycle/iu);
});
```

- [x] **Step 2: Run RED and confirm the functions are absent**

Expected: the new dataset/aggregation functions are undefined or missing exports.

- [x] **Step 3: Implement graph validation, propagation, and aggregation**

Expose:

```ts
export function deriveFamilyDataset(input: FamilyDatasetInput | unknown): FamilyDatasetReport;
export function aggregateFamilySkill(
  scope: FamilySkillScope,
  assessments: ReadonlyMap<string, FamilyResponsibilityAssessment>,
): FamilySkillAggregate;
```

Require every responsibility to occur exactly once in its skill scope, dependencies to stay in the same skill, and the graph to be acyclic. Propagate `family-membership-unknown` and `out-of-family` to downstream responsibilities before aggregation. Emit `all | mixed | none | incomplete` and all requested counts/failure frequencies.

- [x] **Step 4: Run GREEN**

Expected: mixed skill preserves all three units; omission, duplicate ID, cross-skill dependency, and cycle all fail.

- [x] **Step 5: Commit Task 2**

```powershell
git add src/benchmarks/skill-ir/public-structure-offline-family-contract.ts src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts
git commit -m "feat(skill-ir): aggregate responsibility family evidence"
```

### Task 3: Criterion matrix, counterexamples, and source binding

**Files:**
- Create: `benchmarks/skill-ir/classification/public-structure-offline-family-contract-v1.json`
- Create: `benchmarks/skill-ir/classification/public-structure-offline-family-counterexamples-v1.json`
- Modify: `src/benchmarks/skill-ir/public-structure-offline-family-contract.ts`
- Modify: `src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts`

- [x] **Step 1: Write failing actual-artifact tests**

```ts
test("verifies every actual criterion and counterexample source locator", async () => {
  const result = await verifyPublicStructureOfflineFamilyFiles({
    rootDir,
    contractPath: "benchmarks/skill-ir/classification/public-structure-offline-family-contract-v1.json",
    counterexamplesPath: "benchmarks/skill-ir/classification/public-structure-offline-family-counterexamples-v1.json",
  });
  expect(result).toMatchObject({ criteria: 9, familyNecessaryCriteria: 7, counterexamples: 7 });
});
```

Add mutation tests for a broken source digest, missing marker, absent necessary criterion, engineering-limit criterion used in membership, and `candidate-run-result` evidence kind.

- [x] **Step 2: Run RED**

Expected: files/functions are missing.

- [x] **Step 3: Implement source-bound file verification**

Define exact `CriterionDefinitionSchema`, `EvidenceFileSchema`, `FamilyContractFileSchema`, and `FamilyCounterexampleFileSchema`. Verify that:

```ts
sha256(await readFile(source.path)) === source.sha256;
source.markers.every((marker) => sourceText.includes(marker));
```

Require exactly the seven necessary criteria plus `current-capability-readiness` as `current-engineering-limit` and `cross-repository-generalization` as `unverified-hypothesis`. Necessary criteria may only use public-contract/source/validation evidence, never candidate outcomes.

- [x] **Step 4: Materialize the matrix and seven already-exposed examples**

Bind exact digests and stable symbol/text markers from:

- `docs/skill-ir/classification-handbook-v1.md` and `classification-handbook-v2.md`;
- `src/benchmarks/skill-ir/task-automation-classification.ts`;
- `src/skill-ir/api-tester-operation-admission.ts`;
- `src/skill-ir/api-tester-operation-coverage.ts`;
- `src/skill-ir/api-tester-production-artifact-v2.ts`;
- `results/skill-ir/api-tester-operation-dependency-verification-revision-development-001/report.json`.

The seven examples are JSON key normalization, changelog capability missing, PDF semantic mapping, OpenAPI design-first information gap, Meilisearch missing reference, Bangumi response-reference advisory, and dependency-verifier mechanism boundary. Mark prospective evidence `pending-not-observed` and do not include it as a source.

- [x] **Step 5: Run GREEN and commit**

Expected: actual files verify; all five tamper cases fail at their named layer.

```powershell
git add src/benchmarks/skill-ir/public-structure-offline-family-contract.ts src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts benchmarks/skill-ir/classification/public-structure-offline-family-contract-v1.json benchmarks/skill-ir/classification/public-structure-offline-family-counterexamples-v1.json
git commit -m "test(skill-ir): bind responsibility family evidence"
```

### Task 4: CLI, machine report, component documentation, and checkpoint

**Files:**
- Create: `src/benchmarks/skill-ir/public-structure-offline-family-contract-run.ts`
- Create: `results/skill-ir/public-structure-offline-family-contract-development-001/report.json`
- Create: `docs/skill-ir/public-structure-offline-family-contract.md`
- Modify: `docs/skill-ir/api-tester-operation-prospective-research-status.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-spec.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `docs/superpowers/plans/2026-09-10-api-tester-operation-prospective-research.md`
- Modify: `D:/skill优化/project_handoff.md`
- Modify: `D:/skill优化/project_communication.md`
- Modify: `D:/skill优化/conversation_log.md`

- [x] **Step 1: Write the failing CLI/report test**

```ts
test("writes a write-once report derived from the bound files", async () => {
  const report = await buildPublicStructureOfflineFamilyReport({ rootDir, completedAt });
  expect(report).toMatchObject({
    identity: "skill-ir-public-structure-offline-family-contract-development-001",
    status: "verified-development-contract",
    accounting: { prospectiveResultsUsed: 0, heldOutAccesses: 0, q1ReservedAccesses: 0 },
  });
});
```

- [x] **Step 2: Run RED, then implement the thin CLI and report builder**

CLI arguments are fixed and contain no source-selection option:

```powershell
bun ./src/benchmarks/skill-ir/public-structure-offline-family-contract-run.ts --root=. --out=results/skill-ir/public-structure-offline-family-contract-development-001/report.json --completed-at=<ISO>
```

The report binds the two input files, source digests, derived example assessments, skill aggregation controls, verification totals, and zero prospective/model/API/paid/held-out/Q1 access.

- [x] **Step 3: Run GREEN and materialize the report write-once**

Expected: report status `verified-development-contract`; seven examples; no prospective evidence used.

- [x] **Step 4: Write component and project documentation**

Document purpose, runtime, types/functions/CLI, family criteria, aggregation, failure modes, tests, source limitations, retrospective status, and modification notes. Update Task 7 status without marking Tasks 2--5 complete. Record that the revision freeze is locally complete but its second push is still externally blocked.

- [x] **Step 5: Run fresh verification**

```powershell
bun test ./src/benchmarks/skill-ir/public-structure-offline-family-contract.test.ts
bun run typecheck
python scripts/check_skill_ir_doc_links_test.py
python scripts/check_skill_ir_doc_links.py --root .
git diff --check
```

Expected: focused/typecheck/docs all pass; frozen candidate/v2/old reports unchanged; no new prospective source or result path exists.

- [x] **Step 6: Exact-stage and commit the Task 7 checkpoint**

Stage only the files listed in Task 4 plus the Task 7 source/test/machine artifacts. Commit:

```powershell
git commit -m "feat(skill-ir): verify offline responsibility family"
```

Do not push through an alternate route. After a user-authorized origin push succeeds, push both the revision freeze and Task 7 commits normally; remote-verify Task 2 before any unseen source access.
