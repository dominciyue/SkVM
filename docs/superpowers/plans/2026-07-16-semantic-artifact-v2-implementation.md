# Semantic Artifact V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `executable-semantic-artifact/v2` for `env-manager`, deriving conservative A-layer checks from agent-visible workdir evidence and exercising exactly one local repair transition without exposing evaluator gold or activating B classification.

**Architecture:** Add catalog-specific schemas plus a digest-bound evidence program and semantic checker while preserving v1 literal schemas and assets. Preflight materializes a protected `.skvm-artifact/semantic-contract.json`; runtime parses a separate v2 report and keeps the five-field repair projection. B exists only as types and sink-isolation tests.

**Tech Stack:** TypeScript, Bun, Zod, TypeScript compiler AST, JSON, Bun test, Markdown.

---

## Execution Boundary

Tasks 1-9 implement and locally validate v2. They stop after the deterministic
activation fixture and package baseline. Task 10 is a separate review gate for
numerical thresholds, a new lock, and paid development. No API call, held-out
run, scorer change, v1 mutation, or B production path belongs to Tasks 1-9.

## File Map

| File | Responsibility |
|---|---|
| `classification-evidence.ts` | Dormant B schemas/types only. |
| `semantic-contract.ts` | A contract, scan policy, v2 report, error catalog. |
| `semantic-evidence.ts` | Tested AST/dotenv derivation module used by the package bundle entrypoint. |
| `semantic-evidence-cli.ts` | Task 3 bundle entrypoint for the package evidence program. |
| `semantic-artifact-compiler.ts` | V2 package compiler and emitted semantic checker. |
| `semantic-artifact-run.ts` | Compile/verify CLI. |
| `artifact-preflight.ts` | Derive and protect runtime contract for v2. |
| `artifact-runtime.ts` | Catalog-dispatched report parsing and unchanged repair state machine. |
| `real-agent-run.ts` | Explicit v2 planning guards; no default scheduling. |
| `env-manager-semantic-activation.test.ts` | V1-pass/v2-fail and exactly-one-repair baseline. |
| `semantic-artifact-runtime.md` | Component and local baseline documentation. |

## Task 1: V2 Schemas And Dormant B Boundary

**Files:**
- Create: `src/benchmarks/skill-ir/classification-evidence.ts`
- Create: `src/benchmarks/skill-ir/classification-evidence.test.ts`
- Create: `src/benchmarks/skill-ir/semantic-contract.ts`
- Create: `src/benchmarks/skill-ir/semantic-contract.test.ts`
- Test: `src/benchmarks/skill-ir/artifact-package.test.ts`

- [x] **Step 1: Write failing B sink-isolation tests**

Instantiate `ClassificationCandidateSchema` with a unique canary, then assert
strict v2 contract/report schemas reject `classificationCandidates`,
`disposition`, messages, actual values, and extra evidence text.

```ts
const dormant = ClassificationCandidateSchema.parse({
  value: "B_CLASSIFICATION_CANARY",
  evidenceRefs: [{ relativePath: "src/config.ts", symbol: "PORT" }],
  confidence: 0.9,
  disposition: "confirmed",
});
expect(() => SemanticRuntimeContractSchema.parse({
  ...validContract,
  classificationCandidates: [dormant],
})).toThrow();
```

- [x] **Step 2: Write failing closed-code tests**

Require `runtime-validation-report/v2`, `semantic-error-codes/v1`, the seven
new A codes, and exact code/field combinations. Assert v1 rejects every v2 code
and retains its literal catalog.

- [x] **Step 3: Verify RED**

```powershell
bun test ./src/benchmarks/skill-ir/classification-evidence.test.ts ./src/benchmarks/skill-ir/semantic-contract.test.ts
```

Expected: fail because both modules are missing.

- [x] **Step 4: Implement minimal schemas**

