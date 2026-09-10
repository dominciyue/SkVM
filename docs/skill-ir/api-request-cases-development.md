# Shared API request cases development

## D5 choice and comparison contract

Baseline `e6fa621`, twelve actual documents, three source-backed skill duties: each member
has 303 operations, 8 v2-local passes and 295 rejects. `baseline-v2/gap-analysis.json`
counts the complete findings, not only first errors. Formats affect 28 operations/nine
documents; structured bodies affect 40/four, with nested/nullable/composition gaps too.
All three reviewed members require constraint-respecting request cases. These are shared
construction needs, whereas missing 401/400 trigger evidence is not a code feature.

D5 adds two related capabilities: bounded recursive schema witnesses (objects, arrays,
local acyclic refs and checked composition), and format/boundary-aware request cases.
Existing v2 modules, contract, checker and historical outputs stay unchanged. New
`api-request-cases/v1` reports are a separate capability column, not relaxed v2 passes.
It must retain every source operation and every selected skill obligation. An operation
may have verified request-schema cases while its status assertions, output format or
business lifecycle remains unverified; full skill success is still false.

Alternative considered: merely allow more v2 schema keywords. Rejected because its flat
field ABI cannot represent nested constraints, and error-response evidence cannot be
invented. Alternative: unconstrained model-generated cases. Useful for D6 comparison,
but not an independently checkable deterministic shared construction improvement.

## Schema semantics and independent oracle

Input schema dialect is OpenAPI 3.0.x only for this first increment. The generator walks
the original schema and makes bounded candidates; it does not delete constraints to get
a witness. The checker separately adapts OAS 3.0 schema semantics to Ajv 8.20.0 with
ajv-formats 3.0.1 in full mode, no coercion/default insertion/property removal.
It never imports generator value-selection functions. Unknown validation keywords and
unhandled references are explicit unsupported/unresolved, not ignored validations.

OAS boolean exclusive bounds become numeric draft-07 bounds; nullable applies only with
an explicit local type and does not extend enum; readOnly required fields are response
only and are omitted/prohibited in generated requests. Annotation-only local reference
siblings follow OAS 3.0 Reference Object semantics; validation-bearing siblings are
unresolved in this bounded contract. External/cyclic references are not fetched or guessed.
Composition candidates must satisfy the full original allOf/anyOf/oneOf assertion, so
choosing the first alternative is not proof. Patterns have a conservative safe grammar;
out-of-grammar patterns remain unsupported even if a sample happens to match.

Bounds: schema depth 24, 4096 visited nodes, 64 candidate alternatives, collection size
64, generated string length 512. Exhaustion means construction-unresolved, not source
invalid. Unknown formats remain unsupported. Neither generator nor checker calls an API.

Primary references (consulted 2026-09-11):

