# Semantic Artifact Runtime

## Status

Implementation in progress under the reviewed
`executable-semantic-artifact/v2` design. Tasks 1-3 freeze the A contract/report
schemas, dormant B boundary, conservative derivation, and deterministic package
compiler, standalone A-layer checker, catalog-dispatched preflight, and bounded
v2 runtime report/repair handling. No lock, Runner execution path, API run, or
optimization evidence exists.

## Current Components

| File | Responsibility |
|---|---|
| `classification-evidence.ts` | Strict dormant B evidence schemas and types only. |
| `semantic-contract.ts` | Strict A runtime contract, scan policy, v2 report, and closed semantic code catalog. |
| `semantic-evidence.ts` | Conservative dotenv/TypeScript AST evidence derivation over agent-visible workdirs. |
| `semantic-evidence-cli.ts` | Bundle entrypoint that derives a contract from workdir plus package policy. |
| `semantic-artifact-compiler.ts` | Deterministic v2 package compiler with provenance and sink isolation. |
| `semantic-artifact-run.ts` | Compile and verify-only command-line entrypoint. |
| `semantic-checker-cli.ts` | Bundled structural/safety plus A-layer checker entrypoint. |
| `artifact-package.ts` | Literal v1 schemas plus separate v2 schemas and catalog dispatch. |
| `artifact-preflight.ts` | V1 fixture snapshot or v2 evidence derivation plus protected snapshot. |
| `artifact-runtime.ts` | Catalog-dispatched validation and check-only/one-repair state machine. |

`classification-evidence.ts` exports no producer, writer, derivation function,
or serializer. Its `ClassificationCandidate.value` is an identifier, never a
dotenv or source value. Strict schemas reject actual values and extra fields.

## Schema Identities

```text
skill-ir-semantic-runtime-contract/v1
runtime-validation-report/v2
semantic-error-codes/v1
```

V1 remains on `runtime-validation-report/v1` and its original code enum. V2
codes do not parse through the v1 schema.

The v2 report exposes only:

```text
code | relativePath | jsonPointer | missingField | expectedType
```

Each code has an exact required/allowed field combination. A field may not be
added merely because it belongs to the global whitelist. For example,
`MISSING_FILE` accepts `relativePath` and rejects `expectedType`.

## A Contract Surface

The runtime contract may contain observed variable identifiers, evidence-kind
ids, relative source references, deterministic inferred types, public
constraints, sensitive-marker requirements, source-qualified findings, and
closed limitations. It cannot contain classification candidates, dispositions,
actual values, source snippets, or free-form evidence text.

The initial semantic codes are:

```text
MISSING_OBSERVED_VARIABLE
INVALID_RULE_TYPE
MISSING_RULE_CONSTRAINT
MISSING_SENSITIVE_MARKER
UNSUPPORTED_RULE_FIELD
INVALID_SOURCE_QUALIFIED_FINDING
MISSING_SOURCE_QUALIFIED_FINDING
```

Structural/safety codes needed by the v2 checker are versioned into the same
closed catalog. Changing code meaning or field combinations requires a new
catalog version and lock.

## Verification

```powershell
bun test ./src/benchmarks/skill-ir/classification-evidence.test.ts ./src/benchmarks/skill-ir/semantic-contract.test.ts ./src/benchmarks/skill-ir/artifact-package.test.ts
bun run typecheck
```

Task 1 result: 12 tests passed, 0 failed, 56 assertions; typecheck passed.
The initial RED failed because both modules were absent. A second RED proved
that `MISSING_FILE + expectedType` was incorrectly accepted before exact
allowed-field enforcement was added.

## Evidence Derivation

Task 2 derives only:

- dotenv variable names;
- static `process.env.NAME` and literal element references;
- explicit integer conversion through `Number` or `parseInt`;
- port range only when integer evidence and the public port rule both exist;
- sensitive-marker requirements from public name tokens;
- hardcoded findings only for sensitive-named literal assignments.

Removing any required evidence removes the corresponding assertion. Dynamic
environment access, unsupported source extensions, and unsupported UTF-8
encoding produce closed limitations. Symlinks and hard scan limits fail closed.
Serialized contracts contain no dotenv value, source literal, or source snippet.

Task 2 result: 4 tests passed, 0 failed, 20 assertions; typecheck passed. The
initial RED failed because the module was absent. A second RED established that
unsupported encoding/extensions and dynamic environment access were being
silently ignored before closed limitations were added.

The package compiler bundles this tested module through a small CLI entrypoint.
This replaces the plan's earlier source-string generation detail and avoids
maintaining a duplicate derivation implementation. Timeout remains enforced by
preflight around the bundled process.

## V2 Package Compiler

The compiler reads the digest-bound `env-manager` base IR and real source, then
projects only development task ids/splits/prompts into the public output
contract. Evaluator payloads, criterion and hard-gate ids, thresholds,
held-out prompts, fixture secret values, and dormant B candidates are not
accepted compiler inputs and do not enter package files or digests.

