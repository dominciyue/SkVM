# Semantic Artifact V2 Design

**Status:** Approved implementation authority

**Date:** 2026-07-16

**Scope:** `env-manager` development-only semantic validation vertical

## 1. Goal

`executable-artifact/v1` proved that package integrity, preflight, templates,
standalone validation, protected-workdir checks, and bounded repair orchestration
can run end to end. Its frozen development gate failed because structural
validation accepted outputs whose classification and schema semantics remained
wrong. The one-repair transition was not exercised in the paid sample.

This stage introduces one new catalog:

```text
executable-semantic-artifact/v2
```

The catalog adds deterministic, provenance-bound semantic evidence derived
from files and source code visible to the agent. Its first experiment enables
only low-dispute A-layer checks. The higher-dispute B-layer classification
model exists as types and isolation tests only. B does not execute and cannot
affect generation, validation, repair, scoring, or the development gate.

The goal is to make a known class of v1 false passes become explicit,
repair-eligible semantic failures without copying evaluator gold into runtime.
Offline deterministic scoring remains the only benchmark success authority.

## 2. Catalog Identity And V1 Immutability

V2 uses new manifest, provenance, validation-policy, semantic-contract, error
catalog, package, and development-lock identities. It does not mutate, reuse,
or reinterpret these frozen v1 assets:

```text
benchmarks/skill-ir/pilots/env-manager/packages/executable-artifact-v1/
benchmarks/skill-ir/pilots/env-manager/env-manager-executable-artifact-v1-lock.json
results/skill-ir/env-manager-executable-artifact-v1-*-2026-07-16/
```

Shared Runner machinery may support both catalogs through discriminated
schemas. A schema change must not broaden what an old v1 lock can emit or
accept. V1 continues to use `runtime-validation-report/v1` and its original
closed code enum. V2 uses a separate report identity and code catalog:

```text
runtime-validation-report/v2
semantic-error-codes/v1
```

The report may carry `codeCatalog: "semantic-error-codes/v1"` as schema
metadata. The repair-facing projection remains exactly:

```text
code | relativePath | jsonPointer | missingField | expectedType
```

`codeCatalog` is not copied into each repair error and does not authorize free
text or expected values.

## 3. Selected Architecture

The package is reusable across tasks, so it cannot contain task-specific
variable inventories compiled from evaluator fixtures. Instead, it contains a
digest-bound evidence derivation program and a semantic checker:

```text
licensed skill + public task contract
  -> compile executable-semantic-artifact/v2

task fixture materialization
  -> package/lock preflight
  -> execute trusted A-layer evidence derivation over the workdir
  -> materialize protected runtime semantic contract
  -> materialize output templates
  -> model generation
  -> structural + A-layer semantic validation
  -> zero or one sanitized repair
  -> revalidation
  -> frozen offline scorer
```

The runtime semantic contract is derived before model generation and is added
to the protected-workdir snapshot. It is readable by the agent because every
fact in it comes from agent-visible inputs, but the agent cannot alter it. It
contains names, relative paths, symbols, evidence kinds, and deterministic
constraints only. It never contains environment values, source snippets,
secret values, evaluator payloads, held-out data, or B-layer dispositions.
The generated `skill.md` names the fixed runtime-contract path and instructs
the agent to use it when producing or repairing outputs. This is static package
guidance, not a dynamic answer-bearing repair message.

The package does not emit an `audit/` directory in v2. B-layer types remain in
source and unit-test fixtures only.

## 4. Package Layout

The proposed package layout is:

```text
packages/executable-semantic-artifact-v2/
  package-manifest.json
  package-provenance.json
  skill-ir.json
  skill.md
  validation-policy.json
  artifacts/
    contracts/
      env-manager-output-contract.json
      semantic-contract-schema.json
    scripts/
      derive-semantic-contract.ts
    checks/
      validate-semantic-output.ts
    templates/
      env-report.template.json
      env-schema.template.json
```

At runtime, the derivation script writes one protected file under the workdir:

