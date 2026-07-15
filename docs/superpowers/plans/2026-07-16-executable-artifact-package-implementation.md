# Executable Artifact Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the development-only `env-manager` `executable-artifact/v1` package and a fail-closed Runner path that performs preflight, generation, validation, at most one sanitized repair, revalidation, and separate runtime/offline scoring.

**Architecture:** Add focused package-contract/compiler and runtime modules beside the existing Skill IR benchmark harness. The package compiler consumes frozen base IR, gold-isolated repair evidence, and development prompts; the runtime validates package identity and workdir containment before a dependency-injected state machine calls the existing agent command. `real-agent-run.ts` only parses/guards CLI options and adapts its process execution into the runtime interface.

**Tech Stack:** TypeScript, Bun, Zod, JSON/JSONL, SHA-256 provenance, Bun test, existing SkVM task runner.

---

## File Map

| File | Responsibility |
|---|---|
| `src/benchmarks/skill-ir/artifact-package.ts` | Closed schemas, safe relative paths, package/provenance validation, digest verification. |
| `src/benchmarks/skill-ir/artifact-package.test.ts` | Package/report schema, path, digest, tamper, and leakage canaries. |
| `src/benchmarks/skill-ir/artifact-package-compiler.ts` | Prompt-only contract extraction and deterministic env-manager package emission. |
| `src/benchmarks/skill-ir/artifact-package-compiler.test.ts` | Contract isolation, deterministic templates/checker, provenance inputs, and compiler tamper tests. |
| `src/benchmarks/skill-ir/artifact-package-run.ts` | Narrow CLI for emitting/verifying `executable-artifact/v1`. |
| `src/benchmarks/skill-ir/artifact-preflight.ts` | Package scope checks, workdir snapshot, template materialization, and protected-file verification. |
| `src/benchmarks/skill-ir/artifact-preflight.test.ts` | Preflight, containment, mutation, and template tests. |
| `src/benchmarks/skill-ir/artifact-runtime.ts` | Runtime validator execution, sanitized repair task, bounded state machine, and cost fields. |
| `src/benchmarks/skill-ir/artifact-runtime.test.ts` | Check-only/one-repair transitions, no-repair failures, leakage canaries, and cost accounting. |
| `src/benchmarks/skill-ir/matrix.ts` | Add explicit non-default `ir-artifact-dev` system label. |
| `src/benchmarks/skill-ir/real-agent.ts` | Carry artifact package identity in materialized plan entries. |
| `src/benchmarks/skill-ir/real-agent-run.ts` | Artifact CLI guards, package-aware planning, process adapter, and raw-row persistence. |
| `src/benchmarks/skill-ir/scoring.ts` | Preserve runtime validation metadata and use aggregate generation+repair usage without changing evaluator rules. |
| `benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1/` | Compiler-emitted, digest-bound package. |
| `benchmarks/skill-ir/pilots/env-manager/env-manager-executable-artifact-v1-lock.json` | Frozen development-only model/matrix/package lock. |
| `docs/skill-ir/executable-artifact-runtime.md` | Component contract, commands, failure modes, and verification. |

## Task 1: Closed Package And Validation Schemas

**Files:**
- Create: `src/benchmarks/skill-ir/artifact-package.test.ts`
- Create: `src/benchmarks/skill-ir/artifact-package.ts`

- [x] **Step 1: Write failing schema tests**

Define wished-for imports and assertions for:

```ts
import {
  ArtifactPackageManifestSchema,
  ArtifactPackageProvenanceSchema,
  RuntimeValidationReportSchema,
  parseSafeRelativePath,
  validateArtifactPackage,
} from "./artifact-package";

expect(parseSafeRelativePath("artifacts/checks/validate-output.ts")).toBe(
  "artifacts/checks/validate-output.ts",
);
expect(() => parseSafeRelativePath("C:\\secret.txt")).toThrow("relative");
expect(() => parseSafeRelativePath("../secret.txt")).toThrow("escapes");
expect(() => RuntimeValidationReportSchema.parse({
  schemaVersion: "runtime-validation-report/v1",
  status: "fail",
  repairEligible: true,
  errors: [{ code: "MISSING_FIELD", relativePath: "env-report.json", message: "leak" }],
})).toThrow();
```

