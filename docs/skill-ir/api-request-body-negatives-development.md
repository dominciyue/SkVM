# Source-bound JSON body negative request specimens

## Design and scope

The reviewed LambdaTest, Jeremy and Pactflow duties require invalid/boundary request
cases, not only separately checked field values. Existing request-cases/v2 constructs
negative schema values; specimens/v1 constructs coherent positive requests. Join those
capabilities for JSON body mutations, without implementing live response expectations.
This is a new development artifact, not a change to frozen v2 or earlier specimen reports.

Input is original OAS3.0 source bytes/format. Build existing field and specimen reports,
retain them as independently verifiable evidence. For every operation and every body
schema negative obligation, record exactly one assembled row. Use its media type's full
positive specimen as baseline; replace only body value/text. The corresponding negative
field case must be covered and the JSON wire must be encodable. Missing baseline, unsupported
body media, unsupported schema or failed obligation witness stays unresolved with reasons.
Other body members may violate additional constraints; only the specifically source-bound
target violation is claimed, not single-fault isolation. All non-body request fields stay
byte/value identical to the independently checked full baseline.

Independent checker imports neither builder nor its row planner. It validates embedded
field reports against original source, and positive specimens using their independent
checker, then derives the required body-negative IDs from the validated source-bound
field obligations. This reuse is intentional: the field checker independently enumerates
source obligations, so an erased embedded list cannot establish its own completeness.
Check exact operation/row multiplicity, selected baseline and target obligation binding,
request layout preservation, JSON syntax/unique names/value binding and null HTTP status.
Unresolved rows require reasons and no request. They do not prove nonconstructibility.

Bound construction to512 negative rows per operation and262144 body bytes; all rows remain
listed when the construction budget is exceeded. Underlying source/schema bounds remain.
Parameter-schema negatives, native formats, HTTP status/business behavior, auth and runtime
server selection remain residual. Whole skill stays false. Do not count required-body
absence here (already implemented by specimens); missing properties inside body is in scope.

## Plan and acceptance

1. TDD synthetic required JSON object with enum, minimum and required-property targets;
   source operation without a body has an empty negative row list. Verify each target.
2. Independent mutation tests: erased/duplicated obligation or operation, swapped input,
   valid body substituted for invalid, changed non-body request, invented status, duplicate
   JSON names and erased residual duties. Failure must arise at the expected checking layer.
3. Implement two small modules composing existing capabilities, no source-name branches.
4. Use existing12 input panel, retain failures and per-operation/obligation counts; compare
   original two/three source duties without treating repeated inputs as new samples.
5. Relevant regression/typecheck, component/status/handoff update and stage commit.

Run `bun test ./src/skill-ir/api-request-body-negatives.test.ts` and main typecheck.
No network/model runtime calls; development-agent costs separately unmeasured.

## Development batch entry

Reuse the existing digest-bound input runner with an explicit profile; its default remains
the original specimen profile. It retains every acquired/failed/drifted input independently.
Per input report embeds the source-checked field and baseline evidence and each negative
request. Aggregate planned/constructed/unresolved counts refer only to body schema negatives;
incomplete body schema inventories and operation-level field issues are separate columns.

```powershell
bun scripts/skill-ir/api-request-specimens-development.ts --profile=body-negatives --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/skill-family-body-negatives-development-20260911/first-run
```

Always choose a new output directory. This exposed input panel is not prospective.

## Actual first result and member integration

At a7cf0ce the12 exposed inputs have303 operations,1414 enumerated body-negative
obligations,951 constructed and463 unresolved.128 operations have body-negative cases;
94 have at least one constructed case. Two body schema inventories remain incomplete.
All12 integrity checks pass, not all obligations. Full-source/HTTP validity is unproven.

Add api-request-body-negatives/v1 to the existing source-bound mapping. Preserve the
full selected source responsibility, unrelated residual duties and native-format failure.
Use original LambdaTest/Jeremy/Pactflow members on Brex budgets and Adatree consent: these
already exposed development examples exercise nested constraints and composition, not a
new selection or independent effect estimate. Six mapping executions suffice for this
integration; do not repeat the entire12-input panel for each member. First-run source
reports above remain the full denominator for the new capability.

## Representation metamorphisms

Before running: use one explicitly synthetic OAS3.0 parent with inherited query parameter,
local acyclic body schema reference, object/enum/integer/array constraints and a no-body
operation. Derive six inputs: reverse object keys (not arrays), JSON whitespace/CRLF,
JSON-to-YAML with unchanged data model, unrelated description text, inline the exact local
body schema, and append an unrelated required text/plain operation. The last operation's
body-negative rows must remain recorded/unresolved; existing operations remain unchanged.

Compare operation keys and multisets of negative targets (field, kind, instance path,
adapted validation path and operand), statuses, null HTTP expectations and normalized
requests. JSON body text is compared by its unique-key decoded value; source fingerprint,
source locator $ref hops and environment fields are not expected equal. Every derived
artifact independently passes source/field/baseline/negative checks. For inline reference
equivalence, only this exact acyclic reference without siblings is applicable; no general
reference equivalence claim. Keep parent/derived bytes, hashes and transform parameters.
