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
