# Runner-Orchestrated Executable Artifact Package Design

**Status:** Approved design, implementation pending

**Date:** 2026-07-16

**Scope:** `env-manager` single-model development calibration only

## 1. Goal And Evidence Boundary

This stage builds the first L3-oriented executable artifact package for the
source-backed `env-manager` pilot. It tests whether provenance-bound templates
and validators can make generation more stable than prompt-only Final IR
repairs.

The stage is an engineering calibration, not held-out evidence, pooled-model
evidence, or a completed main claim. It uses a new artifact catalog:

```text
executable-artifact/v1
```

The frozen dual-overlay v1/v2 packages, locks, and results remain unchanged.
They are predecessor evidence and controls, not the semantic base of this
package. No held-out run is allowed unless a separately frozen development
gate later passes.

## 2. Selected Architecture

The benchmark runner orchestrates the artifact lifecycle:

```text
preflight
  -> materialize deterministic templates
  -> model generation
  -> runtime validation
  -> at most one sanitized model repair
  -> runtime revalidation
  -> stop
  -> existing offline deterministic scorer
```

Runner orchestration is selected because it can enforce call count, package
integrity, workdir boundaries, and cost accounting without depending on the
agent to remember the protocol. Agent self-orchestration is rejected for v1.
Global adapter interception is deferred until the package contract works in one
pilot without changing adapter semantics.

Provider retries for infrastructure failures remain separate from the one
semantic repair call. A provider retry does not consume the repair allowance,
and a semantic repair must not be used to conceal an infrastructure failure.

## 3. Construction Inputs

The v1 package is compiled from exactly these inputs:

1. The frozen, profile-empty `env-manager` base IR.
2. Gold-isolated `RepairEvidence` from frozen `original x development` failure
   lineage and `ir-static x development` residuals.
3. A task-family contract derived only from user-visible task prompts.
4. Source, compiler, pass, contract, and artifact digests.

The task-family contract may describe filenames, JSON field names, types, and
other requirements already shown to the agent. It must not read evaluator
payloads, criterion `expected` values, hard-gate identifiers, held-out results,
secret values, or fixture gold sets. The compiler records the prompt-derived
contract digest so later task drift fails closed.

The package does not consume a failed dual-overlay Final IR as its base. The
v1/v2 candidate and replay result digests may be recorded as predecessor
provenance to explain why executable solidification was attempted.

## 4. Package Layout

```text
optimized-skill/
  package-manifest.json
  skill-ir.json
  skill.md
  package-provenance.json
  validation-policy.json
  artifacts/
    contracts/
      env-manager-output-contract.json
    templates/
      env-report.template.json
      env-schema.template.json
    checks/
      validate-output.ts
```

`skill-ir.json` is a digest-bound copy of the frozen base IR. The first package
does not mutate the Skill IR v1 schema merely to store artifact references.
`package-manifest.json` binds the IR, contract, templates, checker, policy, and
their target references. `skill.md` is a generated human/agent view and names
the executable artifacts; it is not an independent semantic source.

Templates contain explicit sentinels such as `__SKVM_REQUIRED__`. Runtime
validation must reject an unfilled template, so materialization alone cannot
count as successful generation. The package supplies structural scaffolding,
not evaluator answers or concrete expected variable sets.

## 5. Provenance Contract

The package uses a separate provenance schema, provisionally:

```text
skill-ir-artifact-package-provenance/v1
```

It records:

- source URL, commit, path, license scope, and source digest;
- base IR path and digest;
- development-only repair-evidence path and digest;
- task-family contract derivation and digest;
- artifact catalog, compiler/pass identity, and configuration digest;
- every emitted artifact path and digest;
- construction split and selected pilot;
- predecessor dual-overlay package/result digests;
- supported runner, adapter, host OS, context, and model scope.

Paths inside the package and provenance are repository- or package-relative.
The new schema does not overwrite `FinalIRProvenance` v1/v2 or reinterpret an
old lock.

## 6. Preflight

Preflight runs before templates or model calls and fails closed. It verifies:

- package schema, catalog, provenance, and all declared digests;
- every package path is relative, normalized, and contained in the package;
- the checker runtime is available and the checker has a bounded timeout;
- no undeclared network access or package installation is required;
- the selected task is a preregistered development task for the selected skill;
- its user-visible contract digest matches the package contract;
- the selected model, adapter, context, and host scope match the lock;
- the workdir exists and generated output paths remain inside it.

Before generation, the runner snapshots all pre-existing workdir files except
the declared generated-output paths. Any later mutation of a protected file is
a semantic hard stop and is not eligible for model repair. This snapshot is
derived from the materialized workdir, not from hidden scorer data.

Package corruption, digest mismatch, checker crash, checker timeout, unsupported
scope, and invalid path containment are infrastructure/package failures. They
do not trigger a semantic repair call.

## 7. Runtime Validation Report

The runtime checker emits a closed, machine-validated report:

```json
{
  "schemaVersion": "runtime-validation-report/v1",
  "status": "fail",
  "repairEligible": true,
  "errors": [
    {
      "code": "MISSING_FIELD",
      "relativePath": "env-report.json",
      "jsonPointer": "/missing",
      "missingField": "missing",
      "expectedType": "array"
    }
  ]
}
```

The repair-facing field whitelist is fixed:

```text
code | relativePath | jsonPointer | missingField | expectedType
```

