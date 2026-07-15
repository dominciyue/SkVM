# Semantic Artifact Runtime

## Status

Implementation in progress under the reviewed
`executable-semantic-artifact/v2` design. Tasks 1-3 freeze the A contract/report
schemas, dormant B boundary, conservative derivation, and deterministic package
compiler. The emitted checker deliberately fails closed until Task 4. No lock,
runtime evidence file, Runner path, API run, or optimization evidence exists.

## Current Components

| File | Responsibility |
|---|---|
| `classification-evidence.ts` | Strict dormant B evidence schemas and types only. |
| `semantic-contract.ts` | Strict A runtime contract, scan policy, v2 report, and closed semantic code catalog. |
| `semantic-evidence.ts` | Conservative dotenv/TypeScript AST evidence derivation over agent-visible workdirs. |
| `semantic-evidence-cli.ts` | Bundle entrypoint that derives a contract from workdir plus package policy. |
| `semantic-artifact-compiler.ts` | Deterministic v2 package compiler with provenance and sink isolation. |
| `semantic-artifact-run.ts` | Compile and verify-only command-line entrypoint. |
| `artifact-package.ts` | Literal v1 schemas plus separate v2 schemas and catalog dispatch. |

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

The Task 3 checker is intentionally fail-closed. A compiled package is a
verified package layout, not yet an executable semantic validator or successful
optimization result. Task 4 replaces that placeholder only after one RED fixture
per A error code.

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

## Next Step

Implement the standalone structural plus A-layer checker using one failing
fixture per semantic code. B remains unimported by runtime production paths,
and the checker must emit only the closed v2 report projection.