```text
.skvm-artifact/semantic-contract.json
```

The path is package-declared, workdir-relative, and unavailable as a generated
output target. Preflight rejects a pre-existing symlink, directory escape, or
undeclared file at that path. The file is included in protected-file mutation
checks and remains local with raw workdir evidence; it is not copied into raw
or scored JSONL rows.

## 5. Legal Evidence Sources

The A-layer derivation program may read only:

1. Public skill semantics recorded in the digest-bound base IR or generated
   skill view.
2. User-visible task contract fields: output names, report fields, schema root,
   allowed rule fields, and stated safety requirements.
3. Workdir files available to the agent, limited by a package-declared scan
   policy.
4. Relative paths, filenames, syntax nodes, and environment-variable names
   derived from those workdir files.

For the first vertical, source scanning is limited to `.js`, `.jsx`, `.ts`,
`.tsx`, `.mjs`, and `.cjs`. JavaScript and TypeScript evidence is derived with
the TypeScript parser/AST rather than substring matching. Dotenv files are
parsed as name/value records, but only names and empty/non-empty state may
leave the parser. Values may be inspected transiently only for secret-safety
classification; they are never serialized, hashed into error identity, logged,
or included in a report.

Directory exclusions, maximum file count, maximum bytes, supported encodings,
and symlink behavior are closed in validation policy. Unsupported files produce
an evidence limitation, not a guessed constraint.

Illegal sources include evaluator `payload`, evaluator `expected`, criterion
ids, hard-gate ids, pass thresholds, scored rows, held-out prompts or fixtures,
secret values, and previous scorer failures as concrete answer sets.

## 6. A-Layer Semantic Contract

The runtime contract contains only confirmed A-layer observations:

```text
observedVariables[]
  name
  evidenceKinds[]
  sourceRefs[]
  inferredType?            # only with deterministic syntax evidence
  constraints[]            # only with deterministic public evidence
  sensitiveMarkerRequired? # name/skill rule, never value-derived output

sourceQualifiedFindings[]
  relativePath
  symbol
  findingKind
  evidenceRefs[]

limitations[]
  code
  relativePath?
```

`sourceRefs` and `evidenceRefs` contain relative path, symbol, and evidence-kind
identifiers. They contain no source text, line contents, values, or free-form
messages. Limitations are for local checker behavior and audit; they are not B
classifications and are not serialized into model-facing repair reports.

### 6.1 Checks, Sources, And Downgrades

| A check | Permitted evidence | Enforced rule | Downgrade when evidence is absent | Error code |
|---|---|---|---|---|
| Public output shape | User-visible prompt contract | Required files, five arrays, schema root, and allowed fields exist with declared types | Contract compilation fails if prompts disagree | Existing v2 structural codes |
| Observable variable inventory | Dotenv names plus AST environment references | `.env.schema.json.variables` covers every observable variable name | Omit names from unsupported/unreadable sources; record a local limitation | `MISSING_OBSERVED_VARIABLE` |
| Deterministic rule type | Explicit AST conversion or public skill rule bound to an observed symbol | Rule `type` matches confirmed evidence, such as `Number(process.env.X)` -> `integer` | No inferred type, therefore no type assertion | `INVALID_RULE_TYPE` |
| Deterministic constraint | Confirmed type/use plus an applicable public skill rule, such as port range | Required public constraint field is present with the declared primitive shape | No applicable rule or ambiguous binding means no constraint | `MISSING_RULE_CONSTRAINT` |
| Sensitive marker shape | Sensitive name pattern defined by public skill semantics | Schema rule contains `sensitive: true` | Neutral or ambiguous names receive no marker requirement | `MISSING_SENSITIVE_MARKER` |
| Rule vocabulary | User-visible prompt contract | No field outside the allowed rule vocabulary | Prompt disagreement blocks compilation | `UNSUPPORTED_RULE_FIELD` |
| Finding reference validity | AST symbol table and relative source paths | Every emitted `path:symbol` resolves to a real supported source symbol | Unsupported source kind is not judged | `INVALID_SOURCE_QUALIFIED_FINDING` |
| Confirmed hardcoded finding presence | Explicit sensitive literal assignment to a named source symbol | A confirmed finding appears in `hardcodedSecrets` as `path:symbol` | Dynamic/computed/ambiguous expressions are not required | `MISSING_SOURCE_QUALIFIED_FINDING` |