Also assert closed code/type enums, no absolute report path, no extra report
fields, manifest catalog `executable-artifact/v1`, artifact digest mismatch,
undeclared package files, and provenance mismatch.

- [x] **Step 2: Run the test and verify RED**

Run: `bun test ./src/benchmarks/skill-ir/artifact-package.test.ts`

Expected: FAIL because `./artifact-package` does not exist.

- [x] **Step 3: Implement minimal schemas and verifier**

Export these APIs:

```ts
export const RuntimeValidationReportSchema: z.ZodType<RuntimeValidationReport>;
export const ArtifactPackageManifestSchema: z.ZodType<ArtifactPackageManifest>;
export const ArtifactPackageProvenanceSchema: z.ZodType<ArtifactPackageProvenance>;
export function parseSafeRelativePath(value: string): string;
export async function validateArtifactPackage(opts: {
  packageDir: string;
  expectedCatalog?: "executable-artifact/v1";
}): Promise<ValidatedArtifactPackage>;
```

Use `.strict()` at every repair-facing object boundary. `ValidationError`
properties are exactly `code`, `relativePath`, `jsonPointer`, `missingField`,
and `expectedType`; all except `code` are optional and use closed/path-safe
types. Verify manifest/provenance identity, every declared digest, no path
escape, and no undeclared regular file under the package directory.

- [x] **Step 4: Run focused tests and typecheck**

Run:

```powershell
bun test ./src/benchmarks/skill-ir/artifact-package.test.ts
bun run typecheck
```

Expected: all focused tests pass; typecheck exits 0.

- [x] **Step 5: Commit the schema boundary**

```powershell
git add src/benchmarks/skill-ir/artifact-package.ts src/benchmarks/skill-ir/artifact-package.test.ts
git commit -m "feat: add executable artifact package contracts"
```

## Task 2: Prompt-Isolated Package Compiler

**Files:**
- Create: `src/benchmarks/skill-ir/artifact-package-compiler.test.ts`
- Create: `src/benchmarks/skill-ir/artifact-package-compiler.ts`
- Create: `src/benchmarks/skill-ir/artifact-package-run.ts`

- [x] **Step 1: Write failing compiler tests**

Exercise the public API:

```ts
const compiled = await compileEnvManagerArtifactPackage({
  rootDir,
  baseIrPath,
  repairEvidencePath,
  taskSetPath,
  sourcePath,
  outDir,
  predecessorPaths,
});
```

Assert that it:

- accepts only `development` prompts while recording their ids/digest;
- derives `.env.example`, `.env.schema.json`, `env-report.json`, the five report
  arrays, top-level `variables`, and allowed rule fields from prompt text;
- obtains no input object containing `eval`, `hardGateIds`, evaluator payload,
  expected values, held-out prompt/results, or secret values;
- rejects inconsistent development prompt contracts;
- requires evidence for `json-schema-contract` and
  `source-qualified-finding` without serializing criterion ids into templates;
- emits deterministic bytes on repeated compilation;
- writes sentinel-bearing templates and a standalone checker;
- binds source/base/evidence/task-contract/predecessor/artifact digests.

- [x] **Step 2: Run the compiler test and verify RED**

Run: `bun test ./src/benchmarks/skill-ir/artifact-package-compiler.test.ts`

Expected: FAIL because the compiler module is missing.

- [x] **Step 3: Implement prompt contract extraction**

Export:

