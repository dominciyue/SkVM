# Response header observations (development design and execution plan)

## Evidence and choice

LambdaTest's archived source line119 requests header assertions; Jeremy lines49–53
requires response schema and header checks. The exposed panel contains four declarations
across two1Password documents: Content-Range, Content-Disposition, Content-Length and
location, all string schemas with examples. Source-inventory.json retains the scan and
all zero-header documents. Examples are not live observations.

Choose a separate source-bound header observation checker. Extending the old body-only
checker would silently change existing reports; using raw string equality alone would
not validate schema constraints. Reuse original source enumeration and response-direction
schema checking, but independently select the operation/status and resolve header schema
dependencies. No changes to frozen v2 or the existing body observation result shape.

## Contract

Input: source text/format plus explicit operationKey, statusCode and raw header name/value
pairs. Names are case-insensitive valid ASCII tokens; at most64observed fields, each value
at most4096UTF-8bytes with no control characters. Repeated observed names are ambiguous
and invalid, never silently merged. Duplicate case-normalized source names are unresolved.
Select exact status before range before default; resolve only local acyclic references,
reject validation-bearing ref siblings and malformed pointers. Do not infer status triggers.

Enumerate every declared header of the selected response. Content-Type declarations are
ignored per OAS and explicitly reported, not treated as validated. Schema-backed string,
boolean and finite safe numeric scalar/simple primitive array headers can be decoded and
checked; complex/content-based/unknown semantics remain unresolved. Presence is enforced
only if required:true; absent optional headers are reported as absent, not value-checked.
No implicit coercion beyond the explicit header wire decoder. Array comma splitting does
not guess quoted list or repeated-line semantics. Unknown received fields are listed as
unclaimed; response-header declarations are not a closed-world field list.

Whole response, content framing, Content-Length/body consistency, Content-Range meaning,
redirect behavior, authentication and live provenance remain outside this field contract.
Checked declaration constraints do not prove these protocol/business properties.

## Ordered implementation and acceptance

1. TDD synthetic source/status/local-ref/presence/schema/array/duplicate cases. Preserve
   all source declaration rows, failures and unresolved diagnoses, not first error only.
2. Implement only the separate module and tests. Verify old body observation tests still
   pass and no historical report is modified. Test corrupt values and unknown fields.
3. Run four declared source examples as explicitly labeled source-example observations;
   retain no-example/not-applicable cases and no real HTTP success metric.
4. Use two source duties for the same core where applicable; do not count shared input
   reuse as independent examples. Archive first failures, reports, main/affected typecheck,
   update current plan/state and commit/push. Native runtime integration is a separate
   decision, not silently promised by this offline checker.

Reference: [OAS3.0.3 Header Object and response headers](https://spec.openapis.org/oas/v3.0.3#header-object).
This is bounded additional development within the shared response assertion duty, with
no new skill/API acquisition, network experiment or paid request.

## Current core result

Separate `checkApiResponseHeaders` implemented. TDD caught source-name collision inventory
loss: both colliding declarations now remain unresolved rows instead of disappearing.
10response-layer tests/65assertions pass; a strict nullability issue in two test lookups
was corrected and the main typecheck passes. Old body observation module is untouched.

Four source string examples produce3grouped observations/4checked header values across
the2documents; the other10documents remain explicitly no-declared-response-headers.
These are offline source-example checks only, not live observations or4API successes.
Artifacts and exact command entrypoints are under
`results/skill-ir/skill-family-response-headers-development-20260911/`.
Shared-duty mapping integration is now implemented separately below; the core evidence
above remains the original run.

## Shared mapping interface and result

Use a distinct `api-response-header-observations/v1` profile in the existing mapping
schema/runner. Each task must bind a separate observation JSON file by path and SHA,
alongside its existing source binding. Other profiles reject these new fields rather
than ignoring them. The runner performs strict UTF-8 decoding, independently checks
each supplied observation against the original source, and retains every failed/unresolved
observation. It does not generate expected responses. Old report shapes remain unchanged.
Test digest replacement and missing observation binding first. Demonstrate Lambda
emit-test-code and Jeremy response-validation on both exposed1Password inputs using
the already archived source-example observations, clearly labeled non-live. Preserve
all selected and residual source obligations. Do not add this profile to the generic
input-only baseline generator until an observation-binding input contract is provided.

Implemented task fields: `observationPath` and `observationSha256`, both required only
for this profile. The JSON envelope has exactly `schemaVersion` (this profile ID),
`provenance` (`source-example`, `synthetic`, or `externally-supplied-unverified`) and
`observations` (1–1000 raw observation values). Every value gets a checker result,
including invalid ones. File/encoding/envelope failure is a task error; a checked
constraint mismatch or unresolved observation is retained in `responseHeaderObservations.checks`,
not converted to an infrastructure error or dropped. Provenance is a supplied label;
`liveProvenanceVerified` is always false. Source and observation byte digests are separate.
Old profiles do not receive the new optional report column.

`mappings-first/` archives two member mappings, four observation bindings, both complete
reports and comparison.json: four runs on two unique documents exactly reproduce the
original core checks. Selected obligations and residual duties remain unfulfilled;
native output format is not implemented by this checking profile. 28 tests/154 assertions,
main typecheck and explicit script typecheck passed. mapping-validation.json preserves
the first two failing binding tests and final regression output.

Offline reproduction from repository root, with Bun1.3.14 and Node23.8.0 plus fixed
dependencies described in [current clean reproduction](skill-family-current-clean-reproduction.md):

```powershell
bun results/skill-ir/skill-family-response-headers-development-20260911/run-mappings.ts --out=results/skill-ir/header-mapping-reproduction '--node=C:/Program Files/nodejs/node.exe'
```

Use a new output directory. The script reads only archived exposed source material and
source examples; it does not acquire data or make HTTP/model calls. Existing clean
archives bind older commits and do not automatically attest this integration.
