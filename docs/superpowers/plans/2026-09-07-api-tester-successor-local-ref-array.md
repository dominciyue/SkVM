# API Tester Successor Local Ref and Primitive Array Implementation Plan

> **For Codex:** Execute serially in the current `skill-ir-aot` checkout with the `executing-plans`, `test-driven-development`, and `verification-before-completion` skills. The user prohibited subagents. Preserve unrelated untracked files and the complete v1 source closure.

**Goal:** Ship an additive v2 API Tester constructor that safely resolves bounded same-document component refs, constructs primitive arrays with explicit query encoding, independently checks the new public obligations, and completes one exposed real Open-Meteo development path without model/API/paid calls.

**Architecture:** Keep all v1 candidate files byte-identical. Add v2 contract, standalone generator/checker, artifact wrapper, fixture, and development runner. The controller is the only OpenAPI parser and freezes a strict v2 normalized contract; generator and checker consume it independently. Real source bytes remain in a digest-bound external cache and are not vendored.

**Tech Stack:** TypeScript, Bun, Zod, `yaml`, standalone Node ESM programs, SHA-256, Bun tests.

---

### Task 1: Freeze the gap and v2 contract

**Files:**

- Create: `src/skill-ir/api-tester-production-contract-v2.test.ts`
- Create: `src/skill-ir/api-tester-production-contract-v2.ts`
- Create: `src/skill-ir/fixtures/api-tester-production-v2/local-ref-arrays/binding.json`
- Create: `src/skill-ir/fixtures/api-tester-production-v2/local-ref-arrays/openapi.yaml`

1. RED: require v2 schema identities, local parameter/schema/body refs, query/body primitive arrays, form explode normalization, date/float, and stable failures for external/unresolved/cyclic/wrong-kind/sibling refs, nested arrays/objects, unsupported serialization and unconstructible bounds.
2. Run only the new contract test and confirm missing-module failure.
3. GREEN: implement JSON Pointer resolver, strict discriminated field schemas, bounded value construction and support/rejection parser without editing v1.
4. Run the new test plus the v1 contract regression.

### Task 2: Generate and independently check v2 artifacts

**Files:**

- Create: `src/skill-ir/api-tester-production-programs-v2.test.ts`
- Create: `src/skill-ir/api-tester-production-programs-v2.ts`

1. RED: require happy/witness cases, exact array encoding metadata, truthful report grounding, distinct generator/checker bytes, and checker rejection of missing array witness, encoding drift and report tamper.
2. Confirm missing-module failure.
3. GREEN: emit two standalone Node ESM programs. The checker must not import/call the generator or regenerate an exact plan.
4. Run v2 programs + v2 contract + all v1 contract/program tests.

### Task 3: Package and run the v2 closure

**Files:**

- Create: `src/skill-ir/api-tester-production-artifact-v2.test.ts`
- Create: `src/skill-ir/api-tester-production-artifact-v2.ts`

1. RED: require v2 exact closure, distinct program digests, protected input, symlink/output/overlap guards, execution pass and package/input tamper failure.
2. Confirm missing-module failure.
3. GREEN: add v2 manifest/provenance/run-report schemas and serial generator → checker controller with zero network/model/retry paths.
4. Run v2 package suite plus all v1 artifact regressions.

### Task 4: Freeze one real development path

**Files:**

- Create: `benchmarks/skill-ir/development/api-tester-successor/open-meteo-binding.json`
- Create: `src/skill-ir/api-tester-production-successor-development.test.ts`
- Create: `src/skill-ir/api-tester-production-successor-development.ts`
- Create: `src/skill-ir/api-tester-production-successor-development-run.ts`
- Create: `results/skill-ir/api-tester-production-binding-successor-development-001/report.json`

1. RED: require exact upstream/input/license identity, 1 operation/23 fields/5 arrays, checker pass, digest-bound package/output evidence, no cache path, exposed-development-only boundary and zero accounting.
2. Confirm missing runner/report behavior.
3. GREEN: verify external cache digests, copy only into an isolated temporary workdir, run the v2 artifact, emit compact report, and remove temporary data.
4. Execute once against `D:/skill优化/.tmp-api-prospective-20260907`; commit only the compact report, not upstream bytes.

### Task 5: Synchronize authority and verify frozen boundaries

**Files:**

- Modify: `docs/skill-ir/api-tester-production-binding.md`
- Modify: `docs/skill-ir/README.md`
- Modify: `docs/skill-ir/developer-guide.md`
- Modify: `docs/skill-ir/current-status.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-spec.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `D:/skill优化/AGENTS.md`
- Modify: `D:/skill优化/project_handoff.md`
- Modify: `D:/skill优化/project_communication.md`
- Modify: `D:/skill优化/conversation_log.md`

1. Record the support/rejection contract, exact development result, and the fact that the old 0/4 had `checkerStatus:not-run`.
2. Update the outer route pointer from spec 14.12/plan 4.41 to the successor section.
3. Run focused v2 and v1 regressions, broad skill-ir tests, typecheck, doc-link tests/scan and `git diff --check`.
4. Recompute the three v1 candidate source-closure digests and old lock/report digest; require byte identity.
5. Scan new committed files for secrets, held-out/prompt/gold payloads, absolute cache paths and per-input program branches.
6. Explicitly stage only the task whitelist, commit, review ahead/behind, and push to `origin/skill-ir-aot`.

**Stop:** Do not freeze a new prospective candidate/input lock, touch held-out/readiness/portfolio, start a second profile, or claim human savings.