```ts
export type EnvManagerTaskContract = {
  schemaVersion: "env-manager-task-contract/v1";
  generatedFiles: [".env.example", ".env.schema.json", "env-report.json"];
  reportFields: [
    "definedAndUsed",
    "definedUnconfirmedUnused",
    "usedUndefined",
    "hardcodedSecrets",
    "exposureRisks",
  ];
  schemaRoot: "variables";
  allowedRuleFields: string[];
  syntheticSecretPrefix: "TEST_ONLY_";
  preserveExistingFiles: true;
};

export function extractEnvManagerTaskContract(
  tasks: Array<Pick<SkillIRBenchmarkTask, "id" | "split" | "prompt">>,
): { contract: EnvManagerTaskContract; taskIds: string[]; promptDigest: string };
```

Parse only `prompt`. Normalize each development task to a structural contract
and require exact agreement. Do not accept a task object wider than the mapped
`id/split/prompt` projection inside the compiler.

- [x] **Step 4: Implement deterministic package emission and CLI**

Emit the layout from the design. Use `__SKVM_REQUIRED__` in both JSON templates.
Generate a standalone Bun checker that reads the contract and validates only
declared structure, parseability, sentinels, generic `TEST_ONLY_` output, and
relative paths. The CLI accepts explicit paths and supports `--verify-only`.

- [x] **Step 5: Run focused tests and typecheck**

```powershell
bun test ./src/benchmarks/skill-ir/artifact-package.test.ts ./src/benchmarks/skill-ir/artifact-package-compiler.test.ts
bun run typecheck
```

Expected: pass.

- [x] **Step 6: Commit the compiler**

```powershell
git add src/benchmarks/skill-ir/artifact-package-compiler.ts src/benchmarks/skill-ir/artifact-package-compiler.test.ts src/benchmarks/skill-ir/artifact-package-run.ts
git commit -m "feat: compile env-manager executable package"
```

## Task 3: Preflight And Protected Workdir

**Files:**
- Create: `src/benchmarks/skill-ir/artifact-preflight.test.ts`
- Create: `src/benchmarks/skill-ir/artifact-preflight.ts`

- [x] **Step 1: Write failing preflight tests**

Test these APIs with real temporary files:

```ts
const prepared = await preflightArtifactRun({
  packageDir,
  workDir,
  scope: { skillId, taskId, taskSplit, model, adapter, adapterVersion, context, environment },
  expectedContractDigest,
});
await materializeArtifactTemplates(prepared);
const mutation = await verifyProtectedWorkdir(prepared);
```

Assert fail-closed behavior for package tamper, non-development task, wrong
model/adapter/context/environment, task-contract drift, generated path escape,
missing Bun checker runtime, and workdir escape. Assert that template targets
are excluded from the protected snapshot while every pre-existing fixture is
hashed and later mutation is reported without exposing bytes.

- [x] **Step 2: Run the test and verify RED**

Run: `bun test ./src/benchmarks/skill-ir/artifact-preflight.test.ts`

Expected: FAIL because the module is missing.

- [x] **Step 3: Implement preflight and materialization**

Export:

```ts
export async function preflightArtifactRun(input: ArtifactPreflightInput): Promise<PreparedArtifactRun>;
export async function materializeArtifactTemplates(input: PreparedArtifactRun): Promise<void>;
export async function verifyProtectedWorkdir(input: PreparedArtifactRun): Promise<ProtectedWorkdirResult>;
```

Snapshot sorted relative path/digest pairs. Never include content in returned
errors. Copy only declared templates to declared generated outputs and refuse
to overwrite a path that pre-existed outside the declared generated set.

- [x] **Step 4: Run focused tests and typecheck**

```powershell
bun test ./src/benchmarks/skill-ir/artifact-package.test.ts ./src/benchmarks/skill-ir/artifact-preflight.test.ts
bun run typecheck
```

Expected: pass.

- [x] **Step 5: Commit preflight**

```powershell
git add src/benchmarks/skill-ir/artifact-preflight.ts src/benchmarks/skill-ir/artifact-preflight.test.ts
git commit -m "feat: add artifact package preflight"
```

## Task 4: Validator Execution And One-Repair State Machine

**Files:**
- Create: `src/benchmarks/skill-ir/artifact-runtime.test.ts`
- Create: `src/benchmarks/skill-ir/artifact-runtime.ts`

- [x] **Step 1: Write failing state-machine tests**