`classification-evidence.ts` exports only schemas and inferred types; it has no
producer or writer. `semantic-contract.ts` exports strict
`SemanticRuntimeContractSchema`, `RuntimeSemanticValidationReportSchema`,
`SemanticScanPolicySchema`, and:

```ts
export const SEMANTIC_ERROR_CODE_CATALOG = "semantic-error-codes/v1" as const;
export const SemanticValidationCodeSchema = z.enum([
  "MISSING_FILE", "INVALID_JSON", "MISSING_FIELD", "EXTRA_FIELD",
  "TYPE_MISMATCH", "UNFILLED_TEMPLATE", "SECRET_PATTERN_PRESENT",
  "PROTECTED_FILE_MUTATED", "MISSING_OBSERVED_VARIABLE",
  "INVALID_RULE_TYPE", "MISSING_RULE_CONSTRAINT",
  "MISSING_SENSITIVE_MARKER", "UNSUPPORTED_RULE_FIELD",
  "INVALID_SOURCE_QUALIFIED_FINDING", "MISSING_SOURCE_QUALIFIED_FINDING",
]);
```

- [x] **Step 5: Verify GREEN and commit**

```powershell
bun test ./src/benchmarks/skill-ir/classification-evidence.test.ts ./src/benchmarks/skill-ir/semantic-contract.test.ts ./src/benchmarks/skill-ir/artifact-package.test.ts
git add src/benchmarks/skill-ir/classification-evidence.ts src/benchmarks/skill-ir/classification-evidence.test.ts src/benchmarks/skill-ir/semantic-contract.ts src/benchmarks/skill-ir/semantic-contract.test.ts
git commit -m "feat: add semantic artifact v2 contracts"
```

## Task 2: Conservative A Evidence Derivation

**Files:**
- Create: `src/benchmarks/skill-ir/semantic-evidence.ts`
- Create: `src/benchmarks/skill-ir/semantic-evidence.test.ts`

- [x] **Step 1: Write RED positive evidence tests**

Use real temporary workdirs. Require dotenv names and AST environment
references in inventory, `Number(process.env.APP_PORT)` as `integer`, a public
port rule as range constraints, sensitive-name markers, and a literal assigned
to `INTERNAL_TOKEN` as a source-qualified finding. Serialized output must not
contain dotenv values or source snippets.

- [x] **Step 2: Write RED reverse-evidence tests**

Remove `Number`, the public port rule, sensitive naming, both definition and
reference, the source symbol, and the literal assignment one at a time. The
corresponding type, constraint, marker, inventory entry, or finding must
disappear rather than be guessed.

- [x] **Step 3: Verify RED**

```powershell
bun test ./src/benchmarks/skill-ir/semantic-evidence.test.ts
```

Expected: fail because evidence APIs are missing.

- [x] **Step 4: Implement bounded derivation**

```ts
export type DeriveSemanticContractOptions = {
  workDir: string;
  publicRules: SemanticPublicRules;
  policy: SemanticScanPolicy;
};
export async function deriveSemanticContractFromWorkdir(
  options: DeriveSemanticContractOptions,
): Promise<SemanticRuntimeContract>;
```

The tested module uses TypeScript AST for allowed JS/TS extensions, parses
dotenv without serializing values, stable-sorts output, enforces file/byte
limits, rejects symlinks, and records limitations for unsupported or ambiguous
evidence. Task 3 bundles this exact module behind a CLI entrypoint so package
execution cannot drift from the tested derivation. Process timeout remains a
preflight responsibility.

- [x] **Step 5: Verify GREEN and commit**

```powershell
bun test ./src/benchmarks/skill-ir/semantic-evidence.test.ts
git add src/benchmarks/skill-ir/semantic-evidence.ts src/benchmarks/skill-ir/semantic-evidence.test.ts
git commit -m "feat: derive conservative semantic evidence"
```

## Task 3: V2 Package Compiler And Isolation

