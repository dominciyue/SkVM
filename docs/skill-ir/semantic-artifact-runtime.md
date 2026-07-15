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

## Next Step

Implement the bounded A evidence program with real temporary-workdir tests and
paired reverse-evidence mutations. B remains unimported by production runtime
paths.
