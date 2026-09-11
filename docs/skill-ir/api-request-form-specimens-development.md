# Form request specimens (development)

## Design and acceptance, 2026-09-11

The exposed Visier authentication document has two POST operations with a
schema-valid full string-object witness but unsupported form body assembly.
Implement a separate `api-request-form-specimens/v1` profile, sharing source
enumeration, dependency projection, witness construction and request assembly.
The old `api-request-specimens/v1` remains JSON-only; frozen v2 is untouched.
No source-specific branches, credentials, inferred required fields, response
status oracle or live API claims are allowed.

The additional media type is exactly `application/x-www-form-urlencoded`, with
no Encoding Object. Accept nonempty flat string objects only, at most 64 fields,
4096 UTF-8 bytes per key/value, and 262144 encoded body bytes. Reject lone Unicode
surrogates. Empty objects, scalar coercion, arrays, nested objects, custom encoding,
multipart and charset parameters remain unresolved. A required body whose minimal
witness is `{}` is not silently treated as absent.

The serializer uses URLSearchParams, sorted own entries and UTF-8. The independent
checker must not import it: parse pairs, strictly decode percent UTF-8, interpret `+`
as space, reject duplicate decoded names and compare exact own fields/string values.
Equivalent ordering, percent hex case and `%20` are allowed. Original schema and
full/minimal shape checking still apply. Existing source coverage, dependency,
security, advisory and residual-obligation checks are reused.

Basis: [WHATWG form encoding](https://url.spec.whatwg.org/#application/x-www-form-urlencoded)
and [OpenAPI 3.0.3 request bodies](https://spec.openapis.org/oas/v3.0.3#considerations-for-url-encoded-request-bodies).
This is a deliberately narrower executable contract, not the whole standards surface.

## Ordered implementation and verification

1. TDD codec and independent inverse check: Unicode/structural characters,
   equivalent representations, duplicates, malformed percent/UTF-8, wrong values,
   unsupported types and budgets. Keep RED evidence.
2. TDD new builder/checker wrappers and version binding; old profile stays unchanged.
   Test unresolved minimal bodies, source dependencies, media and corruption.
3. Integrate explicit profile into existing bound batch and skill mapping; run only
   the same exposed panel and original source-duty mappings. Preserve all rows.
4. Archive changed artifacts, old-profile comparison, focused tests and typecheck;
   update state and commit/push. These are not new independent samples.

Project runtime model/remote/paid calls: zero for this work; developer-agent usage is
separate and unmeasured. Latest clean evidence remains bound to be89a50, not this change.