- [OpenAPI 3.0.3 schema, reference, parameter and security semantics](https://spec.openapis.org/oas/v3.0.3).
- [Ajv schema dialect and nullable behavior](https://ajv.js.org/json-schema.html).
- [Ajv full format validation and supported OpenAPI formats](https://ajv.js.org/packages/ajv-formats.html).

## Execution and obligations

Reuse source enumeration, dependency-preserving projection and independent source coverage
and dependency verification. Build minimal/full request values and structurally negative
cases with source-located obligations. Keep parameter and auth inheritance, refs, security
OR/AND requirements and source advisories. Credential placeholders mean a required
runtime input, never proof of authentication. No real business requests are sent.

Schema-invalid cases are checked as invalid against their original schema; expected HTTP
status is unresolved absent explicit trigger evidence. Required-field, type, range, enum,
pattern and collection obligations stay visible when a mutation cannot be constructed.
Source status lists alone do not prove which invalid request causes which response.

Compare both the unchanged v2 metric and new per-obligation coverage on all twelve documents
and all three skills. Mutation checks must catch removed nested fields, wrong constraints,
invalid values/formats, lost inheritance/security/refs, operation omission and source binding
drift at the appropriate layer. Native source-required output conformance remains a separate
deliverable; request JSON alone must not be called pytest/Newman/Drift test completion.

## Current increment and evidence

`api-schema-witness.ts` constructs values; `api-schema-checker.ts` independently validates
them. `api-schema-obligations.ts` enumerates source obligations; `api-schema-cases.ts`
constructs mutations; `api-schema-case-checker.ts` re-enumerates from source and checks
the specific expected keyword/instance location. Operation-level modules retain source
coverage, inheritance and residual duties. Runtime report envelopes are checked, not
trusted merely because TypeScript declares a type.

First real run is preserved at `results/skill-ir/skill-family-deepening-20260911/request-cases-first/`.
Its report-integrity gates passed on twelve inputs, but that does not prove complete
obligation coverage. A subsequent targeted test exposed an enumeration claim gap:
dictionary-value schemas and `not` were not represented by negative obligations.
They now explicitly make obligation enumeration incomplete; unknown keywords likewise.
The first run is pre-fix evidence and must not be cited as proving complete enumeration.
This correction does not invalidate independently checked positive witness values.

Reproduce into a NEW output directory:

```powershell
bun scripts/skill-ir/api-request-cases-development.ts --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/skill-family-deepening-20260911/request-cases-reproduction
bun test ./src/skill-ir/api-schema-witness.test.ts ./src/skill-ir/api-schema-cases.test.ts ./src/skill-ir/api-request-cases.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Current tests: 14 pass / 63 assertions. Missing-module, short unique strings, incompatible
formats, full/minimal substitution, malformed report envelopes and unmodeled obligation
enumeration all had observed RED results before repair. Actual wire serialization and
native output are still pending; D5 is not complete.

### Next increment: wire parameter contract

Add a bounded parameter encoder and independent inverse verifier. Initial support is
primitive or primitive-array values: path/header simple, query/cookie form, query
spaceDelimited/pipeDelimited arrays. Percent-encode URI atoms before adding structural
delimiters; header atoms remain plain and reject control characters and ambiguous commas.
Nested/object, content parameters, allowReserved=true, empty arrays and null remain
explicit unsupported rather than guessing wire semantics. Query repeated keys follow
form explode, not array CSV by default. The verifier must reject a changed delimiter,
missing/duplicate item or changed value against the source parameter and expected value.
This increment alone is not a complete HTTP request or authentication implementation.

Wire-bearing reports use `api-request-cases/v2` (not the unrelated frozen OpenAPI subset v2).
The prior schema-only v1 remains recoverable at commit 9fae902, including first-run evidence.
`api-parameter-wire.ts` and its independent inverse checker are covered by normative-style
goldens and value/delimiter/error injection tests. Per-schema wire cases bind every covered
schema case, retain unsupported encodings, and leave complete parameter presence/auth/status
duties residual. Report checker metrics separate schema values, enumerated obligations and
wire fragments. Current focused suite is 23 tests / 122 assertions; explicit script strict
typecheck passes with the repository's allowImportingTsExtensions convention.

D8 adds bounded content-keyed compilation reuse only; original source adaptation,
annotations and per-value checks remain fresh. See
[cache design and evidence](api-schema-compile-cache-development.md). All twelve
new-member semantic reports equal the archived pre-cache first run; full source duties
remain incomplete.

### Post-D7 correction: exact negative constraint identity

An injected `allOf: [{minLength:2},{minLength:5}]` case with value `four`
was incorrectly counted as violating the first branch: the old generator/checker
matched only keyword and instance location. The observed RED returned no errors.
Required properties in a shared required array had the analogous identity risk.

Revision: independently enumerate the adapted validation schema path alongside the
original source locator, preserving composition indices, escaped property names and
reference inlining. Negative coverage now requires keyword + instancePath + exact
schemaPath; required errors additionally match Ajv's missingProperty. Ajv error params
are copied per invocation. No source predicate or expected HTTP status is relaxed.
`validationSchemaPath` is additive v1 diagnostic metadata. Old artifacts may omit it:
verification still computes the exact path from original input, never trusts the omission
or an artifact-supplied target. A present mismatching field fails binding.

First-run/D8 reports are retained as pre-correction evidence, not retrospectively
overwritten. Recheck their actual cases under the corrected oracle before citing
constraint-specific coverage. This is a correctness repair, not a new unseen test.

### Next construction increment: overlapping oneOf objects

Actual Adatree ConsentUpdateViaDashboardRequest combines two all-optional object
branches without additionalProperties=false. Building only values valid for each
selected branch also validates the other branch; old candidates therefore remain
unresolved. This is not a proof that the source has no witness.

Design: retain existing candidates first. For full mode only, within the existing
64-attempt budget, consider a single property named by the competing branches and
one of six fixed primitive/container sentinel values. This can falsify a competitor
while preserving the chosen branch. Every result still passes the unchanged independent
Ajv checker and full-shape checker on the original entire schema. Do not modify
additionalProperties, invent status assertions or relax minimal-shape rules. Minimal
may remain unresolved; no SAT-completeness claim. No repository/path branch.

Implementation steps: add synthetic overlapping-object and actual Adatree RED tests;
change only the choices candidate path in api-schema-witness.ts; run schema and operation
regressions; run the fixed twelve inputs into a new development output and preserve
every changed/unresolved obligation. Reject impossible identical branches as before.
This follows [JSON Schema composition semantics](https://json-schema.org/understanding-json-schema/reference/combining)
and [additional-property semantics](https://json-schema.org/understanding-json-schema/reference/object):
exactly one branch must validate, and unnamed fields are not forbidden by default.
The generic search is an implementation inference from those semantics, not a standard algorithm.
