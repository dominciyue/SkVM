# API Tester Production Binding Implementation Plan

> **For Codex:** Execute this plan serially in the current `skill-ir-aot` checkout. Do not use subagents. Preserve all unrelated untracked files. Each implementation task follows RED → minimal GREEN → focused refactor.

**Goal:** Add a versioned, generic API Tester production binding that accepts ordinary workdir-relative OpenAPI/input-output parameters, rejects unsupported structures before construction, emits a digest-bound self-contained package, and validates generated plan/report artifacts with an independent public-contract checker.

**Architecture:** Add a new product-only contract and package path under `src/skill-ir`; keep the frozen benchmark compiler, scorer, wrapper, locks, and packages byte-unchanged. The controller parses JSON/YAML and freezes a normalized public contract into the package. Separate generator and checker programs consume that contract; the checker never imports or calls the generator and also verifies the raw protected input digest. Extend `skvm artifact` additively with mutually exclusive `--binding` and historical `--variant` modes.

**Tech Stack:** TypeScript, Bun, Zod, `yaml`, Node child processes, existing SHA-256/path helpers, Bun tests.

---

### Task 1: Freeze binding and support-contract behavior

**Files:**

- Create: `src/skill-ir/api-tester-production-contract.test.ts`
- Create: `src/skill-ir/api-tester-production-contract.ts`
- Create: `src/skill-ir/fixtures/api-tester-production/books/binding.json`
- Create: `src/skill-ir/fixtures/api-tester-production/books/api/openapi.json`
- Create: `src/skill-ir/fixtures/api-tester-production/orders/binding.json`
- Create: `src/skill-ir/fixtures/api-tester-production/orders/spec/openapi.yaml`

**Step 1: Write failing contract tests**

Cover strict binding schema, safe-relative/collision checks, JSON/YAML parsing, two supported new development inputs, stable unsupported reason codes, unconstructible constraints, required-without-error, and security-without-401/403.

