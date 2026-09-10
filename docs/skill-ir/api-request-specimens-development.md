# Offline assembled request specimens

## Purpose and decision

D1 and D7 sources require runnable requests, parameter presence and coherent payloads;
current api-request-cases/v2 only checks each field value/wire fragment separately.
This increment assembles a relative request target, headers and JSON body and independently
checks their source binding. It does not implement live authentication, responses or native
pytest/RestAssured output. New api-request-specimens/v1 leaves earlier reports/contracts intact.

Alternatives considered: emit native scripts immediately (would hide missing request-level
semantics behind wrappers); implement live auth/status first (requires contextual credentials
and response-trigger evidence). Choose request assembly and presence tests first because
multiple independently sourced duties need it and it has deterministic public oracles.

## Contract

- Input: original OpenAPI3.0 JSON/YAML bytes. Reuse source enumeration/projection and schema
  witnesses/parameter encoding. No repository names or known input identities in core code.
- Every source operation has an output row, including unresolved operations. Independent
  checker builds its own source operation inventory and effective inherited parameters.
- Cases: minimal required-only and full all-parameter specimens; for a required body each
  declared media type gets minimal/full cases, optional body minimal omits it and full covers
  each declared media type. No body produces one minimal and one full case.
- Presence negatives: remove each required query/header parameter from its corresponding
  minimal baseline; remove a required body. Missing path parameters are not represented as
  a routable request and remain an explicit unimplemented obligation. Existing schema-negative
  cases remain in v2; they are not silently claimed to be assembled here.
- Methods and relative path templates come from source; all placeholders bind path parameters.
  Required path parameters must actually be declared required. No unresolved braces, query or
  fragment delimiter in the source path. Replace values using existing simple encoding and
  combine query fragments with &, retaining parameter boundaries. Headers case-insensitive
  collision check; body sets Content-Type only when present. JSON/+json media only.
- Cookie assembly, special/hop-by-hop headers, content-encoded parameters, mixed object wire
  values and ambiguous paths remain unresolved. Existing fragment support is not falsely
  promoted into full HTTP serialization. Ignore OpenAPI's Accept/Content-Type/Authorization
  Parameter Objects as specified, but record that source note; security/media semantics remain.
- All inherited security alternatives and source server declarations are copied as unresolved
  runtime requirements. A constructed specimen is not ready-to-send: no origin, credentials,
  status expectations or successful API behavior is invented. expectedHttpStatus is null.
- Limits: at most128 parameter declarations,32 media types,512 cases per operation,8192
  target characters,262144 UTF-8 body bytes. Budget failures remain visible for planned cases.
  Dot-segment paths, unsafe names/values and unsupported media are not normalized away.
- Correction after first run: a declared requestBody on methods outside POST/PUT/PATCH
  leaves all of that operation's planned specimens unresolved, including body-absence
  negatives. OAS3.0.3 does not provide the necessary method/body semantics. Preserve the
  declaration and missing obligations rather than silently dropping it. This restriction
  concerns assembled specimens, not the recoverable historical schema-only field reports.

## Independent checks and acceptance

Checker must not import the assembler or its case-plan/parameter-selection helpers. It
independently enumerates operations, resolves source parameter/request references, calculates
expected presence/media cases, checks required/full/minimal presence, validates values using
the existing independent schema/shape oracle, and verifies each wire fragment via the inverse
checker. It then consumes the emitted target/header/body layout; no report-provided inventory
can establish completeness. Dependency/source-validity advisories retain their existing roles.

TDD must detect operation/case deletion and duplication, lost inherited required parameter,
unexplained optional omission in full mode, changed path/query/header/body, security/server
loss, wrong media, invented status and malformed report. Explicit unresolved reasons do not
prove impossibility or full coverage. Report constructed/check-pass, unresolved, missing-presence
cases and runtime-unsatisfied duties separately. Known unsupported source features remain.

Run the same12 already exposed documents once; compare the field-level prerequisite result,
record all assembly limitations and source advisories. No new external sample or prospective.
Only an offline synthetic local HTTP serialization check may be added, without contacting a
real API. Whole-skill/readiness/old0/6 unchanged.

Primary semantics: [OpenAPI3.0.3 parameter/request/security objects](https://spec.openapis.org/oas/v3.0.3),
[URI template expansion](https://www.rfc-editor.org/rfc/rfc6570),
[URI path/query/fragment boundaries](https://www.rfc-editor.org/rfc/rfc3986).

## Files and execution plan

1. Add api-request-specimens.test.ts with a synthetic POST containing inherited required path,
   required query, optional header and required JSON body. Assert minimal/full target, presence
   negatives, and retained security/server requirements. Run RED missing-module test.
2. Add api-request-specimens.ts types and builder, using existing source/projection/schema
   routines. Add api-request-specimens-checker.ts independent source/layout validation.
3. Add negative envelope/source/mutation tests before each corresponding validation; run
   `bun test ./src/skill-ir/api-request-specimens.test.ts` through GREEN. No shared case planner.
4. Add scripts/skill-ir/api-request-specimens-development.ts to read digest-bound input index,
   preserve each failure, write new reports and summary. Fixed runtime/dependency metadata.
5. Run fixed12 input development, relevant source/wire/schema regressions and typecheck. Record
   actual limits/results in this component and unique state, commit and push current branch.

User has authorized inline autonomous decisions. No subagent, approval pause or new UI is needed.

## Actual evidence

Initial implementation88b5c79 deliberately archives the pre-method-correction results.
New method guards leave unsupported-method body operations unresolved in both constructor
and independent checker.18 focused tests/286 assertions and main typecheck pass; explicit
development script typecheck also passed. Current fixed12-input totals:303 operations,
628 planned specimens,576 constructed,52 unresolved,24 constructed presence negatives,
2 incomplete inventories due reference siblings.268 operations have all planned cases
constructed; this is neither the prior per-schema metric nor whole skill/HTTP readiness.
See results/skill-ir/skill-family-request-specimens-development-20260911/README.md for
the first report, revision branch, fresh recheck and offline command.
