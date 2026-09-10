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