The v2 manifest and provenance identities are separate from v1:

```text
skill-ir-semantic-artifact-package-manifest/v1
skill-ir-semantic-artifact-package-provenance/v1
executable-semantic-artifact/v2
```

The package includes the base IR/view, public output contract, semantic contract
schema, bundled evidence program, templates, validation policy, and checker.
The policy records the public rules extracted from the verified source, bounded
scan policy, fixed protected path, timeouts, and five-field repair projection.
Package validation checks every digest, manifest/provenance identity, declared
file, and catalog-specific reference. The old v1 schemas and artifact kinds
remain literal and are validated by the same dispatch entrypoint without being
widened.

Task 3 initially emitted a fail-closed checker. Task 4 replaced it only after
one RED fixture per A error code. A compiled package now contains an executable
checker, but preflight has not yet materialized or protected the runtime
contract, so the package is still not Runner-ready or optimization evidence.

### Commands

```powershell
bun ./src/benchmarks/skill-ir/semantic-artifact-run.ts `
  --root-dir=. `
  --base-ir=benchmarks/skill-ir/pilots/env-manager/base-ir.json `
  --tasks=benchmarks/skill-ir/pilots/env-manager/tasks.json `
  --source=benchmarks/skill-ir/pilots/env-manager/source/SKILL.md `
  --out-dir=<local-package-dir>

bun ./src/benchmarks/skill-ir/semantic-artifact-run.ts `
  --verify-only=<local-package-dir>
```

Task 3 TDD result: the first RED failed because the compiler module was absent;
the CLI RED then failed with exit code 1 before its entrypoint existed. Final
verification passed 10 tests and 39 assertions across v2 compiler and v1
package regressions, plus typecheck. Recursive canary scans covered evaluator
expected data, criterion/hard-gate ids, threshold, held-out prompt, secret
values, and B fields.

## Standalone Checker

The bundled checker accepts only `--workdir=<path>`. It reads the public output
contract and validation policy from its package, then reads the fixed protected
runtime contract from the workdir. Runtime-contract parse/read failure exits as
infrastructure failure; it never becomes a repair report.

Validation order is:

1. required files and JSON structure;
2. exact report fields, array/string shapes, template sentinel, and synthetic
   secret prefix;
3. observed-variable schema coverage;
4. deterministic type, constraint, and sensitive-marker requirements;
5. allowed rule vocabulary;
6. source-qualified finding validity and confirmed-finding presence.

The checker emits only `runtime-validation-report/v2` with the closed
`semantic-error-codes/v1` catalog. Output is parsed through the same strict Zod
schema before serialization. It does not import dormant B types and cannot emit
classification dispositions, expected arrays, actual values, source text, or
free-form repair messages.

Task 4 RED: all seven fixtures exited on the explicit fail-closed placeholder.
GREEN: all seven A codes produced their exact field projection. The focused
checker/compiler/contract/package regression run passed 21 tests and 81
assertions; typecheck passed.

## Preflight Materialization

`preflightArtifactRun` is a catalog-discriminated operation. Both catalogs
verify package digests, skill identity, development task id, public task
contract digest, workdir, runtime executable, generated outputs, templates, and
network/package-install policy. Frozen v1 additionally checks its historical
model/adapter/environment/context scope and never creates a semantic contract.

V2 performs this sequence before templates or model generation:

1. validate the fixed `.skvm-artifact/semantic-contract.json` destination;
2. reject pre-existing files, symbolic-link/reparse parents, and path escape;
3. execute the digest-checked evidence bundle under its manifest timeout;
4. require a regular output file and parse it with
   `SemanticRuntimeContractSchema`;
5. snapshot all original fixture files plus the runtime contract by digest.

Evidence-process stderr/stdout and invalid contract contents are not returned
in prepared metadata. Timeout, non-zero exit, missing output, invalid JSON, or
schema mismatch are infrastructure failures. The protected-file list contains
only relative paths and SHA-256 digests.

Task 5 RED retained all five existing v1 passes while all v2 cases failed at
the old v1-only catalog guard. GREEN passed nine preflight tests, including
contract derivation/protection, v1 absence, junction/escape rejection, timeout,
and invalid JSON. The focused preflight/runtime/package/compiler regression
passed 26 tests and 101 assertions; typecheck passed.

## Runtime Reports And Repair

Runtime report parsing dispatches on `PreparedArtifactRun.catalog`:

```text
executable-artifact/v1          -> runtime-validation-report/v1
executable-semantic-artifact/v2 -> runtime-validation-report/v2 + semantic-error-codes/v1
```

The state machine is unchanged: generation, protected check, validation,
optional one repair, protected check, one revalidation, stop. Provider,
validator/report-schema, evidence, and protected-file failures never invoke
repair. Protected mutation reports use the matching catalog but always set
`repairEligible=false`.