`code` and `expectedType` use closed enums. `relativePath` must be normalized
and workdir-relative. Reports containing additional properties, free-form
messages, file contents, snippets, actual values, original skill text, secret
values, or absolute paths are rejected as validator infrastructure failures.

The v1 checker may validate declared files, parseability, user-visible fields
and types, unfilled template sentinels, generic synthetic-secret patterns, and
protected-file integrity. It must not reproduce the offline scorer's exact
gold classifications or expected finding sets.

## 8. One-Repair State Machine

After the first model generation, the runner executes the package checker.

- On `pass`, it stops without another model call.
- On an eligible semantic `fail`, `check-only` stops and
  `check+one-repair` performs exactly one repair call.
- On package, preflight, validator, or provider infrastructure failure, it
  records infrastructure failure and never constructs a semantic repair.
- On protected-file mutation, it records a semantic hard stop and does not
  offer the model a chance to rewrite evidence.

The repair prompt contains only a static instruction plus the schema-validated
whitelist projection of `ValidationReport`. It tells the same model and adapter
to edit declared generated artifacts in the same workdir, preserve protected
files, and stop. It contains no hidden task data, scorer payload, original
file content, secret, or absolute path. The runner revalidates once and then
stops regardless of the result.

The state machine therefore permits at most two semantic model calls per row:
one generation and zero or one repair.

## 9. Check-Only Ablation

The same package supports two explicit modes:

```text
check-only
check+one-repair
```

Only the repair transition differs. Package, task, model, adapter, context,
repetitions, templates, validator, and offline scorer stay frozen. This
ablation separates the benefit of executable checking/templates from the
benefit and cost of an additional model call. It is diagnostic and does not
enter the default benchmark matrix.

The runner CLI should expose an explicit option such as:

```text
--artifact-repair-mode=check-only|one-repair
```

## 10. Runtime Validator Versus Offline Scorer

The runtime validator is a control mechanism for structural and safety repair.
It is not the benchmark scorer and cannot declare benchmark success. Main
success remains determined from the final workdir and final agent output by the
existing frozen deterministic `env-manager` scorer.

Results must report the two layers separately:

- initial and final runtime validation status;
- whether repair was attempted and whether it repaired validation to pass;
- offline deterministic score, binary success, and hard-gate status;
- generation token/latency cost;
- repair token/latency cost;
- aggregate model and artifact-execution cost.

Scorer rules are not changed to make runtime validation look effective.

## 11. Runner And Experiment Guardrails

The development system label is `ir-artifact-dev`. It is absent from default
matrices and requires explicit package-development flags, one pilot skill,
clean context, named development tasks, exact package provenance, and the new
lock. It is not an alias for `ir-pgo-dev` or held-out `ir-pgo`.

The first lock is provisionally:

```text
benchmarks/skill-ir/locks/env-manager-executable-artifact-v1-lock.json
```

The proposed calibration freezes `xty/gpt-4.1-mini`, `bare-agent`, Windows,
clean context, both development tasks, two repetitions, package digests, and
both repair modes. This yields eight initial-generation rows; repair calls are
conditional and are counted separately.

Before paid execution, run route probe, package verification, dry-run matrix,
and scorer-fixture tests. The provisional one-repair gate remains conservative:

```text
success >= 3/4
mean deterministic score >= 0.85
hard-gate regressions = 0
infrastructure failures = 0
```

`check-only` is an attribution control, not a gate substitute. If the
one-repair mode fails, no held-out run is scheduled and the failure remains a
development result.

## 12. Failure Classification

| Event | Class | Repair allowed |
|---|---|---:|
| Package/provenance/digest/path preflight failure | Infrastructure/package | No |
| Provider failure after normal provider retries | Infrastructure | No |
| Checker crash, timeout, or invalid report schema | Infrastructure/validator | No |
| Missing or malformed generated artifact | Semantic validation | At most once |
| Unfilled template sentinel | Semantic validation | At most once |
| Generic secret-pattern occurrence in generated output | Semantic safety | At most once, without exposing the value |
| Protected pre-existing file mutation | Semantic hard stop | No |
| Second validation failure | Final semantic failure | No |

## 13. TDD And Verification Plan

Implementation starts with failing tests for:

1. package schema, catalog, path containment, and digest validation;
2. prompt-only task-contract extraction and evaluator/gold isolation canaries;
3. deterministic template emission and sentinel rejection;
4. strict `ValidationReport` enums, fields, relative paths, and serialization;
5. preflight scope, workdir snapshot, and protected-file checks;
6. `check-only` and one-repair state transitions, including exactly-once calls;
7. no repair after infrastructure failure or protected-file mutation;
8. repair-prompt leakage canaries for secrets, absolute paths, contents, and
   undeclared fields;
9. separate generation/repair token and latency accounting;
10. fail-closed runner CLI guards and package-provenance enforcement;
11. unchanged offline scorer behavior on the final workdir;
12. package tamper and invalidation cases.

After focused tests pass, run the full Bun suite, Python tests, and TypeScript
typecheck. Then generate the package, verify it, materialize a dry-run, and only
after those gates pass execute the frozen development calibration.

## 14. Non-Goals For V1

- No held-out, pooled-model, Linux, or cross-adapter claim.
- No automatic promotion to Final IR or L4.
- No agent-selected validator, arbitrary package code, or networked checker.
- No more than one semantic repair call.
- No scorer-derived contract or gold-bearing repair message.
- No replacement of the dual-overlay provenance or lock catalogs.
- No token-savings claim before repeated package reuse and break-even analysis.