**Step 2: Run RED**

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' test ./src/skill-ir/api-tester-production-contract.test.ts
```

Expected: fail because the production contract module does not exist.

**Step 3: Implement the minimal contract**

Export strict Zod schemas and functions to parse a binding, parse the declared OpenAPI format, validate the supported subset, and return a normalized public contract. Reject before generation with stable codes; do not import held-out tasks or the frozen compiler.

**Step 4: Run GREEN**

Run the same test; expect all assertions to pass.

**Step 5: Commit**

```powershell
git add -- src/skill-ir/api-tester-production-contract.ts src/skill-ir/api-tester-production-contract.test.ts src/skill-ir/fixtures/api-tester-production
git commit -m "feat(skill-ir): define api tester production contract"
```

### Task 2: Build independent generator and checker programs

**Files:**

- Create: `src/skill-ir/api-tester-production-programs.test.ts`
- Create: `src/skill-ir/api-tester-production-programs.ts`

**Step 1: Write failing semantic tests**

Require the generator to create a passing happy case, one witness for every declared constraint, documented unauthorized cases, globally unique independent case ids, and truthful report counts. Require the checker to accept both development fixtures and reject operation/case/report tampering. Assert generator and checker source bytes/digests differ and checker source contains no generator import/call.

**Step 2: Run RED**

Run only `api-tester-production-programs.test.ts`; expect missing-module failure.

**Step 3: Implement separate programs**

Generate two standalone Node ESM sources. Both receive the normalized contract as an explicit file. Generator owns construction; checker owns assessment and input/report grounding. Do not compare plan bytes to a generated gold plan.

**Step 4: Run GREEN and the Task 1 regression**

Both focused files must pass.

**Step 5: Commit**

```powershell
git add -- src/skill-ir/api-tester-production-programs.ts src/skill-ir/api-tester-production-programs.test.ts
git commit -m "feat(skill-ir): add independent api tester checker"
```

### Task 3: Compile, validate, and run the production package

**Files:**

- Create: `src/skill-ir/api-tester-production-artifact.test.ts`
- Create: `src/skill-ir/api-tester-production-artifact.ts`

**Step 1: Write failing package/runtime tests**

Test empty output enforcement, non-symlink input, output absence, manifest/provenance closure, binding/input/program digests, separate checker identity, two-fixture execution, protected-input recheck, and tamper failure.

**Step 2: Run RED**

Run the new test; expect missing-module failure.

**Step 3: Implement package compiler and serial runner**

Emit the production-only manifest/provenance schema and exact package closure. Run generator then checker using the resolved Node executable. Save checker stdout as `validation-report.json`; fail unless its strict schema says `pass`. Never invoke a model, network, package installation, shell, retry, or repair.

**Step 4: Run GREEN and Tasks 1–2 regression**

All three focused test files must pass.

**Step 5: Commit**

```powershell
git add -- src/skill-ir/api-tester-production-artifact.ts src/skill-ir/api-tester-production-artifact.test.ts
git commit -m "feat(skill-ir): run api tester production artifacts"
```

### Task 4: Add the CLI binding mode without changing the frozen variant path

**Files:**

- Modify: `src/cli/artifact.ts`
- Modify: `src/cli/artifact.test.ts`
- Modify: `src/skill-ir/verified-artifact-presets.ts`
- Modify: `src/skill-ir/verified-artifact-presets.test.ts`

**Step 1: Write failing CLI tests**

Add tests for `--binding`, binding containment, `--binding`/`--variant` mutual exclusion, missing mode, unknown flags, two real fixture runs, zero accounting, and unchanged historical `--variant` behavior.

**Step 2: Run RED**

Run the two existing test files; confirm the new expectations fail for the intended missing binding mode.

**Step 3: Implement the additive branch**

Extend the discriminated CLI/preset option types. Production mode calls the new compiler/runner and returns the existing top-level result schema with an additional strict binding evidence object. Historical Env Manager and API Tester variant code paths remain behaviorally unchanged.

**Step 4: Run GREEN plus entrypoint regression**

```powershell
& 'C:\Users\14182\AppData\Roaming\npm\node_modules\bun\bin\bun.exe' test ./src/cli/artifact.test.ts ./src/skill-ir/verified-artifact-presets.test.ts ./src/cli/artifact-entrypoint.test.ts
```

**Step 5: Commit**

```powershell
git add -- src/cli/artifact.ts src/cli/artifact.test.ts src/skill-ir/verified-artifact-presets.ts src/skill-ir/verified-artifact-presets.test.ts
git commit -m "feat(skill-ir): expose api tester production binding"
```

### Task 5: Freeze the development-only zero-model evidence

**Files:**

- Create: `src/skill-ir/api-tester-production-development.test.ts`
- Create: `src/skill-ir/api-tester-production-development.ts`
- Create: `src/skill-ir/api-tester-production-development-run.ts`
- Create: `results/skill-ir/api-tester-production-binding-development-001/report.json`

**Step 1: Write the development report test**

Require exactly two new-input runs (JSON/YAML), distinct input/binding digests, the same program version, passing checker results, no task ids/templates/mappings, and `modelCalls=apiCalls=paidCalls=0`. Reject missing rows and any held-out/prospective label.

**Step 2: Run RED**

Run the new test; expect missing implementation.

**Step 3: Implement and run the evidence driver**

The driver creates isolated temporary workdirs from the public fixtures, runs only the production binding path, writes a compact digest-bound report, and removes temporary execution directories. It must not inspect API keys.

**Step 4: Run GREEN and reproduce the committed report**

Run the test and then the run script with the explicit results path. Re-read the report and verify its digests against a fresh run.

**Step 5: Commit**

```powershell
git add -- src/skill-ir/api-tester-production-development.ts src/skill-ir/api-tester-production-development-run.ts src/skill-ir/api-tester-production-development.test.ts results/skill-ir/api-tester-production-binding-development-001/report.json
git commit -m "test(skill-ir): freeze api tester production binding"
```

### Task 6: Synchronize documentation and persistent records

**Files:**

- Create: `docs/skill-ir/api-tester-production-binding.md`
- Modify: `docs/skill-ir/README.md`
- Modify: `docs/skill-ir/developer-guide.md`
- Modify: `docs/skill-ir/current-status.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-spec.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `docs/skill-ir/classification-and-automation-next-stage-proposal.md`
- Modify: `D:/skill优化/project_handoff.md`
- Modify: `D:/skill优化/project_communication.md`
- Modify: `D:/skill优化/conversation_log.md`

**Step 1: Document the component and usage**

Cover schema, support/rejection table, runtime/package layout, checker independence, CLI examples, tests, failure modes, and modification notes. State that Q1 still awaits two real annotators and Q2 remains a development candidate until separate readiness review.

**Step 2: Synchronize authoritative claims**

Record the exact two-input evidence and zero accounting without changing Q2 snapshot readiness, portfolio, prospective selection, or Q3 authorization.

**Step 3: Verify docs**

Run the existing documentation test and tracked Markdown link scan; expect zero broken/legacy links.

**Step 4: Commit**

Commit only the explicit documentation whitelist; do not add unrelated untracked files.

### Task 7: Broad verification, frozen-boundary audit, and push

**Files:** No new files unless a test exposes a real defect.

**Step 1: Run focused and broad deterministic checks**

Run all production-binding/CLI tests, relevant historical artifact tests, `bun run typecheck`, documentation tests, full tracked-doc scan, and `git diff --check`.

**Step 2: Audit the boundary**

Use `git diff`/`git log` to prove the frozen research compiler, scorer, old lock/package, held-out, Stage M/N, portfolio, readiness and unrelated `??` were not modified. Scan new artifacts for secrets, API-key values, absolute local paths, prompt/gold/evaluator payloads, and held-out markers.

**Step 3: Review commits and push**

Confirm branch `skill-ir-aot`, inspect the exact commit/file whitelist and ahead/behind state, then push only to `origin/skill-ir-aot`.