**Files:**
- Create: `src/benchmarks/skill-ir/semantic-artifact-compiler.ts`
- Create: `src/benchmarks/skill-ir/semantic-artifact-compiler.test.ts`
- Create: `src/benchmarks/skill-ir/semantic-artifact-run.ts`
- Create: `src/benchmarks/skill-ir/semantic-evidence-cli.ts`
- Modify: `src/benchmarks/skill-ir/artifact-package.ts`

- [x] **Step 1: Write RED package and canary tests**

Compile temporary packages after injecting canaries into evaluator expected,
criterion/hard-gate ids, threshold, held-out prompt, secret values, and B
candidate fields. Recursively scan every emitted file and require zero hits.
Require the exact v2 layout and a generated skill view naming the protected
runtime contract.

- [x] **Step 2: Write RED determinism/v1 isolation tests**

Compile twice and compare paths/digests. Require catalog-dispatched validation
for v2 while the frozen v1 package continues to validate under literal v1
schemas.

- [x] **Step 3: Verify RED**

```powershell
bun test ./src/benchmarks/skill-ir/semantic-artifact-compiler.test.ts ./src/benchmarks/skill-ir/artifact-package.test.ts
```

- [x] **Step 4: Implement compiler and CLI**

Compile only source/base IR, development prompt projection, public skill rules,
scan policy, the bundled `semantic-evidence-cli.ts` entrypoint, checker,
templates, and digests. Add:

```text
semantic-artifact-run.ts --base-ir=... --tasks=... --source=... --out-dir=...
semantic-artifact-run.ts --verify-only=<package-dir>
```

- [x] **Step 5: Verify GREEN and commit**

```powershell
bun test ./src/benchmarks/skill-ir/semantic-artifact-compiler.test.ts ./src/benchmarks/skill-ir/artifact-package.test.ts
bun run typecheck
git add src/benchmarks/skill-ir/semantic-artifact-compiler.ts src/benchmarks/skill-ir/semantic-artifact-compiler.test.ts src/benchmarks/skill-ir/semantic-artifact-run.ts src/benchmarks/skill-ir/semantic-evidence-cli.ts src/benchmarks/skill-ir/artifact-package.ts
git commit -m "feat: compile semantic artifact v2 packages"
```

## Task 4: Standalone A-Layer Checker

**Files:**
- Modify: `src/benchmarks/skill-ir/semantic-artifact-compiler.ts`
- Modify: `src/benchmarks/skill-ir/semantic-artifact-compiler.test.ts`
- Create: `src/benchmarks/skill-ir/semantic-checker.test.ts`

- [x] **Step 1: Write one RED fixture per A code**

Execute the emitted checker against real workdirs for missing inventory, wrong
type, missing constraint, missing sensitive marker, unsupported field, invalid
finding, and missing confirmed finding. Assert exact five-field combinations
and absence of free text/expected values.

- [x] **Step 2: Verify RED**

```powershell
bun test ./src/benchmarks/skill-ir/semantic-checker.test.ts
```

- [x] **Step 3: Emit structural plus A checks**

The checker reads the protected runtime contract, performs structural checks
first, then stable A checks, and emits only
`runtime-validation-report/v2`/`semantic-error-codes/v1`. Invalid runtime
contract input is an infrastructure failure, never a repair error.

- [x] **Step 4: Verify GREEN and commit**

```powershell
bun test ./src/benchmarks/skill-ir/semantic-checker.test.ts ./src/benchmarks/skill-ir/semantic-artifact-compiler.test.ts
git add src/benchmarks/skill-ir/semantic-artifact-compiler.ts src/benchmarks/skill-ir/semantic-artifact-compiler.test.ts src/benchmarks/skill-ir/semantic-checker.test.ts
git commit -m "feat: validate semantic artifact evidence"
```

## Task 5: Preflight Materialization And Protection

**Files:**
- Modify: `src/benchmarks/skill-ir/artifact-preflight.ts`
- Modify: `src/benchmarks/skill-ir/artifact-preflight.test.ts`

- [x] **Step 1: Write RED preflight tests**