Variable inventory is not a classification answer set. It says which names
must receive schema entries; it does not say which of the five report arrays
must contain each name. A may verify that an emitted finding resolves and that
an unambiguous hardcoded sensitive assignment is represented. It does not
derive the complete report classification.

### 6.2 Conservative Inference Rules

- `Number(process.env.PORT)` or an equivalent explicit numeric parse supports
  `integer`; a numeric-looking dotenv value alone does not.
- A URL-looking value does not support `format: uri`. A public skill rule plus
  a source use that validates/parses a URL may support it.
- A `_PORT` suffix alone does not establish a range. It requires explicit
  integer use and the applicable public skill port rule.
- `KEY`, `TOKEN`, `PASSWORD`, or `SECRET` name patterns may require
  `sensitive: true` because that policy is public and value-independent.
- Computed property access, dynamic environment-name construction, unsupported
  syntax, or conflicting evidence produces no strong constraint.
- Missing evidence always removes or weakens a contract entry. It never causes
  the compiler to substitute scorer expectations.

## 7. Closed Semantic Error Catalog

`semantic-error-codes/v1` is frozen before the v2 lock. It contains the v1
structural/safety codes required by the new report schema plus exactly these A
codes:

```text
MISSING_OBSERVED_VARIABLE
INVALID_RULE_TYPE
MISSING_RULE_CONSTRAINT
MISSING_SENSITIVE_MARKER
UNSUPPORTED_RULE_FIELD
INVALID_SOURCE_QUALIFIED_FINDING
MISSING_SOURCE_QUALIFIED_FINDING
```

Each code has a fixed repair-eligibility policy and allowed field combination.
For example, `MISSING_OBSERVED_VARIABLE` requires `.env.schema.json` plus a
JSON Pointer to the missing variable; `INVALID_RULE_TYPE` requires a JSON
Pointer and closed `expectedType`; finding errors require `env-report.json` and
a JSON Pointer. Reports with a code/field combination not declared in the
catalog fail as validator infrastructure errors.

Changing the enum, field rules, or inference meaning requires a new semantic
error catalog version and a new package/lock. Old locks do not silently accept
new errors.

## 8. B-Layer Dormant Interface

B defines interfaces only:

```text
ObservedDefinition
ObservedReference
ObservedHardcodedSecret
ClassificationCandidate
  value
  evidenceRefs[]
  confidence
  disposition = confirmed | unconfirmed | conflicting
```

Here `value` is the candidate's variable/finding identifier, never a dotenv,
source-literal, or secret value.

No production v2 function constructs `ClassificationCandidate`. No package
compiler option accepts it, no runtime module imports it, and no serializer is
provided. Test fixtures may instantiate it to prove sink isolation.

Even if a future implementation computes a disposition, v2 forbids it from:

- committed package files or package digests;
- `.skvm-artifact/semantic-contract.json`;
- `RuntimeValidationReport`;
- sanitized repair tasks or prompts;
- raw or scored experiment rows;
- development lock or gate inputs;
- committed `audit/` output.

The intended future rules remain conservative: a definition plus confirmed
static reference may support `definedAndUsed`; a definition with no confirmed
reference remains `unconfirmed`; a confirmed reference with no visible
definition may support `usedUndefined`; conflicting evidence is never resolved
automatically. These rules are documentation and type-level preparation only
for v2.

## 9. Runtime Validation And Repair

V2 preserves the Runner state machine:

```text
preflight -> derive A evidence -> templates -> generation -> validate
          -> at most one sanitized repair -> revalidate -> stop
          -> frozen offline scorer
```

