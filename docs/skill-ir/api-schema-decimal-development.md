# Decimal multipleOf correctness investigation (development)

The native header encoder already rejects non-ASCII/control characters explicitly;
no speculative transport change is needed. The next concrete independent check targets
numeric multipleOf: current checker delegates to binary floating-point Ajv division.
The existing finite numeric tests cover dyadic intervals, not decimal divisibility.

Before changing behavior, compare supported finite two-decimal numeric instances with
an independent integer-cents oracle (exact modulo), retaining disagreements. Include
positive/negative/zero and schema invalidity; do not use constructor values as truth.
If there is a defect, fix only this new development checker, preserve keyword/source
error identities needed by negative checks, and retain all prior evidence. No tolerance
may admit nonmultiples. Record the JS parsed-number representation boundary explicitly.
Run focused schema/witness/negative/cache regressions and check whether the12already
exposed documents contain affected multipleOf constraints before deciding panel work.

Reference: [Draft4 numeric validation](https://json-schema.org/draft-04/json-schema-validation)
defines multipleOf through an integer quotient with a strictly positive divisor.
This investigation does not add keywords, OAS3.1, real sources or API calls.

Observed505comparisons/22false rejections; full before.json retains each result. A complete
recursive scan of the12digest-checked exposed documents found zero multipleOf keys, so
this correction does not call for regenerating that panel. Replace only Ajv's multipleOf
predicate using its documented removeKeyword/addKeyword API and an exact BigInt decimal
coefficient/exponent divisibility check. Inputs are finite JS numbers interpreted by
their shortest decimal String representation; this does NOT recover precision already
lost while parsing JSON numeric lexemes. No epsilon or rounding is introduced. All other
Ajv predicates, composition, source paths, shape obligations and cache behavior remain.
Retain the multipleOf keyword and nested schema/instance paths for negative attribution.

Implementation uses a local Ajv predicate override; its compiler parses the divisor once
and evaluates value/divisor with exact BigInt decimal coefficient/exponent arithmetic.
Largest finite-double exponent difference is bounded (less than650decimal places), no
arbitrary source string is converted to an unbounded integer. Nonpositive/nonfinite or
nonnumeric schema divisors remain invalid. Nonfinite instance values fail. Ajv retains
`multipleOf` keyword and source/instance paths; its custom-keyword default error message
and params differ from the old built-in message. Negative attribution depends on exact
keyword/path (and missingProperty for required), not this prose message.

31focused tests/3774assertions pass, including exact decimal cents, adjacent nonmultiples,
subnormal/large exponents, nested escaped property paths, invalid divisors, existing
case attribution, cache behavior and3016Boolean composition oracle comparisons. No source
panel regeneration is needed after the complete zero-occurrence scan. Existing real
results remain evidence at their original commits; new checker correctness does not
retroactively turn old clean reports into proof of this revision.

API mechanism: [Ajv keyword extension](https://ajv.js.org/keywords.html) and
[remove/add keyword methods](https://ajv.js.org/api.html).

An integration test then confirmed positive0.3 constructs but negative-0.3 singleton
remains unresolved: binary Math.ceil(-0.3/0.1) selects-2 instead of-3. Preserve this RED.
Add only an inclusive endpoint hint when the old multipleOf grid candidate exceeds its
upper bound. Final independent exact checker still decides all divisibility/type/bound
constraints; no minimum is assumed a multiple and no search budget changes. Existing
valid candidates retain priority. This is a bounded witness repair, not a complete solver.