Use dependency-injected real functions rather than mock-framework call counts:

```ts
const result = await runArtifactStateMachine({
  mode: "one-repair",
  prepared,
  runGeneration: async () => generationResult,
  runRepair: async (task) => repairResult,
  runValidator,
});
```

Cover:

- initial pass: one generation, zero repair;
- eligible fail in `check-only`: stop after validation;
- eligible fail in `one-repair`: exactly one repair and one revalidation;
- second fail: stop, never call a third model invocation;
- invalid validator JSON/schema, timeout, checker crash, provider failure, and
  protected-file mutation: no repair;
- repair task contains no original prompt, fixtures, eval, hard gates, source
  text, secret, absolute path, free-form validator message, or actual value;
- generation and repair tokens/latency are separate and aggregate correctly.

- [x] **Step 2: Run runtime tests and verify RED**

Run: `bun test ./src/benchmarks/skill-ir/artifact-runtime.test.ts`

Expected: FAIL because the runtime module is missing.

- [x] **Step 3: Implement checker adapter and repair task**

Export:

```ts
export async function executeArtifactValidator(prepared: PreparedArtifactRun): Promise<RuntimeValidationReport>;
export function buildSanitizedRepairTask(report: RuntimeValidationReport): SkvmTaskJson;
export async function runArtifactStateMachine(input: ArtifactStateMachineInput): Promise<ArtifactRuntimeResult>;
```

The repair task uses a static prompt and `JSON.stringify` of a freshly parsed
whitelist report. Set `fixtures` absent and `eval: []`. Run validator with a
bounded timeout. Parse stdout through `RuntimeValidationReportSchema` before
repair construction.

- [x] **Step 4: Run focused tests and typecheck**

```powershell
bun test ./src/benchmarks/skill-ir/artifact-package.test.ts ./src/benchmarks/skill-ir/artifact-preflight.test.ts ./src/benchmarks/skill-ir/artifact-runtime.test.ts
bun run typecheck
```

Expected: pass.

- [x] **Step 5: Commit runtime state machine**

```powershell
git add src/benchmarks/skill-ir/artifact-runtime.ts src/benchmarks/skill-ir/artifact-runtime.test.ts
git commit -m "feat: add bounded artifact repair runtime"
```

## Task 5: Runner And Scoring Integration

**Files:**
- Modify: `src/benchmarks/skill-ir/matrix.ts`
- Modify: `src/benchmarks/skill-ir/matrix.test.ts`
- Modify: `src/benchmarks/skill-ir/real-agent.ts`
- Modify: `src/benchmarks/skill-ir/real-agent-run.ts`
- Modify: `src/benchmarks/skill-ir/real-agent-run.test.ts`
- Modify: `src/benchmarks/skill-ir/scoring.ts`
- Modify: `src/benchmarks/skill-ir/scoring.test.ts`

- [x] **Step 1: Write failing matrix and CLI guard tests**

Add `ir-artifact-dev` to `ExperimentSystem`, prove it is absent from
`COLD_START_EXPERIMENT_SYSTEMS`, and require:

```text
--allow-artifact-development-replay
--artifact-package-dir=<dir>
--artifact-repair-mode=check-only|one-repair
--corpus=pilot
--skills=env-manager
--systems=ir-artifact-dev
--contexts=clean
explicit development --tasks
```

Reject combination with tasks-authored/development replay, IR override,
held-out tasks, multiple skills, or unsupported scopes.

- [x] **Step 2: Run guard tests and verify RED**

```powershell
bun test ./src/benchmarks/skill-ir/matrix.test.ts ./src/benchmarks/skill-ir/real-agent-run.test.ts
```

Expected: failures for the missing system and arguments.

- [x] **Step 3: Implement package-aware planning**

Validate package provenance during `buildPlan`, materialize the package
`skill.md` for `ir-artifact-dev`, carry packageDir/repairMode/contractDigest in
the plan entry, and keep the system absent from every default matrix.

- [x] **Step 4: Write failing execution and scoring tests**

