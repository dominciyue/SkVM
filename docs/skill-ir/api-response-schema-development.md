# Offline response schema checking — development

## Source need and first bounded increment

Reviewed source duties explicitly require response assertions: LambdaTest emit-test-code
(lines109–189), Jeremy response-validation(lines49–53), Pactflow emit-drift(lines80–92).
Their complete responsibility records remain unchanged. Current schema checker implements
a request-generation contract: readOnly fields are forbidden and their required entries
removed. Applying that checker to responses would reject valid server-only properties and
mis-handle writeOnly requirements. Do not reuse request semantics under a response label.

First implement a separate createResponseSchemaChecker(document,schema) API backed by the
same independent Ajv adapter, not a generator. Existing createSchemaChecker/checkSchemaValue
and all request witness/shape behavior stay unchanged. Response mode retains readOnly
properties and enforces their required entries; writeOnly properties are forbidden by this
bounded contract and their local required entries removed. Local acyclic property references
carry direction context. Direction flags must be Boolean and cannot both be true.
Root/items flags do not turn an entire response into a forbidden property.

For this increment, directional property annotations occurring under composition are
unsupported, because direction-aware required constraints can span distinct composition
branches. Do not independently delete branch requirements and call that equivalent.
Composition without directional properties continues through Ajv. All existing schema
format/keyword/reference/resource bounds apply; no new generator or network call.

[OAS3.0.3 Schema Object](https://spec.openapis.org/oas/v3.0.3#schema-object) says directional
properties should not appear on the opposite side and required applies only on their
appropriate side. Strictly forbidding opposite-side properties is the bounded profile's
policy, not a claim that the standard's SHOULD is a universal MUST.

## TDD / staged acceptance

1. Synthetic readOnly required ID + writeOnly required secret: response accepts only ID;
   request still accepts only secret. Missing response ID or leaked secret fails.
2. Local reference/nested array properties preserve directional behavior and constraints;
   simultaneous flags/malformed flags/annotated composition return unsupported.
3. Request regression and compiled-cache direction isolation: switching APIs must not reuse
   a validator with different normalized semantics. No coercion/default insertion.
4. After this basis passes, design operation/status/media selection and independently bind
   an explicit observed body to source. Observations are supplied data, not inferred real
   API traffic; source examples and synthetic observations are labeled separately.

No full response/HTTP/skill claim from schema mode alone. Response headers, status triggers,
business state, auth and live behavior remain unimplemented. Previous clean evidence remains
version-bound and does not cover this new API.

## Explicit JSON response observation contract

Next API accepts original source bytes/format plus an explicit operationKey, numeric
statusCode, mediaType and JSON bodyText. It does not perform a request or infer status.
Select response exact code before its uppercase range before default. Missing selection
is a bounded contract mismatch; unresolved local/external refs or malformed declarations
are unresolved, not a successful check. Resolve Response Object refs without validation
siblings; local schema refs use the response-direction checker above.

Require one unambiguous exact JSON/+json media declaration (case-normalized); media ranges
remain unsupported when no exact declaration matches. Parameters in the supplied media
identifier remain unsupported in this first contract; this is not raw Content-Type header
parsing. Header conformance, content encoding and bodyless responses stay residual.
JSON text must have unique decoded keys. Bound text to1MiB, depth64,10000value nodes,
and reject nonfinite/unsafe-integer parsed numbers rather than round them into a false match.
Ordinary finite decimals use the existing JavaScript/Ajv numeric model, not exact decimals.

Return source/observation hashes, selected response/media, checked valid/invalid versus
unresolved versus invalid observation, schema diagnostics and explicit residual duties.
A schema-valid body is not proof that the status was triggered correctly or that the
observation came from real traffic. TDD covers exact/range/default precedence, read/write
direction, missing status/media, lost reference, duplicate JSON and observation drift.

## Existing-source measurement

Enumerate every original operation/declared response/media on the12 exposed documents.
Keep malformed declarations, missing/external response references and non-JSON media as
explicit rows/issues. Report schema-compilation capability independently of example results.
Compilation with a null probe is not a constructed witness or a real response observation.

Only use whole-body examples explicitly declared by MediaType.example/examples or the
root resolved Schema.example. Do not assemble property examples into an invented response.
Local Example Object references may resolve; externalValue stays unexecuted. Preserve
simultaneous example/examples as source advisory rather than silently choosing one.
Exact-code examples exercise operation/status/media selection; default/range examples
only exercise response schema checking because no concrete observed status was supplied.
Label every case source-declared-example, never live traffic; preserve invalid/unresolved
examples and empty example lists. Response headers/links are recorded but not validated.

TDD a synthetic document with exact/range/default examples, a broken response reference,
an external example, a non-JSON medium and an operation without examples. Then execute
all12 sources once with a bound index and new output directory, followed by focused
regression/typecheck. No additional public samples, network calls or inferred statuses.

Before real execution, two additional RED tests exposed non-JSON examples omitted from
unexecuted counts and reference locators not pointing at definitions. Keep non-JSON examples
as unresolved and track resolved Response/Schema/Example Object locations separately from
the operation declaration locator. Seven focused tests/47assertions and strictscript
typecheck pass after repair. Prior failures remain in the development evidence directory.

```powershell
bun scripts/skill-ir/api-response-schema-development.ts --inputs=results/skill-ir/skill-family-deepening-20260911/api-inputs/inputs.json --out=results/skill-ir/skill-family-response-schema-development-20260911/first-run
```

Actual717f3a2 measurement:303 operations/567 response declarations/365 media/329 compiled
JSON schemas.142 source-example occurrences:130 valid/3invalid/9unresolved, zero live
responses.1Password Partnership's three null ends_at examples conflict with its non-nullable
string/date-time schema. Preserve the source mismatch; do not infer production API failure.
Example occurrence counts are not distinct examples or independent real responses.

## Shared source-duty connection

The pure analyzer now lives in src/skill-ir/api-response-catalog.ts; its body was moved
unchanged from the development script. CLI keeps the old exported function for compatibility
and calls the same core. Add explicit api-response-source-examples/v1 to the existing mapping.
An analyzed source with invalid examples is not an implementation exception: retain every
invalid example while all original source obligations remain not-fully-verified. Incomplete
operation enumeration does set a task error, with the partial catalog retained.

Integration members: Lambda emit-test-code, Jeremy response-validation, Pactflow emit-drift.
Use already exposed1Password Partnership (includes source inconsistencies) and Front core
(response examples and references); six tasks, not another12-input baseline per member.
Native pytest/Drift output, headers, business/state assertions and live execution remain
unimplemented. A profile is a bounded analysis slice, not completion of those source duties.