Require v2 to derive the fixed runtime-contract path before generation, include
it in protected digests, and reject pre-existing symlink/escape, timeout, and
invalid JSON. Require v1 to create no semantic contract and retain existing
behavior.

- [x] **Step 2: Verify RED**

```powershell
bun test ./src/benchmarks/skill-ir/artifact-preflight.test.ts
```

- [x] **Step 3: Implement catalog-dispatched derivation**

Extend `PreparedArtifactRun` as a discriminated package. For v2, execute the
declared evidence program, schema-validate output, write the protected file,
then snapshot fixtures plus contract before templates. Never return contract
contents in metadata.

- [x] **Step 4: Verify GREEN and commit**

```powershell
bun test ./src/benchmarks/skill-ir/artifact-preflight.test.ts ./src/benchmarks/skill-ir/artifact-package.test.ts
git add src/benchmarks/skill-ir/artifact-preflight.ts src/benchmarks/skill-ir/artifact-preflight.test.ts
git commit -m "feat: protect runtime semantic contracts"
```

## Task 6: V2 Reports And One-Repair Runtime

**Files:**
- Modify: `src/benchmarks/skill-ir/artifact-runtime.ts`
- Modify: `src/benchmarks/skill-ir/artifact-runtime.test.ts`

- [x] **Step 1: Write RED runtime tests**

Require v2 schema dispatch, illegal code/field rejection, exact five-field
projection, a static instruction to inspect the protected contract without
inlining it, and no B canary. Evidence/checker infrastructure failures and
protected mutation must not repair.

- [x] **Step 2: Verify RED**

```powershell
bun test ./src/benchmarks/skill-ir/artifact-runtime.test.ts
```

- [x] **Step 3: Implement schema dispatch without changing call bounds**

Select report schema from package catalog. Keep the state machine and cost
accounting unchanged. Generalize `buildSanitizedRepairTask` over the common
five fields and add only the static v2 contract-path instruction.

- [x] **Step 4: Verify GREEN and commit**

```powershell
bun test ./src/benchmarks/skill-ir/artifact-runtime.test.ts ./src/benchmarks/skill-ir/semantic-contract.test.ts
git add src/benchmarks/skill-ir/artifact-runtime.ts src/benchmarks/skill-ir/artifact-runtime.test.ts
git commit -m "feat: run semantic artifact validation reports"
```

## Task 7: Known-Failure Repair Activation

**Files:**
- Create: `src/benchmarks/skill-ir/env-manager-semantic-activation.test.ts`

- [x] **Step 1: Write activation acceptance fixture**

Use one deterministic generated-output fixture that passes the frozen v1
checker but omits an observed variable or confirmed type required by v2. Assert
v2 fails with a repair-eligible closed code.

- [x] **Step 2: Test successful and failed one-repair transitions**

With a repair test double, assert exactly one repair and final pass. With a
no-op repair, assert exactly one repair, two validations, final failure, and no
third call.

- [x] **Step 3: Verify acceptance baseline and commit**

```powershell
bun test ./src/benchmarks/skill-ir/env-manager-semantic-activation.test.ts
git add src/benchmarks/skill-ir/env-manager-semantic-activation.test.ts
git commit -m "test: freeze semantic repair activation"
```

Implementation note: this task is an acceptance freeze after Tasks 1-6, not a
new production behavior. Its first execution passed because the compiler,
preflight, checker, and state machine were already implemented through RED/GREEN
cycles. Recording a fabricated RED here would misstate the test history.

## Task 8: Explicit Runner Planning

**Files:**
- Modify: `src/benchmarks/skill-ir/real-agent-run.ts`
- Modify: `src/benchmarks/skill-ir/real-agent-run.test.ts`
- Modify: `src/benchmarks/skill-ir/artifact-package.ts`

- [x] **Step 1: Write RED planning guards**

Require v2 absence from defaults and explicit single pilot, development tasks,
clean/Windows, `ir-artifact-dev`, v2 package, and future v2 lock. Reject
held-out, mixed catalogs, v1 lock reuse, missing lock, and IR override.