The validator first performs v1 structural/safety checks, then A checks against
the protected runtime semantic contract. A failure is repair-eligible only when
the error code catalog declares it so and protected files remain unchanged.

The repair prompt contains only a static instruction and the five-field error
projection. It may identify a variable through a JSON Pointer and a source
finding through a relative path/pointer because those names are visible in the
workdir. It never contains expected arrays, file contents, source snippets,
actual values, secret values, B dispositions, or absolute paths.
The static instruction may direct the model to inspect the protected
`.skvm-artifact/semantic-contract.json`; it does not inline that file. This is
how `MISSING_RULE_CONSTRAINT` remains actionable without adding expected
constraint values to `ValidationReport`.

The same package supports `check-only` and `one-repair`. A passing first
validation still skips repair. A failing eligible first validation triggers
exactly one call in one-repair mode and zero calls in check-only mode. The
second validation always stops the state machine.

## 10. Leak And Reverse-Evidence Test Matrix

### 10.1 Forbidden-Source Canaries

Tests inject unique canaries into every forbidden source and recursively scan
the package, runtime semantic contract, validation report, repair task, and
raw/scored row fixtures.

| Canary source | Required result |
|---|---|
| Evaluator `expected` payload | Absent from every sink |
| Criterion and hard-gate ids | Absent from every sink |
| Pass threshold | Absent from every sink |
| Held-out prompt and fixture | Absent from every sink |
| Secret values and source snippets | Absent from every sink |
| B `value`, `confidence`, and `disposition` | Absent from every sink |

Strict schemas must also reject attempts to add `disposition`, evidence text,
actual values, or free-form messages to a validation report.

### 10.2 Reverse-Evidence Tests

Each positive constraint has a paired evidence-removal test:

| Positive evidence | Mutation | Required downgrade |
|---|---|---|
| Explicit `Number(process.env.X)` | Remove numeric conversion | `inferredType` disappears |
| Public port rule plus confirmed integer port use | Remove either side | Range constraint disappears |
| Sensitive variable name | Rename to neutral name | Sensitive requirement disappears |
| Dotenv definition or AST reference | Remove both observable sources | Inventory entry disappears |
| Real source symbol | Remove/rename symbol | Finding no longer validates; no substitute symbol is guessed |
| Explicit hardcoded sensitive assignment | Make expression dynamic/ambiguous | Required finding disappears |

The negative test must fail if a constraint remains after its legal evidence is
removed. This is the primary guard against accidental gold memorization.

### 10.3 Known-Failure Activation Fixture

Before any API call, a local deterministic fixture must demonstrate:

```text
the same generated output passes the frozen v1 validator
the v2 A-layer validator rejects it with a closed semantic code
check-only stops after that failure
one-repair enters exactly one repair transition
a repair test double can produce a v2 validation pass
a failed repair still stops after the second validation
```

This proves the repair state machine is observable under the new semantic
validator without adding paid repetitions or changing experiment thresholds.
It does not prove that a real model repair improves offline score.

## 11. Failure Handling

| Event | Classification | Repair |
|---|---|---:|
| Package/provenance/lock/digest mismatch | Infrastructure/package | No |
| Evidence script crash, timeout, invalid output, or forbidden sink | Infrastructure/evidence | No |
| Unsupported syntax or ambiguous evidence | Recorded limitation | No strong assertion |
| Protected runtime contract mutation | Semantic hard stop | No |
| Structural or A-layer closed semantic error | Semantic validation | At most once |
| Report with unknown code or illegal field combination | Infrastructure/validator | No |
| Revalidation failure | Final semantic failure | Stop |

An evidence limitation cannot be converted into a repair instruction. The
system fails closed on corrupt evidence and degrades conservatively on absent
evidence.

## 12. Experiment Lock And Gate Sequence

V2 remains an explicit `ir-artifact-dev` development experiment:

```text
check-only | one-repair
development tasks only
one preregistered model and adapter
Windows host and clean context
same package, task set, scorer, and repetitions in both arms
```