Prove `executePlan` resets/materializes the workdir once, delegates the initial
and optional repair command through the state machine, writes runtime metadata
to `raw-runs.jsonl`, and preserves the final workdir. Prove scoring still calls
the existing deterministic evaluator while exposing:

```ts
artifactRuntime: {
  mode,
  initialValidation,
  finalValidation,
  repairAttempted,
  repairedToPass,
  generationUsage,
  repairUsage,
  aggregateUsage,
}
```

The scored row's token/latency totals use aggregate usage when present; the
evaluator criteria and thresholds remain unchanged.

- [x] **Step 5: Run execution/scoring tests and verify RED**

```powershell
bun test ./src/benchmarks/skill-ir/real-agent-run.test.ts ./src/benchmarks/skill-ir/scoring.test.ts
```

Expected: fail before integration.

- [x] **Step 6: Implement process adapter and persistence**

Create a small internal `executeCommand` helper returning exit code, status,
stdout, stderr, duration, and parsed token usage. Build the repair command by
replacing only `--task=...`; preserve model, adapter, skill, and workdir. Append
one final raw row per matrix row after the bounded state machine stops.

- [x] **Step 7: Run focused integration tests and typecheck**

```powershell
bun test ./src/benchmarks/skill-ir/matrix.test.ts ./src/benchmarks/skill-ir/real-agent-run.test.ts ./src/benchmarks/skill-ir/scoring.test.ts
bun run typecheck
```

Expected: pass.

- [x] **Step 8: Commit Runner integration**

```powershell
git add src/benchmarks/skill-ir/matrix.ts src/benchmarks/skill-ir/matrix.test.ts src/benchmarks/skill-ir/real-agent.ts src/benchmarks/skill-ir/real-agent-run.ts src/benchmarks/skill-ir/real-agent-run.test.ts src/benchmarks/skill-ir/scoring.ts src/benchmarks/skill-ir/scoring.test.ts
git commit -m "feat: orchestrate executable artifact runs"
```

## Task 6: Emit Package, Freeze Lock, And Document

**Files:**
- Create: `benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1/**`
- Create: `benchmarks/skill-ir/pilots/env-manager/env-manager-executable-artifact-v1-lock.json`
- Modify: `src/benchmarks/skill-ir/env-manager-pilot.test.ts`
- Create: `docs/skill-ir/executable-artifact-runtime.md`
- Modify: `docs/skill-ir/skill-ir-aot-optimization-plan.md`
- Modify: `docs/skill-ir/validated-skill-artifact-package.md`

- [x] **Step 1: Write failing package/lock tests**

Assert exact catalog/provenance/package digests, one skill, development split,
two task ids, two repair modes, two repetitions, GPT-4.1-mini, bare-agent,
Windows, clean context, no secrets, and explicit held-out/scorer-tuning
prohibitions. Execute the emitted checker against malformed and structurally
valid temporary workdirs.

- [x] **Step 2: Run the pilot test and verify RED**

Run: `bun test ./src/benchmarks/skill-ir/env-manager-pilot.test.ts`

Expected: FAIL because package and lock do not exist.

- [x] **Step 3: Emit and verify the package**

Run the compiler with frozen inputs:

```powershell
bun ./src/benchmarks/skill-ir/artifact-package-run.ts '--base-ir=benchmarks/skill-ir/pilots/env-manager/base-ir.json' '--repair-evidence=results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/repair-evidence.json' '--tasks=benchmarks/skill-ir/pilots/env-manager/tasks.json' '--source=benchmarks/skill-ir/pilots/env-manager/source/SKILL.md' '--predecessor=results/skill-ir/env-manager-dual-overlay-v1-2026-07-16/provenance.json,results/skill-ir/env-manager-dual-overlay-v2-2026-07-16/provenance.json' '--out-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1'
```

Then run `--verify-only` against the emitted directory.

- [x] **Step 4: Add the frozen lock and component documentation**