- [x] **Step 2: Verify RED**

```powershell
bun test ./src/benchmarks/skill-ir/real-agent-run.test.ts
```

- [x] **Step 3: Implement planning support without creating a lock**

Add catalog-specific CLI/package/lock parsing and keep the same explicit system
label. Tests may use a temporary v2 lock; this task does not freeze numerical
gate values or commit the real env-manager v2 lock.

- [x] **Step 4: Verify GREEN and commit**

```powershell
bun test ./src/benchmarks/skill-ir/real-agent-run.test.ts ./src/benchmarks/skill-ir/matrix.test.ts
git add src/benchmarks/skill-ir/artifact-package.ts src/benchmarks/skill-ir/real-agent-run.ts src/benchmarks/skill-ir/real-agent-run.test.ts
git commit -m "feat: plan semantic artifact development runs"
```

Implementation note: `real-agent.ts` already carried catalog-neutral artifact
plan fields, and `matrix.ts` already kept `ir-artifact-dev` out of defaults.
Task 8 therefore changed only the package lock contract and Runner dispatch;
editing the other files would have added churn without behavior.

## Task 9: Package And Local Baseline

**Files:**
- Create: `benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2/**`
- Create: `docs/skill-ir/semantic-artifact-runtime.md`
- Modify: canonical spec, plan, package docs, and `D:/skill优化/conversation_log.md`

- [x] **Step 1: Compile and verify**

```powershell
bun ./src/benchmarks/skill-ir/semantic-artifact-run.ts '--root-dir=.' '--base-ir=benchmarks/skill-ir/pilots/env-manager/base-ir.json' '--tasks=benchmarks/skill-ir/pilots/env-manager/tasks.json' '--source=benchmarks/skill-ir/pilots/env-manager/source/SKILL.md' '--out-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2'
bun ./src/benchmarks/skill-ir/semantic-artifact-run.ts '--verify-only=benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2'
```

- [x] **Step 2: Run full verification**

```powershell
bun test ./src/skill-ir ./src/benchmarks/skill-ir ./src/bench/evaluators
python scripts/analyze_skill_ir_results_test.py
python scripts/analyze_skill_ir_slices_test.py
bun run typecheck
git diff --check
```

- [x] **Step 3: Document baseline and stop point**

Record evidence counts, v1-pass/v2-fail codes, exactly-one-repair behavior,
digests, commands, failure modes, and that no lock, numerical gate, API run,
held-out evidence, or optimization claim exists.

- [x] **Step 4: Commit baseline**

```powershell
git add benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2 docs/skill-ir/semantic-artifact-runtime.md docs/skill-ir/skill-ir-aot-optimization-spec.md docs/skill-ir/skill-ir-aot-optimization-plan.md docs/skill-ir/validated-skill-artifact-package.md
git commit -m "feat: freeze semantic artifact v2 local baseline"
```

## Task 10: Review Gate For Lock And Paid Development

This task is intentionally not automatic.

- [ ] Propose a numerical gate from the deterministic fixture baseline.
- [ ] Review gate, model, adapter, tasks, repetitions, package digests, and code catalog.
- [ ] Author and commit a new v2 lock only after approval.
- [ ] Generate both dry-run arms and route probe.
- [ ] Execute paid development once, then score without changing the scorer.
- [ ] Keep held-out blocked unless the frozen v2 gate passes.

## Plan Self-Review

- Every normative design section maps to Tasks 1-9.
- V1 schemas/assets stay literal and regression-tested.
- B has types/tests but no producer, serializer, package file, runtime import,
  report field, repair field, result field, lock field, or gate field.
- Every production task has an explicit RED command before implementation and
  a GREEN command before commit.
- Numerical gate selection is a named review decision after fixture evidence,
  not a placeholder in implementation.
- Paid and held-out work remain outside automatic execution.