The implementation does not inherit v1 gate numbers automatically. The order
is fixed:

1. Complete all source-isolation, reverse-evidence, path, package, and state
   machine tests.
2. Run the known-failure activation fixture and record its deterministic
   validator/repair baseline.
3. Freeze package digests, `semantic-error-codes/v1`, model, adapter, tasks,
   repetitions, repair modes, and proposed numerical gate in a new lock.
4. Review and commit the lock before route probe or paid execution.
5. Run both dry-run arms and route probe.
6. Execute the frozen development experiment once.
7. Score with the unchanged offline scorer and apply the frozen gate.

The numerical gate is deliberately not specified before fixture calibration.
It must be justified from deterministic fixture capability, then frozen before
paid execution. It cannot be chosen from paid model outcomes. Paid execution
is not used merely to force a repair event; local activation already proves the
transition. If real outputs do not fail A validation, the paid run again has no
real-model repair attribution and must say so.

No held-out run is allowed unless the new one-repair development gate passes.
V1 failure evidence remains unchanged regardless of v2 outcome.

## 13. Proposed Component Boundaries

The implementation plan should keep these responsibilities separate:

| Component | Responsibility |
|---|---|
| `semantic-evidence.ts` | A evidence schemas and conservative AST/dotenv derivation. |
| `classification-evidence.ts` | B dormant types only; no producer or serializer. |
| `semantic-contract.ts` | Runtime contract schema, code catalog, and code/field rules. |
| `semantic-artifact-compiler.ts` | V2 package emission from legal static inputs. |
| `semantic-artifact-run.ts` | Compile/verify CLI for the new catalog. |
| `artifact-preflight.ts` extension | Execute derivation, materialize protected runtime contract, preserve v1 behavior. |
| Emitted semantic checker | Structural checks plus A checks against runtime contract. |
| `artifact-runtime.ts` extension | Catalog-discriminated report parsing with unchanged five-field repair projection. |
| Runner/lock extension | Explicit v2 catalog and new-lock enforcement; no default matrix entry. |

Exact filenames may be adjusted in the implementation plan if existing module
ownership makes a smaller change clearer. The catalog, evidence, sink, and
experiment boundaries are normative.

## 14. TDD Acceptance Surface

The future file-level plan must begin with failing tests for:

1. V1/v2 discriminated package, provenance, report, error-catalog, and lock
   schemas without widening v1.
2. Deterministic AST/dotenv A evidence and every conservative downgrade rule.
3. Source and path containment, symlink, size, encoding, timeout, and protected
   runtime-contract behavior.
4. Every A code and its allowed five-field combination.
5. Forbidden-source canaries across all sinks.
6. Every reverse-evidence mutation.
7. B type availability and absence from package/runtime/repair/result sinks.
8. V1-pass/v2-fail known-failure activation and exactly-once repair.
9. Evidence infrastructure failures never triggering semantic repair.
10. Unchanged offline scorer behavior and no held-out scheduling.
11. Deterministic package emission, digest validation, tamper detection, and
    new-lock enforcement.

Only after these tests and the focused/full verification suites pass may the
package and lock be emitted. API execution is a later, separately gated step.

## 15. Non-Goals

- No B-layer production classifier, warning, audit file, checker, repair, or
  gate input.
- No exact scorer classification set in A.
- No modification or replay tuning of v1 assets.
- No scorer, task, or held-out change based on development outputs.
- No pooled models, cross-agent, cross-OS, or L4 claim.
- No paid run before fixture activation, package verification, lock review,
  dry-run, and route probe.
- No claim that observing a repair transition proves semantic improvement.

## 16. Success Interpretation

The engineering stage succeeds when v2 can derive auditable A evidence,
convert a known v1 false pass into a closed repair-eligible failure, exercise
exactly one local repair transition, and preserve gold isolation. The later
development experiment succeeds only if its separately frozen scorer gate
passes. Until then, v2 is a candidate semantic artifact package, not an
optimized skill or held-out evidence.
