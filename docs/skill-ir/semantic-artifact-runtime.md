# Semantic Artifact Runtime

## Status

Implementation in progress under the reviewed
`executable-semantic-artifact/v2` design. Task 1 freezes the catalog-independent
A contract/report schemas and the dormant B type boundary. No package, lock,
runtime evidence file, Runner path, API run, or optimization evidence exists
yet.

## Current Components

| File | Responsibility |
|---|---|
| `classification-evidence.ts` | Strict dormant B evidence schemas and types only. |
| `semantic-contract.ts` | Strict A runtime contract, scan policy, v2 report, and closed semantic code catalog. |
| `semantic-evidence.ts` | Conservative dotenv/TypeScript AST evidence derivation over agent-visible workdirs. |

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

The package compiler will bundle this tested module through a small CLI
entrypoint. This replaces the plan's earlier source-string generation detail
and avoids maintaining a duplicate derivation implementation. Timeout remains
enforced by preflight around the bundled process.

## Next Step

Compile the v2 package, bundle the evidence CLI, and prove recursive canary
isolation plus deterministic package identity. B remains unimported by runtime
production paths.