Both report versions are projected to the same five fields. V2 adds only this
static guidance to the repair prompt:

```text
Inspect the protected runtime contract at .skvm-artifact/semantic-contract.json;
do not modify it.
```

The contract body is not serialized into the task. Invalid B fields,
dispositions, actual values, messages, absolute paths, and any extra report
field fail strict parsing before a repair call.

Task 6 RED showed three v1-only assumptions: checker parse rejected v2, repair
builder rejected v2, and the state machine stopped before repair. GREEN passed
10 runtime tests. The focused runtime/preflight/contract/checker regression
passed 30 tests and 122 assertions; typecheck passed.

## Deterministic Activation Baseline

The local activation fixture uses the same public workdir in frozen v1 and v2:

```text
.env                 APP_PORT name/value visible to the agent
src/config.js         Number(process.env.APP_PORT)
.env.schema.json      { "variables": {} }
env-report.json       valid five-array structure
```

This output passes the v1 structural checker. V2 derives `APP_PORT`, explicit
`integer`, and the public port constraints, then fails first on the closed
`MISSING_OBSERVED_VARIABLE` projection. A deterministic repair adds the schema
entry and reaches pass after exactly one repair and one revalidation. A no-op
repair stops after the second failed validation with no third call.

Task 7 is an acceptance freeze rather than a new production-code TDD cycle. Its
first run passed all three tests and seven assertions because Tasks 1-6 had
already implemented the behavior under their own RED/GREEN cycles. It uses no
scorer payload, expected classification set, model, API, or held-out data.

## Runner Planning Boundary

V2 remains an explicit `ir-artifact-dev` diagnostic path. It is absent from the
cold-start/default systems and requires all existing development replay guards:

```text
corpus=pilot
one explicit skill
system=ir-artifact-dev only
context=clean
explicit development tasks
explicit package + lock + repair mode
no IR override and no other development bypass
```

The Runner validates package catalog first. V1 then requires the literal v1
lock and historical package scope. V2 requires a distinct temporary/test lock
identity with `executable-semantic-artifact/v2` and
`semantic-error-codes/v1`; model, adapter, context, environment, tasks,
repetitions, package digests, and repair mode are bound by that lock. A v1 lock
cannot authorize a v2 package. Held-out tasks remain rejected.

No real v2 lock is committed in Task 8. Tests create a temporary lock whose
`prohibited` text marks it test-only; its gate values have no research or paid
execution authority. `real-agent.ts` and `matrix.ts` required no edits because
their artifact fields and default exclusion were already catalog-neutral.

Task 8 RED failed only at the old v1-only package catalog guard while 37 prior
Runner tests passed. GREEN passed 53 Runner/matrix/package tests and 171
assertions; typecheck passed.

## Committed Local Baseline

The deterministic package is committed at:

```text
benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2
```

It contains 11 files: manifest, provenance, and nine declared artifacts. Frozen
top-level digests are:

```text
package-manifest.json   b89470654bbab645563caeceafcdff1c33350b3fa35e72730231b35b94169a96
package-provenance.json d0c3535f5c25c4b9c2f431dd0753701f371c40cd62d8932b1fd81d6cc5f33e7c
```

Compile and verify:

```powershell
bun ./src/benchmarks/skill-ir/semantic-artifact-run.ts `
  --root-dir=. `
  --base-ir=benchmarks/skill-ir/pilots/env-manager/base-ir.json `
  --tasks=benchmarks/skill-ir/pilots/env-manager/tasks.json `
  --source=benchmarks/skill-ir/pilots/env-manager/source/SKILL.md `
  --out-dir=benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2

bun ./src/benchmarks/skill-ir/semantic-artifact-run.ts `
  --verify-only=benchmarks/skill-ir/pilots/env-manager/packages/executable-semantic-artifact-v2
```

The activation workdir derives one observed variable (`APP_PORT`), one explicit
type, two public constraints, and no source-qualified finding. The known output
passes v1 and fails v2 with one `MISSING_OBSERVED_VARIABLE`; deterministic
repair converts it to pass exactly once.

Full local verification on 2026-07-16:

```text
Bun:    312 passed, 0 failed, 1338 assertions (38 files)
Python: 9/9 result-analyzer tests; 8/8 slice-analyzer tests
TypeScript typecheck: passed
git diff --check: passed
```

This baseline proves package determinism/integrity, gold isolation, preflight,
semantic activation, bounded repair, and planning guards. It does not prove
model-generated repair quality, offline scorer improvement, cross-model
stability, held-out benefit, or token savings. No real v2 lock, numerical gate,
API result, or held-out result exists.

## Next Step

Stop for review. The next task is explicitly non-automatic: propose and review
a development gate/lock before any route probe or paid development run.