The lock records package manifest/provenance digests and the 8-row initial
generation matrix. Documentation includes architecture, files, CLI, checker
contract, repair whitelist, scorer distinction, failure taxonomy, cost fields,
tests, and modification notes. Update the canonical ledger without claiming a
real improvement before paid execution.

- [x] **Step 5: Run pilot and focused package tests**

```powershell
bun test ./src/benchmarks/skill-ir/artifact-package.test.ts ./src/benchmarks/skill-ir/artifact-package-compiler.test.ts ./src/benchmarks/skill-ir/artifact-preflight.test.ts ./src/benchmarks/skill-ir/artifact-runtime.test.ts ./src/benchmarks/skill-ir/env-manager-pilot.test.ts
bun run typecheck
```

Expected: pass.

- [x] **Step 6: Commit package and documentation**

```powershell
git add benchmarks/skill-ir/pilots/env-manager src/benchmarks/skill-ir/env-manager-pilot.test.ts docs/skill-ir/executable-artifact-runtime.md docs/skill-ir/skill-ir-aot-optimization-plan.md docs/skill-ir/validated-skill-artifact-package.md
git commit -m "feat: freeze env-manager executable artifact package"
```

## Task 7: Full Verification And Development Dry Run

**Files:**
- Modify: `docs/skill-ir/executable-artifact-runtime.md`
- Modify: `D:/skill优化/conversation_log.md`

- [ ] **Step 1: Run fresh full verification**

```powershell
bun test ./src/skill-ir ./src/benchmarks/skill-ir ./src/bench/evaluators
python scripts/analyze_skill_ir_results_test.py
python scripts/analyze_skill_ir_slices_test.py
bun run typecheck
git diff --check
```

Expected: all tests pass, typecheck exits 0, and no whitespace errors exist.

- [ ] **Step 2: Generate the explicit dry-run plan**

```powershell
bun ./src/benchmarks/skill-ir/real-agent-run.ts '--corpus=pilot' '--allow-artifact-development-replay' '--artifact-package-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1' '--artifact-repair-mode=check-only' '--skills=env-manager' '--systems=ir-artifact-dev' '--contexts=clean' '--agents=skvm' '--environments=windows' '--tasks=env-manager-node-audit-dev-001,env-manager-vite-audit-dev-002' '--repetitions=2' '--model=xty/gpt-4.1-mini' '--model-family=gpt' '--adapter=bare-agent' '--adapter-version=workspace-executable-artifact-v1' '--panel-config-id=env-manager-executable-artifact-v1-check-only' '--limit=2' '--out-dir=results/skill-ir/env-manager-executable-artifact-v1-check-only-dry-run'
```

Repeat with `one-repair` and its panel/out ids. Verify each plan has four rows,
only development tasks, package identity, distinct workdirs, and no API key.

- [ ] **Step 3: Record results and remaining paid-run gate**

Update the component doc and conversation log with exact commands and outputs.
Do not mark semantic effectiveness complete and do not run held-out. Paid
development execution follows only after route probe and local dry-run gates.

- [ ] **Step 4: Commit completion records and push**

```powershell
git add docs/skill-ir/executable-artifact-runtime.md
git commit -m "docs: record executable artifact dry run"
git push origin skill-ir-aot
```

## Plan Self-Review

- Spec coverage: package source/provenance, closed repair input, template and
  validator, preflight, protected workdir, check-only ablation, one-repair
  bound, scorer separation, cost split, Runner guards, lock, and no-held-out
  boundary each map to a task above.
- Gold isolation: compiler sees only an explicit task prompt projection and
  `RepairEvidence`; repair task contains neither original benchmark task nor
  evaluator fields.
- Type consistency: package validation feeds `PreparedArtifactRun`; preflight
  feeds `ArtifactStateMachineInput`; runtime metadata is the only new raw/scored
  row extension.
- Scope: pooled models, held-out execution, adapter interception, L4 promotion,
  arbitrary skill packages, and token break-even remain excluded.
- Placeholder scan: every implementation step names concrete files, APIs,
  commands, expected outcomes, and commit boundaries.
